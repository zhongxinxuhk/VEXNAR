window.__ModuleLoader__.load({ id: "@vexnar/dsh-ui", factory: (require) => {
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
  FindingCard: () => FindingCard,
  TrafficViewer: () => TrafficViewer,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react2 = require("react");

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

/* The hero-frame layer wraps the conversation scroll body; in hero it stacks the
   overview card above the transcript and keeps the scroll body flexed below. */
.vx-ov-frame {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.vx-ov-frame[data-hero="1"] { padding-top: 12px; }

.vx-ov-tone-blue { --vx-tone: var(--vx-chart-1); }
.vx-ov-tone-violet { --vx-tone: var(--vx-chart-2); }
.vx-ov-tone-green { --vx-tone: var(--vx-chart-3); }
.vx-ov-tone-amber { --vx-tone: var(--vx-chart-4); }
.vx-ov-tone-red { --vx-tone: var(--vx-chart-5); }

.vx-ov,
.vx-ov *,
.vx-ov-page,
.vx-ov-page * { box-sizing: border-box; }

.vx-ov {
  container-type: inline-size;
  box-sizing: border-box;
  position: relative;
  flex: none;
  margin: 0 auto 10px;
  width: calc(
    100% -
    var(--dsh-composer-side-clearance) -
    var(--dsh-composer-side-clearance) -
    var(--dsh-composer-dock-inset) -
    var(--dsh-composer-dock-inset) -
    var(--dsh-composer-dock-inset) -
    var(--dsh-composer-dock-inset)
  );
  max-width: calc(
    var(--dsh-composer-card-max-width) -
    var(--dsh-composer-dock-inset) -
    var(--dsh-composer-dock-inset) -
    var(--dsh-composer-dock-inset) -
    var(--dsh-composer-dock-inset)
  );
  border: 1px solid var(--vx-border);
  border-radius: var(--dsw-radius-lg, 16px);
  background: var(--vx-glass);
  box-shadow: var(--dsw-elevation-panel, var(--vx-elevation));
  color: var(--vx-text);
  font-size: 12px;
  line-height: 1.4;
  overflow: hidden;
  animation: vx-ov-in 0.3s var(--vx-ease) both;
}

/* One hairline of the chart hue along the top edge: reads as an instrument
   panel rather than another message bubble. */
.vx-ov::before,
.vx-ov-page::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 1.5px;
  background: linear-gradient(90deg, transparent, var(--vx-chart-1), var(--vx-chart-2), transparent);
  opacity: 0.45;
  pointer-events: none;
}

.vx-ov-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--vx-border) 70%, transparent);
}

.vx-ov[data-open="0"] .vx-ov-head { border-bottom: 0; }

.vx-ov-brand {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.vx-ov-brand h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: var(--vx-text);
}

.vx-ov-glyph {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: 7px;
  color: var(--vx-chart-1);
  background: color-mix(in srgb, var(--vx-chart-1) 13%, transparent);
}

.vx-ov-live {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--vx-text-faint);
}

.vx-ov-live i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--vx-chart-3);
  animation: vx-ov-pulse 2.6s ease-out infinite;
}

.vx-ov-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.vx-ov-updated {
  font-size: 9.5px;
  color: var(--vx-text-faint);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.vx-ov-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--vx-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--vx-text) 4%, transparent);
}

.vx-ov-seg > button {
  border: 0;
  padding: 1px 7px;
  border-radius: 6px;
  background: transparent;
  color: var(--vx-text-dim);
  font: inherit;
  font-size: 9.5px;
  font-weight: 600;
  line-height: 16px;
  cursor: pointer;
  transition: background var(--vx-dur-fast) var(--vx-ease), color var(--vx-dur-fast) var(--vx-ease);
}

.vx-ov-seg > button:hover { color: var(--vx-text); }

.vx-ov-seg > button[aria-pressed="true"] {
  background: var(--vx-surface);
  color: var(--vx-text);
  box-shadow: var(--dsw-shadow-lv1, 0 1px 2px rgba(0, 0, 0, 0.1));
}

.vx-ov-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: none;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--vx-text-dim);
  cursor: pointer;
  transition: background var(--vx-dur-fast) var(--vx-ease), color var(--vx-dur-fast) var(--vx-ease);
}

.vx-ov-icon:hover { background: var(--vx-surface-sunken); color: var(--vx-text); }

.vx-ov[data-open="0"] .vx-ov-icon svg { transform: rotate(-90deg); }
.vx-ov-icon svg { transition: transform var(--vx-dur) var(--vx-ease); }

.vx-ov-icon:focus-visible,
.vx-ov-seg > button:focus-visible,
.vx-ov-error button:focus-visible {
  outline: 2px solid var(--vx-accent);
  outline-offset: 1px;
}

.vx-ov-body {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 10px 12px 12px;
}

.vx-ov-kpis {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.vx-ov-kpi {
  position: relative;
  flex: 1 1 116px;
  min-width: 0;
  padding: 9px 10px 8px;
  border: 1px solid var(--vx-border);
  border-radius: 12px;
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--vx-tone) 11%, transparent), transparent 58%),
    color-mix(in srgb, var(--vx-surface) 62%, transparent);
  transition: border-color var(--vx-dur) var(--vx-ease), transform var(--vx-dur) var(--vx-ease),
    box-shadow var(--vx-dur) var(--vx-ease);
}

.vx-ov-kpi:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--vx-tone) 42%, var(--vx-border));
  box-shadow: 0 8px 18px -16px color-mix(in srgb, var(--vx-tone) 80%, transparent);
}

.vx-ov-kpi-top {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--vx-text-dim);
  white-space: nowrap;
  overflow: hidden;
}

.vx-ov-kpi-top svg { color: var(--vx-tone); flex: none; }

.vx-ov-kpi-mid {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  min-height: 28px;
  margin-top: 3px;
}

.vx-ov-num {
  font-size: 23px;
  font-weight: 680;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--vx-text);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.vx-ov-num em {
  margin-left: 3px;
  font-style: normal;
  font-size: 11px;
  font-weight: 600;
  color: var(--vx-text-faint);
}

.vx-ov-spark {
  display: block;
  width: 100%;
  margin-top: 5px;
  opacity: 0.8;
  pointer-events: none;
}

.vx-ov-kpi-foot {
  margin-top: 2px;
  min-height: 13px;
  font-size: 9.5px;
  color: var(--vx-text-faint);
  overflow: hidden;
}

.vx-ov-chips { display: inline-flex; flex-wrap: wrap; gap: 2px 7px; }

.vx-ov-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.vx-ov-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 2px;
  flex: none;
  border-radius: 50%;
  vertical-align: middle;
}

.vx-ov-charts {
  display: grid;
  grid-template-columns: minmax(0, 1.62fr) minmax(0, 1fr);
  gap: 8px;
}

.vx-ov-card {
  min-width: 0;
  padding: 9px 11px 8px;
  border: 1px solid var(--vx-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--vx-surface) 68%, transparent);
}

.vx-ov-card--trend,
.vx-ov-card--dials { display: flex; flex-direction: column; min-height: 0; }

.vx-ov-card--dials { overflow: hidden; }

.vx-ov-h {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.01em;
  color: var(--vx-text);
}

.vx-ov-h > svg { color: var(--vx-text-faint); flex: none; }

.vx-ov-sub {
  margin-left: auto;
  font-size: 9.5px;
  font-weight: 500;
  color: var(--vx-text-faint);
  white-space: nowrap;
}

.vx-ov-legend {
  margin-left: auto;
  display: flex;
  gap: 9px;
  font-size: 9.5px;
  font-weight: 500;
  color: var(--vx-text-faint);
}

.vx-ov-legend span { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }

.vx-ov-plot { position: relative; width: 100%; min-width: 0; margin-top: 2px; }

