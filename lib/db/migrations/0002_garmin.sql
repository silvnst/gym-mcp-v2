CREATE TABLE "garmin_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"garmin_id" bigint NOT NULL,
	"start_time_local" timestamp NOT NULL,
	"date" date NOT NULL,
	"name" text,
	"type" text,
	"duration_seconds" integer,
	"distance_meters" real,
	"avg_hr" integer,
	"max_hr" integer,
	"calories" integer,
	"training_load" real,
	"aerobic_effect" real,
	"anaerobic_effect" real,
	"raw" jsonb,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "garmin_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"resting_hr" integer,
	"hrv_last_night" integer,
	"hrv_weekly_avg" integer,
	"hrv_baseline_low" integer,
	"hrv_baseline_high" integer,
	"hrv_status" text,
	"sleep_seconds" integer,
	"sleep_score" integer,
	"body_battery_high" integer,
	"body_battery_low" integer,
	"stress_avg" integer,
	"steps" integer,
	"raw" jsonb,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "garmin_activities" ADD CONSTRAINT "garmin_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garmin_days" ADD CONSTRAINT "garmin_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "garmin_activities_user_garmin_id" ON "garmin_activities" USING btree ("user_id","garmin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "garmin_days_user_date" ON "garmin_days" USING btree ("user_id","date");