CREATE TABLE `caseEvidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64),
	`transactionId` int NOT NULL,
	`label` varchar(160) NOT NULL,
	`evidenceType` enum('link','attachment') NOT NULL,
	`url` text NOT NULL,
	`storageKey` varchar(500),
	`fileName` varchar(255),
	`mimeType` varchar(120),
	`addedById` varchar(64),
	`addedByName` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `caseEvidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `caseTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64),
	`transactionId` int NOT NULL,
	`tag` varchar(48) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `caseTags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `caseNotes` ADD `authorId` varchar(64);--> statement-breakpoint
ALTER TABLE `transactions` ADD `resolutionReasonCode` varchar(64);