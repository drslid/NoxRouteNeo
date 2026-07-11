import { NoxRouteLogo } from "@noxroute/ui";

import { getTranslations } from "@/i18n/server";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = await getTranslations();

  return (
    <main className="grid min-h-screen grid-cols-1 bg-background lg:grid-cols-[minmax(320px,0.85fr)_minmax(520px,1.15fr)]">
      <section className="hidden border-r border-white/10 bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col">
        <NoxRouteLogo />
        <div className="mt-auto max-w-md">
          <p className="mb-4 text-xs font-medium uppercase text-emerald-300">
            {t("auth.gatewayEyebrow")}
          </p>
          <h1 className="text-3xl font-semibold leading-tight">
            {t("auth.gatewayTitle")}
          </h1>
          <p className="mt-4 text-sm leading-6 text-sidebar-muted">
            {t("auth.gatewayDescription")}
          </p>
        </div>
      </section>
      <section className="flex min-h-screen items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <NoxRouteLogo />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
