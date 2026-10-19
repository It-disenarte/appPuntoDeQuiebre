CREATE TABLE "app_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"signature" text NOT NULL,
	"message" text NOT NULL,
	"path" text,
	"count" integer DEFAULT 1 NOT NULL,
	"recent_count" integer DEFAULT 1 NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "app_errors_signature_idx" ON "app_errors" USING btree ("signature");--> statement-breakpoint
CREATE INDEX "app_errors_last_idx" ON "app_errors" USING btree ("last_at");