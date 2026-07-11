import { describe, expect, it } from "vitest";

import { calculateRemainingDays } from "./format";

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
