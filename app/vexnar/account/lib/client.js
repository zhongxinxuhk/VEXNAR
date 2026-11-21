window.__ModuleLoader__.load({ id: "@vexnar/dsh-account", factory: (require) => {
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
  AccountSection: () => AccountSection,
  apply: () => apply,
  default: () => client_default,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var box = {
  border: "1px solid var(--dsw-alias-border-secondary, #e5e7eb)",
  borderRadius: 10,
  padding: 14,
  color: "var(--dsw-alias-label-primary, #111827)",
  font: '13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
};
var field = {
  display: "grid",
  gap: 4,
  marginBottom: 10
};
var input = {
  border: "1px solid var(--dsw-alias-border-secondary, #d1d5db)",
  borderRadius: 6,
  padding: "6px 8px",
  font: "inherit",
  color: "inherit",
  background: "transparent"
};
var button = {
  border: "1px solid var(--dsw-alias-border-secondary, #d1d5db)",
  borderRadius: 6,
  padding: "5px 12px",
  font: "inherit",
  cursor: "pointer",
  background: "transparent",
  color: "inherit"
};
async function jsonFetch(path, init) {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers || {} }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}
function AccountSection() {
  const [status, setStatus] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)("");
  const [form, setForm] = (0, import_react.useState)({ base_url: "", api_key: "", model: "", provider: "openai-responses" });
  const refresh = async () => {
    try {
      setStatus(await jsonFetch("/vexnar-account/status"));
      setError("");
    } catch (err) {
      setError(String(err.message));
    }
  };
  (0, import_react.useEffect)(() => {
    void refresh();
  }, []);
  const login = async () => {
    setBusy(true);
    try {
      const payload = {
        base_url: form.base_url.trim(),
        api_key: form.api_key.trim(),
        model: form.model.trim(),
        provider: form.provider
      };
      const next = await jsonFetch("/vexnar-account/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setStatus(next);
      setError("");
    } catch (err) {
      setError(String(err.message));
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    setBusy(true);
    try {
      setStatus(await jsonFetch("/vexnar-account/logout", { method: "POST" }));
    } catch (err) {
      setError(String(err.message));
    } finally {
      setBusy(false);
    }
  };
  const configured = status?.configured === true || status?.has_key === true;
  return (0, import_react.createElement)(
    "div",
    { style: { display: "grid", gap: 14 } },
    (0, import_react.createElement)(
      "div",
      { style: box },
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 10 } },
        (0, import_react.createElement)("strong", null, "VEXNAR \u8D26\u6237"),
        (0, import_react.createElement)("span", {
          style: {
            fontSize: 11,
            padding: "1px 8px",
            borderRadius: 999,
            border: "1px solid currentColor",
            color: configured ? "#15803d" : "#a16207"
          }
        }, configured ? "\u5DF2\u8FDE\u63A5" : "\u672A\u914D\u7F6E"),
        (0, import_react.createElement)("button", { type: "button", style: { ...button, marginLeft: "auto" }, onClick: () => void refresh() }, "\u5237\u65B0")
      ),
      (0, import_react.createElement)(
        "div",
        { style: { marginTop: 8, color: "var(--dsw-alias-label-secondary, #6b7280)" } },
        configured ? `${status?.provider ?? ""} \xB7 ${status?.model ?? ""}${status?.base_url ? ` \xB7 ${status.base_url}` : ""}` : "\u6A21\u578B\u51ED\u636E\u4FDD\u5B58\u5728 Go \u8FDB\u7A0B\uFF1B\u8FD9\u91CC\u53EA\u505A\u767B\u5F55\u4E0E\u72B6\u6001\u5C55\u793A\u3002"
      ),
      error ? (0, import_react.createElement)("div", { style: { marginTop: 8, color: "#b91c1c" } }, error) : null
    ),
    (0, import_react.createElement)(
      "div",
      { style: box },
      (0, import_react.createElement)("div", { style: { marginBottom: 10, fontWeight: 600 } }, configured ? "\u66F4\u65B0\u8FDE\u63A5" : "\u767B\u5F55"),
      (0, import_react.createElement)(
        "label",
        { style: field },
        "API \u6839\u5730\u5740",
        (0, import_react.createElement)("input", {
          style: input,
          placeholder: "https://api.example.com/v1",
          value: form.base_url,
          onChange: (event) => setForm({ ...form, base_url: event.target.value })
        })
      ),
      (0, import_react.createElement)(
        "label",
        { style: field },
        "API Key",
        (0, import_react.createElement)("input", {
          style: input,
          type: "password",
          placeholder: "sk-...",
          value: form.api_key,
          onChange: (event) => setForm({ ...form, api_key: event.target.value })
        })
      ),
      (0, import_react.createElement)(
        "label",
        { style: field },
        "\u6A21\u578B ID",
        (0, import_react.createElement)("input", {
          style: input,
          placeholder: "deepsec-flash",
          value: form.model,
          onChange: (event) => setForm({ ...form, model: event.target.value })
        })
      ),
      (0, import_react.createElement)(
        "label",
        { style: field },
        "\u534F\u8BAE",
        (0, import_react.createElement)(
          "select",
          {
            style: input,
            value: form.provider,
            onChange: (event) => setForm({ ...form, provider: event.target.value })
          },
          (0, import_react.createElement)("option", { value: "openai-responses" }, "openai-responses\uFF08\u63A8\u8350\uFF09"),
          (0, import_react.createElement)("option", { value: "openai" }, "openai (chat/completions)")
        )
      ),
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", gap: 8 } },
        (0, import_react.createElement)("button", {
          type: "button",
          style: button,
          disabled: busy || form.base_url.trim() === "" || form.model.trim() === "",
          onClick: () => void login()
        }, busy ? "\u63D0\u4EA4\u4E2D\u2026" : "\u4FDD\u5B58\u5E76\u8FDE\u63A5"),
        configured ? (0, import_react.createElement)("button", { type: "button", style: button, disabled: busy, onClick: () => void logout() }, "\u6E05\u9664\u51ED\u636E") : null
      )
    )
  );
}
function apply(ctx) {
  ctx.slots.inject("settings.section", () => ctx.slots.register(
    { name: "settings.section", id: "vexnar-account", label: "\u8D26\u6237", order: 30 },
    AccountSection
  ));
}
var inject = ["slots"];
var client_default = { name: "@vexnar/dsh-account", inject, apply };

return module.exports;
}});
