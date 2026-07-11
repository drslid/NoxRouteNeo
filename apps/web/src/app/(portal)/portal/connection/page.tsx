import type { Metadata } from "next";

import { ConnectionCard } from "@/components/devices/connection-card";
import { getPortalData } from "@/data/portal";
import { requireUser } from "@/lib/session";
import { getTranslations } from "@/i18n/server";

export const metadata: Metadata = { title: "Connection" };

export const dynamic = "force-dynamic";

export default async function ConnectionPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string }>;
}) {
  const session = await requireUser();
  const { t } = await getTranslations();
  const { devices } = await getPortalData(session.user.id);
  const selectedDevice = (await searchParams).device;
  const activeDevices = devices.filter((device) => device.status === "active");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase text-emerald-700">
          {t("connection.eyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{t("nav.connection")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("connection.description")}
        </p>
      </header>
      {activeDevices.length > 0 ? (
        <div className="grid gap-4">
          {activeDevices.map((device) => (
            <ConnectionCard
              key={device.id}
              device={device}
              initialOpen={
                selectedDevice === device.id ||
                (!selectedDevice && activeDevices.length === 1)
              }
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {t("connection.registerFirst")}
        </div>
      )}
    </div>
  );
}
