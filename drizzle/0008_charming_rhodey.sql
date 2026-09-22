PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_account_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`scheduled_deletion_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_account_requests`("id", "user_id", "status", "requested_at", "scheduled_deletion_at", "completed_at") SELECT "id", "user_id", "status", "requested_at", "scheduled_deletion_at", "completed_at" FROM `account_requests`;--> statement-breakpoint
DROP TABLE `account_requests`;--> statement-breakpoint
ALTER TABLE `__new_account_requests` RENAME TO `account_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;