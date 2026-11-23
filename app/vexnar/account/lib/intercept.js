const DEFAULT_INTERCEPT_TOOLS = [
  "Bash",
  "WebFetch",
  "web_search",
  "shell_open",
  "shell_send",
  "Write",
  "Edit",
  "MultiEdit"
];
const TOOL_ALIASES = {
  bash: ["bash", "shell"],
  write: ["write"],
  edit: ["edit", "multiedit", "apply_patch", "str_replace_editor"],
  multiedit: ["multiedit", "edit", "apply_patch"],
  webfetch: ["webfetch", "web_fetch"],
  web_fetch: ["web_fetch", "webfetch"],
  web_search: ["web_search"],
  shell_open: ["shell_open", "terminal_open"],
  shell_send: ["shell_send", "terminal_send"],
  shell_read: ["shell_read", "terminal_read"],
  shell_close: ["shell_close", "terminal_close"],
  shell_list: ["shell_list", "terminal_list"],
  terminal_open: ["terminal_open", "shell_open"],
  terminal_send: ["terminal_send", "shell_send"],
  terminal_read: ["terminal_read", "shell_read"],
  terminal_close: ["terminal_close", "shell_close"],
  terminal_list: ["terminal_list", "shell_list"]
};
function toolAliases(name) {
  const key = name.trim().toLowerCase();
  return [.../* @__PURE__ */ new Set([key, ...TOOL_ALIASES[key] ?? []])];
}
function isToolInScope(tools, name) {
  if (tools.length === 0) return false;
  const aliases = new Set(toolAliases(name));
  return tools.some((candidate) => aliases.has(candidate.trim().toLowerCase()));
}
function compileRule(rule) {
  if (!rule.enabled) return void 0;
  if (rule.match_type !== "regex") return { ...rule };
  let pattern = rule.pattern;
  let flags = "u";
  const global = /^\(\?([ims]+)\)/.exec(pattern);
  if (global) {
    for (const flag of global[1] ?? "") if (!flags.includes(flag)) flags += flag;
    pattern = pattern.slice(global[0].length);
  }
  const neutral = pattern.replace(/\(\?[imsUx-]+\)/g, "").replace(/\(\?[imsUx-]+:/g, "(?:");
  try {
    return { ...rule, regex: new RegExp(neutral, flags) };
  } catch {
    return void 0;
  }
}
function compileRules(rules) {
  return rules.map(compileRule).filter((rule) => rule !== void 0).sort((a, b) => b.priority - a.priority || a.id - b.id);
}
function defaultMessage(action, name) {
  if (action === "deny") return `\u62E6\u622A\u89C4\u5219 [${name}] \u7981\u6B62\u6267\u884C\u6B64\u5DE5\u5177`;
  if (action === "ask") return `\u62E6\u622A\u89C4\u5219 [${name}] \u8981\u6C42\u7528\u6237\u5BA1\u6279`;
  return "";
}
function matches(rule, toolName, input) {
  const subject = rule.match_target === "tool_name" ? toolName : input;
  if (rule.match_target !== "tool_name" && rule.match_target !== "tool_input") return false;
  if (rule.match_type === "regex") return rule.regex !== void 0 && rule.regex.test(subject);
  return subject.includes(rule.pattern);
}
function decide(rules, tools, toolName, args) {
  if (!isToolInScope(tools, toolName)) return { kind: "pass" };
  const input = typeof args === "string" ? args : JSON.stringify(args ?? {});
  for (const rule of rules) {
    if (!matches(rule, toolName, input)) continue;
    if (rule.action === "allow") return { kind: "allow", rule };
    const message = rule.message.trim() !== "" ? rule.message : defaultMessage(rule.action, rule.name);
    return rule.action === "deny" ? { kind: "deny", rule, message } : { kind: "ask", rule, message };
  }
  return { kind: "pass" };
}
function ruleOf(row) {
  const num = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    id: num(row.id),
    name: String(row.name ?? ""),
    enabled: row.enabled !== false,
    priority: num(row.priority),
    match_target: row.match_target === "tool_name" ? "tool_name" : "tool_input",
    match_type: row.match_type === "regex" ? "regex" : "string",
    pattern: String(row.pattern ?? ""),
    action: row.action === "allow" ? "allow" : row.action === "ask" ? "ask" : "deny",
    message: String(row.message ?? ""),
    timeout_enabled: row.timeout_enabled === true,
    timeout_seconds: num(row.timeout_seconds),
    timeout_action: row.timeout_action === "allow" ? "allow" : "deny"
  };
}
function emptySnapshot() {
  return { rules: [], tools: [...DEFAULT_INTERCEPT_TOOLS], loadedAt: 0 };
}
export {
  DEFAULT_INTERCEPT_TOOLS,
  compileRule,
  compileRules,
  decide,
  defaultMessage,
  emptySnapshot,
  isToolInScope,
  ruleOf,
  toolAliases
};
