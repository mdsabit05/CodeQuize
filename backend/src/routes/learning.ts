import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import { learningLink } from "../schema";
import type { Env } from "../env";
import type { Variables } from "../middleware/session";

const learningRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/learning/links/:attemptId
learningRouter.get("/links/:attemptId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const attemptId = c.req.param("attemptId");
  const db = createDb(c.env);

  const [job] = await db
    .select()
    .from(learningLink)
    .where(and(eq(learningLink.attemptId, attemptId), eq(learningLink.userId, user.id)))
    .limit(1);

  if (!job) return c.json({ status: "none", links: null });

  return c.json({
    status: job.status,
    links: job.links ? JSON.parse(job.links) : null,
    error: job.error,
  });
});

export { learningRouter };
