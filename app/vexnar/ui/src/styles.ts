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

/* ── 领域面板外壳（任务/发现/设置各页共用） ───────────────────────────── */
.vx-panel {
  height: 100%;
  overflow-y: auto;
  padding: 22px 24px 40px;
  /* 自己铺底：宿主容器未必跟着主题换背景，插件不能透出上一层的白。 */
  background: var(--vx-surface);
  color: var(--vx-text);
  font-size: 13px;
}

.vx-panel-head { margin-bottom: 18px; }

.vx-panel-title {
  margin: 0;
  font-size: 20px;
  font-weight: 660;
  letter-spacing: -0.01em;
}

.vx-panel-desc {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--vx-text-dim);
}

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
