import { drizzle } from "drizzle-orm/d1";
import type { Env } from "./env";

export function createDb(env: Env) {
  return drizzle(env.DB);
}

export type Db = ReturnType<typeof createDb>;
