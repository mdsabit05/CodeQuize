# GitHub OAuth Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in user connect their GitHub account via OAuth App (public repos, read-only), pick which repos to share, and fetch recent commits on demand — raw source code is never stored.

**Architecture:** Backend handles the full OAuth dance (connect URL, callback, token exchange, GitHub API calls) so the access token never reaches the browser. Frontend redirects to GitHub, receives the callback via backend, then shows a repo picker. Selected repos are stored in D1; code is read live when needed and immediately discarded.

**Tech Stack:** Cloudflare Worker, Hono, D1, Drizzle ORM, GitHub OAuth App, Vite, React, TanStack Router, TanStack Query, axios, shadcn UI

---

## File Map

### Backend
- Modify: `backend/src/schema.ts` — add `oauthState`, `githubConnection`, `githubSelectedRepo` tables
- Modify: `backend/src/env.ts` — add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI`
- Modify: `backend/.dev.vars` — add github env var values
- Create: `backend/src/routes/github.ts` — all 8 github routes
- Modify: `backend/src/index.ts` — mount githubRouter at `/api/github`
- Run: `drizzle-kit generate` + `wrangler d1 migrations apply` after schema change

### Frontend
- Modify: `frontend/src/routes/_authenticated/dashboard.tsx` — add GitHub connect section
- Create: `frontend/src/routes/_authenticated/github/repos.tsx` — repo picker page

---

## Task 1: Add GitHub tables to schema + migrate

**Files:**
- Modify: `backend/src/schema.ts`

- [ ] **Step 1: Add 3 new tables to `backend/src/schema.ts`**

Append to the end of the file (keep all existing tables exactly as-is):

```typescript
export const oauthState = sqliteTable("oauth_state", {
  id: text("id").primaryKey(), // the state string itself
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export const githubConnection = sqliteTable("github_connection", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  githubUserId: text("github_user_id").notNull(),
  githubUsername: text("github_username").notNull(),
  accessToken: text("access_token").notNull(),
  connectedAt: integer("connected_at", { mode: "timestamp" }).notNull(),
});

export const githubSelectedRepo = sqliteTable("github_selected_repo", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  repoId: text("repo_id").notNull(),
  repoName: text("repo_name").notNull(),
  repoFullName: text("repo_full_name").notNull(),
  selectedAt: integer("selected_at", { mode: "timestamp" }).notNull(),
});
```

- [ ] **Step 2: Generate migration**

```bash
cd backend
npx drizzle-kit generate
```

Expected: new file in `migrations/` e.g. `0001_github_tables.sql`

- [ ] **Step 3: Apply migration locally**

```bash
cd backend
npx wrangler d1 migrations apply app-db --local
```

Expected:
```
┌──────────────────────┬────────┐
│ name                 │ status │
├──────────────────────┼────────┤
│ 0001_...sql          │ ✅     │
└──────────────────────┴────────┘
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/schema.ts backend/migrations/
git commit -m "feat: add github oauth tables to schema"
```

---

## Task 2: Update env types + dev vars

**Files:**
- Modify: `backend/src/env.ts`
- Modify: `backend/.dev.vars`

- [ ] **Step 1: Update `backend/src/env.ts`**

```typescript
export type Env = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  FRONTEND_URL: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI: string;
};
```

- [ ] **Step 2: Update `backend/.dev.vars`**

```
BETTER_AUTH_SECRET=change-me-to-a-long-random-secret
FRONTEND_URL=http://localhost:20498
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here
GITHUB_REDIRECT_URI=http://localhost:15638/api/github/callback
```

> Note: `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` come from your GitHub OAuth App settings at github.com/settings/developers. Create an OAuth App there first:
> - Homepage URL: `http://localhost:20498`
> - Callback URL: `http://localhost:15638/api/github/callback`
> - Permissions: `public_repo` (read-only)

- [ ] **Step 3: Commit**

```bash
git add backend/src/env.ts backend/.dev.vars
git commit -m "feat: add github oauth env vars"
```

---

## Task 3: Create GitHub router (backend)

**Files:**
- Create: `backend/src/routes/github.ts`

- [ ] **Step 1: Create `backend/src/routes/github.ts`**

