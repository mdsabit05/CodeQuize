import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { createDb } from "./db";
import { quizJob, githubConnection } from "./schema";
import type { Env } from "./env";

type JobMessage = { jobId: string; userId: string; repoFullName: string };

export async function handleQueue(
  batch: MessageBatch<JobMessage>,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    const { jobId, userId, repoFullName } = message.body;
    const db = createDb(env);

    try {
      // Get GitHub token
      const [conn] = await db
        .select()
        .from(githubConnection)
        .where(eq(githubConnection.userId, userId))
        .limit(1);

      if (!conn) throw new Error("GitHub not connected");

      // Fetch recent commits (last 5)
      const [owner, repo] = repoFullName.split("/");
      const commitsRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?per_page=5`,
        {
          headers: {
            Authorization: `Bearer ${conn.accessToken}`,
            "User-Agent": "codequize-backend",
          },
        }
      );
      const commits = await commitsRes.json<{ sha: string; commit: { message: string } }[]>();

      // Fetch diffs for each commit (parallel)
      const diffs = await Promise.all(
        commits.slice(0, 5).map(async (commit) => {
          const res = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`,
            {
              headers: {
                Authorization: `Bearer ${conn.accessToken}`,
                Accept: "application/vnd.github.diff",
                "User-Agent": "codequize-backend",
              },
            }
          );
          const diff = await res.text();
          return `## ${commit.commit.message}\n\n${diff.slice(0, 3000)}`; // cap per commit
        })
      );

      const diffText = diffs.join("\n\n---\n\n").slice(0, 12000); // total cap

      // Call Claude with tool_use for fixed-shape output
      const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        tools: [
          {
            name: "extract_concepts",
            description: "Extract key programming concepts from recent code changes",
            input_schema: {
              type: "object" as const,
              properties: {
                concepts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Short concept name (5-8 words max)" },
                      description: { type: "string", description: "One sentence explaining what this concept is and why it matters" },
                    },
                    required: ["title", "description"],
                  },
                  minItems: 3,
                  maxItems: 5,
                },
              },
              required: ["concepts"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "extract_concepts" },
        messages: [
          {
            role: "user",
            content: `Here are recent code changes from the GitHub repo "${repoFullName}":\n\n${diffText}\n\nExtract 3 to 5 key programming concepts that a developer would learn from studying these changes. Skip trivial changes like renamed files or version bumps. Focus on real ideas.`,
          },
        ],
      });

      // Extract structured result from tool_use response
      const toolBlock = response.content.find((b) => b.type === "tool_use");
      if (!toolBlock || toolBlock.type !== "tool_use") throw new Error("No tool_use block in response");

      const { concepts } = toolBlock.input as { concepts: { title: string; description: string }[] };

      // Save result
      await db
        .update(quizJob)
        .set({ status: "done", concepts: JSON.stringify(concepts) })
        .where(eq(quizJob.id, jobId));

      message.ack();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(quizJob)
        .set({ status: "error", error: msg })
        .where(eq(quizJob.id, jobId));
      message.ack(); // ack to prevent infinite retry
    }
  }
}
