CREATE TABLE `docs` (
	`entity` text NOT NULL,
	`id` text NOT NULL,
	`rev` integer NOT NULL,
	`deleted_at` integer,
	`data` text NOT NULL,
	`seq` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`device_id` text NOT NULL,
	PRIMARY KEY(`entity`, `id`)
);
--> statement-breakpoint
CREATE INDEX `docs_seq_idx` ON `docs` (`seq`);--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ops` (
	`op_id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`rev` integer NOT NULL,
	`applied_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ops_applied_idx` ON `ops` (`applied_at`);