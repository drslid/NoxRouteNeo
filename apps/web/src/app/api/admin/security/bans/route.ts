import { createIpBanSchema } from "@noxroute/contracts";
import { auditLogs, db, ipBans } from "@noxroute/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { ApiError, apiErrorResponse, requireApiSession } from "@/lib/api-auth";
import {
  AUTOMATIC_BAN_HOURS,
  isPublicIpAddress,
  normalizeIpAddress,
} from "@/lib/network-security";
import { requestAddress } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireApiSession(request, ["owner", "admin"]);
    const input = createIpBanSchema.parse(await request.json());
    const address = normalizeIpAddress(input.ipAddress);
    if (!address || !isPublicIpAddress(address)) {
      throw new ApiError(400, "Enter a valid public IPv4 or IPv6 address");
    }
    if (address === normalizeIpAddress(requestAddress(request))) {
      throw new ApiError(409, "You cannot ban the IP address of this session");
    }

    const now = new Date();
    const expiresAt = input.permanent
      ? null
      : new Date(now.getTime() + AUTOMATIC_BAN_HOURS * 60 * 60_000);
    await db.transaction(async (tx) => {
      await tx
        .insert(ipBans)
        .values({
          ipAddress: address,
          source: "manual",
          reason: input.reason,
          permanent: input.permanent,
          expiresAt,
          createdByUserId: actor.session.user.id,
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: ipBans.ipAddress,
          set: {
            source: "manual",
            reason: input.reason,
            permanent: input.permanent,
            expiresAt,
            createdByUserId: actor.session.user.id,
            releasedAt: null,
            releasedByUserId: null,
            updatedAt: now,
          },
        });
      await tx.insert(auditLogs).values({
        actorUserId: actor.session.user.id,
        action: input.permanent
          ? "security.ip_ban_permanent"
          : "security.ip_ban",
        resourceType: "ip_address",
        resourceId: address,
        result: "success",
        metadata: { reason: input.reason, permanent: input.permanent },
      });
    });

    const [ban] = await db
      .select()
      .from(ipBans)
      .where(eq(ipBans.ipAddress, address))
      .limit(1);
    return Response.json({ ban }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
