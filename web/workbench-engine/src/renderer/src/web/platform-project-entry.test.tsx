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
  projects: null as ((rows: PlatformProject[]) => void) | null,
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
    onReady
  }: {
    data: PlatformProjectBootstrap
    onReady: (data: PlatformProjectBootstrap) => void
  }) => {
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
    onProjects
  }: {
    hidden: boolean
    onProjects: (rows: PlatformProject[]) => void
  }) => {
    useEffect(() => {
      fixture.projects = onProjects
      fixture.mounts()
    }, [onProjects])
    return (
      <div data-testid="studio-surface" hidden={hidden}>
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
const publish = (rows: PlatformProject[]) => act(() => fixture.projects!(rows))
beforeEach(() => {
  fixture.mounts.mockClear()
  fixture.bridgeMounts.mockClear()
  fixture.bridgeUnmounts.mockClear()
  fixture.load.mockReset()
  fixture.projects = null
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
  publish([])
  await waitFor(() => expect(window.location.hash).toBe('#home'))
  expect(screen.getByTestId('project-context').textContent).toBe('unbound')
  expect(fixture.mounts).toHaveBeenCalledTimes(1)
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
  publish([])
  await act(async () => resolve(bootstrap()))
  expect(screen.queryByTestId('project-context')).toBeNull()
  expect(window.location.hash).toBe('#home')
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
