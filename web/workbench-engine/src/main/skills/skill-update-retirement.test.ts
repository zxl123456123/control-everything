import { EventEmitter } from 'node:events'
import type { spawn } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { SkillUpdateRunner } from './skill-update-run'

function fixture(retireRenamedSkills: (names: string[]) => Promise<string[]>) {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn()
  })
  const runner = new SkillUpdateRunner({
    sourceCommit: 'a'.repeat(40),
    detectAgentKeys: () => ['universal'],
    resolveCommand: () => 'npx',
    spawnProcess: (() => child) as unknown as typeof spawn,
    retireRenamedSkills,
    rescanOutdatedNames: async () => []
  })
  expect(runner.start(['zkyq-cli'])).toEqual({ started: true })
  return { runner, child }
}

describe('skill update retirement settlement', () => {
  it('does not report success when the old copy cannot be retired', async () => {
    const { runner, child } = fixture(async () => {
      throw new Error('legacy copy is linked outside its root')
    })
    child.emit('close', 0)
    await vi.waitFor(() =>
      expect(runner.getState()).toMatchObject({
        state: 'error',
        failedNames: ['zkyq-cli'],
        message: 'legacy copy is linked outside its root'
      })
    )
  })

  it('holds the install slot through retirement and reports the preserved archive', async () => {
    let release!: (paths: string[]) => void
    const pending = new Promise<string[]>((resolve) => {
      release = resolve
    })
    const { runner, child } = fixture(() => pending)
    child.emit('close', 0)
    runner.cancel()
    expect(runner.start(['zkyq-cli'])).toEqual({ started: false, reason: 'already-running' })
    release(['/fixture/.agents/retired-skills/zkyq-cli/receipt'])
    await vi.waitFor(() =>
      expect(runner.getState()).toMatchObject({
        state: 'success',
        output: expect.stringContaining('/fixture/.agents/retired-skills/zkyq-cli/receipt')
      })
    )
  })

  it('never moves old data after a failed installer process', async () => {
    const retire = vi.fn(async () => [])
    const { child } = fixture(retire)
    child.emit('close', 1)
    expect(retire).not.toHaveBeenCalled()
  })
})
