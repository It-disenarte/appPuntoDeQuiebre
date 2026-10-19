CREATE TABLE "ig_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ig_user_id" text NOT NULL,
	"username" text NOT NULL,
	"name" text,
	"account_type" text,
	"token_enc" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"scopes" text DEFAULT '' NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ig_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ig_media_id" text NOT NULL,
	"media_type" text NOT NULL,
	"permalink" text,
	"caption" text,
	"posted_at" timestamp with time zone,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ig_connections" ADD CONSTRAINT "ig_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ig_media" ADD CONSTRAINT "ig_media_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ig_connections_user_idx" ON "ig_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ig_connections_ig_idx" ON "ig_connections" USING btree ("ig_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ig_media_user_media_idx" ON "ig_media" USING btree ("user_id","ig_media_id");--> statement-breakpoint
CREATE INDEX "ig_media_user_posted_idx" ON "ig_media" USING btree ("user_id","posted_at");