"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CircleAlert,
  Cpu,
  Database,
  MemoryStick,
  MonitorSmartphone,
  Network,
  Users,
} from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@noxroute/ui";

import type { getAdminDashboard } from "@/data/dashboard";
import { useI18n } from "@/i18n/client";
import { intlLocale } from "@/i18n/config";
import { sizingProfileMessageKey } from "@/i18n/labels";
import { formatBytes } from "@/lib/format";
import { ResourceChart } from "@/components/dashboard/resource-chart";
import { TrafficChart } from "@/components/dashboard/traffic-chart";

type DashboardData = Awaited<ReturnType<typeof getAdminDashboard>>;

async function fetchDashboard() {
  const response = await fetch("/api/admin/dashboard", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Dashboard telemetry could not be refreshed");
  }
  return (await response.json()) as DashboardData;
}

export function AdminDashboardLive({
  initialData,
}: {
  initialData: DashboardData;
}) {
  const { locale, t } = useI18n();
  const numberLocale = intlLocale(locale);
  const { data } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: fetchDashboard,
    initialData,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  const { summary, gateway, sizing, samples } = data;
  const latestSample = samples.at(-1);
  const gatewayBadgeVariant =
    gateway.status === "ready"
      ? "success"
      : gateway.status === "standby"
        ? "outline"
        : gateway.status === "bypassed"
          ? "warning"
          : "destructive";
  const gatewayStatusLabel =
    gateway.status === "ready"
      ? t("common.active")
      : gateway.status === "standby"
        ? t("dashboard.gatewayStandby")
        : gateway.status === "bypassed"
          ? t("dashboard.gatewayFallback")
          : t("dashboard.unavailable");
  const gatewayUtilization =
    gateway.capacity > 0 ? (gateway.connections / gateway.capacity) * 100 : 0;
  const gatewayMetrics = [
    {
      label: t("dashboard.activeFlows"),
      value: `${gateway.connections.toLocaleString(numberLocale)} / ${gateway.capacity.toLocaleString(numberLocale)}`,
      detail: t("dashboard.capacity", {
        percent: gatewayUtilization.toLocaleString(numberLocale, {
          maximumFractionDigits: 1,
        }),
      }),
    },
    {
      label: t("dashboard.rejected"),
      value: gateway.rejected.toLocaleString(numberLocale),
      detail: t("dashboard.atAdmission"),
    },
    {
      label: t("dashboard.idleReaped"),
      value: gateway.idleTimeouts.toLocaleString(numberLocale),
      detail: t("dashboard.expiredFlows"),
    },
    {
      label: t("dashboard.capacityShedding"),
      value: gateway.shed.toLocaleString(numberLocale),
      detail: t("dashboard.oldFlowsReplaced"),
    },
    {
      label: t("dashboard.limiterGrace"),
      value: gateway.failOpenGrants.toLocaleString(numberLocale),
      detail: t("dashboard.releasedAfterDelay"),
    },
    {
      label: t("dashboard.healthProbes"),
      value: gateway.healthProbes.toLocaleString(numberLocale),
      detail: gateway.lastSeenAt
        ? new Date(gateway.lastSeenAt).toLocaleString(numberLocale, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : t("dashboard.waitingHeartbeat"),
    },
  ];
  const metrics = [
    {
      label: t("portal.activeConnections"),
      value: summary.activeConnections.toLocaleString(numberLocale),
      detail: t("dashboard.activeUsers", {
        count: summary.activeUsers.toLocaleString(numberLocale),
      }),
      icon: Activity,
    },
    {
      label: t("dashboard.totalTransfer"),
      value: formatBytes(summary.usedBytes, numberLocale),
      detail: t("dashboard.measuredByXray"),
      icon: Database,
    },
    {
      label: t("nav.accounts"),
      value: summary.users.toLocaleString(numberLocale),
      detail: t("dashboard.enabledUsers", {
        count: summary.activeUsers.toLocaleString(numberLocale),
      }),
      icon: Users,
    },
    {
      label: t("devices.registeredTitle"),
      value: summary.devices.toLocaleString(numberLocale),
      detail: t("dashboard.deviceCredentials"),
      icon: MonitorSmartphone,
    },
    {
      label: t("dashboard.xrayCpu"),
      value: latestSample
        ? `${latestSample.cpuPercent.toLocaleString(numberLocale, { maximumFractionDigits: 1 })}%`
        : "--",
      detail: t("dashboard.currentProcess"),
      icon: Cpu,
    },
    {
      label: t("dashboard.xrayMemory"),
      value: latestSample
        ? `${latestSample.memoryMegabytes.toLocaleString(numberLocale, { maximumFractionDigits: 1 })} MB`
        : "--",
      detail: t("dashboard.residentMemory"),
      icon: MemoryStick,
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase text-emerald-700">
            {t("dashboard.overview")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{t("portal.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dashboard.description")}
          </p>
        </div>
        <Badge variant={summary.failedCommands > 0 ? "destructive" : "success"}>
          {summary.failedCommands > 0 ? (
            <CircleAlert aria-hidden="true" />
          ) : (
            <span className="size-1.5 rounded-full bg-current" />
          )}
          {summary.failedCommands > 0
            ? t("dashboard.runtimeFailures", { count: summary.failedCommands })
            : t("dashboard.queueHealthy")}
        </Badge>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {metric.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold" dir="ltr">
                      {metric.value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {metric.detail}
                    </p>
                  </div>
                  <span className="grid size-8 place-items-center rounded-md bg-muted text-foreground">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between border-b">
            <div>
              <CardTitle>{t("dashboard.trafficActivity")}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("dashboard.trafficDescription")}
              </p>
            </div>
            <Badge variant="outline">{t("dashboard.live")}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <TrafficChart samples={samples} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between border-b">
            <div>
              <CardTitle>{t("dashboard.resourceUsage")}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("dashboard.resourceDescription")}
              </p>
            </div>
            <Badge variant="outline">{t("dashboard.live")}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <ResourceChart samples={samples} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 border-b">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-foreground">
              <Network className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle>{t("settings.trafficGateway")}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("dashboard.gatewayDescription")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {sizing && (
              <Badge variant="outline" dir="ltr">
                {t(sizingProfileMessageKey(sizing.profile))} · {sizing.cpuCount}
                vCPU · {Math.round(sizing.memoryBytes / 1024 / 1024)} MiB ·{" "}
                {sizing.serverBandwidthMbps} Mbps
              </Badge>
            )}
            <Badge variant={gatewayBadgeVariant}>{gatewayStatusLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {gatewayMetrics.map((metric) => (
            <div
              key={metric.label}
              className="min-w-0 border-b px-5 py-4 last:border-b-0 sm:border-r sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(3n)]:border-r-0 xl:border-b-0 xl:[&:nth-child(3n)]:border-r xl:last:border-r-0"
            >
              <p className="text-xs font-medium text-muted-foreground">
                {metric.label}
              </p>
              <p className="mt-2 text-lg font-semibold" dir="ltr">
                {metric.value}
              </p>
              <p
                className="mt-1 truncate text-xs text-muted-foreground"
                title={metric.detail}
              >
                {metric.detail}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("dashboard.instanceStatus")}</CardTitle>
        </CardHeader>
        <CardContent className="grid p-0 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [t("settings.vpnStandard"), "VLESS + XHTTP + REALITY"],
            [t("dashboard.publicPort"), "443"],
            [t("dashboard.adminTransport"), "HTTPS"],
            [
              t("dashboard.telemetrySource"),
              samples.length > 0
                ? t("settings.runtimeAgent")
                : t("common.pending"),
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex min-w-0 items-center justify-between gap-4 border-b px-5 py-3 text-xs last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0"
            >
              <span className="text-muted-foreground">{label}</span>
              <strong className="text-end font-medium" dir="ltr">
                {value}
              </strong>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
