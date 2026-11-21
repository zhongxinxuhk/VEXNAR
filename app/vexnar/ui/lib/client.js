window.__ModuleLoader__.load({ id: "@vexnar/dsh-ui", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  FindingCard: () => FindingCard,
  TrafficViewer: () => TrafficViewer,
  apply: () => apply,
  default: () => client_default,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var FINDING_TOOL = "mcp__vexnar__report_finding";
var TRAFFIC_TOOL = "mcp__vexnar__traffic_get";
var palette = {
  border: "var(--dsw-alias-border-secondary, #e5e7eb)",
  bg: "var(--dsw-alias-bg-secondary, #f8fafc)",
  text: "var(--dsw-alias-label-primary, #111827)",
  subtle: "var(--dsw-alias-label-secondary, #6b7280)",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace"
};
var cardStyle = {
  border: `1px solid ${palette.border}`,
  borderRadius: 10,
  background: palette.bg,
  padding: "10px 12px",
  margin: "6px 0",
  color: palette.text,
  font: '13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
};
var rowStyle = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
var chipStyle = {
  borderRadius: 999,
  padding: "1px 8px",
  fontSize: 11,
  fontWeight: 600,
  border: `1px solid ${palette.border}`,
  background: "#fff"
};
function textOf(block) {
  const content = block?.content ?? [];
  return content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n").trim();
}
function jsonOf(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
function severityColor(severity) {
  switch (String(severity ?? "").toLowerCase()) {
    case "critical":
      return "#b91c1c";
    case "high":
      return "#c2410c";
    case "medium":
      return "#a16207";
    case "low":
      return "#15803d";
    default:
      return palette.subtle;
  }
}
function LoadingCard({ label }) {
  return (0, import_react.createElement)("div", { style: cardStyle }, (0, import_react.createElement)("div", { style: { ...rowStyle, color: palette.subtle } }, label));
}
function FindingCard({ phase, block }) {
  if (phase !== "result") return (0, import_react.createElement)(LoadingCard, { label: "\u8BB0\u5F55\u6F0F\u6D1E\u2026" });
  const text = textOf(block);
  const data = jsonOf(text) ?? {};
  const severity = data.severity ?? data.Severity;
  const vulnclass = data.vulnclass ?? data.Vulnclass ?? data.category;
  const summary = data.summary ?? data.Summary;
  const findingId = data.finding_id ?? data.FindingID;
  const trafficCount = data.traffic_count ?? data.TrafficCount;
  const failed = block?.isError === true;
  return (0, import_react.createElement)(
    "div",
    { style: { ...cardStyle, borderColor: failed ? "#fca5a5" : palette.border } },
    (0, import_react.createElement)(
      "div",
      { style: rowStyle },
      (0, import_react.createElement)(
        "span",
        { style: { ...chipStyle, color: severityColor(severity), borderColor: severityColor(severity) } },
        String(severity ?? "finding")
      ),
      vulnclass ? (0, import_react.createElement)("strong", { style: { fontSize: 13 } }, String(vulnclass)) : null,
      findingId !== void 0 ? (0, import_react.createElement)("span", { style: { color: palette.subtle, fontSize: 12 } }, `#${String(findingId)}`) : null,
      trafficCount !== void 0 ? (0, import_react.createElement)("span", { style: { color: palette.subtle, fontSize: 12 } }, `\u8BC1\u636E\u6D41\u91CF ${String(trafficCount)} \u6761`) : null
    ),
    summary ? (0, import_react.createElement)("div", { style: { marginTop: 6 } }, String(summary)) : (0, import_react.createElement)(
      "pre",
      { style: { margin: "6px 0 0", fontFamily: palette.mono, fontSize: 12, whiteSpace: "pre-wrap" } },
      text.slice(0, 800) || "(\u7A7A)"
    ),
    failed ? (0, import_react.createElement)("div", { style: { marginTop: 6, color: "#b91c1c", fontSize: 12 } }, "\u4E0A\u62A5\u5931\u8D25\uFF0C\u89C1\u8F93\u51FA") : null
  );
}
function splitHttp(text) {
  const match = text.match(/\r?\n\r?\n/);
  if (match === null || match.index === void 0) return { head: text, body: "" };
  return { head: text.slice(0, match.index), body: text.slice(match.index + match[0].length) };
}
function TrafficViewer({ phase, block }) {
  const [tab, setTab] = (0, import_react.useState)("head");
  const [copied, setCopied] = (0, import_react.useState)(false);
  if (phase !== "result") return (0, import_react.createElement)(LoadingCard, { label: "\u8BFB\u53D6\u6D41\u91CF\u2026" });
  const text = textOf(block);
  const parts = splitHttp(text);
  const failed = block?.isError === true;
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };
  const tabButton = (id, label) => (0, import_react.createElement)(
    "button",
    {
      type: "button",
      onClick: () => setTab(id),
      style: {
        ...chipStyle,
        cursor: "pointer",
        background: tab === id ? palette.text : "#fff",
        color: tab === id ? "#fff" : palette.text
      }
    },
    label
  );
  return (0, import_react.createElement)(
    "div",
    { style: { ...cardStyle, borderColor: failed ? "#fca5a5" : palette.border } },
    (0, import_react.createElement)(
      "div",
      { style: rowStyle },
      (0, import_react.createElement)("strong", { style: { fontSize: 12 } }, "HTTP \u6D41\u91CF"),
      tabButton("head", "\u5934"),
      tabButton("body", "\u6B63\u6587"),
      (0, import_react.createElement)("span", { style: { color: palette.subtle, fontSize: 11 } }, `${new TextEncoder().encode(text).length} B`),
      (0, import_react.createElement)("button", {
        type: "button",
        onClick: copy,
        style: { ...chipStyle, cursor: "pointer", marginLeft: "auto" }
      }, copied ? "\u5DF2\u590D\u5236" : "\u590D\u5236")
    ),
    (0, import_react.createElement)(
      "pre",
      {
        style: {
          margin: "8px 0 0",
          padding: 8,
          maxHeight: 320,
          overflow: "auto",
          background: "#fff",
          border: `1px solid ${palette.border}`,
          borderRadius: 6,
          fontFamily: palette.mono,
          fontSize: 12,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all"
        }
      },
      (tab === "head" ? parts.head : parts.body) || "(\u7A7A)"
    )
  );
}
function apply(ctx) {
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({ name: "tool.call.toolview", key: FINDING_TOOL }, FindingCard));
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({ name: "tool.call.toolview", key: TRAFFIC_TOOL }, TrafficViewer));
}
var inject = ["slots"];
var client_default = { name: "@vexnar/dsh-ui", inject, apply };

return module.exports;
}});
