CREATE TABLE `qrcodes` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`target_url` text,
	`style_options` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`target_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade
);
