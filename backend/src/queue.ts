import { eq } from "drizzle-orm";
import { createDb } from "./db";
import { quizJob, topicJob, quizGenJob, quizAttempt, githubConnection } from "./schema";
import type { Env } from "./env";

type ConceptsMessage  = { type: "concepts";      jobId: string; userId: string; repoFullName: string };
type TopicsMessage    = { type: "topics";         jobId: string; userId: string; conceptTitle: string; conceptDescription: string };
type GenerateQuizMsg  = { type: "generate_quiz";  jobId: string; userId: string; topics: string[] };
type GradeQuizMsg     = { type: "grade_quiz";     attemptId: string; userId: string; questions: Question[]; answers: Answer[] };
type QueueMessage     = ConceptsMessage | TopicsMessage | GenerateQuizMsg | GradeQuizMsg;

type Question =
  | { type: "mcq";   question: string; options: string[]; correctAnswer: string }
  | { type: "short"; question: string; sampleAnswer: string };

type Answer = { questionIndex: number; answer: string };

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
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "anthropic/claude-haiku-4-5",
      messages: [{ role: "user", content: userMessage }],
      tools: [{ type: "function", function: { name: toolName, description: toolDescription, parameters: toolSchema } }],
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });

  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

  const json = await res.json<{
    choices: { message: { tool_calls: { function: { arguments: string } }[] } }[];
  }>();
  const args = json.choices[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("No tool call in response");
  return JSON.parse(args);
}

// --- Concepts handler ---
async function handleConceptsJob(msg: ConceptsMessage, env: Env): Promise<void> {
  const db = createDb(env);
  const [conn] = await db.select().from(githubConnection).where(eq(githubConnection.userId, msg.userId)).limit(1);
  if (!conn) throw new Error("GitHub not connected");

  const [owner, repo] = msg.repoFullName.split("/");
  const commitsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=5`, {
    headers: { Authorization: `Bearer ${conn.accessToken}`, "User-Agent": "codequize-backend" },
  });
  const commits = await commitsRes.json<{ sha: string; commit: { message: string } }[]>();

  const diffs = await Promise.all(commits.slice(0, 5).map(async (commit) => {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`, {
      headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: "application/vnd.github.diff", "User-Agent": "codequize-backend" },
    });
    return `## ${commit.commit.message}\n\n${(await res.text()).slice(0, 3000)}`;
  }));

  const result = await callAI(
    env.ANTHROPIC_API_KEY, env.AI_GATEWAY_URL,
    `Here are recent code changes from "${msg.repoFullName}":\n\n${diffs.join("\n\n---\n\n").slice(0, 12000)}\n\nExtract 5 to 10 key programming concepts.`,
    "extract_concepts", "Extract programming concepts from code changes",
    { type: "object", properties: { concepts: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" } }, required: ["title", "description"] }, minItems: 5, maxItems: 10 } }, required: ["concepts"] }
  );

  const { concepts } = result as { concepts: { title: string; description: string }[] };
  await db.update(quizJob).set({ status: "done", concepts: JSON.stringify(concepts) }).where(eq(quizJob.id, msg.jobId));
}

// --- Topics handler ---
async function handleTopicsJob(msg: TopicsMessage, env: Env): Promise<void> {
  const db = createDb(env);
  const result = await callAI(
    env.ANTHROPIC_API_KEY, env.AI_GATEWAY_URL,
    `A developer learned about: "${msg.conceptTitle}" — ${msg.conceptDescription}\n\nSuggest 4 blog post topic ideas they could write.`,
    "suggest_topics", "Suggest blog post topics",
    { type: "object", properties: { topics: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" } }, required: ["title", "description"] }, minItems: 4, maxItems: 4 } }, required: ["topics"] }
  );
  const { topics } = result as { topics: { title: string; description: string }[] };
  await db.update(topicJob).set({ status: "done", topics: JSON.stringify(topics) }).where(eq(topicJob.id, msg.jobId));
}

// --- Generate quiz handler ---
async function handleGenerateQuiz(msg: GenerateQuizMsg, env: Env): Promise<void> {
  const db = createDb(env);
  const topicsText = msg.topics.join(", ");

  const result = await callAI(
    env.ANTHROPIC_API_KEY, env.AI_GATEWAY_URL,
    `Create a 5-question quiz about these programming topics: ${topicsText}.\n\nMix of 3 multiple choice and 2 short answer questions. Make questions practical and relevant to developers.`,
    "create_quiz", "Create a quiz with MCQ and short answer questions",
    {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            oneOf: [
              {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["mcq"] },
                  question: { type: "string" },
                  options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                  correctAnswer: { type: "string" },
                },
                required: ["type", "question", "options", "correctAnswer"],
              },
              {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["short"] },
                  question: { type: "string" },
                  sampleAnswer: { type: "string" },
                },
                required: ["type", "question", "sampleAnswer"],
              },
            ],
          },
          minItems: 5,
          maxItems: 5,
        },
      },
      required: ["questions"],
    }
  );

  const { questions } = result as { questions: Question[] };
  await db.update(quizGenJob).set({ status: "done", questions: JSON.stringify(questions) }).where(eq(quizGenJob.id, msg.jobId));
}

