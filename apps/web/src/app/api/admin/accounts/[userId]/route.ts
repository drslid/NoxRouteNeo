import { updateAccountSchema } from "@noxroute/contracts";
import {
  auditLogs,
  db,
  devices,
  runtimeCommands,
  session,
  user,
  vpnAccesses,
} from "@noxroute/db";
import { asc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import {
  ApiError,
  apiErrorResponse,
  requireApiSession,
} from "@/lib/api-auth";

function quotaBytes(gigabytes: number | null) {
  return gigabytes === null
    ? null
    : BigInt(Math.round(gigabytes * 1024 * 1024 * 1024));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const actor = await requireApiSession(request, ["owner", "admin"]);
    const { userId } = await params;
    const input = updateAccountSchema.parse(await request.json());
    const [target] = await db.select().from(user).where(eq(user.id, userId)).limit(1);

    if (!target) {
      throw new ApiError(404, "Account not found");
    }
    if (target.role !== "user" && actor.role !== "owner") {
      throw new ApiError(403, "Only the owner can update an administrator");
    }
    if (target.id === actor.session.user.id && input.status === "suspended") {
      throw new ApiError(400, "You cannot suspend your own account");
    }

    const expiresAt = input.maxDays
      ? new Date(Date.now() + input.maxDays * 24 * 60 * 60 * 1000)
      : null;

    await db.transaction(async (tx) => {
      await tx
        .update(user)
        .set({
          name: input.displayName,
          banned: input.status === "suspended",
          banReason: input.status === "suspended" ? "Suspended by administrator" : null,
          banExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(user.id, userId));

      if (input.status === "suspended") {
        await tx.delete(session).where(eq(session.userId, userId));
      }

      if (target.role === "user") {
        const [access] = await tx
          .update(vpnAccesses)
          .set({
            status: input.status === "active" ? "active" : "suspended",
            maxDevices: input.maxDevices,
            expiresAt,
            quotaBytes: quotaBytes(input.maxGigabytes),
            speedLimitMbps: input.speedLimitMbps,
            disabledReason:
              input.status === "suspended" ? "Suspended by administrator" : null,
            updatedAt: new Date(),
          })
          .where(eq(vpnAccesses.userId, userId))
          .returning({ id: vpnAccesses.id });

        if (access) {
          const registeredDevices = await tx
            .select({ id: devices.id, status: devices.status })
            .from(devices)
            .where(eq(devices.vpnAccessId, access.id))
            .orderBy(asc(devices.createdAt));
          for (const [index, device] of registeredDevices
            .filter((item) => item.status !== "revoked")
            .entries()) {
            const nextStatus =
              index < input.maxDevices
                ? device.status === "blocked_by_limit"
                  ? "active"
                  : device.status
                : device.status === "active"
                  ? "blocked_by_limit"
                  : device.status;
            if (nextStatus !== device.status) {
              await tx
                .update(devices)
                .set({
                  status: nextStatus,
                  activeConnections: 0,
                  updatedAt: new Date(),
                })
                .where(eq(devices.id, device.id));
            }
          }
        }

        await tx.insert(runtimeCommands).values({
          type: "SYNC_ACCESS",
          payload: { userId },
          idempotencyKey: crypto.randomUUID(),
          requestedByUserId: actor.session.user.id,
        });
      }

      await tx.insert(auditLogs).values({
        actorUserId: actor.session.user.id,
        action: "account.update",
        resourceType: "user",
        resourceId: userId,
        result: "success",
        metadata: { username: target.username ?? "unknown", status: input.status },
      });
    });

    return Response.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
