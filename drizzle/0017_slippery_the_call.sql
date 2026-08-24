CREATE TABLE `caseChecklistItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`transactionId` int NOT NULL,
	`itemKey` varchar(64) NOT NULL,
	`completed` boolean NOT NULL DEFAULT false,
	`note` varchar(500) NOT NULL DEFAULT '',
	`completedById` varchar(64),
	`completedByName` varchar(160),
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `caseChecklistItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `case_checklist_org_transaction_key_unique` UNIQUE(`orgId`,`transactionId`,`itemKey`)
);
--> statement-breakpoint
CREATE INDEX `case_checklist_org_transaction_idx` ON `caseChecklistItems` (`orgId`,`transactionId`);