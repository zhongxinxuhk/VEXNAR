window.__ModuleLoader__.load({ id: "@vexnar/dsh-craft", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
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
  apply: () => apply,
  default: () => client_default,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
function CraftPanel() {
  const [state, setState] = (0, import_react.useState)({ data: null, error: "", loading: true });
  (0, import_react.useEffect)(() => {
    let alive = true;
    const base = (localStorage.getItem("vexnar.coreUrl") || "/vexnar-api").replace(/\/$/, "");
    const token = localStorage.getItem("vexnar.coreToken") || "";
    fetch(`${base}/api/craft/status`, { headers: token ? { "x-vexnar-token": token } : {} }).then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))).then((data2) => {
      if (alive) setState({ data: data2, error: "", loading: false });
    }).catch((error) => {
      if (alive) setState({ data: null, error: String(error?.message ?? error), loading: false });
    });
    return () => {
      alive = false;
    };
  }, []);
  const data = state.data;
  return (0, import_react.createElement)(
    "div",
    { style: { height: "100%", overflowY: "auto", padding: 24, font: "14px/1.6 system-ui, sans-serif" } },
    (0, import_react.createElement)("h2", { style: { margin: "0 0 4px" } }, "Craft Anything"),
    (0, import_react.createElement)("p", { style: { margin: "0 0 16px", opacity: 0.7 } }, "\u5185\u7F6E MCP \u5F15\u64CE\uFF08Essentials \u5DE5\u5177\u96C6\uFF09"),
    state.loading ? (0, import_react.createElement)("p", null, "\u8BFB\u53D6\u4E2D\u2026") : state.error ? (0, import_react.createElement)("p", null, `\u9519\u8BEF\uFF1A${state.error}`) : (0, import_react.createElement)(
      "div",
      null,
      (0, import_react.createElement)("p", null, `\u7248\u672C\uFF1A${data?.version || "\u672A\u5B89\u88C5"} \xB7 \u5DE5\u5177\uFF1A${data?.tools?.length ?? 0}`),
      (0, import_react.createElement)("p", { style: { opacity: 0.7, wordBreak: "break-all" } }, data?.path ?? ""),
      (0, import_react.createElement)("ul", null, (data?.tools ?? []).map((tool) => (0, import_react.createElement)("li", { key: tool }, (0, import_react.createElement)("code", null, tool))))
    )
  );
}
function CraftIcon({ size }) {
  return (0, import_react.createElement)(
    "svg",
    { width: size ?? 16, height: size ?? 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
    (0, import_react.createElement)("path", { d: "M4 7h16v12H4z" }),
    (0, import_react.createElement)("path", { d: "M8 7V4h8v3" })
  );
}
var name = "@vexnar/dsh-craft";
var inject = ["slots"];
function apply(ctx) {
  const { slots } = ctx;
  if (slots === void 0) return;
  slots.inject("main", () => slots.register({ name: "main", key: "vexnar-craft" }, CraftPanel));
  slots.inject("sidebar.panellist", () => slots.register({ name: "sidebar.panellist", id: "vexnar-craft", order: 99, label: () => "Craft" }, CraftIcon));
}
var client_default = { name, inject, apply };

return module.exports;
}});
