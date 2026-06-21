import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { createDb } from "../db";
import { quizJob, githubConnection, githubSelectedRepo, quizAttempt, quizGenJob, topicJob, postDraft, learningLink } from "../schema";
import type { Env } from "../env";
import type { Variables } from "../middleware/session";

const quizRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/quiz/start
// Body: { repoFullName: string, refresh?: boolean }
// If an existing done job exists for this repo, reuse it (unless refresh=true)
quizRouter.post("/start", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { repoFullName, refresh } = await c.req.json<{ repoFullName: string; refresh?: boolean }>();

  const db = createDb(c.env);

  // Verify user has this repo selected
  const [selected] = await db
    .select()
    .from(githubSelectedRepo)
    .where(
      and(
        eq(githubSelectedRepo.userId, user.id),
        eq(githubSelectedRepo.repoFullName, repoFullName)
      )
    )
    .limit(1);

  if (!selected) return c.json({ error: "Repo not selected" }, 403);

  // Reuse existing done job unless refresh is requested
  if (!refresh) {
    const [existing] = await db
      .select({ id: quizJob.id })
      .from(quizJob)
      .where(
        and(
          eq(quizJob.userId, user.id),
          eq(quizJob.repoFullName, repoFullName),
          eq(quizJob.status, "done")
        )
      )
      .orderBy(desc(quizJob.createdAt))
      .limit(1);

    if (existing) return c.json({ jobId: existing.id });
  }

  const jobId = crypto.randomUUID();

  await db.insert(quizJob).values({
    id: jobId,
    userId: user.id,
    repoFullName,
    status: "pending",
    createdAt: new Date(),
  });

  await c.env.QUIZ_QUEUE.send({ type: "concepts", jobId, userId: user.id, repoFullName });

  return c.json({ jobId });
});

// GET /api/quiz/job/:jobId
// Returns { status, concepts, error }
quizRouter.get("/job/:jobId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const jobId = c.req.param("jobId");
  const db = createDb(c.env);

  const [job] = await db
    .select()
    .from(quizJob)
    .where(and(eq(quizJob.id, jobId), eq(quizJob.userId, user.id)))
    .limit(1);

  if (!job) return c.json({ error: "Job not found" }, 404);

  return c.json({
    status: job.status,
    concepts: job.concepts ? JSON.parse(job.concepts) : null,
    error: job.error,
  });
});

// GET /api/quiz/job/:jobId/progress
// Returns concepts with their quiz completion status
quizRouter.get("/job/:jobId/progress", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const jobId = c.req.param("jobId");
  const db = createDb(c.env);

  const [job] = await db
    .select()
    .from(quizJob)
    .where(and(eq(quizJob.id, jobId), eq(quizJob.userId, user.id)))
    .limit(1);

  if (!job || !job.concepts) return c.json({ error: "Job not found" }, 404);

  const concepts = JSON.parse(job.concepts) as { title: string; description: string }[];

  // Get all topicJobs for this quizJob to know which concepts have been attempted
  const topicJobs = await db
    .select({
      conceptIndex: topicJob.conceptIndex,
      topicJobId: topicJob.id,
    })
    .from(topicJob)
    .where(and(eq(topicJob.quizJobId, jobId), eq(topicJob.userId, user.id)));

  // For each topicJob, check if there's a passing attempt
  const passedConceptIndexes = new Set<number>();
  const attemptedConceptIndexes = new Set<number>();

  for (const tj of topicJobs) {
    attemptedConceptIndexes.add(tj.conceptIndex);
    const [best] = await db
      .select({ score: quizAttempt.score })
      .from(quizAttempt)
      .innerJoin(quizGenJob, eq(quizAttempt.quizGenJobId, quizGenJob.id))
      .where(
        and(
          eq(quizGenJob.topicJobId, tj.topicJobId),
          eq(quizAttempt.userId, user.id),
          eq(quizAttempt.status, "done")
        )
      )
      .orderBy(desc(quizAttempt.score))
      .limit(1);

    if (best && (best.score ?? 0) >= 80) {
      passedConceptIndexes.add(tj.conceptIndex);
    }
  }

  return c.json({
    concepts: concepts.map((c, i) => ({
      ...c,
      index: i,
      attempted: attemptedConceptIndexes.has(i),
      passed: passedConceptIndexes.has(i),
    })),
  });
});

// GET /api/quiz/job/:jobId/concept/:conceptIndex/attempts
// Returns all quiz attempts for a specific concept
quizRouter.get("/job/:jobId/concept/:conceptIndex/attempts", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const jobId = c.req.param("jobId");
  const conceptIndex = parseInt(c.req.param("conceptIndex"), 10);
  const db = createDb(c.env);

  // Find the topicJob for this concept
  const [tj] = await db
    .select({ id: topicJob.id })
    .from(topicJob)
    .where(
      and(
        eq(topicJob.quizJobId, jobId),
        eq(topicJob.userId, user.id),
        eq(topicJob.conceptIndex, conceptIndex)
      )
    )
    .limit(1);

  if (!tj) return c.json({ attempts: [] });

  // Get all done attempts for this topicJob, newest first
  const attempts = await db
    .select({
      attemptId: quizAttempt.id,
      score: quizAttempt.score,
      createdAt: quizAttempt.createdAt,
      status: quizAttempt.status,
    })
    .from(quizAttempt)
    .innerJoin(quizGenJob, eq(quizAttempt.quizGenJobId, quizGenJob.id))
    .where(
      and(
        eq(quizGenJob.topicJobId, tj.id),
        eq(quizAttempt.userId, user.id),
        eq(quizAttempt.status, "done")
      )
    )
    .orderBy(desc(quizAttempt.createdAt));

  return c.json({ attempts });
});

// DELETE /api/quiz/job/:jobId — reset entire repo quiz (all topics, attempts, etc.)
quizRouter.delete("/job/:jobId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const jobId = c.req.param("jobId");
  const db = createDb(c.env);

  const [job] = await db
    .select({ id: quizJob.id })
    .from(quizJob)
    .where(and(eq(quizJob.id, jobId), eq(quizJob.userId, user.id)))
    .limit(1);

  if (!job) return c.json({ error: "Job not found" }, 404);

  // Get all topicJobs for this quizJob
  const topicJobs = await db
    .select({ id: topicJob.id })
    .from(topicJob)
    .where(and(eq(topicJob.quizJobId, jobId), eq(topicJob.userId, user.id)));

  for (const tj of topicJobs) {
    const genJobs = await db
      .select({ id: quizGenJob.id })
      .from(quizGenJob)
      .where(eq(quizGenJob.topicJobId, tj.id));

    for (const gj of genJobs) {
      await db.delete(learningLink).where(eq(learningLink.attemptId, gj.id));
      await db.delete(postDraft).where(eq(postDraft.attemptId, gj.id));
      await db.delete(quizAttempt).where(eq(quizAttempt.quizGenJobId, gj.id));
    }

    await db.delete(quizGenJob).where(eq(quizGenJob.topicJobId, tj.id));
    await db.delete(topicJob).where(eq(topicJob.id, tj.id));
  }

  await db.delete(quizJob).where(eq(quizJob.id, jobId));

  return c.json({ ok: true });
});

export { quizRouter };
