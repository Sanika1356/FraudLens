CREATE TABLE `riskPolicyVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`version` int NOT NULL,
	`status` enum('draft','active','retired') NOT NULL,
	`configJson` text NOT NULL,
	`changeNote` varchar(500) NOT NULL,
	`createdById` varchar(64),
	`createdByName` varchar(160),
	`approvedById` varchar(64),
	`approvedByName` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`approvedAt` timestamp,
	CONSTRAINT `riskPolicyVersions_id` PRIMARY KEY(`id`),
	CONSTRAINT `risk_policy_versions_org_version_unique` UNIQUE(`orgId`,`version`)
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `policyVersion` varchar(32) DEFAULT 'v1' NOT NULL;--> statement-breakpoint
CREATE INDEX `risk_policy_versions_org_status_idx` ON `riskPolicyVersions` (`orgId`,`status`);