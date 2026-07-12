import { updateInstanceSettingsSchema } from "@noxroute/contracts";
import {
  auditLogs,
  db,
  encryptedSecrets,
  instanceSettings,
  runtimeCommands,
} from "@noxroute/db";
import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { apiErrorResponse, requireApiSession } from "@/lib/api-auth";
import { encryptSecret } from "@/lib/secrets";

function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[:/].*$/, "");
}

function quotaBytes(gigabytes: number | null) {
  return gigabytes === null
    ? null
    : BigInt(Math.round(gigabytes * 1024 * 1024 * 1024));
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireApiSession(request, ["owner", "admin"]);
    const payload = (await request.json()) as Record<string, unknown>;
    const input = updateInstanceSettingsSchema.parse({
      ...payload,
      defaultMaxDays: payload.defaultMaxDays ?? null,
      defaultMaxGigabytes: payload.defaultMaxGigabytes ?? null,
    });
    const adminDomain = normalizeDomain(input.adminDomain);
    const vpnDomain = normalizeDomain(input.vpnDomain);
    const duckdnsToken = input.duckdnsToken?.trim() || null;

    await db.transaction(async (tx) => {
      await tx
        .insert(instanceSettings)
        .values({
          id: "default",
          configured: true,
          appLocale: input.appLocale,
          adminDomain,
          vpnDomain,
          adminHttpsPort: input.adminHttpsPort,
          vpnPort: 443,
          xhttpPath: input.xhttpPath,
          realityTarget: input.realityTarget,
          realityServerName: input.realityServerName,
          defaultConnectionProfile: input.defaultConnectionProfile,
          defaultMaxDevices: input.defaultMaxDevices,
          defaultMaxDays: input.defaultMaxDays,
          defaultQuotaBytes: quotaBytes(input.defaultMaxGigabytes),
          defaultSpeedLimitMbps: input.defaultSpeedLimitMbps,
          serverBandwidthLimitPercent: input.serverBandwidthLimitPercent,
          serverBandwidthMbps: input.serverBandwidthMbps,
          subscriptionEnabled: input.subscriptionEnabled,
          enforceQuota: input.enforceQuota,
          enforceExpiry: input.enforceExpiry,
          telemetryIntervalSeconds: input.telemetryIntervalSeconds,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: instanceSettings.id,
          set: {
            configured: true,
            appLocale: input.appLocale,
            adminDomain,
            vpnDomain,
            adminHttpsPort: input.adminHttpsPort,
            vpnPort: 443,
            xhttpPath: input.xhttpPath,
            realityTarget: input.realityTarget,
            realityServerName: input.realityServerName,
            defaultConnectionProfile: input.defaultConnectionProfile,
            defaultMaxDevices: input.defaultMaxDevices,
            defaultMaxDays: input.defaultMaxDays,
            defaultQuotaBytes: quotaBytes(input.defaultMaxGigabytes),
            defaultSpeedLimitMbps: input.defaultSpeedLimitMbps,
            serverBandwidthLimitPercent: input.serverBandwidthLimitPercent,
            serverBandwidthMbps: input.serverBandwidthMbps,
            subscriptionEnabled: input.subscriptionEnabled,
            enforceQuota: input.enforceQuota,
            enforceExpiry: input.enforceExpiry,
            telemetryIntervalSeconds: input.telemetryIntervalSeconds,
            updatedAt: new Date(),
          },
        });

      await tx.insert(runtimeCommands).values({
        type: "SYNC_XRAY_CONFIG",
        payload: { reason: "instance_settings_updated" },
        idempotencyKey: crypto.randomUUID(),
        requestedByUserId: actor.session.user.id,
      });

      if (duckdnsToken) {
        const encrypted = encryptSecret(duckdnsToken);
        await tx
          .update(encryptedSecrets)
          .set({ rotatedAt: new Date() })
          .where(
            and(
              eq(encryptedSecrets.kind, "duckdns_token"),
              isNull(encryptedSecrets.rotatedAt),
            ),
          );
        await tx.insert(encryptedSecrets).values({
          kind: "duckdns_token",
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
        });
        await tx.insert(runtimeCommands).values({
          type: "UPDATE_DUCKDNS",
          payload: { reason: "duckdns_token_rotated" },
          idempotencyKey: crypto.randomUUID(),
          requestedByUserId: actor.session.user.id,
        });
      }

      await tx.insert(auditLogs).values({
        actorUserId: actor.session.user.id,
        action: "instance.settings_update",
        resourceType: "instance",
        resourceId: "default",
        result: "success",
        metadata: {
          adminDomain,
          vpnDomain,
          vpnPort: 443,
          appLocale: input.appLocale,
          duckdnsTokenUpdated: Boolean(duckdnsToken),
        },
      });
    });

    return Response.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
