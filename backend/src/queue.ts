import { eq } from "drizzle-orm";
import { createDb } from "./db";
import { quizJob, githubConnection } from "./schema";
import type { Env } from "./env";

type JobMessage = { jobId: string; userId: string; repoFullName: string };

async function callOpenRouter(
  apiKey: string,
  gatewayUrl: string,
  model: string,
  userMessage: string,
  toolSchema: object,
  toolName: string
): Promise<{ concepts: { title: string; description: string }[] }> {
  const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: userMessage }],
      tools: [
        {
          type: "function",
          function: {
            name: toolName,
            description: "Extract key programming concepts from recent code changes",
            parameters: toolSchema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }

  const json = await res.json<{
    choices: { message: { tool_calls: { function: { arguments: string } }[] } }[];
  }>();

  const args = json.choices[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("No tool call in response");
  return JSON.parse(args);
}

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
          return `## ${commit.commit.message}\n\n${diff.slice(0, 3000)}`;
        })
      );

      const diffText = diffs.join("\n\n---\n\n").slice(0, 12000);

      const { concepts } = await callOpenRouter(
        env.ANTHROPIC_API_KEY,
        env.AI_GATEWAY_URL,
        "anthropic/claude-haiku-4-5",
        `Here are recent code changes from the GitHub repo "${repoFullName}":\n\n${diffText}\n\nExtract 3 to 5 key programming concepts that a developer would learn from studying these changes. Skip trivial changes like renamed files or version bumps. Focus on real ideas.`,
        {
          type: "object",
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
        "extract_concepts"
      );

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
      message.ack();
    }
  }
}
