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

.vx-ov-tone-blue { --vx-tone: var(--vx-chart-1); }
.vx-ov-tone-violet { --vx-tone: var(--vx-chart-2); }
.vx-ov-tone-green { --vx-tone: var(--vx-chart-3); }
.vx-ov-tone-amber { --vx-tone: var(--vx-chart-4); }
.vx-ov-tone-red { --vx-tone: var(--vx-chart-5); }

/* ── 概览整页 ─────────────────────────────────────────────────────────────
   只保留右上角的日期筛选；其余全部是数据区块。卡片 14px 圆角 + 顶部内高光，
   网格 12 列，窄窗口降为两列 / 单列。 */
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

/* ── 日期筛选 ─────────────────────────────────────────────────────────── */
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

/* ── KPI ──────────────────────────────────────────────────────────────── */
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

/* ── 环比徽标 ─────────────────────────────────────────────────────────── */
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

/* ── 网格与区块 ───────────────────────────────────────────────────────── */
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

/* ── Token 区块 ───────────────────────────────────────────────────────── */
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

/* ── 效率 / 环形 ──────────────────────────────────────────────────────── */
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

/* ── 环形图 ───────────────────────────────────────────────────────────── */
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

/* ── 分布条 ───────────────────────────────────────────────────────────── */
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

/* ── 任务健康度 ───────────────────────────────────────────────────────── */
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

/* ── 热力图 ───────────────────────────────────────────────────────────── */
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

/* ── 活动流 / 发现 ────────────────────────────────────────────────────── */
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

/* ── 任务表 ───────────────────────────────────────────────────────────── */
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

/* ── 流量 / 系统 ──────────────────────────────────────────────────────── */
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

/* ── 通用状态 ─────────────────────────────────────────────────────────── */
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

@media (max-width: 860px) {
  .vx-ov-page { padding: 14px 14px 32px; }
  .vx-ov-toolbar { margin: 0 -14px; padding: 8px 14px 10px; }
  .vx-ov-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .vx-ov-span-4,
  .vx-ov-span-6,
  .vx-ov-span-8 { grid-column: span 12; }
}
/* ── motion ─────────────────────────────────────────────────────────────── */
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
