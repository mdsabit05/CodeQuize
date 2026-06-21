import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import { linkedinConnection, twitterConnection, socialOauthState } from "../schema";
import type { Env } from "../env";
import type { Variables } from "../middleware/session";

const socialRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/social/status
socialRouter.get("/status", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = createDb(c.env);
  const [li] = await db.select({ id: linkedinConnection.id }).from(linkedinConnection).where(eq(linkedinConnection.userId, user.id)).limit(1);
  const [tw] = await db.select({ id: twitterConnection.id }).from(twitterConnection).where(eq(twitterConnection.userId, user.id)).limit(1);

  return c.json({ linkedin: !!li, twitter: !!tw });
});

// GET /api/social/linkedin/connect?returnUrl=...
socialRouter.get("/linkedin/connect", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const returnUrl = c.req.query("returnUrl") ?? "/dashboard";
  const state = crypto.randomUUID();
  const db = createDb(c.env);

  await db.insert(socialOauthState).values({
    id: state,
    userId: user.id,
    platform: "linkedin",
    returnUrl,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    createdAt: new Date(),
  });

  const origin = c.env.PUBLIC_URL;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: c.env.LINKEDIN_CLIENT_ID,
    redirect_uri: `${origin}/api/social/linkedin/callback`,
    scope: "w_member_social openid profile",
    state,
  });

  return c.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params}`);
});

// GET /api/social/linkedin/callback
socialRouter.get("/linkedin/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.text("Missing code or state", 400);

  const db = createDb(c.env);
  const [row] = await db.select().from(socialOauthState).where(
    and(eq(socialOauthState.id, state), eq(socialOauthState.platform, "linkedin"))
  ).limit(1);

  if (!row || row.expiresAt < new Date()) return c.text("Invalid or expired state", 400);
  await db.delete(socialOauthState).where(eq(socialOauthState.id, state));

  const origin = c.env.PUBLIC_URL;
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: c.env.LINKEDIN_CLIENT_ID,
      client_secret: c.env.LINKEDIN_CLIENT_SECRET,
      redirect_uri: `${origin}/api/social/linkedin/callback`,
    }),
  });
  if (!tokenRes.ok) return c.text(`LinkedIn token error: ${await tokenRes.text()}`, 500);

  const { access_token } = await tokenRes.json<{ access_token: string }>();

  // Get LinkedIn user ID via OpenID userinfo
  const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const { sub: linkedinUserId } = await userRes.json<{ sub: string }>();

  await db.insert(linkedinConnection).values({
    id: crypto.randomUUID(),
    userId: row.userId,
    accessToken: access_token,
    linkedinUserId,
    connectedAt: new Date(),
  }).onConflictDoUpdate({
    target: linkedinConnection.userId,
    set: { accessToken: access_token, linkedinUserId, connectedAt: new Date() },
  });

  const frontendUrl = c.env.FRONTEND_URL.replace("http://localhost:5173", origin);
  return c.redirect(`${origin}${row.returnUrl ?? "/dashboard"}`);
});

// GET /api/social/twitter/connect?returnUrl=...
socialRouter.get("/twitter/connect", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const returnUrl = c.req.query("returnUrl") ?? "/dashboard";

  // Generate PKCE code_verifier and code_challenge
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = btoa(String.fromCharCode(...array)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const state = crypto.randomUUID();
  const db = createDb(c.env);

  await db.insert(socialOauthState).values({
    id: state,
    userId: user.id,
    platform: "twitter",
    codeVerifier,
    returnUrl,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    createdAt: new Date(),
  });

  const origin = c.env.PUBLIC_URL;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: c.env.TWITTER_CLIENT_ID,
    redirect_uri: `${origin}/api/social/twitter/callback`,
    scope: "tweet.write users.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return c.redirect(`https://twitter.com/i/oauth2/authorize?${params}`);
});

// GET /api/social/twitter/callback
socialRouter.get("/twitter/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.text("Missing code or state", 400);

  const db = createDb(c.env);
  const [row] = await db.select().from(socialOauthState).where(
    and(eq(socialOauthState.id, state), eq(socialOauthState.platform, "twitter"))
  ).limit(1);

  if (!row || row.expiresAt < new Date()) return c.text("Invalid or expired state", 400);
  await db.delete(socialOauthState).where(eq(socialOauthState.id, state));

  const origin = c.env.PUBLIC_URL;
  const credentials = btoa(`${c.env.TWITTER_CLIENT_ID}:${c.env.TWITTER_CLIENT_SECRET}`);
  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/api/social/twitter/callback`,
      code_verifier: row.codeVerifier ?? "",
    }),
  });
  if (!tokenRes.ok) return c.text(`Twitter token error: ${await tokenRes.text()}`, 500);

  const { access_token, refresh_token } = await tokenRes.json<{ access_token: string; refresh_token?: string }>();

  const userRes = await fetch("https://api.twitter.com/2/users/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const { data: { id: twitterUserId } } = await userRes.json<{ data: { id: string } }>();

  await db.insert(twitterConnection).values({
    id: crypto.randomUUID(),
    userId: row.userId,
    accessToken: access_token,
    refreshToken: refresh_token ?? null,
    twitterUserId,
    connectedAt: new Date(),
  }).onConflictDoUpdate({
    target: twitterConnection.userId,
    set: { accessToken: access_token, refreshToken: refresh_token ?? null, twitterUserId, connectedAt: new Date() },
  });

  return c.redirect(`${origin}${row.returnUrl ?? "/dashboard"}`);
});

export { socialRouter };
