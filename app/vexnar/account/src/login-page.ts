// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

const script = '/vexnar-api/platform/entry.js'
export const workspaceSessionScript = `<script defer src="${script}"></script>`

/**
 * 登录页。
 *
 * 约束来自 CSP（`default-src 'none'`）：不能引外部字体、图标或脚本，所有视觉都
 * 用内联 CSS 与字符画出来。页面只有一件事要做——让人知道"客户端在、平台在哪、
 * 下一步点哪里"，所以信息顺序是：身份/状态 → 主操作（粘贴访问令牌）→ 备选入口
 * → 方法说明。视觉跟随 VEXNAR 的深青品牌色，与工作区是同一个人写的界面。
 */
export const loginPage = (origin: string): string => `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'self'">
<meta name="color-scheme" content="dark light">
<title>登录 VEXNAR</title><link rel="icon" href="/vexnar-brand/favicon.png">
<style>
*{box-sizing:border-box}
[hidden]{display:none!important}
:root{
  --ink:#0d1f24;--ink-soft:#425c63;--paper:#f6faf9;--line:#d3e2df;
  --brand:#0b6b5c;--brand-strong:#075246;--brand-soft:#e2f2ee;
  --danger:#a1282f;--ok:#0b6b5c;
  font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
  color:var(--ink);background:var(--paper)
}
body{margin:0}
main{min-height:100dvh;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr)}
/* 左：品牌面。渐变与网格都是纯 CSS，不依赖外部图片。 */
.veil{
  position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;
  padding:clamp(30px,5vw,64px);color:#eefaf6;
  background:
    radial-gradient(120% 90% at 8% 4%,#137c69 0%,transparent 58%),
    radial-gradient(100% 80% at 96% 100%,#063d37 0%,transparent 62%),
    linear-gradient(160deg,#0a2f2c 0%,#08211f 55%,#061a19 100%);
}
.veil::after{
  content:"";position:absolute;inset:0;pointer-events:none;opacity:.32;
  background-image:linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px);
  background-size:46px 46px;
  mask-image:radial-gradient(75% 60% at 30% 25%,#000 0%,transparent 100%)
}
.veil>*{position:relative;z-index:1}
.brand{display:flex;align-items:center;gap:13px;font-weight:700;letter-spacing:.14em;font-size:16px}
.brand img{width:40px;height:40px;border-radius:11px;object-fit:cover;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.brand small{display:block;font-size:11px;font-weight:500;letter-spacing:.22em;color:#8fc7bd}
.headline{margin:8vh 0 0;max-width:30ch}
.headline p.kicker{margin:0 0 14px;font-size:12px;letter-spacing:.24em;color:#8fc7bd;text-transform:uppercase}
.headline h1{margin:0;font-size:clamp(28px,3.1vw,44px);line-height:1.16;letter-spacing:-.02em}
.headline h1 em{font-style:normal;color:#7fe0c9}
.headline p.lead{margin:18px 0 0;color:#b9d9d3;font-size:clamp(14px,1.1vw,16px);max-width:34ch}
.points{list-style:none;margin:34px 0 0;padding:0;display:grid;gap:12px;max-width:40ch}
.points li{display:flex;gap:11px;align-items:flex-start;color:#cfe8e2;font-size:14px}
.points span.dot{flex:none;width:22px;height:22px;border-radius:7px;display:grid;place-items:center;
  background:rgba(127,224,201,.14);color:#7fe0c9;font-size:12px;font-weight:700}
.foot{margin:0;color:#7fa9a2;font-size:12px;letter-spacing:.04em}
/* 右：登录面 */
.pane{display:grid;align-content:center;justify-items:center;padding:clamp(24px,5vw,72px)}
.card{width:min(100%,430px);display:grid;gap:18px}
.card header h2{margin:0 0 6px;font-size:clamp(22px,2.2vw,27px);letter-spacing:-.02em}
.card header p{margin:0;color:var(--ink-soft);font-size:14px}
.status{
  display:flex;align-items:center;gap:9px;margin:0;padding:11px 13px;border-radius:11px;
  background:var(--brand-soft);color:var(--brand-strong);font-size:13.5px;min-height:44px;
  border:1px solid #cbe4dd
}
.status[data-error="true"]{background:#fdecec;color:var(--danger);border-color:#f3ccce}
.status[data-state="ready"]::before,
.status[data-state="busy"]::before,
.status[data-state="error"]::before{
  content:"";flex:none;width:9px;height:9px;border-radius:50%;background:currentColor
}
.status[data-state="busy"]::before{animation:pulse 1.1s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}
form{display:grid;gap:12px;margin:0}
label.field{display:grid;gap:6px;font-size:13px;font-weight:600;color:#22434a}
label.field small{font-weight:500;color:var(--ink-soft);font-size:12px}
.input{display:flex;align-items:stretch;border:1px solid #b9cfca;border-radius:11px;background:#fff;
  transition:border-color .15s ease,box-shadow .15s ease}
.input:focus-within{border-color:var(--brand);box-shadow:0 0 0 3px rgba(11,107,92,.14)}
.input input{flex:1;min-width:0;border:0;background:transparent;font:inherit;color:inherit;padding:12px 13px;border-radius:11px}
.input input:focus{outline:none}
.reveal{flex:none;border:0;border-left:1px solid #e0ebe8;background:transparent;color:var(--brand);
  font:inherit;font-size:12.5px;padding:0 12px;cursor:pointer;border-radius:0 10px 10px 0}
.reveal:focus-visible{outline:2px solid var(--brand);outline-offset:-2px}
button.primary{
  width:100%;min-height:46px;border:1px solid var(--brand-strong);border-radius:11px;cursor:pointer;
  background:linear-gradient(180deg,#0e7a68,#075a4d);color:#fff;font:inherit;font-weight:650;letter-spacing:.01em;
  box-shadow:0 8px 20px rgba(7,90,77,.22);transition:transform .12s ease,box-shadow .12s ease,opacity .12s ease
}
button.primary:hover{transform:translateY(-1px);box-shadow:0 11px 24px rgba(7,90,77,.28)}
button.primary:active{transform:none}
button:disabled{opacity:.6;cursor:wait;transform:none;box-shadow:none}
form[hidden]{display:none}
button.ghost{width:100%;min-height:44px;border:1px solid #b9cfca;border-radius:11px;background:#fff;
  color:var(--brand-strong);font:inherit;font-weight:600;cursor:pointer}
button.ghost:hover{background:#f3faf8}
a.online{display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;border-radius:11px;
  border:1px dashed #9dc2b9;color:var(--brand-strong);font-weight:600;text-decoration:none;background:#fbfefd}
a.online:hover{background:#f0faf7}
a.online::after{content:"↗";font-weight:700}
.divider{display:flex;align-items:center;gap:10px;color:#7b9490;font-size:12px}
.divider::before,.divider::after{content:"";height:1px;background:var(--line);flex:1}
details{border-top:1px solid var(--line);padding-top:12px;font-size:12.5px;color:var(--ink-soft)}
details summary{cursor:pointer;font-weight:600;color:#33615a;font-size:13px}
details p{margin:10px 0 0}
details ol{margin:10px 0 0;padding-left:18px;display:grid;gap:5px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:#eef5f3;
  border:1px solid #dbe8e4;border-radius:5px;padding:1px 5px}
.methods{margin:0;font-size:12px;color:var(--ink-soft);overflow-wrap:anywhere}
:focus-visible{outline:3px solid #12806c;outline-offset:2px}
@media(max-width:860px){
  main{grid-template-columns:1fr}
  .veil{padding:22px 22px 26px}
  .headline{margin:26px 0 0}
  .points{margin-top:20px;grid-template-columns:1fr}
  .foot{display:none}
  .pane{align-content:start;padding:26px 20px 40px}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>${workspaceSessionScript}</head>
<body><main id="vexnar-sign-in">
<aside class="veil" aria-label="VEXNAR 介绍">
  <div class="brand"><img src="/vexnar-brand/favicon.png" alt=""><span>VEXNAR<small>希灵 AI</small></span></div>
  <div class="headline">
    <p class="kicker">Autonomous Security Platform</p>
    <h1>让 <em>AI</em> 替你跑完<br>整条渗透链路</h1>
    <p class="lead">侦察、攻击面、利用、验证、报告，一条任务走完；每一步都留下可复现的证据。</p>
    <ul class="points">
      <li><span class="dot">1</span>会话感知的 HTTP 引擎与流量证据，结论能点回原始请求</li>
      <li><span class="dot">2</span>拦截规则与人工审批，危险动作先停下再决定</li>
      <li><span class="dot">3</span>任务、资产、漏洞与报告都在同一条数据链上</li>
    </ul>
  </div>
  <p class="foot">VEXNAR · 希灵 AI 安全平台</p>
</aside>
<section class="pane">
  <div class="card">
    <header>
      <h2>登录工作区</h2>
      <p>使用希灵 AI 账户访问 VEXNAR。</p>
    </header>
    <p id="notice" class="status" role="status" aria-live="polite" data-state="busy">正在检查账户状态…</p>
    <form id="password-login" novalidate>
      <label class="field" for="account-name">希灵 AI 账号
        <small>网关注册的邮箱或用户名</small>
      </label>
      <div class="input">
        <input id="account-name" name="username" autocomplete="username" spellcheck="false" required>
      </div>
      <label class="field" for="account-secret">密码
        <small>开启两步验证时会再要一次验证码</small>
      </label>
      <div class="input">
        <input id="account-secret" name="password" type="password" autocomplete="current-password" required>
      </div>
      <button class="primary" type="submit">账号密码登录</button>
    </form>
    <form id="verify-login" novalidate hidden>
      <label class="field" for="verify-code">两步验证码
        <small>打开验证器 App，输入 6 位数字</small>
      </label>
      <div class="input">
        <input id="verify-code" name="code" inputmode="numeric" autocomplete="one-time-code" required>
      </div>
      <button class="primary" type="submit">验证并登录</button>
    </form>
    <div class="divider">或使用访问令牌</div>
    <form id="token-login" novalidate>
      <label class="field" for="token-input">平台访问令牌
        <small>在希灵 AI「个人设置 → 访问令牌」创建，名称用 <code>VERNAX-随机 UUID</code></small>
      </label>
      <div class="input">
        <input id="token-input" name="access_token" type="password" autocomplete="off" spellcheck="false"
          placeholder="粘贴访问令牌" required>
        <button class="reveal" id="reveal" type="button" aria-pressed="false" aria-label="显示访问令牌">显示</button>
      </div>
      <button class="primary" type="submit">使用访问令牌登录</button>
    </form>
    <div class="divider">或</div>
    <a class="online" id="online" href="${origin}/console/token" target="_blank" rel="noopener noreferrer">在希灵 AI 生成访问令牌</a>
    <p id="methods" class="methods"></p>
    <details>
      <summary>没有访问令牌？</summary>
      <ol>
        <li>打开希灵 AI 并登录你的账户。</li>
        <li>进入「个人设置 → 访问令牌」，创建一个新令牌。</li>
        <li>按需勾选账户、模型密钥、充值与订阅权限。</li>
        <li>回到本页粘贴令牌，点「使用访问令牌登录」。</li>
      </ol>
      <p>登录后提供方与模型目录会自动同步；退出登录会同时删除访问令牌与已保存的 APIKEY。</p>
    </details>
    <button id="retry" class="ghost" type="button" hidden>重新检测连接</button>
  </div>
</section>
</main></body></html>`
