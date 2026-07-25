CREATE TABLE `cards` (
	`item_id` text PRIMARY KEY NOT NULL,
	`due` integer NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`elapsed_days` real NOT NULL,
	`scheduled_days` real NOT NULL,
	`learning_steps` integer DEFAULT 0 NOT NULL,
	`reps` integer NOT NULL,
	`lapses` integer NOT NULL,
	`state` integer NOT NULL,
	`last_review` integer
);
--> statement-breakpoint
CREATE TABLE `quiz_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`score` integer NOT NULL,
	`taken_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`rating` integer NOT NULL,
	`reviewed_at` integer NOT NULL,
	`correct_count` integer NOT NULL,
	`total_count` integer NOT NULL,
	`elapsed_ms` integer NOT NULL,
	`scheduled_days` real NOT NULL,
	`due_after` integer NOT NULL
);
