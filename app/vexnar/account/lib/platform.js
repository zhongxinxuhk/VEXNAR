import { readFile } from "node:fs/promises";
import { loginPage, workspaceSessionScript } from "./login-page.js";
import { createModelCompletion } from "./model-channel.js";
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
function installPlatform(ctx) {
  const account = createPlatformAccount();
  let ready = false;
  let lastCatalog = "";
  let syncedProviders = /* @__PURE__ */ new Set();
  let lastState;
  let channelInstalled = false;
  let channelLoading = false;
  const life = new AbortController();
  const activeSockets = /* @__PURE__ */ new Set();
  const setReady = (value) => {
    ready = value;
    if (!ready) {
      for (const socket of activeSockets) socket.destroy();
      activeSockets.clear();
    }
  };
  const ensureModelChannel = () => {
    if (channelInstalled || channelLoading) return;
    channelLoading = true;
    void import("./core-embedded.js").then((core) => {
      if (life.signal.aborted || lastState === void 0 || catalog(lastState).length === 0) return;
      core.setModelCompletion(createModelCompletion(
        () => lastState ? catalog(lastState) : [],
        () => process.env.VEXNAR_MODEL
      ));
      channelInstalled = true;
    }).catch(() => {
      console.warn("[vexnar] \u5185\u7F6E\u6A21\u578B\u901A\u9053\u521D\u59CB\u5316\u5931\u8D25");
    }).finally(() => {
      channelLoading = false;
    });
  };
  const clearModelChannel = async () => {
    if (!channelInstalled) return;
    channelInstalled = false;
    const core = await import("./core-embedded.js");
    core.setModelCompletion(void 0);
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
        models: provider.models.map(({ inputTypes, maxOutputTokens, ...model }) => ({
          ...model,
          ...inputTypes === void 0 ? {} : { input: inputTypes },
          ...maxOutputTokens === void 0 ? {} : { maxTokens: maxOutputTokens }
        })),
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
    if (firstModel !== void 0) process.env.VEXNAR_MODEL = firstModel.id;
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
    if (firstModel !== void 0) ensureModelChannel();
    return publicView(state);
  };
  const refresh = async () => syncCatalog(await account.read());
  const startupPaths = new Set(["entry.js", "ready", "methods", "account", "login/token"].map((path) => clientPrefix + "/" + path));
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
  ctx.effect(() => ctx.webServer.tapIndex((html) => ready ? html.replace("</head>", workspaceSessionScript + "</head>") : loginPage(platformOrigin())));
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
    // 打开设置时读取已保存的账户视图，凭据和模型配置由后台同步及写操作维护。
    GET: () => ready ? account.status() : refresh(),
    PATCH: async (req) => {
      const input = await readJson(req);
      return account.renewWithToken(bodyText(input, "access_token"));
    },
    DELETE: async () => {
      await account.logout();
      return syncCatalog(await account.read());
    }
  });
  route("/login/token", {
    POST: async (req) => {
      const input = await readJson(req);
      await account.loginWithToken(bodyText(input, "access_token"));
      const view = await refresh();
      if (view.signed_in) console.log("vexnar: account-handoff");
      return view;
    }
  });
  route("/wallet", { GET: () => account.wallet() });
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
      void clearModelChannel().catch(() => {
      });
    };
  });
  return () => ready;
}
export {
  installPlatform,
  recordOf
};
