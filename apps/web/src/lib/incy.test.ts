import { describe, expect, it } from "vitest";

import { buildIncyImportUrl, INCY_LINKS } from "./incy";

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

  it("builds the documented INCY subscription deep link", () => {
    expect(buildIncyImportUrl("https://vpn.example.test:8443/sub/secret")).toBe(
      "incy://import/https://vpn.example.test:8443/sub/secret",
    );
  });

  it("rejects non-HTTPS subscription imports", () => {
    expect(() =>
      buildIncyImportUrl("http://vpn.example.test/sub/secret"),
    ).toThrow("require HTTPS");
  });
});
