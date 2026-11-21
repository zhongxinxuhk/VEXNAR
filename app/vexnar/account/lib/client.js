window.__ModuleLoader__.load({ id: "@vexnar/dsh-account", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
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
  AccountSection: () => AccountSection,
  ModelsSection: () => ModelsSection,
  apply: () => apply,
  default: () => client_default,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var api = "/vexnar-api/platform";
var platform = "https://platform.sec.hn.cn";
var docs = "https://docs.sec.hn.cn/";
var accountEvent = "vexnar:platform-account";
var panel = {
  border: "1px solid var(--dsw-alias-border-secondary, #e5e7eb)",
  borderRadius: 10,
  padding: 16,
  display: "grid",
  gap: 12
};
var field = { display: "grid", gap: 4 };
var input = {
  border: "1px solid var(--dsw-alias-border-secondary, #d1d5db)",
  borderRadius: 6,
  padding: "6px 8px",
  font: "inherit",
  color: "inherit",
  background: "transparent"
};
var button = {
  ...input,
  padding: "5px 12px",
  justifySelf: "start",
  cursor: "pointer"
};
async function request(path, method = "GET", body) {
  const response = await fetch(api + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...body === void 0 ? {} : { body: JSON.stringify(body) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
function useAccount() {
  const [account, setAccount] = (0, import_react.useState)();
  const [error, setError] = (0, import_react.useState)("");
  const onError = (reason) => setError(reason instanceof Error ? reason.message : String(reason));
  const refresh = () => void request("/account").then(setAccount, onError);
  const update = (account2) => {
    setAccount(account2);
    setError("");
    window.dispatchEvent(new Event(accountEvent));
  };
  (0, import_react.useEffect)(() => {
    refresh();
    window.addEventListener(accountEvent, refresh);
    return () => window.removeEventListener(accountEvent, refresh);
  }, []);
  return { account, error, onError, update };
}
var profileHeader = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 16,
  padding: "22px 20px",
  borderRadius: 14,
  background: "linear-gradient(110deg, #102e37, #164951)",
  color: "#f2fffb"
};
var avatar = {
  display: "grid",
  placeItems: "center",
  width: 54,
  height: 54,
  borderRadius: 15,
  background: "#c4ebdf",
  color: "#163d42",
  fontSize: 20,
  fontWeight: 700
};
var stats = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))",
  gap: 8,
  margin: 0,
  padding: 0
};
var stat = {
  ...panel,
  gap: 4,
  padding: "11px 12px",
  background: "var(--dsw-alias-surface-secondary, transparent)"
};
function AccountSection() {
  const { account, error, onError } = useAccount();
  const [busy, setBusy] = (0, import_react.useState)(false);
  const logout = async () => {
    setBusy(true);
    try {
      await request("/account", "DELETE");
      window.location.replace("/");
    } catch (error2) {
      onError(error2);
    } finally {
      setBusy(false);
    }
  };
  if (!account?.ready) return /* @__PURE__ */ (0, import_react.createElement)("div", { style: panel, role: "status" }, error || "\u6B63\u5728\u8BFB\u53D6 VEXNAR \u4E2A\u4EBA\u8D44\u6599\u2026");
  const provider = account.providers.find((item) => item.id === "vexnar");
  const modelCount = provider?.models.length ?? 0;
  const displayName = account.display_name || account.username;
  const values = [
    { name: "\u5E73\u53F0\u6A21\u578B", value: modelCount.toLocaleString("zh-CN") },
    { name: "\u6A21\u578B\u534F\u8BAE", value: "Responses" },
    { name: "\u5E73\u53F0\u8BBF\u95EE\u4EE4\u724C", value: account.access_token_ready ? "\u5DF2\u914D\u7F6E" : "\u672A\u914D\u7F6E" },
    ...typeof account.request_count === "number" ? [{ name: "\u5E73\u53F0\u7D2F\u8BA1\u8BF7\u6C42", value: account.request_count.toLocaleString("zh-CN") }] : []
  ];
  return /* @__PURE__ */ (0, import_react.createElement)("div", { style: { display: "grid", gap: 14 } }, /* @__PURE__ */ (0, import_react.createElement)("div", { style: profileHeader }, /* @__PURE__ */ (0, import_react.createElement)("span", { style: avatar, "aria-hidden": "true" }, Array.from(displayName).slice(0, 2).join("").toUpperCase()), /* @__PURE__ */ (0, import_react.createElement)("div", { style: { flex: "1 1 170px", minWidth: 0, overflowWrap: "anywhere" } }, /* @__PURE__ */ (0, import_react.createElement)("h2", { style: { margin: 0, fontSize: 23 } }, displayName), /* @__PURE__ */ (0, import_react.createElement)("span", { style: { color: "#c6ded9" } }, "@", account.username)), /* @__PURE__ */ (0, import_react.createElement)("a", { href: platform + "/profile", target: "_blank", rel: "noreferrer", style: { ...button, color: "inherit" } }, "\u7BA1\u7406\u5E73\u53F0\u8D26\u6237")), /* @__PURE__ */ (0, import_react.createElement)("dl", { style: stats }, values.map(({ name, value }) => /* @__PURE__ */ (0, import_react.createElement)("div", { key: name, style: stat }, /* @__PURE__ */ (0, import_react.createElement)("dt", { style: { fontSize: 12 } }, name), /* @__PURE__ */ (0, import_react.createElement)("dd", { style: { margin: 0, fontSize: 17, fontWeight: 650 } }, value)))), /* @__PURE__ */ (0, import_react.createElement)("div", { style: panel }, /* @__PURE__ */ (0, import_react.createElement)("strong", null, "HXSEC AI Platform"), /* @__PURE__ */ (0, import_react.createElement)("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" } }, /* @__PURE__ */ (0, import_react.createElement)("code", null, "https://api.sec.hn.cn/v1"), /* @__PURE__ */ (0, import_react.createElement)("a", { href: docs, target: "_blank", rel: "noreferrer" }, "API \u6587\u6863")), /* @__PURE__ */ (0, import_react.createElement)("details", null, /* @__PURE__ */ (0, import_react.createElement)("summary", null, "\u67E5\u770B\u53EF\u7528\u6A21\u578B\uFF08", modelCount, "\uFF09"), /* @__PURE__ */ (0, import_react.createElement)("ul", { style: { maxHeight: 190, overflow: "auto", margin: "8px 0 0", paddingInlineStart: 20 } }, provider?.models.map((model) => /* @__PURE__ */ (0, import_react.createElement)("li", { key: model.id }, model.name || model.id))))), /* @__PURE__ */ (0, import_react.createElement)("button", { type: "button", style: button, disabled: busy, onClick: () => void logout() }, "\u9000\u51FA\u767B\u5F55"), error && /* @__PURE__ */ (0, import_react.createElement)("span", { role: "alert", style: { color: "var(--dsw-alias-label-danger, #b91c1c)" } }, error));
}
function ModelsSection() {
  const { account, error, onError, update } = useAccount();
  const [kind, setKind] = (0, import_react.useState)();
  const [key, setKey] = (0, import_react.useState)("");
  const [name, setName] = (0, import_react.useState)("");
  const [baseURL, setBaseURL] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const select = (kind2) => {
    setKey("");
    setKind(kind2);
  };
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      update(await request("/providers", "POST", { kind, name, base_url: baseURL, api_key: key }));
      setKey("");
      setKind(void 0);
    } catch (error2) {
      onError(error2);
    } finally {
      setBusy(false);
    }
  };
  if (!account?.signed_in) return /* @__PURE__ */ (0, import_react.createElement)("div", { style: panel }, /* @__PURE__ */ (0, import_react.createElement)("span", null, account ? "\u8BF7\u5148\u767B\u5F55 VEXNAR\uFF0C\u518D\u6DFB\u52A0\u6A21\u578B API\u3002" : "\u6B63\u5728\u8BFB\u53D6\u8D26\u53F7\u72B6\u6001\u2026"), error && /* @__PURE__ */ (0, import_react.createElement)("span", { role: "alert" }, error));
  const deepseek = account.providers.some((provider) => provider.id === "deepseek");
  return /* @__PURE__ */ (0, import_react.createElement)("div", { style: panel }, account.providers.map((provider) => /* @__PURE__ */ (0, import_react.createElement)("div", { key: provider.id, style: { display: "grid", gap: 6 } }, /* @__PURE__ */ (0, import_react.createElement)("div", { style: { display: "flex", gap: 12, alignItems: "center" } }, /* @__PURE__ */ (0, import_react.createElement)("strong", null, provider.name), /* @__PURE__ */ (0, import_react.createElement)("span", null, provider.models.length, " \u4E2A\u6A21\u578B"), provider.id !== "vexnar" && /* @__PURE__ */ (0, import_react.createElement)("button", { type: "button", style: button, disabled: busy, onClick: () => {
    setBusy(true);
    void request("/providers", "DELETE", { id: provider.id }).then(update, onError).finally(() => setBusy(false));
  } }, "\u79FB\u9664")), /* @__PURE__ */ (0, import_react.createElement)("details", null, /* @__PURE__ */ (0, import_react.createElement)("summary", { style: { cursor: "pointer" } }, "\u67E5\u770B\u6A21\u578B"), /* @__PURE__ */ (0, import_react.createElement)("ul", { style: { maxHeight: 160, overflow: "auto", margin: "6px 0 0", paddingInlineStart: 20 } }, provider.models.map((model) => /* @__PURE__ */ (0, import_react.createElement)("li", { key: model.id }, model.name || model.id)))))), /* @__PURE__ */ (0, import_react.createElement)("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ (0, import_react.createElement)("button", { type: "button", style: button, disabled: busy, onClick: () => select("deepseek") }, deepseek ? "\u66F4\u65B0 DeepSeek API Key" : "\u6DFB\u52A0 DeepSeek API Key"), /* @__PURE__ */ (0, import_react.createElement)("button", { type: "button", style: button, disabled: busy, onClick: () => select("custom") }, "\u5BFC\u5165\u81EA\u5B9A\u4E49 API")), /* @__PURE__ */ (0, import_react.createElement)("span", { style: { color: "#8a8f99", fontSize: 12 } }, "Key \u53EA\u5B58\u5728\u672C\u673A\u51ED\u636E\u5E93\uFF0C\u6A21\u578B\u8BF7\u6C42\u7531\u5BA2\u6237\u7AEF\u76F4\u63A5\u53D1\u5F80\u5BF9\u5E94\u4E0A\u6E38\uFF0C\u4E0D\u7ECF\u8FC7 VEXNAR \u670D\u52A1\u7AEF\u3002"), !account.ready && /* @__PURE__ */ (0, import_react.createElement)("span", { role: "alert", style: { color: "var(--dsw-alias-label-danger, #b91c1c)" } }, "\u5E73\u53F0\u6CA1\u6709\u7B7E\u53D1\u53EF\u7528\u7684\u6A21\u578B\u51ED\u636E\u3002\u8BF7\u9000\u51FA\u767B\u5F55\u540E\u91CD\u65B0\u767B\u5F55\uFF0C\u6216\u5148\u6DFB\u52A0\u81EA\u5DF1\u7684 API Key\u3002"), kind && /* @__PURE__ */ (0, import_react.createElement)("form", { onSubmit: (event) => void save(event), style: { display: "grid", gap: 8 } }, kind === "custom" && /* @__PURE__ */ (0, import_react.createElement)(import_react.Fragment, null, /* @__PURE__ */ (0, import_react.createElement)("label", { style: field }, "\u63D0\u4F9B\u65B9\u540D\u79F0", /* @__PURE__ */ (0, import_react.createElement)("input", { style: input, value: name, required: true, onChange: (event) => setName(event.target.value) })), /* @__PURE__ */ (0, import_react.createElement)("label", { style: field }, "OpenAI \u517C\u5BB9 API \u6839\u5730\u5740", /* @__PURE__ */ (0, import_react.createElement)("input", { style: input, type: "url", value: baseURL, placeholder: "https://api.example.com/v1", required: true, onChange: (event) => setBaseURL(event.target.value) }))), /* @__PURE__ */ (0, import_react.createElement)("label", { style: field }, kind === "deepseek" ? "DeepSeek API Key" : "API Key", /* @__PURE__ */ (0, import_react.createElement)("input", { style: input, type: "password", autoComplete: "off", value: key, required: true, onChange: (event) => setKey(event.target.value) })), /* @__PURE__ */ (0, import_react.createElement)("button", { type: "submit", style: button, disabled: busy || !key.trim() }, busy ? "\u6B63\u5728\u9A8C\u8BC1\u2026" : "\u9A8C\u8BC1\u5E76\u6DFB\u52A0")), error && /* @__PURE__ */ (0, import_react.createElement)("span", { role: "alert", style: { color: "var(--dsw-alias-label-danger, #b91c1c)" } }, error));
}
function apply(ctx) {
  ctx.slots.inject("settings.section", () => {
    ctx.slots.register({ name: "settings.section", id: "vexnar-account", label: "\u4E2A\u4EBA\u8D44\u6599", order: -100 }, AccountSection);
    return ctx.slots.register({ name: "settings.section", id: "models", label: "\u6A21\u578B", order: 10 }, ModelsSection);
  });
}
var inject = ["slots"];
var client_default = { name: "@vexnar/dsh-account", inject, apply };

return module.exports;
}});
