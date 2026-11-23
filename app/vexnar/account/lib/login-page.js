const script = "/vexnar-api/platform/entry.js";
const workspaceSessionScript = `<script defer src="${script}"></script>`;
const loginPage = (origin) => `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'self'">
<meta name="color-scheme" content="dark light">
<title>\u767B\u5F55 VEXNAR</title><link rel="icon" href="/vexnar-brand/favicon.png">
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
/* \u5DE6\uFF1A\u54C1\u724C\u9762\u3002\u6E10\u53D8\u4E0E\u7F51\u683C\u90FD\u662F\u7EAF CSS\uFF0C\u4E0D\u4F9D\u8D56\u5916\u90E8\u56FE\u7247\u3002 */
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
/* \u53F3\uFF1A\u767B\u5F55\u9762 */
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
button.ghost{width:100%;min-height:44px;border:1px solid #b9cfca;border-radius:11px;background:#fff;
  color:var(--brand-strong);font:inherit;font-weight:600;cursor:pointer}
button.ghost:hover{background:#f3faf8}
a.online{display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;border-radius:11px;
  border:1px dashed #9dc2b9;color:var(--brand-strong);font-weight:600;text-decoration:none;background:#fbfefd}
a.online:hover{background:#f0faf7}
a.online::after{content:"\u2197";font-weight:700}
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
<aside class="veil" aria-label="VEXNAR \u4ECB\u7ECD">
  <div class="brand"><img src="/vexnar-brand/favicon.png" alt=""><span>VEXNAR<small>\u5E0C\u7075 AI</small></span></div>
  <div class="headline">
    <p class="kicker">Autonomous Security Platform</p>
    <h1>\u8BA9 <em>AI</em> \u66FF\u4F60\u8DD1\u5B8C<br>\u6574\u6761\u6E17\u900F\u94FE\u8DEF</h1>
    <p class="lead">\u4FA6\u5BDF\u3001\u653B\u51FB\u9762\u3001\u5229\u7528\u3001\u9A8C\u8BC1\u3001\u62A5\u544A\uFF0C\u4E00\u6761\u4EFB\u52A1\u8D70\u5B8C\uFF1B\u6BCF\u4E00\u6B65\u90FD\u7559\u4E0B\u53EF\u590D\u73B0\u7684\u8BC1\u636E\u3002</p>
    <ul class="points">
      <li><span class="dot">1</span>\u4F1A\u8BDD\u611F\u77E5\u7684 HTTP \u5F15\u64CE\u4E0E\u6D41\u91CF\u8BC1\u636E\uFF0C\u7ED3\u8BBA\u80FD\u70B9\u56DE\u539F\u59CB\u8BF7\u6C42</li>
      <li><span class="dot">2</span>\u62E6\u622A\u89C4\u5219\u4E0E\u4EBA\u5DE5\u5BA1\u6279\uFF0C\u5371\u9669\u52A8\u4F5C\u5148\u505C\u4E0B\u518D\u51B3\u5B9A</li>
      <li><span class="dot">3</span>\u4EFB\u52A1\u3001\u8D44\u4EA7\u3001\u6F0F\u6D1E\u4E0E\u62A5\u544A\u90FD\u5728\u540C\u4E00\u6761\u6570\u636E\u94FE\u4E0A</li>
    </ul>
  </div>
  <p class="foot">VEXNAR \xB7 \u5E0C\u7075 AI \u5B89\u5168\u5E73\u53F0</p>
</aside>
<section class="pane">
  <div class="card">
    <header>
      <h2>\u767B\u5F55\u5DE5\u4F5C\u533A</h2>
      <p>\u4F7F\u7528\u5E0C\u7075 AI \u8D26\u6237\u8BBF\u95EE VEXNAR\u3002</p>
    </header>
    <p id="notice" class="status" role="status" aria-live="polite" data-state="busy">\u6B63\u5728\u68C0\u67E5\u8D26\u6237\u72B6\u6001\u2026</p>
    <form id="token-login" novalidate>
      <label class="field" for="token-input">\u5E73\u53F0\u8BBF\u95EE\u4EE4\u724C
        <small>\u5728\u5E0C\u7075 AI\u300C\u4E2A\u4EBA\u8BBE\u7F6E \u2192 \u8BBF\u95EE\u4EE4\u724C\u300D\u521B\u5EFA\uFF0C\u540D\u79F0\u7528 <code>VERNAX-\u968F\u673A UUID</code></small>
      </label>
      <div class="input">
        <input id="token-input" name="access_token" type="password" autocomplete="off" spellcheck="false"
          placeholder="\u7C98\u8D34\u8BBF\u95EE\u4EE4\u724C" required>
        <button class="reveal" id="reveal" type="button" aria-pressed="false" aria-label="\u663E\u793A\u8BBF\u95EE\u4EE4\u724C">\u663E\u793A</button>
      </div>
      <button class="primary" type="submit">\u4F7F\u7528\u8BBF\u95EE\u4EE4\u724C\u767B\u5F55</button>
    </form>
    <div class="divider">\u6216</div>
    <a class="online" id="online" href="${origin}/login" target="_blank" rel="noopener noreferrer">\u5728\u5E0C\u7075 AI \u7F51\u9875\u5B8C\u6210\u767B\u5F55</a>
    <p id="methods" class="methods"></p>
    <details>
      <summary>\u6CA1\u6709\u8BBF\u95EE\u4EE4\u724C\uFF1F</summary>
      <ol>
        <li>\u6253\u5F00\u5E0C\u7075 AI \u5E76\u767B\u5F55\u4F60\u7684\u8D26\u6237\u3002</li>
        <li>\u8FDB\u5165\u300C\u4E2A\u4EBA\u8BBE\u7F6E \u2192 \u8BBF\u95EE\u4EE4\u724C\u300D\uFF0C\u521B\u5EFA\u4E00\u4E2A\u65B0\u4EE4\u724C\u3002</li>
        <li>\u6309\u9700\u52FE\u9009\u8D26\u6237\u3001\u6A21\u578B\u5BC6\u94A5\u3001\u5145\u503C\u4E0E\u8BA2\u9605\u6743\u9650\u3002</li>
        <li>\u56DE\u5230\u672C\u9875\u7C98\u8D34\u4EE4\u724C\uFF0C\u70B9\u300C\u4F7F\u7528\u8BBF\u95EE\u4EE4\u724C\u767B\u5F55\u300D\u3002</li>
      </ol>
      <p>\u767B\u5F55\u540E\u63D0\u4F9B\u65B9\u4E0E\u6A21\u578B\u76EE\u5F55\u4F1A\u81EA\u52A8\u540C\u6B65\uFF1B\u9000\u51FA\u767B\u5F55\u4F1A\u540C\u65F6\u5220\u9664\u8BBF\u95EE\u4EE4\u724C\u4E0E\u5DF2\u4FDD\u5B58\u7684 APIKEY\u3002</p>
    </details>
    <button id="retry" class="ghost" type="button" hidden>\u91CD\u65B0\u68C0\u6D4B\u8FDE\u63A5</button>
  </div>
</section>
</main></body></html>`;
export {
  loginPage,
  workspaceSessionScript
};
