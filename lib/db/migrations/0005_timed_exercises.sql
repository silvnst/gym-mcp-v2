ALTER TABLE "plan_exercises" ADD COLUMN "target_seconds" integer;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "target_seconds" integer;--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN "duration_seconds" integer;