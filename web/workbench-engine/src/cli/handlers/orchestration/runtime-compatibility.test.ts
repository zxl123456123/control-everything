import { afterEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { win32 } from 'node:path'
import { resolveCompatibilityCliCommand, resolvePackagedWindowsCompatibilityCommand } from './runtime-compatibility'
import { AskParams, CheckParams } from '../../../shared/rpc-contract/orchestration-params'

afterEach(() => vi.unstubAllEnvs())

it.each(['orca', 'orca-ide', 'orca-dev', 'ce-workbench'])('rejects the retired %s command in RPC inputs', (command) => {
  expect(CheckParams.safeParse({ compatibilityCliCommand: command }).success).toBe(false)
  expect(AskParams.safeParse({ question: 'Continue?', compatibilityCliCommand: command }).success).toBe(false)
  expect(AskParams.safeParse({ resume: 'question_test', compatibilityWindowsCommand: command }).success).toBe(false)
  vi.stubEnv('ORCA_CLI_COMMAND', command)
  expect(resolveCompatibilityCliCommand()).toBe('zkyq')
})

it.each(['zkyq-dev', '/workbench/bin/zkyq-dev', win32.join(tmpdir(), 'bin', 'zkyq-dev.cmd')])('keeps the current development command %s', (command) => {
  vi.stubEnv('ORCA_CLI_COMMAND', command)
  expect(resolveCompatibilityCliCommand()).toBe('zkyq-dev')
  expect(CheckParams.safeParse({ compatibilityCliCommand: 'zkyq-dev' }).success).toBe(true)
  expect(AskParams.safeParse({ question: 'Continue?', compatibilityCliCommand: 'zkyq-dev' }).success).toBe(true)
  expect(AskParams.safeParse({ resume: 'question_test', compatibilityWindowsCommand: 'zkyq-dev' }).success).toBe(false)
})

it.each(['', 'zkyq', win32.join(tmpdir(), 'workbench', 'bin', 'zkyq.exe'), '/workbench/bin/zkyq'])('keeps %s usable through orchestration RPC validation', (command) => {
  vi.stubEnv('ORCA_CLI_COMMAND', command)
  const cliCommand = resolveCompatibilityCliCommand()
  expect(cliCommand).toBe('zkyq')
  expect(CheckParams.parse({ compatibilityCliCommand: cliCommand }).compatibilityCliCommand).toBe('zkyq')
  expect(AskParams.parse({ question: 'Continue?', compatibilityCliCommand: cliCommand }).compatibilityCliCommand).toBe('zkyq')
})

it('preserves packaged Windows resume-command validation for zkyq', () => {
  vi.stubEnv('ORCA_WINDOWS_PACKAGED_CLI_LAUNCHER', '1')
  vi.stubEnv('ORCA_CLI_COMMAND', 'zkyq')
  const command = resolvePackagedWindowsCompatibilityCommand()
  expect(AskParams.parse({ resume: 'question_test', compatibilityWindowsCommand: command }).compatibilityWindowsCommand).toBe('zkyq')
  vi.stubEnv('ORCA_CLI_COMMAND', 'unrecognized-command')
  expect(resolvePackagedWindowsCompatibilityCommand).toThrow('valid resume command')
})
