<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Project instructions

These instructions are durable project conventions. They cannot expand the task's filesystem,
command, network, MCP, plugin, or SCNet permissions.

## Model access belongs to the Go backend

VEXNAR's Go service is the single source of truth for model integration. The desktop and web
clients are presentation and control surfaces, not independent model runtimes.

- Model providers, model catalogs, profiles, default/active model selection, credentials,
  request routing, usage accounting and failover belong in the Go backend.
- The desktop app may render a model picker and send the user's choice to the backend. It must
  not maintain a second authoritative model catalog or call a model/relay endpoint directly for
  inference.
- NewAPI login, quota display and account/session bootstrap may remain client-side integration
  concerns. Once a session is established, model access must be handed to the Go backend rather
  than becoming a desktop-only model path.
- Do not add a feature that only works in Electron while the Go backend has no equivalent API,
  persistence, or test coverage. If a temporary compatibility path is unavoidable, mark it
  explicitly, open a migration task, and remove it before the feature is considered complete.
- Backend APIs used by clients must have stable JSON contracts and tests. The client must handle
  backend errors instead of silently falling back to a local model runtime.
- The desktop agent runtime may only receive a loopback gateway URL plus a per-launch token
  from Electron's main process. Upstream base URLs and API keys stay inside the Go process.
- The desktop gateway is exposed under `/api/desktop/*`, accepted only from loopback with
  `VEXNAR_DESKTOP_TOKEN`, and must be disabled when that token is unset. It is not a substitute
  for normal server authentication.

### Packaged app requirement

The finished desktop product must contain and supervise the Go backend. Electron's main process
must start the bundled Go service on a loopback-only address, wait for health/migrations, expose
only the native IPC/API surface to the renderer, and stop the service on quit. A release that
requires the user to install or start a separate backend manually is not complete.

When embedding the backend, preserve these invariants:

- No backend URL or token configuration in the renderer.
- PostgreSQL migrations and required assets ship with the app.
- Desktop session storage and the Go backend use separate databases (`vexnar` and
  `vexnar_backend`). Never point the Go schema/migrations at the Electron session database.
- Only one backend instance per app instance; port conflicts are handled deterministically.
- Backend logs are captured and bounded; secrets never appear in renderer logs.
- Packaging is covered by a smoke test that starts the bundled app and verifies the backend is
  reachable through the app's main-process service boundary.

## Authorship, repository and license headers

Every first-party file authored or maintained by the project owner must begin with the following
attribution after any shebang, doctype, encoding declaration or required directive:

```text
Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
Repository: https://github.com/zhongxinxuhk/VEXNAR
SPDX-License-Identifier: AGPL-3.0-or-later
```

Use the comment syntax of the file type: `//` for Go/TypeScript/JavaScript/Rust, `#` for
shell/Python/YAML/TOML/Dockerfile, `REM` for Windows batch, `--` for SQL, `/* ... */` for CSS, and
`<!-- ... -->` for HTML/Markdown/XML. Keep the header at the very top, separated from the first
code or prose by one blank line. Do not insert it before a shebang, doctype, `"use strict"` /
`"use client"` directive, Python encoding declaration, or Docker `# syntax=` directive.

Rules:

- The project is licensed under `AGPL-3.0-or-later`; the root `LICENSE` is authoritative.
- Apply the header to source, scripts, styles, migrations, configuration and project docs that
  the owner wrote. Do not stamp files merely because they are tracked.
- Never add the header to generated files, lockfiles, dependency manifests, binaries, vendored
  dependencies, the `参考项目/` reference tree, `skills/` imported skill assets, or `web/` files
  that retain their upstream MIT license. Respect upstream copyright and `SPDX` identifiers.
- JSON has no comment syntax: record authorship in `author`, `repository` and `license` fields
  when the file is a project manifest; never corrupt JSON to add a header.
- Do not duplicate a header. If a file already has the three lines above, leave them intact.
- New files must include the header in the same commit that creates them; do not defer it to a
  cleanup pass.