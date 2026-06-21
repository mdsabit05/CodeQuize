import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "./db";
import * as schema from "./schema";
import type { Env } from "./env";

export function createAuth(env: Env) {
  const db = createDb(env);

  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.PUBLIC_URL,
    basePath: "/api/auth",
    trustedOrigins: [env.FRONTEND_URL, "http://localhost:20498"],
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false,
    },
    advanced: {
      cookieOptions: {
        sameSite: "none",
        secure: true,
      },
    },
  });
}
