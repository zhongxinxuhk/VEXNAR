// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  accessTokenItemsFromPayload,
  accessTokenScopesFromCatalog,
  hasPasswordProofMethod,
  isAuthBundle,
  maskApiKey,
  normalizeApiKey,
  normalizeModels,
  parseTokenItems,
  pickDefaultModel,
  proofTokenFromPayload,
  quotaFromUser,
  toAccessToken,
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
        items: [{ id: 7, name: "App-managed", remain_quota: 12, group: "pro" }],
      },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      id: 7,
      name: "App-managed",
      remain_quota: 12,
      group: "pro",
    });
    const token = tokenFromRecord({ ...tokens[0], key: "abcdefghijkl" });
    expect(token.maskedKey).toContain("...");
    expect(token.group).toBe("pro");
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
    // 账户余额不能继承 App-managed API Key 的 unlimited_quota。
    expect(quota.unlimited).toBe(false);
  });
});

describe("NewAPI auth bundle", () => {
  it("accepts a login response bundle", () => {
    expect(isAuthBundle({ access_token: "token", user: { id: 1 } })).toBe(true);
    expect(isAuthBundle({ access_token: "" })).toBe(false);
    expect(isAuthBundle(null)).toBe(false);
  });
});

describe("访问令牌契约", () => {
  const catalog = {
    success: true,
    data: {
      groups: [
        {
          group: "personal",
          resources: [
            { resource: "profile", actions: [{ action: "read" }, { action: "write" }] },
            { resource: "api_key", actions: [{ action: "read" }, { action: "write" }] },
          ],
        },
        {
          group: "ops",
          resources: [{ resource: "usage", actions: [{ action: "read" }] }],
        },
      ],
      max_tokens: 10,
    },
  };

  it("权限目录展平成 resource:action 全选", () => {
    expect(accessTokenScopesFromCatalog(catalog)).toEqual([
      "api_key:read",
      "api_key:write",
      "profile:read",
      "profile:write",
      "usage:read",
    ]);
  });

  it("目录结构异常时返回空数组", () => {
    expect(accessTokenScopesFromCatalog(null)).toEqual([]);
    expect(accessTokenScopesFromCatalog({ success: true, data: {} })).toEqual([]);
    expect(
      accessTokenScopesFromCatalog({ data: { groups: [{ resources: [{ actions: [] }] }] } }),
    ).toEqual([]);
  });

  it("解析令牌项与列表", () => {
    expect(
      accessTokenItemsFromPayload({
        success: true,
        data: { items: [{ id: 7, name: "App-managed", scopes: ["profile:read"], expires_at: 0 }] },
      }),
    ).toHaveLength(1);
    expect(accessTokenItemsFromPayload({ success: false, data: {} })).toBeNull();
    expect(
      toAccessToken({ id: 7, name: "App-managed", scopes: ["profile:read"], created_at: 1700000000 }),
    ).toEqual({
      id: 7,
      name: "App-managed",
      scopes: ["profile:read"],
      expiresAt: 0,
      createdAt: 1700000000,
    });
    expect(toAccessToken({ name: "missing-id" })).toBeNull();
  });

  it("只认可用的 password 验证方式", () => {
    expect(
      hasPasswordProofMethod({ data: { methods: [{ method: "password", available: true }] } }),
    ).toBe(true);
    expect(
      hasPasswordProofMethod({ data: { methods: [{ method: "2fa", available: true }] } }),
    ).toBe(false);
    expect(
      hasPasswordProofMethod({ data: { methods: [{ method: "password", available: false }] } }),
    ).toBe(false);
    expect(hasPasswordProofMethod({ data: {} })).toBe(false);
  });

  it("解析 proof_token", () => {
    expect(proofTokenFromPayload({ data: { proof_token: "abc" } })).toBe("abc");
    expect(proofTokenFromPayload({ data: {} })).toBe("");
    expect(proofTokenFromPayload(null)).toBe("");
  });
});
