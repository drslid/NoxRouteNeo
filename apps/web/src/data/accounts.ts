import { desc, eq } from "drizzle-orm";
import { db, user, vpnAccesses } from "@noxroute/db";

export type AccountListItem = {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
  usedBytes: string;
  quotaBytes: string | null;
  expiresAt: string | null;
  speedLimitMbps: number | null;
  maxDevices: number | null;
  activeConnections: number;
  createdAt: string;
};

export async function listAccounts(): Promise<AccountListItem[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      banned: user.banned,
      accessStatus: vpnAccesses.status,
      usedBytes: vpnAccesses.usedBytes,
      quotaBytes: vpnAccesses.quotaBytes,
      expiresAt: vpnAccesses.expiresAt,
      speedLimitMbps: vpnAccesses.speedLimitMbps,
      maxDevices: vpnAccesses.maxDevices,
      activeConnections: vpnAccesses.activeConnections,
      createdAt: user.createdAt,
    })
    .from(user)
    .leftJoin(vpnAccesses, eq(vpnAccesses.userId, user.id))
    .orderBy(desc(user.createdAt))
    .limit(250);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    username: row.username ?? "not-set",
    role: row.role ?? "user",
    status: row.banned ? "suspended" : (row.accessStatus ?? "active"),
    usedBytes: String(row.usedBytes ?? 0),
    quotaBytes: row.quotaBytes === null ? null : String(row.quotaBytes),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    speedLimitMbps: row.speedLimitMbps,
    maxDevices: row.maxDevices,
    activeConnections: row.activeConnections ?? 0,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getAccount(userId: string) {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
      accessId: vpnAccesses.id,
      accessStatus: vpnAccesses.status,
      usedBytes: vpnAccesses.usedBytes,
      quotaBytes: vpnAccesses.quotaBytes,
      expiresAt: vpnAccesses.expiresAt,
      connectedSeconds: vpnAccesses.connectedSeconds,
      activeConnections: vpnAccesses.activeConnections,
      maxDevices: vpnAccesses.maxDevices,
      speedLimitMbps: vpnAccesses.speedLimitMbps,
    })
    .from(user)
    .leftJoin(vpnAccesses, eq(vpnAccesses.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);

  return row ?? null;
}
