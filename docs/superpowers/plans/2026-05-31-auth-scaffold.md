# Auth Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold a full-stack app with email/password auth using better-auth, D1, Drizzle on the backend and Vite/TanStack Router/shadcn on the frontend.

**Architecture:** Monorepo with `backend/` (Cloudflare Worker + Hono) and `frontend/` (Vite + React). better-auth owns its own DB tables via its CLI-generated Drizzle schema. Each API route checks session and scopes data to the authenticated user.

**Tech Stack:** Cloudflare Worker, Hono, D1, Drizzle ORM, better-auth, Vite, React, TanStack Router, TanStack Query, axios, shadcn UI

---

## File Map

### Backend (`backend/`)
- `wrangler.toml` — Worker config, D1 binding
- `package.json` — backend deps
- `tsconfig.json` — TS config
- `drizzle.config.ts` — Drizzle Kit config pointing at better-auth schema
- `src/auth.ts` — better-auth instance (email/password plugin, D1 adapter)
- `src/db.ts` — Drizzle client factory (takes D1 binding from env)
- `src/middleware/auth.ts` — Hono middleware: reads session, sets `c.var.user`
- `src/routes/auth.ts` — mounts better-auth handler at `/api/auth/*`
- `src/routes/user.ts` — protected `/api/me` route
- `src/index.ts` — app entry, wires CORS + middleware + routes
- `src/env.ts` — Cloudflare env type

### Frontend (`frontend/`)
- `package.json` — frontend deps
- `vite.config.ts` — Vite + TanStack Router plugin + path alias
- `tsconfig.json` / `tsconfig.app.json` — TS + path alias
- `components.json` — shadcn config
- `src/main.tsx` — app entry, RouterProvider
- `src/router.ts` — router instance + type registration
- `src/lib/auth-client.ts` — better-auth `createAuthClient`
- `src/lib/axios.ts` — axios instance (baseURL from env)
- `src/routes/__root.tsx` — root layout, injects auth context
- `src/routes/index.tsx` — home page, redirects to /dashboard or /login
- `src/routes/login.tsx` — login page
- `src/routes/register.tsx` — register page
- `src/routes/_authenticated.tsx` — layout: redirects to /login if no session
- `src/routes/_authenticated/dashboard.tsx` — protected dashboard

---

## Task 1: Backend — Init project

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/wrangler.toml`

- [ ] **Step 1: Create backend directory and package.json**

```bash
mkdir -p backend
cd backend
npm init -y
```

- [ ] **Step 2: Install backend dependencies**

```bash
cd backend
npm install hono better-auth drizzle-orm @cloudflare/workers-types
npm install -D wrangler drizzle-kit typescript
```

- [ ] **Step 3: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*", "drizzle.config.ts"]
}
```

- [ ] **Step 4: Create `backend/wrangler.toml`**

```toml
name = "app-backend"
main = "src/index.ts"
compatibility_date = "2024-12-19"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "app-db"
database_id = "local"
migrations_dir = "migrations"
```

- [ ] **Step 5: Commit**

```bash
cd backend
git add .
git commit -m "feat: init backend package"
```

---

## Task 2: Backend — DB + auth setup

**Files:**
- Create: `backend/src/env.ts`
- Create: `backend/src/db.ts`
- Create: `backend/src/auth.ts`
- Create: `backend/drizzle.config.ts`

- [ ] **Step 1: Create `backend/src/env.ts`**

```typescript
export type Env = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  FRONTEND_URL: string;
};
```

- [ ] **Step 2: Create `backend/src/db.ts`**

```typescript
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "./env";

export function createDb(env: Env) {
  return drizzle(env.DB);
}

export type Db = ReturnType<typeof createDb>;
```

- [ ] **Step 3: Create `backend/src/auth.ts`**

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailAndPassword } from "better-auth/plugins";
import { createDb } from "./db";
import type { Env } from "./env";

