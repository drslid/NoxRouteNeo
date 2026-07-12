import { describe, expect, it } from "vitest";

import { INCY_LINKS } from "./incy";

describe("INCY resources", () => {
  it("only links to the expected official HTTPS hosts", () => {
    const allowedHosts = new Set([
      "incy.cc",
      "apps.apple.com",
      "play.google.com",
      "github.com",
      "docs.incy.cc",
    ]);

    for (const value of Object.values(INCY_LINKS)) {
      const url = new URL(value);
      expect(url.protocol).toBe("https:");
      expect(allowedHosts.has(url.hostname)).toBe(true);
    }
  });
});
