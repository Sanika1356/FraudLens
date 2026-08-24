CREATE TABLE `organizationControls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`incidentMode` boolean NOT NULL DEFAULT false,
	`incidentNote` varchar(500),
	`incidentActivatedById` varchar(64),
	`incidentActivatedByName` varchar(160),
	`incidentActivatedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizationControls_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizationControls_orgId_unique` UNIQUE(`orgId`)
);
