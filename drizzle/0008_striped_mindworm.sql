CREATE TABLE `notificationPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`emailEnabled` boolean NOT NULL DEFAULT false,
	`toEmail` varchar(320),
	`slackEnabled` boolean NOT NULL DEFAULT false,
	`slackWebhookUrl` varchar(2048),
	`teamsEnabled` boolean NOT NULL DEFAULT false,
	`teamsWebhookUrl` varchar(2048),
	`riskThreshold` int NOT NULL DEFAULT 80,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notificationPreferences_orgId_unique` UNIQUE(`orgId`)
);
