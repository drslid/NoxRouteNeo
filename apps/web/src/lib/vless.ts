import type { ConnectionProfile } from "@noxroute/contracts";
import { randomBytes } from "node:crypto";

export const connectionProfiles = {
  fast: {
    mode: "stream-one",
  },
  balanced: {
    mode: undefined,
  },
  stealth: {
    mode: "packet-up",
  },
} as const satisfies Record<ConnectionProfile, { mode: string | undefined }>;

export function generateRealityShortId(profile: ConnectionProfile) {
  return randomBytes(profile === "fast" ? 4 : 8).toString("hex");
}

export function generateSpiderX(profile: ConnectionProfile) {
  return profile === "stealth" ? `/${randomBytes(8).toString("hex")}` : null;
}

export function buildVlessUri({
  uuid,
  username,
  deviceName,
  profile,
  vpnDomain,
  vpnPort,
  xhttpPath,
  realityServerName,
  realityPublicKey,
  realityShortId,
  spiderX,
}: {
  uuid: string;
  username: string;
  deviceName: string;
  profile: ConnectionProfile;
  vpnDomain: string;
  vpnPort: number;
  xhttpPath: string;
  realityServerName: string;
  realityPublicKey: string;
  realityShortId: string;
  spiderX: string | null;
}) {
  const params = new URLSearchParams({
    encryption: "none",
    type: "xhttp",
    security: "reality",
    sni: realityServerName,
    fp: "chrome",
    pbk: realityPublicKey,
    sid: realityShortId,
    path: xhttpPath,
  });
  const mode = connectionProfiles[profile].mode;
  if (mode) {
    params.set("mode", mode);
  }
  if (spiderX) {
    params.set("spx", spiderX);
  }

  const label = encodeURIComponent(`NoxRouteNeo-${username}-${deviceName}`);
  return `vless://${uuid}@${vpnDomain}:${vpnPort}?${params.toString()}#${label}`;
}

export function adminBaseUrl({
  adminDomain,
  adminHttpsPort,
}: {
  adminDomain: string;
  adminHttpsPort: number;
}) {
  const defaultPort = adminHttpsPort === 443 ? "" : `:${adminHttpsPort}`;
  return `https://${adminDomain}${defaultPort}`;
}
