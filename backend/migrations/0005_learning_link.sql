CREATE TABLE `learning_link` (
  `id` text PRIMARY KEY NOT NULL,
  `attempt_id` text NOT NULL REFERENCES `quiz_attempt`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `status` text NOT NULL DEFAULT 'pending',
  `links` text,
  `error` text,
  `created_at` integer NOT NULL
);
