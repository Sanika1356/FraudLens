CREATE TABLE `apiKeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`name` varchar(80) NOT NULL,
	`keyPrefix` varchar(24) NOT NULL,
	`keyHash` varchar(128) NOT NULL,
	`scopesJson` varchar(255) NOT NULL,
	`createdById` varchar(64),
	`createdByName` varchar(160),
	`lastUsedAt` timestamp,
	`expiresAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `apiKeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_key_hash_unique` UNIQUE(`keyHash`)
);
--> statement-breakpoint
CREATE TABLE `apiRequestLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`apiKeyId` int,
	`requestId` varchar(64) NOT NULL,
	`endpoint` varchar(160) NOT NULL,
	`method` varchar(8) NOT NULL,
	`responseStatus` int NOT NULL,
	`transactionReference` varchar(32),
	`riskLevel` enum('low','medium','high'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `apiRequestLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `api_keys_org_created_idx` ON `apiKeys` (`orgId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `api_request_logs_org_created_idx` ON `apiRequestLogs` (`orgId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `api_request_logs_key_created_idx` ON `apiRequestLogs` (`apiKeyId`,`createdAt`);