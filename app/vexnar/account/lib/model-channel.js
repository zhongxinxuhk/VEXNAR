function isFields(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function failure(status, message) {
  return Object.assign(new Error(message), { status });
}
function upstreamError(data) {
  if (!isFields(data) || !isFields(data.error)) return "";
  const message = data.error.message;
  return message ? String(message) : "";
}
async function upstream(provider, path, payload) {
  let response;
  try {
    response = await fetch(`${provider.base.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.key}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(18e4)
    });
  } catch {
    throw failure(502, `\u65E0\u6CD5\u8FDE\u63A5\u6A21\u578B\u63D0\u4F9B\u65B9 ${provider.name}`);
  }
  const text = await response.text();
  let data;
  try {
    data = text === "" ? {} : JSON.parse(text);
  } catch {
    data = void 0;
  }
  if (!response.ok) {
    const detail = upstreamError(data);
    throw failure(502, `${provider.name} \u8FD4\u56DE ${response.status}${detail === "" ? "" : `\uFF1A${detail}`}`);
  }
  if (data === void 0) throw failure(502, `${provider.name} \u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u54CD\u5E94`);
  return isFields(data) ? data : {};
}
function textOf(data) {
  const outputText = data.output_text;
  if (typeof outputText === "string") return outputText;
  const output = data.output;
  if (Array.isArray(output)) {
    const parts = output.flatMap((item) => {
      const content = isFields(item) && Array.isArray(item.content) ? item.content : [];
      return content;
    });
    return parts.map((part) => isFields(part) && typeof part.text === "string" ? part.text : "").join("");
  }
  const choices = data.choices;
  if (Array.isArray(choices)) {
    const first = choices[0];
    if (isFields(first) && isFields(first.message) && typeof first.message.content === "string") return first.message.content;
  }
  return "";
}
function createModelCompletion(getProviders, preferred) {
  return async (messages) => {
    const providers = getProviders();
    const primary = providers[0];
    if (primary === void 0) throw failure(503, "\u5C1A\u672A\u914D\u7F6E\u53EF\u7528\u7684\u6A21\u578B\u63D0\u4F9B\u65B9");
    const model = (preferred?.() ?? "").trim() || primary.models[0]?.id || "default";
    const chat = providers.find((provider) => provider.id !== "vexnar");
    const input = messages.map((message) => ({ role: message.role, content: message.content }));
    if (chat !== void 0) {
      return textOf(await upstream(chat, "/chat/completions", { model, messages: input, stream: false }));
    }
    const responses = providers.find((provider) => provider.id === "vexnar") ?? primary;
    return textOf(await upstream(responses, "/responses", { model, input, stream: false }));
  };
}
export {
  createModelCompletion
};
