import type { MessageKey } from "./messages";

const statusKeys: Record<string, MessageKey> = {
  active: "common.active",
  suspended: "common.suspended",
  expired: "status.expired",
  quota_exceeded: "status.quota_exceeded",
  disabled: "status.disabled",
  blocked_by_limit: "status.blocked_by_limit",
  revoked: "status.revoked",
};

const profileKeys: Record<string, MessageKey> = {
  fast: "profile.fast",
  balanced: "profile.balanced",
  stealth: "profile.stealth",
};

const platformKeys: Record<string, MessageKey> = {
  ios: "platform.ios",
  android: "platform.android",
  desktop: "platform.desktop",
  other: "platform.other",
};

const roleKeys: Record<string, MessageKey> = {
  owner: "role.owner",
  admin: "role.admin",
  user: "role.user",
};

const sizingProfileKeys: Record<string, MessageKey> = {
  compact: "sizing.compact",
  small: "sizing.small",
  standard: "sizing.standard",
  performance: "sizing.performance",
  "high-capacity": "sizing.highCapacity",
};

export function statusMessageKey(value: string | null | undefined): MessageKey {
  return (value && statusKeys[value]) || "common.unknown";
}

export function profileMessageKey(
  value: string | null | undefined,
): MessageKey {
  return (value && profileKeys[value]) || "common.unknown";
}

export function platformMessageKey(
  value: string | null | undefined,
): MessageKey {
  return (value && platformKeys[value]) || "platform.other";
}

export function roleMessageKey(value: string | null | undefined): MessageKey {
  return (value && roleKeys[value]) || "role.user";
}

export function sizingProfileMessageKey(
  value: string | null | undefined,
): MessageKey {
  return (value && sizingProfileKeys[value]) || "common.unknown";
}
