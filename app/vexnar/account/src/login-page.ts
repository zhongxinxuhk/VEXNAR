// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { API_SERVICES, API_STATUS, HARNESS_DOCS } from './support.js'

const script = '/vexnar-api/platform/entry.js'
export const workspaceSessionScript = `<script defer src="${script}"></script>`

/**
 * 登录页。
 *
 * 版式对齐希灵 AI 主账号的登录页（左品牌主张、右白色登录卡），但所有视觉仍然是
 * 内联 CSS + 内联 SVG：CSP 是 `default-src 'none'`，引不了外部字体、图标或脚本。
 *
 * 两条硬约束：
 *
 *   1. **整页不滚动**。桌面窗口和浏览器窗口都可能很矮，出现纵向滚动条既难看，
 *      也会让「登录」按钮掉到视口外面。这里 height 锁定 100dvh、overflow hidden，
 *      窄屏改成单列并收起左侧品牌区。
 *   2. **表单契约不变**。`login-client.ts` 按 id 取元素（`password-login`、
 *      `verify-login`、`token-login`、`notice`、`reveal`、`retry`、`methods`），
 *      改版只动外观与排布，不动这些 id 和字段名；访问令牌入口收进「使用访问令牌」
 *      折叠区，保留给没有密码登录条件的环境。
 *
 * 右上角四个入口是外链：产品文档 / API Services / API 状态 / 支持中心（飞书问卷，
 * 带上设备序列号、Harness 版本与运行环境三个预填值，用户不用手抄）。
 *
 * 账号密码走 `/login/password`（网关 `/api/user/login`），与主账号是同一套身份；
 * 开启两步验证的账号会切到验证码表单。
 */
