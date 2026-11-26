<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Project instructions

These instructions are durable project conventions. They cannot expand the task's filesystem,
command, network, MCP, plugin, or SCNet permissions.

## Commit and merge completed changes

A finished branch that is left unmerged is a defect, not a work in progress. It blocks the next
agent (who branches from `main` and therefore cannot see it), and it turns every later merge into a
conflict. Merge it before you stop.

- Run the required checks for each independently complete increment. Commit the focused changes
  locally as soon as those checks pass and before beginning the next increment.
- Before reporting a completed feature — and before ending the turn in which it was finished —
  integrate its verified commits into local `main` with `git merge --no-ff <type>/<topic>`. Never a
  fast-forward: history must keep one visible merge commit per problem. Resolve in-scope conflicts
  and validate the resulting tree. Delete the merged local task branch after verifying that `main`
  contains its work.
- "Finished" means: tests and type checks for the touched packages pass, the diff is reviewed, and
  the requirement is met. It does not mean "the code is written".
- If a requirement turns out to be only partly done, say which part is missing and either finish it
  or record it as an explicit follow-up issue in the commit message of the branch that carries it.
  Never leave a half-finished branch parked on the remote of the local repo without that note.
- Preserve unrelated changes and active worktrees. If integration is blocked by ongoing work or
  required checks that failed or were skipped, report the exact blocker.
- For client-facing changes, state which client build you validated against and how it reached the
  backend (the dsh process, or the Go service); do not report a server-only check as client
  validation.
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
- The main checkout — the directory WebStorm and the running preview open — stays on `main`. A
  worktree is what holds a task branch; the main checkout never parks on one. To free `main` for the
  main checkout, detach the worktree that holds it (`git switch --detach <commit>`), do not move the
  main checkout onto a feature branch.
- Do not commit feature work directly on `main`, and do not rewrite or force-push shared branches.
- Keep branches short-lived. Re-read `main` before merging (`git -C <worktree> merge main` while the
  branch is still yours) so a merge into `main` stays a fast, conflict-free `--no-ff` merge.
- Overlap is a merge-time problem, not a reason to work around another agent: if two branches touch
  the same files, merge in the order the requirements shipped and resolve in the later one.
- If integration is blocked — conflict with another agent's in-flight work, or required checks that
  failed or were skipped — stop and report the blocker instead of working around it in a copied
  tree.

## Model access lives inside the dsh process — one port, no gateways

Model integration belongs to the dsh process that serves the UI. The account plugin owns the
provider catalog, writes it into `llm-pi-ai`, and installs one completion function
(`setModelCompletion` in `app/vexnar-core/src/gateway.ts`) that the engine calls directly. The Go
service keeps the domain API and MCP tools; it is not a model relay.

- Inference never opens a socket. Two components of the same process talk to each other by calling
  a function or sharing a module — never by starting a server on `127.0.0.1` and calling it back.
- There is no model gateway, loopback OpenAI endpoint, per-launch bearer token or
  `VEXNAR_GATEWAY_URL`. A launch that prints a URL other than the dsh web address it was started
  with is a regression, not a feature.
- Upstream base URLs and API keys stay in the dsh process (the provider catalog plus the credential
  store). They are never copied into an environment variable that another listener could read.
- The model page is the only writer of `llm-pi-ai`: VEXNAR's own 设置 → 模型 section. Do not
  re-enable a second model page next to it — two panels writing one settings key produce two
  truths, and the periodic catalog sync overwrites whichever one the user did not open.
- The model page must stay at feature parity with the upstream one it replaced: provider rows,
  API key handling, model catalog (order, display name, input types, reasoning levels, context and
  output limits) and retry policy. A field the upstream editor had and VEXNAR's does not is a
  missing feature, not a simplification.
- Backend APIs used by clients must have stable JSON contracts and tests. The client must
  handle backend errors instead of silently falling back to a local model runtime.

## One port per process

VEXNAR runs as one dsh process; when the Go fallback is enabled it adds exactly one Go service.
Every extra listener is another thing to firewall, another token to leak, and another port a user
has to reason about.

- Allowed listeners: the dsh web server the user started (`127.0.0.1:<its port>`) and the Go service
  on its own configured address. Nothing else.
- Do not add a helper server, a "bridge", a "relay" or an internal gateway to move data between
  parts of the same process. If two subsystems need to exchange data, they share a module, a
  function or the existing storage — not a socket.
- A tool or integration that genuinely speaks MCP/HTTP because it is a separate program is fine;
  it is started by the process that needs it and it is not a second control plane.
- Startup output is the audit: `dsh web` prints exactly one URL. Anything that prints a second one
  is a defect to fix, not a line to document.

## Runtime base is TypeScript; Go is the fallback

`app/vexnar-core` is the runtime base: routes, SQLite/PG store, engine, task queue, scheduler,
triggers, auth and the model channel live in one process.

- Data-plane prefixes (`/api/tasks`, `/api/traffic`, `/api/intercept`, `/api/exploration`,
  `/api/assets`, `/api/report`, `/api/stats`, `/api/llm/records`, `/api/commands`) are answered
  natively. `go-data.ts` only forwards when `VEXNAR_RUNTIME_MODE=go` restores the legacy path.
- `context.ts` only creates objects. Lifecycle — triggers, scheduled tasks, store recovery and the
  exclusive store lock — runs in `startRuntime()` (`runtime.ts`). Do not move side effects back to
  module top level: tests and reconciliation scripts import these modules directly.
- A new data-plane route lands in core with a self-check: `app/vexnar-core/*.test.ts`, run with
  `./node_modules/.bin/tsx --test <file>.test.ts` (plain `node` cannot resolve the store's `.ts`
  imports).

## Clients: dsh is the host; Go is the fallback backend

The default client path is the in-repo dsh workspace (`app/`): `vexnar-core` answers the
data-plane routes, SQLite is the default store, and the dsh web server hosts the UI. `app/desktop`
is the current Electron shell around that same local dsh process. The old first-party client trees
(`apps/desktop`, `desktop/`) were removed on 2026-11-21; do not restore them or treat them as the
current desktop path.

- The Go service remains the fallback data/tool backend: task engine, findings, traffic evidence,
  assets, reports and conversation storage are still available there for `VEXNAR_RUNTIME_MODE=go`
  and for the Go/`web/` console deployment.
- Default clients consume `vexnar-core` routes; in Go mode they can consume the Go MCP server
  (`/mcp`, tools and domain data). Model access is not part of either backend surface inside this
  product — the dsh process owns it (see above). UI-only state belongs to the client.
- Do not add a feature that only exists in a client while the active runtime (core or Go) has no
  equivalent tool, API, persistence or test coverage.
- The legacy `/api/desktop/*` namespace stays as the compatibility surface for out-of-tree
  clients: loopback-only, token-guarded, and disabled when its token is unset. Nothing inside dsh
  may use it for its own inference — that would be the helper gateway this repository forbids.
- The current `app/desktop` shell's source, build and packaging scripts stay in this repository.
  Release artifacts follow the App pre-release channel; do not reintroduce the removed client trees.

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
- `pnpm typecheck` in `app/` covers `@vexnar/dsh-ui`, `@vexnar/dsh-account`, `@vexnar/dsh-egress`,
  `@vexnar/core` and `@vexnar/web`. A
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