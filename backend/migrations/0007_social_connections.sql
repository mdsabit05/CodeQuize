ALTER TABLE `post_draft` ADD COLUMN `published_at` integer;

CREATE TABLE `linkedin_connection` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL UNIQUE REFERENCES `user`(`id`) ON DELETE CASCADE,
  `access_token` text NOT NULL,
  `linkedin_user_id` text NOT NULL,
  `connected_at` integer NOT NULL
);

CREATE TABLE `twitter_connection` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL UNIQUE REFERENCES `user`(`id`) ON DELETE CASCADE,
  `access_token` text NOT NULL,
  `refresh_token` text,
  `twitter_user_id` text NOT NULL,
  `connected_at` integer NOT NULL
);

CREATE TABLE `social_oauth_state` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `platform` text NOT NULL,
  `code_verifier` text,
  `return_url` text,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
