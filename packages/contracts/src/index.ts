import { z } from "zod";

export const appRoleSchema = z.enum(["owner", "admin", "user"]);
export type AppRole = z.infer<typeof appRoleSchema>;

export const appLocaleSchema = z.enum([
  "en",
  "es",
  "fr",
  "de",
  "zh-CN",
  "ar",
  "ru",
  "pt",
  "hi",
  "ur",
]);
export type AppLocale = z.infer<typeof appLocaleSchema>;

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must contain at least 3 characters")
  .max(30, "Username must contain at most 30 characters")
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Username may only contain letters, numbers, dots, underscores and hyphens",
  )
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters")
  .max(128, "Password must contain at most 128 characters");

export const signInSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Password is required").max(128),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm the new password").max(128),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>;

export const confirmPasswordSchema = z.object({
  password: z.string().min(1, "Password is required").max(128),
});
export type ConfirmPasswordInput = z.infer<typeof confirmPasswordSchema>;

export const connectionProfileSchema = z.enum(["fast", "balanced", "stealth"]);
export type ConnectionProfile = z.infer<typeof connectionProfileSchema>;

export const accountStatusSchema = z.enum([
  "active",
  "suspended",
  "expired",
  "quota_exceeded",
]);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

const nullablePositiveNumber = z.number().positive().finite().nullable();

export const createAccountSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(["admin", "user"]),
  maxDevices: z.number().int().min(1).max(50),
  maxDays: z.number().int().positive().max(3650).nullable(),
  maxGigabytes: nullablePositiveNumber,
  speedLimitMbps: z.number().int().min(0).max(1000),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  status: z.enum(["active", "suspended"]),
  maxDevices: z.number().int().min(1).max(50),
  maxDays: z.number().int().positive().max(3650).nullable(),
  maxGigabytes: nullablePositiveNumber,
  speedLimitMbps: z.number().int().min(0).max(1000),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const resetAccountPasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1).max(128),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ResetAccountPasswordInput = z.infer<
  typeof resetAccountPasswordSchema
>;

export const updateInstanceSettingsSchema = z.object({
  appLocale: appLocaleSchema,
  adminDomain: z.string().trim().min(3).max(253),
  vpnDomain: z.string().trim().min(3).max(253),
  adminHttpsPort: z.number().int().min(1).max(65535),
  vpnPort: z.literal(443),
  xhttpPath: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^\/[a-zA-Z0-9/_-]+$/, "XHTTP path must start with /"),
  realityTarget: z.string().trim().min(3).max(260),
  realityServerName: z.string().trim().min(3).max(253),
  defaultConnectionProfile: connectionProfileSchema,
  defaultMaxDevices: z.number().int().min(1).max(50),
  defaultMaxDays: z.number().int().positive().max(3650).nullable(),
  defaultMaxGigabytes: nullablePositiveNumber,
  defaultSpeedLimitMbps: z.number().int().min(0).max(1000),
  serverBandwidthLimitPercent: z.number().int().min(25).max(100),
  serverBandwidthMbps: z.number().int().positive().max(100_000).nullable(),
  subscriptionEnabled: z.boolean(),
  enforceQuota: z.boolean(),
  enforceExpiry: z.boolean(),
  telemetryIntervalSeconds: z.number().int().min(10).max(3600),
  duckdnsToken: z
    .string()
    .trim()
    .max(256)
    .refine(
      (value) => value === "" || value.length >= 20,
      "DuckDNS token is too short",
    )
    .optional(),
});
export type UpdateInstanceSettingsInput = z.infer<
  typeof updateInstanceSettingsSchema
>;

export const setupBootstrapSchema = z.object({
  appLocale: appLocaleSchema.default("en"),
  ownerUsername: usernameSchema,
  ownerPassword: passwordSchema,
  ownerName: z.string().trim().min(2).max(80),
  adminDomain: z.string().trim().min(3).max(253),
  vpnDomain: z.string().trim().min(3).max(253),
  adminHttpsPort: z.number().int().min(1).max(65535),
  duckdnsToken: z.string().trim().min(20).max(256).optional(),
});
export type SetupBootstrapInput = z.infer<typeof setupBootstrapSchema>;

export const updateVpnAccessSchema = z.object({
  status: accountStatusSchema,
  maxDevices: z.number().int().min(1).max(50),
  expiresAt: z.coerce.date().nullable(),
  quotaBytes: z.bigint().positive().nullable(),
  speedLimitMbps: z.number().int().min(0).max(1000),
});
export type UpdateVpnAccessInput = z.infer<typeof updateVpnAccessSchema>;

export const createDeviceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  platform: z.enum(["ios", "android", "desktop", "other"]),
  connectionProfile: connectionProfileSchema,
});
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

export const updateDeviceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  platform: z.enum(["ios", "android", "desktop", "other"]),
  connectionProfile: connectionProfileSchema,
});
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  search: z.string().trim().max(100).default(""),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export const runtimeCommandTypeSchema = z.enum([
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
export type RuntimeCommandType = z.infer<typeof runtimeCommandTypeSchema>;

export const runtimeCommandStatusSchema = z.enum([
  "pending",
  "processing",
  "retrying",
  "succeeded",
  "failed",
  "cancelled",
]);
export type RuntimeCommandStatus = z.infer<typeof runtimeCommandStatusSchema>;

export const runtimeCommandSchema = z.object({
  type: runtimeCommandTypeSchema,
  idempotencyKey: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type RuntimeCommandInput = z.infer<typeof runtimeCommandSchema>;

export const metricPointSchema = z.object({
  timestamp: z.string().datetime(),
  uplinkBytes: z.number().nonnegative(),
  downlinkBytes: z.number().nonnegative(),
  activeConnections: z.number().int().nonnegative(),
  xrayCpuPercent: z.number().nonnegative(),
  xrayMemoryBytes: z.number().nonnegative(),
});
export type MetricPoint = z.infer<typeof metricPointSchema>;