// --- Grade quiz handler ---
async function handleGradeQuiz(msg: GradeQuizMsg, env: Env): Promise<void> {
  const db = createDb(env);

  const feedback: { questionIndex: number; correct: boolean; explanation: string }[] = [];
  let correctCount = 0;

  for (const q of msg.questions) {
    const ans = msg.answers.find((a) => a.questionIndex === msg.questions.indexOf(q));
    const userAnswer = ans?.answer ?? "";

    if (q.type === "mcq") {
      const correct = userAnswer.trim() === q.correctAnswer.trim();
      correctCount += correct ? 1 : 0;
      feedback.push({
        questionIndex: msg.questions.indexOf(q),
        correct,
        explanation: correct
          ? `Correct! The answer is "${q.correctAnswer}".`
          : `Incorrect. The correct answer is "${q.correctAnswer}".`,
      });
    } else {
      // Short answer — AI grades
      const result = await callAI(
        env.ANTHROPIC_API_KEY, env.AI_GATEWAY_URL,
        `Question: ${q.question}\n\nSample answer: ${q.sampleAnswer}\n\nStudent's answer: ${userAnswer}\n\nGrade this answer.`,
        "grade_answer", "Grade a short answer question",
        {
          type: "object",
          properties: {
            correct: { type: "boolean", description: "Is the answer substantially correct?" },
            explanation: { type: "string", description: "Explain why the answer is right or wrong, referencing the key concept." },
          },
          required: ["correct", "explanation"],
        }
      );
      const { correct, explanation } = result as { correct: boolean; explanation: string };
      correctCount += correct ? 1 : 0;
      feedback.push({ questionIndex: msg.questions.indexOf(q), correct, explanation });
    }
  }

  const score = Math.round((correctCount / msg.questions.length) * 100);

  await db
    .update(quizAttempt)
    .set({ status: "done", score, feedback: JSON.stringify(feedback) })
    .where(eq(quizAttempt.id, msg.attemptId));
}

// --- Main handler ---
export async function handleQueue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const db = createDb(env);
    try {
      if (message.body.type === "concepts") {
        await handleConceptsJob(message.body, env);
      } else if (message.body.type === "topics") {
        await handleTopicsJob(message.body, env);
      } else if (message.body.type === "generate_quiz") {
        await handleGenerateQuiz(message.body, env);
      } else {
        await handleGradeQuiz(message.body, env);
      }
      message.ack();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const body = message.body;

      if (body.type === "concepts") {
        await db.update(quizJob).set({ status: "error", error: errMsg }).where(eq(quizJob.id, body.jobId));
      } else if (body.type === "topics") {
        await db.update(topicJob).set({ status: "error", error: errMsg }).where(eq(topicJob.id, body.jobId));
      } else if (body.type === "generate_quiz") {
        await db.update(quizGenJob).set({ status: "error", error: errMsg }).where(eq(quizGenJob.id, body.jobId));
      } else {
        await db.update(quizAttempt).set({ status: "error", error: errMsg }).where(eq(quizAttempt.id, body.attemptId));
      }
      message.ack();
    }
  }
}