export const loginPage = (origin: string, support: string): string => `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'self'">
<meta name="color-scheme" content="light">
<title>登录 VEXNAR Harness</title><link rel="icon" href="/vexnar-brand/favicon.png">
<style>
*{box-sizing:border-box}
[hidden]{display:none!important}
:root{
  --ink:#0f172a;--ink-soft:#475569;--muted:#64748b;--line:#e2e8f0;
  --blue:#1f5eff;--blue-deep:#1747d6;--blue-soft:#eef4ff;
  --danger:#b42318;
  font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  color:var(--ink);
}
html,body{height:100%;margin:0;overflow:hidden}
body{
  background:
    radial-gradient(58% 62% at 82% 8%,rgba(191,219,254,.55) 0%,transparent 62%),
    radial-gradient(46% 52% at 4% 96%,rgba(147,197,253,.45) 0%,transparent 66%),
    linear-gradient(168deg,#fbfdff 0%,#f3f8ff 46%,#e8f1ff 100%);
}
main{height:100dvh;display:flex;flex-direction:column;overflow:hidden;position:relative}
/* 底部两条水波纹：纯 CSS，不依赖图片。 */
main::after{
  content:"";position:absolute;left:-8%;right:-8%;bottom:-26vh;height:52vh;pointer-events:none;z-index:0;
  background:
    radial-gradient(52% 100% at 22% 100%,rgba(96,165,250,.42) 0%,transparent 70%),
    radial-gradient(46% 100% at 62% 100%,rgba(37,99,235,.30) 0%,transparent 72%);
  filter:blur(6px);
  border-radius:50% 50% 0 0
}
.nav{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;
  gap:24px;padding:clamp(16px,2.4vh,28px) clamp(22px,4.6vw,64px)}
.brand{display:flex;align-items:center;gap:12px;min-width:0}
.brand img{width:40px;height:40px;object-fit:contain}
.brand .word{font-size:22px;font-weight:800;letter-spacing:.16em;color:#0b1a3a}
.brand .rule{width:1px;height:24px;background:#cbd5e1}
.brand .sub{font-size:19px;font-weight:600;color:#1e293b;letter-spacing:.02em}
.links{display:flex;align-items:center;gap:clamp(14px,2.2vw,30px);font-size:14px}
.links a{color:#334155;text-decoration:none;white-space:nowrap}
.links a:hover{color:var(--blue)}
.stage{position:relative;z-index:1;flex:1;min-height:0;display:grid;
  grid-template-columns:minmax(0,1.1fr) minmax(360px,.82fr);
  align-items:center;gap:clamp(24px,4vw,72px);
  padding:0 clamp(22px,4.6vw,64px) clamp(18px,3vh,40px)}
.hero{min-width:0;padding-bottom:2vh}
.pill{display:inline-flex;align-items:center;gap:8px;padding:8px 18px;border-radius:999px;
  background:linear-gradient(96deg,#1d4ed8,#2563eb);color:#fff;font-size:14px;font-weight:600;letter-spacing:.02em}
.hero h1{margin:clamp(14px,2.2vh,26px) 0 0;font-size:clamp(34px,4.4vw,58px);line-height:1.1;
  letter-spacing:-.02em;font-weight:800;color:#0b1a3a}
.hero h1 span{color:#1e3a8a}
.hero p{margin:clamp(10px,1.6vh,18px) 0 0;color:#475569;font-size:clamp(15px,1.35vw,19px)}
.features{list-style:none;margin:clamp(20px,3.4vh,40px) 0 0;padding:0;
  display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(8px,1.4vw,20px);max-width:640px}
.features li{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;
  padding:0 4px;border-right:1px solid rgba(148,163,184,.35)}
.features li:last-child{border-right:0}
.features svg{width:38px;height:38px;color:var(--blue)}
.features span{font-size:14px;color:#334155}
.card{
  justify-self:center;width:min(100%,470px);max-height:calc(100dvh - 150px);
  background:#fff;border:1px solid rgba(226,232,240,.9);border-radius:20px;
  box-shadow:0 24px 60px -24px rgba(15,23,42,.22),0 2px 8px rgba(15,23,42,.04);
  padding:clamp(20px,3vh,34px) clamp(22px,2.6vw,38px);
  display:flex;flex-direction:column;gap:clamp(10px,1.5vh,16px);overflow:hidden
}
.card .logo{display:flex;align-items:center;justify-content:center;gap:9px;padding-bottom:2px}
.card .logo img{height:30px;object-fit:contain}
.card .lock{font-size:19px;font-weight:800;letter-spacing:.14em;color:#0b1a3a}
.card .lock-rule{width:1px;height:18px;background:#cbd5e1}
.card .lock-sub{font-size:17px;font-weight:600;color:#1e293b}
.card h2{margin:0;text-align:center;font-size:24px;font-weight:750;letter-spacing:-.01em}
.card .sub{margin:0;text-align:center;color:var(--muted);font-size:13.5px}
.status{margin:0;font-size:13px;color:var(--muted);min-height:18px}
.status[data-state="error"]{color:var(--danger)}
.status[data-state="busy"]{color:#1d4ed8}
form{margin:0;display:flex;flex-direction:column;gap:10px}
.field{display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--muted)}
.input{position:relative;display:flex;align-items:center}
.input svg.lead{position:absolute;left:14px;width:18px;height:18px;color:#94a3b8;pointer-events:none}
.input input{width:100%;height:46px;padding:0 44px 0 42px;border:1px solid #dbe3ee;border-radius:10px;
  background:#fbfdff;font:inherit;font-size:14.5px;color:var(--ink);outline:none;transition:border-color .15s,box-shadow .15s}
.input input::placeholder{color:#94a3b8}
.input input:focus{border-color:#7ea2ff;box-shadow:0 0 0 3px rgba(37,99,235,.12);background:#fff}
.input .reveal{position:absolute;right:6px;height:34px;padding:0 10px;border:0;border-radius:8px;
  background:transparent;color:#64748b;font:inherit;font-size:12.5px;cursor:pointer}
.input .reveal:hover{background:#f1f5f9;color:#334155}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;color:#475569}
.row label{display:flex;align-items:center;gap:8px;cursor:pointer}
.row input[type=checkbox]{width:16px;height:16px;accent-color:var(--blue)}
.row a{color:#2563eb;text-decoration:none}
.row a:hover{text-decoration:underline}
button.primary{height:46px;border:0;border-radius:10px;cursor:pointer;
  background:linear-gradient(180deg,#2b6bff,#1f5eff);color:#fff;font:inherit;font-size:15px;font-weight:650;
  box-shadow:0 10px 22px -12px rgba(31,94,255,.75);transition:filter .15s,transform .05s}
button.primary:hover{filter:brightness(1.04)}
button.primary:active{transform:translateY(1px)}
button.primary[disabled]{opacity:.6;cursor:progress}
button.ghost{height:38px;border:1px solid #dbe3ee;border-radius:10px;background:#fff;cursor:pointer;
  color:#334155;font:inherit;font-size:13px}
.split{display:flex;align-items:center;gap:12px;color:#94a3b8;font-size:12.5px}
.split::before,.split::after{content:"";flex:1;height:1px;background:#e2e8f0}
.token{padding:2px 0 0}
.token summary{cursor:pointer;color:#475569;font-size:13px;list-style:none}
.token summary::-webkit-details-marker{display:none}
.token summary::before{content:"›";display:inline-block;margin-right:8px;transition:transform .15s}
.token[open] summary::before{transform:rotate(90deg)}
.token form{margin-top:10px}
.token .hint{margin:0;color:#94a3b8;font-size:12px;line-height:1.5}
.token .hint code{font-family:var(--vx-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;color:#475569}
.foot{margin:0;text-align:center;color:#64748b;font-size:13px}
.foot a{color:#2563eb;text-decoration:none}
.foot a:hover{text-decoration:underline}
.methods{margin:0;min-height:0;color:#94a3b8;font-size:12px}
@media (max-height:760px){
  .card{gap:8px;padding:18px 26px}
  .card .logo img{height:36px}
  .card h2{font-size:21px}
  .input input{height:42px}
  button.primary{height:42px}
}
@media (max-width:960px){
  .stage{grid-template-columns:minmax(0,1fr);justify-items:center}
  .hero{display:none}
  .card{max-height:calc(100dvh - 120px)}
}
</style>${workspaceSessionScript}</head>
<body><main id="vexnar-sign-in">
<header class="nav">
  <div class="brand">
    <img src="/vexnar-brand/logo.png" alt="VEXNAR">
    <span class="word">VEXNAR</span><span class="rule"></span><span class="sub">Harness</span>
  </div>
  <nav class="links">
    <a href="${HARNESS_DOCS}" target="_blank" rel="noreferrer noopener">产品文档</a>
    <a href="${API_SERVICES}" target="_blank" rel="noreferrer noopener">API Services</a>
    <a href="${API_STATUS}" target="_blank" rel="noreferrer noopener">API</a>
    <a href="${support.replace(/&/gu, '&amp;')}" target="_blank" rel="noreferrer noopener">支持中心</a>
  </nav>
</header>
<div class="stage">
  <section class="hero">
    <span class="pill">VEXNAR · Harness</span>
    <h1>自主渗透测试 <span>Agent</span></h1>
    <p>基于多智能体的自动化渗透测试平台</p>
    <ul class="features">
      <li>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.6"/><path d="M12 2.2v3.4M12 18.4v3.4M2.2 12h3.4M18.4 12h3.4"/></svg>
        <span>资产发现</span>
      </li>
      <li>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3.2 20.4 8 12 12.8 3.6 8z"/><path d="M3.6 12.2 12 17l8.4-4.8"/><path d="M3.6 16.2 12 21l8.4-4.8"/></svg>
        <span>漏洞验证</span>
      </li>
      <li>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="17.5" cy="6" r="2.6"/><circle cx="6.5" cy="12" r="2.6"/><circle cx="17.5" cy="18" r="2.6"/><path d="M9 10.8 15 7.2M9 13.2l6 3.6"/></svg>
        <span>攻击链分析</span>
      </li>
      <li>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4M9 12h6M9 15.5h6M9 19h4"/></svg>
        <span>报告生成</span>
      </li>
    </ul>
  </section>
  <section class="card" aria-labelledby="card-title">
    <div class="logo"><img src="/vexnar-brand/logo.png" alt=""><span class="lock">VEXNAR</span><span class="lock-rule"></span><span class="lock-sub">Harness</span></div>
    <h2 id="card-title">欢迎登录</h2>
    <p class="sub">登录 Harness，开启自主渗透测试</p>
    <p id="notice" class="status" role="status" aria-live="polite" data-state="busy">正在检查账户状态…</p>
    <form id="password-login" novalidate>
      <label class="field" for="account-name">账号
        <span class="input">
          <svg class="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8.2" r="3.6"/><path d="M5 20c.8-3.4 3.6-5.4 7-5.4s6.2 2 7 5.4"/></svg>
          <input id="account-name" name="username" autocomplete="username" spellcheck="false"
            placeholder="用户名 / 邮箱" required>
        </span>
      </label>
      <label class="field" for="account-secret">密码
        <span class="input">
          <svg class="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4.5" y="10" width="15" height="10" rx="2.2"/><path d="M8 10V7.4a4 4 0 0 1 8 0V10"/></svg>
          <input id="account-secret" name="password" type="password" autocomplete="current-password"
            placeholder="请输入密码" required>
        </span>
      </label>
      <div class="row">
        <label><input type="checkbox" id="remember" checked>记住我</label>
        <a href="${origin}/console/forgot" target="_blank" rel="noreferrer noopener">忘记密码？</a>
      </div>
      <button class="primary" type="submit">登 录</button>
    </form>
    <form id="verify-login" novalidate hidden>
      <label class="field" for="verify-code">两步验证码
        <span class="input">
          <svg class="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="3.5" width="12" height="17" rx="2.2"/><path d="M9.6 17.4h4.8"/></svg>
          <input id="verify-code" name="code" inputmode="numeric" autocomplete="one-time-code"
            placeholder="6 位数字" required>
        </span>
      </label>
      <button class="primary" type="submit">验证并登录</button>
    </form>
    <details class="token">
      <summary>使用访问令牌登录</summary>
      <form id="token-login" novalidate>
        <span class="input">
          <svg class="lead" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8.4" cy="12" r="3.4"/><path d="M11.8 12H20M17 12v3.2M14.4 12v2.4"/></svg>
          <input id="token-input" name="access_token" type="password" autocomplete="off" spellcheck="false"
            placeholder="粘贴访问令牌" required>
          <button class="reveal" id="reveal" type="button" aria-pressed="false" aria-label="显示访问令牌">显示</button>
        </span>
        <button class="primary" type="submit">使用访问令牌登录</button>
        <p class="hint">在希灵 AI「个人设置 → 访问令牌」创建，名称用
          <code>VERNAX-随机 UUID</code>；没有令牌时可以先
          <a id="online" href="${origin}/console/token" target="_blank" rel="noopener noreferrer">在线生成</a>。</p>
      </form>
    </details>
    <p id="methods" class="methods"></p>
    <button id="retry" class="ghost" type="button" hidden>重新检测连接</button>
    <p class="foot">还没有账户？<a href="${origin}/register" target="_blank" rel="noreferrer noopener">立即注册</a></p>
  </section>
</div>
</main></body></html>`
