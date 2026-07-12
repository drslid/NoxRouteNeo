import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const vpnAccessStatus = pgEnum("vpn_access_status", [
  "active",
  "suspended",
  "expired",
  "quota_exceeded",
]);

export const deviceStatus = pgEnum("device_status", [
  "active",
  "disabled",
  "blocked_by_limit",
  "revoked",
]);

export const devicePlatform = pgEnum("device_platform", [
  "ios",
  "android",
  "desktop",
  "other",
]);

export const connectionProfile = pgEnum("connection_profile", [
  "fast",
  "balanced",
  "stealth",
]);

export const runtimeCommandType = pgEnum("runtime_command_type", [
  "SYNC_XRAY_CONFIG",
  "SYNC_ACCESS",
  "SYNC_DEVICE",
  "REVOKE_DEVICE",
  "UPDATE_DUCKDNS",
  "RELOAD_CADDY",
  "RUN_HEALTHCHECK",
  "FINALIZE_SETUP",
  "CREATE_BACKUP",
  "RESTORE_BACKUP",
  "UNINSTALL_INSTANCE",
]);

export const runtimeCommandStatus = pgEnum("runtime_command_status", [
  "pending",
  "processing",
  "retrying",
  "succeeded",
  "failed",
  "cancelled",
]);

export const runtimeJobStatus = pgEnum("runtime_job_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const secretKind = pgEnum("secret_kind", [
  "duckdns_token",
  "reality_private_key",
  "vless_uuid",
  "subscription_token",
]);

