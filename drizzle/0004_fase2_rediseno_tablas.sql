CREATE TABLE "brand_manuals" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"votes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'borrador' NOT NULL,
	"mock" boolean DEFAULT false NOT NULL,
	"skill_version" text NOT NULL,
	"approved_at" timestamp with time zone,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_intake" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"story" jsonb DEFAULT '{"steps":{}}'::jsonb NOT NULL,
	"quick" jsonb,
	"content_version" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"answers" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"mock" boolean DEFAULT false NOT NULL,
	"skill_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_manuals" ADD CONSTRAINT "brand_manuals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_intake" ADD CONSTRAINT "creator_intake_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;