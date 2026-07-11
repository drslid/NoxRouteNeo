import { describe, expect, it } from "vitest";

import { bandwidthOptions, speedLimitOptions } from "./sizing";

describe("adaptive sizing options", () => {
  it("keeps small-server user limits below half of server bandwidth", () => {
    expect(speedLimitOptions(100)).toEqual([0, 1, 2, 5, 10, 20, 50]);
  });

  it("adds higher presets for a larger server", () => {
    expect(speedLimitOptions(1000)).toContain(500);
    expect(speedLimitOptions(1000)).not.toContain(1000);
  });

  it("preserves an existing custom value", () => {
    expect(speedLimitOptions(100, [75])).toContain(75);
    expect(bandwidthOptions(250, 375)).toContain(375);
  });

  it("does not suggest large-server bandwidth on a small profile", () => {
    expect(bandwidthOptions(100, null)).toEqual([50, 100, 250]);
  });
});
