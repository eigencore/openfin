CREATE TABLE `todo` (
	`session_id` text NOT NULL REFERENCES `session`(`id`) ON DELETE CASCADE,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`position` integer NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	PRIMARY KEY(`session_id`, `position`)
);
--> statement-breakpoint
CREATE INDEX `todo_session_idx` ON `todo` (`session_id`);
