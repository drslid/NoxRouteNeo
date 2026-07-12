"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, CalendarClock, Database, Gauge } from "lucide-react";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@noxroute/ui";

import type { getPortalDashboard } from "@/data/portal";
import { useI18n } from "@/i18n/client";
import { intlLocale } from "@/i18n/config";
import {
  platformMessageKey,
  profileMessageKey,
  statusMessageKey,
} from "@/i18n/labels";
import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatDuration,
} from "@/lib/format";

type PortalDashboardData = Awaited<ReturnType<typeof getPortalDashboard>>;

async function fetchPortalDashboard() {
  const response = await fetch("/api/portal/dashboard", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Portal telemetry could not be refreshed");
  }
  return (await response.json()) as PortalDashboardData;
}

export function PortalDashboardLive({
  initialData,
  name,
}: {
  initialData: PortalDashboardData;
  name: string;
}) {
  const { locale, t } = useI18n();
  const numberLocale = intlLocale(locale);
  const { data } = useQuery({
    queryKey: ["portal-dashboard"],
    queryFn: fetchPortalDashboard,
    initialData,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const { access, deviceCount, devices } = data;
  const lastSeen = (value: string | null) =>
    value ? formatDateTime(value, numberLocale) : t("common.never");
  const activityStatus = (device: (typeof devices)[number]) => (
    <Badge
      variant={
        device.activeConnections > 0
          ? "success"
          : device.status === "active"
            ? "outline"
            : "warning"
      }
    >
      {device.activeConnections > 0
        ? t("activity.activeCount", {
            count: device.activeConnections.toLocaleString(numberLocale),
          })
        : t(statusMessageKey(device.status))}
    </Badge>
  );
  const metrics = [
    {
      label: t("portal.dataUsed"),
      value: formatBytes(access?.usedBytes, numberLocale),
      detail: access?.quotaBytes
        ? t("portal.ofQuota", {
            quota: formatBytes(access.quotaBytes, numberLocale),
          })
        : t("portal.unlimitedQuota"),
      icon: Database,
    },
    {
      label: t("accounts.connectionTime"),
      value: formatDuration(access?.connectedSeconds, numberLocale),
      detail: t("portal.aggregatedTotal"),
      icon: Activity,
    },
    {
      label: t("portal.activeConnections"),
      value: String(access?.activeConnections ?? 0),
      detail: t("portal.registeredDevices", { count: deviceCount }),
      icon: Gauge,
    },
    {
      label: t("accounts.expires"),
      value: formatDate(access?.expiresAt, numberLocale, t("common.unlimited")),
      detail: access?.expiresAt
        ? t("portal.accessExpiration")
        : t("portal.noTimeLimit"),
      icon: CalendarClock,
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase text-emerald-700">
            {t("portal.eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{t("portal.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("portal.description", { name })}
          </p>
        </div>
        <Badge variant={access?.status === "active" ? "success" : "warning"}>
          {access?.status
            ? t(statusMessageKey(access.status))
            : t("portal.accessPending")}
        </Badge>
      </header>

      {!access && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {t("portal.noAccess")}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      {metric.label}
                    </p>
                    <p className="mt-2 truncate text-xl font-semibold">
                      {metric.value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {metric.detail}
                    </p>
                  </div>
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-4 border-b">
          <div>
            <CardTitle>{t("nav.activity")}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("activity.description")}
            </p>
          </div>
          <Badge variant="outline">{t("dashboard.live")}</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y md:hidden">
            {devices.length > 0 ? (
              devices.map((device) => (
                <div key={device.id} className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{device.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(platformMessageKey(device.platform))}
                      </p>
                    </div>
                    {activityStatus(device)}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t("common.profile")}
                      </dt>
                      <dd className="mt-1 font-medium">
                        {t(profileMessageKey(device.profile))}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t("common.transfer")}
                      </dt>
                      <dd className="mt-1 font-medium">
                        {formatBytes(device.usedBytes, numberLocale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t("common.connected")}
                      </dt>
                      <dd className="mt-1 font-medium">
                        {formatDuration(device.connectedSeconds, numberLocale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t("common.lastSeen")}
                      </dt>
                      <dd className="mt-1 font-medium">
                        {lastSeen(device.lastSeenAt)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))
            ) : (
              <div className="grid h-32 place-items-center p-4 text-center text-sm text-muted-foreground">
                {t("activity.noDevices")}
              </div>
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.device")}</TableHead>
                  <TableHead>{t("common.profile")}</TableHead>
                  <TableHead>{t("common.transfer")}</TableHead>
                  <TableHead>{t("common.connected")}</TableHead>
                  <TableHead>{t("common.lastSeen")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.length > 0 ? (
                  devices.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell>
                        <span className="block font-medium">{device.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {t(platformMessageKey(device.platform))}
                        </span>
                      </TableCell>
                      <TableCell>
                        {t(profileMessageKey(device.profile))}
                      </TableCell>
                      <TableCell>
                        {formatBytes(device.usedBytes, numberLocale)}
                      </TableCell>
                      <TableCell>
                        {formatDuration(device.connectedSeconds, numberLocale)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {lastSeen(device.lastSeenAt)}
                      </TableCell>
                      <TableCell>{activityStatus(device)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center text-muted-foreground"
                    >
                      {t("activity.noDevices")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
