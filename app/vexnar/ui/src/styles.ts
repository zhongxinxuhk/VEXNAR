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

/* ── motion ─────────────────────────────────────────────────────────────── */
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
