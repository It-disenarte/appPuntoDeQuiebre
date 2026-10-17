CREATE TABLE "carousels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"piece_id" uuid,
	"number" integer DEFAULT 1 NOT NULL,
	"brief" jsonb NOT NULL,
	"ideas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chosen" jsonb,
	"interview" jsonb,
	"answers" jsonb,
	"content" jsonb,
	"slide_attempts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"full_redos" integer DEFAULT 0 NOT NULL,
	"images" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"background" text,
	"mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carousels" ADD CONSTRAINT "carousels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carousels" ADD CONSTRAINT "carousels_piece_id_content_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."content_pieces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "carousels_user_idx" ON "carousels" USING btree ("user_id","created_at");