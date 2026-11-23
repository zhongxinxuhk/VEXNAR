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
var import_react2 = require("react");

// src/billing-client.tsx
var import_react = require("react");
var errorText = (reason) => reason instanceof Error ? reason.message : String(reason);
function AppDialog({ title, onClose, children, busy = false, narrow = false }) {
  const dialog = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  return /* @__PURE__ */ (0, import_react.createElement)(
    "dialog",
    {
      ref: dialog,
      className: "vxa-payment-dialog",
      "data-narrow": narrow,
      "aria-label": title,
      onCancel: (event) => {
        if (busy) event.preventDefault();
      },
      onClose
    },
    /* @__PURE__ */ (0, import_react.createElement)("header", { className: "vxa-payment-head" }, /* @__PURE__ */ (0, import_react.createElement)("h2", null, title), /* @__PURE__ */ (0, import_react.createElement)(
      "button",
      {
        type: "button",
        className: "vxa-btn",
        "aria-label": `\u5173\u95ED${title}`,
        disabled: busy,
        onClick: () => {
          dialog.current?.close();
        }
      },
      "\u5173\u95ED"
    )),
    children
  );
}
function Loading({ children }) {
  return /* @__PURE__ */ (0, import_react.createElement)("div", { className: "vxa-payment-loading", role: "status" }, /* @__PURE__ */ (0, import_react.createElement)("span", { "aria-hidden": "true" }), children);
}
function sendToCashier(formTarget, checkout) {
  if (!checkout.fields) return;
  const form = document.createElement("form");
  form.method = "POST";
  form.action = checkout.url;
  form.target = formTarget;
  form.hidden = true;
  for (const [name, value] of Object.entries(checkout.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  try {
    HTMLFormElement.prototype.submit.call(form);
  } finally {
    form.remove();
  }
}
function Cashier({ order, requestID, request: request2, onPaid }) {
  const [loaded, setLoaded] = (0, import_react.useState)(false);
  const [status, setStatus] = (0, import_react.useState)("pending");
  const [delay, setDelay] = (0, import_react.useState)(false);
  const [checkingFailed, setCheckingFailed] = (0, import_react.useState)(false);
  const frame = (0, import_react.useRef)(null);
  const submitted = (0, import_react.useRef)(false);
  const name = `vexnar-payment-${requestID}`;
  (0, import_react.useEffect)(() => {
    if (!submitted.current && order.checkout.fields && frame.current) {
      submitted.current = true;
      sendToCashier(name, order.checkout);
    }
    const timer = window.setTimeout(() => setDelay(true), 8e3);
    return () => window.clearTimeout(timer);
  }, [name, order]);
  (0, import_react.useEffect)(() => {
    if (!order.canCheckStatus) return;
    let live = true;
    let timer = 0;
    const deadline = Date.now() + 10 * 6e4;
    const check = async () => {
      try {
        const result = await request2("/billing/status", "POST", { request_id: requestID });
        if (!live) return;
        setCheckingFailed(false);
        setStatus(result.status);
        if (result.status === "paid") onPaid();
        if (result.status !== "pending") return;
      } catch {
        if (live) setCheckingFailed(true);
      }
      if (live && Date.now() < deadline) timer = window.setTimeout(() => {
        void check();
      }, 4e3);
      else if (live) setCheckingFailed(true);
    };
    timer = window.setTimeout(() => {
      void check();
    }, 3e3);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [order, requestID, request2, onPaid]);
  if (status === "paid") return /* @__PURE__ */ (0, import_react.createElement)("p", { role: "status", className: "vxa-payment-success" }, "\u652F\u4ED8\u6210\u529F\uFF0C\u4F59\u989D\u5DF2\u5237\u65B0\u3002");
  if (status === "closed") return /* @__PURE__ */ (0, import_react.createElement)("p", { role: "status", className: "vxa-error" }, "\u8BA2\u5355\u5DF2\u5173\u95ED\uFF0C\u8BF7\u8FD4\u56DE\u91CD\u65B0\u9009\u62E9\u3002");
  return /* @__PURE__ */ (0, import_react.createElement)(import_react.Fragment, null, !loaded && /* @__PURE__ */ (0, import_react.createElement)(Loading, null, "\u6B63\u5728\u52A0\u8F7D\u652F\u4ED8\u6536\u94F6\u53F0\u2026"), /* @__PURE__ */ (0, import_react.createElement)(
    "iframe",
    {
      ref: frame,
      className: "vxa-payment-frame",
      name,
      title: "\u652F\u4ED8\u4E8C\u7EF4\u7801\u6216\u6536\u94F6\u53F0",
      sandbox: "allow-forms allow-scripts allow-same-origin",
      referrerPolicy: "no-referrer",
      src: order.checkout.fields ? "about:blank" : order.checkout.url,
      onLoad: () => {
        try {
          if (frame.current?.contentWindow?.location.href === "about:blank") return;
        } catch {
        }
        setLoaded(true);
      }
    }
  ), delay && /* @__PURE__ */ (0, import_react.createElement)("p", { className: "vxa-hint" }, "\u6536\u94F6\u53F0\u82E5\u4ECD\u7A7A\u767D\uFF0C\u652F\u4ED8\u6E20\u9053\u53EF\u80FD\u9650\u5236\u4E86\u5E94\u7528\u5185\u5C55\u793A\u3002"), checkingFailed ? /* @__PURE__ */ (0, import_react.createElement)("p", { role: "status", className: "vxa-hint" }, "\u6682\u672A\u786E\u8BA4\u4ED8\u6B3E\uFF0C\u8BF7\u6838\u5BF9\u6E20\u9053\u7ED3\u679C\uFF0C\u907F\u514D\u91CD\u590D\u4ED8\u6B3E\u3002") : order.canCheckStatus && /* @__PURE__ */ (0, import_react.createElement)("p", { role: "status", className: "vxa-hint" }, "\u7B49\u5F85\u4ED8\u6B3E\uFF0C\u5230\u8D26\u540E\u81EA\u52A8\u5237\u65B0\u3002"), !order.canCheckStatus && /* @__PURE__ */ (0, import_react.createElement)("button", { className: "vxa-btn", type: "button", onClick: onPaid }, "\u5237\u65B0\u4F59\u989D"));
}
function RechargeDialog({ provider, request: request2, onClose, onPaid }) {
  const [config, setConfig] = (0, import_react.useState)();
  const [mode, setMode] = (0, import_react.useState)("topup");
  const [method, setMethod] = (0, import_react.useState)("");
  const [amount, setAmount] = (0, import_react.useState)("");
  const [plan, setPlan] = (0, import_react.useState)(0);
  const [product, setProduct] = (0, import_react.useState)("");
  const [quote, setQuote] = (0, import_react.useState)();
  const [error, setError] = (0, import_react.useState)("");
  const [attempt, setAttempt] = (0, import_react.useState)(0);
  const [quoteRevision, setQuoteRevision] = (0, import_react.useState)(0);
  const [cashier, setCashier] = (0, import_react.useState)();
  const starting = (0, import_react.useRef)(false);
  (0, import_react.useEffect)(() => {
    if (provider !== "xilin") return;
    let active = true;
    setError("");
    void request2("/billing/options").then((next) => {
      if (!active) return;
      setConfig(next);
      const first = next.methods[0];
      setMethod(first?.id ?? "");
      setAmount(String(next.amounts.find((value) => value >= (first?.minimum ?? 1)) ?? first?.minimum ?? ""));
      setProduct(first?.products?.[0]?.id ?? "");
      setPlan(next.plans[0]?.id ?? 0);
    }, (reason) => {
      if (active) setError(errorText(reason));
    });
    return () => {
      active = false;
    };
  }, [attempt, provider, request2]);
  const channels = config?.methods.filter((channel2) => mode === "topup" || channel2.subscriptions) ?? [];
  const channel = channels.find((item) => item.id === method) ?? channels[0];
  const numericAmount = Number(amount);
  const selection = channel && (mode === "subscription" ? plan > 0 ? { kind: mode, method: channel.id, plan } : void 0 : channel.products ? product ? { kind: mode, method: channel.id, amount: 1, product } : void 0 : /^\d+$/.test(amount) && Number.isSafeInteger(numericAmount) && numericAmount >= channel.minimum ? { kind: mode, method: channel.id, amount: numericAmount } : void 0);
  const selectionKey = selection ? JSON.stringify(selection) : "";
  const activeQuote = quote?.selection === selectionKey ? quote.value : void 0;
  (0, import_react.useEffect)(() => {
    if (!selectionKey) return;
    let active = true;
    setError("");
    setQuote(void 0);
    const timer = window.setTimeout(() => {
      void request2("/billing/quote", "POST", JSON.parse(selectionKey)).then((value) => {
        if (active) setQuote({ selection: selectionKey, value });
      }, (reason) => {
        if (active) setError(errorText(reason));
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [selectionKey, request2, quoteRevision]);
  const pay = () => {
    if (!selection || !activeQuote || starting.current) return;
    starting.current = true;
    const id = crypto.randomUUID();
    setCashier({ id });
    void request2("/billing/order", "POST", { ...selection, ...activeQuote, request_id: id }).then(
      (order) => setCashier({ id, order }),
      (reason) => setCashier({ id, error: errorText(reason) })
    ).finally(() => {
      starting.current = false;
    });
  };
  const title = provider === "xilin" ? "\u5E0C\u7075 AI \u5145\u503C" : "DeepSeek \u5145\u503C";
  const ordering = cashier !== void 0 && !cashier.order && !cashier.error;
  return /* @__PURE__ */ (0, import_react.createElement)(import_react.Fragment, null, /* @__PURE__ */ (0, import_react.createElement)(AppDialog, { title, onClose, narrow: provider === "deepseek" }, provider === "deepseek" ? /* @__PURE__ */ (0, import_react.createElement)("p", { className: "vxa-payment-note" }, "DeepSeek \u5F53\u524D\u63D0\u4F9B\u4F59\u989D\u67E5\u8BE2\u63A5\u53E3\u3002\u5E94\u7528\u5185\u5145\u503C\u9700\u8981 DeepSeek \u5F00\u653E\u652F\u4ED8\u63A5\u53E3\u3002") : !config ? error ? /* @__PURE__ */ (0, import_react.createElement)(import_react.Fragment, null, /* @__PURE__ */ (0, import_react.createElement)("p", { className: "vxa-error", role: "alert" }, error), /* @__PURE__ */ (0, import_react.createElement)("button", { type: "button", className: "vxa-btn", onClick: () => setAttempt((value) => value + 1) }, "\u91CD\u65B0\u8BFB\u53D6")) : /* @__PURE__ */ (0, import_react.createElement)(Loading, null, "\u6B63\u5728\u8BFB\u53D6\u5145\u503C\u914D\u7F6E\u2026") : /* @__PURE__ */ (0, import_react.createElement)(import_react.Fragment, null, /* @__PURE__ */ (0, import_react.createElement)("div", { role: "group", "aria-label": "\u8D2D\u4E70\u7C7B\u578B", className: "vxa-payment-modes" }, /* @__PURE__ */ (0, import_react.createElement)("button", { type: "button", className: "vxa-btn", "aria-pressed": mode === "topup", onClick: () => setMode("topup") }, "\u989D\u5EA6\u5145\u503C"), config.plans.length > 0 && /* @__PURE__ */ (0, import_react.createElement)(
    "button",
    {
      type: "button",
      className: "vxa-btn",
      "aria-pressed": mode === "subscription",
      onClick: () => setMode("subscription")
    },
    "\u8D2D\u4E70\u8BA2\u9605"
  )), mode === "subscription" ? /* @__PURE__ */ (0, import_react.createElement)("div", { className: "vxa-payment-options", role: "group", "aria-label": "\u8BA2\u9605\u5957\u9910" }, config.plans.map((item) => /* @__PURE__ */ (0, import_react.createElement)(
    "button",
    {
      className: "vxa-pay-option",
      key: item.id,
      type: "button",
      "aria-pressed": plan === item.id,
      onClick: () => setPlan(item.id)
    },
    /* @__PURE__ */ (0, import_react.createElement)("strong", null, item.title),
    /* @__PURE__ */ (0, import_react.createElement)("span", null, item.price, " ", item.currency)
  ))) : channel?.products ? /* @__PURE__ */ (0, import_react.createElement)("div", { className: "vxa-payment-options", role: "group", "aria-label": "\u5145\u503C\u5546\u54C1" }, channel.products.map((item) => /* @__PURE__ */ (0, import_react.createElement)(
    "button",
    {
      className: "vxa-pay-option",
      key: item.id,
      type: "button",
      "aria-pressed": product === item.id,
      onClick: () => setProduct(item.id)
    },
    item.name
  ))) : /* @__PURE__ */ (0, import_react.createElement)(import_react.Fragment, null, /* @__PURE__ */ (0, import_react.createElement)("div", { className: "vxa-payment-options", role: "group", "aria-label": "\u9884\u8BBE\u5145\u503C\u91D1\u989D" }, config.amounts.map((value) => /* @__PURE__ */ (0, import_react.createElement)(
    "button",
    {
      className: "vxa-pay-option",
      key: value,
      type: "button",
      disabled: value < (channel?.minimum ?? 1),
      "aria-pressed": amount === String(value),
      onClick: () => setAmount(String(value))
    },
    value
  ))), /* @__PURE__ */ (0, import_react.createElement)("label", { className: "vxa-field" }, /* @__PURE__ */ (0, import_react.createElement)("span", { className: "vxa-label" }, "\u5145\u503C\u91D1\u989D"), /* @__PURE__ */ (0, import_react.createElement)(
    "input",
    {
      className: "vxa-input",
      type: "text",
      inputMode: "numeric",
      value: amount,
      onChange: (event) => setAmount(event.target.value)
    }
  ), channel && /* @__PURE__ */ (0, import_react.createElement)("span", { className: "vxa-hint" }, "\u6700\u4F4E\u5145\u503C\u91D1\u989D ", channel.minimum))), /* @__PURE__ */ (0, import_react.createElement)("div", { className: "vxa-payment-channels", role: "group", "aria-label": "\u652F\u4ED8\u6E20\u9053" }, channels.map((item) => /* @__PURE__ */ (0, import_react.createElement)(
    "button",
    {
      key: item.id,
      type: "button",
      className: "vxa-btn",
      "aria-pressed": channel?.id === item.id,
      onClick: () => {
        setMethod(item.id);
        setProduct(item.products?.[0]?.id ?? "");
      }
    },
    item.name
  )), channels.length === 0 && /* @__PURE__ */ (0, import_react.createElement)("p", { className: "vxa-hint" }, "\u5E73\u53F0\u5F53\u524D\u6CA1\u6709\u53EF\u7528\u7684\u652F\u4ED8\u6E20\u9053\u3002")), error && /* @__PURE__ */ (0, import_react.createElement)("p", { className: "vxa-error", role: "alert" }, error), /* @__PURE__ */ (0, import_react.createElement)("footer", { className: "vxa-payment-total" }, /* @__PURE__ */ (0, import_react.createElement)("div", null, activeQuote ? /* @__PURE__ */ (0, import_react.createElement)(import_react.Fragment, null, "\u5B9E\u4ED8 ", /* @__PURE__ */ (0, import_react.createElement)("strong", null, activeQuote.total, " ", activeQuote.currency)) : selection && !error ? /* @__PURE__ */ (0, import_react.createElement)(Loading, null, "\u6B63\u5728\u8BFB\u53D6\u5B9E\u4ED8\u91D1\u989D\u2026") : "\u5B9E\u4ED8 \u2014"), /* @__PURE__ */ (0, import_react.createElement)("button", { type: "button", className: "vxa-btn-primary", disabled: !activeQuote || !!cashier, onClick: pay }, "\u786E\u8BA4\u5E76\u6253\u5F00\u6536\u94F6\u53F0")))), cashier && /* @__PURE__ */ (0, import_react.createElement)(AppDialog, { title: "\u626B\u7801\u652F\u4ED8", busy: ordering, narrow: true, onClose: () => {
    if (cashier.error) {
      setQuote(void 0);
      setQuoteRevision((value) => value + 1);
    }
    setCashier(void 0);
  } }, ordering ? /* @__PURE__ */ (0, import_react.createElement)(Loading, null, "\u6B63\u5728\u521B\u5EFA\u8BA2\u5355\u2026") : cashier.error ? /* @__PURE__ */ (0, import_react.createElement)("p", { className: "vxa-error", role: "alert" }, cashier.error) : cashier.order && /* @__PURE__ */ (0, import_react.createElement)(Cashier, { order: cashier.order, requestID: cashier.id, request: request2, onPaid })));
}

// src/styles.ts
var STYLE_ID = "vexnar-account-settings-styles";
var ACCOUNT_CSS = `
/* \u2500\u2500 \u7248\u5FC3 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vxa-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 720px;
  color: var(--dsw-alias-label-primary, #111827);
}
.vxa-title {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #111827);
}
.vxa-intro {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-tertiary, #6b7280);
}
.vxa-hint {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #6b7280);
}
.vxa-hint-ok { color: var(--dsw-alias-state-success-primary, #16a34a); }
.vxa-error {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary, #dc2626);
}

/* \u2500\u2500 \u4E2A\u4EBA\u8D44\u6599 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vxa-profile { display: flex; flex-direction: column; gap: 14px; max-width: 720px; }

.vxa-profile-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 22px 20px;
  border-radius: 14px;
  background: linear-gradient(110deg, #102e37, #164951);
  color: #f2fffb;
}
.vxa-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 54px;
  height: 54px;
  border-radius: 15px;
  background: #c4ebdf;
  color: #163d42;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.vxa-profile-id { flex: 1 1 170px; min-width: 0; overflow-wrap: anywhere; }
.vxa-profile-name { margin: 0; font-size: 23px; line-height: 30px; font-weight: 500; }
.vxa-profile-handle { color: #c6ded9; font-size: 14px; line-height: 22px; }

.vxa-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(115px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.vxa-stat {
  border: 0.5px solid var(--dsw-alias-border-secondary, var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1)));
  border-radius: var(--dsw-radius-lg, 10px);
  background: var(--dsw-alias-surface-secondary, transparent);
  padding: 11px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.vxa-stat dt { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #6b7280); }
.vxa-stat dd {
  margin: 0;
  font-size: 17px;
  line-height: 24px;
  font-weight: 650;
  color: var(--dsw-alias-label-primary, #111827);
}

.vxa-panel {
  border: 0.5px solid var(--dsw-alias-border-secondary, var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1)));
  border-radius: var(--dsw-radius-lg, 10px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.vxa-panel-title { font-size: 14px; line-height: 22px; font-weight: 500; }
.vxa-panel-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 12px;
  font-size: 14px;
  line-height: 22px;
}
.vxa-panel-meta code {
  font-family: var(--ds-font-family-code, "SF Mono", Menlo, monospace);
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #4b5563);
}
.vxa-panel-meta a { color: inherit; }
.vxa-panel-meta a:hover { color: var(--dsw-alias-state-business-primary, #2563eb); }

/* \u2500\u2500 \u6309\u94AE\uFF08\u5C3A\u5BF8\u5BF9\u9F50 dsh\uFF1A\u4E3B\u6309\u94AE 36px\uFF0C\u884C\u5185\u64CD\u4F5C 28px\uFF09 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vxa-btn,
.vxa-btn-primary,
.vxa-btn-danger,
.vxa-btn-add,
.vxa-btn-sm {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: none;
  font: inherit;
  cursor: pointer;
}
.vxa-btn,
.vxa-btn-primary,
.vxa-btn-danger {
  height: 36px;
  padding: 0 14px;
  border-radius: var(--dsw-radius-md, 8px);
  font-size: 14px;
  line-height: 22px;
}
.vxa-btn {
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14));
  background: transparent;
  color: var(--dsw-alias-label-primary, #111827);
}
.vxa-btn-primary {
  background: var(--dsw-alias-button-primary-fill, #4d6bfe);
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
}
.vxa-btn-danger {
  background: transparent;
  color: var(--dsw-alias-state-error-primary, #dc2626);
}
.vxa-btn-sm {
  height: 28px;
  padding: 0 10px;
  border-radius: var(--dsw-radius-sm, 6px);
  font-size: 12px;
  line-height: 18px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14));
  background: transparent;
  color: var(--dsw-alias-label-primary, #111827);
}
.vxa-btn-sm-danger {
  border: none;
  background: transparent;
  color: var(--dsw-alias-state-error-primary, #dc2626);
}
.vxa-btn-ghost {
  border-color: rgba(255, 255, 255, 0.32);
  color: inherit;
  background: transparent;
  text-decoration: none;
}
/* \u5E94\u7528\u628A\u6BCF\u4E2A a \u90FD\u67D3\u6210\u94FE\u63A5\u8272\uFF08\u9009\u62E9\u5668 body[data-dsh-claude-style] a:not(...)\uFF0C
   \u7279\u5F02\u6027 0-3-2\uFF09\uFF1A\u653E\u5728\u6DF1\u9752\u8EAB\u4EFD\u5361\u4E0A\u5C31\u662F\u4E00\u5757\u8BFB\u4E0D\u6E05\u7684\u6309\u94AE\u3002\u5B83\u7684\u6CE8\u5165\u987A\u5E8F\u4E5F\u665A\u4E8E\u672C\u6587\u4EF6\uFF0C
   \u6240\u4EE5\u8FD9\u91CC\u7528\u8DB3\u591F\u9AD8\u7684\u7279\u5F02\u6027\u538B\u8FC7\u53BB\u2014\u2014\u4E0D\u5199 !important\uFF0C\u7559\u7ED9\u6B63\u4E3B\u5598\u6C14\u7684\u4F59\u5730\u3002 */
.vxa-profile .vxa-profile-head a.vxa-btn-ghost:not(.dsh-claude-absent),
.vxa-profile .vxa-profile-head a.vxa-btn-ghost:not(.dsh-claude-absent):visited { color: #f2fffb; }
.vxa-profile .vxa-profile-head a.vxa-btn-ghost:not(.dsh-claude-absent):hover { color: #ffffff; }
.vxa-btn-ghost:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }

@media (hover: hover) {
  .vxa-btn:hover:not(:disabled),
  .vxa-btn-sm:hover:not(:disabled) {
    background: var(--dsw-alias-interactive-bg-hover-solid, var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04)));
  }
  .vxa-btn-primary:hover:not(:disabled) {
    background: var(--dsw-alias-button-primary-hover, #3d59e0);
  }
  .vxa-btn-danger:hover:not(:disabled),
  .vxa-btn-sm-danger:hover:not(:disabled) {
    background: var(--dsw-alias-interactive-bg-hover-danger, rgba(220, 38, 38, 0.08));
  }
}
.vxa-btn:disabled,
.vxa-btn-primary:disabled,
.vxa-btn-danger:disabled,
.vxa-btn-sm:disabled,
.vxa-btn-add:disabled {
  opacity: 0.4;
  cursor: default;
}
.vxa-btn:focus-visible,
.vxa-btn-primary:focus-visible,
.vxa-btn-sm:focus-visible,
.vxa-btn-add:focus-visible,
.vxa-icon:focus-visible,
.vxa-fold-summary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #2563eb));
}

/* \u2500\u2500 \u6A21\u578B\u9875\uFF1A\u63D0\u4F9B\u65B9\u884C \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vxa-rows {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vxa-row {
  border: 0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1)));
  background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2, #ffffff));
  border-radius: var(--dsw-radius-xl, 12px);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.vxa-row-head { display: flex; align-items: center; gap: 10px; }
.vxa-row-identity { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.vxa-row-name {
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vxa-row-tag {
  flex: none;
  padding: 1px 6px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14));
  border-radius: var(--dsw-radius-xs, 4px);
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary, #4b5563);
}
.vxa-dot {
  box-sizing: border-box;
  display: inline-block;
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary, #16a34a);
}
.vxa-dot-missing { background: var(--dsw-alias-state-error-primary, #dc2626); }
.vxa-account-status {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-state-success-primary, #16a34a);
}
.vxa-row-actions { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }
.vxa-row-actions .vxa-btn-sm,
.vxa-row-actions .vxa-btn-sm-danger { height: 28px; padding: 0 10px; border-radius: var(--dsw-radius-sm, 6px); }

/* \u8D26\u53F7\u884C\u91CC\u9759\u9ED8\u7684\u6A21\u578B\u6570\uFF1A\u53EF\u70B9\u5F00\u53EA\u8BFB\u76EE\u5F55\uFF0C\u4F46\u7EDD\u4E0D\u50CF\u64CD\u4F5C\u6309\u94AE\u90A3\u6837\u62A2\u4F4D\u7F6E\u3002 */
.vxa-row-quiet {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
@media (hover: hover) {
  .vxa-row-quiet:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04)); color: var(--dsw-alias-label-primary, #111827); }
}
.vxa-catalog-plain {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 4px 12px;
  margin: 0;
  padding: 10px 0 0;
  border-top: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  list-style: none;
  max-height: 190px;
  overflow: auto;
}
.vxa-catalog-plain li {
  font-family: var(--ds-font-family-code, "SF Mono", Menlo, monospace);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #4b5563);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* \u2500\u2500 \u63D0\u4F9B\u65B9\u7F16\u8F91\u5668\uFF08\u884C\u5185\u5C55\u5F00\uFF0C\u6765\u81EA dsh \u7684 .editor \u586B\u5145\u5C42\uFF09 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vxa-editor {
  border-radius: var(--dsw-radius-lg, 8px);
  background: var(--dsw-alias-bg-module-platform, #f7f8fa);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.vxa-editor-head { display: flex; align-items: baseline; gap: 8px; }
.vxa-editor-title { font-size: 14px; line-height: 22px; font-weight: 500; }
.vxa-editor-route {
  font-size: 12px;
  line-height: 18px;
  font-family: var(--ds-font-family-code, "SF Mono", Menlo, monospace);
  color: var(--dsw-alias-label-tertiary, #6b7280);
}
.vxa-field { display: flex; flex-direction: column; gap: 6px; }
.vxa-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #4b5563);
}
.vxa-help {
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14));
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font: inherit;
  font-size: 11px;
  line-height: 15px;
  text-align: center;
  cursor: help;
}
.vxa-help:hover { color: var(--dsw-alias-label-primary, #111827); }

.vxa-input {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.16));
  border-radius: var(--dsw-radius-md, 8px);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #111827);
}
.vxa-input::placeholder { color: var(--dsw-alias-label-dimmed, #9ca3af); }
.vxa-input:focus { outline: none; border-color: var(--dsw-alias-state-business-primary, #2563eb); }
.vxa-input:disabled { opacity: 0.6; cursor: default; }
.vxa-input-mono { font-family: var(--ds-font-family-code, "SF Mono", Menlo, monospace); font-size: 13px; }
.vxa-select {
  appearance: none;
  max-width: 260px;
  padding-right: 32px;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 12px 12px;
}
.vxa-key { position: relative; }
.vxa-key .vxa-input { padding-right: 40px; }
.vxa-key-toggle {
  position: absolute;
  inset: 1px 1px 1px auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  padding: 0;
  border: none;
  border-radius: var(--dsw-radius-md, 8px);
  background: none;
  color: var(--dsw-alias-label-secondary, #4b5563);
  cursor: pointer;
}
.vxa-key-toggle:hover { color: var(--dsw-alias-label-primary, #111827); }

/* \u81EA\u5B9A\u4E49\u8BBE\u7F6E\uFF1A\u539F\u751F details + \u81EA\u7ED8 chevron\uFF0C\u4E0E dsh \u7684 .customized \u5B8C\u5168\u4E00\u81F4\u3002 */
.vxa-fold { border-top: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1)); padding-top: 10px; }
.vxa-fold-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 2px 4px;
  margin-left: -4px;
  border-radius: var(--dsw-radius-sm, 6px);
  cursor: pointer;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #4b5563);
  list-style: none;
}
.vxa-fold-summary::-webkit-details-marker { display: none; }
.vxa-fold-summary::before {
  content: '';
  width: 5px;
  height: 5px;
  border-right: 1.5px solid currentcolor;
  border-bottom: 1.5px solid currentcolor;
  transform: rotate(-45deg) translate(-1px, -1px);
  transition: transform 120ms ease;
}
.vxa-fold[open] > .vxa-fold-summary::before { transform: rotate(45deg) translate(-1px, -1px); }
.vxa-fold-summary:hover { color: var(--dsw-alias-label-primary, #111827); }
.vxa-fold-body { display: flex; flex-direction: column; gap: 12px; padding-top: 12px; }

/* \u2500\u2500 \u6A21\u578B\u76EE\u5F55 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vxa-catalog {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
}
.vxa-catalog-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.vxa-catalog-title { font-size: 12px; line-height: 18px; font-weight: 500; color: var(--dsw-alias-label-secondary, #4b5563); }
.vxa-model-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.vxa-model-entry {
  border: 0.5px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.16));
  border-radius: var(--dsw-radius-lg, 8px);
  padding: 6px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
}
.vxa-model-entry[data-dragging] { opacity: 0.5; }
.vxa-model-entry[data-drop] { border-color: var(--dsw-alias-state-business-primary, #2563eb); }
.vxa-model-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1.4fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
}
.vxa-drag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 28px;
  border: none;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  cursor: grab;
}
.vxa-drag:active { cursor: grabbing; }
.vxa-icon {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  cursor: pointer;
}
@media (hover: hover) {
  .vxa-icon:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04)); color: var(--dsw-alias-label-primary, #111827); }
  .vxa-icon-danger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-danger, rgba(220, 38, 38, 0.08)); color: var(--dsw-alias-state-error-primary, #dc2626); }
}
.vxa-add-model {
  box-sizing: border-box;
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14));
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-primary, #111827);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
@media (hover: hover) {
  .vxa-add-model:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04)); }
}
.vxa-add-model:disabled { opacity: 0.4; cursor: default; }
.vxa-model-more {
  margin-top: 6px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #4b5563);
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
}
@media (hover: hover) {
  .vxa-model-more:hover:not(:disabled) { color: var(--dsw-alias-label-primary, #111827); text-decoration: underline; }
}
.vxa-model-more:disabled { opacity: 0.4; cursor: default; }
.vxa-capability {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
  padding: 8px;
  border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
}
.vxa-capability-row { display: flex; align-items: center; gap: 8px; }
.vxa-capability-label {
  flex: 0 0 64px;
  color: var(--dsw-alias-label-tertiary, #6b7280);
  font-size: 11px;
  line-height: 16px;
}
.vxa-capability-values { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.vxa-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--dsw-alias-label-secondary, #4b5563);
  font-size: 12px;
  line-height: 18px;
}
.vxa-input-tiny { width: 64px; }
.vxa-input-num { width: 110px; }

.vxa-editor-footer { display: flex; justify-content: flex-end; gap: 8px; }

/* \u2500\u2500 \u6DFB\u52A0\u5165\u53E3\uFF08\u865A\u7EBF\uFF0C\u5360\u6EE1\u6574\u884C\uFF09 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vxa-add-block { display: flex; flex-direction: column; gap: 12px; }
.vxa-btn-add {
  flex: 1 1 0;
  min-width: 180px;
  gap: 6px;
  height: 44px;
  padding: 0 14px;
  border: 1px dashed var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14));
  border-radius: var(--dsw-radius-lg, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary, #111827);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
}
@media (hover: hover) {
  .vxa-btn-add:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04)); }
}
.vxa-add-card {
  border-radius: var(--dsw-radius-lg, 8px);
  background: var(--dsw-alias-bg-module-platform, #f7f8fa);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
/* \u6DFB\u52A0\u5361\u91CC\u518D\u5957\u4E00\u5C42\u7F16\u8F91\u5668\u65F6\u4E0D\u8BE5\u53E0\u51FA\u7B2C\u4E8C\u5757\u5E95\u8272\u3002 */
.vxa-add-card .vxa-editor { background: none; padding: 0; }
.vxa-modes {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  width: fit-content;
}
.vxa-mode {
  box-sizing: border-box;
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, #4b5563);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.vxa-mode[aria-pressed='true'] {
  background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2, #ffffff));
  color: var(--dsw-alias-label-primary, #111827);
  box-shadow: var(--dsw-elevation-raised, 0 1px 2px rgba(0, 0, 0, 0.08));
}
.vxa-mode:disabled { opacity: 0.4; cursor: default; }

.vxa-avatar { overflow: hidden; }
.vxa-avatar img { width: 100%; height: 100%; object-fit: cover; }
.vxa-launcher { position: relative; width: 100%; min-width: 0; }
.vxa-launcher-trigger {
  width: 100%; display: flex; align-items: center; gap: 9px; min-height: 38px;
  text-align: left; border: 0; border-radius: 8px; padding: 5px 8px;
  color: inherit; font: inherit; background: transparent; cursor: pointer;
}
.vxa-launcher-trigger:hover { background: var(--dsw-alias-settings-card-fill, #8882); }
/* Claude Style supplies its own footer when the settings launcher is absent. */
body[data-dsh-claude-style][data-dsh-claude-footer-takeover] [data-dsh-claude-part~='foot-area']:has(.vxa-launcher)
  :is(.dsh-claude-account-btn, .dsh-claude-account-popover) { display: none !important; }
body[data-dsh-claude-style][data-dsh-claude-footer-takeover] [data-dsh-claude-part~='foot-area']
  > [data-dsh-claude-part~='settings-area']:has(.vxa-launcher) {
  display: block !important; flex: 1 1 auto; width: 100% !important; height: auto !important;
}
body[data-dsh-claude-style][data-dsh-claude-footer-takeover] [data-dsh-claude-part~='foot-area']
  [data-dsh-claude-part~='settings-trigger']:has(.vxa-launcher) { display: flex !important; }
body[data-dsh-claude-style][data-dsh-claude-footer-takeover] [data-dsh-claude-part~='foot-area']
  [data-dsh-claude-part~='settings-trigger'] .vxa-launcher button.vxa-launcher-trigger { display: flex !important; }
body[data-dsh-claude-style][data-dsh-claude-footer-takeover] [data-dsh-claude-part~='foot-area']
  [data-dsh-claude-part~='settings-trigger'] .vxa-launcher-popover .vxa-btn { display: inline-flex !important; }
body[data-dsh-claude-style][data-dsh-claude-footer-takeover] [data-dsh-claude-part~='foot-area']
  [data-dsh-claude-part~='settings-trigger'] .vxa-payment-dialog .vxa-pay-option { display: grid !important; }
body[data-dsh-claude-style][data-dsh-claude-footer-takeover] [data-dsh-claude-part~='foot-area']
  [data-dsh-claude-part~='settings-trigger'] .vxa-payment-dialog .vxa-btn-primary { display: inline-flex !important; }
.vxa-launcher-trigger .vxa-avatar { flex: 0 0 26px; width: 26px; height: 26px; border-radius: 50%; font-size: 11px; }
.vxa-launcher-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vxa-launcher[data-wide='false'] .vxa-launcher-trigger { justify-content: center; padding: 4px; }
.vxa-launcher-popover {
  position: fixed; z-index: 20;
  width: min(300px, calc(100vw - 16px)); max-height: calc(100dvh - 74px); overflow: auto;
  padding: 10px; border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-subtle, #8884);
  color: var(--dsw-alias-label-primary, #18232c);
  background: var(--dsw-alias-bg-layer-2, #fff);
  box-shadow: 0 9px 32px #0002;
}
.vxa-launcher-actions { display: flex; gap: 8px; margin-top: 10px; }
.vxa-wallet { display: grid; gap: 8px; }
.vxa-wallet-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 9px; border: 1px solid var(--dsw-alias-border-subtle, #8884); border-radius: 8px;
}
.vxa-wallet-row .vxa-btn { white-space: nowrap; }
.vxa-wallet-value { margin-top: 3px; font-size: 12px; font-variant-numeric: tabular-nums; }
.vxa-profile-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.vxa-payment-dialog {
  box-sizing: border-box;
  width: min(640px, calc(100vw - 24px)); max-height: calc(100dvh - 28px);
  padding: clamp(16px, 4vw, 28px); border-radius: 16px;
  border: 1px solid var(--dsw-alias-border-subtle, #8884);
  color: var(--dsw-alias-label-primary, #18232c); background: var(--dsw-alias-bg-layer-2, #fff);
  box-shadow: 0 16px 64px #0003;
}
.vxa-payment-dialog[data-narrow='true'] { width: min(490px, calc(100vw - 24px)); }
.vxa-payment-dialog::backdrop { background: #1118206b; }
.vxa-payment-head, .vxa-payment-total {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.vxa-payment-head { margin-bottom: 18px; }
.vxa-payment-head h2 { margin: 0; font-size: 19px; }
.vxa-payment-modes, .vxa-payment-channels { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.vxa-payment-options {
  display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(78px, 1fr)); margin: 14px 0;
}
.vxa-pay-option {
  display: grid; gap: 4px; place-content: center; min-height: 54px; padding: 8px;
  border: 1px solid var(--dsw-alias-border-subtle, #8885); border-radius: 9px;
  color: inherit; background: transparent; font: inherit; cursor: pointer;
}
.vxa-pay-option:disabled { opacity: .45; cursor: default; }
.vxa-payment-dialog button[aria-pressed='true'] { border-color: #25867e; background: #25867e16; }
.vxa-payment-total { flex-wrap: wrap; margin-top: 16px; padding-top: 14px; border-top: 1px solid #8884; }
.vxa-payment-loading { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
.vxa-payment-loading > span {
  width: 15px; height: 15px; flex: 0 0 15px; border: 2px solid #27877d40;
  border-top-color: #27877d; border-radius: 50%; animation: vxa-payment-spin .8s linear infinite;
}
@keyframes vxa-payment-spin { to { transform: rotate(1turn); } }
.vxa-payment-frame { width: 100%; height: min(480px, 55vh); border: 1px solid #8884; border-radius: 8px; background: white; }
.vxa-payment-note, .vxa-payment-success { line-height: 1.55; margin: 0 0 10px; }
.vxa-payment-success { color: var(--dsw-alias-label-primary, #106f51); }

@media (prefers-reduced-motion: reduce) {
  .vxa-fold-summary::before { transition: none; }
  .vxa-payment-loading > span { animation: none; }
}
`;
function installAccountStyles(doc = document) {
  const existing = doc.getElementById(STYLE_ID);
  if (existing !== null) return () => {
  };
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = ACCOUNT_CSS;
  doc.head.append(style);
  return () => {
    style.remove();
  };
}

// src/client.tsx
var api = "/vexnar-api/platform";
var platform = "https://platform.sec.hn.cn";
var accountEvent = "vexnar:platform-account";
var platformProviderID = "vexnar";
async function request(path, method = "GET", body) {
  const response = await fetch(api + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...method === "GET" ? { signal: AbortSignal.timeout(15e3) } : {},
    ...body === void 0 ? {} : { body: JSON.stringify(body) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
var message = (reason) => reason instanceof Error ? reason.message : String(reason);
function useAccount() {
  const [account, setAccount] = (0, import_react2.useState)();
  const [error, setError] = (0, import_react2.useState)("");
  const onError = (reason) => setError(message(reason));
  const refresh = () => void request("/account").then((next) => {
    setAccount(next);
    setError("");
  }, onError);
  const update = (next) => {
    setAccount(next);
    setError("");
    window.dispatchEvent(new Event(accountEvent));
  };
  (0, import_react2.useEffect)(() => {
    refresh();
    window.addEventListener(accountEvent, refresh);
    return () => window.removeEventListener(accountEvent, refresh);
  }, []);
  return { account, error, onError, update };
}
function credentialName(id) {
  return `VEXNAR_${id.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}_API_KEY`;
}
function PlusIcon({ size = 12 }) {
  return /* @__PURE__ */ (0, import_react2.createElement)("svg", { width: size, height: size, viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ (0, import_react2.createElement)("path", { d: "M6 2.25v7.5M2.25 6h7.5", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" }));
}
function GripIcon() {
  return /* @__PURE__ */ (0, import_react2.createElement)("svg", { width: "10", height: "14", viewBox: "0 0 10 14", fill: "currentColor", "aria-hidden": "true" }, [2, 6, 10].map((y) => /* @__PURE__ */ (0, import_react2.createElement)(import_react2.Fragment, { key: y }, /* @__PURE__ */ (0, import_react2.createElement)("circle", { cx: "2.5", cy: y, r: "1.1" }), /* @__PURE__ */ (0, import_react2.createElement)("circle", { cx: "7.5", cy: y, r: "1.1" }))));
}
function TrashIcon() {
  return /* @__PURE__ */ (0, import_react2.createElement)("svg", { width: "13", height: "13", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ (0, import_react2.createElement)(
    "path",
    {
      d: "M2.5 3.75h9M5.5 3.75V2.5h3v1.25M3.5 3.75l.5 7.25h6l.5-7.25M5.75 6v3M8.25 6v3",
      stroke: "currentColor",
      strokeWidth: "1.2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ));
}
function EyeIcon({ open }) {
  return open ? /* @__PURE__ */ (0, import_react2.createElement)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ (0, import_react2.createElement)("path", { d: "M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8Z", stroke: "currentColor", strokeWidth: "1.2" }), /* @__PURE__ */ (0, import_react2.createElement)("circle", { cx: "8", cy: "8", r: "1.75", stroke: "currentColor", strokeWidth: "1.2" })) : /* @__PURE__ */ (0, import_react2.createElement)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ (0, import_react2.createElement)(
    "path",
    {
      d: "M1.5 8s2.4-4 6.5-4c1.1 0 2.1.3 3 .8M14.5 8s-2.4 4-6.5 4c-1.1 0-2.1-.3-3-.8M2.5 2.5l11 11",
      stroke: "currentColor",
      strokeWidth: "1.2",
      strokeLinecap: "round"
    }
  ));
}
var statValue = (value) => typeof value === "number" ? value.toLocaleString("zh-CN") : "\u2014";
function Avatar({ account }) {
  const [failed, setFailed] = (0, import_react2.useState)("");
  const url = account?.avatar_url;
  const name = account?.display_name || account?.username || "V";
  return /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-avatar", "aria-hidden": "true" }, url && url !== failed ? /* @__PURE__ */ (0, import_react2.createElement)("img", { src: url, alt: "", referrerPolicy: "no-referrer", onError: () => {
    setFailed(url);
  } }) : Array.from(name).slice(0, 2).join("").toUpperCase());
}
function notifyWallet() {
  window.dispatchEvent(new Event(accountEvent));
}
function Wallet() {
  const [wallet, setWallet] = (0, import_react2.useState)();
  const [recharge, setRecharge] = (0, import_react2.useState)();
  const [error, setError] = (0, import_react2.useState)("");
  (0, import_react2.useEffect)(() => {
    let generation = 0;
    const refresh = () => {
      const current = ++generation;
      void request("/wallet").then((value) => {
        if (generation !== current) return;
        setWallet(value);
        setError("");
      }, (reason) => {
        if (generation === current) setError(message(reason));
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(accountEvent, refresh);
    return () => {
      generation++;
      window.removeEventListener("focus", refresh);
      window.removeEventListener(accountEvent, refresh);
    };
  }, []);
  const main = wallet?.platform;
  const deepseek = wallet?.deepseek;
  const balance = main?.amount != null ? `${main.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${main.currency}` : main?.quota != null ? `${statValue(main.quota)} \u989D\u5EA6` : "\u2014";
  return /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-wallet" }, /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-wallet-row" }, /* @__PURE__ */ (0, import_react2.createElement)("div", null, /* @__PURE__ */ (0, import_react2.createElement)("strong", null, "\u5E0C\u7075 AI \u4F59\u989D"), /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-wallet-value" }, wallet || error ? balance : "\u8BFB\u53D6\u4E2D\u2026")), /* @__PURE__ */ (0, import_react2.createElement)("button", { type: "button", className: "vxa-btn", onClick: () => setRecharge("xilin") }, "\u5E0C\u7075 AI \u5145\u503C")), main?.error && /* @__PURE__ */ (0, import_react2.createElement)("p", { className: "vxa-hint", role: "status" }, main.error), /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-wallet-row" }, /* @__PURE__ */ (0, import_react2.createElement)("div", null, /* @__PURE__ */ (0, import_react2.createElement)("strong", null, "DeepSeek \u4F59\u989D"), /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-wallet-value" }, deepseek === void 0 ? error ? "\u2014" : "\u8BFB\u53D6\u4E2D\u2026" : deepseek.status === "ready" ? deepseek.balances.map((item) => `${item.total} ${item.currency}`).join(" / ") : deepseek.status === "unconfigured" ? "\u8BF7\u5148\u6DFB\u52A0 DeepSeek \u5B98\u65B9\u6A21\u578B" : "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6")), /* @__PURE__ */ (0, import_react2.createElement)("button", { type: "button", className: "vxa-btn", onClick: () => setRecharge("deepseek") }, "DeepSeek \u5145\u503C")), recharge && /* @__PURE__ */ (0, import_react2.createElement)(
    RechargeDialog,
    {
      provider: recharge,
      request,
      onPaid: notifyWallet,
      onClose: () => setRecharge(void 0)
    }
  ), error && /* @__PURE__ */ (0, import_react2.createElement)("p", { className: "vxa-error", role: "alert" }, error));
}
function AccountLauncher({ wide, openSettings }) {
  const { account } = useAccount();
  const label = account?.display_name || account?.username || "\u5E0C\u7075 AI";
  const [position, setPosition] = (0, import_react2.useState)();
  const root = (0, import_react2.useRef)(null);
  const trigger = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
    if (!position) return;
    const close = () => setPosition(void 0);
    const closeOutside = (event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close();
    };
    const escape = (event) => {
      if (event.key !== "Escape" || document.querySelector(".vxa-payment-dialog[open]")) return;
      close();
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", close);
    };
  }, [position]);
  return /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-launcher", ref: root, "data-wide": wide }, /* @__PURE__ */ (0, import_react2.createElement)(
    "button",
    {
      type: "button",
      className: "vxa-launcher-trigger",
      ref: trigger,
      "aria-label": label,
      "aria-expanded": position !== void 0,
      onClick: (event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        setPosition(position ? void 0 : {
          left: Math.max(8, Math.min(bounds.left, window.innerWidth - 308)),
          bottom: window.innerHeight - bounds.top + 8
        });
      }
    },
    /* @__PURE__ */ (0, import_react2.createElement)(Avatar, { account }),
    wide && /* @__PURE__ */ (0, import_react2.createElement)(import_react2.Fragment, null, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-launcher-name" }, label), /* @__PURE__ */ (0, import_react2.createElement)("span", { "aria-hidden": "true" }, "\u2304"))
  ), position && /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-launcher-popover", style: position, "aria-label": "\u8D26\u6237\u4F59\u989D", role: "region" }, /* @__PURE__ */ (0, import_react2.createElement)(Wallet, null), /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-launcher-actions" }, /* @__PURE__ */ (0, import_react2.createElement)("button", { type: "button", className: "vxa-btn", onClick: () => {
    setPosition(void 0);
    openSettings();
  } }, "\u8BBE\u7F6E"), /* @__PURE__ */ (0, import_react2.createElement)("button", { type: "button", className: "vxa-btn", onClick: () => {
    setPosition(void 0);
    openSettings("vexnar-account");
  } }, "\u8D26\u6237\u8BE6\u60C5"))));
}
function AccountSection() {
  const { account, error, onError, update } = useAccount();
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [renewalOpen, setRenewalOpen] = (0, import_react2.useState)(false);
  const [renewal, setRenewal] = (0, import_react2.useState)("");
  const renew = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const accessToken = new FormData(form).get("access_token");
    form.reset();
    setBusy(true);
    setRenewal("");
    onError("");
    try {
      update(await request("/account", "PATCH", { access_token: accessToken }));
      setRenewal("\u8BBF\u95EE\u4EE4\u724C\u5DF2\u66F4\u65B0");
    } catch (reason) {
      onError(reason);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    setBusy(true);
    try {
      await request("/account", "DELETE");
      window.location.replace("/");
    } catch (reason) {
      onError(reason);
    } finally {
      setBusy(false);
    }
  };
  if (account === void 0) {
    return /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-panel", role: "status" }, error || "\u6B63\u5728\u8BFB\u53D6 VEXNAR \u4E2A\u4EBA\u8D44\u6599\u2026");
  }
  const provider = account.providers.find((item) => item.id === platformProviderID);
  const displayName = account.display_name || account.username;
  const stats = [
    { name: "\u5E73\u53F0\u6A21\u578B", value: statValue(provider?.models.length ?? 0) },
    { name: "\u6A21\u578B\u534F\u8BAE", value: "Responses" },
    { name: "\u5E73\u53F0\u8BBF\u95EE\u4EE4\u724C", value: account.access_token_ready ? "\u5DF2\u914D\u7F6E" : "\u672A\u914D\u7F6E" },
    { name: "\u5E73\u53F0\u7D2F\u8BA1\u8BF7\u6C42", value: statValue(account.request_count) }
  ];
  return /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-profile" }, /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-profile-head" }, /* @__PURE__ */ (0, import_react2.createElement)(Avatar, { account }), /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-profile-id" }, /* @__PURE__ */ (0, import_react2.createElement)("h2", { className: "vxa-profile-name" }, displayName), /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-profile-handle" }, "@", account.username)), /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-profile-actions" }, /* @__PURE__ */ (0, import_react2.createElement)("a", { className: "vxa-btn vxa-btn-ghost", href: platform + "/profile", target: "_blank", rel: "noreferrer" }, "\u7BA1\u7406\u5E73\u53F0\u8D26\u6237"), /* @__PURE__ */ (0, import_react2.createElement)("button", { type: "button", className: "vxa-btn vxa-btn-ghost", onClick: () => {
    setRenewal("");
    onError("");
    setRenewalOpen(true);
  } }, "\u66F4\u65B0\u8BBF\u95EE\u4EE4\u724C"))), /* @__PURE__ */ (0, import_react2.createElement)("dl", { className: "vxa-stats" }, stats.map(({ name, value }) => /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-stat", key: name }, /* @__PURE__ */ (0, import_react2.createElement)("dt", null, name), /* @__PURE__ */ (0, import_react2.createElement)("dd", null, value)))), /* @__PURE__ */ (0, import_react2.createElement)(Wallet, null), renewalOpen && /* @__PURE__ */ (0, import_react2.createElement)(
    AppDialog,
    {
      title: "\u66F4\u65B0\u5E73\u53F0\u8BBF\u95EE\u4EE4\u724C",
      busy,
      narrow: true,
      onClose: () => {
        setRenewalOpen(false);
        onError("");
      }
    },
    /* @__PURE__ */ (0, import_react2.createElement)("form", { className: "vxa-fold-body", onSubmit: (event) => {
      void renew(event);
    } }, /* @__PURE__ */ (0, import_react2.createElement)("label", { className: "vxa-field" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-label" }, "\u5F53\u524D\u8D26\u6237\u7684\u8BBF\u95EE\u4EE4\u724C"), /* @__PURE__ */ (0, import_react2.createElement)(
      "input",
      {
        className: "vxa-input",
        name: "access_token",
        type: "password",
        autoComplete: "off",
        spellCheck: false,
        required: true,
        disabled: busy
      }
    )), /* @__PURE__ */ (0, import_react2.createElement)("button", { type: "submit", className: "vxa-btn", disabled: busy }, "\u9A8C\u8BC1\u5E76\u66F4\u65B0"), renewal && /* @__PURE__ */ (0, import_react2.createElement)("p", { className: "vxa-hint", role: "status" }, renewal), error && /* @__PURE__ */ (0, import_react2.createElement)("p", { className: "vxa-error", role: "alert" }, error))
  ), !renewalOpen && error && /* @__PURE__ */ (0, import_react2.createElement)("p", { className: "vxa-error", role: "alert" }, error), /* @__PURE__ */ (0, import_react2.createElement)("div", null, /* @__PURE__ */ (0, import_react2.createElement)("button", { type: "button", className: "vxa-btn", disabled: busy, onClick: () => void logout() }, "\u9000\u51FA\u767B\u5F55")));
}
var REASONING_LEVELS = [
  { level: "minimal", label: "\u6781\u4F4E" },
  { level: "low", label: "\u4F4E" },
  { level: "medium", label: "\u4E2D" },
  { level: "high", label: "\u9AD8" },
  { level: "xhigh", label: "\u6781\u9AD8" },
  { level: "max", label: "\u6700\u5927" }
];
var INPUT_TYPES = [
  { id: "text", label: "\u6587\u672C" },
  { id: "image", label: "\u56FE\u50CF" }
];
function ModelCapability({ model, disabled, onChange }) {
  const effortOn = model.reasoningEfforts !== void 0;
  const patch = (changes) => {
    onChange({ ...model, ...changes });
  };
  const toggleInput = (id, on) => {
    const current = new Set(model.inputTypes ?? []);
    if (on) current.add(id);
    else current.delete(id);
    const ordered = INPUT_TYPES.map((entry) => entry.id).filter((entry) => current.has(entry));
    patch(ordered.length === 0 ? { inputTypes: void 0 } : { inputTypes: ordered });
  };
  const setEffort = (level, value) => {
    const next = { ...model.reasoningEfforts ?? {} };
    if (value.trim() === "") delete next[level];
    else next[level] = value;
    patch({ reasoningEfforts: next });
  };
  return /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-capability" }, /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-capability-row" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-capability-label" }, "\u8F93\u5165\u7C7B\u578B"), /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-capability-values" }, INPUT_TYPES.map((entry) => /* @__PURE__ */ (0, import_react2.createElement)("label", { key: entry.id, className: "vxa-check" }, /* @__PURE__ */ (0, import_react2.createElement)(
    "input",
    {
      type: "checkbox",
      checked: (model.inputTypes ?? []).includes(entry.id),
      disabled,
      onChange: (event) => {
        toggleInput(entry.id, event.target.checked);
      }
    }
  ), entry.label)))), /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-capability-row" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-capability-label" }, "\u63A8\u7406\u6863\u4F4D"), /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-capability-values" }, /* @__PURE__ */ (0, import_react2.createElement)("label", { className: "vxa-check" }, /* @__PURE__ */ (0, import_react2.createElement)(
    "input",
    {
      type: "checkbox",
      checked: effortOn,
      disabled,
      onChange: (event) => {
        patch({ reasoningEfforts: event.target.checked ? { off: null, low: "low", medium: "medium", high: "high" } : void 0 });
      }
    }
  ), "\u652F\u6301\u63A8\u7406"), effortOn && REASONING_LEVELS.map((entry) => /* @__PURE__ */ (0, import_react2.createElement)(
    "input",
    {
      key: entry.level,
      className: "vxa-input vxa-input-tiny",
      value: model.reasoningEfforts?.[entry.level] ?? "",
      "aria-label": `\u63A8\u7406\u6863\u4F4D ${entry.label} \u7684\u4E0A\u6E38\u53D6\u503C`,
      placeholder: "\u672A\u542F\u7528",
      disabled,
      onChange: (event) => {
        setEffort(entry.level, event.target.value);
      }
    }
  )))), /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-capability-row" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-capability-label" }, "\u4E0A\u9650"), /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-capability-values" }, /* @__PURE__ */ (0, import_react2.createElement)(
    "input",
    {
      className: "vxa-input vxa-input-num",
      inputMode: "numeric",
      value: model.contextWindow === void 0 ? "" : String(model.contextWindow),
      "aria-label": "\u4E0A\u4E0B\u6587\u7A97\u53E3",
      placeholder: "\u4E0A\u4E0B\u6587\u7A97\u53E3",
      disabled,
      onChange: (event) => {
        const digits = event.target.value.replace(/[^0-9]/g, "");
        patch({ contextWindow: digits === "" ? void 0 : Number(digits) });
      }
    }
  ), /* @__PURE__ */ (0, import_react2.createElement)(
    "input",
    {
      className: "vxa-input vxa-input-num",
      inputMode: "numeric",
      value: model.maxOutputTokens === void 0 ? "" : String(model.maxOutputTokens),
      "aria-label": "\u5355\u6B21\u8F93\u51FA\u4E0A\u9650",
      placeholder: "\u8F93\u51FA\u4E0A\u9650",
      disabled,
      onChange: (event) => {
        const digits = event.target.value.replace(/[^0-9]/g, "");
        patch({ maxOutputTokens: digits === "" ? void 0 : Number(digits) });
      }
    }
  ))));
}
function ModelCatalog({ models, disabled, onChange }) {
  const [dragging, setDragging] = (0, import_react2.useState)();
  const [over, setOver] = (0, import_react2.useState)();
  const [capability, setCapability] = (0, import_react2.useState)();
  const edit = (index, patch) => {
    onChange(models.map((model, current) => current === index ? { ...model, ...patch } : model));
  };
  const move = (from, to) => {
    if (from === to) return;
    const next = [...models];
    const [moved] = next.splice(from, 1);
    if (moved === void 0) return;
    next.splice(to, 0, moved);
    onChange(next);
  };
  const drop = (event, index) => {
    event.preventDefault();
    if (dragging !== void 0) move(dragging, index);
    setDragging(void 0);
    setOver(void 0);
  };
  return /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-catalog" }, /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-catalog-head" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-catalog-title" }, "\u6A21\u578B\u76EE\u5F55"), /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-hint" }, models.length, " \u4E2A\u6A21\u578B")), /* @__PURE__ */ (0, import_react2.createElement)("ul", { className: "vxa-model-list" }, models.map((model, index) => /* @__PURE__ */ (0, import_react2.createElement)(
    "li",
    {
      key: index,
      className: "vxa-model-entry",
      ...dragging === index ? { "data-dragging": "1" } : {},
      ...over === index && dragging !== void 0 && dragging !== index ? { "data-drop": "1" } : {},
      onDragOver: (event) => {
        event.preventDefault();
        setOver(index);
      },
      onDragLeave: () => {
        setOver(void 0);
      },
      onDrop: (event) => {
        drop(event, index);
      }
    },
    /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-model-row" }, /* @__PURE__ */ (0, import_react2.createElement)(
      "button",
      {
        type: "button",
        className: "vxa-drag",
        draggable: true,
        disabled: disabled || models.length < 2,
        "aria-label": "\u8C03\u6574\u6A21\u578B\u987A\u5E8F",
        title: "\u62D6\u52A8\u6392\u5E8F",
        onDragStart: () => {
          setDragging(index);
        },
        onDragEnd: () => {
          setDragging(void 0);
          setOver(void 0);
        }
      },
      /* @__PURE__ */ (0, import_react2.createElement)(GripIcon, null)
    ), /* @__PURE__ */ (0, import_react2.createElement)(
      "input",
      {
        className: "vxa-input vxa-input-mono",
        value: model.id,
        placeholder: "\u6A21\u578B ID",
        "aria-label": "\u6A21\u578B ID",
        disabled,
        onChange: (event) => {
          edit(index, { id: event.target.value });
        }
      }
    ), /* @__PURE__ */ (0, import_react2.createElement)(
      "input",
      {
        className: "vxa-input",
        value: model.name ?? "",
        placeholder: "\u7559\u7A7A\u65F6\u4F7F\u7528\u6A21\u578B ID",
        "aria-label": "\u663E\u793A\u540D\u79F0",
        disabled,
        onChange: (event) => {
          const name = event.target.value;
          onChange(models.map((item, current) => {
            if (current !== index) return item;
            const { name: _previous, ...rest } = item;
            return name === "" ? rest : { ...rest, name };
          }));
        }
      }
    ), /* @__PURE__ */ (0, import_react2.createElement)(
      "button",
      {
        type: "button",
        className: "vxa-icon vxa-icon-danger",
        "aria-label": "\u5220\u9664\u6A21\u578B",
        disabled,
        onClick: () => {
          onChange(models.filter((_, current) => current !== index));
        }
      },
      /* @__PURE__ */ (0, import_react2.createElement)(TrashIcon, null)
    )),
    /* @__PURE__ */ (0, import_react2.createElement)(
      "button",
      {
        type: "button",
        className: "vxa-model-more",
        "aria-expanded": capability === index,
        disabled,
        onClick: () => {
          setCapability((current) => current === index ? void 0 : index);
        }
      },
      capability === index ? "\u6536\u8D77\u80FD\u529B" : "\u80FD\u529B"
    ),
    capability === index && /* @__PURE__ */ (0, import_react2.createElement)(
      ModelCapability,
      {
        model,
        disabled,
        onChange: (next) => {
          onChange(models.map((item, current) => current === index ? next : item));
        }
      }
    )
  ))), /* @__PURE__ */ (0, import_react2.createElement)(
    "button",
    {
      type: "button",
      className: "vxa-add-model",
      disabled,
      onClick: () => {
        onChange([...models, { id: "" }]);
      }
    },
    /* @__PURE__ */ (0, import_react2.createElement)(PlusIcon, null),
    "\u6DFB\u52A0\u6A21\u578B"
  ));
}
function ProviderEditor({ provider, busy, onCancel, onSave }) {
  const [draft, setDraft] = (0, import_react2.useState)(() => ({
    name: provider.name,
    base: provider.base,
    key: "",
    retry: provider.retry,
    models: provider.models.map((model) => ({ ...model }))
  }));
  const [reveal, setReveal] = (0, import_react2.useState)(false);
  const [failure, setFailure] = (0, import_react2.useState)("");
  const set = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const submit = () => {
    const models = draft.models.map((model) => model.id.trim() === "" ? void 0 : model.name === void 0 ? { id: model.id.trim() } : { id: model.id.trim(), name: model.name }).filter((model) => model !== void 0);
    if (models.length === 0) {
      setFailure("\u6A21\u578B\u76EE\u5F55\u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u6A21\u578B ID\u3002");
      return;
    }
    if (new Set(models.map((model) => model.id)).size !== models.length) {
      setFailure("\u6A21\u578B ID \u4E0D\u80FD\u91CD\u590D\u3002");
      return;
    }
    if (draft.key !== "" && /\s/.test(draft.key)) {
      setFailure("API \u5BC6\u94A5\u4E0D\u80FD\u5305\u542B\u7A7A\u683C\u3002");
      return;
    }
    setFailure("");
    onSave({ ...draft, models });
  };
  return /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-editor" }, /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-editor-head" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-editor-title" }, provider.name), /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-editor-route" }, provider.id.startsWith("custom-") ? "\u81EA\u5B9A\u4E49 \xB7 OpenAI \u517C\u5BB9" : provider.id)), /* @__PURE__ */ (0, import_react2.createElement)("label", { className: "vxa-field" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-label" }, "API \u5BC6\u94A5", /* @__PURE__ */ (0, import_react2.createElement)(
    "button",
    {
      type: "button",
      className: "vxa-help",
      "aria-label": "\u5BC6\u94A5\u8BF4\u660E",
      title: `\u5BC6\u94A5\u4FDD\u5B58\u5728\u672C\u673A\u51ED\u636E\u5E93\uFF08${credentialName(provider.id)}\uFF09\uFF0C\u6A21\u578B\u8BF7\u6C42\u65F6\u7531 dsh \u89E3\u6790\uFF0C\u4E0D\u5199\u8FDB\u8BBE\u7F6E\u6587\u4EF6\u3002`
    },
    "?"
  )), /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-key" }, /* @__PURE__ */ (0, import_react2.createElement)(
    "input",
    {
      className: "vxa-input vxa-input-mono",
      type: reveal ? "text" : "password",
      autoComplete: "off",
      spellCheck: false,
      value: draft.key,
      placeholder: provider.key_configured ? "\u7559\u7A7A\u5219\u4FDD\u6301\u5DF2\u4FDD\u5B58\u7684\u5BC6\u94A5" : "\u8F93\u5165 API \u5BC6\u94A5",
      "aria-label": "API \u5BC6\u94A5",
      disabled: busy,
      onChange: (event) => {
        set("key", event.target.value);
      }
    }
  ), /* @__PURE__ */ (0, import_react2.createElement)(
    "button",
    {
      type: "button",
      className: "vxa-key-toggle",
      "aria-label": reveal ? "\u9690\u85CF\u5BC6\u94A5" : "\u663E\u793A\u5BC6\u94A5",
      onClick: () => {
        setReveal((current) => !current);
      }
    },
    /* @__PURE__ */ (0, import_react2.createElement)(EyeIcon, { open: reveal })
  )), /* @__PURE__ */ (0, import_react2.createElement)("span", { className: provider.key_configured ? "vxa-hint vxa-hint-ok" : "vxa-hint" }, provider.key_configured ? "\u5DF2\u4FDD\u5B58\u5BC6\u94A5\uFF1B\u7559\u7A7A\u4FDD\u5B58\u5373\u6CBF\u7528\u3002" : "\u5C1A\u672A\u4FDD\u5B58\u5BC6\u94A5\uFF0C\u5FC5\u987B\u586B\u5199\u540E\u624D\u80FD\u8C03\u7528\u6A21\u578B\u3002")), /* @__PURE__ */ (0, import_react2.createElement)("label", { className: "vxa-field" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-label" }, "\u663E\u793A\u540D\u79F0"), /* @__PURE__ */ (0, import_react2.createElement)(
    "input",
    {
      className: "vxa-input",
      value: draft.name,
      placeholder: provider.id,
      "aria-label": "\u663E\u793A\u540D\u79F0",
      disabled: busy,
      onChange: (event) => {
        set("name", event.target.value);
      }
    }
  )), /* @__PURE__ */ (0, import_react2.createElement)("details", { className: "vxa-fold", open: true }, /* @__PURE__ */ (0, import_react2.createElement)("summary", { className: "vxa-fold-summary" }, "\u81EA\u5B9A\u4E49\u8BBE\u7F6E"), /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-fold-body" }, /* @__PURE__ */ (0, import_react2.createElement)("label", { className: "vxa-field" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-label" }, "API \u5730\u5740"), /* @__PURE__ */ (0, import_react2.createElement)(
    "input",
    {
      className: "vxa-input vxa-input-mono",
      value: draft.base,
      placeholder: "https://api.example.com/v1",
      "aria-label": "API \u5730\u5740",
      disabled: busy,
      onChange: (event) => {
        set("base", event.target.value);
      }
    }
  ), /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-hint" }, "\u517C\u5BB9 OpenAI chat/completions \u7684\u6839\u5730\u5740\uFF1B\u6539\u52A8\u540E\u4F1A\u5411\u4E0A\u6E38\u91CD\u65B0\u9A8C\u8BC1\u4E00\u6B21\u3002")), /* @__PURE__ */ (0, import_react2.createElement)("label", { className: "vxa-field" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-label" }, "\u91CD\u8BD5\u7B56\u7565"), /* @__PURE__ */ (0, import_react2.createElement)(
    "select",
    {
      className: "vxa-input vxa-select",
      value: draft.retry,
      "aria-label": "\u91CD\u8BD5\u7B56\u7565",
      disabled: busy,
      onChange: (event) => {
        set("retry", event.target.value === "always" ? "always" : "normal");
      }
    },
    /* @__PURE__ */ (0, import_react2.createElement)("option", { value: "normal" }, "\u9ED8\u8BA4\uFF08\u4EC5\u4E34\u65F6\u9519\u8BEF\uFF09"),
    /* @__PURE__ */ (0, import_react2.createElement)("option", { value: "always" }, "\u6240\u6709\u9519\u8BEF")
  ), /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-hint" }, draft.retry === "always" ? "\u5931\u8D25\u7684\u8BF7\u6C42\u4F1A\u6301\u7EED\u91CD\u8BD5\uFF0C\u76F4\u5230\u6210\u529F\u6216\u672C\u8F6E\u88AB\u505C\u6B62\u3002" : "\u53EA\u91CD\u8BD5\u9650\u6D41\u3001\u8D85\u65F6\u3001\u670D\u52A1\u7AEF\u4E0E\u7F51\u7EDC\u8FD9\u7C7B\u4E34\u65F6\u9519\u8BEF\uFF0C\u6700\u591A 5 \u6B21\u3002")))), /* @__PURE__ */ (0, import_react2.createElement)(
    ModelCatalog,
    {
      models: draft.models,
      disabled: busy,
      onChange: (models) => {
        set("models", models);
      }
    }
  ), failure !== "" && /* @__PURE__ */ (0, import_react2.createElement)("p", { className: "vxa-error", role: "alert" }, failure), /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-editor-footer" }, /* @__PURE__ */ (0, import_react2.createElement)("button", { type: "button", className: "vxa-btn", disabled: busy, onClick: onCancel }, "\u53D6\u6D88"), /* @__PURE__ */ (0, import_react2.createElement)("button", { type: "button", className: "vxa-btn-primary", disabled: busy, onClick: submit }, busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58")));
}
function AddProviderCard({ busy, error, onClearError, onCancel, onSubmit }) {
  const [kind, setKind] = (0, import_react2.useState)("deepseek");
  const [name, setName] = (0, import_react2.useState)("");
  const [base, setBase] = (0, import_react2.useState)("");
  const [key, setKey] = (0, import_react2.useState)("");
  const [models, setModels] = (0, import_react2.useState)([]);
  const [failure, setFailure] = (0, import_react2.useState)("");
  const changeKind = (next) => {
    if (next === kind) return;
    setKind(next);
    setKey("");
    setFailure("");
    onClearError();
  };
  const submit = (event) => {
    event.preventDefault();
    onClearError();
    if (key.trim() === "") {
      setFailure("\u8BF7\u8F93\u5165 API \u5BC6\u94A5\u3002");
      return;
    }
    if (kind === "custom" && (name.trim() === "" || base.trim() === "")) {
      setFailure("\u8BF7\u586B\u5199\u540D\u79F0\u4E0E API \u5730\u5740\u3002");
      return;
    }
    if (kind === "custom" && models.some((model) => model.id.trim() === "")) {
      setFailure("\u8BF7\u586B\u5199\u6BCF\u4E00\u884C\u7684\u6A21\u578B ID\u3002");
      return;
    }
    setFailure("");
    onSubmit({ kind, name: name.trim(), base: base.trim(), key: key.trim(), models: kind === "custom" ? models : [] });
  };
  return /* @__PURE__ */ (0, import_react2.createElement)("form", { className: "vxa-add-card", onSubmit: submit }, /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-modes", role: "group", "aria-label": "\u6DFB\u52A0\u65B9\u5F0F" }, /* @__PURE__ */ (0, import_react2.createElement)(
    "button",
    {
      type: "button",
      className: "vxa-mode",
      "aria-pressed": kind === "deepseek",
      disabled: busy,
      onClick: () => {
        changeKind("deepseek");
      }
    },
    "DeepSeek \u5B98\u65B9"
  ), /* @__PURE__ */ (0, import_react2.createElement)(
    "button",
    {
      type: "button",
      className: "vxa-mode",
      "aria-pressed": kind === "custom",
      disabled: busy,
      onClick: () => {
        changeKind("custom");
      }
    },
    "\u81EA\u5B9A\u4E49\u6A21\u578B API"
  )), kind === "custom" ? /* @__PURE__ */ (0, import_react2.createElement)(import_react2.Fragment, null, /* @__PURE__ */ (0, import_react2.createElement)("label", { className: "vxa-field" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-label" }, "\u540D\u79F0"), /* @__PURE__ */ (0, import_react2.createElement)(
    "input",
    {
      className: "vxa-input",
      value: name,
      placeholder: "\u4E2D\u8F6C\u7AD9\u3001\u81EA\u5EFA\u7F51\u5173\u6216\u670D\u52A1\u5546\u540D\u79F0",
      "aria-label": "\u540D\u79F0",
      disabled: busy,
      onChange: (event) => {
        setName(event.target.value);
      }
    }
  )), /* @__PURE__ */ (0, import_react2.createElement)("label", { className: "vxa-field" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-label" }, "API \u5730\u5740"), /* @__PURE__ */ (0, import_react2.createElement)(
    "input",
    {
      className: "vxa-input vxa-input-mono",
      value: base,
      placeholder: "https://api.example.com/v1",
      "aria-label": "API \u5730\u5740",
      disabled: busy,
      onChange: (event) => {
        setBase(event.target.value);
      }
    }
  ), /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-hint" }, "\u586B\u5199 OpenAI \u517C\u5BB9 API \u6839\u5730\u5740\u6216\u5B8C\u6574\u7684 chat/completions \u5730\u5740\u3002"))) : /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-hint" }, "DeepSeek \u5B98\u65B9\u7AEF\u70B9 https://api.deepseek.com\uFF0C\u53EA\u9700\u586B API \u5BC6\u94A5\u3002"), /* @__PURE__ */ (0, import_react2.createElement)("label", { className: "vxa-field" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-label" }, "API \u5BC6\u94A5"), /* @__PURE__ */ (0, import_react2.createElement)(
    "input",
    {
      className: "vxa-input vxa-input-mono",
      type: "password",
      autoComplete: "off",
      spellCheck: false,
      value: key,
      placeholder: "sk-\u2026",
      "aria-label": "API \u5BC6\u94A5",
      disabled: busy,
      onChange: (event) => {
        setKey(event.target.value);
      }
    }
  )), kind === "custom" && /* @__PURE__ */ (0, import_react2.createElement)(import_react2.Fragment, null, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-hint" }, "\u7559\u7A7A\u4F1A\u8BFB\u53D6\u4E0A\u6E38\u6A21\u578B\u5217\u8868\u3002\u4E5F\u53EF\u624B\u52A8\u586B\u5199\u6A21\u578B ID\uFF0C\u4FDD\u5B58\u524D\u4F1A\u5411\u7B2C\u4E00\u4E2A\u6A21\u578B\u53D1\u9001\u4E00\u6761\u6D4B\u8BD5\u8BF7\u6C42\u3002"), /* @__PURE__ */ (0, import_react2.createElement)(ModelCatalog, { models, disabled: busy, onChange: setModels })), (failure || error) !== "" && /* @__PURE__ */ (0, import_react2.createElement)("p", { className: "vxa-error", role: "alert" }, failure || error), /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-editor-footer" }, /* @__PURE__ */ (0, import_react2.createElement)("button", { type: "button", className: "vxa-btn", disabled: busy, onClick: onCancel }, "\u53D6\u6D88"), /* @__PURE__ */ (0, import_react2.createElement)("button", { type: "submit", className: "vxa-btn-primary", disabled: busy }, busy ? "\u9A8C\u8BC1\u4E2D\u2026" : "\u6DFB\u52A0")));
}
function ModelsSection() {
  const { account, error, onError, update } = useAccount();
  const [editing, setEditing] = (0, import_react2.useState)();
  const [adding, setAdding] = (0, import_react2.useState)(false);
  const [confirming, setConfirming] = (0, import_react2.useState)();
  const [catalogOpen, setCatalogOpen] = (0, import_react2.useState)(false);
  const [busy, setBusy] = (0, import_react2.useState)(false);
  if (account === void 0) {
    return /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-section", role: "status" }, error || "\u6B63\u5728\u8BFB\u53D6\u6A21\u578B\u63D0\u4F9B\u65B9\u2026");
  }
  if (!account.signed_in) {
    return /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-section" }, /* @__PURE__ */ (0, import_react2.createElement)("h2", { className: "vxa-title" }, "\u6A21\u578B"), /* @__PURE__ */ (0, import_react2.createElement)("p", { className: "vxa-intro" }, "\u8BF7\u5148\u767B\u5F55 VEXNAR\uFF0C\u518D\u7BA1\u7406\u6A21\u578B\u63D0\u4F9B\u65B9\u3002"), error !== "" && /* @__PURE__ */ (0, import_react2.createElement)("p", { className: "vxa-error", role: "alert" }, error));
  }
  const platformRoute = account.providers.find((provider) => provider.id === platformProviderID);
  const editable = account.providers.filter((provider) => provider.id !== platformProviderID);
  const run = async (action) => {
    setBusy(true);
    onError("");
    try {
      update(await action());
      return true;
    } catch (reason) {
      onError(reason);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-section" }, /* @__PURE__ */ (0, import_react2.createElement)("h2", { className: "vxa-title" }, "\u6A21\u578B"), /* @__PURE__ */ (0, import_react2.createElement)("p", { className: "vxa-intro" }, "\u586B\u5165\u5404\u63D0\u4F9B\u5546\u7684 API \u5BC6\u94A5\u5373\u53EF\u4F7F\u7528\u5176\u6A21\u578B\u3002"), /* @__PURE__ */ (0, import_react2.createElement)("ul", { className: "vxa-rows" }, /* @__PURE__ */ (0, import_react2.createElement)("li", { className: "vxa-row" }, /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-row-head" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-row-identity" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-row-name" }, "\u5E0C\u7075AI Platform"), /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-account-status" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-dot", "aria-hidden": "true" }), "\u5DF2\u767B\u5F55")), /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-row-actions" }, /* @__PURE__ */ (0, import_react2.createElement)(
    "button",
    {
      type: "button",
      className: "vxa-row-quiet",
      "aria-expanded": catalogOpen,
      onClick: () => {
        setCatalogOpen((current) => !current);
      }
    },
    platformRoute === void 0 ? "\u5E73\u53F0\u672A\u7B7E\u53D1\u6A21\u578B" : `${platformRoute.models.length} \u4E2A\u6A21\u578B`
  ))), catalogOpen && platformRoute !== void 0 && /* @__PURE__ */ (0, import_react2.createElement)("ul", { className: "vxa-catalog-plain" }, platformRoute.models.map((model) => /* @__PURE__ */ (0, import_react2.createElement)("li", { key: model.id, title: model.id }, model.name || model.id)))), editable.map((provider) => {
    const open = editing === provider.id;
    return /* @__PURE__ */ (0, import_react2.createElement)("li", { className: "vxa-row", key: provider.id }, /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-row-head" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-row-identity" }, /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-row-name" }, provider.name), provider.id.startsWith("custom-") && /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-row-tag" }, "\u81EA\u5B9A\u4E49"), /* @__PURE__ */ (0, import_react2.createElement)(
      "span",
      {
        className: provider.key_configured ? "vxa-dot" : "vxa-dot vxa-dot-missing",
        role: "img",
        "aria-label": provider.key_configured ? "API \u5BC6\u94A5\u5DF2\u914D\u7F6E" : "API \u5BC6\u94A5\u7F3A\u5931",
        title: provider.key_configured ? "API \u5BC6\u94A5\u5DF2\u914D\u7F6E" : "API \u5BC6\u94A5\u7F3A\u5931"
      }
    )), /* @__PURE__ */ (0, import_react2.createElement)("span", { className: "vxa-row-actions" }, confirming === provider.id ? /* @__PURE__ */ (0, import_react2.createElement)(import_react2.Fragment, null, /* @__PURE__ */ (0, import_react2.createElement)(
      "button",
      {
        type: "button",
        className: "vxa-btn-sm vxa-btn-sm-danger",
        disabled: busy,
        onClick: () => {
          void run(() => request("/providers", "DELETE", { id: provider.id })).then((done) => {
            if (done) setConfirming(void 0);
          });
        }
      },
      "\u786E\u8BA4\u5220\u9664"
    ), /* @__PURE__ */ (0, import_react2.createElement)("button", { type: "button", className: "vxa-btn-sm", disabled: busy, onClick: () => {
      setConfirming(void 0);
    } }, "\u53D6\u6D88")) : /* @__PURE__ */ (0, import_react2.createElement)(import_react2.Fragment, null, /* @__PURE__ */ (0, import_react2.createElement)(
      "button",
      {
        type: "button",
        className: "vxa-btn-sm",
        disabled: busy,
        "aria-label": `\u7F16\u8F91 ${provider.name}`,
        onClick: () => {
          setAdding(false);
          setConfirming(void 0);
          setEditing(open ? void 0 : provider.id);
        }
      },
      "\u7F16\u8F91"
    ), /* @__PURE__ */ (0, import_react2.createElement)(
      "button",
      {
        type: "button",
        className: "vxa-btn-sm vxa-btn-sm-danger",
        disabled: busy,
        "aria-label": `\u5220\u9664 ${provider.name}`,
        onClick: () => {
          setEditing(void 0);
          setConfirming(provider.id);
        }
      },
      "\u5220\u9664"
    )))), open && /* @__PURE__ */ (0, import_react2.createElement)(
      ProviderEditor,
      {
        provider,
        busy,
        onCancel: () => {
          setEditing(void 0);
        },
        onSave: (draft) => {
          void run(() => request("/providers", "PATCH", {
            id: provider.id,
            name: draft.name,
            base_url: draft.base,
            api_key: draft.key,
            retry: draft.retry,
            models: draft.models
          })).then((done) => {
            if (done) setEditing(void 0);
          });
        }
      }
    ));
  })), /* @__PURE__ */ (0, import_react2.createElement)("div", { className: "vxa-add-block" }, adding ? /* @__PURE__ */ (0, import_react2.createElement)(
    AddProviderCard,
    {
      busy,
      error,
      onClearError: () => {
        onError("");
      },
      onCancel: () => {
        setAdding(false);
        onError("");
      },
      onSubmit: (input) => {
        void run(() => request("/providers", "POST", {
          kind: input.kind,
          name: input.name,
          base_url: input.base,
          api_key: input.key,
          models: input.models
        })).then((done) => {
          if (done) setAdding(false);
        });
      }
    }
  ) : /* @__PURE__ */ (0, import_react2.createElement)(
    "button",
    {
      type: "button",
      className: "vxa-btn-add",
      disabled: busy,
      onClick: () => {
        setEditing(void 0);
        setConfirming(void 0);
        onError("");
        setAdding(true);
      }
    },
    /* @__PURE__ */ (0, import_react2.createElement)(PlusIcon, { size: 14 }),
    "\u6DFB\u52A0\u6A21\u578B\u63D0\u4F9B\u5546"
  )), !adding && error !== "" && /* @__PURE__ */ (0, import_react2.createElement)("p", { className: "vxa-error", role: "alert" }, error));
}
function apply(ctx) {
  installAccountStyles();
  ctx.slots.inject("settings.launcher", () => ctx.slots.register({ name: "settings.launcher" }, AccountLauncher));
  ctx.slots.inject("settings.section", () => {
    ctx.slots.register({ name: "settings.section", id: "vexnar-account", label: "\u4E2A\u4EBA\u8D44\u6599", order: -100 }, AccountSection);
    return ctx.slots.register({ name: "settings.section", id: "models", label: "\u6A21\u578B", order: 10 }, ModelsSection);
  });
}
var inject = ["slots"];
var client_default = { name: "@vexnar/dsh-account", inject, apply };

return module.exports;
}});
