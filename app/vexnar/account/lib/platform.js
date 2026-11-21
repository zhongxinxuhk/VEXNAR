import { readFile } from "node:fs/promises";
import { loginPage, workspaceSessionScript } from "./login-page.js";
import { startModelGateway } from "./model-gateway.js";
import {
  catalog,
  createPlatformAccount,
  gateOpen,
  PlatformError,
  platformOrigin,
  publicView
} from "./platform-account.js";
const clientPrefix = "/vexnar-api/platform";
const maxBody = 16 * 1024;
function recordOf(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function messageOf(error) {
  const message = recordOf(error).message;
  return typeof message === "string" ? message : "";
}
function failureOf(error) {
  const record = recordOf(error);
  return { code: record.code || "settings/rejected", message: record.message, details: record.details || {} };
}
function clientRpcRequest(body, method) {
  if (typeof body !== "object" || body === null) return void 0;
  const message = body;
  if (message.type !== "client-request" || typeof message.rpcId !== "string" || message.method !== method) return void 0;
  const payload = recordOf(message.payload);
  const args = payload.args;
  if (!args) return void 0;
  return { rpcId: message.rpcId, args };
}
function credentialName(providerID) {
  return `VEXNAR_${providerID.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}_API_KEY`;
}
async function readJson(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBody) throw new PlatformError(413, "\u8BF7\u6C42\u6B63\u6587\u8FC7\u5927");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim() === "") return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new PlatformError(400, "\u65E0\u6548\u7684 JSON \u8BF7\u6C42");
  }
}
function bodyText(body, name) {
  const value = body[name];
  return typeof value === "string" ? value : "";
}
function providerInput(body) {
  const input = {
    kind: bodyText(body, "kind"),
    id: bodyText(body, "id"),
    api_key: bodyText(body, "api_key"),
    name: bodyText(body, "name"),
    base_url: bodyText(body, "base_url"),
    retry: bodyText(body, "retry")
  };
  const models = body.models;
  if (Array.isArray(models)) input.models = models;
  return input;
}
async function capturePlatformLogin(context, page, origin, signal) {
  let proof;
  const observe = async (response) => {
    try {
      const url = new URL(response.url());
      if (url.origin !== origin || !response.ok()) return;
      const identityRequest = url.pathname === "/api/user/self";
      const authResponse = /^\/api\/(?:oauth\/[a-z0-9_-]+|user\/(?:auth\/refresh|login(?:\/verify|\/2fa|\/passkey\/finish)?|passkey\/login\/finish))$/i.test(url.pathname);
      if (!identityRequest && !authResponse) return;
      const body = await response.json();
      const envelope = recordOf(body);
      const data = recordOf(envelope.data);
      const userID = recordOf(data.user).id ?? (identityRequest ? data.id : void 0);
      const id = typeof userID === "number" ? userID : 0;
      if (envelope.success !== true || !Number.isSafeInteger(id) || id <= 0) return;
      const authorization = data.access_token ? `Bearer ${String(data.access_token)}` : await response.request().headerValue("authorization");
      const cookie = await response.request().headerValue("cookie") ?? "";
      if (authorization || cookie) proof = { user_id: id, authorization: authorization ?? "", cookie };
    } catch {
    }
  };
  context.on("response", observe);
  try {
    await page.goto(origin + "/login", { waitUntil: "domcontentloaded", timeout: 3e4 });
    const deadline = Date.now() + 5 * 60 * 1e3;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      if (proof) return proof;
      if (context.pages().length === 0 || page.isClosed()) throw new Error("\u767B\u5F55\u7A97\u53E3\u5DF2\u5173\u95ED");
      if (new URL(page.url()).origin === origin) {
        const userID = await page.evaluate(() => {
          try {
            return Number(JSON.parse(localStorage.getItem("user") ?? "null")?.id ?? localStorage.getItem("uid"));
          } catch {
            return 0;
          }
        }).catch(() => 0);
        if (Number.isSafeInteger(userID) && userID > 0) {
          const cookie = (await context.cookies(origin + "/api/user/self")).map((item) => `${item.name}=${item.value}`).join("; ");
          if (cookie) {
            const me = await context.request.get(origin + "/api/user/self", {
              headers: { "New-Api-User": String(userID) },
              maxRedirects: 0,
              timeout: 3e3
            }).then((res) => res.ok() ? res.json() : null).catch(() => null);
            const verified = recordOf(me);
            if (verified.success === true && recordOf(verified.data).id === userID) {
              return { user_id: userID, authorization: "", cookie };
            }
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    throw new Error("\u7B49\u5F85\u5E73\u53F0\u767B\u5F55\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5");
  } finally {
    context.off("response", observe);
  }
}
function installPlatform(ctx) {
  const account = createPlatformAccount();
  let ready = false;
  let lastCatalog = "";
  let syncedProviders = /* @__PURE__ */ new Set();
  let browserState = { state: "idle", message: "" };
  let lastState;
  let gateway;
  let browserTask;
  let chrome;
  const life = new AbortController();
  const activeSockets = /* @__PURE__ */ new Set();
  const setReady = (value) => {
    ready = value;
    if (!ready) {
      for (const socket of activeSockets) socket.destroy();
      activeSockets.clear();
    }
  };
  const ensureGateway = async () => {
    if (gateway) return gateway;
    gateway = await startModelGateway(() => {
      if (lastState === void 0) throw new Error("\u8D26\u53F7\u72B6\u6001\u5C1A\u672A\u540C\u6B65");
      return catalog(lastState);
    });
    process.env.VEXNAR_GATEWAY_URL = gateway.url;
    process.env.VEXNAR_GATEWAY_TOKEN = gateway.token;
    console.log(`[vexnar] \u6A21\u578B\u7F51\u5173 ${gateway.url}`);
    return gateway;
  };
  const syncCatalog = async (state) => {
    lastState = state;
    const providers = {};
    const present = /* @__PURE__ */ new Set();
    for (const provider of catalog(state)) {
      const ref = credentialName(provider.id);
      await ctx.credentials.set(ref, provider.key);
      present.add(provider.id);
      providers[provider.id] = {
        displayName: provider.name,
        api: provider.id === "vexnar" ? "openai-responses" : "openai-completions",
        baseURL: provider.base,
        apiKeyEnv: ref,
        models: provider.models,
        // 只有「所有错误都重试」需要显式写入；normal 就是适配器自己的默认策略，
        // 写进去只会把默认值冻结在这一版代码上。
        ...provider.retry === "always" ? { retryPolicy: { mode: "always" } } : {}
      };
    }
    for (const id of syncedProviders) {
      if (!present.has(id)) await ctx.credentials.unset(credentialName(id)).catch(() => {
      });
    }
    syncedProviders = present;
    const fingerprint = JSON.stringify(providers);
    if (fingerprint !== lastCatalog) {
      await ctx.settings.replace("llm-pi-ai", { providers });
      lastCatalog = fingerprint;
    }
    const first = Object.keys(providers)[0];
    const firstModel = first === void 0 ? void 0 : providers[first]?.models[0];
    if (firstModel !== void 0) process.env.VEXNAR_GATEWAY_MODEL = firstModel.id;
    if (Object.keys(providers).length > 0) await ensureGateway();
    const current = ctx.agentDefaultModel.currentSelection();
    const selected = providers[current.provider]?.models.find((model) => model.id === current.model);
    if (!selected) {
      const [firstID] = Object.keys(providers);
      const fallback = firstID === void 0 ? void 0 : providers[firstID]?.models[0];
      if (firstID !== void 0 && fallback !== void 0) {
        await ctx.agentDefaultModel.saveSelection({ provider: firstID, model: fallback.id });
      }
    }
    setReady(gateOpen(state));
    return publicView(state);
  };
  const refresh = async () => syncCatalog(await account.read());
  const startupPaths = new Set(["entry.js", "ready", "methods", "account", "login", "login/password", "login/verify"].map((path) => clientPrefix + "/" + path));
  ctx.effect(() => {
    const ORIGINAL = Symbol.for("cordis.original");
    const connection = ctx.connection[ORIGINAL] ?? ctx.connection;
    const admit = connection.admit;
    const ownAdmission = Object.getOwnPropertyDescriptor(connection, "admit");
    const guarded = function(request) {
      const result = admit.call(this, request);
      if ("rejection" in result) return result;
      const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (!ready && !startupPaths.has(path)) return { rejection: 401 };
      const socket = request.socket;
      if (request.headers.upgrade?.toLowerCase() === "websocket" && socket && !activeSockets.has(socket)) {
        activeSockets.add(socket);
        socket.once("close", () => activeSockets.delete(socket));
      }
      return result;
    };
    connection.admit = guarded;
    return () => {
      setReady(false);
      if (connection.admit === guarded) {
        if (ownAdmission) Object.defineProperty(connection, "admit", ownAdmission);
        else delete connection.admit;
      }
    };
  });
  ctx.effect(() => ctx.webServer.tapIndex((html) => ready ? html.replace("</head>", workspaceSessionScript + "</head>") : loginPage));
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: clientPrefix + "/entry.js",
    handler: async (req, res) => {
      const rejection = ctx.connection.requestRejection(req);
      if (rejection || req.method !== "GET") {
        res.writeHead(rejection || 405);
        return res.end();
      }
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
      res.end(await readFile(new URL("./login-client.js", import.meta.url)));
    }
  }));
  for (const method of ["update", "replace", "mutate", "discoverModels"]) {
    const rpcNamespace = method === "discoverModels" ? "llm" : "settings";
    ctx.connection.fetch.register({
      path: `/api/${rpcNamespace}/${method}`,
      methods: ["POST"],
      fetch: async (request) => {
        const body = await request.json().catch(() => null);
        const message = clientRpcRequest(body, `${rpcNamespace}/${method}`);
        if (message === void 0) return new Response("invalid request", { status: 400 });
        const respond = (result) => Response.json({ type: "server-response", rpcId: message.rpcId, result });
        if (rpcNamespace === "llm" || message.args.ns === "llm-pi-ai") {
          return respond({ ok: false, error: {
            code: "settings/rejected",
            message: "\u8BF7\u5728 VEXNAR \u7684 \u8BBE\u7F6E \u2192 \u6A21\u578B \u4E2D\u7BA1\u7406\u63D0\u4F9B\u65B9",
            details: {}
          } });
        }
        const peer = ctx.connection.createPeer({ principal: { kind: "owner" } });
        try {
          const value = await ctx.typertGateway.invoke({
            namespace: rpcNamespace,
            method,
            args: message.args,
            signal: request.signal,
            peer
          });
          return respond({ ok: true, value });
        } catch (error) {
          return respond({ ok: false, error: failureOf(error) });
        } finally {
          await peer.dispose();
        }
      }
    });
  }
  function startLogin() {
    if (browserTask) return browserState;
    browserState = { state: "waiting", message: "\u8BF7\u5728\u6D4F\u89C8\u5668\u4E2D\u5B8C\u6210 HXSEC AI Platform \u767B\u5F55" };
    browserTask = (async () => {
      try {
        const status = await refresh();
        if (status.signed_in) throw new Error("\u8BF7\u5148\u9000\u51FA\u5F53\u524D VEXNAR \u8D26\u53F7");
        const { chromium } = await import("playwright-core");
        chrome = await chromium.launch({
          channel: process.env.VEXNAR_LOGIN_BROWSER || "chrome",
          headless: false,
          ignoreDefaultArgs: ["--enable-automation"]
        });
        life.signal.throwIfAborted();
        const context = await chrome.newContext();
        const page = await context.newPage();
        const proof = await capturePlatformLogin(context, page, platformOrigin(), life.signal);
        const result = await account.login(proof);
        await syncCatalog(await account.read());
        browserState = { state: "done", message: "\u5DF2\u9A8C\u8BC1 HXSEC AI Platform \u8EAB\u4EFD" };
        if (result.signed_in) console.log("vexnar: account-handoff");
      } catch (error) {
        const reason = messageOf(error);
        browserState = {
          state: "error",
          message: reason.includes("Executable") ? "\u627E\u4E0D\u5230\u767B\u5F55\u6D4F\u89C8\u5668\uFF0C\u8BF7\u5B89\u88C5 Google Chrome\uFF0C\u6216\u8BBE\u7F6E VEXNAR_LOGIN_BROWSER" : recordOf(error).status ? reason : chrome ? "\u767B\u5F55\u672A\u5B8C\u6210\u3002\u8BF7\u5728\u5E73\u53F0\u7A97\u53E3\u5B8C\u6210\u9A8C\u8BC1\u540E\u91CD\u8BD5\u3002" : reason || "\u65E0\u6CD5\u6253\u5F00\u5E73\u53F0\u767B\u5F55"
        };
      } finally {
        await chrome?.close().catch(() => {
        });
        chrome = void 0;
        browserTask = void 0;
      }
    })();
    return browserState;
  }
  function route(suffix, handlers) {
    ctx.effect(() => ctx.webServer.register({
      kind: "exact",
      path: clientPrefix + suffix,
      handler: async (req, res) => {
        const send = (status, body) => {
          res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          res.end(JSON.stringify(body));
        };
        const rejection = ctx.connection.requestRejection(req);
        if (rejection) return send(rejection, { error: "\u8BF7\u4ECE\u672C\u673A VEXNAR \u5BA2\u6237\u7AEF\u8BBF\u95EE" });
        const handler = req.method === void 0 ? void 0 : handlers[req.method];
        if (!handler) return send(405, { error: "\u8BF7\u6C42\u65B9\u6CD5\u4E0D\u53D7\u652F\u6301" });
        const hasBody = Number(req.headers["content-length"] ?? 0) > 0 || req.headers["transfer-encoding"] !== void 0;
        if (hasBody && req.headers["content-type"]?.split(";")[0] !== "application/json") {
          return send(415, { error: "\u9700\u8981 application/json \u8BF7\u6C42" });
        }
        try {
          send(200, await handler(req));
        } catch (error) {
          const status = error instanceof PlatformError ? error.status : 502;
          send(status, { error: error instanceof PlatformError ? error.message : "VEXNAR \u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5" });
        }
      }
    }));
  }
  route("/ready", { GET: () => ({ ready }) });
  route("/methods", { GET: () => account.methods() });
  route("/account", {
    GET: () => refresh(),
    DELETE: async () => {
      if (browserTask) throw new PlatformError(409, "\u8BF7\u5173\u95ED\u5E73\u53F0\u767B\u5F55\u7A97\u53E3\u540E\u518D\u8BD5");
      await account.logout();
      return syncCatalog(await account.read());
    }
  });
  route("/login", { POST: startLogin, GET: () => browserState });
  route("/login/password", {
    POST: async (req) => {
      const input = await readJson(req);
      const result = await account.password(bodyText(input, "username"), bodyText(input, "password"));
      if ("challenge" in result) return result;
      return syncCatalog(await account.read());
    }
  });
  route("/login/verify", {
    POST: async (req) => {
      const input = await readJson(req);
      await account.verify(bodyText(input, "challenge"), bodyText(input, "code"));
      return syncCatalog(await account.read());
    }
  });
  route("/providers", {
    POST: async (req) => {
      const input = await readJson(req);
      await account.addProvider(providerInput(input));
      return syncCatalog(await account.read());
    },
    PATCH: async (req) => {
      const input = await readJson(req);
      await account.updateProvider(providerInput(input));
      return syncCatalog(await account.read());
    },
    DELETE: async (req) => {
      const input = await readJson(req);
      await account.removeProvider(bodyText(input, "id"));
      return syncCatalog(await account.read());
    }
  });
  const refreshInBackground = () => void refresh().catch(() => {
  });
  ctx.effect(() => {
    const timer = setInterval(refreshInBackground, 15e3);
    timer.unref();
    refreshInBackground();
    return () => {
      clearInterval(timer);
      life.abort();
      void chrome?.close().catch(() => {
      });
      void gateway?.close().catch(() => {
      });
      gateway = void 0;
    };
  });
  return () => ready;
}
export {
  installPlatform,
  recordOf
};
