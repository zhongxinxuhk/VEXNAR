// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Build the dsh client bundle without the dsh workspace.
 *
 * dsh's client module table expects a closure-factory artifact:
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ... } })
 * where `require` resolves the platform modules (React, ui-slots, …) from the
 * loader. esbuild produces the CJS body; this script adds the factory wrapper
 * and keeps every platform module external.
 */
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const id = '@vexnar/dsh-account'

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

await mkdir(join(here, 'lib'), { recursive: true })
const cjs = join(here, 'lib/client.cjs')
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
await writeFile(join(here, 'lib/client.js'), wrapped)
console.log(`built ${id} -> lib/client.js (${wrapped.length} bytes)`)
