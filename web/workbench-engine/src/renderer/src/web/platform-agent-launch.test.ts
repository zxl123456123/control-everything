import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import {
  findPlatformProviderSession,
  linkPlatformTaskSession,
  startPlatformTaskProgress,
  resumePlatformTaskProgress,
  adoptPlatformTaskProgress,
  platformTaskCwd,
  platformTaskPrompt,
  type PlatformAgentPendingLink,
  type PlatformTaskBrief
} from './platform-agent-launch'

const brief = (): PlatformTaskBrief => ({
  item: { id: 'task', origin: 'task', project_id: 'project', title: 'Implement search' },
  brief: {
    request_text: 'Search titles',
    acceptance_text: 'Matches are visible',
    constraints_text: 'Keep data',
    references: ['README.md'],
    execution_directory_id: 'directory'
  },
  directories: [{ binding_id: 'directory', path: String.raw`C:\example\Repo\src` }]
})
const pending: PlatformAgentPendingLink = {
  taskId: 'task',
  projectId: 'project',
  title: 'Implement search',
  agent: 'codex',
  environmentId: 'env',
  worktreeId: 'worktree',
  tabId: 'web-terminal-tab'
}
const status = (patch: Partial<AgentStatusEntry> = {}): AgentStatusEntry =>
  ({
    connectionId: 'env',
    worktreeId: 'worktree',
    tabId: 'web-terminal-tab',
    agentType: 'codex',
    providerSession: { key: 'session_id', id: 'provider-session' },
    ...patch
  }) as AgentStatusEntry

afterEach(() => vi.unstubAllGlobals())

