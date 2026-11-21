const script = "/vexnar-api/platform/entry.js";
const workspaceSessionScript = `<script defer src="${script}"></script>`;
const loginPage = `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'self'">
<title>\u767B\u5F55 VEXNAR</title><link rel="icon" href="/vexnar-brand/favicon.png">
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
label{display:grid;gap:5px;font-weight:600} input,button{width:100%;font:inherit;border-radius:9px;min-height:42px}
input{border:1px solid #9bb0b5;background:#fff;color:inherit;padding:8px 11px}
button{color:#15343d;background:#fff;border:1px solid #9bb0b5;padding:8px 12px;cursor:pointer;font-weight:600}
button.primary{background:#086b5d;color:#fff;border-color:#086b5d}
button:disabled{opacity:.62;cursor:wait} :focus-visible{outline:3px solid #14a489;outline-offset:3px}
.methods{margin:12px 0 16px;font-size:13px;overflow-wrap:anywhere}
#notice:not(:empty){margin:0 0 16px;color:#355760}
#notice[data-error="true"]{color:#9c3139}
@media(max-width:650px){main{grid-template-columns:1fr;grid-template-rows:auto 1fr}aside{padding:18px 22px}aside p{display:none}section{align-content:start;justify-items:center;padding:35px 22px}}
</style>${workspaceSessionScript}</head>
<body><main id="vexnar-sign-in"><aside><div class="brand"><img src="/vexnar-brand/favicon.png" alt="">VEXNAR</div><p>HXSEC AI Platform</p></aside>
<section><div class="content"><h1>\u767B\u5F55 VEXNAR</h1><p>\u767B\u5F55 HXSEC AI Platform \u540E\u8FDB\u5165\u5DE5\u4F5C\u533A\u3002</p>
<div id="notice" aria-live="polite">\u6B63\u5728\u68C0\u67E5\u8D26\u6237\u72B6\u6001\u2026</div>
<form id="password-login" hidden>
<label>\u5E73\u53F0\u8D26\u53F7<input name="username" autocomplete="username" required></label>
<label>\u5BC6\u7801<input name="password" type="password" autocomplete="current-password" required></label>
<button class="primary" type="submit">\u767B\u5F55</button></form>
<form id="verify-login" hidden><label>\u4E24\u6B65\u9A8C\u8BC1\u4EE3\u7801<input name="code" autocomplete="one-time-code" required></label>
<button class="primary" type="submit">\u9A8C\u8BC1\u5E76\u767B\u5F55</button>
<button id="back" type="button">\u8FD4\u56DE\u767B\u5F55</button></form>
<div id="browser-options" hidden><button id="browser-login" type="button">\u5728\u5E73\u53F0\u7A97\u53E3\u767B\u5F55</button><p id="methods" class="methods"></p></div>
<button id="retry" type="button" hidden>\u91CD\u65B0\u68C0\u6D4B</button>
</div></section></main></body></html>`;
export {
  loginPage,
  workspaceSessionScript
};
