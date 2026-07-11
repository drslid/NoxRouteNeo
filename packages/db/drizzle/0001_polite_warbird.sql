ALTER TYPE "public"."secret_kind" ADD VALUE 'subscription_token';--> statement-breakpoint
CREATE TABLE "runtime_agent_state" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"status" text DEFAULT 'starting' NOT NULL,
	"version" text,
	"xray_running" boolean DEFAULT false NOT NULL,
	"config_revision" integer DEFAULT 0 NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_telemetry_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "server_bandwidth_limit_percent" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "subscription_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "enforce_quota" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "enforce_expiry" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_credentials" ADD COLUMN "token_secret_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_credentials" ADD CONSTRAINT "subscription_credentials_token_secret_id_encrypted_secrets_id_fk" FOREIGN KEY ("token_secret_id") REFERENCES "public"."encrypted_secrets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "devices_reality_short_id_uidx" ON "devices" USING btree ("reality_short_id");