CREATE TABLE `quiz_job` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `repo_full_name` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `concepts` text,
  `error` text,
  `created_at` integer NOT NULL
);
