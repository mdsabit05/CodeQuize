import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const oauthState = sqliteTable("oauth_state", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export const githubConnection = sqliteTable("github_connection", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  githubUserId: text("github_user_id").notNull(),
  githubUsername: text("github_username").notNull(),
  accessToken: text("access_token").notNull(),
  connectedAt: integer("connected_at", { mode: "timestamp" }).notNull(),
});

export const githubSelectedRepo = sqliteTable("github_selected_repo", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  repoId: text("repo_id").notNull(),
  repoName: text("repo_name").notNull(),
  repoFullName: text("repo_full_name").notNull(),
  selectedAt: integer("selected_at", { mode: "timestamp" }).notNull(),
});

export const quizJob = sqliteTable("quiz_job", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  repoFullName: text("repo_full_name").notNull(),
  status: text("status").notNull().default("pending"), // pending | done | error
  concepts: text("concepts"), // JSON: [{title, description}]
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const quizGenJob = sqliteTable("quiz_gen_job", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  topicJobId: text("topic_job_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | done | error
  questions: text("questions"), // JSON: Question[]
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const quizAttempt = sqliteTable("quiz_attempt", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  quizGenJobId: text("quiz_gen_job_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | done | error
  answers: text("answers"), // JSON: { questionIndex, answer }[]
  score: integer("score"), // 0-100
  feedback: text("feedback"), // JSON: { questionIndex, correct, explanation }[]
  failedAt: integer("failed_at", { mode: "timestamp" }), // set when score < 80, used for wait check
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const learningLink = sqliteTable("learning_link", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id").notNull().references(() => quizAttempt.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending | done | error
  links: text("links"), // JSON: { questionIndex, topic, resources: [{title, url, description}][] }[]
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const postDraft = sqliteTable("post_draft", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id").notNull().references(() => quizAttempt.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending | done | error
  blogTitle: text("blog_title"),
  blogSlug: text("blog_slug"),
  blogBody: text("blog_body"),
  linkedinBody: text("linkedin_body"),
  twitterBody: text("twitter_body"),
  wasEdited: integer("was_edited", { mode: "boolean" }).notNull().default(false),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const linkedinConnection = sqliteTable("linkedin_connection", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  linkedinUserId: text("linkedin_user_id").notNull(),
  connectedAt: integer("connected_at", { mode: "timestamp" }).notNull(),
});

export const twitterConnection = sqliteTable("twitter_connection", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  twitterUserId: text("twitter_user_id").notNull(),
  connectedAt: integer("connected_at", { mode: "timestamp" }).notNull(),
});

export const socialOauthState = sqliteTable("social_oauth_state", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(), // 'linkedin' | 'twitter'
  codeVerifier: text("code_verifier"),
  returnUrl: text("return_url"),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const topicJob = sqliteTable("topic_job", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  quizJobId: text("quiz_job_id")
    .notNull()
    .references(() => quizJob.id, { onDelete: "cascade" }),
  conceptIndex: integer("concept_index").notNull(),
  status: text("status").notNull().default("pending"), // pending | done | error
  topics: text("topics"), // JSON: [{title, description}]
  selectedTopics: text("selected_topics"), // JSON: string[]
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
