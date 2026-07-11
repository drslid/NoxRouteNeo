ALTER TABLE "runtime_agent_state" ADD COLUMN "traffic_gateway_status" text DEFAULT 'starting' NOT NULL;--> statement-breakpoint
ALTER TABLE "runtime_agent_state" ADD COLUMN "traffic_gateway_connections" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runtime_agent_state" ADD COLUMN "traffic_gateway_capacity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runtime_agent_state" ADD COLUMN "traffic_gateway_rejected" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runtime_agent_state" ADD COLUMN "traffic_gateway_shed" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runtime_agent_state" ADD COLUMN "traffic_gateway_fail_open_grants" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runtime_agent_state" ADD COLUMN "traffic_gateway_idle_timeouts" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runtime_agent_state" ADD COLUMN "traffic_gateway_health_probes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runtime_agent_state" ADD COLUMN "traffic_gateway_last_seen_at" timestamp with time zone;