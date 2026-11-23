import { chmod, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize } from "node:path";
function fields(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function yakHistoryConfigPath() {
  const configured = String(process.env.VEXNAR_YAK_HISTORY_CONFIG ?? "").trim();
  if (configured) return configured;
  const home = String(process.env.VEXNAR_HOME ?? "").trim() || String(process.env.DSH_HOME ?? "").trim() || join(homedir(), ".vexnar");
  return join(home, "yak-history.json");
}
async function canonical(path) {
  return realpath(path).catch(() => normalize(path));
}
async function normalizeRow(value) {
  const row = fields(value);
  if (!row) throw new Error("\u6765\u6E90\u5FC5\u987B\u662F\u5BF9\u8C61");
  const name = String(row.name ?? "").trim();
  if (!name) throw new Error("\u6765\u6E90\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
  for (const key of ["workspace", "socket", "token_file"]) {
    if (typeof row[key] !== "string" || !isAbsolute(row[key])) {
      throw new Error(`${key} \u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84`);
    }
  }
  const projectID = Number(row.project_id);
  if (!Number.isSafeInteger(projectID) || projectID <= 0) throw new Error("project_id \u5FC5\u987B\u662F\u6B63\u6574\u6570");
  return {
    name,
    workspace: await canonical(String(row.workspace)),
    socket: await canonical(String(row.socket)),
    token_file: String(row.token_file),
    project_id: projectID
  };
}
async function readYakSources() {
  const path = yakHistoryConfigPath();
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new Error("Yak \u6D41\u91CF\u6765\u6E90\u914D\u7F6E\u4E0D\u53EF\u8BFB");
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Yak \u6D41\u91CF\u6765\u6E90\u914D\u7F6E\u4E0D\u662F\u5408\u6CD5 JSON");
  }
  if (!Array.isArray(raw)) throw new Error("Yak \u6D41\u91CF\u6765\u6E90\u914D\u7F6E\u5FC5\u987B\u662F\u6570\u7EC4");
  const rows = [];
  for (const item of raw) rows.push(await normalizeRow(item));
  if (new Set(rows.map((row) => row.name)).size !== rows.length) throw new Error("\u6765\u6E90\u540D\u79F0\u91CD\u590D");
  if (new Set(rows.map((row) => row.socket)).size !== rows.length) throw new Error("\u6765\u6E90 socket \u91CD\u590D");
  return rows;
}
async function writeYakSources(input) {
  if (!Array.isArray(input)) throw new Error("sources \u5FC5\u987B\u662F\u6570\u7EC4");
  const rows = [];
  for (const item of input) rows.push(await normalizeRow(item));
  if (new Set(rows.map((row) => row.name)).size !== rows.length) throw new Error("\u6765\u6E90\u540D\u79F0\u91CD\u590D");
  if (new Set(rows.map((row) => row.socket)).size !== rows.length) throw new Error("\u6765\u6E90 socket \u91CD\u590D");
  const path = yakHistoryConfigPath();
  await mkdir(dirname(path), { recursive: true, mode: 448 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(rows, null, 2)}
`, { mode: 384 });
  await chmod(temp, 384);
  await rename(temp, path);
  return rows;
}
async function handleYakSources(request) {
  try {
    if (request.method === "GET") {
      return Response.json({ sources: await readYakSources(), path: yakHistoryConfigPath() }, {
        headers: { "Cache-Control": "no-store" }
      });
    }
    if (request.method !== "PUT") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const body = await request.json().catch(() => void 0);
    const rows = await writeYakSources(fields(body)?.sources);
    return Response.json({ sources: rows, path: yakHistoryConfigPath() }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return Response.json({ error: String(error?.message ?? error) }, {
      status: 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
export {
  handleYakSources,
  readYakSources,
  writeYakSources,
  yakHistoryConfigPath
};