```typescript
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import {
  oauthState,
  githubConnection,
  githubSelectedRepo,
} from "../schema";
import type { Env } from "../env";
import type { Variables } from "../middleware/session";

const githubRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

function randomId(): string {
  return crypto.randomUUID();
}

// GET /api/github/connect
// Returns the GitHub OAuth URL — frontend redirects to it
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
// Exchanges code for token, stores connection, redirects to frontend
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
  const tokenRes = await fetch(
    "https://github.com/login/oauth/access_token",
    {
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
    }
  );

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

  // Upsert github_connection (replace if already connected)
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
// Returns { connected: true, username } or { connected: false }
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
// Fetches public repos from GitHub API live — nothing stored
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

  // Return only public repos — filter private as safety net
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
// Returns repos the user has chosen in our app
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
// Replaces existing selection entirely
githubRouter.post("/repos/select", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json<{
    repos: { repoId: string; repoName: string; repoFullName: string }[];
  }>();

  const db = createDb(c.env);

  // Delete all existing selections for this user
  await db
    .delete(githubSelectedRepo)
    .where(eq(githubSelectedRepo.userId, user.id));

  // Insert new selections
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
// Removes connection and all selected repos for this user
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
// Fetches recent commits live from GitHub — raw code is NEVER stored
githubRouter.get("/repos/:owner/:repo/commits", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");

  const db = createDb(c.env);

  // Verify user has selected this repo
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

  // Return only metadata — no file contents, no code, no diffs
  const safe = commits.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    date: c.commit.author.date,
    author: c.author?.login ?? "unknown",
  }));

  return c.json({ commits: safe });
});

export { githubRouter };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/github.ts
git commit -m "feat: add github oauth routes"
```

---

## Task 4: Mount GitHub router in index.ts

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Update `backend/src/index.ts`**

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sessionMiddleware } from "./middleware/session";
import { authRouter } from "./routes/auth";
import { userRouter } from "./routes/user";
import { githubRouter } from "./routes/github";
import type { Env } from "./env";
import type { Variables } from "./middleware/session";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = [c.env.FRONTEND_URL, "http://localhost:20498"].filter(
        Boolean
      );
      return allowed.includes(origin) ? origin : null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use("*", sessionMiddleware);

app.route("/api/auth", authRouter);
app.route("/api", userRouter);
app.route("/api/github", githubRouter);

export default app;
```

- [ ] **Step 2: Verify wrangler compiles cleanly**

```bash
cd backend
npx wrangler dev --dry-run 2>&1 | grep -E "error|Error|Ready"
```

Expected: no errors printed

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: mount github router"
```

---

## Task 5: Update dashboard with GitHub connect section

**Files:**
- Modify: `frontend/src/routes/_authenticated/dashboard.tsx`

- [ ] **Step 1: Rewrite `frontend/src/routes/_authenticated/dashboard.tsx`**

```typescript
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get("/api/me").then((r) => r.data),
  });

  const { data: ghStatus, isLoading: ghLoading } = useQuery({
    queryKey: ["github-status"],
    queryFn: () => api.get("/api/github/status").then((r) => r.data),
  });

  const { data: selectedRepos } = useQuery({
    queryKey: ["github-selected"],
    queryFn: () => api.get("/api/github/repos/selected").then((r) => r.data),
    enabled: ghStatus?.connected === true,
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete("/api/github/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
      queryClient.invalidateQueries({ queryKey: ["github-selected"] });
    },
  });

  async function handleConnect() {
    const { data } = await api.get("/api/github/connect");
    window.location.href = data.url;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {!meLoading && (
        <div>
          <h1 className="text-2xl font-semibold">
            Welcome back, {me?.user?.name}!
          </h1>
          <p className="text-sm text-muted-foreground">
            You're signed in as {me?.user?.email}
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>GitHub</CardTitle>
        </CardHeader>
        <CardContent>
          {ghLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : ghStatus?.connected ? (
            <div className="space-y-3">
              <p className="text-sm">
                Connected as{" "}
                <span className="font-medium">@{ghStatus.username}</span>
              </p>
              {selectedRepos?.repos?.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Selected repos:</p>
                  {selectedRepos.repos.map(
                    (r: { repoId: string; repoFullName: string }) => (
                      <div
                        key={r.repoId}
                        className="flex items-center justify-between text-sm border rounded px-3 py-2"
                      >
                        <span>{r.repoFullName}</span>
                        <Button
                          size="sm"
                          onClick={() =>
                            navigate({
                              to: "/github/repos/$owner/$repo/start",
                              params: {
                                owner: r.repoFullName.split("/")[0],
                                repo: r.repoFullName.split("/")[1],
                              },
                            })
                          }
                        >
                          Start
                        </Button>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No repos selected yet.
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate({ to: "/github/repos" })}
                >
                  Manage repos
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Connect your GitHub to get started.
              </p>
              <Button size="sm" onClick={handleConnect}>
                Connect GitHub
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/routes/_authenticated/dashboard.tsx
git commit -m "feat: add github connect section to dashboard"
```

