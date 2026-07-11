import type { Metadata } from "next";

import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { getTranslations } from "@/i18n/server";

export const metadata: Metadata = { title: "Two-factor verification" };

export default async function TwoFactorPage() {
  const { t } = await getTranslations();
  return (
    <div>
      <p className="text-xs font-medium uppercase text-emerald-700">
        {t("auth.secondFactor")}
      </p>
      <h2 className="mt-2 text-2xl font-semibold">
        {t("auth.twoFactorTitle")}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {t("auth.twoFactorDescription")}
      </p>
      <TwoFactorForm />
    </div>
  );
}
