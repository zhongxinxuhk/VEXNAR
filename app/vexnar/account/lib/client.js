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
function AccountSection() {
  const { account, error, onError, update } = useAccount();
  const [available, setAvailable] = (0, import_react.useState)([]);
  const [login, setLogin] = (0, import_react.useState)({ state: "idle", message: "" });
  const [busy, setBusy] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    if (account?.signed_in !== false) return;
    void request("/methods").then((result) => setAvailable(result.methods), onError);
    void request("/login").then(setLogin, onError);
  }, [account?.signed_in]);
  (0, import_react.useEffect)(() => {
    if (login.state !== "waiting") return;
    const timer = window.setInterval(() => {
      void request("/login").then((next) => {
        setLogin(next);
        if (next.state === "done") void request("/account").then(update, onError);
      }, onError);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [login.state]);
  const logout = async () => {
    setBusy(true);
    try {
      update(await request("/account", "DELETE"));
      setLogin({ state: "idle", message: "" });
    } catch (error2) {
      onError(error2);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_react.createElement)("div", { style: panel }, /* @__PURE__ */ (0, import_react.createElement)("strong", null, "HXSEC AI Platform"), account?.signed_in ? /* @__PURE__ */ (0, import_react.createElement)(import_react.Fragment, null, /* @__PURE__ */ (0, import_react.createElement)("span", null, "\u5DF2\u767B\u5F55 ", account.username), /* @__PURE__ */ (0, import_react.createElement)("button", { type: "button", style: button, disabled: busy, onClick: () => void logout() }, "\u9000\u51FA\u767B\u5F55")) : /* @__PURE__ */ (0, import_react.createElement)(import_react.Fragment, null, /* @__PURE__ */ (0, import_react.createElement)("span", null, "\u5728\u5E73\u53F0\u9875\u9762\u5B8C\u6210\u767B\u5F55\u548C\u4E8C\u6B21\u9A8C\u8BC1\u3002"), available.length > 0 && /* @__PURE__ */ (0, import_react.createElement)("span", null, available.join(" \xB7 ")), /* @__PURE__ */ (0, import_react.createElement)("button", { type: "button", style: button, disabled: !account || busy || login.state === "waiting", onClick: () => {
    setBusy(true);
    void request("/login", "POST").then(setLogin, onError).finally(() => setBusy(false));
  } }, "\u767B\u5F55 VEXNAR"), login.state !== "done" && login.message && /* @__PURE__ */ (0, import_react.createElement)("span", { role: "status" }, login.message)), error && /* @__PURE__ */ (0, import_react.createElement)("span", { role: "alert", style: { color: "var(--dsw-alias-label-danger, #b91c1c)" } }, error), /* @__PURE__ */ (0, import_react.createElement)("div", { style: { display: "flex", gap: 16 } }, /* @__PURE__ */ (0, import_react.createElement)("a", { href: platform, target: "_blank", rel: "noreferrer" }, "\u5E73\u53F0\u4E3B\u9875"), /* @__PURE__ */ (0, import_react.createElement)("a", { href: docs, target: "_blank", rel: "noreferrer" }, "API \u6587\u6863")));
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
  if (!account?.signed_in) return /* @__PURE__ */ (0, import_react.createElement)("div", { style: panel }, /* @__PURE__ */ (0, import_react.createElement)("span", null, account ? "\u8BF7\u5148\u5728\u300C\u8D26\u6237\u300D\u4E2D\u767B\u5F55 VEXNAR\uFF0C\u518D\u6DFB\u52A0\u6A21\u578B API\u3002" : "\u6B63\u5728\u8BFB\u53D6\u8D26\u53F7\u72B6\u6001\u2026"), error && /* @__PURE__ */ (0, import_react.createElement)("span", { role: "alert" }, error));
  const deepseek = account.providers.some((provider) => provider.id === "deepseek");
  const hxsec = account.providers.some((provider) => provider.id === "vexnar");
  return /* @__PURE__ */ (0, import_react.createElement)("div", { style: panel }, account.providers.map((provider) => /* @__PURE__ */ (0, import_react.createElement)("div", { key: provider.id, style: { display: "flex", gap: 12, alignItems: "center" } }, /* @__PURE__ */ (0, import_react.createElement)("strong", null, provider.name), /* @__PURE__ */ (0, import_react.createElement)("span", null, provider.models.length, " \u4E2A\u6A21\u578B"), provider.id !== "vexnar" && /* @__PURE__ */ (0, import_react.createElement)("button", { type: "button", style: button, disabled: busy, onClick: () => {
    setBusy(true);
    void request("/providers", "DELETE", { id: provider.id }).then(update, onError).finally(() => setBusy(false));
  } }, "\u79FB\u9664"))), !hxsec && /* @__PURE__ */ (0, import_react.createElement)("span", null, "\u5E73\u53F0\u5C1A\u672A\u5173\u8054\u53EF\u7528\u7684\u6A21\u578B\u5BC6\u94A5\u3002\u53EF\u4EE5\u4ECE\u5E73\u53F0\u521B\u5EFA API Key \u540E\u5728\u8FD9\u91CC\u5173\u8054\u3002"), /* @__PURE__ */ (0, import_react.createElement)("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } }, !hxsec && /* @__PURE__ */ (0, import_react.createElement)("button", { type: "button", style: button, disabled: busy, onClick: () => select("platform") }, "\u5173\u8054\u5E73\u53F0 API Key"), /* @__PURE__ */ (0, import_react.createElement)("button", { type: "button", style: button, disabled: busy, onClick: () => select("deepseek") }, deepseek ? "\u66F4\u65B0 DeepSeek API Key" : "\u6DFB\u52A0 DeepSeek API Key"), /* @__PURE__ */ (0, import_react.createElement)("button", { type: "button", style: button, disabled: busy, onClick: () => select("custom") }, "\u5BFC\u5165\u81EA\u5B9A\u4E49 API")), kind && /* @__PURE__ */ (0, import_react.createElement)("form", { onSubmit: (event) => void save(event), style: { display: "grid", gap: 8 } }, kind === "custom" && /* @__PURE__ */ (0, import_react.createElement)(import_react.Fragment, null, /* @__PURE__ */ (0, import_react.createElement)("label", { style: field }, "\u63D0\u4F9B\u65B9\u540D\u79F0", /* @__PURE__ */ (0, import_react.createElement)("input", { style: input, value: name, required: true, onChange: (event) => setName(event.target.value) })), /* @__PURE__ */ (0, import_react.createElement)("label", { style: field }, "OpenAI \u517C\u5BB9 API \u6839\u5730\u5740", /* @__PURE__ */ (0, import_react.createElement)("input", { style: input, type: "url", value: baseURL, placeholder: "https://api.example.com/v1", required: true, onChange: (event) => setBaseURL(event.target.value) }))), /* @__PURE__ */ (0, import_react.createElement)("label", { style: field }, kind === "deepseek" ? "DeepSeek API Key" : "API Key", /* @__PURE__ */ (0, import_react.createElement)("input", { style: input, type: "password", autoComplete: "off", value: key, required: true, onChange: (event) => setKey(event.target.value) })), /* @__PURE__ */ (0, import_react.createElement)("button", { type: "submit", style: button, disabled: busy || !key.trim() }, busy ? "\u6B63\u5728\u9A8C\u8BC1\u2026" : "\u9A8C\u8BC1\u5E76\u6DFB\u52A0")), error && /* @__PURE__ */ (0, import_react.createElement)("span", { role: "alert", style: { color: "var(--dsw-alias-label-danger, #b91c1c)" } }, error));
}
function apply(ctx) {
  ctx.slots.inject("settings.section", () => {
    ctx.slots.register({ name: "settings.section", id: "vexnar-account", label: "\u8D26\u6237", order: -100 }, AccountSection);
    return ctx.slots.register({ name: "settings.section", id: "models", label: "\u6A21\u578B", order: 10 }, ModelsSection);
  });
}
var inject = ["slots"];
var client_default = { name: "@vexnar/dsh-account", inject, apply };

return module.exports;
}});
