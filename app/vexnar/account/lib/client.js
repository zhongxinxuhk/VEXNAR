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
var field = { display: "grid", gap: 4, marginBottom: 10 };
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
var chip = {
  fontSize: 11,
  padding: "1px 8px",
  borderRadius: 999,
  border: "1px solid var(--dsw-alias-border-secondary, #d1d5db)"
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
  const [methods, setMethods] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [browser, setBrowser] = (0, import_react.useState)({ state: "idle", message: "" });
  const [manual, setManual] = (0, import_react.useState)(false);
  const [form, setForm] = (0, import_react.useState)({ username: "", password: "", base_url: "", api_key: "", model: "", provider: "openai-responses" });
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
    void jsonFetch("/vexnar-account/methods").then(setMethods).catch((err) => setError(String(err.message)));
  }, []);
  (0, import_react.useEffect)(() => {
    if (browser.state !== "starting" && browser.state !== "waiting") return;
    const timer = window.setInterval(() => {
      void jsonFetch("/vexnar-account/login/browser/status").then((next) => {
        setBrowser(next);
        if (next.state === "done") void refresh();
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [browser.state]);
  const passwordLogin = async () => {
    setBusy(true);
    try {
      await jsonFetch("/vexnar-account/login/password", {
        method: "POST",
        body: JSON.stringify({ username: form.username.trim(), password: form.password })
      });
      await refresh();
      setError("");
    } catch (err) {
      setError(String(err.message));
    } finally {
      setBusy(false);
    }
  };
  const browserLogin = async () => {
    try {
      setBrowser(await jsonFetch("/vexnar-account/login/browser", { method: "POST" }));
    } catch (err) {
      setError(String(err.message));
    }
  };
  const manualLogin = async () => {
    setBusy(true);
    try {
      await jsonFetch("/vexnar-account/login", {
        method: "POST",
        body: JSON.stringify({
          base_url: form.base_url.trim(),
          api_key: form.api_key.trim(),
          model: form.model.trim(),
          provider: form.provider
        })
      });
      await refresh();
      setError("");
    } catch (err) {
      setError(String(err.message));
    } finally {
      setBusy(false);
    }
  };
  const configured = status?.configured === true || status?.key_set === true;
  const oauth = methods?.oauth ?? [];
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
            ...chip,
            color: configured ? "#15803d" : "#a16207"
          }
        }, configured ? "\u5DF2\u8FDE\u63A5" : "\u672A\u767B\u5F55"),
        (0, import_react.createElement)("button", { type: "button", style: { ...button, marginLeft: "auto" }, onClick: () => void refresh() }, "\u5237\u65B0")
      ),
      (0, import_react.createElement)(
        "div",
        { style: { marginTop: 8, color: "var(--dsw-alias-label-secondary, #6b7280)" } },
        configured ? `${status?.provider ?? ""} \xB7 ${status?.model ?? ""}${status?.base_url ? ` \xB7 ${status.base_url}` : ""}` : methods?.base ? `\u767B\u5F55\u5230 ${methods.base}` : "\u8BFB\u53D6 NewAPI \u767B\u5F55\u65B9\u5F0F\u2026"
      ),
      error ? (0, import_react.createElement)("div", { style: { marginTop: 8, color: "#b91c1c" } }, error) : null
    ),
    (0, import_react.createElement)(
      "div",
      { style: box },
      (0, import_react.createElement)("div", { style: { marginBottom: 8, fontWeight: 600 } }, "\u767B\u5F55\u65B9\u5F0F"),
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 } },
        methods?.password ? (0, import_react.createElement)("span", { style: chip }, "\u5BC6\u7801") : null,
        methods?.passkey ? (0, import_react.createElement)("span", { style: chip }, "Passkey") : null,
        methods?.emailVerification ? (0, import_react.createElement)("span", { style: chip }, "\u90AE\u7BB1\u9A8C\u8BC1\u7801") : null,
        ...oauth.map((provider) => (0, import_react.createElement)("span", { key: provider.slug, style: chip }, provider.name)),
        methods?.turnstile ? (0, import_react.createElement)("span", { style: { ...chip, color: "#a16207" } }, "Turnstile \u5DF2\u5F00\u542F") : null
      ),
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
        (0, import_react.createElement)("button", { type: "button", style: button, onClick: () => void browserLogin() }, "\u6253\u5F00\u6D4F\u89C8\u5668\u767B\u5F55\uFF08\u652F\u6301\u5168\u90E8\u65B9\u5F0F\uFF09"),
        methods?.password && !methods?.turnstile ? (0, import_react.createElement)("button", { type: "button", style: button, onClick: () => setManual(!manual) }, manual ? "\u6536\u8D77\u5BC6\u7801\u767B\u5F55" : "\u5BC6\u7801\u767B\u5F55") : null
      ),
      browser.state !== "idle" ? (0, import_react.createElement)("div", {
        style: {
          marginTop: 10,
          color: browser.state === "error" ? "#b91c1c" : "var(--dsw-alias-label-secondary, #6b7280)"
        }
      }, `${browser.message}${browser.user ? `\uFF08${browser.user}\uFF09` : ""}`) : null,
      manual && methods?.password ? (0, import_react.createElement)(
        "div",
        { style: { marginTop: 12, display: "grid", gap: 8 } },
        (0, import_react.createElement)(
          "label",
          { style: field },
          "\u7528\u6237\u540D / \u90AE\u7BB1",
          (0, import_react.createElement)("input", {
            style: input,
            value: form.username,
            onChange: (event) => setForm({ ...form, username: event.target.value })
          })
        ),
        (0, import_react.createElement)(
          "label",
          { style: field },
          "\u5BC6\u7801",
          (0, import_react.createElement)("input", {
            style: input,
            type: "password",
            value: form.password,
            onChange: (event) => setForm({ ...form, password: event.target.value })
          })
        ),
        (0, import_react.createElement)("button", {
          type: "button",
          style: button,
          disabled: busy || form.username.trim() === "" || form.password === "",
          onClick: () => void passwordLogin()
        }, busy ? "\u767B\u5F55\u4E2D\u2026" : "\u767B\u5F55")
      ) : null
    ),
    (0, import_react.createElement)(
      "div",
      { style: box },
      (0, import_react.createElement)("div", { style: { marginBottom: 8, fontWeight: 600 } }, "\u624B\u52A8\u914D\u7F6E API Key"),
      (0, import_react.createElement)(
        "div",
        { style: { color: "var(--dsw-alias-label-secondary, #6b7280)", marginBottom: 8 } },
        "\u9002\u7528\u4E8E\u5173\u95ED\u4E86\u7F51\u9875\u767B\u5F55\u7684\u90E8\u7F72\uFF1B\u51ED\u636E\u76F4\u63A5\u5199\u5165 Go \u8FDB\u7A0B\u3002"
      ),
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
          value: form.model,
          onChange: (event) => setForm({ ...form, model: event.target.value })
        })
      ),
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", gap: 8 } },
        (0, import_react.createElement)("button", {
          type: "button",
          style: button,
          disabled: busy || form.base_url.trim() === "" || form.model.trim() === "",
          onClick: () => void manualLogin()
        }, "\u4FDD\u5B58\u5E76\u8FDE\u63A5"),
        configured ? (0, import_react.createElement)("button", {
          type: "button",
          style: button,
          onClick: () => void jsonFetch("/vexnar-account/logout", { method: "POST" }).then(refresh).catch((err) => setError(String(err.message)))
        }, "\u6E05\u9664\u51ED\u636E") : null
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
