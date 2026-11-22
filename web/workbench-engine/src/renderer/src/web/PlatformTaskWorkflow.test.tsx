// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PlatformWorkspaceHeader } from './PlatformWorkspaceHeader'
import { contextFetch, remoteContext } from './remote-context'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'

const environmentId = '00000000-0000-4000-8000-000000000009'
const mockStore = vi.hoisted(() => ({ repos: [] as object[], worktreesByRepo: {} as Record<string, object[]> }))
vi.mock('@/store', () => ({ useAppStore: (select: (state: typeof mockStore) => unknown) => select(mockStore) }))

vi.mock('./remote-context', () => ({
  contextFetch: vi.fn(),
  remoteContext: vi.fn(),
  onContextInactive: () => () => {}
}))

const fetch = vi.mocked(contextFetch)
const project = 'workbench'
const execution: PlatformProjectBootstrap = {
  project: { id: project, name: '测试项目' },
  runtime: { environmentId, offer: { v: 2, scope: 'runtime', endpoint: 'ws://127.0.0.1:23456',
    deviceToken: 'temporary-fixture-token', publicKeyB64: 'host-key' } },
  target: { repoId: 'repo' },
  returnUrl: '/studio#project/workbench'
}
const row = (id: string, projectId = project) => ({ id, project_id: projectId, title: `事项 ${id}` })
const page = (projectId = project) => Response.json({ items: [row('one', projectId), row('two', projectId)], list_revision: 1, total: 2 })
const step = (kind: string, status: string, exitCode: number | null = null) => ({
  kind, status, attempt: 0, updated_at: '2026-11-20T08:00:00Z', exit_code: exitCode,
  target_sha: null, target_test_passed: null, delivery_id: null
})
const flow = (phase: string, status = 'running', reason: string | null = null) => ({
  id: 'flow-one', status, phase, reason, requirement_revision: 7, steps: [] as object[], reviews: []
})
const result = (id: string, current: ReturnType<typeof flow>) => Response.json({
  item: row(id), automation: { pending_since: null, flows: [current] }
})
const receipt = (id: string, phase = 'plan', exitCode: number | null = null) => Response.json({
  item: row(id),
  automation: { pending_since: null, flows: [{
    ...flow(phase), steps: [step('plan', exitCode === null ? 'running' : 'completed', exitCode)]
  }] }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  fetch.mockReset()
  vi.mocked(remoteContext).mockReset().mockReturnValue(null)
  mockStore.repos = []
  mockStore.worktreesByRepo = {}
})

async function openTasks(): Promise<HTMLSelectElement> {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '任务流水线' })))
  return screen.getByRole<HTMLSelectElement>('combobox', { name: '项目事项' })
}

