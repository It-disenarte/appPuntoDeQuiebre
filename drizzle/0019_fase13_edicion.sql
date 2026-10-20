CREATE TABLE "video_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"piece_id" uuid NOT NULL,
	"status" text DEFAULT 'planeando' NOT NULL,
	"plan" jsonb,
	"words" jsonb,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration" integer,
	"adjustments" integer DEFAULT 0 NOT NULL,
	"adjust_note" text,
	"output_key" text,
	"cover_key" text,
	"output_seconds" integer,
	"mock" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_edits" ADD CONSTRAINT "video_edits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_edits" ADD CONSTRAINT "video_edits_piece_id_content_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."content_pieces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "video_edits_piece_idx" ON "video_edits" USING btree ("piece_id");--> statement-breakpoint
CREATE INDEX "video_edits_user_idx" ON "video_edits" USING btree ("user_id","created_at");