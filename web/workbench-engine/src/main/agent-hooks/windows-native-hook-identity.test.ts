import { expect, it } from 'vitest'
import {
  buildManagedCommandHook,
  createManagedCommandMatcher,
  removeManagedCommands
} from './installer-utils'
import { WINDOWS_NATIVE_HOOK_EXECUTABLE_NAME } from './windows-native-hook-executable'

it('retires previous native registrations while preserving unrelated user hooks', () => {
  const matches = createManagedCommandMatcher('claude-hook.cmd')
  const previous = '/previous/agent-hooks/orca-agent-hook.exe claude'
  const current = `/current/agent-hooks/${WINDOWS_NATIVE_HOOK_EXECUTABLE_NAME} claude`
  const user = buildManagedCommandHook('/tools/user-hook.exe claude')
  const entries = [
    { hooks: [buildManagedCommandHook(previous), user, buildManagedCommandHook(current)] }
  ]
  const cleaned = removeManagedCommands(entries, matches)
  cleaned.push({ hooks: [buildManagedCommandHook(current)] })
  expect(cleaned).toEqual([{ hooks: [user] }, { hooks: [buildManagedCommandHook(current)] }])
  expect(WINDOWS_NATIVE_HOOK_EXECUTABLE_NAME).toBe('zkyq-agent-hook.exe')
})

it.each(['orca', 'zkyq'])('recognizes encoded %s registrations for migration', (name) => {
  const command = `previous\\agent-hooks\\${name}-agent-hook.exe claude`
  const encoded =
    'powershell.exe -EncodedCommand ' + Buffer.from(command, 'utf16le').toString('base64')
  expect(createManagedCommandMatcher('claude-hook.cmd')(encoded)).toBe(true)
})

it.each([
  '/tools/zkyq-agent-hook.exe claude',
  '/tools/orca-agent-hook.exe claude',
  '/shared/agent-hooks/zkyq-agent-hook.exe codex',
  '/shared/agent-hooks/orca-agent-hook.exe claude-custom',
  '/shared/agent-hooks/user-orca-agent-hook.exe claude'
])('does not claim another command: %s', (command) => {
  expect(createManagedCommandMatcher('claude-hook.cmd')(command)).toBe(false)
})
