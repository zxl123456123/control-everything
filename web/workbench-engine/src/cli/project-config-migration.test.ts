import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrateProjectConfig } from './project-config-migration'
import { REPO_HANDLERS } from './handlers/repo'
import type { HandlerContext } from './dispatch'

const fixtures: string[] = []
function git(repo: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
}
function fixture(): string {
  const repo = mkdtempSync(join(tmpdir(), 'zkyq-config-migration-'))
  fixtures.push(repo)
  git(repo, 'init')
  git(repo, 'config', 'user.email', 'fixture@example.invalid')
  git(repo, 'config', 'user.name', 'Fixture')
  writeFileSync(join(repo, 'orca.yaml'), 'initial\n')
  git(repo, 'add', 'orca.yaml')
  git(repo, 'commit', '-m', 'fixture')
  return repo
}
afterEach(() => {
  vi.unstubAllEnvs()
  for (const repo of fixtures.splice(0)) rmSync(repo, { recursive: true, force: true })
})

describe('project config migration', () => {
  it('preserves staged and unstaged contents while moving the tracked file', () => {
    const repo = fixture()
    writeFileSync(join(repo, 'orca.yaml'), 'staged\n')
    git(repo, 'add', 'orca.yaml')
    writeFileSync(join(repo, 'orca.yaml'), 'unstaged\n')
    expect(migrateProjectConfig(repo, true).dryRun).toBe(true)
    expect(readFileSync(join(repo, 'orca.yaml'), 'utf8')).toBe('unstaged\n')
    expect(migrateProjectConfig(repo, false).dryRun).toBe(false)
    expect(git(repo, 'show', ':zkyq.yaml')).toBe('staged\n')
    expect(readFileSync(join(repo, 'zkyq.yaml'), 'utf8')).toBe('unstaged\n')
    expect(git(repo, 'ls-files', '--', 'orca.yaml')).toBe('')
    expect(git(repo, 'ls-files', '--', 'zkyq.yaml')).toContain('zkyq.yaml')
  })

  it('refuses existing destinations without changing either file', () => {
    const repo = fixture()
    writeFileSync(join(repo, 'zkyq.yaml'), 'new\n')
    expect(() => migrateProjectConfig(repo, false)).toThrow('already exists')
    expect(readFileSync(join(repo, 'orca.yaml'), 'utf8')).toBe('initial\n')
    expect(readFileSync(join(repo, 'zkyq.yaml'), 'utf8')).toBe('new\n')
  })

  it('refuses a non-root path', () => {
    const repo = fixture()
    const nested = join(repo, 'nested')
    mkdirSync(nested)
    writeFileSync(join(nested, 'orca.yaml'), 'nested\n')
    expect(() => migrateProjectConfig(nested, false)).toThrow('Git worktree root')
    expect(readFileSync(join(nested, 'orca.yaml'), 'utf8')).toBe('nested\n')
  })

  it('migrates an untracked file without staging it', () => {
    const repo = fixture()
    git(repo, 'rm', '--cached', 'orca.yaml')
    const before = git(repo, 'diff', '--cached')
    expect(migrateProjectConfig(repo, true)).toMatchObject({ dryRun: true, tracked: false })
    expect(readFileSync(join(repo, 'orca.yaml'), 'utf8')).toBe('initial\n')
    expect(migrateProjectConfig(repo, false)).toMatchObject({ dryRun: false, tracked: false })
    expect(readFileSync(join(repo, 'zkyq.yaml'), 'utf8')).toBe('initial\n')
    expect(() => readFileSync(join(repo, 'orca.yaml'))).toThrow()
    expect(git(repo, 'diff', '--cached')).toBe(before)
    expect(git(repo, 'ls-files', '--', 'zkyq.yaml')).toBe('')
  })

  it('refuses to expose an ignored configuration until the new name is ignored too', () => {
    const repo = fixture()
    git(repo, 'rm', '--cached', 'orca.yaml')
    writeFileSync(join(repo, '.gitignore'), 'orca.yaml\n')
    expect(() => migrateProjectConfig(repo, true)).toThrow('Update Git ignore rules first')
    expect(() => migrateProjectConfig(repo, false)).toThrow('Update Git ignore rules first')
    expect(readFileSync(join(repo, 'orca.yaml'), 'utf8')).toBe('initial\n')
    writeFileSync(join(repo, '.gitignore'), 'orca.yaml\nzkyq.yaml\n')
    expect(migrateProjectConfig(repo, false).tracked).toBe(false)
    expect(readFileSync(join(repo, 'zkyq.yaml'), 'utf8')).toBe('initial\n')
    expect(git(repo, 'check-ignore', 'zkyq.yaml')).toBe('zkyq.yaml\n')
  })

  it('does not overwrite a destination tracked in the index but missing on disk', () => {
    const repo = fixture()
    const target = join(repo, 'zkyq.yaml')
    writeFileSync(target, 'staged target\n')
    git(repo, 'add', 'zkyq.yaml')
    rmSync(target)
    expect(() => migrateProjectConfig(repo, false)).toThrow()
    expect(git(repo, 'show', ':zkyq.yaml')).toBe('staged target\n')
    expect(readFileSync(join(repo, 'orca.yaml'), 'utf8')).toBe('initial\n')
  })

  it('does not let ambient Git overrides redirect the migration', () => {
    const repo = fixture()
    const other = fixture()
    vi.stubEnv('GIT_DIR', join(other, '.git'))
    vi.stubEnv('GIT_WORK_TREE', other)
    expect(migrateProjectConfig(repo, false).dryRun).toBe(false)
    vi.unstubAllEnvs()
    expect(readFileSync(join(repo, 'zkyq.yaml'), 'utf8')).toBe('initial\n')
    expect(readFileSync(join(other, 'orca.yaml'), 'utf8')).toBe('initial\n')
    expect(git(other, 'status', '--short')).toBe('')
  })

  it('rejects explicitly or implicitly selected remote hosts before touching files', async () => {
    const repo = fixture()
    const context = {
      flags: new Map([
        ['path', repo],
        ['environment', 'remote']
      ]),
      json: true
    } as HandlerContext
    await expect(REPO_HANDLERS['repo migrate-config'](context)).rejects.toThrow('runs locally')
    context.flags.delete('environment')
    vi.stubEnv('ORCA_CLI_CWD', '/remote/project')
    await expect(REPO_HANDLERS['repo migrate-config'](context)).rejects.toThrow('runs locally')
    expect(readFileSync(join(repo, 'orca.yaml'), 'utf8')).toBe('initial\n')
  })

  it('rejects a valued dry-run flag before touching files', async () => {
    const repo = fixture()
    const context = {
      flags: new Map([
        ['path', repo],
        ['dry-run', 'true']
      ]),
      json: true
    } as HandlerContext
    await expect(REPO_HANDLERS['repo migrate-config'](context)).rejects.toThrow(
      'does not accept a value'
    )
    expect(readFileSync(join(repo, 'orca.yaml'), 'utf8')).toBe('initial\n')
    expect(git(repo, 'status', '--short')).toBe('')
  })
})
