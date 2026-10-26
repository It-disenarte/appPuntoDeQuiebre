CREATE TABLE "carousel_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"carousel_id" uuid NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"frames_key" text,
	"output_key" text,
	"seconds" integer,
	"bytes" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carousel_videos" ADD CONSTRAINT "carousel_videos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carousel_videos" ADD CONSTRAINT "carousel_videos_carousel_id_carousels_id_fk" FOREIGN KEY ("carousel_id") REFERENCES "public"."carousels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "carousel_videos_carousel_idx" ON "carousel_videos" USING btree ("carousel_id");--> statement-breakpoint
CREATE INDEX "carousel_videos_user_idx" ON "carousel_videos" USING btree ("user_id","created_at");