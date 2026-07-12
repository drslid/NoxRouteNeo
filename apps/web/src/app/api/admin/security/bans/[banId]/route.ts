import { updateIpBanSchema } from "@noxroute/contracts";
import { auditLogs, db, ipBans } from "@noxroute/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { ApiError, apiErrorResponse, requireApiSession } from "@/lib/api-auth";
import { AUTOMATIC_BAN_HOURS } from "@/lib/network-security";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ banId: string }> },
) {
  try {
    const actor = await requireApiSession(request, ["owner", "admin"]);
    const input = updateIpBanSchema.parse(await request.json());
    const { banId } = await params;
    const [existing] = await db
      .select()
      .from(ipBans)
      .where(eq(ipBans.id, banId))
      .limit(1);
    if (!existing) throw new ApiError(404, "IP ban not found");

    const now = new Date();
    const update =
      input.action === "release"
        ? {
            releasedAt: now,
            releasedByUserId: actor.session.user.id,
            updatedAt: now,
          }
        : {
            permanent: input.action === "permanent",
            expiresAt:
              input.action === "permanent"
                ? null
                : new Date(now.getTime() + AUTOMATIC_BAN_HOURS * 60 * 60_000),
            releasedAt: null,
            releasedByUserId: null,
            updatedAt: now,
          };

    await db.transaction(async (tx) => {
      await tx.update(ipBans).set(update).where(eq(ipBans.id, banId));
      await tx.insert(auditLogs).values({
        actorUserId: actor.session.user.id,
        action: `security.ip_ban_${input.action}`,
        resourceType: "ip_address",
        resourceId: existing.ipAddress,
        result: "success",
        metadata: { previousPermanent: existing.permanent },
      });
    });
    return Response.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
