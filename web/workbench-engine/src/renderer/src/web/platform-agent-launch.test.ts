import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import {
  findPlatformProviderSession,
  linkPlatformTaskSession,
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
    { providerSession: undefined }
  ])('does not invent an identity from an unrelated or unverified terminal: %j', (patch) => {
    expect(findPlatformProviderSession({ row: status(patch) }, pending)).toBeNull()
  })
  it('accepts only one exact provider identity, never a tab or PTY', () => {
    expect(findPlatformProviderSession({ row: status() }, pending)).toBe('provider-session')
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
    await linkPlatformTaskSession(pending, 'provider-session')
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
  it('does not post when the task moved during the pending launch', async () => {
    const moved = brief()
    moved.item.project_id = 'other'
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => moved })
    vi.stubGlobal('fetch', fetcher)
    await expect(linkPlatformTaskSession(pending, 'provider-session')).rejects.toThrow('项目已变化')
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('retains an existing conflicting association', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => brief() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrf_token: 'fixture' }) })
      .mockResolvedValueOnce({ ok: false, status: 409 })
    vi.stubGlobal('fetch', fetcher)
    await expect(linkPlatformTaskSession(pending, 'provider-session')).rejects.toThrow(
      '已关联其他事项'
    )
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})
