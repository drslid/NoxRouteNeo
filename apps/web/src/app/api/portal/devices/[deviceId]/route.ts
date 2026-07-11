import { updateDeviceSchema } from "@noxroute/contracts";
import {
  auditLogs,
  db,
  devices,
  runtimeCommands,
  subscriptionCredentials,
  vpnAccesses,
} from "@noxroute/db";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import {
  ApiError,
  apiErrorResponse,
  requireApiSession,
} from "@/lib/api-auth";
import { generateRealityShortId, generateSpiderX } from "@/lib/vless";

async function ownedDevice(userId: string, deviceId: string) {
  const [record] = await db
    .select({ device: devices, access: vpnAccesses })
    .from(devices)
    .innerJoin(vpnAccesses, eq(devices.vpnAccessId, vpnAccesses.id))
    .where(and(eq(devices.id, deviceId), eq(vpnAccesses.userId, userId)))
    .limit(1);

  if (!record) {
    throw new ApiError(404, "Device not found");
  }
  return record;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  try {
    const actor = await requireApiSession(request, ["user"]);
    const { deviceId } = await params;
    const input = updateDeviceSchema.parse(await request.json());
    const record = await ownedDevice(actor.session.user.id, deviceId);
    if (record.device.status === "revoked") {
      throw new ApiError(409, "A revoked device cannot be updated");
    }

    await db.transaction(async (tx) => {
      await tx
        .update(devices)
        .set({
          name: input.name,
          platform: input.platform,
          profile: input.connectionProfile,
          realityShortId:
            record.device.profile === input.connectionProfile
              ? record.device.realityShortId
              : generateRealityShortId(input.connectionProfile),
          spiderX: generateSpiderX(input.connectionProfile),
          updatedAt: new Date(),
        })
        .where(eq(devices.id, deviceId));
      await tx.insert(runtimeCommands).values({
        type: "SYNC_DEVICE",
        payload: { deviceId, accessId: record.access.id },
        idempotencyKey: crypto.randomUUID(),
        requestedByUserId: actor.session.user.id,
      });
      await tx.insert(auditLogs).values({
        actorUserId: actor.session.user.id,
        action: "device.update",
        resourceType: "device",
        resourceId: deviceId,
        result: "success",
        metadata: { name: input.name, profile: input.connectionProfile },
      });
    });

    return Response.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  try {
    const actor = await requireApiSession(request, ["user"]);
    const { deviceId } = await params;
    const record = await ownedDevice(actor.session.user.id, deviceId);

    await db.transaction(async (tx) => {
      await tx
        .update(devices)
        .set({ status: "revoked", activeConnections: 0, updatedAt: new Date() })
        .where(eq(devices.id, deviceId));
      await tx
        .update(subscriptionCredentials)
        .set({ revokedAt: new Date() })
        .where(eq(subscriptionCredentials.deviceId, deviceId));
      await tx.insert(runtimeCommands).values({
        type: "REVOKE_DEVICE",
        payload: { deviceId, accessId: record.access.id },
        idempotencyKey: crypto.randomUUID(),
        requestedByUserId: actor.session.user.id,
      });
      await tx.insert(auditLogs).values({
        actorUserId: actor.session.user.id,
        action: "device.revoke",
        resourceType: "device",
        resourceId: deviceId,
        result: "success",
        metadata: { name: record.device.name },
      });
    });

    return Response.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
