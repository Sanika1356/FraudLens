ALTER TABLE `transactions` ADD `assigneeId` varchar(64);--> statement-breakpoint
ALTER TABLE `transactions` ADD `assigneeName` varchar(160);--> statement-breakpoint
ALTER TABLE `transactions` ADD `casePriority` enum('critical','high','standard') DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `dueAt` timestamp;