export const instanceSettings = pgTable("instance_settings", {
  id: text("id").primaryKey().default("default"),
  configured: boolean("configured").notNull().default(false),
  appLocale: text("app_locale").notNull().default("en"),
  adminDomain: text("admin_domain"),
  vpnDomain: text("vpn_domain"),
  adminHttpsPort: integer("admin_https_port").notNull().default(8443),
  vpnPort: integer("vpn_port").notNull().default(443),
  xhttpPath: text("xhttp_path").notNull().default("/noxroute"),
  realityTarget: text("reality_target")
    .notNull()
    .default("www.speedtest.net:443"),
  realityServerName: text("reality_server_name")
    .notNull()
    .default("www.speedtest.net"),
  realityPublicKey: text("reality_public_key"),
  defaultConnectionProfile: connectionProfile("default_connection_profile")
    .notNull()
    .default("balanced"),
  defaultMaxDevices: integer("default_max_devices").notNull().default(2),
  defaultMaxDays: integer("default_max_days"),
  defaultQuotaBytes: bigint("default_quota_bytes", { mode: "bigint" }),
  defaultSpeedLimitMbps: integer("default_speed_limit_mbps")
    .notNull()
    .default(0),
  serverBandwidthLimitPercent: integer("server_bandwidth_limit_percent")
    .notNull()
    .default(90),
  serverBandwidthMbps: integer("server_bandwidth_mbps"),
  subscriptionEnabled: boolean("subscription_enabled").notNull().default(true),
  enforceQuota: boolean("enforce_quota").notNull().default(true),
  enforceExpiry: boolean("enforce_expiry").notNull().default(true),
  telemetryIntervalSeconds: integer("telemetry_interval_seconds")
    .notNull()
    .default(30),
  setupLockedAt: timestamp("setup_locked_at", {
    withTimezone: true,
    mode: "date",
  }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const encryptedSecrets = pgTable(
  "encrypted_secrets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: secretKind("kind").notNull(),
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    rotatedAt: timestamp("rotated_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [index("encrypted_secrets_kind_idx").on(table.kind)],
);

export const vpnAccesses = pgTable(
  "vpn_accesses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: vpnAccessStatus("status").notNull().default("active"),
    quotaBytes: bigint("quota_bytes", { mode: "bigint" }),
    usedBytes: bigint("used_bytes", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    connectedSeconds: bigint("connected_seconds", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    activeConnections: integer("active_connections").notNull().default(0),
    maxDevices: integer("max_devices").notNull().default(2),
    speedLimitMbps: integer("speed_limit_mbps").notNull().default(0),
    disabledReason: text("disabled_reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("vpn_accesses_user_id_uidx").on(table.userId),
    index("vpn_accesses_status_idx").on(table.status),
  ],
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vpnAccessId: uuid("vpn_access_id")
      .notNull()
      .references(() => vpnAccesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    platform: devicePlatform("platform").notNull().default("other"),
    status: deviceStatus("status").notNull().default("active"),
    profile: connectionProfile("profile").notNull().default("balanced"),
    vlessSecretId: uuid("vless_secret_id").references(
      () => encryptedSecrets.id,
      { onDelete: "restrict" },
    ),
    realityShortId: text("reality_short_id").notNull(),
    spiderX: text("spider_x"),
    activeConnections: integer("active_connections").notNull().default(0),
    usedBytes: bigint("used_bytes", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    connectedSeconds: bigint("connected_seconds", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("devices_vpn_access_id_idx").on(table.vpnAccessId),
    index("devices_status_idx").on(table.status),
    uniqueIndex("devices_reality_short_id_uidx").on(table.realityShortId),
  ],
);

export const subscriptionCredentials = pgTable(
  "subscription_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    tokenSecretId: uuid("token_secret_id")
      .notNull()
      .references(() => encryptedSecrets.id, { onDelete: "restrict" }),
    tokenDigest: text("token_digest").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", {
      withTimezone: true,
      mode: "date",
    }),
    hwidDigest: text("hwid_digest"),
    hwidBoundAt: timestamp("hwid_bound_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastIpAddress: text("last_ip_address"),
    lastUserAgent: text("last_user_agent"),
    lastDevicePlatform: text("last_device_platform"),
    lastDeviceModel: text("last_device_model"),
    lastDeviceOs: text("last_device_os"),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("subscription_credentials_device_id_uidx").on(table.deviceId),
    uniqueIndex("subscription_credentials_digest_uidx").on(table.tokenDigest),
    index("subscription_credentials_hwid_idx").on(table.hwidDigest),
  ],
);

export const runtimeAgentState = pgTable("runtime_agent_state", {
  id: text("id").primaryKey().default("default"),
  status: text("status").notNull().default("starting"),
  version: text("version"),
  xrayRunning: boolean("xray_running").notNull().default(false),
  configRevision: integer("config_revision").notNull().default(0),
  lastHeartbeatAt: timestamp("last_heartbeat_at", {
    withTimezone: true,
    mode: "date",
  }),
  lastSyncAt: timestamp("last_sync_at", {
    withTimezone: true,
    mode: "date",
  }),
  lastTelemetryAt: timestamp("last_telemetry_at", {
    withTimezone: true,
    mode: "date",
  }),
  trafficGatewayStatus: text("traffic_gateway_status")
    .notNull()
    .default("starting"),
  trafficGatewayConnections: integer("traffic_gateway_connections")
    .notNull()
    .default(0),
  trafficGatewayCapacity: integer("traffic_gateway_capacity")
    .notNull()
    .default(0),
  trafficGatewayRejected: bigint("traffic_gateway_rejected", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  trafficGatewayShed: bigint("traffic_gateway_shed", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  trafficGatewayFailOpenGrants: bigint("traffic_gateway_fail_open_grants", {
    mode: "bigint",
  })
    .notNull()
    .default(sql`0`),
  trafficGatewayIdleTimeouts: bigint("traffic_gateway_idle_timeouts", {
    mode: "bigint",
  })
    .notNull()
    .default(sql`0`),
  trafficGatewayHealthProbes: bigint("traffic_gateway_health_probes", {
    mode: "bigint",
  })
    .notNull()
    .default(sql`0`),
  trafficGatewayLastSeenAt: timestamp("traffic_gateway_last_seen_at", {
    withTimezone: true,
    mode: "date",
  }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const usageSamples = pgTable(
  "usage_samples",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    vpnAccessId: uuid("vpn_access_id")
      .notNull()
      .references(() => vpnAccesses.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").references(() => devices.id, {
      onDelete: "cascade",
    }),
    uplinkBytes: bigint("uplink_bytes", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    downlinkBytes: bigint("downlink_bytes", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    activeConnections: integer("active_connections").notNull().default(0),
    sampledAt: timestamp("sampled_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("usage_samples_access_time_idx").on(
      table.vpnAccessId,
      table.sampledAt,
    ),
    index("usage_samples_device_time_idx").on(table.deviceId, table.sampledAt),
  ],
);

export const instanceMetricSamples = pgTable(
  "instance_metric_samples",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    uplinkBytes: bigint("uplink_bytes", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    downlinkBytes: bigint("downlink_bytes", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    activeConnections: integer("active_connections").notNull().default(0),
    xrayCpuBasisPoints: integer("xray_cpu_basis_points").notNull().default(0),
    xrayMemoryBytes: bigint("xray_memory_bytes", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    sampledAt: timestamp("sampled_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("instance_metric_samples_time_idx").on(table.sampledAt)],
);

export const runtimeJobs = pgTable(
  "runtime_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: text("kind").notNull(),
    status: runtimeJobStatus("status").notNull().default("pending"),
    requestedByUserId: text("requested_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("runtime_jobs_status_idx").on(table.status)],
);

export const runtimeJobSteps = pgTable(
  "runtime_job_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => runtimeJobs.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    status: runtimeJobStatus("status").notNull().default("pending"),
    message: text("message"),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    uniqueIndex("runtime_job_steps_job_position_uidx").on(
      table.jobId,
      table.position,
    ),
  ],
);

export const runtimeCommands = pgTable(
  "runtime_commands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: runtimeCommandType("type").notNull(),
    status: runtimeCommandStatus("status").notNull().default("pending"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestedByUserId: text("requested_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    jobId: uuid("job_id").references(() => runtimeJobs.id, {
      onDelete: "set null",
    }),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    lockedBy: text("locked_by"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("runtime_commands_idempotency_key_uidx").on(
      table.idempotencyKey,
    ),
    index("runtime_commands_queue_idx").on(table.status, table.availableAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    result: text("result").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_actor_idx").on(table.actorUserId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);

export const securityEvents = pgTable(
  "security_events",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    ipAddress: text("ip_address").notNull(),
    kind: text("kind").notNull(),
    outcome: text("outcome").notNull(),
    route: text("route"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("security_events_created_at_idx").on(table.createdAt),
    index("security_events_ip_created_at_idx").on(
      table.ipAddress,
      table.createdAt,
    ),
    index("security_events_kind_created_at_idx").on(
      table.kind,
      table.createdAt,
    ),
  ],
);

export const ipBans = pgTable(
  "ip_bans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ipAddress: text("ip_address").notNull(),
    source: text("source").notNull().default("manual"),
    reason: text("reason").notNull(),
    permanent: boolean("permanent").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    releasedAt: timestamp("released_at", {
      withTimezone: true,
      mode: "date",
    }),
    releasedByUserId: text("released_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ip_bans_ip_address_uidx").on(table.ipAddress),
    index("ip_bans_expires_at_idx").on(table.expiresAt),
    index("ip_bans_last_seen_at_idx").on(table.lastSeenAt),
  ],
);
