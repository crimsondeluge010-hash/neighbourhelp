ALTER TABLE `users` ADD `firebase_uid` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `full_name` varchar(120);--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `profile_photo` varchar(500);--> statement-breakpoint
ALTER TABLE `users` ADD `address` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `latitude` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `longitude` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `users` ADD `skills` varchar(500);--> statement-breakpoint
ALTER TABLE `users` ADD `availability` varchar(120);--> statement-breakpoint
ALTER TABLE `users` ADD `is_helper` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `is_verified` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `verification_status` enum('Verified','Pending Verification','Not Verified') DEFAULT 'Not Verified' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `is_disabled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `completed_tasks` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `average_rating` varchar(8) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_firebase_uid_unique` UNIQUE(`firebase_uid`);