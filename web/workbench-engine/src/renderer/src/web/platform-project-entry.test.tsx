// @vitest-environment happy-dom
import { useContext, useEffect } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlatformProjectContext } from './platform-project-context'
import type { PlatformProject } from './platform-studio-surface'
import PlatformProjectEntry from './platform-project-entry'

const fixture = vi.hoisted(() => ({
  load: vi.fn(),
  projects: null as ((rows: PlatformProject[], metadata?: { archived: PlatformProject[] }) => void) | null,
  nativeProjects: [] as PlatformProject[],
  mounts: vi.fn(),
  bridgeMounts: vi.fn(),
  bridgeUnmounts: vi.fn()
}))
vi.mock('./platform-project-bootstrap', () => ({
  loadPlatformProjectBootstrap: fixture.load,
  createPlatformEnvironment: (value: unknown) => value
}))
vi.mock('./web-preload-api', () => ({ installWebPreloadApi: vi.fn() }))
vi.mock('./web-runtime-environment', () => ({ saveStoredWebRuntimeEnvironment: vi.fn() }))
vi.mock('./web-device-key-support', () => ({
  initWebDeviceKeySupport: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('./platform-project-navigation-view', () => ({
  default: ({
    data,
    onReady,
    projects
  }: {
    data: PlatformProjectBootstrap
    onReady: (data: PlatformProjectBootstrap) => void
    projects: PlatformProject[]
  }) => {
    fixture.nativeProjects = projects
    useEffect(() => onReady(data), [data, onReady])
    return null
  }
}))
vi.mock('./platform-agent-bridge', () => ({
  default: () => {
    useEffect(() => {
      fixture.bridgeMounts()
      return () => fixture.bridgeUnmounts()
    }, [])
    return null
  }
}))
vi.mock('./platform-studio-surface', () => ({
  default: ({
    hidden,
    pending,
    onProjects
  }: {
    hidden: boolean
    pending: boolean
    onProjects: (rows: PlatformProject[], metadata?: { archived: PlatformProject[] }) => void
  }) => {
    useEffect(() => {
      fixture.projects = onProjects
      fixture.mounts()
    }, [onProjects])
    return (
      <div data-testid="studio-surface" hidden={hidden} data-pending={pending}>
        Projects
      </div>
    )
  }
}))
vi.mock('../App', () => ({
  default: () => {
    const project = useContext(PlatformProjectContext)
    return <div data-testid="project-context">{project?.project.name || 'unbound'}</div>
  }
}))

const project = { id: 'p-one', name: 'One', directory: 'C:/example/fixture/one' }
const bootstrap = (name = 'One') => ({
  project: { id: 'p-one', name },
  runtime: { environmentId: 'env-a', offer: { endpoint: 'ws:/example//127.0.0.1:1234' } },
  target: { repoId: 'repo-a' }
})
const publish = (rows: PlatformProject[], archived: PlatformProject[] = []) => act(() => fixture.projects!(rows, { archived }))
beforeEach(() => {
  fixture.mounts.mockClear()
  fixture.bridgeMounts.mockClear()
  fixture.bridgeUnmounts.mockClear()
  fixture.load.mockReset()
  fixture.projects = null
  fixture.nativeProjects = []
  fixture.load.mockResolvedValue(bootstrap())
  window.history.replaceState(null, '', '/studio#project/p-one/workspace')
})
afterEach(() => cleanup())

it('waits for authoritative projects and preserves the mounted app on equivalent refreshes', async () => {
  render(<PlatformProjectEntry />)
  expect(fixture.load).not.toHaveBeenCalled()
  publish([project])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  publish([{ ...project }])
  publish([{ ...project }])
  expect(fixture.load).toHaveBeenCalledTimes(1)
  expect(fixture.mounts).toHaveBeenCalledTimes(1)
  fixture.load.mockResolvedValue(bootstrap('Renamed'))
  publish([{ ...project, name: 'Renamed' }])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('Renamed'))
  expect(fixture.load).toHaveBeenCalledTimes(2)
  publish([], [{ ...project, name: 'Renamed' }])
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('已归档'))
  expect(window.location.hash).toBe('#project/p-one/workspace')
  expect(screen.getByTestId('project-context').textContent).toBe('unbound')
  expect(fixture.mounts).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('button', { name: '重试连接' })).toBeNull()
  expect((screen.getByTestId('studio-surface') as HTMLElement).hidden).toBe(false)
  fixture.load.mockImplementation(() => Promise.resolve(bootstrap('Renamed')))
  publish([{ ...project, name: 'Renamed' }])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('Renamed'))
  expect(screen.queryByRole('status')).toBeNull()
  expect(window.location.hash).toBe('#project/p-one/workspace')
})

