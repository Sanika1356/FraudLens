CREATE TABLE `retentionPolicyVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`version` int NOT NULL,
	`status` enum('draft','active','retired') NOT NULL,
	`transactionRetentionDays` int NOT NULL,
	`evidenceRetentionDays` int NOT NULL,
	`auditRetentionDays` int NOT NULL,
	`effectiveAt` timestamp NOT NULL,
	`changeNote` varchar(500) NOT NULL,
	`createdById` varchar(64),
	`createdByName` varchar(160),
	`approvedById` varchar(64),
	`approvedByName` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`approvedAt` timestamp,
	CONSTRAINT `retentionPolicyVersions_id` PRIMARY KEY(`id`),
	CONSTRAINT `retention_policy_versions_org_version_unique` UNIQUE(`orgId`,`version`)
);
--> statement-breakpoint
CREATE INDEX `retention_policy_versions_org_status_idx` ON `retentionPolicyVersions` (`orgId`,`status`);