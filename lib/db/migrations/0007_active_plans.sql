ALTER TABLE "plans" ADD COLUMN "active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Start with the plans trained in the last four weeks, the programme Today used to infer
UPDATE "plans" SET "active" = true WHERE "id" IN (SELECT DISTINCT "plan_id" FROM "sessions" WHERE "plan_id" IS NOT NULL AND "date" >= CURRENT_DATE - 28);
