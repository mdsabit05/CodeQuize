CREATE TABLE `post_draft` (
  `id` text PRIMARY KEY NOT NULL,
  `attempt_id` text NOT NULL REFERENCES `quiz_attempt`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `status` text NOT NULL DEFAULT 'pending',
  `blog_title` text,
  `blog_slug` text,
  `blog_body` text,
  `linkedin_body` text,
  `twitter_body` text,
  `error` text,
  `created_at` integer NOT NULL
);
