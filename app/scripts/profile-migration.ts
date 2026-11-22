// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Carry the bundles a user installed from the plugin shop across a profile
 * rebuild.
 *
 * VEXNAR's data directory is versioned: a release may point the launcher at a
 * new home (`app/.dsh-home` → `app/.vexnar-home`), and the new profile is born
 * from the shipped template — which knows nothing about `dsh-plugin-shop`,
 * `dsh-craft-anything` or any other bundle the user installed through the
 * Plugins page. The shop then looks "deleted" while it was never touched: it
 * simply lives in the previous home.
 *
 * The planning half stays pure so the rule is testable: a legacy bundle is
 * carried over only when it is listed in the old profile's bundle layer, has a
 * registry dependency (never `file:`/`link:`/`workspace:`, which point into a
 * checkout that may be gone), is not a shipped template entry, is not one of
 * the bundles this setup writes itself, and is not already present.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

/** The part of a profile manifest the migration reads. */
export interface ProfileManifestLike {
  readonly dependencies?: Readonly<Record<string, string>>
  readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
}

const profileManifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  dsh: z.object({
    profile: z.object({
      bundles: z.array(z.string()).optional(),
    }).optional(),
  }).optional(),
})

/** One bundle to reinstall into the current profile. */
export interface LegacyBundle {
  /** npm package name. */
  readonly name: string
  /** Version range recorded in the old profile; absent when the runtime already ships the bundle. */
  readonly version?: string
}

/** Local specifiers that must never be replayed into a new profile. */
const LOCAL_SPECIFIER = /^(?:file|link|workspace|portal):/u

/**
 * Choose the bundles a new profile inherits from older ones.
 * @param manifests - legacy profile manifests, most authoritative first.
 * @param options - `skip` names the bundles setup writes itself or the template ships; `installed` names the bundles the current profile already lists; `provided` answers whether the runtime already ships a package (those only need their bundle entry back).
 * @returns the bundles to reinstall, in the order the legacy profiles listed them, first occurrence only.
 */
export function planLegacyBundles(
  manifests: readonly ProfileManifestLike[],
  options: {
    readonly skip: (name: string) => boolean
    readonly installed: readonly string[]
    readonly provided?: (name: string) => boolean
  },
): LegacyBundle[] {
  const seen = new Set(options.installed)
  const planned: LegacyBundle[] = []
  for (const manifest of manifests) {
    const dependencies = manifest.dependencies ?? {}
    for (const name of manifest.dsh?.profile?.bundles ?? []) {
      if (seen.has(name) || options.skip(name)) continue
      const version = dependencies[name]
      if (version === undefined) {
        // A bundle without its own dependency is shipped by the runtime: only its layer entry is missing.
        if (options.provided?.(name) !== true) continue
        seen.add(name)
        planned.push({ name })
        continue
      }
      if (LOCAL_SPECIFIER.test(version)) continue
      seen.add(name)
      planned.push({ name, version })
    }
  }
  return planned
}

/**
 * Read every profile manifest under the given homes.
 * @param homes - candidate data directories, most authoritative first.
 * @returns the manifests that could be read; a missing or malformed home contributes nothing.
 */
export function readLegacyManifests(homes: readonly string[]): ProfileManifestLike[] {
  const manifests: ProfileManifestLike[] = []
  for (const home of homes) {
    const profiles = join(home, 'profiles')
    if (!existsSync(profiles)) continue
    for (const name of readdirSync(profiles, { withFileTypes: true })) {
      if (!name.isDirectory()) continue
      const file = join(profiles, name.name, 'package.json')
      try {
        const manifest = profileManifestSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
        if (manifest.success) manifests.push(manifest.data)
      } catch {
        // A half-written manifest from an interrupted install is not a source of truth.
      }
    }
  }
  return manifests
}
