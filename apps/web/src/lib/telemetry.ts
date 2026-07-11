const DEFAULT_SAMPLE_WINDOW_SECONDS = 30;

export function calculateSampleWindowSeconds({
  sampledAt,
  previousSampledAt,
  expectedSeconds = DEFAULT_SAMPLE_WINDOW_SECONDS,
}: {
  sampledAt: Date;
  previousSampledAt?: Date;
  expectedSeconds?: number;
}) {
  const fallback = Math.max(1, expectedSeconds);
  if (!previousSampledAt) {
    return fallback;
  }

  const elapsedSeconds =
    (sampledAt.getTime() - previousSampledAt.getTime()) / 1_000;
  if (
    !Number.isFinite(elapsedSeconds) ||
    elapsedSeconds <= 0 ||
    elapsedSeconds > fallback * 3
  ) {
    return fallback;
  }

  return elapsedSeconds;
}

export function calculateThroughputMbps(bytes: bigint, seconds: number) {
  if (bytes <= 0n || !Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }

  return (Number(bytes) * 8) / seconds / 1_000_000;
}

export function roundTelemetryValue(value: number) {
  return Math.round(value * 1_000) / 1_000;
}
