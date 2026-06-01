import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import { oauthState, githubConnection, githubSelectedRepo } from "../schema";
import type { Env } from "../env";
import type { Variables } from "../middleware/session";

const githubRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

function randomId(): string {
  return crypto.randomUUID();
}

// GET /api/github/connect
// Returns GitHub OAuth URL — frontend redirects to it
githubRouter.get("/connect", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = createDb(c.env);
  const state = randomId();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await db.insert(oauthState).values({
    id: state,
    userId: user.id,
    expiresAt,
  });

  const params = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID,
    scope: "public_repo",
    state,
    redirect_uri: c.env.GITHUB_REDIRECT_URI,
  });

  const url = `https://github.com/login/oauth/authorize?${params}`;
  return c.json({ url });
});

// GET /api/github/callback?code=&state=
// GitHub redirects here after user authorizes
githubRouter.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.redirect(`${c.env.FRONTEND_URL}/dashboard?github=error`);
  }

  const db = createDb(c.env);

  // Validate state (CSRF check)
  const [storedState] = await db
    .select()
    .from(oauthState)
    .where(eq(oauthState.id, state))
    .limit(1);

  if (!storedState || storedState.expiresAt < new Date()) {
    return c.redirect(`${c.env.FRONTEND_URL}/dashboard?github=error`);
  }

  // Delete used state immediately
  await db.delete(oauthState).where(eq(oauthState.id, state));

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: c.env.GITHUB_REDIRECT_URI,
    }),
  });

  const tokenData = await tokenRes.json<{
    access_token?: string;
    error?: string;
  }>();

  if (!tokenData.access_token) {
    return c.redirect(`${c.env.FRONTEND_URL}/dashboard?github=error`);
  }

  // Fetch GitHub user info
  const ghUserRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "app-backend",
    },
  });

  const ghUser = await ghUserRes.json<{ id: number; login: string }>();

  // Replace existing connection if any
  await db
    .delete(githubConnection)
    .where(eq(githubConnection.userId, storedState.userId));

  await db.insert(githubConnection).values({
    id: randomId(),
    userId: storedState.userId,
    githubUserId: String(ghUser.id),
    githubUsername: ghUser.login,
    accessToken: tokenData.access_token,
    connectedAt: new Date(),
  });

  return c.redirect(`${c.env.FRONTEND_URL}/github/repos`);
});

// GET /api/github/status
githubRouter.get("/status", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = createDb(c.env);
  const [conn] = await db
    .select()
    .from(githubConnection)
    .where(eq(githubConnection.userId, user.id))
    .limit(1);

  if (!conn) return c.json({ connected: false });
  return c.json({ connected: true, username: conn.githubUsername });
});

// GET /api/github/repos
// Fetches public repos live — nothing stored
githubRouter.get("/repos", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = createDb(c.env);
  const [conn] = await db
    .select()
    .from(githubConnection)
    .where(eq(githubConnection.userId, user.id))
    .limit(1);

  if (!conn) return c.json({ error: "Not connected" }, 400);

  const res = await fetch(
    "https://api.github.com/user/repos?visibility=public&per_page=100&sort=updated",
    {
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "User-Agent": "app-backend",
      },
    }
  );

  const repos = await res.json<
    { id: number; name: string; full_name: string; private: boolean }[]
  >();

  const publicRepos = repos
    .filter((r) => !r.private)
    .map((r) => ({
      repoId: String(r.id),
      repoName: r.name,
      repoFullName: r.full_name,
    }));

  return c.json({ repos: publicRepos });
});

// GET /api/github/repos/selected
githubRouter.get("/repos/selected", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = createDb(c.env);
  const rows = await db
    .select()
    .from(githubSelectedRepo)
    .where(eq(githubSelectedRepo.userId, user.id));

  return c.json({ repos: rows });
});

// POST /api/github/repos/select
// Body: { repos: [{ repoId, repoName, repoFullName }] }
githubRouter.post("/repos/select", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json<{
    repos: { repoId: string; repoName: string; repoFullName: string }[];
  }>();

  const db = createDb(c.env);

  await db
    .delete(githubSelectedRepo)
    .where(eq(githubSelectedRepo.userId, user.id));

  if (body.repos.length > 0) {
    await db.insert(githubSelectedRepo).values(
      body.repos.map((r) => ({
        id: randomId(),
        userId: user.id,
        repoId: r.repoId,
        repoName: r.repoName,
        repoFullName: r.repoFullName,
        selectedAt: new Date(),
      }))
    );
  }

  return c.json({ ok: true });
});

// DELETE /api/github/disconnect
githubRouter.delete("/disconnect", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = createDb(c.env);
  await db
    .delete(githubSelectedRepo)
    .where(eq(githubSelectedRepo.userId, user.id));
  await db
    .delete(githubConnection)
    .where(eq(githubConnection.userId, user.id));

  return c.json({ ok: true });
});

// GET /api/github/repos/:owner/:repo/commits
// On-demand fetch — raw code NEVER stored
githubRouter.get("/repos/:owner/:repo/commits", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");

  const db = createDb(c.env);

  const [selected] = await db
    .select()
    .from(githubSelectedRepo)
    .where(
      and(
        eq(githubSelectedRepo.userId, user.id),
        eq(githubSelectedRepo.repoFullName, `${owner}/${repo}`)
      )
    )
    .limit(1);

  if (!selected) return c.json({ error: "Repo not selected" }, 403);

  const [conn] = await db
    .select()
    .from(githubConnection)
    .where(eq(githubConnection.userId, user.id))
    .limit(1);

  if (!conn) return c.json({ error: "Not connected" }, 400);

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits?per_page=10`,
    {
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "User-Agent": "app-backend",
      },
    }
  );

  const commits = await res.json<
    {
      sha: string;
      commit: { message: string; author: { date: string } };
      author: { login: string } | null;
    }[]
  >();

  // Metadata only — no file contents, no code, no diffs
  const safe = commits.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    date: commit.commit.author.date,
    author: commit.author?.login ?? "unknown",
  }));

  return c.json({ commits: safe });
});

export { githubRouter };
