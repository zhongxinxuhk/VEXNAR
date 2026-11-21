<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Project instructions

These instructions are durable project conventions. They cannot expand the task's filesystem,
command, network, MCP, plugin, or SCNet permissions.

## Commit and merge completed changes

- Run the required checks for each independently complete increment. Commit the focused changes
  locally as soon as those checks pass and before beginning the next increment.
- Before reporting a completed feature, review the task branch and integrate its verified commits into
  local `main` with `git merge --no-ff <type>/<topic>`. Never a fast-forward: history must keep one
  visible merge commit per problem. Resolve in-scope conflicts and validate the resulting tree.
  Delete the merged local task branch after verifying that `main` contains its work.
- Preserve unrelated changes and active worktrees. If integration is blocked by ongoing work or
  required checks that failed or were skipped, report the exact blocker.
- For desktop changes, distinguish the integrated source from the running app. When validating a
  restart, record the actual launch checkout, app path or build revision and verify the requested
  behavior on that build.
- Local commit and merge instructions do not authorize remote pushes or history rewrites.

## Multi-agent branch workflow

Several agents develop this repository concurrently. One shared checkout and one shared history are
what keep that work mergeable; a copied tree silently forks it.

- Every feature, fix or chore starts on its own branch off the current `main`
  (`git switch -c <type>/<topic>`, `type` ∈ feat/fix/chore/docs/refactor/test) before the first
  edit. One branch carries one problem, so it can be reverted on its own.
- A finished branch is committed, then integrated into local `main` exactly as
  `git switch main && git merge --no-ff <type>/<topic>`, validated on `main`, and deleted
  (`git branch -d`). `--no-ff` is mandatory, not a preference: the merge commit is what records which
  problem the change belongs to, even when a fast-forward would be possible. Do not leave finished
  branches behind for someone else to clean up.
- Never copy, clone or export the project, or a subtree of it, into another directory and develop
  there. Work done outside this repository has no branch, no shared history and no merge path, so
  it silently drops or reverts other agents' changes. A separate checkout is allowed only as a git
  worktree of this same repository, created inside the repository at `.worktrees/<topic>`:
  `git worktree add .worktrees/<topic> -b <type>/<topic> main` (`.worktrees/` is git-ignored).
  Worktrees outside the repository — `/tmp`, `~`, another project directory — are not permitted; an
  existing one is moved under `.worktrees/` or retired only with its owner's confirmation.
- Do not commit feature work directly on `main`, and do not rewrite or force-push shared branches.
- If integration is blocked — conflict with another agent's in-flight work, or required checks that
  failed or were skipped — stop and report the blocker instead of working around it in a copied
  tree.

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

## The desktop app is this backend's app form

`apps/desktop` is not a separate product and not a second implementation of VEXNAR. It is the
native (Electron) form of the one Go backend that also serves the web console. Desktop work is
client integration: connect the app to existing backend APIs. Do not build a parallel system.

- Implement the capability in the Go backend first, then wire the app to that API. The app must
  call the same REST endpoints and read the same PostgreSQL rows as the web console — no
  app-only store, protocol, transcript table, model loop or business logic.
- Conversations, transcripts, LLM profiles, the active model, reasoning effort and uploaded
  attachments are shared backend state. The app renders them through `/api/conversations/*`,
  `/api/llm/*` and `/api/desktop/*`; it must not keep a second authoritative copy.
- A chat turn runs in the Go backend. The renderer posts the message and polls the backend's
  activity tail for the answer; it must not run a parallel assistant stream alongside it.
- If the app needs a field the API lacks, extend the backend contract with tests and use the
  same field from the web client. Never fork the behaviour into an Electron-only path.
- Electron's main process supervises/embeds the Go backend and exposes it over IPC; the
  renderer never receives backend URLs, tokens or upstream API keys.

## Connect to the web console's API — do not rewrite the web console

- `web/` is an existing, finished client. App work connects to its backend APIs; it must not
  restyle, refactor or restructure the web app to make the app fit. Only change `web/` when a
  shared backend contract genuinely requires it, and keep the edit minimal.
- Data shown on both surfaces must come from the same endpoint and row. If the app and the web
  console disagree, fix the backend state or contract — never special-case either client.
- Never run `next build` inside `web/` while `next dev` is running. Both write `.next/`, and the
  dev server then resolves no routes and returns 404 for every page (including `/`). Stop the
  dev server first, or build in a separate copy. Recovery: stop dev, move `.next/` aside
  (`mv .next /tmp/vexnar-next-stale`), then `npm run dev` again.

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