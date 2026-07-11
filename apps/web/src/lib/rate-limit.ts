import { createHash, randomUUID } from "node:crypto";

import { db, rateLimit } from "@noxroute/db";
import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function requestAddress(request: NextRequest) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function consumeRateLimit({
  namespace,
  identifier,
  limit,
  windowMs,
}: {
  namespace: string;
  identifier: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();
  const windowStart = now - windowMs;
  const key = `noxroute:${namespace}:${digest(identifier)}`;
  const [entry] = await db
    .insert(rateLimit)
    .values({ id: randomUUID(), key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql<number>`case when ${rateLimit.lastRequest} < ${windowStart} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql<number>`case when ${rateLimit.lastRequest} < ${windowStart} then ${now} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning({
      count: rateLimit.count,
      windowStartedAt: rateLimit.lastRequest,
    });

  const allowed = Boolean(entry && entry.count <= limit);
  const retryAfterSeconds = entry
    ? Math.max(1, Math.ceil((entry.windowStartedAt + windowMs - now) / 1000))
    : Math.ceil(windowMs / 1000);
  return { allowed, retryAfterSeconds };
}
