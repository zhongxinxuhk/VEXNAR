// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

const script = '/vexnar-api/platform/entry.js'
export const workspaceSessionScript = `<script defer src="${script}"></script>`

export const loginPage = (origin: string): string => `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'self'">
<title>登录 VEXNAR</title><link rel="icon" href="/vexnar-brand/favicon.png">
<style>
*{box-sizing:border-box} [hidden]{display:none!important}
:root{font:15px/1.5 system-ui,-apple-system,"PingFang SC",sans-serif;color:#112435;background:#eef4f5}
body{margin:0} main{min-height:100dvh;display:grid;grid-template-columns:minmax(230px,35%) 1fr}
aside{display:flex;align-items:flex-start;flex-direction:column;justify-content:space-between;padding:clamp(28px,6vw,80px);background:#102e37;color:#f1fffa}
.brand{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:700;letter-spacing:.09em}
.brand img{width:36px;height:36px;border-radius:9px;object-fit:cover}
aside p{color:#b0cfce;margin:4px 0} section{display:grid;align-content:center;justify-items:start;padding:clamp(22px,8vw,124px)}
.content{width:min(100%,450px)} h1{font-size:clamp(25px,4vw,39px);letter-spacing:-.035em;margin:0 0 4px}
p{margin:0 0 22px;color:#4b6470} form{display:grid;gap:14px;margin:0 0 18px}
label{display:grid;gap:5px;font-weight:600} input,button,.online{width:100%;font:inherit;border-radius:9px;min-height:42px}
input{border:1px solid #9bb0b5;background:#fff;color:inherit;padding:8px 11px}
button{color:#15343d;background:#fff;border:1px solid #9bb0b5;padding:8px 12px;cursor:pointer;font-weight:600}
button.primary,.online{background:#086b5d;color:#fff;border-color:#086b5d}
.online{display:grid;place-items:center;font-weight:600;text-decoration:none} .hint{font-size:13px;margin-top:8px} button:disabled{opacity:.62;cursor:wait} :focus-visible{outline:3px solid #14a489;outline-offset:3px}
.methods{margin:12px 0 16px;font-size:13px;overflow-wrap:anywhere}
#notice:not(:empty){margin:0 0 16px;color:#355760}
#notice[data-error="true"]{color:#9c3139}
@media(max-width:650px){main{grid-template-columns:1fr;grid-template-rows:auto 1fr}aside{padding:18px 22px}aside p{display:none}section{align-content:start;justify-items:center;padding:35px 22px}}
</style>${workspaceSessionScript}</head>
<body><main id="vexnar-sign-in"><aside><div class="brand"><img src="/vexnar-brand/favicon.png" alt="">VEXNAR</div><p>希灵 AI</p></aside>
<section><div class="content"><h1>登录 VEXNAR</h1><p>登录希灵 AI 后进入工作区。</p>
<div id="notice" aria-live="polite">正在检查账户状态…</div>
<a class="online" href="${origin}/login" target="_blank" rel="noopener noreferrer">打开希灵 AI 在线登录</a>
<p id="methods" class="methods"></p>
<p class="hint">在希灵 AI 完成登录后，到个人设置创建访问令牌，再回到此页粘贴。令牌名称使用 <code>VERNAX-随机 UUID</code>，并按需授权账户、模型密钥、充值和订阅权限。</p>
<form id="token-login">
<label>平台访问令牌<input name="access_token" type="password" autocomplete="off" spellcheck="false" required></label>
<button class="primary" type="submit">使用访问令牌登录</button></form>
<button id="retry" type="button" hidden>重新检测</button>
</div></section></main></body></html>`
