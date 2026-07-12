"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@noxroute/ui";

import type { getAdminActivity } from "@/data/activity";
import { useI18n } from "@/i18n/client";
import { intlLocale } from "@/i18n/config";
import {
  platformMessageKey,
  profileMessageKey,
  statusMessageKey,
} from "@/i18n/labels";
import { formatBytes, formatDuration } from "@/lib/format";

type ActivityData = Awaited<ReturnType<typeof getAdminActivity>>;

async function fetchActivity() {
  const response = await fetch("/api/admin/activity", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Activity could not be refreshed");
  }
  return (await response.json()) as ActivityData;
}

export function ActivityLiveTable({
  initialData,
}: {
  initialData: ActivityData;
}) {
  const { locale, t } = useI18n();
  const numberLocale = intlLocale(locale);
  const { data: rows } = useQuery({
    queryKey: ["admin-activity"],
    queryFn: fetchActivity,
    initialData,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase text-emerald-700">
          {t("activity.eyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{t("nav.activity")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("activity.description")}
        </p>
      </header>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.user")}</TableHead>
                <TableHead>{t("common.device")}</TableHead>
                <TableHead>{t("common.profile")}</TableHead>
                <TableHead>{t("common.transfer")}</TableHead>
                <TableHead>{t("common.connected")}</TableHead>
                <TableHead>{t("common.lastSeen")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      @{row.username ?? t("common.unknown")}
                    </TableCell>
                    <TableCell>
                      <span className="block font-medium">
                        {row.deviceName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t(platformMessageKey(row.platform))}
                      </span>
                    </TableCell>
                    <TableCell>{t(profileMessageKey(row.profile))}</TableCell>
                    <TableCell>
                      {formatBytes(row.usedBytes, numberLocale)}
                    </TableCell>
                    <TableCell>
                      {formatDuration(row.connectedSeconds, numberLocale)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {row.lastSeenAt
                        ? new Date(row.lastSeenAt).toLocaleString(numberLocale)
                        : t("common.never")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.activeConnections > 0
                            ? "success"
                            : row.status === "active"
                              ? "outline"
                              : "warning"
                        }
                      >
                        {row.activeConnections > 0
                          ? t("activity.activeCount", {
                              count:
                                row.activeConnections.toLocaleString(
                                  numberLocale,
                                ),
                            })
                          : t(statusMessageKey(row.status))}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {t("activity.noDevices")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
