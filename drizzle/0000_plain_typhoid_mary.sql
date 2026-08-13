CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`name` text NOT NULL,
	`dealers` text DEFAULT '[]' NOT NULL,
	`premier_estimator` text DEFAULT '' NOT NULL,
	`premier_sales_rep` text DEFAULT '' NOT NULL,
	`specification` text DEFAULT 'Prime Spec' NOT NULL,
	`upload_date` text DEFAULT '' NOT NULL,
	`bid_date` text DEFAULT '' NOT NULL,
	`source_file` text DEFAULT '' NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_owner_created_idx` ON `projects` (`owner_key`,`created_at`);