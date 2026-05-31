import { Hono } from "hono";
import { cors } from "hono/cors";
import { sessionMiddleware } from "./middleware/session";
import { authRouter } from "./routes/auth";
import { userRouter } from "./routes/user";
import type { Env } from "./env";
import type { Variables } from "./middleware/session";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = [c.env.FRONTEND_URL, "http://localhost:5173"].filter(
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

export default app;
