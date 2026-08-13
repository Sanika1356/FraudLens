CREATE TABLE `outcomeFeedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` varchar(64) NOT NULL,
	`transactionId` int NOT NULL,
	`predictedRiskLabel` enum('low','medium','high') NOT NULL,
	`predictedProbability` int NOT NULL,
	`actualOutcome` enum('fraud','legitimate') NOT NULL,
	`classification` enum('true_positive','false_positive','false_negative','true_negative') NOT NULL,
	`resolutionReasonCode` varchar(64),
	`recordedById` varchar(64),
	`recordedByName` varchar(160),
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outcomeFeedback_id` PRIMARY KEY(`id`),
	CONSTRAINT `outcome_feedback_org_transaction_unique` UNIQUE(`orgId`,`transactionId`)
);
