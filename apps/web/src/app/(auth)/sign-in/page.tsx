import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";
import { getTranslations } from "@/i18n/server";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getSession()) {
    redirect("/");
  }
  const { t } = await getTranslations();

  return (
    <div>
      <p className="text-xs font-medium uppercase text-emerald-700">
        {t("auth.secureAccess")}
      </p>
      <h2 className="mt-2 text-2xl font-semibold">{t("auth.signInTitle")}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {t("auth.signInDescription")}
      </p>
      <SignInForm />
    </div>
  );
}
