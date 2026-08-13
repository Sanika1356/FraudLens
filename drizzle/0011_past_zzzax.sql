CREATE TABLE `weeklySummaryDeliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`periodStart` timestamp NOT NULL,
	`recipient` varchar(320) NOT NULL,
	`resendEmailId` varchar(128),
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `weeklySummaryDeliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `weekly_summary_deliveries_org_period_unique` UNIQUE(`orgId`,`periodStart`)
);
--> statement-breakpoint
CREATE TABLE `weeklySummaryPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`toEmail` varchar(320),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weeklySummaryPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `weeklySummaryPreferences_orgId_unique` UNIQUE(`orgId`)
);
--> statement-breakpoint
CREATE INDEX `weekly_summary_deliveries_org_sent_idx` ON `weeklySummaryDeliveries` (`orgId`,`sentAt`);