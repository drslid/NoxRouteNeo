import type { NextRequest } from "next/server";

import { getOwnedDeviceConnection } from "@/data/connections";
import { apiErrorResponse, requireApiSession } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  try {
    const actor = await requireApiSession(request, ["user"]);
    const { deviceId } = await params;
    const connection = await getOwnedDeviceConnection(
      actor.session.user.id,
      deviceId,
    );

    return Response.json(connection, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
