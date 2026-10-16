CREATE TABLE "content_pieces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"n" integer NOT NULL,
	"day" date NOT NULL,
	"publish_time" text NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"variant_of_n" integer,
	"test_kind" text,
	"pillar" text NOT NULL,
	"topic" text NOT NULL,
	"idea" text DEFAULT '' NOT NULL,
	"script" jsonb NOT NULL,
	"variant" jsonb,
	"test_card" text,
	"texts" jsonb,
	"texts_review" jsonb,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"data" jsonb NOT NULL,
	"alt_index" integer DEFAULT 0 NOT NULL,
	"vote" text,
	"edited_text" text,
	"own_idea" text,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "week_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"tier" text NOT NULL,
	"stage" text NOT NULL,
	"mix" jsonb NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"focus" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mock" boolean DEFAULT false NOT NULL,
	"skill_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_plan_id_week_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."week_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_ideas" ADD CONSTRAINT "story_ideas_plan_id_week_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."week_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_ideas" ADD CONSTRAINT "story_ideas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_plans" ADD CONSTRAINT "week_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_pieces_plan_n_idx" ON "content_pieces" USING btree ("plan_id","n");--> statement-breakpoint
CREATE INDEX "content_pieces_user_day_idx" ON "content_pieces" USING btree ("user_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "story_ideas_plan_day_idx" ON "story_ideas" USING btree ("plan_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "week_plans_user_week_idx" ON "week_plans" USING btree ("user_id","week_start");