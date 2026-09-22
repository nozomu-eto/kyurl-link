ALTER TABLE `links` ADD `user_id` text NOT NULL REFERENCES user(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `posters` ADD `user_id` text NOT NULL REFERENCES user(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `qrcodes` ADD `user_id` text NOT NULL REFERENCES user(id) ON DELETE cascade;
