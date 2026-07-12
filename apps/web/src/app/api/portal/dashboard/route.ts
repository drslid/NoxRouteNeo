import type { NextRequest } from "next/server";

import { getPortalDashboard } from "@/data/portal";
import { apiErrorResponse, requireApiSession } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireApiSession(request, ["user"]);
    return Response.json(await getPortalDashboard(actor.session.user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
