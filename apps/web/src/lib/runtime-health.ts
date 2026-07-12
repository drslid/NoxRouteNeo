import "server-only";

import { createHmac } from "node:crypto";

import { isSizingProfile, type SizingProfile } from "./sizing";

const RUNTIME_CONTROL_CONTEXT = "noxrouteneo:runtime-control:v1";

export type RealityTargetDiagnostic = {
  ok: true;
  target: string;
  server_name: string;
  resolved_ip: string;
  latency_ms: number;
  tls_version: string;
  alpn: string | null;
  certificate_expires_at: string | null;
};

export type VpnDiagnostic = {
  ok: true;
  tested_at: string;
  endpoint: {
    status: "reachable" | "unreachable";
    host: string;
    port: number;
    resolved_ip?: string;
    latency_ms?: number;
    error?: string;
  };
  reality: RealityTargetDiagnostic;
  tunnel: {
    status: "passed";
    scope: "public-endpoint" | "local-fallback";
    exit_ip: string;
    latency_ms: number;
    device_name: string;
    public_endpoint_error: string | null;
  };
};

export class RuntimeControlError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function runtimeControlToken() {
  const encryptionKey = process.env.APP_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new RuntimeControlError("Runtime control key is unavailable", 503);
  }
  const key = Buffer.from(encryptionKey, "base64");
  if (key.length !== 32) {
    throw new RuntimeControlError("Runtime control key is invalid", 503);
  }
  return createHmac("sha256", key)
    .update(RUNTIME_CONTROL_CONTEXT)
    .digest("base64url");
}

async function runtimeControlRequest<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number,
) {
  const baseUrl = process.env.RUNTIME_INTERNAL_URL ?? "http://runtime:8081";
  const controlToken = runtimeControlToken();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${controlToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new RuntimeControlError("VPN runtime is not reachable", 503);
  }
  const payload = (await response.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!response.ok || !payload) {
    throw new RuntimeControlError(
      payload?.error ?? "VPN runtime rejected the diagnostic",
      response.status >= 400 && response.status < 600 ? response.status : 503,
    );
  }
  return payload as T;
}

export function checkRealityTarget(input: {
  target: string;
  serverName: string;
}) {
  return runtimeControlRequest<RealityTargetDiagnostic>(
    "/diagnostics/reality",
    { target: input.target, server_name: input.serverName },
    10_000,
  );
}

export function runVpnDiagnostic() {
  return runtimeControlRequest<VpnDiagnostic>("/diagnostics/vpn", {}, 35_000);
}

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
