import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import { quizJob, githubConnection, githubSelectedRepo } from "../schema";
import type { Env } from "../env";
import type { Variables } from "../middleware/session";

const quizRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/quiz/start
// Body: { repoFullName: string }
// Creates a job, enqueues it, returns { jobId }
quizRouter.post("/start", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { repoFullName } = await c.req.json<{ repoFullName: string }>();

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

  const jobId = crypto.randomUUID();

  await db.insert(quizJob).values({
    id: jobId,
    userId: user.id,
    repoFullName,
    status: "pending",
    createdAt: new Date(),
  });

  await c.env.QUIZ_QUEUE.send({ jobId, userId: user.id, repoFullName });

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

export { quizRouter };