describe('platform task launch scope and identity', () => {
  it('does not resume a released historical run', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    expect(() => resumePlatformTaskProgress({ item: brief().item, native_run: { id: 'old', client_token: 'old',
      launch_state: 'created', active_slot: 0, binding_revision: 2, terminal_binding: null } }, 'new')).toThrow('活跃会话')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('submits one persistent launch intent with CSRF and no commands or copied prompt', async () => {
    const value = brief(); value.item.revision = 4; value.brief.revision = 3
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ csrf_token: 'fixture' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ item: value.item, native_run: null }) })
    vi.stubGlobal('fetch', fetcher)
    await startPlatformTaskProgress(value, { agent: 'codex', worktreeId: 'worktree', clientToken: 'intent' })
    expect(fetcher.mock.calls[1][0]).toBe('/api/workspace/tasks/task/native-start')
    expect(fetcher.mock.calls[1][1].headers['X-Session-CSRF']).toBe('fixture')
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ expected_revision: 4, brief_revision: 3,
      client_token: 'intent', agent: 'codex', worktree_id: 'worktree' })
  })
  it('replays the saved start payload rather than current revisions', async () => {
    const saved = { expected_revision: 2, brief_revision: 1, client_token: 'saved', agent: 'claude', worktree_id: 'original' }
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ csrf_token: 'fixture' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetcher)
    await startPlatformTaskProgress(brief(), { agent: 'codex', worktreeId: 'other', clientToken: 'new', frozenRequest: saved })
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(saved)
  })
  it('keeps resume and adopt as separate explicit actions', async () => {
    const progress = { item: { ...brief().item, revision: 5 }, native_run: { id: 'run', client_token: 'saved',
      launch_state: 'created', active_slot: 1, binding_revision: 3, terminal_binding: null } }
    const fetcher = vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () =>
      url === '/api/bootstrap' ? { csrf_token: 'fixture' } : progress }))
    vi.stubGlobal('fetch', fetcher)
    await resumePlatformTaskProgress(progress, 'resume-token')
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ native_run_id: 'run', expected_binding_revision: 3, client_token: 'resume-token' })
    await adoptPlatformTaskProgress(progress, 'session-row', 'worktree', 'adopt-token')
    expect(JSON.parse(fetcher.mock.calls[3][1].body)).toEqual({ session_id: 'session-row', worktree_id: 'worktree', expected_revision: 5, client_token: 'adopt-token' })
  })
  it('resolves Windows separators, case and dot segments within the workspace', () => {
    const value = brief()
    value.directories[0].path = String.raw`c:\example\REPO\src\..\docs`
    expect(platformTaskCwd(value, 'task', 'project', 'C:/example/Repo')).toBe('c:/example/REPO/docs')
  })
  it.each(['C:/example/Repo-Other', 'C:/example/Repo/../Other', 'C:/example/Elsewhere'])(
    'rejects outside cwd %s',
    (path) => {
      const value = brief()
      value.directories[0].path = path
      expect(() => platformTaskCwd(value, 'task', 'project', 'C:/example/Repo')).toThrow('不在当前工作区')
    }
  )
  it('rejects a moved task and removed directory binding', () => {
    const value = brief()
    value.item.project_id = 'moved'
    expect(() => platformTaskCwd(value, 'task', 'project', 'C:/example/Repo')).toThrow('所属项目')
    value.item.project_id = 'project'
    value.directories = []
    expect(() => platformTaskCwd(value, 'task', 'project', 'C:/example/Repo')).toThrow('执行目录不可用')
  })
  it('uses the workspace root without a saved execution directory and preserves brief requirements', () => {
    const value = brief()
    value.brief.execution_directory_id = null
    expect(platformTaskCwd(value, 'task', 'project', 'C:/example/Repo')).toBe('C:/example/Repo')
    expect(platformTaskPrompt(value)).toContain('Matches are visible')
    expect(platformTaskPrompt(value)).toContain('Keep data')
    expect(platformTaskPrompt(value)).toContain('README.md')
  })
  it.each([
    { connectionId: 'other' },
    { connectionId: undefined },
    { worktreeId: 'other' },
    { tabId: 'other' },
    { agentType: 'claude' as const },
    { restoredUnconfirmed: true },
    { isReplay: true },
    { providerSessionOnly: true },
    { programStatusOnly: true },
    { providerSession: undefined }
  ])('does not invent an identity from an unrelated or unverified terminal: %j', (patch) => {
    expect(findPlatformProviderSession({ row: status(patch) }, pending)).toBeNull()
  })
  it('accepts only one exact provider identity, never a tab or PTY', () => {
    expect(findPlatformProviderSession({ row: status() }, pending)).toEqual({ key: 'session_id', id: 'provider-session' })
    expect(
      findPlatformProviderSession(
        {
          row: status(),
          other: status({
            providerSession: {
              key: 'session_id',
              id: 'second-provider'
            }
          })
        },
        pending
      )
    ).toBeNull()
  })
  it('links provider metadata using existing CSRF without business state or registry identity', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => brief() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrf_token: 'fixture-csrf' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          task_id: 'task',
          project_id: 'project',
          source: 'codex',
          source_instance: 'env',
          external_id: 'provider-session'
        })
      })
    vi.stubGlobal('fetch', fetcher)
    await linkPlatformTaskSession(pending, { key: 'session_id', id: 'provider-session' })
    const [url, request] = fetcher.mock.calls[2]
    expect(url).toBe('/api/workspace/tasks/task/sessions')
    expect(request.headers['X-Session-CSRF']).toBe('fixture-csrf')
    expect(JSON.parse(request.body)).toEqual({
      source: 'codex',
      source_instance: 'env',
      external_id: 'provider-session',
      title: 'Implement search'
    })
  })
  it.each(['grok', 'dsh', 'cursor', 'pi'] as const)('preserves %s provider metadata for exact association', (agent) => {
    const provider = agent === 'cursor' ? { key: 'conversation_id' as const, id: 'conversation' }
      : { key: 'session_id' as const, id: 'session', ...(agent === 'pi' ? { transcriptPath: '/example/session.jsonl' } : {}) }
    expect(findPlatformProviderSession({ row: status({ agentType: agent, providerSession: provider }) },
      { ...pending, agent })).toEqual(provider)
  })
  it('rejects identical ids with conflicting provider keys or Pi resume paths', () => {
    expect(findPlatformProviderSession({ row: status(), other: status({
      providerSession: { key: 'conversation_id', id: 'provider-session' }
    }) }, pending)).toBeNull()
    const row = (path: string) => status({ agentType: 'pi', providerSession: {
      key: 'session_id', id: 'session', transcriptPath: path
    } })
    expect(findPlatformProviderSession({ a: row('/first/session.jsonl'), b: row('/second/session.jsonl') },
      { ...pending, agent: 'pi' })).toBeNull()
  })
  it('does not treat the association API as a provider resume store', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => brief() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrf_token: 'fixture' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ task_id: 'task', project_id: 'project',
        source: 'pi', source_instance: 'env', external_id: 'session' }) })
    vi.stubGlobal('fetch', fetcher)
    await linkPlatformTaskSession({ ...pending, agent: 'pi' }, {
      key: 'session_id', id: 'session', transcriptPath: '/example/session.jsonl'
    })
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ source: 'pi', source_instance: 'env',
      external_id: 'session', title: 'Implement search' })
  })
  it('does not post when the task moved during the pending launch', async () => {
    const moved = brief()
    moved.item.project_id = 'other'
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => moved })
    vi.stubGlobal('fetch', fetcher)
    await expect(linkPlatformTaskSession(pending, { key: 'session_id', id: 'provider-session' })).rejects.toThrow('项目已变化')
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('retains an existing conflicting association', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => brief() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrf_token: 'fixture' }) })
      .mockResolvedValueOnce({ ok: false, status: 409 })
    vi.stubGlobal('fetch', fetcher)
    await expect(linkPlatformTaskSession(pending, { key: 'session_id', id: 'provider-session' })).rejects.toThrow(
      '已关联其他事项'
    )
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})
