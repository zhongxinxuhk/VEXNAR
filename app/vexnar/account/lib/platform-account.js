import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
const SESSION_DAYS = 30;
const CREDENTIAL_VERSION = 1;
const DEFAULT_PLATFORM = "https://platform.sec.hn.cn";
const DEFAULT_API = "https://api.sec.hn.cn";
const DEEPSEEK_BASE = "https://api.deepseek.com/v1";
const REQUEST_TIMEOUT_MS = 2e4;
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
    return new URL(raw).origin;
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
function normalizeModel(model) {
  const source = asRecord(model);
  const id = text(source?.id);
  if (!id) return void 0;
  const name = text(source?.name);
  return name && name !== id ? { id, name } : { id };
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
    throw fail(502, `\u65E0\u6CD5\u8FDE\u63A5 HXSEC AI Platform\uFF08${new URL(endpoint).host}\uFF09`);
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
  headers["New-Api-User"] = String(proof.user_id);
  return headers;
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
async function readModels(base, key) {
  const result = await exchange("GET", `${base.replace(/\/+$/, "")}/models`, {
    headers: { Authorization: `Bearer ${key}` }
  }).catch(() => void 0);
  const list = listOf(envelopeData(result?.data));
  const models = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of list) {
    const model = normalizeModel(item);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
  }
  return models;
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
  async function complete(proof) {
    if (!proof || !(proof.user_id > 0) || !proof.cookie && !text(proof.authorization)) {
      throw fail(400, "\u65E0\u6548\u7684\u5E73\u53F0\u767B\u5F55\u4F1A\u8BDD");
    }
    const previous = await read();
    if (gateOpen(previous)) throw fail(409, "\u8BF7\u5148\u9000\u51FA\u5F53\u524D VEXNAR \u8D26\u53F7");
    const origin = platformOrigin();
    const self = await exchange("GET", `${origin}/api/user/self`, { headers: proofHeaders(proof) });
    const identity = envelopeRecord(self.data);
    if (!self.ok || !envelopeOK(self.data) || Number(identity.id) !== proof.user_id || !text(identity.username)) {
      throw fail(401, "HXSEC AI Platform \u767B\u5F55\u5C1A\u672A\u5B8C\u6210\u6216\u5DF2\u5931\u6548");
    }
    const account = emptyAccount();
    account.user_id = proof.user_id;
    account.username = text(identity.username);
    account.display_name = text(identity.display_name);
    account.request_count = safeInteger(identity.request_count) ?? null;
    account.expires_at = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1e3;
    account.access_token = text(identity.access_token);
    if (account.access_token === "" && previous.user_id === account.user_id) {
      account.access_token = previous.access_token;
    }
    if (account.access_token === "") {
      const access = await exchange("GET", `${origin}/api/user/token`, { headers: proofHeaders(proof) });
      const payload = envelopeData(access.data);
      const payloadRecord = asRecord(payload);
      account.access_token = text(payload) || text(payloadRecord?.access_token) || text(payloadRecord?.token);
    }
    const name = `VEXNAR-${randomID()}`;
    const created = await exchange("POST", `${origin}/api/token/`, {
      headers: proofHeaders(proof),
      body: {
        name,
        unlimited_quota: true,
        remain_quota: 0,
        expired_time: Math.floor(account.expires_at / 1e3)
      }
    });
    const base = modelsBase();
    if (envelopeOK(created.data)) {
      const found = await exchange("GET", `${origin}/api/token/search?keyword=${encodeURIComponent(name)}`, {
        headers: proofHeaders(proof)
      });
      const items = listOf(asRecord(envelopeData(found.data))?.items);
      for (const item of items) {
        const entry = asRecord(item);
        const id = Number(entry?.id);
        if (!Number.isSafeInteger(id) || id <= 0 || text(entry?.name) !== name) continue;
        const tokenPath = `${origin}/api/token/${id}`;
        const token = await exchange("POST", `${tokenPath}/key`, { headers: proofHeaders(proof) });
        let key = text(asRecord(envelopeData(token.data))?.key);
        if (key !== "" && !key.startsWith("sk-")) key = `sk-${key}`;
        if (key !== "") {
          const models = await readModels(base, key);
          if (models.length > 0) {
            account.providers = [{ id: "vexnar", name: "HXSEC AI Platform", base, key, models }];
            break;
          }
        }
        await exchange("DELETE", tokenPath, { headers: proofHeaders(proof) });
        break;
      }
    }
    if (previous.user_id === account.user_id) {
      for (const provider of previous.providers) {
        if (provider.id !== "vexnar") account.providers.push(provider);
      }
    }
    await save(account);
    pending = void 0;
    return publicView(account);
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
        provider.base = sameOriginURL(input.base_url, "OpenAI \u517C\u5BB9 API \u6839\u5730\u5740");
        break;
      }
      default:
        throw fail(400, "\u672A\u77E5\u7684\u6A21\u578B\u63D0\u4F9B\u65B9");
    }
    provider.models = uniqueModels(await readModels(provider.base, key));
    if (provider.models.length === 0) throw fail(422, "\u65E0\u6CD5\u8BFB\u53D6\u6A21\u578B\u5217\u8868\uFF0C\u8BF7\u68C0\u67E5 API \u5730\u5740\u548C API Key");
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
    const base = text(input.base_url) === "" ? current.base : sameOriginURL(input.base_url, "API \u5730\u5740");
    const name = text(input.name) || current.name;
    const retry = normalizeRetry(input.retry);
    if (id === "vexnar") {
      if (key !== "") throw fail(400, "\u5E73\u53F0\u8BBF\u95EE\u5BC6\u94A5\u7531\u5E73\u53F0\u7B7E\u53D1\uFF0C\u4E0D\u80FD\u5728\u8FD9\u91CC\u4FEE\u6539");
      if (base !== current.base) throw fail(400, "\u5E73\u53F0 API \u5730\u5740\u7531\u5E73\u53F0\u914D\u7F6E\uFF0C\u4E0D\u80FD\u5728\u8FD9\u91CC\u4FEE\u6539");
    }
    let models = Array.isArray(input.models) ? uniqueModels(input.models.map(normalizeModel).filter(defined)) : [];
    if (key !== "" || base !== current.base) {
      const discovered = await readModels(base, key === "" ? current.key : key);
      if (discovered.length === 0) throw fail(422, "\u65E0\u6CD5\u8BFB\u53D6\u6A21\u578B\u5217\u8868\uFF0C\u8BF7\u68C0\u67E5 API \u5730\u5740\u548C API Key");
      if (models.length === 0) models = uniqueModels(discovered);
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
  gateOpen,
  modelsBase,
  needsReauth,
  platformOrigin,
  publicView,
  ready,
  signedIn
};
