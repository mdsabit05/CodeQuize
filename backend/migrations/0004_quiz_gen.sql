CREATE TABLE `quiz_gen_job` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `topic_job_id` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `questions` text,
  `error` text,
  `created_at` integer NOT NULL
);

CREATE TABLE `quiz_attempt` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `quiz_gen_job_id` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `answers` text,
  `score` integer,
  `feedback` text,
  `error` text,
  `created_at` integer NOT NULL
);
