import { count, desc, eq, sql as drizzleSql } from "drizzle-orm";
import {
  db,
  devices,
  instanceMetricSamples,
  instanceSettings,
  runtimeAgentState,
  runtimeCommands,
  vpnAccesses,
} from "@noxroute/db";

import {
  calculateSampleWindowSeconds,
  calculateThroughputMbps,
  roundTelemetryValue,
} from "@/lib/telemetry";

export async function getAdminDashboard() {
  const [
    [accessSummary],
    [deviceSummary],
    [failedCommands],
    samples,
    [settings],
    [runtime],
  ] = await Promise.all([
    db
      .select({
        total: count(vpnAccesses.id),
        active: drizzleSql<number>`count(*) filter (where ${vpnAccesses.status} = 'active')`,
        connections: drizzleSql<number>`coalesce(sum(${vpnAccesses.activeConnections}), 0)`,
        usedBytes: drizzleSql<string>`coalesce(sum(${vpnAccesses.usedBytes}), 0)::text`,
      })
      .from(vpnAccesses),
    db.select({ total: count(devices.id) }).from(devices),
    db
      .select({ total: count(runtimeCommands.id) })
      .from(runtimeCommands)
      .where(eq(runtimeCommands.status, "failed")),
    db
      .select()
      .from(instanceMetricSamples)
      .orderBy(desc(instanceMetricSamples.sampledAt))
      .limit(37),
    db
      .select({
        telemetryIntervalSeconds: instanceSettings.telemetryIntervalSeconds,
      })
      .from(instanceSettings)
      .limit(1),
    db.select().from(runtimeAgentState).limit(1),
  ]);

  const expectedSampleSeconds = settings?.telemetryIntervalSeconds ?? 30;
  const chronologicalSamples = samples.reverse();
  const dashboardSamples = chronologicalSamples
    .map((sample, index) => {
      const sampleWindowSeconds = calculateSampleWindowSeconds({
        sampledAt: sample.sampledAt,
        previousSampledAt: chronologicalSamples[index - 1]?.sampledAt,
        expectedSeconds: expectedSampleSeconds,
      });

      return {
        timestamp: sample.sampledAt.toISOString(),
        sampleWindowSeconds: roundTelemetryValue(sampleWindowSeconds),
        uplinkMegabytes: Number(sample.uplinkBytes) / 1024 / 1024,
        downlinkMegabytes: Number(sample.downlinkBytes) / 1024 / 1024,
        uplinkMbps: roundTelemetryValue(
          calculateThroughputMbps(sample.uplinkBytes, sampleWindowSeconds),
        ),
        downlinkMbps: roundTelemetryValue(
          calculateThroughputMbps(sample.downlinkBytes, sampleWindowSeconds),
        ),
        activeConnections: sample.activeConnections,
        cpuPercent: sample.xrayCpuBasisPoints / 100,
        memoryMegabytes: Number(sample.xrayMemoryBytes) / 1024 / 1024,
      };
    })
    .slice(-36);

  return {
    summary: {
      users: Number(accessSummary?.total ?? 0),
      activeUsers: Number(accessSummary?.active ?? 0),
      activeConnections: Number(accessSummary?.connections ?? 0),
      usedBytes: BigInt(accessSummary?.usedBytes ?? "0"),
      devices: Number(deviceSummary?.total ?? 0),
      failedCommands: Number(failedCommands?.total ?? 0),
    },
    gateway: {
      status: runtime?.trafficGatewayStatus ?? "starting",
      connections: runtime?.trafficGatewayConnections ?? 0,
      capacity: runtime?.trafficGatewayCapacity ?? 0,
      rejected: Number(runtime?.trafficGatewayRejected ?? 0n),
      shed: Number(runtime?.trafficGatewayShed ?? 0n),
      failOpenGrants: Number(runtime?.trafficGatewayFailOpenGrants ?? 0n),
      idleTimeouts: Number(runtime?.trafficGatewayIdleTimeouts ?? 0n),
      healthProbes: Number(runtime?.trafficGatewayHealthProbes ?? 0n),
      lastSeenAt: runtime?.trafficGatewayLastSeenAt?.toISOString() ?? null,
    },
    samples: dashboardSamples,
  };
}
