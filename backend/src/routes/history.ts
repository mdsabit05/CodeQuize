import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { createDb } from "../db";
import { topicJob, quizGenJob, quizAttempt, postDraft, quizJob } from "../schema";
import type { Env } from "../env";
import type { Variables } from "../middleware/session";

const historyRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/history
historyRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = createDb(c.env);

  // All topic jobs for this user that have selected topics (i.e. user picked a topic)
  const topics = await db
    .select({
      topicJobId: topicJob.id,
      selectedTopics: topicJob.selectedTopics,
      createdAt: topicJob.createdAt,
      repoFullName: quizJob.repoFullName,
    })
    .from(topicJob)
    .innerJoin(quizJob, eq(topicJob.quizJobId, quizJob.id))
    .where(and(eq(topicJob.userId, user.id)))
    .orderBy(desc(topicJob.createdAt));

  // All quiz attempts with their questions
  const attempts = await db
    .select({
      attemptId: quizAttempt.id,
      topicJobId: quizGenJob.topicJobId,
      score: quizAttempt.score,
      status: quizAttempt.status,
      answers: quizAttempt.answers,
      feedback: quizAttempt.feedback,
      questions: quizGenJob.questions,
      createdAt: quizAttempt.createdAt,
    })
    .from(quizAttempt)
    .innerJoin(quizGenJob, eq(quizAttempt.quizGenJobId, quizGenJob.id))
    .where(eq(quizAttempt.userId, user.id))
    .orderBy(desc(quizAttempt.createdAt));

  // All post drafts
  const posts = await db
    .select({
      attemptId: postDraft.attemptId,
      status: postDraft.status,
      blogTitle: postDraft.blogTitle,
      blogSlug: postDraft.blogSlug,
      linkedinBody: postDraft.linkedinBody,
      twitterBody: postDraft.twitterBody,
      publishedAt: postDraft.publishedAt,
    })
    .from(postDraft)
    .where(eq(postDraft.userId, user.id));

  const postsByAttempt = new Map(posts.map((p) => [p.attemptId, p]));
  const attemptsByTopic = new Map<string, typeof attempts>();
  for (const a of attempts) {
    if (!attemptsByTopic.has(a.topicJobId)) attemptsByTopic.set(a.topicJobId, []);
    attemptsByTopic.get(a.topicJobId)!.push(a);
  }

  const history = topics
    .filter((t) => t.selectedTopics)
    .map((t) => ({
      topicJobId: t.topicJobId,
      topics: t.selectedTopics ? JSON.parse(t.selectedTopics) as string[] : [],
      repoFullName: t.repoFullName,
      createdAt: t.createdAt,
      attempts: (attemptsByTopic.get(t.topicJobId) ?? []).map((a) => ({
        attemptId: a.attemptId,
        score: a.score,
        status: a.status,
        createdAt: a.createdAt,
        questions: a.questions ? JSON.parse(a.questions) : [],
        answers: a.answers ? JSON.parse(a.answers) : [],
        feedback: a.feedback ? JSON.parse(a.feedback) : [],
        post: postsByAttempt.get(a.attemptId) ?? null,
      })),
    }));

  return c.json(history);
});

export { historyRouter };
