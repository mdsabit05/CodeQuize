import { Hono } from "hono";
import type { Env } from "../env";
import type { Variables } from "../middleware/session";

const userRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

userRouter.get("/me", (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ user });
});

export { userRouter };
