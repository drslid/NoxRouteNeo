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

import {
  activeIpBan,
  blockedIpResponse,
  normalizeIpAddress,
  recordSecurityEvent,
} from "@/lib/network-security";
import {
  decryptSecret,
  privateIdentifierDigest,
  secretDigest,
} from "@/lib/secrets";
import { buildVlessUri } from "@/lib/vless";
import { consumeRateLimit, requestAddress } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const address = normalizeIpAddress(requestAddress(request));
  const currentBan = await activeIpBan(address);
  if (currentBan) {
    return blockedIpResponse(currentBan.expiresAt, currentBan.permanent);
  }
  const addressLimit = await consumeRateLimit({
    namespace: "subscription-address",
    identifier: requestAddress(request),
    limit: 60,
    windowMs: 60_000,
  });
  if (!addressLimit.allowed) {
    await recordSecurityEvent({
      address,
      kind: "subscription_rate_limit",
      route: "/sub/:token",
      userAgent: request.headers.get("user-agent"),
      eligibleForAutomaticBan: true,
    });
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
      hwidDigest: subscriptionCredentials.hwidDigest,
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
    await recordSecurityEvent({
      address,
      kind: "invalid_subscription",
      route: "/sub/:token",
      userAgent: request.headers.get("user-agent"),
      eligibleForAutomaticBan: true,
    });
    return new Response("Not found", { status: 404 });
  }
  const tokenLimit = await consumeRateLimit({
    namespace: "subscription-credential",
    identifier: record.credentialId,
    limit: 30,
    windowMs: 60_000,
  });
  if (!tokenLimit.allowed) {
    await recordSecurityEvent({
      address,
      kind: "subscription_credential_rate_limit",
      route: "/sub/:token",
      userAgent: request.headers.get("user-agent"),
      eligibleForAutomaticBan: true,
    });
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

  const rawHwid =
    request.headers.get("x-hwid") ?? request.headers.get("x-device-id");
  const normalizedHwid = rawHwid?.trim().toUpperCase() ?? "";
  if (!/^[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}$/.test(normalizedHwid)) {
    await recordSecurityEvent({
      address,
      kind: "subscription_hwid_missing",
      route: "/sub/:token",
      userAgent: request.headers.get("user-agent"),
      metadata: { credential: record.credentialId },
    });
    return new Response("INCY device identification is required", {
      status: 428,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const hwidDigest = privateIdentifierDigest(normalizedHwid);
  if (record.hwidDigest && record.hwidDigest !== hwidDigest) {
    await recordSecurityEvent({
      address,
      kind: "subscription_hwid_mismatch",
      route: "/sub/:token",
      userAgent: request.headers.get("user-agent"),
      metadata: { credential: record.credentialId },
      eligibleForAutomaticBan: true,
    });
    return new Response("This subscription is bound to another device", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
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
  const now = new Date();
  if (!record.hwidDigest) {
    const bound = await db
      .update(subscriptionCredentials)
      .set({ hwidDigest, hwidBoundAt: now })
      .where(
        and(
          eq(subscriptionCredentials.id, record.credentialId),
          isNull(subscriptionCredentials.hwidDigest),
        ),
      )
      .returning({ id: subscriptionCredentials.id });
    if (bound.length === 0) {
      const [latest] = await db
        .select({ hwidDigest: subscriptionCredentials.hwidDigest })
        .from(subscriptionCredentials)
        .where(eq(subscriptionCredentials.id, record.credentialId))
        .limit(1);
      if (latest?.hwidDigest !== hwidDigest) {
        return new Response("This subscription is bound to another device", {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        });
      }
    }
  }
  await db
    .update(subscriptionCredentials)
    .set({
      lastUsedAt: now,
      lastIpAddress: address,
      lastUserAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      lastDevicePlatform:
        request.headers.get("x-device-os")?.slice(0, 80) ?? null,
      lastDeviceModel:
        request.headers.get("x-device-model")?.slice(0, 160) ?? null,
      lastDeviceOs: request.headers.get("x-ver-os")?.slice(0, 80) ?? null,
    })
    .where(eq(subscriptionCredentials.id, record.credentialId));

  const payload = Buffer.from(directUri, "utf8").toString("base64");
  const profileTitle = Buffer.from(
    `NoxRouteNeo ${record.device.name}`.slice(0, 25),
    "utf8",
  ).toString("base64");
  const subscriptionUserInfo = [
    "upload=0",
    `download=${record.access.usedBytes}`,
    `total=${record.access.quotaBytes ?? 0n}`,
    `expire=${record.access.expiresAt ? Math.floor(record.access.expiresAt.getTime() / 1000) : 0}`,
  ].join(";");
  return new Response(payload, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "profile-title": `base64:${profileTitle}`,
      "profile-update-interval": "1",
      "subscription-userinfo": subscriptionUserInfo,
      "sort-order": "ping",
      "hide-url": "1",
      "no-limit-enabled": "1",
    },
  });
}
