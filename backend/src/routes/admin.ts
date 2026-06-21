import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { createDb } from "../db";
import { user, quizAttempt, quizGenJob, topicJob, quizJob, githubSelectedRepo, postDraft } from "../schema";
import type { Env } from "../env";
import type { Variables } from "../middleware/session";

const ADMIN_EMAIL = "mdsabitrazabarkati@gmail.com";

const adminRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

function requireAdmin(userEmail: string) {
  return userEmail === ADMIN_EMAIL;
}

// GET /api/admin/overview
adminRouter.get("/overview", async (c) => {
  const me = c.get("user");
  if (!me || !requireAdmin(me.email)) return c.json({ error: "Forbidden" }, 403);

  const db = createDb(c.env);

  const allUsers = await db.select({
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  }).from(user);

  const allAttempts = await db.select({
    id: quizAttempt.id,
    userId: quizAttempt.userId,
    score: quizAttempt.score,
    status: quizAttempt.status,
    createdAt: quizAttempt.createdAt,
  }).from(quizAttempt).where(eq(quizAttempt.status, "done"));

  const allPosts = await db.select({ userId: postDraft.userId })
    .from(postDraft).where(eq(postDraft.status, "done"));

  // Build per-user stats
  const attemptsByUser = new Map<string, typeof allAttempts>();
  for (const a of allAttempts) {
    if (!attemptsByUser.has(a.userId)) attemptsByUser.set(a.userId, []);
    attemptsByUser.get(a.userId)!.push(a);
  }

  const postCountByUser = new Map<string, number>();
  for (const p of allPosts) {
    postCountByUser.set(p.userId, (postCountByUser.get(p.userId) ?? 0) + 1);
  }

  const users = allUsers.map((u) => {
    const attempts = attemptsByUser.get(u.id) ?? [];
    const passed = attempts.filter((a) => (a.score ?? 0) >= 80).length;
    const lastAttempt = attempts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      totalAttempts: attempts.length,
      passedAttempts: passed,
      passRate: attempts.length > 0 ? Math.round((passed / attempts.length) * 100) : null,
      postsPublished: postCountByUser.get(u.id) ?? 0,
      lastActiveAt: lastAttempt?.createdAt ?? u.createdAt,
    };
  });

  const totalAttempts = allAttempts.length;
  const totalPassed = allAttempts.filter((a) => (a.score ?? 0) >= 80).length;

  return c.json({
    stats: {
      totalUsers: allUsers.length,
      totalAttempts,
      overallPassRate: totalAttempts > 0 ? Math.round((totalPassed / totalAttempts) * 100) : 0,
      totalPostsPublished: allPosts.length,
    },
    users,
  });
});

// GET /api/admin/user/:userId
adminRouter.get("/user/:userId", async (c) => {
  const me = c.get("user");
  if (!me || !requireAdmin(me.email)) return c.json({ error: "Forbidden" }, 403);

  const userId = c.req.param("userId");
  const db = createDb(c.env);

  const [targetUser] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!targetUser) return c.json({ error: "User not found" }, 404);

  const repos = await db.select({ repoFullName: githubSelectedRepo.repoFullName })
    .from(githubSelectedRepo).where(eq(githubSelectedRepo.userId, userId));

  const topics = await db.select({
    topicJobId: topicJob.id,
    selectedTopics: topicJob.selectedTopics,
    createdAt: topicJob.createdAt,
    repoFullName: quizJob.repoFullName,
  }).from(topicJob)
    .innerJoin(quizJob, eq(topicJob.quizJobId, quizJob.id))
    .where(eq(topicJob.userId, userId))
    .orderBy(desc(topicJob.createdAt));

  const attempts = await db.select({
    attemptId: quizAttempt.id,
    topicJobId: quizGenJob.topicJobId,
    score: quizAttempt.score,
    status: quizAttempt.status,
    createdAt: quizAttempt.createdAt,
    questions: quizGenJob.questions,
    feedback: quizAttempt.feedback,
  }).from(quizAttempt)
    .innerJoin(quizGenJob, eq(quizAttempt.quizGenJobId, quizGenJob.id))
    .where(eq(quizAttempt.userId, userId))
    .orderBy(desc(quizAttempt.createdAt));

  const posts = await db.select({
    attemptId: postDraft.attemptId,
    blogTitle: postDraft.blogTitle,
    blogSlug: postDraft.blogSlug,
    publishedAt: postDraft.publishedAt,
    status: postDraft.status,
  }).from(postDraft).where(eq(postDraft.userId, userId));

  const postsByAttempt = new Map(posts.map((p) => [p.attemptId, p]));
  const attemptsByTopic = new Map<string, typeof attempts>();
  for (const a of attempts) {
    if (!attemptsByTopic.has(a.topicJobId)) attemptsByTopic.set(a.topicJobId, []);
    attemptsByTopic.get(a.topicJobId)!.push(a);
  }

  // Concept weakness: topics where user never passed
  const weakTopics: string[] = [];
  for (const t of topics) {
    if (!t.selectedTopics) continue;
    const topicAttempts = attemptsByTopic.get(t.topicJobId) ?? [];
    const everPassed = topicAttempts.some((a) => (a.score ?? 0) >= 80);
    if (!everPassed && topicAttempts.length > 0) {
      const names: string[] = JSON.parse(t.selectedTopics);
      weakTopics.push(...names);
    }
  }

  const history = topics.filter((t) => t.selectedTopics).map((t) => ({
    topicJobId: t.topicJobId,
    topics: JSON.parse(t.selectedTopics!) as string[],
    repoFullName: t.repoFullName,
    createdAt: t.createdAt,
    attempts: (attemptsByTopic.get(t.topicJobId) ?? []).map((a) => ({
      attemptId: a.attemptId,
      score: a.score,
      status: a.status,
      createdAt: a.createdAt,
      questionCount: a.questions ? JSON.parse(a.questions).length : 0,
      post: postsByAttempt.get(a.attemptId) ?? null,
    })),
  }));

  const doneAttempts = attempts.filter((a) => a.status === "done");
  const passed = doneAttempts.filter((a) => (a.score ?? 0) >= 80).length;

  return c.json({
    user: {
      id: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      createdAt: targetUser.createdAt,
    },
    stats: {
      totalAttempts: doneAttempts.length,
      passedAttempts: passed,
      passRate: doneAttempts.length > 0 ? Math.round((passed / doneAttempts.length) * 100) : null,
      repos: repos.map((r) => r.repoFullName),
      weakTopics: [...new Set(weakTopics)],
    },
    history,
  });
});

export { adminRouter };
