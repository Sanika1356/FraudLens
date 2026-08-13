CREATE TABLE `caseNotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transactionId` int NOT NULL,
	`note` text NOT NULL,
	`authorName` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `caseNotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `driftSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`featureName` varchar(100) NOT NULL,
	`baselineLabel` varchar(120) NOT NULL,
	`recentLabel` varchar(120) NOT NULL,
	`changePercent` int NOT NULL,
	`status` enum('stable','watch','elevated') NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `driftSnapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `modelMetricSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modelLabel` varchar(200) NOT NULL,
	`datasetLabel` varchar(250) NOT NULL,
	`precisionMilli` int NOT NULL,
	`recallMilli` int NOT NULL,
	`f1Milli` int NOT NULL,
	`trueNegative` int NOT NULL,
	`falsePositive` int NOT NULL,
	`falseNegative` int NOT NULL,
	`truePositive` int NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `modelMetricSnapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reference` varchar(32) NOT NULL,
	`amountCents` int NOT NULL,
	`merchantCategory` varchar(80) NOT NULL,
	`transactionCountry` varchar(3) NOT NULL,
	`accountCountry` varchar(3) NOT NULL,
	`deviceStatus` enum('known','new') NOT NULL,
	`transactionHour` int NOT NULL,
	`recentTransactionCount` int NOT NULL,
	`riskLabel` enum('low','medium','high') NOT NULL,
	`riskProbability` int NOT NULL,
	`factorJson` text NOT NULL,
	`deterministicExplanation` text NOT NULL,
	`llmSummary` text,
	`llmNextStep` text,
	`caseStatus` enum('under_review','confirmed_fraud','legitimate') NOT NULL DEFAULT 'under_review',
	`caseNote` text,
	`isNew` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `transactions_reference_unique` UNIQUE(`reference`)
);
