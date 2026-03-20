CREATE TABLE `portfolio_position` (
	`id` text PRIMARY KEY,
	`symbol` text NOT NULL,
	`name` text,
	`quantity` real NOT NULL,
	`avg_cost` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`asset_type` text DEFAULT 'stock' NOT NULL,
	`notes` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
