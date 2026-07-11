import { describe, expect, it } from "vitest";

import {
  appLocaleSchema,
  createAccountSchema,
  runtimeCommandSchema,
  signInSchema,
} from "./index";

describe("shared contracts", () => {
  it("normalizes usernames", () => {
    const result = signInSchema.parse({
      username: "  Alice.Admin  ",
      password: "valid-password",
    });

    expect(result.username).toBe("alice.admin");
  });

  it("rejects weak account passwords", () => {
    const result = createAccountSchema.safeParse({
      displayName: "Alice",
      username: "alice",
      password: "too-short",
      role: "user",
    });

    expect(result.success).toBe(false);
  });

  it("rejects arbitrary runtime commands", () => {
    const result = runtimeCommandSchema.safeParse({
      type: "RUN_SHELL",
      idempotencyKey: crypto.randomUUID(),
      payload: { command: "rm -rf /" },
    });

    expect(result.success).toBe(false);
  });

  it("accepts only supported instance locales", () => {
    expect(appLocaleSchema.options).toEqual([
      "en",
      "es",
      "fr",
      "de",
      "zh-CN",
      "ar",
      "ru",
      "pt",
      "hi",
      "ur",
    ]);
    expect(appLocaleSchema.safeParse("en-US").success).toBe(false);
  });
});
