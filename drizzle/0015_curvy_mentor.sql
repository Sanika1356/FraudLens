CREATE TABLE IF NOT EXISTS `transactionImportBatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`contentHash` varchar(64) NOT NULL,
	`status` enum('previewed','completed','failed') NOT NULL DEFAULT 'previewed',
	`totalRows` int NOT NULL,
	`readyRows` int NOT NULL,
	`importedRows` int NOT NULL DEFAULT 0,
	`invalidRows` int NOT NULL DEFAULT 0,
	`duplicateRows` int NOT NULL DEFAULT 0,
	`errorsJson` text NOT NULL,
	`createdById` varchar(64),
	`createdByName` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `transactionImportBatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transaction_import_batches_org_idx` ON `transactionImportBatches` (`orgId`,`createdAt`);
