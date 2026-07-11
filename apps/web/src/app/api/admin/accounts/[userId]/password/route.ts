import { resetAccountPasswordSchema } from "@noxroute/contracts";
import { account, auditLogs, db, session, user } from "@noxroute/db";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import {
  ApiError,
  apiErrorResponse,
  requireApiSession,
} from "@/lib/api-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const actor = await requireApiSession(request, ["owner", "admin"]);
    const { userId } = await params;
    const input = resetAccountPasswordSchema.parse(await request.json());
    const [target] = await db
      .select({ id: user.id, role: user.role, username: user.username })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!target) {
      throw new ApiError(404, "Account not found");
    }
    if (target.id === actor.session.user.id) {
      throw new ApiError(400, "Use the Security page to change your own password");
    }
    if (target.role !== "user" && actor.role !== "owner") {
      throw new ApiError(403, "Only the owner can reset an administrator password");
    }

    const hashedPassword = await hashPassword(input.newPassword);
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(account)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(
          and(
            eq(account.userId, userId),
            eq(account.providerId, "credential"),
          ),
        )
        .returning({ id: account.id });
      if (updated.length !== 1) {
        throw new ApiError(409, "Credential account is missing or duplicated");
      }
      await tx.delete(session).where(eq(session.userId, userId));
      await tx.insert(auditLogs).values({
        actorUserId: actor.session.user.id,
        action: "account.password_reset",
        resourceType: "user",
        resourceId: userId,
        result: "success",
        metadata: {
          username: target.username ?? "unknown",
          sessionsRevoked: true,
        },
      });
    });

    return Response.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
