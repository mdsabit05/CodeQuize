export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  BETTER_AUTH_SECRET: string;
  FRONTEND_URL: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI: string;
  ANTHROPIC_API_KEY: string;
  AI_GATEWAY_URL: string;
  SERPER_API_KEY: string;
  PUBLIC_URL: string;
  LINKEDIN_CLIENT_ID: string;
  LINKEDIN_CLIENT_SECRET: string;
  TWITTER_CLIENT_ID: string;
  TWITTER_CLIENT_SECRET: string;
  QUIZ_QUEUE: Queue<{ jobId: string; userId: string; repoFullName: string }>;
};
