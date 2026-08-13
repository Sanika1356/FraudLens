ALTER TABLE `caseNotes` ADD `orgId` varchar(64);--> statement-breakpoint
ALTER TABLE `driftSnapshots` ADD `orgId` varchar(64);--> statement-breakpoint
ALTER TABLE `modelMetricSnapshots` ADD `orgId` varchar(64);--> statement-breakpoint
ALTER TABLE `transactions` ADD `orgId` varchar(64);