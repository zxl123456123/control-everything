// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PlatformWorkspaceHeader } from './PlatformWorkspaceHeader'
import { contextFetch } from './remote-context'

vi.mock('./remote-context', () => ({
  contextFetch: vi.fn(),
  onContextInactive: () => () => {}
}))

const fetch = vi.mocked(contextFetch)
const project = 'workbench'
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
})

async function openTasks(): Promise<HTMLSelectElement> {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '任务流水线' })))
  return screen.getByRole<HTMLSelectElement>('combobox', { name: '项目事项' })
}

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
    .mockResolvedValueOnce(result('one', flow('integration')))
    .mockResolvedValueOnce(result('one', { ...flow('integration', 'waiting_external', 'integration_incomplete'),
      steps: [step('integrate', 'unknown')]
    }))
    .mockResolvedValueOnce(result('one', flow('integration', 'completed')))
    .mockResolvedValueOnce(result('one', { ...flow('integration', 'completed'),
      steps: [{ ...step('integrate', 'completed'), target_test_passed: 1 }]
    }))
  render(<PlatformWorkspaceHeader projectId={project} />)
  const chooser = await openTasks()
  await act(async () => fireEvent.change(chooser, { target: { value: 'one' } }))
  const stage = (name: string) => screen.getByText(name).closest('li')
  expect(stage('测试')?.getAttribute('aria-current')).toBe('step')
  expect(stage('测试')?.textContent).toContain('等待配置验证命令')
  expect(stage('独立方案审查')?.textContent).toContain('要求修改')
  expect(stage('独立代码审查')?.textContent).toContain('审查已返回，结论待核实')
  const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  await tick()
  expect(stage('集成 develop')?.getAttribute('aria-current')).toBe('step')
  expect(stage('集成后复测')?.textContent).toContain('等待集成结果')
  await tick()
  expect(stage('集成后复测')?.textContent).toContain('结果待核实')
  await tick()
  expect(stage('集成后复测')?.textContent).toContain('结果待核实')
  await tick()
  expect(stage('集成后复测')?.textContent).toContain('通过')
})
