import { describe, expect, it } from "vitest";

import {
  calculateSampleWindowSeconds,
  calculateThroughputMbps,
  roundTelemetryValue,
} from "./telemetry";

describe("traffic telemetry", () => {
  it("converts bytes over an interval to decimal megabits per second", () => {
    expect(calculateThroughputMbps(3_750_000n, 30)).toBe(1);
  });

  it("uses the actual interval between consecutive samples", () => {
    expect(
      calculateSampleWindowSeconds({
        previousSampledAt: new Date("2026-07-10T18:00:00.000Z"),
        sampledAt: new Date("2026-07-10T18:00:32.500Z"),
        expectedSeconds: 30,
      }),
    ).toBe(32.5);
  });

  it("falls back to the configured interval after a telemetry gap", () => {
    expect(
      calculateSampleWindowSeconds({
        previousSampledAt: new Date("2026-07-10T18:00:00.000Z"),
        sampledAt: new Date("2026-07-10T18:10:00.000Z"),
        expectedSeconds: 20,
      }),
    ).toBe(20);
  });

  it("rounds chart values without losing low throughput", () => {
    expect(roundTelemetryValue(0.01276)).toBe(0.013);
  });
});
