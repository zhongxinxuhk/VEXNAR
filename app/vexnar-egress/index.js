const name = "vexnar-egress";
const inject = ["tools"];
const DEFAULTS = {
  coreUrl: "http://127.0.0.1:8790",
  token: "",
  tokenEnv: "VEXNAR_API_TOKEN",
  taskIdEnv: "VEXNAR_TASK_ID",
  defaultTaskId: 0,
  requestTimeoutMs: 6e4,
  maxOutputBytes: 32 * 1024
};
let config = { ...DEFAULTS };
let bridge;
function authHeaders() {
  const token = config.token || (config.tokenEnv ? process.env[config.tokenEnv] ?? "" : "");
  return token ? { "x-vexnar-token": token } : {};
}
async function core(path, init = {}) {
  if (bridge) {
    const payload = typeof init.body === "string" && init.body !== "" ? JSON.parse(init.body) : void 0;
    return bridge.request(path, {
      method: init.method,
      body: payload,
      headers: init.headers
    });
  }
  const response = await fetch(new URL(path, config.coreUrl), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
      ...init.headers
    },
    signal: init.signal ?? AbortSignal.timeout(config.requestTimeoutMs)
  });
  const text2 = await response.text();
  let data = null;
  try {
    data = text2 ? JSON.parse(text2) : null;
  } catch {
    data = { raw: text2 };
  }
  if (!response.ok) {
    const message = data?.error ?? data?.raw ?? `HTTP ${response.status}`;
    throw new Error(`core ${path}: ${message}`);
  }
  return data;
}
function taskId(args, exec) {
  const explicit = Number(args.task_id ?? 0);
  if (explicit > 0) return explicit;
  const env = Number(config.taskIdEnv ? process.env[config.taskIdEnv] ?? 0 : 0);
  if (env > 0) return env;
  if (config.defaultTaskId > 0) return config.defaultTaskId;
  const session = String(exec.agent?.session?.id ?? "");
  return session ? 0 : 0;
}
function scopeOf(args, exec) {
  const explicit = String(args.scope ?? "").trim();
  if (explicit) return explicit;
  const session = String(exec.agent?.session?.id ?? "").trim();
  return session ? `dsh-${session}` : "";
}
async function sessionProxy(args, exec) {
  const body = {
    task_id: taskId(args, exec),
    pool_id: Number(args.pool_id ?? 0) || void 0,
    scope: scopeOf(args, exec),
    mode: String(args.mode ?? "sticky"),
    max_conns: Number(args.max_conns ?? 8) || 8
  };
  return core("/api/proxy/session", { method: "POST", body: JSON.stringify(body) });
}
function text(value) {
  return [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }];
}
function output(schema = { type: "object", additionalProperties: true }) {
  return { schema, render: (_args, value) => text(value) };
}
function clip(value, limit) {
  return value.length > limit ? `${value.slice(0, limit)}
\u2026[truncated ${value.length - limit} bytes]` : value;
}
function registerTools(ctx) {
  ctx.tools.register({
    name: "egress_status",
    description: "Inspect the VEXNAR egress proxy pool: engine availability, pools, nodes (including pivot/chain), bindings and live sessions. Use before choosing an egress path for a task.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        task_id: { type: "integer", description: "Task id whose binding/pool should be highlighted." }
      }
    },
    output: output(),
    async execute(args) {
      const state = await core("/api/proxy/state");
      const settings = await core("/api/proxy/settings");
      const id = Number(args.task_id ?? 0) || void 0;
      return {
        engine: state.engine,
        gateway: state.gateway,
        socks: state.socks,
        default_pool: settings.default_pool,
        listener_auth: settings.egress_listener_auth,
        pools: (state.pools ?? []).map((pool) => ({
          id: pool.id,
          name: pool.name,
          mode: pool.mode_default,
          nodes: pool.node_count,
          healthy: pool.healthy_count
        })),
        nodes: (state.nodes ?? []).map((node) => ({
          id: node.id,
          name: node.name,
          protocol: node.protocol,
          server: `${node.server}:${node.port}`,
          state: node.state,
          source: node.source,
          via_node_id: node.via_node_id || void 0
        })),
        binding: id ? (state.bindings ?? []).find((b) => Number(b.task_id) === id) : void 0,
        sessions: (state.sessions ?? []).filter((session) => !id || Number(session.task_id) === id)
      };
    }
  });
  ctx.tools.register({
    name: "fanout_fetch",
    description: "Fetch a URL through K proxy nodes concurrently and return the first response that is not blocked by a WAF/interstitial. Use for idempotent (GET/HEAD/OPTIONS) requests when a single node may be filtered.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["url"],
      properties: {
        url: { type: "string", description: "Absolute http(s) URL." },
        method: { type: "string", description: "HTTP method; non-idempotent methods are limited to one node." },
        headers: { type: "object", additionalProperties: { type: "string" }, description: "Request headers." },
        body: { type: "string", description: "Request body for non-GET methods." },
        k: { type: "integer", description: "Concurrent node count (1-8, default pool fanout_k)." },
        task_id: { type: "integer", description: "Task whose bound pool is used." }
      }
    },
    output: output(),
    async execute(args) {
      return core("/api/proxy/fanout", {
        method: "POST",
        body: JSON.stringify({
          task_id: Number(args.task_id ?? 0) || taskId(args, {}),
          url: String(args.url),
          method: String(args.method ?? "GET"),
          headers: args.headers ?? {},
          body: args.body ?? "",
          k: Number(args.k ?? 0) || void 0
        })
      });
    }
  });
  ctx.tools.register({
    name: "pivot_add",
    description: "Register a SOCKS5/HTTP pivot (SSH -D, C2 socks, frp, etc.) as an egress node and optionally add it to a pool. Set via_node_id to chain the pivot behind an existing node, so the pivot endpoint itself is reached through that hop.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["server", "port"],
      properties: {
        name: { type: "string", description: "Display name; defaults to pivot-server:port." },
        protocol: { type: "string", enum: ["socks5", "http"], description: "Pivot protocol (default socks5)." },
        server: { type: "string", description: "Pivot host or IP." },
        port: { type: "integer", description: "Pivot port." },
        username: { type: "string", description: "Optional proxy username." },
        password: { type: "string", description: "Optional proxy password." },
        via_node_id: { type: "integer", description: "Existing node id to reach the pivot through (chain)." },
        pool_id: { type: "integer", description: "Pool to add the node to; defaults to the default pool." },
        tags: { type: "array", items: { type: "string" }, description: 'Tags; defaults to ["pivot"].' }
      }
    },
    output: output(),
    async execute(args) {
      return core("/api/proxy/pivots", { method: "POST", body: JSON.stringify(args) });
    }
  });
  ctx.tools.register({
    name: "browser_proxy",
    description: "Open a no-auth loopback HTTP proxy bound to this session and return its URL. Use it for Playwright MCP or other clients that can only take a static --proxy-server value.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        task_id: { type: "integer", description: "Task whose binding/pool is used." },
        pool_id: { type: "integer", description: "Pool override." }
      }
    },
    output: output(),
    async execute(args, exec) {
      const result = await core("/api/proxy/fixed", {
        method: "POST",
        body: JSON.stringify({
          task_id: taskId(args, exec),
          pool_id: Number(args.pool_id ?? 0) || void 0,
          scope: scopeOf(args, exec)
        })
      });
      return { ...result, hint: "Pass this URL as --proxy-server to Playwright MCP; it has no credentials." };
    }
  });
  ctx.inject(["shell"], (shellCtx) => {
    shellCtx.tools.register({
      name: "egress_exec",
      description: "Run a shell command with HTTP_PROXY/HTTPS_PROXY/ALL_PROXY pointing at this session's egress proxy. Use it for curl, nuclei, ffuf, sqlmap and other tools that honor proxy environment variables.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["command"],
        properties: {
          command: { type: "string", description: "Shell command; runs via bash -c." },
          workdir: { type: "string", description: "Working directory override." },
          timeout_ms: { type: "integer", description: "Timeout in milliseconds." },
          task_id: { type: "integer", description: "Task whose binding/pool is used." },
          pool_id: { type: "integer", description: "Pool override." }
        }
      },
      output: output(),
      async execute(args, exec) {
        if (!shellCtx.shell) throw new Error("egress_exec: shell executor is not mounted");
        const session = await sessionProxy(args, exec);
        const proxy = session.proxy;
        const env = {
          HTTP_PROXY: proxy,
          HTTPS_PROXY: proxy,
          ALL_PROXY: proxy,
          NO_PROXY: "127.0.0.1,localhost,::1",
          VEXNAR_EGRESS_PROXY: proxy,
          VEXNAR_EGRESS_SESSION: session.session
        };
        const request = {
          command: String(args.command),
          workdir: args.workdir == null ? void 0 : String(args.workdir),
          timeoutMs: Number(args.timeout_ms ?? 0) || void 0,
          env,
          signal: exec.signal
        };
        if (shellCtx.shellEnv) request.dshEnv = shellCtx.shellEnv.collect(exec);
        const spec = shellCtx.shell.resolve(request);
        const execution = await shellCtx.shell.execute(spec);
        const result = await execution.result();
        return {
          exit_code: result.exitCode,
          timed_out: result.timedOut,
          aborted: result.aborted,
          proxy: proxy.replace(/\/\/[^@]+@/, "//***@"),
          stdout: clip(String(result.stdout?.text ?? ""), config.maxOutputBytes),
          stderr: clip(String(result.stderr?.text ?? ""), config.maxOutputBytes)
        };
      }
    });
  });
  ctx.tools.register({
    name: "egress_proxy",
    description: "Return the credentialed proxy URL and SOCKS address for this session, for tools that accept --proxy but are not run through egress_exec.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        task_id: { type: "integer", description: "Task whose binding/pool is used." },
        pool_id: { type: "integer", description: "Pool override." }
      }
    },
    output: output(),
    async execute(args, exec) {
      const state = await core("/api/proxy/state");
      const session = await sessionProxy(args, exec);
      return { proxy: session.proxy, socks: state.socks ?? "", session: session.session };
    }
  });
}
function apply(ctx, userConfig = {}, logger) {
  config = { ...DEFAULTS, ...userConfig };
  const coreUrl = new URL(config.coreUrl);
  if (coreUrl.hostname !== "127.0.0.1" && coreUrl.hostname !== "localhost" && coreUrl.hostname !== "::1") {
    logger?.warn?.(`vexnar-egress: coreUrl ${config.coreUrl} is not loopback; proxy credentials will cross the network`);
  }
  ctx.inject(["vexnarCore"], (bridgeCtx) => {
    bridge = bridgeCtx.vexnarCore;
  });
  registerTools(ctx);
}
export {
  apply,
  inject,
  name
};
