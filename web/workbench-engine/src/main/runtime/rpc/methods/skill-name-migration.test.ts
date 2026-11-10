import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcContext } from '../core'

vi.mock('../../../skills/skill-name-migration', () => ({ retireRenamedBundledSkills: vi.fn() }))
vi.mock('../../../skills/skill-discovery-target', () => ({
  clearSkillDiscoveryCaches: vi.fn(),
  resolveSkillDiscoveryTarget: vi.fn(),
  discoverSkillsOnTarget: vi.fn()
}))

import { retireRenamedBundledSkills } from '../../../skills/skill-name-migration'
import {
  clearSkillDiscoveryCaches,
  resolveSkillDiscoveryTarget
} from '../../../skills/skill-discovery-target'
import { SkillsMigrateNamesParams } from '../../../../shared/rpc-contract/skills-params'
import {
  SKILL_NAME_MIGRATION_CAPABILITY,
  SKILL_RUNTIME_CAPABILITIES
} from '../../../../shared/skill-install-capability'
import { SKILL_METHODS } from './skills'

const method = SKILL_METHODS.find((method) => method.name === 'skills.migrateNames')!
const resolveProjectRuntimeForWorktree = vi.fn()
const context = { runtime: { resolveProjectRuntimeForWorktree } } as unknown as RpcContext

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(resolveSkillDiscoveryTarget).mockReturnValue({ kind: 'native-host', cwd: undefined })
  vi.mocked(retireRenamedBundledSkills).mockResolvedValue([
    '/tmp/example/.agents/retired-skills/receipt'
  ])
})

describe('skill name migration RPC', () => {
  it('requires skill administration and advertises only native migration', () => {
    expect(method.permission).toBe('skills-admin')
    expect(SKILL_RUNTIME_CAPABILITIES).toContain(SKILL_NAME_MIGRATION_CAPABILITY)
  })

  it.each([
    { names: [] },
    { names: ['orca-cli'] },
    { names: ['../zkyq-cli'] },
    { names: ['custom'] },
    { names: ['zkyq-cli'], homeDir: '/another-user' },
    { names: ['zkyq-cli'], target: { cwd: '/another-project' } },
    { names: ['zkyq-cli'], target: { projectRuntime: { status: 'resolved' } } }
  ])('rejects unsupported names and caller-selected filesystem roots: %j', (params) => {
    expect(SkillsMigrateNamesParams.safeParse(params).success).toBe(false)
  })

  it('runs on the executing host and returns preserved archive paths', async () => {
    const params = SkillsMigrateNamesParams.parse({
      names: ['zkyq-cli'],
      target: { worktreeId: 'workspace' }
    })
    await expect(method.handler(params, context)).resolves.toEqual({
      archived: ['/tmp/example/.agents/retired-skills/receipt']
    })
    expect(resolveProjectRuntimeForWorktree).toHaveBeenCalledWith('workspace')
    expect(retireRenamedBundledSkills).toHaveBeenCalledWith({ names: ['zkyq-cli'], global: true })
    expect(clearSkillDiscoveryCaches).toHaveBeenCalledOnce()
  })

  it('does not migrate Windows files for a WSL installation', async () => {
    vi.mocked(resolveSkillDiscoveryTarget).mockReturnValue({
      kind: 'wsl',
      distro: 'Ubuntu',
      homeDir: '/tmp/example',
      cwd: undefined
    })
    await expect(method.handler({ names: ['zkyq-cli'] }, context)).rejects.toThrow(
      'machine that stores the skills'
    )
    expect(retireRenamedBundledSkills).not.toHaveBeenCalled()
    expect(clearSkillDiscoveryCaches).not.toHaveBeenCalled()
  })

  it('preserves the migration failure and invalidates potentially partial inventory', async () => {
    vi.mocked(retireRenamedBundledSkills).mockRejectedValue(new Error('replacement mismatch'))
    await expect(method.handler({ names: ['zkyq-cli'] }, context)).rejects.toThrow(
      'replacement mismatch'
    )
    expect(clearSkillDiscoveryCaches).toHaveBeenCalledOnce()
  })
})
