import { describe, expect, it } from 'vitest'
import { createDaemonPtyEnvironment } from './daemon/pty-subprocess/spawn-environment'
import { injectHistoryEnv, updateHistoryEnvForFallback } from './terminal-history'

describe('history handoff identity', () => {
  it('drops inherited handoff names while preserving a caller history file', () => {
    const env = {
      HISTFILE: '/tmp/example/user-history',
      ORCA_HISTFILE: '/tmp/example/old',
      ZKYQ_HISTFILE: '/tmp/example/stale'
    }
    const result = injectHistoryEnv(env, 'worktree', 'zsh', '/tmp/example')
    expect(env).toEqual({ HISTFILE: '/tmp/example/user-history' })
    expect(result.histFile).toBeNull()
  })

  it('updates the renamed handoff when falling back to another shell', () => {
    const env: Record<string, string> = {
      HISTFILE: '/tmp/example/zsh_history',
      ZKYQ_HISTFILE: '/tmp/example/zsh_history'
    }
    updateHistoryEnvForFallback(env, 'bash', {
      shell: 'zsh',
      histFile: env.HISTFILE,
      fishSession: null,
      historyDir: '/tmp/example'
    })
    expect(env.HISTFILE).toBe('/tmp/example/bash_history')
    expect(env.ZKYQ_HISTFILE).toBe(env.HISTFILE)
  })

  it('keeps a fresh daemon handoff but refuses the old name', () => {
    const env = createDaemonPtyEnvironment({
      sessionId: 's',
      cols: 80,
      rows: 24,
      env: { ORCA_HISTFILE: '/tmp/example/old', ZKYQ_HISTFILE: '/tmp/example/current' }
    })
    expect(env.ORCA_HISTFILE).toBeUndefined()
    expect(env.ZKYQ_HISTFILE).toBe('/tmp/example/current')
  })
})
