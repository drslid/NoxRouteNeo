import type { AppRole } from "@noxroute/auth/permissions";
import { auth } from "@noxroute/auth/server";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";

import { isAppRole } from "@noxroute/auth/permissions";
import { activeIpBan, normalizeIpAddress } from "@/lib/network-security";
import { requestAddress } from "@/lib/rate-limit";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function allowedOrigin(request: NextRequest) {
  const configured = process.env.BETTER_AUTH_URL;
  const origin = request.headers.get("origin");

  if (!origin) {
    throw new ApiError(403, "Request origin is required");
  }

  if (configured && origin === new URL(configured).origin) {
    return;
  }

  if (
    process.env.NODE_ENV !== "production" &&
    ["http://localhost:3001", "http://127.0.0.1:3001"].includes(origin)
  ) {
    return;
  }

  throw new ApiError(403, "Request origin is not allowed");
}

export async function requireApiSession(
  request: NextRequest,
  roles: readonly AppRole[],
) {
  const ban = await activeIpBan(normalizeIpAddress(requestAddress(request)));
  if (ban) {
    throw new ApiError(403, "This IP address is blocked");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    allowedOrigin(request);
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw new ApiError(401, "Authentication is required");
  }

  const role = isAppRole(session.user.role) ? session.user.role : "user";
  if (!roles.includes(role)) {
    throw new ApiError(403, "You are not allowed to perform this action");
  }

  return { session, role };
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        error: "Request validation failed",
        fields: error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error("API request failed", { message });
  return Response.json(
    { error: "The request could not be completed" },
    { status: 500 },
  );
}
