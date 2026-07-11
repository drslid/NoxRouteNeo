import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

const statements = {
  ...defaultStatements,
  instance: ["read", "update"] as const,
  vpnAccess: ["create", "read", "update", "revoke", "read-own"] as const,
  device: ["create", "read", "update", "revoke", "read-own"] as const,
  runtime: ["read", "execute"] as const,
  audit: ["read"] as const,
  destructive: ["execute"] as const,
} as const;

export const accessControl = createAccessControl(statements);

export const ownerRole = accessControl.newRole({
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
  ],
  session: ["list", "revoke", "delete"],
  instance: ["read", "update"],
  vpnAccess: ["create", "read", "update", "revoke", "read-own"],
  device: ["create", "read", "update", "revoke", "read-own"],
  runtime: ["read", "execute"],
  audit: ["read"],
  destructive: ["execute"],
});

export const adminRole = accessControl.newRole({
  user: ["create", "list", "ban", "get", "update"],
  session: ["list", "revoke", "delete"],
  instance: ["read", "update"],
  vpnAccess: ["create", "read", "update", "revoke", "read-own"],
  device: ["create", "read", "update", "revoke", "read-own"],
  runtime: ["read", "execute"],
  audit: ["read"],
  destructive: [],
});

export const userRole = accessControl.newRole({
  user: [],
  session: [],
  instance: [],
  vpnAccess: ["read-own"],
  device: ["create", "update", "revoke", "read-own"],
  runtime: [],
  audit: [],
  destructive: [],
});

export const appRoles = {
  owner: ownerRole,
  admin: adminRole,
  user: userRole,
} as const;

export type AppRole = keyof typeof appRoles;

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && value in appRoles;
}