export function createAuth(env: Env) {
  const db = createDb(env);

  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: "http://localhost:8787",
    basePath: "/api/auth",
    trustedOrigins: [env.FRONTEND_URL, "http://localhost:5173"],
    plugins: [
      emailAndPassword({
        enabled: true,
        autoSignIn: true,
        requireEmailVerification: false,
      }),
    ],
  });
}
```

- [ ] **Step 4: Create `backend/drizzle.config.ts`**

```typescript
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  driver: "d1-http",
} satisfies Config;
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/env.ts backend/src/db.ts backend/src/auth.ts backend/drizzle.config.ts
git commit -m "feat: add backend db and auth setup"
```

---

## Task 3: Backend — Generate schema + migrations

**Files:**
- Create: `backend/src/schema.ts` (generated by better-auth CLI)
- Create: `backend/migrations/` (generated by drizzle-kit)

- [ ] **Step 1: Generate better-auth schema**

```bash
cd backend
npx @better-auth/cli@latest generate --config src/auth.ts --output src/schema.ts -y
```

Expected: `src/schema.ts` created with `user`, `session`, `account`, `verification` tables.

- [ ] **Step 2: Generate Drizzle migrations**

```bash
cd backend
npx drizzle-kit generate
```

Expected: `migrations/0000_*.sql` created.

- [ ] **Step 3: Create local D1 and apply migrations**

```bash
cd backend
npx wrangler d1 create app-db --local 2>/dev/null || true
npx wrangler d1 migrations apply app-db --local
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/schema.ts backend/migrations backend/drizzle.config.ts
git commit -m "feat: add better-auth schema and d1 migrations"
```

---

## Task 4: Backend — Hono app + middleware + routes

**Files:**
- Create: `backend/src/middleware/session.ts`
- Create: `backend/src/routes/auth.ts`
- Create: `backend/src/routes/user.ts`
- Create: `backend/src/index.ts`

- [ ] **Step 1: Create `backend/src/middleware/session.ts`**

```typescript
import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";
import type { Env } from "../env";

type Variables = {
  user: { id: string; email: string; name: string } | null;
  session: { id: string } | null;
};

export const sessionMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const auth = createAuth(c.env);
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", result?.user ?? null);
  c.set("session", result?.session ?? null);
  await next();
});
```

- [ ] **Step 2: Create `backend/src/routes/auth.ts`**

```typescript
import { Hono } from "hono";
import { createAuth } from "../auth";
import type { Env } from "../env";

const authRouter = new Hono<{ Bindings: Env }>();

authRouter.on(["GET", "POST"], "/*", (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

export { authRouter };
```

- [ ] **Step 3: Create `backend/src/routes/user.ts`**

```typescript
import { Hono } from "hono";
import type { Env } from "../env";

type Variables = {
  user: { id: string; email: string; name: string } | null;
  session: { id: string } | null;
};

const userRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

userRouter.get("/me", (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ user });
});

export { userRouter };
```

- [ ] **Step 4: Create `backend/src/index.ts`**

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sessionMiddleware } from "./middleware/session";
import { authRouter } from "./routes/auth";
import { userRouter } from "./routes/user";
import type { Env } from "./env";

type Variables = {
  user: { id: string; email: string; name: string } | null;
  session: { id: string } | null;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = [
        c.env.FRONTEND_URL,
        "http://localhost:5173",
      ].filter(Boolean);
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

export default app;
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/
git commit -m "feat: add hono app with auth routes and session middleware"
```

---

## Task 5: Frontend — Init project

**Files:**
- Create: `frontend/` (Vite scaffold)
- Modify: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`, `frontend/tsconfig.app.json`

- [ ] **Step 1: Scaffold Vite + React + TS**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

- [ ] **Step 2: Install frontend dependencies**

```bash
cd frontend
npm install @tanstack/react-router @tanstack/react-query axios better-auth
npm install -D @tanstack/router-plugin
```

- [ ] **Step 3: Update `frontend/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "path";

