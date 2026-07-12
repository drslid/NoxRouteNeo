import type { NextRequest } from "next/server";

import { ApiError, apiErrorResponse, requireApiSession } from "@/lib/api-auth";
import { runVpnDiagnostic, RuntimeControlError } from "@/lib/runtime-health";

export async function POST(request: NextRequest) {
  try {
    await requireApiSession(request, ["owner", "admin"]);
    return Response.json(await runVpnDiagnostic(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof RuntimeControlError) {
      return apiErrorResponse(new ApiError(error.status, error.message));
    }
    return apiErrorResponse(error);
  }
}
