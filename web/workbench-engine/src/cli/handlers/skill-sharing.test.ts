import { afterEach, describe, expect, it, vi } from 'vitest'
import { REPEATED_FLAG_SEPARATOR } from '../args'
import { RuntimeRpcFailureError } from '../runtime-client'
import { SKILL_SHARING_HANDLERS } from './skill-sharing'

const successMeta = { runtimeId: 'runtime-1' }

function context(
  call: ReturnType<typeof vi.fn>,
  flags = new Map<string, string | boolean>(),
  options: { isRemote?: boolean; json?: boolean } = {}
) {
  return {
    client: { call, isRemote: options.isRemote ?? false },
    cwd: '/repo',
    flags,
    json: options.json ?? false
  } as never
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('skill sharing CLI handlers', () => {
  it('lists safe installed-skill selectors without local paths', async () => {
    const call = vi.fn().mockResolvedValue({
      id: 'request-1',
      ok: true,
      result: {
        skills: [
          {
            id: 'skill-id',
            name: 'alpha',
            description: 'Alpha skill',
            providers: ['codex'],
            sourceKind: 'home',
            sourceLabel: 'Codex',
            rootPath: '/secret/root',
            directoryPath: '/secret/root/alpha',
            skillFilePath: '/secret/root/alpha/SKILL.md',
            installed: true,
            updatedAt: null
          }
        ],
        sources: [],
        scannedAt: 1
      },
      _meta: successMeta
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await SKILL_SHARING_HANDLERS['skills installed']!(context(call, new Map(), { json: true }))

    expect(call).toHaveBeenCalledWith('skills.discover', { cwd: '/repo' })
    const output = String(log.mock.calls[0][0])
    expect(output).toContain('skill-id')
    expect(output).not.toContain('/secret/root')
  })

  it('denies publishing at preflight before invoking skills.share', async () => {
    const call = vi.fn().mockResolvedValue({
      id: 'request-1',
      ok: true,
      result: { settings: { agentSkillSharingEnabled: false } },
      _meta: successMeta
    })

    await expect(
      SKILL_SHARING_HANDLERS['skills share']!(
        context(
          call,
          new Map([
            ['skill', 'alpha'],
            ['bundle-name', 'team-skills']
          ])
        )
      )
    ).rejects.toMatchObject({ code: 'agent_skill_sharing_disabled' })
    expect(call).toHaveBeenCalledExactlyOnceWith('settings.get')
  })

  it('publishes multiple explicit skills and prints only public output', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'settings',
        ok: true,
        result: { settings: { agentSkillSharingEnabled: true } },
        _meta: successMeta
      })
      .mockResolvedValueOnce({
        id: 'share',
        ok: true,
        result: {
          status: 'ok',
          value: {
            share: { id: 'shr_public', url: 'https://share.onorca.dev/skills/share/shr_public' },
            version: {
              packageId: 'pkg_public',
              versionId: 'ver_public',
              name: 'team-skills'
            },
            selectedSkills: [
              { id: 'alpha-id', name: 'alpha', description: null },
              { id: 'beta-id', name: 'beta', description: null }
            ]
          }
        },
        _meta: successMeta
      })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await SKILL_SHARING_HANDLERS['skills share']!(
      context(
        call,
        new Map([
          ['skill', `alpha${REPEATED_FLAG_SEPARATOR}beta`],
          ['bundle-name', 'team-skills'],
          ['release-notes', 'Initial bundle']
        ]),
        { json: true }
      )
    )

    expect(call).toHaveBeenLastCalledWith(
      'skills.share',
      {
        skillSelectors: ['alpha', 'beta'],
        bundleName: 'team-skills',
        releaseNotes: 'Initial bundle',
        target: { cwd: '/repo' }
      },
      { timeoutMs: 600_000 }
    )
    const output = String(log.mock.calls[0][0])
    expect(output).toContain('shr_public')
    expect(output).toContain('pkg_public')
    expect(output).not.toMatch(/token|secret/i)
  })

  it('normalizes a human-readable bundle name before publishing', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'settings',
        ok: true,
        result: { settings: { agentSkillSharingEnabled: true } },
        _meta: successMeta
      })
      .mockResolvedValueOnce({
        id: 'share',
        ok: true,
        result: {
          status: 'ok',
          value: {
            share: { id: 'shr_public', url: 'https://share.onorca.dev/skills/share/shr_public' },
            version: {
              packageId: 'pkg_public',
              versionId: 'ver_public',
              name: 'team-skills-v2.0'
            },
            selectedSkills: [{ id: 'alpha-id', name: 'alpha', description: null }]
          }
        },
        _meta: successMeta
      })
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await SKILL_SHARING_HANDLERS['skills share']!(
      context(
        call,
        new Map([
          ['skill', 'alpha'],
          ['bundle-name', 'Téam Skills -- v2.0']
        ])
      )
    )

    expect(call).toHaveBeenLastCalledWith(
      'skills.share',
      {
        skillSelectors: ['alpha'],
        bundleName: 'team-skills-v2.0',
        releaseNotes: '',
        target: { cwd: '/repo' }
      },
      { timeoutMs: 600_000 }
    )
  })

  it('rejects a bundle name that cannot produce a valid package name', async () => {
    const call = vi.fn()

    await expect(
      SKILL_SHARING_HANDLERS['skills share']!(
        context(
          call,
          new Map([
            ['skill', 'alpha'],
            ['bundle-name', '🔥']
          ])
        )
      )
    ).rejects.toMatchObject({
      code: 'invalid_argument',
      message: '--bundle-name must contain at least one English letter or number.'
    })
    expect(call).not.toHaveBeenCalled()
  })

  it.each([
    ['a forwarded shell', false, '/remote/repo'],
    ['a paired runtime', true, undefined]
  ])('rejects %s before any discovery or publish call', async (_label, isRemote, forwardedCwd) => {
    if (forwardedCwd) {
      vi.stubEnv('ZKYQ_CLI_CWD', forwardedCwd)
    }
    const call = vi.fn()

    await expect(
      SKILL_SHARING_HANDLERS['skills share']!(
        context(
          call,
          new Map([
            ['skill', 'alpha'],
            ['bundle-name', 'alpha']
          ]),
          { isRemote }
        )
      )
    ).rejects.toMatchObject({
      code: 'invalid_environment',
      message:
        'zkyq skills share must run on the machine whose installed skills you want to use. Run the command from a Control Everything terminal on that machine.'
    })
    await expect(
      SKILL_SHARING_HANDLERS['skills installed']!(context(call, new Map(), { isRemote }))
    ).rejects.toMatchObject({
      code: 'invalid_environment',
      message:
        'zkyq skills installed must run on the machine whose installed skills you want to use. Run the command from a Control Everything terminal on that machine.'
    })
    expect(call).not.toHaveBeenCalled()
  })

  it('points to the current command when no skill is selected', async () => {
    const call = vi.fn()

    await expect(SKILL_SHARING_HANDLERS['skills share']!(context(call))).rejects.toMatchObject({
      code: 'invalid_argument',
      message:
        'Select at least one installed skill with --skill. Run `zkyq skills installed` to list them.'
    })
    expect(call).not.toHaveBeenCalled()
  })

  it('requests sign-in when the sharing service requires reconnection', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ result: { settings: {} } })
      .mockResolvedValueOnce({ result: { status: 'reconnect-required' } })

    await expect(
      SKILL_SHARING_HANDLERS['skills share']!(
        context(
          call,
          new Map([
            ['skill', 'alpha'],
            ['bundle-name', 'alpha']
          ])
        )
      )
    ).rejects.toMatchObject({
      code: 'authentication_required',
      message: 'Sign in to Control Everything and try again.'
    })
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('gives an actionable upgrade error for an older runtime', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'settings',
        ok: true,
        result: { settings: {} },
        _meta: successMeta
      })
      .mockRejectedValueOnce(
        new RuntimeRpcFailureError({
          id: 'share',
          ok: false,
          error: { code: 'method_not_found', message: 'Unknown method' },
          _meta: successMeta
        })
      )

    await expect(
      SKILL_SHARING_HANDLERS['skills share']!(
        context(
          call,
          new Map([
            ['skill', 'alpha'],
            ['bundle-name', 'alpha']
          ])
        )
      )
    ).rejects.toMatchObject({
      code: 'update_required',
      message:
        'The connected Control Everything runtime does not support agent skill sharing yet. Update Control Everything on that machine and try again.'
    })
  })
})
