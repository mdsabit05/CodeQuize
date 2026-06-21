import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import { postDraft, linkedinConnection, twitterConnection } from "../schema";
import type { Env } from "../env";
import type { Variables } from "../middleware/session";

const postsRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/posts/blog/:slug — public, no auth required
postsRouter.get("/blog/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = createDb(c.env);

  const [draft] = await db
    .select({
      blogTitle: postDraft.blogTitle,
      blogSlug: postDraft.blogSlug,
      blogBody: postDraft.blogBody,
      publishedAt: postDraft.publishedAt,
    })
    .from(postDraft)
    .where(and(eq(postDraft.blogSlug, slug), eq(postDraft.status, "done")))
    .limit(1);

  if (!draft || !draft.publishedAt) return c.json({ error: "Not found" }, 404);

  return c.json(draft);
});

// GET /api/posts/:attemptId
postsRouter.get("/:attemptId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const attemptId = c.req.param("attemptId");
  const db = createDb(c.env);

  const [draft] = await db
    .select()
    .from(postDraft)
    .where(and(eq(postDraft.attemptId, attemptId), eq(postDraft.userId, user.id)))
    .limit(1);

  if (!draft) return c.json({ status: "none" });

  return c.json({
    status: draft.status,
    blogTitle: draft.blogTitle,
    blogSlug: draft.blogSlug,
    blogBody: draft.blogBody,
    linkedinBody: draft.linkedinBody,
    twitterBody: draft.twitterBody,
    publishedAt: draft.publishedAt ? draft.publishedAt.toISOString() : null,
    error: draft.error,
  });
});

// PATCH /api/posts/:attemptId
postsRouter.patch("/:attemptId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const attemptId = c.req.param("attemptId");
  const body = await c.req.json<Partial<{
    blogTitle: string;
    blogSlug: string;
    blogBody: string;
    linkedinBody: string;
    twitterBody: string;
  }>>();

  if (body.blogSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.blogSlug)) {
    return c.json({ error: "Invalid slug format" }, 400);
  }
  if (body.twitterBody && body.twitterBody.length > 280) {
    return c.json({ error: "Twitter post exceeds 280 characters" }, 400);
  }

  const db = createDb(c.env);
  const updatePayload: Record<string, string | boolean> = { wasEdited: true };
  for (const key of ["blogTitle", "blogSlug", "blogBody", "linkedinBody", "twitterBody"] as const) {
    if (body[key] !== undefined) updatePayload[key] = body[key]!;
  }

  await db
    .update(postDraft)
    .set(updatePayload)
    .where(and(eq(postDraft.attemptId, attemptId), eq(postDraft.userId, user.id)));

  return c.json({ ok: true });
});

// POST /api/posts/:attemptId/share
postsRouter.post("/:attemptId/share", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const attemptId = c.req.param("attemptId");
  const { platform } = await c.req.json<{ platform: "blog" | "linkedin" | "twitter" }>();
  const db = createDb(c.env);

  const [draft] = await db
    .select()
    .from(postDraft)
    .where(and(eq(postDraft.attemptId, attemptId), eq(postDraft.userId, user.id)))
    .limit(1);

  if (!draft || draft.status !== "done") return c.json({ error: "Posts not ready" }, 400);

  const blogUrl = `${c.env.PUBLIC_URL}/blog/${draft.blogSlug}`;
  const errors: string[] = [];
  let linkedinPosted = false;
  let twitterPosted = false;

  if (platform === "blog") {
    await db.update(postDraft).set({ publishedAt: new Date() }).where(eq(postDraft.id, draft.id));
    return c.json({ blogUrl, linkedinPosted, twitterPosted, errors });
  }

  if (platform === "linkedin") {
    const [li] = await db.select().from(linkedinConnection).where(eq(linkedinConnection.userId, user.id)).limit(1);
    if (!li) return c.json({ error: "LinkedIn not connected" }, 400);
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${li.accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: `urn:li:person:${li.linkedinUserId}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: draft.linkedinBody ?? "" },
            shareMediaCategory: "NONE",
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });
    if (res.ok) linkedinPosted = true;
    else errors.push(await res.text());
    return c.json({ blogUrl, linkedinPosted, twitterPosted, errors });
  }

  if (platform === "twitter") {
    const [tw] = await db.select().from(twitterConnection).where(eq(twitterConnection.userId, user.id)).limit(1);
    if (!tw) return c.json({ error: "Twitter not connected" }, 400);
    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: { Authorization: `Bearer ${tw.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: draft.twitterBody ?? "" }),
    });
    if (res.ok) twitterPosted = true;
    else errors.push(await res.text());
    return c.json({ blogUrl, linkedinPosted, twitterPosted, errors });
  }

  return c.json({ error: "Invalid platform" }, 400);
});

export { postsRouter };
