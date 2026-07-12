import "server-only";

import { isSizingProfile, type SizingProfile } from "./sizing";

export type RuntimeSizing = {
  profile: SizingProfile;
  cpuCount: number;
  memoryBytes: number;
  gatewayCapacity: number;
  capacityMode: "auto" | "manual";
  minimumIdleSeconds: number;
  maximumIdleSeconds: number;
  recommendedBandwidthMbps: number;
  serverBandwidthMbps: number;
  bandwidthMode: "auto" | "manual" | "environment";
};

export type RuntimeSecurity = {
  status: string;
  activeBans: number;
};

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

export async function getRuntimeSizing(): Promise<RuntimeSizing | null> {
  try {
    const baseUrl = process.env.RUNTIME_INTERNAL_URL ?? "http://runtime:8081";
    const response = await fetch(`${baseUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const profile = payload.sizing_profile;
    const cpuCount = nonNegativeInteger(payload.detected_cpu_count);
    const memoryBytes = nonNegativeInteger(payload.detected_memory_bytes);
    const gatewayCapacity = nonNegativeInteger(
      payload.traffic_gateway_capacity,
    );
    const minimumIdleSeconds = nonNegativeInteger(
      payload.traffic_gateway_minimum_idle_seconds,
    );
    const maximumIdleSeconds = nonNegativeInteger(
      payload.traffic_gateway_maximum_idle_seconds,
    );
    const recommendedBandwidthMbps = nonNegativeInteger(
      payload.recommended_bandwidth_mbps,
    );
    const serverBandwidthMbps = nonNegativeInteger(
      payload.server_bandwidth_mbps,
    );
    if (
      !isSizingProfile(profile) ||
      cpuCount === null ||
      memoryBytes === null ||
      gatewayCapacity === null ||
      minimumIdleSeconds === null ||
      maximumIdleSeconds === null ||
      recommendedBandwidthMbps === null ||
      serverBandwidthMbps === null
    ) {
      return null;
    }
    const capacityMode =
      payload.traffic_gateway_capacity_mode === "manual" ? "manual" : "auto";
    const bandwidthMode =
      payload.server_bandwidth_mode === "manual"
        ? "manual"
        : payload.server_bandwidth_mode === "environment"
          ? "environment"
          : "auto";
    return {
      profile,
      cpuCount,
      memoryBytes,
      gatewayCapacity,
      capacityMode,
      minimumIdleSeconds,
      maximumIdleSeconds,
      recommendedBandwidthMbps,
      serverBandwidthMbps,
      bandwidthMode,
    };
  } catch {
    return null;
  }
}

export async function getRuntimeSecurity(): Promise<RuntimeSecurity | null> {
  try {
    const baseUrl = process.env.RUNTIME_INTERNAL_URL ?? "http://runtime:8081";
    const response = await fetch(`${baseUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as Record<string, unknown>;
    const activeBans = nonNegativeInteger(payload.security_firewall_bans);
    if (typeof payload.security_firewall !== "string" || activeBans === null) {
      return null;
    }
    return { status: payload.security_firewall, activeBans };
  } catch {
    return null;
  }
}