.vx-ov-axis {
  fill: var(--vx-chart-axis);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.vx-ov-bar {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: vx-ov-grow 0.55s var(--vx-ease) both;
}

.vx-ov-tip {
  position: absolute;
  z-index: 3;
  min-width: 132px;
  padding: 7px 9px;
  transform: translateX(-50%);
  border: 1px solid var(--vx-border-strong);
  border-radius: 9px;
  background: var(--vx-glass);
  box-shadow: 0 12px 28px -16px rgba(0, 0, 0, 0.5);
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

.vx-ov-tip-row > span { display: inline-flex; align-items: center; }

.vx-ov-tip-row b {
  color: var(--vx-text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.vx-ov-tip-total {
  margin-top: 3px;
  padding-top: 3px;
  border-top: 1px solid color-mix(in srgb, var(--vx-border) 70%, transparent);
}

/* Anchor both dials to the top of the row instead of centring them in whatever
   height the taller trend card dictates: caption and rate line stay inside. */
.vx-ov-dials {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: start;
  justify-items: center;
  gap: 4px;
  padding-top: 8px;
}

.vx-ov-dial {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.vx-ov-dial-ring {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
}

.vx-ov-dial-ring > svg { position: absolute; inset: 0; }

.vx-ov-dial-value {
  font-size: 16px;
  font-weight: 680;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--vx-text);
}

.vx-ov-dial-value em {
  margin-left: 1px;
  font-style: normal;
  font-size: 9px;
  font-weight: 600;
  color: var(--vx-text-faint);
}

.vx-ov-dial-caption {
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--vx-text-dim);
}

.vx-ov-dial-sub {
  max-width: 108px;
  font-size: 8.5px;
  line-height: 1.25;
  color: var(--vx-text-faint);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vx-ov-dial-arc { transition: stroke-dasharray 0.7s var(--vx-ease), stroke-dashoffset 0.7s var(--vx-ease); }

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

.vx-ov-empty {
  padding: 16px 0;
  text-align: center;
  font-size: 11px;
  color: var(--vx-text-faint);
}

.vx-ov-muted { color: var(--vx-text-faint); }

/* \u2500\u2500 \u6982\u89C8\u6574\u9875 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vx-ov-page {
  position: relative;
  box-sizing: border-box;
  display: flex;
  height: 100%;
  flex-direction: column;
  gap: 12px;
  padding: 20px 22px 40px;
  overflow-y: auto;
  color: var(--vx-text);
  font-size: 12px;
  line-height: 1.45;
}

.vx-ov-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.vx-ov-page-head h1 {
  margin: 0;
  font-size: 19px;
  font-weight: 660;
  letter-spacing: -0.01em;
}

.vx-ov-page-head p {
  margin: 3px 0 0;
  font-size: 11px;
  color: var(--vx-text-dim);
}

.vx-ov-page-tools { display: flex; align-items: center; gap: 8px; }

.vx-ov-kpis--page .vx-ov-kpi { flex: 1 1 172px; padding: 11px 13px 10px; }
.vx-ov-kpis--page .vx-ov-num { font-size: 26px; }

.vx-ov-card--wide { padding: 12px 14px 10px; }

.vx-ov-split {
  display: grid;
  grid-template-columns: minmax(0, 216px) minmax(0, 1fr);
  gap: 18px;
  margin-top: 8px;
  align-items: stretch;
}

.vx-ov-metrics { display: flex; flex-direction: column; gap: 11px; }

.vx-ov-metric-total { display: flex; flex-direction: column; gap: 2px; }

.vx-ov-metric-total span { font-size: 10px; color: var(--vx-text-dim); }

.vx-ov-metric-total strong {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.vx-ov-metric-total em {
  font-style: normal;
  font-size: 10px;
  color: var(--vx-text-faint);
}

.vx-ov-meter { display: flex; flex-direction: column; gap: 4px; }

.vx-ov-meter-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 10px;
  color: var(--vx-text-dim);
}

.vx-ov-meter-top b { font-family: var(--vx-mono); font-size: 10.5px; font-variant-numeric: tabular-nums; }

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

.vx-ov-hitr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border: 1px solid var(--vx-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--vx-surface) 50%, transparent);
  font-size: 10px;
  color: var(--vx-text-dim);
}

.vx-ov-hitr b { font-size: 12px; color: var(--vx-chart-3); font-variant-numeric: tabular-nums; }

.vx-ov-chart-tall { min-width: 0; display: flex; flex-direction: column; }

.vx-ov-two,
.vx-ov-three {
  display: grid;
  gap: 10px;
  align-items: start;
}

.vx-ov-two { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.vx-ov-three { grid-template-columns: repeat(auto-fit, minmax(228px, 1fr)); }

.vx-ov-feed {
  display: flex;
  flex-direction: column;
  margin: 6px 0 0;
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

.vx-ov-feed li:first-child { border-top: 0; }

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
  flex: none;
  display: inline-flex;
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

.vx-ov-card--table { padding: 10px 0 2px; }
.vx-ov-card--table .vx-ov-h { padding: 0 13px; }
.vx-ov-table-wrap { margin-top: 6px; overflow-x: auto; }

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

.vx-ov-td-task { max-width: 320px; }
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
  font-size: 9px;
  font-weight: 600;
  line-height: 1.6;
  color: var(--vx-text-dim);
}

.vx-ov-pill--blue { border-color: color-mix(in srgb, var(--vx-chart-1) 36%, transparent); color: var(--vx-chart-1); background: color-mix(in srgb, var(--vx-chart-1) 9%, transparent); }
.vx-ov-pill--green { border-color: color-mix(in srgb, var(--vx-chart-3) 36%, transparent); color: var(--vx-chart-3); background: color-mix(in srgb, var(--vx-chart-3) 9%, transparent); }
.vx-ov-pill--amber { border-color: color-mix(in srgb, var(--vx-chart-4) 36%, transparent); color: var(--vx-chart-4); background: color-mix(in srgb, var(--vx-chart-4) 9%, transparent); }
.vx-ov-pill--red { border-color: color-mix(in srgb, var(--vx-chart-5) 36%, transparent); color: var(--vx-chart-5); background: color-mix(in srgb, var(--vx-chart-5) 9%, transparent); }
.vx-ov-pill--muted { color: var(--vx-text-faint); }

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
.vx-ov-progress span { font-variant-numeric: tabular-nums; color: var(--vx-text-dim); font-size: 9.5px; }

.vx-ov-rows { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }

.vx-ov-row { display: flex; align-items: center; gap: 7px; font-size: 10px; }

.vx-ov-row-label {
  width: 38px;
  flex: none;
  text-align: right;
  color: var(--vx-text-dim);
  font-size: 9.5px;
}

.vx-ov-row-track {
  flex: 1;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vx-text) 8%, transparent);
}

.vx-ov-row-track i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--vx-chart-6), var(--vx-chart-1));
  transition: width 0.6s var(--vx-ease);
}

.vx-ov-row-value { width: 22px; flex: none; text-align: right; font-variant-numeric: tabular-nums; }

.vx-ov-row-foot {
  margin-top: 3px;
  padding-top: 7px;
  border-top: 1px solid color-mix(in srgb, var(--vx-border) 55%, transparent);
  font-size: 9.5px;
  color: var(--vx-text-faint);
}

.vx-ov-codes { display: flex; align-items: flex-end; gap: 8px; height: 96px; margin-top: 8px; }

.vx-ov-code { display: flex; flex: 1; height: 100%; flex-direction: column; align-items: center; gap: 3px; }

.vx-ov-code-num { font-size: 9px; color: var(--vx-text-faint); font-variant-numeric: tabular-nums; }

.vx-ov-code-track {
  display: flex;
  width: 100%;
  flex: 1;
  align-items: flex-end;
  justify-content: center;
}

.vx-ov-code-track i {
  display: block;
  width: 100%;
  max-width: 26px;
  border-radius: 3px 3px 0 0;
  opacity: 0.85;
  transition: height 0.6s var(--vx-ease);
}

.vx-ov-code-label { font-family: var(--vx-mono); font-size: 9px; }

.vx-ov-sys { display: flex; flex-direction: column; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }

.vx-ov-sys li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 9px;
  border: 1px solid var(--vx-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--vx-surface) 50%, transparent);
  font-size: 10px;
  color: var(--vx-text-dim);
}

.vx-ov-sys li b { font-family: var(--vx-mono); font-size: 10px; color: var(--vx-text); font-weight: 600; }
.vx-ov-sys li b[data-on="1"] { color: var(--vx-chart-3); }

@container (max-width: 560px) {
  .vx-ov-charts { grid-template-columns: 1fr; }
  .vx-ov-updated { display: none; }
  .vx-ov-kpi { flex-basis: 132px; }
}

@container (max-width: 400px) {
  .vx-ov-legend { display: none; }
  .vx-ov-kpi { flex-basis: 100%; }
}

/* \u77EE\u5C4F\uFF08\u7B14\u8BB0\u672C\u534A\u5C4F\u7A97\u53E3\uFF09\uFF1A\u6982\u89C8\u53EA\u7559\u6807\u9898\u680F\u4E0E\u6307\u6807\u6761\uFF0C\u628A\u9AD8\u5EA6\u8BA9\u7ED9\u8F93\u5165\u6846\uFF1B
   \u56FE\u8868\u5728\u4FA7\u8FB9\u680F\u300C\u6982\u89C8\u300D\u6574\u9875\u91CC\u5B8C\u6574\u5448\u73B0\u3002 */
@media (max-height: 780px) {
  .vx-ov-charts { display: none; }
  .vx-ov-kpi { padding: 8px 9px 7px; }
  .vx-ov-num { font-size: 20px; }
}

@media (max-width: 900px) {
  .vx-ov-split { grid-template-columns: 1fr; }
}

/* \u2500\u2500 motion \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
@keyframes vx-ov-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

@keyframes vx-ov-grow {
  from { transform: scaleY(0.03); opacity: 0.2; }
  to { transform: scaleY(1); opacity: 1; }
}

@keyframes vx-ov-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--vx-chart-3) 55%, transparent); }
  70% { box-shadow: 0 0 0 5px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
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
  .vx-seg > button { transition: none; }
  .vx-ov,
  .vx-ov-bar,
  .vx-ov-live i { animation: none; }
  .vx-ov-icon svg,
  .vx-ov-dial-arc,
  .vx-ov-meter-track i,
  .vx-ov-row-track i,
  .vx-ov-code-track i { transition: none; }
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
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var CORE_PATH = "/vexnar-api";
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
function coreBase() {
  return (storeGet("vexnar.coreUrl") || CORE_PATH).replace(/\/$/, "");
}
async function getJson(path, signal) {
  const token = storeGet("vexnar.coreToken");
  const response = await fetch(coreBase() + path, {
    headers: token === "" ? {} : { "x-vexnar-token": token },
    signal
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}
var EMPTY_DATA = {
  tasks: [],
  stats: { total: 0, pending: 0, critical: 0, high: 0, medium: 0, low: 0 },
  findings: [],
  assets: {},
  daily: [],
  traffic: [],
  activity: [],
  sys: { agents: 0, agentsOn: 0, mcp: 0, mcpOn: 0, tools: 0, toolsOn: 0 },
  capture: false,
  updated: 0
};
function pick(result, fallback) {
  return result.status === "fulfilled" ? result.value : fallback;
}
async function loadOverview(signal) {
  const settled = await Promise.allSettled([
    getJson("/api/tasks", signal),
    getJson("/api/exploration/findings/stats", signal),
    getJson("/api/exploration/findings?page=1&limit=24", signal),
    getJson("/api/assets/counts", signal),
    getJson("/api/tokens/daily?days=90", signal),
    getJson("/api/traffic?page=0&size=60", signal),
    getJson("/api/exploration/activity?limit=12", signal),
    getJson("/api/settings", signal),
    getJson("/api/agents", signal),
    getJson("/api/mcp", signal),
    getJson("/api/tools", signal)
  ]);
  const rejected = settled.slice(0, 5).filter((item) => item.status === "rejected")[0];
  const failure = rejected === void 0 ? void 0 : rejected.reason;
  const error = failure === void 0 ? "" : String(failure.message ?? failure);
  const tasks = pick(settled[0], {});
  const stats = pick(settled[1], {});
  const findings = pick(settled[2], {});
  const assets = pick(settled[3], {});
  const daily = pick(settled[4], []);
  const traffic2 = pick(settled[5], {});
  const activity = pick(settled[6], {});
  const settings = pick(settled[7], {});
  const agents = pick(settled[8], {});
  const mcp = pick(settled[9], {});
  const tools = pick(settled[10], {});
  const countOn = (rows) => (rows ?? []).filter((row) => row.enabled !== false).length;
  return {
    error,
    data: {
      tasks: Array.isArray(tasks.tasks) ? tasks.tasks : [],
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
      traffic: Array.isArray(traffic2.exchanges) ? traffic2.exchanges : [],
      activity: Array.isArray(activity.items) ? activity.items : [],
      sys: {
        agents: agents.agents?.length ?? 0,
        agentsOn: countOn(agents.agents),
        mcp: mcp.servers?.length ?? 0,
        mcpOn: countOn(mcp.servers),
        tools: tools.tools?.length ?? 0,
        toolsOn: countOn(tools.tools)
      },
      capture: settings.traffic_capture === true,
      updated: Date.now()
    }
  };
}
function useOverview(intervalMs) {
  const [data, setData] = (0, import_react.useState)(EMPTY_DATA);
  const [error, setError] = (0, import_react.useState)("");
  const [nonce, setNonce] = (0, import_react.useState)(0);
  (0, import_react.useEffect)(() => {
    if (intervalMs <= 0) return;
    const controller = new AbortController();
    let alive = true;
    let busy = false;
    const load = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const next = await loadOverview(controller.signal);
        if (!alive) return;
        setData(next.data);
        setError(next.error);
      } catch (reason) {
        if (alive && !controller.signal.aborted) setError(String(reason?.message ?? reason));
      } finally {
        busy = false;
      }
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, nonce]);
  return { data, error, reload: () => setNonce((value) => value + 1) };
}
var pad2 = (value) => value < 10 ? `0${value}` : String(value);
function buildTrend(daily, days) {
  const byDay = /* @__PURE__ */ new Map();
  for (const row of daily) {
    const key = String(row.day ?? "");
    if (key === "") continue;
    byDay.set(key, {
      day: key,
      input: Number(row.input_tokens ?? 0),
      output: Number(row.output_tokens ?? 0),
      cache: Number(row.cache_read_tokens ?? 0)
    });
  }
  const out = [];
  const now = /* @__PURE__ */ new Date();
  for (let index = days - 1; index >= 0; index -= 1) {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    cursor.setUTCDate(cursor.getUTCDate() - index);
    const key = `${cursor.getUTCFullYear()}-${pad2(cursor.getUTCMonth() + 1)}-${pad2(cursor.getUTCDate())}`;
    out.push(byDay.get(key) ?? { day: key, input: 0, output: 0, cache: 0 });
  }
  return out;
}
function fmtNum(value) {
  if (!Number.isFinite(value)) return "\u2014";
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${(value / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(value));
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
  return `${Math.floor(hours / 24)}d \u524D`;
}
function clockLabel(ms) {
  if (ms === 0) return "\u540C\u6B65\u4E2D\u2026";
  return `\u66F4\u65B0\u4E8E ${new Date(ms).toLocaleTimeString("zh-CN", { hour12: false })}`;
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
function useWidth() {
  const [width, setWidth] = (0, import_react.useState)(0);
  const observer = (0, import_react.useRef)(null);
  const attach = (0, import_react.useCallback)((node) => {
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
  (0, import_react.useEffect)(() => () => {
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
function topRoundedPath(x, top, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  const bottom = top + height;
  return [
    `M${x},${bottom}`,
    `L${x},${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `L${x + width - r},${top}`,
    `Q${x + width},${top} ${x + width},${top + r}`,
    `L${x + width},${bottom}`,
    "Z"
  ].join(" ");
}
var trendSeries = [
  { key: "input", label: "\u8F93\u5165", color: "var(--vx-chart-1)" },
  { key: "output", label: "\u8F93\u51FA", color: "var(--vx-chart-2)" },
  { key: "cache", label: "\u7F13\u5B58\u8BFB", color: "var(--vx-chart-3)" }
];
function TrendChart({ points, height }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = (0, import_react.useState)(null);
  const uid = (0, import_react.useId)().replace(/:/g, "");
  const w = Math.max(width, 260);
  const pad = { top: 10, right: 6, bottom: 16, left: 32 };
  const plotW = Math.max(w - pad.left - pad.right, 20);
  const plotH = Math.max(height - pad.top - pad.bottom, 20);
  const max = niceMax(
    points.reduce((high, point) => Math.max(high, point.input + point.output + point.cache), 0)
  );
  const slot = plotW / Math.max(points.length, 1);
  const barW = Math.max(2, Math.min(18, slot * 0.58));
  const baseY = pad.top + plotH;
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const active = hover !== null ? points[hover] : void 0;
  const tipLeft = hover !== null ? Math.min(Math.max(pad.left + slot * hover + slot / 2, 74), w - 74) : 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-plot", ref, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: w, height, role: "img", "aria-label": "\u6BCF\u65E5 Token \u6D88\u8017\u5806\u53E0\u67F1\u72B6\u56FE", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: trendSeries.map((series) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: `${uid}-${series.key}`, x1: "0", y1: "0", x2: "0", y2: "1", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0%", style: { stopColor: series.color, stopOpacity: 0.95 } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "100%", style: { stopColor: series.color, stopOpacity: 0.42 } })
      ] }, series.key)) }),
      ticks.map((ratio) => {
        const y = pad.top + plotH * (1 - ratio);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "line",
            {
              x1: pad.left,
              x2: pad.left + plotW,
              y1: y,
              y2: y,
              stroke: "var(--vx-chart-grid)",
              strokeDasharray: ratio === 0 ? void 0 : "1 4"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: pad.left - 6, y: y + 3, textAnchor: "end", className: "vx-ov-axis", children: fmtNum(max * ratio) })
        ] }, ratio);
      }),
      points.map((point, index) => {
        const stack = [
          { key: "input", value: point.input },
          { key: "output", value: point.output },
          { key: "cache", value: point.cache }
        ];
        let cursor = baseY;
        const topIndex = stack.reduce((top, item, itemIndex) => item.value > 0 ? itemIndex : top, -1);
        const x = pad.left + slot * index + (slot - barW) / 2;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("g", { className: "vx-ov-bar", style: { animationDelay: `${Math.min(index * 12, 220)}ms` }, children: stack.map((item, itemIndex) => {
          const h2 = max > 0 ? item.value / max * plotH : 0;
          if (h2 <= 0) return null;
          cursor -= h2;
          return itemIndex === topIndex ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "path",
            {
              d: topRoundedPath(x, cursor, barW, h2, 3),
              fill: `url(#${uid}-${item.key})`
            },
            item.key
          ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "rect",
            {
              x,
              y: cursor,
              width: barW,
              height: h2,
              fill: `url(#${uid}-${item.key})`
            },
            item.key
          );
        }) }, point.day);
      }),
      points.map((point, index) => {
        const last = index === points.length - 1;
        if (!last && index % labelStep !== 0) return null;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "text",
          {
            x: pad.left + slot * index + (last ? slot - 2 : slot / 2),
            y: height - 4,
            textAnchor: last ? "end" : index === 0 ? "start" : "middle",
            className: "vx-ov-axis",
            children: point.day.slice(5)
          },
          `label-${point.day}`
        );
      }),
      hover !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "line",
        {
          x1: pad.left + slot * hover + slot / 2,
          x2: pad.left + slot * hover + slot / 2,
          y1: pad.top,
          y2: baseY,
          stroke: "var(--vx-chart-1)",
          strokeOpacity: "0.45",
          strokeDasharray: "3 3"
        }
      ),
      points.map((point, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "rect",
        {
          x: pad.left + slot * index,
          y: pad.top,
          width: slot,
          height: plotH,
          fill: "transparent",
          onPointerEnter: () => {
            setHover(index);
          },
          onPointerLeave: () => {
            setHover((current) => current === index ? null : current);
          }
        },
        `hit-${point.day}`
      ))
    ] }),
    active !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-tip", style: { left: tipLeft, top: 2 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-tip-day", children: active.day }),
      trendSeries.map((series) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-tip-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: series.color } }),
          series.label
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtNum(active[series.key]) })
      ] }, series.key)),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-tip-row vx-ov-tip-total", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5408\u8BA1" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: fmtNum(active.input + active.output + active.cache) })
      ] })
    ] })
  ] });
}
function Dial({ value, caption, sub, size = 84 }) {
  const uid = (0, import_react.useId)().replace(/:/g, "");
  const thickness = size >= 80 ? 9 : 7.5;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, value / 100));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-dial", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-dial-ring", style: { width: size, height: size }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { width: size, height: size, "aria-hidden": "true", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: `${uid}-arc`, x1: "0", y1: "0", x2: "1", y2: "1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0%", style: { stopColor: "var(--vx-chart-3)" } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "100%", style: { stopColor: "var(--vx-chart-1)" } })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "circle",
          {
            cx: size / 2,
            cy: size / 2,
            r: radius,
            fill: "none",
            stroke: "var(--vx-chart-grid)",
            strokeWidth: thickness
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "circle",
          {
            cx: size / 2,
            cy: size / 2,
            r: radius,
            fill: "none",
            stroke: `url(#${uid}-arc)`,
            strokeWidth: thickness,
            strokeLinecap: "round",
            strokeDasharray: `${circumference * ratio} ${circumference}`,
            transform: `rotate(-90 ${size / 2} ${size / 2})`,
            className: "vx-ov-dial-arc"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-dial-value", children: [
        Math.round(value),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: "%" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-dial-caption", children: caption }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-dial-sub", children: sub })
  ] });
}
function SeverityDonut({ counts, size = 84 }) {
  const thickness = size >= 80 ? 9 : 7.5;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = counts.critical + counts.high + counts.medium + counts.low;
  let offset = 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-dial", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-dial-ring", style: { width: size, height: size }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: size, height: size, "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { transform: `rotate(-90 ${size / 2} ${size / 2})`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: size / 2, cy: size / 2, r: radius, fill: "none", stroke: "var(--vx-chart-grid)", strokeWidth: thickness }),
        SEVERITY_META.map((meta) => {
          const value = counts[meta.key];
          const length = total > 0 ? value / total * circumference : 0;
          const drawn = Math.max(length - 2.5, 0);
          const segment = length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "circle",
            {
              cx: size / 2,
              cy: size / 2,
              r: radius,
              fill: "none",
              stroke: meta.tone,
              strokeWidth: thickness,
              strokeLinecap: "round",
              strokeDasharray: `${drawn} ${circumference - drawn}`,
              strokeDashoffset: -offset,
              className: "vx-ov-dial-arc"
            },
            meta.key
          ) : null;
          offset += length;
          return segment;
        })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-dial-value", children: [
        counts.total || total,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: "\u4E2A" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-dial-caption", children: "\u6F0F\u6D1E\u5206\u5E03" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-dial-sub", children: total === 0 ? "\u6682\u65E0\u53D1\u73B0" : `\u4E25\u91CD ${counts.critical} \xB7 \u9AD8\u5371 ${counts.high}` })
  ] });
}
function Spark({ values, height = 16 }) {
  const uid = (0, import_react.useId)().replace(/:/g, "");
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
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0%", style: { stopColor: "var(--vx-tone, var(--vx-chart-1))", stopOpacity: 0.34 } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "100%", style: { stopColor: "var(--vx-tone, var(--vx-chart-1))", stopOpacity: 0 } })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: area, fill: `url(#${uid}-spark)` }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: line, fill: "none", stroke: "var(--vx-tone, var(--vx-chart-1))", strokeWidth: "1.4", strokeLinejoin: "round", strokeLinecap: "round" })
      ]
    }
  );
}
function AssetRows({ rows, total }) {
  if (rows.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-empty", children: "\u6682\u65E0\u8D44\u4EA7\u6570\u636E" });
  const max = rows[0]?.[1] ?? 1;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-rows", children: [
    rows.map(([type, count]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-row-label", children: ASSET_LABELS[type] ?? type }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-row-track", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: { width: `${Math.max(count / Math.max(max, 1) * 100, 3)}%` } }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-row-value", children: count })
    ] }, type)),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-row-foot", children: [
      "\u5171 ",
      total,
      " \u4E2A\u8282\u70B9"
    ] })
  ] });
}
function StatusBars({ codes }) {
  if (codes.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-empty", children: "\u6682\u65E0\u6D41\u91CF\u6570\u636E" });
  const max = Math.max(...codes.map((item) => item.count), 1);
  const tone = (code) => code < 300 ? "var(--vx-chart-3)" : code < 400 ? "var(--vx-chart-1)" : code < 500 ? "var(--vx-chart-4)" : "var(--vx-chart-5)";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-codes", children: codes.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-code", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-code-num", children: item.count }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-code-track", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: { height: `${Math.max(item.count / max * 100, 6)}%`, background: tone(item.code) } }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-code-label", style: { color: tone(item.code) }, children: item.code })
  ] }, item.code)) });
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
  chevron: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m6 9 6 6 6-6" }),
  refresh: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M20 12a8 8 0 1 1-2.6-5.9" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M20 4v4h-4" })
  ] })
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
function Kpi({
  tone,
  icon,
  label,
  value,
  unit,
  detail,
  spark
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: `vx-ov-kpi vx-ov-tone-${tone}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-kpi-top", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: icon, size: 13 }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-kpi-mid", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-num", children: [
      value,
      unit !== void 0 && unit !== "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: unit }) : null
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-kpi-foot", children: detail }),
    spark !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Spark, { values: spark }) : null
  ] });
}
function SeverityChips({ counts }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-chips", children: SEVERITY_META.map((meta) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", style: { color: meta.tone }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: meta.tone } }),
    meta.label,
    " ",
    counts[meta.key]
  ] }, meta.key)) });
}
function StatusPill({ status }) {
  const tone = status === "running" ? "blue" : status === "paused" ? "amber" : status === "done" ? "green" : status === "failed" ? "red" : "muted";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `vx-ov-pill vx-ov-pill--${tone}`, children: status === "" ? "\u2014" : status });
}
function WorkerChip({ worker }) {
  const tone = worker === "planner" ? "violet" : worker === "mainagent" ? "blue" : "green";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `vx-ov-worker vx-ov-tone-${tone}`, children: worker === "" ? "agent" : worker });
}
function kindLabel(row) {
  if (row.kind === "tool_use") return row.tool !== void 0 && row.tool !== "" ? row.tool : "tool_use";
  return row.kind ?? "activity";
}
function derive(data, days) {
  const counts = { running: 0, paused: 0, done: 0, failed: 0 };
  for (const task of data.tasks) {
    const status = task.status ?? "";
    if (status === "running") counts.running += 1;
    else if (status === "paused") counts.paused += 1;
    else if (status === "done") counts.done += 1;
    else if (status === "failed") counts.failed += 1;
  }
  const assetRows = Object.entries(data.assets).filter(([, value]) => Number(value) > 0).map(([type, value]) => [type, Number(value)]).sort((left, right) => right[1] - left[1]).slice(0, 6);
  const totalAssets = Object.values(data.assets).reduce((sum, value) => sum + Number(value), 0);
  const trend = buildTrend(data.daily, days);
  const totals = trend.reduce(
    (acc, point) => ({ input: acc.input + point.input, output: acc.output + point.output, cache: acc.cache + point.cache }),
    { input: 0, output: 0, cache: 0 }
  );
  const hitRate = totals.input > 0 ? totals.cache / totals.input * 100 : 0;
  const buckets = /* @__PURE__ */ new Map();
  for (const exchange of data.traffic) {
    const status = Number(exchange.status ?? 0);
    if (status <= 0) continue;
    const bucket = Math.floor(status / 100) * 100;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  const codes = [...buckets.entries()].sort((left, right) => left[0] - right[0]).map(([code, count]) => ({ code, count }));
  const createdSeries = trend.map((point) => {
    const dayStart = Date.parse(`${point.day}T00:00:00Z`) / 1e3;
    const dayEnd = dayStart + 86400;
    return data.tasks.filter((task) => {
      const created = Number(task.created_unix ?? 0);
      return created >= dayStart && created < dayEnd;
    }).length;
  });
  const findings = [...data.findings].sort((left, right) => (Date.parse(right.ts ?? "") || 0) - (Date.parse(left.ts ?? "") || 0));
  const activity = [...data.activity].sort((left, right) => Number(right.seq ?? 0) - Number(left.seq ?? 0));
  return {
    tasks: data.tasks,
    counts,
    totalAssets,
    assetRows,
    sev: data.stats,
    trend,
    totals,
    hitRate,
    codes,
    createdSeries,
    findings,
    activity
  };
}
var RANGES = [
  { key: "7", days: 7, label: "7\u5929" },
  { key: "30", days: 30, label: "30\u5929" },
  { key: "90", days: 90, label: "90\u5929" }
];
function useStoredFlag(key, fallback) {
  const [value, setValue] = (0, import_react.useState)(() => {
    const raw = storeGet(key);
    return raw === "" ? fallback : raw === "1";
  });
  return [value, (next) => {
    setValue(next);
    storeSet(key, next ? "1" : "0");
  }];
}
function rangeLabel(key) {
  return RANGES.find((item) => item.key === key)?.label ?? key;
}
function HeroOverviewLayer({ hero, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-frame", "data-hero": hero ? "1" : "0", children: [
    hero ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OverviewCard, {}) : null,
    children
  ] });
}
function OverviewCard() {
  const [open, setOpen] = useStoredFlag("vexnar.overview.open", true);
  const [rangeKey, setRangeKey] = (0, import_react.useState)(() => {
    const raw = storeGet("vexnar.overview.range");
    return raw === "7" || raw === "30" || raw === "90" ? raw : "30";
  });
  const days = RANGES.find((item) => item.key === rangeKey)?.days ?? 30;
  const { data, error, reload } = useOverview(12e3);
  const view = (0, import_react.useMemo)(() => derive(data, days), [data, days]);
  const running = view.counts.running;
  const tokenSpark = view.trend.map((point) => point.input + point.output + point.cache);
  const topAsset = view.assetRows[0];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "vx-ov", "data-open": open ? "1" : "0", "data-variant": "dock", "aria-label": "\u6982\u89C8", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "vx-ov-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-brand", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-glyph", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "gauge", size: 14 }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u6982\u89C8" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-live", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}),
          "\u5B9E\u65F6"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-seg", role: "group", "aria-label": "\u7EDF\u8BA1\u8303\u56F4", children: RANGES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            "aria-pressed": rangeKey === item.key,
            onClick: () => {
              setRangeKey(item.key);
              storeSet("vexnar.overview.range", item.key);
            },
            children: item.label
          },
          item.key
        )) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-updated", children: error !== "" ? "\u6570\u636E\u4E0D\u53EF\u7528" : clockLabel(data.updated) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "vx-ov-icon",
            "aria-expanded": open,
            "aria-label": open ? "\u6536\u8D77\u6982\u89C8" : "\u5C55\u5F00\u6982\u89C8",
            title: open ? "\u6536\u8D77\u6982\u89C8" : "\u5C55\u5F00\u6982\u89C8",
            onClick: () => {
              setOpen(!open);
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "chevron", size: 14 })
          }
        )
      ] })
    ] }),
    !open ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-kpis", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Kpi,
          {
            tone: "blue",
            icon: "target",
            label: "\u6D3B\u8DC3\u4EFB\u52A1",
            value: String(running),
            unit: `/ ${view.tasks.length}`,
            spark: view.createdSeries,
            detail: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chips", children: [
              running > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", style: { color: "var(--vx-chart-1)" }, children: [
                "\u63A2\u7D22 ",
                running
              ] }) : null,
              view.counts.paused > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", style: { color: "var(--vx-chart-4)" }, children: [
                "\u6682\u505C ",
                view.counts.paused
              ] }) : null,
              view.counts.done > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", style: { color: "var(--vx-chart-3)" }, children: [
                "\u5B8C\u6210 ",
                view.counts.done
              ] }) : null,
              view.tasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-chip", children: "\u6682\u65E0\u4EFB\u52A1" }) : null
            ] })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Kpi,
          {
            tone: "red",
            icon: "bug",
            label: "\u786E\u8BA4\u53D1\u73B0",
            value: String(view.sev.total),
            detail: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SeverityChips, { counts: view.sev })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Kpi,
          {
            tone: "violet",
            icon: "network",
            label: "\u8D44\u4EA7\u8282\u70B9",
            value: String(view.totalAssets),
            detail: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-chips", children: topAsset !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", children: [
              ASSET_LABELS[topAsset[0]] ?? topAsset[0],
              " ",
              topAsset[1]
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-chip", children: "\u8DE8\u4EFB\u52A1\u5171\u4EAB" }) })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Kpi,
          {
            tone: "green",
            icon: "activity",
            label: "\u6D41\u91CF\u4EA4\u4E92",
            value: String(data.traffic.length),
            detail: data.capture ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", style: { color: "var(--vx-chart-3)" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: "var(--vx-chart-3)" } }),
              "\u5F55\u5236\u4E2D"
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-chip", children: "\u6355\u83B7\u672A\u5F00\u542F" })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Kpi,
          {
            tone: "amber",
            icon: "zap",
            label: `Token\uFF08${rangeLabel(rangeKey)}\uFF09`,
            value: fmtNum(view.totals.input + view.totals.output),
            spark: tokenSpark,
            detail: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chips", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", children: [
                "\u5165 ",
                fmtNum(view.totals.input)
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", children: [
                "\u51FA ",
                fmtNum(view.totals.output)
              ] })
            ] })
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-charts", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: "vx-ov-card vx-ov-card--trend", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-h", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "zap", size: 13 }),
            "\u6BCF\u65E5 Token \u6D88\u8017",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-legend", children: trendSeries.map((series) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: series.color } }),
              series.label
            ] }, series.key)) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendChart, { points: view.trend, height: 132 })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: "vx-ov-card vx-ov-card--dials", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-h", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "shield", size: 13 }),
            "\u8D28\u91CF\u4E0E\u98CE\u9669",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-sub", children: data.updated === 0 ? "\u52A0\u8F7D\u4E2D" : `\u8FD1 ${rangeLabel(rangeKey)}` })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-dials", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dial, { value: view.hitRate, size: 72, caption: "\u7F13\u5B58\u547D\u4E2D\u7387", sub: `${fmtNum(view.totals.cache)} / ${fmtNum(view.totals.input)}` }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SeverityDonut, { counts: view.sev, size: 72 })
          ] })
        ] })
      ] }),
      error !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-error", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u6982\u89C8\u6570\u636E\u4E0D\u53EF\u7528\uFF1A",
          error
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: reload, children: "\u91CD\u8BD5" })
      ] })
    ] })
  ] });
}
function OverviewPanel() {
  const [rangeKey, setRangeKey] = (0, import_react.useState)(() => {
    const raw = storeGet("vexnar.overview.range.page");
    return raw === "7" || raw === "30" || raw === "90" ? raw : "30";
  });
  const days = RANGES.find((item) => item.key === rangeKey)?.days ?? 30;
  const { data, error, reload } = useOverview(9e3);
  const view = (0, import_react.useMemo)(() => derive(data, days), [data, days]);
  const tokenSpark = view.trend.map((point) => point.input + point.output + point.cache);
  const recentTasks = [...view.tasks].sort((left, right) => Number(right.last_activity_unix ?? right.created_unix ?? 0) - Number(left.last_activity_unix ?? left.created_unix ?? 0)).slice(0, 6);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "vx-ov-page-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "\u6982\u89C8" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u7CFB\u7EDF\u5168\u5C40\u72B6\u6001 \xB7 \u5B9E\u65F6\u5237\u65B0" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-page-tools", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-seg", role: "group", "aria-label": "\u7EDF\u8BA1\u8303\u56F4", children: RANGES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            "aria-pressed": rangeKey === item.key,
            onClick: () => {
              setRangeKey(item.key);
              storeSet("vexnar.overview.range.page", item.key);
            },
            children: item.label
          },
          item.key
        )) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-updated", children: clockLabel(data.updated) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "vx-ov-icon", onClick: reload, title: "\u7ACB\u5373\u5237\u65B0", "aria-label": "\u7ACB\u5373\u5237\u65B0", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "refresh", size: 14 }) })
      ] })
    ] }),
    error !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-error", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        "\u6982\u89C8\u6570\u636E\u4E0D\u53EF\u7528\uFF1A",
        error
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: reload, children: "\u91CD\u8BD5" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-kpis vx-ov-kpis--page", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Kpi,
        {
          tone: "blue",
          icon: "target",
          label: "\u6D3B\u8DC3\u4EFB\u52A1",
          value: String(view.counts.running),
          unit: `/ ${view.tasks.length}`,
          spark: view.createdSeries,
          detail: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chips", children: [
            view.counts.paused > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", style: { color: "var(--vx-chart-4)" }, children: [
              "\u6682\u505C ",
              view.counts.paused
            ] }) : null,
            view.counts.done > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", style: { color: "var(--vx-chart-3)" }, children: [
              "\u5B8C\u6210 ",
              view.counts.done
            ] }) : null,
            view.counts.failed > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", style: { color: "var(--vx-chart-5)" }, children: [
              "\u5931\u8D25 ",
              view.counts.failed
            ] }) : null,
            view.tasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-chip", children: "\u6682\u65E0\u4EFB\u52A1" }) : null
          ] })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Kpi, { tone: "red", icon: "bug", label: "\u786E\u8BA4\u53D1\u73B0", value: String(view.sev.total), detail: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SeverityChips, { counts: view.sev }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Kpi,
        {
          tone: "violet",
          icon: "network",
          label: "\u8D44\u4EA7\u8282\u70B9",
          value: String(view.totalAssets),
          detail: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-chips", children: view.assetRows.slice(0, 2).map(([type, count]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", children: [
            ASSET_LABELS[type] ?? type,
            " ",
            count
          ] }, type)) })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Kpi,
        {
          tone: "green",
          icon: "activity",
          label: "\u6D41\u91CF\u4EA4\u4E92",
          value: String(data.traffic.length),
          detail: data.capture ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", style: { color: "var(--vx-chart-3)" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: "var(--vx-chart-3)" } }),
            "\u5F55\u5236\u4E2D"
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-chip", children: "\u6355\u83B7\u672A\u5F00\u542F" })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Kpi,
        {
          tone: "amber",
          icon: "zap",
          label: `Token\uFF08${rangeLabel(rangeKey)}\uFF09`,
          value: fmtNum(view.totals.input + view.totals.output),
          spark: tokenSpark,
          detail: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chips", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", children: [
              "\u5165 ",
              fmtNum(view.totals.input)
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", children: [
              "\u7F13\u5B58 ",
              fmtNum(view.totals.cache)
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-chip", children: [
              "\u51FA ",
              fmtNum(view.totals.output)
            ] })
          ] })
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "vx-ov-card vx-ov-card--wide", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-h", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "zap", size: 13 }),
        "LLM Token \u6D88\u8017",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-legend", children: trendSeries.map((series) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "vx-ov-dot", style: { background: series.color } }),
          series.label
        ] }, series.key)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-split", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-metrics", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-metric-total", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5408\u8BA1\uFF08\u8F93\u5165+\u8F93\u51FA\uFF09" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: fmtNum(view.totals.input + view.totals.output) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("em", { children: [
              view.tasks.length,
              " \u4E2A\u4EFB\u52A1 \xB7 ",
              rangeLabel(rangeKey)
            ] })
          ] }),
          [
            { label: "\u8F93\u5165\uFF08\u672A\u547D\u4E2D\uFF09", value: Math.max(view.totals.input - view.totals.cache, 0), tone: "var(--vx-chart-1)" },
            { label: "\u7F13\u5B58\u547D\u4E2D", value: view.totals.cache, tone: "var(--vx-chart-3)" },
            { label: "\u8F93\u51FA", value: view.totals.output, tone: "var(--vx-chart-2)" }
          ].map((item) => {
            const total = view.totals.input + view.totals.output;
            const pct = total > 0 ? item.value / total * 100 : 0;
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-meter", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-meter-top", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: item.label }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { style: { color: item.tone }, children: fmtNum(item.value) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-meter-track", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: { width: `${Math.max(pct, 1)}%`, background: item.tone } }) })
            ] }, item.label);
          }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-hitr", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u7F13\u5B58\u547D\u4E2D\u7387" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { children: [
              Math.round(view.hitRate),
              "%"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-chart-tall", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendChart, { points: view.trend, height: 228 }) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-two", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "vx-ov-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-h", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "activity", size: 13 }),
          "\u6D3B\u52A8\u6D41",
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-sub", children: [
            view.activity.length,
            " \u6761\u4E8B\u4EF6"
          ] })
        ] }),
        view.activity.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-empty", children: "\u6682\u65E0\u6D3B\u52A8\u8BB0\u5F55" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "vx-ov-feed", children: view.activity.slice(0, 6).map((row, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorkerChip, { worker: String(row.worker ?? "") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-feed-main", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: kindLabel(row) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: row.summary ?? "" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-feed-ts", children: fmtRel(row.ts) })
        ] }, String(row.seq ?? `activity-${index}`))) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "vx-ov-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-h", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "bug", size: 13 }),
          "\u53D1\u73B0",
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-sub", children: [
            "\u5171 ",
            view.sev.total,
            " \u6761"
          ] })
        ] }),
        view.findings.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-empty", children: "\u6682\u65E0\u53D1\u73B0" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "vx-ov-feed", children: view.findings.slice(0, 6).map((row, index) => {
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
        }) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "vx-ov-card vx-ov-card--table", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-h", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "clock", size: 13 }),
        "\u4EFB\u52A1",
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-sub", children: [
          view.tasks.length,
          " \u4E2A\u4EFB\u52A1"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vx-ov-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "vx-ov-table", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: ["\u4EFB\u52A1", "\u72B6\u6001", "\u5F15\u64CE", "\u76EE\u6807\u8FDB\u5EA6", "\u5728\u9014", "\u6700\u8FD1\u6D3B\u52A8"].map((title) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: title }, title)) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: recentTasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { colSpan: 6, className: "vx-ov-empty", children: "\u6682\u65E0\u4EFB\u52A1" }) }) : recentTasks.map((task, index) => {
          const total = Number(task.goals_total ?? 0);
          const met = Number(task.goals_met ?? 0);
          const pct = total > 0 ? met / total * 100 : null;
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: "vx-ov-td-task", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: task.description ?? task.name ?? "\u672A\u547D\u540D\u4EFB\u52A1" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: task.id ?? "" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusPill, { status: String(task.status ?? "") }) }),
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
      ] }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-three", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "vx-ov-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-h", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "network", size: 13 }),
          "\u8D44\u4EA7\u5206\u5E03",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vx-ov-sub", children: "\u6309\u7C7B\u578B" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AssetRows, { rows: view.assetRows, total: view.totalAssets })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "vx-ov-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-h", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "activity", size: 13 }),
          "\u6D41\u91CF\u72B6\u6001\u7801",
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vx-ov-sub", children: [
            "\u8FD1 ",
            data.traffic.length,
            " \u6B21"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusBars, { codes: view.codes })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "vx-ov-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vx-ov-h", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "shield", size: 13 }),
          "\u7CFB\u7EDF\u72B6\u6001"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", { className: "vx-ov-sys", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u6D41\u91CF\u6355\u83B7" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { "data-on": data.capture ? "1" : "0", children: data.capture ? "\u5F00\u542F" : "\u5173\u95ED" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "MCP" }),
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
          ] })
        ] })
      ] })
    ] })
  ] });
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
  return (0, import_react2.createElement)(
    "div",
    { className: "vx-card", "data-phase": "loading" },
    (0, import_react2.createElement)("span", { className: "vx-loading" }, label)
  );
}
function SeverityChip({ severity }) {
  return (0, import_react2.createElement)(
    "span",
    { className: `vx-chip vx-chip--sev vx-sev-${severity}` },
    (0, import_react2.createElement)("span", { className: "vx-dot", "aria-hidden": "true" }),
    SEVERITY_LABEL[severity]
  );
}
function FindingCard({ phase, block }) {
  if (phase !== "result") return (0, import_react2.createElement)(LoadingCard, { label: "\u8BB0\u5F55\u6F0F\u6D1E\u2026" });
  const text = textOf(block);
  const data = jsonOf(text) ?? {};
  const severity = severityOf(data.severity ?? data.Severity);
  const vulnclass = data.vulnclass ?? data.Vulnclass ?? data.category;
  const summary = data.summary ?? data.Summary;
  const findingId = data.finding_id ?? data.FindingID;
  const trafficCount = data.traffic_count ?? data.TrafficCount;
  const failed = block?.isError === true;
  return (0, import_react2.createElement)(
    "div",
    { className: "vx-card", "data-error": failed ? "1" : "0" },
    (0, import_react2.createElement)(
      "div",
      { className: "vx-head" },
      (0, import_react2.createElement)(SeverityChip, { severity }),
      vulnclass ? (0, import_react2.createElement)("span", { className: "vx-title" }, String(vulnclass)) : (0, import_react2.createElement)("span", { className: "vx-title" }, "\u6F0F\u6D1E\u8BB0\u5F55"),
      findingId !== void 0 ? (0, import_react2.createElement)("span", { className: "vx-meta vx-meta--faint" }, `#${String(findingId)}`) : null,
      trafficCount !== void 0 ? (0, import_react2.createElement)("span", { className: "vx-meta vx-spacer" }, `\u8BC1\u636E\u6D41\u91CF ${String(trafficCount)} \u6761`) : null
    ),
    summary ? (0, import_react2.createElement)("div", { className: "vx-pre vx-pre--tight" }, String(summary)) : (0, import_react2.createElement)("pre", { className: "vx-pre vx-pre--tight" }, text.slice(0, 800) || "(\u7A7A)"),
    failed ? (0, import_react2.createElement)("div", { className: "vx-failed" }, "\u4E0A\u62A5\u5931\u8D25\uFF0C\u89C1\u4E0A\u65B9\u8F93\u51FA") : null
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
  const [tab, setTab] = (0, import_react2.useState)("head");
  const [copied, setCopied] = (0, import_react2.useState)(false);
  (0, import_react2.useEffect)(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);
  if (phase !== "result") return (0, import_react2.createElement)(LoadingCard, { label: "\u8BFB\u53D6\u6D41\u91CF\u2026" });
  const text = textOf(block);
  const parts = splitHttp(text);
  const failed = block?.isError === true;
  const headline = headlineOf(parts.head);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => setCopied(true));
  };
  const tabButton = (id, label) => (0, import_react2.createElement)(
    "button",
    { type: "button", "aria-pressed": tab === id, onClick: () => setTab(id) },
    label
  );
  return (0, import_react2.createElement)(
    "div",
    { className: "vx-card", "data-error": failed ? "1" : "0" },
    (0, import_react2.createElement)(
      "div",
      { className: "vx-head" },
      (0, import_react2.createElement)("span", { className: "vx-title vx-title--mono" }, headline || "HTTP \u6D41\u91CF"),
      (0, import_react2.createElement)("span", { className: "vx-meta vx-meta--faint" }, formatBytes(text)),
      (0, import_react2.createElement)(
        "div",
        { className: "vx-seg vx-spacer", role: "group", "aria-label": "\u67E5\u770B\u5185\u5BB9" },
        tabButton("head", "\u5934"),
        tabButton("body", "\u6B63\u6587")
      ),
      (0, import_react2.createElement)(
        "button",
        { type: "button", className: "vx-chip vx-chip--action", onClick: copy },
        copied ? "\u5DF2\u590D\u5236" : "\u590D\u5236"
      )
    ),
    (0, import_react2.createElement)("pre", { className: "vx-pre" }, (tab === "head" ? parts.head : parts.body) || "(\u7A7A)"),
    failed ? (0, import_react2.createElement)("div", { className: "vx-failed" }, "\u8BFB\u53D6\u5931\u8D25\uFF0C\u89C1\u4E0A\u65B9\u8F93\u51FA") : null
  );
}
var VEXNAR_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAEAAElEQVR42uy9d5xdV3Uv/l37nHtnRs2WZcmSLNtyo1gGEuxQQyxB8hLAEPLITELqCy+RE3qHlMfMBAIGG2xMQrBDCWDaDCWQhOQX8iLx0mimWu69d9mWNOXes9f6/bHb2ueO3LBlj7QXn0HjKfeee+ecs9q3ACVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEiVKlChRokSJEvt/UHkLSpQocaCGKW9BiZL8S0FQokSJEiVKlKKgRIkSJcoEoESJUgiUKFGiRIkSJUpiL1GiRIkyAShRokSJEiVKlChRYrF1/mUiUKJEiRIlSpSioESJEiVQVgAlSpQoUaJEiRIlSpQoUaJEiRIlSpQoUaJEiRIlSpQogYIZKVGiRIkSJUqURF+iRIkSJcrNv0Q5N0qUKFGixGPxRlxu8CXKuVEChQZYosRjN6S8BSVKsi9RokSJEj/JTbvc7Evc1zlRzo8SJUqUKF1ZeS3lnCtRAmUFUKJEucmXQFk1lShRokSJEiVKlOK5HHuJEiVKlCjxwJMRLaLER/tBwi0FAMoKoESJEiVKPHJJlMp657EdVXkLSpQoUWK/70wfze5fSudfCoASJcqFX6LE4kv8e3ssWgTXG5V7wt6jLm9BiRIlSuy3yV/28jn2Mha/r45d1O/SIkmqUpI/CgagBAqlq0SJA+/8pIfxedvFgTzAx300Ey4tgmNEWQGUKFGiRIlHIyk+FCYCPcBd/2JYB5SpQIkSJUqUOKCohwuN8x9OWuIDxQyUKFGi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";
function BrandMark({ size }) {
  const px = Math.round((size ?? 24) * 1.35);
  return (0, import_react2.createElement)("img", {
    src: VEXNAR_LOGO,
    width: px,
    height: px,
    alt: "VEXNAR",
    className: "vx-mark",
    style: { borderRadius: 4 }
  });
}
function BrandName() {
  return (0, import_react2.createElement)("span", { className: "vx-brand-name" }, "VEXNAR");
}
function HeroLogo({ size }) {
  const px = Math.round((size ?? 34) * 1.55);
  return (0, import_react2.createElement)("img", {
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
  return (0, import_react2.createElement)(
    "svg",
    { width: size ?? 16, height: size ?? 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
    (0, import_react2.createElement)("path", { d: "M12 3 3 7l9 4 9-4-9-4Z" }),
    (0, import_react2.createElement)("path", { d: "m3 12 9 4 9-4" }),
    (0, import_react2.createElement)("path", { d: "m3 17 9 4 9-4" })
  );
}
function OverviewIcon({ size }) {
  return (0, import_react2.createElement)(
    "svg",
    { width: size ?? 16, height: size ?? 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
    (0, import_react2.createElement)("path", { d: "M5.5 19a8.5 8.5 0 1 1 13 0" }),
    (0, import_react2.createElement)("path", { d: "M12 14 16 9" }),
    (0, import_react2.createElement)("circle", { cx: 12, cy: 14, r: 1.4 })
  );
}
async function callApi(path, method = "GET", body2) {
  const base = (localStorage.getItem("vexnar.coreUrl") || "/vexnar-api").replace(/\/$/, "");
  const token = localStorage.getItem("vexnar.coreToken") || "";
  const response = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...token ? { "x-vexnar-token": token } : {} },
    body: body2 === void 0 ? void 0 : JSON.stringify(body2)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 160)}`);
  return response.json();
}
function useApi(path, deps = []) {
  const [state, setState] = (0, import_react2.useState)({ data: null, error: "", loading: true });
  (0, import_react2.useEffect)(() => {
    let alive = true;
    const base = (localStorage.getItem("vexnar.coreUrl") || "/vexnar-api").replace(/\/$/, "");
    const token = localStorage.getItem("vexnar.coreToken") || "";
    fetch(base + path, { headers: token ? { "x-vexnar-token": token } : {} }).then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))).then((data) => {
      if (alive) setState({ data, error: "", loading: false });
    }).catch((error) => {
      if (alive) setState({ data: null, error: String(error?.message ?? error), loading: false });
    });
    return () => {
      alive = false;
    };
  }, deps);
  return state;
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
  return (0, import_react2.createElement)(
    "div",
    null,
    (0, import_react2.createElement)(
      "div",
      { style: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginBottom: 20 } },
      cards.map(([label, value]) => (0, import_react2.createElement)(
        "div",
        { key: String(label), style: { border: "1px solid var(--vx-border, #e5e7eb)", borderRadius: 12, padding: 16 } },
        (0, import_react2.createElement)("div", { style: { fontSize: 12, color: "var(--vx-muted, #6b7280)" } }, String(label)),
        (0, import_react2.createElement)("div", { style: { fontSize: 24, fontWeight: 600 } }, String(value))
      ))
    ),
    (0, import_react2.createElement)("div", { style: { fontSize: 12, color: "var(--vx-muted, #6b7280)" } }, tasks.error || findings.error || assets.error || tokens.error || "\u6570\u636E\u6765\u81EA vexnar-core")
  );
}
function TaskList({ onSelect }) {
  const { data, error, loading } = useApi("/api/tasks");
  if (loading) return (0, import_react2.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (error) return (0, import_react2.createElement)("div", { style: { color: "#dc2626" } }, error);
  const rows = (data?.tasks ?? []).slice(0, 30);
  return (0, import_react2.createElement)(
    "table",
    { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 } },
    (0, import_react2.createElement)("thead", null, (0, import_react2.createElement)("tr", null, ["ID", "\u540D\u79F0", "\u72B6\u6001", "\u76EE\u6807"].map((title) => (0, import_react2.createElement)("th", { key: title, style: { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--vx-border, #e5e7eb)" } }, title)))),
    (0, import_react2.createElement)("tbody", null, rows.map((task) => (0, import_react2.createElement)(
      "tr",
      { key: task.id, onClick: () => onSelect?.(String(task.id)), style: { cursor: onSelect ? "pointer" : "default" } },
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, task.id),
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, task.name || "\u2014"),
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, task.status),
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, task.goal)
    )))
  );
}
function TaskDetail({ id, onBack }) {
  const task = useApi(`/api/tasks/${id}`);
  const goals = useApi(`/api/tasks/${id}/goals`);
  const intents = useApi(`/api/exploration/intents?task=${id}&limit=20`);
  const coverage = useApi(`/api/tasks/${id}/coverage`);
  const nodes = useApi(`/api/exploration/nodes?task=${id}&size=20`);
  const [tick, setTick] = (0, import_react2.useState)(0);
  const act = async (action) => {
    try {
      if (action === "archive") await callApi(`/api/tasks/${id}/archive`, "POST");
      else await callApi(`/api/tasks/${id}/control`, "POST", { action });
      setTick(tick + 1);
    } catch (error) {
      window.alert(String(error?.message ?? error));
    }
  };
  const row = task.data ?? {};
  const section = (title, children) => (0, import_react2.createElement)(
    "div",
    { style: { marginBottom: 18 } },
    (0, import_react2.createElement)("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 6 } }, title),
    children
  );
  if (task.loading) return (0, import_react2.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (task.error) return (0, import_react2.createElement)("div", { style: { color: "#dc2626" } }, task.error);
  const bindings = traffic.data?.bindings ?? [];
  const bodyBlock = body.title ? (0, import_react2.createElement)(
    "div",
    null,
    (0, import_react2.createElement)("div", { style: { fontSize: 12, margin: "8px 0 4px", color: "var(--vx-muted, #6b7280)" } }, body.title),
    body.error ? (0, import_react2.createElement)("div", { style: { color: "#dc2626", fontSize: 12 } }, body.error) : (0, import_react2.createElement)("pre", { style: { fontSize: 12, whiteSpace: "pre-wrap", background: "var(--vx-code, #f8fafc)", padding: 10, borderRadius: 8, maxHeight: 280, overflow: "auto" } }, body.text)
  ) : null;
  return (0, import_react2.createElement)(
    "div",
    null,
    (0, import_react2.createElement)(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } },
      (0, import_react2.createElement)("button", { type: "button", onClick: onBack, style: { border: "1px solid var(--vx-border, #e5e7eb)", background: "transparent", borderRadius: 8, padding: "3px 10px", cursor: "pointer" } }, "\u2190 \u8FD4\u56DE"),
      (0, import_react2.createElement)("span", { style: { fontSize: 18, fontWeight: 600 } }, `${row.finding_id} \xB7 ${row.vulnclass ?? ""}`),
      (0, import_react2.createElement)("span", { style: { fontSize: 12, color: "var(--vx-muted, #6b7280)" } }, `${row.severity} / ${row.status}`)
    ),
    (0, import_react2.createElement)("div", { style: { fontSize: 13, marginBottom: 10 } }, row.summary),
    (0, import_react2.createElement)("pre", { style: { fontSize: 12, whiteSpace: "pre-wrap", background: "var(--vx-code, #f8fafc)", padding: 10, borderRadius: 8, maxHeight: 220, overflow: "auto" } }, row.evidence || ""),
    (0, import_react2.createElement)("div", { style: { fontSize: 13, fontWeight: 600, margin: "14px 0 6px" } }, `\u6D41\u91CF\u7ED1\u5B9A\uFF08${bindings.length}\uFF09`),
    ...bindings.map((binding) => (0, import_react2.createElement)(
      "div",
      { key: binding.id, style: { border: "1px solid var(--vx-border, #e5e7eb)", borderRadius: 8, padding: 8, marginBottom: 8, fontSize: 12 } },
      (0, import_react2.createElement)("div", null, `#${binding.id} \xB7 ${binding.snapshot?.method ?? ""} ${binding.snapshot?.url ?? ""} \xB7 ${binding.role}`),
      (0, import_react2.createElement)(
        "div",
        { style: { marginTop: 6, display: "flex", gap: 8 } },
        (0, import_react2.createElement)("button", { type: "button", onClick: () => loadBody(String(binding.id), "response"), style: { cursor: "pointer" } }, "\u54CD\u5E94\u6B63\u6587"),
        (0, import_react2.createElement)("button", { type: "button", onClick: () => loadBody(String(binding.id), "request"), style: { cursor: "pointer" } }, "\u8BF7\u6C42\u6B63\u6587")
      )
    )),
    bodyBlock
  );
}
function AgentsPage() {
  const { data, error, loading } = useApi("/api/agents");
  const [version, setVersion] = (0, import_react2.useState)(0);
  if (loading) return (0, import_react2.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (error) return (0, import_react2.createElement)("div", { style: { color: "#dc2626" } }, error);
  const rows = data?.agents ?? [];
  const edit = async (agent) => {
    const name = window.prompt("Agent \u540D\u79F0", agent.name);
    if (name == null) return;
    const description = window.prompt("\u63CF\u8FF0", agent.description ?? "");
    if (description == null) return;
    try {
      await callApi(`/api/agents/${agent.key}`, "PATCH", { name, description });
      setVersion(version + 1);
    } catch (e) {
      window.alert(String(e?.message ?? e));
    }
  };
  return (0, import_react2.createElement)("div", { key: version }, (0, import_react2.createElement)(
    "table",
    { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 } },
    (0, import_react2.createElement)("thead", null, (0, import_react2.createElement)("tr", null, ["Key", "\u540D\u79F0", "\u89D2\u8272", "\u542F\u7528", ""].map((t) => (0, import_react2.createElement)("th", { key: t, style: { textAlign: "left", padding: "6px 8px" } }, t)))),
    (0, import_react2.createElement)("tbody", null, rows.map((agent) => (0, import_react2.createElement)(
      "tr",
      { key: agent.key },
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, agent.key),
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, agent.name),
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, agent.role),
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, agent.enabled ? "\u662F" : "\u5426"),
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, (0, import_react2.createElement)("button", { type: "button", onClick: () => edit(agent), style: { cursor: "pointer" } }, "\u7F16\u8F91"))
    )))
  ));
}
function McpPage() {
  const { data, error, loading } = useApi("/api/mcp");
  const [version, setVersion] = (0, import_react2.useState)(0);
  if (loading) return (0, import_react2.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (error) return (0, import_react2.createElement)("div", { style: { color: "#dc2626" } }, error);
  const rows = data?.servers ?? [];
  const toggle = async (row) => {
    try {
      await callApi(`/api/mcp/${row.id}/enabled`, "PUT", { enabled: !row.enabled });
      setVersion(version + 1);
    } catch (e) {
      window.alert(String(e?.message ?? e));
    }
  };
  const remove = async (row) => {
    if (!window.confirm(`\u5220\u9664 ${row.name}?`)) return;
    try {
      await callApi(`/api/mcp/${row.id}`, "DELETE");
      setVersion(version + 1);
    } catch (e) {
      window.alert(String(e?.message ?? e));
    }
  };
  return (0, import_react2.createElement)("div", { key: version }, (0, import_react2.createElement)(
    "table",
    { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 } },
    (0, import_react2.createElement)("thead", null, (0, import_react2.createElement)("tr", null, ["ID", "\u540D\u79F0", "\u4F20\u8F93", "\u542F\u7528", ""].map((t) => (0, import_react2.createElement)("th", { key: t, style: { textAlign: "left", padding: "6px 8px" } }, t)))),
    (0, import_react2.createElement)("tbody", null, rows.map((row) => (0, import_react2.createElement)(
      "tr",
      { key: row.id },
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.id),
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.name),
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.transport),
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.enabled ? "\u662F" : "\u5426"),
      (0, import_react2.createElement)(
        "td",
        { style: { padding: "6px 8px", display: "flex", gap: 8 } },
        (0, import_react2.createElement)("button", { type: "button", onClick: () => toggle(row), style: { cursor: "pointer" } }, row.enabled ? "\u505C\u7528" : "\u542F\u7528"),
        (0, import_react2.createElement)("button", { type: "button", onClick: () => remove(row), style: { cursor: "pointer" } }, "\u5220\u9664")
      )
    )))
  ));
}
function ToolsPage() {
  const { data, error, loading } = useApi("/api/tools");
  const [version, setVersion] = (0, import_react2.useState)(0);
  if (loading) return (0, import_react2.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (error) return (0, import_react2.createElement)("div", { style: { color: "#dc2626" } }, error);
  const rows = data?.tools ?? [];
  const toggle = async (row) => {
    try {
      await callApi(`/api/tools/${row.key}`, "PUT", { enabled: !row.enabled });
      setVersion(version + 1);
    } catch (e) {
      window.alert(String(e?.message ?? e));
    }
  };
  return (0, import_react2.createElement)("div", { key: version }, (0, import_react2.createElement)(
    "table",
    { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 } },
    (0, import_react2.createElement)("thead", null, (0, import_react2.createElement)("tr", null, ["Key", "\u7C7B\u578B", "\u542F\u7528", "\u8C03\u7528", ""].map((t) => (0, import_react2.createElement)("th", { key: t, style: { textAlign: "left", padding: "6px 8px" } }, t)))),
    (0, import_react2.createElement)("tbody", null, rows.map((row) => (0, import_react2.createElement)(
      "tr",
      { key: row.key },
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.key),
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.kind),
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.enabled ? "\u662F" : "\u5426"),
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.calls ?? 0),
      (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, (0, import_react2.createElement)("button", { type: "button", onClick: () => toggle(row), style: { cursor: "pointer" } }, row.enabled ? "\u505C\u7528" : "\u542F\u7528"))
    )))
  ));
}
function NotifyPage() {
  const { data, error, loading } = useApi("/api/notify/channels");
  const [version, setVersion] = (0, import_react2.useState)(0);
  if (loading) return (0, import_react2.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (error) return (0, import_react2.createElement)("div", { style: { color: "#dc2626" } }, error);
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
  return (0, import_react2.createElement)(
    "div",
    { key: version },
    (0, import_react2.createElement)("button", { type: "button", onClick: add, style: { marginBottom: 10, cursor: "pointer" } }, "+ \u65B0\u589E\u6E20\u9053"),
    (0, import_react2.createElement)(
      "table",
      { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 } },
      (0, import_react2.createElement)("thead", null, (0, import_react2.createElement)("tr", null, ["ID", "\u540D\u79F0", "\u7C7B\u578B", "\u542F\u7528", ""].map((t) => (0, import_react2.createElement)("th", { key: t, style: { textAlign: "left", padding: "6px 8px" } }, t)))),
      (0, import_react2.createElement)("tbody", null, rows.map((row) => (0, import_react2.createElement)(
        "tr",
        { key: row.id },
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.id),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.name),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.kind),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.enabled ? "\u662F" : "\u5426"),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, (0, import_react2.createElement)("button", { type: "button", onClick: () => remove(row), style: { cursor: "pointer" } }, "\u5220\u9664"))
      )))
    )
  );
}
function ToolRunPage() {
  const [name, setName] = (0, import_react2.useState)("nmap");
  const [target, setTarget] = (0, import_react2.useState)("");
  const [taskId, setTaskId] = (0, import_react2.useState)("");
  const [findingId, setFindingId] = (0, import_react2.useState)("");
  const [output, setOutput] = (0, import_react2.useState)("");
  const run = async () => {
    setOutput("\u6267\u884C\u4E2D\u2026");
    try {
      const data = await callApi("/api/engine/tools/run", "POST", { name, target, task_id: taskId || void 0 });
      setOutput([`code=${data.code} truncated=${data.truncated}`, data.parsed ? JSON.stringify(data.parsed, null, 2) : "", data.stdout, data.stderr].filter(Boolean).join("\n"));
    } catch (error) {
      setOutput(String(error?.message ?? error));
    }
  };
  return (0, import_react2.createElement)(
    "div",
    { style: { fontSize: 13 } },
    (0, import_react2.createElement)(
      "div",
      { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 } },
      (0, import_react2.createElement)("select", { value: name, onChange: (event) => setName(event.target.value) }, ["nmap", "httpx", "ffuf", "sqlmap"].map((item) => (0, import_react2.createElement)("option", { key: item, value: item }, item))),
      (0, import_react2.createElement)("input", { placeholder: "target\uFF08\u57DF\u540D / URL / IP\uFF09", value: target, onChange: (event) => setTarget(event.target.value), style: { minWidth: 260 } }),
      (0, import_react2.createElement)("input", { placeholder: "task_id\uFF08\u53EF\u9009\uFF0C\u7528\u4E8E\u843D\u5E93\uFF09", value: taskId, onChange: (event) => setTaskId(event.target.value) }),
      (0, import_react2.createElement)("button", { type: "button", onClick: run, style: { cursor: "pointer" } }, "\u6267\u884C")
    ),
    (0, import_react2.createElement)("pre", { style: { fontSize: 12, whiteSpace: "pre-wrap", background: "var(--vx-code, #f8fafc)", padding: 10, borderRadius: 8, minHeight: 120, maxHeight: 420, overflow: "auto" } }, output)
  );
}
function TrafficExchange({ id, onBack }) {
  const { data, error, loading } = useApi(`/api/traffic/exchange?id=${encodeURIComponent(id)}`);
  if (loading) return (0, import_react2.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (error) return (0, import_react2.createElement)("div", { style: { color: "#dc2626" } }, error);
  return (0, import_react2.createElement)(
    "div",
    null,
    (0, import_react2.createElement)("button", { type: "button", onClick: onBack, style: { marginBottom: 10, cursor: "pointer" } }, "\u2190 \u8FD4\u56DE\u6D41\u91CF\u5217\u8868"),
    (0, import_react2.createElement)("pre", { style: { fontSize: 12, whiteSpace: "pre-wrap", background: "var(--vx-code, #f8fafc)", padding: 10, borderRadius: 8, maxHeight: 640, overflow: "auto" } }, JSON.stringify(data, null, 2))
  );
}
function TrafficPage() {
  const [host, setHost] = (0, import_react2.useState)("");
  const [method, setMethod] = (0, import_react2.useState)("");
  const [q, setQ] = (0, import_react2.useState)("");
  const params = new URLSearchParams({ page: "1", size: "50" });
  if (host) params.set("host", host);
  if (method) params.set("method", method);
  if (q) params.set("q", q);
  const { data, error, loading } = useApi(`/api/traffic?${params.toString()}`, [host, method, q]);
  const [exchangeId, setExchangeId] = (0, import_react2.useState)("");
  if (loading) return (0, import_react2.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (error) return (0, import_react2.createElement)("div", { style: { color: "#dc2626", fontSize: 12 } }, `${error}\uFF08\u9700\u8981\u4EE5 VEXNAR_GO_FALLBACK \u542F\u52A8 core \u624D\u80FD\u4EE3\u7406 Go \u6D41\u91CF\u63A5\u53E3\uFF09`);
  const rows = data?.items ?? data?.exchanges ?? [];
  if (exchangeId) return (0, import_react2.createElement)(TrafficExchange, { id: exchangeId, onBack: () => setExchangeId("") });
  return (0, import_react2.createElement)(
    "div",
    { style: { fontSize: 13 } },
    (0, import_react2.createElement)(
      "div",
      { style: { display: "flex", gap: 8, marginBottom: 10 } },
      (0, import_react2.createElement)("input", { placeholder: "host", value: host, onChange: (event) => setHost(event.target.value.trim()) }),
      (0, import_react2.createElement)(
        "select",
        { value: method, onChange: (event) => setMethod(event.target.value) },
        ["", "GET", "POST", "PUT", "DELETE", "PATCH"].map((item) => (0, import_react2.createElement)("option", { key: item || "all", value: item }, item || "\u5168\u90E8\u65B9\u6CD5"))
      ),
      (0, import_react2.createElement)("input", { placeholder: "URL \u5173\u952E\u5B57", value: q, onChange: (event) => setQ(event.target.value.trim()) })
    ),
    (0, import_react2.createElement)("div", { style: { color: "var(--vx-muted, #6b7280)", marginBottom: 8 } }, `\u5171 ${data?.count ?? data?.total ?? rows.length} \u6761\u6293\u5305`),
    (0, import_react2.createElement)(
      "table",
      { style: { width: "100%", borderCollapse: "collapse" } },
      (0, import_react2.createElement)("thead", null, (0, import_react2.createElement)("tr", null, ["\u65F6\u95F4", "\u65B9\u6CD5", "URL", "\u72B6\u6001", "\u6765\u6E90"].map((t) => (0, import_react2.createElement)("th", { key: t, style: { textAlign: "left", padding: "6px 8px" } }, t)))),
      (0, import_react2.createElement)("tbody", null, rows.slice(0, 50).map((row, index) => (0, import_react2.createElement)(
        "tr",
        { key: row.id ?? index, onClick: () => row.id && setExchangeId(String(row.id)), style: { cursor: row.id ? "pointer" : "default" } },
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, String(row.ts ?? row.time ?? "")),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.method ?? ""),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px", maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, row.url ?? row.host ?? ""),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, String(row.status ?? row.status_code ?? "")),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.source ?? row.client ?? "")
      )))
    )
  );
}
function InterceptPage() {
  const { data, error, loading } = useApi("/api/intercept/rules");
  const [version, setVersion] = (0, import_react2.useState)(0);
  const [form, setForm] = (0, import_react2.useState)({ id: 0, name: "", enabled: true, priority: 100, match_target: "tool_input", match_type: "string", pattern: "", action: "deny" });
  if (loading) return (0, import_react2.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (error) return (0, import_react2.createElement)("div", { style: { color: "#dc2626", fontSize: 12 } }, `${error}\uFF08\u9700\u8981 VEXNAR_GO_FALLBACK \u4EE3\u7406 Go \u62E6\u622A\u89C4\u5219\uFF09`);
  const rows = data?.rules ?? [];
  const submit = async () => {
    try {
      const body2 = { ...form, id: void 0 };
      if (form.id) await callApi(`/api/intercept/rules/${form.id}`, "PUT", body2);
      else await callApi("/api/intercept/rules", "POST", body2);
      setForm({ id: 0, name: "", enabled: true, priority: 100, match_target: "tool_input", match_type: "string", pattern: "", action: "deny" });
      setVersion(version + 1);
    } catch (e) {
      window.alert(String(e?.message ?? e));
    }
  };
  const remove = async (row) => {
    if (!window.confirm(`\u5220\u9664\u89C4\u5219 #${row.id}?`)) return;
    try {
      await callApi(`/api/intercept/rules/${row.id}`, "DELETE");
      setVersion(version + 1);
    } catch (e) {
      window.alert(String(e?.message ?? e));
    }
  };
  const field = (key, placeholder, width = 140) => (0, import_react2.createElement)("input", { value: form[key] ?? "", placeholder, onChange: (event) => setForm({ ...form, [key]: event.target.value }), style: { width } });
  return (0, import_react2.createElement)(
    "div",
    { key: version, fontSize: 13 },
    (0, import_react2.createElement)(
      "div",
      { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" } },
      field("name", "\u89C4\u5219\u540D"),
      (0, import_react2.createElement)("select", { value: form.match_target, onChange: (event) => setForm({ ...form, match_target: event.target.value }) }, ["tool_input", "tool_name"].map((v) => (0, import_react2.createElement)("option", { key: v, value: v }, v))),
      (0, import_react2.createElement)("select", { value: form.match_type, onChange: (event) => setForm({ ...form, match_type: event.target.value }) }, ["string", "regex"].map((v) => (0, import_react2.createElement)("option", { key: v, value: v }, v))),
      field("pattern", "\u5339\u914D\u5185\u5BB9", 240),
      (0, import_react2.createElement)("select", { value: form.action, onChange: (event) => setForm({ ...form, action: event.target.value }) }, ["allow", "deny", "ask"].map((v) => (0, import_react2.createElement)("option", { key: v, value: v }, v))),
      (0, import_react2.createElement)("button", { type: "button", onClick: submit, style: { cursor: "pointer" } }, form.id ? "\u4FDD\u5B58" : "\u65B0\u589E"),
      form.id ? (0, import_react2.createElement)("button", { type: "button", onClick: () => setForm({ id: 0, name: "", enabled: true, priority: 100, match_target: "tool_input", match_type: "string", pattern: "", action: "deny" }), style: { cursor: "pointer" } }, "\u53D6\u6D88") : null
    ),
    (0, import_react2.createElement)("div", { style: { color: "var(--vx-muted, #6b7280)", marginBottom: 8 } }, `\u5171 ${data?.count ?? rows.length} \u6761\u89C4\u5219`),
    (0, import_react2.createElement)(
      "table",
      { style: { width: "100%", borderCollapse: "collapse" } },
      (0, import_react2.createElement)("thead", null, (0, import_react2.createElement)("tr", null, ["ID", "\u540D\u79F0", "\u5339\u914D", "\u52A8\u4F5C", "\u542F\u7528", ""].map((t) => (0, import_react2.createElement)("th", { key: t, style: { textAlign: "left", padding: "6px 8px" } }, t)))),
      (0, import_react2.createElement)("tbody", null, rows.map((row) => (0, import_react2.createElement)(
        "tr",
        { key: row.id },
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.id),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.name),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, `${row.match_target}:${row.match_type}:${row.pattern ?? ""}`),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.action),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.enabled ? "\u662F" : "\u5426"),
        (0, import_react2.createElement)(
          "td",
          { style: { padding: "6px 8px", display: "flex", gap: 8 } },
          (0, import_react2.createElement)("button", { type: "button", onClick: () => setForm({ ...row }), style: { cursor: "pointer" } }, "\u7F16\u8F91"),
          (0, import_react2.createElement)("button", { type: "button", onClick: () => remove(row), style: { cursor: "pointer" } }, "\u5220\u9664")
        )
      )))
    )
  );
}
function ApprovalsPage() {
  const { data, error, loading } = useApi("/api/intercept/pending");
  const [version, setVersion] = (0, import_react2.useState)(0);
  if (loading) return (0, import_react2.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (error) return (0, import_react2.createElement)("div", { style: { color: "#dc2626", fontSize: 12 } }, `${error}\uFF08\u9700\u8981 VEXNAR_GO_FALLBACK \u4EE3\u7406 Go \u62E6\u622A\u63A5\u53E3\uFF09`);
  const rows = data?.pending ?? [];
  const decide = async (row, decision) => {
    try {
      await callApi(`/api/intercept/pending/${row.id}/decide`, "POST", { decision });
      setVersion(version + 1);
    } catch (e) {
      window.alert(String(e?.message ?? e));
    }
  };
  return (0, import_react2.createElement)(
    "div",
    { key: version, fontSize: 13 },
    (0, import_react2.createElement)("div", { style: { color: "var(--vx-muted, #6b7280)", marginBottom: 8 } }, `\u5F85\u5904\u7406 ${rows.length} \u6761`),
    rows.length === 0 ? (0, import_react2.createElement)("div", { style: { border: "1px dashed var(--vx-border, #e5e7eb)", borderRadius: 12, padding: 20, color: "var(--vx-muted, #6b7280)" } }, "\u5F53\u524D\u6CA1\u6709\u5F85\u5BA1\u6279\u7684\u5DE5\u5177\u8C03\u7528\u3002") : (0, import_react2.createElement)(
      "table",
      { style: { width: "100%", borderCollapse: "collapse" } },
      (0, import_react2.createElement)("thead", null, (0, import_react2.createElement)("tr", null, ["ID", "\u4EFB\u52A1", "Agent", "\u5DE5\u5177", "\u72B6\u6001", "\u539F\u56E0", ""].map((t) => (0, import_react2.createElement)("th", { key: t, style: { textAlign: "left", padding: "6px 8px" } }, t)))),
      (0, import_react2.createElement)("tbody", null, rows.map((row) => (0, import_react2.createElement)(
        "tr",
        { key: row.id },
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.id),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.task_id ?? ""),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.agent_name ?? ""),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.tool_name ?? ""),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.status),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, row.reason ?? ""),
        (0, import_react2.createElement)(
          "td",
          { style: { padding: "6px 8px", display: "flex", gap: 8 } },
          row.status === "pending" ? (0, import_react2.createElement)("button", { type: "button", onClick: () => decide(row, "allowed"), style: { cursor: "pointer" } }, "\u5141\u8BB8") : null,
          row.status === "pending" ? (0, import_react2.createElement)("button", { type: "button", onClick: () => decide(row, "denied"), style: { cursor: "pointer" } }, "\u62D2\u7EDD") : null
        )
      )))
    )
  );
}
function AssetSyncSettings() {
  const [text, setText] = (0, import_react2.useState)('{"assets":[{"type":"root_domain","domain":"example.com"}]}');
  const [result, setResult] = (0, import_react2.useState)("");
  const submit = async () => {
    setResult("\u5BFC\u5165\u4E2D\u2026");
    try {
      const parsed = JSON.parse(text);
      const assets = Array.isArray(parsed) ? parsed : parsed.assets;
      const data = await callApi("/api/assets/import", "POST", { assets });
      setResult(`requested=${data.requested} created=${data.created} existing=${data.existing}`);
    } catch (error) {
      setResult(String(error?.message ?? error));
    }
  };
  return (0, import_react2.createElement)(
    PanelShell,
    { title: "\u8D44\u4EA7\u540C\u6B65", desc: "\u4ECE JSON \u5BFC\u5165\u8D44\u4EA7\uFF08\u57DF\u540D/IP/URL\uFF09\uFF0C\u6309\u7C7B\u578B\u4E0E\u6807\u8BC6\u53BB\u91CD" },
    (0, import_react2.createElement)("textarea", { value: text, onChange: (event) => setText(event.target.value), rows: 10, style: { width: "100%", fontFamily: "monospace", fontSize: 12 } }),
    (0, import_react2.createElement)(
      "div",
      { style: { display: "flex", gap: 8, marginTop: 8 } },
      (0, import_react2.createElement)("button", { type: "button", onClick: submit, style: { cursor: "pointer" } }, "\u5BFC\u5165"),
      (0, import_react2.createElement)("span", { style: { fontSize: 12, color: "var(--vx-muted, #6b7280)" } }, result)
    )
  );
}
function LogsPanel() {
  const tasks = useApi("/api/tasks");
  const [taskId, setTaskId] = (0, import_react2.useState)("");
  const [session, setSession] = (0, import_react2.useState)("plan");
  const [rows, setRows] = (0, import_react2.useState)([]);
  const [error, setError] = (0, import_react2.useState)("");
  const load = async (id, sess) => {
    setError("");
    try {
      const data = await callApi(`/api/exploration/activity/history?task=${id}&session=${sess}&limit=100`);
      setRows(data.items ?? []);
    } catch (e) {
      setError(String(e?.message ?? e));
      setRows([]);
    }
  };
  (0, import_react2.useEffect)(() => {
    if (!taskId && tasks.data?.tasks?.[0]) {
      const id = String(tasks.data.tasks[0].id);
      setTaskId(id);
      void load(id, session);
    }
  }, [tasks.data]);
  return (0, import_react2.createElement)(
    PanelShell,
    { title: "\u65E5\u5FD7", desc: "\u4EFB\u52A1\u6D3B\u52A8\u6D41\uFF08planner / main / intent\uFF09" },
    (0, import_react2.createElement)(
      "div",
      { style: { display: "flex", gap: 8, marginBottom: 10 } },
      (0, import_react2.createElement)(
        "select",
        { value: taskId, onChange: (event) => {
          setTaskId(event.target.value);
          void load(event.target.value, session);
        } },
        (tasks.data?.tasks ?? []).slice(0, 50).map((task) => (0, import_react2.createElement)("option", { key: task.id, value: task.id }, `${task.id} \xB7 ${task.name || "\u672A\u547D\u540D"}`))
      ),
      (0, import_react2.createElement)(
        "select",
        { value: session, onChange: (event) => {
          setSession(event.target.value);
          if (taskId) void load(taskId, event.target.value);
        } },
        ["plan", "main"].map((item) => (0, import_react2.createElement)("option", { key: item, value: item }, item))
      ),
      (0, import_react2.createElement)("button", { type: "button", onClick: () => taskId && load(taskId, session), style: { cursor: "pointer" } }, "\u5237\u65B0")
    ),
    error ? (0, import_react2.createElement)("div", { style: { color: "#dc2626", fontSize: 12 } }, error) : null,
    (0, import_react2.createElement)(
      "table",
      { style: { width: "100%", borderCollapse: "collapse", fontSize: 12 } },
      (0, import_react2.createElement)("thead", null, (0, import_react2.createElement)("tr", null, ["seq", "ts", "worker", "kind", "summary"].map((t) => (0, import_react2.createElement)("th", { key: t, style: { textAlign: "left", padding: "4px 6px" } }, t)))),
      (0, import_react2.createElement)("tbody", null, rows.slice().reverse().map((row) => (0, import_react2.createElement)(
        "tr",
        { key: row.seq },
        (0, import_react2.createElement)("td", { style: { padding: "4px 6px" } }, row.seq),
        (0, import_react2.createElement)("td", { style: { padding: "4px 6px" } }, row.ts),
        (0, import_react2.createElement)("td", { style: { padding: "4px 6px" } }, row.worker ?? ""),
        (0, import_react2.createElement)("td", { style: { padding: "4px 6px" } }, row.kind ?? ""),
        (0, import_react2.createElement)("td", { style: { padding: "4px 6px", maxWidth: 460, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, row.summary ?? "")
      )))
    )
  );
}
function PanelShell({ title, desc, children }) {
  const connect = () => {
    const url = window.prompt("vexnar-core \u5730\u5740\uFF08\u9ED8\u8BA4\u540C\u6E90 /vexnar-api\uFF09", localStorage.getItem("vexnar.coreUrl") || "/vexnar-api");
    if (url) localStorage.setItem("vexnar.coreUrl", url.replace(/\/$/, ""));
    const token = window.prompt("core token\uFF08\u540C\u6E90\u4EE3\u7406\u53EF\u7559\u7A7A\uFF09", localStorage.getItem("vexnar.coreToken") || "");
    if (token) localStorage.setItem("vexnar.coreToken", token);
    window.location.reload();
  };
  return (0, import_react2.createElement)(
    "div",
    { style: { height: "100%", overflowY: "auto", padding: 24 } },
    (0, import_react2.createElement)(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 } },
      (0, import_react2.createElement)("h1", { style: { fontSize: 22, margin: 0 } }, title),
      (0, import_react2.createElement)("button", { type: "button", onClick: connect, style: { border: "1px solid var(--vx-border, #e5e7eb)", background: "transparent", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 12 } }, "\u8FDE\u63A5 core")
    ),
    desc ? (0, import_react2.createElement)("p", { style: { color: "var(--vx-muted, #6b7280)", margin: "0 0 18px" } }, desc) : (0, import_react2.createElement)("div", { style: { height: 12 } }),
    children
  );
}
function FindingList({ onSelect }) {
  const { data, error, loading } = useApi("/api/exploration/findings?page=1&limit=30");
  if (loading) return (0, import_react2.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (error) return (0, import_react2.createElement)("div", { style: { color: "#dc2626" } }, error);
  const rows = data?.items ?? [];
  return (0, import_react2.createElement)(
    "div",
    null,
    (0, import_react2.createElement)("div", { style: { fontSize: 12, color: "var(--vx-muted, #6b7280)", marginBottom: 8 } }, `\u5171 ${data?.total ?? 0} \u6761`),
    (0, import_react2.createElement)(
      "table",
      { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 } },
      (0, import_react2.createElement)("thead", null, (0, import_react2.createElement)("tr", null, ["ID", "\u6F0F\u6D1E\u7C7B", "\u4E25\u91CD\u5EA6", "\u72B6\u6001", "\u6458\u8981"].map((title) => (0, import_react2.createElement)("th", { key: title, style: { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--vx-border, #e5e7eb)" } }, title)))),
      (0, import_react2.createElement)("tbody", null, rows.map((row) => (0, import_react2.createElement)(
        "tr",
        { key: row.finding_id, onClick: () => onSelect?.(String(row.finding_id)), style: { cursor: onSelect ? "pointer" : "default" } },
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.finding_id),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.vulnclass),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.severity),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.status),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px", maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, row.summary)
      )))
    )
  );
}
function FindingDetail({ id, onBack }) {
  const finding = useApi(`/api/exploration/findings/${id}`);
  const traffic2 = useApi(`/api/exploration/findings/${id}/traffic`);
  const [body2, setBody] = (0, import_react2.useState)({ title: "", text: "", error: "" });
  const loadBody2 = async (bindingId, side) => {
    try {
      const data = await callApi(`/api/exploration/findings/${id}/traffic/${bindingId}/body?side=${side}&length=8192`);
      setBody({ title: `${bindingId} \xB7 ${side} \xB7 ${data.offset}-${data.next_offset}/${data.total}`, text: data.content, error: "" });
    } catch (error) {
      setBody({ title: `${bindingId} \xB7 ${side}`, text: "", error: String(error?.message ?? error) });
    }
  };
  if (finding.loading) return (0, import_react2.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026");
  if (finding.error) return (0, import_react2.createElement)("div", { style: { color: "#dc2626" } }, finding.error);
  const row = finding.data ?? {};
  const bindings = traffic2.data?.bindings ?? [];
  return (0, import_react2.createElement)(
    "div",
    null,
    (0, import_react2.createElement)(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } },
      (0, import_react2.createElement)("button", { type: "button", onClick: onBack, style: { border: "1px solid var(--vx-border, #e5e7eb)", background: "transparent", borderRadius: 8, padding: "3px 10px", cursor: "pointer" } }, "\u2190 \u8FD4\u56DE"),
      (0, import_react2.createElement)("span", { style: { fontSize: 18, fontWeight: 600 } }, `${row.finding_id} \xB7 ${row.vulnclass ?? ""}`),
      (0, import_react2.createElement)("span", { style: { fontSize: 12, color: "var(--vx-muted, #6b7280)" } }, `${row.severity} / ${row.status}`)
    ),
    (0, import_react2.createElement)("div", { style: { fontSize: 13, marginBottom: 10 } }, row.summary),
    (0, import_react2.createElement)("pre", { style: { fontSize: 12, whiteSpace: "pre-wrap", background: "var(--vx-code, #f8fafc)", padding: 10, borderRadius: 8, maxHeight: 220, overflow: "auto" } }, row.evidence || ""),
    (0, import_react2.createElement)("div", { style: { fontSize: 13, fontWeight: 600, margin: "14px 0 6px" } }, `\u6D41\u91CF\u7ED1\u5B9A\uFF08${bindings.length}\uFF09`),
    ...bindings.map((binding) => (0, import_react2.createElement)(
      "div",
      { key: binding.id, style: { border: "1px solid var(--vx-border, #e5e7eb)", borderRadius: 8, padding: 8, marginBottom: 8, fontSize: 12 } },
      (0, import_react2.createElement)("div", null, `#${binding.id} \xB7 ${binding.snapshot?.method ?? ""} ${binding.snapshot?.url ?? ""} \xB7 ${binding.role}`),
      (0, import_react2.createElement)(
        "div",
        { style: { marginTop: 6, display: "flex", gap: 8 } },
        (0, import_react2.createElement)("button", { type: "button", onClick: () => loadBody2(String(binding.id), "response"), style: { cursor: "pointer" } }, "\u54CD\u5E94\u6B63\u6587"),
        (0, import_react2.createElement)("button", { type: "button", onClick: () => loadBody2(String(binding.id), "request"), style: { cursor: "pointer" } }, "\u8BF7\u6C42\u6B63\u6587")
      )
    )),
    body2.title ? (0, import_react2.createElement)(
      "div",
      null,
      (0, import_react2.createElement)("div", { style: { fontSize: 12, margin: "8px 0 4px", color: "var(--vx-muted, #6b7280)" } }, body2.title),
      body2.error ? (0, import_react2.createElement)("div", { style: { color: "#dc2626", fontSize: 12 } }, body2.error) : (0, import_react2.createElement)("pre", { style: { fontSize: 12, whiteSpace: "pre-wrap", background: "var(--vx-code, #f8fafc)", padding: 10, borderRadius: 8, maxHeight: 280, overflow: "auto" } }, body2.text)
    ) : null
  );
}
function TasksPanel() {
  const [taskId, setTaskId] = (0, import_react2.useState)("");
  return (0, import_react2.createElement)(
    PanelShell,
    { title: "\u4EFB\u52A1", desc: "\u4EFB\u52A1\u5217\u8868\u3001\u76EE\u6807\u3001\u610F\u56FE\u4E0E\u8986\u76D6\u5EA6" },
    taskId ? (0, import_react2.createElement)(TaskDetail, { id: taskId, onBack: () => setTaskId("") }) : (0, import_react2.createElement)("div", null, (0, import_react2.createElement)(Dashboard), (0, import_react2.createElement)(TaskList, { onSelect: setTaskId }))
  );
}
function FindingsPanel() {
  const [findingId, setFindingId] = (0, import_react2.useState)("");
  return (0, import_react2.createElement)(
    PanelShell,
    { title: "\u53D1\u73B0", desc: "\u6F0F\u6D1E\u5217\u8868\u3001\u8BC1\u636E\u4E0E\u6D41\u91CF\u7ED1\u5B9A" },
    findingId ? (0, import_react2.createElement)(FindingDetail, { id: findingId, onBack: () => setFindingId("") }) : (0, import_react2.createElement)(FindingList, { onSelect: setFindingId })
  );
}
function AssetsPanel() {
  const { data, error, loading } = useApi("/api/assets?limit=50");
  return (0, import_react2.createElement)(
    PanelShell,
    { title: "\u8D44\u4EA7", desc: "\u57DF\u540D / IP / \u670D\u52A1 / \u7AEF\u70B9" },
    loading ? (0, import_react2.createElement)("div", null, "\u52A0\u8F7D\u4E2D\u2026") : error ? (0, import_react2.createElement)("div", { style: { color: "#dc2626" } }, error) : (0, import_react2.createElement)(
      "table",
      { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 } },
      (0, import_react2.createElement)("thead", null, (0, import_react2.createElement)("tr", null, ["ID", "\u7C7B\u578B", "\u57DF\u540D/IP", "\u7AEF\u53E3", "\u6700\u540E\u53D1\u73B0"].map((t) => (0, import_react2.createElement)("th", { key: t, style: { textAlign: "left", padding: "6px 8px" } }, t)))),
      (0, import_react2.createElement)("tbody", null, (data?.assets ?? []).map((row) => (0, import_react2.createElement)(
        "tr",
        { key: row.id },
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.id),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.type),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.domain || row.ip || row.url || ""),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.port ?? ""),
        (0, import_react2.createElement)("td", { style: { padding: "6px 8px" } }, row.last_seen ?? "")
      )))
    )
  );
}
function TrafficPanel() {
  return (0, import_react2.createElement)(PanelShell, { title: "\u6D41\u91CF", desc: "\u6293\u5305\u5217\u8868\uFF08\u7ECF core \u4EE3\u7406 Go \u6D41\u91CF\u63A5\u53E3\uFF09" }, (0, import_react2.createElement)(TrafficPage));
}
function ToolRunPanel() {
  return (0, import_react2.createElement)(PanelShell, { title: "\u5DE5\u5177\u6267\u884C", desc: "nmap / httpx / ffuf / sqlmap" }, (0, import_react2.createElement)(ToolRunPage));
}
function AgentSettings() {
  return (0, import_react2.createElement)(PanelShell, { title: "Agent \u7BA1\u7406", desc: "\u540D\u79F0\u3001\u63CF\u8FF0\u4E0E\u89E6\u53D1\u914D\u7F6E" }, (0, import_react2.createElement)(AgentsPage));
}
function McpSettings() {
  return (0, import_react2.createElement)(PanelShell, { title: "MCP", desc: "MCP server \u542F\u505C\u4E0E\u5220\u9664" }, (0, import_react2.createElement)(McpPage));
}
function ToolSettings() {
  return (0, import_react2.createElement)(PanelShell, { title: "\u5DE5\u5177", desc: "\u5185\u7F6E\u4E0E\u81EA\u5B9A\u4E49\u5DE5\u5177" }, (0, import_react2.createElement)(ToolsPage));
}
function NotifySettings() {
  return (0, import_react2.createElement)(PanelShell, { title: "\u901A\u77E5\u63A8\u9001", desc: "\u6E20\u9053\u4E0E\u6295\u9012" }, (0, import_react2.createElement)(NotifyPage));
}
function InterceptSettings() {
  return (0, import_react2.createElement)(PanelShell, { title: "\u62E6\u622A\u89C4\u5219", desc: "\u5DE5\u5177\u8F93\u5165/\u8F93\u51FA\u62E6\u622A\uFF08\u7ECF core \u4EE3\u7406 Go\uFF09" }, (0, import_react2.createElement)(InterceptPage));
}
function ApprovalsSettings() {
  return (0, import_react2.createElement)(PanelShell, { title: "\u5BA1\u6279\u8BB0\u5F55", desc: "\u4EBA\u5DE5\u5BA1\u6279\u4E0E\u64CD\u4F5C\u7559\u75D5" }, (0, import_react2.createElement)(ApprovalsPage));
}
function CraftPanel() {
  const { data, error, loading } = useApi("/api/craft/status");
  return (0, import_react2.createElement)(
    PanelShell,
    { title: "Craft Anything", desc: "\u5185\u7F6E MCP \u5F15\u64CE\uFF08Essentials \u5DE5\u5177\u96C6\uFF09" },
    loading ? (0, import_react2.createElement)("p", null, "\u8BFB\u53D6\u4E2D\u2026") : error ? (0, import_react2.createElement)("p", null, `\u9519\u8BEF\uFF1A${error}`) : (0, import_react2.createElement)(
      "div",
      null,
      (0, import_react2.createElement)("p", null, `\u7248\u672C\uFF1A${data?.version || "\u672A\u5B89\u88C5"} \xB7 \u5DE5\u5177\uFF1A${data?.tools?.length ?? 0}`),
      (0, import_react2.createElement)("p", { style: { opacity: 0.7 } }, data?.path ?? ""),
      (0, import_react2.createElement)("ul", null, (data?.tools ?? []).map((tool) => (0, import_react2.createElement)("li", { key: tool }, (0, import_react2.createElement)("code", null, tool))))
    )
  );
}
var PANELS = [
  { id: "vexnar-overview", label: "\u6982\u89C8", order: 99, component: OverviewPanel, icon: OverviewIcon },
  { id: "vexnar-tasks", label: "\u4EFB\u52A1", order: 100, component: TasksPanel },
  { id: "vexnar-findings", label: "\u53D1\u73B0", order: 101, component: FindingsPanel },
  { id: "vexnar-traffic", label: "\u6D41\u91CF", order: 102, component: TrafficPanel },
  { id: "vexnar-assets", label: "\u8D44\u4EA7", order: 103, component: AssetsPanel },
  { id: "vexnar-tool-run", label: "\u5DE5\u5177\u6267\u884C", order: 104, component: ToolRunPanel },
  { id: "vexnar-logs", label: "\u65E5\u5FD7", order: 105, component: LogsPanel },
  { id: "vexnar-craft", label: "Craft", order: 106, component: CraftPanel }
];
var SETTINGS = [
  { id: "vexnar-agents", label: "Agent \u7BA1\u7406", order: 40, component: AgentSettings },
  { id: "vexnar-mcp", label: "MCP", order: 41, component: McpSettings },
  { id: "vexnar-tools", label: "\u5DE5\u5177", order: 42, component: ToolSettings },
  { id: "vexnar-notify", label: "\u901A\u77E5\u63A8\u9001", order: 43, component: NotifySettings },
  { id: "vexnar-intercept", label: "\u62E6\u622A\u89C4\u5219", order: 44, component: InterceptSettings },
  { id: "vexnar-asset-sync", label: "\u8D44\u4EA7\u540C\u6B65", order: 45, component: AssetSyncSettings },
  { id: "vexnar-approvals", label: "\u5BA1\u6279\u8BB0\u5F55", order: 46, component: ApprovalsSettings }
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
  for (const panel of PANELS) {
    slots.inject("main", () => slots.register({ name: "main", key: panel.id }, panel.component));
    slots.inject("sidebar.panellist", () => slots.register({ name: "sidebar.panellist", id: panel.id, order: panel.order, label: () => panel.label }, panel.icon ?? ConsoleIcon));
  }
  for (const section of SETTINGS) {
    slots.inject("settings.section", () => slots.register({ name: "settings.section", id: section.id, label: section.label, order: section.order }, section.component));
  }
  slots.inject("sidebar.brand.mark", () => slots.register({ name: "sidebar.brand.mark" }, BrandMark));
  slots.inject("sidebar.brand.name", () => slots.register({ name: "sidebar.brand.name" }, BrandName));
  slots.inject("conversation.hero.brand.mark", () => slots.register({ name: "conversation.hero.brand.mark" }, HeroLogo));
  slots.inject("conversation.hero.frame", () => slots.register({ name: "conversation.hero.frame", id: "vexnar-overview", order: 20 }, HeroOverviewLayer));
  ctx.effect?.(() => installSkinBrandGuard());
  ctx.effect?.(() => installHeroSlogan());
  ctx.effect?.(() => installPermissionWarning());
}

return module.exports;
}});
