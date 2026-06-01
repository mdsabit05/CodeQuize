export type Env = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  FRONTEND_URL: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI: string;
  ANTHROPIC_API_KEY: string;
  QUIZ_QUEUE: Queue<{ jobId: string; userId: string; repoFullName: string }>;
};