it('cannot revive an archived project with a late bootstrap response', async () => {
  let resolve!: (value: unknown) => void
  fixture.load.mockReturnValue(
    new Promise((done) => {
      resolve = done
    })
  )
  render(<PlatformProjectEntry />)
  publish([project])
  publish([], [project])
  await act(async () => resolve(bootstrap()))
  expect(screen.queryByTestId('project-context')).toBeNull()
  expect(window.location.hash).toBe('#project/p-one/workspace')
  expect(screen.getByRole('status').textContent).toContain('已归档')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('button', { name: '重试连接' })).toBeNull()
})

it.each(['workspace', 'activity', 'tasks', 'review'])('recognizes an archived %s route on a cold start without runtime bootstrap', async (tab) => {
  window.history.replaceState(null, '', '#project/p-one/' + tab)
  render(<PlatformProjectEntry />)
  publish([], [project])
  await waitFor(() => expect(screen.getByLabelText('当前项目').textContent).toBe('One'))
  expect(fixture.load).not.toHaveBeenCalled()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('button', { name: '重试连接' })).toBeNull()
  const studio = screen.getByTestId('studio-surface') as HTMLElement
  expect(studio.hidden).toBe(false)
  expect(studio.dataset.pending).toBe('false')
  expect(screen.queryByText(/正在打开/)).toBeNull()
  expect(screen.queryByTestId('project-context')).toBeNull()
  expect(window.location.hash).toBe('#project/p-one/' + tab)
})

it('bootstraps a restored cold-start project and keeps archived metadata out of native selection', async () => {
  const archivedOther = { id: 'p-archived', name: 'Archived other', directory: 'C:/example/archived' }
  render(<PlatformProjectEntry />)
  publish([], [project, archivedOther])
  await waitFor(() => expect(screen.getByLabelText('当前项目').textContent).toBe('One'))
  expect(fixture.load).not.toHaveBeenCalled()
  publish([project], [archivedOther])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  expect(fixture.load).toHaveBeenCalledTimes(1)
  expect(fixture.nativeProjects).toEqual([project])
  expect(screen.queryByRole('status')).toBeNull()
  expect(window.location.hash).toBe('#project/p-one/workspace')
})

it('retains the overview while preparing the workspace and reuses it on return', async () => {
  let resolve!: (value: unknown) => void
  fixture.load.mockReturnValue(
    new Promise((done) => {
      resolve = done
    })
  )
  render(<PlatformProjectEntry />)
  publish([project])
  const overview = screen.getByTestId('studio-surface') as HTMLElement
  expect(overview.hidden).toBe(false)
  await act(async () => resolve(bootstrap()))
  await waitFor(() => expect(overview.hidden).toBe(true))
  const app = screen.getByTestId('project-context')
  await act(async () => {
    window.location.hash = '#home'
  })
  await waitFor(() => expect(overview.hidden).toBe(false))
  await act(async () => {
    window.location.hash = '#project/p-one/workspace'
  })
  await waitFor(() => expect(overview.hidden).toBe(true))
  expect(screen.getByTestId('project-context')).toBe(app)
  expect(fixture.load).toHaveBeenCalledTimes(1)
})

it('keeps the overview when project preparation is cancelled before bootstrap returns', async () => {
  let resolve!: (value: unknown) => void
  fixture.load.mockReturnValue(
    new Promise((done) => {
      resolve = done
    })
  )
  render(<PlatformProjectEntry />)
  publish([project])
  await act(async () => {
    window.location.hash = '#home'
  })
  await act(async () => resolve(bootstrap()))
  expect((screen.getByTestId('studio-surface') as HTMLElement).hidden).toBe(false)
  expect(screen.queryByTestId('project-context')).toBeNull()
})

it('keeps the app and pending agent bridge mounted across task and activity tabs', async () => {
  render(<PlatformProjectEntry />)
  publish([project])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  const app = screen.getByTestId('project-context')
  for (const tab of ['tasks', 'review', 'attention', 'activity', 'workspace']) {
    await act(async () => {
      window.location.hash = '#project/p-one/' + tab
    })
    await waitFor(() =>
      expect(
        screen
          .getByRole('link', {
            name: tab === 'activity' ? '活动' : tab === 'workspace' ? '开发' : '事项'
          })
          .getAttribute('aria-current')
      ).toBe('page')
    )
    expect(screen.getByTestId('project-context')).toBe(app)
  }
  expect(fixture.bridgeMounts).toHaveBeenCalledTimes(1)
  expect(fixture.bridgeUnmounts).not.toHaveBeenCalled()
  expect(fixture.load).toHaveBeenCalledTimes(1)
})

