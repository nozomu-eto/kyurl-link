CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`original_url` text NOT NULL,
	`short_code` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `links_short_code_unique` ON `links` (`short_code`);