import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { securityHeaders } from "../../next.config";

describe("indexing policy", () => {
  it("blocks compliant crawlers for every application response", () => {
    const header = securityHeaders.find(
      (item) => item.key.toLowerCase() === "x-robots-tag",
    );

    expect(header?.value).toContain("noindex");
    expect(header?.value).toContain("nofollow");
    expect(header?.value).toContain("noarchive");
  });

  it("disallows every crawler in robots.txt", () => {
    const robots = readFileSync(
      new URL("../../public/robots.txt", import.meta.url),
      "utf8",
    );

    expect(robots).toMatch(/User-agent:\s*\*/i);
    expect(robots).toMatch(/Disallow:\s*\//i);
  });
});
