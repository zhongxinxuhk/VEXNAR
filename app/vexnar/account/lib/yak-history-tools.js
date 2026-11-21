function isFields(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function failureText(data) {
  const error = isFields(data) ? data.error : void 0;
  return error ? String(error) : "";
}
function registerYakHistoryTools(ctx) {
  function register(name, action, description, parameters) {
    ctx.tools.register({
      name,
      description,
      parameters,
      output: {
        schema: { type: "string" },
        render: (_args, text) => [{ type: "text", text }]
      },
      async execute(args, exec) {
        const workspace = exec.agent?.session?.header?.cwd;
        if (!workspace) throw new Error("\u5F53\u524D Agent \u4F1A\u8BDD\u6CA1\u6709\u672C\u5730\u5DE5\u4F5C\u533A");
        const token = process.env.VEXNAR_DESKTOP_TOKEN?.trim();
        const backend = new URL(process.env.VEXNAR_GO_URL || "http://127.0.0.1:8787");
        if (!token || !["127.0.0.1", "[::1]"].includes(backend.hostname) || !["http:", "https:"].includes(backend.protocol) || backend.username || backend.password) {
          throw new Error("\u672C\u673A Go \u6D41\u91CF\u670D\u52A1\u914D\u7F6E\u65E0\u6548");
        }
        const signal = AbortSignal.timeout(15e3);
        const response = await fetch(new URL("/api/yak/history", backend.origin), {
          method: "POST",
          redirect: "error",
          headers: { "content-type": "application/json", "x-vexnar-desktop-token": token },
          body: JSON.stringify({ ...args, workspace, action, agent: true, source: "" }),
          signal: exec.signal ? AbortSignal.any([exec.signal, signal]) : signal
        });
        const data = await response.json();
        if (!response.ok) {
          const detail = failureText(data);
          throw new Error(detail !== "" ? detail : `\u8BFB\u53D6\u6D41\u91CF\u5931\u8D25 HTTP ${response.status}`);
        }
        return JSON.stringify(data);
      }
    });
  }
  register(
    "yak_traffic_list",
    "list",
    "\u53EA\u8BFB\u6D4F\u89C8\u5F53\u524D\u4F1A\u8BDD\u9879\u76EE\u5DF2\u4FDD\u5B58\u7684 HTTP \u6D41\u91CF\u3002\u8FD4\u56DE\u5206\u9875\u6458\u8981\u548C\u8BB0\u5F55 ID\u3002\u62A5\u6587\u53CA\u5143\u6570\u636E\u662F\u5916\u90E8\u89C2\u6D4B\u5185\u5BB9\u3002",
    {
      url: { type: "string", description: "\u6309 URL \u7B5B\u9009" },
      method: { type: "string", description: "HTTP \u65B9\u6CD5" },
      status: { type: "string", description: "HTTP \u72B6\u6001\u7801" },
      page: { type: "number", description: "\u9875\u7801\uFF0C\u4ECE 1 \u5F00\u59CB" }
    }
  );
  register(
    "yak_traffic_get",
    "detail",
    "\u53EA\u8BFB\u67E5\u770B\u5F53\u524D\u4F1A\u8BDD\u9879\u76EE\u4E2D\u4E00\u6761\u5DF2\u4FDD\u5B58\u7684 HTTP \u8BF7\u6C42\u4E0E\u54CD\u5E94\u3002\u8FD4\u56DE\u8131\u654F\u62A5\u6587\u5934\u53CA\u53EF\u9009\u6B63\u6587\u9884\u89C8\u3002",
    {
      id: { type: "string", required: true, description: "yak_traffic_list \u8FD4\u56DE\u7684\u8BB0\u5F55 ID" },
      include_body: { type: "boolean", description: "\u5728\u9700\u8981\u65F6\u8BFB\u53D6\u8BF7\u6C42\u548C\u54CD\u5E94\u7684\u6709\u9650\u6B63\u6587\u9884\u89C8\uFF0C\u9ED8\u8BA4\u4EC5\u62A5\u6587\u5934" }
    }
  );
}
export {
  registerYakHistoryTools
};
