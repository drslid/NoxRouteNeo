export const INCY_LINKS = {
  website: "https://incy.cc/",
  appStore: "https://apps.apple.com/us/app/incy/id6756943388",
  googlePlay: "https://play.google.com/store/apps/details?id=llc.itdev.incy",
  desktop: "https://github.com/INCY-DEV/incy-platforms/releases/latest",
  hwidGuide: "https://docs.incy.cc/en/hwid/",
  subscriptionGuide: "https://docs.incy.cc/en/subscription-format/",
} as const;

export function buildIncyImportUrl(subscriptionUrl: string) {
  const parsed = new URL(subscriptionUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("INCY subscription imports require HTTPS");
  }
  return `incy://import/${subscriptionUrl}`;
}
