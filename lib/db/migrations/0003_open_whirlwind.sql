ALTER TABLE "users" ADD COLUMN "auth_sub" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_sub_unique" UNIQUE("auth_sub");