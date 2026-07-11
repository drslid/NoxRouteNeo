import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@noxroute/ui";

import { CreateDeviceForm } from "@/components/devices/device-form";
import { getTranslations } from "@/i18n/server";

export const metadata: Metadata = { title: "Register device" };

export default async function NewDevicePage() {
  const { t } = await getTranslations();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-medium uppercase text-emerald-700">
          {t("devices.eyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{t("devices.register")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("devices.registerDescription")}
        </p>
      </header>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("devices.details")}</CardTitle>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <CreateDeviceForm />
        </CardContent>
      </Card>
    </div>
  );
}
