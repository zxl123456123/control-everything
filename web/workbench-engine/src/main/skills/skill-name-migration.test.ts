import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WORKBENCH_SKILLS_REPOSITORY } from '../../shared/agent-feature-install-commands'

vi.mock('./skill-discovery-sources', () => ({
  buildSkillDiscoverySources: ({ homeDir, cwd }: { homeDir: string; cwd: string }) => [
    { id: 'home-agents', path: join(homeDir, '.agents/skills'), sourceKind: 'home', owner: null },
    {
      id: 'home-claude',
      path: join(homeDir, '.claude/skills'),
      sourceKind: 'home',
      owner: 'claude'
    },
    { id: 'repo-agents', path: join(cwd, '.agents/skills'), sourceKind: 'repo', owner: null }
  ]
}))

import { retireRenamedBundledSkills } from './skill-name-migration'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(local = false) {
  const home = await mkdtemp(join(tmpdir(), 'zkyq-skill-rename-'))
  roots.push(home)
  const cwd = join(home, 'project')
  const base = local ? cwd : home
  const canonical = join(base, '.agents/skills')
  const current = join(canonical, 'zkyq-cli')
  const old = join(canonical, 'orca-cli')
  await mkdir(old, { recursive: true })
  await writeFile(join(old, 'SKILL.md'), 'User-customized legacy guide\n')
  await cp(resolve(import.meta.dirname, '../../../skills/zkyq-cli'), current, { recursive: true })
  const lockPath = local ? join(cwd, 'skills-lock.json') : join(home, '.agents/.skill-lock.json')
  const lock = {
    version: local ? 1 : 3,
    lastSelectedAgents: ['universal'],
    skills: {
      'orca-cli': { source: 'stablyai/orca', skillFolderHash: 'unchanged-metadata' },
      'zkyq-cli': { source: WORKBENCH_SKILLS_REPOSITORY },
      'custom-skill': { source: 'someone/else', custom: 'preserve' }
    }
  }
  await writeFile(lockPath, JSON.stringify(lock))
  return {
    home,
    cwd,
    canonical,
    current,
    old,
    lockPath,
    lock,
    migrate: () =>
      retireRenamedBundledSkills({ names: ['zkyq-cli'], homeDir: home, cwd, global: !local })
  }
}

describe('bundled skill name retirement', () => {
  it('preserves edited contents outside discovery, removes the old lock key, and is idempotent', async () => {
    const f = await fixture()
    await mkdir(join(f.old, 'assets'))
    await writeFile(join(f.old, 'assets/custom.txt'), 'user attachment')
    const original = await readFile(join(f.current, 'SKILL.md'))
    const paths = await f.migrate()
    expect(paths).toHaveLength(1)
    expect(paths[0]).toContain(join('.agents', 'retired-skills', 'zkyq-cli'))
    expect(await readFile(join(paths[0], 'content/SKILL.md'), 'utf8')).toBe(
      'User-customized legacy guide\n'
    )
    expect(await readFile(join(paths[0], 'content/assets/custom.txt'), 'utf8')).toBe(
      'user attachment'
    )
    expect(await readdir(f.canonical)).toEqual(['zkyq-cli'])
    expect(await readFile(join(f.current, 'SKILL.md'))).toEqual(original)
    const lock = JSON.parse(await readFile(f.lockPath, 'utf8'))
    expect(lock.skills['orca-cli']).toBeUndefined()
    expect(lock.skills['custom-skill']).toEqual(f.lock.skills['custom-skill'])
    expect(lock.lastSelectedAgents).toEqual(['universal'])
    expect(await f.migrate()).toEqual([])
  })

  it('retires provider aliases only after their new target is available', async () => {
    const f = await fixture()
    const provider = join(f.home, '.claude/skills')
    await mkdir(provider, { recursive: true })
    await symlink(f.old, join(provider, 'orca-cli'), 'junction')
    await symlink(f.current, join(provider, 'zkyq-cli'), 'junction')
    expect(await f.migrate()).toHaveLength(2)
    expect(await readdir(provider)).toEqual(['zkyq-cli'])
    expect(await readFile(join(provider, 'zkyq-cli/SKILL.md'))).toEqual(
      await readFile(join(f.current, 'SKILL.md'))
    )
  })

  it('leaves every old copy active if a provider replacement is missing', async () => {
    const f = await fixture()
    const provider = join(f.home, '.claude/skills/orca-cli')
    await mkdir(provider, { recursive: true })
    await writeFile(join(provider, 'SKILL.md'), 'provider edit')
    await expect(f.migrate()).rejects.toThrow()
    expect(await readFile(join(f.old, 'SKILL.md'), 'utf8')).toBe('User-customized legacy guide\n')
    expect(await readFile(join(provider, 'SKILL.md'), 'utf8')).toBe('provider edit')
  })

  it.each(['missing', 'edited'])(
    'refuses a %s replacement without touching legacy data',
    async (kind) => {
      const f = await fixture()
      if (kind === 'missing') await rm(f.current, { recursive: true })
      else await writeFile(join(f.current, 'SKILL.md'), 'not this build')
      await expect(f.migrate()).rejects.toThrow()
      expect(await readFile(join(f.old, 'SKILL.md'), 'utf8')).toBe('User-customized legacy guide\n')
      expect(JSON.parse(await readFile(f.lockPath, 'utf8'))).toEqual(f.lock)
    }
  )

  it('refuses a foreign source even when its directory uses a historical name', async () => {
    const f = await fixture()
    f.lock.skills['orca-cli'].source = 'someone/else'
    await writeFile(f.lockPath, JSON.stringify(f.lock))
    await expect(f.migrate()).rejects.toThrow('not owned')
    expect((await lstat(f.old)).isDirectory()).toBe(true)
  })

  it('does not follow an external legacy alias or alter its target', async () => {
    const f = await fixture()
    const external = join(f.home, 'external')
    await mkdir(external)
    await writeFile(join(external, 'SKILL.md'), 'external content')
    const provider = join(f.home, '.claude/skills')
    await mkdir(provider, { recursive: true })
    await symlink(external, join(provider, 'orca-cli'), 'junction')
    await expect(f.migrate()).rejects.toThrow('external target')
    expect(await readFile(join(external, 'SKILL.md'), 'utf8')).toBe('external content')
    expect((await lstat(f.old)).isDirectory()).toBe(true)
  })

  it('recovers lock-only retirement after an interrupted archive', async () => {
    const f = await fixture()
    await rm(f.old, { recursive: true })
    expect(await f.migrate()).toEqual([])
    expect(JSON.parse(await readFile(f.lockPath, 'utf8')).skills['orca-cli']).toBeUndefined()
  })

  it('supports project-local installs without changing a global lock', async () => {
    const f = await fixture(true)
    await mkdir(join(f.home, '.agents'))
    await writeFile(join(f.home, '.agents/.skill-lock.json'), 'global sentinel')
    expect(await f.migrate()).toHaveLength(1)
    expect(JSON.parse(await readFile(f.lockPath, 'utf8')).skills['orca-cli']).toBeUndefined()
    expect(await readFile(join(f.home, '.agents/.skill-lock.json'), 'utf8')).toBe('global sentinel')
  })
})
