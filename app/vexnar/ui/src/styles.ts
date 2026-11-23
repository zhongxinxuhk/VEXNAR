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

/* ── 工具目录 / MCP 舰队 ────────────────────────────────────────────────
   形制照抄 dsh 插件页：卡片列表 → 整页详情，状态用胶囊、开关用轨+钮，
   颜色一律走 --vx-* 桥，所以换皮和深色不额外写一份。 */
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


.vx-yak-history {
  font-size: 13px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── 筛选条 ─────────────────────────────────────────────── */
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

/* ── 列表 ───────────────────────────────────────────────── */
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

/* ── 方法与状态胶囊 ─────────────────────────────────────── */
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

/* ── 报文详情 ───────────────────────────────────────────── */
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

/* 拖拽分隔条：视觉上一条竖线，命中区 8px。 */
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

/* 报文着色：颜色全部取自 dsh 的静态色板，深色由 body[data-ds-dark-theme] 切换，
   组件自己不维护第二套主题。 */
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

/* 深色：同一批语义换成色板里更亮的台阶。 */
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

/* 搜索命中 */
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

/* ── 任务工作区（清单 + 详情十页） ─────────────────────────────── */
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

/* ── 拦截规则（设置页） ───────────────────────────────────────────
   与任务面板共用一套 token 与 .vx-task-* 基件；这里只补这张页自己的形状：
   信息条、规则表、开关、浮层抽屉与模型兜底的统计块。 */
.vx-int-page,
.vx-int-overlay,
.vx-int-page *,
.vx-int-overlay * { box-sizing: border-box; }

.vx-int-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 页签条收在内容宽度上：整行拉满会像一块空的工具条。 */
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

/* 信息条：范围 / 兜底开关共用。warn=范围空，on=兜底已启用。 */
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

/* 规则表：列宽固定成比例，模式列吃掉剩余宽度，窄容器横向滚动。 */
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

/* 开关：轨道用正文色，拇指用表面色，深浅主题都不需要第二套颜色。 */
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

/* 表单件 */
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

/* 浮层：抽屉与对话框共用遮罩，Esc / 点遮罩关闭。 */
.vx-int-overlay {
  position: fixed;
  inset: 0;
  /* dsh 的设置弹窗为 1000，子对话框与设置同挂在 body。 */
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

/* 范围对话框里的工具行 */
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

/* 模型兜底：统计块 + 迷你柱图 + 双栏 */
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
/* ══════════════════════════════════════════════════════════════════════════
   控制台设计层（vx-ui-*）
   ─────────────────────────────────────────────────────────────────────────
   四页（概览 / 任务 / 流量 / 代理池）共用这一套外壳。之前的四套词汇
   （vx-ov / vx-cat / vx-task / vx-yak）保留给尚未改造的区域，新页面只用这里。

   三条硬规则：
     1. 颜色一律走 --vx-* 桥，组件里不出现 hex，深色与换皮不需要第二份；
     2. 间距是 4 的倍数，圆角只有 8/10/12 三档，避免"每页差一像素"；
     3. 数字一律 tabular-nums，表格滚动时小数点不对齐会被一眼看出来。
   ══════════════════════════════════════════════════════════════════════════ */

/* 补上历史欠账：--vx-muted 在旧样式里被引用 20 余次却从未定义，深色下会退化成
   透明文本；--vx-code 是报文底色，之前靠 inline fallback 兜着。 */
body {
  --vx-muted: var(--vx-text-dim);
  --vx-code: var(--vx-surface-sunken);
}

/* ── 页面骨架 ─────────────────────────────────────────────────────────── */
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

/* ── KPI ─────────────────────────────────────────────────────────────── */
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

/* tone：一个变量驱动卡片渐变、Chip、进度条与状态点。 */
.vx-ui-tone-neutral { --vx-tone: var(--vx-text-faint); }
.vx-ui-tone-blue { --vx-tone: var(--vx-chart-1); }
.vx-ui-tone-violet { --vx-tone: var(--vx-chart-2); }
.vx-ui-tone-green { --vx-tone: var(--vx-chart-3); }
.vx-ui-tone-amber { --vx-tone: var(--vx-chart-4); }
.vx-ui-tone-red { --vx-tone: var(--vx-chart-5); }

/* ── 区块 ─────────────────────────────────────────────────────────────── */
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

/* 卡片内容区里的按钮按内容宽度站好，不要被 flex 拉成一整行。 */
.vx-ui-card-body > .vx-ui-btn,
.vx-ui-kv + .vx-ui-btn { align-self: flex-start; }

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

/* ── 工具条 / 分段 ────────────────────────────────────────────────────── */
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

/* ── 徽标 ─────────────────────────────────────────────────────────────── */
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

/* ── 表格 ─────────────────────────────────────────────────────────────── */
.vx-ui-table-wrap {
  max-width: 100%;
  overflow: auto;
  border: 1px solid var(--vx-border);
  border-radius: 9px;
  background: var(--vx-surface);
}

.vx-ui-table {
  width: 100%;
  /* 固定布局：列宽由 col 的 width 决定，长主机名不会把表格撑出横向滚动条。
     未声明宽度的列（通常是"路径"）平分剩余空间。 */
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

/* 操作列粘在右侧：密集表格横向滚动时按钮仍然可点，不用先滚到底。 */
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

/* ── 空态 / 骨架 / 提示条 ─────────────────────────────────────────────── */
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

/* ── 表单 ─────────────────────────────────────────────────────────────── */
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
.vx-ui-select,
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

/* 下拉框按内容宽度排，不占满一行：工具条里一行能放下三个筛选器。
   原生 select 的边框/内距与 input 不同高，工具条里会一高一矮；这里统一成
   同一套盒子，箭头自己画。 */
.vx-ui-select {
  width: auto;
  min-width: 104px;
  max-width: 220px;
  padding-inline-end: 22px;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10' fill='none'><path d='M2.6 4.1 5 6.5l2.4-2.4' stroke='%236b7280' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat: no-repeat;
  background-position: right 7px center;
  background-size: 10px 10px;
  cursor: pointer;
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

/* ── 指示器 ───────────────────────────────────────────────────────────── */
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

/* ── 分页 ─────────────────────────────────────────────────────────────── */
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

/* ── 浮层（顶层对话框 / 右侧抽屉） ──────────────────────────────────────
   底座是原生 dialog：showModal() 把面板送进顶层（top layer），遮罩由
   ::backdrop 绘制。顶层既不参与 z-index 比较，也不受任何祖先 transform
   影响，所以遮罩一定盖满整个视口。

   之前是 position: fixed; inset: 0 挂在 body 上：外壳把抽屉侧栏放在 71、
   把底栏状态条也各有层级，遮罩只要比它们低就被压在下面，表现为「弹窗底部
   永远留一条不暗的缝」。把层级从 60 往上调只是换一个输赢，进顶层才是收口。 */
.vx-ui-layer {
  position: fixed;
  inset: 0;
  z-index: 1000;
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--vx-text);
  font-size: 12px;
  overflow: hidden;
}

.vx-ui-layer::backdrop {
  background: color-mix(in srgb, #0b1220 34%, transparent);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  animation: vx-ov-fade 0.16s var(--vx-ease) both;
}

/* 打开瞬间焦点落在面板本身（见 kit.tsx 的 Overlay），面板不该有描边。 */
.vx-ui-layer:focus,
.vx-ui-layer:focus-visible { outline: none; }

/* 右侧检查器：贴住视口右边，整高。 */
.vx-ui-layer--sheet {
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
}

/* 居中弹窗：四周留白由底座给，卡片只按自己的宽度与最大高度算。 */
.vx-ui-layer--modal {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 26px 24px;
}

.vx-ui-sheet,
.vx-ui-modal {
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  max-width: 100%;
  min-height: 0;
  color: var(--vx-text);
  font-size: 12px;
  background: var(--vx-surface);
}

.vx-ui-sheet *,
.vx-ui-modal * { box-sizing: border-box; }

.vx-ui-sheet {
  height: 100%;
  border-inline-start: 1px solid var(--vx-border);
  box-shadow: -24px 0 60px -40px rgba(0, 0, 0, 0.6);
  animation: vx-ui-slide 0.22s var(--vx-ease) both;
}

.vx-ui-modal {
  max-height: 100%;
  overflow: hidden;
  border: 1px solid var(--vx-border);
  border-radius: 14px;
  /* 两层阴影：一层贴边描边，一层远投影，卡片才像浮起来而不是贴了张纸。 */
  box-shadow:
    0 1px 2px rgba(11, 18, 32, 0.06),
    0 40px 90px -44px rgba(11, 18, 32, 0.5);
  animation: vx-ui-pop 0.2s var(--vx-ease) both;
}

.vx-ui-layer-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--vx-border);
  background: color-mix(in srgb, var(--vx-surface-sunken) 45%, transparent);
}

.vx-ui-modal .vx-ui-layer-head {
  padding: 13px 16px;
  border-top-left-radius: 13px;
  border-top-right-radius: 13px;
}

.vx-ui-layer-titles {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.vx-ui-layer-titles > strong {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ui-modal .vx-ui-layer-titles > strong { font-size: 13px; }

.vx-ui-layer-titles > span {
  overflow: hidden;
  color: var(--vx-text-faint);
  font-family: var(--vx-mono);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-ui-layer-meta {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
}

.vx-ui-layer-close {
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
  transition: border-color var(--vx-dur-fast) var(--vx-ease), color var(--vx-dur-fast) var(--vx-ease);
}

.vx-ui-layer-close:hover { border-color: var(--vx-accent); color: var(--vx-text); }

.vx-ui-layer-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 12px 14px 14px;
  overflow-y: auto;
}

.vx-ui-modal .vx-ui-layer-body {
  padding: 14px 16px 16px;
  overflow: auto;
}

.vx-ui-layer-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border-top: 1px solid var(--vx-border);
  background: color-mix(in srgb, var(--vx-surface-sunken) 45%, transparent);
}

.vx-ui-modal .vx-ui-layer-foot {
  padding: 11px 16px;
  border-bottom-left-radius: 13px;
  border-bottom-right-radius: 13px;
}

@keyframes vx-ui-pop {
  from { opacity: 0; transform: translateY(8px) scale(0.985); }
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

/* ── 分布条 / 列表 / 事件 ─────────────────────────────────────────────── */
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

/* ── Web 引擎会话卡 ───────────────────────────────────────────────────── */
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

/* ── 成员勾选 ─────────────────────────────────────────────────────────── */
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

/* ── 杂项 ─────────────────────────────────────────────────────────────── */
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

/* 会话流量弹窗里的三个小件 */
.vx-ui-inline-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-family: var(--vx-mono);
  font-size: 11.5px;
}

.vx-ui-link {
  color: var(--vx-chart-1);
  font-size: 11px;
  text-decoration: none;
}

.vx-ui-link:hover { text-decoration: underline; }

.vx-ui-note {
  margin: 0;
  color: var(--vx-text-dim);
  font-size: 10.5px;
  line-height: 1.6;
}

.vx-ui-note strong { color: var(--vx-text); font-weight: 600; }

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
  .vx-ui-sheet,
  .vx-ui-modal,
  .vx-ui-layer::backdrop,
  .vx-ui-skeleton > i,
  .vx-ui-live.is-on > i { animation: none; }
}
/* ══════════════════════════════════════════════════════════════════════════
   报文查看器（请求 / 响应成对）
   ─────────────────────────────────────────────────────────────────────────
   着色沿用 http-packet 的词法分词：起始行、头部名、头部值、会话凭据、正文各一色。
   新增 --vx-syn-session 一族：Cookie / Authorization / CSRF 这类"身份"信息，
   在排查越权与会话固定时比普通头更该被一眼看到。
   ══════════════════════════════════════════════════════════════════════════ */
body {
  --vx-syn-session: var(--dsw-static-violet-600, #7c3aed);
  --vx-syn-session-soft: color-mix(in oklab, var(--vx-syn-session) 72%, var(--vx-text));
}

body[data-ds-dark-theme] {
  --vx-syn-session: var(--dsw-static-violet-400, #a78bfa);
  --vx-syn-session-soft: color-mix(in oklab, var(--vx-syn-session) 82%, var(--vx-text));
}

.vx-tone--session { color: var(--vx-syn-session); font-weight: 600; }
.vx-tone--cookie-key { color: var(--vx-syn-session); font-weight: 600; }
.vx-tone--cookie-value { color: var(--vx-syn-session-soft); }

/* 行号独立一列：换行时正文从第二列继续，像编辑器而不是被折断的文本。 */
.vx-yak-line {
  display: grid;
  grid-template-columns: 3.1em minmax(0, 1fr);
  align-items: start;
  padding: 0 10px 0 0;
  min-height: 1.65em;
}

.vx-yak-line > code {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.vx-yak-line[data-tone="start"] {
  background: color-mix(in oklab, var(--vx-surface-sunken) 70%, transparent);
}

.vx-pkt-ln {
  padding-inline-end: 10px;
  color: var(--vx-text-faint);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  line-height: 1.9;
  text-align: end;
  opacity: 0.55;
  user-select: none;
}

/* 成对布局 */
.vx-pkt-pair-wrap { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

.vx-pkt-pair-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
  color: var(--vx-text-faint);
}

.vx-pkt-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
}

.vx-pkt-pair[data-layout="stack"] { grid-template-columns: minmax(0, 1fr); }
.vx-pkt-pair > .vx-yak-packet { height: auto; margin-inline: 0; }
.vx-pkt-pair .vx-yak-code { max-height: 420px; }

/* 缺报文：说清"没抓到"而不是留白 */
/* 正文块：与头部在视觉上分开，颜色之外再给一层边界 */
.vx-pkt-body {
  margin: 2px 8px 6px 12px;
  padding: 2px 0;
  border-inline-start: 2px solid color-mix(in oklab, var(--vx-syn-string) 38%, transparent);
  border-radius: 4px;
  background: color-mix(in oklab, var(--vx-text) 2.5%, transparent);
}

.vx-pkt-missing {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  padding: 16px;
  color: var(--vx-text-faint);
  font-size: 11px;
  text-align: center;
  background: repeating-linear-gradient(
    135deg,
    transparent 0 6px,
    color-mix(in oklab, var(--vx-text) 3%, transparent) 6px 12px
  );
}

@media (max-width: 1080px) {
  .vx-pkt-pair { grid-template-columns: minmax(0, 1fr); }
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
