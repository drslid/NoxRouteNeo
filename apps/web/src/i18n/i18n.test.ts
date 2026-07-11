import { describe, expect, it } from "vitest";

import { localeDirection, localeOptions, normalizeLocale } from "./config";
import { getMessages } from "./messages";

describe("instance localization", () => {
  it("ships a complete non-empty catalog for every supported locale", () => {
    const englishKeys = Object.keys(getMessages("en"));

    expect(localeOptions).toHaveLength(10);
    for (const { value } of localeOptions) {
      const messages = getMessages(value);
      expect(Object.keys(messages)).toEqual(englishKeys);
      expect(
        Object.values(messages).every((message) => message.trim().length > 0),
      ).toBe(true);
    }
  });

  it("uses right-to-left layout only for Arabic and Urdu", () => {
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("ur")).toBe("rtl");
    expect(localeDirection("en")).toBe("ltr");
    expect(localeDirection("zh-CN")).toBe("ltr");
  });

  it("falls back to English for invalid persisted values", () => {
    expect(normalizeLocale("xx")).toBe("en");
    expect(normalizeLocale(null)).toBe("en");
  });
});
