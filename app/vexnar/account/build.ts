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
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
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
await copyFile(join(here, '../../../yakhistory/wire/history.proto'), join(lib, 'yak-history.proto'))
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

// Keep the IPC reader self-contained so an existing dsh profile can load it
// using its current package tree and build permissions.
const yakBundle = await build({
  entryPoints: [join(here, 'src/yak-history.ts')],
  outfile: join(lib, 'yak-history.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['node22'],
  metafile: true,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  legalComments: 'eof',
  logLevel: 'warning'
})
const packageRoots = new Set<string>()
const modules = sep + 'node_modules' + sep
for (const input of Object.keys(yakBundle.metafile.inputs)) {
  const path = resolve(input)
  const index = path.lastIndexOf(modules)
  if (index === -1) continue
  const start = index + modules.length
  const parts = path.slice(start).split(sep)
  packageRoots.add(path.slice(0, start) + parts.slice(0, parts[0]?.startsWith('@') ? 2 : 1).join(sep))
}
const notices: string[] = []
for (const root of [...packageRoots].sort()) {
  const pack = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const files = (await readdir(root)).filter(name => /^(licen[sc]e|notice|copying)(\.|$)/i.test(name)).sort()
  const texts = await Promise.all(files.map(name => readFile(join(root, name), 'utf8')))
  notices.push(`${pack.name} ${pack.version} (${pack.license})\n` +
    texts.map(text => text.split(/\r?\n/).map(line => line.trimEnd()).join('\n').trimEnd()).join('\n'))
}
await writeFile(join(lib, 'yak-history.NOTICES.txt'), notices.join('\n\n') + '\n')

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
console.log(`built ${id} -> lib/*.js (${hostEntries.length + 1} host modules) + lib/client.js (${wrapped.length} bytes)`)
