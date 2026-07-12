import { updateOwnLocaleSchema } from "@noxroute/contracts";
import { db, user } from "@noxroute/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { apiErrorResponse, requireApiSession } from "@/lib/api-auth";

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireApiSession(request, ["user"]);
    const input = updateOwnLocaleSchema.parse(await request.json());

    await db
      .update(user)
      .set({ locale: input.locale, updatedAt: new Date() })
      .where(eq(user.id, actor.session.user.id));

    return Response.json(
      { locale: input.locale },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
