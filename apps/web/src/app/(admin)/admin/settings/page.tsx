import type { Metadata } from "next";
import {
  db,
  encryptedSecrets,
  instanceSettings,
  runtimeAgentState,
} from "@noxroute/db";
import { and, eq, isNull } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@noxroute/ui";

import { InstanceSettingsForm } from "@/components/settings/instance-settings-form";
import { getTranslations } from "@/i18n/server";
import { normalizeLocale } from "@/i18n/config";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { t } = await getTranslations();
  const [[settings], [runtime], [duckdnsSecret]] = await Promise.all([
    db.select().from(instanceSettings).limit(1),
    db.select().from(runtimeAgentState).limit(1),
    db
      .select({ id: encryptedSecrets.id })
      .from(encryptedSecrets)
      .where(
        and(
          eq(encryptedSecrets.kind, "duckdns_token"),
          isNull(encryptedSecrets.rotatedAt),
        ),
      )
      .limit(1),
  ]);
  const values = [
    [t("settings.vpnStandard"), "VLESS + XHTTP + REALITY"],
    [t("settings.vpnPort"), "443"],
    [t("settings.runtimeAgent"), runtime?.status ?? t("settings.notConnected")],
    ["Xray", runtime?.xrayRunning ? t("common.running") : t("common.waiting")],
    [
      t("settings.trafficGateway"),
      runtime?.trafficGatewayStatus ?? t("settings.notConnected"),
    ],
    [
      t("settings.gatewayCapacity"),
      t("settings.flows", {
        count: `${runtime?.trafficGatewayConnections ?? 0} / ${runtime?.trafficGatewayCapacity ?? 0}`,
      }),
    ],
    [
      t("settings.realityPublicKey"),
      settings?.realityPublicKey ?? t("settings.generatedByRuntime"),
    ],
  ];
  const defaultQuotaGigabytes = settings?.defaultQuotaBytes
    ? Number(settings.defaultQuotaBytes) / 1024 / 1024 / 1024
    : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase text-emerald-700">
          {t("settings.eyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.description")}
        </p>
      </header>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("settings.runtimeTransport")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-px bg-border p-0 sm:grid-cols-2 xl:grid-cols-3">
          {values.map(([label, value]) => (
            <div key={label} className="min-w-0 bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">
                {label}
              </p>
              <p className="mt-2 break-words text-sm font-medium" dir="ltr">
                {value}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("settings.vpnDefaults")}</CardTitle>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <InstanceSettingsForm
            duckdnsConfigured={Boolean(duckdnsSecret)}
            initialValues={{
              appLocale: normalizeLocale(settings?.appLocale),
              adminDomain:
                settings?.adminDomain ??
                process.env.NOXROUTE_ADMIN_DOMAIN ??
                "localhost",
              vpnDomain:
                settings?.vpnDomain ??
                process.env.NOXROUTE_VPN_DOMAIN ??
                "localhost",
              adminHttpsPort: settings?.adminHttpsPort ?? 8443,
              vpnPort: 443,
              xhttpPath: settings?.xhttpPath ?? "/noxroute",
              realityTarget: settings?.realityTarget ?? "www.speedtest.net:443",
              realityServerName:
                settings?.realityServerName ?? "www.speedtest.net",
              defaultConnectionProfile:
                settings?.defaultConnectionProfile ?? "balanced",
              defaultMaxDevices: settings?.defaultMaxDevices ?? 2,
              defaultMaxDays: settings?.defaultMaxDays ?? null,
              defaultMaxGigabytes: defaultQuotaGigabytes,
              defaultSpeedLimitMbps: settings?.defaultSpeedLimitMbps ?? 0,
              serverBandwidthLimitPercent:
                settings?.serverBandwidthLimitPercent ?? 90,
              subscriptionEnabled: settings?.subscriptionEnabled ?? true,
              enforceQuota: settings?.enforceQuota ?? true,
              enforceExpiry: settings?.enforceExpiry ?? true,
              telemetryIntervalSeconds:
                settings?.telemetryIntervalSeconds ?? 30,
              duckdnsToken: "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
