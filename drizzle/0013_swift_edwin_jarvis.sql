CREATE TABLE `apiIdempotencyKeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`apiKeyId` int NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`requestHash` varchar(64) NOT NULL,
	`status` enum('processing','completed') NOT NULL DEFAULT 'processing',
	`responseStatus` int,
	`responseJson` text,
	`transactionReference` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `apiIdempotencyKeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_idempotency_key_unique` UNIQUE(`apiKeyId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `savedQueueViews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`ownerId` varchar(64) NOT NULL,
	`name` varchar(80) NOT NULL,
	`visibility` enum('private','shared') NOT NULL DEFAULT 'private',
	`filtersJson` varchar(2000) NOT NULL,
	`createdByName` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `savedQueueViews_id` PRIMARY KEY(`id`),
	CONSTRAINT `saved_queue_views_org_owner_name_unique` UNIQUE(`orgId`,`ownerId`,`name`)
);
--> statement-breakpoint
CREATE INDEX `api_idempotency_org_created_idx` ON `apiIdempotencyKeys` (`orgId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `saved_queue_views_org_idx` ON `savedQueueViews` (`orgId`,`updatedAt`);