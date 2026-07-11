"use client";

import type { AppLocale } from "@noxroute/contracts";
import * as React from "react";

import { localeDirection } from "./config";
import type { MessageKey, Messages } from "./messages";

type Values = Record<string, string | number>;

function interpolate(message: string, values?: Values) {
  if (!values) return message;
  return message.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key)
      ? String(values[key])
      : match,
  );
}

const I18nContext = React.createContext<{
  locale: AppLocale;
  direction: "ltr" | "rtl";
  t: (key: MessageKey, values?: Values) => string;
} | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: AppLocale;
  messages: Messages;
  children: React.ReactNode;
}) {
  const value = React.useMemo(
    () => ({
      locale,
      direction: localeDirection(locale),
      t: (key: MessageKey, values?: Values) =>
        interpolate(messages[key], values),
    }),
    [locale, messages],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = React.useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
