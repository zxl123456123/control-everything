import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ retire: vi.fn(async () => ['/archive/saved']) }))
vi.mock('../../main/skills/skill-name-migration', () => ({
  retireRenamedBundledSkills: mocks.retire
}))
vi.mock('./bundled-skill-guide-table', () => ({
  loadCanonicalGuides: async () => [{ name: 'zkyq-cli', aliases: [] }]
}))
import { SKILL_HANDLERS } from './skills'
import { validateCommandAndFlags } from '../args'
import { SKILL_COMMAND_SPECS } from '../specs/skills'
import { main } from '../index'
import { formatCommandHelp } from '../help'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  mocks.retire.mockClear()
})
async function migrate(entries: [string, string | boolean][]) {
  vi.stubEnv('ZKYQ_CLI_CWD', '')
  return SKILL_HANDLERS['skills migrate']({
    flags: new Map(entries),
    json: true,
    client: { isRemote: false }
  } as never)
}

describe('standalone skill retirement command', () => {
  it('advertises only the supported local migration options', () => {
    const spec = SKILL_COMMAND_SPECS.find((entry) => entry.path.join(' ') === 'skills migrate')!
    const help = formatCommandHelp(spec)
    expect(help).toContain('--local')
    expect(help).toContain('--skill')
    expect(help).toContain('--json')
    expect(help).not.toContain('--environment')
    expect(help).not.toContain('--pairing-code')
  })
  it('refuses a remote runtime selection before touching local files', async () => {
    vi.stubEnv('ZKYQ_CLI_CWD', '')
    await expect(
      SKILL_HANDLERS['skills migrate']({
        flags: new Map([['all', true]]),
        json: true,
        client: { isRemote: true }
      } as never)
    ).rejects.toThrow('machine where the skills were installed')
    expect(mocks.retire).not.toHaveBeenCalled()
  })
  it('reaches retirement through the real CLI dispatch table', async () => {
    vi.stubEnv('ZKYQ_CLI_CWD', '')
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await main(['skills', 'migrate', '--all', '--json'], '/fixture')
    expect(mocks.retire).toHaveBeenCalledWith({ names: ['zkyq-cli'], global: true })
    expect(output.mock.calls.map((call) => String(call[0])).join('')).toContain('/archive/saved')
  })
  it('validates the public command and passes an explicit project scope', async () => {
    const flags = new Map<string, string | boolean>([
      ['all', true],
      ['local', true]
    ])
    validateCommandAndFlags(SKILL_COMMAND_SPECS, { commandPath: ['skills', 'migrate'], flags })
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await migrate([...flags])
    expect(mocks.retire).toHaveBeenCalledWith({ names: ['zkyq-cli'], global: false })
    expect(JSON.parse(String(output.mock.calls[0][0])).archived).toEqual(['/archive/saved'])
  })

  it('requires explicit selection and rejects historical names', async () => {
    await expect(migrate([])).rejects.toThrow('Select current skill names')
    await expect(migrate([['skill', 'orca-cli']])).rejects.toThrow('Unknown skill')
    expect(mocks.retire).not.toHaveBeenCalled()
  })

  it('never performs migration through a forwarded WSL host', async () => {
    vi.stubEnv('ZKYQ_CLI_CWD', '/forwarded/workspace')
    await expect(
      SKILL_HANDLERS['skills migrate']({
        flags: new Map([['all', true]]),
        json: true
      } as never)
    ).rejects.toThrow('machine where the skills were installed')
    expect(mocks.retire).not.toHaveBeenCalled()
  })

  it('propagates retirement failure instead of printing success', async () => {
    mocks.retire.mockRejectedValueOnce(new Error('replacement mismatch'))
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await expect(migrate([['all', true]])).rejects.toThrow('replacement mismatch')
    expect(output).not.toHaveBeenCalled()
  })
})
