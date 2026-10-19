CREATE TABLE "profile_opt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"current" jsonb,
	"result" jsonb,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"votes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"chosen" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"applied" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"refreshes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_opt" ADD CONSTRAINT "profile_opt_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_opt_user_idx" ON "profile_opt" USING btree ("user_id");