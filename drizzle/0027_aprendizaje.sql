CREATE TABLE "learning_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"signals" integer DEFAULT 0 NOT NULL,
	"result" jsonb NOT NULL,
	"mock" boolean DEFAULT false NOT NULL,
	"skill_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_runs" ADD CONSTRAINT "learning_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_runs_user_idx" ON "learning_runs" USING btree ("user_id","created_at");