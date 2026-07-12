import { asc, eq } from "drizzle-orm";
import { db, devices, vpnAccesses } from "@noxroute/db";

export async function getPortalData(userId: string) {
  const [access] = await db
    .select()
    .from(vpnAccesses)
    .where(eq(vpnAccesses.userId, userId))
    .limit(1);

  const registeredDevices = access
    ? await db
        .select()
        .from(devices)
        .where(eq(devices.vpnAccessId, access.id))
        .orderBy(asc(devices.createdAt))
    : [];

  return { access: access ?? null, devices: registeredDevices };
}

export async function getPortalDashboard(userId: string) {
  const { access, devices: registeredDevices } = await getPortalData(userId);
  return {
    access: access
      ? {
          status: access.status,
          usedBytes: String(access.usedBytes),
          quotaBytes:
            access.quotaBytes === null ? null : String(access.quotaBytes),
          connectedSeconds: String(access.connectedSeconds),
          activeConnections: access.activeConnections,
          expiresAt: access.expiresAt?.toISOString() ?? null,
        }
      : null,
    deviceCount: registeredDevices.length,
  };
}