it('queues the selected local task and worktree only after an explicit click and retries the same request', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const hostId = `runtime:${environmentId}`
  mockStore.repos = [{ id: 'repo', executionHostId: hostId, path: 'E:/fixture/project' }]
  mockStore.worktreesByRepo = { repo: [
    { id: 'local-tree', path: 'E:/fixture/worktree', displayName: '本机检出', hostId },
    { id: 'other-tree', path: '/fixtures/remote', displayName: '远端检出', hostId: 'ssh:other', runtimeOwnerEnvironmentId: environmentId }
  ] }
  const submissions: string[] = []
  fetch.mockImplementation(async (path, options) => {
    const url = String(path)
    if (url.startsWith('/api/workspace/items?')) return page()
    if (url === '/api/workspace/agent-tasks/one') {
      return submissions.length === 2 ? result('one', flow('plan')) :
        Response.json({ item: row('one'), automation: { pending_since: null, flows: [] } })
    }
    if (url === '/api/workspace/tasks/one/brief') return Response.json({
      item: { ...row('one'), origin: 'task', revision: 7 },
      brief: { revision: 3, request_text: '核对发布', execution_directory_id: 'dir' },
      directories: [{ binding_id: 'dir', path: 'E:/fixture/project' }]
    })
    if (url === '/api/bootstrap') return Response.json({ csrf_token: 'fixture-csrf' })
    expect(url).toBe('/api/workspace/tasks/one/automation-enable')
    expect(options?.headers).toMatchObject({ 'X-Session-CSRF': 'fixture-csrf' })
    submissions.push(String(options?.body))
    if (submissions.length === 1) throw new Error('connection interrupted')
    return Response.json({ task_id: 'one', project_id: project, source_event_id: JSON.parse(submissions[0]).client_token }, { status: 202 })
  })
  render(<PlatformWorkspaceHeader projectId={project} execution={execution} />)
  const chooser = await openTasks()
  await act(async () => fireEvent.change(chooser, { target: { value: 'one' } }))
  await act(async () => { await vi.dynamicImportSettled() })
  expect(screen.queryByRole('option', { name: /远端检出/ })).toBeNull()
  const start = screen.getByRole<HTMLButtonElement>('button', { name: '用 Codex 启动自动推进' })
  expect(start.disabled).toBe(true)
  fireEvent.change(screen.getByRole('combobox', { name: '本机工作树' }), { target: { value: 'local-tree' } })
  expect(submissions).toHaveLength(0)
  await act(async () => fireEvent.click(start))
  expect(screen.getByText('启动结果尚未确认。重试会沿用同一请求。')).toBeTruthy()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '重试原启动请求' })))
  expect(submissions).toHaveLength(2)
  expect(submissions[0]).toBe(submissions[1])
  expect(JSON.parse(submissions[0])).toMatchObject({ expected_revision: 7, brief_revision: 3, agent: 'codex', worktree_id: 'local-tree' })
  expect(screen.getByText('已入队，等待调度。')).toBeTruthy()
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(screen.getByText('制定方案').closest('li')?.getAttribute('aria-current')).toBe('step')
  expect(screen.queryByText('已入队，等待调度。')).toBeNull()
})

it('leaves the remote drawer read-only even when a project runtime is present', async () => {
  vi.mocked(remoteContext).mockReturnValue({ context: 'fixture', scope: 'fixture' })
  fetch.mockResolvedValueOnce(page()).mockResolvedValueOnce(receipt('one'))
  render(<PlatformWorkspaceHeader projectId={project} execution={execution} />)
  const chooser = await openTasks()
  await act(async () => fireEvent.change(chooser, { target: { value: 'one' } }))
  expect(screen.getByText('制定方案')).toBeTruthy()
  expect(screen.queryByRole('combobox', { name: '本机工作树' })).toBeNull()
  expect(screen.queryByText('新建项目事项')).toBeNull()
  expect(fetch.mock.calls.every(([, options]) => !options?.method)).toBe(true)
})

it('creates and selects a new project task, leaving automation to a separate launch action', async () => {
  const id = '00000000-0000-4000-8000-000000000021'
  const item = { id, project_id: project, title: '核对发布流程', origin: 'task', revision: 1 }
  const requirement = '运行发布检查并记录结果。'
  const brief = (revision: number, request_text: string) => ({ item, directories: [],
    brief: { revision, request_text, execution_directory_id: null } })
  const writes: unknown[] = []
  fetch.mockImplementation(async (path, options) => {
    const url = String(path)
    if (url.startsWith('/api/workspace/items?')) return Response.json({ items: [], total: 0, list_revision: 0 })
    if (url === '/api/bootstrap') return Response.json({ csrf_token: 'fixture-csrf' })
    if (options?.method === 'POST') {
      writes.push([url, JSON.parse(String(options.body))])
      return Response.json(url.endsWith('/brief') ? brief(1, requirement) : { item })
    }
    if (url === `/api/workspace/tasks/${id}/brief`) return Response.json(brief(0, ''))
    expect(url).toBe(`/api/workspace/agent-tasks/${id}`)
    return Response.json({ item, automation: { pending_since: null, flows: [] } })
  })
  render(<PlatformWorkspaceHeader projectId={project} execution={execution} />)
  const chooser = await openTasks()
  await act(async () => { await vi.dynamicImportSettled() })
  const summary = await screen.findByText('新建项目事项')
  const details = summary.closest('details')!
  details.open = true
  fireEvent.change(screen.getByLabelText('事项标题'), { target: { value: item.title } })
  fireEvent.change(screen.getByLabelText('需求说明'), { target: { value: requirement } })
  await act(async () => fireEvent.submit(screen.getByRole('button', { name: '保存事项与需求' }).closest('form')!))
  expect(chooser.value).toBe(id)
  expect(writes).toEqual([
    ['/api/workspace/items', { project_id: project, title: item.title }],
    [`/api/workspace/tasks/${id}/brief`, { expected_revision: 0, request_text: requirement,
      acceptance_text: '', constraints_text: '', references: [], execution_directory_id: null }]
  ])
})

