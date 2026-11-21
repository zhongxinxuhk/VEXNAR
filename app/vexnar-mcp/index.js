import { readFileSync } from "node:fs";
const name = "vexnar-mcp";
const inject = ["mcpManager"];
const DEFAULTS = {
  serverName: "vexnar",
  url: "http://127.0.0.1:8787/mcp",
  tokenFile: "",
  tokenEnv: "VEXNAR_MCP_TOKEN",
  startupTimeoutMs: 2e4,
  toolCallTimeoutMs: 6e4
};
function resolveToken(tokenEnv, tokenFile) {
  const fromEnv = tokenEnv === "" ? "" : (process.env[tokenEnv] ?? "").trim();
  if (fromEnv !== "") return fromEnv;
  if (tokenFile === "") return "";
  try {
    return readFileSync(tokenFile, "utf8").trim();
  } catch {
    return "";
  }
}
function apply(ctx, config = {}) {
  const options = { ...DEFAULTS, ...config };
  const token = resolveToken(options.tokenEnv, options.tokenFile);
  if (token === "") {
    throw new Error(
      `vexnar-mcp: no endpoint token (looked at $${options.tokenEnv} and ${options.tokenFile === "" ? "(no tokenFile)" : options.tokenFile}). Start the VEXNAR service so it writes data/mcp.token, or set VEXNAR_MCP_TOKEN.`
    );
  }
  ctx.mcpManager.register(options.serverName, {
    transport: "streamable-http",
    url: options.url,
    headers: { Authorization: `Bearer ${token}` },
    startupTimeoutMs: options.startupTimeoutMs,
    toolCallTimeoutMs: options.toolCallTimeoutMs
  });
}
export {
  apply,
  inject,
  name
};
