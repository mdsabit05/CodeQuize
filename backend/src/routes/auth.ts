import { Hono } from "hono";
import { createAuth } from "../auth";
import type { Env } from "../env";

const authRouter = new Hono<{ Bindings: Env }>();

authRouter.on(["GET", "POST"], "/*", (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

export { authRouter };
