ALTER TABLE "plan_exercises" ADD COLUMN IF NOT EXISTS "superset_group" text;--> statement-breakpoint
ALTER TABLE "plan_exercises" ADD COLUMN IF NOT EXISTS "equipment" text;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN IF NOT EXISTS "superset_group" text;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN IF NOT EXISTS "equipment" text;--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN IF NOT EXISTS "effort" text;