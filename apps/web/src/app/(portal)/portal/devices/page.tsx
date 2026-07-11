import type { Metadata } from "next";
import {
  Badge,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@noxroute/ui";
import { Plus, Settings } from "lucide-react";
import Link from "next/link";

import { getPortalData } from "@/data/portal";
import { formatBytes, formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { intlLocale } from "@/i18n/config";
import {
  platformMessageKey,
  profileMessageKey,
  statusMessageKey,
} from "@/i18n/labels";
import { getTranslations } from "@/i18n/server";

export const metadata: Metadata = { title: "Devices" };
export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const session = await requireUser();
  const { locale, t } = await getTranslations();
  const numberLocale = intlLocale(locale);
  const { access, devices } = await getPortalData(session.user.id);
  const registeredCount = devices.filter(
    (device) => device.status !== "revoked",
  ).length;
  const canRegister = Boolean(access && registeredCount < access.maxDevices);

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase text-emerald-700">
            {t("devices.eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{t("nav.devices")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("devices.registrationCount", {
              registered: registeredCount,
              maximum: access?.maxDevices ?? 0,
            })}
          </p>
        </div>
        {canRegister ? (
          <Button asChild>
            <Link href="/portal/devices/new">
              <Plus aria-hidden="true" />
              {t("devices.register")}
            </Link>
          </Button>
        ) : (
          <Button disabled>
            <Plus aria-hidden="true" />
            {t("devices.register")}
          </Button>
        )}
      </header>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.device")}</TableHead>
              <TableHead>{t("common.platform")}</TableHead>
              <TableHead>{t("common.profile")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("common.transfer")}</TableHead>
              <TableHead>{t("common.lastSeen")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("common.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.length > 0 ? (
              devices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell className="font-medium">{device.name}</TableCell>
                  <TableCell>
                    {t(platformMessageKey(device.platform))}
                  </TableCell>
                  <TableCell>{t(profileMessageKey(device.profile))}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        device.status === "active" ? "success" : "warning"
                      }
                    >
                      {t(statusMessageKey(device.status))}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {formatBytes(device.usedBytes, numberLocale)}
                  </TableCell>
                  <TableCell>
                    {device.lastSeenAt
                      ? formatDate(device.lastSeenAt, numberLocale)
                      : t("common.never")}
                  </TableCell>
                  <TableCell>
                    {device.status !== "revoked" && (
                      <Button asChild variant="ghost" size="icon">
                        <Link
                          href={`/portal/devices/${device.id}`}
                          aria-label={t("devices.configure", {
                            name: device.name,
                          })}
                          title={t("devices.configure", { name: device.name })}
                        >
                          <Settings aria-hidden="true" />
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-32 text-center text-muted-foreground"
                >
                  {t("devices.noDevices")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
