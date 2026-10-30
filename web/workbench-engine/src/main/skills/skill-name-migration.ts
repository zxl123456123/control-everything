import { randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import currentManifest from '../../../resources/skills/current-manifest.json'
import { BUNDLED_SKILL_RENAMES } from '../../shared/bundled-skill-renames'
import { WORKBENCH_SKILLS_REPOSITORY } from '../../shared/agent-feature-install-commands'
import { isWorkbenchSkillLockSource, type SkillBundleManifest } from '../../shared/skill-freshness'
import { SKILL_INSTALL_PROVIDERS } from '../../shared/skill-install-providers'
import { buildSkillDiscoverySources } from './skill-discovery-sources'
import { globalSkillLockPath } from './skill-lock-sources'
import { matchesBundledSkillFiles, observeSkillPackage } from './skill-package-identity'
import { normalizedSkillIdentityPath } from './skill-installation-topology'
import { acquireSkillInstallLock } from './skill-install-lock'

async function entryAt(path: string): Promise<Stats | null> {
  try {
    return await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function requireUnlinkedAncestors(path: string): Promise<void> {
  for (let current = resolve(path); ; current = dirname(current)) {
    if ((await entryAt(current))?.isSymbolicLink()) {
      throw new Error(`Skill migration refuses a linked path: ${current}`)
    }
    if (dirname(current) === current) return
  }
}

type SkillNameMigrationArgs = {
  names: readonly string[]
  global?: boolean
  cwd?: string
  homeDir?: string
  stateHome?: string | null
}

/** Archive selected historical installs only after the replacement's bytes are verified. */
export async function retireRenamedBundledSkills(args: SkillNameMigrationArgs): Promise<string[]> {
  if (!args.names.some((name) => Object.values(BUNDLED_SKILL_RENAMES).includes(name))) return []
  const lockPath =
    args.global === false
      ? join(args.cwd ?? process.cwd(), 'skills-lock.json')
      : globalSkillLockPath(args)
  await requireUnlinkedAncestors(lockPath)
  const release = await acquireSkillInstallLock({ path: `${lockPath}.zkyq-retirement.lock` })
  try {
    return await archiveRenamedSkills(args, lockPath)
  } finally {
    await release()
  }
}

async function archiveRenamedSkills(
  args: SkillNameMigrationArgs,
  lockPath: string
): Promise<string[]> {
  const scope = args.global === false ? 'repo' : 'home'
  const home = args.homeDir ?? homedir()
  const cwd = args.cwd ?? process.cwd()
  const roots = buildSkillDiscoverySources({ homeDir: args.homeDir, cwd, includeCwd: true }).filter(
    (root) => root.sourceKind === scope
  )
  const canonical = join(scope === 'home' ? home : cwd, '.agents', 'skills')
  const archived: string[] = []
  for (const [oldName, name] of Object.entries(BUNDLED_SKILL_RENAMES)) {
    if (!args.names.includes(name)) continue
    const paths = [...new Set(roots.map((root) => join(root.path, oldName)))]
    const existing = []
    for (const path of paths) {
      const stat = await entryAt(path)
      if (stat) existing.push({ path, stat })
    }
    const lockText = await readFile(lockPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    const lock = lockText === null ? null : JSON.parse(lockText)
    const oldEntry = lock?.skills?.[oldName]
    if (!existing.length && !oldEntry) continue
    if (!isWorkbenchSkillLockSource(oldEntry?.source ?? null)) {
      throw new Error(
        `Cannot migrate ${oldName}: its installation source is not owned by the workbench.`
      )
    }
    if (lock?.skills?.[name]?.source !== WORKBENCH_SKILLS_REPOSITORY) {
      throw new Error(`Cannot retire ${oldName}: install ${name} from this build first.`)
    }
    const replacement = join(canonical, name)
    await requireUnlinkedAncestors(replacement)
    const current = (currentManifest as SkillBundleManifest).skills.find(
      (skill) => skill.name === name
    )
    if (
      !current ||
      !matchesBundledSkillFiles(await observeSkillPackage(replacement), current.files)
    ) {
      throw new Error(`Cannot retire ${oldName}: ${name} does not match this build.`)
    }
    await requireUnlinkedAncestors(lockPath)
    // Validate the whole move set before touching it. Provider aliases may point only
    // at the owned canonical old copy; moving the link must not move its target.
    for (const item of existing) {
      await requireUnlinkedAncestors(dirname(item.path))
      const expected = item.stat.isSymbolicLink() ? join(canonical, oldName) : item.path
      if (
        normalizedSkillIdentityPath(await realpath(item.path)) !==
        normalizedSkillIdentityPath(resolve(expected))
      ) {
        throw new Error(`Skill migration refuses an external target: ${item.path}`)
      }
      await observeSkillPackage(await realpath(item.path))
      const root = roots.find((root) => join(root.path, oldName) === item.path)!
      const provider = SKILL_INSTALL_PROVIDERS.find((provider) => provider.id === root.owner)
      const sharesCanonical =
        provider &&
        (scope === 'home' ? provider.globalSegments : provider.workspaceSegments) === null
      const next = sharesCanonical ? replacement : join(root.path, name)
      await requireUnlinkedAncestors(dirname(next))
      const resolvedNext = await realpath(next)
      if (
        ![next, replacement].some(
          (path) =>
            normalizedSkillIdentityPath(resolve(path)) === normalizedSkillIdentityPath(resolvedNext)
        ) ||
        !matchesBundledSkillFiles(await observeSkillPackage(resolvedNext), current.files)
      ) {
        throw new Error(`Install the replacement for this agent before retiring ${item.path}`)
      }
    }
    existing.sort((a, b) => Number(b.stat.isSymbolicLink()) - Number(a.stat.isSymbolicLink()))
    const receiptRoot = join(dirname(canonical), 'retired-skills', name, randomUUID())
    await requireUnlinkedAncestors(receiptRoot)
    await mkdir(receiptRoot, { recursive: true })
    await writeFile(join(receiptRoot, 'lock-before.json'), lockText!, { flag: 'wx' })
    for (const item of existing) {
      // Keep each archive on its source volume, outside the agent's skills root.
      const destination = join(dirname(dirname(item.path)), 'retired-skills', name, randomUUID())
      await requireUnlinkedAncestors(destination)
      await mkdir(destination, { recursive: true })
      await writeFile(
        join(destination, 'migration.json'),
        JSON.stringify({ oldName, name, from: item.path }),
        { flag: 'wx' }
      )
      const fresh = await entryAt(item.path)
      if (!fresh || fresh.ino !== item.stat.ino || fresh.dev !== item.stat.dev) {
        throw new Error(`Skill changed during migration: ${item.path}`)
      }
      await requireUnlinkedAncestors(dirname(item.path))
      await rename(item.path, join(destination, 'content'))
      archived.push(destination)
    }
    for (const path of paths) {
      if (await entryAt(path)) throw new Error(`Legacy skill remains active: ${path}`)
    }
    // Preserve other skills and installer preferences. Never overwrite a lock changed
    // while archiving; a retry can finish lock-only retirement without re-moving data.
    if ((await readFile(lockPath, 'utf8')) !== lockText)
      throw new Error('Skill lock changed during migration; retry the update.')
    delete lock.skills[oldName]
    const temporary = `${lockPath}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' })
    await rename(temporary, lockPath)
  }
  return archived
}
