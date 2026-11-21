import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
const MAX_BODY = 4 * 1024 * 1024;
function isFields(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function failure(status, message) {
  return Object.assign(new Error(message), { status });
}
function statusOf(error) {
  if (isFields(error) && typeof error.status === "number") return error.status;
  return 502;
}
function errorText(error) {
  if (isFields(error) && typeof error.message === "string") return error.message;
  return "\u6A21\u578B\u7F51\u5173\u5931\u8D25";
}
function upstreamError(data) {
  if (!isFields(data) || !isFields(data.error)) return "";
  const message = data.error.message;
  return message ? String(message) : "";
}
function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw failure(413, "\u8BF7\u6C42\u6B63\u6587\u8FC7\u5927");
    chunks.push(chunk);
  }
  if (size === 0) return {};
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw failure(400, "\u65E0\u6548\u7684 JSON \u8BF7\u6C42");
  }
  return isFields(parsed) ? parsed : {};
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
const textOf = (data) => {
  const outputText = data.output_text;
  if (outputText !== void 0 && outputText !== null) return outputText;
  const output = data.output;
  if (Array.isArray(output)) {
    const items = output;
    const parts = items.flatMap((item) => {
      const content = isFields(item) && Array.isArray(item.content) ? item.content : [];
      return content;
    });
    return parts.map((part) => isFields(part) && part.text !== void 0 && part.text !== null ? part.text : "").join("");
  }
  const choices = data.choices;
  if (Array.isArray(choices)) {
    const first = choices[0];
    if (isFields(first) && isFields(first.message)) return first.message.content;
  }
  return void 0;
};
function textValue(data) {
  const text = textOf(data);
  return typeof text === "string" ? text : "";
}
function chatOf(data) {
  const content = textValue(data);
  return { object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] };
}
function responsesOf(data) {
  const text = textValue(data);
  return { object: "response", output_text: text, output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }] };
}
async function startModelGateway(getProviders) {
  const token = process.env.VEXNAR_GATEWAY_TOKEN?.trim() || randomBytes(24).toString("hex");
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/models") {
        const models = getProviders().flatMap((provider) => provider.models);
        return send(res, 200, { object: "list", data: models });
      }
      if (req.method !== "POST") return send(res, 405, { error: { message: "\u8BF7\u6C42\u65B9\u6CD5\u4E0D\u53D7\u652F\u6301" } });
      if (req.headers["x-vexnar-desktop-token"] !== token) {
        return send(res, 401, { error: { message: "\u6A21\u578B\u7F51\u5173\u4EE4\u724C\u65E0\u6548" } });
      }
      const providers = getProviders();
      const primary = providers[0];
      if (primary === void 0) return send(res, 503, { error: { message: "\u5C1A\u672A\u914D\u7F6E\u53EF\u7528\u7684\u6A21\u578B\u63D0\u4F9B\u65B9" } });
      const chat = providers.find((provider) => provider.id !== "vexnar");
      const responses = providers.find((provider) => provider.id === "vexnar") ?? primary;
      const body = await readBody(req);
      const requested = body.model;
      const model = typeof requested === "string" && requested.trim() !== "" ? requested : primary.models[0]?.id ?? "default";
      if (req.url === "/chat/completions") {
        if (chat !== void 0) return send(res, 200, await upstream(chat, "/chat/completions", { ...body, model }));
        const messages = body.messages;
        const created = await upstream(responses, "/responses", {
          model,
          input: Array.isArray(messages) ? messages : [],
          stream: false
        });
        return send(res, 200, chatOf(created));
      }
      if (req.url === "/responses") {
        const targetChat = chat ?? responses;
        if (chat !== void 0) return send(res, 200, await upstream(chat, "/chat/completions", {
          model,
          messages: Array.isArray(body.input) ? body.input.map((item) => typeof item === "string" ? { role: "user", content: item } : item) : [],
          stream: false
        }).then(responsesOf));
        return send(res, 200, await upstream(targetChat, "/responses", { ...body, model }));
      }
      return send(res, 404, { error: { message: `\u672A\u5B9E\u73B0\u7684\u7F51\u5173\u7AEF\u70B9 ${req.url}` } });
    } catch (error) {
      send(res, statusOf(error), { error: { message: errorText(error) } });
    }
  });
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("\u6A21\u578B\u7F51\u5173\u6CA1\u6709\u62FF\u5230\u76D1\u542C\u7AEF\u53E3");
  return {
    url: `http://127.0.0.1:${address.port}`,
    token,
    close: () => new Promise((done) => server.close(() => done()))
  };
}
export {
  startModelGateway
};
