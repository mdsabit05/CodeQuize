import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import { quizGenJob, quizAttempt, topicJob } from "../schema";
import type { Env } from "../env";
import type { Variables } from "../middleware/session";

const quizGenRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/quiz-gen/start
// Body: { topicJobId }
quizGenRouter.post("/start", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { topicJobId } = await c.req.json<{ topicJobId: string }>();
  const db = createDb(c.env);

  const [tJob] = await db
    .select()
    .from(topicJob)
    .where(and(eq(topicJob.id, topicJobId), eq(topicJob.userId, user.id)))
    .limit(1);

  if (!tJob) return c.json({ error: "Topic job not found" }, 404);
  if (!tJob.selectedTopics) return c.json({ error: "No topics selected" }, 400);

  const selectedTopics = JSON.parse(tJob.selectedTopics) as string[];
  const jobId = crypto.randomUUID();

  await db.insert(quizGenJob).values({
    id: jobId,
    userId: user.id,
    topicJobId,
    status: "pending",
    createdAt: new Date(),
  });

  await c.env.QUIZ_QUEUE.send({
    type: "generate_quiz",
    jobId,
    userId: user.id,
    topics: selectedTopics,
  });

  return c.json({ jobId });
});

// GET /api/quiz-gen/job/:jobId
quizGenRouter.get("/job/:jobId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const jobId = c.req.param("jobId");
  const db = createDb(c.env);

  const [job] = await db
    .select()
    .from(quizGenJob)
    .where(and(eq(quizGenJob.id, jobId), eq(quizGenJob.userId, user.id)))
    .limit(1);

  if (!job) return c.json({ error: "Job not found" }, 404);

  return c.json({
    status: job.status,
    questions: job.questions ? JSON.parse(job.questions) : null,
    error: job.error,
  });
});

// POST /api/quiz-gen/:jobId/submit
// Body: { answers: { questionIndex, answer }[] }
quizGenRouter.post("/:jobId/submit", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const quizGenJobId = c.req.param("jobId");
  const { answers } = await c.req.json<{
    answers: { questionIndex: number; answer: string }[];
  }>();

  const db = createDb(c.env);

  const [job] = await db
    .select()
    .from(quizGenJob)
    .where(and(eq(quizGenJob.id, quizGenJobId), eq(quizGenJob.userId, user.id)))
    .limit(1);

  if (!job || !job.questions) return c.json({ error: "Quiz not found" }, 404);

  const attemptId = crypto.randomUUID();
  const questions = JSON.parse(job.questions);

  await db.insert(quizAttempt).values({
    id: attemptId,
    userId: user.id,
    quizGenJobId,
    status: "pending",
    answers: JSON.stringify(answers),
    createdAt: new Date(),
  });

  await c.env.QUIZ_QUEUE.send({
    type: "grade_quiz",
    attemptId,
    userId: user.id,
    questions,
    answers,
  });

  return c.json({ attemptId });
});

// GET /api/quiz-gen/attempt/:attemptId
quizGenRouter.get("/attempt/:attemptId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const attemptId = c.req.param("attemptId");
  const db = createDb(c.env);

  const [attempt] = await db
    .select()
    .from(quizAttempt)
    .where(and(eq(quizAttempt.id, attemptId), eq(quizAttempt.userId, user.id)))
    .limit(1);

  if (!attempt) return c.json({ error: "Attempt not found" }, 404);

  return c.json({
    status: attempt.status,
    score: attempt.score,
    feedback: attempt.feedback ? JSON.parse(attempt.feedback) : null,
    answers: attempt.answers ? JSON.parse(attempt.answers) : null,
    error: attempt.error,
  });
});

export { quizGenRouter };
