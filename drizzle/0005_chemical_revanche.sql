CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`parent` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`content` text,
	`url` text,
	`key` text,
	`mime` text,
	`size` real,
	`date` text,
	`stage` text,
	`itemnumber` text,
	`manufacturer` text,
	`model` text,
	`quantity` real,
	`color` text,
	`created` text NOT NULL,
	`shop_drawings` text,
	`po_number` text
);
--> statement-breakpoint
CREATE TABLE `pm_meta` (
	`id` text PRIMARY KEY NOT NULL
);
