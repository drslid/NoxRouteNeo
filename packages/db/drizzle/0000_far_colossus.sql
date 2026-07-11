CREATE TYPE "public"."connection_profile" AS ENUM('fast', 'balanced', 'stealth');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('ios', 'android', 'desktop', 'other');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('active', 'disabled', 'blocked_by_limit', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."runtime_command_status" AS ENUM('pending', 'processing', 'retrying', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."runtime_command_type" AS ENUM('SYNC_XRAY_CONFIG', 'SYNC_ACCESS', 'SYNC_DEVICE', 'REVOKE_DEVICE', 'UPDATE_DUCKDNS', 'RELOAD_CADDY', 'RUN_HEALTHCHECK', 'FINALIZE_SETUP', 'CREATE_BACKUP', 'RESTORE_BACKUP', 'UNINSTALL_INSTANCE');--> statement-breakpoint
CREATE TYPE "public"."runtime_job_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."secret_kind" AS ENUM('duckdns_token', 'reality_private_key', 'vless_uuid');--> statement-breakpoint
CREATE TYPE "public"."vpn_access_status" AS ENUM('active', 'suspended', 'expired', 'quota_exceeded');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" text,
	"display_username" text,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"two_factor_enabled" boolean DEFAULT false,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"result" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vpn_access_id" uuid NOT NULL,
	"name" text NOT NULL,
	"platform" "device_platform" DEFAULT 'other' NOT NULL,
	"status" "device_status" DEFAULT 'active' NOT NULL,
	"profile" "connection_profile" DEFAULT 'balanced' NOT NULL,
	"vless_secret_id" uuid,
	"reality_short_id" text NOT NULL,
	"spider_x" text,
	"active_connections" integer DEFAULT 0 NOT NULL,
	"used_bytes" bigint DEFAULT 0 NOT NULL,
	"connected_seconds" bigint DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encrypted_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "secret_kind" NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "instance_metric_samples" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "instance_metric_samples_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"uplink_bytes" bigint DEFAULT 0 NOT NULL,
	"downlink_bytes" bigint DEFAULT 0 NOT NULL,
	"active_connections" integer DEFAULT 0 NOT NULL,
	"xray_cpu_basis_points" integer DEFAULT 0 NOT NULL,
	"xray_memory_bytes" bigint DEFAULT 0 NOT NULL,
	"sampled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"configured" boolean DEFAULT false NOT NULL,
	"admin_domain" text,
	"vpn_domain" text,
	"admin_https_port" integer DEFAULT 8443 NOT NULL,
	"vpn_port" integer DEFAULT 443 NOT NULL,
	"xhttp_path" text DEFAULT '/noxroute' NOT NULL,
	"reality_target" text DEFAULT 'www.speedtest.net:443' NOT NULL,
	"reality_server_name" text DEFAULT 'www.speedtest.net' NOT NULL,
	"reality_public_key" text,
	"default_connection_profile" "connection_profile" DEFAULT 'balanced' NOT NULL,
	"default_max_devices" integer DEFAULT 2 NOT NULL,
	"default_max_days" integer,
	"default_quota_bytes" bigint,
	"default_speed_limit_mbps" integer DEFAULT 0 NOT NULL,
	"telemetry_interval_seconds" integer DEFAULT 30 NOT NULL,
	"setup_locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "runtime_command_type" NOT NULL,
	"status" "runtime_command_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"requested_by_user_id" text,
	"job_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_job_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"status" "runtime_job_status" DEFAULT 'pending' NOT NULL,
	"message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "runtime_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" "runtime_job_status" DEFAULT 'pending' NOT NULL,
	"requested_by_user_id" text,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"token_digest" text NOT NULL,
	"token_prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_samples" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "usage_samples_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"vpn_access_id" uuid NOT NULL,
	"device_id" uuid,
	"uplink_bytes" bigint DEFAULT 0 NOT NULL,
	"downlink_bytes" bigint DEFAULT 0 NOT NULL,
	"active_connections" integer DEFAULT 0 NOT NULL,
	"sampled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vpn_accesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"status" "vpn_access_status" DEFAULT 'active' NOT NULL,
	"quota_bytes" bigint,
	"used_bytes" bigint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"connected_seconds" bigint DEFAULT 0 NOT NULL,
	"active_connections" integer DEFAULT 0 NOT NULL,
	"max_devices" integer DEFAULT 2 NOT NULL,
	"speed_limit_mbps" integer DEFAULT 0 NOT NULL,
	"disabled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_vpn_access_id_vpn_accesses_id_fk" FOREIGN KEY ("vpn_access_id") REFERENCES "public"."vpn_accesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_vless_secret_id_encrypted_secrets_id_fk" FOREIGN KEY ("vless_secret_id") REFERENCES "public"."encrypted_secrets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_commands" ADD CONSTRAINT "runtime_commands_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_commands" ADD CONSTRAINT "runtime_commands_job_id_runtime_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."runtime_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_job_steps" ADD CONSTRAINT "runtime_job_steps_job_id_runtime_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."runtime_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_jobs" ADD CONSTRAINT "runtime_jobs_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_credentials" ADD CONSTRAINT "subscription_credentials_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_samples" ADD CONSTRAINT "usage_samples_vpn_access_id_vpn_accesses_id_fk" FOREIGN KEY ("vpn_access_id") REFERENCES "public"."vpn_accesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_samples" ADD CONSTRAINT "usage_samples_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn_accesses" ADD CONSTRAINT "vpn_accesses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "twoFactor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "twoFactor_userId_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "devices_vpn_access_id_idx" ON "devices" USING btree ("vpn_access_id");--> statement-breakpoint
CREATE INDEX "devices_status_idx" ON "devices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "encrypted_secrets_kind_idx" ON "encrypted_secrets" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "instance_metric_samples_time_idx" ON "instance_metric_samples" USING btree ("sampled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_commands_idempotency_key_uidx" ON "runtime_commands" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "runtime_commands_queue_idx" ON "runtime_commands" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_job_steps_job_position_uidx" ON "runtime_job_steps" USING btree ("job_id","position");--> statement-breakpoint
CREATE INDEX "runtime_jobs_status_idx" ON "runtime_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_credentials_device_id_uidx" ON "subscription_credentials" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_credentials_digest_uidx" ON "subscription_credentials" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "usage_samples_access_time_idx" ON "usage_samples" USING btree ("vpn_access_id","sampled_at");--> statement-breakpoint
CREATE INDEX "usage_samples_device_time_idx" ON "usage_samples" USING btree ("device_id","sampled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vpn_accesses_user_id_uidx" ON "vpn_accesses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vpn_accesses_status_idx" ON "vpn_accesses" USING btree ("status");