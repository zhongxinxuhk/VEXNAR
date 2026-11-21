// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Build the dsh client plugin bundle (and the host half) without the dsh workspace.
 *
 * Two kinds of artifact, both under `lib/`:
 *
 *   - `lib/index.js`, `lib/platform.js`, `lib/platform-account.js`, `lib/login-page.js`,
 *     `lib/login-client.js`, `lib/model-channel.js`, `lib/yak-history-tools.js` — the
 *     host half. dsh installs this package into a profile's `node_modules` and imports
 *     it from there, and Node refuses to strip types for files under `node_modules`,
 *     so every host module has to be real JS. esbuild transforms `src/*.ts`
 *     file-by-file (no bundling) and keeps the relative import specifiers intact.
 *     `lib/login-client.js` is additionally served verbatim to the login page, and
 *     `lib/core-embedded.js` comes from `@vexnar/core`'s `build-embedded.ts`.
 *   - `lib/client.js` — the dsh client module. dsh's client module table expects a
 *     closure-factory artifact:
 *       window.__ModuleLoader__.load({ id, factory: (require) => { ... } })
 *     where `require` resolves the platform modules (React, ui-slots, …) from the
 *     loader. esbuild produces the CJS body; this script adds the factory wrapper
 *     and keeps every platform module external.
 */
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const id = '@vexnar/dsh-account'
const lib = join(here, 'lib')

/** 宿主半边：被 dsh / 登录页按路径加载的模块，全部要落成 .js。 */
const hostEntries = [
  'index',
  'platform',
  'platform-account',
  'login-page',
  'login-client',
  'model-channel',
  'yak-history-tools'
].map(name => join(here, 'src', `${name}.ts`))

const externals = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-context-menu'
]

await mkdir(lib, { recursive: true })
await build({
  entryPoints: hostEntries,
  outdir: lib,
  bundle: false,
  format: 'esm',
  platform: 'neutral',
  target: ['node22'],
  legalComments: 'none',
  logLevel: 'warning'
})

const cjs = join(lib, 'client.cjs')
await build({
  entryPoints: [join(here, 'src/client.tsx')],
  outfile: cjs,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'transform',
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  external: externals,
  legalComments: 'none',
  logLevel: 'warning'
})

const body = await readFile(cjs, 'utf8')
const wrapped = [
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
  'var module = { exports: {} }; var exports = module.exports;',
  body,
  'return module.exports;',
  '}});',
  ''
].join('\n')
await writeFile(join(lib, 'client.js'), wrapped)
console.log(`built ${id} -> lib/*.js (${hostEntries.length} host modules) + lib/client.js (${wrapped.length} bytes)`)
