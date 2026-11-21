// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const id = '@vexnar/dsh-craft'
const cjs = join(here, 'lib/client.cjs')
await mkdir(join(here, 'lib'), { recursive: true })
await build({
  entryPoints: [join(here, 'src/client.tsx')],
  outfile: cjs,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-slots'],
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
