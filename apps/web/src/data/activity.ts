import { desc, eq } from "drizzle-orm";
import { db, devices, user, vpnAccesses } from "@noxroute/db";

export async function getAdminActivity() {
  const rows = await db
    .select({
      id: devices.id,
      username: user.username,
      deviceName: devices.name,
      platform: devices.platform,
      profile: devices.profile,
      status: devices.status,
      activeConnections: devices.activeConnections,
      usedBytes: devices.usedBytes,
      connectedSeconds: devices.connectedSeconds,
      lastSeenAt: devices.lastSeenAt,
    })
    .from(devices)
    .innerJoin(vpnAccesses, eq(devices.vpnAccessId, vpnAccesses.id))
    .innerJoin(user, eq(vpnAccesses.userId, user.id))
    .orderBy(desc(devices.lastSeenAt), desc(devices.createdAt))
    .limit(250);

  return rows.map((row) => ({
    ...row,
    usedBytes: String(row.usedBytes),
    connectedSeconds: String(row.connectedSeconds),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
  }));
}
