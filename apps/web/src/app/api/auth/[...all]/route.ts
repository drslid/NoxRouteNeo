import { auth } from "@noxroute/auth/server";
import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";

import {
  activeIpBan,
  blockedIpResponse,
  normalizeIpAddress,
  recordSecurityEvent,
} from "@/lib/network-security";
import { requestAddress } from "@/lib/rate-limit";

const handlers = toNextJsHandler(auth);

async function guarded(
  request: NextRequest,
  handler: (request: Request) => Promise<Response>,
) {
  const address = normalizeIpAddress(requestAddress(request));
  const ban = await activeIpBan(address);
  if (ban) {
    return blockedIpResponse(ban.expiresAt, ban.permanent);
  }

  const response = await handler(request);
  const isSignIn = request.nextUrl.pathname.includes("/sign-in/");
  if (isSignIn) {
    await recordSecurityEvent({
      address,
      kind: "sign_in",
      outcome: response.ok ? "allowed" : "rejected",
      route: request.nextUrl.pathname,
      userAgent: request.headers.get("user-agent"),
      eligibleForAutomaticBan: !response.ok,
    });
  }
  return response;
}

export function GET(request: NextRequest) {
  return guarded(request, handlers.GET);
}

export function POST(request: NextRequest) {
  return guarded(request, handlers.POST);
}
