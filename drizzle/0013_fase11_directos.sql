CREATE TABLE "live_guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"week_start" date,
	"result" jsonb NOT NULL,
	"done" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"situacion" text,
	"plataformas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dias" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hora" text,
	"frecuencia" text,
	"compromiso" text,
	"recomendacion" jsonb,
	"avisos_no_seguidos" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_guides" ADD CONSTRAINT "live_guides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_profile" ADD CONSTRAINT "live_profile_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_guides_user_idx" ON "live_guides" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "live_profile_user_idx" ON "live_profile" USING btree ("user_id");