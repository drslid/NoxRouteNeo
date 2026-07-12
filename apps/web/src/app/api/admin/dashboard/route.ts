import type { NextRequest } from "next/server";

import { getAdminDashboard } from "@/data/dashboard";
import { apiErrorResponse, requireApiSession } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireApiSession(request, ["owner", "admin"]);
    return Response.json(await getAdminDashboard(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
