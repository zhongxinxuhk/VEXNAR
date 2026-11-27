// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

// HTTP 报文的结构化与逐行着色。
//
// 流量检查器要按 Burp 的方式展示一条往来：起始行、头部、空行、正文四段骨架
// 完全不同（请求行是 `方法 路径 协议`，响应行是 `协议 状态码 原因`），正文
// 又分 JSON / HTML / JS / 表单 / 二进制几种。这里把解析与切词做成纯函数，
// 渲染层只负责把 token 映射成颜色，逻辑可以单独单测。

export type PacketSide = "request" | "response" | "unknown";

/** token 的语义分类；渲染层把它映射成一种颜色。 */
export type SyntaxTone =
  | "method"
  | "url"
  | "query-key"
  | "query-value"
  | "proto"
  | "status"
  | "reason"
  | "header"
  | "value"
  | "cookie-key"
  | "cookie-value"
  | "key"
  | "string"
  | "number"
  | "literal"
  | "tag"
  | "attr"
  | "comment"
  | "punct"
  | "muted";

export type Token = { text: string; tone?: SyntaxTone };

export type PacketHeader = { name: string; value: string };

export type HttpPacket = {
  side: PacketSide;
  /** 起始行（请求行/状态行），已 trim。 */
  startLine: string;
  headers: PacketHeader[];
  /** 正文原文；报文没有空行分隔时为空串。 */
  body: string;
  /** 去掉 \r 的完整报文，便于逐行渲染。 */
  raw: string;
};

export type BodyKind = "json" | "html" | "xml" | "css" | "js" | "form" | "multipart" | "text" | "binary";

const BINARY_PREFIXES = [
  "image/",
  "audio/",
  "video/",
  "font/",
  "application/pdf",
  "application/zip",
  "application/gzip",
  "application/x-gzip",
  "application/octet-stream",
  "application/x-tar",
  "application/wasm",
  "application/x-protobuf",
];

/** 把 CRLF/CR 统一成 \n：逐行渲染和行号只认一种换行。 */
export function normalizeNewlines(raw: string): string {
  return raw.replace(/\r\n?/g, "\n");
}

function detectSide(startLine: string): PacketSide {
  // 录制器落库的响应行有两种写法：`HTTP/2 200` 和 `HTTP 200`（协议与状态码之间
  // 没有斜杠版本号），后者如果按请求行的 `方法 目标` 去认就会被误判成请求。
  if (/^HTTP(?:\/[\d.]+)?\s+\d{3}\b/i.test(startLine)) return "response";
  if (/^[A-Z][A-Z0-9-]*\s+\S+/.test(startLine)) return "request";
  return "unknown";
}

/** 拆出起始行 / 头部 / 正文；头部折行按 RFC 7230 并入上一行。 */
export function parseHttpPacket(rawInput: string): HttpPacket {
  const raw = normalizeNewlines(rawInput ?? "");
  const boundary = raw.indexOf("\n\n");
  const head = boundary < 0 ? raw : raw.slice(0, boundary);
  const body = boundary < 0 ? "" : raw.slice(boundary + 2);
  const lines = head.split("\n");
  const startLine = (lines[0] ?? "").trim();
  const headers: PacketHeader[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const previous = headers[headers.length - 1];
    if (/^[ \t]/.test(line) && previous) {
      previous.value = `${previous.value} ${line.trim()}`;
      continue;
    }
    const colon = line.indexOf(":");
    // 没有冒号的行（畸形报文、HTTP/2 伪头之外的残留）照样保留，只是名字为空。
    if (colon <= 0) {
      headers.push({ name: "", value: line });
      continue;
    }
    headers.push({ name: line.slice(0, colon), value: line.slice(colon + 1).replace(/^[ \t]+/, "") });
  }
  return { side: detectSide(startLine), startLine, headers, body, raw };
}

/** 大小写不敏感地取头部值。 */
export function packetHeader(packet: HttpPacket, name: string): string {
  const lower = name.toLowerCase();
  return packet.headers.find((h) => h.name.toLowerCase() === lower)?.value ?? "";
}