export default defineConfig({
  plugins: [TanStackRouterVite({ routesDirectory: "./src/routes" }), react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 4: Update `frontend/tsconfig.app.json` paths**

Add inside `compilerOptions`:
```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

- [ ] **Step 5: Install shadcn**

```bash
cd frontend
npx shadcn@latest init --defaults
npx shadcn@latest add button input card label form
```

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: init frontend with vite, tanstack router, shadcn"
```

---

## Task 6: Frontend — Auth client + axios

**Files:**
- Create: `frontend/src/lib/auth-client.ts`
- Create: `frontend/src/lib/axios.ts`
- Create: `frontend/.env.local`

- [ ] **Step 1: Create `frontend/.env.local`**

```
VITE_API_URL=http://localhost:8787
```

- [ ] **Step 2: Create `frontend/src/lib/auth-client.ts`**

```typescript
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL,
});
```

- [ ] **Step 3: Create `frontend/src/lib/axios.ts`**

```typescript
import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/ frontend/.env.local
git commit -m "feat: add auth client and axios instance"
```

---

## Task 7: Frontend — Routes

**Files:**
- Create: `frontend/src/routes/__root.tsx`
- Create: `frontend/src/routes/index.tsx`
- Create: `frontend/src/routes/login.tsx`
- Create: `frontend/src/routes/register.tsx`
- Create: `frontend/src/routes/_authenticated.tsx`
- Create: `frontend/src/routes/_authenticated/dashboard.tsx`
- Create: `frontend/src/router.ts`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Create `frontend/src/routes/__root.tsx`**

```typescript
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { Session } from "better-auth";

type RouterContext = {
  session: Session | null;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});
```

- [ ] **Step 2: Create `frontend/src/routes/index.tsx`**

```typescript
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.session) {
      throw redirect({ to: "/dashboard" });
    } else {
      throw redirect({ to: "/login" });
    }
  },
});
```

- [ ] **Step 3: Create `frontend/src/routes/login.tsx`**

```typescript
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: err } = await authClient.signIn.email({ email, password });

    if (err) {
      setError(err.message ?? "Sign in failed");
      setLoading(false);
      return;
    }

    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Enter your email and password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-sm text-center text-gray-600">
              No account?{" "}
              <Link to="/register" className="underline">
                Register
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/routes/register.tsx`**

```typescript
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: err } = await authClient.signUp.email({ name, email, password });

    if (err) {
      setError(err.message ?? "Sign up failed");
      setLoading(false);
      return;
    }

    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Sign up with your email and password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
            </Button>
            <p className="text-sm text-center text-gray-600">
              Already have an account?{" "}
              <Link to="/login" className="underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Create `frontend/src/routes/_authenticated.tsx`**

```typescript
import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  async function handleSignOut() {
    await authClient.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex justify-between items-center">
        <span className="font-semibold">App</span>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          Sign out
        </Button>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Create `frontend/src/routes/_authenticated/dashboard.tsx`**

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get("/api/me").then((r) => r.data),
  });

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <div className="space-y-1 text-sm">
              <p><span className="font-medium">Name:</span> {data?.user?.name}</p>
              <p><span className="font-medium">Email:</span> {data?.user?.email}</p>
              <p><span className="font-medium">ID:</span> {data?.user?.id}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Create `frontend/src/router.ts`**

```typescript
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { Session } from "better-auth";

export const router = createRouter({
  routeTree,
  context: { session: null as Session | null },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 8: Replace `frontend/src/main.tsx`**

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "./router";
import { authClient } from "./lib/auth-client";

const queryClient = new QueryClient();

async function main() {
  const { data: session } = await authClient.getSession();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} context={{ session }} />
      </QueryClientProvider>
    </React.StrictMode>
  );
}

main();
```

- [ ] **Step 9: Remove Vite default files**

Delete `src/App.tsx`, `src/App.css`, `src/assets/react.svg` if they exist. Update `src/index.css` to only contain Tailwind imports.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/
git commit -m "feat: add tanstack router routes for login, register, dashboard"
```

---

## Self-Review

| Spec requirement | Covered by |
|---|---|
| Vite frontend | Task 5 |
| TanStack Router | Tasks 5, 7 |
| TanStack Query | Task 7 (dashboard query) |
| axios (frontend only) | Task 6 |
| shadcn UI | Task 5 |
| Cloudflare Worker + Hono | Task 4 |
| D1 + Drizzle | Tasks 2, 3 |
| better-auth email/password | Tasks 2, 3 |
| better-auth owns its own tables | Task 3 (CLI generate) |
| User data isolation | Task 4 (`/api/me` scoped by session) |
| Protected routes | Task 7 (`_authenticated.tsx`) |
| Login page | Task 7 |
| Register page | Task 7 |
| Logout | Task 7 (`_authenticated.tsx` header) |
