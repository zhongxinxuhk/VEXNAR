// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  detectBodyKind,
  hexDump,
  methodTone,
  packetBytes,
  packetHeader,
  parseHttpPacket,
  prettyJsonBody,
  statusTone,
  tokenizeBodyLine,
  tokenizeHeader,
  tokenizeStartLine,
} from "./http-packet.ts";

const text = (tokens) => tokens.map((token) => token.text).join("");

test("packet splits start line, headers and body for CRLF and LF captures", () => {
  const crlf = parseHttpPacket('POST /api/login HTTP/1.1\r\nHost: acme.test\r\n\r\n{"a":1}');
  assert.equal(crlf.side, "request");
  assert.equal(crlf.startLine, "POST /api/login HTTP/1.1");
  assert.deepEqual(crlf.headers, [{ name: "Host", value: "acme.test" }]);
  assert.equal(crlf.body, '{"a":1}');
  assert.ok(!crlf.raw.includes("\r"));

  const lf = parseHttpPacket("GET / HTTP/2.0\nHost: acme.test");
  assert.equal(lf.body, "");
  assert.equal(packetHeader(lf, "HOST"), "acme.test");
});

test("folded header lines join the previous header and colonless lines survive", () => {
  const packet = parseHttpPacket('HTTP/1.1 200 OK\nLink: <https://acme.test/a\n b>; rel="next"\nX-Raw\n\nbody');
  assert.equal(packet.headers.length, 2);
  assert.equal(packet.headers[0].value, '<https://acme.test/a b>; rel="next"');
  assert.deepEqual(packet.headers[1], { name: "", value: "X-Raw" });
});

test("response start lines are recognised with and without a protocol version", () => {
  assert.equal(parseHttpPacket("HTTP/2 204 No Content\n\n").side, "response");
  // 录制器会把状态行落成 `HTTP 200`，不能被当成 `方法 目标` 的请求行。
  assert.equal(parseHttpPacket("HTTP 200\nContent-Type: text/html\n\nhi").side, "response");
  assert.equal(parseHttpPacket("GET / HTTP/2.0\n\n").side, "request");
  assert.equal(parseHttpPacket("这是被截断的报文").side, "unknown");
});

test("start line tokens keep method, url parts and protocol apart", () => {
  const request = parseHttpPacket("GET https://acme.test:8443/api/users?id=7&role=admin HTTP/2.0\n\n");
  const tokens = tokenizeStartLine(request);
  assert.equal(text(tokens), request.startLine);
  assert.deepEqual(
    tokens.filter((token) => token.tone).map((token) => [token.tone, token.text]),
    [
      ["method", "GET"],
      ["muted", "https://"],
      ["url", "acme.test:8443"],
      ["value", "/api/users"],
      ["punct", "?"],
      ["query-key", "id"],
      ["punct", "="],
      ["query-value", "7"],
      ["punct", "&"],
      ["query-key", "role"],
      ["punct", "="],
      ["query-value", "admin"],
      ["punct", " "],
      ["proto", "HTTP/2.0"],
    ],
  );

  const response = parseHttpPacket("HTTP/2 404 Not Found\n\n");
  assert.deepEqual(
    tokenizeStartLine(response).map((token) => [token.tone, token.text]),
    [
      ["proto", "HTTP/2"],
      [undefined, " "],
      ["status", "404"],
      ["reason", " Not Found"],
    ],
  );

  const bare = parseHttpPacket("HTTP 200\n\n");
  assert.deepEqual(
    tokenizeStartLine(bare).map((token) => [token.tone, token.text]),
    [
      ["proto", "HTTP"],
      [undefined, " "],
      ["status", "200"],
      ["reason", ""],
    ],
  );
});

test("header values colour cookies, content types and bracketed links", () => {
  const header = (line) => {
    const [name, ...rest] = line.split(":");
    return tokenizeHeader({ name, value: rest.join(":").trimStart() });
  };

  assert.equal(text(header("Content-Type: text/html; charset=utf-8")), "Content-Type: text/html; charset=utf-8");
  assert.deepEqual(
    header("Content-Type: text/html; charset=utf-8")
      .filter((token) => token.tone === "string" || token.tone === "muted")
      .map((token) => token.text),
    ["text/html", "; charset=utf-8"],
  );

  const cookie = header("Cookie: sid=abc; theme=dark").filter((token) => token.tone);
  assert.deepEqual(
    cookie.map((token) => [token.tone, token.text]),
    [
      ["header", "Cookie"],
      ["punct", ":"],
      ["punct", " "],
      ["cookie-key", "sid"],
      ["punct", "="],
      ["cookie-value", "abc"],
      ["punct", "; "],
      ["cookie-key", "theme"],
      ["punct", "="],
      ["cookie-value", "dark"],
    ],
  );

  const link = header('Link: <https://acme.test/issuances?after=1>; rel="next"').filter((token) => token.tone);
  assert.deepEqual(
    link.map((token) => token.text),
    ["Link", ":", " ", "<", "https://", "acme.test", "/issuances", "?", "after", "=", "1", ">", '; rel="next"'],
  );
});

