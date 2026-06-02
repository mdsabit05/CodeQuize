import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import { topicJob, quizJob } from "../schema";
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

  if (selectedTopics.length < 1 || selectedTopics.length > 2) {
    return c.json({ error: "Select 1 or 2 topics" }, 400);
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

export { topicRouter };
