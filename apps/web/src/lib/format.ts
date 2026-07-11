export function formatBytes(
  value: bigint | number | string | null | undefined,
  locale = "en",
) {
  const bytes = typeof value === "bigint" ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const amount = bytes / 1024 ** index;
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: amount >= 10 || index === 0 ? 0 : 1,
  }).format(amount);
  return `${formatted} ${units[index]}`;
}

export function formatDuration(
  seconds: bigint | number | string | null | undefined,
  locale = "en",
) {
  const total = Number(seconds ?? 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const number = new Intl.NumberFormat(locale);
  if (hours > 0) return `${number.format(hours)}h ${number.format(minutes)}m`;
  return `${number.format(minutes)}m`;
}

export function formatDate(
  value: Date | string | null | undefined,
  locale = "en",
  emptyValue = "Unlimited",
) {
  if (!value) return emptyValue;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

export function calculateRemainingDays(
  expiresAt: Date | string | null | undefined,
  now: Date | string | number = Date.now(),
) {
  if (!expiresAt) return null;
  const expiresAtMs = new Date(expiresAt).getTime();
  const nowMs = typeof now === "number" ? now : new Date(now).getTime();
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs)) return null;
  return Math.max(1, Math.ceil((expiresAtMs - nowMs) / (24 * 60 * 60 * 1000)));
}
