import { afterEach, expect, it, vi } from 'vitest'
import { COMMAND_SPECS } from './specs'
import type { CommandSpec } from './args'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
})

async function help(platform: boolean) {
  vi.stubEnv('CE_WORKBENCH_CLI', platform ? '1' : '')
  vi.resetModules()
  return import('./help')
}

it.each([false, true])(
  'uses the same command identity regardless of the retired marker: platform=%s',
  async (platform) => {
    const { formatCommandHelp, formatGroupHelp, printHelp } = await help(platform)
    const name = 'zkyq'
    const product = 'Control Everything'
    const account = COMMAND_SPECS.find((spec) => spec.path.join(' ') === 'account add')!
    const text = formatCommandHelp(account)
    expect(text).toContain(`Usage: ${name} account add`)
    expect(text).toContain(`this ${product} host`)
    expect(text).toContain(`$ ${name} account add --agent codex`)
    expect(text).toContain('zkyq://pair?...')
    expect(formatGroupHelp(COMMAND_SPECS, ['account'])).toContain(`${name} account <command>`)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    printHelp(COMMAND_SPECS)
    expect(output.mock.calls.flat().join('\n')).toContain(`Usage: ${name} <command>`)
    expect(output.mock.calls.flat().join('\n')).toContain(`Launch ${product}`)
  }
)

it('preserves technical syntax, file paths, attribution and external URLs', async () => {
  const { formatCommandHelp } = await help(true)
  const preserved = [
    'orca://pair?name=Orca',
    'https://example.invalid/Orca?name=Orca',
    'orca.yaml .orca ZKYQ_USER_DATA_PATH',
    String.raw`C:\example\Orca\orca.exe`,
    String.raw`"C:\example\My Orca project\orca.exe"`,
    '`/home/my Orca project/orca`',
    'Orca MIT License · copyright'
  ]
  const fixture: CommandSpec = {
    path: ['account', 'add'],
    summary: 'Orca-managed accounts',
    usage: 'orca account add',
    allowedFlags: [],
    notes: preserved
  }
  const text = formatCommandHelp(fixture)
  expect(text).toContain('Control Everything-managed accounts')
  for (const value of preserved) expect(text).toContain(value)
  expect(fixture.summary).toBe('Orca-managed accounts')
  expect(fixture.usage).toBe('orca account add')
})

it('leaves an unknown user command untouched while branding the fallback help', async () => {
  const { printHelp } = await help(true)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  printHelp(COMMAND_SPECS, ['Orca user supplied command', 'orca account'])
  expect(output.mock.calls[0][0]).toContain(
    'Unknown command: Orca user supplied command orca account'
  )
  expect(output.mock.calls[1][0]).toContain('Usage: zkyq <command>')
})

it('uses a generic project in the worktree creation example', async () => {
  const { formatCommandHelp } = await help(true)
  const spec = COMMAND_SPECS.find((item) => item.path.join(' ') === 'worktree create')!
  const text = formatCommandHelp(spec)
  expect(text).toContain('--project github:example-org/example-repo')
  expect(text).not.toContain('github:stablyai/orca')
})

it('uses platform identity across the command catalog while naming the real migration and protocol fields', async () => {
  const { formatCommandHelp } = await help(true)
  for (const spec of COMMAND_SPECS) {
    const text = formatCommandHelp(spec)
    const withoutContractNames = text.replaceAll('orca.yaml', '')
    expect(withoutContractNames, spec.path.join(' ')).not.toMatch(/orca|ce-workbench/i)
  }
  const migration = COMMAND_SPECS.find((spec) => spec.path.join(' ') === 'repo migrate-config')!
  const status = COMMAND_SPECS.find((spec) => spec.path.join(' ') === 'status')!
  expect(formatCommandHelp(migration)).toContain('orca.yaml')
  expect(formatCommandHelp(status)).toContain('caller.sessionId')
})
