import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

import { QueryProvider } from "@/components/query-provider";
import { I18nProvider } from "@/i18n/client";
import { localeDirection } from "@/i18n/config";
import { getTranslations } from "@/i18n/server";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NoxRouteNeo",
    template: "%s | NoxRouteNeo",
  },
  description: "Private self-hosted VPN gateway administration.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
      noimageindex: true,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#0d1825",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { locale, messages } = await getTranslations();
  const direction = localeDirection(locale);

  return (
    <html lang={locale} dir={direction} suppressHydrationWarning>
      <body>
        <I18nProvider locale={locale} messages={messages}>
          <QueryProvider>{children}</QueryProvider>
          <Toaster
            richColors
            closeButton
            position={direction === "rtl" ? "top-left" : "top-right"}
          />
        </I18nProvider>
      </body>
    </html>
  );
}
