import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError, apiErrorResponse, requireApiSession } from "@/lib/api-auth";
import { checkRealityTarget, RuntimeControlError } from "@/lib/runtime-health";

const requestSchema = z.object({
  target: z.string().trim().min(3).max(260),
  serverName: z.string().trim().min(3).max(253),
});

export async function POST(request: NextRequest) {
  try {
    await requireApiSession(request, ["owner", "admin"]);
    const input = requestSchema.parse(await request.json());
    return Response.json(await checkRealityTarget(input), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof RuntimeControlError) {
      return apiErrorResponse(new ApiError(error.status, error.message));
    }
    return apiErrorResponse(error);
  }
}
