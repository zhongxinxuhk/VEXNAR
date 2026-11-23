window.__ModuleLoader__.load({ id: "@vexnar/dsh-ui", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  Dashboard: () => Dashboard,
  FindingCard: () => FindingCard,
  TaskDetail: () => TaskDetail,
  TaskList: () => TaskList,
  TrafficViewer: () => TrafficViewer,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react16 = require("react");

// src/styles.ts
var STYLE_ID = "vexnar-dsh-ui-styles";
var VEXNAR_CSS = `
/* \u2500\u2500 token bridge \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Alias layer only: static palette and dark switching stay owned by dsh. */
body {
  --vx-surface: var(--dsw-alias-bg-layer-2, #ffffff);
  --vx-surface-sunken: var(--dsw-alias-bg-layer-1, #f6f7f9);
  --vx-border: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.10));
  --vx-border-strong: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  --vx-text: var(--dsw-alias-label-primary, #111827);
  --vx-text-dim: var(--dsw-alias-label-secondary, #6b7280);
  --vx-text-faint: var(--dsw-alias-label-tertiary, #9ca3af);
  --vx-accent: var(--dsw-alias-border-selected, #9aa3ad);
  --vx-negative: var(--dsw-static-red-500, #ef4444);
  --vx-radius: var(--dsw-radius-md, 12px);
  --vx-radius-sm: var(--dsw-radius-sm, 8px);
  --vx-elevation: var(--dsw-elevation-panel, 0 1px 2px rgba(0, 0, 0, 0.06));
  --vx-mono: var(--ds-font-family-code, var(--dsw-font-family-code,
      "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace));
  --vx-ease: var(--ds-ease-in-out, cubic-bezier(0.4, 0, 0.2, 1));
  --vx-dur: var(--ds-transition-duration, 0.2s);
  --vx-dur-fast: var(--ds-transition-duration-fast, 0.1s);
  /* Chart palette: static hue steps only, so a skin/retheme keeps the data
     legible instead of tinting every series the same. */
  --vx-chart-1: var(--dsw-static-blue-500, #3b82f6);
  --vx-chart-2: var(--dsw-static-violet-400, #a78bfa);
  --vx-chart-3: var(--dsw-static-green-500, #22c55e);
  --vx-chart-4: var(--dsw-static-amber-500, #f59e0b);
  --vx-chart-5: var(--dsw-static-red-500, #ef4444);
  --vx-chart-6: var(--dsw-static-deepseek-400, #4d6bfe);
  --vx-chart-grid: var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
  --vx-chart-axis: var(--dsw-alias-label-tertiary, #9ca3af);
  --vx-glass: var(--dsw-specific-menu, var(--vx-surface));
}

/* \u2500\u2500 severity \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   One variable per level; light uses the 500 step, dark the 400 step so text
   keeps AA contrast on the darker surface. */
.vx-sev-critical { --vx-sev: var(--dsw-static-red-500, #ef4444); }
.vx-sev-high { --vx-sev: var(--dsw-static-amber-600, #dd8629); }
.vx-sev-medium { --vx-sev: var(--dsw-static-amber-500, #f59e0b); }
.vx-sev-low { --vx-sev: var(--dsw-static-green-500, #22c55e); }
.vx-sev-info { --vx-sev: var(--dsw-static-blue-500, #3b82f6); }
.vx-sev-none { --vx-sev: var(--vx-text-dim); }

body[data-ds-dark-theme] .vx-sev-critical { --vx-sev: var(--dsw-static-red-400, #f25a5a); }
body[data-ds-dark-theme] { --vx-negative: var(--dsw-static-red-400, #f25a5a); }
body[data-ds-dark-theme] .vx-sev-high { --vx-sev: var(--dsw-static-amber-400, #f7ad31); }
body[data-ds-dark-theme] .vx-sev-medium { --vx-sev: var(--dsw-static-amber-400, #f7ad31); }
body[data-ds-dark-theme] .vx-sev-low { --vx-sev: var(--dsw-static-green-400, #4ed17e); }
body[data-ds-dark-theme] .vx-sev-info { --vx-sev: var(--dsw-static-blue-400, #60a5fa); }

/* \u2500\u2500 card shell \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   A tool card is one elevated surface: hairline border + soft shadow, never a
   second background colour, so a run of cards reads as a stack rather than a
   patchwork. */
.vx-card {
  margin: 8px 0;
  padding: 12px 14px;
  border: 1px solid var(--vx-border);
  border-radius: var(--vx-radius);
  background: var(--vx-surface);
  box-shadow: var(--vx-elevation);
  color: var(--vx-text);
  font-size: 14px;
  line-height: 22px;
  animation: vx-card-in var(--vx-dur) var(--vx-ease) both;
}

.vx-card[data-error="1"] {
  border-color: color-mix(in srgb, var(--vx-negative) 45%, var(--vx-border));
  background: color-mix(in srgb, var(--vx-negative) 5%, var(--vx-surface));
}

.vx-card + .vx-card { margin-top: 6px; }

.vx-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.vx-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 42ch;
}

.vx-title--mono { font-family: var(--vx-mono); font-size: 12px; }

.vx-meta {
  color: var(--vx-text-dim);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.vx-meta--faint { color: var(--vx-text-faint); }

.vx-spacer { margin-left: auto; }

/* \u2500\u2500 chips \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Severity/status chips carry a leading dot: the dot survives greyscale and
   colour-blind palettes, the hue only reinforces it. */
.vx-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 20px;
  padding: 0 8px;
  border: 1px solid var(--vx-border-strong);
  border-radius: var(--dsw-radius-xl, 20px);
  background: transparent;
  color: var(--vx-text);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.vx-chip--sev {
  border-color: color-mix(in srgb, var(--vx-sev) 45%, transparent);
  color: var(--vx-sev);
}

.vx-chip--sev .vx-dot { background: var(--vx-sev); }

.vx-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex: none;
}

.vx-chip--action {
  cursor: pointer;
  color: var(--vx-text-dim);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  transition: background var(--vx-dur-fast) var(--vx-ease),
    border-color var(--vx-dur-fast) var(--vx-ease), color var(--vx-dur-fast) var(--vx-ease);
}

.vx-chip--action:hover {
  background: var(--vx-surface-sunken);
  border-color: var(--vx-accent);
  color: var(--vx-text);
}

.vx-chip--action:focus-visible {
  outline: 2px solid var(--vx-accent);
  outline-offset: 2px;
}

/* \u2500\u2500 segmented control (HTTP \u5934 / \u6B63\u6587) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--vx-border);
  border-radius: var(--dsw-radius-xl, 20px);
  background: var(--vx-surface-sunken);
}

.vx-seg > button {
  border: 0;
  padding: 1px 10px;
  border-radius: var(--dsw-radius-xl, 20px);
  background: transparent;
  color: var(--vx-text-dim);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  cursor: pointer;
  transition: background var(--vx-dur-fast) var(--vx-ease), color var(--vx-dur-fast) var(--vx-ease);
}

.vx-seg > button:hover { color: var(--vx-text); }

.vx-seg > button[aria-pressed="true"] {
  background: var(--vx-surface);
  color: var(--vx-text);
  box-shadow: var(--dsw-shadow-lv1, 0 1px 2px rgba(0, 0, 0, 0.08));
}

.vx-seg > button:focus-visible {
  outline: 2px solid var(--vx-accent);
  outline-offset: 1px;
}

/* \u2500\u2500 code / payload \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-pre {
  margin: 8px 0 0;
  padding: 10px 12px;
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--vx-border);
  border-radius: var(--vx-radius-sm);
  background: var(--vx-surface-sunken);
  color: var(--vx-text);
  font-family: var(--vx-mono);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.vx-pre--tight { max-height: 160px; }

.vx-failed {
  margin-top: 8px;
  color: var(--vx-negative);
  font-size: 12px;
  font-weight: 600;
}

/* \u2500\u2500 loading \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--vx-text-dim);
  font-size: 13px;
}

.vx-loading::before {
  content: "";
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid var(--vx-border-strong);
  border-top-color: var(--vx-text-dim);
  animation: vx-spin 0.8s linear infinite;
}

/* \u2500\u2500 brand slots \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-mark { display: block; }

/* The skin's brand nodes are rewritten in place. Size the injected mark from
   the skin's own lockup unit (--dsh-claude-lockup-cap: an 18px unit times a
   responsive 1.75/1.35/1.1 scale) so the logo fits the row the skin reserved,
   clamped so a narrow window cannot blow it up. Backticks are not allowed in
   this string: the whole sheet is a template literal. */
.vx-brand-logo {
  display: block;
  flex: none;
  width: clamp(22px, var(--dsh-claude-lockup-cap, 26px), 34px);
  height: clamp(22px, var(--dsh-claude-lockup-cap, 26px), 34px);
  border-radius: 22%;
  object-fit: contain;
}

.vx-brand-word {
  font-family: var(--dsw-font-family-brand, var(--dsw-font-family, inherit));
  font-size: clamp(15px, calc(var(--dsh-claude-lockup-cap, 26px) * 0.82), 26px);
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.2;
  color: inherit;
}

.vx-brand-name {
  font-family: var(--dsw-font-family-brand, var(--dsw-font-family, inherit));
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--dsw-alias-brand-text, var(--vx-text));
}

/* The hero headline has no slot; the plugin rewrites its text and marks it.
   A vertical fade keeps the home screen from reading as flat black text.
   The gradient only applies where background-clip:text exists \u2014 without the
   guard, an unsupporting engine would paint transparent text on nothing. */
@supports ((-webkit-background-clip: text) or (background-clip: text)) {
  [data-vexnar-slogan="1"] {
    background-image: linear-gradient(
      180deg,
      var(--dsw-alias-label-primary, #111827) 35%,
      var(--dsw-alias-label-tertiary, #9ca3af) 100%
    );
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
  }
}

/* \u2500\u2500 \u6982\u89C8\uFF1AWeb \u4EEA\u8868\u76D8\u5728\u65B0\u4F1A\u8BDD\u9875\u7684\u590D\u523B \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Two surfaces share every rule: '.vx-ov' (dock above the New Session
   composer) and '.vx-ov-page' (the sidebar \u6982\u89C8 page). Colour comes from the
   '--vx-chart-*' static steps, layout from the composer's own clearance
   variables, so the card lines up with the input card above which it sits. */
body[data-ds-dark-theme] {
  --vx-chart-1: var(--dsw-static-blue-400, #60a5fa);
  --vx-chart-2: var(--dsw-static-violet-400, #a78bfa);
  --vx-chart-3: var(--dsw-static-green-400, #4ed17e);
  --vx-chart-4: var(--dsw-static-amber-400, #f7ad31);
  --vx-chart-5: var(--dsw-static-red-400, #f25a5a);
  --vx-chart-6: var(--dsw-static-deepseek-300, #8aa0ff);
  --vx-chart-grid: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
}

.vx-ov-tone-blue { --vx-tone: var(--vx-chart-1); }
.vx-ov-tone-violet { --vx-tone: var(--vx-chart-2); }
.vx-ov-tone-green { --vx-tone: var(--vx-chart-3); }
.vx-ov-tone-amber { --vx-tone: var(--vx-chart-4); }
.vx-ov-tone-red { --vx-tone: var(--vx-chart-5); }

/* \u2500\u2500 \u6982\u89C8\u6574\u9875 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   \u53EA\u4FDD\u7559\u53F3\u4E0A\u89D2\u7684\u65E5\u671F\u7B5B\u9009\uFF1B\u5176\u4F59\u5168\u90E8\u662F\u6570\u636E\u533A\u5757\u3002\u5361\u7247 14px \u5706\u89D2 + \u9876\u90E8\u5185\u9AD8\u5149\uFF0C
   \u7F51\u683C 12 \u5217\uFF0C\u7A84\u7A97\u53E3\u964D\u4E3A\u4E24\u5217 / \u5355\u5217\u3002 */
.vx-ov-page {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 16px 22px 44px;
  overflow-y: auto;
  color: var(--vx-text);
  font-size: 12px;
  line-height: 1.45;
}

.vx-ov-page,
.vx-ov-page * { box-sizing: border-box; }

/* \u2500\u2500 \u65E5\u671F\u7B5B\u9009 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-toolbar {
  position: sticky;
  top: -16px;
  z-index: 3;
  display: flex;
  justify-content: center;
  margin: 0 -22px;
  padding: 8px 22px 10px;
  background: linear-gradient(180deg, var(--vx-surface) 55%, transparent);
  backdrop-filter: blur(6px);
}

.vx-ov-seg {
  position: relative;
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--vx-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--vx-text) 5%, transparent);
  box-shadow: inset 0 1px 2px color-mix(in srgb, #000 6%, transparent);
}

.vx-ov-seg-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  border-radius: 9px;
  border: 1px solid color-mix(in srgb, var(--vx-border) 75%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--vx-surface) 92%, var(--vx-chart-1) 8%), var(--vx-surface));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1), 0 8px 18px -12px color-mix(in srgb, var(--vx-chart-1) 70%, transparent);
  transition: transform 0.32s var(--vx-ease);
  pointer-events: none;
}

.vx-ov-seg > button {
  position: relative;
  z-index: 1;
  min-width: 58px;
  padding: 5px 12px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--vx-text-dim);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: color 0.18s var(--vx-ease);
}

.vx-ov-seg > button:hover { color: var(--vx-text); }
.vx-ov-seg > button[aria-pressed="true"] { color: var(--vx-text); }
.vx-ov-seg > button:focus-visible { outline: 2px solid var(--vx-accent); outline-offset: 2px; }

/* \u2500\u2500 KPI \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.vx-ov-stat {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 12px 13px 9px;
  overflow: hidden;
  border: 1px solid var(--vx-border);
  border-radius: 14px;
  background:
    linear-gradient(150deg, color-mix(in srgb, var(--vx-tone) 13%, transparent), transparent 56%),
    color-mix(in srgb, var(--vx-surface) 80%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 45%, transparent);
  transition: transform 0.2s var(--vx-ease), border-color 0.2s var(--vx-ease), box-shadow 0.2s var(--vx-ease);
}

.vx-ov-stat:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--vx-tone) 40%, var(--vx-border));
  box-shadow: 0 16px 30px -24px color-mix(in srgb, var(--vx-tone) 95%, transparent);
}

.vx-ov-stat-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 10.5px;
  color: var(--vx-text-dim);
}

.vx-ov-stat-icon {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 6px;
  color: var(--vx-tone);
  background: color-mix(in srgb, var(--vx-tone) 15%, transparent);
}

.vx-ov-stat-label {
  flex: none;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: var(--vx-text);
}

.vx-ov-stat-top .vx-ov-delta { margin-left: auto; }

.vx-ov-stat-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 27px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.025em;
  font-variant-numeric: tabular-nums;
}

.vx-ov-stat-value em {
  font-style: normal;
  font-size: 12px;
  font-weight: 600;
  color: var(--vx-text-faint);
}

.vx-ov-stat-foot {
  min-height: 12px;
  font-size: 9.5px;
  color: var(--vx-text-faint);
}

.vx-ov-stat-band { margin-top: 3px; }

.vx-ov-codebar {
  display: flex;
  width: 100%;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vx-text) 8%, transparent);
}

.vx-ov-codebar i { display: block; height: 100%; min-width: 2px; }
.vx-ov-codebar i + i { margin-left: 1px; }
.vx-ov-codebar--empty { opacity: 0.5; }

.vx-ov-spark {
  display: block;
  width: 100%;
  margin-top: 2px;
  opacity: 0.82;
  pointer-events: none;
}

/* \u2500\u2500 \u73AF\u6BD4\u5FBD\u6807 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-delta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px 1px 4px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.vx-ov-delta em {
  margin-left: 2px;
  font-style: normal;
  font-weight: 500;
  color: var(--vx-text-faint);
}

.vx-ov-delta[data-dir="up"] {
  color: var(--vx-chart-4);
  border-color: color-mix(in srgb, var(--vx-chart-4) 32%, transparent);
  background: color-mix(in srgb, var(--vx-chart-4) 10%, transparent);
}

.vx-ov-delta[data-dir="down"] {
  color: var(--vx-chart-3);
  border-color: color-mix(in srgb, var(--vx-chart-3) 32%, transparent);
  background: color-mix(in srgb, var(--vx-chart-3) 10%, transparent);
}

.vx-ov-delta[data-dir="flat"] {
  color: var(--vx-text-dim);
  border-color: color-mix(in srgb, var(--vx-border) 90%, transparent);
}

/* \u2500\u2500 \u7F51\u683C\u4E0E\u533A\u5757 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 10px;
}

.vx-ov-span-4 { grid-column: span 4; }
.vx-ov-span-6 { grid-column: span 6; }
.vx-ov-span-8 { grid-column: span 8; }
.vx-ov-span-12 { grid-column: span 12; }

.vx-ov-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  border: 1px solid var(--vx-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--vx-surface) 76%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 30%, transparent);
}

.vx-ov-card-body {
  flex: 1;
  min-height: 0;
  padding: 10px 13px 12px;
}

.vx-ov-h {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 11px 13px 0;
  min-width: 0;
}

.vx-ov-h > svg { flex: none; color: var(--vx-text-faint); }

.vx-ov-h h3 {
  margin: 0;
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: 0.015em;
  white-space: nowrap;
}

.vx-ov-sub {
  overflow: hidden;
  font-size: 9.5px;
  font-weight: 500;
  color: var(--vx-text-faint);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ov-h-action { margin-left: auto; }

.vx-ov-legend {
  display: flex;
  gap: 9px;
  font-size: 9.5px;
  color: var(--vx-text-faint);
}

.vx-ov-legend span { display: inline-flex; align-items: center; white-space: nowrap; }

.vx-ov-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 3px;
  flex: none;
  border-radius: 50%;
  vertical-align: middle;
}

.vx-ov-chips { display: inline-flex; flex-wrap: wrap; gap: 2px 8px; }

.vx-ov-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.vx-ov-chip--muted { color: var(--vx-text-faint); }

/* \u2500\u2500 Token \u533A\u5757 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-token {
  display: grid;
  grid-template-columns: minmax(0, 186px) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}

.vx-ov-token-metrics {
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-width: 0;
}

.vx-ov-token-total > span { font-size: 10px; color: var(--vx-text-dim); }

.vx-ov-token-total > strong {
  display: block;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.08;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

.vx-ov-token-total .vx-ov-delta { margin-top: 4px; }

.vx-ov-meter { display: flex; flex-direction: column; gap: 4px; }

.vx-ov-meter-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 9.5px;
  color: var(--vx-text-dim);
}

.vx-ov-meter-top b {
  font-family: var(--vx-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.vx-ov-meter-track {
  display: block;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vx-text) 8%, transparent);
}

.vx-ov-meter-track i {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.6s var(--vx-ease);
}

.vx-ov-mini-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--vx-text-faint);
  font-variant-numeric: tabular-nums;
}

.vx-ov-chart { min-width: 0; }

.vx-ov-plot { position: relative; width: 100%; min-width: 0; }

.vx-ov-axis {
  fill: var(--vx-chart-axis);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.vx-ov-draw { animation: vx-ov-fade 0.6s var(--vx-ease) both; }

.vx-ov-tip {
  position: absolute;
  z-index: 3;
  min-width: 136px;
  padding: 7px 9px;
  transform: translateX(-50%);
  border: 1px solid var(--vx-border-strong);
  border-radius: 10px;
  background: var(--vx-glass);
  box-shadow: 0 14px 30px -18px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  font-size: 10px;
  line-height: 1.5;
  pointer-events: none;
}

.vx-ov-tip-day {
  margin-bottom: 3px;
  font-family: var(--vx-mono);
  font-size: 9px;
  color: var(--vx-text-faint);
}

.vx-ov-tip-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--vx-text-dim);
}

.vx-ov-tip-row span { display: inline-flex; align-items: center; }
.vx-ov-tip-row b { color: var(--vx-text); font-weight: 600; font-variant-numeric: tabular-nums; }

.vx-ov-tip-total {
  margin-top: 3px;
  padding-top: 3px;
  border-top: 1px solid color-mix(in srgb, var(--vx-border) 70%, transparent);
}

/* \u2500\u2500 \u6548\u7387 / \u73AF\u5F62 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-efficiency { display: flex; align-items: center; gap: 16px; }

.vx-ov-ring {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.vx-ov-ring-box { position: relative; display: grid; place-items: center; }
.vx-ov-ring-box > svg { position: absolute; inset: 0; }

.vx-ov-ring-value {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.vx-ov-ring-label { font-size: 9.5px; font-weight: 600; color: var(--vx-text-dim); }

.vx-ov-ring-caption {
  max-width: 108px;
  overflow: hidden;
  font-size: 8.5px;
  color: var(--vx-text-faint);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ov-arc { transition: stroke-dasharray 0.7s var(--vx-ease), stroke-dashoffset 0.7s var(--vx-ease); }

.vx-ov-kv-list { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 5px; }

.vx-ov-kv-list > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 9.5px;
  color: var(--vx-text-dim);
}

.vx-ov-kv-list b {
  color: var(--vx-text);
  font-family: var(--vx-mono);
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* \u2500\u2500 \u73AF\u5F62\u56FE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-donut-row { display: flex; align-items: center; gap: 16px; }

.vx-ov-donut {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
}

.vx-ov-donut > svg { position: absolute; inset: 0; }

.vx-ov-donut-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
}

.vx-ov-donut-center b { font-size: 19px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.vx-ov-donut-center em { font-style: normal; font-size: 8.5px; color: var(--vx-text-faint); }

.vx-ov-legend-rows {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.vx-ov-legend-row {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto 34px;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--vx-text-dim);
}

.vx-ov-legend-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vx-ov-legend-row b { color: var(--vx-text); font-weight: 600; font-variant-numeric: tabular-nums; }
.vx-ov-legend-row em { font-style: normal; font-size: 9px; color: var(--vx-text-faint); text-align: right; font-variant-numeric: tabular-nums; }

/* \u2500\u2500 \u5206\u5E03\u6761 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-hbars { display: flex; flex-direction: column; gap: 7px; }

.vx-ov-hbar {
  display: grid;
  grid-template-columns: minmax(56px, 84px) minmax(0, 1fr) auto 32px;
  align-items: center;
  gap: 8px;
  font-size: 10px;
}

.vx-ov-hbar-label { color: var(--vx-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.vx-ov-hbar-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vx-text) 8%, transparent);
}

.vx-ov-hbar-track i {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.6s var(--vx-ease);
}

.vx-ov-hbar-value { color: var(--vx-text); font-variant-numeric: tabular-nums; }
.vx-ov-hbar-pct { color: var(--vx-text-faint); font-size: 9px; text-align: right; font-variant-numeric: tabular-nums; }

/* \u2500\u2500 \u4EFB\u52A1\u5065\u5EB7\u5EA6 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-health { display: flex; align-items: center; gap: 18px; }

.vx-ov-health-side {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.vx-ov-status-row {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  color: var(--vx-text-dim);
}

.vx-ov-status-row b { color: var(--vx-text); font-weight: 600; font-variant-numeric: tabular-nums; }

/* \u2500\u2500 \u70ED\u529B\u56FE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-heat-wrap { display: flex; flex-direction: column; gap: 8px; }

.vx-ov-heat {
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 3px;
  height: 124px;
}

.vx-ov-heat-cell {
  border-radius: 3px;
  background: color-mix(in srgb, var(--vx-text) 6%, transparent);
  transition: transform 0.15s var(--vx-ease), background 0.2s var(--vx-ease);
}

.vx-ov-heat-cell[data-level="pad"] { background: transparent; }
.vx-ov-heat-cell[data-level="1"] { background: color-mix(in srgb, var(--vx-chart-1) 24%, transparent); }
.vx-ov-heat-cell[data-level="2"] { background: color-mix(in srgb, var(--vx-chart-1) 44%, transparent); }
.vx-ov-heat-cell[data-level="3"] { background: color-mix(in srgb, var(--vx-chart-1) 68%, transparent); }
.vx-ov-heat-cell[data-level="4"] { background: var(--vx-chart-1); }
.vx-ov-heat-cell:hover { transform: scale(1.22); }

.vx-ov-heat-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  font-size: 9px;
  color: var(--vx-text-faint);
}

.vx-ov-heat-legend i {
  display: block;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--vx-text) 6%, transparent);
}

.vx-ov-heat-legend i[data-level="1"] { background: color-mix(in srgb, var(--vx-chart-1) 24%, transparent); }
.vx-ov-heat-legend i[data-level="2"] { background: color-mix(in srgb, var(--vx-chart-1) 44%, transparent); }
.vx-ov-heat-legend i[data-level="3"] { background: color-mix(in srgb, var(--vx-chart-1) 68%, transparent); }
.vx-ov-heat-legend i[data-level="4"] { background: var(--vx-chart-1); }

/* \u2500\u2500 \u6D3B\u52A8\u6D41 / \u53D1\u73B0 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-feed {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.vx-ov-feed li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid color-mix(in srgb, var(--vx-border) 55%, transparent);
  font-size: 10.5px;
}

.vx-ov-feed li:first-child { padding-top: 2px; border-top: 0; }

.vx-ov-worker {
  flex: none;
  padding: 1px 5px;
  border: 1px solid color-mix(in srgb, var(--vx-tone) 32%, transparent);
  border-radius: 5px;
  background: color-mix(in srgb, var(--vx-tone) 10%, transparent);
  color: var(--vx-tone);
  font-family: var(--vx-mono);
  font-size: 8.5px;
  font-weight: 600;
  line-height: 1.5;
}

.vx-ov-sev {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
  padding-top: 1px;
  font-size: 9px;
  font-weight: 600;
}

.vx-ov-feed-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.vx-ov-feed-main b {
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vx-ov-feed-main em {
  font-style: normal;
  font-size: 9.5px;
  color: var(--vx-text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vx-ov-feed-ts {
  flex: none;
  font-size: 9px;
  color: var(--vx-text-faint);
  font-variant-numeric: tabular-nums;
}

/* \u2500\u2500 \u4EFB\u52A1\u8868 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-table-wrap { overflow-x: auto; }

.vx-ov-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10.5px;
}

.vx-ov-table th {
  padding: 6px 12px;
  border-bottom: 1px solid var(--vx-border);
  color: var(--vx-text-faint);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}

.vx-ov-table td {
  padding: 7px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--vx-border) 45%, transparent);
  vertical-align: middle;
}

.vx-ov-table tr:last-child td { border-bottom: 0; }
.vx-ov-table tbody tr:hover { background: color-mix(in srgb, var(--vx-surface-sunken) 70%, transparent); }

.vx-ov-td-task { max-width: 340px; }
.vx-ov-td-task b,
.vx-ov-td-task em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vx-ov-td-task b { font-weight: 600; }
.vx-ov-td-task em { margin-top: 1px; font-style: normal; font-family: var(--vx-mono); font-size: 9px; color: var(--vx-text-faint); }

.vx-ov-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border: 1px solid var(--vx-border);
  border-radius: 999px;
  color: var(--vx-text-dim);
  font-size: 9px;
  font-weight: 600;
  line-height: 1.6;
  white-space: nowrap;
}

.vx-ov-engine { font-family: var(--vx-mono); font-size: 9px; color: var(--vx-text-dim); }

.vx-ov-progress { display: inline-flex; align-items: center; gap: 6px; }

.vx-ov-progress i {
  display: block;
  width: 56px;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vx-text) 9%, transparent);
}

.vx-ov-progress i em { display: block; height: 100%; border-radius: 999px; background: var(--vx-chart-1); }
.vx-ov-progress span { color: var(--vx-text-dim); font-size: 9.5px; font-variant-numeric: tabular-nums; }

/* \u2500\u2500 \u6D41\u91CF / \u7CFB\u7EDF \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-traffic { display: flex; align-items: center; gap: 16px; }

.vx-ov-sys { display: flex; flex-direction: column; gap: 5px; margin: 0; padding: 0; list-style: none; }

.vx-ov-sys li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 9px;
  border: 1px solid var(--vx-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--vx-surface) 52%, transparent);
  font-size: 10px;
  color: var(--vx-text-dim);
}

.vx-ov-sys li b { font-family: var(--vx-mono); font-size: 10px; font-weight: 600; color: var(--vx-text); }
.vx-ov-sys li b[data-on="1"] { color: var(--vx-chart-3); }
.vx-ov-ellipsis { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* \u2500\u2500 \u901A\u7528\u72B6\u6001 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 22px 0;
  color: var(--vx-text-faint);
  font-size: 10.5px;
}

.vx-ov-empty svg { opacity: 0.45; }

.vx-ov-muted { color: var(--vx-text-faint); }

.vx-ov-skeleton {
  height: 100%;
  min-height: 140px;
  border-radius: 10px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--vx-text) 4%, transparent) 25%,
    color-mix(in srgb, var(--vx-text) 9%, transparent) 40%,
    color-mix(in srgb, var(--vx-text) 4%, transparent) 55%
  );
  background-size: 300% 100%;
  animation: vx-ov-shimmer 1.5s var(--vx-ease) infinite;
}

.vx-ov-error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--vx-chart-5) 32%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--vx-chart-5) 8%, transparent);
  font-size: 10.5px;
  color: var(--vx-text);
}

.vx-ov-error button {
  margin-left: auto;
  padding: 2px 9px;
  border: 1px solid color-mix(in srgb, var(--vx-chart-5) 38%, transparent);
  border-radius: 7px;
  background: transparent;
  color: var(--vx-text);
  font: inherit;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}

.vx-ov-error button:focus-visible { outline: 2px solid var(--vx-accent); outline-offset: 1px; }

@media (max-width: 1180px) {
  .vx-ov-span-4 { grid-column: span 6; }
  .vx-ov-span-8 { grid-column: span 12; }
  .vx-ov-token { grid-template-columns: 1fr; }
}

/* \u2500\u2500 \u5DE5\u5177\u76EE\u5F55 / MCP \u8230\u961F \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   \u5F62\u5236\u7167\u6284 dsh \u63D2\u4EF6\u9875\uFF1A\u5361\u7247\u5217\u8868 \u2192 \u6574\u9875\u8BE6\u60C5\uFF0C\u72B6\u6001\u7528\u80F6\u56CA\u3001\u5F00\u5173\u7528\u8F68+\u94AE\uFF0C
   \u989C\u8272\u4E00\u5F8B\u8D70 --vx-* \u6865\uFF0C\u6240\u4EE5\u6362\u76AE\u548C\u6DF1\u8272\u4E0D\u989D\u5916\u5199\u4E00\u4EFD\u3002 */
.vx-cat {
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 13px;
  color: var(--vx-text);
}

.vx-cat-lead {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--vx-text-dim);
}

.vx-cat-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.vx-cat-search { flex: 1 1 200px; }

.vx-cat-section { display: flex; flex-direction: column; gap: 8px; }

.vx-cat-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--vx-text-dim);
}

.vx-cat-count {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--vx-surface-sunken);
  color: var(--vx-text-dim);
  font-size: 11px;
  font-weight: 500;
}

.vx-cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.vx-cat-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 11px 12px;
  border: 1px solid var(--vx-border);
  border-radius: var(--vx-radius-sm);
  background: var(--vx-surface);
  box-shadow: var(--vx-elevation);
  text-align: start;
  cursor: pointer;
  transition: border-color var(--vx-dur-fast) var(--vx-ease), background var(--vx-dur-fast) var(--vx-ease);
}

.vx-cat-card:hover { border-color: var(--vx-accent); background: var(--vx-surface-sunken); }

.vx-cat-card--row { flex-direction: row; align-items: center; gap: 10px; padding: 8px 10px; }

.vx-cat-card-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 2px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.vx-cat-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.vx-cat-key {
  overflow: hidden;
  font-family: var(--vx-mono);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-cat-desc {
  display: -webkit-box;
  overflow: hidden;
  color: var(--vx-text-dim);
  font-size: 12px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.vx-cat-meta { color: var(--vx-text-faint); font-size: 11px; }

.vx-cat-pill {
  margin-inline-start: auto;
  padding: 1px 7px;
  border: 1px solid var(--vx-border);
  border-radius: 999px;
  color: var(--vx-text-faint);
  font-size: 11px;
  white-space: nowrap;
}

.vx-cat-pill--on {
  border-color: color-mix(in srgb, var(--vx-chart-3) 40%, var(--vx-border));
  color: var(--vx-chart-3);
}

.vx-cat-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--vx-border);
}

.vx-cat-title { font-size: 14px; font-weight: 600; }
.vx-cat-spacer { flex: 1; }

.vx-cat-back {
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--vx-border);
  border-radius: 7px;
  background: var(--vx-surface);
  color: var(--vx-text-dim);
  font-size: 12px;
  cursor: pointer;
}

.vx-cat-back:hover { border-color: var(--vx-accent); color: var(--vx-text); }

.vx-cat-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--vx-text-dim);
  cursor: pointer;
}

.vx-cat-switch input { position: absolute; opacity: 0; width: 0; height: 0; }

.vx-cat-switch-track {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 34px;
  height: 20px;
  padding: 2px;
  border-radius: 999px;
  background: var(--vx-surface-sunken);
  border: 1px solid var(--vx-border-strong);
  transition: background var(--vx-dur-fast) var(--vx-ease), border-color var(--vx-dur-fast) var(--vx-ease);
}

.vx-cat-switch-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--vx-text-faint);
  transition: transform var(--vx-dur-fast) var(--vx-ease), background var(--vx-dur-fast) var(--vx-ease);
}

.vx-cat-switch input:checked + .vx-cat-switch-track {
  background: color-mix(in srgb, var(--vx-chart-3) 22%, transparent);
  border-color: color-mix(in srgb, var(--vx-chart-3) 55%, var(--vx-border));
}

.vx-cat-switch input:checked + .vx-cat-switch-track .vx-cat-switch-thumb {
  background: var(--vx-chart-3);
  transform: translateX(14px);
}

.vx-cat-switch input:focus-visible + .vx-cat-switch-track { outline: 2px solid var(--vx-accent); outline-offset: 2px; }

.vx-cat-field { display: flex; flex-direction: column; gap: 5px; }

.vx-cat-field-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
}

.vx-cat-field-hint { color: var(--vx-text-faint); font-size: 11px; line-height: 1.5; }

.vx-cat-input,
.vx-cat-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 9px;
  border: 1px solid var(--vx-border);
  border-radius: var(--vx-radius-sm);
  background: var(--vx-surface);
  color: var(--vx-text);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
}

.vx-cat-textarea { resize: vertical; }

.vx-cat-input:focus-visible,
.vx-cat-textarea:focus-visible { outline: none; border-color: var(--vx-accent); }

.vx-cat-mono { font-family: var(--vx-mono); }

.vx-cat-chips { display: flex; flex-wrap: wrap; gap: 6px; }

.vx-cat-chip {
  padding: 3px 9px;
  border: 1px solid var(--vx-border);
  border-radius: 999px;
  background: transparent;
  color: var(--vx-text-dim);
  font-family: var(--vx-mono);
  font-size: 11px;
  cursor: pointer;
}

.vx-cat-chip--on {
  border-color: color-mix(in srgb, var(--vx-chart-6) 45%, var(--vx-border));
  background: color-mix(in srgb, var(--vx-chart-6) 12%, transparent);
  color: var(--vx-text);
}

.vx-cat-params { display: flex; flex-direction: column; gap: 10px; }

.vx-cat-param {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px 10px;
  border: 1px solid var(--vx-border);
  border-radius: var(--vx-radius-sm);
  background: var(--vx-surface-sunken);
}

.vx-cat-param-head { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.vx-cat-param-head code { font-family: var(--vx-mono); font-weight: 600; }
.vx-cat-param-type { color: var(--vx-text-faint); font-size: 11px; }

.vx-cat-param-req {
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vx-negative) 16%, transparent);
  color: var(--vx-negative);
  font-size: 10px;
}

.vx-cat-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--vx-border);
}

.vx-cat-btn {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--vx-border);
  border-radius: var(--vx-radius-sm);
  background: var(--vx-surface);
  color: var(--vx-text);
  font-size: 12px;
  cursor: pointer;
}

.vx-cat-btn:hover:not(:disabled) { border-color: var(--vx-accent); }
.vx-cat-btn:disabled { opacity: 0.55; cursor: default; }

.vx-cat-btn--primary {
  border-color: transparent;
  background: var(--vx-chart-6);
  color: #fff;
}

.vx-cat-btn--danger { border-color: color-mix(in srgb, var(--vx-negative) 45%, var(--vx-border)); color: var(--vx-negative); }

.vx-cat-mini {
  flex: none;
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--vx-border);
  border-radius: 7px;
  background: var(--vx-surface);
  color: var(--vx-text-dim);
  font-size: 11px;
  cursor: pointer;
}

.vx-cat-mini:hover { border-color: var(--vx-accent); color: var(--vx-text); }

.vx-cat-hint { color: var(--vx-text-faint); font-size: 12px; line-height: 1.6; }
.vx-cat-error { color: var(--vx-negative); font-size: 12px; }
.vx-cat-notice { color: var(--vx-chart-3); font-size: 12px; }

@media (max-width: 860px) {
  .vx-ov-page { padding: 14px 14px 32px; }
  .vx-ov-toolbar { margin: 0 -14px; padding: 8px 14px 10px; }
  .vx-ov-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .vx-ov-span-4,
  .vx-ov-span-6,
  .vx-ov-span-8 { grid-column: span 12; }
}
/* \u2500\u2500 motion \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
@keyframes vx-ov-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes vx-ov-shimmer {
  from { background-position: 100% 0; }
  to { background-position: -60% 0; }
}

@keyframes vx-card-in {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: none; }
}

@keyframes vx-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .vx-card { animation: none; }
  .vx-loading::before { animation: none; }
  .vx-chip--action,
  .vx-seg > button,
  .vx-ov-seg-thumb,
  .vx-ov-stat,
  .vx-ov-arc,
  .vx-ov-meter-track i,
  .vx-ov-hbar-track i,
  .vx-ov-heat-cell { transition: none; }
  .vx-ov-draw,
  .vx-ov-skeleton { animation: none; }
}


.vx-yak-history {
  font-size: 13px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* \u2500\u2500 \u7B5B\u9009\u6761 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-yak-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--vx-border);
  border-radius: 10px;
  background: var(--vx-surface);
}

.vx-yak-filters input:not([type="checkbox"]),
.vx-yak-filters select {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--vx-border);
  border-radius: 7px;
  background: var(--vx-surface-sunken);
  color: var(--vx-text);
  font-size: 12px;
}

.vx-yak-filters input:not([type="checkbox"]) {
  width: 112px;
}

.vx-yak-filters input[aria-label="URL"] {
  width: min(230px, 100%);
}

.vx-yak-filters input:focus-visible,
.vx-yak-filters select:focus-visible {
  outline: 2px solid var(--vx-accent);
  outline-offset: 1px;
}

.vx-yak-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  white-space: nowrap;
}

.vx-yak-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-inline-start: auto;
}

.vx-yak-actions button,
.vx-yak-pages button,
.vx-yak-copy,
.vx-yak-close,
.vx-yak-segmented button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--vx-border);
  border-radius: 7px;
  background: var(--vx-surface);
  color: var(--vx-text);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.vx-yak-actions button:hover,
.vx-yak-pages button:hover,
.vx-yak-copy:hover,
.vx-yak-close:hover {
  background: var(--vx-surface-sunken);
}

.vx-yak-actions button:disabled,
.vx-yak-pages button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.vx-yak-actions .vx-yak-primary {
  border-color: transparent;
  background: var(--vx-text);
  color: var(--vx-surface);
  font-weight: 600;
}

/* \u2500\u2500 \u5217\u8868 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-yak-grid {
  display: grid;
  grid-template-columns: minmax(120px, 200px) minmax(0, 1fr);
  border: 1px solid var(--vx-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--vx-surface);
}

.vx-yak-grid aside {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--vx-surface-sunken);
  border-inline-end: 1px solid var(--vx-border);
}

.vx-yak-aside-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--vx-border);
  color: var(--vx-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.vx-yak-aside-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px;
  overflow: auto;
  max-height: 46vh;
}

.vx-yak-aside-list button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 3px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--vx-text);
  font-size: 11.5px;
  text-align: start;
  cursor: pointer;
}

.vx-yak-aside-list button span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-yak-aside-list button small {
  color: var(--vx-muted);
  font-variant-numeric: tabular-nums;
}

.vx-yak-aside-list button:hover {
  background: var(--vx-surface);
}

.vx-yak-list {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.vx-yak-table {
  position: relative;
  overflow: auto;
  max-height: 46vh;
  background: var(--vx-surface);
}

.vx-yak-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  align-items: center;
  border-bottom: 1px solid var(--vx-border);
  background: var(--vx-surface-sunken);
}

.vx-yak-head button {
  padding: 7px 9px;
  border: 0;
  background: none;
  color: var(--vx-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-align: start;
  cursor: pointer;
}

.vx-yak-head button:disabled {
  cursor: default;
}

.vx-yak-head .vx-yak-th--end {
  text-align: end;
}

.vx-yak-body {
  position: relative;
}

.vx-yak-row {
  position: absolute;
  inset-inline: 0;
  display: grid;
  align-items: center;
  border-bottom: 1px solid color-mix(in oklab, var(--vx-border) 55%, transparent);
  font-size: 12px;
  cursor: pointer;
}

.vx-yak-row > * {
  padding-inline: 9px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.vx-yak-row:hover {
  background: color-mix(in oklab, var(--vx-surface-sunken) 70%, transparent);
}

.vx-yak-row[data-selected="true"] {
  background: var(--vx-surface-sunken);
  box-shadow: inset 2px 0 0 0 var(--vx-text);
}

.vx-yak-time {
  font-variant-numeric: tabular-nums;
}

.vx-yak-size-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.vx-yak-sizebar {
  flex: 1;
  min-width: 24px;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  background: color-mix(in oklab, var(--vx-border) 80%, transparent);
}

.vx-yak-sizebar i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--vx-syn-punct);
}

.vx-yak-sizebar[data-tone="success"] i { background: var(--vx-status-success); }
.vx-yak-sizebar[data-tone="redirect"] i { background: var(--vx-status-redirect); }
.vx-yak-sizebar[data-tone="warn"] i { background: var(--vx-status-warn); }
.vx-yak-sizebar[data-tone="error"] i { background: var(--vx-status-error); }
.vx-yak-sizebar[data-tone="info"] i { background: var(--vx-syn-punct); }

.vx-yak-id,
.vx-yak-num {
  font-variant-numeric: tabular-nums;
  color: var(--vx-muted);
}

.vx-yak-dim {
  color: var(--vx-muted);
}

.vx-yak-type {
  font-family: var(--vx-mono);
  font-size: 11px;
  color: var(--vx-muted);
}

.vx-yak-url {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0;
  background: none;
  color: var(--vx-text);
  font-family: var(--vx-mono);
  font-size: 11.5px;
  text-align: start;
  cursor: pointer;
}

.vx-yak-url:hover {
  text-decoration: underline;
}

.vx-yak-pages {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid var(--vx-border);
  color: var(--vx-muted);
  font-size: 12px;
}

.vx-yak-pages > span {
  margin-inline-end: auto;
}

/* \u2500\u2500 \u65B9\u6CD5\u4E0E\u72B6\u6001\u80F6\u56CA \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-method,
.vx-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 6px;
  border-radius: 6px;
  border: 1px solid color-mix(in oklab, currentColor 28%, transparent);
  background: color-mix(in oklab, currentColor 10%, transparent);
  font-family: var(--vx-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.vx-method--get { color: var(--vx-method-get); }
.vx-method--post { color: var(--vx-method-post); }
.vx-method--put { color: var(--vx-method-put); }
.vx-method--patch { color: var(--vx-method-patch); }
.vx-method--delete { color: var(--vx-method-delete); }
.vx-method--options { color: var(--vx-method-options); }
.vx-method--other { color: var(--vx-muted); }

.vx-status {
  font-variant-numeric: tabular-nums;
}

.vx-status::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.vx-status--success { color: var(--vx-status-success); }
.vx-status--redirect { color: var(--vx-status-redirect); }
.vx-status--warn { color: var(--vx-status-warn); }
.vx-status--error { color: var(--vx-status-error); }
.vx-status--info { color: var(--vx-muted); }

/* \u2500\u2500 \u62A5\u6587\u8BE6\u60C5 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-yak-detail {
  border: 1px solid var(--vx-border);
  border-radius: 10px;
  padding: 10px;
  background: var(--vx-surface);
}

.vx-yak-detail > header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 0 0 8px;
}

.vx-yak-detail-url {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vx-muted);
  font-size: 11.5px;
}

.vx-yak-close {
  margin-inline-start: auto;
}

.vx-yak-split {
  display: flex;
  gap: 0;
  min-height: 240px;
}

.vx-yak-split > [data-panel] {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* \u62D6\u62FD\u5206\u9694\u6761\uFF1A\u89C6\u89C9\u4E0A\u4E00\u6761\u7AD6\u7EBF\uFF0C\u547D\u4E2D\u533A 8px\u3002 */
.vx-yak-resize {
  position: relative;
  width: 9px;
  flex: 0 0 9px;
  cursor: col-resize;
  background: transparent;
}

.vx-yak-resize::after {
  content: "";
  position: absolute;
  inset-block: 0;
  inset-inline-start: 50%;
  width: 2px;
  transform: translateX(-50%);
  border-radius: 1px;
  background: var(--vx-border);
}

.vx-yak-resize:hover::after,
.vx-yak-resize[data-resize-handle-state="drag"]::after,
.vx-yak-resize[data-resize-handle-state="hover"]::after {
  background: var(--vx-accent);
}

.vx-yak-packet {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  margin-inline: 4px;
  border: 1px solid var(--vx-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--vx-surface);
}

.vx-yak-packet > header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--vx-border);
  background: var(--vx-surface-sunken);
}

.vx-yak-packet > header strong {
  font-size: 12px;
}

.vx-yak-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 10.5px;
  font-weight: 600;
}

.vx-yak-chip--request { background: color-mix(in oklab, var(--vx-method-get) 10%, transparent); color: var(--vx-method-get); border-color: color-mix(in oklab, var(--vx-method-get) 28%, transparent); }
.vx-yak-chip--response { background: color-mix(in oklab, var(--vx-status-success) 10%, transparent); color: var(--vx-status-success); border-color: color-mix(in oklab, var(--vx-status-success) 30%, transparent); }

.vx-yak-search {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--vx-border);
  border-radius: 7px;
  background: var(--vx-surface);
}

.vx-yak-search input {
  width: 96px;
  border: 0;
  background: none;
  color: var(--vx-text);
  font-size: 11.5px;
  outline: none;
}

.vx-yak-search small {
  color: var(--vx-muted);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.vx-yak-search button {
  height: 18px;
  padding: 0 4px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--vx-muted);
  font-size: 11px;
  cursor: pointer;
}

.vx-yak-search button:hover {
  background: var(--vx-surface-sunken);
  color: var(--vx-text);
}

.vx-yak-size {
  color: var(--vx-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.vx-yak-segmented {
  display: inline-flex;
  margin-inline-start: auto;
  padding: 2px;
  border-radius: 8px;
  background: var(--vx-surface);
  border: 1px solid var(--vx-border);
  gap: 2px;
}

.vx-yak-segmented button {
  height: 22px;
  padding: 0 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--vx-muted);
  font-size: 11px;
}

.vx-yak-segmented button[aria-pressed="true"] {
  background: var(--vx-surface-sunken);
  color: var(--vx-text);
  font-weight: 600;
}

.vx-yak-code {
  overflow: auto;
  max-height: 340px;
  padding: 8px 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  line-height: 1.65;
  background: var(--vx-surface);
}

.vx-yak-line {
  padding: 0 10px;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 1.65em;
}

.vx-yak-line:hover {
  background: color-mix(in oklab, var(--vx-surface-sunken) 65%, transparent);
}

.vx-yak-line--start {
  background: color-mix(in oklab, var(--vx-surface-sunken) 70%, transparent);
}

.vx-yak-line code {
  font: inherit;
}

.vx-yak-separator {
  margin: 4px 10px;
  border-top: 1px dashed var(--vx-border);
}

.vx-yak-note {
  padding: 2px 10px;
  color: var(--vx-muted);
  font-size: 11px;
}

/* \u62A5\u6587\u7740\u8272\uFF1A\u989C\u8272\u5168\u90E8\u53D6\u81EA dsh \u7684\u9759\u6001\u8272\u677F\uFF0C\u6DF1\u8272\u7531 body[data-ds-dark-theme] \u5207\u6362\uFF0C
   \u7EC4\u4EF6\u81EA\u5DF1\u4E0D\u7EF4\u62A4\u7B2C\u4E8C\u5957\u4E3B\u9898\u3002 */
body {
  --vx-syn-header: var(--dsw-static-blue-800, #1e40af);
  --vx-syn-key: var(--dsw-static-blue-600, #2563eb);
  --vx-syn-url: var(--dsw-static-deepseek-600, #3b5bdb);
  --vx-syn-query-key: var(--dsw-static-violet-600, #7c3aed);
  --vx-syn-string: var(--dsw-static-green-900, #14532d);
  --vx-syn-number: var(--dsw-static-amber-600, #d97706);
  --vx-syn-literal: var(--dsw-static-violet-600, #7c3aed);
  --vx-syn-tag: var(--dsw-static-red-600, #dc2626);
  --vx-syn-attr: var(--dsw-static-deepseek-600, #3b5bdb);
  --vx-syn-value: var(--dsw-alias-label-secondary, #4b5563);
  --vx-syn-punct: var(--dsw-static-neutral-bluish-400, #94a3b8);
  --vx-method-get: var(--dsw-static-blue-600, #2563eb);
  --vx-method-post: var(--dsw-static-green-500, #22c55e);
  --vx-method-put: var(--dsw-static-amber-600, #d97706);
  --vx-method-patch: var(--dsw-static-violet-600, #7c3aed);
  --vx-method-delete: var(--dsw-static-red-600, #dc2626);
  --vx-method-options: var(--dsw-static-deepseek-500, #4d6bfe);
  --vx-status-success: var(--dsw-static-green-500, #22c55e);
  --vx-status-redirect: var(--dsw-static-blue-500, #3b82f6);
  --vx-status-warn: var(--dsw-static-amber-500, #f59e0b);
  --vx-status-error: var(--dsw-static-red-500, #ef4444);
  --vx-hit-bg: color-mix(in oklab, var(--dsw-static-amber-400, #fbbf24) 55%, transparent);
  --vx-hit-active: color-mix(in oklab, var(--dsw-static-amber-400, #fbbf24) 92%, transparent);
}

/* \u6DF1\u8272\uFF1A\u540C\u4E00\u6279\u8BED\u4E49\u6362\u6210\u8272\u677F\u91CC\u66F4\u4EAE\u7684\u53F0\u9636\u3002 */
body[data-ds-dark-theme] {
  --vx-syn-header: var(--dsw-static-blue-300, #93c5fd);
  --vx-syn-key: var(--dsw-static-blue-300, #93c5fd);
  --vx-syn-url: var(--dsw-static-deepseek-300, #93a5ff);
  --vx-syn-query-key: var(--dsw-static-violet-400, #a78bfa);
  --vx-syn-string: var(--dsw-static-green-400, #4ade80);
  --vx-syn-number: var(--dsw-static-amber-400, #fbbf24);
  --vx-syn-literal: var(--dsw-static-violet-400, #a78bfa);
  --vx-syn-tag: var(--dsw-static-red-400, #f87171);
  --vx-syn-attr: var(--dsw-static-deepseek-400, #7c93ff);
  --vx-syn-value: var(--dsw-alias-label-secondary, #cbd5e1);
  --vx-syn-punct: var(--dsw-static-neutral-bluish-600, #64748b);
  --vx-method-get: var(--dsw-static-blue-300, #93c5fd);
  --vx-method-post: var(--dsw-static-green-400, #4ade80);
  --vx-method-put: var(--dsw-static-amber-400, #fbbf24);
  --vx-method-patch: var(--dsw-static-violet-400, #a78bfa);
  --vx-method-delete: var(--dsw-static-red-400, #f87171);
  --vx-method-options: var(--dsw-static-deepseek-300, #93a5ff);
  --vx-status-success: var(--dsw-static-green-400, #4ade80);
  --vx-status-redirect: var(--dsw-static-blue-300, #93c5fd);
  --vx-status-warn: var(--dsw-static-amber-400, #fbbf24);
  --vx-status-error: var(--dsw-static-red-400, #f87171);
  --vx-hit-bg: color-mix(in oklab, var(--dsw-static-amber-400, #fbbf24) 38%, transparent);
  --vx-hit-active: color-mix(in oklab, var(--dsw-static-amber-400, #fbbf24) 70%, transparent);
}

.vx-tone--method { font-weight: 600; }
.vx-tone--url { color: var(--vx-syn-url); }
.vx-tone--query-key { color: var(--vx-syn-query-key); }
.vx-tone--query-value { color: var(--vx-syn-string); }
.vx-tone--proto,
.vx-tone--reason { color: var(--vx-muted); }
.vx-tone--status { font-weight: 600; }
.vx-tone--header { color: var(--vx-syn-header); font-weight: 500; }
.vx-tone--value { color: var(--vx-syn-value); }
.vx-tone--cookie-key { color: var(--vx-syn-header); }
.vx-tone--cookie-value { color: var(--vx-syn-value); }
.vx-tone--key { color: var(--vx-syn-key); }
.vx-tone--string { color: var(--vx-syn-string); }
.vx-tone--number { color: var(--vx-syn-number); }
.vx-tone--literal { color: var(--vx-syn-literal); }
.vx-tone--tag { color: var(--vx-syn-tag); }
.vx-tone--attr { color: var(--vx-syn-attr); }
.vx-tone--comment { color: var(--vx-muted); font-style: italic; }
.vx-tone--punct { color: var(--vx-syn-punct); }
.vx-tone--muted { color: var(--vx-muted); }

/* \u641C\u7D22\u547D\u4E2D */
.vx-hit {
  padding: 0 1px;
  border-radius: 3px;
  background: var(--vx-hit-bg);
  color: inherit;
}

.vx-hit[data-active="true"] {
  background: var(--vx-hit-active);
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--vx-syn-number) 60%, transparent);
}

.vx-yak-hint,
.vx-yak-alert {
  margin: 0;
  padding: 6px 10px;
  font-size: 12px;
}

.vx-yak-hint { color: var(--vx-muted); }
.vx-yak-alert { color: var(--vx-negative); }

.vx-capture-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.vx-capture-action button {
  font: inherit;
  color: inherit;
  background: color-mix(in srgb, var(--vx-chart-3) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--vx-chart-3) 38%, transparent);
  border-radius: 6px;
  padding: 2px 8px;
  cursor: pointer;
}

.vx-capture-action button:disabled {
  opacity: 0.55;
  cursor: default;
}

.vx-capture-action em {
  color: var(--vx-text-dim);
  font-style: normal;
  max-width: 32ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-yak-dialog {
  width: min(1180px, 93vw);
  max-height: 88vh;
  overflow: auto;
  padding: 14px;
  border: 1px solid var(--vx-border);
  border-radius: 12px;
  background: var(--vx-surface);
  color: var(--vx-text);
}

.vx-yak-dialog > header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
}

.vx-yak-dialog > header button {
  margin-inline-start: auto;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--vx-border);
  border-radius: 7px;
  background: var(--vx-surface);
  cursor: pointer;
}

@media (max-width: 860px) {
  .vx-yak-grid,
  .vx-yak-split {
    grid-template-columns: minmax(0, 1fr);
  }
  .vx-yak-grid aside button {
    display: inline-block;
    margin-inline-end: 4px;
  }
}

/* \u2500\u2500 \u4EFB\u52A1\u5DE5\u4F5C\u533A\uFF08\u6E05\u5355 + \u8BE6\u60C5\u5341\u9875\uFF09 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-task-workspace {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.vx-task-toolbar,
.vx-task-statusline,
.vx-task-inline,
.vx-task-detail-head,
.vx-task-compose-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.vx-task-toolbar {
  padding: 8px;
  border: 1px solid var(--vx-border);
  border-radius: 10px;
  background: var(--vx-surface);
}

.vx-task-spacer { flex: 1 1 auto; }
.vx-task-inline--wide { width: 100%; }
.vx-task-inline--wide > .vx-task-input { flex: 1 1 240px; }

.vx-task-input,
.vx-task-select,
.vx-task-textarea {
  min-height: 28px;
  padding: 3px 8px;
  border: 1px solid var(--vx-border);
  border-radius: 7px;
  background: var(--vx-surface-sunken);
  color: var(--vx-text);
  font-size: 12px;
  font-family: inherit;
}

.vx-task-input:focus-visible,
.vx-task-select:focus-visible,
.vx-task-textarea:focus-visible {
  outline: 2px solid var(--vx-accent);
  outline-offset: 1px;
}

.vx-task-textarea {
  width: 100%;
  min-height: 64px;
  resize: vertical;
}

.vx-task-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--vx-border);
  border-radius: 7px;
  background: var(--vx-surface);
  color: var(--vx-text);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.vx-task-btn:hover:not(:disabled) { background: var(--vx-surface-sunken); }
.vx-task-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.vx-task-btn--primary { border-color: transparent; background: var(--vx-text); color: var(--vx-surface); font-weight: 600; }
.vx-task-btn--primary:hover:not(:disabled) { background: var(--vx-text); opacity: 0.9; }
.vx-task-btn--danger { color: var(--vx-status-error); border-color: color-mix(in oklab, var(--vx-status-error) 35%, transparent); }
.vx-task-btn--ghost { border-color: transparent; background: transparent; color: var(--vx-text-dim); }

.vx-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 6px;
  border: 1px solid color-mix(in oklab, currentColor 26%, transparent);
  border-radius: 6px;
  background: color-mix(in oklab, currentColor 9%, transparent);
  font-size: 11px;
  font-weight: 600;
}

.vx-chip--muted { color: var(--vx-text-dim); }
.vx-chip--success { color: var(--vx-status-success); }
.vx-chip--warn { color: var(--vx-status-warn); }
.vx-chip--error { color: var(--vx-status-error); }
.vx-chip--redirect { color: var(--vx-status-redirect); }
.vx-chip--critical { color: var(--vx-status-error); }
.vx-chip--high { color: var(--vx-status-warn); }
.vx-chip--medium { color: var(--vx-method-put); }
.vx-chip--low { color: var(--vx-text-dim); }
.vx-chip-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

.vx-task-hint { color: var(--vx-text-dim); font-size: 11.5px; }
.vx-task-dim { color: var(--vx-text-dim); }
.vx-task-error { margin: 0; color: var(--vx-status-error); font-size: 12px; }

.vx-task-card {
  border: 1px solid var(--vx-border);
  border-radius: 10px;
  background: var(--vx-surface);
  overflow: hidden;
}

.vx-task-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--vx-border);
  background: var(--vx-surface-sunken);
}

.vx-task-card-head h3 { margin: 0; font-size: 12.5px; font-weight: 600; }
.vx-task-card-extra { margin-inline-start: auto; display: flex; align-items: center; gap: 6px; }
.vx-task-card-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }

.vx-task-cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.vx-task-kv span { display: block; font-size: 11px; color: var(--vx-text-dim); margin-bottom: 2px; }
.vx-task-kv div { font-size: 12.5px; word-break: break-word; }

.vx-task-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.vx-task-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--vx-border);
  border-radius: 9px;
  background: var(--vx-surface);
}

.vx-task-metric span { font-size: 11px; color: var(--vx-text-dim); }
.vx-task-metric strong { font-size: 18px; font-variant-numeric: tabular-nums; }
.vx-task-metric small { font-size: 11px; color: var(--vx-text-dim); }

.vx-task-list { display: flex; flex-direction: column; gap: 4px; }

.vx-task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid color-mix(in oklab, var(--vx-border) 70%, transparent);
  border-radius: 8px;
}

.vx-task-item-main { min-width: 0; flex: 1 1 auto; }
.vx-task-item-title { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vx-task-item-meta { margin-top: 3px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 11.5px; }
.vx-task-item-actions { display: flex; gap: 4px; flex: 0 0 auto; }

.vx-task-empty {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 12px;
  text-align: center;
  color: var(--vx-text-dim);
  border: 1px dashed var(--vx-border);
  border-radius: 9px;
}

.vx-task-empty strong { font-size: 12.5px; color: var(--vx-text); font-weight: 600; }
.vx-task-empty small { font-size: 11.5px; }

.vx-task-rows { display: flex; flex-direction: column; gap: 4px; }

.vx-task-rowitem {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  text-align: start;
  cursor: pointer;
  color: inherit;
}

.vx-task-rowitem:hover { background: var(--vx-surface-sunken); border-color: var(--vx-border); }
.vx-task-rowitem-main { min-width: 0; flex: 1 1 auto; display: flex; flex-direction: column; gap: 3px; }
.vx-task-rowitem-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vx-task-rowitem-sub { display: flex; gap: 8px; font-size: 11.5px; color: var(--vx-text-dim); overflow: hidden; }
.vx-task-rowitem-sub span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vx-task-rowitem-meta { display: flex; align-items: center; gap: 14px; flex: 0 0 auto; }

.vx-task-mini { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
.vx-task-mini b { font-size: 12.5px; font-variant-numeric: tabular-nums; }
.vx-task-mini small { font-size: 10.5px; color: var(--vx-text-dim); }

.vx-task-detail-head {
  padding: 8px 10px;
  border: 1px solid var(--vx-border);
  border-radius: 10px;
  background: var(--vx-surface);
}

.vx-task-detail-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.vx-task-detail-title strong { font-size: 14px; }
.vx-task-detail-title span { font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.vx-task-tabbar {
  display: flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--vx-border);
  border-radius: 10px;
  background: var(--vx-surface-sunken);
  overflow-x: auto;
}

.vx-task-tabbar button {
  padding: 5px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--vx-text-dim);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}

.vx-task-tabbar button[aria-selected="true"] {
  background: var(--vx-surface);
  color: var(--vx-text);
  font-weight: 600;
  box-shadow: var(--vx-elevation);
}

.vx-task-stack { display: flex; flex-direction: column; gap: 10px; }

.vx-task-table { display: flex; flex-direction: column; border: 1px solid var(--vx-border); border-radius: 9px; overflow: hidden; }
.vx-task-tr { display: grid; grid-template-columns: minmax(0, 2.2fr) 90px 130px minmax(0, 1.4fr) 110px; gap: 8px; padding: 6px 9px; font-size: 12px; align-items: center; border-top: 1px solid color-mix(in oklab, var(--vx-border) 60%, transparent); }
.vx-task-tr > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vx-task-tr--head { border-top: 0; background: var(--vx-surface-sunken); color: var(--vx-text-dim); font-size: 11px; font-weight: 600; }

.vx-task-feed { display: flex; flex-direction: column; gap: 6px; max-height: 380px; overflow: auto; }
.vx-task-feed-item { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 10px; padding: 5px 2px; border-bottom: 1px solid color-mix(in oklab, var(--vx-border) 55%, transparent); }
.vx-task-feed-time { color: var(--vx-text-dim); font-size: 11px; font-variant-numeric: tabular-nums; }
.vx-task-feed-title { display: flex; align-items: center; gap: 6px; font-size: 12.5px; }
.vx-task-feed-body { margin-top: 3px; font-size: 12px; color: var(--vx-text-dim); white-space: pre-wrap; word-break: break-word; }
.vx-task-tool { padding: 1px 5px; border-radius: 4px; background: var(--vx-surface-sunken); font-family: var(--vx-mono); font-size: 11px; }

.vx-task-compose { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--vx-border); padding-top: 8px; }

.vx-task-bar, .vx-task-mini-bar {
  display: block;
  height: 6px;
  border-radius: 3px;
  background: color-mix(in oklab, var(--vx-border) 85%, transparent);
  overflow: hidden;
}

.vx-task-bar i, .vx-task-mini-bar i { display: block; height: 100%; border-radius: 3px; background: var(--vx-method-get); }
.vx-task-mini-bar { width: 120px; flex: 0 0 auto; }

.vx-task-report {
  margin: 0;
  max-height: 520px;
  overflow: auto;
  padding: 12px;
  border-radius: 9px;
  background: var(--vx-surface-sunken);
  font-family: var(--vx-mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* \u2500\u2500 \u62E6\u622A\u89C4\u5219\uFF08\u8BBE\u7F6E\u9875\uFF09 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   \u4E0E\u4EFB\u52A1\u9762\u677F\u5171\u7528\u4E00\u5957 token \u4E0E .vx-task-* \u57FA\u4EF6\uFF1B\u8FD9\u91CC\u53EA\u8865\u8FD9\u5F20\u9875\u81EA\u5DF1\u7684\u5F62\u72B6\uFF1A
   \u4FE1\u606F\u6761\u3001\u89C4\u5219\u8868\u3001\u5F00\u5173\u3001\u6D6E\u5C42\u62BD\u5C49\u4E0E\u6A21\u578B\u515C\u5E95\u7684\u7EDF\u8BA1\u5757\u3002 */
.vx-int-page,
.vx-int-overlay,
.vx-int-page *,
.vx-int-overlay * { box-sizing: border-box; }

.vx-int-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* \u9875\u7B7E\u6761\u6536\u5728\u5185\u5BB9\u5BBD\u5EA6\u4E0A\uFF1A\u6574\u884C\u62C9\u6EE1\u4F1A\u50CF\u4E00\u5757\u7A7A\u7684\u5DE5\u5177\u6761\u3002 */
.vx-int-page > .vx-task-tabbar { align-self: flex-start; }

.vx-int-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.vx-int-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.vx-int-count {
  margin-inline-start: auto;
  font-size: 11.5px;
  color: var(--vx-text-dim);
  font-variant-numeric: tabular-nums;
}

.vx-int-hint {
  font-size: 11.5px;
  color: var(--vx-text-dim);
}

.vx-int-note { margin: 0; font-size: 12px; }

.vx-int-dim { color: var(--vx-text-dim); font-size: 11.5px; }

.vx-int-warn { color: var(--vx-status-warn); }

.vx-int-notice {
  margin: 0;
  font-size: 11.5px;
  color: var(--vx-status-success);
}

.vx-int-right { text-align: end; margin: 0; }

.vx-int-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
}

/* \u4FE1\u606F\u6761\uFF1A\u8303\u56F4 / \u515C\u5E95\u5F00\u5173\u5171\u7528\u3002warn=\u8303\u56F4\u7A7A\uFF0Con=\u515C\u5E95\u5DF2\u542F\u7528\u3002 */
.vx-int-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--vx-border);
  border-radius: 10px;
  background: var(--vx-surface);
}

.vx-int-bar[data-warn="1"] {
  border-color: color-mix(in oklab, var(--vx-status-warn) 55%, transparent);
  background: color-mix(in oklab, var(--vx-status-warn) 9%, var(--vx-surface));
}

.vx-int-bar[data-on="1"] {
  border-color: color-mix(in oklab, var(--vx-chart-6) 45%, transparent);
  background: color-mix(in oklab, var(--vx-chart-6) 7%, var(--vx-surface));
}

.vx-int-bar-icon { display: inline-flex; flex: none; color: var(--vx-text-dim); }
.vx-int-bar-text { min-width: 0; flex: 1 1 auto; display: flex; flex-direction: column; gap: 2px; }
.vx-int-bar-title { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; }
.vx-int-bar-names {
  min-width: 0;
  font-size: 11.5px;
  color: var(--vx-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vx-int-bar-actions { display: flex; align-items: center; gap: 6px; flex: none; }

/* \u89C4\u5219\u8868\uFF1A\u5217\u5BBD\u56FA\u5B9A\u6210\u6BD4\u4F8B\uFF0C\u6A21\u5F0F\u5217\u5403\u6389\u5269\u4F59\u5BBD\u5EA6\uFF0C\u7A84\u5BB9\u5668\u6A2A\u5411\u6EDA\u52A8\u3002 */
.vx-int-table {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vx-border);
  border-radius: 10px;
  background: var(--vx-surface);
  overflow-x: auto;
}

.vx-int-tr {
  display: grid;
  grid-template-columns:
    58px minmax(110px, 1.3fr) 64px 54px minmax(140px, 1.9fr) 58px 48px 62px;
  gap: 8px;
  align-items: center;
  min-width: 640px;
  padding: 6px 10px;
  border-top: 1px solid color-mix(in oklab, var(--vx-border) 60%, transparent);
  font-size: 12px;
}

.vx-int-tr:first-child { border-top: 0; }

.vx-int-tr--head {
  background: var(--vx-surface-sunken);
  color: var(--vx-text-dim);
  font-size: 11px;
  font-weight: 600;
}

.vx-int-tr[data-off="1"] { opacity: 0.45; }
.vx-int-tr[data-off="1"]:hover { opacity: 0.75; }
.vx-int-tr:not(.vx-int-tr--head):hover { background: color-mix(in oklab, var(--vx-surface-sunken) 60%, transparent); }

.vx-int-tr-center { display: flex; justify-content: center; }
.vx-int-priority { font-family: var(--vx-mono); font-size: 11.5px; font-variant-numeric: tabular-nums; }
.vx-int-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vx-int-pattern { min-width: 0; display: block; }

.vx-int-code {
  display: block;
  width: fit-content;
  max-width: 100%;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--vx-surface-sunken);
  font-family: var(--vx-mono);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-int-actions { display: flex; justify-content: flex-end; gap: 2px; }

.vx-int-iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--vx-text-dim);
  cursor: pointer;
}

.vx-int-iconbtn:hover { color: var(--vx-text); background: var(--vx-surface-sunken); border-color: var(--vx-border); }
.vx-int-iconbtn--danger:hover { color: var(--vx-status-error); border-color: color-mix(in oklab, var(--vx-status-error) 35%, transparent); }

.vx-int-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.vx-int-empty > .vx-task-empty { width: 100%; }

/* \u5F00\u5173\uFF1A\u8F68\u9053\u7528\u6B63\u6587\u8272\uFF0C\u62C7\u6307\u7528\u8868\u9762\u8272\uFF0C\u6DF1\u6D45\u4E3B\u9898\u90FD\u4E0D\u9700\u8981\u7B2C\u4E8C\u5957\u989C\u8272\u3002 */
.vx-int-switch {
  position: relative;
  flex: none;
  width: 30px;
  height: 17px;
  padding: 0;
  border: 1px solid var(--vx-border-strong);
  border-radius: 999px;
  background: var(--vx-surface-sunken);
  cursor: pointer;
  transition: background var(--vx-dur-fast) var(--vx-ease), border-color var(--vx-dur-fast) var(--vx-ease);
}

.vx-int-switch > i {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--vx-text-faint);
  transition: transform var(--vx-dur-fast) var(--vx-ease), background var(--vx-dur-fast) var(--vx-ease);
}

.vx-int-switch[aria-checked="true"] { background: var(--vx-text); border-color: var(--vx-text); }
.vx-int-switch[aria-checked="true"] > i { transform: translateX(13px); background: var(--vx-surface); }
.vx-int-switch:focus-visible { outline: 2px solid var(--vx-accent); outline-offset: 2px; }
.vx-int-switch:disabled { opacity: 0.5; cursor: not-allowed; }

/* \u8868\u5355\u4EF6 */
.vx-int-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }

.vx-int-label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vx-text-faint);
}

.vx-int-control {
  width: 100%;
  min-height: 28px;
  padding: 3px 8px;
  border: 1px solid var(--vx-border);
  border-radius: 7px;
  background: var(--vx-surface-sunken);
  color: var(--vx-text);
  font: inherit;
  font-size: 12px;
}

.vx-int-control:focus-visible { outline: 2px solid var(--vx-accent); outline-offset: 1px; }
.vx-int-control--mono { font-family: var(--vx-mono); }

textarea.vx-int-control {
  min-height: 64px;
  resize: vertical;
}

textarea.vx-int-prompt {
  min-height: 260px;
  font-family: var(--vx-mono);
  font-size: 11.5px;
  line-height: 1.65;
}

.vx-int-row { display: grid; gap: 10px; }
.vx-int-row--2 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.vx-int-divider { height: 1px; background: var(--vx-border); }
.vx-int-checkline { display: flex; align-items: center; gap: 8px; font-size: 12px; flex-wrap: wrap; }

/* \u6D6E\u5C42\uFF1A\u62BD\u5C49\u4E0E\u5BF9\u8BDD\u6846\u5171\u7528\u906E\u7F69\uFF0CEsc / \u70B9\u906E\u7F69\u5173\u95ED\u3002 */
.vx-int-overlay {
  position: fixed;
  inset: 0;
  /* dsh \u7684\u8BBE\u7F6E\u5F39\u7A97\u4E3A 1000\uFF0C\u5B50\u5BF9\u8BDD\u6846\u4E0E\u8BBE\u7F6E\u540C\u6302\u5728 body\u3002 */
  z-index: 1020;
  display: flex;
  justify-content: flex-end;
  background: color-mix(in oklab, #000 34%, transparent);
  animation: vx-int-fade 0.12s var(--vx-ease) both;
}

.vx-int-sheet {
  display: flex;
  flex-direction: column;
  width: min(448px, 100vw);
  height: 100%;
  background: var(--vx-surface);
  border-inline-start: 1px solid var(--vx-border);
  box-shadow: -12px 0 32px rgba(0, 0, 0, 0.18);
  animation: vx-int-slide 0.16s var(--vx-ease) both;
}

.vx-int-modal {
  display: flex;
  flex-direction: column;
  width: min(520px, 100%);
  max-height: min(82vh, 640px);
  margin: auto;
  border: 1px solid var(--vx-border);
  border-radius: 12px;
  background: var(--vx-surface);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
  overflow: hidden;
  animation: vx-int-fade 0.12s var(--vx-ease) both;
}

.vx-int-sheet-head { padding: 12px 16px; border-bottom: 1px solid var(--vx-border); }

.vx-int-sheet-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.vx-int-sheet-sub { margin: 3px 0 0; font-size: 11.5px; color: var(--vx-text-dim); }

.vx-int-sheet-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
}

.vx-int-sheet-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--vx-border);
  background: var(--vx-surface);
}

.vx-int-sheet-foot > .vx-int-hint { margin-inline-end: auto; }

/* \u8303\u56F4\u5BF9\u8BDD\u6846\u91CC\u7684\u5DE5\u5177\u884C */
.vx-int-group { display: flex; flex-direction: column; gap: 2px; }
.vx-int-group > .vx-int-label { margin: 0 0 2px; }

.vx-int-toolrow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px;
  border-radius: 7px;
}

.vx-int-toolrow:hover { background: var(--vx-surface-sunken); }
.vx-int-toolrow-main { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.vx-int-toolrow-key { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.vx-int-toolrow-key code { font-family: var(--vx-mono); font-size: 11.5px; }

/* \u6A21\u578B\u515C\u5E95\uFF1A\u7EDF\u8BA1\u5757 + \u8FF7\u4F60\u67F1\u56FE + \u53CC\u680F */
.vx-int-cols {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(220px, 1fr);
  gap: 12px;
  align-items: start;
}

.vx-int-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 8px;
}

.vx-int-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 9px;
  border: 1px solid var(--vx-border);
  border-radius: 8px;
  background: var(--vx-surface-sunken);
}

.vx-int-stat span { font-size: 10.5px; color: var(--vx-text-dim); }
.vx-int-stat b { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }

.vx-int-sparkwrap { display: flex; flex-direction: column; gap: 6px; }
.vx-int-sparkwrap .vx-int-label { margin: 0; }
.vx-int-spark { display: flex; align-items: flex-end; gap: 2px; height: 56px; }
.vx-int-spark i {
  flex: 1 1 0;
  min-width: 2px;
  border-radius: 2px;
  background: color-mix(in oklab, var(--vx-chart-6) 60%, transparent);
}
.vx-int-spark i:hover { background: var(--vx-chart-6); }

@keyframes vx-int-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes vx-int-slide { from { transform: translateX(18px); } to { transform: none; } }

@media (max-width: 980px) {
  .vx-int-cols { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 560px) {
  .vx-int-row--2 { grid-template-columns: minmax(0, 1fr); }
  .vx-int-bar { flex-wrap: wrap; }
  .vx-int-bar-actions { margin-inline-start: auto; }
}

@media (prefers-reduced-motion: reduce) {
  .vx-int-overlay,
  .vx-int-sheet,
  .vx-int-modal { animation: none; }
  .vx-int-switch,
  .vx-int-switch > i { transition: none; }
}
/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   \u63A7\u5236\u53F0\u8BBE\u8BA1\u5C42\uFF08vx-ui-*\uFF09
   \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   \u56DB\u9875\uFF08\u6982\u89C8 / \u4EFB\u52A1 / \u6D41\u91CF / \u4EE3\u7406\u6C60\uFF09\u5171\u7528\u8FD9\u4E00\u5957\u5916\u58F3\u3002\u4E4B\u524D\u7684\u56DB\u5957\u8BCD\u6C47
   \uFF08vx-ov / vx-cat / vx-task / vx-yak\uFF09\u4FDD\u7559\u7ED9\u5C1A\u672A\u6539\u9020\u7684\u533A\u57DF\uFF0C\u65B0\u9875\u9762\u53EA\u7528\u8FD9\u91CC\u3002

   \u4E09\u6761\u786C\u89C4\u5219\uFF1A
     1. \u989C\u8272\u4E00\u5F8B\u8D70 --vx-* \u6865\uFF0C\u7EC4\u4EF6\u91CC\u4E0D\u51FA\u73B0 hex\uFF0C\u6DF1\u8272\u4E0E\u6362\u76AE\u4E0D\u9700\u8981\u7B2C\u4E8C\u4EFD\uFF1B
     2. \u95F4\u8DDD\u662F 4 \u7684\u500D\u6570\uFF0C\u5706\u89D2\u53EA\u6709 8/10/12 \u4E09\u6863\uFF0C\u907F\u514D"\u6BCF\u9875\u5DEE\u4E00\u50CF\u7D20"\uFF1B
     3. \u6570\u5B57\u4E00\u5F8B tabular-nums\uFF0C\u8868\u683C\u6EDA\u52A8\u65F6\u5C0F\u6570\u70B9\u4E0D\u5BF9\u9F50\u4F1A\u88AB\u4E00\u773C\u770B\u51FA\u6765\u3002
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

/* \u8865\u4E0A\u5386\u53F2\u6B20\u8D26\uFF1A--vx-muted \u5728\u65E7\u6837\u5F0F\u91CC\u88AB\u5F15\u7528 20 \u4F59\u6B21\u5374\u4ECE\u672A\u5B9A\u4E49\uFF0C\u6DF1\u8272\u4E0B\u4F1A\u9000\u5316\u6210
   \u900F\u660E\u6587\u672C\uFF1B--vx-code \u662F\u62A5\u6587\u5E95\u8272\uFF0C\u4E4B\u524D\u9760 inline fallback \u515C\u7740\u3002 */
body {
  --vx-muted: var(--vx-text-dim);
  --vx-code: var(--vx-surface-sunken);
}

/* \u2500\u2500 \u9875\u9762\u9AA8\u67B6 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-page {
  display: flex;
  flex-direction: column;
  gap: 11px;
  height: 100%;
  padding: 18px 20px 40px;
  overflow-y: auto;
  background: var(--vx-surface);
  color: var(--vx-text);
  font-size: 12.5px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.vx-ui-page,
.vx-ui-page * { box-sizing: border-box; }

.vx-ui-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.vx-ui-head-main { flex: 1; min-width: 0; }

.vx-ui-title {
  margin: 0;
  font-size: 19px;
  font-weight: 660;
  letter-spacing: -0.015em;
  line-height: 1.25;
}

.vx-ui-desc {
  margin: 3px 0 0;
  max-width: 82ch;
  color: var(--vx-text-dim);
  font-size: 11.5px;
  line-height: 1.55;
}

.vx-ui-head-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  padding-top: 2px;
}

.vx-ui-statusline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid var(--vx-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--vx-surface-sunken) 58%, transparent);
  font-size: 11px;
  color: var(--vx-text-dim);
}

/* \u2500\u2500 KPI \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--vx-kpi-min, 148px), 1fr));
  gap: 8px;
}

.vx-ui-kpi {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 10px 12px 9px;
  overflow: hidden;
  border: 1px solid var(--vx-border);
  border-radius: 12px;
  background:
    linear-gradient(158deg, color-mix(in srgb, var(--vx-tone, transparent) 12%, transparent), transparent 62%),
    color-mix(in srgb, var(--vx-surface) 90%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 38%, transparent);
  color: var(--vx-text);
  font: inherit;
  text-align: start;
  transition: transform 0.16s var(--vx-ease), border-color 0.16s var(--vx-ease), box-shadow 0.16s var(--vx-ease);
}

.vx-ui-kpi--action { cursor: pointer; }

.vx-ui-kpi--action:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--vx-tone, var(--vx-border)) 45%, var(--vx-border));
  box-shadow: 0 14px 26px -22px color-mix(in srgb, var(--vx-tone, #000) 90%, transparent);
}

.vx-ui-kpi--action:focus-visible {
  outline: 2px solid var(--vx-accent);
  outline-offset: 2px;
}

.vx-ui-kpi.is-active {
  border-color: color-mix(in srgb, var(--vx-tone, var(--vx-border)) 60%, var(--vx-border));
  background:
    linear-gradient(158deg, color-mix(in srgb, var(--vx-tone, transparent) 20%, transparent), transparent 70%),
    color-mix(in srgb, var(--vx-surface) 92%, transparent);
}

.vx-ui-kpi-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.vx-ui-kpi-label {
  overflow: hidden;
  color: var(--vx-text-dim);
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ui-kpi-corner {
  margin-inline-start: auto;
  color: var(--vx-text-faint);
  font-size: 9.5px;
  white-space: nowrap;
}

.vx-ui-kpi-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 23px;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.vx-ui-kpi-value em {
  color: var(--vx-text-faint);
  font-size: 10.5px;
  font-style: normal;
  font-weight: 600;
}

.vx-ui-kpi-hint {
  display: -webkit-box;
  min-height: 13px;
  overflow: hidden;
  color: var(--vx-text-faint);
  font-size: 9.5px;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* tone\uFF1A\u4E00\u4E2A\u53D8\u91CF\u9A71\u52A8\u5361\u7247\u6E10\u53D8\u3001Chip\u3001\u8FDB\u5EA6\u6761\u4E0E\u72B6\u6001\u70B9\u3002 */
.vx-ui-tone-neutral { --vx-tone: var(--vx-text-faint); }
.vx-ui-tone-blue { --vx-tone: var(--vx-chart-1); }
.vx-ui-tone-violet { --vx-tone: var(--vx-chart-2); }
.vx-ui-tone-green { --vx-tone: var(--vx-chart-3); }
.vx-ui-tone-amber { --vx-tone: var(--vx-chart-4); }
.vx-ui-tone-red { --vx-tone: var(--vx-chart-5); }

/* \u2500\u2500 \u533A\u5757 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--vx-border);
  border-radius: 12px;
  background: var(--vx-surface);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 26%, transparent);
}

.vx-ui-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--vx-border);
  background: color-mix(in srgb, var(--vx-surface-sunken) 48%, transparent);
}

.vx-ui-card-titles {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.vx-ui-card-title {
  margin: 0;
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.vx-ui-card-hint {
  overflow: hidden;
  color: var(--vx-text-faint);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ui-card-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 5px;
  margin-inline-start: auto;
}

.vx-ui-card-body {
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-height: 0;
  padding: 10px 12px 12px;
}

.vx-ui-card-body--scroll {
  max-height: 420px;
  overflow-y: auto;
}

.vx-ui-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 296px;
  align-items: start;
  gap: 10px;
}

.vx-ui-split-main,
.vx-ui-split-rail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.vx-ui-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

/* \u2500\u2500 \u5DE5\u5177\u6761 / \u5206\u6BB5 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border: 1px solid var(--vx-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--vx-surface-sunken) 52%, transparent);
}

.vx-ui-spacer { margin-inline-start: auto; }

.vx-ui-seg {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--vx-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--vx-text) 5%, transparent);
}

.vx-ui-seg > button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--vx-text-dim);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
  transition: background 0.14s var(--vx-ease), color 0.14s var(--vx-ease);
}

.vx-ui-seg > button em {
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vx-text) 9%, transparent);
  color: var(--vx-text-faint);
  font-size: 9px;
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

.vx-ui-seg > button:hover { color: var(--vx-text); }

.vx-ui-seg > button[aria-pressed="true"] {
  background: var(--vx-surface);
  color: var(--vx-text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
}

.vx-ui-seg > button:focus-visible {
  outline: 2px solid var(--vx-accent);
  outline-offset: 1px;
}

.vx-ui-lane { display: flex; align-items: center; gap: 8px; }

/* \u2500\u2500 \u5FBD\u6807 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 19px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--vx-tone, var(--vx-border)) 36%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vx-tone, transparent) 10%, transparent);
  color: var(--vx-tone, var(--vx-text-dim));
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.vx-ui-chip-dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
  background: currentColor;
}

.vx-ui-method {
  display: inline-flex;
  align-items: center;
  height: 17px;
  padding: 0 5px;
  border: 1px solid color-mix(in srgb, var(--vx-tone, var(--vx-border)) 32%, transparent);
  border-radius: 5px;
  background: color-mix(in srgb, var(--vx-tone, transparent) 12%, transparent);
  color: var(--vx-tone, var(--vx-text-dim));
  font-family: var(--vx-mono);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.vx-ui-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 17px;
  padding: 0 5px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--vx-tone, var(--vx-text-faint)) 14%, transparent);
  color: var(--vx-tone, var(--vx-text-dim));
  font-family: var(--vx-mono);
  font-size: 10px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

/* \u2500\u2500 \u8868\u683C \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-table-wrap {
  max-width: 100%;
  overflow: auto;
  border: 1px solid var(--vx-border);
  border-radius: 9px;
  background: var(--vx-surface);
}

.vx-ui-table {
  width: 100%;
  /* \u56FA\u5B9A\u5E03\u5C40\uFF1A\u5217\u5BBD\u7531 col \u7684 width \u51B3\u5B9A\uFF0C\u957F\u4E3B\u673A\u540D\u4E0D\u4F1A\u628A\u8868\u683C\u6491\u51FA\u6A2A\u5411\u6EDA\u52A8\u6761\u3002
     \u672A\u58F0\u660E\u5BBD\u5EA6\u7684\u5217\uFF08\u901A\u5E38\u662F"\u8DEF\u5F84"\uFF09\u5E73\u5206\u5269\u4F59\u7A7A\u95F4\u3002 */
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 11.5px;
}

.vx-ui-table th,
.vx-ui-table td { min-width: 0; }

.vx-ui-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 6px 9px;
  border-bottom: 1px solid var(--vx-border);
  background: color-mix(in srgb, var(--vx-surface-sunken) 92%, var(--vx-surface));
  color: var(--vx-text-faint);
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-align: start;
  text-transform: uppercase;
  white-space: nowrap;
}

.vx-ui-table thead th[data-align="right"] { text-align: end; }
.vx-ui-table thead th[data-align="center"] { text-align: center; }

.vx-ui-table tbody td {
  padding: 5px 9px;
  border-bottom: 1px solid color-mix(in srgb, var(--vx-border) 55%, transparent);
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
  white-space: nowrap;
}

.vx-ui-table tbody td[data-align="right"] { text-align: end; }
.vx-ui-table tbody td[data-align="center"] { text-align: center; }
.vx-ui-table tbody td.is-mono { font-family: var(--vx-mono); font-size: 10.5px; font-variant-numeric: tabular-nums; }
.vx-ui-table tbody tr:last-child td { border-bottom: 0; }

.vx-ui-table-wrap--dense .vx-ui-table tbody td { padding: 3px 8px; }
.vx-ui-table-wrap--dense .vx-ui-table thead th { padding: 5px 8px; }

.vx-ui-table tbody tr[data-clickable="true"] { cursor: pointer; }
.vx-ui-table tbody tr:hover { background: color-mix(in srgb, var(--vx-surface-sunken) 68%, transparent); }

/* \u64CD\u4F5C\u5217\u7C98\u5728\u53F3\u4FA7\uFF1A\u5BC6\u96C6\u8868\u683C\u6A2A\u5411\u6EDA\u52A8\u65F6\u6309\u94AE\u4ECD\u7136\u53EF\u70B9\uFF0C\u4E0D\u7528\u5148\u6EDA\u5230\u5E95\u3002 */
.vx-ui-table th[data-sticky="right"],
.vx-ui-table td[data-sticky="right"] {
  position: sticky;
  right: 0;
  z-index: 1;
  background: var(--vx-surface);
  box-shadow: inset 1px 0 0 var(--vx-border);
}

.vx-ui-table thead th[data-sticky="right"] {
  z-index: 3;
  background: color-mix(in srgb, var(--vx-surface-sunken) 92%, var(--vx-surface));
}

.vx-ui-table tbody tr:hover td[data-sticky="right"] {
  background: color-mix(in srgb, var(--vx-surface-sunken) 68%, var(--vx-surface));
}

.vx-ui-table tbody tr[data-selected="true"] {
  background: color-mix(in srgb, var(--vx-chart-1) 9%, transparent);
  box-shadow: inset 2px 0 0 var(--vx-chart-1);
}

.vx-ui-th-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-size: inherit;
  font-weight: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}

.vx-ui-th-btn > i { font-style: normal; opacity: 0.4; }
.vx-ui-th-btn > i[data-dir="asc"],
.vx-ui-th-btn > i[data-dir="desc"] { color: var(--vx-chart-1); opacity: 1; }
.vx-ui-th-btn:focus-visible { outline: 2px solid var(--vx-accent); outline-offset: 2px; }

.vx-ui-ellipsis {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ui-cell-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.vx-ui-cell-stack > strong {
  overflow: hidden;
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ui-row-actions {
  display: inline-flex;
  flex-wrap: nowrap;
  gap: 4px;
  justify-content: flex-end;
}

/* \u2500\u2500 \u7A7A\u6001 / \u9AA8\u67B6 / \u63D0\u793A\u6761 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 26px 12px;
  color: var(--vx-text-faint);
  text-align: center;
}

.vx-ui-empty svg { opacity: 0.4; }
.vx-ui-empty strong { color: var(--vx-text-dim); font-size: 12px; font-weight: 600; }
.vx-ui-empty small { max-width: 46ch; font-size: 10.5px; line-height: 1.5; }
.vx-ui-empty-action { margin-top: 6px; }

.vx-ui-skeleton {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
}

.vx-ui-skeleton > i {
  display: block;
  height: 22px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--vx-text) 5%, transparent) 25%,
    color-mix(in srgb, var(--vx-text) 10%, transparent) 40%,
    color-mix(in srgb, var(--vx-text) 5%, transparent) 55%
  );
  background-size: 300% 100%;
  animation: vx-ov-shimmer 1.4s var(--vx-ease) infinite;
}

.vx-ui-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--vx-tone, var(--vx-border)) 38%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--vx-tone, transparent) 9%, transparent);
  color: var(--vx-text);
  font-size: 11px;
}

.vx-ui-banner-text { min-width: 0; flex: 1; }

.vx-ui-banner-close {
  flex: none;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--vx-text-dim);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.vx-ui-banner-close:hover { background: color-mix(in srgb, var(--vx-text) 8%, transparent); }

.vx-ui-banner strong { font-weight: 650; }

.vx-ui-banner-link {
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--vx-tone, var(--vx-border)) 45%, transparent);
  border-radius: 5px;
  background: transparent;
  color: var(--vx-text);
  font: inherit;
  font-size: 10px;
  line-height: 16px;
  cursor: pointer;
}

.vx-ui-banner-link:hover { background: color-mix(in srgb, var(--vx-text) 8%, transparent); }

/* \u2500\u2500 \u8868\u5355 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.vx-ui-field--inline {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.vx-ui-field-label {
  color: var(--vx-text-dim);
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
}

.vx-ui-field-hint { color: var(--vx-text-faint); font-size: 9.5px; line-height: 1.45; }

.vx-ui-input,
.vx-ui-textarea {
  width: 100%;
  min-height: 26px;
  padding: 3px 8px;
  border: 1px solid var(--vx-border);
  border-radius: 7px;
  background: var(--vx-surface);
  color: var(--vx-text);
  font-family: inherit;
  font-size: 11.5px;
  line-height: 1.5;
}

.vx-ui-input.is-mono,
.vx-ui-textarea.is-mono { font-family: var(--vx-mono); font-size: 11px; }

/* \u4E0B\u62C9\u6846\u6309\u5185\u5BB9\u5BBD\u5EA6\u6392\uFF0C\u4E0D\u5360\u6EE1\u4E00\u884C\uFF1A\u5DE5\u5177\u6761\u91CC\u4E00\u884C\u80FD\u653E\u4E0B\u4E09\u4E2A\u7B5B\u9009\u5668\u3002 */
.vx-ui-select {
  width: auto;
  min-width: 104px;
  max-width: 220px;
}

.vx-ui-textarea { resize: vertical; }

.vx-ui-input:focus-visible,
.vx-ui-select:focus-visible,
.vx-ui-textarea:focus-visible {
  outline: none;
  border-color: var(--vx-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vx-accent) 22%, transparent);
}

.vx-ui-input:disabled { opacity: 0.55; }

.vx-ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 27px;
  padding: 0 10px;
  border: 1px solid var(--vx-border);
  border-radius: 7px;
  background: var(--vx-surface);
  color: var(--vx-text);
  font: inherit;
  font-size: 11.5px;
  font-weight: 550;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.13s var(--vx-ease), border-color 0.13s var(--vx-ease), color 0.13s var(--vx-ease);
}

.vx-ui-btn:hover:not(:disabled) {
  border-color: var(--vx-accent);
  background: color-mix(in srgb, var(--vx-surface-sunken) 70%, transparent);
}

.vx-ui-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.vx-ui-btn--sm { height: 23px; padding: 0 8px; font-size: 10.5px; }

.vx-ui-btn--primary {
  border-color: transparent;
  background: var(--vx-text);
  color: var(--vx-surface);
  font-weight: 650;
}

.vx-ui-btn--primary:hover:not(:disabled) { background: var(--vx-text); opacity: 0.9; }

.vx-ui-btn--ghost { border-color: transparent; background: transparent; color: var(--vx-text-dim); }
.vx-ui-btn--ghost:hover:not(:disabled) { color: var(--vx-text); }

.vx-ui-btn--danger {
  border-color: color-mix(in srgb, var(--vx-negative) 38%, var(--vx-border));
  color: var(--vx-negative);
}

.vx-ui-btn--danger:hover:not(:disabled) { background: color-mix(in srgb, var(--vx-negative) 8%, transparent); }

.vx-ui-btn:focus-visible { outline: 2px solid var(--vx-accent); outline-offset: 2px; }

.vx-ui-spin {
  width: 10px;
  height: 10px;
  border: 1.5px solid color-mix(in srgb, currentColor 35%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: vx-spin 0.7s linear infinite;
}

/* \u2500\u2500 \u6307\u793A\u5668 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-meter {
  width: 100%;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vx-text) 9%, transparent);
}

.vx-ui-meter > i {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s var(--vx-ease);
}

.vx-ui-bar {
  display: flex;
  width: 100%;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vx-text) 8%, transparent);
}

.vx-ui-bar > i { display: block; height: 100%; min-width: 2px; }
.vx-ui-bar > i + i { margin-inline-start: 1px; }
.vx-ui-bar--empty { opacity: 0.6; }

.vx-ui-kv {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
}

.vx-ui-kv > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--vx-border) 50%, transparent);
  font-size: 11px;
}

.vx-ui-kv > div:last-child { border-bottom: 0; }
.vx-ui-kv dt { flex: none; color: var(--vx-text-faint); font-size: 10.5px; }
.vx-ui-kv dd { min-width: 0; margin: 0; overflow: hidden; text-align: end; text-overflow: ellipsis; }

.vx-ui-kv code {
  font-family: var(--vx-mono);
  font-size: 10.5px;
}

/* \u2500\u2500 \u5206\u9875 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-pager {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 2px;
  color: var(--vx-text-dim);
  font-size: 10.5px;
}

.vx-ui-pager-total { color: var(--vx-text-faint); font-variant-numeric: tabular-nums; }
.vx-ui-pager-page { min-width: 62px; text-align: center; font-variant-numeric: tabular-nums; }

/* \u2500\u2500 \u68C0\u67E5\u5668\uFF08\u62BD\u5C49\uFF09 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-drawer-root {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
}

.vx-ui-drawer-backdrop {
  position: absolute;
  inset: 0;
  padding: 0;
  border: 0;
  background: color-mix(in srgb, #000 32%, transparent);
  cursor: pointer;
  animation: vx-ov-fade 0.18s var(--vx-ease) both;
}

.vx-ui-drawer {
  position: relative;
  display: flex;
  flex-direction: column;
  max-width: 100vw;
  height: 100%;
  border-inline-start: 1px solid var(--vx-border);
  background: var(--vx-surface);
  box-shadow: -24px 0 60px -40px rgba(0, 0, 0, 0.6);
  color: var(--vx-text);
  font-size: 12px;
  animation: vx-ui-slide 0.22s var(--vx-ease) both;
}

.vx-ui-drawer,
.vx-ui-drawer * { box-sizing: border-box; }

.vx-ui-drawer-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--vx-border);
  background: color-mix(in srgb, var(--vx-surface-sunken) 45%, transparent);
}

.vx-ui-drawer-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.vx-ui-drawer-titles > strong {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ui-drawer-titles > span {
  overflow: hidden;
  color: var(--vx-text-faint);
  font-family: var(--vx-mono);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ui-drawer-meta {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
}

.vx-ui-drawer-close {
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--vx-border);
  border-radius: 7px;
  background: transparent;
  color: var(--vx-text-dim);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.vx-ui-drawer-close:hover { border-color: var(--vx-accent); color: var(--vx-text); }

.vx-ui-drawer-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 16px;
  overflow-y: auto;
}

.vx-ui-drawer-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border-top: 1px solid var(--vx-border);
  background: color-mix(in srgb, var(--vx-surface-sunken) 45%, transparent);
}

.vx-ui-detail-tabs { display: flex; align-items: center; gap: 8px; }

.vx-ui-code {
  margin: 0;
  padding: 9px 11px;
  overflow: auto;
  border: 1px solid var(--vx-border);
  border-radius: 8px;
  background: var(--vx-code);
  color: var(--vx-text);
  font-family: var(--vx-mono);
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* \u2500\u2500 \u5206\u5E03\u6761 / \u5217\u8868 / \u4E8B\u4EF6 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-hbars { display: flex; flex-direction: column; gap: 6px; }

.vx-ui-hbar {
  display: grid;
  grid-template-columns: minmax(64px, 1fr) minmax(50px, 1.2fr) auto;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--vx-text);
  font: inherit;
  font-size: 10.5px;
  text-align: start;
  cursor: pointer;
}

.vx-ui-hbar--static { cursor: default; }
.vx-ui-hbar:hover:not(.vx-ui-hbar--static) .vx-ui-hbar-label { color: var(--vx-chart-1); }

.vx-ui-hbar-label {
  overflow: hidden;
  color: var(--vx-text-dim);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ui-hbar > i {
  display: block;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vx-text) 8%, transparent);
}

.vx-ui-hbar > i > b {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--vx-chart-1);
  transition: width 0.5s var(--vx-ease);
}

.vx-ui-hbar > em {
  color: var(--vx-text-faint);
  font-size: 9.5px;
  font-style: normal;
  font-variant-numeric: tabular-nums;
  text-align: end;
}

.vx-ui-list { display: flex; flex-direction: column; }

.vx-ui-list-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--vx-border) 48%, transparent);
  font-size: 10.5px;
}

.vx-ui-list-row:last-child { border-bottom: 0; }

.vx-ui-list-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.vx-ui-list-main code {
  overflow: hidden;
  font-family: var(--vx-mono);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ui-list-main span { color: var(--vx-text-faint); font-size: 9.5px; }

.vx-ui-list-row > em {
  flex: none;
  color: var(--vx-text-faint);
  font-size: 9.5px;
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

.vx-ui-events { display: flex; flex-direction: column; gap: 0; }

.vx-ui-event {
  display: grid;
  grid-template-columns: minmax(70px, auto) minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--vx-border) 45%, transparent);
  font-size: 10px;
}

.vx-ui-event:last-child { border-bottom: 0; }

.vx-ui-event code {
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--vx-chart-1) 12%, transparent);
  color: var(--vx-chart-1);
  font-family: var(--vx-mono);
  font-size: 9px;
}

.vx-ui-event span {
  overflow: hidden;
  color: var(--vx-text-dim);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ui-event em {
  color: var(--vx-text-faint);
  font-size: 9px;
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

/* \u2500\u2500 Web \u5F15\u64CE\u4F1A\u8BDD\u5361 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-session-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
  gap: 8px;
}

.vx-ui-session {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 11px;
  border: 1px solid var(--vx-border);
  border-radius: 10px;
  background: var(--vx-surface);
  color: var(--vx-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition: border-color 0.14s var(--vx-ease), background 0.14s var(--vx-ease);
}

.vx-ui-session:hover { border-color: var(--vx-accent); }
.vx-ui-session.is-active { border-color: var(--vx-chart-1); background: color-mix(in srgb, var(--vx-chart-1) 7%, transparent); }

.vx-ui-session-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11.5px;
}

.vx-ui-session-top > strong {
  overflow: hidden;
  flex: 1;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ui-session-origin {
  overflow: hidden;
  color: var(--vx-text-faint);
  font-family: var(--vx-mono);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ui-session-meter {
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vx-text) 8%, transparent);
}

.vx-ui-session-meter > i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--vx-chart-1);
}

.vx-ui-session-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--vx-text-faint);
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
}

/* \u2500\u2500 \u6210\u5458\u52FE\u9009 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-member-list { display: flex; flex-direction: column; gap: 5px; }

.vx-ui-member {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  border: 1px solid var(--vx-border);
  border-radius: 8px;
  background: var(--vx-surface);
  font-size: 11px;
  cursor: pointer;
  transition: border-color 0.13s var(--vx-ease), background 0.13s var(--vx-ease);
}

.vx-ui-member.is-on {
  border-color: color-mix(in srgb, var(--vx-chart-3) 45%, var(--vx-border));
  background: color-mix(in srgb, var(--vx-chart-3) 7%, transparent);
}

.vx-ui-member input { flex: none; accent-color: var(--vx-chart-3); }

.vx-ui-member-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.vx-ui-member-main strong { font-size: 11.5px; font-weight: 600; }
.vx-ui-member-main em {
  overflow: hidden;
  color: var(--vx-text-faint);
  font-family: var(--vx-mono);
  font-size: 9.5px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* \u2500\u2500 \u6742\u9879 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ui-live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--vx-text-dim);
  font-size: 10.5px;
  font-weight: 600;
}

.vx-ui-live > i {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--vx-text-faint);
}

.vx-ui-live.is-on { color: var(--vx-chart-3); }
.vx-ui-live.is-on > i {
  background: var(--vx-chart-3);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vx-chart-3) 22%, transparent);
  animation: vx-ui-pulse 1.6s var(--vx-ease) infinite;
}

.vx-ui-muted { color: var(--vx-text-faint); }
.vx-ui-bad { color: var(--vx-negative); font-weight: 600; }
.vx-ui-ok { color: var(--vx-chart-3); font-weight: 600; }
.vx-ui-mono-inline { font-family: var(--vx-mono); font-size: 11px; }
.vx-ui-break { overflow-wrap: anywhere; word-break: break-all; }

.vx-ui-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}

@keyframes vx-ui-slide {
  from { transform: translateX(24px); opacity: 0.4; }
  to { transform: none; opacity: 1; }
}

@keyframes vx-ui-pulse {
  0%, 100% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--vx-chart-3) 22%, transparent); }
  50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--vx-chart-3) 6%, transparent); }
}

@media (max-width: 1180px) {
  .vx-ui-split { grid-template-columns: minmax(0, 1fr); }
  .vx-ui-split-rail { flex-direction: row; flex-wrap: wrap; }
  .vx-ui-split-rail > * { flex: 1 1 240px; }
}

@media (max-width: 860px) {
  .vx-ui-page { padding: 14px 14px 32px; }
  .vx-ui-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .vx-ui-head { flex-direction: column; gap: 8px; }
  .vx-ui-head-actions { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .vx-ui-kpi,
  .vx-ui-meter > i,
  .vx-ui-hbar > i > b,
  .vx-ui-session { transition: none; }
  .vx-ui-drawer,
  .vx-ui-drawer-backdrop,
  .vx-ui-skeleton > i,
  .vx-ui-live.is-on > i { animation: none; }
}
`;
function installStyles(doc = document) {
  const existing = doc.getElementById(STYLE_ID);
  if (existing !== null) return () => {
  };
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = VEXNAR_CSS;
  doc.head.append(style);
  return () => style.remove();
}

// src/overview.tsx
var import_react2 = require("react");

// src/data/client.ts
var API_BASE = "/vexnar-api";
var ApiError = class extends Error {
  status;
  code;
  detail;
  constructor(message, init = {}) {
    super(message);
    this.name = "ApiError";
    this.status = init.status ?? 0;
    this.code = init.code ?? "";
    this.detail = init.detail;
  }
  /** 4xx 是「请求不对」，5xx/超时是「服务不对」，重试价值不同。 */
  get retryable() {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
};
function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === void 0 || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
var DEFAULT_TIMEOUT_MS = 2e4;
function messageOf(value, fallback) {
  if (typeof value === "string" && value.trim() !== "") return { message: value.trim(), code: "" };
  if (value !== null && typeof value === "object") {
    const row = value;
    const message = row["error"] ?? row["message"] ?? row["detail"];
    const code = row["code"] ?? row["error_code"];
    return {
      message: typeof message === "string" && message !== "" ? message : fallback,
      code: typeof code === "string" ? code : ""
    };
  }
  return { message: fallback, code: "" };
}
async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const external = options.signal;
  const onAbort = () => controller.abort();
  if (external !== void 0) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", onAbort, { once: true });
  }
  const headers = { Accept: "application/json", ...options.headers ?? {} };
  const init = { method: options.method ?? "GET", headers, signal: controller.signal, cache: "no-store" };
  if (options.body !== void 0) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  try {
    const response = await fetch(API_BASE + path, init);
    const text = await response.text();
    let parsed = null;
    if (text !== "") {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!response.ok) {
      const detail = messageOf(parsed, `HTTP ${response.status}`);
      throw new ApiError(detail.message, { status: response.status, code: detail.code, detail: parsed });
    }
    return parsed;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new ApiError(`\u8BF7\u6C42\u8D85\u65F6\uFF08${timeoutMs}ms\uFF09\uFF1A${path}`, { status: 408, code: "TIMEOUT" });
    if (external?.aborted === true) throw new ApiError("\u8BF7\u6C42\u5DF2\u53D6\u6D88", { status: 499, code: "ABORTED" });
    throw new ApiError(String(error?.message ?? error), { status: 0, code: "NETWORK" });
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onAbort);
  }
}
var api = {
  get: (path, signal, params) => request(`${path}${params === void 0 ? "" : query(params)}`, signal === void 0 ? {} : { signal }),
  post: (path, body, signal) => request(path, { method: "POST", body: body ?? {}, ...signal === void 0 ? {} : { signal } }),
  put: (path, body) => request(path, { method: "PUT", body: body ?? {} }),
  patch: (path, body) => request(path, { method: "PATCH", body: body ?? {} }),
  del: (path, body) => request(path, body === void 0 ? { method: "DELETE" } : { method: "DELETE", body })
};
function errorText(error) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error ?? "\u672A\u77E5\u9519\u8BEF");
}

// src/data/query.ts
var import_react = require("react");
var entries = /* @__PURE__ */ new Map();
function entryFor(key) {
  const existing = entries.get(key);
  if (existing !== void 0) return existing;
  const created = {
    key,
    status: "idle",
    data: void 0,
    error: void 0,
    updatedAt: 0,
    pending: null,
    controller: null,
    fetcher: null,
    listeners: /* @__PURE__ */ new Set()
  };
  entries.set(key, created);
  return created;
}
function notify(entry) {
  for (const listener of entry.listeners) listener();
}
function peek(key) {
  const entry = entries.get(key);
  return entry === void 0 ? void 0 : entry;
}
function prime(key, data) {
  const entry = entryFor(key);
  entry.data = data;
  entry.error = void 0;
  entry.status = "ready";
  entry.updatedAt = Date.now();
  notify(entry);
}
function load(key, fetcher, force) {
  const entry = entryFor(key);
  entry.fetcher = fetcher;
  if (entry.pending !== null && !force) return entry.pending;
  entry.controller?.abort();
  const controller = new AbortController();
  entry.controller = controller;
  entry.status = entry.data === void 0 ? "loading" : "ready";
  const run = (async () => {
    try {
      const data = await fetcher(controller.signal);
      if (controller.signal.aborted) return;
      entry.data = data;
      entry.error = void 0;
      entry.status = "ready";
      entry.updatedAt = Date.now();
    } catch (error) {
      if (controller.signal.aborted) return;
      entry.error = error instanceof ApiError ? error : new ApiError(errorText(error));
      if (entry.data === void 0) entry.status = "error";
    } finally {
      if (entry.controller === controller) {
        entry.controller = null;
        entry.pending = null;
      }
      notify(entry);
    }
  })();
  entry.pending = run;
  notify(entry);
  return run;
}
async function ensure(key, fetcher, ttlMs = 3e3) {
  const entry = entryFor(key);
  const fresh = entry.data !== void 0 && entry.error === void 0 && Date.now() - entry.updatedAt < ttlMs;
  if (fresh) return entry.data;
  await load(key, fetcher, false);
  if (entry.error !== void 0 && entry.data === void 0) throw entry.error;
  if (entry.data === void 0) throw new ApiError(`\u6CA1\u6709\u53D6\u5230\u6570\u636E\uFF1A${key}`, { code: "EMPTY" });
  return entry.data;
}
function invalidate(prefix) {
  for (const [key, entry] of entries) {
    if (!key.startsWith(prefix)) continue;
    entry.updatedAt = 0;
    if (entry.listeners.size > 0 && entry.fetcher !== null) {
      void load(key, entry.fetcher, true);
    } else {
      notify(entry);
    }
  }
}
function useQuery(key, fetcher, options = {}) {
  const { ttlMs = 1e3, pollMs = 0, enabled: enabled2 = true } = options;
  const [, force] = (0, import_react.useReducer)((value) => value + 1, 0);
  const fetcherRef = (0, import_react.useRef)(fetcher);
  fetcherRef.current = fetcher;
  const ttlRef = (0, import_react.useRef)(ttlMs);
  ttlRef.current = ttlMs;
  (0, import_react.useEffect)(() => {
    if (key === null || !enabled2) return;
    const entry2 = entryFor(key);
    const listener = () => force();
    entry2.listeners.add(listener);
    const current = fetcherRef.current;
    const stale = entry2.data === void 0 || Date.now() - entry2.updatedAt >= ttlRef.current;
    if (stale && entry2.pending === null) void load(key, current, false);
    let timer = 0;
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      void load(key, fetcherRef.current, true);
    };
    if (pollMs > 0) timer = window.setInterval(tick, pollMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && pollMs > 0) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      entry2.listeners.delete(listener);
      if (timer !== 0) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, enabled2, pollMs]);
  const entry = key === null ? void 0 : peek(key);
  const refresh = (0, import_react.useCallback)(() => {
    if (key === null) return;
    void load(key, fetcherRef.current, true);
  }, [key]);
  return {
    data: entry?.data,
    error: entry?.error,
    detail: entry?.error?.detail,
    loading: entry === void 0 || entry.data === void 0 && (entry.status === "idle" || entry.status === "loading"),
    refreshing: entry !== void 0 && entry.data !== void 0 && entry.status !== "error" && entry.pending !== null,
    updatedAt: entry?.updatedAt ?? 0,
    refresh
  };
}

// src/data/resources.ts
var num = (value, fallback = 0) => {
  const parsed = Number(value ?? NaN);
  return Number.isFinite(parsed) ? parsed : fallback;
};
var str = (value, fallback = "") => value == null ? fallback : String(value);
var bool = (value) => value === true || value === "true" || value === 1;
function rowsOf(value, key) {
  if (Array.isArray(value)) return value;
  const inner = value?.[key];
  return Array.isArray(inner) ? inner : [];
}
function trafficRow(row) {
  const source = str(row["source"], "local");
  return {
    id: str(row["id"]),
    ts: Date.parse(str(row["ts"])) / 1e3 || num(row["ts"]),
    host: str(row["host"]),
    method: str(row["method"], "GET").toUpperCase(),
    url: str(row["url"]),
    status: num(row["status"]),
    contentType: str(row["content_type"]),
    bytes: num(row["resp_len"]),
    source: source === "archive" || source === "web" ? source : "local"
  };
}
async function fetchTrafficList(filter, signal) {
  const payload = await api.get("/api/traffic", signal, {
    host: filter.host ?? "",
    method: filter.method ?? "",
    status: filter.status ?? "",
    q: filter.q ?? "",
    sort: filter.sort ?? "ts",
    order: filter.order ?? "desc",
    page: filter.page ?? 0,
    size: filter.size ?? 100
  });
  return {
    rows: rowsOf(payload, "exchanges").map(trafficRow),
    total: num(payload["total"]),
    count: num(payload["count"]),
    archived: num(payload["archived"]),
    capturing: bool(payload["enabled"]),
    page: num(payload["page"]),
    size: num(payload["size"], 100)
  };
}
async function fetchTrafficTotals(signal) {
  const payload = await api.get("/api/traffic", signal, { page: 0, size: 1 });
  const count = num(payload["count"]);
  const archived = num(payload["archived"]);
  return { total: count, archived, local: Math.max(0, count - archived), capturing: bool(payload["enabled"]) };
}
async function fetchTrafficHosts(signal) {
  const payload = await api.get("/api/traffic/hosts", signal);
  return rowsOf(payload, "hosts").map((row) => ({ host: str(row["host"]), count: num(row["count"]) })).filter((row) => row.host !== "");
}
async function fetchCaptureSummary(signal) {
  const payload = await api.get("/api/traffic/capture", signal).catch(() => ({}));
  const sessions = rowsOf(payload, "sessions").map((row) => ({
    scope: str(row["scope"]),
    proxy: str(row["proxy"]),
    convId: str(row["conv_id"]),
    sessionId: str(row["session_id"]),
    source: str(row["source"]),
    startedAt: num(row["started_at"]),
    items: num(row["items"]),
    lastTs: num(row["last_ts"])
  }));
  return {
    active: bool(payload["active"]) || sessions.length > 0,
    total: num(payload["total"]),
    lastTs: num(payload["last_ts"]),
    sessions,
    recent: rowsOf(payload, "recent").map(trafficRow)
  };
}
async function fetchTrafficDetail(id, signal) {
  const payload = await api.get("/api/traffic/exchange", signal, { id });
  return { req: str(payload["req"]), resp: str(payload["resp"]) };
}
function webSession(row) {
  return {
    sessionId: str(row["sessionId"] ?? row["session_id"]),
    origin: str(row["origin"]),
    label: str(row["label"]),
    status: str(row["status"], "active"),
    adversarial: bool(row["adversarial"]),
    requestCount: num(row["requestCount"] ?? row["request_count"]),
    requestBudget: num(row["requestBudget"] ?? row["request_budget"]),
    createdAt: num(row["createdAt"] ?? row["created_at"]),
    lastRequestAt: num(row["lastRequestAt"] ?? row["last_request_at"])
  };
}
async function fetchWebSessions(signal) {
  const payload = await api.get("/api/web/sessions", signal).catch(() => ({}));
  return rowsOf(payload, "sessions").map(webSession);
}
async function fetchWebSession(sessionId, signal) {
  const payload = await api.get(`/api/web/sessions/${encodeURIComponent(sessionId)}`, signal);
  const session = webSession(payload["session"] ?? {});
  return {
    session,
    budgetLeft: num(payload["budgetLeft"] ?? payload["budget_left"]),
    history: rowsOf(payload, "history").map((row) => ({
      requestId: str(row["requestId"] ?? row["request_id"]),
      method: str(row["method"]).toUpperCase(),
      path: str(row["path"]),
      host: str(row["host"]),
      status: num(row["status"]),
      classification: str(row["classification"], "unknown"),
      durationMs: num(row["durationMs"] ?? row["duration_ms"]),
      responseBytes: num(row["responseBytes"] ?? row["response_bytes"]),
      attempt: num(row["attempt"], 1),
      mutation: str(row["mutation"], "none"),
      egressId: str(row["egressId"] ?? row["egress_id"], "direct"),
      identityId: str(row["identityId"] ?? row["identity_id"], "api-client"),
      timestamp: num(row["timestamp"]),
      title: str(row["title"])
    })),
    policyEvents: rowsOf(payload, "policyEvents").map((row) => ({
      at: str(row["at"]),
      kind: str(row["kind"]),
      detail: str(row["detail"] ?? row["message"])
    }))
  };
}
var HEALTH = /* @__PURE__ */ new Set(["up", "degraded", "down", "cooldown", "unknown"]);
function proxyNode(row) {
  const state = str(row["state"], "unknown");
  return {
    id: num(row["id"]),
    name: str(row["name"], `#${num(row["id"])}`),
    protocol: str(row["protocol"]),
    server: str(row["server"]),
    port: num(row["port"]),
    enabled: bool(row["enabled"]),
    state: HEALTH.has(state) ? state : "unknown",
    latencyMs: num(row["latency_ms"]),
    successRate: num(row["success_rate"], 1),
    requests: num(row["requests"]),
    failures: num(row["failures"]),
    inflight: num(row["inflight"]),
    egressIp: str(row["egress_ip"]),
    source: str(row["source"]),
    tags: Array.isArray(row["tags"]) ? row["tags"].map((tag) => str(tag)) : [],
    weight: num(row["weight"], 1),
    maxConns: num(row["max_conns"], 0),
    note: str(row["note"]),
    viaNodeId: num(row["via_node_id"])
  };
}
function normalizeProxyState(payload) {
  const engine = payload["engine"] ?? {};
  return {
    enabled: bool(payload["enabled"]),
    gateway: str(payload["gateway"]),
    socks: str(payload["socks"]),
    engineAvailable: bool(engine["available"]),
    engineError: str(engine["error"]),
    defaultPool: num(payload["default_pool"]),
    pools: rowsOf(payload, "pools").map((row) => ({
      id: num(row["id"]),
      name: str(row["name"], `#${num(row["id"])}`),
      strategy: str(row["strategy"], "weighted"),
      mode: str(row["mode_default"] ?? row["mode"], "sticky"),
      fallback: str(row["fallback"], "block"),
      fanoutK: num(row["fanout_k"], 3),
      maxConns: num(row["max_conns"]),
      note: str(row["note"]),
      nodeCount: num(row["node_count"]),
      healthyCount: num(row["healthy_count"]),
      members: Array.isArray(row["members"]) ? row["members"].map((id) => num(id)) : [],
      checkSeconds: num(row["check_interval"]),
      stickyTtl: num(row["sticky_ttl"]),
      healthUrl: str(row["health_url"])
    })),
    nodes: rowsOf(payload, "nodes").map(proxyNode),
    leases: rowsOf(payload, "sessions").map((row) => ({
      session: str(row["session"]),
      taskId: num(row["task_id"]),
      role: str(row["role"]),
      poolId: num(row["pool_id"]),
      poolName: str(row["pool_name"]),
      mode: str(row["mode"]),
      fallback: str(row["fallback"]),
      nodeId: num(row["node_id"]),
      nodeName: str(row["node_name"]),
      expiresAt: str(row["expires_at"]),
      requests: num(row["requests"]),
      failures: num(row["failures"]),
      lastError: str(row["last_error"])
    }))
  };
}
async function fetchProxyState(signal) {
  return normalizeProxyState(await api.get("/api/proxy/state", signal));
}
async function fetchProxySubscriptions(signal) {
  const payload = await api.get("/api/proxy/subscriptions", signal);
  return rowsOf(payload, "subscriptions").map((row) => ({
    id: num(row["id"]),
    name: str(row["name"], `#${num(row["id"])}`),
    url: str(row["url"]),
    poolId: num(row["pool_id"] ?? row["poolId"]),
    intervalSeconds: num(row["interval_seconds"] ?? row["intervalSeconds"], 3600),
    enabled: bool(row["enabled"]),
    lastError: str(row["last_error"] ?? row["lastError"]),
    lastAdded: num(row["last_added"] ?? row["lastAdded"]),
    lastRemoved: num(row["last_removed"] ?? row["lastRemoved"])
  }));
}
async function fetchProxySettings(signal) {
  const payload = await api.get("/api/proxy/settings", signal);
  return {
    defaultPool: num(payload["default_pool"]),
    listenerAuth: bool(payload["egress_listener_auth"]),
    fanoutBudgetPerHour: num(payload["fanout_budget_per_hour"])
  };
}
async function fetchTaskSummary(days = 30, signal) {
  return api.get("/api/tasks/summary", signal, { days });
}
async function fetchTasks(params, signal) {
  return api.get("/api/tasks", signal, {
    q: params.q ?? "",
    status: params.status ?? "",
    page: params.page ?? 1,
    size: params.size ?? 20
  });
}
async function fetchFindingStats(signal) {
  const payload = await api.get("/api/exploration/findings/stats", signal);
  return {
    total: num(payload["total"]),
    pending: num(payload["pending"]),
    critical: num(payload["critical"]),
    high: num(payload["high"]),
    medium: num(payload["medium"]),
    low: num(payload["low"])
  };
}
var LIVE_MS = 5e3;
function useTrafficList(filter, live = false) {
  return useQuery(
    `traffic:list:${JSON.stringify(filter)}`,
    (signal) => fetchTrafficList(filter, signal),
    { ttlMs: live ? LIVE_MS : 2e3, pollMs: live ? LIVE_MS : 0 }
  );
}
function useTrafficTotals(live = true) {
  return useQuery("traffic:totals", fetchTrafficTotals, { ttlMs: LIVE_MS, pollMs: live ? LIVE_MS : 0 });
}
function useTrafficHosts() {
  return useQuery("traffic:hosts", fetchTrafficHosts, { ttlMs: 1e4 });
}
function useCaptureSummary(live = true) {
  return useQuery("traffic:capture", fetchCaptureSummary, { ttlMs: LIVE_MS, pollMs: live ? LIVE_MS : 0 });
}
function useWebSessions(live = true) {
  return useQuery("web:sessions", fetchWebSessions, { ttlMs: LIVE_MS, pollMs: live ? 1e4 : 0 });
}
function useWebSession(sessionId) {
  return useQuery(
    sessionId === null ? null : `web:session:${sessionId}`,
    (signal) => fetchWebSession(sessionId, signal),
    { ttlMs: 3e3 }
  );
}
function useProxyState(live = true) {
  return useQuery("proxy:state", fetchProxyState, { ttlMs: LIVE_MS, pollMs: live ? 1e4 : 0 });
}
function useProxySubscriptions() {
  return useQuery("proxy:subscriptions", fetchProxySubscriptions, { ttlMs: 1e4 });
}
function useProxySettings() {
  return useQuery("proxy:settings", fetchProxySettings, { ttlMs: 3e4 });
}
function useTaskSummary(days = 30) {
  return useQuery(`tasks:summary:${days}`, (signal) => fetchTaskSummary(days, signal), { ttlMs: 5e3 });
}
function useTasks(params) {
  return useQuery(`tasks:list:${JSON.stringify(params)}`, (signal) => fetchTasks(params, signal), { ttlMs: 3e3 });
}
var overviewSources = {
  summary: () => ensure("tasks:summary:30", (signal) => fetchTaskSummary(30, signal), 5e3),
  tasks: () => ensure('tasks:list:{"page":1,"size":200}', (signal) => fetchTasks({ page: 1, size: 200 }, signal), 5e3),
  totals: () => ensure("traffic:totals", fetchTrafficTotals, LIVE_MS),
  hosts: () => ensure("traffic:hosts", fetchTrafficHosts, 1e4),
  capture: () => ensure("traffic:capture", fetchCaptureSummary, LIVE_MS),
  findings: () => ensure("findings:stats", fetchFindingStats, 1e4)
};

// src/overview.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function storeGet(key) {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function storeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
  }
}
async function getJson(path, signal) {
  return request(path, signal === void 0 ? {} : { signal });
}
var EMPTY_DATA = {
  tasks: [],
  summary: null,
  stats: { total: 0, pending: 0, critical: 0, high: 0, medium: 0, low: 0 },
  findings: [],
  assets: {},
  daily: [],
  traffic: [],
  trafficTotal: 0,
  trafficHosts: [],
  activity: [],
  sys: { agents: 0, agentsOn: 0, mcp: 0, mcpOn: 0, tools: 0, toolsOn: 0 },
  capture: false,
  captureSessions: 0,
  captureLastTs: 0,
  updated: 0
};
function pick(result, fallback) {
  return result.status === "fulfilled" ? result.value : fallback;
}
async function loadOverview() {
  const settled = await Promise.allSettled([
    overviewSources.tasks().then((page) => ({ tasks: page.tasks })),
    overviewSources.findings(),
    getJson("/api/exploration/findings?page=1&limit=60"),
    getJson("/api/assets/counts"),
    getJson("/api/tokens/daily?days=365"),
    overviewSources.capture(),
    getJson("/api/exploration/activity?limit=14"),
    getJson("/api/agents"),
    getJson("/api/mcp"),
    getJson("/api/tools"),
    overviewSources.hosts().then((hosts) => ({ hosts })),
    overviewSources.summary(),
    overviewSources.totals()
  ]);
  const rejected = settled.slice(0, 5).filter((item) => item.status === "rejected")[0];
  const failure = rejected === void 0 ? void 0 : rejected.reason;
  const error = failure === void 0 ? "" : String(failure.message ?? failure);
  const tasks = pick(settled[0], {});
  const stats = pick(settled[1], {});
  const findings = pick(settled[2], {});
  const assets = pick(settled[3], {});
  const daily = pick(settled[4], []);
  const capture = pick(settled[5], {});
  const activity = pick(settled[6], {});
  const agents = pick(settled[7], {});
  const mcp = pick(settled[8], {});
  const tools = pick(settled[9], {});
  const hostRows = pick(settled[10], {});
  const totals = pick(settled[12], { total: 0, archived: 0, local: 0, capturing: false });
  const summary = pick(settled[11], {});
  const countOn = (rows) => (rows ?? []).filter((row) => row.enabled !== false).length;
  const sessions = Array.isArray(capture.sessions) ? capture.sessions : [];
  const recent = Array.isArray(capture.recent) ? capture.recent : [];
  return {
    error,
    data: {
      tasks: Array.isArray(tasks.tasks) ? tasks.tasks : [],
      summary: summary !== null && typeof summary === "object" && Number.isFinite(Number(summary.total)) ? summary : null,
      stats: {
        total: Number(stats.total ?? 0),
        pending: Number(stats.pending ?? 0),
        critical: Number(stats.critical ?? 0),
        high: Number(stats.high ?? 0),
        medium: Number(stats.medium ?? 0),
        low: Number(stats.low ?? 0)
      },
      findings: Array.isArray(findings.items) ? findings.items : [],
      assets: assets !== null && typeof assets === "object" ? assets : {},
      daily: Array.isArray(daily) ? daily : [],
      traffic: recent,
      trafficTotal: Number(totals.total ?? capture.total ?? 0),
      trafficHosts: (Array.isArray(hostRows.hosts) ? hostRows.hosts : []).map((row) => ({ host: String(row?.host ?? ""), count: Number(row?.count ?? 0) })).filter((row) => row.host !== "" && Number.isFinite(row.count)),
      activity: Array.isArray(activity.items) ? activity.items : [],
      sys: {
        agents: agents.agents?.length ?? 0,
        agentsOn: countOn(agents.agents),
        mcp: mcp.servers?.length ?? 0,
        mcpOn: countOn(mcp.servers),
        tools: tools.tools?.length ?? 0,
        toolsOn: countOn(tools.tools)
      },
      // Only the capture aggregate decides: `settings.traffic_capture` is the
      // collector's own switch and says nothing about an armed conversation.
      capture: capture.active === true || sessions.length > 0,
      captureSessions: sessions.length,
      captureLastTs: Number(capture.lastTs ?? capture.last_ts ?? 0),
      updated: Date.now()
    }
  };
}
function useOverview(intervalMs) {
  const result = useQuery("overview:composite", () => loadOverview(), { ttlMs: 0, pollMs: intervalMs });
  const payload = result.data;
  return {
    data: payload?.data ?? EMPTY_DATA,
    error: payload?.error ?? result.error?.message ?? "",
    reload: result.refresh
  };
}
var pad2 = (value) => value < 10 ? `0${value}` : String(value);
function fmtNum(value) {
  if (!Number.isFinite(value)) return "\u2014";
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${(value / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(value));
}
function fmtInt(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("zh-CN") : "\u2014";
}
function fmtPct(value, digits = 1) {
  if (!Number.isFinite(value)) return "\u2014";
  return `${value.toFixed(digits)}%`;
}
function fmtRel(ts) {
  if (ts === void 0 || ts === null || ts === "") return "\u2014";
  const ms = Date.now() - (typeof ts === "number" ? ts * 1e3 : Date.parse(ts));
  if (!Number.isFinite(ms) || ms < 0) return "\u521A\u521A";
  const seconds = Math.floor(ms / 1e3);
  if (seconds < 60) return `${seconds}s \u524D`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m \u524D`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h \u524D`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d \u524D` : `${Math.floor(days / 30)}mo \u524D`;
}
function deltaOf(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return (current - previous) / previous * 100;
}
var ASSET_LABELS = {
  root_domain: "\u6839\u57DF\u540D",
  ip: "IP",
  subdomain: "\u5B50\u57DF\u540D",
  app: "\u5E94\u7528",
  service: "\u670D\u52A1",
  endpoint: "\u7AEF\u70B9"
};
var SEVERITY_META = [
  { key: "critical", label: "\u4E25\u91CD", tone: "var(--vx-chart-5)" },
  { key: "high", label: "\u9AD8\u5371", tone: "var(--vx-chart-4)" },
  { key: "medium", label: "\u4E2D\u5371", tone: "var(--vx-chart-1)" },
  { key: "low", label: "\u4F4E\u5371", tone: "var(--vx-chart-3)" }
];
var STATUS_LABELS = {
  pending: "\u5F85\u5904\u7406",
  in_progress: "\u5904\u7406\u4E2D",
  confirmed: "\u5DF2\u786E\u8BA4",
  resolved: "\u5DF2\u89E3\u51B3",
  fixed: "\u5DF2\u4FEE\u590D",
  false_positive: "\u8BEF\u62A5",
  ignored: "\u5FFD\u7565",
  duplicate: "\u91CD\u590D",
  risk_accepted: "\u63A5\u53D7\u98CE\u9669"
};
var TASK_LIFECYCLE_FALLBACK = [
  { key: "created", label: "\u5F85\u542F\u52A8", tone: "muted" },
  { key: "queued", label: "\u6392\u961F\u4E2D", tone: "info" },
  { key: "running", label: "\u8FDB\u884C\u4E2D", tone: "success" },
  { key: "paused", label: "\u5DF2\u6682\u505C", tone: "warn" },
  { key: "done", label: "\u5DF2\u5B8C\u6210", tone: "success" },
  { key: "failed", label: "\u5931\u8D25", tone: "error" },
  { key: "timeout", label: "\u5DF2\u8D85\u65F6", tone: "error" }
];
var STATUS_TONE = {
  muted: "var(--vx-text-faint)",
  info: "var(--vx-chart-2)",
  success: "var(--vx-chart-3)",
  warn: "var(--vx-chart-4)",
  error: "var(--vx-chart-5)"
};
var TASK_STATUS_META = Object.fromEntries(
  TASK_LIFECYCLE_FALLBACK.map((entry) => [entry.key, { label: entry.label, tone: STATUS_TONE[entry.tone] ?? "var(--vx-text-faint)" }])
);
function statusMetaOf(status) {
  return TASK_STATUS_META[status] ?? { label: status === "" ? "\u2014" : status, tone: "var(--vx-text-faint)" };
}
function useWidth() {
  const [width, setWidth] = (0, import_react2.useState)(0);
  const observer = (0, import_react2.useRef)(null);
  const attach = (0, import_react2.useCallback)((node) => {
    observer.current?.disconnect();
    observer.current = null;
    if (node === null) return;
    setWidth(node.clientWidth);
    if (typeof ResizeObserver !== "function") return;
    const resize = new ResizeObserver(() => {
      setWidth(node.clientWidth);
    });
    resize.observe(node);
    observer.current = resize;
  }, []);
  (0, import_react2.useEffect)(() => () => {
    observer.current?.disconnect();
  }, []);
  return [attach, width];
}
function niceMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const ratio = value / magnitude;
  const step = ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 2.5 ? 2.5 : ratio <= 5 ? 5 : 10;
  return step * magnitude;
}
function smoothPath(points) {
  if (points.length === 0) return "";
  const first = points[0];
  if (first === void 0) return "";
  if (points.length === 1) return `M${first[0]},${first[1]}`;
  let d = `M${first[0]},${first[1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p1 = points[index];
    const p2 = points[index + 1];
    if (p1 === void 0 || p2 === void 0) break;
    const p0 = points[index - 1] ?? p1;
    const p3 = points[index + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}
var ICON_PATHS = {
  gauge: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 13.5 16 9" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5.5 19a8.5 8.5 0 1 1 13 0" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "14", r: "1.4" })
  ] }),
  target: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "12", r: "8" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "12", r: "3.4" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 2v3M12 19v3M2 12h3M19 12h3" })
  ] }),
  bug: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 6a4 4 0 0 1 8 0" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "6.5", y: "8", width: "11", height: "11", rx: "5.5" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3 12h3.5M17.5 12H21M4.5 17h2.2M17.3 17h2.2M6 7.5 4 5.5M18 7.5l2-2" })
  ] }),
  network: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "9", y: "3", width: "6", height: "5", rx: "1.4" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "3", y: "16", width: "6", height: "5", rx: "1.4" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "15", y: "16", width: "6", height: "5", rx: "1.4" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 8v5M6 16v-3h12v3" })
  ] }),
  activity: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3 12h4l2.5-6 4 12L16 12h5" }),
  zap: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z" }),
  shield: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 3l7 3v6c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6l7-3Z" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m9 12 2.2 2.2L15.5 10" })
  ] }),
  clock: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "12", r: "8.5" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 7.5V12l3 2" })
  ] }),
  calendar: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "3.5", y: "5", width: "17", height: "15.5", rx: "2.4" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 3v4M16 3v4M3.5 10h17" })
  ] }),
  arrowUp: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 19V5m0 0-5.5 5.5M12 5l5.5 5.5" }),
  arrowDown: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 5v14m0 0 5.5-5.5M12 19l-5.5-5.5" }),
  minus: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5 12h14" }),
  layers: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 3 3 7.5l9 4.5 9-4.5L12 3ZM3 12.5 12 17l9-4.5M3 17 12 21.5 21 17" }),
  flame: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 3c3.5 4 6 6.4 6 10a6 6 0 0 1-12 0c0-2.2 1.2-3.9 3-5.6.4 1.6 1.3 2.4 2.4 2.6C11 8.4 11.2 5.6 12 3Z" })
};
function Icon({ name, size = 14 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.7,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: ICON_PATHS[name]
    }
  );
}
function Segmented({
  value,
  options,
  onChange
}) {
  const index = Math.max(0, options.findIndex((option) => option.key === value));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-seg", role: "group", "aria-label": "\u7EDF\u8BA1\u8303\u56F4", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "span",
      {
        className: "vx-ov-seg-thumb",
        style: { width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${index * 100}%)` },
        "aria-hidden": "true"
      }
    ),
    options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        "aria-pressed": option.key === value,
        onClick: () => {
          onChange(option.key);
        },
        children: option.label
      },
      option.key
    ))
  ] });
}
function Delta({ value, suffix }) {
  if (value === null) return null;
  const dir = value > 0.05 ? "up" : value < -0.05 ? "down" : "flat";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-delta", "data-dir": dir, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: dir === "up" ? "arrowUp" : dir === "down" ? "arrowDown" : "minus", size: 11 }),
    fmtPct(Math.abs(value)),
    suffix !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: suffix }) : null
  ] });
}
function Spark({ values, height = 16 }) {
  const uid = (0, import_react2.useId)().replace(/:/g, "");
  const w = 74;
  const h2 = 24;
  const data = values.length > 1 ? values : [0, 0];
  const max = Math.max(...data, 1);
  const step = w / (data.length - 1);
  const points = data.map((value, index) => [index * step, h2 - 2 - value / max * (h2 - 5)]);
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h2} L0,${h2} Z`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "svg",
    {
      className: "vx-ov-spark",
      width: "100%",
      height,
      viewBox: `0 0 ${w} ${h2}`,
      preserveAspectRatio: "none",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: `${uid}-spark`, x1: "0", y1: "0", x2: "0", y2: "1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0%", style: { stopColor: "var(--vx-tone, var(--vx-chart-1))", stopOpacity: 0.32 } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "100%", style: { stopColor: "var(--vx-tone, var(--vx-chart-1))", stopOpacity: 0 } })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: area, fill: `url(#${uid}-spark)` }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "path",
          {
            d: line,
            fill: "none",
            stroke: "var(--vx-tone, var(--vx-chart-1))",
            strokeWidth: "1.4",
            strokeLinejoin: "round",
            strokeLinecap: "round"
          }
        )
      ]
    }
  );
}
function AreaChart({ points, height }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = (0, import_react2.useState)(null);
  const uid = (0, import_react2.useId)().replace(/:/g, "");
  const w = Math.max(width, 300);
  const pad = { top: 14, right: 10, bottom: 20, left: 40 };
  const plotW = Math.max(w - pad.left - pad.right, 40);
  const plotH = Math.max(height - pad.top - pad.bottom, 40);
  const max = niceMax(points.reduce((high, point) => Math.max(high, point.total, point.prev), 0));
  const x = (index) => pad.left + (points.length <= 1 ? plotW / 2 : plotW * index / (points.length - 1));
  const y = (value) => pad.top + plotH - value / max * plotH;
  const current = points.map((point, index) => [x(index), y(point.total)]);
  const previous = points.map((point, index) => [x(index), y(point.prev)]);
  const line = smoothPath(current);
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(pad.top + plotH).toFixed(1)} L${pad.left},${(pad.top + plotH).toFixed(1)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const active = hover !== null ? points[hover] : void 0;
  const tipLeft = hover !== null ? Math.min(Math.max(x(hover), 84), w - 84) : 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-plot", ref, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: w, height, role: "img", "aria-label": "\u6BCF\u65E5 Token \u6D88\u8017\u8D8B\u52BF", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("defs", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: `${uid}-fill`, x1: "0", y1: "0", x2: "0", y2: "1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0%", style: { stopColor: "var(--vx-chart-1)", stopOpacity: 0.32 } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "70%", style: { stopColor: "var(--vx-chart-1)", stopOpacity: 0.06 } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "100%", style: { stopColor: "var(--vx-chart-1)", stopOpacity: 0 } })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: `${uid}-stroke`, x1: "0", y1: "0", x2: "1", y2: "0", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0%", style: { stopColor: "var(--vx-chart-1)" } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "100%", style: { stopColor: "var(--vx-chart-2)" } })
        ] })
      ] }),
      ticks.map((ratio) => {
        const ty = pad.top + plotH * (1 - ratio);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "line",
            {
              x1: pad.left,
              x2: pad.left + plotW,
              y1: ty,
              y2: ty,
              stroke: "var(--vx-chart-grid)",
              strokeDasharray: ratio === 0 ? void 0 : "1 4"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: pad.left - 8, y: ty + 3, textAnchor: "end", className: "vx-ov-axis", children: fmtNum(max * ratio) })
        ] }, ratio);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: area, fill: `url(#${uid}-fill)` }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "path",
        {
          d: smoothPath(previous),
          fill: "none",
          stroke: "var(--vx-chart-6)",
          strokeWidth: "1.2",
          strokeDasharray: "4 4",
          strokeOpacity: "0.55"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "path",
        {
          d: line,
          fill: "none",
          stroke: `url(#${uid}-stroke)`,
          strokeWidth: "2",
          strokeLinecap: "round",
          className: "vx-ov-draw"
        }
      ),
      points.map((point, index) => {
        const last = index === points.length - 1;
        if (!last && index % labelStep !== 0) return null;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "text",
          {
            x: x(index),
            y: height - 5,
            textAnchor: last ? "end" : index === 0 ? "start" : "middle",
            className: "vx-ov-axis",
            children: point.day.slice(5)
          },
          `x-${point.day}`
        );
      }),
      hover !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "line",
          {
            x1: x(hover),
            x2: x(hover),
            y1: pad.top,
            y2: pad.top + plotH,
            stroke: "var(--vx-chart-1)",
            strokeOpacity: "0.4",
            strokeDasharray: "3 3"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "circle",
          {
            cx: x(hover),
            cy: y(points[hover]?.total ?? 0),
            r: "3.4",
            fill: "var(--vx-chart-1)",
            stroke: "var(--vx-surface)",
            strokeWidth: "1.6"
          }
        )
      ] }),
      points.map((point, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "rect",
        {
          x: x(index) - plotW / Math.max(points.length, 1) / 2,
          y: pad.top,
          width: plotW / Math.max(points.length, 1),
          height: plotH,
          fill: "transparent",
          onPointerEnter: () => {
            setHover(index);
          },
          onPointerLeave: () => {
            setHover((value) => value === index ? null : value);
          }
        },
        `hit-${point.day}`
      ))
    ] }),
    active !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-tip", style: { left: tipLeft, top: 2 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-tip-day", children: active.day }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-tip-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: "var(--vx-chart-1)" } }),
          "\u672C\u671F"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtNum(active.total) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-tip-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: "var(--vx-chart-6)" } }),
          "\u4E0A\u671F"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtNum(active.prev) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-tip-row vx-ov-tip-total", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: "var(--vx-chart-3)" } }),
          "\u7F13\u5B58"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtNum(active.cache) })
      ] })
    ] })
  ] });
}
function Donut({
  segments,
  size = 128,
  thickness = 12,
  center,
  caption
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let offset = 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-donut", style: { width: size, height: size }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: size, height: size, "aria-hidden": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: size / 2, cy: size / 2, r: radius, fill: "none", stroke: "var(--vx-chart-grid)", strokeWidth: thickness }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("g", { transform: `rotate(-90 ${size / 2} ${size / 2})`, children: segments.map((segment) => {
        const length = total > 0 ? segment.value / total * circumference : 0;
        const drawn = Math.max(length - 2.5, 0);
        const node = length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "circle",
          {
            cx: size / 2,
            cy: size / 2,
            r: radius,
            fill: "none",
            stroke: segment.tone,
            strokeWidth: thickness,
            strokeLinecap: "round",
            strokeDasharray: `${drawn} ${circumference - drawn}`,
            strokeDashoffset: -offset,
            className: "vx-ov-arc"
          },
          segment.label
        ) : null;
        offset += length;
        return node;
      }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-donut-center", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: center }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: caption })
    ] })
  ] });
}
function Ring({ value, label, caption, size = 92 }) {
  const uid = (0, import_react2.useId)().replace(/:/g, "");
  const thickness = 9;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, value / 100));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-ring", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-ring-box", style: { width: size, height: size }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: size, height: size, "aria-hidden": "true", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: `${uid}-ring`, x1: "0", y1: "0", x2: "1", y2: "1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0%", style: { stopColor: "var(--vx-chart-3)" } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "100%", style: { stopColor: "var(--vx-chart-1)" } })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: size / 2, cy: size / 2, r: radius, fill: "none", stroke: "var(--vx-chart-grid)", strokeWidth: thickness }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "circle",
          {
            cx: size / 2,
            cy: size / 2,
            r: radius,
            fill: "none",
            stroke: `url(#${uid}-ring)`,
            strokeWidth: thickness,
            strokeLinecap: "round",
            strokeDasharray: `${circumference * ratio} ${circumference}`,
            transform: `rotate(-90 ${size / 2} ${size / 2})`,
            className: "vx-ov-arc"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-ring-value", children: fmtPct(value, 0) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-ring-label", children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-ring-caption", children: caption })
  ] });
}
function HBars({ rows }) {
  if (rows.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { label: "\u6682\u65E0\u6570\u636E" });
  const max = Math.max(...rows.map((row) => row.value), 1);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-hbars", children: rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-hbar", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-hbar-label", children: row.label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-hbar-track", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: { width: `${Math.max(row.value / max * 100, 3)}%`, background: row.tone ?? "var(--vx-chart-6)" } }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-hbar-value", children: fmtInt(row.value) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-hbar-pct", children: total > 0 ? fmtPct(row.value / total * 100, 0) : "\u2014" })
  ] }, row.label)) });
}
function Heatmap({ days }) {
  const max = Math.max(...days.map((item) => item.value), 1);
  const cells = [...days];
  while (cells.length % 7 !== 0) cells.unshift({ day: "", value: -1 });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-heat-wrap", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-heat", children: cells.map((cell, index) => {
      const ratio = cell.value < 0 ? -1 : cell.value / max;
      const level = ratio < 0 ? "pad" : ratio === 0 ? "0" : ratio < 0.25 ? "1" : ratio < 0.5 ? "2" : ratio < 0.75 ? "3" : "4";
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "span",
        {
          className: "vx-ov-heat-cell",
          "data-level": level,
          title: cell.value < 0 ? "" : `${cell.day} \xB7 ${fmtNum(cell.value)} tokens`
        },
        `${cell.day}-${index}`
      );
    }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-heat-legend", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5C11" }),
      ["0", "1", "2", "3", "4"].map((level) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { "data-level": level }, level)),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u591A" })
    ] })
  ] });
}
function CodeBar({ codes, total }) {
  if (total <= 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-codebar vx-ov-codebar--empty" });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-codebar", children: codes.map((code) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: { flexGrow: Math.max(code.value, 0.01), background: code.tone }, title: `${code.label} \xB7 ${code.value}` }, code.label)) });
}
function Empty({ label }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-empty", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "layers", size: 18 }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label })
  ] });
}
function Section({
  span = 12,
  icon,
  title,
  caption,
  action,
  children
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: `vx-ov-card vx-ov-span-${span}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "vx-ov-h", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: icon, size: 13 }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: title }),
      caption !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-sub", children: caption }) : null,
      action !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-h-action", children: action }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-card-body", children })
  ] });
}
function Stat({
  tone,
  icon,
  label,
  value,
  unit,
  delta,
  spark,
  band,
  footer
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: `vx-ov-stat vx-ov-tone-${tone}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-stat-top", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-stat-icon", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: icon, size: 13 }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-stat-label", children: label }),
      delta !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Delta, { value: delta, suffix: "\u73AF\u6BD4" }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-stat-value", children: [
      value,
      unit !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: unit }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-stat-foot", children: footer }),
    spark !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Spark, { values: spark }) : null,
    band !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-stat-band", children: band }) : null
  ] });
}
var RANGES = [
  { key: "7", days: 7, label: "7 \u5929" },
  { key: "30", days: 30, label: "30 \u5929" },
  { key: "90", days: 90, label: "90 \u5929" }
];
function dateKey(ago) {
  const now = /* @__PURE__ */ new Date();
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cursor.setUTCDate(cursor.getUTCDate() - ago);
  return `${cursor.getUTCFullYear()}-${pad2(cursor.getUTCMonth() + 1)}-${pad2(cursor.getUTCDate())}`;
}
function buildRange(daily, days) {
  const map = /* @__PURE__ */ new Map();
  for (const row of daily) {
    const key = String(row.day ?? "");
    if (key !== "") map.set(key, row);
  }
  const out = [];
  for (let ago = days - 1; ago >= 0; ago -= 1) {
    const day = dateKey(ago);
    const previous = map.get(dateKey(ago + days));
    const current = map.get(day);
    const input = Number(current?.input_tokens ?? 0);
    const output = Number(current?.output_tokens ?? 0);
    const cache = Number(current?.cache_read_tokens ?? 0);
    const prevInput = Number(previous?.input_tokens ?? 0);
    const prevOutput = Number(previous?.output_tokens ?? 0);
    out.push({ day, input, output, cache, total: input + output, prev: prevInput + prevOutput });
  }
  return out;
}
var CODE_TONES = [
  { bucket: 2, label: "2xx", tone: "var(--vx-chart-3)" },
  { bucket: 3, label: "3xx", tone: "var(--vx-chart-1)" },
  { bucket: 4, label: "4xx", tone: "var(--vx-chart-4)" },
  { bucket: 5, label: "5xx", tone: "var(--vx-chart-5)" }
];
function derive(data, days) {
  const cutoff = Date.now() / 1e3 - days * 86400;
  const prevCutoff = cutoff - days * 86400;
  const counts = { created: 0, queued: 0, running: 0, paused: 0, done: 0, failed: 0, timeout: 0 };
  let goalsMet = 0;
  let goalsTotal = 0;
  let created = 0;
  let createdPrev = 0;
  let inFlight = 0;
  const throughput = new Array(days).fill(0);
  for (const task of data.tasks) {
    const status = String(task.status ?? "");
    if (status === "queued") counts.queued += 1;
    else if (status === "running") counts.running += 1;
    else if (status === "paused") counts.paused += 1;
    else if (status === "done") counts.done += 1;
    else if (status === "failed") counts.failed += 1;
    else if (status === "timeout") counts.timeout += 1;
    else counts.created += 1;
    goalsMet += Number(task.goals_met ?? 0);
    goalsTotal += Number(task.goals_total ?? 0);
    inFlight += Number(task.in_flight ?? 0);
    const createdUnix = Number(task.created_unix ?? 0);
    if (createdUnix >= cutoff) {
      created += 1;
      const index = days - 1 - Math.min(days - 1, Math.floor((Date.now() / 1e3 - createdUnix) / 86400));
      throughput[index] = (throughput[index] ?? 0) + 1;
    } else if (createdUnix >= prevCutoff) {
      createdPrev += 1;
    }
  }
  const trend = buildRange(data.daily, days);
  const tokens = trend.reduce(
    (acc, point) => ({
      input: acc.input + point.input,
      output: acc.output + point.output,
      cache: acc.cache + point.cache,
      total: acc.total + point.total,
      prev: acc.prev + point.prev
    }),
    { input: 0, output: 0, cache: 0, total: 0, prev: 0 }
  );
  const cacheRate = tokens.input > 0 ? tokens.cache / tokens.input * 100 : 0;
  const peak = trend.reduce(
    (best, point) => point.total > best.value ? { day: point.day, value: point.total } : best,
    { day: trend[0]?.day ?? "\u2014", value: 0 }
  );
  const sevTotal = data.stats.critical + data.stats.high + data.stats.medium + data.stats.low;
  const vulnCounts = /* @__PURE__ */ new Map();
  const statusCounts = /* @__PURE__ */ new Map();
  for (const finding of data.findings) {
    const vuln = finding.vulnclass ?? "\u672A\u5206\u7C7B";
    vulnCounts.set(vuln, (vulnCounts.get(vuln) ?? 0) + 1);
    const status = finding.status ?? "unknown";
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }
  const vulnTop = [...vulnCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6).map(([label, value]) => ({ label, value, tone: "var(--vx-chart-2)" }));
  const statusRows = [...statusCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6).map(([status, value]) => ({
    label: STATUS_LABELS[status] ?? status,
    value,
    tone: status === "confirmed" || status === "resolved" || status === "fixed" ? "var(--vx-chart-3)" : "var(--vx-chart-1)"
  }));
  const codeCounts = /* @__PURE__ */ new Map();
  const methodCounts = /* @__PURE__ */ new Map();
  const hostCounts = /* @__PURE__ */ new Map();
  for (const row of data.trafficHosts) hostCounts.set(row.host, row.count);
  if (hostCounts.size === 0) {
    for (const exchange of data.traffic) {
      const host = String(exchange.host ?? "");
      if (host === "") continue;
      hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
    }
  }
  for (const exchange of data.traffic) {
    const status = Number(exchange.status ?? 0);
    if (status > 0) {
      const bucket = Math.floor(status / 100);
      codeCounts.set(bucket, (codeCounts.get(bucket) ?? 0) + 1);
    }
    const method = String(exchange.method ?? "GET");
    methodCounts.set(method, (methodCounts.get(method) ?? 0) + 1);
  }
  const codes = CODE_TONES.map((item) => ({ label: item.label, value: codeCounts.get(item.bucket) ?? 0, tone: item.tone }));
  const trafficTotal = data.traffic.length;
  const errorRate = trafficTotal > 0 ? ((codeCounts.get(4) ?? 0) + (codeCounts.get(5) ?? 0)) / trafficTotal * 100 : 0;
  const assetRows = Object.entries(data.assets).filter(([, value]) => Number(value) > 0).map(([type, value]) => ({ label: ASSET_LABELS[type] ?? type, value: Number(value), tone: "var(--vx-chart-6)" })).sort((left, right) => right.value - left.value).slice(0, 6);
  const assetTotal = Object.values(data.assets).reduce((sum, value) => sum + Number(value), 0);
  const heat = buildRange(data.daily, 90).map((point) => ({ day: point.day, value: point.total }));
  const findingsDaily = new Array(days).fill(0);
  for (const finding of data.findings) {
    const stamp = Date.parse(finding.ts ?? "");
    if (!Number.isFinite(stamp)) continue;
    const ago = Math.floor((Date.now() - stamp) / 864e5);
    if (ago >= 0 && ago < days) findingsDaily[days - 1 - ago] = (findingsDaily[days - 1 - ago] ?? 0) + 1;
  }
  const recentTasks = [...data.tasks].sort((left, right) => Number(right.last_activity_unix ?? right.created_unix ?? 0) - Number(left.last_activity_unix ?? left.created_unix ?? 0)).slice(0, 7);
  const findings = [...data.findings].sort((left, right) => (Date.parse(right.ts ?? "") || 0) - (Date.parse(left.ts ?? "") || 0));
  const activity = [...data.activity].sort((left, right) => Number(right.seq ?? 0) - Number(left.seq ?? 0));
  const summary = data.summary;
  const num3 = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const taskTotal = summary === null ? data.tasks.length : num3(summary.total, data.tasks.length);
  if (summary?.by_status !== void 0) {
    counts.created = num3(summary.by_status.created, counts.created);
    counts.queued = num3(summary.by_status.queued, counts.queued);
    counts.running = num3(summary.by_status.running, counts.running);
    counts.paused = num3(summary.by_status.paused, counts.paused);
    counts.done = num3(summary.by_status.done, counts.done);
    counts.failed = num3(summary.by_status.failed, counts.failed);
    counts.timeout = num3(summary.by_status.timeout, counts.timeout);
  }
  if (summary !== null) {
    goalsMet = num3(summary.goals_met, goalsMet);
    goalsTotal = num3(summary.goals_total, goalsTotal);
    inFlight = num3(summary.in_flight, inFlight);
  }
  const lifecycle = Array.isArray(summary?.lifecycle) && summary.lifecycle.length > 0 ? summary.lifecycle.filter((entry) => typeof entry?.key === "string") : TASK_LIFECYCLE_FALLBACK;
  const statusMeta = {};
  for (const entry of lifecycle) {
    statusMeta[entry.key] = { label: entry.label ?? entry.key, tone: STATUS_TONE[entry.tone] ?? "var(--vx-text-faint)" };
  }
  const completionRate = summary === null ? taskTotal > 0 ? counts.done / taskTotal * 100 : 0 : num3(summary.completion_rate, taskTotal > 0 ? counts.done / taskTotal * 100 : 0);
  const goalRate = summary === null ? goalsTotal > 0 ? goalsMet / goalsTotal * 100 : 0 : num3(summary.goal_rate, goalsTotal > 0 ? goalsMet / goalsTotal * 100 : 0);
  return {
    scopeDays: days,
    counts,
    taskTotal,
    taskInFlight: inFlight,
    lifecycle,
    statusMeta,
    completionRate,
    goalRate,
    goalsMet,
    goalsTotal,
    created,
    createdPrev,
    throughput,
    tasks: data.tasks,
    recentTasks,
    sev: data.stats,
    sevHighRate: sevTotal > 0 ? (data.stats.critical + data.stats.high) / sevTotal * 100 : 0,
    findings,
    findingsDaily,
    vulnTop,
    statusRows,
    trend,
    tokens: { ...tokens, cacheRate, dailyAvg: days > 0 ? tokens.total / days : 0, peak },
    heat,
    codes,
    trafficTotal: data.trafficTotal,
    methods: [...methodCounts.entries()].sort((l, r) => r[1] - l[1]).slice(0, 4).map(([label, value]) => ({ label, value, tone: "var(--vx-chart-1)" })),
    hosts: [...hostCounts.entries()].sort((l, r) => r[1] - l[1]).slice(0, 4).map(([label, value]) => ({ label, value, tone: "var(--vx-chart-2)" })),
    errorRate,
    assets: { rows: assetRows, total: assetTotal },
    activity,
    sys: data.sys,
    capture: data.capture
  };
}
function kindLabel(row) {
  if (row.kind === "tool_use") return row.tool !== void 0 && row.tool !== "" ? row.tool : "tool_use";
  return row.kind ?? "activity";
}
function WorkerChip({ worker }) {
  const tone = worker === "planner" ? "violet" : worker === "mainagent" ? "blue" : "green";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `vx-ov-worker vx-ov-tone-${tone}`, children: worker === "" ? "agent" : worker });
}
function StatusPill({ status, meta }) {
  const resolved = meta ?? statusMetaOf(status);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "span",
    {
      className: "vx-ov-pill",
      title: status === "" ? void 0 : status,
      style: { color: resolved.tone, borderColor: `color-mix(in srgb, ${resolved.tone} 38%, transparent)`, background: `color-mix(in srgb, ${resolved.tone} 10%, transparent)` },
      children: resolved.label
    }
  );
}
function OverviewPanel() {
  const [rangeKey, setRangeKey] = (0, import_react2.useState)(() => {
    const raw = storeGet("vexnar.overview.range.page");
    return raw === "7" || raw === "30" || raw === "90" ? raw : "30";
  });
  const days = RANGES.find((item) => item.key === rangeKey)?.days ?? 30;
  const { data, error, reload } = useOverview(9e3);
  const view = (0, import_react2.useMemo)(() => derive(data, days), [data, days]);
  const loading = data.updated === 0;
  const tokenSpark = view.trend.map((point) => point.total);
  const tokenShare = view.tokens.total > 0 ? view.tokens.total : 1;
  const inputUncached = Math.max(view.tokens.input - view.tokens.cache, 0);
  const shares = [
    { label: "\u8F93\u5165\uFF08\u672A\u547D\u4E2D\uFF09", value: inputUncached, tone: "var(--vx-chart-1)" },
    { label: "\u7F13\u5B58\u547D\u4E2D", value: view.tokens.cache, tone: "var(--vx-chart-3)" },
    { label: "\u8F93\u51FA", value: view.tokens.output, tone: "var(--vx-chart-2)" }
  ];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-toolbar", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      Segmented,
      {
        value: rangeKey,
        options: RANGES.map((item) => ({ key: item.key, label: item.label })),
        onChange: (key) => {
          setRangeKey(key);
          storeSet("vexnar.overview.range.page", key);
        }
      }
    ) }),
    error !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-error", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        "\u6982\u89C8\u6570\u636E\u4E0D\u53EF\u7528\uFF1A",
        error
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: reload, children: "\u91CD\u8BD5" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-stats", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Stat,
        {
          tone: "blue",
          icon: "target",
          label: "\u4EFB\u52A1\u603B\u6570",
          value: fmtInt(view.taskTotal),
          unit: "\u4E2A",
          delta: deltaOf(view.created, view.createdPrev),
          spark: view.throughput,
          footer: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chips", children: [
            view.lifecycle.map((entry) => {
              const value = view.counts[entry.key] ?? 0;
              if (value === 0) return null;
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", style: { color: view.statusMeta[entry.key]?.tone }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: view.statusMeta[entry.key]?.tone } }),
                view.statusMeta[entry.key]?.label ?? entry.label,
                " ",
                fmtInt(value)
              ] }, entry.key);
            }),
            view.taskTotal === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-chip", children: "\u6682\u65E0\u4EFB\u52A1" }) : null
          ] })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Stat,
        {
          tone: "red",
          icon: "bug",
          label: "\u786E\u8BA4\u53D1\u73B0",
          value: fmtInt(view.sev.total),
          spark: view.findingsDaily,
          footer: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chips", children: [
            SEVERITY_META.map((meta) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", style: { color: meta.tone }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: meta.tone } }),
              meta.label,
              " ",
              fmtInt(view.sev[meta.key])
            ] }, meta.key)),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip vx-ov-chip--muted", children: [
              "\u9AD8\u5371\u5360\u6BD4 ",
              fmtPct(view.sevHighRate, 0)
            ] })
          ] })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Stat,
        {
          tone: "amber",
          icon: "zap",
          label: "Token \u6D88\u8017",
          value: fmtNum(view.tokens.total),
          delta: deltaOf(view.tokens.total, view.tokens.prev),
          spark: tokenSpark,
          footer: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chips", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", children: [
              "\u65E5\u5747 ",
              fmtNum(view.tokens.dailyAvg)
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", children: [
              "\u5CF0\u503C ",
              fmtNum(view.tokens.peak.value)
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", children: [
              "\u7F13\u5B58 ",
              fmtPct(view.tokens.cacheRate, 0)
            ] })
          ] })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Stat,
        {
          tone: "green",
          icon: "activity",
          label: "\u6293\u5305\u6D41\u91CF",
          value: fmtInt(view.trafficTotal),
          band: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CodeBar, { codes: view.codes, total: data.traffic.length }),
          footer: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chips", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-chip", children: view.capture ? `\u6293\u5305\u4E2D ${data.captureSessions} \u4E2A\u4F1A\u8BDD` : "\u672A\u53D1\u8D77\u6293\u5305" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", children: [
              "\u9519\u8BEF ",
              fmtPct(view.errorRate, 0)
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", children: [
              "\u8D44\u4EA7 ",
              fmtInt(view.assets.total)
            ] })
          ] })
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Section,
        {
          span: 8,
          icon: "zap",
          title: "Token \u6D88\u8017",
          caption: `\u8FD1 ${days} \u5929 \xB7 \u5BF9\u6BD4\u4E0A\u4E00\u5468\u671F`,
          action: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-legend", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: "var(--vx-chart-1)" } }),
              "\u672C\u671F"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: "var(--vx-chart-6)" } }),
              "\u4E0A\u671F"
            ] })
          ] }),
          children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-token", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-token-metrics", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-token-total", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5408\u8BA1\uFF08\u8F93\u5165 + \u8F93\u51FA\uFF09" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: fmtNum(view.tokens.total) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Delta, { value: deltaOf(view.tokens.total, view.tokens.prev), suffix: "\u73AF\u6BD4" })
              ] }),
              shares.map((share) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-meter", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-meter-top", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: share.label }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { style: { color: share.tone }, children: fmtNum(share.value) })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-meter-track", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: { width: `${Math.max(share.value / tokenShare * 100, 1.5)}%`, background: share.tone } }) })
              ] }, share.label)),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-mini-row", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                  "\u65E5\u5747 ",
                  fmtNum(view.tokens.dailyAvg)
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                  "\u5CF0\u503C ",
                  fmtNum(view.tokens.peak.value)
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                  "\u547D\u4E2D\u7387 ",
                  fmtPct(view.tokens.cacheRate, 0)
                ] })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-chart", children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-skeleton" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AreaChart, { points: view.trend, height: 218 }) })
          ] })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { span: 4, icon: "shield", title: "\u7F13\u5B58\u6548\u7387", caption: `\u8FD1 ${days} \u5929`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-efficiency", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ring, { value: view.tokens.cacheRate, label: "\u7F13\u5B58\u547D\u4E2D\u7387", caption: `${fmtNum(view.tokens.cache)} / ${fmtNum(view.tokens.input)}` }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-kv-list", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u8F93\u5165\u603B\u91CF" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtNum(view.tokens.input) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u7F13\u5B58\u547D\u4E2D" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtNum(view.tokens.cache) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u8F93\u51FA\u603B\u91CF" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtNum(view.tokens.output) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u8282\u7701\u6BD4\u4F8B" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtPct(view.tokens.input > 0 ? view.tokens.cache / view.tokens.input * 100 : 0, 1) })
          ] })
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { span: 4, icon: "bug", title: "\u6F0F\u6D1E\u4E25\u91CD\u5EA6", caption: `\u5171 ${fmtInt(view.sev.total)}`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-donut-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Donut,
          {
            segments: SEVERITY_META.map((meta) => ({ label: meta.label, value: view.sev[meta.key], tone: meta.tone })),
            center: fmtInt(view.sev.total),
            caption: "\u786E\u8BA4\u53D1\u73B0"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-legend-rows", children: SEVERITY_META.map((meta) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-legend-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: meta.tone } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: meta.label }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtInt(view.sev[meta.key]) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: view.sev.total > 0 ? fmtPct(view.sev[meta.key] / view.sev.total * 100, 0) : "\u2014" })
        ] }, meta.key)) })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { span: 4, icon: "clock", title: "\u5904\u7406\u72B6\u6001", caption: `\u6700\u8FD1 ${data.findings.length} \u6761`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HBars, { rows: view.statusRows }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { span: 4, icon: "layers", title: "Top \u6F0F\u6D1E\u7C7B", caption: `\u6700\u8FD1 ${data.findings.length} \u6761`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HBars, { rows: view.vulnTop }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { span: 6, icon: "target", title: "\u4EFB\u52A1\u5065\u5EB7\u5EA6", caption: `${fmtInt(view.taskTotal)} \u4E2A\u4EFB\u52A1 \xB7 \u8FD1 ${days} \u5929\u65B0\u5EFA ${fmtInt(view.created)}`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-health", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ring, { value: view.completionRate, label: "\u5B8C\u6210\u7387", caption: `${fmtInt(view.counts.done)} / ${fmtInt(view.taskTotal)}` }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ring, { value: view.goalRate, label: "\u76EE\u6807\u8FBE\u6210", caption: `${fmtInt(view.goalsMet)} / ${fmtInt(view.goalsTotal)} \u76EE\u6807` }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-health-side", children: [
          view.lifecycle.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-status-row", title: entry.hint, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-dot", style: { background: view.statusMeta[entry.key]?.tone } }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: view.statusMeta[entry.key]?.label ?? entry.label }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtInt(view.counts[entry.key] ?? 0) })
          ] }, entry.key)),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-status-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-dot", style: { background: "var(--vx-text-faint)" } }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5728\u9014\u610F\u56FE" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtInt(view.taskInFlight) })
          ] })
        ] })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { span: 6, icon: "flame", title: "\u6D3B\u8DC3\u70ED\u529B\u56FE", caption: "\u8FD1 90 \u5929 Token", children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-skeleton" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heatmap, { days: view.heat }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { span: 6, icon: "activity", title: "\u6D3B\u52A8\u6D41", caption: `${view.activity.length} \u6761\u4E8B\u4EF6`, children: view.activity.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { label: "\u6682\u65E0\u6D3B\u52A8\u8BB0\u5F55" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "vx-ov-feed", children: view.activity.slice(0, 7).map((row, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorkerChip, { worker: String(row.worker ?? "") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-feed-main", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: kindLabel(row) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: row.summary ?? "" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-feed-ts", children: fmtRel(row.ts) })
      ] }, String(row.seq ?? `activity-${index}`))) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { span: 6, icon: "bug", title: "\u6700\u65B0\u53D1\u73B0", caption: `\u5171 ${fmtInt(view.sev.total)} \u6761`, children: view.findings.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { label: "\u6682\u65E0\u53D1\u73B0" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "vx-ov-feed", children: view.findings.slice(0, 7).map((row, index) => {
        const sev = SEVERITY_META.find((meta) => meta.key === row.severity) ?? SEVERITY_META[3];
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-sev", style: { color: sev?.tone ?? "var(--vx-text-dim)" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: sev?.tone ?? "var(--vx-text-faint)" } }),
            sev?.label ?? row.severity ?? "\u2014"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-feed-main", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: row.vulnclass ?? "\u672A\u5206\u7C7B" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: row.summary ?? row.task_description ?? "" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-feed-ts", children: fmtRel(row.ts) })
        ] }, row.finding_id ?? row.id ?? `finding-${index}`);
      }) }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { span: 12, icon: "clock", title: "\u4EFB\u52A1", caption: `${fmtInt(view.taskTotal)} \u4E2A\u4EFB\u52A1 \xB7 \u6309\u6700\u8FD1\u6D3B\u52A8\u6392\u5E8F`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "vx-ov-table", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: ["\u4EFB\u52A1", "\u72B6\u6001", "\u5F15\u64CE", "\u76EE\u6807\u8FDB\u5EA6", "\u5728\u9014", "\u6700\u8FD1\u6D3B\u52A8"].map((title) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: title }, title)) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: view.recentTasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { colSpan: 6, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { label: "\u6682\u65E0\u4EFB\u52A1" }) }) }) : view.recentTasks.map((task, index) => {
        const total = Number(task.goals_total ?? 0);
        const met = Number(task.goals_met ?? 0);
        const pct = total > 0 ? met / total * 100 : null;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: "vx-ov-td-task", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: task.description ?? task.name ?? "\u672A\u547D\u540D\u4EFB\u52A1" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: task.id ?? "" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusPill, { status: String(task.status ?? ""), meta: view.statusMeta[String(task.status ?? "")] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-engine", children: task.engine_mode ?? "idle" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: pct === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-muted", children: "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-progress", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { style: { width: `${pct}%` } }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              met,
              "/",
              total
            ] })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: (task.in_flight ?? 0) > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: task.in_flight }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-muted", children: "\u2014" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vx-ov-muted", children: fmtRel(task.last_activity_unix ?? task.created_unix) })
        ] }, String(task.id ?? `task-${index}`));
      }) })
    ] }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { span: 4, icon: "network", title: "\u8D44\u4EA7\u6784\u6210", caption: `\u5171 ${fmtInt(view.assets.total)} \u8282\u70B9`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HBars, { rows: view.assets.rows }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { span: 4, icon: "activity", title: "\u6D41\u91CF\u5065\u5EB7\u5EA6", caption: `\u6837\u672C ${fmtInt(data.traffic.length)} / \u5171 ${fmtInt(view.trafficTotal)} \u6B21`, children: data.traffic.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { label: "\u6682\u65E0\u6D41\u91CF\u6570\u636E" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-traffic", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Donut,
          {
            segments: view.codes,
            size: 104,
            thickness: 11,
            center: fmtPct(100 - view.errorRate, 0),
            caption: "\u6210\u529F\u7387"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-legend-rows", children: [
          view.codes.map((code) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-legend-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: code.tone } }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: code.label }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtInt(code.value) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: data.traffic.length > 0 ? fmtPct(code.value / data.traffic.length * 100, 0) : "\u2014" })
          ] }, code.label)),
          view.methods.map((method) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-legend-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: method.tone ?? "var(--vx-chart-1)" } }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: method.label }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtInt(method.value) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: data.traffic.length > 0 ? fmtPct(method.value / data.traffic.length * 100, 0) : "\u2014" })
          ] }, `m-${method.label}`))
        ] })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, { span: 4, icon: "shield", title: "\u7CFB\u7EDF\u72B6\u6001", caption: view.capture ? "\u6709\u4F1A\u8BDD\u5728\u6293\u5305" : "\u65E0\u4F1A\u8BDD\u6293\u5305", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", { className: "vx-ov-sys", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u4F1A\u8BDD\u6293\u5305" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { "data-on": view.capture ? "1" : "0", children: view.capture ? `${data.captureSessions} \u4E2A\u4F1A\u8BDD` : "\u672A\u53D1\u8D77" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "MCP \u670D\u52A1" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { children: [
            data.sys.mcpOn,
            "/",
            data.sys.mcp
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5DE5\u5177" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { children: [
            data.sys.toolsOn,
            "/",
            data.sys.tools
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Agent" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { children: [
            data.sys.agentsOn,
            "/",
            data.sys.agents
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u8D44\u4EA7\u8282\u70B9" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtInt(view.assets.total) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Top \u4E3B\u673A" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { className: "vx-ov-ellipsis", children: view.hosts[0]?.label ?? "\u2014" })
        ] })
      ] }) })
    ] })
  ] });
}

// src/yak-history.tsx
var import_react5 = require("react");

// ../../node_modules/.pnpm/@tanstack+react-virtual@3.14.26_react-dom@19.3.1_react@19.3.1__react@19.3.1/node_modules/@tanstack/react-virtual/dist/esm/index.js
var React = __toESM(require("react"), 1);
var import_react_dom = require("react-dom");

// ../../node_modules/.pnpm/@tanstack+virtual-core@3.19.11/node_modules/@tanstack/virtual-core/dist/esm/lazy-measurements.js
function getMeasurementKey(item) {
  return typeof item === "object" ? item.key : item;
}
function createLazyMeasurementsView(cache, flat) {
  const count = cache.length;
  return new Proxy(cache, {
    get(target, prop, receiver) {
      if (typeof prop === "string") {
        const c = prop.charCodeAt(0);
        if (c >= 48 && c <= 57) {
          const i = +prop;
          if (Number.isInteger(i) && i >= 0 && i < count) {
            let v = target[i];
            if (typeof v !== "object") {
              const s = flat[i * 2];
              v = target[i] = {
                index: i,
                key: v,
                start: s,
                size: flat[i * 2 + 1],
                end: s + flat[i * 2 + 1],
                lane: 0
              };
            }
            return v;
          }
        }
        if (prop === "length") return count;
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

// ../../node_modules/.pnpm/@tanstack+virtual-core@3.19.11/node_modules/@tanstack/virtual-core/dist/esm/utils.js
function memo(getDeps, fn, opts) {
  let deps = opts.initialDeps ?? [];
  let result;
  let isInitial = true;
  function memoizedFunction() {
    var _a;
    const debugEnabled = !!opts.key && !!((_a = opts.debug) == null ? void 0 : _a.call(opts));
    let depTime = 0;
    if (debugEnabled) depTime = Date.now();
    const newDeps = getDeps();
    const depsChanged = newDeps.length !== deps.length || newDeps.some((dep, index) => deps[index] !== dep);
    if (!depsChanged) {
      return result;
    }
    deps = newDeps;
    let resultTime = 0;
    if (debugEnabled) resultTime = Date.now();
    result = fn(...newDeps);
    if (debugEnabled) {
      const depEndTime = Math.round((Date.now() - depTime) * 100) / 100;
      const resultEndTime = Math.round((Date.now() - resultTime) * 100) / 100;
      const resultFpsPercentage = resultEndTime / 16;
      const pad = (str2, num3) => {
        str2 = String(str2);
        while (str2.length < num3) {
          str2 = " " + str2;
        }
        return str2;
      };
      console.info(
        `%c\u23F1 ${pad(resultEndTime, 5)} /${pad(depEndTime, 5)} ms`,
        `
            font-size: .6rem;
            font-weight: bold;
            color: hsl(${Math.max(
          0,
          Math.min(120 - 120 * resultFpsPercentage, 120)
        )}deg 100% 31%);`,
        opts == null ? void 0 : opts.key
      );
    }
    if ((opts == null ? void 0 : opts.onChange) && !(isInitial && opts.skipInitialOnChange)) {
      opts.onChange(result);
    }
    isInitial = false;
    return result;
  }
  memoizedFunction.updateDeps = (newDeps) => {
    deps = newDeps;
  };
  return memoizedFunction;
}
function notUndefined(value, msg) {
  if (value === void 0) {
    throw new Error(`Unexpected undefined${msg ? `: ${msg}` : ""}`);
  } else {
    return value;
  }
}
var approxEqual = (a, b) => Math.abs(a - b) < 1.01;
var debounce = (targetWindow, fn, ms) => {
  let timeoutId;
  return Object.assign(
    function(...args) {
      targetWindow.clearTimeout(timeoutId);
      timeoutId = targetWindow.setTimeout(() => fn.apply(this, args), ms);
    },
    {
      // The handle is closure-local, so a caller that has already
      // unsubscribed has no way to stop a queued call. Teardown paths use
      // this to drop the pending invocation instead of letting it land.
      cancel: () => {
        targetWindow.clearTimeout(timeoutId);
      }
    }
  );
};

// ../../node_modules/.pnpm/@tanstack+virtual-core@3.19.11/node_modules/@tanstack/virtual-core/dist/esm/scroll-classifier.js
function classifyScrollEvent({
  offset,
  isScrolling,
  elementMax,
  holdOffset,
  scrollOffset,
  pendingWrite,
  clampedMaxAtWrite
}) {
  var _a;
  if (isScrolling && pendingWrite === null && offset === scrollOffset) {
    return "spurious";
  }
  if (pendingWrite !== null && Math.abs(offset - pendingWrite.target) < 1.5) {
    return "readBack";
  }
  if (pendingWrite !== null && !pendingWrite.smooth && elementMax !== null && pendingWrite.target > elementMax + holdOffset + 0.5 && Math.abs(offset - (elementMax + holdOffset)) < 1.5) {
    return "clampedReadBack";
  }
  if (pendingWrite !== null && !pendingWrite.smooth && ((_a = pendingWrite.lowMaxes) == null ? void 0 : _a.some((max) => Math.abs(offset - max) < 1.5))) {
    return "clampedReadBack";
  }
  if (clampedMaxAtWrite !== null && Math.abs(offset - clampedMaxAtWrite) < 1.5) {
    return "clampedEcho";
  }
  return "external";
}
var isAnimating = (phase) => phase === "smooth" || phase === "smoothFinishing";
function externalRetiresCommand({
  kind,
  offset,
  command,
  target
}) {
  return kind !== "spurious" && kind !== "readBack" && // Our own write, clamped (`clampedReadBack`, #1310): the command is not
  // retired by it, and reconcile retargets below the new max.
  kind !== "clampedReadBack" && (command == null ? void 0 : command.index) != null && // Nothing has been written for a command waiting for the tail; these
  // are the fling's events.
  command.phase !== "queued" && // A non-smooth write lands at once, so any other scroll event is the
  // user's, even before reconcile saw the target reached (the target may
  // keep moving, or iOS ignored the write under a finger). A write the
  // browser clamped because the sizer hasn't grown yet reads back at the
  // max, which is also where the fresh target clamps, so the check below
  // keeps it reconciling (#1294). While a smooth scroll's animation may
  // still report, its events look like a user's, so it yields only once it
  // has landed.
  !isAnimating(command.phase) && !approxEqual(offset, command.lastTargetOffset) && !approxEqual(offset, target()) && // A compensation write's clamped echo (#1258) keeps the command. The
  // order is deliberate, not tidiness: this clause stays after `target()`
  // (and `clampedReadBack` before it) because `target()` can rebuild the
  // measurements, so it must run for exactly the events it always did.
  kind !== "clampedEcho";
}
var FLING_WINDOW_MS = 40;
function flingSpedUp(samples) {
  const last = samples[samples.length - 1];
  if (last === void 0) return false;
  let j = samples.length - 2;
  while (j >= 0 && last.t - samples[j].t < FLING_WINDOW_MS) j--;
  if (j < 0) return false;
  const mid = samples[j];
  let k = j - 1;
  while (k >= 0 && mid.t - samples[k].t < FLING_WINDOW_MS) k--;
  if (k < 0) return false;
  const first = samples[k];
  const recent = (last.offset - mid.offset) / (last.t - mid.t);
  const before = (mid.offset - first.offset) / (mid.t - first.t);
  return recent * before >= 0 && Math.abs(recent) >= 2 * Math.abs(before) && Math.abs(recent) - Math.abs(before) >= 0.8;
}
function flingCaught(samples) {
  const last = samples[samples.length - 1];
  if (last === void 0) return false;
  let j = samples.length - 2;
  while (j >= 0 && last.t - samples[j].t < FLING_WINDOW_MS) j--;
  if (j < 0) return false;
  const from = samples[j];
  return Math.abs(last.offset - from.offset) / (last.t - from.t) >= 0.05;
}

// ../../node_modules/.pnpm/@tanstack+virtual-core@3.19.11/node_modules/@tanstack/virtual-core/dist/esm/ios-gesture.js
var _isIOSResult;
var isIOSWebKit = () => {
  if (_isIOSResult !== void 0) return _isIOSResult;
  if (typeof navigator === "undefined") return _isIOSResult = false;
  if (/iP(hone|od|ad)/.test(navigator.userAgent)) return _isIOSResult = true;
  const mtp = navigator.maxTouchPoints;
  return _isIOSResult = navigator.platform === "MacIntel" && mtp !== void 0 && mtp > 0;
};
var _iosMomentumOverridesWritesResult;
var iosMomentumOverridesWrites = () => {
  if (_iosMomentumOverridesWritesResult !== void 0) {
    return _iosMomentumOverridesWritesResult;
  }
  return _iosMomentumOverridesWritesResult = isIOSWebKit() && typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("overflow-anchor: auto");
};
var momentumOverridesWrites = () => !isIOSWebKit() || iosMomentumOverridesWrites();
var touchListenerOptions = {
  capture: true,
  passive: true
};
var IosGesture = class {
  constructor(host) {
    this.host = host;
    this._touch = null;
    this.inMotion = () => this._touch !== null && this._touch.phase !== "lateFling";
    this.dragging = () => {
      var _a;
      return ((_a = this._touch) == null ? void 0 : _a.phase) === "down" && this._touch.moved;
    };
    this.tail = () => {
      var _a;
      return ((_a = this._touch) == null ? void 0 : _a.phase) === "tail" ? this._touch.moved ? "fling" : "tap" : null;
    };
    this.onScroll = ({
      isScrolling,
      ownReadBack,
      moved,
      external
    }) => {
      var _a, _b, _c;
      if (isScrolling && ((_a = this._touch) == null ? void 0 : _a.phase) === "tail") {
        this._openTail(this._touch.moved || !ownReadBack, false);
      } else if (((_b = this._touch) == null ? void 0 : _b.phase) === "lateFling") {
        if (this.host.now() > this._touch.until) {
          this._touch = null;
        } else if (external && isScrolling && moved) {
          this._openTail(true, false);
        }
      }
      if (!ownReadBack && isScrolling && moved && ((_c = this._touch) == null ? void 0 : _c.phase) === "down") {
        this._touch.moved = true;
        return true;
      }
      return false;
    };
    this.touchStart = () => {
      this.end();
      this._touch = { phase: "down", moved: false };
    };
    this.touchEnd = () => {
      var _a;
      const moved = ((_a = this._touch) == null ? void 0 : _a.phase) === "down" && this._touch.moved;
      this.end();
      this._openTail(moved, moved);
    };
    this.end = () => {
      var _a;
      const win = this.host.getWindow();
      if (((_a = this._touch) == null ? void 0 : _a.phase) === "tail" && win != null) {
        win.clearTimeout(this._touch.timerId);
      }
      this._touch = null;
    };
    this.listen = (target) => {
      const onTouchStart = () => this.touchStart();
      const onTouchEnd = () => this.touchEnd();
      target.addEventListener("touchstart", onTouchStart, touchListenerOptions);
      target.addEventListener("touchend", onTouchEnd, touchListenerOptions);
      target.addEventListener("touchcancel", onTouchEnd, touchListenerOptions);
      return () => {
        target.removeEventListener(
          "touchstart",
          onTouchStart,
          touchListenerOptions
        );
        target.removeEventListener("touchend", onTouchEnd, touchListenerOptions);
        target.removeEventListener(
          "touchcancel",
          onTouchEnd,
          touchListenerOptions
        );
        this.end();
      };
    };
    this._openTail = (moved, awaitingFling) => {
      const win = this.host.getWindow();
      if (win == null) return;
      this.end();
      const tail = {
        phase: "tail",
        moved,
        awaitingFling,
        // Only fires while this tail is current: `end` clears it otherwise.
        timerId: win.setTimeout(() => {
          if (this.host.tailStillMoving()) {
            this._openTail(tail.moved, tail.awaitingFling);
            return;
          }
          this._touch = tail.awaitingFling ? { phase: "lateFling", until: this.host.now() + 1e3 } : null;
          this.host.onTailClosed();
        }, 150)
      };
      this._touch = tail;
    };
  }
  get touch() {
    return this._touch;
  }
};

// ../../node_modules/.pnpm/@tanstack+virtual-core@3.19.11/node_modules/@tanstack/virtual-core/dist/esm/index.js
var getRect = (element) => {
  const { clientWidth, clientHeight } = element;
  return { width: clientWidth, height: clientHeight };
};
var createFrameQueue = (targetWindow) => {
  const ids = /* @__PURE__ */ new Set();
  return {
    schedule: (fn) => {
      const id = targetWindow.requestAnimationFrame(() => {
        ids.delete(id);
        fn();
      });
      ids.add(id);
    },
    cancel: () => {
      ids.forEach((id) => targetWindow.cancelAnimationFrame(id));
      ids.clear();
    }
  };
};
var defaultKeyExtractor = (index) => index;
var defaultRangeExtractor = (range) => {
  const overscan = range.overscan * Math.max(range.lanes ?? 1, 1);
  const start = Math.max(range.startIndex - overscan, 0);
  const end = Math.min(range.endIndex + overscan, range.count - 1);
  const len = end - start + 1;
  const arr = new Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = start + i;
  }
  return arr;
};
var observeElementRect = (instance, cb) => {
  const element = instance.scrollElement;
  if (!element) {
    return;
  }
  const targetWindow = instance.targetWindow;
  if (!targetWindow) {
    return;
  }
  const handler = (rect) => {
    const { width, height } = rect;
    cb({ width: Math.round(width), height: Math.round(height) });
  };
  handler(getRect(element));
  if (!targetWindow.ResizeObserver) {
    return () => {
    };
  }
  const frames = createFrameQueue(targetWindow);
  const observer = new targetWindow.ResizeObserver(() => {
    const run = () => {
      handler(getRect(element));
    };
    instance.options.useAnimationFrameWithResizeObserver ? frames.schedule(run) : run();
  });
  observer.observe(element, { box: "content-box" });
  return () => {
    observer.unobserve(element);
    frames.cancel();
  };
};
var addEventListenerOptions = {
  passive: true
};
var supportsScrollend = typeof window == "undefined" ? true : "onscrollend" in window;
var observeOffset = (instance, cb, readOffset) => {
  const element = instance.scrollElement;
  if (!element) {
    return;
  }
  const targetWindow = instance.targetWindow;
  if (!targetWindow) {
    return;
  }
  const registerScrollendEvent = instance.options.useScrollendEvent && supportsScrollend;
  let offset = 0;
  const fallback = registerScrollendEvent ? null : debounce(
    targetWindow,
    () => cb(readOffset(element), false),
    instance.options.isScrollingResetDelay
  );
  const createHandler = (isScrolling) => () => {
    offset = readOffset(element);
    fallback == null ? void 0 : fallback();
    cb(offset, isScrolling);
  };
  const handler = createHandler(true);
  const endHandler = createHandler(false);
  element.addEventListener("scroll", handler, addEventListenerOptions);
  if (registerScrollendEvent) {
    element.addEventListener("scrollend", endHandler, addEventListenerOptions);
  }
  return () => {
    element.removeEventListener("scroll", handler);
    if (registerScrollendEvent) {
      element.removeEventListener("scrollend", endHandler);
    }
    fallback == null ? void 0 : fallback.cancel();
  };
};
var observeElementOffset = (instance, cb) => observeOffset(instance, cb, (el) => {
  const { horizontal, isRtl } = instance.options;
  return horizontal ? el.scrollLeft * (isRtl && -1 || 1) : el.scrollTop;
});
var measureElement = (element, entry, instance) => {
  if (instance.options.useCachedMeasurements) {
    const index = instance.indexFromElement(element);
    const key = instance.options.getItemKey(index);
    return instance.itemSizeCache.get(key) ?? instance.options.estimateSize(index);
  }
  if (entry == null ? void 0 : entry.borderBoxSize) {
    const box = entry.borderBoxSize[0];
    if (box) {
      const size = Math.round(
        box[instance.options.horizontal ? "inlineSize" : "blockSize"]
      );
      return size;
    }
  }
  if (!entry) {
    const index = instance.indexFromElement(element);
    const key = instance.options.getItemKey(index);
    const cachedSize = instance.itemSizeCache.get(key);
    if (cachedSize !== void 0) {
      return cachedSize;
    }
  }
  return element[instance.options.horizontal ? "offsetWidth" : "offsetHeight"];
};
var scrollWithAdjustments = (offset, {
  adjustments = 0,
  behavior
}, instance) => {
  var _a;
  const { scrollElement, options } = instance;
  const adjustedOffset = offset + adjustments;
  const isRtlElement = options.horizontal && options.isRtl && scrollElement !== null && "ownerDocument" in scrollElement;
  (_a = scrollElement == null ? void 0 : scrollElement.scrollTo) == null ? void 0 : _a.call(scrollElement, {
    [options.horizontal ? "left" : "top"]: isRtlElement ? -adjustedOffset : adjustedOffset,
    behavior
  });
};
var elementScroll = scrollWithAdjustments;
var initialScrollPhase = (behavior, atTarget) => behavior === "smooth" ? atTarget ? "smoothLanded" : "smooth" : "instant";
var isSmoothScroll = (state) => (state == null ? void 0 : state.phase) === "smooth" || (state == null ? void 0 : state.phase) === "smoothLanded";
function isAppendWithTrim(prevCount, nextCount, getPreviousKey, getNextKey) {
  if (nextCount === 0) return false;
  const firstKey = getNextKey(0);
  const removedKeys = /* @__PURE__ */ new Set();
  let removedCount = 0;
  while (removedCount < prevCount) {
    const key = getPreviousKey(removedCount);
    if (key === firstKey) break;
    removedKeys.add(key);
    removedCount++;
  }
  const retainedCount = prevCount - removedCount;
  if (retainedCount === 0 || retainedCount >= nextCount) return false;
  for (let i = 0; i < retainedCount; i++) {
    if (getNextKey(i) !== getPreviousKey(removedCount + i)) return false;
  }
  for (let i = retainedCount; i < nextCount; i++) {
    if (removedKeys.has(getNextKey(i))) return false;
  }
  return true;
}
var Virtualizer = class {
  constructor(opts) {
    this.unsubs = [];
    this.scrollElement = null;
    this.targetWindow = null;
    this.isScrolling = false;
    this.scrollState = null;
    this.measurementsCache = [];
    this._singleLaneMeasurements = null;
    this.itemSizeCache = /* @__PURE__ */ new Map();
    this.itemSizeCacheVersion = 0;
    this.laneAssignments = /* @__PURE__ */ new Map();
    this.pendingMin = null;
    this.prevLanes = void 0;
    this.lanesChangedFlag = false;
    this.lanesSettling = false;
    this.pendingScrollAnchor = null;
    this.scrollRect = null;
    this.scrollOffset = null;
    this.scrollDirection = null;
    this._holdOffset = 0;
    this._reportedOverscroll = false;
    this._iosGesture = new IosGesture({
      getWindow: () => this.targetWindow,
      now: () => this.now(),
      // The end of a fling can move less than a pixel per scroll event, so
      // events can stop for 150ms while the fling is still running (seen on
      // an iPhone, 27.0.1). A command waiting for it would then be written
      // into the fling and overridden. The element having moved since the
      // last event means it has not ended: wait again. Not while our own
      // write has yet to report: that moved it.
      tailStillMoving: () => {
        const state = this.scrollState;
        if ((state == null ? void 0 : state.phase) !== "queued" || this.pendingWrite !== null) {
          return false;
        }
        const now = this._readElementOffset();
        if (now === null || this._lastElementOffset === null || Math.abs(now - this._lastElementOffset) < 1) {
          return false;
        }
        this._lastElementOffset = now;
        state.samples = [...state.samples ?? [], { t: this.now(), offset: now }];
        return true;
      },
      onTailClosed: () => {
        const state = this.scrollState;
        if ((state == null ? void 0 : state.phase) === "queued" && flingCaught(state.samples ?? [])) {
          this.scrollState = null;
        }
        this._flushHoldIfReady(true);
        this._writeAwaitingCommand();
        this._retryClampedAdjustment();
      }
    });
    this._lastElementOffset = null;
    this.pendingWrite = null;
    this._clampedAdjustment = null;
    this.elementsCache = /* @__PURE__ */ new Map();
    this._resizeBatch = null;
    this.now = () => {
      var _a, _b, _c;
      return ((_c = (_b = (_a = this.targetWindow) == null ? void 0 : _a.performance) == null ? void 0 : _b.now) == null ? void 0 : _c.call(_b)) ?? Date.now();
    };
    this.observer = /* @__PURE__ */ (() => {
      let _ro = null;
      let _frames = null;
      let delivering = false;
      let observeQueued = false;
      const pendingObservations = /* @__PURE__ */ new Set();
      const get2 = () => {
        if (_ro) {
          return _ro;
        }
        const targetWindow = this.targetWindow;
        if (!targetWindow || !targetWindow.ResizeObserver) {
          return null;
        }
        const frames = _frames = createFrameQueue(targetWindow);
        return _ro = new targetWindow.ResizeObserver((entries2) => {
          const run = () => {
            const batch = { sync: false };
            this._resizeBatch = batch;
            try {
              entries2.forEach(measureEntry);
            } finally {
              this._resizeBatch = null;
              if (batch.notify) {
                this.notify(batch.sync);
                this._noteClampMax();
                this._flushHoldIfReady(true);
                this._retryClampedAdjustment();
                this.measureElement(null);
              }
            }
          };
          if (this.options.useAnimationFrameWithResizeObserver) {
            frames.schedule(run);
          } else {
            delivering = true;
            try {
              run();
            } finally {
              delivering = false;
            }
          }
        });
      };
      const measureEntry = (entry) => {
        const node = entry.target;
        const index = this.indexFromElement(node);
        if (!node.isConnected) {
          this.observer.unobserve(node);
          for (const [cacheKey, cachedNode] of this.elementsCache) {
            if (cachedNode === node) {
              this.elementsCache.delete(cacheKey);
              break;
            }
          }
          return;
        }
        if (!this.isIndexInRange(index)) return;
        if (this.shouldMeasureDuringScroll(index)) {
          this.resizeItem(index, this.options.measureElement(node, entry, this));
        }
      };
      return {
        disconnect: () => {
          var _a;
          (_a = get2()) == null ? void 0 : _a.disconnect();
          _frames == null ? void 0 : _frames.cancel();
          pendingObservations.clear();
          observeQueued = false;
          _ro = null;
          _frames = null;
        },
        observe: (target) => {
          const observer = get2();
          if (!observer) return;
          if (!delivering) {
            observer.observe(target, { box: "border-box" });
            return;
          }
          pendingObservations.add(target);
          if (!observeQueued) {
            observeQueued = true;
            _frames == null ? void 0 : _frames.schedule(() => {
              observeQueued = false;
              pendingObservations.forEach((node) => {
                if (node.isConnected) _ro == null ? void 0 : _ro.observe(node, { box: "border-box" });
              });
              pendingObservations.clear();
            });
          }
        },
        unobserve: (target) => {
          var _a;
          pendingObservations.delete(target);
          (_a = get2()) == null ? void 0 : _a.unobserve(target);
        }
      };
    })();
    this.range = null;
    this.setOptions = (opts2) => {
      var _a;
      const merged = {
        debug: false,
        initialOffset: 0,
        overscan: 1,
        paddingStart: 0,
        paddingEnd: 0,
        scrollPaddingStart: 0,
        scrollPaddingEnd: 0,
        horizontal: false,
        getItemKey: defaultKeyExtractor,
        rangeExtractor: defaultRangeExtractor,
        onChange: () => {
        },
        measureElement,
        initialRect: { width: 0, height: 0 },
        scrollMargin: 0,
        gap: 0,
        indexAttribute: "data-index",
        initialMeasurementsCache: [],
        lanes: 1,
        anchorTo: "start",
        followOnAppend: false,
        scrollEndThreshold: 1,
        isScrollingResetDelay: 150,
        enabled: true,
        isRtl: false,
        useScrollendEvent: false,
        useAnimationFrameWithResizeObserver: false,
        laneAssignmentMode: "estimate",
        useCachedMeasurements: false
      };
      for (const key in opts2) {
        const v = opts2[key];
        if (v !== void 0) merged[key] = v;
      }
      const prevOptions = this.options;
      let anchor = null;
      let followOnAppend = null;
      let edgeKeysChanged = false;
      if (prevOptions !== void 0 && prevOptions.enabled && merged.enabled && merged.anchorTo === "end" && this.scrollElement !== null) {
        const prevCount = prevOptions.count;
        const nextCount = merged.count;
        const measurements = this.getMeasurements();
        const previousItems = ((_a = this._singleLaneMeasurements) == null ? void 0 : _a.items) ?? measurements;
        const getPreviousKey = (index) => getMeasurementKey(previousItems[index]);
        const prevFirstKey = prevCount > 0 ? getPreviousKey(0) : null;
        const prevLastKey = prevCount > 0 ? getPreviousKey(prevCount - 1) : null;
        const didCountChange = nextCount !== prevCount;
        const didEdgeKeysChange = didCountChange || prevCount > 0 && nextCount > 0 && (merged.getItemKey(0) !== prevFirstKey || merged.getItemKey(nextCount - 1) !== prevLastKey);
        if (didEdgeKeysChange) {
          edgeKeysChanged = true;
          const item = prevCount > 0 ? this.getVirtualItemForOffset(this.getScrollOffset()) ?? measurements[0] : null;
          if (item) {
            anchor = [item.key, this.getScrollOffset() - item.start];
          }
          const behavior = merged.followOnAppend === true ? "auto" : merged.followOnAppend || null;
          if (behavior && nextCount > 0 && this.isAtEnd(prevOptions.scrollEndThreshold) && (prevCount === 0 || merged.getItemKey(nextCount - 1) !== prevLastKey)) {
            if (nextCount > prevCount || isAppendWithTrim(
              prevCount,
              nextCount,
              getPreviousKey,
              merged.getItemKey
            )) {
              followOnAppend = behavior;
            }
          }
        }
      }
      this.options = merged;
      if (edgeKeysChanged) {
        this.pendingMin = 0;
        this.itemSizeCacheVersion++;
      }
      let anchorDelta = null;
      if (anchor && this.scrollOffset !== null && !this._awaitingCommandReadBack()) {
        const [anchorKey, anchorOffset] = anchor;
        const newMeasurements = this.getMeasurements();
        const { count, getItemKey } = this.options;
        let idx = 0;
        while (idx < count && getItemKey(idx) !== anchorKey) {
          idx++;
        }
        if (idx < count) {
          const anchorItem = newMeasurements[idx];
          if (anchorItem) {
            const newOffset = Math.max(0, anchorItem.start + anchorOffset);
            if (!followOnAppend && newOffset !== this.scrollOffset) {
              anchorDelta = newOffset - this.scrollOffset;
              this.scrollOffset = newOffset;
            }
          }
        }
      }
      if (followOnAppend) {
        this.pendingScrollAnchor = { kind: "follow", behavior: followOnAppend };
      } else if (anchorDelta !== null) {
        if (this._canWriteScroll()) {
          this.pendingScrollAnchor = { kind: "anchor", delta: anchorDelta };
        } else {
          this._holdOffset += anchorDelta;
          this._followOffsetTarget(anchorDelta);
        }
      }
    };
    this.notify = (sync) => {
      var _a, _b;
      (_b = (_a = this.options).onChange) == null ? void 0 : _b.call(_a, this, sync);
    };
    this.maybeNotify = memo(
      () => {
        this.calculateRange();
        return [
          this.isScrolling,
          this.range ? this.range.startIndex : null,
          this.range ? this.range.endIndex : null
        ];
      },
      (isScrolling) => {
        this.notify(isScrolling);
      },
      {
        key: "maybeNotify",
        debug: () => this.options.debug,
        initialDeps: [
          this.isScrolling,
          this.range ? this.range.startIndex : null,
          this.range ? this.range.endIndex : null
        ]
      }
    );
    this.cleanup = () => {
      var _a;
      this.unsubs.filter(Boolean).forEach((d) => d());
      this.unsubs = [];
      this.observer.disconnect();
      if (this.rafId != null && this.targetWindow) {
        this.targetWindow.cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.scrollState = null;
      (_a = this._momentumStop) == null ? void 0 : _a.restore();
      this._momentumStop = null;
      this.isScrolling = false;
      this.scrollDirection = null;
      this._holdOffset = 0;
      this._reportedOverscroll = false;
      this._clampedAdjustment = null;
      this.pendingWrite = null;
      this.scrollElement = null;
      this.targetWindow = null;
    };
    this._didMount = () => {
      return () => {
        this.cleanup();
      };
    };
    this._willUpdate = () => {
      var _a;
      const scrollElement = this.options.enabled ? this.options.getScrollElement() : null;
      if (this.scrollElement !== scrollElement) {
        this.cleanup();
        if (!scrollElement) {
          this.maybeNotify();
          return;
        }
        this.scrollElement = scrollElement;
        if (this.scrollElement && "ownerDocument" in this.scrollElement) {
          this.targetWindow = this.scrollElement.ownerDocument.defaultView;
        } else {
          this.targetWindow = ((_a = this.scrollElement) == null ? void 0 : _a.window) ?? null;
        }
        this.elementsCache.forEach((cached) => {
          this.observer.observe(cached);
        });
        this.unsubs.push(
          this.options.observeElementRect(this, (rect) => {
            this.scrollRect = rect;
            this.maybeNotify();
          })
        );
        this.unsubs.push(
          this.options.observeElementOffset(this, (offset, isScrolling) => {
            var _a2, _b, _c, _d;
            const elementMax = isScrolling ? this._elementMaxScrollOffset() : null;
            const wasOverscrolled = this._reportedOverscroll;
            this._reportedOverscroll = offset < 0 || elementMax !== null && offset > elementMax + 1;
            const elementOffset = offset;
            this._lastElementOffset = elementOffset;
            offset = this._toLayoutOffset(offset);
            const kind = this._classifyScrollEvent(
              offset,
              isScrolling,
              elementMax
            );
            if (kind === "spurious") return;
            if (kind === "readBack") {
              offset = this.pendingWrite.target;
            } else if (kind === "clampedReadBack" && ((_a2 = this.scrollState) == null ? void 0 : _a2.index) != null && // Not `elementMax`: an adapter can report the read-back at rest.
            offset < this.getMaxScrollOffset() - 1.5) {
              this.scrollState.lastTargetOffset = offset;
            } else if (externalRetiresCommand({
              kind,
              offset,
              command: this.scrollState,
              target: () => this.getScrollStateTarget(this.scrollState)
            })) {
              this.scrollState = null;
            }
            this.pendingWrite = null;
            if (this._clampedAdjustment !== null && Math.abs(offset - this._clampedAdjustment.maxAtWrite) >= 1.5) {
              this._clampedAdjustment = null;
            }
            const prevOffset = this.getScrollOffset();
            const prevDirection = this.scrollDirection;
            this.scrollDirection = isScrolling ? prevOffset === offset ? this.scrollDirection : prevOffset < offset ? "forward" : "backward" : null;
            this.scrollOffset = offset;
            this.isScrolling = isScrolling;
            const queued = this.scrollState;
            if ((queued == null ? void 0 : queued.phase) === "queued" && kind === "external" && isScrolling) {
              if (wasOverscrolled || this._reportedOverscroll) {
                queued.samples = [];
              } else {
                const t = this.now();
                queued.samples = [
                  ...(queued.samples ?? []).filter(
                    (sample) => t - sample.t <= 200
                  ),
                  { t, offset: elementOffset }
                ];
                if (prevDirection !== null && this.scrollDirection !== prevDirection || flingSpedUp(queued.samples)) {
                  this.scrollState = null;
                }
              }
            }
            if (this._iosGesture.onScroll({
              isScrolling,
              ownReadBack: kind === "readBack",
              moved: offset !== prevOffset,
              // Neither our write's read-back nor a frame of our smooth
              // animation: the user or a fling moved it.
              external: kind === "external" && ((_b = this.scrollState) == null ? void 0 : _b.phase) !== "smooth" && ((_c = this.scrollState) == null ? void 0 : _c.phase) !== "smoothFinishing"
            }) && // The user scrolls: a command still waiting for the tail is
            // theirs to override, like a written one would be.
            ((_d = this.scrollState) == null ? void 0 : _d.phase) === "queued") {
              this.scrollState = null;
            }
            this._flushHoldIfReady(true);
            if (this.scrollState) {
              this.scheduleScrollReconcile();
            }
            this.maybeNotify();
          })
        );
        if ("addEventListener" in this.scrollElement) {
          this.unsubs.push(
            this._iosGesture.listen(this.scrollElement)
          );
        }
        this._scrollToOffset(this.getScrollOffset());
      }
      this._noteClampMax();
      const anchor = this.pendingScrollAnchor;
      this.pendingScrollAnchor = null;
      if (anchor && this.scrollElement && this.options.enabled) {
        if (anchor.kind === "anchor") {
          if (!this._canWriteScroll()) {
            this._holdOffset += anchor.delta;
            this._followOffsetTarget(anchor.delta);
            this.notify(false);
          } else if (isSmoothScroll(this.scrollState) && !approxEqual(
            this.getScrollOffset() - anchor.delta,
            this.scrollState.lastTargetOffset
          )) ;
          else {
            this._followOffsetTarget(anchor.delta);
            this._scrollToOffset(this.getScrollOffset());
          }
        } else {
          this.scrollToEnd({ behavior: anchor.behavior });
        }
      }
      this._flushHoldIfReady(false);
      this._retryClampedAdjustment();
    };
    this._classifyScrollEvent = (offset, isScrolling, elementMax) => {
      var _a;
      return classifyScrollEvent({
        offset,
        isScrolling,
        elementMax,
        holdOffset: this._holdOffset,
        scrollOffset: this.scrollOffset,
        pendingWrite: this.pendingWrite,
        clampedMaxAtWrite: ((_a = this._clampedAdjustment) == null ? void 0 : _a.maxAtWrite) ?? null
      });
    };
    this._retryClampedAdjustment = () => {
      if (this._clampedAdjustment === null || !this.scrollElement || !this.options.enabled || !this._canWriteScroll()) {
        return;
      }
      const { target, maxAtWrite } = this._clampedAdjustment;
      const max = this.getMaxScrollOffset();
      if (max > maxAtWrite + 0.5) {
        this._clampedAdjustment = target > max + 0.5 ? { target, maxAtWrite: max } : null;
        this._scrollToOffset(target);
      }
    };
    this._writeAwaitingCommand = () => {
      const state = this.scrollState;
      if (state === null || state.phase !== "queued") return;
      const { behavior } = state;
      this.getMeasurements();
      const offset = this.getScrollStateTarget(state);
      state.lastTargetOffset = offset;
      this._clampedAdjustment = null;
      state.phase = initialScrollPhase(
        behavior,
        state.index != null && approxEqual(offset, this.getScrollOffset())
      );
      this._scrollToOffset(offset, { behavior });
      this.scheduleScrollReconcile();
    };
    this._readElementOffset = () => {
      const el = this.scrollElement;
      if (el == null) return null;
      const { horizontal, isRtl } = this.options;
      if (typeof el.scrollTop === "number") {
        return horizontal ? el.scrollLeft * (isRtl && -1 || 1) : el.scrollTop;
      }
      if (typeof el.scrollY === "number") {
        return horizontal ? el.scrollX : el.scrollY;
      }
      return null;
    };
    this._canWriteScroll = () => !(isIOSWebKit() && this._iosGesture.inMotion()) && !this._reportedOverscroll;
    this._flushHoldIfReady = (sync) => {
      var _a;
      if (this._holdOffset === 0) return;
      if (!this.scrollElement || !this.options.enabled) return;
      if (!this._canWriteScroll()) return;
      if (((_a = this.scrollState) == null ? void 0 : _a.phase) === "smooth") return;
      this._holdOffset = 0;
      if (this.scrollOffset !== null && this.scrollOffset < 0) {
        this.scrollOffset = 0;
      }
      this.notify(sync);
      const target = this.getCommandWrittenOffset() ?? this.getScrollOffset();
      this._clampedAdjustment = this._clampedBy(target);
      this._scrollToOffset(target);
    };
    this.rafId = null;
    this.getSize = () => {
      if (!this.options.enabled) {
        this.scrollRect = null;
        return 0;
      }
      this.scrollRect = this.scrollRect ?? this.options.initialRect;
      return this.scrollRect[this.options.horizontal ? "width" : "height"];
    };
    this.getScrollOffset = () => {
      if (!this.options.enabled) {
        this.scrollOffset = null;
        return 0;
      }
      this.scrollOffset = this.scrollOffset ?? (typeof this.options.initialOffset === "function" ? this.options.initialOffset() : this.options.initialOffset);
      return this.scrollOffset;
    };
    this.getMeasurementOptions = memo(
      () => [
        this.options.count,
        this.options.paddingStart,
        this.options.scrollMargin,
        this.options.getItemKey,
        this.options.enabled,
        this.options.lanes,
        this.options.laneAssignmentMode,
        this.options.gap
      ],
      (count, paddingStart, scrollMargin, getItemKey, enabled2, lanes, laneAssignmentMode, gap) => {
        const lanesChanged = this.prevLanes !== void 0 && this.prevLanes !== lanes;
        if (lanesChanged) {
          this.lanesChangedFlag = true;
        }
        this.prevLanes = lanes;
        this.pendingMin = null;
        return {
          count,
          paddingStart,
          scrollMargin,
          getItemKey,
          enabled: enabled2,
          lanes,
          laneAssignmentMode,
          gap
        };
      },
      {
        key: false
      }
    );
    this.isIndexInRange = (index) => index >= 0 && index < this.options.count;
    this.getMeasurements = memo(
      () => [this.getMeasurementOptions(), this.itemSizeCacheVersion],
      ({
        count,
        paddingStart,
        scrollMargin,
        getItemKey,
        enabled: enabled2,
        lanes,
        laneAssignmentMode,
        gap
      }, _itemSizeCacheVersion) => {
        var _a;
        const itemSizeCache = this.itemSizeCache;
        if (!enabled2) {
          this.measurementsCache = [];
          this._singleLaneMeasurements = null;
          this.itemSizeCache.clear();
          this.laneAssignments.clear();
          return [];
        }
        if (this.laneAssignments.size > count) {
          for (const index of this.laneAssignments.keys()) {
            if (index >= count) {
              this.laneAssignments.delete(index);
            }
          }
        }
        if (this.lanesChangedFlag) {
          this.lanesChangedFlag = false;
          this.lanesSettling = true;
          this.measurementsCache = [];
          this._singleLaneMeasurements = null;
          this.itemSizeCache.clear();
          this.laneAssignments.clear();
          this.pendingMin = null;
        }
        if (this.measurementsCache.length === 0 && !this.lanesSettling) {
          this.measurementsCache = this.options.initialMeasurementsCache;
          this.measurementsCache.forEach((item) => {
            this.itemSizeCache.set(item.key, item.size);
          });
        }
        const min = this.lanesSettling ? 0 : this.pendingMin ?? 0;
        this.pendingMin = null;
        if (this.lanesSettling && this.measurementsCache.length === count) {
          this.lanesSettling = false;
        }
        if (lanes === 1) {
          const need = count * 2;
          let flat = (_a = this._singleLaneMeasurements) == null ? void 0 : _a.flat;
          if (!flat || flat.length < need) {
            const next = new Float64Array(need);
            if (flat && min > 0) next.set(flat.subarray(0, min * 2));
            flat = next;
          }
          const items = min === 0 ? new Array(count) : this._singleLaneMeasurements.items.slice();
          let runningStart;
          if (min === 0) {
            runningStart = paddingStart + scrollMargin;
          } else {
            const prevIdx = min - 1;
            runningStart = flat[prevIdx * 2] + flat[prevIdx * 2 + 1] + gap;
          }
          for (let i = min; i < count; i++) {
            const key = getItemKey(i);
            items[i] = key;
            const measuredSize = itemSizeCache.get(key);
            const size = typeof measuredSize === "number" ? measuredSize : this.options.estimateSize(i);
            flat[i * 2] = runningStart;
            flat[i * 2 + 1] = size;
            runningStart += size + gap;
          }
          this._singleLaneMeasurements = { flat, items };
          const view = createLazyMeasurementsView(items, flat);
          this.measurementsCache = view;
          return view;
        }
        const measurements = this.measurementsCache.slice(0, min);
        const laneLastIndex = new Array(lanes).fill(
          void 0
        );
        const laneEnds = new Float64Array(lanes);
        let filledLanes = 0;
        for (let m = 0; m < min; m++) {
          const item = measurements[m];
          if (item) {
            if (laneLastIndex[item.lane] === void 0) filledLanes++;
            laneLastIndex[item.lane] = m;
            laneEnds[item.lane] = item.end;
          }
        }
        for (let i = min; i < count; i++) {
          const key = getItemKey(i);
          const cachedLane = this.laneAssignments.get(i);
          let lane;
          let start;
          const shouldCacheLane = laneAssignmentMode === "estimate" || itemSizeCache.has(key);
          if (cachedLane !== void 0 && this.options.lanes > 1) {
            lane = cachedLane;
            const prevIndex = laneLastIndex[lane];
            const prevInLane = prevIndex !== void 0 ? measurements[prevIndex] : void 0;
            start = prevInLane ? prevInLane.end + gap : paddingStart + scrollMargin;
          } else if (filledLanes === lanes) {
            let bestLane = 0;
            let bestEnd = laneEnds[0];
            let bestIdx = laneLastIndex[0];
            for (let l = 1; l < lanes; l++) {
              const e = laneEnds[l];
              if (e < bestEnd || e === bestEnd && laneLastIndex[l] < bestIdx) {
                bestLane = l;
                bestEnd = e;
                bestIdx = laneLastIndex[l];
              }
            }
            lane = bestLane;
            start = bestEnd + gap;
            if (shouldCacheLane) {
              this.laneAssignments.set(i, lane);
            }
          } else {
            lane = i % this.options.lanes;
            start = paddingStart + scrollMargin;
            if (shouldCacheLane) {
              this.laneAssignments.set(i, lane);
            }
          }
          const measuredSize = itemSizeCache.get(key);
          const size = typeof measuredSize === "number" ? measuredSize : this.options.estimateSize(i);
          const end = start + size;
          measurements[i] = {
            index: i,
            start,
            size,
            end,
            key,
            lane
          };
          if (laneLastIndex[lane] === void 0) filledLanes++;
          laneLastIndex[lane] = i;
          laneEnds[lane] = end;
        }
        this.measurementsCache = measurements;
        return measurements;
      },
      {
        key: "getMeasurements",
        debug: () => this.options.debug
      }
    );
    this.calculateRange = memo(
      () => [
        this.getMeasurements(),
        this.getSize(),
        this.getScrollOffset(),
        this.options.lanes,
        // scrollOffset is measured in the scroll element and the layout total
        // from the list start, so the list ends scrollMargin further down.
        this._getLayoutTotalSize() + this.options.scrollMargin
      ],
      (measurements, outerSize, scrollOffset, lanes, listEnd) => {
        if (measurements.length === 0 || outerSize === 0) {
          this.range = null;
          return null;
        }
        const maxScrollOffset = Math.max(listEnd - outerSize, 0);
        this.range = calculateRangeImpl(
          measurements,
          outerSize,
          Math.min(scrollOffset, maxScrollOffset),
          lanes,
          // Pass the typed array so binary search + forward-walk can read
          // start/end directly from Float64Array, skipping the Proxy traps.
          lanes === 1 && this._singleLaneMeasurements !== null ? this._singleLaneMeasurements.flat : null
        );
        return this.range;
      },
      {
        key: "calculateRange",
        debug: () => this.options.debug
      }
    );
    this.getVirtualIndexes = memo(
      () => {
        let startIndex = null;
        let endIndex = null;
        const range = this.calculateRange();
        if (range) {
          startIndex = range.startIndex;
          endIndex = range.endIndex;
        }
        this.maybeNotify.updateDeps([this.isScrolling, startIndex, endIndex]);
        return [
          this.options.rangeExtractor,
          this.options.overscan,
          this.options.count,
          startIndex,
          endIndex,
          this.options.lanes
        ];
      },
      (rangeExtractor, overscan, count, startIndex, endIndex, lanes) => {
        return startIndex === null || endIndex === null ? [] : rangeExtractor({
          startIndex,
          endIndex,
          overscan,
          count,
          lanes
        });
      },
      {
        key: "getVirtualIndexes",
        debug: () => this.options.debug
      }
    );
    this.indexFromElement = (node) => {
      const attributeName = this.options.indexAttribute;
      const indexStr = node.getAttribute(attributeName);
      if (!indexStr) {
        console.warn(
          `Missing attribute name '${attributeName}={index}' on measured element.`
        );
        return -1;
      }
      return parseInt(indexStr, 10);
    };
    this.shouldMeasureDuringScroll = (index) => {
      var _a;
      if (!isSmoothScroll(this.scrollState)) {
        return true;
      }
      const scrollIndex = this.scrollState.index ?? ((_a = this.getVirtualItemForOffset(this.scrollState.lastTargetOffset)) == null ? void 0 : _a.index);
      if (scrollIndex !== void 0 && this.range) {
        const bufferSize = Math.max(
          this.options.overscan,
          Math.ceil((this.range.endIndex - this.range.startIndex) / 2)
        );
        const minIndex = Math.max(0, scrollIndex - bufferSize);
        const maxIndex = Math.min(
          this.options.count - 1,
          scrollIndex + bufferSize
        );
        return index >= minIndex && index <= maxIndex;
      }
      return true;
    };
    this.measureElement = (node) => {
      if (!node) {
        this.elementsCache.forEach((cached, key2) => {
          if (!cached.isConnected) {
            this.observer.unobserve(cached);
            this.elementsCache.delete(key2);
          }
        });
        return;
      }
      const index = this.indexFromElement(node);
      if (!this.isIndexInRange(index)) return;
      const key = this.options.getItemKey(index);
      const prevNode = this.elementsCache.get(key);
      if (prevNode !== node) {
        if (prevNode) {
          this.observer.unobserve(prevNode);
        }
        this.observer.observe(node);
        this.elementsCache.set(key, node);
      }
      if (node.isConnected && (!this.isScrolling || this.scrollState) && this.shouldMeasureDuringScroll(index)) {
        this.resizeItem(index, this.options.measureElement(node, void 0, this));
      }
    };
    this.resizeItem = (index, size) => {
      var _a, _b, _c;
      if (!this.isIndexInRange(index)) return;
      if ((_a = this._resizeBatch) == null ? void 0 : _a.sync) this.getMeasurements();
      let cachedSize;
      let itemStart;
      let key;
      const flat = (_b = this._singleLaneMeasurements) == null ? void 0 : _b.flat;
      if (this.options.lanes === 1 && flat != null) {
        key = this.options.getItemKey(index);
        itemStart = flat[index * 2];
        cachedSize = flat[index * 2 + 1];
      } else {
        const item = this.measurementsCache[index];
        if (!item) return;
        key = item.key;
        itemStart = item.start;
        cachedSize = item.size;
      }
      const itemSize = this.itemSizeCache.get(key) ?? cachedSize;
      const delta = size - itemSize;
      if (delta !== 0) {
        const wasAtEnd = this.options.anchorTo === "end" && !isSmoothScroll(this.scrollState) && this.getVirtualDistanceFromEnd() <= this.options.scrollEndThreshold;
        const prevTotalSize = wasAtEnd ? this._getLayoutTotalSize() : 0;
        const scrollOffset = this.getScrollOffset();
        const isFirstMeasure = !this.itemSizeCache.has(key);
        const defaultShouldAdjust = isFirstMeasure ? (
          // First measurement: compensate any item whose top sits above the
          // fold — the estimate→actual delta must be corrected regardless of
          // scroll direction, since the whole estimated block was above it.
          itemStart < scrollOffset
        ) : (
          // Re-measurement: only compensate an item that is ENTIRELY above the
          // fold. An item that merely *spans* the fold (top above, bottom
          // below — e.g. a streaming chat message growing at its bottom)
          // changes size *below* the anchor point, so shifting scrollTop by the
          // delta would drag the viewport downward on every growth (#1218).
          // Also skip during backward scroll to avoid the "items jump while
          // scrolling up" cascade.
          itemStart + itemSize <= scrollOffset && this.scrollDirection !== "backward"
        );
        const shouldAdjustScroll = !isSmoothScroll(this.scrollState) && (this.shouldAdjustScrollPositionOnItemSizeChange !== void 0 ? this.shouldAdjustScrollPositionOnItemSizeChange(
          // The callback expects a VirtualItem; build one lazily only
          // when the consumer actually supplied a custom predicate.
          this.measurementsCache[index] ?? {
            index,
            key,
            start: itemStart,
            size: cachedSize,
            end: itemStart + cachedSize,
            lane: 0
          },
          delta,
          this
        ) : defaultShouldAdjust);
        if (this.pendingMin === null || index < this.pendingMin) {
          this.pendingMin = index;
        }
        this.itemSizeCache.set(key, size);
        this.itemSizeCacheVersion++;
        let adjustedSync = false;
        if (!this._awaitingCommandReadBack()) {
          if (wasAtEnd) {
            adjustedSync = this.applyScrollAdjustment(
              this._getLayoutTotalSize() - prevTotalSize
            );
          } else if (shouldAdjustScroll) {
            adjustedSync = this.applyScrollAdjustment(delta);
          }
        }
        if (this._resizeBatch) {
          this._resizeBatch.notify = true;
          (_c = this._resizeBatch).sync || (_c.sync = adjustedSync);
          return;
        }
        this.notify(adjustedSync);
        this._noteClampMax();
        this._flushHoldIfReady(true);
        this._retryClampedAdjustment();
      }
    };
    this.getVirtualItems = memo(
      () => [this.getVirtualIndexes(), this.getMeasurements(), this._holdOffset],
      (indexes, measurements, hold) => {
        const virtualItems = [];
        for (let k = 0, len = indexes.length; k < len; k++) {
          const i = indexes[k];
          const measurement = measurements[i];
          virtualItems.push(
            hold === 0 ? measurement : {
              ...measurement,
              start: measurement.start - hold,
              end: measurement.end - hold
            }
          );
        }
        return virtualItems;
      },
      {
        key: "getVirtualItems",
        debug: () => this.options.debug
      }
    );
    this.getVirtualItemForOffset = (offset) => {
      var _a;
      const measurements = this.getMeasurements();
      if (measurements.length === 0) {
        return void 0;
      }
      const flat = (_a = this._singleLaneMeasurements) == null ? void 0 : _a.flat;
      const useFlat = this.options.lanes === 1 && flat != null;
      const idx = findNearestBinarySearch(
        0,
        measurements.length - 1,
        useFlat ? (i) => flat[i * 2] : (i) => notUndefined(measurements[i]).start,
        offset
      );
      return notUndefined(measurements[idx]);
    };
    this._noteClampMax = () => {
      if (!this._awaitingCommandReadBack()) return;
      const elementMax = this._elementMaxScrollOffset();
      if (elementMax === null) return;
      const write = this.pendingWrite;
      const max = Math.max(elementMax, 0) + this._holdOffset;
      if (max >= write.target) return;
      const lowMaxes = write.lowMaxes ?? (write.lowMaxes = []);
      if (lowMaxes[lowMaxes.length - 1] !== max) lowMaxes.push(max);
    };
    this.getMaxScrollOffset = () => (this._elementMaxScrollOffset() ?? 0) + this._holdOffset;
    this._toLayoutOffset = (elementOffset) => {
      var _a;
      let offset = elementOffset + this._holdOffset;
      if (((_a = this.pendingScrollAnchor) == null ? void 0 : _a.kind) === "anchor") {
        offset += this.pendingScrollAnchor.delta;
      }
      return offset;
    };
    this._elementMaxScrollOffset = () => {
      const el = this.scrollElement;
      if (el === null) return null;
      if ("scrollHeight" in el) {
        return this.options.horizontal ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
      }
      if ("document" in el) {
        const doc = el.document.documentElement;
        return this.options.horizontal ? doc.scrollWidth - el.innerWidth : doc.scrollHeight - el.innerHeight;
      }
      return null;
    };
    this._momentumStop = null;
    this._stopMomentum = (done) => {
      const el = this.scrollElement;
      const win = this.targetWindow;
      if (el === null || win === null) return;
      const scroller = "document" in el ? el.document.scrollingElement : el;
      if (!(scroller == null ? void 0 : scroller.style)) return;
      if (this._momentumStop) {
        this._momentumStop.done = done;
        return;
      }
      const { style } = scroller;
      const property = this.options.horizontal ? "overflow-x" : "overflow-y";
      const value = style.getPropertyValue(property);
      const priority = style.getPropertyPriority(property);
      const crossSize = () => this.options.horizontal ? scroller.clientHeight : scroller.clientWidth;
      const crossSizeBefore = crossSize();
      style.setProperty(property, "hidden", "important");
      if (crossSize() !== crossSizeBefore) {
        style.setProperty(property, value, priority);
        return;
      }
      const stop = {
        // False when the app replaced the hidden value: the fling may not
        // have stopped.
        restore: () => {
          if (style.getPropertyValue(property) !== "hidden" || style.getPropertyPriority(property) !== "important") {
            return false;
          }
          style.setProperty(property, value, priority);
          return true;
        },
        done
      };
      this._momentumStop = stop;
      win.requestAnimationFrame(
        () => win.requestAnimationFrame(() => {
          if (this._momentumStop !== stop) return;
          this._momentumStop = null;
          if (stop.restore()) stop.done();
        })
      );
    };
    this._clampedBy = (target) => {
      const elementMax = this._elementMaxScrollOffset();
      if (elementMax === null) return null;
      const maxAtWrite = elementMax + this._holdOffset;
      return target > maxAtWrite + 0.5 ? { target, maxAtWrite } : null;
    };
    this.getVirtualDistanceFromEnd = () => {
      return Math.max(
        this._getLayoutTotalSize() + this.options.scrollMargin - this.getSize() - this.getScrollOffset(),
        0
      );
    };
    this.getDistanceFromEnd = () => {
      return Math.max(this.getMaxScrollOffset() - this.getScrollOffset(), 0);
    };
    this.isAtEnd = (threshold = this.options.scrollEndThreshold) => {
      return this.getDistanceFromEnd() <= threshold;
    };
    this.getOffsetForAlignment = (toOffset, align, itemSize = 0) => {
      if (!this.scrollElement) return 0;
      const size = this.getSize();
      const scrollOffset = this.getScrollOffset();
      if (align === "auto") {
        align = toOffset >= scrollOffset + size ? "end" : "start";
      }
      if (align === "center") {
        toOffset += (itemSize - size) / 2;
      } else if (align === "end") {
        toOffset -= size;
      }
      const maxOffset = this.getMaxScrollOffset();
      return Math.max(Math.min(maxOffset, toOffset), 0);
    };
    this.getOffsetForIndex = (index, align = "auto") => {
      index = Math.max(0, Math.min(index, this.options.count - 1));
      const size = this.getSize();
      const scrollOffset = this.getScrollOffset();
      const item = this.getMeasurements()[index];
      if (!item) return;
      if (align === "auto") {
        if (item.end >= scrollOffset + size - this.options.scrollPaddingEnd) {
          align = "end";
        } else if (item.start <= scrollOffset + this.options.scrollPaddingStart) {
          align = "start";
        } else {
          return [scrollOffset, align];
        }
      }
      if (align === "end" && index === this.options.count - 1) {
        const maxOffset = this.getMaxScrollOffset();
        const toOffset2 = maxOffset - this.options.paddingEnd + this.options.scrollPaddingEnd;
        return [Math.max(Math.min(toOffset2, maxOffset), 0), align];
      }
      const toOffset = align === "end" ? item.end + this.options.scrollPaddingEnd : item.start - this.options.scrollPaddingStart;
      return [
        this.getOffsetForAlignment(toOffset, align, item.size),
        align
      ];
    };
    this.scrollToOffset = (toOffset, { align = "start", behavior = "auto" } = {}) => {
      this._startScroll(
        { index: null, align },
        this.getOffsetForAlignment(toOffset, align),
        behavior,
        "absolute"
      );
    };
    this.scrollToIndex = (index, {
      align: initialAlign = "auto",
      behavior = "auto"
    } = {}) => {
      index = Math.max(0, Math.min(index, this.options.count - 1));
      const offsetInfo = this.getOffsetForIndex(index, initialAlign);
      if (!offsetInfo) return;
      const [offset, align] = offsetInfo;
      this._startScroll({ index, align }, offset, behavior, "absolute");
    };
    this.scrollBy = (delta, { behavior = "auto" } = {}) => {
      const offset = this.getOffsetForAlignment(
        (this.getCommandWrittenOffset() ?? this.getScrollOffset()) + delta,
        "start"
      );
      this._startScroll(
        { index: null, align: "start" },
        offset,
        behavior,
        "relative"
      );
    };
    this.scrollToEnd = ({ behavior = "auto" } = {}) => {
      if (this.options.count > 0) {
        this._startScroll(
          { index: this.options.count - 1, align: "end", toEnd: true },
          Math.max(this.getMaxScrollOffset(), 0),
          behavior,
          "absolute"
        );
        return;
      }
      this.scrollToOffset(Math.max(this.getTotalSize() - this.getSize(), 0), {
        behavior
      });
    };
    this.cancelScroll = () => {
      if (this.rafId != null && this.targetWindow) {
        this.targetWindow.cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.scrollState = null;
    };
    this.getTotalSize = () => Math.max(this._getLayoutTotalSize() - this._holdOffset, 0);
    this._getLayoutTotalSize = () => {
      var _a, _b;
      const measurements = this.getMeasurements();
      let end;
      if (measurements.length === 0) {
        end = this.options.paddingStart;
      } else if (this.options.lanes === 1) {
        const lastIdx = measurements.length - 1;
        const flat = (_a = this._singleLaneMeasurements) == null ? void 0 : _a.flat;
        if (flat != null) {
          end = flat[lastIdx * 2] + flat[lastIdx * 2 + 1];
        } else {
          end = ((_b = measurements[lastIdx]) == null ? void 0 : _b.end) ?? 0;
        }
      } else {
        const endByLane = Array(this.options.lanes).fill(null);
        let endIndex = measurements.length - 1;
        while (endIndex >= 0 && endByLane.some((val) => val === null)) {
          const item = measurements[endIndex];
          if (endByLane[item.lane] === null) {
            endByLane[item.lane] = item.end;
          }
          endIndex--;
        }
        end = Math.max(...endByLane.filter((val) => val !== null));
      }
      return Math.max(
        end - this.options.scrollMargin + this.options.paddingEnd,
        0
      );
    };
    this.takeSnapshot = () => {
      const snapshot = [];
      if (this.itemSizeCache.size === 0) return snapshot;
      const m = this.getMeasurements();
      for (const item of m) {
        if (item && this.itemSizeCache.has(item.key)) {
          snapshot.push({
            index: item.index,
            key: item.key,
            start: item.start,
            size: item.size,
            end: item.end,
            lane: item.lane
          });
        }
      }
      return snapshot;
    };
    this._scrollToOffset = (offset, {
      adjustments,
      behavior
    } = {}) => {
      const write = {
        target: offset + (adjustments ?? 0),
        smooth: behavior === "smooth"
      };
      this.pendingWrite = write;
      this.options.scrollToFn(
        offset - this._holdOffset,
        { behavior, adjustments },
        this
      );
      return write;
    };
    this.getCommandWrittenOffset = () => this.scrollState !== null && this.pendingWrite !== null && !this.pendingWrite.smooth ? this.pendingWrite.target : null;
    this._awaitingCommandReadBack = () => {
      const writtenOffset = this.getCommandWrittenOffset();
      return !(isIOSWebKit() && this._iosGesture.dragging()) && writtenOffset !== null && !approxEqual(writtenOffset, this.getScrollOffset());
    };
    this._followOffsetTarget = (delta) => {
      if (this.scrollState !== null && this.scrollState.index == null) {
        this.scrollState.lastTargetOffset += delta;
      }
    };
    this.measure = () => {
      this.pendingMin = null;
      this.itemSizeCache.clear();
      this.laneAssignments.clear();
      this.itemSizeCacheVersion++;
      this.notify(false);
    };
    this.setOptions(opts);
  }
  /**
   * @deprecated Always 0: a scroll correction is folded into `scrollOffset`
   * at once, so there is never an outstanding adjustment to add to it. Read
   * `scrollOffset` alone.
   */
  get scrollAdjustments() {
    return 0;
  }
  // Returns `true` when it performed a synchronous `scrollTop` write this
  // tick, `false` when the delta was zero or the write was deferred (iOS).
  // `resizeItem` uses that to decide whether the follow-up `notify` must be
  // synchronous so the grown transforms commit in the same paint (#1227).
  applyScrollAdjustment(delta, behavior) {
    if (delta === 0) return false;
    if (this.options.debug) {
      console.info("correction", delta);
    }
    this._followOffsetTarget(delta);
    if (!this._canWriteScroll()) {
      this._holdOffset += delta;
      if (this.scrollOffset !== null) this.scrollOffset += delta;
      return true;
    } else {
      const offset = this.getScrollOffset();
      this._clampedAdjustment = this._clampedBy(offset + delta);
      const write = this._scrollToOffset(offset, {
        adjustments: delta,
        behavior
      });
      if (this.scrollOffset !== null) {
        if (this.pendingWrite === write) this.scrollOffset += delta;
        if (this.scrollOffset < 0) this.scrollOffset = 0;
      }
      return true;
    }
  }
  scheduleScrollReconcile() {
    if (!this.targetWindow) {
      this.scrollState = null;
      return;
    }
    if (this.rafId != null) return;
    this.rafId = this.targetWindow.requestAnimationFrame(() => {
      this.rafId = null;
      this.reconcileScroll();
    });
  }
  getScrollStateTarget(state) {
    const offsetInfo = state.toEnd ? [Math.max(this.getMaxScrollOffset(), 0)] : state.index != null ? this.getOffsetForIndex(state.index, state.align) : void 0;
    return offsetInfo ? offsetInfo[0] : state.lastTargetOffset;
  }
  reconcileScroll() {
    if (!this.scrollState) return;
    const el = this.scrollElement;
    if (!el) return;
    const MAX_RECONCILE_MS = 5e3;
    if (this.now() - this.scrollState.startedAt > MAX_RECONCILE_MS) {
      this.scrollState = null;
      return;
    }
    if (this.scrollState.phase === "queued") {
      this.scheduleScrollReconcile();
      return;
    }
    this.getMeasurements();
    const targetOffset = this.getScrollStateTarget(this.scrollState);
    const STABLE_FRAMES = this.scrollState.index == null ? 1 : this.options.useAnimationFrameWithResizeObserver ? 3 : 2;
    const targetChanged = targetOffset !== this.scrollState.lastTargetOffset;
    if (!targetChanged && approxEqual(targetOffset, this.getScrollOffset())) {
      if (this.scrollState.phase === "smooth") {
        this.scrollState.phase = "smoothLanded";
      } else if (this.scrollState.phase === "smoothFinishing") {
        this.scrollState.phase = "instant";
      }
      this.scrollState.stableFrames++;
      if (this.scrollState.stableFrames >= STABLE_FRAMES) {
        if (this.getScrollOffset() !== targetOffset) {
          this._scrollToOffset(targetOffset, { behavior: "auto" });
        }
        this.scrollState = null;
        return;
      }
    } else {
      this.scrollState.stableFrames = 0;
      if (targetChanged) {
        const viewport = this.getSize() || 600;
        const distance = Math.abs(targetOffset - this.getScrollOffset());
        const keepSmooth = isSmoothScroll(this.scrollState) && distance > viewport;
        this.scrollState.lastTargetOffset = targetOffset;
        if (keepSmooth) {
          this.scrollState.phase = "smooth";
        } else if (this.scrollState.phase === "smooth") {
          this.scrollState.phase = "smoothFinishing";
        } else if (this.scrollState.phase === "smoothLanded") {
          this.scrollState.phase = "instant";
        }
        this._scrollToOffset(targetOffset, {
          behavior: keepSmooth ? "smooth" : "auto"
        });
      }
    }
    this.scheduleScrollReconcile();
  }
  // Every scroll command starts here: it becomes the in-flight command,
  // writes its first target and leaves reconcile to retarget and retire it.
  //
  // Targets are layout offsets. A held correction is not dropped by a
  // command: the write lands the element `_holdOffset` short of the target,
  // under the rows exposed shifted by the same amount, and the flush moves
  // both together once a write is possible.
  //
  // An index or end target that is already at its offset starts a smooth
  // scroll as landed; an offset target never does, so its first scroll
  // event is read as the user's (see the scroll handler in `_willUpdate`).
  _startScroll(target, offset, behavior, kind) {
    this.pendingScrollAnchor = null;
    this._clampedAdjustment = null;
    const tail = this._iosGesture.tail();
    if (kind === "absolute" && tail !== null) {
      if (tail === "fling" && momentumOverridesWrites()) {
        this._stopMomentum(() => {
          const state = this.scrollState;
          if ((state == null ? void 0 : state.phase) !== "queued" || // A finger came down: it owns the scroll until it lifts.
          this._iosGesture.tail() !== "fling" || // In a bounce WebKit can drop the write (#1287): the tail
          // decides, as without the stop. (Not `flingCaught`: our stop
          // also ends the fling at speed, so a slow frame would read as
          // a catch and the tail would drop the command.)
          this._reportedOverscroll) {
            return;
          }
          this._iosGesture.end();
          this._flushHoldIfReady(true);
          this._writeAwaitingCommand();
        });
        this.scrollState = {
          ...target,
          startedAt: this.now(),
          lastTargetOffset: offset,
          stableFrames: 0,
          phase: "queued",
          behavior,
          samples: []
        };
        this.scheduleScrollReconcile();
        return;
      }
      this._iosGesture.end();
    }
    this.scrollState = {
      ...target,
      startedAt: this.now(),
      lastTargetOffset: offset,
      stableFrames: 0,
      behavior,
      phase: initialScrollPhase(
        behavior,
        target.index != null && approxEqual(offset, this.getScrollOffset())
      )
    };
    this._scrollToOffset(offset, { behavior });
    this.scheduleScrollReconcile();
  }
};
var findNearestBinarySearch = (low, high, getCurrentValue, value) => {
  while (low <= high) {
    const middle = (low + high) / 2 | 0;
    const currentValue = getCurrentValue(middle);
    if (currentValue < value) {
      low = middle + 1;
    } else if (currentValue > value) {
      high = middle - 1;
    } else {
      return middle;
    }
  }
  if (low > 0) {
    return low - 1;
  } else {
    return 0;
  }
};
function findNearestBinarySearchFlat(flat, high, value) {
  let low = 0;
  while (low <= high) {
    const middle = (low + high) / 2 | 0;
    const currentValue = flat[middle * 2];
    if (currentValue < value) {
      low = middle + 1;
    } else if (currentValue > value) {
      high = middle - 1;
    } else {
      return middle;
    }
  }
  return low > 0 ? low - 1 : 0;
}
function calculateRangeImpl(measurements, outerSize, scrollOffset, lanes, flat) {
  const lastIndex = measurements.length - 1;
  if (measurements.length <= lanes) {
    return { startIndex: 0, endIndex: lastIndex };
  }
  if (lanes === 1 && flat !== null) {
    const startIndex2 = findNearestBinarySearchFlat(
      flat,
      lastIndex,
      scrollOffset
    );
    let endIndex2 = startIndex2;
    const limit = scrollOffset + outerSize;
    while (endIndex2 < lastIndex && flat[endIndex2 * 2] + flat[endIndex2 * 2 + 1] < limit) {
      endIndex2++;
    }
    return { startIndex: startIndex2, endIndex: endIndex2 };
  }
  const getStart = (index) => measurements[index].start;
  let startIndex = findNearestBinarySearch(0, lastIndex, getStart, scrollOffset);
  let endIndex = startIndex;
  if (lanes === 1) {
    while (endIndex < lastIndex && measurements[endIndex].end < scrollOffset + outerSize) {
      endIndex++;
    }
  } else if (lanes > 1) {
    const endPerLane = Array(lanes).fill(0);
    while (endIndex < lastIndex && endPerLane.some((pos) => pos < scrollOffset + outerSize)) {
      const item = measurements[endIndex];
      endPerLane[item.lane] = item.end;
      endIndex++;
    }
    const startPerLane = Array(lanes).fill(scrollOffset + outerSize);
    while (startIndex >= 0 && startPerLane.some((pos) => pos >= scrollOffset)) {
      const item = measurements[startIndex];
      startPerLane[item.lane] = item.start;
      startIndex--;
    }
    startIndex = Math.max(0, startIndex - startIndex % lanes);
    endIndex = Math.min(lastIndex, endIndex + (lanes - 1 - endIndex % lanes));
  }
  return { startIndex, endIndex };
}

// ../../node_modules/.pnpm/@tanstack+react-virtual@3.14.26_react-dom@19.3.1_react@19.3.1__react@19.3.1/node_modules/@tanstack/react-virtual/dist/esm/index.js
var useIsomorphicLayoutEffect = typeof document !== "undefined" ? React.useLayoutEffect : React.useEffect;
function useVirtualizerBase({
  useFlushSync = true,
  directDomUpdates = false,
  directDomUpdatesMode = "transform",
  ...options
}) {
  const rerender = React.useReducer((x) => x + 1, 0)[1];
  const directRef = React.useRef({
    enabled: directDomUpdates,
    mode: directDomUpdatesMode,
    container: null,
    lastSize: null,
    // Keyed by the element itself so a remounted node (same key, new DOM
    // node — e.g. when `enabled` is toggled off then on) is treated as fresh
    // and gets its style written.
    lastPositions: /* @__PURE__ */ new WeakMap(),
    prevRange: null
  });
  directRef.current.enabled = directDomUpdates;
  directRef.current.mode = directDomUpdatesMode;
  const measuringFromRef = React.useRef(false);
  const applyContainerSize = (instance2) => {
    const state = directRef.current;
    if (!state.enabled || !state.container) return;
    const totalSize = instance2.getTotalSize();
    if (totalSize !== state.lastSize) {
      state.lastSize = totalSize;
      const sizeAxis = instance2.options.horizontal ? "width" : "height";
      state.container.style[sizeAxis] = `${totalSize}px`;
    }
  };
  const applyItemPosition = (instance2, item, el) => {
    const state = directRef.current;
    const horizontal = !!instance2.options.horizontal;
    const next = item.start - instance2.options.scrollMargin;
    if (state.lastPositions.get(el) === next) return;
    state.lastPositions.set(el, next);
    if (state.mode === "transform") {
      el.style.transform = horizontal ? `translate3d(${next}px, 0, 0)` : `translate3d(0, ${next}px, 0)`;
    } else {
      el.style[horizontal ? "left" : "top"] = `${next}px`;
    }
  };
  const applyDirectStyles = (instance2) => {
    const state = directRef.current;
    if (!state.enabled || !state.container) return;
    applyContainerSize(instance2);
    for (const item of instance2.getVirtualItems()) {
      const el = instance2.elementsCache.get(item.key);
      if (el) applyItemPosition(instance2, item, el);
    }
  };
  const resolvedOptions = {
    ...options,
    onChange: (instance2, sync) => {
      var _a;
      const state = directRef.current;
      let shouldRerender = true;
      if (state.enabled) {
        applyDirectStyles(instance2);
        const range = instance2.range;
        const prev = state.prevRange;
        shouldRerender = !prev || prev.isScrolling !== instance2.isScrolling || prev.startIndex !== (range == null ? void 0 : range.startIndex) || prev.endIndex !== (range == null ? void 0 : range.endIndex);
        if (shouldRerender) {
          state.prevRange = range ? {
            startIndex: range.startIndex,
            endIndex: range.endIndex,
            isScrolling: instance2.isScrolling
          } : null;
        }
      }
      if (shouldRerender) {
        if (useFlushSync && sync && !measuringFromRef.current) {
          (0, import_react_dom.flushSync)(rerender);
        } else {
          rerender();
        }
      }
      (_a = options.onChange) == null ? void 0 : _a.call(options, instance2, sync);
    }
  };
  const [instance] = React.useState(() => {
    const v = new Virtualizer(resolvedOptions);
    const measureElement2 = v.measureElement;
    v.measureElement = (node) => {
      measuringFromRef.current = true;
      try {
        measureElement2(node);
      } finally {
        measuringFromRef.current = false;
      }
      const state = directRef.current;
      if (node !== null && state.enabled && state.container) {
        const item = v.measurementsCache[v.indexFromElement(node)];
        if (item) applyItemPosition(v, item, node);
      }
    };
    return Object.assign(v, {
      containerRef: (node) => {
        const state = directRef.current;
        state.container = node;
        state.lastSize = null;
        if (node !== null) {
          applyDirectStyles(v);
        }
      }
    });
  });
  instance.setOptions(resolvedOptions);
  useIsomorphicLayoutEffect(() => {
    return instance._didMount();
  }, []);
  useIsomorphicLayoutEffect(() => {
    applyContainerSize(instance);
    return instance._willUpdate();
  });
  useIsomorphicLayoutEffect(() => {
    applyDirectStyles(instance);
  });
  return instance;
}
function useVirtualizer(options) {
  return useVirtualizerBase({
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    ...options
  });
}

// src/yak-sources.tsx
var import_react3 = require("react");

// src/api.ts
var CORE_BASE = API_BASE;
async function responseError(response) {
  const data = await response.json().catch(() => null);
  return new Error(data?.error || `HTTP ${response.status}`);
}
async function callApi(path, method = "GET", body) {
  const verb = method.toUpperCase();
  if (verb === "GET") return api.get(path);
  if (verb === "POST") return api.post(path, body);
  if (verb === "PUT") return api.put(path, body);
  if (verb === "PATCH") return api.patch(path, body);
  if (verb === "DELETE") return api.del(path, body);
  throw new Error(`\u4E0D\u652F\u6301\u7684\u8BF7\u6C42\u65B9\u6CD5\uFF1A${method}`);
}
function useApi(path, deps = []) {
  const result = useQuery(
    `legacy:${path}:${JSON.stringify(deps)}`,
    (signal) => api.get(path, signal),
    { ttlMs: 2e3 }
  );
  return {
    data: result.data ?? null,
    error: result.error === void 0 ? "" : errorText(result.error),
    loading: result.loading
  };
}

// src/yak-sources.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var EMPTY = { name: "", workspace: "", socket: "", token_file: "", project_id: "1" };
function field(label, hint, control) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "vx-cat-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "vx-cat-field-label", children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "vx-cat-field-hint", children: hint }),
    control
  ] });
}
function YakSourcesEditor({ onSaved }) {
  const [open, setOpen] = (0, import_react3.useState)(false);
  const [rows, setRows] = (0, import_react3.useState)([]);
  const [path, setPath] = (0, import_react3.useState)("");
  const [error, setError] = (0, import_react3.useState)("");
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [loaded, setLoaded] = (0, import_react3.useState)(false);
  async function load2() {
    setBusy(true);
    setError("");
    try {
      const data = await callApi("/api/yak/sources");
      setRows((data.sources ?? []).map((row) => ({
        name: String(row.name ?? ""),
        workspace: String(row.workspace ?? ""),
        socket: String(row.socket ?? ""),
        token_file: String(row.token_file ?? ""),
        project_id: String(row.project_id ?? 1)
      })));
      setPath(String(data.path ?? ""));
      setLoaded(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function update(index, patch2) {
    setRows((current) => current.map((row, i) => i === index ? { ...row, ...patch2 } : row));
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const payload = rows.map((row) => ({
        name: row.name.trim(),
        workspace: row.workspace.trim(),
        socket: row.socket.trim(),
        token_file: row.token_file.trim(),
        project_id: Number(row.project_id)
      }));
      const data = await callApi("/api/yak/sources", "PUT", { sources: payload });
      setRows((data.sources ?? []).map((row) => ({
        name: String(row.name ?? ""),
        workspace: String(row.workspace ?? ""),
        socket: String(row.socket ?? ""),
        token_file: String(row.token_file ?? ""),
        project_id: String(row.project_id ?? 1)
      })));
      setPath(String(data.path ?? path));
      onSaved();
      setOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "vx-cat-section", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "vx-cat-section-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: "Yak \u6D41\u91CF\u6765\u6E90" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          className: "vx-cat-btn",
          onClick: () => {
            if (!open && !loaded) void load2();
            setOpen((value) => !value);
          },
          children: open ? "\u6536\u8D77" : "\u914D\u7F6E\u6765\u6E90"
        }
      )
    ] }),
    !open && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "vx-cat-hint", children: "\u6BCF\u4E2A\u672C\u5730\u5DE5\u4F5C\u533A\u7ED1\u5B9A\u4E00\u4E2A Yak \u5185\u6838 socket \u4E0E\u9879\u76EE\uFF1B\u672A\u914D\u7F6E\u65F6 History \u65E0\u6CD5\u8BFB\u53D6\u5916\u90E8\u6D41\u91CF\u3002" }),
    open && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "vx-cat-grid", children: [
      error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "vx-cat-error", role: "alert", children: error }),
      rows.map((row, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "vx-cat-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "vx-cat-card-top", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: row.name || `\u6765\u6E90 ${index + 1}` }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              className: "vx-cat-btn vx-cat-btn--danger",
              onClick: () => setRows((current) => current.filter((_, i) => i !== index)),
              children: "\u5220\u9664"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "vx-cat-grid", children: [
          field("\u540D\u79F0", "\u4F1A\u8BDD\u91CC\u663E\u793A\u7684\u9879\u76EE\u540D", /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "vx-cat-input", value: row.name, onChange: (e) => update(index, { name: e.target.value }) })),
          field("\u5DE5\u4F5C\u533A", "\u7EDD\u5BF9\u8DEF\u5F84\uFF1B\u4F1A\u8BDD\u539F\u5DE5\u4F5C\u533A\u6309\u5B83\u5339\u914D\u6765\u6E90", /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "vx-cat-input vx-cat-mono", value: row.workspace, onChange: (e) => update(index, { workspace: e.target.value }) })),
          field("\u5185\u6838 socket", "Yak \u79C1\u6709 Unix socket \u7EDD\u5BF9\u8DEF\u5F84\uFF08\u76EE\u5F55 0700\uFF09", /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "vx-cat-input vx-cat-mono", value: row.socket, onChange: (e) => update(index, { socket: e.target.value }) })),
          field("\u4EE4\u724C\u6587\u4EF6", "\u4E00\u884C\u5185\u6838\u4EE4\u724C\u7684\u7EDD\u5BF9\u8DEF\u5F84\uFF080600\uFF09", /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "vx-cat-input vx-cat-mono", value: row.token_file, onChange: (e) => update(index, { token_file: e.target.value }) })),
          field("\u9879\u76EE ID", "\u8BE5\u5185\u6838\u5F53\u524D\u9879\u76EE\u7F16\u53F7\uFF08GetCurrentProjectEx\uFF09", /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "vx-cat-input vx-cat-mono", inputMode: "numeric", value: row.project_id, onChange: (e) => update(index, { project_id: e.target.value }) }))
        ] })
      ] }, index)),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "vx-cat-toolbar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "vx-cat-btn", onClick: () => setRows((current) => [...current, { ...EMPTY }]), children: "\u65B0\u589E\u6765\u6E90" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "vx-cat-btn vx-cat-btn--primary", disabled: busy, onClick: () => void save(), children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "vx-cat-btn", onClick: () => void load2(), disabled: busy, children: "\u91CD\u65B0\u8BFB\u53D6" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "vx-cat-spacer" }),
        path && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { className: "vx-cat-mono vx-cat-mini", children: path })
      ] })
    ] })
  ] });
}

// ../../node_modules/.pnpm/react-resizable-panels@2.1.9_react-dom@19.3.1_react@19.3.1__react@19.3.1/node_modules/react-resizable-panels/dist/react-resizable-panels.browser.esm.js
var React2 = __toESM(require("react"));
var import_react4 = require("react");
var PanelGroupContext = (0, import_react4.createContext)(null);
PanelGroupContext.displayName = "PanelGroupContext";
var DATA_ATTRIBUTES = {
  group: "data-panel-group",
  groupDirection: "data-panel-group-direction",
  groupId: "data-panel-group-id",
  panel: "data-panel",
  panelCollapsible: "data-panel-collapsible",
  panelId: "data-panel-id",
  panelSize: "data-panel-size",
  resizeHandle: "data-resize-handle",
  resizeHandleActive: "data-resize-handle-active",
  resizeHandleEnabled: "data-panel-resize-handle-enabled",
  resizeHandleId: "data-panel-resize-handle-id",
  resizeHandleState: "data-resize-handle-state"
};
var PRECISION = 10;
var useIsomorphicLayoutEffect2 = import_react4.useLayoutEffect;
var useId2 = React2["useId".toString()];
var wrappedUseId = typeof useId2 === "function" ? useId2 : () => null;
var counter = 0;
function useUniqueId(idFromParams = null) {
  const idFromUseId = wrappedUseId();
  const idRef = (0, import_react4.useRef)(idFromParams || idFromUseId || null);
  if (idRef.current === null) {
    idRef.current = "" + counter++;
  }
  return idFromParams !== null && idFromParams !== void 0 ? idFromParams : idRef.current;
}
function PanelWithForwardedRef({
  children,
  className: classNameFromProps = "",
  collapsedSize,
  collapsible,
  defaultSize,
  forwardedRef,
  id: idFromProps,
  maxSize,
  minSize,
  onCollapse,
  onExpand,
  onResize,
  order,
  style: styleFromProps,
  tagName: Type = "div",
  ...rest
}) {
  const context = (0, import_react4.useContext)(PanelGroupContext);
  if (context === null) {
    throw Error(`Panel components must be rendered within a PanelGroup container`);
  }
  const {
    collapsePanel,
    expandPanel,
    getPanelSize,
    getPanelStyle,
    groupId,
    isPanelCollapsed,
    reevaluatePanelConstraints,
    registerPanel,
    resizePanel: resizePanel2,
    unregisterPanel
  } = context;
  const panelId = useUniqueId(idFromProps);
  const panelDataRef = (0, import_react4.useRef)({
    callbacks: {
      onCollapse,
      onExpand,
      onResize
    },
    constraints: {
      collapsedSize,
      collapsible,
      defaultSize,
      maxSize,
      minSize
    },
    id: panelId,
    idIsFromProps: idFromProps !== void 0,
    order
  });
  (0, import_react4.useRef)({
    didLogMissingDefaultSizeWarning: false
  });
  useIsomorphicLayoutEffect2(() => {
    const {
      callbacks,
      constraints
    } = panelDataRef.current;
    const prevConstraints = {
      ...constraints
    };
    panelDataRef.current.id = panelId;
    panelDataRef.current.idIsFromProps = idFromProps !== void 0;
    panelDataRef.current.order = order;
    callbacks.onCollapse = onCollapse;
    callbacks.onExpand = onExpand;
    callbacks.onResize = onResize;
    constraints.collapsedSize = collapsedSize;
    constraints.collapsible = collapsible;
    constraints.defaultSize = defaultSize;
    constraints.maxSize = maxSize;
    constraints.minSize = minSize;
    if (prevConstraints.collapsedSize !== constraints.collapsedSize || prevConstraints.collapsible !== constraints.collapsible || prevConstraints.maxSize !== constraints.maxSize || prevConstraints.minSize !== constraints.minSize) {
      reevaluatePanelConstraints(panelDataRef.current, prevConstraints);
    }
  });
  useIsomorphicLayoutEffect2(() => {
    const panelData = panelDataRef.current;
    registerPanel(panelData);
    return () => {
      unregisterPanel(panelData);
    };
  }, [order, panelId, registerPanel, unregisterPanel]);
  (0, import_react4.useImperativeHandle)(forwardedRef, () => ({
    collapse: () => {
      collapsePanel(panelDataRef.current);
    },
    expand: (minSize2) => {
      expandPanel(panelDataRef.current, minSize2);
    },
    getId() {
      return panelId;
    },
    getSize() {
      return getPanelSize(panelDataRef.current);
    },
    isCollapsed() {
      return isPanelCollapsed(panelDataRef.current);
    },
    isExpanded() {
      return !isPanelCollapsed(panelDataRef.current);
    },
    resize: (size) => {
      resizePanel2(panelDataRef.current, size);
    }
  }), [collapsePanel, expandPanel, getPanelSize, isPanelCollapsed, panelId, resizePanel2]);
  const style = getPanelStyle(panelDataRef.current, defaultSize);
  return (0, import_react4.createElement)(Type, {
    ...rest,
    children,
    className: classNameFromProps,
    id: panelId,
    style: {
      ...style,
      ...styleFromProps
    },
    // CSS selectors
    [DATA_ATTRIBUTES.groupId]: groupId,
    [DATA_ATTRIBUTES.panel]: "",
    [DATA_ATTRIBUTES.panelCollapsible]: collapsible || void 0,
    [DATA_ATTRIBUTES.panelId]: panelId,
    [DATA_ATTRIBUTES.panelSize]: parseFloat("" + style.flexGrow).toFixed(1)
  });
}
var Panel = (0, import_react4.forwardRef)((props2, ref) => (0, import_react4.createElement)(PanelWithForwardedRef, {
  ...props2,
  forwardedRef: ref
}));
PanelWithForwardedRef.displayName = "Panel";
Panel.displayName = "forwardRef(Panel)";
var nonce;
function getNonce() {
  return nonce;
}
var currentCursorStyle = null;
var enabled = true;
var prevRuleIndex = -1;
var styleElement = null;
function getCursorStyle(state, constraintFlags) {
  if (constraintFlags) {
    const horizontalMin = (constraintFlags & EXCEEDED_HORIZONTAL_MIN) !== 0;
    const horizontalMax = (constraintFlags & EXCEEDED_HORIZONTAL_MAX) !== 0;
    const verticalMin = (constraintFlags & EXCEEDED_VERTICAL_MIN) !== 0;
    const verticalMax = (constraintFlags & EXCEEDED_VERTICAL_MAX) !== 0;
    if (horizontalMin) {
      if (verticalMin) {
        return "se-resize";
      } else if (verticalMax) {
        return "ne-resize";
      } else {
        return "e-resize";
      }
    } else if (horizontalMax) {
      if (verticalMin) {
        return "sw-resize";
      } else if (verticalMax) {
        return "nw-resize";
      } else {
        return "w-resize";
      }
    } else if (verticalMin) {
      return "s-resize";
    } else if (verticalMax) {
      return "n-resize";
    }
  }
  switch (state) {
    case "horizontal":
      return "ew-resize";
    case "intersection":
      return "move";
    case "vertical":
      return "ns-resize";
  }
}
function resetGlobalCursorStyle() {
  if (styleElement !== null) {
    document.head.removeChild(styleElement);
    currentCursorStyle = null;
    styleElement = null;
    prevRuleIndex = -1;
  }
}
function setGlobalCursorStyle(state, constraintFlags) {
  var _styleElement$sheet$i, _styleElement$sheet2;
  if (!enabled) {
    return;
  }
  const style = getCursorStyle(state, constraintFlags);
  if (currentCursorStyle === style) {
    return;
  }
  currentCursorStyle = style;
  if (styleElement === null) {
    styleElement = document.createElement("style");
    const nonce2 = getNonce();
    if (nonce2) {
      styleElement.setAttribute("nonce", nonce2);
    }
    document.head.appendChild(styleElement);
  }
  if (prevRuleIndex >= 0) {
    var _styleElement$sheet;
    (_styleElement$sheet = styleElement.sheet) === null || _styleElement$sheet === void 0 ? void 0 : _styleElement$sheet.removeRule(prevRuleIndex);
  }
  prevRuleIndex = (_styleElement$sheet$i = (_styleElement$sheet2 = styleElement.sheet) === null || _styleElement$sheet2 === void 0 ? void 0 : _styleElement$sheet2.insertRule(`*{cursor: ${style} !important;}`)) !== null && _styleElement$sheet$i !== void 0 ? _styleElement$sheet$i : -1;
}
function isKeyDown(event) {
  return event.type === "keydown";
}
function isPointerEvent(event) {
  return event.type.startsWith("pointer");
}
function isMouseEvent(event) {
  return event.type.startsWith("mouse");
}
function getResizeEventCoordinates(event) {
  if (isPointerEvent(event)) {
    if (event.isPrimary) {
      return {
        x: event.clientX,
        y: event.clientY
      };
    }
  } else if (isMouseEvent(event)) {
    return {
      x: event.clientX,
      y: event.clientY
    };
  }
  return {
    x: Infinity,
    y: Infinity
  };
}
function getInputType() {
  if (typeof matchMedia === "function") {
    return matchMedia("(pointer:coarse)").matches ? "coarse" : "fine";
  }
}
function intersects(rectOne, rectTwo, strict) {
  if (strict) {
    return rectOne.x < rectTwo.x + rectTwo.width && rectOne.x + rectOne.width > rectTwo.x && rectOne.y < rectTwo.y + rectTwo.height && rectOne.y + rectOne.height > rectTwo.y;
  } else {
    return rectOne.x <= rectTwo.x + rectTwo.width && rectOne.x + rectOne.width >= rectTwo.x && rectOne.y <= rectTwo.y + rectTwo.height && rectOne.y + rectOne.height >= rectTwo.y;
  }
}
function compare(a, b) {
  if (a === b) throw new Error("Cannot compare node with itself");
  const ancestors = {
    a: get_ancestors(a),
    b: get_ancestors(b)
  };
  let common_ancestor;
  while (ancestors.a.at(-1) === ancestors.b.at(-1)) {
    a = ancestors.a.pop();
    b = ancestors.b.pop();
    common_ancestor = a;
  }
  assert(common_ancestor, "Stacking order can only be calculated for elements with a common ancestor");
  const z_indexes = {
    a: get_z_index(find_stacking_context(ancestors.a)),
    b: get_z_index(find_stacking_context(ancestors.b))
  };
  if (z_indexes.a === z_indexes.b) {
    const children = common_ancestor.childNodes;
    const furthest_ancestors = {
      a: ancestors.a.at(-1),
      b: ancestors.b.at(-1)
    };
    let i = children.length;
    while (i--) {
      const child = children[i];
      if (child === furthest_ancestors.a) return 1;
      if (child === furthest_ancestors.b) return -1;
    }
  }
  return Math.sign(z_indexes.a - z_indexes.b);
}
var props = /\b(?:position|zIndex|opacity|transform|webkitTransform|mixBlendMode|filter|webkitFilter|isolation)\b/;
function is_flex_item(node) {
  var _get_parent;
  const display = getComputedStyle((_get_parent = get_parent(node)) !== null && _get_parent !== void 0 ? _get_parent : node).display;
  return display === "flex" || display === "inline-flex";
}
function creates_stacking_context(node) {
  const style = getComputedStyle(node);
  if (style.position === "fixed") return true;
  if (style.zIndex !== "auto" && (style.position !== "static" || is_flex_item(node))) return true;
  if (+style.opacity < 1) return true;
  if ("transform" in style && style.transform !== "none") return true;
  if ("webkitTransform" in style && style.webkitTransform !== "none") return true;
  if ("mixBlendMode" in style && style.mixBlendMode !== "normal") return true;
  if ("filter" in style && style.filter !== "none") return true;
  if ("webkitFilter" in style && style.webkitFilter !== "none") return true;
  if ("isolation" in style && style.isolation === "isolate") return true;
  if (props.test(style.willChange)) return true;
  if (style.webkitOverflowScrolling === "touch") return true;
  return false;
}
function find_stacking_context(nodes) {
  let i = nodes.length;
  while (i--) {
    const node = nodes[i];
    assert(node, "Missing node");
    if (creates_stacking_context(node)) return node;
  }
  return null;
}
function get_z_index(node) {
  return node && Number(getComputedStyle(node).zIndex) || 0;
}
function get_ancestors(node) {
  const ancestors = [];
  while (node) {
    ancestors.push(node);
    node = get_parent(node);
  }
  return ancestors;
}
function get_parent(node) {
  const {
    parentNode
  } = node;
  if (parentNode && parentNode instanceof ShadowRoot) {
    return parentNode.host;
  }
  return parentNode;
}
var EXCEEDED_HORIZONTAL_MIN = 1;
var EXCEEDED_HORIZONTAL_MAX = 2;
var EXCEEDED_VERTICAL_MIN = 4;
var EXCEEDED_VERTICAL_MAX = 8;
var isCoarsePointer = getInputType() === "coarse";
var intersectingHandles = [];
var isPointerDown = false;
var ownerDocumentCounts = /* @__PURE__ */ new Map();
var panelConstraintFlags = /* @__PURE__ */ new Map();
var registeredResizeHandlers = /* @__PURE__ */ new Set();
function registerResizeHandle(resizeHandleId, element, direction, hitAreaMargins, setResizeHandlerState) {
  var _ownerDocumentCounts$;
  const {
    ownerDocument
  } = element;
  const data = {
    direction,
    element,
    hitAreaMargins,
    setResizeHandlerState
  };
  const count = (_ownerDocumentCounts$ = ownerDocumentCounts.get(ownerDocument)) !== null && _ownerDocumentCounts$ !== void 0 ? _ownerDocumentCounts$ : 0;
  ownerDocumentCounts.set(ownerDocument, count + 1);
  registeredResizeHandlers.add(data);
  updateListeners();
  return function unregisterResizeHandle() {
    var _ownerDocumentCounts$2;
    panelConstraintFlags.delete(resizeHandleId);
    registeredResizeHandlers.delete(data);
    const count2 = (_ownerDocumentCounts$2 = ownerDocumentCounts.get(ownerDocument)) !== null && _ownerDocumentCounts$2 !== void 0 ? _ownerDocumentCounts$2 : 1;
    ownerDocumentCounts.set(ownerDocument, count2 - 1);
    updateListeners();
    if (count2 === 1) {
      ownerDocumentCounts.delete(ownerDocument);
    }
    if (intersectingHandles.includes(data)) {
      const index = intersectingHandles.indexOf(data);
      if (index >= 0) {
        intersectingHandles.splice(index, 1);
      }
      updateCursor();
      setResizeHandlerState("up", true, null);
    }
  };
}
function handlePointerDown(event) {
  const {
    target
  } = event;
  const {
    x,
    y
  } = getResizeEventCoordinates(event);
  isPointerDown = true;
  recalculateIntersectingHandles({
    target,
    x,
    y
  });
  updateListeners();
  if (intersectingHandles.length > 0) {
    updateResizeHandlerStates("down", event);
    event.preventDefault();
    if (!isWithinResizeHandle(target)) {
      event.stopImmediatePropagation();
    }
  }
}
function handlePointerMove(event) {
  const {
    x,
    y
  } = getResizeEventCoordinates(event);
  if (isPointerDown && event.buttons === 0) {
    isPointerDown = false;
    updateResizeHandlerStates("up", event);
  }
  if (!isPointerDown) {
    const {
      target
    } = event;
    recalculateIntersectingHandles({
      target,
      x,
      y
    });
  }
  updateResizeHandlerStates("move", event);
  updateCursor();
  if (intersectingHandles.length > 0) {
    event.preventDefault();
  }
}
function handlePointerUp(event) {
  const {
    target
  } = event;
  const {
    x,
    y
  } = getResizeEventCoordinates(event);
  panelConstraintFlags.clear();
  isPointerDown = false;
  if (intersectingHandles.length > 0) {
    event.preventDefault();
    if (!isWithinResizeHandle(target)) {
      event.stopImmediatePropagation();
    }
  }
  updateResizeHandlerStates("up", event);
  recalculateIntersectingHandles({
    target,
    x,
    y
  });
  updateCursor();
  updateListeners();
}
function isWithinResizeHandle(element) {
  let currentElement = element;
  while (currentElement) {
    if (currentElement.hasAttribute(DATA_ATTRIBUTES.resizeHandle)) {
      return true;
    }
    currentElement = currentElement.parentElement;
  }
  return false;
}
function recalculateIntersectingHandles({
  target,
  x,
  y
}) {
  intersectingHandles.splice(0);
  let targetElement = null;
  if (target instanceof HTMLElement || target instanceof SVGElement) {
    targetElement = target;
  }
  registeredResizeHandlers.forEach((data) => {
    const {
      element: dragHandleElement,
      hitAreaMargins
    } = data;
    const dragHandleRect = dragHandleElement.getBoundingClientRect();
    const {
      bottom,
      left,
      right,
      top
    } = dragHandleRect;
    const margin = isCoarsePointer ? hitAreaMargins.coarse : hitAreaMargins.fine;
    const eventIntersects = x >= left - margin && x <= right + margin && y >= top - margin && y <= bottom + margin;
    if (eventIntersects) {
      if (targetElement !== null && document.contains(targetElement) && dragHandleElement !== targetElement && !dragHandleElement.contains(targetElement) && !targetElement.contains(dragHandleElement) && // Calculating stacking order has a cost, so we should avoid it if possible
      // That is why we only check potentially intersecting handles,
      // and why we skip if the event target is within the handle's DOM
      compare(targetElement, dragHandleElement) > 0) {
        let currentElement = targetElement;
        let didIntersect = false;
        while (currentElement) {
          if (currentElement.contains(dragHandleElement)) {
            break;
          } else if (intersects(currentElement.getBoundingClientRect(), dragHandleRect, true)) {
            didIntersect = true;
            break;
          }
          currentElement = currentElement.parentElement;
        }
        if (didIntersect) {
          return;
        }
      }
      intersectingHandles.push(data);
    }
  });
}
function reportConstraintsViolation(resizeHandleId, flag) {
  panelConstraintFlags.set(resizeHandleId, flag);
}
function updateCursor() {
  let intersectsHorizontal = false;
  let intersectsVertical = false;
  intersectingHandles.forEach((data) => {
    const {
      direction
    } = data;
    if (direction === "horizontal") {
      intersectsHorizontal = true;
    } else {
      intersectsVertical = true;
    }
  });
  let constraintFlags = 0;
  panelConstraintFlags.forEach((flag) => {
    constraintFlags |= flag;
  });
  if (intersectsHorizontal && intersectsVertical) {
    setGlobalCursorStyle("intersection", constraintFlags);
  } else if (intersectsHorizontal) {
    setGlobalCursorStyle("horizontal", constraintFlags);
  } else if (intersectsVertical) {
    setGlobalCursorStyle("vertical", constraintFlags);
  } else {
    resetGlobalCursorStyle();
  }
}
var listenersAbortController = new AbortController();
function updateListeners() {
  listenersAbortController.abort();
  listenersAbortController = new AbortController();
  const options = {
    capture: true,
    signal: listenersAbortController.signal
  };
  if (!registeredResizeHandlers.size) {
    return;
  }
  if (isPointerDown) {
    if (intersectingHandles.length > 0) {
      ownerDocumentCounts.forEach((count, ownerDocument) => {
        const {
          body
        } = ownerDocument;
        if (count > 0) {
          body.addEventListener("contextmenu", handlePointerUp, options);
          body.addEventListener("pointerleave", handlePointerMove, options);
          body.addEventListener("pointermove", handlePointerMove, options);
        }
      });
    }
    window.addEventListener("pointerup", handlePointerUp, options);
    window.addEventListener("pointercancel", handlePointerUp, options);
  } else {
    ownerDocumentCounts.forEach((count, ownerDocument) => {
      const {
        body
      } = ownerDocument;
      if (count > 0) {
        body.addEventListener("pointerdown", handlePointerDown, options);
        body.addEventListener("pointermove", handlePointerMove, options);
      }
    });
  }
}
function updateResizeHandlerStates(action, event) {
  registeredResizeHandlers.forEach((data) => {
    const {
      setResizeHandlerState
    } = data;
    const isActive = intersectingHandles.includes(data);
    setResizeHandlerState(action, isActive, event);
  });
}
function useForceUpdate() {
  const [_, setCount] = (0, import_react4.useState)(0);
  return (0, import_react4.useCallback)(() => setCount((prevCount) => prevCount + 1), []);
}
function assert(expectedCondition, message) {
  if (!expectedCondition) {
    console.error(message);
    throw Error(message);
  }
}
function fuzzyCompareNumbers(actual, expected, fractionDigits = PRECISION) {
  if (actual.toFixed(fractionDigits) === expected.toFixed(fractionDigits)) {
    return 0;
  } else {
    return actual > expected ? 1 : -1;
  }
}
function fuzzyNumbersEqual$1(actual, expected, fractionDigits = PRECISION) {
  return fuzzyCompareNumbers(actual, expected, fractionDigits) === 0;
}
function fuzzyNumbersEqual(actual, expected, fractionDigits) {
  return fuzzyCompareNumbers(actual, expected, fractionDigits) === 0;
}
function fuzzyLayoutsEqual(actual, expected, fractionDigits) {
  if (actual.length !== expected.length) {
    return false;
  }
  for (let index = 0; index < actual.length; index++) {
    const actualSize = actual[index];
    const expectedSize = expected[index];
    if (!fuzzyNumbersEqual(actualSize, expectedSize, fractionDigits)) {
      return false;
    }
  }
  return true;
}
function resizePanel({
  panelConstraints: panelConstraintsArray,
  panelIndex,
  size
}) {
  const panelConstraints = panelConstraintsArray[panelIndex];
  assert(panelConstraints != null, `Panel constraints not found for index ${panelIndex}`);
  let {
    collapsedSize = 0,
    collapsible,
    maxSize = 100,
    minSize = 0
  } = panelConstraints;
  if (fuzzyCompareNumbers(size, minSize) < 0) {
    if (collapsible) {
      const halfwayPoint = (collapsedSize + minSize) / 2;
      if (fuzzyCompareNumbers(size, halfwayPoint) < 0) {
        size = collapsedSize;
      } else {
        size = minSize;
      }
    } else {
      size = minSize;
    }
  }
  size = Math.min(maxSize, size);
  size = parseFloat(size.toFixed(PRECISION));
  return size;
}
function adjustLayoutByDelta({
  delta,
  initialLayout,
  panelConstraints: panelConstraintsArray,
  pivotIndices,
  prevLayout,
  trigger
}) {
  if (fuzzyNumbersEqual(delta, 0)) {
    return initialLayout;
  }
  const nextLayout = [...initialLayout];
  const [firstPivotIndex, secondPivotIndex] = pivotIndices;
  assert(firstPivotIndex != null, "Invalid first pivot index");
  assert(secondPivotIndex != null, "Invalid second pivot index");
  let deltaApplied = 0;
  {
    if (trigger === "keyboard") {
      {
        const index = delta < 0 ? secondPivotIndex : firstPivotIndex;
        const panelConstraints = panelConstraintsArray[index];
        assert(panelConstraints, `Panel constraints not found for index ${index}`);
        const {
          collapsedSize = 0,
          collapsible,
          minSize = 0
        } = panelConstraints;
        if (collapsible) {
          const prevSize = initialLayout[index];
          assert(prevSize != null, `Previous layout not found for panel index ${index}`);
          if (fuzzyNumbersEqual(prevSize, collapsedSize)) {
            const localDelta = minSize - prevSize;
            if (fuzzyCompareNumbers(localDelta, Math.abs(delta)) > 0) {
              delta = delta < 0 ? 0 - localDelta : localDelta;
            }
          }
        }
      }
      {
        const index = delta < 0 ? firstPivotIndex : secondPivotIndex;
        const panelConstraints = panelConstraintsArray[index];
        assert(panelConstraints, `No panel constraints found for index ${index}`);
        const {
          collapsedSize = 0,
          collapsible,
          minSize = 0
        } = panelConstraints;
        if (collapsible) {
          const prevSize = initialLayout[index];
          assert(prevSize != null, `Previous layout not found for panel index ${index}`);
          if (fuzzyNumbersEqual(prevSize, minSize)) {
            const localDelta = prevSize - collapsedSize;
            if (fuzzyCompareNumbers(localDelta, Math.abs(delta)) > 0) {
              delta = delta < 0 ? 0 - localDelta : localDelta;
            }
          }
        }
      }
    }
  }
  {
    const increment = delta < 0 ? 1 : -1;
    let index = delta < 0 ? secondPivotIndex : firstPivotIndex;
    let maxAvailableDelta = 0;
    while (true) {
      const prevSize = initialLayout[index];
      assert(prevSize != null, `Previous layout not found for panel index ${index}`);
      const maxSafeSize = resizePanel({
        panelConstraints: panelConstraintsArray,
        panelIndex: index,
        size: 100
      });
      const delta2 = maxSafeSize - prevSize;
      maxAvailableDelta += delta2;
      index += increment;
      if (index < 0 || index >= panelConstraintsArray.length) {
        break;
      }
    }
    const minAbsDelta = Math.min(Math.abs(delta), Math.abs(maxAvailableDelta));
    delta = delta < 0 ? 0 - minAbsDelta : minAbsDelta;
  }
  {
    const pivotIndex = delta < 0 ? firstPivotIndex : secondPivotIndex;
    let index = pivotIndex;
    while (index >= 0 && index < panelConstraintsArray.length) {
      const deltaRemaining = Math.abs(delta) - Math.abs(deltaApplied);
      const prevSize = initialLayout[index];
      assert(prevSize != null, `Previous layout not found for panel index ${index}`);
      const unsafeSize = prevSize - deltaRemaining;
      const safeSize = resizePanel({
        panelConstraints: panelConstraintsArray,
        panelIndex: index,
        size: unsafeSize
      });
      if (!fuzzyNumbersEqual(prevSize, safeSize)) {
        deltaApplied += prevSize - safeSize;
        nextLayout[index] = safeSize;
        if (deltaApplied.toPrecision(3).localeCompare(Math.abs(delta).toPrecision(3), void 0, {
          numeric: true
        }) >= 0) {
          break;
        }
      }
      if (delta < 0) {
        index--;
      } else {
        index++;
      }
    }
  }
  if (fuzzyLayoutsEqual(prevLayout, nextLayout)) {
    return prevLayout;
  }
  {
    const pivotIndex = delta < 0 ? secondPivotIndex : firstPivotIndex;
    const prevSize = initialLayout[pivotIndex];
    assert(prevSize != null, `Previous layout not found for panel index ${pivotIndex}`);
    const unsafeSize = prevSize + deltaApplied;
    const safeSize = resizePanel({
      panelConstraints: panelConstraintsArray,
      panelIndex: pivotIndex,
      size: unsafeSize
    });
    nextLayout[pivotIndex] = safeSize;
    if (!fuzzyNumbersEqual(safeSize, unsafeSize)) {
      let deltaRemaining = unsafeSize - safeSize;
      const pivotIndex2 = delta < 0 ? secondPivotIndex : firstPivotIndex;
      let index = pivotIndex2;
      while (index >= 0 && index < panelConstraintsArray.length) {
        const prevSize2 = nextLayout[index];
        assert(prevSize2 != null, `Previous layout not found for panel index ${index}`);
        const unsafeSize2 = prevSize2 + deltaRemaining;
        const safeSize2 = resizePanel({
          panelConstraints: panelConstraintsArray,
          panelIndex: index,
          size: unsafeSize2
        });
        if (!fuzzyNumbersEqual(prevSize2, safeSize2)) {
          deltaRemaining -= safeSize2 - prevSize2;
          nextLayout[index] = safeSize2;
        }
        if (fuzzyNumbersEqual(deltaRemaining, 0)) {
          break;
        }
        if (delta > 0) {
          index--;
        } else {
          index++;
        }
      }
    }
  }
  const totalSize = nextLayout.reduce((total, size) => size + total, 0);
  if (!fuzzyNumbersEqual(totalSize, 100)) {
    return prevLayout;
  }
  return nextLayout;
}
function calculateAriaValues({
  layout,
  panelsArray,
  pivotIndices
}) {
  let currentMinSize = 0;
  let currentMaxSize = 100;
  let totalMinSize = 0;
  let totalMaxSize = 0;
  const firstIndex = pivotIndices[0];
  assert(firstIndex != null, "No pivot index found");
  panelsArray.forEach((panelData, index) => {
    const {
      constraints
    } = panelData;
    const {
      maxSize = 100,
      minSize = 0
    } = constraints;
    if (index === firstIndex) {
      currentMinSize = minSize;
      currentMaxSize = maxSize;
    } else {
      totalMinSize += minSize;
      totalMaxSize += maxSize;
    }
  });
  const valueMax = Math.min(currentMaxSize, 100 - totalMinSize);
  const valueMin = Math.max(currentMinSize, 100 - totalMaxSize);
  const valueNow = layout[firstIndex];
  return {
    valueMax,
    valueMin,
    valueNow
  };
}
function getResizeHandleElementsForGroup(groupId, scope = document) {
  return Array.from(scope.querySelectorAll(`[${DATA_ATTRIBUTES.resizeHandleId}][data-panel-group-id="${groupId}"]`));
}
function getResizeHandleElementIndex(groupId, id, scope = document) {
  const handles = getResizeHandleElementsForGroup(groupId, scope);
  const index = handles.findIndex((handle) => handle.getAttribute(DATA_ATTRIBUTES.resizeHandleId) === id);
  return index !== null && index !== void 0 ? index : null;
}
function determinePivotIndices(groupId, dragHandleId, panelGroupElement) {
  const index = getResizeHandleElementIndex(groupId, dragHandleId, panelGroupElement);
  return index != null ? [index, index + 1] : [-1, -1];
}
function getPanelGroupElement(id, rootElement = document) {
  var _dataset;
  if (rootElement instanceof HTMLElement && (rootElement === null || rootElement === void 0 ? void 0 : (_dataset = rootElement.dataset) === null || _dataset === void 0 ? void 0 : _dataset.panelGroupId) == id) {
    return rootElement;
  }
  const element = rootElement.querySelector(`[data-panel-group][data-panel-group-id="${id}"]`);
  if (element) {
    return element;
  }
  return null;
}
function getResizeHandleElement(id, scope = document) {
  const element = scope.querySelector(`[${DATA_ATTRIBUTES.resizeHandleId}="${id}"]`);
  if (element) {
    return element;
  }
  return null;
}
function getResizeHandlePanelIds(groupId, handleId, panelsArray, scope = document) {
  var _panelsArray$index$id, _panelsArray$index, _panelsArray$id, _panelsArray;
  const handle = getResizeHandleElement(handleId, scope);
  const handles = getResizeHandleElementsForGroup(groupId, scope);
  const index = handle ? handles.indexOf(handle) : -1;
  const idBefore = (_panelsArray$index$id = (_panelsArray$index = panelsArray[index]) === null || _panelsArray$index === void 0 ? void 0 : _panelsArray$index.id) !== null && _panelsArray$index$id !== void 0 ? _panelsArray$index$id : null;
  const idAfter = (_panelsArray$id = (_panelsArray = panelsArray[index + 1]) === null || _panelsArray === void 0 ? void 0 : _panelsArray.id) !== null && _panelsArray$id !== void 0 ? _panelsArray$id : null;
  return [idBefore, idAfter];
}
function useWindowSplitterPanelGroupBehavior({
  committedValuesRef,
  eagerValuesRef,
  groupId,
  layout,
  panelDataArray,
  panelGroupElement,
  setLayout
}) {
  (0, import_react4.useRef)({
    didWarnAboutMissingResizeHandle: false
  });
  useIsomorphicLayoutEffect2(() => {
    if (!panelGroupElement) {
      return;
    }
    const resizeHandleElements = getResizeHandleElementsForGroup(groupId, panelGroupElement);
    for (let index = 0; index < panelDataArray.length - 1; index++) {
      const {
        valueMax,
        valueMin,
        valueNow
      } = calculateAriaValues({
        layout,
        panelsArray: panelDataArray,
        pivotIndices: [index, index + 1]
      });
      const resizeHandleElement = resizeHandleElements[index];
      if (resizeHandleElement == null) ;
      else {
        const panelData = panelDataArray[index];
        assert(panelData, `No panel data found for index "${index}"`);
        resizeHandleElement.setAttribute("aria-controls", panelData.id);
        resizeHandleElement.setAttribute("aria-valuemax", "" + Math.round(valueMax));
        resizeHandleElement.setAttribute("aria-valuemin", "" + Math.round(valueMin));
        resizeHandleElement.setAttribute("aria-valuenow", valueNow != null ? "" + Math.round(valueNow) : "");
      }
    }
    return () => {
      resizeHandleElements.forEach((resizeHandleElement, index) => {
        resizeHandleElement.removeAttribute("aria-controls");
        resizeHandleElement.removeAttribute("aria-valuemax");
        resizeHandleElement.removeAttribute("aria-valuemin");
        resizeHandleElement.removeAttribute("aria-valuenow");
      });
    };
  }, [groupId, layout, panelDataArray, panelGroupElement]);
  (0, import_react4.useEffect)(() => {
    if (!panelGroupElement) {
      return;
    }
    const eagerValues = eagerValuesRef.current;
    assert(eagerValues, `Eager values not found`);
    const {
      panelDataArray: panelDataArray2
    } = eagerValues;
    const groupElement = getPanelGroupElement(groupId, panelGroupElement);
    assert(groupElement != null, `No group found for id "${groupId}"`);
    const handles = getResizeHandleElementsForGroup(groupId, panelGroupElement);
    assert(handles, `No resize handles found for group id "${groupId}"`);
    const cleanupFunctions = handles.map((handle) => {
      const handleId = handle.getAttribute(DATA_ATTRIBUTES.resizeHandleId);
      assert(handleId, `Resize handle element has no handle id attribute`);
      const [idBefore, idAfter] = getResizeHandlePanelIds(groupId, handleId, panelDataArray2, panelGroupElement);
      if (idBefore == null || idAfter == null) {
        return () => {
        };
      }
      const onKeyDown = (event) => {
        if (event.defaultPrevented) {
          return;
        }
        switch (event.key) {
          case "Enter": {
            event.preventDefault();
            const index = panelDataArray2.findIndex((panelData) => panelData.id === idBefore);
            if (index >= 0) {
              const panelData = panelDataArray2[index];
              assert(panelData, `No panel data found for index ${index}`);
              const size = layout[index];
              const {
                collapsedSize = 0,
                collapsible,
                minSize = 0
              } = panelData.constraints;
              if (size != null && collapsible) {
                const nextLayout = adjustLayoutByDelta({
                  delta: fuzzyNumbersEqual(size, collapsedSize) ? minSize - collapsedSize : collapsedSize - size,
                  initialLayout: layout,
                  panelConstraints: panelDataArray2.map((panelData2) => panelData2.constraints),
                  pivotIndices: determinePivotIndices(groupId, handleId, panelGroupElement),
                  prevLayout: layout,
                  trigger: "keyboard"
                });
                if (layout !== nextLayout) {
                  setLayout(nextLayout);
                }
              }
            }
            break;
          }
        }
      };
      handle.addEventListener("keydown", onKeyDown);
      return () => {
        handle.removeEventListener("keydown", onKeyDown);
      };
    });
    return () => {
      cleanupFunctions.forEach((cleanupFunction) => cleanupFunction());
    };
  }, [panelGroupElement, committedValuesRef, eagerValuesRef, groupId, layout, panelDataArray, setLayout]);
}
function areEqual(arrayA, arrayB) {
  if (arrayA.length !== arrayB.length) {
    return false;
  }
  for (let index = 0; index < arrayA.length; index++) {
    if (arrayA[index] !== arrayB[index]) {
      return false;
    }
  }
  return true;
}
function getResizeEventCursorPosition(direction, event) {
  const isHorizontal = direction === "horizontal";
  const {
    x,
    y
  } = getResizeEventCoordinates(event);
  return isHorizontal ? x : y;
}
function calculateDragOffsetPercentage(event, dragHandleId, direction, initialDragState, panelGroupElement) {
  const isHorizontal = direction === "horizontal";
  const handleElement = getResizeHandleElement(dragHandleId, panelGroupElement);
  assert(handleElement, `No resize handle element found for id "${dragHandleId}"`);
  const groupId = handleElement.getAttribute(DATA_ATTRIBUTES.groupId);
  assert(groupId, `Resize handle element has no group id attribute`);
  let {
    initialCursorPosition
  } = initialDragState;
  const cursorPosition = getResizeEventCursorPosition(direction, event);
  const groupElement = getPanelGroupElement(groupId, panelGroupElement);
  assert(groupElement, `No group element found for id "${groupId}"`);
  const groupRect = groupElement.getBoundingClientRect();
  const groupSizeInPixels = isHorizontal ? groupRect.width : groupRect.height;
  const offsetPixels = cursorPosition - initialCursorPosition;
  const offsetPercentage = offsetPixels / groupSizeInPixels * 100;
  return offsetPercentage;
}
function calculateDeltaPercentage(event, dragHandleId, direction, initialDragState, keyboardResizeBy, panelGroupElement) {
  if (isKeyDown(event)) {
    const isHorizontal = direction === "horizontal";
    let delta = 0;
    if (event.shiftKey) {
      delta = 100;
    } else if (keyboardResizeBy != null) {
      delta = keyboardResizeBy;
    } else {
      delta = 10;
    }
    let movement = 0;
    switch (event.key) {
      case "ArrowDown":
        movement = isHorizontal ? 0 : delta;
        break;
      case "ArrowLeft":
        movement = isHorizontal ? -delta : 0;
        break;
      case "ArrowRight":
        movement = isHorizontal ? delta : 0;
        break;
      case "ArrowUp":
        movement = isHorizontal ? 0 : -delta;
        break;
      case "End":
        movement = 100;
        break;
      case "Home":
        movement = -100;
        break;
    }
    return movement;
  } else {
    if (initialDragState == null) {
      return 0;
    }
    return calculateDragOffsetPercentage(event, dragHandleId, direction, initialDragState, panelGroupElement);
  }
}
function calculateUnsafeDefaultLayout({
  panelDataArray
}) {
  const layout = Array(panelDataArray.length);
  const panelConstraintsArray = panelDataArray.map((panelData) => panelData.constraints);
  let numPanelsWithSizes = 0;
  let remainingSize = 100;
  for (let index = 0; index < panelDataArray.length; index++) {
    const panelConstraints = panelConstraintsArray[index];
    assert(panelConstraints, `Panel constraints not found for index ${index}`);
    const {
      defaultSize
    } = panelConstraints;
    if (defaultSize != null) {
      numPanelsWithSizes++;
      layout[index] = defaultSize;
      remainingSize -= defaultSize;
    }
  }
  for (let index = 0; index < panelDataArray.length; index++) {
    const panelConstraints = panelConstraintsArray[index];
    assert(panelConstraints, `Panel constraints not found for index ${index}`);
    const {
      defaultSize
    } = panelConstraints;
    if (defaultSize != null) {
      continue;
    }
    const numRemainingPanels = panelDataArray.length - numPanelsWithSizes;
    const size = remainingSize / numRemainingPanels;
    numPanelsWithSizes++;
    layout[index] = size;
    remainingSize -= size;
  }
  return layout;
}
function callPanelCallbacks(panelsArray, layout, panelIdToLastNotifiedSizeMap) {
  layout.forEach((size, index) => {
    const panelData = panelsArray[index];
    assert(panelData, `Panel data not found for index ${index}`);
    const {
      callbacks,
      constraints,
      id: panelId
    } = panelData;
    const {
      collapsedSize = 0,
      collapsible
    } = constraints;
    const lastNotifiedSize = panelIdToLastNotifiedSizeMap[panelId];
    if (lastNotifiedSize == null || size !== lastNotifiedSize) {
      panelIdToLastNotifiedSizeMap[panelId] = size;
      const {
        onCollapse,
        onExpand,
        onResize
      } = callbacks;
      if (onResize) {
        onResize(size, lastNotifiedSize);
      }
      if (collapsible && (onCollapse || onExpand)) {
        if (onExpand && (lastNotifiedSize == null || fuzzyNumbersEqual$1(lastNotifiedSize, collapsedSize)) && !fuzzyNumbersEqual$1(size, collapsedSize)) {
          onExpand();
        }
        if (onCollapse && (lastNotifiedSize == null || !fuzzyNumbersEqual$1(lastNotifiedSize, collapsedSize)) && fuzzyNumbersEqual$1(size, collapsedSize)) {
          onCollapse();
        }
      }
    }
  });
}
function compareLayouts(a, b) {
  if (a.length !== b.length) {
    return false;
  } else {
    for (let index = 0; index < a.length; index++) {
      if (a[index] != b[index]) {
        return false;
      }
    }
  }
  return true;
}
function computePanelFlexBoxStyle({
  defaultSize,
  dragState,
  layout,
  panelData,
  panelIndex,
  precision = 3
}) {
  const size = layout[panelIndex];
  let flexGrow;
  if (size == null) {
    flexGrow = defaultSize != void 0 ? defaultSize.toPrecision(precision) : "1";
  } else if (panelData.length === 1) {
    flexGrow = "1";
  } else {
    flexGrow = size.toPrecision(precision);
  }
  return {
    flexBasis: 0,
    flexGrow,
    flexShrink: 1,
    // Without this, Panel sizes may be unintentionally overridden by their content
    overflow: "hidden",
    // Disable pointer events inside of a panel during resize
    // This avoid edge cases like nested iframes
    pointerEvents: dragState !== null ? "none" : void 0
  };
}
function debounce2(callback, durationMs = 10) {
  let timeoutId = null;
  let callable = (...args) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      callback(...args);
    }, durationMs);
  };
  return callable;
}
function initializeDefaultStorage(storageObject) {
  try {
    if (typeof localStorage !== "undefined") {
      storageObject.getItem = (name) => {
        return localStorage.getItem(name);
      };
      storageObject.setItem = (name, value) => {
        localStorage.setItem(name, value);
      };
    } else {
      throw new Error("localStorage not supported in this environment");
    }
  } catch (error) {
    console.error(error);
    storageObject.getItem = () => null;
    storageObject.setItem = () => {
    };
  }
}
function getPanelGroupKey(autoSaveId) {
  return `react-resizable-panels:${autoSaveId}`;
}
function getPanelKey(panels) {
  return panels.map((panel) => {
    const {
      constraints,
      id,
      idIsFromProps,
      order
    } = panel;
    if (idIsFromProps) {
      return id;
    } else {
      return order ? `${order}:${JSON.stringify(constraints)}` : JSON.stringify(constraints);
    }
  }).sort((a, b) => a.localeCompare(b)).join(",");
}
function loadSerializedPanelGroupState(autoSaveId, storage) {
  try {
    const panelGroupKey = getPanelGroupKey(autoSaveId);
    const serialized = storage.getItem(panelGroupKey);
    if (serialized) {
      const parsed = JSON.parse(serialized);
      if (typeof parsed === "object" && parsed != null) {
        return parsed;
      }
    }
  } catch (error) {
  }
  return null;
}
function loadPanelGroupState(autoSaveId, panels, storage) {
  var _loadSerializedPanelG, _state$panelKey;
  const state = (_loadSerializedPanelG = loadSerializedPanelGroupState(autoSaveId, storage)) !== null && _loadSerializedPanelG !== void 0 ? _loadSerializedPanelG : {};
  const panelKey = getPanelKey(panels);
  return (_state$panelKey = state[panelKey]) !== null && _state$panelKey !== void 0 ? _state$panelKey : null;
}
function savePanelGroupState(autoSaveId, panels, panelSizesBeforeCollapse, sizes, storage) {
  var _loadSerializedPanelG2;
  const panelGroupKey = getPanelGroupKey(autoSaveId);
  const panelKey = getPanelKey(panels);
  const state = (_loadSerializedPanelG2 = loadSerializedPanelGroupState(autoSaveId, storage)) !== null && _loadSerializedPanelG2 !== void 0 ? _loadSerializedPanelG2 : {};
  state[panelKey] = {
    expandToSizes: Object.fromEntries(panelSizesBeforeCollapse.entries()),
    layout: sizes
  };
  try {
    storage.setItem(panelGroupKey, JSON.stringify(state));
  } catch (error) {
    console.error(error);
  }
}
function validatePanelGroupLayout({
  layout: prevLayout,
  panelConstraints
}) {
  const nextLayout = [...prevLayout];
  const nextLayoutTotalSize = nextLayout.reduce((accumulated, current) => accumulated + current, 0);
  if (nextLayout.length !== panelConstraints.length) {
    throw Error(`Invalid ${panelConstraints.length} panel layout: ${nextLayout.map((size) => `${size}%`).join(", ")}`);
  } else if (!fuzzyNumbersEqual(nextLayoutTotalSize, 100) && nextLayout.length > 0) {
    for (let index = 0; index < panelConstraints.length; index++) {
      const unsafeSize = nextLayout[index];
      assert(unsafeSize != null, `No layout data found for index ${index}`);
      const safeSize = 100 / nextLayoutTotalSize * unsafeSize;
      nextLayout[index] = safeSize;
    }
  }
  let remainingSize = 0;
  for (let index = 0; index < panelConstraints.length; index++) {
    const unsafeSize = nextLayout[index];
    assert(unsafeSize != null, `No layout data found for index ${index}`);
    const safeSize = resizePanel({
      panelConstraints,
      panelIndex: index,
      size: unsafeSize
    });
    if (unsafeSize != safeSize) {
      remainingSize += unsafeSize - safeSize;
      nextLayout[index] = safeSize;
    }
  }
  if (!fuzzyNumbersEqual(remainingSize, 0)) {
    for (let index = 0; index < panelConstraints.length; index++) {
      const prevSize = nextLayout[index];
      assert(prevSize != null, `No layout data found for index ${index}`);
      const unsafeSize = prevSize + remainingSize;
      const safeSize = resizePanel({
        panelConstraints,
        panelIndex: index,
        size: unsafeSize
      });
      if (prevSize !== safeSize) {
        remainingSize -= safeSize - prevSize;
        nextLayout[index] = safeSize;
        if (fuzzyNumbersEqual(remainingSize, 0)) {
          break;
        }
      }
    }
  }
  return nextLayout;
}
var LOCAL_STORAGE_DEBOUNCE_INTERVAL = 100;
var defaultStorage = {
  getItem: (name) => {
    initializeDefaultStorage(defaultStorage);
    return defaultStorage.getItem(name);
  },
  setItem: (name, value) => {
    initializeDefaultStorage(defaultStorage);
    defaultStorage.setItem(name, value);
  }
};
var debounceMap = {};
function PanelGroupWithForwardedRef({
  autoSaveId = null,
  children,
  className: classNameFromProps = "",
  direction,
  forwardedRef,
  id: idFromProps = null,
  onLayout = null,
  keyboardResizeBy = null,
  storage = defaultStorage,
  style: styleFromProps,
  tagName: Type = "div",
  ...rest
}) {
  const groupId = useUniqueId(idFromProps);
  const panelGroupElementRef = (0, import_react4.useRef)(null);
  const [dragState, setDragState] = (0, import_react4.useState)(null);
  const [layout, setLayout] = (0, import_react4.useState)([]);
  const forceUpdate = useForceUpdate();
  const panelIdToLastNotifiedSizeMapRef = (0, import_react4.useRef)({});
  const panelSizeBeforeCollapseRef = (0, import_react4.useRef)(/* @__PURE__ */ new Map());
  const prevDeltaRef = (0, import_react4.useRef)(0);
  const committedValuesRef = (0, import_react4.useRef)({
    autoSaveId,
    direction,
    dragState,
    id: groupId,
    keyboardResizeBy,
    onLayout,
    storage
  });
  const eagerValuesRef = (0, import_react4.useRef)({
    layout,
    panelDataArray: [],
    panelDataArrayChanged: false
  });
  (0, import_react4.useRef)({
    didLogIdAndOrderWarning: false,
    didLogPanelConstraintsWarning: false,
    prevPanelIds: []
  });
  (0, import_react4.useImperativeHandle)(forwardedRef, () => ({
    getId: () => committedValuesRef.current.id,
    getLayout: () => {
      const {
        layout: layout2
      } = eagerValuesRef.current;
      return layout2;
    },
    setLayout: (unsafeLayout) => {
      const {
        onLayout: onLayout2
      } = committedValuesRef.current;
      const {
        layout: prevLayout,
        panelDataArray
      } = eagerValuesRef.current;
      const safeLayout = validatePanelGroupLayout({
        layout: unsafeLayout,
        panelConstraints: panelDataArray.map((panelData) => panelData.constraints)
      });
      if (!areEqual(prevLayout, safeLayout)) {
        setLayout(safeLayout);
        eagerValuesRef.current.layout = safeLayout;
        if (onLayout2) {
          onLayout2(safeLayout);
        }
        callPanelCallbacks(panelDataArray, safeLayout, panelIdToLastNotifiedSizeMapRef.current);
      }
    }
  }), []);
  useIsomorphicLayoutEffect2(() => {
    committedValuesRef.current.autoSaveId = autoSaveId;
    committedValuesRef.current.direction = direction;
    committedValuesRef.current.dragState = dragState;
    committedValuesRef.current.id = groupId;
    committedValuesRef.current.onLayout = onLayout;
    committedValuesRef.current.storage = storage;
  });
  useWindowSplitterPanelGroupBehavior({
    committedValuesRef,
    eagerValuesRef,
    groupId,
    layout,
    panelDataArray: eagerValuesRef.current.panelDataArray,
    setLayout,
    panelGroupElement: panelGroupElementRef.current
  });
  (0, import_react4.useEffect)(() => {
    const {
      panelDataArray
    } = eagerValuesRef.current;
    if (autoSaveId) {
      if (layout.length === 0 || layout.length !== panelDataArray.length) {
        return;
      }
      let debouncedSave = debounceMap[autoSaveId];
      if (debouncedSave == null) {
        debouncedSave = debounce2(savePanelGroupState, LOCAL_STORAGE_DEBOUNCE_INTERVAL);
        debounceMap[autoSaveId] = debouncedSave;
      }
      const clonedPanelDataArray = [...panelDataArray];
      const clonedPanelSizesBeforeCollapse = new Map(panelSizeBeforeCollapseRef.current);
      debouncedSave(autoSaveId, clonedPanelDataArray, clonedPanelSizesBeforeCollapse, layout, storage);
    }
  }, [autoSaveId, layout, storage]);
  (0, import_react4.useEffect)(() => {
  });
  const collapsePanel = (0, import_react4.useCallback)((panelData) => {
    const {
      onLayout: onLayout2
    } = committedValuesRef.current;
    const {
      layout: prevLayout,
      panelDataArray
    } = eagerValuesRef.current;
    if (panelData.constraints.collapsible) {
      const panelConstraintsArray = panelDataArray.map((panelData2) => panelData2.constraints);
      const {
        collapsedSize = 0,
        panelSize,
        pivotIndices
      } = panelDataHelper(panelDataArray, panelData, prevLayout);
      assert(panelSize != null, `Panel size not found for panel "${panelData.id}"`);
      if (!fuzzyNumbersEqual$1(panelSize, collapsedSize)) {
        panelSizeBeforeCollapseRef.current.set(panelData.id, panelSize);
        const isLastPanel = findPanelDataIndex(panelDataArray, panelData) === panelDataArray.length - 1;
        const delta = isLastPanel ? panelSize - collapsedSize : collapsedSize - panelSize;
        const nextLayout = adjustLayoutByDelta({
          delta,
          initialLayout: prevLayout,
          panelConstraints: panelConstraintsArray,
          pivotIndices,
          prevLayout,
          trigger: "imperative-api"
        });
        if (!compareLayouts(prevLayout, nextLayout)) {
          setLayout(nextLayout);
          eagerValuesRef.current.layout = nextLayout;
          if (onLayout2) {
            onLayout2(nextLayout);
          }
          callPanelCallbacks(panelDataArray, nextLayout, panelIdToLastNotifiedSizeMapRef.current);
        }
      }
    }
  }, []);
  const expandPanel = (0, import_react4.useCallback)((panelData, minSizeOverride) => {
    const {
      onLayout: onLayout2
    } = committedValuesRef.current;
    const {
      layout: prevLayout,
      panelDataArray
    } = eagerValuesRef.current;
    if (panelData.constraints.collapsible) {
      const panelConstraintsArray = panelDataArray.map((panelData2) => panelData2.constraints);
      const {
        collapsedSize = 0,
        panelSize = 0,
        minSize: minSizeFromProps = 0,
        pivotIndices
      } = panelDataHelper(panelDataArray, panelData, prevLayout);
      const minSize = minSizeOverride !== null && minSizeOverride !== void 0 ? minSizeOverride : minSizeFromProps;
      if (fuzzyNumbersEqual$1(panelSize, collapsedSize)) {
        const prevPanelSize = panelSizeBeforeCollapseRef.current.get(panelData.id);
        const baseSize = prevPanelSize != null && prevPanelSize >= minSize ? prevPanelSize : minSize;
        const isLastPanel = findPanelDataIndex(panelDataArray, panelData) === panelDataArray.length - 1;
        const delta = isLastPanel ? panelSize - baseSize : baseSize - panelSize;
        const nextLayout = adjustLayoutByDelta({
          delta,
          initialLayout: prevLayout,
          panelConstraints: panelConstraintsArray,
          pivotIndices,
          prevLayout,
          trigger: "imperative-api"
        });
        if (!compareLayouts(prevLayout, nextLayout)) {
          setLayout(nextLayout);
          eagerValuesRef.current.layout = nextLayout;
          if (onLayout2) {
            onLayout2(nextLayout);
          }
          callPanelCallbacks(panelDataArray, nextLayout, panelIdToLastNotifiedSizeMapRef.current);
        }
      }
    }
  }, []);
  const getPanelSize = (0, import_react4.useCallback)((panelData) => {
    const {
      layout: layout2,
      panelDataArray
    } = eagerValuesRef.current;
    const {
      panelSize
    } = panelDataHelper(panelDataArray, panelData, layout2);
    assert(panelSize != null, `Panel size not found for panel "${panelData.id}"`);
    return panelSize;
  }, []);
  const getPanelStyle = (0, import_react4.useCallback)((panelData, defaultSize) => {
    const {
      panelDataArray
    } = eagerValuesRef.current;
    const panelIndex = findPanelDataIndex(panelDataArray, panelData);
    return computePanelFlexBoxStyle({
      defaultSize,
      dragState,
      layout,
      panelData: panelDataArray,
      panelIndex
    });
  }, [dragState, layout]);
  const isPanelCollapsed = (0, import_react4.useCallback)((panelData) => {
    const {
      layout: layout2,
      panelDataArray
    } = eagerValuesRef.current;
    const {
      collapsedSize = 0,
      collapsible,
      panelSize
    } = panelDataHelper(panelDataArray, panelData, layout2);
    assert(panelSize != null, `Panel size not found for panel "${panelData.id}"`);
    return collapsible === true && fuzzyNumbersEqual$1(panelSize, collapsedSize);
  }, []);
  const isPanelExpanded = (0, import_react4.useCallback)((panelData) => {
    const {
      layout: layout2,
      panelDataArray
    } = eagerValuesRef.current;
    const {
      collapsedSize = 0,
      collapsible,
      panelSize
    } = panelDataHelper(panelDataArray, panelData, layout2);
    assert(panelSize != null, `Panel size not found for panel "${panelData.id}"`);
    return !collapsible || fuzzyCompareNumbers(panelSize, collapsedSize) > 0;
  }, []);
  const registerPanel = (0, import_react4.useCallback)((panelData) => {
    const {
      panelDataArray
    } = eagerValuesRef.current;
    panelDataArray.push(panelData);
    panelDataArray.sort((panelA, panelB) => {
      const orderA = panelA.order;
      const orderB = panelB.order;
      if (orderA == null && orderB == null) {
        return 0;
      } else if (orderA == null) {
        return -1;
      } else if (orderB == null) {
        return 1;
      } else {
        return orderA - orderB;
      }
    });
    eagerValuesRef.current.panelDataArrayChanged = true;
    forceUpdate();
  }, [forceUpdate]);
  useIsomorphicLayoutEffect2(() => {
    if (eagerValuesRef.current.panelDataArrayChanged) {
      eagerValuesRef.current.panelDataArrayChanged = false;
      const {
        autoSaveId: autoSaveId2,
        onLayout: onLayout2,
        storage: storage2
      } = committedValuesRef.current;
      const {
        layout: prevLayout,
        panelDataArray
      } = eagerValuesRef.current;
      let unsafeLayout = null;
      if (autoSaveId2) {
        const state = loadPanelGroupState(autoSaveId2, panelDataArray, storage2);
        if (state) {
          panelSizeBeforeCollapseRef.current = new Map(Object.entries(state.expandToSizes));
          unsafeLayout = state.layout;
        }
      }
      if (unsafeLayout == null) {
        unsafeLayout = calculateUnsafeDefaultLayout({
          panelDataArray
        });
      }
      const nextLayout = validatePanelGroupLayout({
        layout: unsafeLayout,
        panelConstraints: panelDataArray.map((panelData) => panelData.constraints)
      });
      if (!areEqual(prevLayout, nextLayout)) {
        setLayout(nextLayout);
        eagerValuesRef.current.layout = nextLayout;
        if (onLayout2) {
          onLayout2(nextLayout);
        }
        callPanelCallbacks(panelDataArray, nextLayout, panelIdToLastNotifiedSizeMapRef.current);
      }
    }
  });
  useIsomorphicLayoutEffect2(() => {
    const eagerValues = eagerValuesRef.current;
    return () => {
      eagerValues.layout = [];
    };
  }, []);
  const registerResizeHandle2 = (0, import_react4.useCallback)((dragHandleId) => {
    let isRTL = false;
    const panelGroupElement = panelGroupElementRef.current;
    if (panelGroupElement) {
      const style2 = window.getComputedStyle(panelGroupElement, null);
      if (style2.getPropertyValue("direction") === "rtl") {
        isRTL = true;
      }
    }
    return function resizeHandler(event) {
      event.preventDefault();
      const panelGroupElement2 = panelGroupElementRef.current;
      if (!panelGroupElement2) {
        return () => null;
      }
      const {
        direction: direction2,
        dragState: dragState2,
        id: groupId2,
        keyboardResizeBy: keyboardResizeBy2,
        onLayout: onLayout2
      } = committedValuesRef.current;
      const {
        layout: prevLayout,
        panelDataArray
      } = eagerValuesRef.current;
      const {
        initialLayout
      } = dragState2 !== null && dragState2 !== void 0 ? dragState2 : {};
      const pivotIndices = determinePivotIndices(groupId2, dragHandleId, panelGroupElement2);
      let delta = calculateDeltaPercentage(event, dragHandleId, direction2, dragState2, keyboardResizeBy2, panelGroupElement2);
      const isHorizontal = direction2 === "horizontal";
      if (isHorizontal && isRTL) {
        delta = -delta;
      }
      const panelConstraints = panelDataArray.map((panelData) => panelData.constraints);
      const nextLayout = adjustLayoutByDelta({
        delta,
        initialLayout: initialLayout !== null && initialLayout !== void 0 ? initialLayout : prevLayout,
        panelConstraints,
        pivotIndices,
        prevLayout,
        trigger: isKeyDown(event) ? "keyboard" : "mouse-or-touch"
      });
      const layoutChanged = !compareLayouts(prevLayout, nextLayout);
      if (isPointerEvent(event) || isMouseEvent(event)) {
        if (prevDeltaRef.current != delta) {
          prevDeltaRef.current = delta;
          if (!layoutChanged && delta !== 0) {
            if (isHorizontal) {
              reportConstraintsViolation(dragHandleId, delta < 0 ? EXCEEDED_HORIZONTAL_MIN : EXCEEDED_HORIZONTAL_MAX);
            } else {
              reportConstraintsViolation(dragHandleId, delta < 0 ? EXCEEDED_VERTICAL_MIN : EXCEEDED_VERTICAL_MAX);
            }
          } else {
            reportConstraintsViolation(dragHandleId, 0);
          }
        }
      }
      if (layoutChanged) {
        setLayout(nextLayout);
        eagerValuesRef.current.layout = nextLayout;
        if (onLayout2) {
          onLayout2(nextLayout);
        }
        callPanelCallbacks(panelDataArray, nextLayout, panelIdToLastNotifiedSizeMapRef.current);
      }
    };
  }, []);
  const resizePanel2 = (0, import_react4.useCallback)((panelData, unsafePanelSize) => {
    const {
      onLayout: onLayout2
    } = committedValuesRef.current;
    const {
      layout: prevLayout,
      panelDataArray
    } = eagerValuesRef.current;
    const panelConstraintsArray = panelDataArray.map((panelData2) => panelData2.constraints);
    const {
      panelSize,
      pivotIndices
    } = panelDataHelper(panelDataArray, panelData, prevLayout);
    assert(panelSize != null, `Panel size not found for panel "${panelData.id}"`);
    const isLastPanel = findPanelDataIndex(panelDataArray, panelData) === panelDataArray.length - 1;
    const delta = isLastPanel ? panelSize - unsafePanelSize : unsafePanelSize - panelSize;
    const nextLayout = adjustLayoutByDelta({
      delta,
      initialLayout: prevLayout,
      panelConstraints: panelConstraintsArray,
      pivotIndices,
      prevLayout,
      trigger: "imperative-api"
    });
    if (!compareLayouts(prevLayout, nextLayout)) {
      setLayout(nextLayout);
      eagerValuesRef.current.layout = nextLayout;
      if (onLayout2) {
        onLayout2(nextLayout);
      }
      callPanelCallbacks(panelDataArray, nextLayout, panelIdToLastNotifiedSizeMapRef.current);
    }
  }, []);
  const reevaluatePanelConstraints = (0, import_react4.useCallback)((panelData, prevConstraints) => {
    const {
      layout: layout2,
      panelDataArray
    } = eagerValuesRef.current;
    const {
      collapsedSize: prevCollapsedSize = 0,
      collapsible: prevCollapsible
    } = prevConstraints;
    const {
      collapsedSize: nextCollapsedSize = 0,
      collapsible: nextCollapsible,
      maxSize: nextMaxSize = 100,
      minSize: nextMinSize = 0
    } = panelData.constraints;
    const {
      panelSize: prevPanelSize
    } = panelDataHelper(panelDataArray, panelData, layout2);
    if (prevPanelSize == null) {
      return;
    }
    if (prevCollapsible && nextCollapsible && fuzzyNumbersEqual$1(prevPanelSize, prevCollapsedSize)) {
      if (!fuzzyNumbersEqual$1(prevCollapsedSize, nextCollapsedSize)) {
        resizePanel2(panelData, nextCollapsedSize);
      }
    } else if (prevPanelSize < nextMinSize) {
      resizePanel2(panelData, nextMinSize);
    } else if (prevPanelSize > nextMaxSize) {
      resizePanel2(panelData, nextMaxSize);
    }
  }, [resizePanel2]);
  const startDragging = (0, import_react4.useCallback)((dragHandleId, event) => {
    const {
      direction: direction2
    } = committedValuesRef.current;
    const {
      layout: layout2
    } = eagerValuesRef.current;
    if (!panelGroupElementRef.current) {
      return;
    }
    const handleElement = getResizeHandleElement(dragHandleId, panelGroupElementRef.current);
    assert(handleElement, `Drag handle element not found for id "${dragHandleId}"`);
    const initialCursorPosition = getResizeEventCursorPosition(direction2, event);
    setDragState({
      dragHandleId,
      dragHandleRect: handleElement.getBoundingClientRect(),
      initialCursorPosition,
      initialLayout: layout2
    });
  }, []);
  const stopDragging = (0, import_react4.useCallback)(() => {
    setDragState(null);
  }, []);
  const unregisterPanel = (0, import_react4.useCallback)((panelData) => {
    const {
      panelDataArray
    } = eagerValuesRef.current;
    const index = findPanelDataIndex(panelDataArray, panelData);
    if (index >= 0) {
      panelDataArray.splice(index, 1);
      delete panelIdToLastNotifiedSizeMapRef.current[panelData.id];
      eagerValuesRef.current.panelDataArrayChanged = true;
      forceUpdate();
    }
  }, [forceUpdate]);
  const context = (0, import_react4.useMemo)(() => ({
    collapsePanel,
    direction,
    dragState,
    expandPanel,
    getPanelSize,
    getPanelStyle,
    groupId,
    isPanelCollapsed,
    isPanelExpanded,
    reevaluatePanelConstraints,
    registerPanel,
    registerResizeHandle: registerResizeHandle2,
    resizePanel: resizePanel2,
    startDragging,
    stopDragging,
    unregisterPanel,
    panelGroupElement: panelGroupElementRef.current
  }), [collapsePanel, dragState, direction, expandPanel, getPanelSize, getPanelStyle, groupId, isPanelCollapsed, isPanelExpanded, reevaluatePanelConstraints, registerPanel, registerResizeHandle2, resizePanel2, startDragging, stopDragging, unregisterPanel]);
  const style = {
    display: "flex",
    flexDirection: direction === "horizontal" ? "row" : "column",
    height: "100%",
    overflow: "hidden",
    width: "100%"
  };
  return (0, import_react4.createElement)(PanelGroupContext.Provider, {
    value: context
  }, (0, import_react4.createElement)(Type, {
    ...rest,
    children,
    className: classNameFromProps,
    id: idFromProps,
    ref: panelGroupElementRef,
    style: {
      ...style,
      ...styleFromProps
    },
    // CSS selectors
    [DATA_ATTRIBUTES.group]: "",
    [DATA_ATTRIBUTES.groupDirection]: direction,
    [DATA_ATTRIBUTES.groupId]: groupId
  }));
}
var PanelGroup = (0, import_react4.forwardRef)((props2, ref) => (0, import_react4.createElement)(PanelGroupWithForwardedRef, {
  ...props2,
  forwardedRef: ref
}));
PanelGroupWithForwardedRef.displayName = "PanelGroup";
PanelGroup.displayName = "forwardRef(PanelGroup)";
function findPanelDataIndex(panelDataArray, panelData) {
  return panelDataArray.findIndex((prevPanelData) => prevPanelData === panelData || prevPanelData.id === panelData.id);
}
function panelDataHelper(panelDataArray, panelData, layout) {
  const panelIndex = findPanelDataIndex(panelDataArray, panelData);
  const isLastPanel = panelIndex === panelDataArray.length - 1;
  const pivotIndices = isLastPanel ? [panelIndex - 1, panelIndex] : [panelIndex, panelIndex + 1];
  const panelSize = layout[panelIndex];
  return {
    ...panelData.constraints,
    panelSize,
    pivotIndices
  };
}
function useWindowSplitterResizeHandlerBehavior({
  disabled,
  handleId,
  resizeHandler,
  panelGroupElement
}) {
  (0, import_react4.useEffect)(() => {
    if (disabled || resizeHandler == null || panelGroupElement == null) {
      return;
    }
    const handleElement = getResizeHandleElement(handleId, panelGroupElement);
    if (handleElement == null) {
      return;
    }
    const onKeyDown = (event) => {
      if (event.defaultPrevented) {
        return;
      }
      switch (event.key) {
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "End":
        case "Home": {
          event.preventDefault();
          resizeHandler(event);
          break;
        }
        case "F6": {
          event.preventDefault();
          const groupId = handleElement.getAttribute(DATA_ATTRIBUTES.groupId);
          assert(groupId, `No group element found for id "${groupId}"`);
          const handles = getResizeHandleElementsForGroup(groupId, panelGroupElement);
          const index = getResizeHandleElementIndex(groupId, handleId, panelGroupElement);
          assert(index !== null, `No resize element found for id "${handleId}"`);
          const nextIndex = event.shiftKey ? index > 0 ? index - 1 : handles.length - 1 : index + 1 < handles.length ? index + 1 : 0;
          const nextHandle = handles[nextIndex];
          nextHandle.focus();
          break;
        }
      }
    };
    handleElement.addEventListener("keydown", onKeyDown);
    return () => {
      handleElement.removeEventListener("keydown", onKeyDown);
    };
  }, [panelGroupElement, disabled, handleId, resizeHandler]);
}
function PanelResizeHandle({
  children = null,
  className: classNameFromProps = "",
  disabled = false,
  hitAreaMargins,
  id: idFromProps,
  onBlur,
  onClick,
  onDragging,
  onFocus,
  onPointerDown,
  onPointerUp,
  style: styleFromProps = {},
  tabIndex = 0,
  tagName: Type = "div",
  ...rest
}) {
  var _hitAreaMargins$coars, _hitAreaMargins$fine;
  const elementRef = (0, import_react4.useRef)(null);
  const callbacksRef = (0, import_react4.useRef)({
    onClick,
    onDragging,
    onPointerDown,
    onPointerUp
  });
  (0, import_react4.useEffect)(() => {
    callbacksRef.current.onClick = onClick;
    callbacksRef.current.onDragging = onDragging;
    callbacksRef.current.onPointerDown = onPointerDown;
    callbacksRef.current.onPointerUp = onPointerUp;
  });
  const panelGroupContext = (0, import_react4.useContext)(PanelGroupContext);
  if (panelGroupContext === null) {
    throw Error(`PanelResizeHandle components must be rendered within a PanelGroup container`);
  }
  const {
    direction,
    groupId,
    registerResizeHandle: registerResizeHandleWithParentGroup,
    startDragging,
    stopDragging,
    panelGroupElement
  } = panelGroupContext;
  const resizeHandleId = useUniqueId(idFromProps);
  const [state, setState] = (0, import_react4.useState)("inactive");
  const [isFocused, setIsFocused] = (0, import_react4.useState)(false);
  const [resizeHandler, setResizeHandler] = (0, import_react4.useState)(null);
  const committedValuesRef = (0, import_react4.useRef)({
    state
  });
  useIsomorphicLayoutEffect2(() => {
    committedValuesRef.current.state = state;
  });
  (0, import_react4.useEffect)(() => {
    if (disabled) {
      setResizeHandler(null);
    } else {
      const resizeHandler2 = registerResizeHandleWithParentGroup(resizeHandleId);
      setResizeHandler(() => resizeHandler2);
    }
  }, [disabled, resizeHandleId, registerResizeHandleWithParentGroup]);
  const coarseHitAreaMargins = (_hitAreaMargins$coars = hitAreaMargins === null || hitAreaMargins === void 0 ? void 0 : hitAreaMargins.coarse) !== null && _hitAreaMargins$coars !== void 0 ? _hitAreaMargins$coars : 15;
  const fineHitAreaMargins = (_hitAreaMargins$fine = hitAreaMargins === null || hitAreaMargins === void 0 ? void 0 : hitAreaMargins.fine) !== null && _hitAreaMargins$fine !== void 0 ? _hitAreaMargins$fine : 5;
  (0, import_react4.useEffect)(() => {
    if (disabled || resizeHandler == null) {
      return;
    }
    const element = elementRef.current;
    assert(element, "Element ref not attached");
    let didMove = false;
    const setResizeHandlerState = (action, isActive, event) => {
      if (!isActive) {
        setState("inactive");
        return;
      }
      switch (action) {
        case "down": {
          setState("drag");
          didMove = false;
          assert(event, 'Expected event to be defined for "down" action');
          startDragging(resizeHandleId, event);
          const {
            onDragging: onDragging2,
            onPointerDown: onPointerDown2
          } = callbacksRef.current;
          onDragging2 === null || onDragging2 === void 0 ? void 0 : onDragging2(true);
          onPointerDown2 === null || onPointerDown2 === void 0 ? void 0 : onPointerDown2();
          break;
        }
        case "move": {
          const {
            state: state2
          } = committedValuesRef.current;
          didMove = true;
          if (state2 !== "drag") {
            setState("hover");
          }
          assert(event, 'Expected event to be defined for "move" action');
          resizeHandler(event);
          break;
        }
        case "up": {
          setState("hover");
          stopDragging();
          const {
            onClick: onClick2,
            onDragging: onDragging2,
            onPointerUp: onPointerUp2
          } = callbacksRef.current;
          onDragging2 === null || onDragging2 === void 0 ? void 0 : onDragging2(false);
          onPointerUp2 === null || onPointerUp2 === void 0 ? void 0 : onPointerUp2();
          if (!didMove) {
            onClick2 === null || onClick2 === void 0 ? void 0 : onClick2();
          }
          break;
        }
      }
    };
    return registerResizeHandle(resizeHandleId, element, direction, {
      coarse: coarseHitAreaMargins,
      fine: fineHitAreaMargins
    }, setResizeHandlerState);
  }, [coarseHitAreaMargins, direction, disabled, fineHitAreaMargins, registerResizeHandleWithParentGroup, resizeHandleId, resizeHandler, startDragging, stopDragging]);
  useWindowSplitterResizeHandlerBehavior({
    disabled,
    handleId: resizeHandleId,
    resizeHandler,
    panelGroupElement
  });
  const style = {
    touchAction: "none",
    userSelect: "none"
  };
  return (0, import_react4.createElement)(Type, {
    ...rest,
    children,
    className: classNameFromProps,
    id: idFromProps,
    onBlur: () => {
      setIsFocused(false);
      onBlur === null || onBlur === void 0 ? void 0 : onBlur();
    },
    onFocus: () => {
      setIsFocused(true);
      onFocus === null || onFocus === void 0 ? void 0 : onFocus();
    },
    ref: elementRef,
    role: "separator",
    style: {
      ...style,
      ...styleFromProps
    },
    tabIndex,
    // CSS selectors
    [DATA_ATTRIBUTES.groupDirection]: direction,
    [DATA_ATTRIBUTES.groupId]: groupId,
    [DATA_ATTRIBUTES.resizeHandle]: "",
    [DATA_ATTRIBUTES.resizeHandleActive]: state === "drag" ? "pointer" : isFocused ? "keyboard" : void 0,
    [DATA_ATTRIBUTES.resizeHandleEnabled]: !disabled,
    [DATA_ATTRIBUTES.resizeHandleId]: resizeHandleId,
    [DATA_ATTRIBUTES.resizeHandleState]: state
  });
}
PanelResizeHandle.displayName = "PanelResizeHandle";

// src/http-packet.ts
var BINARY_PREFIXES = [
  "image/",
  "audio/",
  "video/",
  "font/",
  "application/pdf",
  "application/zip",
  "application/gzip",
  "application/x-gzip",
  "application/octet-stream",
  "application/x-tar",
  "application/wasm",
  "application/x-protobuf"
];
function normalizeNewlines(raw) {
  return (raw ?? "").replace(/\r\n?/g, "\n");
}
function detectSide(startLine) {
  if (/^HTTP(?:\/[\d.]+)?\s+\d{3}\b/i.test(startLine)) return "response";
  if (/^[A-Z][A-Z0-9-]*\s+\S+/.test(startLine)) return "request";
  return "unknown";
}
function parseHttpPacket(rawInput) {
  const raw = normalizeNewlines(rawInput);
  const boundary = raw.indexOf("\n\n");
  const head = boundary < 0 ? raw : raw.slice(0, boundary);
  const body = boundary < 0 ? "" : raw.slice(boundary + 2);
  const lines = head.split("\n");
  const startLine = (lines[0] ?? "").trim();
  const headers = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const previous = headers[headers.length - 1];
    if (/^[ \t]/.test(line) && previous) {
      previous.value = `${previous.value} ${line.trim()}`;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon <= 0) {
      headers.push({ name: "", value: line });
      continue;
    }
    headers.push({ name: line.slice(0, colon), value: line.slice(colon + 1).replace(/^[ \t]+/, "") });
  }
  return { side: detectSide(startLine), startLine, headers, body, raw };
}
function packetHeader(packet, name) {
  const lower = name.toLowerCase();
  return packet.headers.find((entry) => entry.name.toLowerCase() === lower)?.value ?? "";
}
function looksLikeJson(body) {
  const trimmed = body.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}
function detectBodyKind(contentType, body) {
  const ct = (contentType || "").toLowerCase();
  if (!body.trim()) return "text";
  if (ct.includes("json") || ct.includes("+json")) return "json";
  if (ct.includes("html")) return "html";
  if (ct.includes("xml") || ct.includes("+xml")) return "xml";
  if (ct.includes("x-www-form-urlencoded")) return "form";
  if (ct.includes("multipart/")) return "multipart";
  if (ct.includes("css")) return "css";
  if (ct.includes("javascript") || ct.includes("ecmascript")) return "js";
  if (BINARY_PREFIXES.some((prefix) => ct.startsWith(prefix))) return "binary";
  const trimmed = body.trimStart();
  if (trimmed.startsWith("<")) {
    const head = trimmed.slice(0, 64).toLowerCase();
    return head.startsWith("<!doctype html") || head.startsWith("<html") ? "html" : "xml";
  }
  if (looksLikeJson(body)) return "json";
  return "text";
}
function prettyJsonBody(body) {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}
function tokenizeQuery(query2) {
  const tokens = [{ text: "?", tone: "punct" }];
  query2.slice(1).split("&").forEach((part, index) => {
    if (index > 0) tokens.push({ text: "&", tone: "punct" });
    if (!part) return;
    const eq = part.indexOf("=");
    if (eq < 0) {
      tokens.push({ text: part, tone: "query-key" });
      return;
    }
    tokens.push({ text: part.slice(0, eq), tone: "query-key" });
    tokens.push({ text: "=", tone: "punct" });
    tokens.push({ text: part.slice(eq + 1), tone: "query-value" });
  });
  return tokens;
}
function tokenizeUrl(url) {
  const tokens = [];
  const match = /^([a-zA-Z][\w+.-]*:\/\/)?([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/.exec(url);
  if (!match) return [{ text: url, tone: "url" }];
  const [, scheme = "", authority = "", path = "", query2 = "", hash = ""] = match;
  if (scheme) tokens.push({ text: scheme, tone: "muted" });
  if (authority) tokens.push({ text: authority, tone: "url" });
  if (path) tokens.push({ text: path, tone: "value" });
  if (query2) tokens.push(...tokenizeQuery(query2));
  if (hash) tokens.push({ text: hash, tone: "muted" });
  return tokens;
}
function tokenizeStartLine(packet, side = packet.side) {
  const line = packet.startLine;
  if (!line) return [];
  if (side === "response") {
    const match2 = /^(HTTP(?:\/[\d.]+)?)(\s+)(\d{3})(.*)$/i.exec(line);
    if (!match2) return [{ text: line }];
    const [, proto = "", gap2 = "", code = "", reason = ""] = match2;
    return [
      { text: proto, tone: "proto" },
      { text: gap2 },
      { text: code, tone: "status" },
      { text: reason, tone: "reason" }
    ];
  }
  const match = /^([A-Z][A-Z0-9-]*)(\s+)(\S+)(?:\s+(HTTP\/[\d.]+))?$/.exec(line);
  if (!match) return [{ text: line }];
  const [, method = "", gap = "", target = "", version] = match;
  const tokens = [
    { text: method, tone: "method" },
    { text: gap }
  ];
  tokens.push(...tokenizeUrl(target));
  if (version) tokens.push({ text: " ", tone: "punct" }, { text: version, tone: "proto" });
  return tokens;
}
var COOKIE_LIKE = /* @__PURE__ */ new Set(["cookie", "set-cookie"]);
function tokenizeCookieValue(value) {
  const tokens = [];
  value.split(/;\s*(?=[^;]+?=)/).forEach((part, index) => {
    if (index > 0) tokens.push({ text: "; ", tone: "punct" });
    const eq = part.indexOf("=");
    if (eq < 0) {
      tokens.push({ text: part, tone: "cookie-value" });
      return;
    }
    tokens.push({ text: part.slice(0, eq), tone: "cookie-key" });
    tokens.push({ text: "=", tone: "punct" });
    tokens.push({ text: part.slice(eq + 1), tone: "cookie-value" });
  });
  return tokens;
}
function tokenizeHeader(header) {
  if (!header.name) return [{ text: header.value, tone: "value" }];
  const tokens = [
    { text: header.name, tone: "header" },
    { text: ":", tone: "punct" },
    { text: " ", tone: "punct" }
  ];
  const name = header.name.toLowerCase();
  if (COOKIE_LIKE.has(name)) {
    tokens.push(...tokenizeCookieValue(header.value));
  } else if (/^[<]?[a-zA-Z][\w+.-]*:\/\//.test(header.value)) {
    const bracketed = /^<([^>]+)>(.*)$/.exec(header.value);
    if (bracketed) {
      const [, href = "", rest = ""] = bracketed;
      tokens.push({ text: "<", tone: "punct" });
      tokens.push(...tokenizeUrl(href));
      tokens.push({ text: ">", tone: "punct" });
      if (rest) tokens.push({ text: rest, tone: "muted" });
    } else {
      tokens.push(...tokenizeUrl(header.value));
    }
  } else if (name === "content-type") {
    const semi = header.value.indexOf(";");
    if (semi > 0) {
      tokens.push({ text: header.value.slice(0, semi), tone: "string" });
      tokens.push({ text: header.value.slice(semi), tone: "muted" });
    } else {
      tokens.push({ text: header.value, tone: "string" });
    }
  } else {
    tokens.push({ text: header.value, tone: "value" });
  }
  return tokens;
}
var JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g;
function tokenizeJsonLine(line) {
  const tokens = [];
  let cursor = 0;
  for (const match of line.matchAll(JSON_TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ text: line.slice(cursor, index), tone: "punct" });
    if (match[1]) {
      tokens.push({ text: match[1], tone: match[2] ? "key" : "string" });
      if (match[2]) tokens.push({ text: match[2], tone: "punct" });
    } else if (match[3]) {
      tokens.push({ text: match[3], tone: "number" });
    } else if (match[4]) {
      tokens.push({ text: match[4], tone: "literal" });
    } else {
      tokens.push({ text: match[0], tone: "punct" });
    }
    cursor = index + match[0].length;
  }
  if (cursor < line.length) tokens.push({ text: line.slice(cursor), tone: "punct" });
  return tokens;
}
var TAG_PATTERN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\?[\s\S]*?\?>|<\/?([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
var ATTR_PATTERN = /([^\s=/>]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)?/g;
function tokenizeTag(text, name, attributes) {
  const tokens = [];
  const open = text.startsWith("</") ? "</" : "<";
  tokens.push({ text: open, tone: "punct" });
  if (!name) {
    tokens.push({ text: text.slice(open.length), tone: "comment" });
    return tokens;
  }
  tokens.push({ text: name, tone: "tag" });
  for (const match of attributes.replace(/\/\s*$/, "").matchAll(ATTR_PATTERN)) {
    if (!match[1]) continue;
    tokens.push({ text: " ", tone: "punct" });
    tokens.push({ text: match[1], tone: "attr" });
    if (match[2]) tokens.push({ text: match[2].trim() === "=" ? "=" : match[2].trim(), tone: "punct" });
    if (match[3]) tokens.push({ text: match[3], tone: "string" });
  }
  tokens.push({ text: text.endsWith("/>") ? "/>" : ">", tone: "punct" });
  return tokens;
}
function tokenizeMarkupLine(line) {
  const tokens = [];
  let cursor = 0;
  for (const match of line.matchAll(TAG_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ text: line.slice(cursor, index), tone: "value" });
    const full = match[0];
    if (full.startsWith("<!") || full.startsWith("<?")) tokens.push({ text: full, tone: "comment" });
    else tokens.push(...tokenizeTag(full, match[1], match[2] ?? ""));
    cursor = index + full.length;
  }
  if (cursor < line.length) tokens.push({ text: line.slice(cursor), tone: "value" });
  return tokens;
}
var JS_KEYWORDS = /* @__PURE__ */ new Set([
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "yield"
]);
var CODE_TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b[A-Za-z_$][\w$]*\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
function tokenizeCodeLine(line) {
  const tokens = [];
  let cursor = 0;
  for (const match of line.matchAll(CODE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ text: line.slice(cursor, index) });
    if (match[1]) tokens.push({ text: match[1], tone: "comment" });
    else if (match[2]) tokens.push({ text: match[2], tone: "string" });
    else if (match[3]) {
      const word = match[3];
      tokens.push(JS_KEYWORDS.has(word) ? { text: word, tone: "literal" } : { text: word });
    } else tokens.push({ text: match[0], tone: "number" });
    cursor = index + match[0].length;
  }
  if (cursor < line.length) tokens.push({ text: line.slice(cursor) });
  return tokens;
}
function tokenizeFormLine(line) {
  const tokens = [];
  line.split("&").forEach((part, index) => {
    if (index > 0) tokens.push({ text: "&", tone: "punct" });
    if (!part) return;
    const eq = part.indexOf("=");
    if (eq < 0) {
      tokens.push({ text: part, tone: "key" });
      return;
    }
    tokens.push({ text: part.slice(0, eq), tone: "key" });
    tokens.push({ text: "=", tone: "punct" });
    tokens.push({ text: part.slice(eq + 1), tone: "string" });
  });
  return tokens;
}
function tokenizeMultipartLine(line) {
  if (/^--/.test(line)) return [{ text: line, tone: "comment" }];
  const colon = line.indexOf(":");
  if (colon > 0 && !/\s/.test(line.slice(0, colon))) {
    return [
      { text: line.slice(0, colon), tone: "header" },
      { text: ":", tone: "punct" },
      { text: line.slice(colon + 1), tone: "value" }
    ];
  }
  return [{ text: line, tone: "value" }];
}
function tokenizeBodyLine(kind, line) {
  switch (kind) {
    case "json":
      return tokenizeJsonLine(line);
    case "html":
    case "xml":
      return tokenizeMarkupLine(line);
    case "js":
    case "css":
      return tokenizeCodeLine(line);
    case "form":
      return tokenizeFormLine(line);
    case "multipart":
      return tokenizeMultipartLine(line);
    default:
      return [{ text: line }];
  }
}
function hexDump(body, limit = 512) {
  const all = new TextEncoder().encode(body);
  const bytes = all.slice(0, limit);
  const rows = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = Array.from(bytes.slice(offset, offset + 16));
    const hex = chunk.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
    const ascii = chunk.map((byte) => byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ".").join("");
    rows.push({ offset: offset.toString(16).padStart(8, "0"), hex: hex.padEnd(47, " "), ascii });
  }
  return { rows, truncated: all.length > limit };
}
function statusClass(status) {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  if (status >= 300) return "redirect";
  if (status >= 200) return "success";
  return "info";
}
function methodClass(method) {
  switch (method.toUpperCase()) {
    case "GET":
    case "HEAD":
      return "get";
    case "POST":
      return "post";
    case "PUT":
      return "put";
    case "PATCH":
      return "patch";
    case "DELETE":
      return "delete";
    case "OPTIONS":
      return "options";
    default:
      return "other";
  }
}

// src/yak-history.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function useHistory(body, revision = 0) {
  const [result, setResult] = (0, import_react5.useState)();
  const key = `${revision}:${body}`;
  (0, import_react5.useEffect)(() => {
    if (body === null) return;
    const controller = new AbortController();
    async function read() {
      try {
        const response = await fetch("/vexnar-api/api/yak/history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: controller.signal
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
        if (!controller.signal.aborted) setResult({ key, data });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, error: error.message });
      }
    }
    void read();
    return () => controller.abort();
  }, [body, key]);
  return {
    data: result?.key === key ? result.data : void 0,
    error: result?.key === key ? result.error : void 0,
    loading: body !== null && result?.key !== key
  };
}
function splitOnQuery(text, query2, counter2) {
  if (!query2) return text;
  const haystack = text.toLowerCase();
  const needle = query2.toLowerCase();
  let at = haystack.indexOf(needle);
  if (at < 0) return text;
  const parts = [];
  let cursor = 0;
  while (at >= 0) {
    if (at > cursor) parts.push(text.slice(cursor, at));
    const ordinal = counter2.value++;
    parts.push(
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("mark", { className: "vx-hit", "data-match": ordinal, children: text.slice(at, at + needle.length) }, `${at}-${ordinal}`)
    );
    cursor = at + needle.length;
    at = haystack.indexOf(needle, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_jsx_runtime3.Fragment, { children: parts });
}
function Tokens({ tokens, query: query2, counter: counter2 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_jsx_runtime3.Fragment, { children: tokens.map(
    (token, index) => token.tone ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `vx-tone vx-tone--${token.tone}`, children: splitOnQuery(token.text, query2, counter2) }, index) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: splitOnQuery(token.text, query2, counter2) }, index)
  ) });
}
function PacketBody({ packet, side, format, query: query2 }) {
  if (format === "hex") {
    const dump = hexDump(atob(packet.base64 ?? ""), 4096);
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "vx-yak-code", children: dump.rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "vx-yak-line", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("code", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "vx-tone vx-tone--muted", children: row.offset }),
      "  ",
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "vx-tone vx-tone--value", children: row.hex }),
      "  \u2502",
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "vx-tone vx-tone--comment", children: row.ascii }),
      "\u2502"
    ] }) }, row.offset)) });
  }
  const parsed = parseHttpPacket(packet.text);
  const contentType = packetHeader(parsed, "content-type");
  const kind = detectBodyKind(contentType, parsed.body);
  const pretty2 = format === "pretty" ? prettyJsonBody(parsed.body) : null;
  const bodyText = pretty2 ?? parsed.body;
  const bodyKind = pretty2 ? "json" : kind;
  const counter2 = { value: 0 };
  const rows = [];
  if (parsed.startLine) {
    rows.push(
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "vx-yak-line vx-yak-line--start", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tokens, { tokens: tokenizeStartLine(parsed, side), query: query2, counter: counter2 }) }) }, "start")
    );
  }
  for (const [index, header] of parsed.headers.entries()) {
    rows.push(
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "vx-yak-line", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tokens, { tokens: tokenizeHeader(header), query: query2, counter: counter2 }) }) }, `h${index}`)
    );
  }
  if (parsed.body) {
    rows.push(/* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "vx-yak-separator" }, "sep"));
    if (bodyKind === "binary") {
      const dump = hexDump(parsed.body);
      rows.push(
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "vx-yak-note", children: [
          "\u4E8C\u8FDB\u5236\u6B63\u6587 \xB7 ",
          parsed.body.length,
          " B",
          dump.truncated ? "\uFF08\u4EC5\u663E\u793A\u524D 512 \u5B57\u8282\uFF09" : ""
        ] }, "note")
      );
      for (const row of dump.rows) {
        rows.push(
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "vx-yak-line", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("code", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "vx-tone vx-tone--muted", children: row.offset }),
            "  ",
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "vx-tone vx-tone--value", children: row.hex }),
            "  \u2502",
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "vx-tone vx-tone--comment", children: row.ascii }),
            "\u2502"
          ] }) }, `d${row.offset}`)
        );
      }
    } else {
      for (const [index, line] of bodyText.split("\n").entries()) {
        rows.push(
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "vx-yak-line", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Tokens, { tokens: tokenizeBodyLine(bodyKind, line), query: query2, counter: counter2 }) }) }, `b${index}`)
        );
      }
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "vx-yak-code", children: rows });
}
function PacketPane({ label, packet, side }) {
  const [format, setFormat] = (0, import_react5.useState)("pretty");
  const [copied, setCopied] = (0, import_react5.useState)("");
  const [query2, setQuery] = (0, import_react5.useState)("");
  const [hits, setHits] = (0, import_react5.useState)(0);
  const [active, setActive] = (0, import_react5.useState)(-1);
  const bodyRef = (0, import_react5.useRef)(null);
  (0, import_react5.useEffect)(() => {
    const nodes = bodyRef.current?.querySelectorAll(".vx-hit") ?? [];
    setHits(nodes.length);
    setActive(nodes.length > 0 ? 0 : -1);
  }, [query2, format, packet]);
  (0, import_react5.useEffect)(() => {
    const nodes = bodyRef.current?.querySelectorAll(".vx-hit") ?? [];
    nodes.forEach((node, index) => node.toggleAttribute("data-active", index === active));
    if (active >= 0) nodes[active]?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [active, hits]);
  const step = (delta) => {
    if (hits === 0) return;
    setActive((current) => (current + delta + hits) % hits);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(packet.text);
      setCopied("\u5DF2\u590D\u5236");
    } catch {
      setCopied("\u526A\u8D34\u677F\u4E0D\u53EF\u7528");
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "vx-yak-packet", "data-side": side, "aria-label": label, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("header", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `vx-yak-chip vx-yak-chip--${side}`, children: side === "response" ? "\u54CD\u5E94" : "\u8BF7\u6C42" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "vx-yak-size", children: [
        packet.bytes.toLocaleString(),
        " B"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "vx-yak-search", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            "aria-label": `\u5728${label}\u91CC\u641C\u7D22`,
            placeholder: "\u641C\u7D22",
            value: query2,
            onChange: (event) => setQuery(event.target.value),
            onKeyDown: (event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                step(event.shiftKey ? -1 : 1);
              }
              if (event.key === "Escape") setQuery("");
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { children: query2 ? hits > 0 ? `${active + 1}/${hits}` : "0" : "" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", "aria-label": "\u4E0A\u4E00\u4E2A\u547D\u4E2D", disabled: hits === 0, onClick: () => step(-1), children: "\u2191" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", "aria-label": "\u4E0B\u4E00\u4E2A\u547D\u4E2D", disabled: hits === 0, onClick: () => step(1), children: "\u2193" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "vx-yak-segmented", role: "group", "aria-label": `${label}\u663E\u793A\u683C\u5F0F`, children: [
        ["pretty", "\u7F8E\u5316"],
        ["raw", "\u539F\u6587"],
        ["hex", "HEX"]
      ].map(([value, text]) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          "aria-pressed": format === value,
          onClick: () => {
            setFormat(value);
            setCopied("");
          },
          children: text
        },
        value
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "vx-yak-copy", onClick: () => void copy(), children: copied || "\u590D\u5236" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { ref: bodyRef, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(PacketBody, { packet, side, format, query: query2 }) }),
    packet.truncated && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { className: "vx-yak-hint", children: "\u663E\u793A\u524D 128 KiB" })
  ] });
}
var emptyFilters = {
  url: "",
  method: "",
  status: "",
  capture_source: "",
  content_type: "",
  keyword: "",
  tag: "",
  websocket: false
};
function siteName(raw) {
  try {
    return new URL(raw).host;
  } catch {
    return "";
  }
}
function exportRows(rows) {
  const cell = (value) => {
    const text = String(value);
    const escaped = /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text;
    return '"' + escaped.replaceAll('"', '""') + '"';
  };
  const lines = [
    "ID,Method,Status,URL,ResponseBytes,ContentType,Source,IP,Title,Tags,Time",
    ...rows.map(
      (row) => [row.id, row.method, row.status, row.url, row.bytes, row.content_type, row.source, row.ip, row.title, row.tags, row.time].map(cell).join(",")
    )
  ];
  const href = URL.createObjectURL(new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = "yak-history.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1e3);
}
var COLUMNS = "92px 62px 72px minmax(220px, 1.4fr) 152px 156px 76px 108px minmax(120px, 0.9fr)";
var ROW_HEIGHT = 30;
var COLUMN_DEFS = [
  { label: "\u65F6\u95F4", field: "created_at" },
  { label: "\u65B9\u6CD5" },
  { label: "\u72B6\u6001", field: "status_code" },
  { label: "URL" },
  { label: "\u54CD\u5E94\u5927\u5C0F", field: "body_length", align: "end" },
  { label: "\u7C7B\u578B" },
  { label: "\u6765\u6E90" },
  { label: "IP" },
  { label: "\u6807\u9898" }
];
function YakHistory({ sessionId }) {
  const [sourceOverride, setSource] = (0, import_react5.useState)("");
  const [revision, setRevision] = (0, import_react5.useState)(0);
  const [filters, setFilters] = (0, import_react5.useState)(emptyFilters);
  const [search, setSearch] = (0, import_react5.useState)(emptyFilters);
  const [page, setPage] = (0, import_react5.useState)(1);
  const [selected, setSelected] = (0, import_react5.useState)("");
  const [order, setOrder] = (0, import_react5.useState)({ order_by: "id", ascending: false });
  const sources = useHistory(sessionId ? null : '{"action":"sources"}', revision);
  const source = sources.data?.sources.includes(sourceOverride) ? sourceOverride : sources.data?.sources[0] ?? "";
  const scope = sessionId ? { session_id: sessionId } : { source };
  const available = Boolean(sessionId || source);
  const list = useHistory(available ? JSON.stringify({ action: "list", ...scope, ...search, ...order, page }) : null, revision);
  const detail = useHistory(available && selected ? JSON.stringify({ action: "detail", ...scope, id: selected }) : null, revision);
  const rows = list.data?.rows ?? [];
  const sites = /* @__PURE__ */ Object.create(null);
  for (const row of rows) {
    const site = siteName(row.url);
    if (site) sites[site] = (sites[site] ?? 0) + 1;
  }
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.size)) : 1;
  const maxBytes = rows.reduce((max, row) => Math.max(max, row.bytes), 0) || 1;
  const listRef = (0, import_react5.useRef)(null);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  });
  function apply2(next) {
    setSearch(next);
    setFilters(next);
    setPage(1);
    setSelected("");
  }
  function sortBy(field2) {
    if (!field2) return;
    setOrder({ order_by: field2, ascending: order.order_by === field2 && !order.ascending });
    setPage(1);
    setSelected("");
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "vx-yak-history", children: [
    !sessionId && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(YakSourcesEditor, { onSaved: () => setRevision((value) => value + 1) }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "form",
      {
        className: "vx-yak-filters",
        onSubmit: (event) => {
          event.preventDefault();
          apply2(filters);
        },
        children: [
          !sessionId && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "select",
            {
              className: "vx-yak-source",
              "aria-label": "Yak \u9879\u76EE",
              value: source,
              onChange: (event) => {
                setSource(event.target.value);
                apply2(emptyFilters);
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", disabled: true, children: "\u9009\u62E9 Yak \u9879\u76EE" }),
                sources.data?.sources.map((name) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { children: name }, name))
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              className: "vx-yak-filter-url",
              "aria-label": "URL",
              placeholder: "URL / Host",
              value: filters.url,
              onChange: (event) => setFilters({ ...filters, url: event.target.value })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { "aria-label": "\u65B9\u6CD5", value: filters.method, onChange: (event) => setFilters({ ...filters, method: event.target.value }), children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: "\u5168\u90E8\u65B9\u6CD5" }),
            ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "CONNECT", "TRACE"].map((method) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { children: method }, method))
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { "aria-label": "\u72B6\u6001\u7801", placeholder: "\u72B6\u6001\u7801", inputMode: "numeric", value: filters.status, onChange: (event) => setFilters({ ...filters, status: event.target.value }) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { "aria-label": "\u6D41\u91CF\u6765\u6E90", placeholder: "\u6765\u6E90", value: filters.capture_source, onChange: (event) => setFilters({ ...filters, capture_source: event.target.value }) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { "aria-label": "\u5185\u5BB9\u7C7B\u578B", placeholder: "Content-Type", value: filters.content_type, onChange: (event) => setFilters({ ...filters, content_type: event.target.value }) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { "aria-label": "\u5173\u952E\u8BCD", placeholder: "\u62A5\u6587\u5173\u952E\u8BCD", value: filters.keyword, onChange: (event) => setFilters({ ...filters, keyword: event.target.value }) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { "aria-label": "\u6807\u7B7E", placeholder: "\u6807\u7B7E", value: filters.tag, onChange: (event) => setFilters({ ...filters, tag: event.target.value }) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "vx-yak-check", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { type: "checkbox", checked: filters.websocket, onChange: (event) => setFilters({ ...filters, websocket: event.target.checked }) }),
            " \u4EC5 WebSocket"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "vx-yak-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "submit", className: "vx-yak-primary", disabled: !available, children: "\u7B5B\u9009" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: () => apply2(emptyFilters), children: "\u6E05\u9664" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "button",
              {
                type: "button",
                onClick: () => {
                  setSelected("");
                  setRevision((value) => value + 1);
                },
                children: "\u5237\u65B0"
              }
            )
          ] })
        ]
      }
    ),
    sources.error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "alert", className: "vx-yak-alert", children: sources.error }),
    !sessionId && sources.data?.sources.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "vx-yak-hint", children: "\u5C1A\u672A\u914D\u7F6E Yak \u6D41\u91CF\u6765\u6E90\uFF1A\u70B9\u4E0A\u65B9\u300C\u914D\u7F6E\u6765\u6E90\u300D\u586B\u5199\u5DE5\u4F5C\u533A\u4E0E\u5185\u6838 socket\uFF0C\u6216\u5207\u5230\u300C\u672C\u5730\u91C7\u96C6\u300D\u67E5\u770B VEXNAR \u81EA\u5DF1\u6293\u5230\u7684\u6D41\u91CF\u3002" }),
    list.loading && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "status", className: "vx-yak-hint", children: "\u8BFB\u53D6\u6D41\u91CF\u2026" }),
    list.error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "alert", className: "vx-yak-alert", children: list.error }),
    list.data && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "vx-yak-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("aside", { "aria-label": "\u672C\u9875\u7AD9\u70B9", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "vx-yak-aside-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: "\u672C\u9875\u7AD9\u70B9" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { children: Object.keys(sites).length })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "vx-yak-aside-list", children: [
          Object.entries(sites).map(([site, count]) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { type: "button", title: site, onClick: () => apply2({ ...search, url: site }), children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: site }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { children: count })
          ] }, site)),
          Object.keys(sites).length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { className: "vx-yak-hint", children: "\u672C\u9875\u65E0\u7AD9\u70B9" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "vx-yak-list", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "vx-yak-table", ref: listRef, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "vx-yak-head", style: { gridTemplateColumns: COLUMNS }, children: COLUMN_DEFS.map((column) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "button",
            {
              type: "button",
              className: column.align === "end" ? "vx-yak-th--end" : void 0,
              "aria-sort": column.field && order.order_by === column.field ? order.ascending ? "ascending" : "descending" : void 0,
              onClick: () => sortBy(column.field),
              disabled: !column.field,
              children: [
                column.label,
                column.field && order.order_by === column.field ? order.ascending ? " \u2191" : " \u2193" : ""
              ]
            },
            column.label
          )) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "vx-yak-body", style: { height: virtual.getTotalSize() }, children: virtual.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
              "div",
              {
                className: "vx-yak-row",
                "data-selected": row.id === selected,
                style: { gridTemplateColumns: COLUMNS, height: ROW_HEIGHT, transform: `translateY(${item.start}px)` },
                onClick: () => setSelected(row.id),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "vx-yak-dim vx-yak-time", title: row.time ? new Date(row.time * 1e3).toLocaleString() : "", children: row.time ? new Date(row.time * 1e3).toLocaleTimeString() : "\u2014" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `vx-method vx-method--${methodClass(row.method)}`, children: row.method }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `vx-status vx-status--${statusClass(row.status)}`, children: row.status || "\u2014" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "vx-yak-url", title: row.url, onClick: () => setSelected(row.id), children: row.url }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "vx-yak-size-cell", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "vx-yak-sizebar", "data-tone": statusClass(row.status), title: `${row.bytes} B`, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                      "i",
                      {
                        style: {
                          width: `${Math.max(4, Math.round(Math.log10(Math.max(row.bytes, 1)) / Math.log10(Math.max(maxBytes, 10)) * 100))}%`
                        }
                      }
                    ) }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "vx-yak-num", children: [
                      row.bytes,
                      " B"
                    ] })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "vx-yak-type", children: row.websocket ? "WebSocket" : row.content_type }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "vx-yak-dim", children: row.source }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "vx-yak-dim", children: row.ip }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "vx-yak-dim", title: row.tags || row.title, children: row.title || row.tags || "\u2014" })
                ]
              },
              row.id
            );
          }) }),
          rows.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "vx-yak-hint", children: "\u6682\u65E0\u5339\u914D\u6D41\u91CF" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "vx-yak-pages", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
            "\u5171 ",
            list.data.total,
            " \u6761 \xB7 \u7B2C ",
            page,
            " / ",
            pages,
            " \u9875 \xB7 \u672C\u9875 ",
            rows.length,
            " \u6761"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", disabled: rows.length === 0, onClick: () => exportRows(rows), children: "\u5BFC\u51FA\u672C\u9875 CSV" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              disabled: page <= 1,
              onClick: () => {
                setPage(page - 1);
                setSelected("");
              },
              children: "\u4E0A\u4E00\u9875"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              disabled: page >= pages,
              onClick: () => {
                setPage(page + 1);
                setSelected("");
              },
              children: "\u4E0B\u4E00\u9875"
            }
          )
        ] })
      ] })
    ] }),
    detail.loading && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "status", className: "vx-yak-hint", children: "\u8BFB\u53D6\u62A5\u6587\u2026" }),
    detail.error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "alert", className: "vx-yak-alert", children: detail.error }),
    detail.data && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "vx-yak-detail", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("header", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `vx-method vx-method--${methodClass(detail.data.flow.method)}`, children: detail.data.flow.method }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `vx-status vx-status--${statusClass(detail.data.flow.status)}`, children: detail.data.flow.status || "\u2014" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("strong", { children: [
          "#",
          detail.data.flow.id
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { className: "vx-yak-detail-url", children: detail.data.flow.url }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "vx-yak-close", onClick: () => setSelected(""), children: "\u5173\u95ED\u8BE6\u60C5" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(PanelGroup, { direction: "horizontal", className: "vx-yak-split", autoSaveId: "vexnar-yak-detail-split", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Panel, { defaultSize: 50, minSize: 20, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(PacketPane, { label: "\u8BF7\u6C42", packet: detail.data.request, side: "request" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(PanelResizeHandle, { className: "vx-yak-resize" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Panel, { defaultSize: 50, minSize: 20, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(PacketPane, { label: "\u54CD\u5E94", packet: detail.data.response, side: "response" }) })
      ] })
    ] }, selected)
  ] });
}
function SessionTrafficAction({ sessionId }) {
  const dialog = (0, import_react5.useRef)(null);
  const [opened, setOpened] = (0, import_react5.useState)(false);
  (0, import_react5.useEffect)(() => {
    if (opened && !dialog.current?.open) dialog.current?.showModal();
  }, [opened]);
  if (!sessionId) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", title: "\u67E5\u770B\u6B64\u4F1A\u8BDD\u9879\u76EE\u7684 Yak \u6D41\u91CF", onClick: () => setOpened(true), children: "\u6D41\u91CF" }),
    opened && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "dialog",
      {
        className: "vx-yak-dialog",
        ref: dialog,
        onClose: () => setOpened(false),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("header", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: "\u4F1A\u8BDD\u9879\u76EE\u6D41\u91CF" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: () => dialog.current?.close(), children: "\u5173\u95ED" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(YakHistory, { sessionId }, sessionId)
        ]
      }
    )
  ] });
}

// src/capture-action.tsx
var import_react6 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
var CORE_BASE2 = "/vexnar-api";
async function readJSON(path, init) {
  const response = await fetch(CORE_BASE2 + path, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data;
}
function SessionCaptureAction({ sessionId }) {
  const [endpoint, setEndpoint] = (0, import_react6.useState)(null);
  const [busy, setBusy] = (0, import_react6.useState)(false);
  const [note, setNote] = (0, import_react6.useState)("");
  (0, import_react6.useEffect)(() => {
    if (!sessionId) return;
    let alive = true;
    readJSON(`/api/sessions/${encodeURIComponent(sessionId)}/traffic/endpoint`).then((data) => {
      if (alive) setEndpoint(data);
    }).catch(() => {
      if (alive) setEndpoint(null);
    });
    return () => {
      alive = false;
    };
  }, [sessionId]);
  if (!sessionId) return null;
  const active = endpoint?.enabled === true;
  const items = Number(endpoint?.capture?.items ?? 0);
  async function toggle() {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      const action = active ? "stop" : "start";
      const body = await readJSON(`/api/sessions/${encodeURIComponent(sessionId)}/traffic/capture`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action })
      });
      setEndpoint({ enabled: body?.enabled === true, scope: body?.scope, capture: body?.summary ?? body?.capture, hook: body?.hook });
      setNote(action === "start" ? "\u5DF2\u53D1\u8D77\u6293\u5305\uFF1A\u590D\u5236\u811A\u672C\u5230 Yakit \u70ED\u52A0\u8F7D" : "\u5DF2\u505C\u6B62\u6293\u5305");
    } catch (error) {
      setNote(String(error?.message ?? error));
    } finally {
      setBusy(false);
    }
  }
  async function copyHook() {
    try {
      await navigator.clipboard.writeText(String(endpoint?.hook ?? ""));
      setNote("\u6293\u5305\u811A\u672C\u5DF2\u590D\u5236");
    } catch {
      setNote("\u590D\u5236\u5931\u8D25");
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "vx-capture-action", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "button",
      {
        type: "button",
        disabled: busy,
        onClick: () => {
          void toggle();
        },
        title: active ? "\u505C\u6B62\u672C\u4F1A\u8BDD\u6293\u5305" : "\u4E3A\u672C\u4F1A\u8BDD\u53D1\u8D77\u6293\u5305",
        children: active ? `\u6293\u5305\u4E2D ${items}` : "\u6293\u5305"
      }
    ),
    active && endpoint?.hook ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: () => {
      void copyHook();
    }, title: "\u590D\u5236\u672C\u4F1A\u8BDD\u7684 Yakit \u6293\u5305\u811A\u672C", children: "\u811A\u672C" }) : null,
    note !== "" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("em", { children: note }) : null
  ] });
}

// src/catalog.tsx
var import_react7 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
function errorText2(error) {
  return String(error?.message ?? error);
}
function pretty(value) {
  if (value === void 0 || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}
function parseJson(text, fallback) {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  return JSON.parse(trimmed);
}
function Pill({ on, onLabel = "\u5DF2\u542F\u7528", offLabel = "\u5DF2\u505C\u7528" }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: on ? "vx-cat-pill vx-cat-pill--on" : "vx-cat-pill", children: on ? onLabel : offLabel });
}
function Switch({ on, onChange, label, disabled = false }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "vx-cat-switch", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { type: "checkbox", checked: on, disabled, onChange: (event) => {
      onChange(event.target.checked);
    } }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-switch-track", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-switch-thumb" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-switch-label", children: label })
  ] });
}
function Field({ label, hint, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-field-label", children: label }),
    hint ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-field-hint", children: hint }) : null,
    children
  ] });
}
function AgentPicker({ agents, value, onChange }) {
  const toggle = (key) => {
    onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key]);
  };
  if (agents.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-hint", children: "\u8FD8\u6CA1\u6709 agent\uFF0C\u5148\u5230\u300CAgent \u7BA1\u7406\u300D\u5EFA\u4E00\u4E2A\u3002" });
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-chips", children: agents.map((agent) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    "button",
    {
      type: "button",
      className: value.includes(agent.key) ? "vx-cat-chip vx-cat-chip--on" : "vx-cat-chip",
      "aria-pressed": value.includes(agent.key),
      onClick: () => {
        toggle(agent.key);
      },
      children: agent.key
    },
    agent.key
  )) });
}
function paramsOf(schema) {
  const root = schema;
  const props2 = root?.properties;
  if (!props2 || typeof props2 !== "object") return [];
  const required = Array.isArray(root?.required) ? root.required.filter((item) => typeof item === "string") : [];
  return Object.entries(props2).map(([name, raw]) => {
    const prop = raw ?? {};
    const hasDefault = Object.prototype.hasOwnProperty.call(prop, "default");
    return {
      name,
      type: typeof prop.type === "string" ? prop.type : "any",
      required: required.includes(name),
      description: typeof prop.description === "string" ? prop.description : "",
      defaultValue: hasDefault ? pretty(prop.default) : ""
    };
  });
}
function withParam(schema, name, patch2) {
  const root = schema && typeof schema === "object" ? JSON.parse(JSON.stringify(schema)) : { type: "object", properties: {} };
  root.properties = root.properties ?? {};
  const prop = root.properties[name] ?? (root.properties[name] = {});
  if (patch2.description !== void 0) {
    if (patch2.description) prop.description = patch2.description;
    else delete prop.description;
  }
  if (patch2.defaultValue !== void 0) {
    const text = patch2.defaultValue.trim();
    if (!text) delete prop.default;
    else {
      try {
        prop.default = JSON.parse(text);
      } catch {
        prop.default = patch2.defaultValue;
      }
    }
  }
  return root;
}
function ParamEditor({ schema, onChange, defaultsReadOnly }) {
  const rows = (0, import_react7.useMemo)(() => paramsOf(schema), [schema]);
  if (rows.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-hint", children: "\u8BE5\u5DE5\u5177\u6CA1\u6709\u58F0\u660E\u53C2\u6570\u3002" });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-params", children: rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-param", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-param-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { children: row.name }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-param-type", children: row.type }),
      row.required ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-param-req", children: "\u5FC5\u586B" }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "input",
      {
        className: "vx-cat-input",
        placeholder: "\u53C2\u6570\u63CF\u8FF0\uFF08\u53D1\u9001\u7ED9\u6A21\u578B\uFF09",
        value: row.description,
        onChange: (event) => {
          onChange(withParam(schema, row.name, { description: event.target.value }));
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "input",
      {
        className: "vx-cat-input",
        placeholder: "\u9ED8\u8BA4\u503C\uFF08JSON\uFF0C\u7559\u7A7A=\u65E0\u9ED8\u8BA4\uFF09",
        value: row.defaultValue,
        readOnly: defaultsReadOnly,
        onChange: (event) => {
          onChange(withParam(schema, row.name, { defaultValue: event.target.value }));
        }
      }
    )
  ] }, row.name)) });
}
function ToolsTab() {
  const [nonce2, setNonce] = (0, import_react7.useState)(0);
  const [view, setView] = (0, import_react7.useState)({ kind: "list" });
  const [query2, setQuery] = (0, import_react7.useState)("");
  const [notice, setNotice] = (0, import_react7.useState)("");
  const [busy, setBusy] = (0, import_react7.useState)(false);
  const tools = useApi("/api/tools", [nonce2]);
  const agents = useApi("/api/agents", []);
  const rows = tools.data?.tools ?? [];
  const agentRows = agents.data?.agents ?? [];
  const refresh = () => {
    setNonce(nonce2 + 1);
  };
  const registerDefaults = async () => {
    setBusy(true);
    setNotice("");
    try {
      const result = await callApi("/api/tools/register", "POST", {});
      setNotice(`\u5DF2\u91CD\u65B0\u6CE8\u518C\uFF1A\u65B0\u589E ${result.toolsAdded ?? 0} \u4E2A\uFF0C\u5171 ${result.toolsTotal ?? 0} \u4E2A\u5DE5\u5177`);
      refresh();
    } catch (cause) {
      setNotice(`\u6CE8\u518C\u5931\u8D25\uFF1A${errorText2(cause)}`);
    } finally {
      setBusy(false);
    }
  };
  if (view.kind === "edit") {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      ToolDetail,
      {
        tool: view.tool,
        agents: agentRows,
        onBack: () => {
          setView({ kind: "list" });
        },
        onSaved: (message = "") => {
          setNotice(message);
          refresh();
          setView({ kind: "list" });
        }
      }
    );
  }
  if (view.kind === "new") {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NewTool, { agents: agentRows, onBack: () => {
      setView({ kind: "list" });
    }, onSaved: () => {
      refresh();
      setView({ kind: "list" });
    } });
  }
  if (tools.loading) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-hint", children: "\u52A0\u8F7D\u4E2D\u2026" });
  if (tools.error) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-error", children: tools.error });
  const needle = query2.trim().toLowerCase();
  const matched = needle ? rows.filter((row) => `${row.key} ${row.description ?? ""}`.toLowerCase().includes(needle)) : rows;
  const system = matched.filter((row) => row.system);
  const custom = matched.filter((row) => !row.system);
  const card = (row) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("button", { type: "button", className: "vx-cat-card", onClick: () => {
    setView({ kind: "edit", tool: row });
  }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "vx-cat-card-top", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { className: "vx-cat-key", children: row.key }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Pill, { on: Boolean(row.enabled) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-desc", children: row.description || "\uFF08\u65E0\u63CF\u8FF0\uFF09" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "vx-cat-meta", children: [
      row.kind ?? "builtin",
      " \xB7 ",
      (row.agents ?? []).length,
      " \u4E2A agent",
      " \xB7 ",
      "\u8C03\u7528 ",
      row.calls ?? 0
    ] })
  ] }, row.key);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "vx-cat-lead", children: "\u5E73\u53F0\u6CE8\u518C\u7684\u5DE5\u5177\uFF1A\u7CFB\u7EDF\u5DE5\u5177\u6765\u81EA TS core \u7684\u9ED8\u8BA4\u76EE\u5F55\uFF0C\u53EF\u4EE5\u4FEE\u6539\u5DE5\u5177\u548C\u53C2\u6570\u8BF4\u660E\u3002 \u81EA\u5B9A\u4E49\u5DE5\u5177\u53EF\u6574\u6761\u589E\u5220\u6539\u3002\u5220\u6389\u6216\u7528\u574F\u4E86\u7684\u9ED8\u8BA4\u9879\u53EF\u4EE5\u300C\u91CD\u65B0\u6CE8\u518C\u9ED8\u8BA4\u300D\u8865\u56DE\u6765\uFF1Bagent \u80FD\u4E0D\u80FD\u771F\u6B63\u8C03\u7528\uFF0C \u4ECD\u7531 dsh \u7684\u63D2\u4EF6\u6302\u8F7D\u4E0E\u6743\u9650\u9884\u8BBE\u51B3\u5B9A\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { className: "vx-cat-input vx-cat-search", placeholder: "\u641C\u7D22 key / \u63CF\u8FF0", value: query2, onChange: (event) => {
        setQuery(event.target.value);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-btn", disabled: busy, onClick: () => {
        void registerDefaults();
      }, children: "\u91CD\u65B0\u6CE8\u518C\u9ED8\u8BA4" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-btn vx-cat-btn--primary", onClick: () => {
        setView({ kind: "new" });
      }, children: "+ \u65B0\u5EFA\u5DE5\u5177" })
    ] }),
    notice ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-notice", children: notice }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-section", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-section-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u7CFB\u7EDF\u5DE5\u5177" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-count", children: system.length })
      ] }),
      system.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-hint", children: "\u6CA1\u6709\u5339\u914D\u7684\u7CFB\u7EDF\u5DE5\u5177\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-grid", children: system.map(card) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-section", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-section-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u81EA\u5B9A\u4E49\u5DE5\u5177" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-count", children: custom.length })
      ] }),
      custom.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-hint", children: "\u8FD8\u6CA1\u6709\u81EA\u5B9A\u4E49\u5DE5\u5177\u3002\u81EA\u5B9A\u4E49\u5DE5\u5177\u7528 command / script / http / shell \u56DB\u79CD\u6267\u884C\u5668\uFF0C\u4FDD\u5B58\u540E\u7ACB\u5373\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-grid", children: custom.map(card) })
    ] })
  ] });
}
function ToolDetail({ tool, agents, onBack, onSaved }) {
  const [description, setDescription] = (0, import_react7.useState)(tool.description ?? "");
  const [schema, setSchema] = (0, import_react7.useState)(tool.schema ?? {});
  const [bound, setBound] = (0, import_react7.useState)(tool.agents ?? []);
  const [enabled2, setEnabled] = (0, import_react7.useState)(Boolean(tool.enabled));
  const [kind, setKind] = (0, import_react7.useState)(tool.kind ?? "command");
  const [exec, setExec] = (0, import_react7.useState)(() => pretty(tool.exec ?? {}));
  const [busy, setBusy] = (0, import_react7.useState)(false);
  const [error, setError] = (0, import_react7.useState)("");
  const documentationPath = `/api/tools/${encodeURIComponent(tool.key)}/documentation`;
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      if (tool.system) {
        const parameters = Object.fromEntries(paramsOf(schema).map((row) => [row.name, row.description]));
        await callApi(documentationPath, "PUT", { description, parameters });
      } else {
        await callApi(`/api/tools/custom/${encodeURIComponent(tool.key)}`, "PUT", {
          description,
          schema,
          agents: bound,
          enabled: enabled2,
          kind,
          exec: parseJson(exec, {}),
          deferred: Boolean(tool.deferred)
        });
      }
      onSaved(tool.system ? "\u5DF2\u4FDD\u5B58\u5DE5\u5177\u8BF4\u660E" : "\u5DF2\u4FDD\u5B58");
    } catch (cause) {
      setError(errorText2(cause));
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    setBusy(true);
    setError("");
    try {
      await callApi(documentationPath + "/reset", "POST", {});
      onSaved("\u5DF2\u6062\u590D\u9ED8\u8BA4\u8BF4\u660E");
    } catch (cause) {
      setError(errorText2(cause));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`\u5220\u9664\u81EA\u5B9A\u4E49\u5DE5\u5177 ${tool.key}\uFF1F`)) return;
    setBusy(true);
    setError("");
    try {
      await callApi(`/api/tools/custom/${encodeURIComponent(tool.key)}`, "DELETE");
      onSaved();
    } catch (cause) {
      setError(errorText2(cause));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-back", onClick: onBack, children: "\u2190 \u8FD4\u56DE" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { className: "vx-cat-key", children: tool.key }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Pill, { on: Boolean(tool.system), onLabel: "\u7CFB\u7EDF\u5DE5\u5177", offLabel: "\u81EA\u5B9A\u4E49\u5DE5\u5177" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-spacer" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Switch, { on: enabled2, onChange: setEnabled, label: "\u542F\u7528", disabled: tool.system })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u7ED1\u5B9A Agent", children: tool.system ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-hint", children: bound.join("\u3001") || "\u6682\u65E0\u7ED1\u5B9A" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(AgentPicker, { agents, value: bound, onChange: setBound }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u5DE5\u5177\u63CF\u8FF0", hint: "\u53D1\u9001\u7ED9\u6A21\u578B\u7684\u8BF4\u660E\uFF0C\u6A21\u578B\u636E\u6B64\u5224\u65AD\u4F55\u65F6\u8C03\u7528\u3002", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("textarea", { className: "vx-cat-textarea", rows: 5, value: description, onChange: (event) => {
      setDescription(event.target.value);
    } }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u53C2\u6570", hint: tool.system ? "\u53EF\u7F16\u8F91\u53C2\u6570\u8BF4\u660E\u3002\u9ED8\u8BA4\u503C\u3001\u542F\u505C\u548C Agent \u7ED1\u5B9A\u5728\u6B64\u9875\u53EA\u8BFB\u3002" : "\u53EF\u7F16\u8F91\u53C2\u6570\u63CF\u8FF0\u4E0E\u9ED8\u8BA4\u503C\u3002", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ParamEditor, { schema, onChange: setSchema, defaultsReadOnly: tool.system }) }),
    tool.system ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u6267\u884C\u5668", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("select", { className: "vx-cat-input", value: kind, onChange: (event) => {
        setKind(event.target.value);
      }, children: ["command", "script", "http", "shell"].map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: item, children: item }, item)) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u6267\u884C\u89C4\u683C\uFF08JSON\uFF09", hint: "\u6309\u6267\u884C\u5668\u4E0D\u540C\u586B\u5199\uFF1Acommand/script/http/shell \u5404\u81EA\u7684\u5B57\u6BB5\u89C1\u300A\u81EA\u5B9A\u4E49\u5DE5\u5177\u8BBE\u8BA1\u300B\u3002", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("textarea", { className: "vx-cat-textarea vx-cat-mono", rows: 8, value: exec, onChange: (event) => {
        setExec(event.target.value);
      } }) })
    ] }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-error", children: error }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-btn vx-cat-btn--primary", disabled: busy, onClick: () => {
        void save();
      }, children: "\u4FDD\u5B58" }),
      tool.system ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-btn", disabled: busy, onClick: () => {
        void reset();
      }, children: "\u6062\u590D\u9ED8\u8BA4\u8BF4\u660E" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-btn vx-cat-btn--danger", disabled: busy, onClick: () => {
        void remove();
      }, children: "\u5220\u9664" })
    ] })
  ] });
}
function NewTool({ agents, onBack, onSaved }) {
  const [key, setKey] = (0, import_react7.useState)("");
  const [kind, setKind] = (0, import_react7.useState)("command");
  const [description, setDescription] = (0, import_react7.useState)("");
  const [bound, setBound] = (0, import_react7.useState)([]);
  const [enabled2, setEnabled] = (0, import_react7.useState)(true);
  const [exec, setExec] = (0, import_react7.useState)('{\n  "command": "echo hello"\n}');
  const [schema, setSchema] = (0, import_react7.useState)('{\n  "type": "object",\n  "properties": {}\n}');
  const [busy, setBusy] = (0, import_react7.useState)(false);
  const [error, setError] = (0, import_react7.useState)("");
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      await callApi("/api/tools/custom", "POST", {
        key: key.trim(),
        description,
        agents: bound,
        enabled: enabled2,
        kind,
        exec: parseJson(exec, {}),
        schema: parseJson(schema, {}),
        deferred: false
      });
      onSaved();
    } catch (cause) {
      setError(errorText2(cause));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-back", onClick: onBack, children: "\u2190 \u8FD4\u56DE" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-title", children: "\u65B0\u5EFA\u81EA\u5B9A\u4E49\u5DE5\u5177" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-spacer" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Switch, { on: enabled2, onChange: setEnabled, label: "\u542F\u7528" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "Key", hint: "\u5C0F\u5199\u5B57\u6BCD\u5F00\u5934\uFF0C\u53EA\u542B\u5C0F\u5199\u5B57\u6BCD/\u6570\u5B57/\u4E0B\u5212\u7EBF\uFF1B\u4FDD\u5B58\u540E\u4E0D\u53EF\u6539\uFF08\u4E0E Go \u6267\u884C\u5668\u7ED1\u5B9A\uFF09\u3002", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { className: "vx-cat-input vx-cat-mono", placeholder: "my_tool", value: key, onChange: (event) => {
      setKey(event.target.value);
    } }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u6267\u884C\u5668", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("select", { className: "vx-cat-input", value: kind, onChange: (event) => {
      setKind(event.target.value);
    }, children: ["command", "script", "http", "shell"].map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: item, children: item }, item)) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u7ED1\u5B9A Agent", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(AgentPicker, { agents, value: bound, onChange: setBound }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u5DE5\u5177\u63CF\u8FF0", hint: "\u53D1\u9001\u7ED9\u6A21\u578B\uFF0C\u5199\u6E05\u695A\u5B83\u505A\u4EC0\u4E48\u3001\u4EC0\u4E48\u65F6\u5019\u7528\u3002", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("textarea", { className: "vx-cat-textarea", rows: 4, value: description, onChange: (event) => {
      setDescription(event.target.value);
    } }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u53C2\u6570 JSON Schema", hint: "http \u6267\u884C\u5668\u5FC5\u987B\u58F0\u660E\u53C2\u6570\uFF1B\u5176\u4F59\u6267\u884C\u5668\u53EF\u7559\u7A7A\u5BF9\u8C61\u3002", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("textarea", { className: "vx-cat-textarea vx-cat-mono", rows: 6, value: schema, onChange: (event) => {
      setSchema(event.target.value);
    } }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u6267\u884C\u89C4\u683C\uFF08JSON\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("textarea", { className: "vx-cat-textarea vx-cat-mono", rows: 8, value: exec, onChange: (event) => {
      setExec(event.target.value);
    } }) }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-error", children: error }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-footer", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-btn vx-cat-btn--primary", disabled: busy || key.trim() === "", onClick: () => {
      void create();
    }, children: "\u521B\u5EFA" }) })
  ] });
}
var TRANSPORTS = ["stdio", "streamable-http", "http", "sse"];
function McpTab() {
  const [nonce2, setNonce] = (0, import_react7.useState)(0);
  const [view, setView] = (0, import_react7.useState)({ kind: "list" });
  const [notice, setNotice] = (0, import_react7.useState)("");
  const [busy, setBusy] = (0, import_react7.useState)(false);
  const servers = useApi("/api/mcp", [nonce2]);
  const rows = servers.data?.servers ?? [];
  const refresh = () => {
    setNonce(nonce2 + 1);
  };
  const registerDefaults = async () => {
    setBusy(true);
    setNotice("");
    try {
      const result = await callApi("/api/mcp/register", "POST", {});
      setNotice(`\u5DF2\u91CD\u65B0\u6CE8\u518C\uFF1A\u65B0\u589E ${result.serversAdded ?? 0} \u4E2A\uFF0C\u5171 ${result.serversTotal ?? 0} \u4E2A server`);
      refresh();
    } catch (cause) {
      setNotice(`\u6CE8\u518C\u5931\u8D25\uFF1A${errorText2(cause)}`);
    } finally {
      setBusy(false);
    }
  };
  if (view.kind === "edit") {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ServerDetail, { server: view.server, onBack: () => {
      setView({ kind: "list" });
    }, onSaved: () => {
      refresh();
      setView({ kind: "list" });
    } });
  }
  if (view.kind === "new") {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ServerDetail, { server: { id: 0, name: "", transport: "stdio", args: [], env: {}, enabled: true, insecure: false }, onBack: () => {
      setView({ kind: "list" });
    }, onSaved: () => {
      refresh();
      setView({ kind: "list" });
    } });
  }
  if (servers.loading) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-hint", children: "\u52A0\u8F7D\u4E2D\u2026" });
  if (servers.error) return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-error", children: servers.error });
  const toggle = async (row) => {
    try {
      await callApi(`/api/mcp/${row.id}/enabled`, "PUT", { enabled: !row.enabled });
      refresh();
    } catch (cause) {
      window.alert(errorText2(cause));
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "vx-cat-lead", children: "\u5E73\u53F0\u6CE8\u518C\u7684 MCP server\uFF0C\u6CE8\u518C\u8868\u5728 TS core \u91CC\uFF08\u5B58\u50A8\u3001\u589E\u5220\u6539\u3001\u5DE5\u5177\u53D1\u73B0\u90FD\u5728\u8FD9\u4E00\u4FA7\uFF09\u3002 \u9ED8\u8BA4\u7684\u4E09\u4E2A server \u53EA\u5728\u9996\u6B21\u542F\u52A8\u65F6\u704C\u5165\uFF1B\u5220\u6389\u5C31\u662F\u5220\u6389\uFF0C\u8981\u6062\u590D\u70B9\u300C\u91CD\u65B0\u6CE8\u518C\u9ED8\u8BA4\u300D\u3002 dsh \u81EA\u5DF1\u90A3\u5EA7 MCP \u8230\u961F\u5728\u63D2\u4EF6\u9875\u7BA1\u7406\uFF0C\u4E24\u8FB9\u662F\u4E0D\u540C\u5C42\uFF0C\u522B\u628A\u540C\u540D server \u5F53\u6210\u540C\u4E00\u4EFD\u914D\u7F6E\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "vx-cat-count", children: [
        rows.length,
        " \u4E2A server"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-spacer" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-btn", disabled: busy, onClick: () => {
        void registerDefaults();
      }, children: "\u91CD\u65B0\u6CE8\u518C\u9ED8\u8BA4" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-btn vx-cat-btn--primary", onClick: () => {
        setView({ kind: "new" });
      }, children: "+ \u65B0\u5EFA server" })
    ] }),
    notice ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-notice", children: notice }) : null,
    rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-hint", children: "\u8FD8\u6CA1\u6709 MCP server\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-grid", children: rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-card vx-cat-card--row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("button", { type: "button", className: "vx-cat-card-main", onClick: () => {
        setView({ kind: "edit", server: row });
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "vx-cat-card-top", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { className: "vx-cat-key", children: row.name }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Pill, { on: Boolean(row.enabled) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-desc", children: row.url || row.command || "\uFF08\u672A\u914D\u7F6E\u5730\u5740\uFF09" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "vx-cat-meta", children: [
          row.transport,
          " \xB7 ",
          (row.tools ?? []).length,
          " \u4E2A\u5DE5\u5177"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-mini", onClick: () => {
        void toggle(row);
      }, children: row.enabled ? "\u505C\u7528" : "\u542F\u7528" })
    ] }, row.id)) })
  ] });
}
function ServerDetail({ server, onBack, onSaved }) {
  const isNew = server.id === 0;
  const [name, setName] = (0, import_react7.useState)(server.name);
  const [transport, setTransport] = (0, import_react7.useState)(server.transport || "stdio");
  const [command, setCommand] = (0, import_react7.useState)(server.command ?? "");
  const [args, setArgs] = (0, import_react7.useState)(() => pretty(server.args ?? []));
  const [env, setEnv] = (0, import_react7.useState)(() => pretty(server.env ?? {}));
  const [url, setUrl] = (0, import_react7.useState)(server.url ?? "");
  const [enabled2, setEnabled] = (0, import_react7.useState)(Boolean(server.enabled));
  const [insecure, setInsecure] = (0, import_react7.useState)(Boolean(server.insecure));
  const [busy, setBusy] = (0, import_react7.useState)(false);
  const [error, setError] = (0, import_react7.useState)("");
  const [notice, setNotice] = (0, import_react7.useState)("");
  const [toolsNonce, setToolsNonce] = (0, import_react7.useState)(0);
  const cached = useApi(isNew ? "/api/mcp" : `/api/mcp/${server.id}/tools`, [server.id, toolsNonce]);
  const cachedTools = isNew ? [] : cached.data?.tools ?? [];
  const save = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callApi("/api/mcp", "POST", {
        id: server.id,
        name: name.trim(),
        transport,
        command,
        url,
        args: parseJson(args, []),
        env: parseJson(env, {}),
        enabled: enabled2,
        insecure
      });
      onSaved();
    } catch (cause) {
      setError(errorText2(cause));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`\u5220\u9664 MCP server ${server.name}\uFF1F`)) return;
    setBusy(true);
    setError("");
    try {
      await callApi(`/api/mcp/${server.id}`, "DELETE");
      onSaved();
    } catch (cause) {
      setError(errorText2(cause));
    } finally {
      setBusy(false);
    }
  };
  const reloadTools = async () => {
    if (isNew) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callApi(`/api/mcp/${server.id}/refresh`, "POST", {});
      setNotice("\u5DF2\u5237\u65B0\u5DE5\u5177\u5217\u8868");
      setToolsNonce(toolsNonce + 1);
    } catch (cause) {
      setError(errorText2(cause));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-back", onClick: onBack, children: "\u2190 \u8FD4\u56DE" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { className: "vx-cat-key", children: isNew ? "\u65B0\u5EFA server" : server.name }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-spacer" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Switch, { on: enabled2, onChange: setEnabled, label: "\u542F\u7528" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { className: "vx-cat-input", value: name, onChange: (event) => {
      setName(event.target.value);
    } }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u4F20\u8F93", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("select", { className: "vx-cat-input", value: transport, onChange: (event) => {
      setTransport(event.target.value);
    }, children: TRANSPORTS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: item, children: item }, item)) }) }),
    transport === "stdio" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u547D\u4EE4", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { className: "vx-cat-input vx-cat-mono", placeholder: "npx", value: command, onChange: (event) => {
        setCommand(event.target.value);
      } }) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u53C2\u6570\uFF08JSON \u6570\u7EC4\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("textarea", { className: "vx-cat-textarea vx-cat-mono", rows: 4, value: args, onChange: (event) => {
        setArgs(event.target.value);
      } }) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u73AF\u5883\u53D8\u91CF\uFF08JSON \u5BF9\u8C61\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("textarea", { className: "vx-cat-textarea vx-cat-mono", rows: 4, value: env, onChange: (event) => {
        setEnv(event.target.value);
      } }) })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "URL", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { className: "vx-cat-input vx-cat-mono", placeholder: "https://host/mcp", value: url, onChange: (event) => {
      setUrl(event.target.value);
    } }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "TLS", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Switch, { on: insecure, onChange: setInsecure, label: "\u8DF3\u8FC7\u8BC1\u4E66\u6821\u9A8C\uFF08\u81EA\u7B7E\u670D\u52A1\u5668\uFF09" }) }),
    isNew ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: `\u5DF2\u7F13\u5B58\u5DE5\u5177\uFF08${cachedTools.length}\uFF09`, hint: "\u53D1\u73B0\u7ED3\u679C\u6765\u81EA\u4E0A\u4E00\u6B21\u5237\u65B0\uFF1B\u70B9\u4E0B\u65B9\u300C\u5237\u65B0\u5DE5\u5177\u5217\u8868\u300D\u5411\u540E\u7AEF\u91CD\u65B0\u62C9\u53D6\u3002", children: cachedTools.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-hint", children: "\u8FD8\u6CA1\u6709\u7F13\u5B58\u3002\u542F\u7528\u540E\u5237\u65B0\u4E00\u6B21\u5373\u53EF\u770B\u5230\u8BE5 server \u7684\u5DE5\u5177\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-chips", children: cachedTools.slice(0, 40).map((tool) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "vx-cat-chip", title: tool.description ?? "", children: tool.name }, tool.name)) }) }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-error", children: error }) : null,
    notice ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "vx-cat-notice", children: notice }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "vx-cat-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-btn vx-cat-btn--primary", disabled: busy || name.trim() === "", onClick: () => {
        void save();
      }, children: "\u4FDD\u5B58" }),
      isNew ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-btn", disabled: busy, onClick: () => {
        void reloadTools();
      }, children: "\u5237\u65B0\u5DE5\u5177\u5217\u8868" }),
      isNew ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "vx-cat-btn vx-cat-btn--danger", disabled: busy, onClick: () => {
        void remove();
      }, children: "\u5220\u9664" })
    ] })
  ] });
}

// src/tasks/workspace.tsx
var import_react11 = require("react");

// src/components/kit.tsx
var import_react8 = require("react");
var import_react_dom2 = require("react-dom");
var import_jsx_runtime6 = require("react/jsx-runtime");
function PageShell({ title, desc, actions, status, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "vx-ui-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("header", { className: "vx-ui-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "vx-ui-head-main", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h1", { className: "vx-ui-title", children: title }),
        desc === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "vx-ui-desc", children: desc })
      ] }),
      actions === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "vx-ui-head-actions", children: actions })
    ] }),
    status === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "vx-ui-statusline", children: status }),
    children
  ] });
}
function Kpi({ label, value, unit, hint, tone = "neutral", onClick, active, corner }) {
  const className = [
    "vx-ui-kpi",
    `vx-ui-tone-${tone}`,
    onClick === void 0 ? "" : "vx-ui-kpi--action",
    active === true ? "is-active" : ""
  ].filter(Boolean).join(" ");
  const body = /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "vx-ui-kpi-top", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "vx-ui-kpi-label", children: label }),
      corner === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "vx-ui-kpi-corner", children: corner })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "vx-ui-kpi-value", children: [
      value,
      unit === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("em", { children: unit })
    ] }),
    hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "vx-ui-kpi-hint", children: hint })
  ] });
  if (onClick === void 0) return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className, children: body });
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className, onClick, "aria-pressed": active === true, children: body });
}
function KpiGrid({ children, min = 148 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "vx-ui-kpis", style: { "--vx-kpi-min": `${min}px` }, children });
}
function Card({ title, hint, actions, children, scroll, className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { className: `vx-ui-card${className === void 0 ? "" : ` ${className}`}`, children: [
    title === void 0 && actions === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("header", { className: "vx-ui-card-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "vx-ui-card-titles", children: [
        title === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h2", { className: "vx-ui-card-title", children: title }),
        hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "vx-ui-card-hint", children: hint })
      ] }),
      actions === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "vx-ui-card-actions", children: actions })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: scroll === true ? "vx-ui-card-body vx-ui-card-body--scroll" : "vx-ui-card-body", children })
  ] });
}
function Split({ main, rail }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "vx-ui-split", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "vx-ui-split-main", children: main }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("aside", { className: "vx-ui-split-rail", children: rail })
  ] });
}
function Toolbar({ children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "vx-ui-toolbar", children });
}
function Spacer() {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "vx-ui-spacer" });
}
function Segmented2({ value, options, onChange, label }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "vx-ui-seg", role: "group", "aria-label": label ?? "\u89C6\u56FE", children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
    "button",
    {
      type: "button",
      "aria-pressed": option.value === value,
      title: option.hint,
      onClick: () => onChange(option.value),
      children: [
        option.label,
        option.count === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("em", { children: option.count })
      ]
    },
    option.value
  )) });
}
function Chip({ tone = "neutral", dot, children, title }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: `vx-ui-chip vx-ui-tone-${tone}`, title, children: [
    dot === true ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("i", { className: "vx-ui-chip-dot" }) : null,
    children
  ] });
}
var METHOD_TONE = {
  GET: "blue",
  POST: "green",
  PUT: "amber",
  PATCH: "violet",
  DELETE: "red",
  HEAD: "neutral",
  OPTIONS: "violet"
};
function MethodBadge({ method }) {
  const key = (method || "GET").toUpperCase();
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: `vx-ui-method vx-ui-tone-${METHOD_TONE[key] ?? "neutral"}`, children: key });
}
function StatusBadge({ status }) {
  const tone = status >= 500 ? "red" : status >= 400 ? "amber" : status >= 300 ? "violet" : status >= 200 ? "green" : "neutral";
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: `vx-ui-badge vx-ui-tone-${tone}`, children: status === 0 ? "\u2014" : status });
}
function DataTable({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  loading,
  empty,
  sort,
  onSort,
  dense,
  maxHeight
}) {
  if (loading === true && rows.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Skeleton, { rows: 6 });
  if (rows.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_jsx_runtime6.Fragment, { children: empty ?? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(EmptyState, { title: "\u6CA1\u6709\u6570\u636E", hint: "\u8C03\u6574\u7B5B\u9009\u6761\u4EF6\u540E\u91CD\u8BD5" }) });
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    "div",
    {
      className: dense === true ? "vx-ui-table-wrap vx-ui-table-wrap--dense" : "vx-ui-table-wrap",
      style: maxHeight === void 0 ? void 0 : { maxHeight },
      children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("table", { className: "vx-ui-table", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tr", { children: columns.map((column) => {
          const sorted = sort?.key === column.key;
          const sortable = column.sortable === true && onSort !== void 0;
          return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "th",
            {
              style: column.width === void 0 ? void 0 : { width: column.width },
              "data-align": column.align ?? "left",
              "data-sticky": column.sticky === true ? "right" : void 0,
              "aria-sort": sorted ? sort?.dir === "asc" ? "ascending" : "descending" : "none",
              children: sortable ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("button", { type: "button", className: "vx-ui-th-btn", onClick: () => onSort?.(column.key), children: [
                column.header,
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("i", { "data-dir": sorted ? sort?.dir : "none", "aria-hidden": "true", children: "\u2195" })
              ] }) : column.header
            },
            column.key
          );
        }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tbody", { children: rows.map((row) => {
          const key = rowKey(row);
          return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "tr",
            {
              "data-selected": selectedKey === key ? "true" : void 0,
              "data-clickable": onRowClick === void 0 ? void 0 : "true",
              onClick: onRowClick === void 0 ? void 0 : () => onRowClick(row),
              children: columns.map((column) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "td",
                {
                  "data-align": column.align ?? "left",
                  "data-sticky": column.sticky === true ? "right" : void 0,
                  className: column.mono === true ? "is-mono" : void 0,
                  title: column.title?.(row),
                  children: column.render(row)
                },
                column.key
              ))
            },
            key
          );
        }) })
      ] })
    }
  );
}
function ApiErrorLine({ error, detail, onRetry }) {
  const info = detail !== null && typeof detail === "object" ? detail : {};
  const path = typeof info["path"] === "string" ? info["path"] : "";
  const method = typeof info["method"] === "string" ? info["method"] : "";
  const hint = typeof info["hint"] === "string" ? info["hint"] : "";
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Banner, { tone: "red", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("strong", { children: error }),
    path === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "vx-ui-muted", children: [
      " \xB7 ",
      method,
      " ",
      path
    ] }),
    hint === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "vx-ui-muted", children: [
      " \xB7 ",
      hint
    ] }),
    onRetry === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "vx-ui-banner-link", onClick: onRetry, children: "\u91CD\u8BD5" })
  ] });
}
function EmptyState({ title, hint, action }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "vx-ui-empty", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("svg", { width: "26", height: "26", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.4", "aria-hidden": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2.5" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "M3 10h18M8 15h3", strokeLinecap: "round" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("strong", { children: title }),
    hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { children: hint }),
    action === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "vx-ui-empty-action", children: action })
  ] });
}
function Skeleton({ rows = 4 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "vx-ui-skeleton", "aria-busy": "true", "aria-live": "polite", children: Array.from({ length: rows }, (_, index) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("i", {}, index)) });
}
function Banner({ tone = "amber", children, onDismiss }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: `vx-ui-banner vx-ui-tone-${tone}`, role: "alert", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "vx-ui-banner-text", children }),
    onDismiss === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "vx-ui-banner-close", onClick: onDismiss, "aria-label": "\u5173\u95ED\u63D0\u793A", children: "\xD7" })
  ] });
}
function Field2({ label, hint, children, inline }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: inline === true ? "vx-ui-field vx-ui-field--inline" : "vx-ui-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "vx-ui-field-label", children: label }),
    children,
    hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "vx-ui-field-hint", children: hint })
  ] });
}
function TextInput(props2) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    "input",
    {
      className: props2.mono === true ? "vx-ui-input is-mono" : "vx-ui-input",
      type: props2.type ?? "text",
      value: props2.value,
      placeholder: props2.placeholder,
      "aria-label": props2.ariaLabel ?? props2.placeholder ?? "\u8F93\u5165",
      disabled: props2.disabled === true,
      style: props2.width === void 0 ? void 0 : { width: props2.width },
      onChange: (event) => props2.onChange(event.target.value)
    }
  );
}
function TextArea(props2) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    "textarea",
    {
      className: props2.mono === true ? "vx-ui-textarea is-mono" : "vx-ui-textarea",
      rows: props2.rows ?? 4,
      value: props2.value,
      placeholder: props2.placeholder,
      onChange: (event) => props2.onChange(event.target.value)
    }
  );
}
function Select({ value, options, onChange, label }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    "select",
    {
      className: "vx-ui-select",
      value,
      "aria-label": label,
      onChange: (event) => onChange(event.target.value),
      children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: option.value, children: option.label }, option.value))
    }
  );
}
function Button({ variant = "default", busy, disabled, onClick, children, title, size }) {
  const className = [
    "vx-ui-btn",
    `vx-ui-btn--${variant}`,
    size === "sm" ? "vx-ui-btn--sm" : "",
    busy === true ? "is-busy" : ""
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("button", { type: "button", className, onClick, disabled: disabled === true || busy === true, title, children: [
    busy === true ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("i", { className: "vx-ui-spin", "aria-hidden": "true" }) : null,
    children
  ] });
}
function Meter({ value, tone = "green", label }) {
  const ratio = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "vx-ui-meter", title: label, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("i", { style: { width: `${ratio * 100}%`, background: `var(--vx-tone)` }, className: `vx-ui-tone-${tone}` }) });
}
function KeyValue({ rows }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dl", { className: "vx-ui-kv", children: rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dt", { children: row.label }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("dd", { children: row.value })
  ] }, row.label)) });
}
function Pager({ page, pageCount, total, unit, onPage }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "vx-ui-pager", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "vx-ui-pager-total", children: [
      "\u5171 ",
      total.toLocaleString("zh-CN"),
      " ",
      unit
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Spacer, {}),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { size: "sm", disabled: page <= 0, onClick: () => onPage(page - 1), children: "\u4E0A\u4E00\u9875" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "vx-ui-pager-page", children: [
      pageCount === 0 ? 0 : page + 1,
      " / ",
      pageCount
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { size: "sm", disabled: page + 1 >= pageCount, onClick: () => onPage(page + 1), children: "\u4E0B\u4E00\u9875" })
  ] });
}
function Drawer({ open, title, subtitle, meta, onClose, children, footer, width = 780 }) {
  (0, import_react8.useEffect)(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (0, import_react_dom2.createPortal)(
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "vx-ui-drawer-root", role: "dialog", "aria-modal": "true", "aria-label": typeof title === "string" ? title : "\u8BE6\u60C5", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "vx-ui-drawer-backdrop", onClick: onClose, "aria-label": "\u5173\u95ED\u8BE6\u60C5" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "vx-ui-drawer", style: { width: `min(${width}px, 94vw)` }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("header", { className: "vx-ui-drawer-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "vx-ui-drawer-titles", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("strong", { children: title }),
            subtitle === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: subtitle })
          ] }),
          meta === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "vx-ui-drawer-meta", children: meta }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "vx-ui-drawer-close", onClick: onClose, "aria-label": "\u5173\u95ED", children: "\xD7" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "vx-ui-drawer-body", children }),
        footer === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("footer", { className: "vx-ui-drawer-foot", children: footer })
      ] })
    ] }),
    document.body
  );
}
function useCopy() {
  const [copied, setCopied] = (0, import_react8.useState)("");
  const timer = (0, import_react8.useRef)(0);
  const copy = (0, import_react8.useCallback)((text, label = "\u5185\u5BB9") => {
    const done = () => {
      setCopied(label);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(""), 1600);
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(done).catch(() => done());
    } else {
      done();
    }
  }, []);
  (0, import_react8.useEffect)(() => () => window.clearTimeout(timer.current), []);
  return { copy, copied };
}
function CodeBlock({ text, maxHeight = 320, empty = "\uFF08\u7A7A\uFF09" }) {
  const content = text === "" ? empty : text;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("pre", { className: "vx-ui-code", style: { maxHeight }, children: content });
}

// src/data/format.ts
function fmtBytes(value) {
  const size = Number(value) || 0;
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function fmtCount(value) {
  const count = Number(value) || 0;
  const abs = Math.abs(count);
  if (abs >= 1e8) return `${(count / 1e8).toFixed(1)}\u4EBF`;
  if (abs >= 1e4) return `${(count / 1e4).toFixed(abs >= 1e5 ? 0 : 1)}\u4E07`;
  return String(Math.round(count));
}
function fmtInt2(value) {
  return (Number(value) || 0).toLocaleString("zh-CN");
}
function fmtPercent(value, digits = 1) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio)) return "\u2014";
  return `${(ratio * 100).toFixed(digits)}%`;
}
function fmtMs(value) {
  const ms = Number(value) || 0;
  if (ms <= 0) return "\u2014";
  if (ms < 1e3) return `${Math.round(ms)}ms`;
  return `${(ms / 1e3).toFixed(1)}s`;
}
function toMillis(value) {
  if (value === void 0 || value === "") return 0;
  if (typeof value === "number") return value > 1e12 ? value : value * 1e3;
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric * 1e3 : 0;
}
function fmtTime(value) {
  const ms = toMillis(value);
  if (!ms) return "\u2014";
  const date = new Date(ms);
  const now = /* @__PURE__ */ new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("zh-CN", { hour12: false });
  if (sameDay) return time;
  return `${date.toLocaleDateString("zh-CN")} ${time}`;
}
function fmtRelative(value) {
  const ms = toMillis(value);
  if (!ms) return "\u2014";
  const diff = Date.now() - ms;
  if (diff < 0) return "\u521A\u521A";
  if (diff < 6e4) return `${Math.max(1, Math.floor(diff / 1e3))} \u79D2\u524D`;
  if (diff < 36e5) return `${Math.floor(diff / 6e4)} \u5206\u949F\u524D`;
  if (diff < 864e5) return `${Math.floor(diff / 36e5)} \u5C0F\u65F6\u524D`;
  if (diff < 7 * 864e5) return `${Math.floor(diff / 864e5)} \u5929\u524D`;
  return new Date(ms).toLocaleDateString("zh-CN");
}
function fmtRemaining(value) {
  const ms = toMillis(value);
  if (!ms) return "\u2014";
  const diff = ms - Date.now();
  if (diff <= 0) return "\u5DF2\u8FC7\u671F";
  const minutes = Math.floor(diff / 6e4);
  if (minutes < 1) return `${Math.floor(diff / 1e3)} \u79D2`;
  if (minutes < 60) return `${minutes} \u5206`;
  return `${Math.floor(minutes / 60)} \u5C0F\u65F6 ${minutes % 60} \u5206`;
}
function statusClass2(status) {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "other";
}

// src/data/metrics.ts
var METHOD_ORDER = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
var STATUS_ORDER = ["2xx", "3xx", "4xx", "5xx", "other"];
function trafficMetrics(input) {
  const rows = input.rows ?? [];
  const totals = input.totals;
  const hostRows = input.hosts ?? [];
  const webSessions = input.webSessions ?? [];
  const statusBuckets = new Map(STATUS_ORDER.map((key) => [key, 0]));
  const methodBuckets = new Map(METHOD_ORDER.map((key) => [key, 0]));
  let errors = 0;
  let bytes = 0;
  for (const row of rows) {
    const key = statusClass2(row.status);
    statusBuckets.set(key, (statusBuckets.get(key) ?? 0) + 1);
    methodBuckets.set(row.method, (methodBuckets.get(row.method) ?? 0) + 1);
    if (key === "4xx" || key === "5xx") errors += 1;
    bytes += row.bytes;
  }
  const statusLabel2 = { "2xx": "2xx \u6210\u529F", "3xx": "3xx \u8DF3\u8F6C", "4xx": "4xx \u5BA2\u6237\u7AEF", "5xx": "5xx \u670D\u52A1\u7AEF", other: "\u65E0\u72B6\u6001" };
  return {
    total: totals?.total ?? rows.length,
    local: totals?.local ?? rows.filter((row) => row.source === "local").length,
    archived: totals?.archived ?? rows.filter((row) => row.source === "archive").length,
    web: webSessions.reduce((sum, session) => sum + session.requestCount, 0),
    hosts: hostRows.length,
    sampleSize: rows.length,
    errors,
    errorRate: rows.length === 0 ? 0 : errors / rows.length,
    bytes,
    byStatus: STATUS_ORDER.map((key) => ({ key, label: statusLabel2[key] ?? key, count: statusBuckets.get(key) ?? 0 })).filter((row) => row.count > 0),
    byMethod: [...methodBuckets.entries()].filter(([, count]) => count > 0).map(([key, count]) => ({ key, label: key, count })).sort((left, right) => right.count - left.count),
    topHosts: hostRows.slice(0, 8).map((row) => ({ host: row.host, count: row.count })),
    captureActive: input.capture?.active === true,
    captureSessions: input.capture?.sessions.length ?? 0,
    lastTs: input.capture?.lastTs ?? 0
  };
}
function proxyMetrics(state, options = {}) {
  const nodes = state?.nodes ?? [];
  const pools = state?.pools ?? [];
  const enabledNodes = nodes.filter((node) => node.enabled);
  const bucket = (name) => enabledNodes.filter((node) => node.state === name).length;
  const pooled = new Set(pools.flatMap((pool) => pool.members));
  const totalRequests = enabledNodes.reduce((sum, node) => sum + node.requests, 0);
  const totalFailures = enabledNodes.reduce((sum, node) => sum + node.failures, 0);
  const latencyNodes = enabledNodes.filter((node) => node.latencyMs > 0);
  return {
    nodes: nodes.length,
    enabled: enabledNodes.length,
    up: bucket("up"),
    degraded: bucket("degraded"),
    down: bucket("down"),
    cooldown: bucket("cooldown"),
    unknown: bucket("unknown"),
    healthRate: enabledNodes.length === 0 ? 0 : bucket("up") / enabledNodes.length,
    avgLatencyMs: latencyNodes.length === 0 ? 0 : Math.round(latencyNodes.reduce((sum, node) => sum + node.latencyMs, 0) / latencyNodes.length),
    successRate: totalRequests === 0 ? 0 : Math.max(0, (totalRequests - totalFailures) / totalRequests),
    requests: totalRequests,
    failures: totalFailures,
    inflight: enabledNodes.reduce((sum, node) => sum + node.inflight, 0),
    pools: pools.length,
    defaultPoolName: pools.find((pool) => pool.id === state?.defaultPool)?.name ?? "",
    leases: state?.leases.length ?? 0,
    unpooled: enabledNodes.filter((node) => !pooled.has(node.id)).length,
    subscriptionsDown: options.subscriptionsDown ?? 0
  };
}
function taskMetrics(summary) {
  const byStatus = summary?.by_status ?? {};
  const done = summary?.done ?? Number(byStatus["done"] ?? 0);
  const failed = summary?.failed ?? Number(byStatus["failed"] ?? 0);
  const timeout = summary?.timeout ?? Number(byStatus["timeout"] ?? 0);
  const terminal = summary?.terminal ?? done + failed + timeout;
  return {
    total: summary?.total ?? 0,
    active: summary?.active ?? Number(byStatus["running"] ?? 0) + Number(byStatus["queued"] ?? 0),
    paused: summary?.paused ?? Number(byStatus["paused"] ?? 0),
    done,
    failed,
    timeout,
    terminal,
    completionRate: summary?.completion_rate ?? (terminal === 0 ? 0 : done / terminal),
    goalRate: summary?.goal_rate ?? 0,
    goalsMet: summary?.goals_met ?? 0,
    goalsTotal: summary?.goals_total ?? 0,
    inFlight: summary?.in_flight ?? 0,
    tokens: summary?.tokens?.total ?? 0,
    findings: summary?.findings ?? { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
  };
}

// src/tasks/api.ts
var get = (path) => api.get(path);
var post = (path, body) => api.post(path, body);
var patch = (path, body) => api.patch(path, body);
var del = (path) => api.del(path);
function listOf(value, key) {
  if (Array.isArray(value)) return value;
  const inner = value?.[key];
  return Array.isArray(inner) ? inner : [];
}
var tasksApi = {
  list: (params) => get(`/tasks${query({ q: params.q, status: params.status, page: params.page, size: params.size })}`),
  summary: (days = 30) => get(`/tasks/summary${query({ days })}`),
  get: (id) => get(`/tasks/${encodeURIComponent(id)}`),
  create: (input) => post("/tasks", input),
  control: (id, action) => post(`/tasks/${encodeURIComponent(id)}/control`, { action }),
  archive: (id) => post(`/tasks/${encodeURIComponent(id)}/archive`),
  archives: (page) => get(`/task-archives${query({ page, size: 20 })}`),
  restoreArchive: (id) => post(`/task-archives/${id}/restore`),
  deleteArchive: (id) => del(`/task-archives/${id}`),
  remove: (id) => del(`/tasks/${encodeURIComponent(id)}`),
  stats: (id) => get(`/stats${query({ task: id })}`),
  intents: (id) => get(`/exploration/intents${query({ task: id })}`).then((value) => listOf(value, "intents")),
  intentsRerunBlocked: (id) => post(`/tasks/${encodeURIComponent(id)}/intents/rerun-blocked`),
  activity: (id, limit = 80) => get(`/exploration/activity${query({ task: id, limit })}`).then((value) => listOf(value, "items")),
  activityHistory: (id, session, before = 0, limit = 100) => get(
    `/exploration/activity/history${query({ task: id, session, before, limit })}`
  ).then((value) => ({
    items: listOf(value, "items"),
    hasMore: Boolean(value?.has_more),
    earliestCursor: value?.earliest_cursor ?? 0
  })),
  mainSessions: (id) => get(`/exploration/main-sessions${query({ task: id })}`),
  newMainSession: (id) => post(`/exploration/main-session/new${query({ task: id })}`),
  chat: (id, message, seg) => post(`/chat${query({ task: id })}`, { message, seg }),
  chatStop: (id) => post(`/tasks/${encodeURIComponent(id)}/chat/stop`, {}),
  goals: (id) => get(`/tasks/${encodeURIComponent(id)}/goals`).then((value) => listOf(value, "goals")),
  addGoal: (id, text, vulnclass = "") => post(`/tasks/${encodeURIComponent(id)}/goals`, { text, vulnclass }),
  updateGoal: (id, goalId, text, vulnclass = "") => patch(`/tasks/${encodeURIComponent(id)}/goals/${goalId}`, { text, vulnclass }),
  deleteGoal: (id, goalId) => del(`/tasks/${encodeURIComponent(id)}/goals/${goalId}`),
  constraints: (id) => get(`/tasks/${encodeURIComponent(id)}/constraints`).then((value) => listOf(value, "constraints")),
  addConstraint: (id, text, kind) => post(`/tasks/${encodeURIComponent(id)}/constraints`, { text, kind }),
  deleteConstraint: (id, constraintId) => del(`/tasks/${encodeURIComponent(id)}/constraints/${constraintId}`),
  scope: (id) => get(`/tasks/${encodeURIComponent(id)}/scope`).then((value) => listOf(value, "scope")),
  addScope: (id, kind, value, reason = "") => post(`/tasks/${encodeURIComponent(id)}/scope`, { kind, value, reason }),
  deleteScope: (id, scopeId) => del(`/tasks/${encodeURIComponent(id)}/scope/${scopeId}`),
  rules: (id) => get(`/tasks/${encodeURIComponent(id)}/intercept-rules`).then((value) => listOf(value, "rules")),
  addRule: (id, rule) => post(`/tasks/${encodeURIComponent(id)}/intercept-rules`, rule),
  toggleRule: (id, ruleId, enabled2) => post(`/tasks/${encodeURIComponent(id)}/intercept-rules/${ruleId}/toggle`, { enabled: enabled2 }),
  deleteRule: (id, ruleId) => del(`/tasks/${encodeURIComponent(id)}/intercept-rules/${ruleId}`),
  coverage: (id) => get(`/tasks/${encodeURIComponent(id)}/coverage`),
  coverageGraph: (id) => get(`/tasks/${encodeURIComponent(id)}/coverage-graph`),
  tokens: (id) => get(`/llm/records/by-model${query({ task: id })}`).then((value) => listOf(value, "models")),
  findings: (id, page = 1, limit = 20, extra = {}) => get(`/exploration/findings${query({ task: id, page, limit, ...extra })}`).then(
    (value) => ({ items: listOf(value, "items"), total: value?.total ?? listOf(value, "items").length })
  ),
  setFindingStatus: (findingId, status) => patch(`/exploration/findings/${findingId}`, { status }),
  findingRetests: (findingId) => get(`/exploration/findings/${findingId}/retests`),
  startRetest: (findingId, notes) => post(`/exploration/findings/${findingId}/retests`, { notes }),
  assets: (id, type = "", limit = 50, offset = 0, dsl = "") => get(`/assets${query({ task_id: id, type, limit, offset, dsl })}`).then(
    (value) => ({
      assets: listOf(value, "assets").map((asset) => ({
        ...asset,
        // 一个展示值：不同资产类型的落点字段不同，统一在这里挑第一个有值的。
        display: asset.url || asset.domain || asset.root_domain || asset.host || asset.ip || asset.value || `#${asset.id}`,
        origin: asset.task_source_summary || asset.task_source || "\u2014"
      })),
      total: value?.total ?? value?.count ?? 0
    })
  ),
  detachAsset: (id, assetId) => del(`/tasks/${encodeURIComponent(id)}/assets/${assetId}`),
  attachAssets: (id, assetIds) => post(`/tasks/${encodeURIComponent(id)}/assets`, { asset_ids: assetIds, source_summary: "dsh \u624B\u52A8\u6302\u8F7D" }),
  approvals: (id, page = 1, size = 20) => get(`/intercept/history${query({ task_id: id, page, size })}`).then((value) => listOf(value, "items")),
  pending: (id) => get(`/intercept/pending${query({ task: id })}`).then((value) => listOf(value, "pending")),
  decide: (approvalId, decision) => post(`/intercept/pending/${approvalId}/decide`, { decision }),
  report: (id) => get(`/report${query({ task: id })}`)
};
async function reportText(id) {
  const value = await tasksApi.report(id);
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

// src/tasks/hooks.ts
var import_react9 = require("react");
function useResource(key, load2, enabled2 = true) {
  const [state, setState] = (0, import_react9.useState)();
  const [tick, setTick] = (0, import_react9.useState)(0);
  const loadRef = (0, import_react9.useRef)(load2);
  loadRef.current = load2;
  (0, import_react9.useEffect)(() => {
    if (!enabled2) return;
    let alive = true;
    loadRef.current().then((data) => alive && setState({ key, data })).catch((error) => alive && setState({ key, error: error.message }));
    return () => {
      alive = false;
    };
  }, [key, enabled2, tick]);
  const current = state?.key === key ? state : void 0;
  return {
    data: current?.data,
    error: current?.error,
    loading: enabled2 && current === void 0,
    reload: () => setTick((value) => value + 1)
  };
}

// src/tasks/sections.tsx
var import_react10 = require("react");

// src/tasks/ui.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
function relTime(input) {
  if (!input) return "\u2014";
  const time = typeof input === "number" ? input * 1e3 : new Date(input).getTime();
  if (!Number.isFinite(time)) return "\u2014";
  const diff = Date.now() - time;
  if (diff < 6e4) return "\u521A\u521A";
  if (diff < 36e5) return `${Math.floor(diff / 6e4)} \u5206\u949F\u524D`;
  if (diff < 864e5) return `${Math.floor(diff / 36e5)} \u5C0F\u65F6\u524D`;
  if (diff < 7 * 864e5) return `${Math.floor(diff / 864e5)} \u5929\u524D`;
  return new Date(time).toLocaleDateString("zh-CN");
}
var STATUS_TEXT = {
  created: ["\u5F85\u542F\u52A8", "muted"],
  queued: ["\u6392\u961F\u4E2D", "redirect"],
  running: ["\u8FDB\u884C\u4E2D", "success"],
  paused: ["\u5DF2\u6682\u505C", "warn"],
  done: ["\u5DF2\u5B8C\u6210", "success"],
  failed: ["\u5931\u8D25", "error"],
  timeout: ["\u5DF2\u8D85\u65F6", "error"]
};
function statusTone(status) {
  return STATUS_TEXT[status ?? ""]?.[1] ?? "muted";
}
function statusLabel(status) {
  return STATUS_TEXT[status ?? ""]?.[0] ?? status ?? "\u2014";
}
var SEVERITY = {
  critical: ["\u4E25\u91CD", "critical"],
  high: ["\u9AD8\u5371", "high"],
  medium: ["\u4E2D\u5371", "medium"],
  low: ["\u4F4E\u5371", "low"],
  info: ["\u4FE1\u606F", "info"]
};
function severityChip(severity) {
  const [label, tone] = SEVERITY[(severity ?? "").toLowerCase()] ?? [severity ?? "\u2014", "muted"];
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: `vx-chip vx-chip--${tone}`, children: label });
}
function StatusChip({ status }) {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: `vx-chip vx-chip--${statusTone(status)}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("i", { className: "vx-chip-dot" }),
    statusLabel(status)
  ] });
}
function Card2({ title, extra, children, className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { className: `vx-task-card${className ? ` ${className}` : ""}`, children: [
    (title || extra) && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("header", { className: "vx-task-card-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { children: title }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "vx-task-card-extra", children: extra })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "vx-task-card-body", children })
  ] });
}
function Empty2({ text, hint }) {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "vx-task-empty", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: text }),
    hint ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: hint }) : null
  ] });
}
function ErrorLine({ error }) {
  return error ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "vx-task-error", role: "alert", children: error }) : null;
}
function Field3({
  value,
  onChange,
  placeholder,
  onEnter,
  ariaLabel
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
    "input",
    {
      className: "vx-task-input",
      "aria-label": ariaLabel ?? placeholder,
      placeholder,
      value,
      onChange: (event) => onChange(event.target.value),
      onKeyDown: (event) => {
        if (event.key === "Enter" && onEnter) {
          event.preventDefault();
          onEnter();
        }
      }
    }
  );
}
function Select2({
  value,
  onChange,
  options,
  ariaLabel
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("select", { className: "vx-task-select", "aria-label": ariaLabel, value, onChange: (event) => onChange(event.target.value), children: options.map(([optionValue, label]) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: optionValue, children: label }, optionValue)) });
}
function Button2({
  children,
  onClick,
  tone = "default",
  disabled,
  title
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: `vx-task-btn vx-task-btn--${tone}`, onClick, disabled, title, children });
}
function Metric({ label, value, hint }) {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "vx-task-metric", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: value }),
    hint ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("small", { children: hint }) : null
  ] });
}
function KeyValue2({ label, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "vx-task-kv", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { children })
  ] });
}

// src/tasks/sections.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var FINDING_STATUS = [
  ["pending", "\u5F85\u5904\u7406"],
  ["in_progress", "\u5904\u7406\u4E2D"],
  ["confirmed", "\u5DF2\u786E\u8BA4"],
  ["fixed", "\u5DF2\u4FEE\u590D"],
  ["false_positive", "\u8BEF\u62A5"],
  ["ignored", "\u5FFD\u7565"],
  ["risk_accepted", "\u98CE\u9669\u63A5\u53D7"]
];
function ListItem({ title, meta, actions, tone }) {
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-item", "data-tone": tone, children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-item-main", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-item-title", children: title }),
      meta ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-item-meta", children: meta }) : null
    ] }),
    actions ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-item-actions", children: actions }) : null
  ] });
}
function SessionsSection({ task }) {
  const [seg, setSeg] = (0, import_react10.useState)(void 0);
  const [draft, setDraft] = (0, import_react10.useState)("");
  const [busy, setBusy] = (0, import_react10.useState)("");
  const [reply, setReply] = (0, import_react10.useState)("");
  const sessions = useResource(`sessions:${task.id}`, () => tasksApi.mainSessions(task.id));
  const history = useResource(`history:${task.id}:${seg ?? ""}`, () => tasksApi.activityHistory(task.id, seg === void 0 ? "main" : `main:${seg}`, 0, 120));
  const items = history.data?.items ?? [];
  const send = async () => {
    const message = draft.trim();
    if (!message || busy) return;
    setBusy("send");
    setReply("");
    try {
      const result = await tasksApi.chat(task.id, message, seg);
      setReply(result.reply || "\uFF08\u5DF2\u53D1\u9001\uFF09");
      setDraft("");
      history.reload();
    } catch (error) {
      setReply(`\u53D1\u9001\u5931\u8D25\uFF1A${error.message}`);
    } finally {
      setBusy("");
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-stack", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
    Card2,
    {
      title: "\u4E3B Agent \u4F1A\u8BDD",
      extra: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          Select2,
          {
            ariaLabel: "\u4F1A\u8BDD\u5206\u6BB5",
            value: seg === void 0 ? "current" : String(seg),
            onChange: (value) => setSeg(value === "current" ? void 0 : Number(value)),
            options: [
              ["current", "\u5F53\u524D\u4F1A\u8BDD"],
              ...(sessions.data?.sessions ?? []).map((item) => [String(item.seq), `\u4F1A\u8BDD #${item.seq}`])
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          Button2,
          {
            onClick: () => {
              setBusy("new");
              tasksApi.newMainSession(task.id).then((result) => {
                setSeg(result.current);
                sessions.reload();
                history.reload();
              }).catch((error) => setReply(error.message)).finally(() => setBusy(""));
            },
            disabled: busy === "new",
            children: "\u65B0\u4F1A\u8BDD"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { tone: "ghost", onClick: () => void tasksApi.chatStop(task.id).catch(() => {
        }), children: "\u505C\u6B62" })
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-feed", children: [
          history.loading && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u8BFB\u53D6\u4F1A\u8BDD\u2026" }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(ErrorLine, { error: history.error }),
          !history.loading && items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u8FD8\u6CA1\u6709\u5BF9\u8BDD", hint: "\u5728\u4E0B\u65B9\u7ED9\u4E3B Agent \u53D1\u6D88\u606F\uFF0C\u5F15\u5BFC\u63A2\u7D22\u65B9\u5411\u3002" }),
          items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-feed-item", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-feed-time", children: relTime(item.ts) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-feed-title", children: [
                item.tool ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("code", { className: "vx-task-tool", children: item.tool }) : null,
                item.title || item.kind || "\u6B65\u9AA4"
              ] }),
              item.summary ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-feed-body", children: item.summary }) : null
            ] })
          ] }, item.id))
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-compose", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
            "textarea",
            {
              className: "vx-task-textarea",
              placeholder: "\u7ED9\u4E3B Agent \u53D1\u6D88\u606F\uFF0C\u5F15\u5BFC\u63A2\u7D22\u65B9\u5411\u2026",
              value: draft,
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send();
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-compose-actions", children: [
            reply ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("small", { className: "vx-task-hint", children: reply.slice(0, 240) }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("small", { className: "vx-task-hint", children: "\u2318/Ctrl + Enter \u53D1\u9001" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { tone: "primary", onClick: () => void send(), disabled: !draft.trim() || busy === "send", children: busy === "send" ? "\u53D1\u9001\u4E2D\u2026" : "\u53D1\u9001" })
          ] })
        ] })
      ]
    }
  ) });
}
function OverviewSection({ task }) {
  const goals = useResource(`goals:${task.id}`, () => tasksApi.goals(task.id));
  const constraints = useResource(`constraints:${task.id}`, () => tasksApi.constraints(task.id));
  const scope = useResource(`scope:${task.id}`, () => tasksApi.scope(task.id));
  const rules = useResource(`rules:${task.id}`, () => tasksApi.rules(task.id));
  const coverage = useResource(`coverage:${task.id}`, () => tasksApi.coverage(task.id));
  const tokens = useResource(`tokens:${task.id}`, () => tasksApi.tokens(task.id));
  const [goalText, setGoalText] = (0, import_react10.useState)("");
  const [constraintText, setConstraintText] = (0, import_react10.useState)("");
  const [constraintKind, setConstraintKind] = (0, import_react10.useState)("deny");
  const [scopeValue, setScopeValue] = (0, import_react10.useState)("");
  const [scopeKind, setScopeKind] = (0, import_react10.useState)("root_domain");
  const [rulePattern, setRulePattern] = (0, import_react10.useState)("");
  const [ruleKind, setRuleKind] = (0, import_react10.useState)("deny");
  const [busy, setBusy] = (0, import_react10.useState)("");
  const run = async (name, action, after) => {
    setBusy(name);
    try {
      await action();
      after();
    } catch (error) {
      window.alert(error.message);
    } finally {
      setBusy("");
    }
  };
  const modelTokens = tokens.data ?? [];
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-stack", children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Card2, { title: "\u4EFB\u52A1\u63CF\u8FF0\u4E0E\u76EE\u6807", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-cols", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(KeyValue2, { label: "\u63CF\u8FF0", children: task.description || "\u2014" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(KeyValue2, { label: "\u76EE\u6807", children: task.goal || "\u2014" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(KeyValue2, { label: "\u521B\u5EFA", children: relTime(task.created_at) }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(KeyValue2, { label: "\u6700\u8FD1\u6D3B\u52A8", children: relTime(task.last_activity) })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-metrics", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Metric, { label: "\u76EE\u6807\u8FBE\u6210", value: `${task.goals_met ?? 0}/${task.goals_total ?? 0}` }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Metric, { label: "\u8FDB\u884C\u4E2D\u610F\u56FE", value: task.in_flight ?? 0, hint: "frontier \u5F85\u9886" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Metric, { label: "\u786E\u8BA4\u6F0F\u6D1E", value: (task.findings?.critical ?? 0) + (task.findings?.high ?? 0) + (task.findings?.medium ?? 0) + (task.findings?.low ?? 0) }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Metric, { label: "\u8D44\u4EA7\u8986\u76D6", value: `${coverage.data?.percent ?? 0}%`, hint: `\u5DF2\u6D4B ${coverage.data?.tested ?? 0} / ${coverage.data?.total ?? 0}` }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Metric, { label: "Token", value: (task.tokens?.total ?? modelTokens.reduce((sum, item) => sum + (item.total ?? 0), 0)).toLocaleString() })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(Card2, { title: `\u76EE\u6807\uFF08${goals.data?.length ?? 0}\uFF09`, extra: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-hint", children: "\u53EF\u6838\u9A8C\u7684\u76EE\u6807\uFF0C\u4F1A\u6D3E\u53D1\u63A2\u7D22\u610F\u56FE" }), children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-list", children: [
        (goals.data ?? []).map((goal) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          ListItem,
          {
            title: goal.text,
            meta: goal.vulnclass ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-chip vx-chip--muted", children: goal.vulnclass }) : null,
            actions: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { tone: "danger", onClick: () => void run(`goal-${goal.id}`, () => tasksApi.deleteGoal(task.id, goal.id), goals.reload), disabled: busy === `goal-${goal.id}`, children: "\u5220\u9664" })
          },
          goal.id
        )),
        !goals.loading && (goals.data?.length ?? 0) === 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u6682\u65E0\u76EE\u6807", hint: "\u52A0\u4E0A\u4E00\u6761\u53EF\u6838\u9A8C\u7684\u76EE\u6807\uFF0C\u89C4\u5212\u5668\u4F1A\u636E\u6B64\u6D3E\u53D1\u610F\u56FE\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline vx-task-inline--wide", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Field3, { placeholder: "\u65B0\u589E\u76EE\u6807\uFF0C\u5982\u300C\u62FF\u5230\u7BA1\u7406\u5458\u8D26\u53F7\u7684\u8D8A\u6743\u8BBF\u95EE\u300D", value: goalText, onChange: setGoalText, onEnter: () => goalText.trim() && void run("add-goal", () => tasksApi.addGoal(task.id, goalText.trim()), () => {
          setGoalText("");
          goals.reload();
        }) }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { tone: "primary", disabled: !goalText.trim() || busy === "add-goal", onClick: () => void run("add-goal", () => tasksApi.addGoal(task.id, goalText.trim()), () => {
          setGoalText("");
          goals.reload();
        }), children: "\u6DFB\u52A0" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(Card2, { title: `\u64CD\u4F5C\u7EA6\u675F\uFF08${constraints.data?.length ?? 0}\uFF09`, extra: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-hint", children: "\u5141\u8BB8 / \u7981\u6B62\uFF0C\u6846\u5B9A planner \u4E0E worker \u7684\u8FB9\u754C" }), children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-list", children: [
        (constraints.data ?? []).map((constraint) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          ListItem,
          {
            title: constraint.text,
            meta: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: `vx-chip vx-chip--${constraint.kind === "deny" ? "error" : "success"}`, children: constraint.kind === "deny" ? "\u7981\u6B62" : "\u5141\u8BB8" }),
            actions: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { tone: "danger", onClick: () => void run(`c-${constraint.id}`, () => tasksApi.deleteConstraint(task.id, constraint.id), constraints.reload), children: "\u5220\u9664" })
          },
          constraint.id
        )),
        !constraints.loading && (constraints.data?.length ?? 0) === 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u6682\u65E0\u64CD\u4F5C\u7EA6\u675F" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline vx-task-inline--wide", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Select2, { value: constraintKind, onChange: setConstraintKind, ariaLabel: "\u7EA6\u675F\u7C7B\u578B", options: [["deny", "\u7981\u6B62"], ["allow", "\u5141\u8BB8"]] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Field3, { placeholder: "\u4E00\u6761\u64CD\u4F5C\u7EA6\u675F\uFF0C\u5982\u300C\u4EC5\u6D4B\u5F53\u524D\u7AEF\u53E3\uFF0C\u4E0D\u626B\u5176\u4ED6\u7AEF\u53E3\u300D", value: constraintText, onChange: setConstraintText }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          Button2,
          {
            tone: "primary",
            disabled: !constraintText.trim(),
            onClick: () => void run("add-constraint", () => tasksApi.addConstraint(task.id, constraintText.trim(), constraintKind), () => {
              setConstraintText("");
              constraints.reload();
            }),
            children: "\u6DFB\u52A0"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(Card2, { title: `\u6D4B\u8BD5\u8303\u56F4\uFF08${scope.data?.length ?? 0}\uFF09`, extra: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-hint", children: "\u8986\u76D6\u5EA6\u5206\u6BCD\u4E0E\u6388\u6743\u8FB9\u754C" }), children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-list", children: [
        (scope.data ?? []).map((row) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          ListItem,
          {
            title: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("code", { children: row.value }),
            meta: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-chip vx-chip--muted", children: row.kind }),
              row.reason ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-hint", children: row.reason }) : null
            ] }),
            actions: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { tone: "danger", onClick: () => void run(`s-${row.id}`, () => tasksApi.deleteScope(task.id, row.id), scope.reload), children: "\u5220\u9664" })
          },
          row.id
        )),
        !scope.loading && (scope.data?.length ?? 0) === 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u6682\u65E0\u6D4B\u8BD5\u8303\u56F4" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline vx-task-inline--wide", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          Select2,
          {
            value: scopeKind,
            onChange: setScopeKind,
            ariaLabel: "\u8303\u56F4\u7C7B\u578B",
            options: [["root_domain", "\u6839\u57DF\u540D"], ["domain", "\u57DF\u540D"], ["ip", "IP"], ["cidr", "CIDR"]]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Field3, { placeholder: "\u5982 example.com", value: scopeValue, onChange: setScopeValue }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          Button2,
          {
            tone: "primary",
            disabled: !scopeValue.trim(),
            onClick: () => void run("add-scope", () => tasksApi.addScope(task.id, scopeKind, scopeValue.trim()), () => {
              setScopeValue("");
              scope.reload();
            }),
            children: "\u6DFB\u52A0"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(Card2, { title: `\u4EFB\u52A1\u7EA7\u62E6\u622A\u89C4\u5219\uFF08${rules.data?.length ?? 0}\uFF09`, extra: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-hint", children: "\u4EC5\u672C\u4EFB\u52A1\u751F\u6548\uFF0C\u5148\u62E6\u622A\u540E\u5141\u8BB8" }), children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-list", children: [
        (rules.data ?? []).map((rule) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          ListItem,
          {
            title: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("code", { children: rule.pattern }),
            meta: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: `vx-chip vx-chip--${rule.kind === "deny" ? "error" : "success"}`, children: rule.kind === "deny" ? "\u62E6\u622A" : "\u5141\u8BB8" }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-chip vx-chip--muted", children: rule.match }),
              rule.note ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-hint", children: rule.note }) : null
            ] }),
            actions: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { onClick: () => void run(`r-${rule.id}`, () => tasksApi.toggleRule(task.id, rule.id, !rule.enabled), rules.reload), children: rule.enabled ? "\u505C\u7528" : "\u542F\u7528" }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { tone: "danger", onClick: () => void run(`rd-${rule.id}`, () => tasksApi.deleteRule(task.id, rule.id), rules.reload), children: "\u5220\u9664" })
            ] })
          },
          rule.id
        )),
        !rules.loading && (rules.data?.length ?? 0) === 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u6682\u65E0\u4EFB\u52A1\u7EA7\u89C4\u5219" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline vx-task-inline--wide", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Select2, { value: ruleKind, onChange: setRuleKind, ariaLabel: "\u89C4\u5219\u52A8\u4F5C", options: [["deny", "\u62E6\u622A"], ["allow", "\u5141\u8BB8"]] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Field3, { placeholder: "\u5339\u914D\u5185\u5BB9\uFF0C\u5982 .gov.cn", value: rulePattern, onChange: setRulePattern }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          Button2,
          {
            tone: "primary",
            disabled: !rulePattern.trim(),
            onClick: () => void run(
              "add-rule",
              () => tasksApi.addRule(task.id, { kind: ruleKind, match: "fuzzy_domain", pattern: rulePattern.trim(), enabled: true, note: "" }),
              () => {
                setRulePattern("");
                rules.reload();
              }
            ),
            children: "\u6DFB\u52A0"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Card2, { title: "LLM Token \u7528\u91CF", extra: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-hint", children: "\u6309\u6A21\u578B\u7EDF\u8BA1" }), children: modelTokens.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u6682\u65E0 LLM \u7528\u91CF", hint: "\u4EFB\u52A1\u5C1A\u672A\u4EA7\u751F\u8C03\u7528\uFF0C\u6216\u8BB0\u5F55\u4ECD\u5728\u5199\u5165\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-list", children: modelTokens.map((item) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(ListItem, { title: item.model, meta: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "vx-task-hint", children: [
      "prompt ",
      item.prompt ?? 0,
      " \xB7 completion ",
      item.completion ?? 0
    ] }), actions: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("strong", { children: (item.total ?? 0).toLocaleString() }) }, item.model)) }) })
  ] });
}
function GraphSection({ task }) {
  const intents = useResource(`intents:${task.id}`, () => tasksApi.intents(task.id));
  const list = intents.data ?? [];
  const [busy, setBusy] = (0, import_react10.useState)(false);
  const grouped = (0, import_react10.useMemo)(() => {
    const map = /* @__PURE__ */ new Map();
    for (const intent of list) map.set(intent.status ?? "pending", (map.get(intent.status ?? "pending") ?? 0) + 1);
    return Array.from(map.entries());
  }, [list]);
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-stack", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
    Card2,
    {
      title: `\u63A2\u7D22\u610F\u56FE\uFF08${list.length}\uFF09`,
      extra: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline", children: [
        grouped.map(([status, count]) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "vx-chip vx-chip--muted", children: [
          status,
          " \xB7 ",
          count
        ] }, status)),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          Button2,
          {
            onClick: () => {
              setBusy(true);
              tasksApi.intentsRerunBlocked(task.id).then(() => intents.reload()).catch((error) => window.alert(error.message)).finally(() => setBusy(false));
            },
            disabled: busy,
            children: "\u91CD\u8DD1\u88AB\u62E6\u622A\u610F\u56FE"
          }
        )
      ] }),
      children: intents.loading ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u8BFB\u53D6\u610F\u56FE\u2026" }) : list.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u6682\u65E0\u63A2\u7D22\u610F\u56FE", hint: "\u4EFB\u52A1\u5F00\u59CB\u8FD0\u884C\u540E\uFF0C\u8FD9\u91CC\u4F1A\u5217\u51FA planner \u6D3E\u53D1\u7684\u6BCF\u4E00\u6B65\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-list", children: list.map((intent) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        ListItem,
        {
          title: intent.text || `\u610F\u56FE #${intent.id}`,
          meta: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "vx-chip vx-chip--muted", children: [
              "#",
              intent.id
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-chip vx-chip--muted", children: intent.kind ?? "intent" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-chip vx-chip--muted", children: intent.status ?? "pending" }),
            intent.blocked ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-chip vx-chip--error", children: "\u88AB\u62E6\u622A" }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-hint", children: relTime(intent.created_at) })
          ] })
        },
        intent.id
      )) })
    }
  ) });
}
function BroadcastSection({ task }) {
  const [kind, setKind] = (0, import_react10.useState)("");
  const feed = useResource(`feed:${task.id}`, () => tasksApi.activity(task.id, 150));
  const items = (feed.data ?? []).filter((item) => !kind || item.kind === kind);
  const kinds = Array.from(new Set((feed.data ?? []).map((item) => item.kind ?? "step")));
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-stack", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
    Card2,
    {
      title: "\u64AD\u62A5\u677F",
      extra: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Select2, { value: kind, onChange: setKind, ariaLabel: "\u7C7B\u578B", options: [["", "\u5168\u90E8\u7C7B\u578B"], ...kinds.map((value) => [value, value])] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { onClick: feed.reload, children: "\u5237\u65B0" })
      ] }),
      children: feed.loading ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u8BFB\u53D6\u64AD\u62A5\u2026" }) : items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u6682\u65E0\u64AD\u62A5", hint: "\u4EFB\u52A1\u4EA7\u751F\u6D3B\u52A8\u540E\uFF0C\u8FD9\u91CC\u4F1A\u6309\u65F6\u95F4\u5012\u5E8F\u64AD\u62A5\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-feed", children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-feed-item", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-feed-time", children: relTime(item.ts) }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-feed-title", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-chip vx-chip--muted", children: item.actor ?? item.kind ?? "step" }),
            item.title || item.tool || `\u6B65\u9AA4 #${item.id}`
          ] }),
          item.summary ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-feed-body", children: item.summary }) : null
        ] })
      ] }, item.id)) })
    }
  ) });
}
function FindingsSection({ task }) {
  const [page, setPage] = (0, import_react10.useState)(1);
  const findings = useResource(`findings:${task.id}:${page}`, () => tasksApi.findings(task.id, page, 20));
  const rows = findings.data?.items ?? [];
  const total = findings.data?.total ?? rows.length;
  const [busy, setBusy] = (0, import_react10.useState)("");
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-stack", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
    Card2,
    {
      title: `\u6F0F\u6D1E\uFF08${total}\uFF09`,
      extra: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { disabled: page <= 1, onClick: () => setPage((value) => Math.max(1, value - 1)), children: "\u4E0A\u4E00\u9875" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "vx-task-hint", children: [
          "\u7B2C ",
          page,
          " / ",
          Math.max(1, Math.ceil(total / 20)),
          " \u9875"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { disabled: page >= Math.ceil(total / 20), onClick: () => setPage((value) => value + 1), children: "\u4E0B\u4E00\u9875" })
      ] }),
      children: [
        findings.loading ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u8BFB\u53D6\u53D1\u73B0\u2026" }) : rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u672C\u4EFB\u52A1\u53CA\u76F4\u63A5\u5173\u8054\u4EFB\u52A1\u6682\u65E0\u786E\u8BA4\u53D1\u73B0" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-table", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-tr vx-task-tr--head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u6F0F\u6D1E" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u7B49\u7EA7" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u72B6\u6001" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u8D44\u4EA7" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u53D1\u73B0\u65F6\u95F4" })
          ] }),
          rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-tr", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { title: row.title, children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("strong", { children: row.title || row.vulnclass || `#${row.id}` }),
              row.vulnclass ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("small", { className: "vx-task-hint", children: [
                " ",
                row.vulnclass
              ] }) : null
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: severityChip(row.severity) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
              Select2,
              {
                ariaLabel: "\u5904\u7F6E\u72B6\u6001",
                value: row.status,
                onChange: (value) => {
                  setBusy(String(row.id));
                  tasksApi.setFindingStatus(row.id, value).then(findings.reload).catch((error) => window.alert(error.message)).finally(() => setBusy(""));
                },
                options: FINDING_STATUS
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-dim", children: row.host || row.url || "\u2014" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-dim", children: relTime(row.created_at) })
          ] }, row.id))
        ] }),
        busy ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("small", { className: "vx-task-hint", children: "\u66F4\u65B0\u4E2D\u2026" }) : null
      ]
    }
  ) });
}
function RetestsSection({ task }) {
  const findings = useResource(`retest-findings:${task.id}`, () => tasksApi.findings(task.id, 1, 50));
  const rows = findings.data?.items ?? [];
  const [notes, setNotes] = (0, import_react10.useState)("");
  const [busy, setBusy] = (0, import_react10.useState)("");
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-stack", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Card2, { title: "\u590D\u6D4B", extra: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-hint", children: "\u5BF9\u5DF2\u786E\u8BA4\u6F0F\u6D1E\u53D1\u8D77\u590D\u6D4B" }), children: findings.loading ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u8BFB\u53D6\u6F0F\u6D1E\u2026" }) : rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u6682\u65E0\u53EF\u590D\u6D4B\u6F0F\u6D1E", hint: "\u672C\u4EFB\u52A1\u53D1\u73B0\u6F0F\u6D1E\u540E\uFF0C\u53EF\u5728\u8FD9\u91CC\u624B\u52A8\u53D1\u8D77\u590D\u6D4B\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-inline vx-task-inline--wide", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Field3, { placeholder: "\u590D\u6D4B\u5907\u6CE8\uFF08\u53EF\u9009\uFF09", value: notes, onChange: setNotes }) }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-list", children: rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      ListItem,
      {
        title: row.title || row.vulnclass || `#${row.id}`,
        meta: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline", children: [
          severityChip(row.severity),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-chip vx-chip--muted", children: row.status }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-dim", children: row.host || row.url || "\u2014" })
        ] }),
        actions: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          Button2,
          {
            tone: "primary",
            disabled: busy === String(row.id),
            onClick: () => {
              setBusy(String(row.id));
              tasksApi.startRetest(row.id, notes.trim()).then(() => {
                setNotes("");
                findings.reload();
              }).catch((error) => window.alert(error.message)).finally(() => setBusy(""));
            },
            children: "\u53D1\u8D77\u590D\u6D4B"
          }
        )
      },
      row.id
    )) })
  ] }) }) });
}
function AssetsSection({ task }) {
  const [type, setType] = (0, import_react10.useState)("");
  const [dsl, setDsl] = (0, import_react10.useState)("");
  const [page, setPage] = (0, import_react10.useState)(0);
  const key = `assets:${task.id}:${type}:${dsl}:${page}`;
  const assets = useResource(key, () => tasksApi.assets(task.id, type, 50, page * 50, dsl));
  const rows = assets.data?.assets ?? [];
  const total = assets.data?.total ?? rows.length;
  const [busy, setBusy] = (0, import_react10.useState)("");
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-stack", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
    Card2,
    {
      title: `\u6D4B\u8BD5\u8D44\u4EA7\uFF08${total}\uFF09`,
      extra: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          Select2,
          {
            value: type,
            onChange: (value) => {
              setType(value);
              setPage(0);
            },
            ariaLabel: "\u8D44\u4EA7\u7C7B\u578B",
            options: [
              ["", "\u5168\u90E8\u7C7B\u578B"],
              ["root_domain", "\u6839\u57DF\u540D"],
              ["subdomain", "\u5B50\u57DF\u540D"],
              ["ip", "IP"],
              ["app", "\u5E94\u7528"],
              ["service", "\u670D\u52A1"],
              ["endpoint", "\u63A5\u53E3"]
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { disabled: page === 0, onClick: () => setPage((value) => Math.max(0, value - 1)), children: "\u4E0A\u4E00\u9875" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { disabled: (page + 1) * 50 >= total, onClick: () => setPage((value) => value + 1), children: "\u4E0B\u4E00\u9875" })
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline vx-task-inline--wide", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Field3, { placeholder: "DSL \u641C\u7D22\uFF0C\u5982 domain=example AND status_code>=400", value: dsl, onChange: setDsl, onEnter: () => setPage(0) }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { onClick: () => setPage(0), children: "\u641C\u7D22" })
        ] }),
        assets.loading ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u8BFB\u53D6\u8D44\u4EA7\u2026" }) : rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u8BE5\u4EFB\u52A1\u6682\u65E0\u8D44\u4EA7", hint: "\u4EFB\u52A1\u8FD0\u884C\u65F6\u4F1A\u81EA\u52A8\u628A\u8303\u56F4\u4E0E\u8D44\u4EA7\u6302\u4E0A\u6765\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-table", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-tr vx-task-tr--head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u8D44\u4EA7" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u7C7B\u578B" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "ICP \u5907\u6848" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u6765\u6E90" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", {})
          ] }),
          rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-tr", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { title: row.display, children: row.display }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-chip vx-chip--muted", children: row.type }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-dim", children: row.icp || "\u2014" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-dim", title: row.origin, children: row.origin || "\u2014" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
              Button2,
              {
                tone: "danger",
                disabled: busy === String(row.id),
                onClick: () => {
                  setBusy(String(row.id));
                  tasksApi.detachAsset(task.id, row.id).then(assets.reload).catch((error) => window.alert(error.message)).finally(() => setBusy(""));
                },
                children: "\u79FB\u9664"
              }
            ) })
          ] }, row.id))
        ] })
      ]
    }
  ) });
}
function CoverageSection({ task }) {
  const coverage = useResource(`coverage:${task.id}`, () => tasksApi.coverage(task.id));
  const graph = useResource(`coverage-graph:${task.id}`, () => tasksApi.coverageGraph(task.id));
  const nodes = graph.data?.nodes ?? [];
  const groups = (0, import_react10.useMemo)(() => {
    const map = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      const entry = map.get(node.type) ?? { total: 0, tested: 0 };
      entry.total += 1;
      if (node.tested) entry.tested += 1;
      map.set(node.type, entry);
    }
    return Array.from(map.entries());
  }, [nodes]);
  const percent = coverage.data?.percent ?? 0;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-stack", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(Card2, { title: "\u8D44\u4EA7\u8986\u76D6\u5EA6", extra: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-hint", children: "\u6309\u8D44\u4EA7\u7C7B\u578B\u7EDF\u8BA1\uFF08\u7C97\u7565\uFF0C\u4EC5\u4F9B\u53C2\u8003\uFF09" }), children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-cols", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(KeyValue2, { label: "\u8986\u76D6", children: `${percent}%` }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(KeyValue2, { label: "\u5DF2\u6D4B / \u8303\u56F4", children: `${coverage.data?.tested ?? 0} / ${coverage.data?.total ?? 0}` }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(KeyValue2, { label: "\u8282\u70B9", children: nodes.length })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-bar", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("i", { style: { width: `${Math.min(100, Math.max(0, percent))}%` } }) }),
    groups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u6682\u65E0\u8986\u76D6\u6570\u636E", hint: "\u4EFB\u52A1\u8FD0\u884C\u5E76\u4EA7\u51FA\u8D44\u4EA7\u540E\uFF0C\u8FD9\u91CC\u4F1A\u6309\u7C7B\u578B\u5C55\u5F00\u8986\u76D6\u60C5\u51B5\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-list", children: groups.map(([kind, entry]) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      ListItem,
      {
        title: kind,
        meta: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-hint", children: `${entry.tested}/${entry.total}` }),
        actions: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-mini-bar", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("i", { style: { width: `${entry.total ? Math.round(entry.tested / entry.total * 100) : 0}%` } }) })
      },
      kind
    )) })
  ] }) });
}
function InterceptSection({ task }) {
  const approvals = useResource(`approvals:${task.id}`, () => tasksApi.approvals(task.id, 1, 50));
  const pending = useResource(`pending:${task.id}`, () => tasksApi.pending(task.id));
  const rows = approvals.data ?? [];
  const waiting = pending.data ?? [];
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-stack", children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      Card2,
      {
        title: `\u5F85\u5BA1\u6279\uFF08${waiting.length}\uFF09`,
        extra: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          Button2,
          {
            onClick: () => {
              pending.reload();
              approvals.reload();
            },
            children: "\u5237\u65B0"
          }
        ),
        children: waiting.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u6CA1\u6709\u5F85\u5BA1\u6279\u8BF7\u6C42" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-list", children: waiting.map((row) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          ListItem,
          {
            title: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("code", { children: row.tool || `\u5BA1\u6279 #${row.id}` }),
            meta: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-hint", children: row.reason || relTime(row.created_at) }),
            actions: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                Button2,
                {
                  tone: "primary",
                  onClick: () => {
                    tasksApi.decide(row.id, "allowed").then(() => {
                      pending.reload();
                      approvals.reload();
                    });
                  },
                  children: "\u5141\u8BB8"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                Button2,
                {
                  tone: "danger",
                  onClick: () => {
                    tasksApi.decide(row.id, "denied").then(() => {
                      pending.reload();
                      approvals.reload();
                    });
                  },
                  children: "\u62D2\u7EDD"
                }
              )
            ] })
          },
          row.id
        )) })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Card2, { title: `\u5BA1\u6279\u8BB0\u5F55\uFF08${rows.length}\uFF09`, children: approvals.loading ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u8BFB\u53D6\u8BB0\u5F55\u2026" }) : rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u6682\u65E0\u5BA1\u6279\u8BB0\u5F55", hint: "\u89C4\u5219\u6216\u6A21\u578B\u4F5C\u51FA\u5BA1\u6279\u51B3\u5B9A\u540E\uFF0C\u8BB0\u5F55\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-table", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-tr vx-task-tr--head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u5DE5\u5177" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u52A8\u4F5C" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u7ED3\u679C" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u65F6\u95F4" })
      ] }),
      rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-tr", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("code", { children: row.tool || `#${row.id}` }) }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-dim", children: row.action || "\u2014" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: `vx-chip vx-chip--${row.decision === "denied" ? "error" : "success"}`, children: row.decision || row.status || "\u2014" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "vx-task-dim", children: relTime(row.created_at) })
      ] }, row.id))
    ] }) })
  ] });
}
function ReportSection({ task }) {
  const [text, setText] = (0, import_react10.useState)("");
  const [error, setError] = (0, import_react10.useState)("");
  const [loading, setLoading] = (0, import_react10.useState)(true);
  const ref = (0, import_react10.useRef)(null);
  const load2 = () => {
    setLoading(true);
    reportText(task.id).then((value) => {
      setText(value);
      setError("");
    }).catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  };
  useResource(`report:${task.id}`, async () => {
    load2();
    return true;
  });
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "vx-task-stack", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
    Card2,
    {
      title: "\u6E17\u900F\u6D4B\u8BD5\u62A5\u544A\uFF08Markdown\uFF09",
      extra: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "vx-task-inline", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button2, { onClick: load2, children: "\u91CD\u65B0\u751F\u6210" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          Button2,
          {
            onClick: () => {
              void navigator.clipboard.writeText(text);
            },
            children: "\u590D\u5236"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          Button2,
          {
            onClick: () => {
              const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
              const href = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = href;
              link.download = `report-${task.id}.md`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(href), 1e3);
            },
            children: "\u4E0B\u8F7D"
          }
        )
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(ErrorLine, { error }),
        loading ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Empty2, { text: "\u751F\u6210\u62A5\u544A\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("pre", { className: "vx-task-report", ref, children: text || "\uFF08\u7A7A\u62A5\u544A\uFF09" })
      ]
    }
  ) });
}

// src/tasks/workspace.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
var TABS = [
  ["sessions", "\u4F1A\u8BDD"],
  ["overview", "\u603B\u89C8"],
  ["graph", "\u63A2\u7D22\u94FE\u8DEF"],
  ["broadcast", "\u64AD\u62A5\u677F"],
  ["findings", "\u53D1\u73B0"],
  ["retests", "\u590D\u6D4B"],
  ["assets", "\u6D4B\u8BD5\u8D44\u4EA7"],
  ["coverage", "\u8D44\u4EA7\u8986\u76D6\u56FE"],
  ["intercept", "\u62E6\u622A\u5BA1\u6279"],
  ["report", "\u62A5\u544A"]
];
var STATUS_OPTIONS = [
  { value: "", label: "\u5168\u90E8\u72B6\u6001" },
  { value: "created", label: "\u5F85\u542F\u52A8" },
  { value: "queued", label: "\u6392\u961F\u4E2D" },
  { value: "running", label: "\u8FDB\u884C\u4E2D" },
  { value: "paused", label: "\u5DF2\u6682\u505C" },
  { value: "done", label: "\u5DF2\u5B8C\u6210" },
  { value: "failed", label: "\u5931\u8D25" },
  { value: "timeout", label: "\u5DF2\u8D85\u65F6" }
];
var SIZE_OPTIONS = [
  { value: "10", label: "10 / \u9875" },
  { value: "20", label: "20 / \u9875" },
  { value: "50", label: "50 / \u9875" }
];
function TasksWorkspace({ viewSwitch }) {
  const [search, setSearch] = (0, import_react11.useState)("");
  const [query2, setQuery] = (0, import_react11.useState)("");
  const [status, setStatus] = (0, import_react11.useState)("");
  const [page, setPage] = (0, import_react11.useState)(1);
  const [size, setSize] = (0, import_react11.useState)(20);
  const [open, setOpen] = (0, import_react11.useState)("");
  const [showArchives, setShowArchives] = (0, import_react11.useState)(false);
  const [creating, setCreating] = (0, import_react11.useState)(false);
  const [createOpen, setCreateOpen] = (0, import_react11.useState)(false);
  const [draft, setDraft] = (0, import_react11.useState)({ description: "", goal: "" });
  const [error, setError] = (0, import_react11.useState)("");
  (0, import_react11.useEffect)(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const list = useTasks({ q: query2, status, page, size });
  const summary = useTaskSummary(30);
  const metrics = (0, import_react11.useMemo)(() => taskMetrics(summary.data), [summary.data]);
  const rows = list.data?.tasks ?? [];
  const total = list.data?.total ?? rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const reload = () => {
    list.refresh();
    summary.refresh();
  };
  if (showArchives) return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(TaskArchives, { onBack: () => {
    setShowArchives(false);
    reload();
  } });
  if (open !== "") return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(TaskDetailPage, { id: open, onBack: () => {
    setOpen("");
    reload();
  } });
  const create = () => {
    if (draft.description.trim() === "") return;
    setCreating(true);
    setError("");
    tasksApi.create({ description: draft.description.trim(), goal: draft.goal.trim() }).then((task) => {
      setDraft({ description: "", goal: "" });
      setPage(1);
      reload();
      if (task?.id) setOpen(String(task.id));
    }).catch((reason) => setError(reason.message)).finally(() => setCreating(false));
  };
  const columns = [
    {
      key: "task",
      header: "\u4EFB\u52A1",
      render: (task) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "vx-ui-cell-stack", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("strong", { children: task.name || task.description || `\u4EFB\u52A1 #${task.id}` }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "vx-ui-muted", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("code", { children: [
            "#",
            task.id
          ] }),
          task.goal ? ` \xB7 ${task.goal}` : ""
        ] })
      ] })
    },
    { key: "status", header: "\u72B6\u6001", width: "86px", render: (task) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(StatusChip, { status: task.status }) },
    {
      key: "goals",
      header: "\u76EE\u6807",
      width: "68px",
      align: "right",
      mono: true,
      render: (task) => task.goals_total ? `${task.goals_met ?? 0}/${task.goals_total}` : "\u2014"
    },
    {
      key: "findings",
      header: "\u6F0F\u6D1E",
      width: "86px",
      align: "right",
      render: (task) => {
        const bucket = task.findings ?? { critical: 0, high: 0, medium: 0, low: 0 };
        const sum = bucket.critical + bucket.high + bucket.medium + bucket.low;
        if (sum === 0) return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "vx-ui-muted", children: "\u2014" });
        return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "vx-ui-row-actions", children: [
          bucket.critical > 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(Chip, { tone: "red", children: [
            bucket.critical,
            " \u4E25\u91CD"
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Chip, { tone: bucket.high > 0 ? "amber" : "neutral", children: sum })
        ] });
      }
    },
    {
      key: "tokens",
      header: "Token",
      width: "72px",
      align: "right",
      mono: true,
      render: (task) => fmtCount(task.tokens?.total ?? 0)
    },
    {
      key: "activity",
      header: "\u6700\u8FD1\u6D3B\u52A8",
      width: "92px",
      align: "right",
      render: (task) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "vx-ui-muted", children: relTime(task.last_activity) })
    },
    {
      key: "open",
      header: "",
      width: "64px",
      align: "right",
      render: (task) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button, { size: "sm", onClick: () => setOpen(String(task.id)), children: "\u6253\u5F00" })
    }
  ];
  const pageCount = pages;
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
    PageShell,
    {
      title: "\u4EFB\u52A1",
      desc: "\u4EFB\u52A1\u7684\u63A2\u7D22\u8FB9\u754C\u3001\u76EE\u6807\u8FBE\u6210\u4E0E\u4EA7\u51FA\uFF1B\u6E05\u5355\u53E3\u5F84\u4E0E\u6982\u89C8\u4E00\u81F4\uFF0C\u6570\u5B57\u4E0D\u4F1A\u4E24\u5904\u4E0D\u4E00\u81F4\u3002",
      actions: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
        viewSwitch ?? null,
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button, { size: "sm", busy: list.refreshing, onClick: reload, children: "\u5237\u65B0" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button, { size: "sm", onClick: () => setShowArchives(true), children: "\u5F52\u6863\u8BB0\u5F55" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button, { size: "sm", variant: "primary", onClick: () => {
          setDraft({ description: "", goal: "" });
          setError("");
          setCreateOpen(true);
        }, children: "\u65B0\u5EFA\u4EFB\u52A1" })
      ] }),
      status: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "vx-ui-live is-on", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("i", {}),
          "\u6D3B\u52A8 ",
          fmtInt2(metrics.active)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "vx-ui-muted", children: [
          "\u6682\u505C ",
          fmtInt2(metrics.paused)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "vx-ui-muted", children: [
          "\u5728\u98DE ",
          fmtInt2(metrics.inFlight)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Spacer, {}),
        summary.error === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "vx-ui-bad", children: [
          "\u7EDF\u8BA1\u4E0D\u53EF\u7528\uFF1A",
          summary.error.message
        ] })
      ] }),
      children: [
        list.error === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ApiErrorLine, { error: list.error.message, detail: list.error.detail, onRetry: reload }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(KpiGrid, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Kpi, { label: "\u4EFB\u52A1\u603B\u6570", value: fmtInt2(metrics.total), unit: "\u4E2A", hint: `\u672C\u9875 ${fmtInt2(rows.length)} \u6761 \xB7 \u7B2C ${page}/${pageCount} \u9875`, tone: "blue" }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Kpi, { label: "\u8FDB\u884C\u4E2D", value: fmtInt2(metrics.active), unit: "\u4E2A", hint: `\u6682\u505C ${metrics.paused} \xB7 \u5728\u98DE ${metrics.inFlight}`, tone: metrics.active > 0 ? "green" : "neutral" }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Kpi, { label: "\u5DF2\u5B8C\u6210", value: fmtInt2(metrics.done), unit: "\u4E2A", hint: `\u5931\u8D25 ${metrics.failed} \xB7 \u8D85\u65F6 ${metrics.timeout}`, tone: "violet" }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Kpi, { label: "\u5B8C\u6210\u7387", value: fmtPercent(metrics.completionRate), hint: `\u7EC8\u6001 ${fmtInt2(metrics.terminal)} \u4E2A\u91CC\u5B8C\u6210\u7684\u6BD4\u4F8B`, tone: metrics.completionRate >= 0.6 ? "green" : "amber" }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Kpi, { label: "\u76EE\u6807\u8FBE\u6210", value: fmtPercent(metrics.goalRate), hint: `${fmtInt2(metrics.goalsMet)} / ${fmtInt2(metrics.goalsTotal)} \u4E2A\u76EE\u6807`, tone: "amber" }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Kpi, { label: "\u6F0F\u6D1E", value: fmtInt2(metrics.findings.total), unit: "\u4E2A", hint: `\u4E25\u91CD ${metrics.findings.critical} \xB7 \u9AD8\u5371 ${metrics.findings.high}`, tone: metrics.findings.critical > 0 ? "red" : "neutral" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(Card, { title: "\u4EFB\u52A1\u6E05\u5355", hint: query2 === "" ? "\u5168\u90E8\u4EFB\u52A1" : `\u641C\u7D22\u300C${query2}\u300D`, children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(Toolbar, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(TextInput, { value: search, onChange: setSearch, placeholder: "\u641C\u7D22\u4EFB\u52A1\uFF08\u540D\u79F0 / \u63CF\u8FF0 / \u76EE\u6807\uFF09", width: 260 }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              "select",
              {
                className: "vx-ui-select",
                style: { width: 120 },
                value: status,
                "aria-label": "\u72B6\u6001",
                onChange: (event) => {
                  setStatus(event.target.value);
                  setPage(1);
                },
                children: STATUS_OPTIONS.map((option) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: option.value, children: option.label }, option.value))
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              "select",
              {
                className: "vx-ui-select",
                style: { width: 92 },
                value: String(size),
                "aria-label": "\u6BCF\u9875",
                onChange: (event) => {
                  setSize(Number(event.target.value));
                  setPage(1);
                },
                children: SIZE_OPTIONS.map((option) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("option", { value: option.value, children: option.label }, option.value))
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Spacer, {}),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "vx-ui-muted", children: [
              "\u5171 ",
              fmtInt2(total),
              " \u4E2A"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            DataTable,
            {
              columns,
              rows,
              rowKey: (task) => String(task.id),
              onRowClick: (task) => setOpen(String(task.id)),
              loading: list.loading,
              maxHeight: 520,
              empty: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Empty2, { text: "\u6CA1\u6709\u5339\u914D\u7684\u4EFB\u52A1", hint: "\u6362\u4E2A\u7B5B\u9009\u6761\u4EF6\uFF0C\u6216\u70B9\u53F3\u4E0A\u89D2\u65B0\u5EFA\u4E00\u4E2A\u3002" })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Pager, { page: page - 1, pageCount, total, unit: "\u4E2A\u4EFB\u52A1", onPage: (next) => setPage(next + 1) }),
          list.error === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ErrorLine, { error: list.error.message })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          Drawer,
          {
            open: createOpen,
            onClose: () => setCreateOpen(false),
            width: 560,
            title: "\u65B0\u5EFA\u4EFB\u52A1",
            subtitle: "\u63CF\u8FF0\u4E0E\u76EE\u6807\u51B3\u5B9A\u89C4\u5212\u5668\u7684\u63A2\u7D22\u8FB9\u754C\uFF1B\u521B\u5EFA\u540E\u81EA\u52A8\u8FDB\u5165\u4EFB\u52A1\u8BE6\u60C5",
            footer: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button, { size: "sm", variant: "primary", busy: creating, disabled: draft.description.trim() === "", onClick: create, children: "\u521B\u5EFA" }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Spacer, {}),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button, { size: "sm", variant: "ghost", onClick: () => setCreateOpen(false), children: "\u53D6\u6D88" })
            ] }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "vx-ui-field", children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "vx-ui-field-label", children: "\u4EFB\u52A1\u63CF\u8FF0" }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                  "textarea",
                  {
                    className: "vx-ui-textarea",
                    rows: 3,
                    value: draft.description,
                    placeholder: "\u5982\uFF1Aexample.com \u5916\u7F51\u8D44\u4EA7\u68B3\u7406",
                    onChange: (event) => setDraft({ ...draft, description: event.target.value })
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "vx-ui-field", children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "vx-ui-field-label", children: "\u6D4B\u8BD5\u76EE\u6807\uFF08\u53EF\u9009\uFF09" }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                  "textarea",
                  {
                    className: "vx-ui-textarea",
                    rows: 2,
                    value: draft.goal,
                    placeholder: "\u5982\uFF1A\u62FF\u5230\u7BA1\u7406\u5458\u8D26\u53F7\u7684\u8D8A\u6743\u8BBF\u95EE",
                    onChange: (event) => setDraft({ ...draft, goal: event.target.value })
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ErrorLine, { error })
            ]
          }
        )
      ]
    }
  );
}
function TaskArchives({ onBack }) {
  const [page, setPage] = (0, import_react11.useState)(1);
  const [busy, setBusy] = (0, import_react11.useState)(false);
  const [error, setError] = (0, import_react11.useState)("");
  const archives = useResource(`archives:${page}`, () => tasksApi.archives(page));
  const rows = archives.data?.items ?? [];
  const total = archives.data?.total ?? 0;
  async function change(id, action) {
    if (action === "delete" && !window.confirm("\u79FB\u9664\u8FD9\u6761\u5F52\u6863\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u4ECE\u5BA2\u6237\u7AEF\u64A4\u9500\u3002")) return;
    setBusy(true);
    setError("");
    try {
      await (action === "restore" ? tasksApi.restoreArchive(id) : tasksApi.deleteArchive(id));
      if (rows.length === 1 && page > 1) setPage(page - 1);
      else archives.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "vx-task-workspace", children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "vx-task-toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button2, { onClick: onBack, children: "\u2190 \u8FD4\u56DE\u4EFB\u52A1" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button2, { onClick: archives.reload, disabled: busy, children: "\u5237\u65B0" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "vx-task-hint", children: [
        "\u5171 ",
        total,
        " \u6761\u5F52\u6863"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button2, { onClick: () => setPage(page - 1), disabled: busy || page <= 1, children: "\u4E0A\u4E00\u9875" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button2, { onClick: () => setPage(page + 1), disabled: busy || page * 20 >= total, children: "\u4E0B\u4E00\u9875" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(Card2, { title: "\u5F52\u6863\u8BB0\u5F55", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ErrorLine, { error: error || archives.error }),
      archives.loading ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Empty2, { text: "\u8BFB\u53D6\u5F52\u6863\u2026" }) : !archives.error && rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Empty2, { text: "\u6CA1\u6709\u5F52\u6863\u8BB0\u5F55" }) : null,
      rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "vx-task-inline vx-task-inline--wide", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("strong", { children: row.task_name || `\u4EFB\u52A1 #${row.task_id}` }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "vx-task-hint", children: [row.archived_at, row.state].filter(Boolean).join(" \xB7 ") }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button2, { disabled: busy || !["done", "ready", "restore_failed"].includes(row.state), onClick: () => void change(row.id, "restore"), children: "\u6062\u590D" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button2, { tone: "danger", disabled: busy || !["done", "ready", "delete_failed"].includes(row.state), onClick: () => void change(row.id, "delete"), children: "\u79FB\u9664\u5F52\u6863" })
      ] }, row.id))
    ] })
  ] });
}
function TaskDetailPage({ id, onBack }) {
  const [tab, setTab] = (0, import_react11.useState)("overview");
  const task = useResource(`task:${id}`, () => tasksApi.get(id));
  const [busy, setBusy] = (0, import_react11.useState)("");
  const control = (action) => {
    setBusy(action);
    tasksApi.control(id, action).then(task.reload).catch((error) => window.alert(error.message)).finally(() => setBusy(""));
  };
  const value = task.data;
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "vx-task-workspace", children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "vx-task-detail-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button2, { tone: "ghost", onClick: onBack, children: "\u2190 \u8FD4\u56DE" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "vx-task-detail-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("strong", { children: value?.name || value?.description || `\u4EFB\u52A1 #${id}` }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "vx-task-hint", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("code", { children: [
            "#",
            id
          ] }),
          value?.goal ? ` \xB7 ${value.goal}` : ""
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "vx-task-spacer" }),
      value ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(StatusChip, { status: value.status }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        Button2,
        {
          disabled: !value || busy !== "" || !["running", "paused", "queued"].includes(value.status),
          onClick: () => control(value?.paused ? "resume" : "pause"),
          children: value?.paused ? "\u7EE7\u7EED" : "\u6682\u505C"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        Button2,
        {
          disabled: !value || busy !== "",
          onClick: () => {
            setBusy("archive");
            tasksApi.archive(id).then(onBack).catch((error) => window.alert(error.message)).finally(() => setBusy(""));
          },
          children: "\u5F52\u6863"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ErrorLine, { error: task.error }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "vx-task-tabbar", role: "tablist", children: TABS.map(([value2, label]) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", role: "tab", "aria-selected": tab === value2, onClick: () => setTab(value2), children: label }, value2)) }),
    task.loading ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Empty2, { text: "\u8BFB\u53D6\u4EFB\u52A1\u2026" }) : value ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "vx-task-tabbody", children: [
      tab === "sessions" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(SessionsSection, { task: value }),
      tab === "overview" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(OverviewSection, { task: value }),
      tab === "graph" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(GraphSection, { task: value }),
      tab === "broadcast" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(BroadcastSection, { task: value }),
      tab === "findings" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(FindingsSection, { task: value }),
      tab === "retests" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(RetestsSection, { task: value }),
      tab === "assets" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(AssetsSection, { task: value }),
      tab === "coverage" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(CoverageSection, { task: value }),
      tab === "intercept" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(InterceptSection, { task: value }),
      tab === "report" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ReportSection, { task: value })
    ] }) : null
  ] });
}

// src/intercept/page.tsx
var import_react12 = require("react");
var import_react_dom3 = require("react-dom");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/intercept/api.ts
var listOf2 = (value, key) => {
  const inner = value?.[key];
  return Array.isArray(inner) ? inner : [];
};
var num2 = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
var ruleOf = (row) => ({
  id: num2(row.id),
  name: String(row.name ?? ""),
  enabled: Boolean(row.enabled),
  priority: num2(row.priority),
  match_target: row.match_target === "tool_name" ? "tool_name" : "tool_input",
  match_type: row.match_type === "regex" ? "regex" : "string",
  pattern: String(row.pattern ?? ""),
  action: row.action === "allow" ? "allow" : row.action === "ask" ? "ask" : "deny",
  message: String(row.message ?? ""),
  timeout_enabled: Boolean(row.timeout_enabled),
  timeout_seconds: num2(row.timeout_seconds),
  timeout_action: row.timeout_action === "allow" ? "allow" : "deny"
});
var DEFAULT_SCOPE_TOOLS = [
  "Bash",
  "WebFetch",
  "web_search",
  "shell_open",
  "shell_send",
  "Write",
  "Edit",
  "MultiEdit"
];
var interceptApi = {
  async rules() {
    const data = await callApi("/api/intercept/rules");
    return listOf2(data, "rules").map(ruleOf);
  },
  async createRule(draft) {
    return ruleOf(await callApi("/api/intercept/rules", "POST", draft));
  },
  async updateRule(id, draft) {
    return ruleOf(await callApi(`/api/intercept/rules/${id}`, "PUT", draft));
  },
  deleteRule: (id) => callApi(`/api/intercept/rules/${id}`, "DELETE"),
  toggleRule: (id, enabled2) => callApi(`/api/intercept/rules/${id}/toggle`, "POST", { enabled: enabled2 }),
  async scopeTools() {
    const data = await callApi("/api/intercept/tool-config");
    const tools = data?.enabled_tools;
    if (!Array.isArray(tools)) return [...DEFAULT_SCOPE_TOOLS];
    return tools.map((item) => String(item));
  },
  saveScopeTools: (tools) => callApi("/api/intercept/tool-config", "PUT", { enabled_tools: tools }),
  async judge() {
    const data = await callApi("/api/intercept/judge");
    const row = data ?? {};
    return {
      enabled: Boolean(row.enabled),
      profile_id: num2(row.profile_id),
      prompt: String(row.prompt ?? ""),
      timeout_seconds: num2(row.timeout_seconds, 15),
      fail_action: row.fail_action === "deny" ? "deny" : row.fail_action === "ask" ? "ask" : "allow",
      ask_timeout_seconds: num2(row.ask_timeout_seconds, 300),
      ask_timeout_action: row.ask_timeout_action === "allow" ? "allow" : "deny"
    };
  },
  saveJudge: (config) => callApi("/api/intercept/judge", "PUT", config),
  async judgeUsage(days = 30) {
    const data = await callApi(`/api/intercept/judge/usage?days=${days}`);
    const row = data ?? {};
    return {
      calls: num2(row.calls),
      input_tokens: num2(row.input_tokens),
      output_tokens: num2(row.output_tokens),
      cache_read_tokens: num2(row.cache_read_tokens),
      cache_write_tokens: num2(row.cache_write_tokens),
      daily: listOf2(data, "daily").map((day) => ({
        date: String(day.date ?? ""),
        calls: num2(day.calls),
        input_tokens: num2(day.input_tokens),
        output_tokens: num2(day.output_tokens)
      }))
    };
  },
  async profiles() {
    const data = await callApi("/api/llm/profiles");
    return listOf2(data, "profiles").map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      model: String(row.model ?? "")
    }));
  },
  async tools() {
    const data = await callApi("/api/tools");
    return listOf2(data, "tools").map((row) => ({
      key: String(row.key ?? ""),
      description: String(row.description ?? ""),
      system: Boolean(row.system),
      kind: String(row.kind ?? "")
    }));
  }
};
var errText = (error) => error instanceof Error ? error.message : String(error);

// src/intercept/page.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
var TABS2 = [
  ["rules", "\u62E6\u622A\u89C4\u5219"],
  ["judge", "\u6A21\u578B\u914D\u7F6E"]
];
var ACTION_LABEL = { allow: "\u5141\u8BB8", deny: "\u7981\u6B62", ask: "\u7533\u8BF7" };
var ACTION_TONE = { allow: "success", deny: "error", ask: "warn" };
var TARGET_LABEL = { tool_name: "\u5DE5\u5177\u540D", tool_input: "\u8F93\u5165\u5185\u5BB9" };
var TYPE_LABEL = { string: "\u5B57\u7B26\u4E32", regex: "\u6B63\u5219" };
function useLoader(load2, enabled2 = true) {
  const [tick, setTick] = (0, import_react12.useState)(0);
  const [state, setState] = (0, import_react12.useState)({ data: void 0, error: "" });
  const [loading, setLoading] = (0, import_react12.useState)(enabled2);
  const loadRef = (0, import_react12.useRef)(load2);
  loadRef.current = load2;
  (0, import_react12.useEffect)(() => {
    if (!enabled2) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    loadRef.current().then((data) => {
      if (!alive) return;
      setState({ data, error: "" });
      setLoading(false);
    }).catch((reason) => {
      if (!alive) return;
      setState({ data: void 0, error: errText(reason) });
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [enabled2, tick]);
  return { ...state, loading, reload: () => setTick((value) => value + 1) };
}
var fmtTokens = (value) => {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(value);
};
function Switch2({
  checked,
  onChange,
  disabled,
  label
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
    "button",
    {
      type: "button",
      role: "switch",
      "aria-checked": checked,
      "aria-label": label,
      className: "vx-int-switch",
      disabled,
      onClick: () => onChange(!checked),
      children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("i", {})
    }
  );
}
function Field4({ label, hint, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("label", { className: "vx-int-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "vx-int-label", children: label }),
    children,
    hint ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("small", { className: "vx-int-hint", children: hint }) : null
  ] });
}
function Overlay({ children, onClose, dialog }) {
  (0, import_dsh_client_ui_primitives.useModalLayer)(dialog, true, onClose);
  return (0, import_react_dom3.createPortal)(
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      "div",
      {
        className: "vx-int-overlay",
        role: "presentation",
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) onClose();
        },
        children
      }
    ),
    document.body
  );
}
var PlusIcon = () => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("path", { d: "M6 2.25v7.5M2.25 6h7.5", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" }) });
var PencilIcon = () => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
  "path",
  {
    d: "M8.4 1.9a1.2 1.2 0 0 1 1.7 1.7L4.3 9.4l-2.2.5.5-2.2 5.8-5.8Z",
    stroke: "currentColor",
    strokeWidth: "1.2",
    strokeLinejoin: "round"
  }
) });
var TrashIcon = () => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
  "path",
  {
    d: "M2.5 3.3h7M4.6 3.3V2.2h2.8v1.1M3.4 3.3l.4 6.2h4.4l.4-6.2M5.1 5v3M6.9 5v3",
    stroke: "currentColor",
    strokeWidth: "1.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }
) });
var FilterIcon = () => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("svg", { width: "13", height: "13", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("path", { d: "M2 3h10L8.2 7.4v3.5L5.8 12V7.4L2 3Z", stroke: "currentColor", strokeWidth: "1.3", strokeLinejoin: "round" }) });
var BotIcon = () => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: [
  /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("rect", { x: "2.2", y: "4.4", width: "9.6", height: "7", rx: "2", stroke: "currentColor", strokeWidth: "1.2" }),
  /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("path", { d: "M7 2.2v2.2M4.9 7.9h.1M9 7.9h.1", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" })
] });
function ScopeBar({
  tools,
  loading,
  error,
  onEdit
}) {
  const names = tools ?? [...DEFAULT_SCOPE_TOOLS];
  const empty = names.length === 0;
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-bar", "data-warn": empty ? "1" : void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "vx-int-bar-icon", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(FilterIcon, {}) }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-bar-text", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "vx-int-bar-title", children: [
        "\u62E6\u622A\u8303\u56F4",
        loading ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "vx-int-hint", children: "\u8BFB\u53D6\u4E2D\u2026" }) : null
      ] }),
      error ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "vx-int-warn", children: [
        "\u8303\u56F4\u8BFB\u53D6\u5931\u8D25\uFF1A",
        error,
        "\uFF08\u6309\u9ED8\u8BA4 ",
        DEFAULT_SCOPE_TOOLS.length,
        " \u4E2A\u5DE5\u5177\u663E\u793A\uFF09"
      ] }) : empty ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "vx-int-warn", children: "\u672A\u542F\u7528\u4EFB\u4F55\u5DE5\u5177 \u2014 \u62E6\u622A\u89C4\u5219\u4E0E\u6A21\u578B\u515C\u5E95\u5747\u4E0D\u4F1A\u751F\u6548" }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "vx-int-bar-names", title: names.join("\u3001"), children: [
        names.length,
        " \u4E2A\u5DE5\u5177 \xB7 ",
        names.join("\u3001")
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "vx-int-bar-actions", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button2, { disabled: loading || !!error, onClick: onEdit, children: "\u8C03\u6574\u8303\u56F4" }) })
  ] });
}
function RulesTab() {
  const rules = useLoader(interceptApi.rules);
  const [creating, setCreating] = (0, import_react12.useState)(false);
  const [editing, setEditing] = (0, import_react12.useState)(null);
  const [removing, setRemoving] = (0, import_react12.useState)(null);
  const [busy, setBusy] = (0, import_react12.useState)(0);
  const [bulk, setBulk] = (0, import_react12.useState)(false);
  const [error, setError] = (0, import_react12.useState)("");
  const rows = rules.data ?? [];
  const enabledCount = rows.filter((rule) => rule.enabled).length;
  const toggle = async (rule) => {
    setError("");
    setBusy(rule.id);
    try {
      await interceptApi.toggleRule(rule.id, !rule.enabled);
      rules.reload();
    } catch (reason) {
      setError(errText(reason));
    } finally {
      setBusy(0);
    }
  };
  const enableAll = async () => {
    const pending = rows.filter((rule) => !rule.enabled);
    if (pending.length === 0) return;
    setError("");
    setBulk(true);
    try {
      await Promise.all(pending.map((rule) => interceptApi.toggleRule(rule.id, true)));
      rules.reload();
    } catch (reason) {
      setError(errText(reason));
    } finally {
      setBulk(false);
    }
  };
  const remove = async (rule) => {
    setError("");
    setBusy(rule.id);
    try {
      await interceptApi.deleteRule(rule.id);
      setRemoving(null);
      rules.reload();
    } catch (reason) {
      setError(errText(reason));
    } finally {
      setBusy(0);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-stack", children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "vx-int-hint", children: "\u6309\u4F18\u5148\u7EA7\uFF08\u6570\u5B57\u8D8A\u5927\u8D8A\u5148\uFF09\u9010\u6761\u5339\u914D\uFF0C\u9996\u6761\u547D\u4E2D\u7684\u89C4\u5219\u751F\u6548" }),
      rules.data !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "vx-int-count", children: [
        "\u5171 ",
        rows.length,
        " \u6761\u89C4\u5219 \xB7 ",
        enabledCount,
        " \u6761\u542F\u7528"
      ] }) : null,
      enabledCount < rows.length ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button2, { tone: "ghost", disabled: bulk, onClick: () => void enableAll(), children: bulk ? "\u542F\u7528\u4E2D\u2026" : "\u5168\u90E8\u542F\u7528" }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(Button2, { tone: "primary", disabled: rules.data === void 0, onClick: () => setCreating(true), children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(PlusIcon, {}),
        "\u65B0\u5EFA\u89C4\u5219"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ErrorLine, { error: error || rules.error }),
    rules.loading && rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Empty2, { text: "\u8BFB\u53D6\u62E6\u622A\u89C4\u5219\u2026" }) : rules.data === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button2, { onClick: rules.reload, children: "\u91CD\u8BD5" }) : rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Empty2, { text: "\u6682\u65E0\u62E6\u622A\u89C4\u5219", hint: "\u6CA1\u6709\u89C4\u5219\u547D\u4E2D\u65F6\uFF0C\u5DE5\u5177\u8C03\u7528\u53EA\u53D7\u62E6\u622A\u8303\u56F4\u4E0E\u6A21\u578B\u515C\u5E95\u7EA6\u675F\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(Button2, { onClick: () => setCreating(true), children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(PlusIcon, {}),
        "\u65B0\u5EFA\u7B2C\u4E00\u6761\u89C4\u5219"
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-table", role: "table", "aria-label": "\u62E6\u622A\u89C4\u5219", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-tr vx-int-tr--head", role: "row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "columnheader", children: "\u4F18\u5148\u7EA7" }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "columnheader", children: "\u540D\u79F0" }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "columnheader", children: "\u76EE\u6807" }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "columnheader", children: "\u7C7B\u578B" }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "columnheader", children: "\u6A21\u5F0F" }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "columnheader", children: "\u7B56\u7565" }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "columnheader", className: "vx-int-tr-center", children: "\u542F\u7528" }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "columnheader" })
      ] }),
      rows.map((rule) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-tr", role: "row", "data-off": rule.enabled ? void 0 : "1", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "vx-int-priority", role: "cell", children: rule.priority }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "vx-int-name", role: "cell", title: rule.name, children: rule.name }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "vx-int-dim", role: "cell", children: TARGET_LABEL[rule.match_target] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "vx-int-dim", role: "cell", children: TYPE_LABEL[rule.match_type] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "cell", className: "vx-int-pattern", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("code", { className: "vx-int-code", title: rule.pattern, children: rule.pattern }) }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "cell", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: `vx-chip vx-chip--${ACTION_TONE[rule.action]}`, children: ACTION_LABEL[rule.action] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { role: "cell", className: "vx-int-tr-center", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          Switch2,
          {
            checked: rule.enabled,
            disabled: busy === rule.id,
            label: `${rule.enabled ? "\u505C\u7528" : "\u542F\u7528"}\u89C4\u5219 ${rule.name}`,
            onChange: () => void toggle(rule)
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { role: "cell", className: "vx-int-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "button",
            {
              type: "button",
              className: "vx-int-iconbtn",
              title: "\u7F16\u8F91\u89C4\u5219",
              "aria-label": `\u7F16\u8F91\u89C4\u5219 ${rule.name}`,
              onClick: () => setEditing(rule),
              children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(PencilIcon, {})
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "button",
            {
              type: "button",
              className: "vx-int-iconbtn vx-int-iconbtn--danger",
              title: "\u5220\u9664\u89C4\u5219",
              "aria-label": `\u5220\u9664\u89C4\u5219 ${rule.name}`,
              onClick: () => setRemoving(rule),
              children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(TrashIcon, {})
            }
          )
        ] })
      ] }, rule.id))
    ] }),
    creating || editing ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      RuleEditor,
      {
        rule: editing,
        onClose: () => {
          setCreating(false);
          setEditing(null);
        },
        onSaved: () => {
          setCreating(false);
          setEditing(null);
          rules.reload();
        }
      }
    ) : null,
    removing ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      ConfirmDelete,
      {
        rule: removing,
        busy: busy === removing.id,
        error,
        onCancel: () => setRemoving(null),
        onConfirm: () => void remove(removing)
      }
    ) : null
  ] });
}
function ConfirmDelete({
  rule,
  busy,
  error,
  onCancel,
  onConfirm
}) {
  const dialog = (0, import_react12.useRef)(null);
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Overlay, { onClose: onCancel, dialog, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { ref: dialog, tabIndex: -1, className: "vx-int-modal", role: "dialog", "aria-modal": "true", "aria-label": "\u5220\u9664\u89C4\u5219", children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("header", { className: "vx-int-sheet-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h2", { className: "vx-int-sheet-title", children: "\u5220\u9664\u89C4\u5219" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { className: "vx-int-sheet-sub", children: [
        "\u300C",
        rule.name,
        "\u300D\u5220\u9664\u540E\u4E0D\u518D\u53C2\u4E0E\u5339\u914D\uFF1B\u5DF2\u4EA7\u751F\u7684\u5BA1\u6279\u8BB0\u5F55\u4FDD\u7559\u3002"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-sheet-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ErrorLine, { error }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "vx-int-note", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("code", { className: "vx-int-code", children: rule.pattern }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("footer", { className: "vx-int-sheet-foot", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button2, { onClick: onCancel, children: "\u53D6\u6D88" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button2, { tone: "danger", disabled: busy, onClick: onConfirm, children: busy ? "\u5220\u9664\u4E2D\u2026" : "\u5220\u9664" })
    ] })
  ] }) });
}
var draftOf = (rule) => ({
  name: rule?.name ?? "",
  enabled: rule?.enabled ?? true,
  priority: rule?.priority ?? 0,
  match_target: rule?.match_target ?? "tool_name",
  match_type: rule?.match_type ?? "string",
  pattern: rule?.pattern ?? "",
  action: rule?.action ?? "deny",
  message: rule?.message ?? "",
  timeout_enabled: rule?.timeout_enabled ?? true,
  timeout_seconds: rule?.timeout_seconds || 60,
  timeout_action: rule?.timeout_action ?? "deny"
});
function RuleEditor({
  rule,
  onClose,
  onSaved
}) {
  const [draft, setDraft] = (0, import_react12.useState)(() => draftOf(rule));
  const [saving, setSaving] = (0, import_react12.useState)(false);
  const [error, setError] = (0, import_react12.useState)("");
  const [regexWarn, setRegexWarn] = (0, import_react12.useState)(false);
  const dialog = (0, import_react12.useRef)(null);
  (0, import_react12.useEffect)(() => {
    if (draft.match_type !== "regex" || !draft.pattern) {
      setRegexWarn(false);
      return;
    }
    try {
      new RegExp(draft.pattern);
      setRegexWarn(false);
    } catch {
      setRegexWarn(true);
    }
  }, [draft.match_type, draft.pattern]);
  const patch2 = (next) => setDraft((current) => ({ ...current, ...next }));
  const submit = async () => {
    if (!draft.name.trim()) {
      setError("\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
      return;
    }
    if (!draft.pattern.trim()) {
      setError("\u6A21\u5F0F\u4E0D\u80FD\u4E3A\u7A7A");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const body = {
        ...draft,
        name: draft.name.trim(),
        pattern: draft.pattern.trim(),
        message: draft.message,
        priority: Number.isFinite(draft.priority) ? Math.trunc(draft.priority) : 0,
        timeout_seconds: draft.timeout_seconds > 0 ? Math.trunc(draft.timeout_seconds) : 60
      };
      if (rule) await interceptApi.updateRule(rule.id, body);
      else await interceptApi.createRule(body);
      onSaved();
    } catch (reason) {
      setError(errText(reason));
    } finally {
      setSaving(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Overlay, { onClose, dialog, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("aside", { ref: dialog, tabIndex: -1, className: "vx-int-sheet", role: "dialog", "aria-modal": "true", "aria-label": rule ? "\u7F16\u8F91\u89C4\u5219" : "\u65B0\u5EFA\u89C4\u5219", children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("header", { className: "vx-int-sheet-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h2", { className: "vx-int-sheet-title", children: rule ? "\u7F16\u8F91\u89C4\u5219" : "\u65B0\u5EFA\u89C4\u5219" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "vx-int-sheet-sub", children: "\u4F18\u5148\u7EA7\u8D8A\u5927\u8D8A\u5148\u5339\u914D\uFF1B\u9996\u6761\u547D\u4E2D\u751F\u6548\uFF0C\u540E\u7EED\u8DF3\u8FC7\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-sheet-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Field4, { label: "\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        "input",
        {
          className: "vx-int-control",
          placeholder: "\u7ED9\u89C4\u5219\u8D77\u4E2A\u540D\u5B57",
          value: draft.name,
          "data-modal-autofocus": true,
          onChange: (event) => patch2({ name: event.target.value })
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-row vx-int-row--2", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Field4, { label: "\u4F18\u5148\u7EA7\uFF08\u8D8A\u5927\u8D8A\u5148\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "input",
          {
            className: "vx-int-control",
            type: "number",
            value: String(draft.priority),
            onChange: (event) => patch2({ priority: Number.parseInt(event.target.value, 10) || 0 })
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Field4, { label: "\u5339\u914D\u76EE\u6807", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
          "select",
          {
            className: "vx-int-control",
            value: draft.match_target,
            onChange: (event) => patch2({ match_target: event.target.value }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "tool_name", children: "\u5DE5\u5177\u540D\uFF08tool_name\uFF09" }),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "tool_input", children: "\u8F93\u5165\u5185\u5BB9\uFF08tool_input JSON\uFF09" })
            ]
          }
        ) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "vx-int-divider" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Field4, { label: "\u5339\u914D\u7C7B\u578B", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
        "select",
        {
          className: "vx-int-control",
          value: draft.match_type,
          onChange: (event) => patch2({ match_type: event.target.value }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "string", children: "\u5B57\u7B26\u4E32\u5305\u542B" }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "regex", children: "\u6B63\u5219\u8868\u8FBE\u5F0F" })
          ]
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        Field4,
        {
          label: "\u6A21\u5F0F",
          hint: regexWarn ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "vx-int-warn", children: "\u5305\u542B Go RE2 \u6269\u5C55\u8BED\u6CD5\uFF08\u5982 (?i)\uFF09\uFF0C\u6D4F\u89C8\u5668\u65E0\u6CD5\u9884\u89C8\uFF0C\u63D0\u4EA4\u540E\u7531\u670D\u52A1\u7AEF\u6821\u9A8C" }) : void 0,
          children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "input",
            {
              className: "vx-int-control vx-int-control--mono",
              placeholder: draft.match_type === "regex" ? "^Bash$" : "rm -rf",
              value: draft.pattern,
              spellCheck: false,
              onChange: (event) => patch2({ pattern: event.target.value })
            }
          )
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "vx-int-divider" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Field4, { label: "\u62E6\u622A\u7B56\u7565", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
        "select",
        {
          className: "vx-int-control",
          value: draft.action,
          onChange: (event) => patch2({ action: event.target.value }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "allow", children: "\u5141\u8BB8 \u2014 \u76F4\u63A5\u653E\u884C\uFF0C\u8DF3\u8FC7\u540E\u7EED\u89C4\u5219" }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "deny", children: "\u7981\u6B62 \u2014 \u963B\u65AD\uFF0C\u8FD4\u56DE\u62D2\u7EDD\u6D88\u606F\u7ED9\u6A21\u578B" }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "ask", children: "\u5411\u7528\u6237\u7533\u8BF7 \u2014 \u7B49\u5F85\u5BA1\u6279" })
          ]
        }
      ) }),
      draft.action !== "allow" ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Field4, { label: draft.action === "deny" ? "\u62D2\u7EDD\u6D88\u606F\uFF08\u8FD4\u56DE\u7ED9\u6A21\u578B\uFF09" : "\u5BA1\u6279\u8BF4\u660E\uFF08\u53EF\u9009\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        "textarea",
        {
          className: "vx-int-control",
          rows: 2,
          placeholder: draft.action === "deny" ? "\u64CD\u4F5C\u88AB\u5B89\u5168\u7B56\u7565\u963B\u6B62" : "",
          value: draft.message,
          onChange: (event) => patch2({ message: event.target.value })
        }
      ) }) : null,
      draft.action === "ask" ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "vx-int-divider" }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-checkline", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            Switch2,
            {
              checked: draft.timeout_enabled,
              label: "\u542F\u7528\u5BA1\u6279\u8D85\u65F6",
              onChange: (next) => patch2({ timeout_enabled: next })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u542F\u7528\u5BA1\u6279\u8D85\u65F6" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("small", { className: "vx-int-hint", children: "\u8D85\u65F6\u540E\u81EA\u52A8\u5904\u7F6E\uFF0C\u4E0D\u518D\u7B49\u5F85" })
        ] }),
        draft.timeout_enabled ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-row vx-int-row--2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Field4, { label: "\u8D85\u65F6\u65F6\u95F4\uFF08\u79D2\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "input",
            {
              className: "vx-int-control",
              type: "number",
              min: 5,
              value: String(draft.timeout_seconds),
              onChange: (event) => {
                const seconds = Number.parseInt(event.target.value, 10);
                if (seconds > 0) patch2({ timeout_seconds: seconds });
              }
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Field4, { label: "\u8D85\u65F6\u52A8\u4F5C", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
            "select",
            {
              className: "vx-int-control",
              value: draft.timeout_action,
              onChange: (event) => patch2({ timeout_action: event.target.value }),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "deny", children: "\u81EA\u52A8\u62D2\u7EDD" }),
                /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "allow", children: "\u81EA\u52A8\u5141\u8BB8" })
              ]
            }
          ) })
        ] }) : null
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "vx-int-divider" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-checkline", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Switch2, { checked: draft.enabled, label: "\u542F\u7528\u6B64\u89C4\u5219", onChange: (next) => patch2({ enabled: next }) }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u542F\u7528\u6B64\u89C4\u5219" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ErrorLine, { error })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("footer", { className: "vx-int-sheet-foot", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button2, { onClick: onClose, children: "\u53D6\u6D88" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button2, { tone: "primary", disabled: saving, onClick: () => void submit(), children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" })
    ] })
  ] }) });
}
var sdkTool = (key, description) => ({ key, description, system: true });
var SDK_EXEC = [
  sdkTool("Bash", "\u5728 shell \u4E2D\u6267\u884C\u547D\u4EE4\uFF08dsh \u8FD0\u884C\u65F6\u5DE5\u5177\u540D bash\uFF09"),
  sdkTool("WebFetch", "\u53D1\u8D77 HTTP/HTTPS \u8BF7\u6C42\uFF08\u542B\u4EE3\u7406\u652F\u6301\uFF1Bdsh \u4E3A web_fetch\uFF09"),
  sdkTool("web_search", "\u7F51\u7EDC\u641C\u7D22"),
  sdkTool("shell_open", "\u5F00\u542F\u6301\u4E45 PTY \u4EA4\u4E92\u4F1A\u8BDD"),
  sdkTool("shell_send", "\u5411\u4EA4\u4E92\u4F1A\u8BDD\u53D1\u9001\u8F93\u5165"),
  sdkTool("shell_read", "\u8BFB\u53D6\u4EA4\u4E92\u4F1A\u8BDD\u8F93\u51FA"),
  sdkTool("shell_close", "\u5173\u95ED\u4EA4\u4E92\u4F1A\u8BDD"),
  sdkTool("shell_list", "\u5217\u51FA\u6240\u6709\u4EA4\u4E92\u4F1A\u8BDD")
];
var SDK_WRITE = [
  sdkTool("Write", "\u5199\u5165\u6587\u4EF6\uFF08dsh \u4E3A write\uFF09"),
  sdkTool("Edit", "\u7F16\u8F91\u6587\u4EF6\uFF08\u7CBE\u786E\u66FF\u6362\uFF1Bdsh \u4E3A edit / str_replace_editor\uFF09"),
  sdkTool("MultiEdit", "\u6279\u91CF\u7F16\u8F91\u6587\u4EF6\uFF08dsh \u4E3A edit / apply_patch\uFF09")
];
var SDK_KEYS = new Set([...SDK_EXEC, ...SDK_WRITE].map((tool) => tool.key));
function toolGroups(catalog) {
  const system = [];
  const custom = [];
  for (const tool of catalog) {
    if (SDK_KEYS.has(tool.key)) continue;
    if (tool.system) system.push(tool);
    else custom.push(tool);
  }
  return [
    { label: "\u6267\u884C\u7C7B", tools: SDK_EXEC },
    { label: "\u5199\u5165/\u7F16\u8F91\u7C7B", tools: SDK_WRITE },
    { label: "\u7CFB\u7EDF\u5DE5\u5177", tools: system },
    { label: "\u81EA\u5B9A\u4E49\u5DE5\u5177", tools: custom }
  ].filter((group) => group.tools.length > 0);
}
function ScopeDialog({
  tools,
  onClose,
  onSaved
}) {
  const catalog = useLoader(interceptApi.tools);
  const [picked, setPicked] = (0, import_react12.useState)(() => new Set(tools));
  const [saving, setSaving] = (0, import_react12.useState)(false);
  const [error, setError] = (0, import_react12.useState)("");
  const dialog = (0, import_react12.useRef)(null);
  const groups = toolGroups(catalog.data ?? []);
  const toggle = (key) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const save = async () => {
    setError("");
    setSaving(true);
    try {
      await interceptApi.saveScopeTools([...picked]);
      onSaved();
    } catch (reason) {
      setError(errText(reason));
    } finally {
      setSaving(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Overlay, { onClose, dialog, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { ref: dialog, tabIndex: -1, className: "vx-int-modal", role: "dialog", "aria-modal": "true", "aria-label": "\u62E6\u622A\u8303\u56F4", children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("header", { className: "vx-int-sheet-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("h2", { className: "vx-int-sheet-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(FilterIcon, {}),
        "\u62E6\u622A\u8303\u56F4"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { className: "vx-int-sheet-sub", children: [
        "\u53EA\u6709\u542F\u7528\u7684\u5DE5\u5177\u624D\u8FDB\u5165\u89C4\u5219\u5339\u914D\uFF1B\u5176\u4F59\u5DE5\u5177\u76F4\u63A5\u653E\u884C\u3002\u5DF2\u9009 ",
        picked.size,
        " \u4E2A\u3002 \u540D\u79F0\u6309\u4E24\u5957\u8FD0\u884C\u65F6\u5BF9\u9F50\uFF1AClaude \u98CE\u683C\u7684 Bash / Write \u4E0E dsh \u7684 bash / write \u4E92\u76F8\u7B49\u4EF7\u3002"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-sheet-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ErrorLine, { error: catalog.error }),
      catalog.loading && groups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Empty2, { text: "\u8BFB\u53D6\u5DE5\u5177\u76EE\u5F55\u2026" }) : null,
      groups.map((group, index) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-group", children: [
        index > 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "vx-int-divider" }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "vx-int-label", children: group.label }),
        group.tools.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-toolrow", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            Switch2,
            {
              checked: picked.has(tool.key),
              label: `${picked.has(tool.key) ? "\u79FB\u51FA" : "\u52A0\u5165"}\u62E6\u622A\u8303\u56F4\uFF1A${tool.key}`,
              onChange: () => toggle(tool.key)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "vx-int-toolrow-main", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "vx-int-toolrow-key", children: [
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("code", { children: tool.key }),
              tool.kind && tool.kind !== "builtin" ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "vx-chip vx-chip--muted", children: tool.kind }) : null
            ] }),
            tool.description ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("small", { className: "vx-int-hint", children: tool.description }) : null
          ] })
        ] }, tool.key))
      ] }, group.label)),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ErrorLine, { error })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("footer", { className: "vx-int-sheet-foot", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "vx-int-hint", children: "\u4E0D\u4FDD\u5B58\u5219\u6CBF\u7528\u5F53\u524D\u8303\u56F4\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button2, { onClick: onClose, children: "\u53D6\u6D88" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button2, { tone: "primary", disabled: saving, onClick: () => void save(), children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" })
    ] })
  ] }) });
}
function UsageCard({ usage, onRefresh }) {
  const daily = usage?.daily ?? [];
  const peak = Math.max(1, ...daily.map((day) => day.input_tokens + day.output_tokens));
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
    Card2,
    {
      title: "\u5BA1\u6279 Token \u6D88\u8017",
      extra: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button2, { tone: "ghost", onClick: onRefresh, children: "\u5237\u65B0" }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "vx-int-hint", children: "\u6A21\u578B\u515C\u5E95\u5BA1\u6279\u7684\u7D2F\u8BA1\u7528\u91CF\uFF0C\u5355\u72EC\u8BA1\u91CF\uFF08worker=judge\uFF09\uFF0C\u4E0D\u4E0E\u5404\u6A21\u578B\u914D\u7F6E\u7684\u7EDF\u8BA1\u6DF7\u5728\u4E00\u8D77\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-stats", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-stat", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u5BA1\u6279\u8C03\u7528" }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("b", { children: usage ? usage.calls.toLocaleString() : "\u2014" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-stat", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u8F93\u5165 Token" }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("b", { children: usage ? fmtTokens(usage.input_tokens) : "\u2014" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-stat", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u8F93\u51FA Token" }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("b", { children: usage ? fmtTokens(usage.output_tokens) : "\u2014" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-stat", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u7F13\u5B58\u8BFB" }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("b", { children: usage ? fmtTokens(usage.cache_read_tokens) : "\u2014" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-stat", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { children: "\u7F13\u5B58\u5199" }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("b", { children: usage ? fmtTokens(usage.cache_write_tokens) : "\u2014" })
          ] })
        ] }),
        daily.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-sparkwrap", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { className: "vx-int-label", children: [
            "\u8FD1 ",
            daily.length,
            " \u5929\u6BCF\u65E5\u6D88\u8017\uFF08\u8F93\u5165 + \u8F93\u51FA\uFF09"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "vx-int-spark", children: daily.map((day) => {
            const total = day.input_tokens + day.output_tokens;
            return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
              "i",
              {
                title: `${day.date} \xB7 ${day.calls} \u6B21 \xB7 ${fmtTokens(total)} tokens`,
                style: { height: `${Math.max(3, Math.round(total / peak * 100))}%` }
              },
              day.date
            );
          }) })
        ] }) : null
      ]
    }
  );
}
function JudgeTab() {
  const config = useLoader(interceptApi.judge);
  const profiles = useLoader(interceptApi.profiles);
  const [draft, setDraft] = (0, import_react12.useState)(void 0);
  const [saving, setSaving] = (0, import_react12.useState)(false);
  const [error, setError] = (0, import_react12.useState)("");
  const [notice, setNotice] = (0, import_react12.useState)("");
  (0, import_react12.useEffect)(() => {
    if (config.data && draft === void 0) setDraft(config.data);
  }, [config.data, draft]);
  const form = draft ?? config.data;
  const usage = useLoader(() => interceptApi.judgeUsage(30), Boolean(form?.enabled));
  (0, import_react12.useEffect)(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);
  if (config.loading && !form) return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Empty2, { text: "\u8BFB\u53D6\u6A21\u578B\u515C\u5E95\u914D\u7F6E\u2026" });
  if (!form) return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ErrorLine, { error: config.error || "\u6A21\u578B\u515C\u5E95\u914D\u7F6E\u4E0D\u53EF\u7528" });
  const patch2 = (next) => setDraft({ ...form, ...next });
  const save = async () => {
    setError("");
    setSaving(true);
    try {
      await interceptApi.saveJudge(form);
      const fresh = await interceptApi.judge();
      setDraft(fresh);
      config.reload();
      setNotice("\u6A21\u578B\u515C\u5E95\u914D\u7F6E\u5DF2\u4FDD\u5B58");
    } catch (reason) {
      setError(errText(reason));
    } finally {
      setSaving(false);
    }
  };
  const restorePrompt = async () => {
    setError("");
    setSaving(true);
    try {
      await interceptApi.saveJudge({ ...form, prompt: "" });
      const fresh = await interceptApi.judge();
      setDraft(fresh);
      setNotice("\u5DF2\u6062\u590D\u5185\u7F6E\u9ED8\u8BA4\u6A21\u677F");
    } catch (reason) {
      setError(errText(reason));
    } finally {
      setSaving(false);
    }
  };
  const profileOptions = profiles.data ?? [];
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-stack", children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-bar", "data-on": form.enabled ? "1" : void 0, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "vx-int-bar-icon", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(BotIcon, {}) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-bar-text", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "vx-int-bar-title", children: [
          "\u6A21\u578B\u515C\u5E95\u5BA1\u6279",
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: `vx-chip vx-chip--${form.enabled ? "success" : "muted"}`, children: form.enabled ? "\u5DF2\u542F\u7528" : "\u672A\u542F\u7528" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "vx-int-bar-names", children: "\u62E6\u622A\u8303\u56F4\u5185\u7684\u547D\u4EE4\uFF0C\u82E5\u6CA1\u6709\u547D\u4E2D\u4EFB\u4F55\u89C4\u5219\uFF0C\u624D\u7531\u6A21\u578B\u505A\u8BED\u4E49\u5224\u65AD\uFF08\u653E\u884C / \u8F6C\u4EBA\u5DE5 / \u62E6\u622A\uFF09\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "vx-int-bar-actions", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Switch2, { checked: form.enabled, label: "\u542F\u7528\u6A21\u578B\u515C\u5E95\u5BA1\u6279", onChange: (next) => patch2({ enabled: next }) }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ErrorLine, { error: error || config.error }),
    notice ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "vx-int-notice", children: notice }) : null,
    form.enabled ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(UsageCard, { usage: usage.data, onRefresh: usage.reload }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-cols", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
          Card2,
          {
            title: "\u5BA1\u6279\u63D0\u793A\u8BCD",
            extra: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button2, { tone: "ghost", disabled: saving, onClick: () => void restorePrompt(), children: "\u6062\u590D\u9ED8\u8BA4\u6A21\u677F" }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "vx-int-hint", children: "\u6A21\u578B\u636E\u6B64\u5224\u5B9A ALLOW / ASK / DENY\uFF0C\u53EF\u76F4\u63A5\u7F16\u8F91\u3002" }),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                "textarea",
                {
                  className: "vx-int-control vx-int-prompt",
                  value: form.prompt,
                  spellCheck: false,
                  placeholder: "\u7559\u7A7A\u4F7F\u7528\u5185\u7F6E\u6A21\u677F",
                  onChange: (event) => patch2({ prompt: event.target.value })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("p", { className: "vx-int-hint vx-int-right", children: [
                form.prompt.length,
                " \u5B57"
              ] })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(Card2, { title: "\u5224\u5B9A\u53C2\u6570", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Field4, { label: "\u5BA1\u6279\u6A21\u578B", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
            "select",
            {
              className: "vx-int-control",
              value: String(form.profile_id || 0),
              onChange: (event) => patch2({ profile_id: Number(event.target.value) || 0 }),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "0", children: "\u8DDF\u968F\u6FC0\u6D3B\u914D\u7F6E" }),
                profileOptions.map((profile) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("option", { value: profile.id, children: [
                  profile.name,
                  "\uFF08",
                  profile.model,
                  "\uFF09"
                ] }, profile.id))
              ]
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Field4, { label: "\u6A21\u578B\u5224\u5B9A\u8D85\u65F6\uFF08\u79D2\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "input",
            {
              className: "vx-int-control",
              type: "number",
              min: 1,
              value: String(form.timeout_seconds),
              onChange: (event) => {
                const seconds = Number.parseInt(event.target.value, 10);
                if (seconds > 0) patch2({ timeout_seconds: seconds });
              }
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Field4, { label: "\u6A21\u578B\u5931\u8D25\u65F6\uFF08\u51FA\u9519 / \u8D85\u65F6 / \u65E0\u6CD5\u89E3\u6790\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
            "select",
            {
              className: "vx-int-control",
              value: form.fail_action,
              onChange: (event) => patch2({ fail_action: event.target.value }),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "allow", children: "\u653E\u884C" }),
                /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "ask", children: "\u8F6C\u4EBA\u5DE5\u5BA1\u6279" }),
                /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "deny", children: "\u62E6\u622A" })
              ]
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "vx-int-divider" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Field4, { label: "\u5BA1\u6279\u7B49\u5F85\u8D85\u65F6\uFF08\u79D2\uFF09", hint: "\u6A21\u578B\u5224\u4E3A\u300C\u8F6C\u4EBA\u5DE5\u300D\u65F6\u7684\u7B49\u5F85\u4E0A\u9650", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "input",
            {
              className: "vx-int-control",
              type: "number",
              min: 5,
              value: String(form.ask_timeout_seconds),
              onChange: (event) => {
                const seconds = Number.parseInt(event.target.value, 10);
                if (seconds > 0) patch2({ ask_timeout_seconds: seconds });
              }
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Field4, { label: "\u8D85\u65F6\u540E\u9ED8\u8BA4\u52A8\u4F5C", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
            "select",
            {
              className: "vx-int-control",
              value: form.ask_timeout_action,
              onChange: (event) => patch2({ ask_timeout_action: event.target.value }),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "deny", children: "\u62E6\u622A" }),
                /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "allow", children: "\u653E\u884C" })
              ]
            }
          ) })
        ] })
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "vx-int-hint", children: "\u5F00\u542F\u540E\uFF0C\u672A\u547D\u4E2D\u89C4\u5219\u7684\u547D\u4EE4\u624D\u4F1A\u4EA4\u7ED9\u6A21\u578B\u5224\u5B9A\uFF1B\u5173\u95ED\u65F6\u4E0D\u505A\u4EFB\u4F55\u515C\u5E95\u5224\u5B9A\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-foot", children: [
      profiles.error ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "vx-int-hint", children: [
        "\u6A21\u578B\u914D\u7F6E\u8BFB\u53D6\u5931\u8D25\uFF1A",
        profiles.error
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button2, { tone: "primary", disabled: saving, onClick: () => void save(), children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u914D\u7F6E" })
    ] })
  ] });
}
function InterceptSettings() {
  const scope = useLoader(interceptApi.scopeTools);
  const [tab, setTab] = (0, import_react12.useState)("rules");
  const [scopeOpen, setScopeOpen] = (0, import_react12.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "vx-int-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ScopeBar, { tools: scope.data, loading: scope.loading, error: scope.error, onEdit: () => setScopeOpen(true) }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "vx-task-tabbar", role: "tablist", "aria-label": "\u62E6\u622A\u8BBE\u7F6E", children: TABS2.map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", role: "tab", "aria-selected": tab === id, onClick: () => setTab(id), children: label }, id)) }),
    tab === "rules" ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(RulesTab, {}) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(JudgeTab, {}),
    scopeOpen ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      ScopeDialog,
      {
        tools: scope.data ?? [...DEFAULT_SCOPE_TOOLS],
        onClose: () => setScopeOpen(false),
        onSaved: () => {
          setScopeOpen(false);
          scope.reload();
        }
      }
    ) : null
  ] });
}

// src/egress/page.tsx
var import_react14 = require("react");

// src/data/stream.ts
var import_react13 = require("react");
var MAX_EVENTS = 40;
function eventOf(payload) {
  return {
    at: String(payload["at"] ?? (/* @__PURE__ */ new Date()).toISOString()),
    type: String(payload["type"] ?? "event"),
    nodeId: Number(payload["node_id"] ?? 0) || 0,
    poolId: Number(payload["pool_id"] ?? 0) || 0,
    state: String(payload["state"] ?? ""),
    message: String(payload["message"] ?? "")
  };
}
function looksLikeState(payload) {
  return Array.isArray(payload["pools"]) && Array.isArray(payload["nodes"]);
}
function useProxyEventStream(enabled2 = true) {
  const [events, setEvents] = (0, import_react13.useState)([]);
  const [connected, setConnected] = (0, import_react13.useState)(false);
  const eventsRef = (0, import_react13.useRef)([]);
  eventsRef.current = events;
  (0, import_react13.useEffect)(() => {
    if (!enabled2 || typeof window === "undefined" || typeof window.EventSource !== "function") return;
    const source = new window.EventSource(`${API_BASE}/api/proxy/events`);
    const onMessage = (message) => {
      let payload;
      try {
        payload = JSON.parse(message.data);
      } catch {
        return;
      }
      if (looksLikeState(payload)) {
        prime("proxy:state", normalizeProxyState(payload));
        return;
      }
      const next = [eventOf(payload), ...eventsRef.current];
      eventsRef.current = next.slice(0, MAX_EVENTS);
      setEvents(eventsRef.current);
    };
    source.addEventListener("message", onMessage);
    source.addEventListener("open", () => setConnected(true));
    source.addEventListener("error", () => setConnected(false));
    return () => {
      source.removeEventListener("message", onMessage);
      source.close();
      setConnected(false);
    };
  }, [enabled2]);
  return { events, connected };
}

// src/egress/page.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
var HEALTH_LABEL = {
  up: "\u53EF\u7528",
  degraded: "\u6296\u52A8",
  down: "\u4E0D\u53EF\u7528",
  cooldown: "\u51B7\u5374",
  unknown: "\u672A\u6D4B"
};
var HEALTH_TONE = {
  up: "green",
  degraded: "amber",
  down: "red",
  cooldown: "violet",
  unknown: "neutral"
};
var MODE_OPTIONS = [
  { value: "sticky", label: "sticky\uFF08\u4F1A\u8BDD\u7C98\u6027\uFF09" },
  { value: "rotate", label: "rotate\uFF08\u6BCF\u6B21\u8F6E\u6362\uFF09" },
  { value: "fanout", label: "fanout\uFF08\u5E76\u53D1\u53D6\u6700\u5FEB\uFF09" }
];
function EgressPanel() {
  const state = useProxyState(true);
  const subscriptions = useProxySubscriptions();
  const settings = useProxySettings();
  const stream = useProxyEventStream(true);
  const [panel, setPanel] = (0, import_react14.useState)(null);
  const [memberPool, setMemberPool] = (0, import_react14.useState)(null);
  const [busy, setBusy] = (0, import_react14.useState)("");
  const [error, setError] = (0, import_react14.useState)("");
  const [notice, setNotice] = (0, import_react14.useState)("");
  const [poolName, setPoolName] = (0, import_react14.useState)("");
  const [poolMode, setPoolMode] = (0, import_react14.useState)("sticky");
  const [importText, setImportText] = (0, import_react14.useState)("");
  const [importPool, setImportPool] = (0, import_react14.useState)("0");
  const [pivotHost, setPivotHost] = (0, import_react14.useState)("");
  const [pivotPort, setPivotPort] = (0, import_react14.useState)("1080");
  const [pivotProtocol, setPivotProtocol] = (0, import_react14.useState)("socks5");
  const [pivotName, setPivotName] = (0, import_react14.useState)("");
  const [subName, setSubName] = (0, import_react14.useState)("");
  const [subURL, setSubURL] = (0, import_react14.useState)("");
  const [subPool, setSubPool] = (0, import_react14.useState)("0");
  const pools = state.data?.pools ?? [];
  const nodes = state.data?.nodes ?? [];
  const leases = state.data?.leases ?? [];
  const subs = subscriptions.data ?? [];
  const metrics = (0, import_react14.useMemo)(
    () => proxyMetrics(state.data, { subscriptionsDown: subs.filter((row) => row.lastError !== "").length }),
    [state.data, subs]
  );
  async function act(key, task, success) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await task();
      invalidate("proxy:");
      setNotice(success);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy("");
    }
  }
  const poolNameOf = (id) => pools.find((pool) => pool.id === id)?.name ?? (id === 0 ? "\u672A\u6307\u5B9A" : `#${id}`);
  const poolColumns = [
    {
      key: "name",
      header: "\u4EE3\u7406\u6C60",
      render: (pool) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "vx-ui-cell-stack", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("strong", { children: pool.name }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "vx-ui-muted", children: [
          pool.mode,
          " \xB7 fallback ",
          pool.fallback
        ] })
      ] })
    },
    {
      key: "coverage",
      header: "\u8986\u76D6\u7387",
      width: "160px",
      render: (pool) => {
        const ratio = pool.nodeCount === 0 ? 0 : pool.healthyCount / pool.nodeCount;
        return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "vx-ui-cell-stack", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Meter, { value: ratio, tone: ratio >= 0.8 ? "green" : ratio >= 0.4 ? "amber" : "red", label: `${pool.healthyCount}/${pool.nodeCount}` }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "vx-ui-muted", children: [
            pool.healthyCount,
            " / ",
            pool.nodeCount,
            " \u53EF\u7528"
          ] })
        ] });
      }
    },
    {
      key: "members",
      header: "\u6210\u5458",
      width: "72px",
      align: "right",
      mono: true,
      render: (pool) => fmtInt2(pool.nodeCount)
    },
    {
      key: "actions",
      header: "\u64CD\u4F5C",
      width: "250px",
      align: "right",
      render: (pool) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "vx-ui-row-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", busy: busy === `check-${pool.id}`, onClick: () => void act(`check-${pool.id}`, () => api.post(`/api/proxy/pools/${pool.id}/check`, {}), `\u5DF2\u6D4B\u901F\uFF1A${pool.name}`), children: "\u6D4B\u901F" }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", onClick: () => setMemberPool(pool), children: "\u6210\u5458" }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          Button,
          {
            size: "sm",
            variant: pool.id === state.data?.defaultPool ? "primary" : "default",
            disabled: busy !== "" || pool.id === state.data?.defaultPool,
            onClick: () => void act(`default-${pool.id}`, () => api.put("/api/proxy/settings", { default_pool: pool.id }), `\u9ED8\u8BA4\u6C60\u5DF2\u5207\u5230 ${pool.name}`),
            children: pool.id === state.data?.defaultPool ? "\u9ED8\u8BA4" : "\u8BBE\u9ED8\u8BA4"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", variant: "danger", busy: busy === `del-${pool.id}`, onClick: () => void act(`del-${pool.id}`, () => api.del(`/api/proxy/pools/${pool.id}`), `\u5DF2\u5220\u9664 ${pool.name}`), children: "\u5220\u9664" })
      ] })
    }
  ];
  const nodeColumns = [
    {
      key: "name",
      header: "\u8282\u70B9",
      width: "180px",
      render: (node) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "vx-ui-cell-stack", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("strong", { children: node.name }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "vx-ui-muted", children: [
          node.viaNodeId ? `\u7ECF #${node.viaNodeId} \u94FE\u5F0F` : node.source || "\u624B\u52A8\u5BFC\u5165",
          node.egressIp === "" ? "" : ` \xB7 ${node.egressIp}`
        ] })
      ] })
    },
    {
      key: "state",
      header: "\u72B6\u6001",
      width: "86px",
      render: (node) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Chip, { tone: node.enabled ? HEALTH_TONE[node.state] : "neutral", dot: true, children: node.enabled ? HEALTH_LABEL[node.state] : "\u5DF2\u505C\u7528" })
    },
    {
      key: "endpoint",
      header: "\u5730\u5740",
      mono: true,
      width: "210px",
      render: (node) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "vx-ui-ellipsis", children: [
        node.protocol,
        "://",
        node.server,
        ":",
        node.port
      ] }),
      title: (node) => `${node.protocol}://${node.server}:${node.port}`
    },
    { key: "latency", header: "\u5EF6\u8FDF", width: "76px", align: "right", mono: true, render: (node) => fmtMs(node.latencyMs) },
    {
      key: "success",
      header: "\u6210\u529F\u7387",
      width: "128px",
      render: (node) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "vx-ui-cell-stack", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Meter, { value: node.successRate, tone: node.successRate >= 0.9 ? "green" : node.successRate >= 0.6 ? "amber" : "red" }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "vx-ui-muted", children: [
          fmtPercent(node.successRate),
          " \xB7 ",
          fmtInt2(node.requests),
          " \u6B21"
        ] })
      ] })
    },
    {
      key: "actions",
      header: "\u64CD\u4F5C",
      width: "186px",
      align: "right",
      sticky: true,
      render: (node) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "vx-ui-row-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", busy: busy === `node-check-${node.id}`, onClick: () => void act(`node-check-${node.id}`, () => api.post(`/api/proxy/nodes/${node.id}/check`, {}), `${node.name} \u5DF2\u6D4B\u901F`), children: "\u6D4B\u901F" }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", onClick: () => void act(`node-toggle-${node.id}`, () => api.patch(`/api/proxy/nodes/${node.id}`, { enabled: !node.enabled }), `${node.name} ${node.enabled ? "\u5DF2\u505C\u7528" : "\u5DF2\u542F\u7528"}`), children: node.enabled ? "\u505C\u7528" : "\u542F\u7528" }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", variant: "danger", busy: busy === `node-del-${node.id}`, onClick: () => void act(`node-del-${node.id}`, () => api.del(`/api/proxy/nodes/${node.id}`), `${node.name} \u5DF2\u5220\u9664`), children: "\u5220\u9664" })
      ] })
    }
  ];
  const subColumns = [
    {
      key: "name",
      header: "\u8BA2\u9605",
      render: (row) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "vx-ui-cell-stack", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("strong", { children: row.name }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "vx-ui-muted vx-ui-ellipsis", children: row.url })
      ] }),
      title: (row) => row.url
    },
    { key: "pool", header: "\u5BFC\u5165\u6C60", width: "110px", render: (row) => poolNameOf(row.poolId) },
    { key: "interval", header: "\u5468\u671F", width: "84px", align: "right", mono: true, render: (row) => `${row.intervalSeconds}s` },
    {
      key: "delta",
      header: "\u4E0A\u6B21\u53D8\u5316",
      width: "124px",
      render: (row) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "vx-ui-muted", children: [
        "+",
        row.lastAdded,
        " / -",
        row.lastRemoved
      ] })
    },
    {
      key: "state",
      header: "\u72B6\u6001",
      width: "120px",
      render: (row) => row.lastError === "" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Chip, { tone: row.enabled ? "green" : "neutral", dot: true, children: row.enabled ? "\u6B63\u5E38" : "\u505C\u7528" }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Chip, { tone: "red", dot: true, title: row.lastError, children: "\u62C9\u53D6\u5931\u8D25" })
    },
    {
      key: "actions",
      header: "\u64CD\u4F5C",
      width: "150px",
      align: "right",
      render: (row) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "vx-ui-row-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", busy: busy === `sub-refresh-${row.id}`, onClick: () => void act(`sub-refresh-${row.id}`, () => api.post(`/api/proxy/subscriptions/${row.id}/refresh`, {}), `${row.name} \u5DF2\u5237\u65B0`), children: "\u5237\u65B0" }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", variant: "danger", busy: busy === `sub-del-${row.id}`, onClick: () => void act(`sub-del-${row.id}`, () => api.del(`/api/proxy/subscriptions/${row.id}`), `${row.name} \u5DF2\u5220\u9664`), children: "\u5220\u9664" })
      ] })
    }
  ];
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
    PageShell,
    {
      title: "\u4EE3\u7406\u6C60",
      desc: "\u51FA\u53E3\u8282\u70B9\u3001\u6C60\u7B56\u7565\u4E0E\u79DF\u7EA6\u3002\u4EFB\u52A1\u7ED1\u5B9A\u540E\uFF0CAgent \u7684 Bash/\u6D4F\u89C8\u5668/\u590D\u6D4B\u6309\u6C60\u51FA\u7F51\u3002",
      actions: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", busy: state.refreshing, onClick: () => {
          state.refresh();
          subscriptions.refresh();
          settings.refresh();
        }, children: "\u5237\u65B0" }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", variant: "primary", onClick: () => setPanel("import"), children: "\u5BFC\u5165\u8282\u70B9" })
      ] }),
      status: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: `vx-ui-live${state.data?.enabled === true ? " is-on" : ""}`, children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("i", {}),
          state.data?.enabled === true ? "\u7F51\u5173\u5DF2\u542F\u7528" : "\u7F51\u5173\u672A\u542F\u7528"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(Chip, { tone: state.data?.gateway ? "blue" : "neutral", children: [
          "HTTP ",
          state.data?.gateway || "\u2014"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(Chip, { tone: state.data?.socks ? "blue" : "neutral", children: [
          "SOCKS ",
          state.data?.socks || "\u2014"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Chip, { tone: state.data?.engineAvailable === true ? "green" : "amber", dot: true, children: state.data?.engineAvailable === true ? "\u5F15\u64CE\u5C31\u7EEA" : `\u5F15\u64CE\u4E0D\u53EF\u7528${state.data?.engineError ? `\uFF1A${state.data.engineError}` : ""}` }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Chip, { tone: stream.connected ? "green" : "neutral", dot: true, children: stream.connected ? "\u4E8B\u4EF6\u6D41\u5DF2\u8FDE\u63A5" : "\u4E8B\u4EF6\u6D41\u672A\u8FDE\u63A5" }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Spacer, {}),
        metrics.defaultPoolName === "" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "vx-ui-bad", children: "\u672A\u8BBE\u7F6E\u9ED8\u8BA4\u6C60" }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "vx-ui-muted", children: [
          "\u9ED8\u8BA4\u6C60 ",
          metrics.defaultPoolName
        ] })
      ] }),
      children: [
        error === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Banner, { tone: "red", onDismiss: () => setError(""), children: error }),
        notice === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Banner, { tone: "green", onDismiss: () => setNotice(""), children: notice }),
        state.error === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          ApiErrorLine,
          {
            error: `\u4EE3\u7406\u6C60\u72B6\u6001\u8BFB\u53D6\u5931\u8D25\uFF1A${state.error.message}`,
            detail: state.error.detail,
            onRetry: () => state.refresh()
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(KpiGrid, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Kpi, { label: "\u8282\u70B9", value: fmtInt2(metrics.nodes), unit: "\u4E2A", hint: `\u542F\u7528 ${fmtInt2(metrics.enabled)}`, tone: "blue" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Kpi, { label: "\u5065\u5EB7\u7387", value: fmtPercent(metrics.healthRate), hint: `\u53EF\u7528 ${metrics.up} \xB7 \u6296\u52A8 ${metrics.degraded} \xB7 \u4E0D\u53EF\u7528 ${metrics.down} \xB7 \u51B7\u5374 ${metrics.cooldown}`, tone: metrics.healthRate >= 0.8 ? "green" : metrics.healthRate >= 0.4 ? "amber" : "red" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Kpi, { label: "\u52A0\u6743\u6210\u529F\u7387", value: metrics.requests === 0 ? "\u2014" : fmtPercent(metrics.successRate), hint: `${fmtInt2(metrics.requests)} \u6B21\u8BF7\u6C42 \xB7 ${fmtInt2(metrics.failures)} \u6B21\u5931\u8D25`, tone: metrics.successRate >= 0.95 || metrics.requests === 0 ? "green" : "amber" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Kpi, { label: "\u5E73\u5747\u5EF6\u8FDF", value: metrics.avgLatencyMs === 0 ? "\u2014" : String(metrics.avgLatencyMs), unit: "ms", hint: "\u4EC5\u7EDF\u8BA1\u5DF2\u6D4B\u901F\u8282\u70B9", tone: "violet" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Kpi, { label: "\u79DF\u7EA6", value: fmtInt2(metrics.leases), unit: "\u4E2A", hint: "\u6B63\u5728\u88AB\u4F1A\u8BDD\u5360\u7528\u7684\u51FA\u53E3", tone: metrics.leases > 0 ? "green" : "neutral" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Kpi, { label: "\u672A\u5165\u6C60", value: fmtInt2(metrics.unpooled), unit: "\u8282\u70B9", hint: metrics.unpooled > 0 ? "\u8FD9\u4E9B\u8282\u70B9\u4E0D\u4F1A\u88AB\u4EFB\u4F55\u6C60\u8C03\u5EA6" : "\u5168\u90E8\u8282\u70B9\u5DF2\u5165\u6C60", tone: metrics.unpooled > 0 ? "amber" : "green" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          Split,
          {
            main: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
                Card,
                {
                  title: "\u4EE3\u7406\u6C60",
                  hint: `${metrics.pools} \u4E2A \xB7 \u9ED8\u8BA4 ${metrics.defaultPoolName || "\u672A\u8BBE\u7F6E"}`,
                  actions: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", variant: "ghost", onClick: () => setPanel("subscribe"), children: "\u65B0\u589E\u8BA2\u9605" }),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(Toolbar, { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { value: poolName, onChange: setPoolName, placeholder: "\u65B0\u6C60\u540D\u79F0\uFF0C\u5982\uFF1A\u56FD\u5185\u51FA\u53E3", width: 220 }),
                      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Select, { value: poolMode, options: MODE_OPTIONS, label: "\u9ED8\u8BA4\u6A21\u5F0F", onChange: (next) => setPoolMode(next) }),
                      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                        Button,
                        {
                          size: "sm",
                          variant: "primary",
                          disabled: poolName.trim() === "" || busy !== "",
                          busy: busy === "create-pool",
                          onClick: () => void act("create-pool", async () => {
                            await api.post("/api/proxy/pools", { name: poolName.trim(), mode_default: poolMode });
                            setPoolName("");
                          }, "\u6C60\u5DF2\u521B\u5EFA"),
                          children: "\u521B\u5EFA\u6C60"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                      DataTable,
                      {
                        columns: poolColumns,
                        rows: pools,
                        rowKey: (pool) => String(pool.id),
                        loading: state.loading,
                        dense: true,
                        empty: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(EmptyState, { title: "\u8FD8\u6CA1\u6709\u4EE3\u7406\u6C60", hint: "\u5148\u5EFA\u4E00\u4E2A\u6C60\uFF0C\u518D\u628A\u8282\u70B9\u6302\u8FDB\u53BB\uFF1B\u5426\u5219\u8282\u70B9\u4E0D\u4F1A\u88AB\u8C03\u5EA6" })
                      }
                    )
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                Card,
                {
                  title: "\u8282\u70B9",
                  hint: `${fmtInt2(metrics.nodes)} \u4E2A \xB7 \u53EF\u7528 ${metrics.up} \xB7 \u6296\u52A8 ${metrics.degraded} \xB7 \u4E0D\u53EF\u7528 ${metrics.down}`,
                  actions: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", onClick: () => setPanel("pivot"), children: "\u767B\u8BB0\u8DF3\u677F" }),
                  children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                    DataTable,
                    {
                      columns: nodeColumns,
                      rows: nodes,
                      rowKey: (node) => String(node.id),
                      loading: state.loading,
                      dense: true,
                      maxHeight: 420,
                      empty: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(EmptyState, { title: "\u6CA1\u6709\u8282\u70B9", hint: "\u7C98\u8D34 URI / Clash YAML \u5BFC\u5165\uFF0C\u6216\u767B\u8BB0\u4E00\u4E2A\u6E17\u900F\u8DF3\u677F", action: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", onClick: () => setPanel("import"), children: "\u5BFC\u5165\u8282\u70B9" }) })
                    }
                  )
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Card, { title: "\u79DF\u7EA6", hint: "\u4F1A\u8BDD \u2192 \u51FA\u53E3\u8282\u70B9\uFF1B\u5230\u671F\u540E\u7531\u6C60\u91CD\u65B0\u5206\u914D", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                DataTable,
                {
                  columns: [
                    { key: "session", header: "\u4F1A\u8BDD", width: "230px", mono: true, render: (row) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "vx-ui-ellipsis", children: row.session }), title: (row) => row.session },
                    {
                      key: "owner",
                      header: "\u5F52\u5C5E",
                      width: "150px",
                      render: (row) => row.taskId === 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "vx-ui-muted", children: "\u4EA4\u4E92\u5F0F" }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { children: [
                        "\u4EFB\u52A1 #",
                        row.taskId,
                        row.role === "" ? "" : ` \xB7 ${row.role}`
                      ] })
                    },
                    { key: "pool", header: "\u6C60", width: "120px", render: (row) => row.poolName === "" ? poolNameOf(row.poolId) : row.poolName },
                    { key: "node", header: "\u8282\u70B9", width: "150px", render: (row) => row.nodeName === "" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "vx-ui-muted", children: "\u672A\u5206\u914D" }) : row.nodeName },
                    { key: "mode", header: "\u6A21\u5F0F", width: "86px", mono: true, render: (row) => row.mode },
                    { key: "requests", header: "\u8BF7\u6C42", width: "92px", align: "right", mono: true, render: (row) => `${fmtInt2(row.requests)}${row.failures > 0 ? ` / \u2717${row.failures}` : ""}` },
                    { key: "expires", header: "\u5230\u671F", width: "100px", align: "right", render: (row) => fmtRemaining(row.expiresAt) }
                  ],
                  rows: leases,
                  rowKey: (row) => row.session,
                  dense: true,
                  empty: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(EmptyState, { title: "\u6CA1\u6709\u6D3B\u8DC3\u79DF\u7EA6", hint: "\u4EFB\u52A1\u6216\u6D4F\u89C8\u5668\u51FA\u53E3\u7ED1\u5B9A\u540E\u624D\u4F1A\u4EA7\u751F" })
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Card, { title: "\u8BA2\u9605", hint: `${subs.length} \u4E2A\u6765\u6E90 \xB7 \u5931\u8D25 ${metrics.subscriptionsDown}`, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                DataTable,
                {
                  columns: subColumns,
                  rows: subs,
                  rowKey: (row) => String(row.id),
                  loading: subscriptions.loading,
                  dense: true,
                  empty: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(EmptyState, { title: "\u6CA1\u6709\u8BA2\u9605", hint: "\u8BA2\u9605\u4F1A\u6309\u671F\u62C9\u53D6\u8282\u70B9\u5E76\u5408\u5E76\u8FDB\u6307\u5B9A\u6C60", action: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", onClick: () => setPanel("subscribe"), children: "\u65B0\u589E\u8BA2\u9605" }) })
                }
              ) })
            ] }),
            rail: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Card, { title: "\u6C60\u8986\u76D6\u7387", hint: "\u53EF\u7528\u8282\u70B9 / \u6C60\u5185\u8282\u70B9", children: pools.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(EmptyState, { title: "\u6682\u65E0\u6C60" }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "vx-ui-hbars", children: pools.map((pool) => {
                const ratio = pool.nodeCount === 0 ? 0 : pool.healthyCount / pool.nodeCount;
                return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "vx-ui-hbar vx-ui-hbar--static", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "vx-ui-hbar-label", title: pool.name, children: pool.name }),
                  /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("i", { children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("b", { className: `vx-ui-tone-${ratio >= 0.8 ? "green" : ratio >= 0.4 ? "amber" : "red"}`, style: { width: `${Math.max(3, ratio * 100)}%` } }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("em", { children: [
                    pool.healthyCount,
                    "/",
                    pool.nodeCount
                  ] })
                ] }, pool.id);
              }) }) }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Card, { title: "\u5B9E\u65F6\u4E8B\u4EF6", hint: stream.connected ? "SSE \u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5\uFF085s \u8F6E\u8BE2\u515C\u5E95\uFF09", scroll: true, children: stream.events.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(EmptyState, { title: "\u6682\u65E0\u4E8B\u4EF6", hint: "\u8282\u70B9\u5065\u5EB7\u53D8\u5316\u3001\u8BA2\u9605\u5237\u65B0\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC" }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "vx-ui-events", children: stream.events.map((event, index) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "vx-ui-event", children: [
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("code", { children: event.type }),
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { children: event.message === "" ? event.state === "" ? `#${event.nodeId}` : `\u8282\u70B9 #${event.nodeId} \u2192 ${event.state}` : event.message }),
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("em", { children: fmtRelative(event.at) })
              ] }, `${event.at}-${index}`)) }) }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Card, { title: "\u5165\u53E3", hint: "\u6240\u6709\u51FA\u53E3\u90FD\u7ECF\u672C\u673A\u56DE\u73AF\u7F51\u5173", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(KeyValue, { rows: [
                { label: "HTTP \u7F51\u5173", value: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("code", { children: state.data?.gateway || "\u2014" }) },
                { label: "SOCKS5", value: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("code", { children: state.data?.socks || "\u2014" }) },
                { label: "\u9ED8\u8BA4\u6C60", value: metrics.defaultPoolName || "\u672A\u8BBE\u7F6E" },
                { label: "\u76D1\u542C\u8BA4\u8BC1", value: settings.data?.listenerAuth === true ? "\u5DF2\u5F00\u542F" : "\u672A\u5F00\u542F" },
                { label: "fanout \u9884\u7B97", value: settings.data === void 0 ? "\u2014" : `${fmtInt2(settings.data.fanoutBudgetPerHour)} / \u5C0F\u65F6` }
              ] }) })
            ] })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
          Drawer,
          {
            open: panel === "import",
            onClose: () => setPanel(null),
            title: "\u5BFC\u5165\u8282\u70B9",
            subtitle: "\u5355\u884C URI\uFF08socks5:// / http:// / ss:// / vmess:// \u2026\uFF09\u6216 Clash proxies YAML",
            footer: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                Button,
                {
                  size: "sm",
                  variant: "primary",
                  disabled: importText.trim() === "" || busy !== "",
                  busy: busy === "import",
                  onClick: () => void act("import", async () => {
                    const poolId = Number(importPool) || void 0;
                    await api.post("/api/proxy/nodes/import", poolId === void 0 ? { text: importText } : { text: importText, pool_id: poolId });
                    setImportText("");
                    setPanel(null);
                  }, "\u8282\u70B9\u5DF2\u5BFC\u5165"),
                  children: "\u5BFC\u5165"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Spacer, {}),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", variant: "ghost", onClick: () => setPanel(null), children: "\u53D6\u6D88" })
            ] }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field2, { label: "\u76EE\u6807\u6C60", hint: "\u4E0D\u9009\u5219\u53EA\u5165\u5E93\u3001\u4E0D\u53C2\u4E0E\u8C03\u5EA6", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                Select,
                {
                  value: importPool,
                  label: "\u76EE\u6807\u6C60",
                  options: [{ value: "0", label: "\u4E0D\u52A0\u5165\u6C60" }, ...pools.map((pool) => ({ value: String(pool.id), label: pool.name }))],
                  onChange: (next) => setImportPool(next)
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field2, { label: "\u8282\u70B9\u5185\u5BB9", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextArea, { value: importText, rows: 10, mono: true, onChange: setImportText, placeholder: "socks5://user:pass@1.2.3.4:1080#node-a\nhttp://5.6.7.8:8080#node-b" }) })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          Drawer,
          {
            open: panel === "pivot",
            onClose: () => setPanel(null),
            width: 560,
            title: "\u767B\u8BB0\u6E17\u900F\u8DF3\u677F",
            subtitle: "\u62FF\u5230 SSH -D / CobaltStrike SOCKS \u540E\u7ACB\u523B\u5165\u6C60\uFF0C\u53EF\u7ECF\u73B0\u6709\u8282\u70B9\u94FE\u5F0F\u62E8\u53F7",
            footer: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                Button,
                {
                  size: "sm",
                  variant: "primary",
                  disabled: pivotHost.trim() === "" || busy !== "",
                  busy: busy === "pivot",
                  onClick: () => void act("pivot", async () => {
                    await api.post("/api/proxy/pivots", {
                      protocol: pivotProtocol,
                      server: pivotHost.trim(),
                      port: Number(pivotPort) || 1080,
                      name: pivotName.trim() || void 0
                    });
                    setPivotHost("");
                    setPivotName("");
                    setPanel(null);
                  }, "\u8DF3\u677F\u5DF2\u5165\u6C60"),
                  children: "\u767B\u8BB0"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Spacer, {}),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", variant: "ghost", onClick: () => setPanel(null), children: "\u53D6\u6D88" })
            ] }),
            children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "vx-ui-form-grid", children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field2, { label: "\u534F\u8BAE", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                Select,
                {
                  value: pivotProtocol,
                  label: "\u534F\u8BAE",
                  options: [{ value: "socks5", label: "SOCKS5" }, { value: "http", label: "HTTP" }],
                  onChange: (next) => setPivotProtocol(next)
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field2, { label: "\u4E3B\u673A", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { value: pivotHost, onChange: setPivotHost, placeholder: "10.10.10.20", mono: true }) }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field2, { label: "\u7AEF\u53E3", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { value: pivotPort, onChange: setPivotPort, placeholder: "1080", mono: true }) }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field2, { label: "\u540D\u79F0\uFF08\u53EF\u9009\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { value: pivotName, onChange: setPivotName, placeholder: "kali-ssh-d" }) })
            ] })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
          Drawer,
          {
            open: panel === "subscribe",
            onClose: () => setPanel(null),
            width: 560,
            title: "\u65B0\u589E\u8BA2\u9605",
            subtitle: "\u6309\u671F\u62C9\u53D6\u8282\u70B9\u6E05\u5355\u5E76\u5408\u5E76\u8FDB\u6307\u5B9A\u6C60",
            footer: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                Button,
                {
                  size: "sm",
                  variant: "primary",
                  disabled: subName.trim() === "" || subURL.trim() === "" || busy !== "",
                  busy: busy === "subscribe",
                  onClick: () => void act("subscribe", async () => {
                    await api.post("/api/proxy/subscriptions", {
                      name: subName.trim(),
                      url: subURL.trim(),
                      pool_id: Number(subPool) || 0
                    });
                    setSubName("");
                    setSubURL("");
                    setPanel(null);
                  }, "\u8BA2\u9605\u5DF2\u521B\u5EFA"),
                  children: "\u521B\u5EFA"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Spacer, {}),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", variant: "ghost", onClick: () => setPanel(null), children: "\u53D6\u6D88" })
            ] }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field2, { label: "\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { value: subName, onChange: setSubName, placeholder: "\u673A\u573A A" }) }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field2, { label: "\u8BA2\u9605 URL", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { value: subURL, onChange: setSubURL, placeholder: "https://\u2026", mono: true }) }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field2, { label: "\u5BFC\u5165\u5230\u6C60", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                Select,
                {
                  value: subPool,
                  label: "\u5BFC\u5165\u5230\u6C60",
                  options: [{ value: "0", label: "\u4E0D\u81EA\u52A8\u52A0\u5165" }, ...pools.map((pool) => ({ value: String(pool.id), label: pool.name }))],
                  onChange: (next) => setSubPool(next)
                }
              ) })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          Drawer,
          {
            open: memberPool !== null,
            onClose: () => setMemberPool(null),
            width: 640,
            title: `\u6210\u5458\u7BA1\u7406 \xB7 ${memberPool?.name ?? ""}`,
            subtitle: "\u52FE\u9009\u5373\u52A0\u5165\u6C60\uFF1B\u53D6\u6D88\u52FE\u9009\u5373\u79FB\u51FA\u3002\u6C60\u5916\u8282\u70B9\u4E0D\u4F1A\u88AB\u8BE5\u6C60\u8C03\u5EA6\u3002",
            footer: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", variant: "ghost", onClick: () => setMemberPool(null), children: "\u5B8C\u6210" }),
            children: memberPool === null ? null : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "vx-ui-member-list", children: nodes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(EmptyState, { title: "\u6CA1\u6709\u8282\u70B9", hint: "\u5148\u5BFC\u5165\u8282\u70B9" }) : nodes.map((node) => {
              const member = memberPool.members.includes(node.id);
              return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("label", { className: `vx-ui-member${member ? " is-on" : ""}`, children: [
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                  "input",
                  {
                    type: "checkbox",
                    checked: member,
                    disabled: busy !== "",
                    onChange: () => void act(`member-${node.id}`, async () => {
                      if (member) await api.del(`/api/proxy/pools/${memberPool.id}/nodes/${node.id}`);
                      else await api.post(`/api/proxy/pools/${memberPool.id}/nodes`, { node_ids: [node.id] });
                      const next = await api.get("/api/proxy/pools");
                      const fresh = next.find((row) => Number(row["id"]) === memberPool.id);
                      if (fresh !== void 0) {
                        const members = Array.isArray(fresh["members"]) ? fresh["members"].map(Number) : [];
                        setMemberPool({ ...memberPool, members });
                      }
                    }, member ? "\u5DF2\u79FB\u51FA\u6C60" : "\u5DF2\u52A0\u5165\u6C60")
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "vx-ui-member-main", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("strong", { children: node.name }),
                  /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("em", { children: [
                    node.protocol,
                    "://",
                    node.server,
                    ":",
                    node.port
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Chip, { tone: node.enabled ? HEALTH_TONE[node.state] : "neutral", dot: true, children: node.enabled ? HEALTH_LABEL[node.state] : "\u505C\u7528" })
              ] }, node.id);
            }) })
          }
        )
      ]
    }
  );
}

// src/traffic/page.tsx
var import_react15 = require("react");
var import_jsx_runtime12 = require("react/jsx-runtime");
var PAGE_SIZE = 100;
var STATUS_OPTIONS2 = [
  { value: "", label: "\u5168\u90E8\u72B6\u6001" },
  { value: "2xx", label: "2xx \u6210\u529F" },
  { value: "3xx", label: "3xx \u8DF3\u8F6C" },
  { value: "4xx", label: "4xx \u5BA2\u6237\u7AEF\u9519\u8BEF" },
  { value: "5xx", label: "5xx \u670D\u52A1\u7AEF\u9519\u8BEF" }
];
var METHOD_OPTIONS = [
  { value: "", label: "\u5168\u90E8\u65B9\u6CD5" },
  { value: "GET", label: "GET" },
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
  { value: "PATCH", label: "PATCH" },
  { value: "DELETE", label: "DELETE" }
];
function pathOf(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}
function rawBody(raw) {
  const index = raw.search(/\r?\n\r?\n/);
  return index === -1 ? "" : raw.slice(index).replace(/^\r?\n\r?\n/, "");
}
function curlOf(request2, row) {
  const lines = request2.split(/\r?\n/);
  const first = lines[0] ?? "";
  const head = /^([A-Z]+)\s+(\S+)/.exec(first);
  const method = head?.[1] ?? row.method;
  const target = head?.[2] ?? pathOf(row.url);
  const absolute = /^https?:\/\//.test(target) ? target : `${originOf(row.url)}${target}`;
  const out = [`curl -i -sS -X ${method} '${absolute}'`];
  for (const line of lines.slice(1)) {
    const trimmed = line.trim();
    if (trimmed === "") break;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const name = trimmed.slice(0, colon);
    if (/^(host|content-length|connection)$/i.test(name)) continue;
    out.push(`  -H '${name}: ${trimmed.slice(colon + 1).trim()}'`);
  }
  const body = rawBody(request2);
  if (body !== "") out.push(`  --data-raw '${body.replace(/'/g, `'\\''`)}'`);
  return out.join(" \\\n");
}
function TrafficDetail({ row, onClose }) {
  const detail = useQuery(
    `traffic:detail:${row.id}`,
    (signal) => fetchTrafficDetail(row.id, signal),
    { ttlMs: 6e4 }
  );
  const { copy, copied } = useCopy();
  const [side, setSide] = (0, import_react15.useState)("request");
  const text = side === "request" ? detail.data?.req ?? "" : detail.data?.resp ?? "";
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
    Drawer,
    {
      open: true,
      onClose,
      width: 860,
      title: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(MethodBadge, { method: row.method }),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "vx-ui-mono-inline", children: pathOf(row.url) })
      ] }),
      subtitle: row.host,
      meta: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(StatusBadge, { status: row.status }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Chip, { tone: row.source === "archive" ? "violet" : "blue", children: row.source === "archive" ? "\u5F52\u6863\u7D22\u5F15" : "\u4F1A\u8BDD\u91C7\u96C6" }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "vx-ui-muted", children: fmtBytes(row.bytes) }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "vx-ui-muted", children: fmtTime(row.ts) })
      ] }),
      footer: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "sm", onClick: () => copy(text, side === "request" ? "\u8BF7\u6C42\u62A5\u6587" : "\u54CD\u5E94\u62A5\u6587"), children: copied === (side === "request" ? "\u8BF7\u6C42\u62A5\u6587" : "\u54CD\u5E94\u62A5\u6587") ? "\u5DF2\u590D\u5236" : "\u590D\u5236\u62A5\u6587" }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
          Button,
          {
            size: "sm",
            disabled: detail.data === void 0,
            onClick: () => copy(curlOf(detail.data?.req ?? "", row), "cURL"),
            children: copied === "cURL" ? "\u5DF2\u590D\u5236" : "\u590D\u5236\u4E3A cURL"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Spacer, {}),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "sm", variant: "ghost", onClick: onClose, children: "\u5173\u95ED" })
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(KeyValue, { rows: [
          { label: "\u8BB0\u5F55 ID", value: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("code", { children: row.id }) },
          { label: "\u5B8C\u6574 URL", value: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("code", { className: "vx-ui-break", children: row.url }) },
          { label: "\u54CD\u5E94\u7C7B\u578B", value: row.contentType === "" ? "\u2014" : row.contentType },
          { label: "\u72B6\u6001\u5206\u6BB5", value: statusClass2(row.status) }
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "vx-ui-detail-tabs", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
          Segmented2,
          {
            value: side,
            label: "\u62A5\u6587\u4FA7",
            options: [{ value: "request", label: "\u8BF7\u6C42" }, { value: "response", label: "\u54CD\u5E94" }],
            onChange: (next) => setSide(next)
          }
        ) }),
        detail.loading ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Skeleton, { rows: 6 }) : null,
        detail.error === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Banner, { tone: "red", children: detail.error.message }),
        detail.data === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(CodeBlock, { text, maxHeight: 430, empty: side === "request" ? "\u8BE5\u8BB0\u5F55\u6CA1\u6709\u8BF7\u6C42\u6B63\u6587" : "\u8BE5\u8BB0\u5F55\u6CA1\u6709\u54CD\u5E94\u6B63\u6587" })
      ]
    }
  );
}
function WebLane({ active }) {
  const sessions = useWebSessions(active);
  const [selected, setSelected] = (0, import_react15.useState)(null);
  const detail = useWebSession(selected);
  const columns = [
    { key: "time", header: "\u65F6\u95F4", width: "92px", mono: true, render: (row) => fmtTime(row.timestamp) },
    { key: "method", header: "\u65B9\u6CD5", width: "74px", render: (row) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(MethodBadge, { method: row.method }) },
    { key: "status", header: "\u72B6\u6001", width: "68px", render: (row) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(StatusBadge, { status: row.status }) },
    { key: "path", header: "\u8DEF\u5F84", mono: true, render: (row) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "vx-ui-ellipsis", children: row.path }), title: (row) => row.path },
    { key: "class", header: "\u5206\u7C7B", width: "110px", render: (row) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Chip, { tone: row.classification === "normal" ? "green" : row.classification === "waf_blocked" ? "red" : "amber", children: row.classification }) },
    { key: "attempt", header: "\u5C1D\u8BD5", width: "56px", align: "right", mono: true, render: (row) => row.attempt },
    { key: "mutation", header: "\u53D8\u5F02", width: "110px", mono: true, render: (row) => row.mutation },
    { key: "egress", header: "\u51FA\u53E3", width: "110px", mono: true, render: (row) => row.egressId },
    { key: "ms", header: "\u8017\u65F6", width: "70px", align: "right", mono: true, render: (row) => fmtMs(row.durationMs) }
  ];
  if (sessions.loading && sessions.data === void 0) return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Skeleton, { rows: 5 });
  if (sessions.error !== void 0) return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(Banner, { tone: "red", children: [
    "\u4F1A\u8BDD\u8BFB\u53D6\u5931\u8D25\uFF1A",
    sessions.error.message
  ] });
  const rows = sessions.data ?? [];
  if (rows.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      EmptyState,
      {
        title: "\u8FD8\u6CA1\u6709 Web \u6D4B\u8BD5\u4F1A\u8BDD",
        hint: "Harness \u901A\u8FC7 web_session_create \u5EFA\u7ACB\u4F1A\u8BDD\u540E\uFF0C\u8BF7\u6C42\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF08\u72EC\u7ACB\u4E8E\u6293\u5305\u5E93\uFF09"
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "vx-ui-stack", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "vx-ui-session-grid", children: rows.map((session) => {
      const used = session.requestBudget === 0 ? 0 : session.requestCount / session.requestBudget;
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
        "button",
        {
          type: "button",
          className: `vx-ui-session${selected === session.sessionId ? " is-active" : ""}`,
          onClick: () => setSelected(selected === session.sessionId ? null : session.sessionId),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "vx-ui-session-top", children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("strong", { children: session.label === "" ? session.origin : session.label }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Chip, { tone: session.status === "blocked" ? "red" : session.status === "closed" ? "neutral" : "green", dot: true, children: session.status }),
              session.adversarial ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Chip, { tone: "amber", children: "\u5BF9\u6297" }) : null
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "vx-ui-session-origin", children: session.origin }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "vx-ui-session-meter", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("i", { style: { width: `${Math.min(100, used * 100)}%` } }) }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "vx-ui-session-foot", children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { children: [
                "\u8BF7\u6C42 ",
                fmtInt2(session.requestCount),
                " / \u9884\u7B97 ",
                fmtInt2(session.requestBudget)
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: fmtRelative(session.lastRequestAt || session.createdAt) })
            ] })
          ]
        },
        session.sessionId
      );
    }) }),
    selected === null ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
      Card,
      {
        title: "\u4F1A\u8BDD\u8BF7\u6C42",
        hint: detail.data === void 0 ? selected : `${detail.data.session.origin} \xB7 \u5269\u4F59\u9884\u7B97 ${fmtInt2(detail.data.budgetLeft)}`,
        actions: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "sm", onClick: () => setSelected(null), children: "\u6536\u8D77" }),
        children: [
          detail.loading ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Skeleton, { rows: 4 }) : null,
          detail.error === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Banner, { tone: "red", children: detail.error.message }),
          detail.data === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              DataTable,
              {
                columns,
                rows: detail.data.history,
                rowKey: (row) => row.requestId,
                dense: true,
                maxHeight: 360,
                empty: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(EmptyState, { title: "\u8BE5\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u8BF7\u6C42", hint: "Harness \u8C03 web_request_execute \u540E\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC" })
              }
            ),
            detail.data.policyEvents.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "vx-ui-events", children: detail.data.policyEvents.slice(0, 8).map((event, index) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "vx-ui-event", children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("code", { children: event.kind ?? "event" }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { children: event.detail ?? "" }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("em", { children: event.at ?? "" })
            ] }, `${event.at ?? ""}-${index}`)) })
          ] })
        ]
      }
    )
  ] });
}
function Cleanup() {
  const [date, setDate] = (0, import_react15.useState)("");
  const [host, setHost] = (0, import_react15.useState)("");
  const [preview, setPreview] = (0, import_react15.useState)(null);
  const [busy, setBusy] = (0, import_react15.useState)(false);
  const [note, setNote] = (0, import_react15.useState)("");
  const [error, setError] = (0, import_react15.useState)("");
  async function review() {
    if (date === "") return;
    const before = Math.floor((/* @__PURE__ */ new Date(`${date}T00:00:00`)).getTime() / 1e3);
    const path = `/api/traffic/local-cleanup?${new URLSearchParams({ before: String(before), host: host.trim() }).toString()}`;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const result = await api.get(path);
      setPreview({ path, count: result.count, token: result.token });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }
  async function apply2() {
    if (preview === null || !window.confirm(`\u6E05\u7406 ${preview.count} \u6761\u672C\u5730\u6D41\u91CF\u8BB0\u5F55\uFF1F\u6B64\u64CD\u4F5C\u65E0\u6CD5\u64A4\u9500\u3002`)) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.del(preview.path, { token: preview.token });
      setNote(`\u5DF2\u6E05\u7406 ${result.deleted} \u6761\u672C\u5730\u6D41\u91CF\uFF08\u5F52\u6863\u7D22\u5F15\u4E0E\u5DF2\u7ED1\u5B9A\u8BC1\u636E\u4E0D\u53D7\u5F71\u54CD\uFF09`);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setPreview(null);
      setBusy(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(Card, { title: "\u5B58\u50A8\u7EF4\u62A4", hint: "\u4EC5\u6E05\u7406\u672C\u673A kv \u4E2D\u7684\u91C7\u96C6\u8BB0\u5F55\uFF1B\u5F52\u6863\u7D22\u5F15\u4E0E\u5DF2\u7ED1\u5B9A\u7684\u8BC1\u636E\u4FDD\u7559", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(Toolbar, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Field2, { label: "\u622A\u6B62\u65E5\u671F", inline: true, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        "input",
        {
          className: "vx-ui-input",
          type: "date",
          value: date,
          "aria-label": "\u622A\u6B62\u65E5\u671F",
          onChange: (event) => {
            setDate(event.target.value);
            setPreview(null);
          }
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Field2, { label: "\u4E3B\u673A", inline: true, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(TextInput, { value: host, onChange: (next) => {
        setHost(next);
        setPreview(null);
      }, placeholder: "\u7559\u7A7A\u4E3A\u5168\u90E8\u4E3B\u673A", width: 190 }) }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "sm", disabled: date === "" || busy, busy, onClick: () => void review(), children: "\u9884\u89C8\u6E05\u7406" }),
      preview === null ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(Button, { size: "sm", variant: "danger", disabled: preview.count === 0 || busy, onClick: () => void apply2(), children: [
        "\u6E05\u7406 ",
        preview.count,
        " \u6761"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Spacer, {}),
      note === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "vx-ui-ok", children: note })
    ] }),
    error === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Banner, { tone: "red", children: error })
  ] });
}
function TrafficPanel() {
  const [lane, setLane] = (0, import_react15.useState)("capture");
  const [host, setHost] = (0, import_react15.useState)("");
  const [method, setMethod] = (0, import_react15.useState)("");
  const [status, setStatus] = (0, import_react15.useState)("");
  const [keyword, setKeyword] = (0, import_react15.useState)("");
  const [query2, setQuery] = (0, import_react15.useState)("");
  const [page, setPage] = (0, import_react15.useState)(0);
  const [sort, setSort] = (0, import_react15.useState)({ key: "ts", dir: "desc" });
  const [live, setLive] = (0, import_react15.useState)(true);
  const [selected, setSelected] = (0, import_react15.useState)(null);
  (0, import_react15.useEffect)(() => {
    const timer = window.setTimeout(() => {
      setQuery(keyword.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [keyword]);
  const totals = useTrafficTotals(live && lane === "capture");
  const list = useTrafficList(
    { host, method, status, q: query2, sort: sort.key, order: sort.dir, page, size: PAGE_SIZE },
    live && lane === "capture"
  );
  const hosts = useTrafficHosts();
  const capture = useCaptureSummary(live && lane === "capture");
  const webSessions = useWebSessions(lane === "web");
  const metrics = (0, import_react15.useMemo)(() => trafficMetrics({
    totals: totals.data,
    rows: list.data?.rows,
    hosts: hosts.data,
    webSessions: webSessions.data,
    capture: capture.data
  }), [totals.data, list.data, hosts.data, webSessions.data, capture.data]);
  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const error = list.error?.message ?? totals.error?.message ?? "";
  const toggleSort = (key) => {
    if (key !== "ts" && key !== "status" && key !== "resp_len") return;
    setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "ts" ? "desc" : "asc" });
    setPage(0);
  };
  const columns = [
    { key: "ts", header: "\u65F6\u95F4", width: "92px", mono: true, sortable: true, render: (row) => fmtTime(row.ts) },
    { key: "method", header: "\u65B9\u6CD5", width: "82px", render: (row) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(MethodBadge, { method: row.method }) },
    { key: "status", header: "\u72B6\u6001", width: "62px", sortable: true, render: (row) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(StatusBadge, { status: row.status }) },
    {
      key: "host",
      header: "\u4E3B\u673A",
      width: "150px",
      mono: true,
      render: (row) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "vx-ui-ellipsis", children: row.host }),
      title: (row) => row.host
    },
    { key: "path", header: "\u8DEF\u5F84", mono: true, render: (row) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "vx-ui-ellipsis", children: pathOf(row.url) }), title: (row) => row.url },
    { key: "bytes", header: "\u5927\u5C0F", width: "78px", align: "right", mono: true, sortable: true, render: (row) => fmtBytes(row.bytes) },
    {
      key: "source",
      header: "\u6765\u6E90",
      width: "80px",
      render: (row) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Chip, { tone: row.source === "archive" ? "violet" : "blue", children: row.source === "archive" ? "\u5F52\u6863" : "\u91C7\u96C6" })
    }
  ];
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
    PageShell,
    {
      title: "\u6D41\u91CF",
      desc: "\u4F1A\u8BDD\u6293\u5305\u3001\u91C7\u96C6\u9762\u5F52\u6863\u4E0E Web \u6D4B\u8BD5\u5F15\u64CE\u7684\u8BF7\u6C42\u8BB0\u5F55\uFF1B\u540C\u4E00\u4EFD\u53E3\u5F84\uFF0C\u4E09\u79CD\u6765\u6E90\u5206\u5F00\u8BA1\u6570\u3002",
      actions: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "sm", variant: live ? "primary" : "default", onClick: () => setLive(!live), title: "\u5F00\u542F\u540E\u6BCF 5 \u79D2\u5237\u65B0", children: live ? "\u5B9E\u65F6" : "\u5DF2\u6682\u505C" }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "sm", busy: list.refreshing, onClick: () => {
          totals.refresh();
          list.refresh();
          hosts.refresh();
          capture.refresh();
        }, children: "\u5237\u65B0" })
      ] }),
      status: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: `vx-ui-live${metrics.captureActive ? " is-on" : ""}`, children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("i", {}),
          metrics.captureActive ? `\u91C7\u96C6\u4E2D \xB7 ${metrics.captureSessions} \u4E2A\u4F1A\u8BDD` : "\u5F53\u524D\u65E0\u6293\u5305\u4F1A\u8BDD"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "vx-ui-muted", children: [
          "\u6700\u8FD1\u5199\u5165 ",
          fmtRelative(metrics.lastTs)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "vx-ui-muted", children: [
          "Web \u5F15\u64CE ",
          fmtInt2(metrics.web),
          " \u8BF7\u6C42 \xB7 ",
          (webSessions.data ?? []).length,
          " \u4F1A\u8BDD"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Spacer, {})
      ] }),
      children: [
        error === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
          ApiErrorLine,
          {
            error,
            detail: list.error?.detail ?? totals.error?.detail,
            onRetry: () => {
              list.refresh();
              totals.refresh();
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(KpiGrid, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Kpi, { label: "\u603B\u8BB0\u5F55", value: fmtCount(metrics.total), unit: "\u6761", hint: `\u91C7\u96C6 ${fmtInt2(metrics.local)} \xB7 \u5F52\u6863 ${fmtInt2(metrics.archived)}`, tone: "blue" }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Kpi, { label: "\u8BF7\u6C42\u7AD9\u70B9", value: fmtInt2(metrics.hosts), unit: "\u4E2A", hint: "\u6309 host \u53BB\u91CD", tone: "violet" }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Kpi, { label: "\u6837\u672C\u9519\u8BEF\u7387", value: fmtPercent(metrics.errorRate), hint: `\u8FD1 ${fmtInt2(metrics.sampleSize)} \u6761 \xB7 ${fmtInt2(metrics.errors)} \u6761 4xx/5xx`, tone: metrics.errorRate > 0.2 ? "red" : "green" }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Kpi, { label: "\u6837\u672C\u4F53\u79EF", value: fmtBytes(metrics.bytes), hint: `\u8FD1 ${fmtInt2(metrics.sampleSize)} \u6761\u54CD\u5E94\u5408\u8BA1`, tone: "amber" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "vx-ui-lane", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
          Segmented2,
          {
            value: lane,
            label: "\u6D41\u91CF\u6765\u6E90",
            options: [
              { value: "capture", label: "\u91C7\u96C6\u6D41\u91CF", count: metrics.total },
              { value: "web", label: "Web \u5F15\u64CE", count: metrics.web },
              { value: "yak", label: "Yak \u5185\u6838" }
            ],
            onChange: (next) => setLane(next)
          }
        ) }),
        lane === "capture" && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
          Split,
          {
            main: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
              Card,
              {
                title: "\u8BF7\u6C42\u8BB0\u5F55",
                hint: total === 0 ? "\u6682\u65E0\u6570\u636E" : `${fmtInt2(total)} \u6761\u5339\u914D\uFF0C\u6309${sort.key === "ts" ? "\u65F6\u95F4" : sort.key === "status" ? "\u72B6\u6001" : "\u5927\u5C0F"}${sort.dir === "asc" ? "\u5347\u5E8F" : "\u964D\u5E8F"}`,
                actions: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "vx-ui-muted", children: [
                  "\u7B2C ",
                  page + 1,
                  " / ",
                  pageCount,
                  " \u9875"
                ] }),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(Toolbar, { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(TextInput, { value: host, onChange: (next) => {
                      setHost(next);
                      setPage(0);
                    }, placeholder: "\u4E3B\u673A / IP", width: 170 }),
                    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Select, { value: method, options: METHOD_OPTIONS, label: "\u65B9\u6CD5", onChange: (next) => {
                      setMethod(next);
                      setPage(0);
                    } }),
                    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Select, { value: status, options: STATUS_OPTIONS2, label: "\u72B6\u6001", onChange: (next) => {
                      setStatus(next);
                      setPage(0);
                    } }),
                    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(TextInput, { value: keyword, onChange: setKeyword, placeholder: "URL / \u62A5\u6587\u5173\u952E\u8BCD", width: 220 }),
                    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Spacer, {}),
                    host || method || status || query2 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "sm", variant: "ghost", onClick: () => {
                      setHost("");
                      setMethod("");
                      setStatus("");
                      setKeyword("");
                      setQuery("");
                      setPage(0);
                    }, children: "\u6E05\u7A7A\u7B5B\u9009" }) : null
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                    DataTable,
                    {
                      columns,
                      rows,
                      rowKey: (row) => row.id,
                      loading: list.loading,
                      sort,
                      onSort: toggleSort,
                      selectedKey: selected?.id,
                      onRowClick: (row) => setSelected(row),
                      maxHeight: 520,
                      empty: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                        EmptyState,
                        {
                          title: "\u6CA1\u6709\u5339\u914D\u7684\u6D41\u91CF",
                          hint: metrics.total === 0 ? "\u5728\u4F1A\u8BDD\u91CC\u70B9\u300C\u6293\u5305\u300D\u540E\u4EA7\u751F\u7684\u8BF7\u6C42\u4F1A\u843D\u5728\u8FD9\u91CC\uFF1B\u91C7\u96C6\u9762\u5F52\u6863\u9700\u914D\u7F6E Go \u670D\u52A1" : "\u5F53\u524D\u7B5B\u9009\u6761\u4EF6\u6CA1\u6709\u547D\u4E2D\uFF0C\u8BD5\u8BD5\u6E05\u7A7A\u7B5B\u9009"
                        }
                      )
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Pager, { page, pageCount, total, unit: "\u6761", onPage: (next) => setPage(next) })
                ]
              }
            ),
            rail: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Card, { title: "Top \u7AD9\u70B9", hint: `${fmtInt2(metrics.hosts)} \u4E2A`, scroll: true, children: metrics.topHosts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(EmptyState, { title: "\u6682\u65E0\u7AD9\u70B9", hint: "\u6293\u5230\u6D41\u91CF\u540E\u81EA\u52A8\u805A\u5408" }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "vx-ui-hbars", children: metrics.topHosts.map((row) => {
                const max = metrics.topHosts[0]?.count ?? 1;
                return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("button", { type: "button", className: "vx-ui-hbar", onClick: () => {
                  setHost(row.host);
                  setPage(0);
                }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "vx-ui-hbar-label", title: row.host, children: row.host }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("i", { children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("b", { style: { width: `${Math.max(4, row.count / max * 100)}%` } }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("em", { children: fmtInt2(row.count) })
                ] }, row.host);
              }) }) }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Card, { title: "\u72B6\u6001\u5206\u5E03", hint: `\u6837\u672C ${fmtInt2(metrics.sampleSize)}`, children: metrics.byStatus.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(EmptyState, { title: "\u6682\u65E0\u6837\u672C" }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "vx-ui-hbars", children: metrics.byStatus.map((row) => {
                const max = Math.max(...metrics.byStatus.map((item) => item.count), 1);
                const tone = row.key === "5xx" ? "red" : row.key === "4xx" ? "amber" : row.key === "3xx" ? "violet" : "green";
                return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "vx-ui-hbar vx-ui-hbar--static", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "vx-ui-hbar-label", children: row.label }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("i", { children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("b", { className: `vx-ui-tone-${tone}`, style: { width: `${Math.max(3, row.count / max * 100)}%` } }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("em", { children: fmtInt2(row.count) })
                ] }, row.key);
              }) }) }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Card, { title: "\u6D3B\u8DC3\u6293\u5305", hint: `${metrics.captureSessions} \u4E2A\u4F1A\u8BDD`, scroll: true, children: (capture.data?.sessions ?? []).length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(EmptyState, { title: "\u65E0\u4F1A\u8BDD\u5728\u6293\u5305", hint: "\u5728 chat \u5934\u90E8\u70B9\u300C\u6293\u5305\u300D\u5F00\u542F" }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "vx-ui-list", children: (capture.data?.sessions ?? []).map((session) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "vx-ui-list-row", children: [
                /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "vx-ui-list-main", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("code", { children: session.scope }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { children: [
                    session.source === "" ? "\u4F1A\u8BDD" : session.source,
                    " \xB7 ",
                    fmtInt2(session.items),
                    " \u6761"
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("em", { children: fmtRelative(session.lastTs || session.startedAt) })
              ] }, session.scope)) }) })
            ] })
          }
        ),
        lane === "web" && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(WebLane, { active: true }),
        lane === "yak" && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Card, { title: "Yak \u5185\u6838 History", hint: "\u5916\u90E8\u5185\u6838\u7684\u6D41\u91CF\u6765\u6E90\uFF1B\u672A\u914D\u7F6E\u65F6\u8BE5\u9875\u7B7E\u4E3A\u7A7A", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(YakHistory, {}) }),
        lane === "capture" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Cleanup, {}) : null,
        selected === null ? null : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(TrafficDetail, { row: selected, onClose: () => setSelected(null) })
      ]
    }
  );
}

// src/client.tsx
var inject = ["slots"];
var FINDING_TOOL = "mcp__vexnar__report_finding";
var TRAFFIC_TOOL = "mcp__vexnar__traffic_get";
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
var SEVERITY_LABEL = {
  critical: "\u4E25\u91CD",
  high: "\u9AD8\u5371",
  medium: "\u4E2D\u5371",
  low: "\u4F4E\u5371",
  info: "\u63D0\u793A",
  none: "finding"
};
function severityOf(value) {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "critical":
    case "\u4E25\u91CD":
      return "critical";
    case "high":
    case "\u9AD8\u5371":
      return "high";
    case "medium":
    case "\u4E2D\u5371":
      return "medium";
    case "low":
    case "\u4F4E\u5371":
      return "low";
    case "info":
      return "info";
    default:
      return "none";
  }
}
function formatBytes(text) {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function LoadingCard({ label }) {
  return (0, import_react16.createElement)(
    "div",
    { className: "vx-card", "data-phase": "loading" },
    (0, import_react16.createElement)("span", { className: "vx-loading" }, label)
  );
}
function SeverityChip({ severity }) {
  return (0, import_react16.createElement)(
    "span",
    { className: `vx-chip vx-chip--sev vx-sev-${severity}` },
    (0, import_react16.createElement)("span", { className: "vx-dot", "aria-hidden": "true" }),
    SEVERITY_LABEL[severity]
  );
}
function FindingCard({ phase, block }) {
  if (phase !== "result") return (0, import_react16.createElement)(LoadingCard, { label: "\u8BB0\u5F55\u6F0F\u6D1E\u2026" });
  const text = textOf(block);
  const data = jsonOf(text) ?? {};
  const severity = severityOf(data.severity ?? data.Severity);
  const vulnclass = data.vulnclass ?? data.Vulnclass ?? data.category;
  const summary = data.summary ?? data.Summary;
  const findingId = data.finding_id ?? data.FindingID;
  const trafficCount = data.traffic_count ?? data.TrafficCount;
  const failed = block?.isError === true;
  return (0, import_react16.createElement)(
    "div",
    { className: "vx-card", "data-error": failed ? "1" : "0" },
    (0, import_react16.createElement)(
      "div",
      { className: "vx-head" },
      (0, import_react16.createElement)(SeverityChip, { severity }),
      vulnclass ? (0, import_react16.createElement)("span", { className: "vx-title" }, String(vulnclass)) : (0, import_react16.createElement)("span", { className: "vx-title" }, "\u6F0F\u6D1E\u8BB0\u5F55"),
      findingId !== void 0 ? (0, import_react16.createElement)("span", { className: "vx-meta vx-meta--faint" }, `#${String(findingId)}`) : null,
      trafficCount !== void 0 ? (0, import_react16.createElement)("span", { className: "vx-meta vx-spacer" }, `\u8BC1\u636E\u6D41\u91CF ${String(trafficCount)} \u6761`) : null
    ),
    summary ? (0, import_react16.createElement)("div", { className: "vx-pre vx-pre--tight" }, String(summary)) : (0, import_react16.createElement)("pre", { className: "vx-pre vx-pre--tight" }, text.slice(0, 800) || "(\u7A7A)"),
    failed ? (0, import_react16.createElement)("div", { className: "vx-failed" }, "\u4E0A\u62A5\u5931\u8D25\uFF0C\u89C1\u4E0A\u65B9\u8F93\u51FA") : null
  );
}
function splitHttp(text) {
  const match = text.match(/\r?\n\r?\n/);
  if (match === null || match.index === void 0) return { head: text, body: "" };
  return { head: text.slice(0, match.index), body: text.slice(match.index + match[0].length) };
}
function headlineOf(head) {
  const first = head.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return first.length > 64 ? `${first.slice(0, 63)}\u2026` : first;
}
function TrafficViewer({ phase, block }) {
  const [tab, setTab] = (0, import_react16.useState)("head");
  const [copied, setCopied] = (0, import_react16.useState)(false);
  (0, import_react16.useEffect)(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);
  if (phase !== "result") return (0, import_react16.createElement)(LoadingCard, { label: "\u8BFB\u53D6\u6D41\u91CF\u2026" });
  const text = textOf(block);
  const parts = splitHttp(text);
  const failed = block?.isError === true;
  const headline = headlineOf(parts.head);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => setCopied(true));
  };
  const tabButton = (id, label) => (0, import_react16.createElement)(
    "button",
    { type: "button", "aria-pressed": tab === id, onClick: () => setTab(id) },
    label
  );
  return (0, import_react16.createElement)(
    "div",
    { className: "vx-card", "data-error": failed ? "1" : "0" },
    (0, import_react16.createElement)(
      "div",
      { className: "vx-head" },
      (0, import_react16.createElement)("span", { className: "vx-title vx-title--mono" }, headline || "HTTP \u6D41\u91CF"),
      (0, import_react16.createElement)("span", { className: "vx-meta vx-meta--faint" }, formatBytes(text)),
      (0, import_react16.createElement)(
        "div",
        { className: "vx-seg vx-spacer", role: "group", "aria-label": "\u67E5\u770B\u5185\u5BB9" },
        tabButton("head", "\u5934"),
        tabButton("body", "\u6B63\u6587")
      ),
      (0, import_react16.createElement)(
        "button",
        { type: "button", className: "vx-chip vx-chip--action", onClick: copy },
        copied ? "\u5DF2\u590D\u5236" : "\u590D\u5236"
      )
    ),
    (0, import_react16.createElement)("pre", { className: "vx-pre" }, (tab === "head" ? parts.head : parts.body) || "(\u7A7A)"),
    failed ? (0, import_react16.createElement)("div", { className: "vx-failed" }, "\u8BFB\u53D6\u5931\u8D25\uFF0C\u89C1\u4E0A\u65B9\u8F93\u51FA") : null
  );
}
var VEXNAR_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAEAAElEQVR42uy9d5xdV3Uv/l37nHtnRs2WZcmSLNtyo1gGEuxQQyxB8hLAEPLITELqCy+RE3qHlMfMBAIGG2xMQrBDCWDaDCWQhOQX8iLx0mimWu69d9mWNOXes9f6/bHb2ueO3LBlj7QXn0HjKfeee+ecs9q3ACVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEvt/UHkLSpQocaCGKW9BiZL8S0FQokSJEiVKlKKgRIkSJcoEoESJUgiUKFGiRIkSJUpiL1GiRIkyAShRokSJEiVKlChRYrF1/mUiUKJEiRIlSpSioESJEiVQVgAlSpQoUaJEiRIlSpQoUaJEiRIlSpQoUaJEiRIlSpQogYIZKVGiRIkSJUqURF+iRIkSJcrNv0Q5N0qUKFGixGPxRlxu8CXKuVEChQZYosRjN6S8BSVKsi9RokSJEj/JTbvc7Evc1zlRzo8SJUqUKF1ZeS3lnCtRAmUFUKJEucmXQFk1lShRokSJEiVKlOK5HHuJEiVKlCjxwJMRLaLER/tBwi0FAMoKoESJEiVKPHJJlMp657EdVXkLSpQoUWK/70wfze5fSudfCoASJcqFX6LE4kv8e3ssWgTXG5V7wt6jLm9BiRIlSuy3yV/28jn2Mha/r45d1O/SIkmqUpI/CgagBAqlq0SJA+/8pIfxedvFgTzAx300Ey4tgmNEWQGUKFGiRIlHIyk+FCYCPcBd/2JYB5SpQIkSJUqUOKCohwuN8x9OWuIDxQyUKFGi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";
function BrandMark({ size }) {
  const px = Math.round((size ?? 24) * 1.35);
  return (0, import_react16.createElement)("img", {
    src: VEXNAR_LOGO,
    width: px,
    height: px,
    alt: "VEXNAR",
    className: "vx-mark",
    style: { borderRadius: 4 }
  });
}
function BrandName() {
  return (0, import_react16.createElement)("span", { className: "vx-brand-name" }, "VEXNAR");
}
function HeroLogo({ size }) {
  const px = Math.round((size ?? 34) * 1.55);
  return (0, import_react16.createElement)("img", {
    src: VEXNAR_LOGO,
    width: px,
    height: px,
    alt: "VEXNAR",
    className: "vx-mark",
    style: { borderRadius: 6 }
  });
}
var SKIN_BRAND_PARTS = '[data-dsh-claude-part~="brand-identity"], [data-dsh-claude-part~="rail-mark"]';
function installSkinBrandGuard() {
  const paint = () => {
    if (!document.body.hasAttribute("data-dsh-claude-style")) return;
    document.querySelectorAll(SKIN_BRAND_PARTS).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.dataset.vexnarBrand === "1") return;
      node.dataset.vexnarBrand = "1";
      const rail = node.dataset.dshClaudePart === "rail-mark";
      const mark = document.createElement("img");
      mark.src = VEXNAR_LOGO;
      mark.alt = "VEXNAR";
      mark.className = "vx-brand-logo";
      mark.setAttribute("aria-hidden", "true");
      if (rail) {
        node.replaceChildren(mark);
      } else {
        const word = document.createElement("span");
        word.className = "vx-brand-word";
        word.textContent = "VEXNAR";
        node.replaceChildren(mark, word);
      }
    });
  };
  paint();
  const observer = new MutationObserver(paint);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
function installHeroSlogan() {
  const slogan = () => (navigator.language || "zh").toLowerCase().startsWith("zh") ? "\u63A2\u7D22\u672A\u77E5\uFF0C\u7A81\u7834\u8FB9\u754C" : "Explore the unknown. Break the boundaries.";
  const rewrite = () => {
    const group = document.querySelector('[class*="titleGroup"]');
    const title = group?.firstElementChild;
    if (!(title instanceof HTMLElement)) return;
    if (title.dataset.vexnarSlogan === "1") return;
    title.textContent = slogan();
    title.dataset.vexnarSlogan = "1";
  };
  rewrite();
  const observer = new MutationObserver(rewrite);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
var FULL_ACCESS_LABELS = /* @__PURE__ */ new Set([
  "\u5B8C\u5168\u6743\u9650",
  "Full access",
  "\u30D5\u30EB\u30A2\u30AF\u30BB\u30B9",
  "Acceso completo",
  "Acc\xE8s complet",
  "Voller Zugriff",
  "\u041F\u043E\u043B\u043D\u044B\u0439 \u0434\u043E\u0441\u0442\u0443\u043F",
  "Acesso total"
]);
function installPermissionWarning() {
  const negative = () => getComputedStyle(document.body).getPropertyValue("--vx-negative").trim() || "#dc2626";
  const sweep = () => {
    document.querySelectorAll('[class*="triggerLabel"], [class*="optionLabelText"]').forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const full = FULL_ACCESS_LABELS.has((node.textContent ?? "").trim());
      if (full && node.dataset.vexnarFull !== "1") {
        node.dataset.vexnarFull = "1";
        node.style.color = negative();
        node.style.fontWeight = "600";
      } else if (!full && node.dataset.vexnarFull === "1") {
        delete node.dataset.vexnarFull;
        node.style.color = "";
        node.style.fontWeight = "";
      }
    });
  };
  sweep();
  const observer = new MutationObserver(sweep);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
}
function ConsoleIcon({ size }) {
  return (0, import_react16.createElement)(
    "svg",
    { width: size ?? 16, height: size ?? 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
    (0, import_react16.createElement)("path", { d: "M12 3 3 7l9 4 9-4-9-4Z" }),
    (0, import_react16.createElement)("path", { d: "m3 12 9 4 9-4" }),
    (0, import_react16.createElement)("path", { d: "m3 17 9 4 9-4" })
  );
}
function OverviewIcon({ size }) {
  return (0, import_react16.createElement)(
    "svg",
    { width: size ?? 16, height: size ?? 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
    (0, import_react16.createElement)("path", { d: "M5.5 19a8.5 8.5 0 1 1 13 0" }),
    (0, import_react16.createElement)("path", { d: "M12 14 16 9" }),
    (0, import_react16.createElement)("circle", { cx: 12, cy: 14, r: 1.4 })
  );
}
function Dashboard() {
  const tasks = useApi("/api/tasks");
  const findings = useApi("/api/exploration/findings/stats");
  const assets = useApi("/api/assets/counts");
  const tokens = useApi("/api/tokens/daily?days=1");
  const cards = [
    ["\u4EFB\u52A1", tasks.data?.tasks?.length ?? "\u2014"],
    ["\u53D1\u73B0", findings.data?.total ?? "\u2014"],
    ["\u8D44\u4EA7", assets.data ? Object.values(assets.data).reduce((sum, value) => sum + Number(value), 0) : "\u2014"],
    ["\u4ECA\u65E5 Token", Array.isArray(tokens.data) ? tokens.data.reduce((sum, row) => sum + Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0), 0) : "\u2014"]
  ];
  return (0, import_react16.createElement)(
    "div",
    null,
    (0, import_react16.createElement)(
      "div",
      { style: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 20 } },
      cards.map(([label, value]) => (0, import_react16.createElement)(
        "div",
        { key: String(label), style: { border: "1px solid var(--vx-border, #e5e7eb)", borderRadius: 12, padding: 16 } },
        (0, import_react16.createElement)("div", { style: { fontSize: 12, color: "var(--vx-muted, #6b7280)" } }, String(label)),
        (0, import_react16.createElement)("div", { style: { fontSize: 24, fontWeight: 600 } }, String(value))
      ))
    ),
    (0, import_react16.createElement)("div", { style: { fontSize: 12, color: "var(--vx-muted, #6b7280)" } }, tasks.error || findings.error || assets.error || tokens.error || "\u6570\u636E\u6765\u81EA\u672C\u5730\u6838\u5FC3")
  );
}
var PAGE_SIZE2 = 20;
var TASK_STATUS_LABELS = [
  ["created", "\u5F85\u542F\u52A8"],
  ["queued", "\u6392\u961F"],
  ["running", "\u8FD0\u884C\u4E2D"],
  ["paused", "\u6682\u505C"],
  ["done", "\u5B8C\u6210"],
  ["failed", "\u5931\u8D25"],
  ["timeout", "\u8D85\u65F6"]
];
var SEVERITY_LABELS = [
  ["critical", "\u4E25\u91CD"],
  ["high", "\u9AD8\u5371"],
  ["medium", "\u4E2D\u5371"],
  ["low", "\u4F4E\u5371"]
];
var FINDING_STATUS_LABELS = [
  ["pending", "\u5F85\u5904\u7406"],
  ["in_progress", "\u5904\u7406\u4E2D"],
  ["confirmed", "\u5DF2\u786E\u8BA4"],
  ["resolved", "\u5DF2\u5904\u7406"],
  ["fixed", "\u5DF2\u4FEE\u590D"],
  ["false_positive", "\u8BEF\u62A5"],
  ["ignored", "\u5FFD\u7565"],
  ["duplicate", "\u91CD\u590D"],
  ["risk_accepted", "\u98CE\u9669\u63A5\u53D7"]
];
function errText2(error) {
  if (error instanceof Error) return error.message;
  return String(error ?? "\u672A\u77E5\u9519\u8BEF");
}
function labelOf(table, value) {
  const key = String(value ?? "");
  return table.find(([id]) => id === key)?.[1] ?? (key || "\u2014");
}
function findingCount(task) {
  const f = task?.findings ?? {};
  return Number(f.critical ?? 0) + Number(f.high ?? 0) + Number(f.medium ?? 0) + Number(f.low ?? 0);
}
function Toolbar2({ children }) {
  return (0, import_react16.createElement)("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 } }, children);
}
function Pager2({ page, pageCount, total, unit, onPage }) {
  if (pageCount <= 1) {
    return (0, import_react16.createElement)("div", { style: { fontSize: 12, color: "var(--vx-text-dim)", marginTop: 8 } }, `\u5171 ${total} ${unit}`);
  }
  return (0, import_react16.createElement)(
    "div",
    { style: { display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 12 } },
    (0, import_react16.createElement)("button", { type: "button", disabled: page <= 0, onClick: () => onPage(page - 1) }, "\u4E0A\u4E00\u9875"),
    (0, import_react16.createElement)("span", null, `${page + 1} / ${pageCount} \xB7 \u5171 ${total} ${unit}`),
    (0, import_react16.createElement)("button", { type: "button", disabled: page + 1 >= pageCount, onClick: () => onPage(page + 1) }, "\u4E0B\u4E00\u9875")
  );
}
function TaskScopePicker({ scope, onScope, options }) {
  const current = options.find((task) => String(task.id) === scope);
  const label = current ? current.name || current.description || "\u672A\u547D\u540D" : "";
  return (0, import_react16.createElement)(
    "span",
    { style: { display: "inline-flex", alignItems: "center", gap: 6 } },
    (0, import_react16.createElement)("input", {
      list: "vx-task-scope-options",
      "aria-label": "\u4EFB\u52A1\u8303\u56F4",
      placeholder: "\u4EFB\u52A1\u8303\u56F4\uFF1A\u7559\u7A7A=\u5168\u90E8\uFF0C\u53EF\u8F93\u5165 ID \u6216\u641C\u7D22\u540D\u79F0",
      value: scope,
      onChange: (event) => onScope(event.target.value.replace(/[^\w-]/g, "")),
      style: { minWidth: 220 }
    }),
    (0, import_react16.createElement)(
      "datalist",
      { id: "vx-task-scope-options" },
      options.map((task) => (0, import_react16.createElement)(
        "option",
        { key: task.id, value: String(task.id) },
        `${task.id} \xB7 ${task.name || task.description || "\u672A\u547D\u540D"}`
      ))
    ),
    scope ? (0, import_react16.createElement)("button", {
      type: "button",
      onClick: () => onScope(""),
      title: "\u6E05\u9664\u4EFB\u52A1\u8303\u56F4"
    }, "\xD7") : null,
    scope && label ? (0, import_react16.createElement)("span", { style: { fontSize: 12, color: "var(--vx-text-dim)" } }, label) : null
  );
}
function TaskList({ onOpen }) {
  const [query2, setQuery] = (0, import_react16.useState)("");
  const [needle, setNeedle] = (0, import_react16.useState)("");
  const [status, setStatus] = (0, import_react16.useState)("all");
  const [page, setPage] = (0, import_react16.useState)(1);
  (0, import_react16.useEffect)(() => {
    const timer = window.setTimeout(() => {
      setNeedle(query2.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query2]);
  const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE2) });
  if (status !== "all") params.set("status", status);
  if (needle) params.set("q", needle);
  const url = `/api/tasks?${params.toString()}`;
  const { data, error, loading } = useApi(url, [url]);
  const rows = data?.tasks ?? [];
  const total = Number(data?.total ?? rows.length);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE2));
  return (0, import_react16.createElement)(
    "div",
    null,
    (0, import_react16.createElement)(
      Toolbar2,
      null,
      (0, import_react16.createElement)("input", {
        placeholder: "\u641C\u7D22 ID / \u540D\u79F0 / \u63CF\u8FF0 / \u76EE\u6807",
        value: query2,
        onChange: (event) => setQuery(event.target.value),
        style: { minWidth: 260 }
      }),
      (0, import_react16.createElement)(
        "select",
        {
          "aria-label": "\u4EFB\u52A1\u72B6\u6001",
          value: status,
          onChange: (event) => {
            setStatus(event.target.value);
            setPage(1);
          }
        },
        (0, import_react16.createElement)("option", { key: "all", value: "all" }, "\u5168\u90E8\u72B6\u6001"),
        TASK_STATUS_LABELS.map(([value, label]) => (0, import_react16.createElement)("option", { key: value, value }, label))
      ),
      error ? (0, import_react16.createElement)("span", { role: "alert", style: { fontSize: 12, color: "#dc2626" } }, error) : (0, import_react16.createElement)(
        "span",
        { style: { fontSize: 12, color: "var(--vx-text-dim)", marginLeft: "auto" } },
        loading ? "\u52A0\u8F7D\u4E2D\u2026" : `\u5171 ${total} \u4E2A\u4EFB\u52A1`
      )
    ),
    rows.length === 0 ? (0, import_react16.createElement)(
      "p",
      { style: { fontSize: 12, color: "var(--vx-text-dim)" } },
      loading ? "\u52A0\u8F7D\u4E2D\u2026" : "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u4EFB\u52A1\u3002"
    ) : (0, import_react16.createElement)(
      "table",
      { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 } },
      (0, import_react16.createElement)("thead", null, (0, import_react16.createElement)(
        "tr",
        null,
        ["ID", "\u540D\u79F0", "\u72B6\u6001", "\u76EE\u6807", "\u53D1\u73B0", "\u5728\u9014", "\u6700\u8FD1\u6D3B\u52A8"].map((title) => (0, import_react16.createElement)("th", {
          key: title,
          style: { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--vx-border, #e5e7eb)" }
        }, title))
      )),
      (0, import_react16.createElement)("tbody", null, rows.map((task) => (0, import_react16.createElement)(
        "tr",
        {
          key: task.id,
          onClick: () => onOpen(String(task.id)),
          style: { cursor: "pointer" }
        },
        (0, import_react16.createElement)("td", { style: { padding: "6px 8px", fontFamily: "var(--vx-mono)" } }, task.id),
        (0, import_react16.createElement)(
          "td",
          { style: { padding: "6px 8px", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
          task.name || task.description || "\u672A\u547D\u540D"
        ),
        (0, import_react16.createElement)("td", { style: { padding: "6px 8px" } }, labelOf(TASK_STATUS_LABELS, task.status)),
        (0, import_react16.createElement)(
          "td",
          { style: { padding: "6px 8px", fontSize: 12, color: "var(--vx-text-dim)" } },
          `${task.goals_met ?? 0}/${task.goals_total ?? 0}`
        ),
        (0, import_react16.createElement)(
          "td",
          { style: { padding: "6px 8px" } },
          `${findingCount(task)}`,
          findingCount(task) > 0 ? (0, import_react16.createElement)("span", {
            style: { marginLeft: 6, fontSize: 11, color: "var(--vx-negative)" }
          }, `\u4E25\u91CD ${task.findings?.critical ?? 0} \xB7 \u9AD8 ${task.findings?.high ?? 0}`) : null
        ),
        (0, import_react16.createElement)("td", { style: { padding: "6px 8px", fontSize: 12 } }, task.in_flight ? `${task.in_flight}` : "\u2014"),
        (0, import_react16.createElement)(
          "td",
          { style: { padding: "6px 8px", fontSize: 12, color: "var(--vx-text-dim)" } },
          task.last_activity_unix ? fmtAgo(task.last_activity_unix) : "\u2014"
        )
      )))
    ),
    (0, import_react16.createElement)(Pager2, { page: Math.min(page, pageCount) - 1, pageCount, total, unit: "\u4E2A\u4EFB\u52A1", onPage: (next) => setPage(next + 1) })
  );
}
function TaskDetail({ id, onBack, onOpenFindings, onOpenFinding }) {
  const [tick, setTick] = (0, import_react16.useState)(0);
  const task = useApi(`/api/tasks/${id}`, [tick]);
  const goals = useApi(`/api/tasks/${id}/goals`, [tick]);
  const intents = useApi(`/api/exploration/intents?task=${id}&limit=40`, [tick]);
  const coverage = useApi(`/api/tasks/${id}/coverage`, [tick]);
  const nodes = useApi(`/api/exploration/nodes?task=${id}&size=20`, [tick]);
  const findings = useApi(`/api/exploration/findings?task_id=${encodeURIComponent(id)}&page=1&limit=20`, [tick, id]);
  const act = async (action) => {
    if (action === "archive" && !window.confirm("\u5F52\u6863\u540E\u8BE5\u4EFB\u52A1\u5C06\u4ECE\u5217\u8868\u79FB\u51FA\uFF0C\u7EE7\u7EED\uFF1F")) return;
    try {
      if (action === "archive") await callApi(`/api/tasks/${id}/archive`, "POST");
      else await callApi(`/api/tasks/${id}/control`, "POST", { action });
      setTick((value) => value + 1);
    } catch (error) {
      window.alert(String(error?.message ?? error));
    }
  };
  if (task.loading) return (0, import_react16.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (task.error) return (0, import_react16.createElement)("div", { style: { color: "#dc2626" } }, task.error);
  const row = task.data ?? {};
  const meta = (title, children) => (0, import_react16.createElement)(
    "div",
    { style: { marginBottom: 16 } },
    (0, import_react16.createElement)("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--vx-text-dim)", marginBottom: 6 } }, title),
    children
  );
  const list = (value) => Array.isArray(value) ? value : value?.items ?? value?.goals ?? [];
  const goalRows = list(goals.data);
  const findingRows = findings.data?.items ?? [];
  const findingTotal = Number(findings.data?.total ?? findingRows.length);
  const intentRows = list(intents.data);
  const nodeRows = list(nodes.data);
  const cover = coverage.data ?? {};
  const tokens = row.tokens ?? {};
  const status = String(row.status ?? "");
  const pills = [
    ["\u76EE\u6807", `${row.goals_met ?? 0}/${row.goals_total ?? 0}`],
    ["\u5728\u9014\u610F\u56FE", String(row.in_flight ?? 0)],
    ["\u53D1\u73B0\u5408\u8BA1", String(findingCount(row))],
    ["\u8F93\u5165 Token", fmtCount2(tokens.input_tokens)],
    ["\u8F93\u51FA Token", fmtCount2(tokens.output_tokens)],
    ["\u7F13\u5B58\u8BFB", fmtCount2(tokens.cache_read_tokens)],
    ["\u8986\u76D6\u5EA6", cover.pct === null || cover.pct === void 0 ? "\u2014" : `${Math.round(Number(cover.pct))}%`]
  ];
  return (0, import_react16.createElement)(
    "div",
    null,
    (0, import_react16.createElement)(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" } },
      (0, import_react16.createElement)("button", { type: "button", onClick: onBack, style: { border: "1px solid var(--vx-border, #e5e7eb)", background: "transparent", borderRadius: 8, padding: "3px 10px", cursor: "pointer" } }, "\u2190 \u8FD4\u56DE"),
      (0, import_react16.createElement)("span", { style: { fontSize: 18, fontWeight: 600 } }, String(row.description ?? row.name ?? id)),
      (0, import_react16.createElement)("span", { className: "vx-ov-pill" }, status === "" ? "\u672A\u77E5" : status),
      (0, import_react16.createElement)("span", { style: { fontSize: 12, color: "var(--vx-text-dim)" } }, `${id} \xB7 \u521B\u5EFA ${fmtAgo(row.created_unix)} \xB7 \u6700\u8FD1\u6D3B\u52A8 ${fmtAgo(row.last_activity_unix)}`)
    ),
    (0, import_react16.createElement)(
      "div",
      { style: { display: "flex", gap: 8, margin: "10px 0 16px", flexWrap: "wrap" } },
      status === "running" ? (0, import_react16.createElement)("button", { type: "button", onClick: () => act("pause"), style: { cursor: "pointer" } }, "\u6682\u505C") : null,
      status === "paused" ? (0, import_react16.createElement)("button", { type: "button", onClick: () => act("resume"), style: { cursor: "pointer" } }, "\u6062\u590D") : null,
      (0, import_react16.createElement)("button", { type: "button", onClick: () => act("archive"), style: { cursor: "pointer" } }, "\u5F52\u6863"),
      (0, import_react16.createElement)("button", { type: "button", onClick: () => setTick((value) => value + 1), style: { cursor: "pointer" } }, "\u5237\u65B0"),
      onOpenFindings ? (0, import_react16.createElement)("button", {
        type: "button",
        onClick: () => onOpenFindings(id),
        style: { cursor: "pointer" }
      }, `\u5728\u53D1\u73B0\u91CC\u67E5\u770B\uFF08${findingRows.length}\uFF09`) : null
    ),
    meta("\u76EE\u6807", (0, import_react16.createElement)("div", { style: { fontSize: 13, lineHeight: 1.6 } }, String(row.goal ?? "\u2014"))),
    meta(
      `\u53D1\u73B0\uFF08${findingRows.length}${findingTotal > findingRows.length ? ` / \u5171 ${findingTotal}` : ""}\uFF09`,
      findings.error ? (0, import_react16.createElement)("div", { role: "alert", style: { fontSize: 12, color: "#dc2626" } }, `\u53D1\u73B0\u8BFB\u53D6\u5931\u8D25\uFF1A${findings.error}`) : findings.loading && findingRows.length === 0 ? (0, import_react16.createElement)("div", { style: { fontSize: 12, color: "var(--vx-text-dim)" } }, "\u52A0\u8F7D\u4E2D\u2026") : findingRows.length === 0 ? (0, import_react16.createElement)("div", { style: { fontSize: 12, color: "var(--vx-text-dim)" } }, "\u8BE5\u4EFB\u52A1\u8FD8\u6CA1\u6709\u767B\u8BB0\u53D1\u73B0\u3002") : (0, import_react16.createElement)(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12 } },
        findingRows.map((finding) => (0, import_react16.createElement)(
          "div",
          {
            key: String(finding.finding_id),
            onClick: onOpenFinding ? () => onOpenFinding(String(finding.finding_id)) : void 0,
            style: { display: "flex", gap: 8, alignItems: "baseline", cursor: onOpenFinding ? "pointer" : "default" }
          },
          (0, import_react16.createElement)("span", { className: "vx-ov-pill" }, labelOf(SEVERITY_LABELS, finding.severity)),
          (0, import_react16.createElement)("span", { style: { color: "var(--vx-text-dim)", fontFamily: "var(--vx-mono)" } }, finding.vulnclass ?? ""),
          (0, import_react16.createElement)("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, finding.summary ?? ""),
          (0, import_react16.createElement)(
            "span",
            { style: { color: "var(--vx-text-faint)", fontSize: 11, marginLeft: "auto" } },
            labelOf(FINDING_STATUS_LABELS, finding.status)
          )
        ))
      )
    ),
    meta("\u5DE5\u5177\u6267\u884C", (0, import_react16.createElement)(
      "div",
      null,
      (0, import_react16.createElement)(ToolRunPage, { taskID: id }),
      (0, import_react16.createElement)("div", { style: { marginTop: 14 } }, (0, import_react16.createElement)(ExecStream, { taskID: id }))
    )),
    meta("\u7EDF\u8BA1", (0, import_react16.createElement)(
      "div",
      { style: { display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 12 } },
      pills.map(([label, value]) => (0, import_react16.createElement)(
        "span",
        { key: label, style: { color: "var(--vx-text-dim)" } },
        `${label} `,
        (0, import_react16.createElement)("b", { style: { color: "var(--vx-text)", fontWeight: 600 } }, value)
      ))
    )),
    goalRows.length > 0 ? meta(`\u76EE\u6807\u6E05\u5355\uFF08${goalRows.length}\uFF09`, (0, import_react16.createElement)(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12 } },
      goalRows.slice(0, 12).map((goal) => (0, import_react16.createElement)(
        "div",
        { key: String(goal.id), style: { display: "flex", gap: 8, alignItems: "baseline" } },
        (0, import_react16.createElement)("span", { className: "vx-ov-pill" }, String(goal.state ?? "open")),
        (0, import_react16.createElement)("span", null, String(goal.text ?? goal.summary ?? "")),
        goal.vulnclass ? (0, import_react16.createElement)("span", { style: { color: "var(--vx-text-faint)", fontSize: 11 } }, String(goal.vulnclass)) : null
      ))
    )) : null,
    intentRows.length > 0 ? meta(`\u610F\u56FE\uFF08\u6700\u8FD1 ${Math.min(intentRows.length, 8)}\uFF09`, (0, import_react16.createElement)(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12 } },
      intentRows.slice(0, 8).map((intent) => (0, import_react16.createElement)(
        "div",
        { key: String(intent.id), style: { display: "flex", gap: 8, alignItems: "baseline" } },
        (0, import_react16.createElement)("span", { className: "vx-ov-pill" }, String(intent.state ?? intent.type ?? "")),
        (0, import_react16.createElement)("span", { style: { color: "var(--vx-text-dim)" } }, String(intent.worker ?? "")),
        (0, import_react16.createElement)("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, String(intent.summary ?? intent.label ?? ""))
      ))
    )) : null,
    nodeRows.length > 0 ? meta(`\u56FE\u8C31\u8282\u70B9\uFF08\u6700\u8FD1 ${Math.min(nodeRows.length, 8)}\uFF09`, (0, import_react16.createElement)(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12 } },
      nodeRows.slice(0, 8).map((node) => (0, import_react16.createElement)(
        "div",
        { key: String(node.id), style: { display: "flex", gap: 8, alignItems: "baseline" } },
        (0, import_react16.createElement)("span", { className: "vx-ov-pill" }, String(node.type ?? node.kind ?? "")),
        (0, import_react16.createElement)("span", { style: { color: "var(--vx-text-dim)" } }, String(node.state ?? "")),
        (0, import_react16.createElement)("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, String(node.label ?? node.summary ?? ""))
      ))
    )) : null
  );
}
function fmtCount2(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "\u2014";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}
function fmtAgo(unix) {
  const n = Number(unix ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "\u2014";
  const seconds = Math.floor(Date.now() / 1e3 - n);
  if (seconds < 60) return `${seconds}s \u524D`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m \u524D`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h \u524D`;
  return `${Math.floor(seconds / 86400)}d \u524D`;
}
function NotifyPage() {
  const [version, setVersion] = (0, import_react16.useState)(0);
  const { data, error, loading } = useApi("/api/notify/channels", [version]);
  if (loading) return (0, import_react16.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (error) return (0, import_react16.createElement)("div", { style: { color: "#dc2626" } }, error);
  const rows = data?.channels ?? [];
  const add = async () => {
    const name = window.prompt("\u6E20\u9053\u540D\u79F0", "webhook");
    if (!name) return;
    const url = window.prompt("Webhook URL", "");
    if (url == null) return;
    try {
      await callApi("/api/notify/channels", "POST", { name, kind: "webhook", config: { url } });
      setVersion(version + 1);
    } catch (e) {
      window.alert(String(e?.message ?? e));
    }
  };
  const remove = async (row) => {
    if (!window.confirm(`\u5220\u9664 ${row.name}?`)) return;
    try {
      await callApi(`/api/notify/channels/${row.id}`, "DELETE");
      setVersion(version + 1);
    } catch (e) {
      window.alert(String(e?.message ?? e));
    }
  };
  return (0, import_react16.createElement)(
    "div",
    { key: version },
    (0, import_react16.createElement)("button", { type: "button", onClick: add, style: { marginBottom: 10, cursor: "pointer" } }, "+ \u65B0\u589E\u6E20\u9053"),
    (0, import_react16.createElement)(
      "table",
      { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 } },
      (0, import_react16.createElement)("thead", null, (0, import_react16.createElement)("tr", null, ["ID", "\u540D\u79F0", "\u7C7B\u578B", "\u542F\u7528", ""].map((t) => (0, import_react16.createElement)("th", { key: t, style: { textAlign: "left", padding: "6px 8px" } }, t)))),
      (0, import_react16.createElement)("tbody", null, rows.map((row) => (0, import_react16.createElement)(
        "tr",
        { key: row.id },
        (0, import_react16.createElement)("td", { style: { padding: "6px 8px" } }, row.id),
        (0, import_react16.createElement)("td", { style: { padding: "6px 8px" } }, row.name),
        (0, import_react16.createElement)("td", { style: { padding: "6px 8px" } }, row.kind),
        (0, import_react16.createElement)("td", { style: { padding: "6px 8px" } }, row.enabled ? "\u662F" : "\u5426"),
        (0, import_react16.createElement)("td", { style: { padding: "6px 8px" } }, (0, import_react16.createElement)("button", { type: "button", onClick: () => remove(row), style: { cursor: "pointer" } }, "\u5220\u9664"))
      )))
    )
  );
}
function ToolRunPage({ taskID = "" }) {
  const catalog = useApi("/api/engine/tools");
  const tools = catalog.data?.tools ?? [];
  const [name, setName] = (0, import_react16.useState)("");
  const [target, setTarget] = (0, import_react16.useState)("");
  const [extra, setExtra] = (0, import_react16.useState)("");
  const [busy, setBusy] = (0, import_react16.useState)(false);
  const [output, setOutput] = (0, import_react16.useState)("");
  const [error, setError] = (0, import_react16.useState)("");
  const selected = name || tools[0]?.name || "nmap";
  const spec = tools.find((tool) => tool.name === selected);
  const run = async () => {
    setError("");
    let args = {};
    if (extra.trim()) {
      try {
        const parsed = JSON.parse(extra);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("\u53C2\u6570\u9700\u4E3A JSON \u5BF9\u8C61");
        args = parsed;
      } catch (e) {
        setError(`\u53C2\u6570\u4E0D\u662F\u5408\u6CD5 JSON \u5BF9\u8C61\uFF1A${String(e?.message ?? e)}`);
        return;
      }
    }
    setBusy(true);
    setOutput("\u6267\u884C\u4E2D\u2026");
    try {
      const data = await callApi("/api/engine/tools/run", "POST", { name: selected, target, args, task_id: taskID || void 0 });
      const created = Array.isArray(data.created) ? data.created : [];
      setOutput([
        `code=${data.code} truncated=${data.truncated}${data.timed_out ? " timed_out" : ""}`,
        created.length > 0 ? `\u843D\u5E93 ${created.length} \u9879\uFF1A${created.slice(0, 12).map((row) => `${row.kind}#${row.id}`).join("\u3001")}${created.length > 12 ? " \u2026" : ""}` : "",
        data.parsed ? JSON.stringify(data.parsed, null, 2) : "",
        data.stdout,
        data.stderr
      ].filter(Boolean).join("\n"));
    } catch (e) {
      setOutput(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (0, import_react16.createElement)(
    "div",
    { style: { fontSize: 13 } },
    (0, import_react16.createElement)(
      "div",
      { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 } },
      (0, import_react16.createElement)(
        "select",
        {
          "aria-label": "\u5DE5\u5177",
          value: selected,
          onChange: (event) => setName(event.target.value)
        },
        (tools.length === 0 ? [selected] : tools.map((tool) => tool.name)).map((item) => (0, import_react16.createElement)("option", { key: item, value: item }, item))
      ),
      (0, import_react16.createElement)("input", {
        placeholder: "target\uFF08\u57DF\u540D / URL / IP\uFF09",
        value: target,
        onChange: (event) => setTarget(event.target.value),
        style: { minWidth: 260 }
      }),
      (0, import_react16.createElement)("input", {
        placeholder: "\u989D\u5916\u53C2\u6570\uFF08JSON\uFF0C\u53EF\u9009\uFF09",
        value: extra,
        onChange: (event) => setExtra(event.target.value),
        style: { minWidth: 200, fontFamily: "var(--vx-mono)" }
      }),
      (0, import_react16.createElement)(
        "button",
        { type: "button", onClick: run, disabled: busy || !target.trim(), style: { cursor: "pointer" } },
        busy ? "\u6267\u884C\u4E2D\u2026" : "\u6267\u884C"
      ),
      (0, import_react16.createElement)(
        "span",
        { style: { fontSize: 12, color: "var(--vx-text-dim)" } },
        taskID ? `\u7ED3\u679C\u8BB0\u5165\u4EFB\u52A1 #${taskID}` : "\u672A\u9009\u4EFB\u52A1\uFF1A\u7ED3\u679C\u4E0D\u843D\u5E93"
      )
    ),
    spec ? (0, import_react16.createElement)("div", { style: { fontSize: 12, color: "var(--vx-text-dim)", marginBottom: 8 } }, spec.description) : null,
    catalog.error ? (0, import_react16.createElement)("div", { role: "alert", style: { fontSize: 12, color: "#dc2626", marginBottom: 6 } }, `\u5DE5\u5177\u76EE\u5F55\u8BFB\u53D6\u5931\u8D25\uFF1A${catalog.error}`) : null,
    error ? (0, import_react16.createElement)("div", { role: "alert", style: { fontSize: 12, color: "#dc2626", marginBottom: 6 } }, error) : null,
    output ? (0, import_react16.createElement)("pre", { style: { fontSize: 12, whiteSpace: "pre-wrap", background: "var(--vx-code, #f8fafc)", padding: 10, borderRadius: 8, minHeight: 120, maxHeight: 420, overflow: "auto" } }, output) : null
  );
}
function ExecStream({ taskID }) {
  const [session, setSession] = (0, import_react16.useState)("plan");
  const [rows, setRows] = (0, import_react16.useState)([]);
  const [hasMore, setHasMore] = (0, import_react16.useState)(false);
  const [error, setError] = (0, import_react16.useState)("");
  const [loading, setLoading] = (0, import_react16.useState)(false);
  const [tick, setTick] = (0, import_react16.useState)(0);
  const load2 = (0, import_react16.useCallback)(async (before) => {
    const query2 = new URLSearchParams({ task: taskID, session, limit: "100" });
    if (before > 0) query2.set("before", String(before));
    const response = await fetch(CORE_BASE + `/api/exploration/activity/history?${query2.toString()}`);
    if (!response.ok) throw await responseError(response);
    return await response.json();
  }, [taskID, session]);
  (0, import_react16.useEffect)(() => {
    if (!taskID) {
      setRows([]);
      setHasMore(false);
      setError("");
      return;
    }
    let alive = true;
    setError("");
    setLoading(true);
    load2(0).then((data) => {
      if (!alive) return;
      setRows(data.items ?? []);
      setHasMore(Boolean(data.has_more));
    }).catch((e) => {
      if (alive) {
        setError(errText2(e));
        setRows([]);
        setHasMore(false);
      }
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [taskID, session, tick, load2]);
  const loadEarlier = async () => {
    const earliest = rows.length > 0 ? Number(rows[0].seq) : 0;
    if (!earliest) return;
    setLoading(true);
    setError("");
    try {
      const data = await load2(earliest);
      setRows((current) => [...data.items ?? [], ...current]);
      setHasMore(Boolean(data.has_more));
    } catch (e) {
      setError(errText2(e));
    } finally {
      setLoading(false);
    }
  };
  return (0, import_react16.createElement)(
    "div",
    null,
    (0, import_react16.createElement)(
      "div",
      { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" } },
      (0, import_react16.createElement)("span", { style: { fontSize: 12, fontWeight: 600, color: "var(--vx-text-dim)" } }, `\u6267\u884C\u8BB0\u5F55 \xB7 \u4EFB\u52A1 #${taskID}`),
      (0, import_react16.createElement)(
        "select",
        { "aria-label": "\u4F1A\u8BDD", value: session, onChange: (event) => setSession(event.target.value) },
        [["plan", "planner"], ["main", "main"]].map(([value, label]) => (0, import_react16.createElement)("option", { key: value, value }, label))
      ),
      (0, import_react16.createElement)(
        "button",
        { type: "button", onClick: () => setTick((value) => value + 1), disabled: loading, style: { cursor: "pointer" } },
        loading ? "\u52A0\u8F7D\u4E2D\u2026" : "\u5237\u65B0"
      ),
      hasMore ? (0, import_react16.createElement)("button", { type: "button", onClick: loadEarlier, disabled: loading, style: { cursor: "pointer" } }, "\u52A0\u8F7D\u66F4\u65E9") : rows.length > 0 ? (0, import_react16.createElement)("span", { style: { fontSize: 12, color: "var(--vx-text-dim)" } }, "\u5DF2\u5230\u6700\u65E9") : null,
      (0, import_react16.createElement)("span", { style: { fontSize: 12, color: "var(--vx-text-dim)", marginLeft: "auto" } }, `${rows.length} \u884C`)
    ),
    error ? (0, import_react16.createElement)("div", { role: "alert", style: { color: "#dc2626", fontSize: 12 } }, error) : null,
    rows.length === 0 && !error && !loading ? (0, import_react16.createElement)("p", { style: { fontSize: 12, color: "var(--vx-text-dim)" } }, "\u8BE5\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u6267\u884C\u8BB0\u5F55\u3002") : null,
    rows.length > 0 ? (0, import_react16.createElement)(
      "table",
      { style: { width: "100%", borderCollapse: "collapse", fontSize: 12 } },
      (0, import_react16.createElement)("thead", null, (0, import_react16.createElement)("tr", null, ["seq", "ts", "worker", "kind", "tool", "summary"].map((t) => (0, import_react16.createElement)("th", { key: t, style: { textAlign: "left", padding: "4px 6px" } }, t)))),
      (0, import_react16.createElement)("tbody", null, rows.slice().reverse().map((row) => (0, import_react16.createElement)(
        "tr",
        { key: row.seq },
        (0, import_react16.createElement)("td", { style: { padding: "4px 6px" } }, row.seq),
        (0, import_react16.createElement)("td", { style: { padding: "4px 6px" } }, row.ts),
        (0, import_react16.createElement)("td", { style: { padding: "4px 6px" } }, row.worker ?? ""),
        (0, import_react16.createElement)("td", { style: { padding: "4px 6px" } }, row.kind ?? ""),
        (0, import_react16.createElement)("td", { style: { padding: "4px 6px", fontFamily: "var(--vx-mono)" } }, row.tool ?? ""),
        (0, import_react16.createElement)("td", {
          style: {
            padding: "4px 6px",
            maxWidth: 460,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: row.is_error ? "var(--vx-negative)" : void 0
          }
        }, row.summary ?? "")
      )))
    ) : null
  );
}
function PanelShell({ title, desc, actions, children }) {
  return (0, import_react16.createElement)(
    "div",
    { className: "vx-ui-page" },
    (0, import_react16.createElement)(
      "header",
      { className: "vx-ui-head" },
      (0, import_react16.createElement)(
        "div",
        { className: "vx-ui-head-main" },
        (0, import_react16.createElement)("h1", { className: "vx-ui-title" }, title),
        desc ? (0, import_react16.createElement)("p", { className: "vx-ui-desc" }, desc) : null
      ),
      actions ? (0, import_react16.createElement)("div", { className: "vx-ui-head-actions" }, actions) : null
    ),
    children ?? null
  );
}
function FindingsTab({ scope, onScope, onOpen }) {
  const tasks = useApi("/api/tasks?page=1&size=200");
  const [severity, setSeverity] = (0, import_react16.useState)("all");
  const [status, setStatus] = (0, import_react16.useState)("all");
  const [search, setSearch] = (0, import_react16.useState)("");
  const [query2, setQuery] = (0, import_react16.useState)("");
  const [page, setPage] = (0, import_react16.useState)(1);
  (0, import_react16.useEffect)(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE2) });
  if (scope) params.set("task_id", scope);
  if (severity !== "all") params.set("severity", severity);
  if (status !== "all") params.set("status", status);
  if (query2) params.set("q", query2);
  const url = `/api/exploration/findings?${params.toString()}`;
  const { data, error, loading } = useApi(url, [url]);
  const rows = data?.items ?? [];
  const total = Number(data?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE2));
  const options = tasks.data?.tasks ?? [];
  return (0, import_react16.createElement)(
    "div",
    null,
    (0, import_react16.createElement)(
      Toolbar2,
      null,
      (0, import_react16.createElement)("input", {
        placeholder: "\u641C\u7D22\u6458\u8981 / \u8BC1\u636E / \u6F0F\u6D1E\u7C7B",
        value: search,
        onChange: (event) => setSearch(event.target.value),
        style: { minWidth: 240 }
      }),
      (0, import_react16.createElement)(
        "select",
        {
          "aria-label": "\u4E25\u91CD\u5EA6",
          value: severity,
          onChange: (event) => {
            setSeverity(event.target.value);
            setPage(1);
          }
        },
        (0, import_react16.createElement)("option", { key: "all", value: "all" }, "\u5168\u90E8\u4E25\u91CD\u5EA6"),
        SEVERITY_LABELS.map(([value, label]) => (0, import_react16.createElement)("option", { key: value, value }, label))
      ),
      (0, import_react16.createElement)(
        "select",
        {
          "aria-label": "\u5904\u7F6E\u72B6\u6001",
          value: status,
          onChange: (event) => {
            setStatus(event.target.value);
            setPage(1);
          }
        },
        (0, import_react16.createElement)("option", { key: "all", value: "all" }, "\u5168\u90E8\u72B6\u6001"),
        FINDING_STATUS_LABELS.map(([value, label]) => (0, import_react16.createElement)("option", { key: value, value }, label))
      ),
      (0, import_react16.createElement)(TaskScopePicker, { scope, onScope: (taskID) => {
        onScope(taskID);
        setPage(1);
      }, options })
    ),
    loading && rows.length === 0 ? (0, import_react16.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026") : null,
    error ? (0, import_react16.createElement)("div", { role: "alert", style: { color: "#dc2626" } }, error) : null,
    !loading && !error && rows.length === 0 ? (0, import_react16.createElement)(
      "p",
      { style: { fontSize: 12, color: "var(--vx-text-dim)" } },
      scope ? `\u4EFB\u52A1 #${scope} \u4E0B\u6CA1\u6709\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\u7684\u53D1\u73B0\u3002` : "\u6CA1\u6709\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\u7684\u53D1\u73B0\u3002"
    ) : rows.length > 0 && (0, import_react16.createElement)(
      "table",
      { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 } },
      (0, import_react16.createElement)("thead", null, (0, import_react16.createElement)(
        "tr",
        null,
        ["ID", "\u4EFB\u52A1", "\u6F0F\u6D1E\u7C7B", "\u4E25\u91CD\u5EA6", "\u72B6\u6001", "\u6458\u8981"].map((title) => (0, import_react16.createElement)("th", {
          key: title,
          style: { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--vx-border, #e5e7eb)" }
        }, title))
      )),
      (0, import_react16.createElement)("tbody", null, rows.map((finding) => (0, import_react16.createElement)(
        "tr",
        {
          key: finding.finding_id,
          onClick: () => onOpen(String(finding.finding_id)),
          style: { cursor: "pointer" }
        },
        (0, import_react16.createElement)("td", { style: { padding: "6px 8px", fontFamily: "var(--vx-mono)" } }, finding.finding_id),
        (0, import_react16.createElement)("td", { style: { padding: "6px 8px", fontFamily: "var(--vx-mono)", color: "var(--vx-text-dim)" } }, finding.task_id ?? "\u2014"),
        (0, import_react16.createElement)("td", { style: { padding: "6px 8px" } }, finding.vulnclass ?? ""),
        (0, import_react16.createElement)("td", { style: { padding: "6px 8px" } }, labelOf(SEVERITY_LABELS, finding.severity)),
        (0, import_react16.createElement)("td", { style: { padding: "6px 8px" } }, labelOf(FINDING_STATUS_LABELS, finding.status)),
        (0, import_react16.createElement)(
          "td",
          { style: { padding: "6px 8px", maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
          finding.summary ?? ""
        )
      )))
    ),
    (0, import_react16.createElement)(Pager2, { page: Math.min(page, pageCount) - 1, pageCount, total, unit: "\u6761\u53D1\u73B0", onPage: (next) => setPage(next + 1) })
  );
}
function FindingDetail({ id, onBack }) {
  const finding = useApi(`/api/exploration/findings/${id}`);
  const traffic = useApi(`/api/exploration/findings/${id}/traffic`);
  const [body, setBody] = (0, import_react16.useState)({ title: "", text: "", error: "" });
  const loadBody = async (bindingId, side) => {
    try {
      const data = await callApi(`/api/exploration/findings/${id}/traffic/${bindingId}/body?side=${side}&length=8192`);
      setBody({ title: `${bindingId} \xB7 ${side} \xB7 ${data.offset}-${data.next_offset}/${data.total}`, text: data.content, error: "" });
    } catch (error) {
      setBody({ title: `${bindingId} \xB7 ${side}`, text: "", error: String(error?.message ?? error) });
    }
  };
  if (finding.loading) return (0, import_react16.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (finding.error) return (0, import_react16.createElement)("div", { style: { color: "#dc2626" } }, finding.error);
  const row = finding.data ?? {};
  const bindings = traffic.data?.bindings ?? [];
  return (0, import_react16.createElement)(
    "div",
    null,
    (0, import_react16.createElement)(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } },
      (0, import_react16.createElement)("button", { type: "button", onClick: onBack, style: { border: "1px solid var(--vx-border, #e5e7eb)", background: "transparent", borderRadius: 8, padding: "3px 10px", cursor: "pointer" } }, "\u2190 \u8FD4\u56DE"),
      (0, import_react16.createElement)("span", { style: { fontSize: 18, fontWeight: 600 } }, `${row.finding_id} \xB7 ${row.vulnclass ?? ""}`),
      (0, import_react16.createElement)("span", { style: { fontSize: 12, color: "var(--vx-muted, #6b7280)" } }, `${row.severity} / ${row.status}`)
    ),
    (0, import_react16.createElement)("div", { style: { fontSize: 13, marginBottom: 10 } }, row.summary),
    (0, import_react16.createElement)("pre", { style: { fontSize: 12, whiteSpace: "pre-wrap", background: "var(--vx-code, #f8fafc)", padding: 10, borderRadius: 8, maxHeight: 220, overflow: "auto" } }, row.evidence || ""),
    (0, import_react16.createElement)("div", { style: { fontSize: 13, fontWeight: 600, margin: "14px 0 6px" } }, `\u6D41\u91CF\u7ED1\u5B9A\uFF08${bindings.length}\uFF09`),
    ...bindings.map((binding) => (0, import_react16.createElement)(
      "div",
      { key: binding.id, style: { border: "1px solid var(--vx-border, #e5e7eb)", borderRadius: 8, padding: 8, marginBottom: 8, fontSize: 12 } },
      (0, import_react16.createElement)("div", null, `#${binding.id} \xB7 ${binding.snapshot?.method ?? ""} ${binding.snapshot?.url ?? ""} \xB7 ${binding.role}`),
      (0, import_react16.createElement)(
        "div",
        { style: { marginTop: 6, display: "flex", gap: 8 } },
        (0, import_react16.createElement)("button", { type: "button", onClick: () => loadBody(String(binding.id), "response"), style: { cursor: "pointer" } }, "\u54CD\u5E94\u6B63\u6587"),
        (0, import_react16.createElement)("button", { type: "button", onClick: () => loadBody(String(binding.id), "request"), style: { cursor: "pointer" } }, "\u8BF7\u6C42\u6B63\u6587")
      )
    )),
    body.title ? (0, import_react16.createElement)(
      "div",
      null,
      (0, import_react16.createElement)("div", { style: { fontSize: 12, margin: "8px 0 4px", color: "var(--vx-muted, #6b7280)" } }, body.title),
      body.error ? (0, import_react16.createElement)("div", { style: { color: "#dc2626", fontSize: 12 } }, body.error) : (0, import_react16.createElement)("pre", { style: { fontSize: 12, whiteSpace: "pre-wrap", background: "var(--vx-code, #f8fafc)", padding: 10, borderRadius: 8, maxHeight: 280, overflow: "auto" } }, body.text)
    ) : null
  );
}
var TASKS_TABS = [
  ["tasks", "\u4EFB\u52A1"],
  ["findings", "\u53D1\u73B0"]
];
function TasksPanel() {
  const [tab, setTab] = (0, import_react16.useState)("tasks");
  const [findingID, setFindingID] = (0, import_react16.useState)("");
  const [scope, setScope] = (0, import_react16.useState)("");
  const viewSwitch = (0, import_react16.createElement)(
    "div",
    { className: "vx-ui-seg", role: "group", "aria-label": "\u4EFB\u52A1\u89C6\u56FE" },
    TASKS_TABS.map(([id, label]) => (0, import_react16.createElement)("button", {
      key: id,
      type: "button",
      "aria-pressed": tab === id,
      onClick: () => setTab(id)
    }, label))
  );
  if (tab === "tasks") return (0, import_react16.createElement)(TasksWorkspace, { viewSwitch });
  return (0, import_react16.createElement)(
    PanelShell,
    {
      title: "\u4EFB\u52A1",
      desc: "\u4EFB\u52A1\u6E05\u5355\u3001\u53D1\u73B0\uFF0C\u4EE5\u53CA\u6BCF\u4E2A\u4EFB\u52A1\u7684\u6267\u884C\u8BB0\u5F55",
      actions: viewSwitch
    },
    scope ? (0, import_react16.createElement)("div", { className: "vx-ui-statusline" }, `\u4EFB\u52A1\u8303\u56F4 #${scope}`) : null,
    findingID ? (0, import_react16.createElement)(FindingDetail, { id: findingID, onBack: () => setFindingID("") }) : (0, import_react16.createElement)(FindingsTab, { scope, onScope: setScope, onOpen: setFindingID })
  );
}
function NotifySettings() {
  return (0, import_react16.createElement)(PanelShell, { title: "\u901A\u77E5\u63A8\u9001", desc: "\u6E20\u9053\u4E0E\u6295\u9012" }, (0, import_react16.createElement)(NotifyPage));
}
function InterceptSettings2() {
  return (0, import_react16.createElement)(PanelShell, { title: "\u62E6\u622A\u89C4\u5219", desc: "\u5DE5\u5177\u6267\u884C\u524D\u5148\u6309\u62E6\u622A\u89C4\u5219\u5339\u914D\uFF1B\u672A\u547D\u4E2D\u7684\u547D\u4EE4\u53EF\u4EA4\u7531\u6A21\u578B\u515C\u5E95\u5224\u5B9A" }, (0, import_react16.createElement)(InterceptSettings));
}
var PANELS = [
  { id: "vexnar-overview", label: "\u6982\u89C8", order: 99, component: OverviewPanel, icon: OverviewIcon },
  { id: "vexnar-tasks", label: "\u4EFB\u52A1", order: 100, component: TasksPanel },
  { id: "vexnar-traffic", label: "\u6D41\u91CF", order: 102, component: TrafficPanel },
  { id: "vexnar-egress", label: "\u4EE3\u7406\u6C60", order: 101, component: EgressPanel }
];
var SETTINGS = [
  { id: "vexnar-notify", label: "\u901A\u77E5\u63A8\u9001", order: 43, component: NotifySettings },
  { id: "vexnar-intercept", label: "\u62E6\u622A\u89C4\u5219", order: 44, component: InterceptSettings2 }
];
var PLUGIN_TABS = [
  { id: "vexnar-plugin-tools", label: "\u5DE5\u5177", order: 20, component: ToolsTab },
  { id: "vexnar-plugin-mcp", label: "MCP server", order: 30, component: McpTab }
];
function apply(ctx) {
  const { slots } = ctx;
  if (slots === void 0) {
    console.warn("[vexnar] client slots service missing; check `export const inject`");
    return;
  }
  installStyles();
  slots.inject("tool.call.toolview", () => slots.register({ name: "tool.call.toolview", key: FINDING_TOOL }, FindingCard));
  slots.inject("tool.call.toolview", () => slots.register({ name: "tool.call.toolview", key: TRAFFIC_TOOL }, TrafficViewer));
  slots.inject("conversation.session.header.actions", () => slots.register({ name: "conversation.session.header.actions", id: "vexnar-yak-history" }, SessionTrafficAction));
  slots.inject("conversation.session.header.actions", () => slots.register({ name: "conversation.session.header.actions", id: "vexnar-session-capture", order: 40 }, SessionCaptureAction));
  slots.inject("conversation.hero.options", () => slots.register({ name: "conversation.hero.options", id: "vexnar-yak-history" }, SessionTrafficAction));
  for (const panel of PANELS) {
    slots.inject("main", () => slots.register({ name: "main", key: panel.id }, panel.component));
    slots.inject("sidebar.panellist", () => slots.register({ name: "sidebar.panellist", id: panel.id, order: panel.order, label: () => panel.label }, panel.icon ?? ConsoleIcon));
  }
  for (const section of SETTINGS) {
    slots.inject("settings.section", () => slots.register({ name: "settings.section", id: section.id, label: () => section.label, order: section.order }, section.component));
  }
  for (const tab of PLUGIN_TABS) {
    slots.inject("settings.plugins.tab", () => slots.register({ name: "settings.plugins.tab", id: tab.id, label: () => tab.label, order: tab.order }, tab.component));
  }
  slots.inject("sidebar.brand.mark", () => slots.register({ name: "sidebar.brand.mark" }, BrandMark));
  slots.inject("sidebar.brand.name", () => slots.register({ name: "sidebar.brand.name" }, BrandName));
  slots.inject("conversation.hero.brand.mark", () => slots.register({ name: "conversation.hero.brand.mark" }, HeroLogo));
  ctx.effect?.(() => installSkinBrandGuard());
  ctx.effect?.(() => installHeroSlogan());
  ctx.effect?.(() => installPermissionWarning());
}

return module.exports;
}});
