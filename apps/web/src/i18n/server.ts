import "server-only";

import type { AppLocale } from "@noxroute/contracts";
import { db, instanceSettings, user } from "@noxroute/db";
import { eq } from "drizzle-orm";
import { cache } from "react";

import { getSession } from "@/lib/session";

import { defaultLocale, resolveLocale } from "./config";
import { getMessages, type MessageKey } from "./messages";

type Values = Record<string, string | number>;

export const getAppLocale = cache(async (): Promise<AppLocale> => {
  try {
    const session = await getSession();
    const [settings] = await db
      .select({ appLocale: instanceSettings.appLocale })
      .from(instanceSettings)
      .where(eq(instanceSettings.id, "default"))
      .limit(1);

    if (session) {
      const [account] = await db
        .select({ locale: user.locale })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1);
      return resolveLocale(
        account?.locale,
        settings?.appLocale ?? process.env.APP_LOCALE,
      );
    }

    return resolveLocale(null, settings?.appLocale ?? process.env.APP_LOCALE);
  } catch {
    return resolveLocale(null, process.env.APP_LOCALE ?? defaultLocale);
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
