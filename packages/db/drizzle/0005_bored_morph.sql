CREATE TABLE "ip_bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"reason" text NOT NULL,
	"permanent" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text,
	"released_at" timestamp with time zone,
	"released_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "security_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ip_address" text NOT NULL,
	"kind" text NOT NULL,
	"outcome" text NOT NULL,
	"route" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_credentials" ADD COLUMN "hwid_digest" text;--> statement-breakpoint
ALTER TABLE "subscription_credentials" ADD COLUMN "hwid_bound_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_credentials" ADD COLUMN "last_ip_address" text;--> statement-breakpoint
ALTER TABLE "subscription_credentials" ADD COLUMN "last_user_agent" text;--> statement-breakpoint
ALTER TABLE "subscription_credentials" ADD COLUMN "last_device_platform" text;--> statement-breakpoint
ALTER TABLE "subscription_credentials" ADD COLUMN "last_device_model" text;--> statement-breakpoint
ALTER TABLE "subscription_credentials" ADD COLUMN "last_device_os" text;--> statement-breakpoint
ALTER TABLE "ip_bans" ADD CONSTRAINT "ip_bans_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ip_bans" ADD CONSTRAINT "ip_bans_released_by_user_id_user_id_fk" FOREIGN KEY ("released_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ip_bans_ip_address_uidx" ON "ip_bans" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "ip_bans_expires_at_idx" ON "ip_bans" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ip_bans_last_seen_at_idx" ON "ip_bans" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "security_events_created_at_idx" ON "security_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "security_events_ip_created_at_idx" ON "security_events" USING btree ("ip_address","created_at");--> statement-breakpoint
CREATE INDEX "security_events_kind_created_at_idx" ON "security_events" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "subscription_credentials_hwid_idx" ON "subscription_credentials" USING btree ("hwid_digest");