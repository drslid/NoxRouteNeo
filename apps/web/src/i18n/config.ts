import { appLocaleSchema, type AppLocale } from "@noxroute/contracts";

export const localeOptions: ReadonlyArray<{
  value: AppLocale;
  label: string;
  direction: "ltr" | "rtl";
}> = [
  { value: "en", label: "English", direction: "ltr" },
  { value: "es", label: "Español", direction: "ltr" },
  { value: "fr", label: "Français", direction: "ltr" },
  { value: "de", label: "Deutsch", direction: "ltr" },
  { value: "zh-CN", label: "简体中文", direction: "ltr" },
  { value: "ar", label: "العربية", direction: "rtl" },
  { value: "ru", label: "Русский", direction: "ltr" },
  { value: "pt", label: "Português", direction: "ltr" },
  { value: "hi", label: "हिन्दी", direction: "ltr" },
  { value: "ur", label: "اردو", direction: "rtl" },
];

export const defaultLocale: AppLocale = "en";

export function normalizeLocale(value: unknown): AppLocale {
  const parsed = appLocaleSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultLocale;
}

export function resolveLocale(
  personalLocale: unknown,
  instanceLocale: unknown,
): AppLocale {
  const personal = appLocaleSchema.safeParse(personalLocale);
  return personal.success ? personal.data : normalizeLocale(instanceLocale);
}

export function localeDirection(locale: AppLocale): "ltr" | "rtl" {
  return locale === "ar" || locale === "ur" ? "rtl" : "ltr";
}

export function intlLocale(locale: AppLocale) {
  if (locale === "pt") return "pt-PT";
  if (locale === "hi") return "hi-IN";
  if (locale === "ur") return "ur-PK";
  return locale;
}
