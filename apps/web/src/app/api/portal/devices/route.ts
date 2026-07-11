import { createDeviceSchema } from "@noxroute/contracts";
import {
  auditLogs,
  db,
  devices,
  encryptedSecrets,
  runtimeCommands,
  subscriptionCredentials,
  vpnAccesses,
} from "@noxroute/db";
import { and, eq, ne, sql as drizzleSql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import {
  ApiError,
  apiErrorResponse,
  requireApiSession,
} from "@/lib/api-auth";
import {
  encryptSecret,
  generateSubscriptionToken,
  secretDigest,
} from "@/lib/secrets";
import { generateRealityShortId, generateSpiderX } from "@/lib/vless";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession(request, ["user"]);
    const input = createDeviceSchema.parse(await request.json());
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        drizzleSql`select pg_advisory_xact_lock(hashtext(${actor.session.user.id}))`,
      );

      const [access] = await tx
        .select()
        .from(vpnAccesses)
        .where(eq(vpnAccesses.userId, actor.session.user.id))
        .limit(1);
      if (!access) {
        throw new ApiError(403, "No VPN access is assigned to this account");
      }
      if (access.status !== "active") {
        throw new ApiError(403, "VPN access is not active");
      }
      if (access.expiresAt && access.expiresAt <= new Date()) {
        throw new ApiError(403, "VPN access has expired");
      }
      if (access.quotaBytes !== null && access.usedBytes >= access.quotaBytes) {
        throw new ApiError(403, "VPN quota has been reached");
      }

      const activeDevices = await tx
        .select({ id: devices.id })
        .from(devices)
        .where(
          and(
            eq(devices.vpnAccessId, access.id),
            ne(devices.status, "revoked"),
          ),
        );
      if (activeDevices.length >= access.maxDevices) {
        throw new ApiError(
          409,
          `The limit of ${access.maxDevices} registered devices has been reached`,
        );
      }

      const vlessUuid = crypto.randomUUID();
      const subscriptionToken = generateSubscriptionToken();
      const encryptedUuid = encryptSecret(vlessUuid);
      const encryptedToken = encryptSecret(subscriptionToken);
      const [uuidSecret] = await tx
        .insert(encryptedSecrets)
        .values({ kind: "vless_uuid", ...encryptedUuid })
        .returning({ id: encryptedSecrets.id });
      const [tokenSecret] = await tx
        .insert(encryptedSecrets)
        .values({ kind: "subscription_token", ...encryptedToken })
        .returning({ id: encryptedSecrets.id });
      if (!uuidSecret || !tokenSecret) {
        throw new Error("Device secrets could not be created");
      }

      const [device] = await tx
        .insert(devices)
        .values({
          vpnAccessId: access.id,
          name: input.name,
          platform: input.platform,
          profile: input.connectionProfile,
          vlessSecretId: uuidSecret.id,
          realityShortId: generateRealityShortId(input.connectionProfile),
          spiderX: generateSpiderX(input.connectionProfile),
        })
        .returning();
      if (!device) {
        throw new Error("Device could not be created");
      }

      await tx.insert(subscriptionCredentials).values({
        deviceId: device.id,
        tokenSecretId: tokenSecret.id,
        tokenDigest: secretDigest(subscriptionToken),
        tokenPrefix: subscriptionToken.slice(0, 8),
      });
      await tx.insert(runtimeCommands).values({
        type: "SYNC_DEVICE",
        payload: { deviceId: device.id, accessId: access.id },
        idempotencyKey: crypto.randomUUID(),
        requestedByUserId: actor.session.user.id,
      });
      await tx.insert(auditLogs).values({
        actorUserId: actor.session.user.id,
        action: "device.create",
        resourceType: "device",
        resourceId: device.id,
        result: "success",
        metadata: { name: device.name, profile: device.profile },
      });

      return {
        id: device.id,
        name: device.name,
        platform: device.platform,
        profile: device.profile,
        status: device.status,
      };
    });

    return Response.json({ device: result }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
