ALTER TABLE `users` MODIFY COLUMN `latitude` decimal(10,7);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `longitude` decimal(10,7);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `average_rating` decimal(3,2) NOT NULL DEFAULT '0';