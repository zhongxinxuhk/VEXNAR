import {
  DEFAULT_INTERCEPT_TOOLS,
  compileRules,
  decide,
  emptySnapshot,
  ruleOf
} from "./intercept.js";
const ASK_MAX_MS = 30 * 60 * 1e3;
const ASK_POLL_MS = 500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const REFRESH_MS = 2e3;
function journal(coreRequest) {
  return (rule, toolName, args, status, message) => {
    const body = {
      rule_id: rule?.id ?? null,
      tool_name: toolName,
      tool_input: args,
      status,
      message,
      decision_source: "rule"
    };
    void coreRequest("/api/intercept/decisions", { method: "POST", body }).catch(() => {
    });
  };
}
function registerInterceptGuard(ctx, coreRequest, options = {}) {
  const pollMs = Math.max(1, options.pollMs ?? ASK_POLL_MS);
  let snapshot = emptySnapshot();
  let inflight;
  const log = journal(coreRequest);
  const refresh = () => {
    if (inflight !== void 0) return inflight;
    inflight = (async () => {
      try {
        const [rulesBody, configBody] = await Promise.all([
          coreRequest("/api/intercept/rules"),
          coreRequest("/api/intercept/tool-config")
        ]);
        const rows = rulesBody?.rules;
        const tools = configBody?.enabled_tools;
        const rules = Array.isArray(rows) ? compileRules(rows.map((row) => ruleOf(row))) : [];
        snapshot = {
          rules,
          tools: Array.isArray(tools) ? tools.map(String) : [...DEFAULT_INTERCEPT_TOOLS],
          loadedAt: Date.now()
        };
      } catch {
      }
    })().finally(() => {
      inflight = void 0;
    });
    return inflight;
  };
  const deny = (reason) => ({ kind: "deny", reason });
  const evaluate = async (exec) => decide(snapshot.rules, snapshot.tools, exec.name, exec.arguments);
  const handler = async (exec, next) => {
    const decision = await evaluate(exec);
    if (decision.kind === "pass") return next();
    if (decision.kind === "allow") {
      log(decision.rule, exec.name, exec.arguments, "allowed", `\u62E6\u622A\u89C4\u5219 [${decision.rule.name}] \u653E\u884C`);
      return next();
    }
    if (decision.kind === "deny") {
      log(decision.rule, exec.name, exec.arguments, "denied", decision.message);
      return deny(decision.message);
    }
    const rule = decision.rule;
    const timeoutMs = rule.timeout_enabled && rule.timeout_seconds > 0 ? rule.timeout_seconds * 1e3 : ASK_MAX_MS;
    const started = Date.now();
    let pendingID = 0;
    try {
      const created = await coreRequest("/api/intercept/pending", {
        method: "POST",
        body: {
          rule_id: rule.id,
          tool_name: exec.name,
          tool_input: exec.arguments,
          message: decision.message,
          decision_source: "rule"
        }
      });
      pendingID = Number(created?.id);
      if (!Number.isInteger(pendingID) || pendingID <= 0) throw new Error("\u5BA1\u6279\u8BB0\u5F55\u521B\u5EFA\u5931\u8D25");
    } catch {
      const reason = `${decision.message}\uFF08\u5BA1\u6279\u8BB0\u5F55\u521B\u5EFA\u5931\u8D25\uFF0C\u5DF2\u6309\u62D2\u7EDD\u5904\u7406\uFF09`;
      log(rule, exec.name, exec.arguments, "denied", reason);
      return deny(reason);
    }
    const settle = async (value) => {
      await coreRequest(`/api/intercept/pending/${pendingID}/decide`, { method: "POST", body: { decision: value } }).catch(() => {
      });
    };
    while (true) {
      if (exec.signal?.aborted === true) {
        await settle("denied");
        return deny(decision.message);
      }
      const row = await coreRequest(`/api/intercept/pending/${pendingID}`).catch(() => void 0);
      const status = String(row?.status ?? "pending");
      if (status === "allowed") return next();
      if (status === "denied" || status === "timeout") return deny(decision.message);
      const remaining = timeoutMs - (Date.now() - started);
      if (remaining <= 0) {
        const allowed = rule.timeout_action === "allow";
        await settle(allowed ? "allowed" : "denied");
        return allowed ? next() : deny(`${decision.message}\uFF08\u5BA1\u6279\u8D85\u65F6\uFF09`);
      }
      await sleep(Math.min(pollMs, remaining));
    }
  };
  ctx.effect(() => {
    const off = ctx.on("tools/pre-execute", handler);
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    timer.unref?.();
    return () => {
      off();
      clearInterval(timer);
    };
  });
  return { refresh, snapshot: () => snapshot };
}
export {
  registerInterceptGuard
};
