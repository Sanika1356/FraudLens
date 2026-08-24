CREATE TABLE `modelRegistryVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`modelKey` varchar(80) NOT NULL,
	`version` varchar(40) NOT NULL,
	`status` enum('champion','challenger','retired') NOT NULL,
	`artifactHash` varchar(128) NOT NULL,
	`datasetLabel` varchar(250) NOT NULL,
	`evaluationJson` text NOT NULL,
	`changeNote` varchar(500) NOT NULL,
	`createdById` varchar(64),
	`createdByName` varchar(160),
	`approvedById` varchar(64),
	`approvedByName` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`approvedAt` timestamp,
	CONSTRAINT `modelRegistryVersions_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_registry_org_key_version_unique` UNIQUE(`orgId`,`modelKey`,`version`)
);
--> statement-breakpoint
CREATE INDEX `model_registry_org_status_idx` ON `modelRegistryVersions` (`orgId`,`status`);