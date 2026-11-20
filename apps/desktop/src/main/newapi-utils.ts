// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
  NewApiAuthMethods,
  NewApiAuthProvider,
  NewApiQuota,
  NewApiToken,
} from "@shared/contracts";

export type TokenRecord = {
  id: number;
  name: string;
  key?: string;
  unlimited_quota?: boolean;
  remain_quota?: number;
  used_quota?: number;
  status?: number;
  expired_time?: number;
  model_limits_enabled?: boolean;
};

const NON_CHAT_MODEL = [
  "embedding",
  "embed",
  "rerank",
  "whisper",
  "tts",
  "text-to-speech",
  "image",
  "dall-e",
  "midjourney",
  "sora",
  "moderation",
];

const CHAT_PREFERENCE = [
  "codex",
  "gpt-5",
  "gpt-4.1",
  "gpt-4o",
  "claude",
  "gemini",
  "deepseek",
  "qwen",
  "glm",
  "kimi",
];

export function normalizeModels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const model = item.trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    result.push(model);
  }
  return result;
}

export function pickDefaultModel(models: string[], current = ""): string {
  if (current && models.includes(current)) return current;
  const chatModels = models.filter(
    (model) =>
      !NON_CHAT_MODEL.some((marker) => model.toLowerCase().includes(marker)),
  );
  for (const preference of CHAT_PREFERENCE) {
    const found = chatModels.find((model) =>
      model.toLowerCase().includes(preference),
    );
    if (found) return found;
  }
  return chatModels[0] ?? models[0] ?? current;
}

export function normalizeApiKey(value: string): string {
  const key = value.trim();
  if (!key) return "";
  return key.startsWith("sk-") ? key : `sk-${key}`;
}

export function maskApiKey(value: string): string {
  const key = normalizeApiKey(value);
  if (!key) return "";
  if (key.length <= 11) return `${key.slice(0, 4)}...`;
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

export function tokenFromRecord(record: TokenRecord): NewApiToken {
  const key = record.key ? normalizeApiKey(record.key) : "";
  return {
    id: record.id,
    name: record.name || "App-managed",
    maskedKey: maskApiKey(key),
    unlimitedQuota: Boolean(record.unlimited_quota),
    remainQuota: Number(record.remain_quota ?? 0),
    usedQuota: Number(record.used_quota ?? 0),
  };
}

export function parseTokenItems(payload: unknown): TokenRecord[] {
  const data =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as { data?: unknown }).data
      : payload;
  const items =
    data && typeof data === "object" && "items" in data
      ? (data as { items?: unknown }).items
      : data;
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    )
    .map((item) => ({
      id: Number(item.id ?? 0),
      name: String(item.name ?? ""),
      key: typeof item.key === "string" ? item.key : undefined,
      unlimited_quota: Boolean(item.unlimited_quota),
      remain_quota: Number(item.remain_quota ?? 0),
      used_quota: Number(item.used_quota ?? 0),
      status: Number(item.status ?? 0),
      expired_time: Number(item.expired_time ?? -1),
      model_limits_enabled: Boolean(item.model_limits_enabled),
    }))
    .filter((item) => Number.isInteger(item.id) && item.id > 0);
}

export function authMethodsFromStatus(value: unknown): NewApiAuthMethods {
  const status =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const providers: NewApiAuthProvider[] = [];
  const seen = new Set<string>();
  const add = (provider: NewApiAuthProvider): void => {
    if (seen.has(provider.key)) return;
    seen.add(provider.key);
    providers.push({
      key: provider.key,
      name: provider.name,
      icon: provider.icon ?? "",
      kind: provider.kind ?? "oauth",
    });
  };

  if (status.wechat_login === true) {
    add({ key: "wechat", name: "微信", icon: "wechat", kind: "wechat" });
  }
  if (status.github_oauth === true) {
    add({ key: "github", name: "GitHub", icon: "github", kind: "oauth" });
  }
  if (status.discord_oauth === true) {
    add({ key: "discord", name: "Discord", icon: "discord", kind: "oauth" });
  }
  if (status.oidc_enabled === true) {
    const name =
      typeof status.oidc_display_name === "string" &&
      status.oidc_display_name.trim()
        ? status.oidc_display_name.trim()
        : "OIDC";
    add({ key: "oidc", name, icon: "oidc", kind: "oidc" });
  }
  if (status.linuxdo_oauth === true) {
    add({ key: "linuxdo", name: "LINUX DO", icon: "linuxdo", kind: "oauth" });
  }
  if (status.telegram_oauth === true && status.telegram_oauth_configured === true) {
    add({ key: "telegram", name: "Telegram", icon: "telegram", kind: "telegram" });
  }

  const custom = Array.isArray(status.custom_oauth_providers)
    ? status.custom_oauth_providers
    : [];
  for (const item of custom) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const key = typeof record.slug === "string" ? record.slug.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!key || !name) continue;
    const icon = typeof record.icon === "string" ? record.icon.trim() : "";
    add({ key, name, icon, kind: "oauth" });
  }

  // NewAPI may expose additional built-in providers as <name>_oauth flags.
  // Surface unknown enabled flags too so a platform-side switch appears here.
  const handledFlags = new Set(["github", "discord", "linuxdo", "telegram"]);
  for (const [flag, enabled] of Object.entries(status)) {
    if (enabled !== true || !flag.endsWith("_oauth")) continue;
    const key = flag.slice(0, -"_oauth".length);
    if (!key || handledFlags.has(key) || seen.has(key)) continue;
    const name = key
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    add({ key, name, icon: key, kind: "oauth" });
  }

  return {
    passwordLogin: status.password_login_enabled !== false,
    passwordRegister: status.password_register_enabled === true,
    register: status.register_enabled === true,
    emailVerification: status.email_verification === true,
    passkeyLogin: status.passkey_login === true,
    providers,
  };
}

export function quotaFromUser(
  user: { quota?: unknown; used_quota?: unknown; request_count?: unknown },
  status: {
    quota_per_unit?: unknown;
    display_in_currency?: unknown;
    usd_exchange_rate?: unknown;
  },
  unlimited = false,
): NewApiQuota {
  const remaining = Number(user.quota ?? 0);
  const used = Number(user.used_quota ?? 0);
  const quotaPerUnit = Number(status.quota_per_unit ?? 500000);
  const exchange = Number(status.usd_exchange_rate ?? 1);
  return {
    remaining: Number.isFinite(remaining) ? remaining : 0,
    used: Number.isFinite(used) ? used : 0,
    requestCount: Number(user.request_count ?? 0) || 0,
    quotaPerUnit: quotaPerUnit > 0 ? quotaPerUnit : 500000,
    usdExchangeRate: exchange > 0 ? exchange : 1,
    displayInCurrency: status.display_in_currency !== false,
    unlimited,
  };
}

export function isAuthBundle(value: unknown): value is {
  access_token: string;
  token_type?: string;
  access_expires_at?: number;
  user?: unknown;
  session?: unknown;
} {
  if (!value || typeof value !== "object") return false;
  const token = (value as { access_token?: unknown }).access_token;
  return typeof token === "string" && token.length > 0;
}
