// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * VEXNAR design bridge for the dsh client.
 *
 * The dsh client already ships a three-layer token platform
 * (`--dsw-static-*` → `--dsw-alias-*` → component tokens, with
 * `body[data-ds-dark-theme]` switching the alias layer). VEXNAR must ride that
 * platform instead of painting hex values, otherwise cards stay light-only and
 * look foreign next to the shell.
 *
 * This module keeps VEXNAR's own vocabulary (`--vx-*`) and binds it to the dsh
 * tokens, so:
 *   - every colour, radius, shadow and duration has one source of truth;
 *   - theme switches and user font-size settings carry into the cards;
 *   - a missing token degrades to a readable fallback rather than to black.
 *
 * The stylesheet is injected once per document (web build and Electron shell
 * share the same DOM contract) and removed by the returned disposer.
 */

const STYLE_ID = 'vexnar-dsh-ui-styles'

export const VEXNAR_CSS = `
/* ── token bridge ─────────────────────────────────────────────────────────
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

/* ── severity ─────────────────────────────────────────────────────────────
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

/* ── card shell ───────────────────────────────────────────────────────────
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

/* ── chips ────────────────────────────────────────────────────────────────
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

/* ── segmented control (HTTP 头 / 正文) ─────────────────────────────────── */
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

/* ── code / payload ─────────────────────────────────────────────────────── */
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

/* ── loading ────────────────────────────────────────────────────────────── */
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

/* ── brand slots ────────────────────────────────────────────────────────── */
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
   The gradient only applies where background-clip:text exists — without the
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

/* ── 概览：Web 仪表盘在新会话页的复刻 ─────────────────────────────────────
   Two surfaces share every rule: '.vx-ov' (dock above the New Session
   composer) and '.vx-ov-page' (the sidebar 概览 page). Colour comes from the
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

.vx-ov-spark { margin-left: auto; flex: none; opacity: 0.92; overflow: visible; }

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

.vx-ov-dials {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-around;
  gap: 6px;
  padding-top: 4px;
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
  font-size: 10px;
  font-weight: 600;
  color: var(--vx-text-dim);
}

.vx-ov-dial-sub {
  max-width: 112px;
  font-size: 9px;
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

/* ── 概览整页 ───────────────────────────────────────────────────────────── */
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

@media (max-width: 900px) {
  .vx-ov-split { grid-template-columns: 1fr; }
}

/* ── motion ─────────────────────────────────────────────────────────────── */
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
`

/** Inject the stylesheet once. Returns a disposer that removes it. */
export function installStyles(doc: Document = document): () => void {
  const existing = doc.getElementById(STYLE_ID)
  if (existing !== null) return () => {}

  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = VEXNAR_CSS
  doc.head.append(style)
  return () => style.remove()
}
