import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";
import type { Env } from "../env";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type Variables = {
  user: SessionUser | null;
  session: { id: string; token: string } | null;
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
