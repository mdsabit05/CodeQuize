import { eq } from "drizzle-orm";
import { createDb } from "./db";
import { quizJob, topicJob, githubConnection } from "./schema";
import type { Env } from "./env";

type ConceptsMessage = { type: "concepts"; jobId: string; userId: string; repoFullName: string };
type TopicsMessage = { type: "topics"; jobId: string; userId: string; conceptTitle: string; conceptDescription: string };
type QueueMessage = ConceptsMessage | TopicsMessage;

async function callAI(
  apiKey: string,
  gatewayUrl: string,
  userMessage: string,
  toolName: string,
  toolDescription: string,
  toolSchema: object
): Promise<Record<string, unknown>> {
  const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-haiku-4-5",
      messages: [{ role: "user", content: userMessage }],
      tools: [{ type: "function", function: { name: toolName, description: toolDescription, parameters: toolSchema } }],
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

async function handleConceptsJob(msg: ConceptsMessage, env: Env): Promise<void> {
  const db = createDb(env);

  const [conn] = await db
    .select()
    .from(githubConnection)
    .where(eq(githubConnection.userId, msg.userId))
    .limit(1);

  if (!conn) throw new Error("GitHub not connected");

  const [owner, repo] = msg.repoFullName.split("/");
  const commitsRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits?per_page=5`,
    { headers: { Authorization: `Bearer ${conn.accessToken}`, "User-Agent": "codequize-backend" } }
  );
  const commits = await commitsRes.json<{ sha: string; commit: { message: string } }[]>();

  const diffs = await Promise.all(
    commits.slice(0, 5).map(async (commit) => {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`,
        { headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: "application/vnd.github.diff", "User-Agent": "codequize-backend" } }
      );
      const diff = await res.text();
      return `## ${commit.commit.message}\n\n${diff.slice(0, 3000)}`;
    })
  );

  const diffText = diffs.join("\n\n---\n\n").slice(0, 12000);

  const result = await callAI(
    env.ANTHROPIC_API_KEY,
    env.AI_GATEWAY_URL,
    `Here are recent code changes from the GitHub repo "${msg.repoFullName}":\n\n${diffText}\n\nExtract 5 to 10 key programming concepts that a developer would learn from studying these changes. Skip trivial changes like renamed files or version bumps. Focus on real ideas.`,
    "extract_concepts",
    "Extract key programming concepts from recent code changes",
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
          minItems: 5,
          maxItems: 10,
        },
      },
      required: ["concepts"],
    }
  );

  const { concepts } = result as { concepts: { title: string; description: string }[] };

  await db
    .update(quizJob)
    .set({ status: "done", concepts: JSON.stringify(concepts) })
    .where(eq(quizJob.id, msg.jobId));
}

async function handleTopicsJob(msg: TopicsMessage, env: Env): Promise<void> {
  const db = createDb(env);

  const result = await callAI(
    env.ANTHROPIC_API_KEY,
    env.AI_GATEWAY_URL,
    `A developer recently learned about this programming concept:\n\nConcept: "${msg.conceptTitle}"\nDescription: ${msg.conceptDescription}\n\nSuggest 4 blog post or article topic ideas they could write about to share this knowledge. Each topic should be specific, interesting, and useful to other developers.`,
    "suggest_topics",
    "Suggest blog post topic ideas based on a programming concept",
    {
      type: "object",
      properties: {
        topics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Blog post title (catchy, specific)" },
              description: { type: "string", description: "One sentence about what this post would cover" },
            },
            required: ["title", "description"],
          },
          minItems: 4,
          maxItems: 4,
        },
      },
      required: ["topics"],
    }
  );

  const { topics } = result as { topics: { title: string; description: string }[] };

  await db
    .update(topicJob)
    .set({ status: "done", topics: JSON.stringify(topics) })
    .where(eq(topicJob.id, msg.jobId));
}

export async function handleQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    const db = createDb(env);

    try {
      if (message.body.type === "concepts") {
        await handleConceptsJob(message.body, env);
      } else {
        await handleTopicsJob(message.body, env);
      }
      message.ack();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (message.body.type === "concepts") {
        await db.update(quizJob)
          .set({ status: "error", error: msg })
          .where(eq(quizJob.id, message.body.jobId));
      } else {
        await db.update(topicJob)
          .set({ status: "error", error: msg })
          .where(eq(topicJob.id, message.body.jobId));
      }
      message.ack();
    }
  }
}
