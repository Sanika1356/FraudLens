CREATE TABLE `auditEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64),
	`eventType` varchar(80) NOT NULL,
	`actorId` varchar(64),
	`actorName` varchar(160),
	`subjectType` varchar(64),
	`subjectId` varchar(80),
	`summary` text NOT NULL,
	`metadataJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditEvents_id` PRIMARY KEY(`id`)
);
