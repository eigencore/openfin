CREATE TABLE `net_worth_snapshot` (
	`id` text PRIMARY KEY,
	`date` integer NOT NULL,
	`assets` real NOT NULL,
	`debts` real NOT NULL,
	`net_worth` real NOT NULL,
	`currency` text DEFAULT 'MXN' NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `net_worth_snapshot_date_idx` ON `net_worth_snapshot` (`date`);