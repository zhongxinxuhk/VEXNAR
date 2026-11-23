import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installPlatform, recordOf } from "./platform.js";
import { registerYakHistoryTools } from "./yak-history-tools.js";
import { registerInterceptGuard } from "./intercept-guard.js";
const LOGO_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "logo.png");
let logoBytes = null;
const settingsReads = /* @__PURE__ */ new Set([
  "/api/tools",
  "/api/llm/profiles",
  "/api/mcp",
  "/api/agents",
  "/api/task-categories",
  "/api/task-templates",
  "/api/companies",
  "/api/tokens/daily"
]);
const domainReads = /* @__PURE__ */ new Set([
  "/api/tasks",
  "/api/tasks/summary",
  "/api/assets/counts",
  "/api/exploration/findings",
  "/api/exploration/findings/stats",
  "/api/exploration/intents",
  "/api/exploration/nodes",
  "/api/exploration/activity",
  "/api/traffic",
  "/api/traffic/hosts",
  "/api/traffic/capture"
]);
function isStoredDataRead(path, goMode) {
  if (settingsReads.has(path) || /^\/api\/mcp\/\d+\/tools$/.test(path)) return true;
  return !goMode && (domainReads.has(path) || /^\/api\/tasks\/\d+(?:\/(?:metrics|coverage|goals))?$/.test(path) || /^\/api\/exploration\/findings\/\d+$/.test(path));
}
function isNotificationSetting(method, path) {
  return path === "/api/notify/channels" ? method === "GET" || method === "POST" : (method === "PATCH" || method === "DELETE") && /^\/api\/notify\/channels\/\d+$/.test(path);
}
function isClientMaintenance(method, path, goMode) {
  if ((method === "GET" || method === "DELETE") && path === "/api/traffic/local-cleanup") return true;
  if (method === "GET" && (path === "/api/update/check" || path === "/api/update/stream")) return true;
  if (method === "POST" && (path === "/api/update/apply" || path === "/api/update/rollback")) return true;
  if (goMode) return false;
  if (method === "GET") return path === "/api/task-archives" || /^\/api\/task-archives\/\d+$/.test(path);
  if (method === "DELETE") return /^\/api\/(?:tasks|task-archives)\/\d+$/.test(path);
  return method === "POST" && (/^\/api\/(?:task-archives\/\d+\/restore|tasks\/\d+\/archive)$/.test(path) || path === "/api/tasks/archive/batch");
}
const name = "@vexnar/dsh-account";
const inject = ["webServer", "credentials", "settings", "connection", "sessions", "tools", "agentDefaultModel", "typertGateway"];
const BRAND_SCRIPT = `
(() => {
  const updateTitle = () => {
    const title = document.title.replace(/(?:DeepSeek Harness|DSH Local Build)$/, 'VEXNAR');
    if (title !== document.title) document.title = title;
  };
  updateTitle();
  new MutationObserver(updateTitle).observe(document.head, { childList: true, subtree: true, characterData: true });
})();
`;
const BRAND_HEAD = [
  "<title>VEXNAR</title>",
  '<meta name="application-name" content="VEXNAR">',
  '<meta name="apple-mobile-web-app-title" content="VEXNAR">',
  '<meta property="og:title" content="VEXNAR">',
  '<link rel="icon" type="image/png" href="/vexnar-brand/favicon.png">',
  '<link rel="apple-touch-icon" sizes="512x512" href="/vexnar-brand/favicon.png">',
  '<link rel="manifest" href="/vexnar-brand/manifest.webmanifest">'
].join("");
const PERMISSION_WARNING_SCRIPT = `
(() => {
  document.documentElement.dataset.vexnarPermInjected = '1';
  const labels = new Set(['\u5B8C\u5168\u6743\u9650','Full access','\u30D5\u30EB\u30A2\u30AF\u30BB\u30B9','Acceso completo','Acc\xE8s complet','Voller Zugriff','\u041F\u043E\u043B\u043D\u044B\u0439 \u0434\u043E\u0441\u0442\u0443\u043F','Acesso total']);
  const paint = (node, full) => {
    if (!(node instanceof HTMLElement)) return;
    if (full) {
      node.style.setProperty('color', '#dc2626', 'important');
      node.style.setProperty('font-weight', '600', 'important');
      node.dataset.vexnarFull = '1';
    } else {
      node.style.removeProperty('color');
      node.style.removeProperty('font-weight');
      delete node.dataset.vexnarFull;
    }
  };
  const sweep = () => {
    document.querySelectorAll('[class*="triggerLabel"], [class*="optionLabelText"]').forEach((node) => {
      paint(node, labels.has((node.textContent || '').trim()));
    });
    document.querySelectorAll('[role="menuitem"]').forEach((item) => {
      paint(item, labels.has((item.textContent || '').trim()));
    });
  };
  sweep();
  new MutationObserver(sweep).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
`;
const PERMISSION_WARNING_CSS = `
button[aria-label*="\u5B8C\u5168\u6743\u9650"] [class*="triggerLabel"],
button[aria-label*="Full access"] [class*="triggerLabel"],
button[aria-label*="\u30D5\u30EB\u30A2\u30AF\u30BB\u30B9"] [class*="triggerLabel"],
button[aria-label*="Acceso completo"] [class*="triggerLabel"],
button[aria-label*="Acc\xE8s complet"] [class*="triggerLabel"],
button[aria-label*="Voller Zugriff"] [class*="triggerLabel"],
button[aria-label*="\u041F\u043E\u043B\u043D\u044B\u0439 \u0434\u043E\u0441\u0442\u0443\u043F"] [class*="triggerLabel"],
button[aria-label*="Acesso total"] [class*="triggerLabel"],
button[aria-label*="\u5B8C\u5168\u6743\u9650"] { color: #dc2626 !important; }
button[aria-label*="\u5B8C\u5168\u6743\u9650"] svg,
button[aria-label*="\u5B8C\u5168\u6743\u9650"] svg * { color: #dc2626 !important; stroke: #dc2626 !important; }
[data-vexnar-full="1"], [data-vexnar-full="1"] svg,
[data-vexnar-full="1"] svg * { color: #dc2626 !important; stroke: #dc2626 !important; }
[role="menuitem"][aria-label*="\u5B8C\u5168\u6743\u9650"],
[role="menuitem"][aria-label*="Full access"],
[role="menuitem"][aria-label*="\u30D5\u30EB\u30A2\u30AF\u30BB\u30B9"],
[role="menuitem"][aria-label*="Acceso completo"],
[role="menuitem"][aria-label*="Acc\xE8s complet"],
[role="menuitem"][aria-label*="Voller Zugriff"],
[role="menuitem"][aria-label*="\u041F\u043E\u043B\u043D\u044B\u0439 \u0434\u043E\u0441\u0442\u0443\u043F"],
[role="menuitem"][aria-label*="Acesso total"] { color: #dc2626 !important; font-weight: 600 !important; }
`;
function apply(ctx) {
  if (process.env.VEXNAR_RUNTIME_MODE === "go") registerYakHistoryTools(ctx);
  if (process.env.VEXNAR_CORE_EMBEDDED !== "0") {
    let core;
    let coreState = "loading";
    const starting = import("./core-embedded.js").then((result) => {
      core = result;
      coreState = "available";
      void result.startRuntime().catch((error) => {
        console.error("[vexnar] \u8FD0\u884C\u65F6\u5E95\u5EA7\u542F\u52A8\u5931\u8D25", error);
      });
      return result;
    }, (error) => {
      coreState = "failed";
      console.error("[vexnar] \u5D4C\u5165 core \u52A0\u8F7D\u5931\u8D25", error);
      return void 0;
    });
    const getCore = async () => core ?? await starting;
    const goMode = process.env.VEXNAR_RUNTIME_MODE?.trim().toLowerCase() === "go";
    const diagnostics = () => {
      const configuredStore = process.env.VEXNAR_STORE?.trim().toLowerCase();
      const store = configuredStore === "json" || configuredStore === "postgres" ? configuredStore : "sqlite";
      return {
        ...core?.runtimeInfo?.() ?? {
          mode: goMode ? "go" : "ts",
          store,
          started: false,
          started_at: 0,
          triggers: 0,
          schedules: false,
          store_locked: false,
          engine: "unavailable",
          task_concurrency: Number(process.env.VEXNAR_TASK_CONCURRENCY ?? 2) || 2
        },
        core_state: coreState
      };
    };
    const coreRequest = async (path, init = {}) => {
      const app = await getCore();
      if (!app) throw new Error("VEXNAR \u9886\u57DF\u670D\u52A1\u5C1A\u672A\u5C31\u7EEA");
      const { handle } = app;
      const requestInit = {
        method: init.method ?? "GET",
        headers: { "content-type": "application/json", ...init.headers ?? {} }
      };
      if (init.body !== void 0) requestInit.body = JSON.stringify(init.body);
      const response = await handle(new Request(new URL(path, "http://127.0.0.1"), requestInit), true);
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }
      if (!response.ok) {
        const message = data?.error ?? text ?? `HTTP ${response.status}`;
        throw new Error(message);
      }
      return data;
    };
    ctx.provide("vexnarCore", { request: coreRequest });
    if (!goMode) registerInterceptGuard(ctx, coreRequest);
    ctx.effect(() => ctx.webServer.register({
      kind: "prefix",
      path: "/vexnar-api",
      handler: async (req, res) => {
        try {
          if (!platformReady()) {
            res.writeHead(401, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            res.end(JSON.stringify({ error: "\u8BF7\u5148\u767B\u5F55 VEXNAR" }));
            return;
          }
          const url = new URL(req.url || "/", "http://127.0.0.1");
          url.pathname = url.pathname.replace(/^\/vexnar-api/, "") || "/";
          const readingYakHistory = req.method === "POST" && url.pathname === "/api/yak/history";
          const readingYakSources = (req.method === "GET" || req.method === "PUT") && url.pathname === "/api/yak/sources";
          const nativeYak = (readingYakHistory || readingYakSources) && !goMode;
          const remoteAddress = req.socket.remoteAddress;
          const localPeer = remoteAddress !== void 0 && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remoteAddress);
          if (nativeYak && !localPeer) {
            res.writeHead(403, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            res.end(JSON.stringify({ error: "Yak \u6D41\u91CF\u63A5\u53E3\u4EC5\u4F9B\u672C\u673A VEXNAR \u5BA2\u6237\u7AEF" }));
            return;
          }
          const toolDocumentation = req.method === "PUT" && /^\/api\/tools\/[^/]+\/documentation$/.test(url.pathname) || req.method === "POST" && /^\/api\/tools\/[^/]+\/documentation\/reset$/.test(url.pathname);
          const configRoute = isClientMaintenance(req.method, url.pathname, goMode) || toolDocumentation || isNotificationSetting(req.method, url.pathname) || !goMode && /^\/api\/intercept\/(?:rules|tool-config|judge)(?:\/|$)/.test(url.pathname) || req.method === "GET" && isStoredDataRead(url.pathname, goMode);
          const runtimeRead = req.method === "GET" && url.pathname === "/api/_runtime";
          const app = configRoute || nativeYak || runtimeRead ? void 0 : await getCore();
          if (!configRoute && !nativeYak && !runtimeRead && !app) {
            res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            res.end(JSON.stringify({ error: "VEXNAR \u9886\u57DF\u670D\u52A1\u5C1A\u672A\u5C31\u7EEA", core_state: coreState }));
            return;
          }
          if (configRoute || nativeYak || runtimeRead || app?.isGoDataRequest(req.method, url.pathname)) {
            const rejection = ctx.connection.requestRejection(req);
            if (rejection) {
              console.warn(
                `[vexnar] /vexnar-api ${rejection} ${req.method} ${url.pathname} host=${req.headers.host ?? "-"} cookie=${req.headers.cookie === void 0 ? "none" : "present"} origin=${req.headers.origin ?? "-"}`
              );
              res.writeHead(rejection, { "Content-Type": "application/json", "Cache-Control": "no-store" });
              res.end(JSON.stringify({ error: "\u8BF7\u4ECE\u5DF2\u767B\u5F55\u7684 VEXNAR \u5BA2\u6237\u7AEF\u8BBF\u95EE" }));
              return;
            }
          }
          if (runtimeRead) {
            res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            res.end(JSON.stringify(diagnostics()));
            return;
          }
          const limit = readingYakHistory ? 8192 : readingYakSources || toolDocumentation ? 65536 : Infinity;
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > limit) {
              res.writeHead(413, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "\u8BF7\u6C42\u6B63\u6587\u8FC7\u5927" }));
              return;
            }
            chunks.push(chunk);
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) for (const item of value) headers.append(key, item);
            else if (value !== void 0) headers.set(key, value);
          }
          let body = req.method === "GET" || req.method === "HEAD" ? void 0 : Buffer.concat(chunks);
          if (readingYakHistory) {
            let input;
            try {
              input = JSON.parse(body === void 0 ? "" : body.toString("utf8"));
            } catch {
            }
            if (!input || Array.isArray(input) || typeof input !== "object" || ("workspace" in input || "agent" in input) || input.session_id !== void 0 && (typeof input.session_id !== "string" || !input.session_id)) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "\u65E0\u6548\u7684\u6D41\u91CF\u4F1A\u8BDD\u8BF7\u6C42" }));
              return;
            }
            const sessionID = typeof input.session_id === "string" ? input.session_id : void 0;
            const workspace = sessionID ? ctx.sessions.get(sessionID)?.header.cwd : void 0;
            if (sessionID && !workspace) {
              res.writeHead(409, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u53EF\u7528\u7684\u672C\u5730\u9879\u76EE" }));
              return;
            }
            delete input.session_id;
            body = Buffer.from(JSON.stringify({ ...input, workspace }));
          }
          const init = { headers };
          if (req.method !== void 0) init.method = req.method;
          if (body !== void 0) init.body = body;
          const request = new Request(url, init);
          const response = readingYakHistory ? await (await import("./yak-history.js")).handleYakHistory(request) : readingYakSources ? await (await import("./yak-sources.js")).handleYakSources(request) : configRoute ? await (await import("./settings-embedded.js")).handleSettings(request) : await app.handle(request, localPeer);
          const responseHeaders = {};
          for (const [key, value] of response.headers.entries()) responseHeaders[key] = value;
          res.writeHead(response.status, responseHeaders);
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: String(recordOf(error).message || error) }));
        }
      }
    }));
  }
  ctx.effect(() => ctx.webServer.tapIndex((html) => html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "").replace(/<link\b[^>]*\brel=["'](?:shortcut icon|icon|apple-touch-icon|manifest)["'][^>]*>/gi, "").replace("</head>", () => BRAND_HEAD + `<script>${BRAND_SCRIPT}</script></head>`)));
  const platformReady = installPlatform(ctx);
  ctx.effect(
    () => ctx.webServer.register({
      kind: "exact",
      path: "/vexnar-brand/manifest.webmanifest",
      handler: async (_req, res) => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.end(JSON.stringify({
          name: "VEXNAR",
          short_name: "VEXNAR",
          description: "VEXNAR \u2014 AI \u81EA\u4E3B\u6E17\u900F\u6D4B\u8BD5\u7CFB\u7EDF",
          start_url: "/",
          display: "standalone",
          background_color: "#ffffff",
          theme_color: "#111827",
          icons: [{ src: "/vexnar-brand/favicon.png", sizes: "512x512", type: "image/png" }]
        }));
      }
    })
  );
  ctx.effect(
    () => ctx.webServer.register({
      kind: "exact",
      path: "/vexnar-brand/favicon.png",
      handler: async (_req, res) => {
        try {
          logoBytes ??= await readFile(LOGO_PATH);
          res.statusCode = 200;
          res.setHeader("Content-Type", "image/png");
          res.setHeader("Cache-Control", "public, max-age=86400");
          res.end(logoBytes);
        } catch (error) {
          res.statusCode = 404;
          res.end("logo not found");
        }
      }
    })
  );
}
export {
  apply,
  inject,
  name
};
