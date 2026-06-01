CREATE TABLE `github_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`github_user_id` text NOT NULL,
	`github_username` text NOT NULL,
	`access_token` text NOT NULL,
	`connected_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_connection_user_id_unique` ON `github_connection` (`user_id`);--> statement-breakpoint
CREATE TABLE `github_selected_repo` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`repo_id` text NOT NULL,
	`repo_name` text NOT NULL,
	`repo_full_name` text NOT NULL,
	`selected_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_state` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
