import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
const SESSION_DAYS = 30;
const CREDENTIAL_VERSION = 1;
const DEFAULT_PLATFORM = "https://platform.sec.hn.cn";
const DEFAULT_API = "https://api.sec.hn.cn";
const DEEPSEEK_BASE = "https://api.deepseek.com";
const REQUEST_TIMEOUT_MS = 2e4;
const modelInputTypes = /* @__PURE__ */ new Set(["text", "image"]);
const reasoningLevels = /* @__PURE__ */ new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const managedName = /^VERNAX-[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : void 0;
}
function listOf(value) {
  return Array.isArray(value) ? value : [];
}
function defined(value) {
  return value !== void 0;
}
function safeInteger(value) {
  return Number.isSafeInteger(value) ? Number(value) : void 0;
}
function errorCode(error) {
  const code = asRecord(error)?.code;
  return typeof code === "string" ? code : void 0;
}
function envelopeData(value) {
  return asRecord(value)?.data;
}
function envelopeRecord(value) {
  return asRecord(envelopeData(value)) ?? {};
}
function envelopeOK(value) {
  return asRecord(value)?.success === true;
}
const deepseekBase = () => process.env.VEXNAR_DEEPSEEK_API || DEEPSEEK_BASE;
class PlatformError extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.name = "PlatformError";
    this.status = status;
  }
}
const fail = (status, message) => new PlatformError(status, message);
function platformOrigin() {
  const raw = process.env.VEXNAR_NEWAPI_PLATFORM || DEFAULT_PLATFORM;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid origin");
    return url.origin;
  } catch {
    throw fail(500, "VEXNAR_NEWAPI_PLATFORM \u4E0D\u662F\u5408\u6CD5\u5730\u5740");
  }
}
function modelsBase() {
  const raw = process.env.VEXNAR_NEWAPI_API || DEFAULT_API;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw fail(500, "VEXNAR_NEWAPI_API \u4E0D\u662F\u5408\u6CD5\u5730\u5740");
  }
  const root = `${url.origin}${url.pathname.replace(/\/+$/, "")}`.replace(/\/v1$/, "");
  return `${root}/v1`;
}
const randomID = () => randomBytes(16).toString("hex");
function emptyAccount() {
  return {
    user_id: 0,
    username: "",
    display_name: "",
    avatar_url: "",
    request_count: null,
    access_token: "",
    credential_version: CREDENTIAL_VERSION,
    expires_at: 0,
    providers: []
  };
}
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function avatarURL(value) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw, platformOrigin());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}
function normalizeModel(model) {
  const source = asRecord(model);
  const id = text(source?.id);
  if (!id) return void 0;
  const name = text(source?.name);
  const normalized = name && name !== id ? { id, name } : { id };
  const inputTypes = source?.inputTypes;
  if (Array.isArray(inputTypes)) {
    const kept = inputTypes.map(text).filter((item) => modelInputTypes.has(item));
    if (kept.length > 0) normalized.inputTypes = [...new Set(kept)];
  }
  const efforts = asRecord(source?.reasoningEfforts);
  if (efforts !== void 0) {
    const kept = {};
    for (const [level, value] of Object.entries(efforts)) {
      const key = text(level);
      if (!reasoningLevels.has(key)) continue;
      if (key === "off" && value === null) kept[key] = null;
      else {
        const wire = text(value);
        if (wire !== "") kept[key] = wire;
      }
    }
    if (Object.keys(kept).some((level) => level !== "off")) normalized.reasoningEfforts = kept;
  }
  const contextWindow = source?.contextWindow;
  if (typeof contextWindow === "number" && Number.isSafeInteger(contextWindow) && contextWindow > 0) {
    normalized.contextWindow = contextWindow;
  }
  const maxOutputTokens = source?.maxOutputTokens;
  if (typeof maxOutputTokens === "number" && Number.isSafeInteger(maxOutputTokens) && maxOutputTokens > 0) {
    normalized.maxOutputTokens = maxOutputTokens;
  }
  return normalized;
}
function normalizeRetry(value) {
  return value === "always" ? "always" : "normal";
}
function normalizeProvider(provider) {
  const source = asRecord(provider);
  const id = text(source?.id);
  const key = text(source?.key);
  if (!id || !key) return void 0;
  const models = listOf(source?.models).map(normalizeModel).filter(defined);
  if (models.length === 0) return void 0;
  return {
    id,
    name: text(source?.name) || id,
    base: text(source?.base),
    key,
    models,
    retry: normalizeRetry(source?.retry)
  };
}
function uniqueModels(models) {
  const seen = /* @__PURE__ */ new Set();
  const kept = [];
  for (const model of models) {
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    kept.push(model);
  }
  return kept;
}
function normalizeAccount(raw) {
  const account = emptyAccount();
  const stored = asRecord(raw);
  if (stored === void 0) return account;
  const userID = safeInteger(stored.user_id);
  account.user_id = userID !== void 0 && userID > 0 ? userID : 0;
  account.username = text(stored.username);
  account.display_name = text(stored.display_name);
  account.avatar_url = avatarURL(stored.avatar_url);
  account.request_count = safeInteger(stored.request_count) ?? null;
  account.access_token = text(stored.access_token);
  account.credential_version = safeInteger(stored.credential_version) ?? 0;
  account.expires_at = Number.isFinite(stored.expires_at) ? Number(stored.expires_at) : 0;
  account.providers = listOf(stored.providers).map(normalizeProvider).filter(defined);
  return account;
}
function signedIn(account) {
  return account.user_id > 0 && Date.now() < account.expires_at;
}
function needsReauth(account) {
  return signedIn(account) && account.credential_version < CREDENTIAL_VERSION;
}
function gateOpen(account) {
  return signedIn(account) && !needsReauth(account);
}
function ready(account) {
  if (!gateOpen(account)) return false;
  return account.providers.some((provider) => provider.key !== "" && provider.models.length > 0);
}
function publicView(account) {
  const active = signedIn(account);
  return {
    signed_in: active,
    ready: ready(account),
    reauth_required: needsReauth(account),
    username: active ? account.username : "",
    display_name: active ? account.display_name : "",
    avatar_url: active ? account.avatar_url : "",
    request_count: active ? account.request_count : null,
    access_token_ready: active && account.access_token !== "",
    providers: active ? account.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      base: provider.base,
      models: provider.models,
      retry: normalizeRetry(provider.retry),
      key_configured: provider.key !== "",
      format: provider.id === "vexnar" ? "openai-responses" : "openai-completions"
    })) : []
  };
}
function catalog(account) {
  if (!gateOpen(account)) return [];
  return account.providers.filter((provider) => provider.key !== "" && provider.models.length > 0).map((provider) => ({
    id: provider.id,
    name: provider.name,
    base: provider.base,
    key: provider.key,
    models: provider.models,
    retry: normalizeRetry(provider.retry)
  }));
}
function cookieHeader(response) {
  const listing = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const pairs = [];
  for (const entry of listing) {
    const pair = String(entry).split(";")[0]?.trim();
    if (pair && pair.includes("=") && !pairs.includes(pair)) pairs.push(pair);
  }
  return pairs.join("; ");
}
async function exchange(method, endpoint, options = {}) {
  const headers = { Accept: "application/json", ...options.headers || {} };
  let body;
  if (options.body !== void 0) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  let response;
  try {
    const init = {
      method,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(options.timeout ?? REQUEST_TIMEOUT_MS)
    };
    if (body !== void 0) init.body = body;
    response = await fetch(endpoint, init);
  } catch {
    throw fail(502, options.unavailable ?? `\u65E0\u6CD5\u8FDE\u63A5 HXSEC AI Platform\uFF08${new URL(endpoint).host}\uFF09`);
  }
  const raw = await response.text().catch(() => "");
  let data;
  if (raw.trim() !== "") {
    try {
      data = JSON.parse(raw);
    } catch {
      data = void 0;
    }
  }
  return { status: response.status, ok: response.ok, data, raw, cookie: cookieHeader(response) };
}
function proofHeaders(proof) {
  const headers = {};
  if (proof.cookie) headers.Cookie = proof.cookie;
  if (proof.authorization) headers.Authorization = proof.authorization;
  if (proof.user_id > 0) headers["New-Api-User"] = String(proof.user_id);
  return headers;
}
function inputToken(raw) {
  const token = text(raw).replace(/^Bearer\s+/i, "");
  if (!/^[\x21-\x7e]{16,2048}$/.test(token) || token.startsWith("sk-")) {
    throw fail(400, "\u8BF7\u8F93\u5165\u5E0C\u7075 AI \u4E2A\u4EBA\u8D44\u6599\u4E2D\u7684\u8BBF\u95EE\u4EE4\u724C");
  }
  return token;
}
async function verifiedIdentity(proof) {
  const self = await exchange("GET", `${platformOrigin()}/api/user/self`, { headers: proofHeaders(proof) });
  const identity = envelopeRecord(self.data);
  const id = safeInteger(identity.id);
  if (!self.ok || !envelopeOK(self.data) || !id || id <= 0 || proof.user_id > 0 && id !== proof.user_id || !text(identity.username)) {
    throw fail(401, "\u5E0C\u7075 AI \u767B\u5F55\u5C1A\u672A\u5B8C\u6210\u6216\u5DF2\u5931\u6548");
  }
  return { id, identity };
}
function applyIdentity(account, id, identity) {
  account.user_id = id;
  account.username = text(identity.username);
  account.display_name = text(identity.display_name);
  account.avatar_url = avatarURL(identity.avatar_url ?? identity.avatar);
  account.request_count = safeInteger(identity.request_count) ?? null;
  account.expires_at = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1e3;
}
function proofOf(data, cookie) {
  const proof = { user_id: 0, authorization: "", cookie };
  const payload = envelopeRecord(data);
  const user = asRecord(payload.user);
  const id = Number(user?.id ?? payload.id);
  proof.user_id = Number.isSafeInteger(id) && id > 0 ? id : 0;
  const token = text(payload.access_token);
  if (token) proof.authorization = `Bearer ${token}`;
  return proof;
}
function sameOriginURL(raw, label) {
  let url;
  try {
    url = new URL(text(raw));
  } catch {
    throw fail(400, `\u8BF7\u8F93\u5165\u6709\u6548\u7684${label}`);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.hostname === "" || url.username || url.password || url.search !== "" || url.hash !== "") {
    throw fail(400, `\u8BF7\u8F93\u5165\u6709\u6548\u7684${label}`);
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}
function customBase(raw) {
  const url = new URL(sameOriginURL(raw, "OpenAI \u517C\u5BB9 API \u5730\u5740"));
  const path = url.pathname.replace(/\/+$/, "").replace(/\/(?:chat\/completions|models)$/, "");
  return url.origin + path;
}
function listedModel(item) {
  const source = asRecord(item);
  if (!source) return void 0;
  const levels = listOf(asRecord(source.effort)?.supported_levels).map(text).filter((level) => level !== "off" && reasoningLevels.has(level));
  return normalizeModel({
    ...source,
    inputTypes: source.inputTypes ?? source.input_modalities,
    reasoningEfforts: source.reasoningEfforts ?? (levels.length === 0 ? void 0 : Object.fromEntries(
      levels.map((level) => [level, level])
    )),
    contextWindow: source.contextWindow ?? source.context_window,
    maxOutputTokens: source.maxOutputTokens ?? source.max_output_tokens
  });
}
function providerRequest(method, base, path, key, body) {
  return exchange(method, `${base.replace(/\/+$/, "")}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    body,
    unavailable: "\u65E0\u6CD5\u8FDE\u63A5\u6A21\u578B\u63D0\u4F9B\u5546\uFF0C\u8BF7\u68C0\u67E5 API \u5730\u5740\u3001\u7F51\u7EDC\u548C TLS \u914D\u7F6E"
  });
}
function checkProviderReply(result, operation) {
  if (result.ok) return;
  if (result.status === 401 || result.status === 403) {
    throw fail(422, `\u6A21\u578B\u63D0\u4F9B\u5546\u62D2\u7EDD\u8BBF\u95EE\uFF08HTTP ${result.status}\uFF09\uFF0C\u8BF7\u68C0\u67E5 API \u5BC6\u94A5\u548C\u6743\u9650`);
  }
  throw fail(422, `${operation}\u5931\u8D25\uFF08HTTP ${result.status}\uFF09\uFF0C\u8BF7\u68C0\u67E5 API \u5730\u5740\u548C\u4E0A\u6E38\u670D\u52A1`);
}
async function readModels(base, key) {
  const result = await providerRequest("GET", base, "/models", key);
  if ([404, 405, 501].includes(result.status)) return [];
  checkProviderReply(result, "\u8BFB\u53D6\u4E0A\u6E38\u6A21\u578B\u5217\u8868");
  const list = Array.isArray(result.data) ? result.data : listOf(envelopeData(result.data));
  return uniqueModels(list.map(listedModel).filter(defined));
}
async function verifyCustomModel(base, key, model) {
  const result = await providerRequest("POST", base, "/chat/completions", key, {
    model,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
    stream: false
  });
  checkProviderReply(result, "\u9A8C\u8BC1\u81EA\u5B9A\u4E49\u6A21\u578B");
  const choice = asRecord(listOf(asRecord(result.data)?.choices)[0]);
  if (!asRecord(choice?.message)) {
    throw fail(422, "\u81EA\u5B9A\u4E49\u6A21\u578B\u672A\u8FD4\u56DE OpenAI \u517C\u5BB9\u7684\u5BF9\u8BDD\u54CD\u5E94\uFF0C\u8BF7\u68C0\u67E5 API \u5730\u5740\u548C\u6A21\u578B ID");
  }
}
function createPlatformAccount(options = {}) {
  const home = options.home || process.env.VEXNAR_HOME || process.env.DSH_HOME || join(homedir(), ".vexnar");
  const file = join(home, "vexnar-account.json");
  let pending;
  let queue = Promise.resolve();
  const serial = (operation) => {
    const next = queue.then(operation);
    queue = next.catch(() => {
    });
    return next;
  };
  async function read() {
    let raw;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT") return emptyAccount();
      throw fail(500, "\u8BFB\u53D6 VEXNAR \u8D26\u53F7\u5931\u8D25");
    }
    if (raw.trim() === "") return emptyAccount();
    try {
      return normalizeAccount(JSON.parse(raw));
    } catch {
      return emptyAccount();
    }
  }
  async function save(account) {
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${randomID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(account, null, 2)}
`, { mode: 384 });
      await chmod(temporary, 384);
      await rename(temporary, file);
    } catch {
      throw fail(500, "\u4FDD\u5B58 VEXNAR \u8D26\u53F7\u5931\u8D25");
    }
  }
  async function status() {
    return publicView(await read());
  }
  async function methods() {
    const result = await exchange("GET", `${platformOrigin()}/api/status`, { timeout: 1e4 }).catch(() => void 0);
    const data = envelopeData(result?.data);
    if (!envelopeOK(result?.data) || !data) throw fail(502, "\u65E0\u6CD5\u8BFB\u53D6 HXSEC AI Platform \u767B\u5F55\u65B9\u5F0F");
    const advertised = asRecord(data) ?? {};
    const advertisedFlags = [
      [advertised.password_login_enabled, "\u5BC6\u7801"],
      [advertised.passkey_login, "Passkey"],
      [advertised.github_oauth, "GitHub"],
      [advertised.linuxdo_oauth, "LinuxDO"],
      [advertised.oidc_enabled, text(advertised.oidc_display_name) || "OIDC"],
      [advertised.wechat_login, "\u5FAE\u4FE1"],
      [advertised.telegram_oauth, "Telegram"],
      [advertised.discord_oauth, "Discord"]
    ];
    const names = advertisedFlags.filter(([enabled]) => enabled === true).map(([, name]) => name);
    for (const provider of listOf(advertised.custom_oauth_providers)) {
      const entry = asRecord(provider);
      const name = text(entry?.name) || text(entry?.slug);
      if (name) names.push(name);
    }
    return {
      methods: [...new Set(names)],
      password: advertised.password_login_enabled === true && advertised.password_login_encryption_enabled !== true && advertised.turnstile_check !== true
    };
  }
  async function modelCredential(proof, expires) {
    const origin = platformOrigin();
    const headers = proofHeaders(proof);
    const search = async (keyword) => {
      const result = await exchange("GET", `${origin}/api/token/search?keyword=${encodeURIComponent(keyword)}`, { headers });
      if (!result.ok || !envelopeOK(result.data)) throw fail(403, "\u8BBF\u95EE\u4EE4\u724C\u9700\u8981\u6A21\u578B API \u5BC6\u94A5\u7684\u8BFB\u53D6\u6743\u9650");
      return listOf(envelopeRecord(result.data).items).map(asRecord).filter(defined);
    };
    const available = (entry2) => {
      const expiration = safeInteger(entry2.expired_time);
      return (safeInteger(entry2.id) ?? 0) > 0 && (entry2.status === void 0 || entry2.status === 1) && (expiration === void 0 || expiration < 0 || expiration * 1e3 > Date.now());
    };
    const candidates = await search("VERNAX-");
    let entry = candidates.find((item) => available(item) && managedName.test(text(item.name)));
    if (!entry) {
      const name = `VERNAX-${randomUUID()}`;
      const created = await exchange("POST", `${origin}/api/token/`, {
        headers,
        body: { name, unlimited_quota: true, remain_quota: 0, expired_time: Math.floor(expires / 1e3) }
      });
      if (!created.ok || !envelopeOK(created.data)) throw fail(403, "\u65E0\u6CD5\u521B\u5EFA VERNAX \u6A21\u578B API \u5BC6\u94A5\uFF0C\u8BF7\u68C0\u67E5\u8BBF\u95EE\u4EE4\u724C\u7684\u7BA1\u7406\u6743\u9650");
      entry = (await search(name)).find((item) => available(item) && text(item.name) === name);
    }
    if (!entry) throw fail(502, "\u5E73\u53F0\u672A\u8FD4\u56DE\u521A\u521B\u5EFA\u7684\u6A21\u578B API \u5BC6\u94A5\uFF0C\u8BF7\u91CD\u8BD5");
    const token = await exchange("POST", `${origin}/api/token/${entry.id}/key`, { headers });
    let key = text(envelopeRecord(token.data).key);
    if (!token.ok || !envelopeOK(token.data) || !key) throw fail(403, "\u65E0\u6CD5\u8BFB\u53D6 VERNAX \u6A21\u578B API \u5BC6\u94A5\uFF0C\u8BF7\u68C0\u67E5\u8BBF\u95EE\u4EE4\u724C\u6743\u9650");
    if (!key.startsWith("sk-")) key = `sk-${key}`;
    const base = modelsBase();
    const models = await readModels(base, key);
    return models.length === 0 ? void 0 : { id: "vexnar", name: "\u5E0C\u7075 AI", base, key, models };
  }
  async function complete(proof, suppliedToken = "") {
    if (!proof || !proof.cookie && !text(proof.authorization)) {
      throw fail(400, "\u65E0\u6548\u7684\u5E73\u53F0\u767B\u5F55\u4F1A\u8BDD");
    }
    const previous = await read();
    if (gateOpen(previous)) throw fail(409, "\u8BF7\u5148\u9000\u51FA\u5F53\u524D VEXNAR \u8D26\u53F7");
    const origin = platformOrigin();
    const { id, identity } = await verifiedIdentity(proof);
    proof = { ...proof, user_id: id };
    const account = emptyAccount();
    applyIdentity(account, id, identity);
    account.access_token = suppliedToken || text(identity.access_token);
    if (account.access_token === "" && previous.user_id === account.user_id) {
      account.access_token = previous.access_token;
    }
    if (account.access_token === "") {
      const access = await exchange("GET", `${origin}/api/user/token`, { headers: proofHeaders(proof) });
      const payload = envelopeData(access.data);
      const payloadRecord = asRecord(payload);
      account.access_token = text(payload) || text(payloadRecord?.access_token) || text(payloadRecord?.token);
    }
    const provider = await modelCredential(proof, account.expires_at);
    if (provider) account.providers.push(provider);
    if (previous.user_id === account.user_id) {
      for (const provider2 of previous.providers) {
        if (provider2.id !== "vexnar") account.providers.push(provider2);
      }
    }
    await save(account);
    pending = void 0;
    return publicView(account);
  }
  async function loginWithToken(raw) {
    const token = inputToken(raw);
    return complete({ user_id: 0, cookie: "", authorization: `Bearer ${token}` }, token);
  }
  async function renewWithToken(raw) {
    const token = inputToken(raw);
    const account = await read();
    if (!gateOpen(account)) throw fail(401, "\u8BF7\u5148\u767B\u5F55\u5E0C\u7075 AI");
    const proof = { user_id: 0, cookie: "", authorization: `Bearer ${token}` };
    const { id, identity } = await verifiedIdentity(proof);
    if (id !== account.user_id) throw fail(409, "\u8BF7\u4F7F\u7528\u5F53\u524D\u5E0C\u7075 AI \u8D26\u6237\u7684\u8BBF\u95EE\u4EE4\u724C");
    applyIdentity(account, id, identity);
    account.access_token = token;
    await save(account);
    return publicView(account);
  }
  async function wallet() {
    const account = await read();
    if (!gateOpen(account)) throw fail(401, "\u8BF7\u5148\u767B\u5F55\u5E0C\u7075 AI");
    const origin = platformOrigin();
    const headers = proofHeaders({ user_id: account.user_id, cookie: "", authorization: `Bearer ${account.access_token}` });
    const platformRead = async (path) => {
      const result = await exchange("GET", origin + path, { headers, timeout: 7e3 }).catch(() => void 0);
      return result?.ok && envelopeOK(result.data) ? envelopeData(result.data) : void 0;
    };
    const deepseek = account.providers.find((provider) => provider.id === "deepseek" && URL.canParse(provider.base) && new URL(provider.base).origin === DEEPSEEK_BASE);
    const deepseekRead = async () => {
      if (!deepseek) return { status: "unconfigured", balances: [] };
      const reply = await exchange("GET", DEEPSEEK_BASE + "/user/balance", {
        headers: { Authorization: `Bearer ${deepseek.key}` },
        timeout: 7e3
      }).catch(() => void 0);
      const balances = listOf(asRecord(reply?.data)?.balance_infos).flatMap((value) => {
        const row = asRecord(value);
        const currency2 = text(row?.currency);
        const total = text(row?.total_balance);
        return /^[A-Z]{3}$/.test(currency2) && /^-?\d+(?:\.\d+)?$/.test(total) ? [{ currency: currency2, total }] : [];
      });
      return { status: reply?.ok && balances.length > 0 ? "ready" : "unavailable", balances };
    };
    const [identity, settings, topup, plans, subscriptions, official] = await Promise.all([
      platformRead("/api/user/self"),
      platformRead("/api/status"),
      platformRead("/api/user/topup/info"),
      platformRead("/api/subscription/plans"),
      platformRead("/api/subscription/self"),
      deepseekRead()
    ]);
    const profile = asRecord(identity);
    const config = asRecord(settings);
    const quota = safeInteger(profile?.quota) ?? null;
    const perUnit = Number(config?.quota_per_unit);
    const currency = text(config?.quota_display_type);
    const rate = currency === "CNY" ? Number(config?.usd_exchange_rate) : currency === "CUSTOM" ? Number(config?.custom_currency_exchange_rate) : 1;
    const amount = quota !== null && perUnit > 0 && Number.isFinite(perUnit) && rate > 0 && Number.isFinite(rate) && ["USD", "CNY", "CUSTOM"].includes(currency) ? quota / perUnit * rate : null;
    return {
      platform: {
        quota,
        amount,
        currency: currency === "CUSTOM" ? text(config?.custom_currency_symbol) : currency,
        methods: listOf(asRecord(topup)?.pay_methods).map((value) => text(asRecord(value)?.name)).filter(Boolean),
        plans: listOf(plans).flatMap((value) => {
          const row = asRecord(asRecord(value)?.plan);
          const id = safeInteger(row?.id);
          const title = text(row?.title);
          const price = Number(row?.price_amount);
          const unit = text(row?.duration_unit);
          const duration = safeInteger(row?.duration_value);
          const unitLabel = { year: "\u5E74", month: "\u4E2A\u6708", day: "\u5929", hour: "\u5C0F\u65F6" }[unit];
          return id && title && row?.enabled === true && Number.isFinite(price) && price >= 0 ? [{ id, title, price, currency: text(row.currency), duration: duration && unitLabel ? `${duration} ${unitLabel}` : "" }] : [];
        }),
        subscriptions: listOf(asRecord(subscriptions)?.subscriptions).flatMap((value) => {
          const row = asRecord(asRecord(value)?.subscription);
          const id = safeInteger(row?.plan_id);
          const ends = safeInteger(row?.end_time);
          const total = safeInteger(row?.amount_total);
          const used = safeInteger(row?.amount_used);
          if (!id || ends === void 0) return [];
          return [{ id, ends, remaining: total && used !== void 0 ? Math.max(0, total - used) : null }];
        }),
        url: origin + "/wallet",
        error: quota === null ? "\u65E0\u6CD5\u8BFB\u53D6\u5E0C\u7075 AI \u4F59\u989D\uFF0C\u8BF7\u68C0\u67E5\u8BBF\u95EE\u4EE4\u724C\u6743\u9650" : ""
      },
      deepseek: official
    };
  }
  async function password(username, secret) {
    const login = text(username);
    if (login === "" || typeof secret !== "string" || secret === "") {
      throw fail(400, "\u8BF7\u8F93\u5165\u5E73\u53F0\u8D26\u53F7\u548C\u5BC6\u7801");
    }
    const configuration = await exchange("GET", `${platformOrigin()}/api/status`);
    const data = asRecord(envelopeData(configuration.data)) ?? {};
    if (!envelopeOK(configuration.data)) throw fail(502, "\u65E0\u6CD5\u8BFB\u53D6\u5E73\u53F0\u767B\u5F55\u914D\u7F6E");
    if (data.password_login_enabled !== true || data.password_login_encryption_enabled === true || data.turnstile_check === true) {
      throw fail(409, "\u8BF7\u5728\u5E73\u53F0\u9A8C\u8BC1\u7A97\u53E3\u5B8C\u6210\u767B\u5F55");
    }
    if (ready(await read())) throw fail(409, "\u8BF7\u5148\u9000\u51FA\u5F53\u524D VEXNAR \u8D26\u53F7");
    const reply = await exchange("POST", `${platformOrigin()}/api/user/login`, {
      body: { username: login, password: secret }
    });
    if (reply.status === 429) throw fail(429, "\u5E73\u53F0\u767B\u5F55\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
    if (reply.status >= 500 || reply.status === 0) throw fail(502, "\u5E73\u53F0\u767B\u5F55\u6682\u4E0D\u53EF\u7528");
    if (!envelopeOK(reply.data)) throw fail(401, "\u5E73\u53F0\u767B\u5F55\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u8D26\u53F7\u3001\u5BC6\u7801\u548C\u9A8C\u8BC1\u8981\u6C42");
    const payload = envelopeRecord(reply.data);
    const proof = proofOf(reply.data, reply.cookie);
    if (text(payload.flow_token) !== "" || payload.require_2fa === true) {
      pending = {
        id: randomID(),
        token: text(payload.flow_token),
        cookie: proof.cookie,
        expires: Date.now() + 5 * 60 * 1e3
      };
      return { challenge: pending.id };
    }
    if (proof.user_id <= 0 || proof.authorization === "" && proof.cookie === "") {
      throw fail(409, "\u8BF7\u5728\u5E73\u53F0\u9A8C\u8BC1\u7A97\u53E3\u5B8C\u6210\u767B\u5F55");
    }
    return complete(proof);
  }
  async function verify(challenge, code) {
    const answer = text(code);
    if (text(challenge) === "" || answer === "") throw fail(400, "\u8BF7\u8F93\u5165\u5E73\u53F0\u9A8C\u8BC1\u7801");
    if (!pending || pending.id !== challenge || Date.now() > pending.expires) {
      throw fail(409, "\u9A8C\u8BC1\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55");
    }
    const origin = platformOrigin();
    const endpoint = pending.token === "" ? "/api/user/login/2fa" : "/api/user/login/verify";
    const body = pending.token === "" ? { code: answer } : { flow_token: pending.token, method: "2fa", code: answer };
    const reply = await exchange("POST", `${origin}${endpoint}`, {
      body,
      headers: pending.cookie === "" ? {} : { Cookie: pending.cookie }
    });
    if (reply.status >= 500 || reply.status === 0) throw fail(502, "\u65E0\u6CD5\u8FDE\u63A5\u5E73\u53F0\u9A8C\u8BC1\u670D\u52A1");
    const proof = proofOf(reply.data, reply.cookie || pending.cookie);
    if (!envelopeOK(reply.data) || proof.user_id <= 0 || proof.authorization === "" && proof.cookie === "") {
      throw fail(401, "\u9A8C\u8BC1\u7801\u672A\u901A\u8FC7\uFF0C\u8BF7\u91CD\u8BD5\u6216\u5728\u5E73\u53F0\u7A97\u53E3\u9A8C\u8BC1");
    }
    return complete(proof);
  }
  async function addProvider(input = {}) {
    const key = text(input.api_key);
    if (key === "") throw fail(400, "\u8BF7\u8F93\u5165 API Key");
    const current = await read();
    if (!gateOpen(current)) throw fail(401, "\u8BF7\u5148\u767B\u5F55 VEXNAR \u8D26\u53F7");
    const provider = { id: "", name: "", base: "", key, models: [], retry: normalizeRetry(input.retry) };
    switch (input.kind) {
      case "platform":
        provider.id = "vexnar";
        provider.name = "HXSEC AI Platform";
        provider.base = modelsBase();
        break;
      case "deepseek":
        provider.id = "deepseek";
        provider.name = "DeepSeek";
        provider.base = deepseekBase();
        break;
      case "custom": {
        provider.id = `custom-${randomID()}`;
        provider.name = text(input.name);
        if (provider.name === "") throw fail(400, "\u8BF7\u8F93\u5165\u540D\u79F0\u548C\u6709\u6548\u7684 OpenAI \u517C\u5BB9 API \u6839\u5730\u5740");
        provider.base = customBase(input.base_url);
        break;
      }
      default:
        throw fail(400, "\u672A\u77E5\u7684\u6A21\u578B\u63D0\u4F9B\u65B9");
    }
    if (input.kind === "custom" && Array.isArray(input.models) && input.models.length > 0) {
      provider.models = uniqueModels(input.models.map(normalizeModel).filter(defined));
      const first = provider.models[0];
      if (!first) throw fail(400, "\u8BF7\u8F93\u5165\u6709\u6548\u7684\u6A21\u578B ID");
      await verifyCustomModel(provider.base, key, first.id);
    } else {
      provider.models = await readModels(provider.base, key);
      if (provider.models.length === 0) throw fail(422, input.kind === "custom" ? "\u4E0A\u6E38\u672A\u63D0\u4F9B\u6A21\u578B\u5217\u8868\uFF0C\u8BF7\u68C0\u67E5 API \u5730\u5740\u6216\u624B\u52A8\u586B\u5199\u6A21\u578B ID" : "\u4E0A\u6E38\u672A\u63D0\u4F9B\u6A21\u578B\u5217\u8868\uFF0C\u8BF7\u68C0\u67E5 API \u5730\u5740");
    }
    const account = await read();
    if (!gateOpen(account) || account.user_id !== current.user_id) {
      throw fail(401, "VEXNAR \u767B\u5F55\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u8BD5");
    }
    const previous = account.providers.find((item) => item.id === provider.id);
    if (previous !== void 0 && text(input.retry) === "") provider.retry = normalizeRetry(previous.retry);
    account.providers = account.providers.filter((item) => item.id !== provider.id);
    account.providers.push(provider);
    await save(account);
    return publicView(account);
  }
  async function updateProvider(input = {}) {
    const id = text(input.id);
    if (!/^[a-z0-9-]+$/.test(id)) throw fail(400, "\u65E0\u6548\u7684\u6A21\u578B\u63D0\u4F9B\u65B9");
    const account = await read();
    if (!gateOpen(account)) throw fail(401, "\u8BF7\u5148\u767B\u5F55 VEXNAR \u8D26\u53F7");
    const current = account.providers.find((provider) => provider.id === id);
    if (current === void 0) throw fail(404, "\u6A21\u578B\u63D0\u4F9B\u65B9\u4E0D\u5B58\u5728");
    const key = text(input.api_key);
    const base = text(input.base_url) === "" ? current.base : id.startsWith("custom-") ? customBase(input.base_url) : sameOriginURL(input.base_url, "API \u5730\u5740");
    const name = text(input.name) || current.name;
    const retry = normalizeRetry(input.retry);
    if (id === "vexnar") {
      if (key !== "") throw fail(400, "\u5E73\u53F0\u8BBF\u95EE\u5BC6\u94A5\u7531\u5E73\u53F0\u7B7E\u53D1\uFF0C\u4E0D\u80FD\u5728\u8FD9\u91CC\u4FEE\u6539");
      if (base !== current.base) throw fail(400, "\u5E73\u53F0 API \u5730\u5740\u7531\u5E73\u53F0\u914D\u7F6E\uFF0C\u4E0D\u80FD\u5728\u8FD9\u91CC\u4FEE\u6539");
    }
    let models = Array.isArray(input.models) ? uniqueModels(input.models.map(normalizeModel).filter(defined)) : [];
    if (key !== "" || base !== current.base) {
      const nextKey = key || current.key;
      const discovered = await readModels(base, nextKey);
      if (discovered.length === 0) {
        const first = (models.length > 0 ? models : current.models)[0];
        if (!id.startsWith("custom-") || !first) throw fail(422, "\u4E0A\u6E38\u672A\u63D0\u4F9B\u6A21\u578B\u5217\u8868\uFF0C\u8BF7\u68C0\u67E5 API \u5730\u5740");
        await verifyCustomModel(base, nextKey, first.id);
      } else if (models.length === 0) {
        models = discovered;
      }
    }
    if (models.length === 0) models = current.models;
    if (models.length === 0) throw fail(422, "\u6A21\u578B\u76EE\u5F55\u4E0D\u80FD\u4E3A\u7A7A");
    account.providers = account.providers.map((provider) => provider.id !== id ? provider : {
      id,
      name,
      base,
      key: key === "" ? current.key : key,
      models,
      retry
    });
    await save(account);
    return publicView(account);
  }
  async function removeProvider(id) {
    const target = text(id);
    if (!/^[a-z0-9-]+$/.test(target)) throw fail(400, "\u65E0\u6548\u7684\u6A21\u578B\u63D0\u4F9B\u65B9");
    if (target === "vexnar") throw fail(400, "\u5E73\u53F0\u6A21\u578B\u4E0D\u53EF\u79FB\u9664");
    const account = await read();
    if (!gateOpen(account)) throw fail(401, "\u8BF7\u5148\u767B\u5F55 VEXNAR \u8D26\u53F7");
    const kept = account.providers.filter((provider) => provider.id !== target);
    if (kept.length === account.providers.length) throw fail(404, "\u6A21\u578B\u63D0\u4F9B\u65B9\u4E0D\u5B58\u5728");
    account.providers = kept;
    await save(account);
    return publicView(account);
  }
  async function logout() {
    pending = void 0;
    try {
      await unlink(file);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw fail(500, "\u9000\u51FA VEXNAR \u8D26\u53F7\u5931\u8D25");
    }
    return publicView(emptyAccount());
  }
  return {
    file,
    read,
    status: () => serial(status),
    methods: () => serial(methods),
    login: (proof) => serial(() => complete(proof)),
    loginWithToken: (token) => serial(() => loginWithToken(token)),
    renewWithToken: (token) => serial(() => renewWithToken(token)),
    wallet,
    password: (username, secret) => serial(() => password(username, secret)),
    verify: (challenge, code) => serial(() => verify(challenge, code)),
    addProvider: (input) => serial(() => addProvider(input)),
    updateProvider: (input) => serial(() => updateProvider(input)),
    removeProvider: (id) => serial(() => removeProvider(id)),
    logout: () => serial(logout)
  };
}
export {
  PlatformError,
  catalog,
  createPlatformAccount,
  exchange,
  gateOpen,
  modelsBase,
  needsReauth,
  platformOrigin,
  publicView,
  ready,
  signedIn
};