it('polls authenticated task details and updates stages without replacing the selected control or expanded evidence', async () => {
  vi.useFakeTimers()
  fetch.mockResolvedValueOnce(page()).mockResolvedValueOnce(receipt('one')).mockResolvedValueOnce(receipt('one', 'plan_review', 0))
  render(<PlatformWorkspaceHeader projectId={project} projectName="项目" />)
  const chooser = await openTasks()
  expect(fetch.mock.calls[0]?.[0]).toBe('/api/workspace/items?project_id=workbench&limit=100&offset=0')
  await act(async () => fireEvent.change(chooser, { target: { value: 'one' } }))
  expect(fetch.mock.calls[1]?.[0]).toBe('/api/workspace/agent-tasks/one')
  expect(fetch.mock.calls[1]?.[1]?.headers).toEqual({ 'X-Session-Client': 'panel' })
  const summary = screen.getByText('制定方案').closest('summary')!
  const details = summary.closest('details')!
  expect(details.closest('li')?.getAttribute('aria-current')).toBe('step')
  details.open = true
  summary.tabIndex = 0
  summary.focus()
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(screen.getByText('独立方案审查').closest('li')?.getAttribute('aria-current')).toBe('step')
  expect(screen.getByText(/退出码 0/)).toBeTruthy()
  expect(screen.getByText(/第 1 次/)).toBeTruthy()
  expect(details.open).toBe(true)
  expect(document.activeElement).toBe(summary)
  expect(screen.getByRole('combobox')).toBe(chooser)
  expect(chooser.value).toBe('one')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '关闭任务流水线' })))
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  expect(fetch).toHaveBeenCalledTimes(3)
})

it('discards superseded responses and aborts reads when the project changes', async () => {
  let completeOld: (value: Response) => void = () => {}
  let firstSignal: AbortSignal | null | undefined
  let nextSignal: AbortSignal | null | undefined
  fetch.mockResolvedValueOnce(page())
    .mockImplementationOnce(async (_path, options) => {
      firstSignal = options?.signal
      return new Promise((resolve) => { completeOld = resolve })
    })
    .mockImplementationOnce(async (_path, options) => {
      nextSignal = options?.signal
      return receipt('two', 'verify')
    })
  const view = render(<PlatformWorkspaceHeader projectId={project} />)
  const chooser = await openTasks()
  await act(async () => fireEvent.change(chooser, { target: { value: 'one' } }))
  await act(async () => fireEvent.change(chooser, { target: { value: 'two' } }))
  expect(firstSignal?.aborted).toBe(true)
  await act(async () => completeOld(receipt('one')))
  expect(chooser.value).toBe('two')
  expect(screen.getByText('测试').closest('li')?.getAttribute('aria-current')).toBe('step')
  view.rerender(<PlatformWorkspaceHeader projectId="another" />)
  expect(nextSignal?.aborted).toBe(true)
  expect(screen.queryByRole('combobox')).toBeNull()
})

