import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createDaemonPtyEnvironment } from '../daemon/pty-subprocess/spawn-environment'
import { buildInheritedLocalPtyEnvironment } from '../providers/local-pty-spawn-environment'

afterEach(() => vi.unstubAllEnvs())

describe('terminal program identity', () => {
  it.each([
    ['local', () => buildInheritedLocalPtyEnvironment(undefined)],
    ['daemon', () => createDaemonPtyEnvironment({ sessionId: 's', cols: 80, rows: 24 })]
  ])('identifies %s terminals consistently without losing capabilities', (_label, build) => {
    vi.stubEnv('ORCA_APP_VERSION', '1.2.3')
    const env = build()
    expect(env).toMatchObject({
      TERM_PROGRAM: 'zkyq',
      TERM_PROGRAM_VERSION: '1.2.3',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_HYPERLINK: '1'
    })
    const child = spawnSync(
      process.execPath,
      ['-e', 'process.stdout.write(process.env.TERM_PROGRAM)'],
      {
        env,
        encoding: 'utf8'
      }
    )
    expect(child.status).toBe(0)
    expect(child.stdout).toBe('zkyq')
  })

  it('still removes the identifier when a launch requests it', () => {
    expect(
      buildInheritedLocalPtyEnvironment(undefined, ['TERM_PROGRAM']).TERM_PROGRAM
    ).toBeUndefined()
    expect(
      createDaemonPtyEnvironment({
        sessionId: 's',
        cols: 80,
        rows: 24,
        envToDelete: ['TERM_PROGRAM']
      }).TERM_PROGRAM
    ).toBeUndefined()
  })
})
