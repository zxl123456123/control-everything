import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeHookTestRepo } from '../hooks-test-fixtures'
import { RuntimeRepositoryHooksCommands } from './runtime-repository-hooks-commands'

describe('project configuration selection', () => {
  it('reports and uses the selected file without modifying either project file', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'zkyq-project-config-'))
    try {
      const legacy = join(repoPath, 'orca.yaml')
      const current = join(repoPath, 'zkyq.yaml')
      const oldText = 'scripts:\n  setup: echo old\n'
      const newText = 'scripts:\n  setup: echo new\n'
      writeFileSync(legacy, oldText)
      const repo = { ...makeHookTestRepo(), path: repoPath }
      const commands = new RuntimeRepositoryHooksCommands({ resolveRepo: async () => repo })
      expect(await commands.getRepoHooks('test')).toMatchObject({
        source: 'orca.yaml',
        hooks: { scripts: { setup: 'echo old' } }
      })
      expect(await commands.checkRepoHooks('test')).toMatchObject({
        projectConfig: { name: 'orca.yaml', conflict: false }
      })
      writeFileSync(current, newText)
      expect(await commands.getRepoHooks('test')).toMatchObject({
        source: 'zkyq.yaml',
        hooks: { scripts: { setup: 'echo new' } }
      })
      expect(await commands.checkRepoHooks('test')).toMatchObject({
        hooks: { scripts: { setup: 'echo new' } },
        projectConfig: { name: 'zkyq.yaml', conflict: true }
      })
      expect(readFileSync(legacy, 'utf8')).toBe(oldText)
      expect(readFileSync(current, 'utf8')).toBe(newText)
    } finally {
      rmSync(repoPath, { recursive: true, force: true })
    }
  })
})
