import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type AuthSession } from "@noxroute/auth/server";
import { isAppRole, type AppRole } from "@noxroute/auth/permissions";
import { activeIpBan, normalizeIpAddress } from "@/lib/network-security";
import { addressFromHeaders } from "@/lib/rate-limit";

export const getSession = cache(async (): Promise<AuthSession | null> => {
  const requestHeaders = await headers();
  const ban = await activeIpBan(
    normalizeIpAddress(addressFromHeaders(requestHeaders)),
  );
  if (ban) return null;
  return auth.api.getSession({ headers: requestHeaders });
});

export function sessionRole(session: AuthSession): AppRole {
  const role = session.user.role;
  return isAppRole(role) ? role : "user";
}

export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
  return session;
}

export async function requireAdmin(): Promise<{
  session: AuthSession;
  role: "owner" | "admin";
}> {
  const session = await requireSession();
  const role = sessionRole(session);

  if (role !== "owner" && role !== "admin") {
    redirect("/portal");
  }

  return { session, role };
}

export async function requireUser(): Promise<AuthSession> {
  const session = await requireSession();
  const role = sessionRole(session);

  if (role === "owner" || role === "admin") {
    redirect("/admin");
  }

  return session;
}
