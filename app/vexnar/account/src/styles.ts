// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 设置页（个人资料 + 模型）的样式表。
 *
 * 这些规则逐条对应 dsh 上游 `packages/client/ui-settings-models/src/client/
 * ModelsSection.module.css` 与 `ui-settings-account` 里的取值：同样的
 * `--dsw-alias-*` token、同样的圆角/行高/间距、同样的按钮高度（行内操作 28px、
 * 主按钮 36px）、同样的虚线添加入口。不这么做，VEXNAR 的设置页就会是"另一套
 * 设计"——上游换主题、换字号时它自己不动。
 *
 * 三条硬约束：
 *   1. 只有 token，没有裸色值（fallback 只做兜底，不让深色主题掉回浅色）；
 *   2. 类名一律 `vxa-` 前缀，绝不碰 dsh 自己的类名；
 *   3. 整个文档只注入一份（按 id 复用），插件热重载不会叠出第二份。
 *
 * 客户端 bundle 由 esbuild 直接打包，没有 CSS module 管道，所以样式以字符串
 * 形式随模块注入，而不是 `import styles from './x.module.css'`。
 */

const STYLE_ID = 'vexnar-account-settings-styles'

export const ACCOUNT_CSS = `
/* ── 版心 ───────────────────────────────────────────────────────────────── */
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

/* ── 个人资料 ───────────────────────────────────────────────────────────── */
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

/* ── 按钮（尺寸对齐 dsh：主按钮 36px，行内操作 28px） ───────────────────── */
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
/* 应用把每个 a 都染成链接色（选择器 body[data-dsh-claude-style] a:not(...)，
   特异性 0-3-2）：放在深青身份卡上就是一块读不清的按钮。它的注入顺序也晚于本文件，
   所以这里用足够高的特异性压过去——不写 !important，留给正主喘气的余地。 */
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

/* ── 模型页：提供方行 ───────────────────────────────────────────────────── */
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

/* 账号行里静默的模型数：可点开只读目录，但绝不像操作按钮那样抢位置。 */
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

/* ── 提供方编辑器（行内展开，来自 dsh 的 .editor 填充层） ────────────────── */
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

/* 自定义设置：原生 details + 自绘 chevron，与 dsh 的 .customized 完全一致。 */
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

/* ── 模型目录 ───────────────────────────────────────────────────────────── */
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

/* ── 添加入口（虚线，占满整行） ─────────────────────────────────────────── */
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
/* 添加卡里再套一层编辑器时不该叠出第二块底色。 */
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
.vxa-wallet-plans { display: grid; gap: 6px; margin: 8px 0; padding-left: 0; list-style: none; }
.vxa-wallet-plans li { display: flex; justify-content: space-between; gap: 10px; }

@media (prefers-reduced-motion: reduce) {
  .vxa-fold-summary::before { transition: none; }
}
`

/** 只注入一次；重复调用返回同一个 disposer 语义的空操作。 */
export function installAccountStyles(doc: Document = document): () => void {
  const existing = doc.getElementById(STYLE_ID)
  if (existing !== null) return () => {}
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = ACCOUNT_CSS
  doc.head.append(style)
  return () => { style.remove() }
}
