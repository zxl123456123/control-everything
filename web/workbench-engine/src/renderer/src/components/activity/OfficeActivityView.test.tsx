/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentPaneThread } from './activity-thread-types'

const fixture = vi.hoisted(() => ({
  setActive: vi.fn(), update: vi.fn(), destroy: vi.fn(),
  select: null as null | ((item: { id: string }) => void)
}))
vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }))
vi.mock('./office-scene/office-scene.js', () => ({ WorkspaceMonitorScene: { create: (options: { onSelect: (item: { id: string }) => void }) => {
  fixture.select = options.onSelect
  return { setActive: fixture.setActive, update: fixture.update, destroy: fixture.destroy }
} } }))
vi.mock('./office-activity-model', async (importOriginal) => ({ ...await importOriginal<typeof import('./office-activity-model')>(), projectOfficeAgents: (threads: readonly AgentPaneThread[]) => threads.map((thread) => ({
  id: `scene:${thread.paneKey}`, paneKey: thread.paneKey, label: thread.paneTitle, stateLabel: '工作中'
})) }))
import { OfficeActivityView } from './OfficeActivityView'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let container: HTMLDivElement
let intersectionCallback: IntersectionObserverCallback
const disconnect = vi.fn()
class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) { intersectionCallback = callback }
  observe = vi.fn()
  disconnect = disconnect
}
const intersect = (isIntersecting: boolean) => act(() => intersectionCallback(
  [{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver
))
const thread = (index: number) => ({ paneKey: `pane-${index}`, paneTitle: `Agent ${index}` }) as AgentPaneThread
const button = (label: string) => Array.from(container.querySelectorAll('button')).find(value => value.textContent?.includes(label))!

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  fixture.select = null
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals() })

describe('OfficeActivityView', () => {
  it('activates on entry, pauses when inactive and destroys its own scene on exit', () => {
    const threads = [thread(1)]
    act(() => root.render(<OfficeActivityView threads={threads} showChildAgents={false} active onSelect={() => {}} />))
    expect(fixture.setActive).toHaveBeenLastCalledWith(false)
    intersect(true)
    expect(fixture.setActive).toHaveBeenLastCalledWith(true)
    expect(fixture.update).toHaveBeenLastCalledWith(expect.objectContaining({ agents: [expect.objectContaining({ paneKey: 'pane-1' })], flows: [] }))
    intersect(false)
    expect(fixture.setActive).toHaveBeenLastCalledWith(false)
    intersect(true)
    expect(fixture.setActive).toHaveBeenLastCalledWith(true)
    act(() => root.render(<OfficeActivityView threads={threads} showChildAgents={false} active={false} onSelect={() => {}} />))
    expect(fixture.setActive).toHaveBeenLastCalledWith(false)
    intersect(false)
    intersect(true)
    expect(fixture.setActive).toHaveBeenLastCalledWith(false)
    act(() => root.render(null))
    expect(fixture.destroy).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('opens the parent pane for either a visual hit or the keyboard-accessible button', () => {
    const onSelect = vi.fn()
    act(() => root.render(<OfficeActivityView threads={[thread(2)]} showChildAgents active onSelect={onSelect} />))
    act(() => fixture.select?.({ id: 'scene:pane-2' }))
    act(() => button('Agent 2').click())
    expect(onSelect.mock.calls).toEqual([['pane-2'], ['pane-2']])
    act(() => fixture.select?.({ id: 'unknown' }))
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('uses the native empty state and only mounts the scene once activity is present', () => {
    act(() => root.render(<OfficeActivityView threads={[]} showChildAgents={false} active onSelect={() => {}} />))
    intersect(true)
    expect(container.textContent).toContain('当前项目的会话符合列表筛选条件后')
    expect(container.querySelector('canvas')).toBeNull()
    expect(fixture.update).not.toHaveBeenCalled()

    act(() => root.render(<OfficeActivityView threads={[thread(1)]} showChildAgents={false} active selectedPaneKey="pane-1" onSelect={() => {}} />))
    expect(container.querySelector('canvas')).not.toBeNull()
    expect(fixture.setActive).toHaveBeenLastCalledWith(true)
    expect(fixture.update).toHaveBeenLastCalledWith(expect.objectContaining({ selectedId: 'scene:pane-1' }))
    expect(button('Agent 1').getAttribute('aria-pressed')).toBe('true')

    act(() => root.render(<OfficeActivityView threads={[]} showChildAgents={false} active onSelect={() => {}} />))
    expect(fixture.destroy).toHaveBeenCalledOnce()
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('paginates 12 workstations and suspends animation before switching', () => {
    act(() => root.render(<OfficeActivityView threads={Array.from({ length: 13 }, (_, i) => thread(i))} showChildAgents active onSelect={() => {}} />))
    intersect(true)
    expect(container.textContent).toContain('1 / 2')
    expect(button('上一组').disabled).toBe(true)
    expect(container.textContent).not.toContain('Agent 12')
    act(() => button('下一组').click())
    expect(fixture.setActive.mock.calls.slice(-2)).toEqual([[false], [true]])
    expect(container.textContent).toContain('2 / 2')
    expect(container.textContent).toContain('Agent 12')
    expect(button('下一组').disabled).toBe(true)
    expect(fixture.update).toHaveBeenLastCalledWith(expect.objectContaining({ agents: [expect.objectContaining({ paneKey: 'pane-12' })] }))
  })
})
