import { describe, expect, it } from 'vitest'
import {
  buildWindowsPtyCompatibilityOptions,
  resolveWindowsShellOverride
} from './windows-pty-compatibility'

describe('Windows PTY cursor line reflow', () => {
  it.each(['Windows', 'Linux', 'Macintosh'])(
    'uses the Windows host path on a %s viewer',
    (userAgent) => {
      expect(
        buildWindowsPtyCompatibilityOptions({
          userAgent,
          connectionId: null,
          executionHostId: 'runtime:host',
          cwd: 'C:/example/repo'
        })
      ).toEqual({ reflowCursorLine: true })
    }
  )

  it('also applies to a native Windows pane before its cwd arrives', () => {
    expect(
      buildWindowsPtyCompatibilityOptions({
        userAgent: 'Windows',
        connectionId: null,
        executionHostId: 'local'
      })
    ).toMatchObject({ reflowCursorLine: true, windowsPty: { backend: 'conpty' } })
  })

  it('honors a global WSL shell selection before classifying a native path', () => {
    expect(
      buildWindowsPtyCompatibilityOptions({
        userAgent: 'Windows',
        connectionId: null,
        executionHostId: 'local',
        cwd: 'C:/example/repo',
        shellOverride: resolveWindowsShellOverride(undefined, 'wsl.exe')
      })
    ).toEqual({})
  })

  it.each([
    { cwd: '/home/project' },
    { cwd: '\\\\wsl.localhost\\Ubuntu\\home\\project' },
    { cwd: 'C:/example/repo', shellOverride: 'wsl.exe' }
  ])('keeps POSIX and WSL shells in charge of their own prompt: %j', (context) => {
    expect(
      buildWindowsPtyCompatibilityOptions({
        ...context,
        userAgent: 'Windows',
        connectionId: null,
        executionHostId: 'runtime:host'
      })
    ).toEqual({})
  })
})
