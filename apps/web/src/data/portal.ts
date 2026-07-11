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
