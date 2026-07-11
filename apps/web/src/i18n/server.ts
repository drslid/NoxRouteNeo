import "server-only";

import type { AppLocale } from "@noxroute/contracts";
import { db, instanceSettings } from "@noxroute/db";
import { eq } from "drizzle-orm";
import { cache } from "react";

import { defaultLocale, normalizeLocale } from "./config";
import { getMessages, type MessageKey } from "./messages";

type Values = Record<string, string | number>;

export const getAppLocale = cache(async (): Promise<AppLocale> => {
  try {
    const [settings] = await db
      .select({ appLocale: instanceSettings.appLocale })
      .from(instanceSettings)
      .where(eq(instanceSettings.id, "default"))
      .limit(1);
    return normalizeLocale(settings?.appLocale ?? process.env.APP_LOCALE);
  } catch {
    return normalizeLocale(process.env.APP_LOCALE ?? defaultLocale);
  }
});

export const getTranslations = cache(async () => {
  const locale = await getAppLocale();
  const messages = getMessages(locale);
  return {
    locale,
    messages,
    t(key: MessageKey, values?: Values) {
      const message = messages[key];
      if (!values) return message;
      return message.replace(/\{(\w+)\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(values, name)
          ? String(values[name])
          : match,
      );
    },
  };
});
