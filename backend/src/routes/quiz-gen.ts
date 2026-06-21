import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { createDb } from "../db";
import { quizGenJob, quizAttempt, topicJob } from "../schema";
import type { Env } from "../env";
import type { Variables } from "../middleware/session";
import { RETRY_WAIT_MINUTES } from "../config";

const quizGenRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── helpers ────────────────────────────────────────────────────────────────

async function getLatestDoneAttempt(db: ReturnType<typeof createDb>, topicJobId: string, userId: string) {
  const [latest] = await db
    .select({
      score: quizAttempt.score,
      createdAt: quizAttempt.createdAt,
      failedAt: quizAttempt.failedAt,
    })
    .from(quizAttempt)
    .innerJoin(quizGenJob, eq(quizAttempt.quizGenJobId, quizGenJob.id))
    .where(
      and(
        eq(quizGenJob.topicJobId, topicJobId),
        eq(quizAttempt.userId, userId),
        eq(quizAttempt.status, "done")
      )
    )
    .orderBy(desc(quizAttempt.createdAt))
    .limit(1);
  return latest ?? null;
}

function calcWaitSecondsLeft(failedAt: Date): number {
  const waitMs = RETRY_WAIT_MINUTES * 60 * 1000;
  const elapsed = Date.now() - failedAt.getTime();
  return Math.max(0, Math.ceil((waitMs - elapsed) / 1000));
}

// ── routes ─────────────────────────────────────────────────────────────────

// POST /api/quiz-gen/start
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

  await c.env.QUIZ_QUEUE.send({ type: "generate_quiz", jobId, userId: user.id, topics: selectedTopics });

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
quizGenRouter.post("/:jobId/submit", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const quizGenJobId = c.req.param("jobId");
  const { answers } = await c.req.json<{ answers: { questionIndex: number; answer: string }[] }>();

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

  await c.env.QUIZ_QUEUE.send({ type: "grade_quiz", attemptId, userId: user.id, questions, answers });

  return c.json({ attemptId });
});

// GET /api/quiz-gen/attempt/:attemptId
// Also returns topicJobId so the frontend can call retry-status
quizGenRouter.get("/attempt/:attemptId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const attemptId = c.req.param("attemptId");
  const db = createDb(c.env);

  const [row] = await db
    .select({
      status: quizAttempt.status,
      score: quizAttempt.score,
      feedback: quizAttempt.feedback,
      answers: quizAttempt.answers,
      error: quizAttempt.error,
      topicJobId: quizGenJob.topicJobId,
      questions: quizGenJob.questions,
      quizJobId: topicJob.quizJobId,
    })
    .from(quizAttempt)
    .innerJoin(quizGenJob, eq(quizAttempt.quizGenJobId, quizGenJob.id))
    .innerJoin(topicJob, eq(quizGenJob.topicJobId, topicJob.id))
    .where(and(eq(quizAttempt.id, attemptId), eq(quizAttempt.userId, user.id)))
    .limit(1);

  if (!row) return c.json({ error: "Attempt not found" }, 404);

  return c.json({
    status: row.status,
    score: row.score,
    feedback: row.feedback ? JSON.parse(row.feedback) : null,
    answers: row.answers ? JSON.parse(row.answers) : null,
    questions: row.questions ? JSON.parse(row.questions) : null,
    error: row.error,
    topicJobId: row.topicJobId,
    quizJobId: row.quizJobId,
  });
});

// GET /api/quiz-gen/pending-retry
// Called by the dashboard to check if the user has an unfinished retry
quizGenRouter.get("/pending-retry", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = createDb(c.env);

  // Latest completed attempt that didn't pass
  const [latest] = await db
    .select({
      attemptId: quizAttempt.id,
      score: quizAttempt.score,
      createdAt: quizAttempt.createdAt,
      topicJobId: quizGenJob.topicJobId,
    })
    .from(quizAttempt)
    .innerJoin(quizGenJob, eq(quizAttempt.quizGenJobId, quizGenJob.id))
    .where(and(eq(quizAttempt.userId, user.id), eq(quizAttempt.status, "done")))
    .orderBy(desc(quizAttempt.createdAt))
    .limit(1);

  if (!latest || (latest.score ?? 0) >= 80) {
    return c.json({ hasPendingRetry: false });
  }

  const secsLeft = calcWaitSecondsLeft(latest.failedAt ?? latest.createdAt);
  return c.json({
    hasPendingRetry: true,
    attemptId: latest.attemptId,
    topicJobId: latest.topicJobId,
    score: latest.score,
    canRetry: secsLeft === 0,
    waitSecondsLeft: secsLeft || null,
  });
});

// GET /api/quiz-gen/retry-status/:topicJobId
// Server decides if user can retry. Frontend only shows the countdown.
quizGenRouter.get("/retry-status/:topicJobId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const topicJobId = c.req.param("topicJobId");
  const db = createDb(c.env);

  const latest = await getLatestDoneAttempt(db, topicJobId, user.id);

  // No attempt yet — can go
  if (!latest) return c.json({ canRetry: true, waitSecondsLeft: null, passed: false });

  // Passed — no retry needed
  if ((latest.score ?? 0) >= 80) return c.json({ canRetry: false, waitSecondsLeft: null, passed: true });

  // Failed — check wait time
  const secsLeft = calcWaitSecondsLeft(latest.failedAt ?? latest.createdAt);
  return c.json({ canRetry: secsLeft === 0, waitSecondsLeft: secsLeft || null, passed: false });
});

// POST /api/quiz-gen/retry/:topicJobId
// Server enforces the wait. Returns new quiz gen jobId if allowed.
quizGenRouter.post("/retry/:topicJobId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const topicJobId = c.req.param("topicJobId");
  const db = createDb(c.env);

  // Enforce wait time server-side
  const latest = await getLatestDoneAttempt(db, topicJobId, user.id);
  if (latest && (latest.score ?? 0) < 80) {
    const secsLeft = calcWaitSecondsLeft(latest.failedAt ?? latest.createdAt);
    if (secsLeft > 0) {
      return c.json({ error: "Wait time not over", waitSecondsLeft: secsLeft }, 429);
    }
  }

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

  await c.env.QUIZ_QUEUE.send({ type: "generate_quiz", jobId, userId: user.id, topics: selectedTopics });

  return c.json({ jobId });
});

export { quizGenRouter };