it('shows configuration waits, review verdicts, and only confirmed develop retests', async () => {
  vi.useFakeTimers()
  fetch.mockResolvedValueOnce(page())
    .mockResolvedValueOnce(result('one', { ...flow('implementation', 'waiting_external', 'verification_not_configured'),
      steps: [{ ...step('plan_review', 'completed'), review_verdict: 'revise' }, step('code_review', 'completed')]
    }))
    .mockResolvedValueOnce(result('one', flow('acceptance', 'completed', 'acceptance_approved')))
    .mockResolvedValueOnce(result('one', flow('acceptance', 'awaiting_acceptance')))
    .mockResolvedValueOnce(result('one', flow('integration', 'waiting_external', 'integration_not_connected')))
    .mockResolvedValueOnce(result('one', {
      ...flow('integration', 'waiting_external', 'integration_not_connected'), integration_approved: 1
    }))
    .mockResolvedValueOnce(result('one', flow('integration', 'running', 'integration_not_connected')))
    .mockResolvedValueOnce(result('one', { ...flow('integration', 'waiting_external', 'integration_incomplete'),
      steps: [step('integrate', 'unknown')]
    }))
    .mockResolvedValueOnce(result('one', flow('integration', 'completed')))
    .mockResolvedValueOnce(result('one', { ...flow('integration', 'completed'),
      steps: [{ ...step('integrate', 'completed'), target_sha: 'abcdef', target_test_passed: 1 }]
    }))
    .mockResolvedValueOnce(result('one', { ...flow('integration', 'completed', 'integration_not_connected'),
      steps: [{ ...step('integrate', 'completed'), target_sha: 'abcdef', candidate_test_passed: 1, target_test_passed: 1 }]
    }))
  render(<PlatformWorkspaceHeader projectId={project} />)
  const chooser = await openTasks()
  await act(async () => fireEvent.change(chooser, { target: { value: 'one' } }))
  const stage = (name: string) => screen.getByText(name).closest('li')
  expect(stage('候选与目标复测')?.nextElementSibling).toBe(stage('集成 develop'))
  expect(stage('测试')?.getAttribute('aria-current')).toBe('step')
  expect(stage('测试')?.textContent).toContain('等待配置验证命令')
  expect(stage('独立方案审查')?.textContent).toContain('要求修改')
  expect(stage('独立代码审查')?.textContent).toContain('审查已返回，结论待核实')
  const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  await tick()
  expect(screen.getByRole('status').textContent).toBe('已完成')
  expect(stage('集成 develop')?.textContent).toContain('未开始')
  await tick()
  expect(screen.getByRole('status').textContent).toBe('等待指定人验收')
  await tick()
  expect(screen.getByRole('status').textContent).toBe('等待登记 develop 集成目标')
  await tick()
  expect(screen.getByRole('status').textContent).toBe('已批准，复测通过后集成')
  await tick()
  expect(stage('集成 develop')?.getAttribute('aria-current')).toBe('step')
  expect(screen.getByRole('status').textContent).toBe('复测与集成中')
  expect(stage('候选与目标复测')?.textContent).toContain('等待复测回执')
  await tick()
  expect(stage('候选与目标复测')?.textContent).toContain('结果待核实')
  await tick()
  expect(screen.getByRole('status').textContent).toBe('结果待核实')
  expect(stage('候选与目标复测')?.textContent).toContain('结果待核实')
  await tick()
  expect(stage('候选与目标复测')?.textContent).toContain('候选副本复测结果待核实')
  expect(stage('候选与目标复测')?.textContent).toContain('develop 目标副本复测已通过')
  await tick()
  expect(screen.getByRole('status').textContent).toBe('已集成 · 提交 abcdef')
  expect(stage('候选与目标复测')?.textContent).toContain('候选副本复测已通过')
  expect(stage('候选与目标复测')?.textContent).toContain('develop 目标副本复测已通过')
})
