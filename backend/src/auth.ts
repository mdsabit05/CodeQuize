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
