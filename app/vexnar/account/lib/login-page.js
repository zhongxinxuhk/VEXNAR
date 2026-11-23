const script = "/vexnar-api/platform/entry.js";
const workspaceSessionScript = `<script defer src="${script}"></script>`;
const loginPage = (origin) => `<!doctype html>
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
<body><main id="vexnar-sign-in"><aside><div class="brand"><img src="/vexnar-brand/favicon.png" alt="">VEXNAR</div><p>\u5E0C\u7075 AI</p></aside>
<section><div class="content"><h1>\u767B\u5F55 VEXNAR</h1><p>\u767B\u5F55\u5E0C\u7075 AI \u540E\u8FDB\u5165\u5DE5\u4F5C\u533A\u3002</p>
<div id="notice" aria-live="polite">\u6B63\u5728\u68C0\u67E5\u8D26\u6237\u72B6\u6001\u2026</div>
<a class="online" href="${origin}/login" target="_blank" rel="noopener noreferrer">\u6253\u5F00\u5E0C\u7075 AI \u5728\u7EBF\u767B\u5F55</a>
<p id="methods" class="methods"></p>
<p class="hint">\u5728\u5E0C\u7075 AI \u5B8C\u6210\u767B\u5F55\u540E\uFF0C\u5230\u4E2A\u4EBA\u8BBE\u7F6E\u521B\u5EFA\u8BBF\u95EE\u4EE4\u724C\uFF0C\u518D\u56DE\u5230\u6B64\u9875\u7C98\u8D34\u3002\u4EE4\u724C\u540D\u79F0\u4F7F\u7528 <code>VERNAX-\u968F\u673A UUID</code>\uFF0C\u5E76\u6388\u6743\u8BFB\u53D6\u8D26\u6237\u3001\u7BA1\u7406\u6A21\u578B\u5BC6\u94A5\u53CA\u8BFB\u53D6\u5145\u503C\u4E0E\u8BA2\u9605\u4FE1\u606F\u3002</p>
<form id="token-login">
<label>\u5E73\u53F0\u8BBF\u95EE\u4EE4\u724C<input name="access_token" type="password" autocomplete="off" spellcheck="false" required></label>
<button class="primary" type="submit">\u4F7F\u7528\u8BBF\u95EE\u4EE4\u724C\u767B\u5F55</button></form>
<button id="retry" type="button" hidden>\u91CD\u65B0\u68C0\u6D4B</button>
</div></section></main></body></html>`;
export {
  loginPage,
  workspaceSessionScript
};
