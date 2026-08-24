CREATE TABLE IF NOT EXISTS `riskEntities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`entityType` enum('merchant_category','country_route','device_cohort') NOT NULL,
	`entityKey` varchar(128) NOT NULL,
	`displayLabel` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `riskEntities_id` PRIMARY KEY(`id`),
	CONSTRAINT `risk_entities_org_type_key_unique` UNIQUE(`orgId`,`entityType`,`entityKey`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `transactionEntityLinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`transactionId` int NOT NULL,
	`entityId` int NOT NULL,
	`relationship` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transactionEntityLinks_id` PRIMARY KEY(`id`),
	CONSTRAINT `transaction_entity_links_unique` UNIQUE(`orgId`,`transactionId`,`entityId`)
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN IF NOT EXISTS `policySignalJson` text NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `risk_entities_org_idx` ON `riskEntities` (`orgId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_entity_links_org_entity_idx` ON `transactionEntityLinks` (`orgId`,`entityId`);
