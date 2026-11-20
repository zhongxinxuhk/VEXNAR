import { describe, expect, it } from "vitest";
import {
  isAuthBundle,
  maskApiKey,
  normalizeApiKey,
  normalizeModels,
  parseTokenItems,
  pickDefaultModel,
  quotaFromUser,
  tokenFromRecord,
} from "../src/main/newapi-utils";

describe("NewAPI model helpers", () => {
  it("deduplicates and trims models", () => {
    expect(
      normalizeModels([" gpt-5-codex ", "gpt-5-codex", "", 42, "gpt-5"]),
    ).toEqual(["gpt-5-codex", "gpt-5"]);
  });

  it("keeps the current model when available", () => {
    expect(pickDefaultModel(["gpt-5", "gpt-5-codex"], "gpt-5")).toBe("gpt-5");
  });

  it("prefers a chat model over an embedding model", () => {
    expect(pickDefaultModel(["text-embedding-3-large", "gpt-5-codex"])).toBe(
      "gpt-5-codex",
    );
  });
});

describe("NewAPI token helpers", () => {
  it("normalizes a relay key exactly once", () => {
    expect(normalizeApiKey("abc123")).toBe("sk-abc123");
    expect(normalizeApiKey("sk-abc123")).toBe("sk-abc123");
  });

  it("masks the key without exposing it", () => {
    const masked = maskApiKey("sk-1234567890abcdef");
    expect(masked.startsWith("sk-12345")).toBe(true);
    expect(masked.endsWith("cdef")).toBe(true);
    expect(masked).not.toContain("67890");
  });

  it("extracts items from a paged token response", () => {
    const tokens = parseTokenItems({
      success: true,
      data: {
        page: 1,
        page_size: 100,
        total: 1,
        items: [{ id: 7, name: "App-managed", remain_quota: 12 }],
      },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      id: 7,
      name: "App-managed",
      remain_quota: 12,
    });
    expect(
      tokenFromRecord({ ...tokens[0], key: "abcdefghijkl" }).maskedKey,
    ).toContain("...");
  });
});

describe("NewAPI quota helpers", () => {
  it("converts quota into a currency summary", () => {
    const quota = quotaFromUser(
      { quota: 250000, used_quota: 250000, request_count: 3 },
      {
        quota_per_unit: 500000,
        display_in_currency: true,
        usd_exchange_rate: 1,
      },
    );
    expect(quota.remaining).toBe(250000);
    expect(quota.used).toBe(250000);
    expect(quota.requestCount).toBe(3);
    expect(quota.quotaPerUnit).toBe(500000);
    expect(quota.displayInCurrency).toBe(true);
  });
});

describe("NewAPI auth bundle", () => {
  it("accepts a login response bundle", () => {
    expect(isAuthBundle({ access_token: "token", user: { id: 1 } })).toBe(true);
    expect(isAuthBundle({ access_token: "" })).toBe(false);
    expect(isAuthBundle(null)).toBe(false);
  });
});
