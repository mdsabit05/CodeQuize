import { Hono } from "hono";
import { cors } from "hono/cors";
import { sessionMiddleware } from "./middleware/session";
import { authRouter } from "./routes/auth";
import { userRouter } from "./routes/user";
import { githubRouter } from "./routes/github";
import { quizRouter } from "./routes/quiz";
import { topicRouter } from "./routes/topic";
import { quizGenRouter } from "./routes/quiz-gen";
import { learningRouter } from "./routes/learning";
import { postsRouter } from "./routes/posts";
import { socialRouter } from "./routes/social";
import { historyRouter } from "./routes/history";
import { adminRouter } from "./routes/admin";
import { handleQueue } from "./queue";
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
app.route("/api/github", githubRouter);
app.route("/api/quiz", quizRouter);
app.route("/api/topic", topicRouter);
app.route("/api/quiz-gen", quizGenRouter);
app.route("/api/learning", learningRouter);
app.route("/api/posts", postsRouter);
app.route("/api/social", socialRouter);
app.route("/api/history", historyRouter);
app.route("/api/admin", adminRouter);

// SPA fallback — serve index.html for all non-API routes (production only)
app.get("*", async (c) => {
  if (c.env.ASSETS) {
    const url = new URL(c.req.url);
    url.pathname = "/";
    return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
  }
  return c.notFound();
});

export default {
  fetch: app.fetch,
  queue: handleQueue,
};
