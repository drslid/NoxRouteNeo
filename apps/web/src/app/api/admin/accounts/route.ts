import { createAccountSchema } from "@noxroute/contracts";
import {
  auditLogs,
  db,
  instanceSettings,
  user,
  vpnAccesses,
} from "@noxroute/db";
import { auth } from "@noxroute/auth/server";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import {
  ApiError,
  apiErrorResponse,
  requireApiSession,
} from "@/lib/api-auth";
import { enqueueRuntimeCommand } from "@/lib/outbox";

function quotaBytes(gigabytes: number | null) {
  return gigabytes === null
    ? null
    : BigInt(Math.round(gigabytes * 1024 * 1024 * 1024));
}

export async function POST(request: NextRequest) {
  let createdUserId: string | null = null;

  try {
    const actor = await requireApiSession(request, ["owner", "admin"]);
    const input = createAccountSchema.parse(await request.json());

    if (input.role === "admin" && actor.role !== "owner") {
      throw new ApiError(403, "Only the owner can create an administrator");
    }

    const created = await auth.api.createUser({
      body: {
        name: input.displayName,
        email: `${crypto.randomUUID()}@noxroute.invalid`,
        password: input.password,
        role: input.role,
        data: {
          username: input.username,
          displayUsername: input.username,
        },
      },
    });
    createdUserId = created.user.id;

    await db
      .update(user)
      .set({
        username: input.username,
        displayUsername: input.username,
        role: input.role,
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(user.id, created.user.id));

    let accessId: string | null = null;
    if (input.role === "user") {
      const [settings] = await db.select().from(instanceSettings).limit(1);
      const expiresAt = input.maxDays
        ? new Date(Date.now() + input.maxDays * 24 * 60 * 60 * 1000)
        : null;
      const [access] = await db
        .insert(vpnAccesses)
        .values({
          userId: created.user.id,
          maxDevices: input.maxDevices ?? settings?.defaultMaxDevices ?? 2,
          expiresAt,
          quotaBytes: quotaBytes(input.maxGigabytes),
          speedLimitMbps:
            input.speedLimitMbps ?? settings?.defaultSpeedLimitMbps ?? 0,
        })
        .returning({ id: vpnAccesses.id });
      accessId = access?.id ?? null;

      await enqueueRuntimeCommand({
        type: "SYNC_ACCESS",
        payload: { userId: created.user.id, accessId },
        requestedByUserId: actor.session.user.id,
      });
    }

    await db.insert(auditLogs).values({
      actorUserId: actor.session.user.id,
      action: "account.create",
      resourceType: "user",
      resourceId: created.user.id,
      result: "success",
      metadata: { username: input.username, role: input.role },
    });

    return Response.json(
      { id: created.user.id, accessId, role: input.role },
      { status: 201 },
    );
  } catch (error) {
    if (createdUserId) {
      await db.delete(user).where(eq(user.id, createdUserId)).catch(() => undefined);
    }

    if (
      error instanceof Error &&
      (error.message.toLowerCase().includes("unique") ||
        error.message.toLowerCase().includes("already exists"))
    ) {
      return Response.json(
        { error: "This username is already in use" },
        { status: 409 },
      );
    }

    return apiErrorResponse(error);
  }
}
