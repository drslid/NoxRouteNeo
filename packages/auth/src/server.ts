import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db, schema } from "@noxroute/db";
import { betterAuth } from "better-auth";
import { admin, twoFactor, username } from "better-auth/plugins";

import { accessControl, appRoles } from "./permissions";

const authUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const authSecret = process.env.BETTER_AUTH_SECRET;

if (!authSecret || authSecret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
}

export const auth = betterAuth({
  appName: "NoxRouteNeo",
  baseURL: authUrl,
  secret: authSecret,
  trustedOrigins: [authUrl],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    expiresIn: 60 * 60,
    disableSessionRefresh: true,
    freshAge: 5 * 60,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/username": { window: 60, max: 5 },
      "/two-factor/*": { window: 60, max: 5 },
    },
  },
  disabledPaths: [
    "/sign-up/email",
    "/is-username-available",
    "/admin/impersonate-user",
    "/admin/stop-impersonating",
  ],
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (value) => /^[a-zA-Z0-9._-]+$/.test(value),
      usernameNormalization: (value) => value.trim().toLowerCase(),
    }),
    admin({
      ac: accessControl,
      roles: appRoles,
      defaultRole: "user",
      adminRoles: ["owner", "admin"],
      bannedUserMessage: "This account is suspended.",
    }),
    twoFactor({
      issuer: "NoxRouteNeo",
      twoFactorCookieMaxAge: 5 * 60,
      trustDeviceMaxAge: 0,
      accountLockout: {
        enabled: true,
        maxFailedAttempts: 5,
        durationSeconds: 15 * 60,
      },
    }),
  ],
  advanced: {
    useSecureCookies: authUrl.startsWith("https://"),
    cookiePrefix: "noxroute",
  },
  telemetry: {
    enabled: false,
  },
});

export type AuthSession = typeof auth.$Infer.Session;
