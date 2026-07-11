import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@noxroute/ui";
import { db, instanceSettings } from "@noxroute/db";

import { CreateAccountForm } from "@/components/accounts/create-account-form";
import { requireAdmin } from "@/lib/session";
import { getRuntimeSizing } from "@/lib/runtime-health";
import { speedLimitOptions } from "@/lib/sizing";
import { getTranslations } from "@/i18n/server";

export const metadata: Metadata = { title: "Create account" };

export default async function NewAccountPage() {
  const { role } = await requireAdmin();
  const { t } = await getTranslations();
  const [[settings], runtimeSizing] = await Promise.all([
    db.select().from(instanceSettings).limit(1),
    getRuntimeSizing(),
  ]);
  const defaultQuotaGigabytes = settings?.defaultQuotaBytes
    ? Number(settings.defaultQuotaBytes) / 1024 / 1024 / 1024
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-medium uppercase text-emerald-700">
          {t("accounts.eyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          {t("accounts.createTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("accounts.createDescription")}
        </p>
      </header>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("accounts.details")}</CardTitle>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <CreateAccountForm
            canCreateAdmin={role === "owner"}
            speedOptions={speedLimitOptions(
              settings?.serverBandwidthMbps ??
                runtimeSizing?.serverBandwidthMbps ??
                100,
              [settings?.defaultSpeedLimitMbps ?? 0],
            )}
            vpnDefaults={{
              maxDevices: settings?.defaultMaxDevices ?? 2,
              maxDays: settings?.defaultMaxDays ?? null,
              maxGigabytes: defaultQuotaGigabytes,
              speedLimitMbps: settings?.defaultSpeedLimitMbps ?? 0,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
