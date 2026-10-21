CREATE TABLE "idea_bank" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"hook" text DEFAULT '' NOT NULL,
	"idea" text DEFAULT '' NOT NULL,
	"short_script" text,
	"creator" text,
	"status" text DEFAULT 'guardada' NOT NULL,
	"piece_id" uuid,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idea_bank" ADD CONSTRAINT "idea_bank_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_bank" ADD CONSTRAINT "idea_bank_piece_id_content_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."content_pieces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idea_bank_user_title_idx" ON "idea_bank" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "idea_bank_user_status_idx" ON "idea_bank" USING btree ("user_id","status","created_at");