import { describe, expect, it } from "vitest";

import { calculateRemainingDays, formatDateTime } from "./format";

describe("calculateRemainingDays", () => {
  it("accepts timestamp strings returned by PostgreSQL drivers", () => {
    expect(
      calculateRemainingDays(
        "2026-07-12T12:00:00.000Z",
        "2026-07-10T12:00:00.000Z",
      ),
    ).toBe(2);
  });

  it("keeps an access editable during its final partial day", () => {
    expect(
      calculateRemainingDays(
        new Date("2026-07-10T12:30:00.000Z"),
        new Date("2026-07-10T12:00:00.000Z"),
      ),
    ).toBe(1);
  });

  it("returns null for an unlimited access", () => {
    expect(calculateRemainingDays(null)).toBeNull();
  });
});

describe("formatDateTime", () => {
  it("uses UTC so server and browser hydration produce the same text", () => {
    const value = formatDateTime("2026-01-02T03:04:00.000Z", "en");

    expect(value).toContain("03:04");
    expect(value).toContain("UTC");
  });
});
