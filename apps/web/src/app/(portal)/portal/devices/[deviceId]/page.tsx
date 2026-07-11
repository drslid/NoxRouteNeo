import type { Metadata } from "next";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@noxroute/ui";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, devices, vpnAccesses } from "@noxroute/db";

import { DeviceSettingsForm } from "@/components/devices/device-settings-form";
import { requireUser } from "@/lib/session";
import { platformMessageKey, statusMessageKey } from "@/i18n/labels";
import { getTranslations } from "@/i18n/server";

export const metadata: Metadata = { title: "Device settings" };

export default async function DeviceDetailsPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const session = await requireUser();
  const { t } = await getTranslations();
  const { deviceId } = await params;
  const [record] = await db
    .select({ device: devices })
    .from(devices)
    .innerJoin(vpnAccesses, eq(devices.vpnAccessId, vpnAccesses.id))
    .where(
      and(eq(devices.id, deviceId), eq(vpnAccesses.userId, session.user.id)),
    )
    .limit(1);
  if (!record || record.device.status === "revoked") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-emerald-700">
            {t("common.device")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{record.device.name}</h1>
          <p className="mt-1 text-sm capitalize text-muted-foreground">
            {t("devices.deviceLabel", {
              platform: t(platformMessageKey(record.device.platform)),
            })}
          </p>
        </div>
        <Badge
          variant={record.device.status === "active" ? "success" : "warning"}
        >
          {t(statusMessageKey(record.device.status))}
        </Badge>
      </header>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("devices.profileTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <DeviceSettingsForm
            deviceId={record.device.id}
            initialValues={{
              name: record.device.name,
              platform: record.device.platform,
              connectionProfile: record.device.profile,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
