CREATE TABLE "coach_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"piece_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"status" text DEFAULT 'procesando' NOT NULL,
	"result" jsonb,
	"votes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mock" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_reviews" ADD CONSTRAINT "coach_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_reviews" ADD CONSTRAINT "coach_reviews_piece_id_content_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."content_pieces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_reviews_piece_num_idx" ON "coach_reviews" USING btree ("piece_id","numero");--> statement-breakpoint
CREATE INDEX "coach_reviews_user_idx" ON "coach_reviews" USING btree ("user_id","created_at");