---

## Task 6: Create repo picker page

**Files:**
- Create: `frontend/src/routes/_authenticated/github/repos.tsx`

- [ ] **Step 1: Create directory**

```bash
mkdir -p frontend/src/routes/_authenticated/github
```

- [ ] **Step 2: Create `frontend/src/routes/_authenticated/github/repos.tsx`**

```typescript
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@/lib/axios";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/github/repos")({
  component: RepoPickerPage,
});

type Repo = {
  repoId: string;
  repoName: string;
  repoFullName: string;
};

function RepoPickerPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: reposData, isLoading } = useQuery({
    queryKey: ["github-repos"],
    queryFn: () => api.get("/api/github/repos").then((r) => r.data),
  });

  const { data: savedData } = useQuery({
    queryKey: ["github-selected"],
    queryFn: () => api.get("/api/github/repos/selected").then((r) => r.data),
  });

  // Pre-check already saved repos
  useEffect(() => {
    if (savedData?.repos) {
      setSelected(new Set(savedData.repos.map((r: Repo) => r.repoId)));
    }
  }, [savedData]);

  const saveMutation = useMutation({
    mutationFn: (repos: Repo[]) =>
      api.post("/api/github/repos/select", { repos }),
    onSuccess: () => navigate({ to: "/dashboard" }),
  });

  function toggle(repo: Repo) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(repo.repoId)) {
        next.delete(repo.repoId);
      } else {
        next.add(repo.repoId);
      }
      return next;
    });
  }

  function handleSave() {
    const repos = (reposData?.repos ?? []).filter((r: Repo) =>
      selected.has(r.repoId)
    );
    saveMutation.mutate(repos);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Choose repos to share</CardTitle>
          <CardDescription>
            Only public repos are shown. Select the ones you want to use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading repos…</p>
          ) : reposData?.repos?.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No public repos found.
            </p>
          ) : (
            reposData?.repos?.map((repo: Repo) => (
              <label
                key={repo.repoId}
                className="flex items-center gap-3 border rounded px-3 py-2 cursor-pointer hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(repo.repoId)}
                  onChange={() => toggle(repo)}
                  className="h-4 w-4"
                />
                <span className="text-sm">{repo.repoFullName}</span>
              </label>
            ))
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : "Save selection"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate({ to: "/dashboard" })}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Verify frontend builds**

```bash
cd frontend
npm run build 2>&1 | tail -5
```

Expected: `✓ built in ...`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/_authenticated/github/
git commit -m "feat: add github repo picker page"
```

---

## Self-Review

| Spec requirement | Covered by |
|---|---|
| OAuth App (not GitHub App) | Task 3 — `github.com/login/oauth/authorize` |
| `public_repo` scope only | Task 3 — `scope: "public_repo"` |
| No private repos | Task 3 — `filter((r) => !r.private)` safety net |
| No webhooks | On-demand fetch in commits route only |
| State param CSRF protection | Task 3 — oauthState table, validated on callback |
| Access token never in frontend | Task 3 — stored in D1, never returned to browser |
| Raw code never stored | Task 3 — commits route returns metadata only |
| Two-step repo selection | Tasks 5+6 — GitHub selects, user picks in our UI |
| Disconnect | Task 3 — DELETE /api/github/disconnect |
| Dashboard connect button | Task 5 |
| Repo picker page | Task 6 |
| On-demand commit fetch | Task 3 — GET /api/github/repos/:owner/:repo/commits |
