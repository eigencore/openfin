CREATE TABLE `recurring_transaction` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`amount` real NOT NULL,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`account_id` text,
	`currency` text DEFAULT 'MXN' NOT NULL,
	`frequency` text NOT NULL,
	`interval` integer DEFAULT 1 NOT NULL,
	`next_due` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`notes` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
