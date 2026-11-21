// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Build the dsh client plugin bundle (and the host half) without the dsh workspace.
 *
 * Two artifacts, both under `lib/`:
 *
 *   - `lib/index.js` — the host half. dsh installs this package into a profile's
 *     `node_modules` and imports its entry from there, and Node refuses to strip
 *     types for files under `node_modules`, so the host entry has to be real JS.
 *     esbuild transforms `src/index.ts` file-by-file (no bundling).
 *   - `lib/client.js` — the dsh client module. dsh's client module table expects
 *     a closure-factory artifact:
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
const id = '@vexnar/dsh-ui'
const lib = join(here, 'lib')

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
const logo = await readFile(join(here, '../../../assets/logo.png'))
const logoData = `data:image/png;base64,${logo.toString('base64')}`

// 宿主半边：.ts → lib/index.js，逐文件转译，保留 import 说明符。
await build({
  entryPoints: [join(here, 'src/index.ts')],
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
  jsx: 'automatic',
  external: externals,
  legalComments: 'none',
  define: { __VEXNAR_LOGO__: JSON.stringify(logoData) },
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
console.log(`built ${id} -> lib/index.js + lib/client.js (${wrapped.length} bytes)`)
