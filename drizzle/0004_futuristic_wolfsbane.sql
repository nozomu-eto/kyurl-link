CREATE TABLE `posters` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`layout_template` text NOT NULL,
	`style_options` text,
	`size` text NOT NULL,
	`qr_code_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`qr_code_id`) REFERENCES `qrcodes`(`id`) ON UPDATE no action ON DELETE restrict
);