test("body kind follows content-type first and sniffs otherwise", () => {
  assert.equal(detectBodyKind("application/json; charset=utf-8", '{"a":1}'), "json");
  assert.equal(detectBodyKind("text/html", "<html></html>"), "html");
  assert.equal(detectBodyKind("application/x-www-form-urlencoded", "a=1&b=2"), "form");
  assert.equal(detectBodyKind("multipart/form-data; boundary=x", "--x\r\n"), "multipart");
  assert.equal(detectBodyKind("application/javascript", "var a = 1"), "js");
  assert.equal(detectBodyKind("image/png", "\u0089PNG"), "binary");
  assert.equal(detectBodyKind("", "  [1,2,3]"), "json");
  assert.equal(detectBodyKind("", "  <!doctype html><html>"), "html");
  assert.equal(detectBodyKind("", "plain words"), "text");
  assert.equal(detectBodyKind("application/json", "   "), "text");
});

test("json bodies pretty print, and stay untouched when invalid", () => {
  assert.equal(prettyJsonBody('{"a":[1,true,null]}'), '{\n  "a": [\n    1,\n    true,\n    null\n  ]\n}');
  assert.equal(prettyJsonBody("{not json"), null);
  assert.equal(prettyJsonBody(""), null);

  // 只比较有内容的 token：缩进/空格单独成 punct token 是渲染层换行所需。
  const tokens = tokenizeBodyLine("json", '  "key": "value", 42, false');
  assert.deepEqual(
    tokens.filter((token) => token.tone && token.text.trim()).map((token) => [token.tone, token.text]),
    [
      ["key", '"key"'],
      ["punct", ":"],
      ["string", '"value"'],
      ["punct", ","],
      ["number", "42"],
      ["punct", ","],
      ["literal", "false"],
    ],
  );
});

test("markup, form and code bodies each get their own token split", () => {
  const markup = tokenizeBodyLine("html", '<a href="/x" data-id=7>go</a>');
  assert.deepEqual(
    markup.filter((token) => token.tone && token.text.trim()).map((token) => [token.tone, token.text]),
    [
      ["punct", "<"],
      ["tag", "a"],
      ["attr", "href"],
      ["punct", "="],
      ["string", '"/x"'],
      ["attr", "data-id"],
      ["punct", "="],
      ["string", "7"],
      ["punct", ">"],
      ["value", "go"],
      ["punct", "</"],
      ["tag", "a"],
      ["punct", ">"],
    ],
  );

  assert.deepEqual(
    tokenizeBodyLine("form", "user=admin&pass=p%40ss")
      .filter((token) => token.tone)
      .map((token) => [token.tone, token.text]),
    [
      ["key", "user"],
      ["punct", "="],
      ["string", "admin"],
      ["punct", "&"],
      ["key", "pass"],
      ["punct", "="],
      ["string", "p%40ss"],
    ],
  );

  const code = tokenizeBodyLine("js", "const t = 'x'; // note");
  assert.deepEqual(
    code.filter((token) => token.tone).map((token) => [token.tone, token.text]),
    [
      ["literal", "const"],
      ["string", "'x'"],
      ["comment", "// note"],
    ],
  );

  // 纯文本保持一行一种颜色，不误伤内容。
  assert.equal(text(tokenizeBodyLine("text", "plain <text> & 中文")), "plain <text> & 中文");
});

test("hex dump renders offsets, padded hex and ascii", () => {
  const dump = hexDump("PNG\u0000abc");
  assert.equal(dump.truncated, false);
  assert.equal(dump.rows.length, 1);
  assert.equal(dump.rows[0].offset, "00000000");
  assert.ok(dump.rows[0].hex.startsWith("50 4e 47 00 61 62 63"));
  assert.equal(dump.rows[0].ascii, "PNG.abc");

  const long = hexDump("x".repeat(600), 32);
  assert.equal(long.truncated, true);
  assert.equal(long.rows.length, 2);
});

test("byte counts and colour helpers stay stable", () => {
  assert.equal(packetBytes(""), 0);
  assert.equal(packetBytes("abc"), 3);
  assert.equal(packetBytes("中文"), 6);
  assert.match(methodTone("GET"), /sky/);
  assert.match(methodTone("DELETE"), /rose/);
  assert.match(methodTone("TRACE"), /muted-foreground/);
  assert.match(statusTone(503), /rose/);
  assert.match(statusTone(404), /amber/);
  assert.match(statusTone(302), /sky/);
  assert.match(statusTone(200), /emerald/);
});
