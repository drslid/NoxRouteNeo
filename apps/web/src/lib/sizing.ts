export const sizingProfiles = [
  "compact",
  "small",
  "standard",
  "performance",
  "high-capacity",
] as const;

export type SizingProfile = (typeof sizingProfiles)[number];

export function isSizingProfile(value: unknown): value is SizingProfile {
  return (
    typeof value === "string" &&
    sizingProfiles.includes(value as SizingProfile)
  );
}

export function speedLimitOptions(
  serverBandwidthMbps: number,
  selectedValues: number[] = [],
) {
  const maximumPerUser = Math.max(1, Math.floor(serverBandwidthMbps / 2));
  const standardValues = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  return Array.from(
    new Set([
      0,
      ...standardValues.filter((value) => value <= maximumPerUser),
      ...selectedValues.filter((value) => value >= 0),
    ]),
  ).sort((first, second) => first - second);
}

export function bandwidthOptions(
  recommendedBandwidthMbps: number,
  selectedValue: number | null,
) {
  const standardValues = [50, 100, 250, 500, 1000, 2000, 5000, 10000];
  const maximumSuggested = Math.max(100, recommendedBandwidthMbps * 4);
  return Array.from(
    new Set([
      ...standardValues.filter((value) => value <= maximumSuggested),
      recommendedBandwidthMbps,
      ...(selectedValue ? [selectedValue] : []),
    ]),
  ).sort((first, second) => first - second);
}
