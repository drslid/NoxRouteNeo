import {
  db,
  devices,
  encryptedSecrets,
  instanceSettings,
  subscriptionCredentials,
  user,
  vpnAccesses,
} from "@noxroute/db";
import { and, eq } from "drizzle-orm";

import { ApiError } from "@/lib/api-auth";
import { decryptSecret } from "@/lib/secrets";
import { adminBaseUrl, buildVlessUri } from "@/lib/vless";

export async function getOwnedDeviceConnection(userId: string, deviceId: string) {
  const [record] = await db
    .select({
      device: devices,
      access: vpnAccesses,
      username: user.username,
      banned: user.banned,
    })
    .from(devices)
    .innerJoin(vpnAccesses, eq(devices.vpnAccessId, vpnAccesses.id))
    .innerJoin(user, eq(vpnAccesses.userId, user.id))
    .where(and(eq(devices.id, deviceId), eq(user.id, userId)))
    .limit(1);

  if (!record) {
    throw new ApiError(404, "Device not found");
  }
  if (record.banned || record.access.status !== "active") {
    throw new ApiError(403, "VPN access is not active");
  }
  if (record.device.status !== "active") {
    throw new ApiError(403, "This device is not active");
  }

  const [vlessSecret] = await db
    .select()
    .from(encryptedSecrets)
    .where(eq(encryptedSecrets.id, record.device.vlessSecretId!))
    .limit(1);
  const [credential] = await db
    .select()
    .from(subscriptionCredentials)
    .where(eq(subscriptionCredentials.deviceId, deviceId))
    .limit(1);
  const [tokenSecret] = credential
    ? await db
        .select()
        .from(encryptedSecrets)
        .where(eq(encryptedSecrets.id, credential.tokenSecretId))
        .limit(1)
    : [];
  const [settings] = await db.select().from(instanceSettings).limit(1);

  if (!vlessSecret || !credential || !tokenSecret || !settings) {
    throw new ApiError(503, "Device credentials are incomplete");
  }
  if (!settings.realityPublicKey || !settings.vpnDomain || !settings.adminDomain) {
    throw new ApiError(503, "VPN runtime is not configured yet");
  }

  const uuid = decryptSecret(vlessSecret.ciphertext, vlessSecret.nonce);
  const token = decryptSecret(tokenSecret.ciphertext, tokenSecret.nonce);
  const directUri = buildVlessUri({
    uuid,
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
  const subscriptionUrl = `${adminBaseUrl({
    adminDomain: settings.adminDomain,
    adminHttpsPort: settings.adminHttpsPort,
  })}/sub/${token}`;

  return {
    device: {
      id: record.device.id,
      name: record.device.name,
      platform: record.device.platform,
      profile: record.device.profile,
      status: record.device.status,
    },
    directUri,
    subscriptionUrl,
    profile: record.device.profile,
  };
}