function looksLikeJson(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/** 正文类型：先看 content-type，缺失或过于笼统时按内容嗅探。 */
export function detectBodyKind(contentType: string, body: string): BodyKind {
  const ct = (contentType || "").toLowerCase();
  if (!body.trim()) return "text";
  if (ct.includes("json") || ct.includes("+json")) return "json";
  if (ct.includes("html")) return "html";
  if (ct.includes("xml") || ct.includes("+xml")) return "xml";
  if (ct.includes("x-www-form-urlencoded")) return "form";
  if (ct.includes("multipart/")) return "multipart";
  if (ct.includes("css")) return "css";
  if (ct.includes("javascript") || ct.includes("ecmascript")) return "js";
  if (BINARY_PREFIXES.some((prefix) => ct.startsWith(prefix))) return "binary";

  const trimmed = body.trimStart();
  if (trimmed.startsWith("<")) {
    const head = trimmed.slice(0, 64).toLowerCase();
    if (head.startsWith("<!doctype html") || head.startsWith("<html")) return "html";
    return "xml";
  }
  if (looksLikeJson(body)) return "json";
  return "text";
}

/** JSON 正文的美化结果；不是合法 JSON 时返回 null（调用方回退原文）。 */
export function prettyJsonBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

function tokenizeQuery(query: string): Token[] {
  // query 以 `?` 开头，它是 URL 的一部分，必须单独成 token 才会显示出来。
  const tokens: Token[] = [{ text: "?", tone: "punct" }];
  const parts = query.slice(1).split("&");
  parts.forEach((part, index) => {
    if (index > 0) tokens.push({ text: "&", tone: "punct" });
    if (!part) return;
    const eq = part.indexOf("=");
    if (eq < 0) {
      tokens.push({ text: part, tone: "query-key" });
      return;
    }
    tokens.push({ text: part.slice(0, eq), tone: "query-key" });
    tokens.push({ text: "=", tone: "punct" });
    tokens.push({ text: part.slice(eq + 1), tone: "query-value" });
  });
  return tokens;
}

/** 拆 URL：协议、主机、路径、查询串、锚点各自上色。 */
export function tokenizeUrl(url: string): Token[] {
  const tokens: Token[] = [];
  const match = /^([a-zA-Z][\w+.-]*:\/\/)?([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/.exec(url);
  if (!match) return [{ text: url, tone: "url" }];
  const [, scheme, authority, path, query, hash] = match;
  if (scheme) tokens.push({ text: scheme, tone: "muted" });
  if (authority) tokens.push({ text: authority, tone: "url" });
  if (path) tokens.push({ text: path, tone: "value" });
  if (query) tokens.push(...tokenizeQuery(query));
  if (hash) tokens.push({ text: hash, tone: "muted" });
  return tokens;
}

/** 起始行：请求行与状态行结构不同，切法也不同。 */
export function tokenizeStartLine(packet: HttpPacket, side: PacketSide = packet.side): Token[] {
  const line = packet.startLine;
  if (!line) return [];

  if (side === "response") {
    const match = /^(HTTP(?:\/[\d.]+)?)(\s+)(\d{3})(.*)$/i.exec(line);
    if (!match) return [{ text: line }];
    return [
      { text: match[1], tone: "proto" },
      { text: match[2] },
      { text: match[3], tone: "status" },
      { text: match[4], tone: "reason" },
    ];
  }

  const match = /^([A-Z][A-Z0-9-]*)(\s+)(\S+)(?:\s+(HTTP\/[\d.]+))?$/.exec(line);
  if (!match) return [{ text: line }];
  const tokens: Token[] = [{ text: match[1], tone: "method" }, { text: match[2] }];
  tokens.push(...tokenizeUrl(match[3]));
  if (match[4]) tokens.push({ text: " ", tone: "punct" }, { text: match[4], tone: "proto" });
  return tokens;
}

const COOKIE_LIKE = new Set(["cookie", "set-cookie"]);

function tokenizeCookieValue(value: string): Token[] {
  const tokens: Token[] = [];
  const parts = value.split(/;\s*(?=[^;]+?=)/);
  parts.forEach((part, index) => {
    if (index > 0) tokens.push({ text: "; ", tone: "punct" });
    const eq = part.indexOf("=");
    if (eq < 0) {
      tokens.push({ text: part, tone: "cookie-value" });
      return;
    }
    tokens.push({ text: part.slice(0, eq), tone: "cookie-key" });
    tokens.push({ text: "=", tone: "punct" });
    tokens.push({ text: part.slice(eq + 1), tone: "cookie-value" });
  });
  return tokens;
}

/** 头部行：名字一种色，值另一种；Cookie/URL 类的值再细分。 */
export function tokenizeHeader(header: PacketHeader): Token[] {
  if (!header.name) return [{ text: header.value, tone: "value" }];
  const tokens: Token[] = [
    { text: header.name, tone: "header" },
    { text: ":", tone: "punct" },
    { text: " ", tone: "punct" },
  ];
  const name = header.name.toLowerCase();
  if (COOKIE_LIKE.has(name)) {
    tokens.push(...tokenizeCookieValue(header.value));
  } else if (/^[<]?[a-zA-Z][\w+.-]*:\/\//.test(header.value)) {
    // Link/Location 这类值可能包在尖括号里（`<url>; rel="next"`），剥掉括号再拆 URL。
    const bracketed = /^<([^>]+)>(.*)$/.exec(header.value);
    if (bracketed) {
      tokens.push({ text: "<", tone: "punct" });
      tokens.push(...tokenizeUrl(bracketed[1]));
      tokens.push({ text: ">", tone: "punct" });
      if (bracketed[2]) tokens.push({ text: bracketed[2], tone: "muted" });
    } else {
      tokens.push(...tokenizeUrl(header.value));
    }
  } else if (name === "content-type") {
    const semi = header.value.indexOf(";");
    if (semi > 0) {
      tokens.push({ text: header.value.slice(0, semi), tone: "string" });
      tokens.push({ text: header.value.slice(semi), tone: "muted" });
    } else {
      tokens.push({ text: header.value, tone: "string" });
    }
  } else {
    tokens.push({ text: header.value, tone: "value" });
  }
  return tokens;
}

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g;

/** JSON 单行着色；键、字符串、数字、字面量、标点分开。 */
export function tokenizeJsonLine(line: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  for (const match of line.matchAll(JSON_TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ text: line.slice(cursor, index), tone: "punct" });
    if (match[1]) {
      tokens.push({ text: match[1], tone: match[2] ? "key" : "string" });
      if (match[2]) tokens.push({ text: match[2], tone: "punct" });
    } else if (match[3]) {
      tokens.push({ text: match[3], tone: "number" });
    } else if (match[4]) {
      tokens.push({ text: match[4], tone: "literal" });
    } else {
      tokens.push({ text: match[0], tone: "punct" });
    }
    cursor = index + match[0].length;
  }
  if (cursor < line.length) tokens.push({ text: line.slice(cursor), tone: "punct" });
  return tokens;
}

const TAG_PATTERN =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\?[\s\S]*?\?>|<\/?([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR_PATTERN = /([^\s=/>]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)?/g;

function tokenizeTag(text: string, name: string | undefined, attributes: string): Token[] {
  const tokens: Token[] = [];
  const open = text.startsWith("</") ? "</" : "<";
  tokens.push({ text: open, tone: "punct" });
  if (!name) {
    tokens.push({ text: text.slice(open.length), tone: "comment" });
    return tokens;
  }
  tokens.push({ text: name, tone: "tag" });
  // 自闭合标签的 `/` 紧跟在最后一个属性后面，不能当成属性名。
  const rest = attributes.replace(/\/\s*$/, "");
  for (const match of rest.matchAll(ATTR_PATTERN)) {
    if (!match[1]) continue;
    tokens.push({ text: " ", tone: "punct" });
    tokens.push({ text: match[1], tone: "attr" });
    if (match[2]) {
      tokens.push({ text: match[2].trim() === "=" ? "=" : match[2].trim(), tone: "punct" });
    }
    if (match[3]) tokens.push({ text: match[3], tone: "string" });
  }
  const tail = text.endsWith("/>") ? "/>" : ">";
  tokens.push({ text: tail, tone: "punct" });
  return tokens;
}

/** HTML/XML 单行着色：注释、标签名、属性名、属性值分开。 */
export function tokenizeMarkupLine(line: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  for (const match of line.matchAll(TAG_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ text: line.slice(cursor, index), tone: "value" });
    const full = match[0];
    if (full.startsWith("<!") || full.startsWith("<?")) {
      tokens.push({ text: full, tone: "comment" });
    } else {
      tokens.push(...tokenizeTag(full, match[1], match[2] ?? ""));
    }
    cursor = index + full.length;
  }
  if (cursor < line.length) tokens.push({ text: line.slice(cursor), tone: "value" });
  return tokens;
}

const JS_KEYWORDS = new Set([
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "yield",
]);

const CODE_TOKEN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b[A-Za-z_$][\w$]*\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** JS/CSS 单行着色：注释、字符串、关键字、数字。 */
export function tokenizeCodeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  for (const match of line.matchAll(CODE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ text: line.slice(cursor, index) });
    if (match[1]) tokens.push({ text: match[1], tone: "comment" });
    else if (match[2]) tokens.push({ text: match[2], tone: "string" });
    else if (match[3]) {
      tokens.push({ text: match[3], tone: JS_KEYWORDS.has(match[3]) ? "literal" : undefined });
    } else tokens.push({ text: match[0], tone: "number" });
    cursor = index + match[0].length;
  }
  if (cursor < line.length) tokens.push({ text: line.slice(cursor) });
  return tokens;
}

/** 表单正文：a=1&b=2，键值分色。 */
export function tokenizeFormLine(line: string): Token[] {
  const tokens: Token[] = [];
  line.split("&").forEach((part, index) => {
    if (index > 0) tokens.push({ text: "&", tone: "punct" });
    if (!part) return;
    const eq = part.indexOf("=");
    if (eq < 0) {
      tokens.push({ text: part, tone: "key" });
      return;
    }
    tokens.push({ text: part.slice(0, eq), tone: "key" });
    tokens.push({ text: "=", tone: "punct" });
    tokens.push({ text: part.slice(eq + 1), tone: "string" });
  });
  return tokens;
}

/** multipart 正文：边界行压暗，其余当普通文本。 */
export function tokenizeMultipartLine(line: string): Token[] {
  if (/^--/.test(line)) return [{ text: line, tone: "comment" }];
  const colon = line.indexOf(":");
  if (colon > 0 && !/\s/.test(line.slice(0, colon))) {
    return [
      { text: line.slice(0, colon), tone: "header" },
      { text: ":", tone: "punct" },
      { text: line.slice(colon + 1), tone: "value" },
    ];
  }
  return [{ text: line, tone: "value" }];
}

export function tokenizeBodyLine(kind: BodyKind, line: string): Token[] {
  switch (kind) {
    case "json":
      return tokenizeJsonLine(line);
    case "html":
    case "xml":
      return tokenizeMarkupLine(line);
    case "js":
    case "css":
      return tokenizeCodeLine(line);
    case "form":
      return tokenizeFormLine(line);
    case "multipart":
      return tokenizeMultipartLine(line);
    default:
      return [{ text: line }];
  }
}

export type HexRow = { offset: string; hex: string; ascii: string };

/** 二进制正文的十六进制预览：偏移 + 16 字节 + ASCII。 */
export function hexDump(body: string, limit = 512): { rows: HexRow[]; truncated: boolean } {
  const all = new TextEncoder().encode(body);
  const bytes = all.slice(0, limit);
  const rows: HexRow[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = Array.from(bytes.slice(offset, offset + 16));
    const hex = chunk.map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = chunk.map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("");
    rows.push({ offset: offset.toString(16).padStart(8, "0"), hex: hex.padEnd(47, " "), ascii });
  }
  return { rows, truncated: all.length > limit };
}

/** 报文体积（字节数），用于列表与详情页展示。 */
export function packetBytes(raw: string): number {
  if (!raw) return 0;
  return new TextEncoder().encode(raw).length;
}

/** 方法名的文字配色（起始行用）。 */
export function methodTextTone(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
    case "HEAD":
      return "text-sky-600 dark:text-sky-400";
    case "POST":
      return "text-emerald-600 dark:text-emerald-400";
    case "PUT":
      return "text-amber-600 dark:text-amber-400";
    case "PATCH":
      return "text-violet-600 dark:text-violet-400";
    case "DELETE":
      return "text-rose-600 dark:text-rose-400";
    case "OPTIONS":
      return "text-teal-600 dark:text-teal-400";
    default:
      return "text-foreground";
  }
}

/** 方法徽标的配色：按动词区分，列表和详情共用一套。 */
export function methodTone(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
    case "HEAD":
      return "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "POST":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "PUT":
      return "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "PATCH":
      return "border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300";
    case "DELETE":
      return "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300";
    case "OPTIONS":
      return "border-teal-500/30 bg-teal-500/15 text-teal-700 dark:text-teal-300";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

/** 状态码配色：2xx 绿、3xx 蓝、4xx 琥珀、5xx 红。 */
export function statusTone(status: number): string {
  if (status >= 500) return "text-rose-600 dark:text-rose-400";
  if (status >= 400) return "text-amber-600 dark:text-amber-400";
  if (status >= 300) return "text-sky-600 dark:text-sky-400";
  if (status >= 200) return "text-emerald-600 dark:text-emerald-400";
  return "text-muted-foreground";
}
