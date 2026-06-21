import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import { topicJob, quizJob, quizGenJob, quizAttempt, learningLink, postDraft } from "../schema";
import type { Env } from "../env";
import type { Variables } from "../middleware/session";

const topicRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/topic/start
// Body: { quizJobId, conceptIndex }
topicRouter.post("/start", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { quizJobId, conceptIndex } = await c.req.json<{
    quizJobId: string;
    conceptIndex: number;
  }>();

  const db = createDb(c.env);

  // Verify quiz job belongs to user
  const [quiz] = await db
    .select()
    .from(quizJob)
    .where(and(eq(quizJob.id, quizJobId), eq(quizJob.userId, user.id)))
    .limit(1);

  if (!quiz) return c.json({ error: "Quiz job not found" }, 404);
  if (!quiz.concepts) return c.json({ error: "Concepts not ready" }, 400);

  const concepts = JSON.parse(quiz.concepts) as { title: string; description: string }[];
  const concept = concepts[conceptIndex];
  if (!concept) return c.json({ error: "Concept not found" }, 404);

  // Reuse existing topic job for this concept if one already exists
  const [existing] = await db
    .select({ id: topicJob.id })
    .from(topicJob)
    .where(
      and(
        eq(topicJob.quizJobId, quizJobId),
        eq(topicJob.userId, user.id),
        eq(topicJob.conceptIndex, conceptIndex)
      )
    )
    .limit(1);

  if (existing) return c.json({ jobId: existing.id });

  const jobId = crypto.randomUUID();

  await db.insert(topicJob).values({
    id: jobId,
    userId: user.id,
    quizJobId,
    conceptIndex,
    status: "pending",
    createdAt: new Date(),
  });

  await c.env.QUIZ_QUEUE.send({
    type: "topics",
    jobId,
    userId: user.id,
    conceptTitle: concept.title,
    conceptDescription: concept.description,
  });

  return c.json({ jobId });
});

// GET /api/topic/job/:jobId
topicRouter.get("/job/:jobId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const jobId = c.req.param("jobId");
  const db = createDb(c.env);

  const [job] = await db
    .select()
    .from(topicJob)
    .where(and(eq(topicJob.id, jobId), eq(topicJob.userId, user.id)))
    .limit(1);

  if (!job) return c.json({ error: "Job not found" }, 404);

  return c.json({
    status: job.status,
    quizJobId: job.quizJobId,
    topics: job.topics ? JSON.parse(job.topics) : null,
    selectedTopics: job.selectedTopics ? JSON.parse(job.selectedTopics) : null,
    error: job.error,
  });
});

// POST /api/topic/select
// Body: { topicJobId, selectedTopics: string[] }
topicRouter.post("/select", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { topicJobId, selectedTopics } = await c.req.json<{
    topicJobId: string;
    selectedTopics: string[];
  }>();

  if (selectedTopics.length < 1) {
    return c.json({ error: "Select at least 1 topic" }, 400);
  }

  const db = createDb(c.env);

  const [job] = await db
    .select()
    .from(topicJob)
    .where(and(eq(topicJob.id, topicJobId), eq(topicJob.userId, user.id)))
    .limit(1);

  if (!job) return c.json({ error: "Job not found" }, 404);

  await db
    .update(topicJob)
    .set({ selectedTopics: JSON.stringify(selectedTopics) })
    .where(eq(topicJob.id, topicJobId));

  return c.json({ ok: true });
});

// GET /api/topic/learn?topic=<title>
// Returns AI explanation + web links for a topic
topicRouter.get("/learn", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const topic = c.req.query("topic");
  const mode = c.req.query("mode") ?? "normal"; // "normal" | "simple" | "hinglish"
  if (!topic) return c.json({ error: "topic query param required" }, 400);

  const modeInstruction =
    mode === "simple"
      ? `Use very simple language. Avoid jargon. Explain like you're talking to a complete beginner. Use short sentences and everyday analogies.`
      : mode === "hinglish"
      ? `Explain in Hinglish (a natural mix of Hindi and English). Write English technical terms as-is but explain everything else in simple Hindi mixed with English, e.g. "Queue ek line ki tarah hoti hai jisme kaam wait karta hai". Make it feel like a friend explaining over chai.`
      : `Use clear, plain English suitable for a developer learning this concept.`;

  const [aiRes, serperRes] = await Promise.all([
    fetch(`${c.env.AI_GATEWAY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.env.ANTHROPIC_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4-5",
        messages: [{
          role: "user",
          content: `You are a helpful technical educator. Explain the concept "${topic}" for a developer who wants to learn it before taking a quiz.

${modeInstruction}

Return ONLY a JSON object (no markdown) with this shape:
{
  "summary": "2-3 sentence overview",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4"],
  "example": "A short concrete code or usage example (optional, omit key if not applicable)"
}`,
        }],
      }),
    }),
    fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": c.env.SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${topic} tutorial guide explained developer`, num: 4 }),
    }),
  ]);

  let explanation: { summary: string; keyPoints: string[]; example?: string } = {
    summary: "",
    keyPoints: [],
  };
  try {
    const aiData = await aiRes.json() as any;
    const raw = aiData.choices?.[0]?.message?.content ?? "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    explanation = match ? JSON.parse(match[0]) : explanation;
  } catch { /* keep defaults */ }

  let links: { title: string; url: string; snippet: string }[] = [];
  try {
    const sd = await serperRes.json() as any;
    links = (sd.organic ?? []).slice(0, 4).map((r: any) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet ?? "",
    }));
  } catch { /* keep empty */ }

  return c.json({ explanation, links });
});

// DELETE /api/topic/job/:topicJobId — reset just this concept's topic + quiz data
topicRouter.delete("/job/:topicJobId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const topicJobId = c.req.param("topicJobId");
  const db = createDb(c.env);

  const [job] = await db
    .select({ id: topicJob.id, quizJobId: topicJob.quizJobId })
    .from(topicJob)
    .where(and(eq(topicJob.id, topicJobId), eq(topicJob.userId, user.id)))
    .limit(1);

  if (!job) return c.json({ error: "Job not found" }, 404);

  const genJobs = await db
    .select({ id: quizGenJob.id })
    .from(quizGenJob)
    .where(eq(quizGenJob.topicJobId, topicJobId));

  for (const gj of genJobs) {
    await db.delete(learningLink).where(eq(learningLink.attemptId, gj.id));
    await db.delete(postDraft).where(eq(postDraft.attemptId, gj.id));
    await db.delete(quizAttempt).where(eq(quizAttempt.quizGenJobId, gj.id));
  }

  await db.delete(quizGenJob).where(eq(quizGenJob.topicJobId, topicJobId));
  await db.delete(topicJob).where(eq(topicJob.id, topicJobId));

  return c.json({ ok: true, quizJobId: job.quizJobId });
});

export { topicRouter };
