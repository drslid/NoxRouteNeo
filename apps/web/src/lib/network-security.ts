import { isIP } from "node:net";

import { db, ipBans, securityEvents } from "@noxroute/db";
import { and, count, eq, gt, gte, inArray, isNull, or, sql } from "drizzle-orm";

export const AUTOMATIC_BAN_HOURS = 6;
export const AUTOMATIC_BAN_THRESHOLD = 10;
export const AUTOMATIC_BAN_WINDOW_MINUTES = 5;

export function normalizeIpAddress(value: string | null | undefined) {
  let address = value?.trim() ?? "";
  if (address.includes(",")) address = address.split(",", 1)[0]?.trim() ?? "";
  if (address.startsWith("[")) address = address.slice(1, address.indexOf("]"));
  if (address.startsWith("::ffff:") && isIP(address.slice(7)) === 4) {
    address = address.slice(7);
  }
  return isIP(address) ? address.toLowerCase() : null;
}

export function isPublicIpAddress(address: string) {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    const a = octets[0] ?? -1;
    const b = octets[1] ?? -1;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (version === 6) {
    return !(
      address === "::" ||
      address === "::1" ||
      address.startsWith("fc") ||
      address.startsWith("fd") ||
      /^fe[89ab]/.test(address)
    );
  }
  return false;
}

export async function activeIpBan(address: string | null) {
  if (!address) return null;
  const [ban] = await db
    .select()
    .from(ipBans)
    .where(
      and(
        eq(ipBans.ipAddress, address),
        isNull(ipBans.releasedAt),
        or(eq(ipBans.permanent, true), gt(ipBans.expiresAt, new Date())),
      ),
    )
    .limit(1);
  return ban ?? null;
}

export async function recordSecurityEvent({
  address,
  kind,
  outcome = "rejected",
  route,
  userAgent,
  metadata = {},
  eligibleForAutomaticBan = false,
}: {
  address: string | null;
  kind: string;
  outcome?: string;
  route?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  eligibleForAutomaticBan?: boolean;
}) {
  if (!address) return { banned: false, count: 0 };
  try {
    await db.insert(securityEvents).values({
      ipAddress: address,
      kind,
      outcome,
      route: route?.slice(0, 240) ?? null,
      userAgent: userAgent?.slice(0, 500) ?? null,
      metadata,
    });

    const existing = await activeIpBan(address);
    if (existing) {
      await db
        .update(ipBans)
        .set({
          occurrenceCount: sql`${ipBans.occurrenceCount} + 1`,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(ipBans.id, existing.id));
      return { banned: true, count: existing.occurrenceCount + 1 };
    }

    if (!eligibleForAutomaticBan || !isPublicIpAddress(address)) {
      return { banned: false, count: 1 };
    }

    const windowStart = new Date(
      Date.now() - AUTOMATIC_BAN_WINDOW_MINUTES * 60_000,
    );
    const [row] = await db
      .select({ value: count() })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.ipAddress, address),
          eq(securityEvents.outcome, "rejected"),
          inArray(securityEvents.kind, [
            "sign_in",
            "invalid_subscription",
            "subscription_rate_limit",
            "subscription_credential_rate_limit",
            "subscription_hwid_mismatch",
          ]),
          gte(securityEvents.createdAt, windowStart),
        ),
      );
    const recentCount = Number(row?.value ?? 0);
    if (recentCount < AUTOMATIC_BAN_THRESHOLD) {
      return { banned: false, count: recentCount };
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + AUTOMATIC_BAN_HOURS * 60 * 60_000,
    );
    await db
      .insert(ipBans)
      .values({
        ipAddress: address,
        source: "automatic",
        reason: `${recentCount} rejected requests in ${AUTOMATIC_BAN_WINDOW_MINUTES} minutes`,
        expiresAt,
        occurrenceCount: recentCount,
        firstSeenAt: windowStart,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: ipBans.ipAddress,
        set: {
          source: "automatic",
          reason: `${recentCount} rejected requests in ${AUTOMATIC_BAN_WINDOW_MINUTES} minutes`,
          permanent: false,
          expiresAt,
          occurrenceCount: recentCount,
          firstSeenAt: windowStart,
          lastSeenAt: now,
          releasedAt: null,
          releasedByUserId: null,
          updatedAt: now,
        },
      });
    return { banned: true, count: recentCount };
  } catch (error) {
    console.error("Security event recording failed", error);
    return { banned: false, count: 0 };
  }
}

export function blockedIpResponse(expiresAt: Date | null, permanent: boolean) {
  const retryAfter =
    !permanent && expiresAt
      ? Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000))
      : 21_600;
  return Response.json(
    {
      error: permanent
        ? "This IP address is permanently blocked"
        : "This IP address is temporarily blocked",
    },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfter),
      },
    },
  );
}
