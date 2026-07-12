import { describe, expect, it } from "vitest";

import {
  appLocaleSchema,
  createAccountSchema,
  runtimeCommandSchema,
  signInSchema,
  updateInstanceSettingsSchema,
  updateOwnLocaleSchema,
} from "./index";

describe("shared contracts", () => {
  it("normalizes usernames", () => {
    const result = signInSchema.parse({
      username: "  Alice.Admin  ",
      password: "valid-password",
    });

    expect(result.username).toBe("alice.admin");
  });

  it("rejects weak account passwords", () => {
    const result = createAccountSchema.safeParse({
      displayName: "Alice",
      username: "alice",
      password: "too-short",
      role: "user",
    });

    expect(result.success).toBe(false);
  });

  it("rejects arbitrary runtime commands", () => {
    const result = runtimeCommandSchema.safeParse({
      type: "RUN_SHELL",
      idempotencyKey: crypto.randomUUID(),
      payload: { command: "rm -rf /" },
    });

    expect(result.success).toBe(false);
  });

  it("accepts only supported instance locales", () => {
    expect(appLocaleSchema.options).toEqual([
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
    expect(appLocaleSchema.safeParse("en-US").success).toBe(false);
    expect(updateOwnLocaleSchema.safeParse({ locale: "fr" }).success).toBe(
      true,
    );
    expect(updateOwnLocaleSchema.safeParse({ locale: "en-US" }).success).toBe(
      false,
    );
  });

  it("accepts unlimited instance duration and quota", () => {
    const result = updateInstanceSettingsSchema.safeParse({
      appLocale: "en",
      adminDomain: "admin.duckdns.org",
      vpnDomain: "vpn.duckdns.org",
      adminHttpsPort: 8443,
      vpnPort: 443,
      xhttpPath: "/noxroute",
      realityTarget: "www.speedtest.net:443",
      realityServerName: "www.speedtest.net",
      defaultConnectionProfile: "balanced",
      defaultMaxDevices: 2,
      defaultMaxDays: null,
      defaultMaxGigabytes: null,
      defaultSpeedLimitMbps: 0,
      serverBandwidthLimitPercent: 90,
      serverBandwidthMbps: null,
      subscriptionEnabled: true,
      enforceQuota: true,
      enforceExpiry: true,
      telemetryIntervalSeconds: 30,
    });

    expect(result.success).toBe(true);
  });
});
