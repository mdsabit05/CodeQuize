CREATE TABLE `topic_job` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `quiz_job_id` text NOT NULL REFERENCES `quiz_job`(`id`) ON DELETE CASCADE,
  `concept_index` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `topics` text,
  `selected_topics` text,
  `error` text,
  `created_at` integer NOT NULL
);
