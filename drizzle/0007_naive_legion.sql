CREATE TABLE `account_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` integer DEFAULT (unixepoch()) NOT NULL,
	`scheduled_deletion_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
