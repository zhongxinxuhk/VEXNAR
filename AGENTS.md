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
- For client-facing changes, state which client build you validated against and how it reached
  the Go service; do not report a server-only check as client validation.
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

VEXNAR's Go service is the single source of truth for model integration. The web console and any
external agent client are presentation and control surfaces, not independent model runtimes.

- Model providers, model catalogs, profiles, default/active model selection, credentials,
  request routing, usage accounting and failover belong in the Go backend.
- External clients reach models only through the Go gateway: an OpenAI-compatible,
  loopback-only endpoint guarded by a per-launch token. Upstream base URLs and API keys never
  leave the Go process.
- A client must not maintain a second authoritative model catalog, nor call an upstream model
  or relay endpoint directly for inference.
- NewAPI login, quota display and account/session bootstrap may remain client-side integration
  concerns. Once a session is established, inference must go through the Go gateway.
- Backend APIs used by clients must have stable JSON contracts and tests. The client must
  handle backend errors instead of silently falling back to a local model runtime.

### Which process implements the gateway

The gateway contract is unchanged; which process implements it depends on the runtime base mode
(`VEXNAR_RUNTIME_MODE`, default `ts`):

- `ts` — `app/vexnar-core` serves the same `/api/desktop/openai/v1/*` contract, and the engine calls
  it **in-process** (`app/vexnar-core/src/gateway.ts`): no listener, no upstream key in the engine,
  works with the Go service stopped.
- `go` — the legacy loopback Go gateway at `VEXNAR_GO_URL`. This is the only rollback switch.

Either way the engine holds no upstream credentials: only the gateway reads the profile key.

## Runtime base is TypeScript; Go is the fallback

`app/vexnar-core` is the runtime base: routes, SQLite store, engine, task queue, scheduler,
triggers, auth and the model gateway live in one process.

- Data-plane prefixes (`/api/tasks`, `/api/traffic`, `/api/intercept`, `/api/exploration`,
  `/api/assets`, `/api/report`, `/api/stats`, `/api/llm/records`, `/api/commands`) are answered
  natively. `go-data.ts` no longer proxies by default; `VEXNAR_RUNTIME_MODE=go` restores the old
  forwarding path for rollback.
- `context.ts` only creates objects. Lifecycle — triggers, scheduled tasks, store recovery and the
  exclusive store lock — runs in `startRuntime()` (`runtime.ts`). Do not move side effects back to
  module top level: tests and reconciliation scripts import these modules directly.
- A new data-plane route lands in core with a self-check: `vexnar-core/*.test.mjs`, run with
  `./node_modules/.bin/tsx <file>.test.mjs` (plain `node` cannot resolve the store's `.js` imports).

## Clients are external agents; the Go service is their tool backend

This repository no longer ships a first-party desktop client. The Electron client under
`apps/desktop` and the legacy Tauri shell under `desktop/` were removed on 2026-11-21; the app is
being rebuilt on an external agent framework in its own repository.

- The Go service is the durable product: task engine, findings, traffic evidence, assets,
  reports, conversation storage and model access all live here.
- Clients consume it through two surfaces: an MCP server (tools and domain data) and the
  OpenAI-compatible model gateway. UI-only state belongs to the client.
- Do not add a feature that only exists in a client while the Go service has no equivalent tool,
  API, persistence or test coverage.
- The legacy `/api/desktop/*` namespace is retained as the loopback model-gateway surface for
  external agents; it stays loopback-only, token-guarded, and disabled when its token is unset.
- Client code, packaging, signing and auto-update belong to the client repository. This
  repository keeps the Go service, the web console and the deployment assets.

## `app/` uses pnpm only

- `app/` is one pnpm workspace: `app/pnpm-workspace.yaml` defines the packages, `app/pnpm-lock.yaml`
  is the only lockfile, and `app/package.json` pins `packageManager`.
- `npm`/`yarn` state under `app/` is a defect, not a missing file: a `package-lock.json` or
  `yarn.lock` there means a second package manager resolved a second tree. Run `pnpm install` from
  `app/` instead of adding a lockfile, and never restore a removed `package-lock.json`.
  `pnpm run upstream:check` fails while one exists.
- Sub-packages declare dependencies only; they carry no `pnpm-lock.yaml` and no
  `pnpm-workspace.yaml` of their own. `node_modules/` under `app/` is never committed.
- `app/dsh/` is the exception: the vendored upstream checkout keeps its own workspace and lockfile.
- Every worktree gets its own real `app/node_modules`. A `node_modules` symlinked into another
  checkout makes the two trees share one dependency tree: an install in either one silently rewrites
  the other, and `pnpm run <script>` inside that worktree fails with
  `ERR_PNPM_UNSAFE_TASK_RUN_STATE_PATH`. Run `pnpm install --frozen-lockfile` in that worktree; do
  not link it to a sibling checkout.
- `pnpm typecheck` in `app/` covers `@vexnar/dsh-ui`, `@vexnar/dsh-account` and `@vexnar/core`. A
  package whose `tsconfig.json` `include` names a couple of files is not a gate: `@vexnar/core`
  compiled two route files and reported success while `auth.ts`, `server.ts` and most of
  `src/routes/` were never type-checked. Widen the program to `src/**/*.ts` instead of adding files
  one at a time.

## Connect to the web console's API — do not rewrite the web console

- `web/` is an existing, finished client. Work on other clients connects to its backend APIs; it
  must not restyle, refactor or restructure the web app to make another client fit. Only change
  `web/` when a shared backend contract genuinely requires it, and keep the edit minimal.
- Data shown on several surfaces must come from the same endpoint and row. If surfaces disagree,
  fix the backend state or contract — never special-case one client.
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