it('uses a static current project label and keeps project switching in the native sidebar', async () => {
  render(<PlatformProjectEntry />)
  publish([project])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  expect(screen.queryByRole('combobox', { name: '切换项目' })).toBeNull()
  expect(screen.getByLabelText('当前项目').textContent).toBe('One')
})

it('does not label a missing project with the previous project identity', async () => {
  render(<PlatformProjectEntry />)
  publish([project])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  await act(async () => { window.location.hash = '#project/p-missing/workspace' })
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('不存在'))
  expect(screen.getByLabelText('当前项目').textContent).toBe('项目工作区')
  expect(screen.getByRole('link', { name: '返回项目' }).getAttribute('href')).toBe('#home')
  expect(screen.getByRole('button', { name: '重试连接' })).toBeTruthy()
  expect(window.location.hash).toBe('#project/p-missing/workspace')
  expect(screen.getByTestId('project-context').textContent).toBe('unbound')
})

it('retains connection errors and retry for a registered project whose bootstrap fails', async () => {
  fixture.load.mockRejectedValue(new Error('fixture offline'))
  render(<PlatformProjectEntry />)
  publish([project])
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('未能连接'))
  expect(screen.getByRole('button', { name: '重试连接' })).toBeTruthy()
  expect(screen.getByRole('link', { name: '返回项目' }).getAttribute('href')).toBe('#home')
  expect(screen.getByLabelText('当前项目').textContent).toBe('One')
  expect(window.location.hash).toBe('#project/p-one/workspace')
})

it('keeps a cold-start unknown project distinct from archived identity', async () => {
  render(<PlatformProjectEntry />)
  publish([], [{ id: 'another-archive', name: 'Another archive' }])
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('项目不存在'))
  expect(screen.getByLabelText('当前项目').textContent).toBe('项目工作区')
  expect(screen.getByRole('button', { name: '重试连接' })).toBeTruthy()
  expect(fixture.load).not.toHaveBeenCalled()
  expect((screen.getByTestId('studio-surface') as HTMLElement).dataset.pending).toBe('false')
  expect(window.location.hash).toBe('#project/p-one/workspace')
})

it('keeps project B when a slower project A bootstrap arrives after switching', async () => {
  let resolveA!: (value: unknown) => void
  fixture.load.mockImplementation((id: string) => id === project.id
    ? new Promise((resolve) => { resolveA = resolve })
    : Promise.resolve({ ...bootstrap('Two'), project: { id: 'p-two', name: 'Two' } }))
  render(<PlatformProjectEntry />)
  publish([project, { id: 'p-two', name: 'Two', directory: 'C:/example/fixture/two' }])
  await act(async () => { window.location.hash = '#project/p-two/workspace' })
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('Two'))
  await act(async () => resolveA(bootstrap()))
  expect(screen.getByLabelText('当前项目').textContent).toBe('Two')
  expect(screen.getByTestId('project-context').textContent).toBe('Two')
  expect(window.location.hash).toBe('#project/p-two/workspace')
})

it('guards body shadow dialogs and accepts the next navigation after closing', async () => {
  render(<PlatformProjectEntry />)
  publish([project])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  const host = document.createElement('div')
  host.dataset.platformProjectDialog = ''
  const shadow = host.attachShadow({ mode: 'open' })
  const dialog = document.createElement('dialog')
  dialog.setAttribute('open', '')
  dialog.getClientRects = () => [{ width: 100, height: 100 }] as unknown as DOMRectList
  shadow.append(dialog)
  document.body.append(host)
  try {
    await act(async () => { window.location.hash = '#project/p-one/review' })
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('请先完成或关闭'))
    expect(window.location.hash).toBe('#project/p-one/workspace')
    expect(screen.getByRole('link', { name: '开发' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByLabelText('当前项目').textContent).toBe('One')
    expect((screen.getByTestId('studio-surface') as HTMLElement).hidden).toBe(true)
    dialog.removeAttribute('open')
    await act(async () => { window.location.hash = '#project/p-one/review' })
    await waitFor(() => expect(screen.getByRole('link', { name: '事项' }).getAttribute('aria-current')).toBe('page'))
    expect((screen.getByTestId('studio-surface') as HTMLElement).hidden).toBe(false)
    expect(screen.getByLabelText('当前项目').textContent).toBe('One')
  } finally { host.remove() }
})
