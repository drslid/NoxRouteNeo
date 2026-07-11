import {
  db,
  devices,
  encryptedSecrets,
  instanceSettings,
  subscriptionCredentials,
  user,
  vpnAccesses,
} from "@noxroute/db";
import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { decryptSecret, secretDigest } from "@/lib/secrets";
import { buildVlessUri } from "@/lib/vless";
import { consumeRateLimit, requestAddress } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const addressLimit = await consumeRateLimit({
    namespace: "subscription-address",
    identifier: requestAddress(request),
    limit: 60,
    windowMs: 60_000,
  });
  if (!addressLimit.allowed) {
    return new Response("Too many requests", {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(addressLimit.retryAfterSeconds),
      },
    });
  }
  const [record] = await db
    .select({
      credentialId: subscriptionCredentials.id,
      device: devices,
      access: vpnAccesses,
      username: user.username,
      banned: user.banned,
    })
    .from(subscriptionCredentials)
    .innerJoin(devices, eq(subscriptionCredentials.deviceId, devices.id))
    .innerJoin(vpnAccesses, eq(devices.vpnAccessId, vpnAccesses.id))
    .innerJoin(user, eq(vpnAccesses.userId, user.id))
    .where(
      and(
        eq(subscriptionCredentials.tokenDigest, secretDigest(token)),
        isNull(subscriptionCredentials.revokedAt),
      ),
    )
    .limit(1);

  if (!record || record.banned) {
    return new Response("Not found", { status: 404 });
  }
  const tokenLimit = await consumeRateLimit({
    namespace: "subscription-credential",
    identifier: record.credentialId,
    limit: 30,
    windowMs: 60_000,
  });
  if (!tokenLimit.allowed) {
    return new Response("Too many requests", {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(tokenLimit.retryAfterSeconds),
      },
    });
  }
  if (record.device.status !== "active" || record.access.status !== "active") {
    return new Response("Access is not active", { status: 403 });
  }
  if (record.access.expiresAt && record.access.expiresAt <= new Date()) {
    return new Response("Access has expired", { status: 403 });
  }
  if (
    record.access.quotaBytes !== null &&
    record.access.usedBytes >= record.access.quotaBytes
  ) {
    return new Response("Quota exceeded", { status: 403 });
  }

  const [settings] = await db.select().from(instanceSettings).limit(1);
  const [secret] = record.device.vlessSecretId
    ? await db
        .select()
        .from(encryptedSecrets)
        .where(eq(encryptedSecrets.id, record.device.vlessSecretId))
        .limit(1)
    : [];
  if (
    !settings?.subscriptionEnabled ||
    !settings.vpnDomain ||
    !settings.realityPublicKey ||
    !secret
  ) {
    return new Response("VPN runtime is unavailable", { status: 503 });
  }

  const directUri = buildVlessUri({
    uuid: decryptSecret(secret.ciphertext, secret.nonce),
    username: record.username ?? "user",
    deviceName: record.device.name,
    profile: record.device.profile,
    vpnDomain: settings.vpnDomain,
    vpnPort: settings.vpnPort,
    xhttpPath: settings.xhttpPath,
    realityServerName: settings.realityServerName,
    realityPublicKey: settings.realityPublicKey,
    realityShortId: record.device.realityShortId,
    spiderX: record.device.spiderX,
  });
  await db
    .update(subscriptionCredentials)
    .set({ lastUsedAt: new Date() })
    .where(eq(subscriptionCredentials.id, record.credentialId));

  const plain = request.nextUrl.searchParams.get("format") === "plain";
  const payload = plain
    ? directUri
    : Buffer.from(directUri, "utf8").toString("base64");
  return new Response(payload, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
