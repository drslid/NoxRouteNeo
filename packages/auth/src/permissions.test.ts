import { describe, expect, it } from "vitest";

import { adminRole, ownerRole, userRole } from "./permissions";

describe("role permissions", () => {
  it("reserves destructive operations for the owner", () => {
    expect(
      ownerRole.authorize({ destructive: ["execute"] }).success,
    ).toBe(true);
    expect(
      adminRole.authorize({ destructive: ["execute"] }).success,
    ).toBe(false);
  });

  it("lets users manage only their own device surface", () => {
    expect(userRole.authorize({ device: ["read-own"] }).success).toBe(true);
    expect(userRole.authorize({ device: ["read"] }).success).toBe(false);
  });

  it("does not grant impersonation", () => {
    expect(ownerRole.authorize({ user: ["impersonate"] }).success).toBe(false);
    expect(adminRole.authorize({ user: ["impersonate"] }).success).toBe(false);
  });
});
