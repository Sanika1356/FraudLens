ALTER TABLE `users` MODIFY COLUMN `role` enum('user','analyst','manager','admin') NOT NULL DEFAULT 'analyst';
--> statement-breakpoint
UPDATE `users` SET `role` = 'analyst' WHERE `role` = 'user';
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('analyst','manager','admin') NOT NULL DEFAULT 'analyst';
