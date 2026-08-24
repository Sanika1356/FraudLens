CREATE TABLE `organizationRoles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`openId` varchar(64) NOT NULL,
	`role` enum('analyst','manager','admin') NOT NULL DEFAULT 'analyst',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizationRoles_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_roles_org_open_unique` UNIQUE(`orgId`,`openId`)
);
--> statement-breakpoint
CREATE INDEX `organization_roles_org_idx` ON `organizationRoles` (`orgId`);