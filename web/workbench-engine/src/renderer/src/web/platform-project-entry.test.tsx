// @vitest-environment happy-dom
import { useContext, useEffect } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlatformProjectContext } from './platform-project-context'
import type { PlatformProject } from './platform-studio-surface'
import PlatformProjectEntry from './platform-project-entry'
import { PlatformSettingsContext, type SettingsTargetReady } from './platform-settings-navigation'
import type { SettingsPresentationScope } from '../lib/settings-navigation-types'

const fixture = vi.hoisted(() => ({
  load: vi.fn(),
  runtimeLoad: vi.fn(),
  openModal: vi.fn(),
  setActionHost: vi.fn(),
  projects: null as
    | ((rows: PlatformProject[], metadata?: { archived: PlatformProject[] }) => void)
    | null,
  nativeProjects: [] as PlatformProject[],
  navigationData: [] as PlatformProjectBootstrap[],
  navigationReady: true,
  markReady: null as ((data: PlatformProjectBootstrap) => void) | null,
  mounts: vi.fn(),
  bridgeMounts: vi.fn(),
  bridgeUnmounts: vi.fn(),
  agentRequestData: [] as PlatformProjectBootstrap[],
  agentRequests: vi.fn(),
  actionNames: [] as string[],
  selectionOnly: false,
  settingsReady: true,
  settingsCallback: null as ((ready: SettingsTargetReady | null) => void) | null
}))
vi.mock('./platform-project-bootstrap', () => ({
  loadPlatformProjectBootstrap: fixture.load,
  loadPlatformRuntimeBootstrap: fixture.runtimeLoad,
  createPlatformEnvironment: (value: unknown) => value
}))
vi.mock('./web-preload-api', () => ({ installWebPreloadApi: vi.fn() }))
vi.mock('../store', () => ({ useAppStore: { getState: () => ({ openModal: fixture.openModal }) } }))
vi.mock('./platform-project-actions', () => ({ setPlatformProjectActionHost: fixture.setActionHost }))
vi.mock('./preload-api/web-runtime-session', () => ({ webRuntimeState: {}, manuallyDisconnectedEnvironmentIds: new Set() }))
vi.mock('./web-runtime-environment', () => ({ saveStoredWebRuntimeEnvironment: vi.fn() }))
vi.mock('./web-device-key-support', () => ({
  initWebDeviceKeySupport: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('./platform-project-navigation-view', () => ({
  PlatformRuntimeNavigation: ({ active, entryRevision, onReady }: { active: boolean; entryRevision: number; onReady: (revision:number|null)=>void }) => {
    useEffect(() => { onReady(active && fixture.navigationReady ? entryRevision : null) }, [active, entryRevision, onReady])
    return null
  },
  default: ({
    data,
    onReady,
    projects,
    selectionOnly, settingsScope, onSettingsScope
  }: {
    data: PlatformProjectBootstrap
    onReady: (data: PlatformProjectBootstrap) => void
    projects: PlatformProject[]
    selectionOnly?: boolean
    settingsScope?: SettingsPresentationScope
    onSettingsScope?: (scope: SettingsPresentationScope | null) => void
  }) => {
    fixture.selectionOnly = Boolean(selectionOnly)
    fixture.nativeProjects = projects
    fixture.navigationData.push(data)
    fixture.markReady = onReady
    useEffect(() => {
      if (fixture.navigationReady) onReady(data)
    }, [data, onReady])
    useEffect(() => {
      if (settingsScope?.kind === 'project') onSettingsScope?.({ ...settingsScope, setupId: 'setup-exact' })
    }, [settingsScope, onSettingsScope])
    return null
  }
}))
vi.mock('./platform-agent-bridge', () => ({
  default: ({
    data,
    onReady
  }: {
    data: PlatformProjectBootstrap
    onReady?: (data: PlatformProjectBootstrap) => void
  }) => {
    useEffect(() => {
      fixture.bridgeMounts()
      return () => fixture.bridgeUnmounts()
    }, [])
    useEffect(() => {
      const receive = (event: Event) => {
        event.preventDefault()
        fixture.actionNames.push(event.type)
        fixture.agentRequestData.push(data)
        fixture.agentRequests((event as CustomEvent).detail)
        window.location.hash = '#project/' + data.project.id + '/workspace'
      }
      const actions = ['platform-start-task-agent', 'platform-open-task-session', 'platform-adopt-task-session']
      for (const action of actions) window.addEventListener(action, receive)
      onReady?.(data)
      return () => {
        for (const action of actions) window.removeEventListener(action, receive)
      }
    }, [data, onReady])
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
vi.mock('./platform-workspace-app', () => ({
  default: () => {
    const project = useContext(PlatformProjectContext)
    const presentation = useContext(PlatformSettingsContext)
    fixture.settingsCallback = presentation?.onReady ?? null
    useEffect(() => {
      const scope = presentation?.scope
      if (fixture.settingsReady && presentation?.visible && scope &&
        (scope.kind === 'global' || scope.setupId)) presentation.onReady?.({ contextKey: scope.contextKey,
          repoId: scope.kind === 'project' ? scope.repoId : null, sectionId: scope.kind === 'project' ? `repo-${scope.repoId}` : scope.entry === 'development' ? 'agents' : 'appearance',
          ...(scope.kind === 'project' ? { hostId: scope.hostId, setupId: scope.setupId } : {}) })
    }, [presentation])
    return <div data-testid="project-context" data-settings-scope={JSON.stringify(presentation?.scope)}>{project?.project.name || 'unbound'}</div>
  }
}))

const project = { id: 'p-one', name: 'One', directory: 'C:/example/fixture/one' }
const bootstrap = (name = 'One') => ({
  project: { id: 'p-one', name },
  runtime: { environmentId: 'env-a', offer: { endpoint: 'ws:/example//127.0.0.1:1234' } },
  target: { repoId: 'repo-a' }
})
const publish = (rows: PlatformProject[], archived: PlatformProject[] = []) =>
  act(() => fixture.projects!(rows, { archived }))
beforeEach(() => {
  fixture.mounts.mockClear()
  fixture.openModal.mockClear()
  fixture.setActionHost.mockClear()
  fixture.bridgeMounts.mockClear()
  fixture.bridgeUnmounts.mockClear()
  fixture.agentRequests.mockClear()
  fixture.agentRequestData = []
  fixture.actionNames = []
  fixture.selectionOnly = false
  fixture.settingsReady = true
  fixture.settingsCallback = null
  fixture.load.mockReset()
  fixture.runtimeLoad.mockReset().mockResolvedValue({ runtime: bootstrap().runtime })
  fixture.projects = null
  fixture.nativeProjects = []
  fixture.navigationData = []
  fixture.navigationReady = true
  fixture.markReady = null
  fixture.load.mockResolvedValue(bootstrap())
  window.history.replaceState(null, '', '/studio#project/p-one/workspace')
})
afterEach(() => cleanup())

it.each(['#workbench', '#project/p-one/workspace'])(
  'opens the original project dialog only from a visible ready native surface at %s', async (hash) => {
    window.history.replaceState(null, '', hash)
    render(<PlatformProjectEntry />)
    publish([project])
    await waitFor(() => expect(document.documentElement.dataset.platformView).toBe('workspace'))
    await waitFor(() => expect(fixture.setActionHost).toHaveBeenCalledWith('runtime:env-a', expect.objectContaining({
      webRuntimeState: expect.any(Object), manuallyDisconnectedEnvironmentIds: expect.any(Set)
    })))
    await act(async () => window.dispatchEvent(new Event('platform-open-add-repo')))
    expect(fixture.openModal).toHaveBeenCalledExactlyOnceWith('add-repo')
    await act(async () => { window.location.hash = '#home' })
    await waitFor(() => expect(document.documentElement.dataset.platformView).toBe('studio'))
    await act(async () => window.dispatchEvent(new Event('platform-open-add-repo')))
    expect(fixture.openModal).toHaveBeenCalledTimes(1)
  }
)

it('does not open a project dialog before native readiness or after unmount', async () => {
  fixture.navigationReady = false
  window.history.replaceState(null, '', '#workbench')
  const view = render(<PlatformProjectEntry />)
  publish([])
  await waitFor(() => expect(screen.getByTestId('project-context')).toBeTruthy())
  await act(async () => window.dispatchEvent(new Event('platform-open-add-repo')))
  expect(fixture.openModal).not.toHaveBeenCalled()
  view.unmount()
  await act(async () => window.dispatchEvent(new Event('platform-open-add-repo')))
  expect(fixture.openModal).not.toHaveBeenCalled()
})

it('keeps a cold overview independent of the developer runtime', async () => {
  window.history.replaceState(null, '', '#home')
  render(<PlatformProjectEntry />)
  publish([project])
  await act(async () => {})
  expect(fixture.load).not.toHaveBeenCalled()
  expect(fixture.bridgeMounts).not.toHaveBeenCalled()
  expect(screen.queryByTestId('project-context')).toBeNull()
  expect(fixture.setActionHost).not.toHaveBeenCalled()
})

it.each(['#project/p-one/items', '#project/p-one/board'])(
  'keeps the cold %s management intent independent of runtime bootstrap', async (hash) => {
    window.history.replaceState(null, '', hash)
    render(<PlatformProjectEntry />)
    publish([project])
    await act(async () => {})
    expect(fixture.load).not.toHaveBeenCalled()
    expect(fixture.bridgeMounts).not.toHaveBeenCalled()
    expect(screen.queryByTestId('project-context')).toBeNull()
    expect(screen.getByTestId('studio-surface').getAttribute('data-pending')).toBe(String(hash.startsWith('#settings/')))
  }
)

it('keeps project settings hidden until exact scope and Settings section ready, using selectionOnly', async () => {
  window.history.replaceState(null, '', '#project/p-one/settings')
  fixture.settingsReady = false
  const view = render(<PlatformProjectEntry />)
  publish([project])
  await waitFor(() => expect(fixture.settingsCallback).toBeTypeOf('function'))
  await waitFor(() => expect(screen.getByTestId('project-context').dataset.settingsScope).toContain('setup-exact'))
  const app = view.container.querySelector('.platform-project-content')!
  expect(app.hasAttribute('hidden')).toBe(true)
  expect(app.hasAttribute('inert')).toBe(true)
  expect(fixture.load).toHaveBeenCalledTimes(1)
  expect(fixture.selectionOnly).toBe(true)
  await act(async () => fixture.settingsCallback!({ contextKey: 'local-page', repoId: 'repo-wrong',
    hostId: 'runtime:env-a', setupId: 'setup-exact', sectionId: 'repo-repo-wrong' }))
  expect(app.hasAttribute('hidden')).toBe(true)
  await act(async () => fixture.settingsCallback!({ contextKey: 'local-page', repoId: 'repo-a',
    hostId: 'runtime:env-a', setupId: 'setup-exact', sectionId: 'repo-repo-a' }))
  expect(app.hasAttribute('hidden')).toBe(false)
  expect(app.hasAttribute('inert')).toBe(false)
  expect(document.documentElement.dataset.platformView).toBe('studio')
})

it.each(['#workbench', '#project-setup', '#settings/appearance', '#settings/development'])(
  'opens %s with an independent runtime and no invented project', async hash => {
    window.history.replaceState(null, '', hash)
    const view = render(<PlatformProjectEntry />); publish([])
    await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('unbound'))
    expect(fixture.runtimeLoad).toHaveBeenCalledOnce()
    expect(fixture.load).not.toHaveBeenCalled()
    expect(fixture.bridgeMounts).not.toHaveBeenCalled()
    await waitFor(() => expect(view.container.querySelector('.platform-project-content')?.hasAttribute('hidden')).toBe(false))
    if (hash.includes('settings')) expect(screen.getByTestId('project-context').dataset.settingsScope).toContain('global')
    else {
      expect(screen.getByRole('navigation', { name: '项目工作台导航' })).toBeTruthy()
      expect(screen.queryByRole('link', { name: '进展' })).toBeNull()
    }
  }
)

it('keeps the same App from empty workbench through first project and back', async () => {
  window.history.replaceState(null, '', '#workbench')
  render(<PlatformProjectEntry />); publish([])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('unbound'))
  const app = screen.getByTestId('project-context')
  publish([project])
  await act(async () => { window.location.hash = '#project/p-one/workspace' })
  await waitFor(() => expect(app.textContent).toBe('One'))
  expect(screen.getByTestId('project-context')).toBe(app)
  await act(async () => { window.location.hash = '#workbench' })
  await waitFor(() => expect(app.textContent).toBe('unbound'))
  expect(screen.getByTestId('project-context')).toBe(app)
  expect(fixture.runtimeLoad).toHaveBeenCalledOnce()
  expect(fixture.load).toHaveBeenCalledOnce()
})

it('shows runtime failure with retry without mounting a project', async () => {
  window.history.replaceState(null, '', '#workbench')
  fixture.runtimeLoad.mockRejectedValueOnce(new Error('fixture offline'))
  render(<PlatformProjectEntry />); publish([])
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('工作台未能连接'))
  expect(screen.getByRole('button', { name: '重试连接' })).toBeTruthy()
  expect(screen.queryByTestId('project-context')).toBeNull()
})

it('never mounts a late runtime response on a cold overview', async () => {
  window.history.replaceState(null, '', '#workbench')
  let resolve!: (value:unknown)=>void
  fixture.runtimeLoad.mockImplementationOnce(() => new Promise(done => { resolve=done }))
  render(<PlatformProjectEntry />); publish([])
  await waitFor(() => expect(fixture.runtimeLoad).toHaveBeenCalledOnce())
  await act(async () => { window.location.hash='#home' })
  await waitFor(() => expect(window.location.hash).toBe('#home'))
  await act(async () => resolve({runtime:bootstrap().runtime}))
  expect(screen.queryByTestId('project-context')).toBeNull()
})

it('waits for every draft guard and publishes one accepted navigation only after all accept', async () => {
  window.history.replaceState(null, '', '#home')
  render(<PlatformProjectEntry />); publish([project])
  let first!: (value: boolean) => void, second!: (value: boolean) => void
  const accepted = vi.fn()
  let requests = 0
  const guard = (event: Event) => {
    requests++
    const detail = (event as CustomEvent<{ waitUntil: (result: Promise<boolean>) => void }>).detail
    detail.waitUntil(new Promise(resolve => { first = resolve }))
    detail.waitUntil(new Promise(resolve => { second = resolve }))
  }
  window.addEventListener('platform-before-navigate', guard)
  window.addEventListener('platform-navigation-accepted', accepted)
  try {
    await act(async () => { window.location.hash = '#project/p-one/items' })
    await waitFor(() => expect(first).toBeTypeOf('function'))
    expect(window.location.hash).toBe('#home')
    await act(async () => { window.location.hash = '#project/p-one/items'; await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(requests).toBe(1)
    await act(async () => first(true)); expect(accepted).not.toHaveBeenCalled()
    await act(async () => second(false)); expect(window.location.hash).toBe('#home')
    await act(async () => { window.location.hash = '#project/p-one/items' })
    await waitFor(() => expect(requests).toBe(2))
    await act(async () => { first(true); second(true) })
    await waitFor(() => expect(accepted).toHaveBeenCalledTimes(1))
    expect((accepted.mock.calls[0][0] as CustomEvent).detail).toEqual({from:'#home',to:'#project/p-one/items'})
    expect(fixture.load).not.toHaveBeenCalled()
  } finally {
    window.removeEventListener('platform-before-navigate', guard)
    window.removeEventListener('platform-navigation-accepted', accepted)
  }
})

it('does not let an older pending guard replace a later accepted destination', async () => {
  window.history.replaceState(null, '', '#home')
  render(<PlatformProjectEntry />); publish([project])
  let resolve!: (value: boolean) => void
  const guard = (event: Event) => {
    const detail = (event as CustomEvent<{to:string; waitUntil:(result:Promise<boolean>)=>void}>).detail
    if (detail.to.endsWith('/items')) detail.waitUntil(new Promise(done => {resolve=done}))
  }
  const accepted = vi.fn()
  window.addEventListener('platform-before-navigate', guard)
  window.addEventListener('platform-navigation-accepted', accepted)
  try {
    await act(async () => { window.location.hash = '#project/p-one/items' })
    await waitFor(() => expect(resolve).toBeTypeOf('function'))
    await act(async () => { window.location.hash = '#settings/appearance' })
    await waitFor(() => expect(window.location.hash).toBe('#settings/appearance'))
    await act(async () => resolve(true))
    expect(window.location.hash).toBe('#settings/appearance')
    expect(accepted).toHaveBeenCalledTimes(1)
  } finally {
    window.removeEventListener('platform-before-navigate', guard)
    window.removeEventListener('platform-navigation-accepted', accepted)
  }
})

it('initializes development when activity is the first requested view', async () => {
  window.history.replaceState(null, '', '#project/p-one/activity')
  render(<PlatformProjectEntry />)
  publish([project])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  expect(fixture.load).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('link', { name: '开发' }).getAttribute('aria-current')).toBe('page')
})

it.each(['workspace', 'tasks'])(
  'reveals the cached project on returning through %s, without remounting the app',
  async (tab) => {
    render(<PlatformProjectEntry />)
    publish([project])
    await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
    const firstData = fixture.navigationData.at(-1)
    const app = screen.getByTestId('project-context')
    await act(async () => {
      window.location.hash = '#project/p-one/tasks'
    })
    await waitFor(() => expect(screen.getByTestId('studio-surface').hidden).toBe(false))
    await act(async () => {
      window.location.hash = '#project/p-one/workspace'
    })
    await waitFor(() => expect(screen.getByTestId('studio-surface').hidden).toBe(true))
    expect(fixture.navigationData.at(-1)).toBe(firstData)
    await act(async () => {
      window.location.hash = '#home'
    })
    await waitFor(() => expect(screen.queryByLabelText('当前项目')).toBeNull())
    await act(async () => {
      window.location.hash = '#project/p-one/' + tab
    })
    await waitFor(() => expect(screen.getByLabelText('当前项目').textContent).toBe('One'))
    await act(async () => {
      window.location.hash = '#project/p-one/workspace'
    })
    await waitFor(() => expect(fixture.navigationData.at(-1)).not.toBe(firstData))
    expect(screen.getByTestId('project-context')).toBe(app)
    expect(fixture.bridgeMounts).toHaveBeenCalledTimes(1)
    expect(fixture.load).toHaveBeenCalledTimes(1)
  }
)

it.each(['tasks', 'review', 'attention', 'monitor'])(
  'keeps cold %s independent of the developer runtime',
  async (tab) => {
    window.history.replaceState(null, '', '#project/p-one/' + tab)
    render(<PlatformProjectEntry />)
    publish([project])
    await act(async () => {})
    expect(screen.getByLabelText('当前项目').textContent).toBe('One')
    expect(document.title).toBe('One · 掌控一切')
    expect(fixture.load).not.toHaveBeenCalled()
    expect(fixture.bridgeMounts).not.toHaveBeenCalled()
    expect(screen.queryByTestId('project-context')).toBeNull()
  }
)

it('opens development only when requested and preserves the mounted app on return to tasks', async () => {
  window.history.replaceState(null, '', '#project/p-one/tasks')
  render(<PlatformProjectEntry />)
  publish([project])
  await act(async () => {})
  expect(fixture.load).not.toHaveBeenCalled()
  await act(async () => {
    window.location.hash = '#project/p-one/workspace'
  })
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  const app = screen.getByTestId('project-context')
  await act(async () => {
    window.location.hash = '#project/p-one/tasks'
  })
  await waitFor(() => expect(screen.getByTestId('studio-surface').hidden).toBe(false))
  expect(screen.getByTestId('project-context')).toBe(app)
  expect(fixture.load).toHaveBeenCalledTimes(1)
})

const progressActions = [
  ['platform-open-task-session', {}],
  ['platform-open-task-session', { resume: true }],
  ['platform-adopt-task-session', { sessionId: 'session-record' }]
] as const
it.each(progressActions)('does not accept cold %s for an absent project', async (action, extra) => {
  window.history.replaceState(null, '', '#project/p-one/tasks')
  render(<PlatformProjectEntry />)
  publish([project])
  let accepted = false
  act(() => { accepted = !window.dispatchEvent(new CustomEvent(action, { cancelable: true,
    detail: { projectId: 'absent', taskId: 'task', ...extra } })) })
  expect(accepted).toBe(false)
  expect(fixture.load).not.toHaveBeenCalled()
  expect(fixture.agentRequests).not.toHaveBeenCalled()
})
it.each(progressActions)('cancels repeated cold %s after navigation away', async (action, extra) => {
  window.history.replaceState(null, '', '#project/p-one/tasks')
  let resolve!: (value: unknown) => void
  fixture.load.mockImplementation(() => new Promise(done => { resolve = done }))
  render(<PlatformProjectEntry />)
  publish([project])
  const request = { projectId: 'p-one', taskId: 'task-one', ...extra }
  act(() => { for (let i = 0; i < 2; i++) window.dispatchEvent(new CustomEvent(action, { cancelable: true, detail: request })) })
  await waitFor(() => expect(fixture.load).toHaveBeenCalledTimes(1))
  await act(async () => { window.location.hash = '#home' })
  await act(async () => resolve(bootstrap()))
  expect(fixture.agentRequests).not.toHaveBeenCalled()
})
it.each(progressActions)('routes cold %s with its complete payload', async (action, extra) => {
  window.history.replaceState(null, '', '#project/p-one/tasks')
  render(<PlatformProjectEntry />)
  publish([project])
  const request = { projectId: 'p-one', taskId: 'task-one', ...extra }
  let accepted = false
  act(() => { accepted = !window.dispatchEvent(new CustomEvent(action, { cancelable: true, detail: request })) })
  expect(accepted).toBe(true)
  await waitFor(() => expect(fixture.agentRequests).toHaveBeenCalledTimes(1))
  expect(fixture.agentRequests).toHaveBeenCalledWith(request)
  expect(fixture.actionNames).toEqual([action])
  expect(fixture.selectionOnly).toBe(true)
})
it.each(progressActions)('routes cross-project %s only to the destination bridge', async (action, extra) => {
  fixture.load.mockImplementation((id: string) => Promise.resolve(id === 'p-one' ? bootstrap() :
    { ...bootstrap('Two'), project: { id: 'p-two', name: 'Two' } }))
  render(<PlatformProjectEntry />)
  publish([project, { id: 'p-two', name: 'Two', directory: 'C:/example/two' }])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  await act(async () => { window.location.hash = '#project/p-one/tasks' })
  const request = { projectId: 'p-two', taskId: 'task-two', ...extra }
  act(() => { window.dispatchEvent(new CustomEvent(action, { cancelable: true, detail: request })) })
  await waitFor(() => expect(fixture.agentRequests).toHaveBeenCalledTimes(1))
  expect(fixture.agentRequestData[0].project.id).toBe('p-two')
  expect(fixture.agentRequests).toHaveBeenCalledWith(request)
  expect(fixture.actionNames).toEqual([action])
  expect(fixture.selectionOnly).toBe(true)
})

it('keeps a cold task Agent request until the development surface and bridge are ready', async () => {
  window.history.replaceState(null, '', '#project/p-one/tasks')
  let resolve!: (value: unknown) => void
  fixture.load.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  render(<PlatformProjectEntry />)
  publish([project])
  const request = { projectId: 'p-one', taskId: 'task-one' }
  let accepted = false
  act(() => {
    accepted = !window.dispatchEvent(
      new CustomEvent('platform-start-task-agent', { cancelable: true, detail: request })
    )
  })
  expect(accepted).toBe(true)
  await waitFor(() => expect(window.location.hash).toBe('#project/p-one/workspace'))
  await waitFor(() => expect(fixture.load).toHaveBeenCalledTimes(1))
  await act(async () => resolve(bootstrap()))
  await waitFor(() => expect(fixture.agentRequests).toHaveBeenCalledTimes(1))
  expect(fixture.agentRequests).toHaveBeenCalledWith(request)
})

it('delivers a warm overview task request only to the reactivated project bridge', async () => {
  render(<PlatformProjectEntry />)
  publish([project])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  const firstData = fixture.navigationData.at(-1)
  await act(async () => {
    window.location.hash = '#home'
  })
  await waitFor(() => expect(screen.queryByLabelText('当前项目')).toBeNull())
  await act(async () => {
    window.location.hash = '#project/p-one/tasks'
  })
  await waitFor(() => expect(screen.getByLabelText('当前项目').textContent).toBe('One'))
  const request = { projectId: 'p-one', taskId: 'task-one' }
  act(() => {
    window.dispatchEvent(
      new CustomEvent('platform-start-task-agent', { cancelable: true, detail: request })
    )
  })
  await waitFor(() => expect(window.location.hash).toBe('#project/p-one/workspace'))
  await waitFor(() => expect(fixture.agentRequests).toHaveBeenCalledTimes(1))
  expect(fixture.agentRequests).toHaveBeenCalledWith(request)
  expect(fixture.agentRequestData[0]).toBe(fixture.navigationData.at(-1))
  expect(fixture.agentRequestData[0]).not.toBe(firstData)
  expect(fixture.bridgeMounts).toHaveBeenCalledTimes(1)
  expect(fixture.load).toHaveBeenCalledTimes(1)
})

it('cancels a cold Agent request after leaving development before bootstrap returns', async () => {
  window.history.replaceState(null, '', '#project/p-one/tasks')
  let resolve!: (value: unknown) => void
  fixture.load.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  render(<PlatformProjectEntry />)
  publish([project])
  act(() => {
    window.dispatchEvent(
      new CustomEvent('platform-start-task-agent', {
        cancelable: true,
        detail: { projectId: 'p-one', taskId: 'task-one' }
      })
    )
  })
  await waitFor(() => expect(window.location.hash).toBe('#project/p-one/workspace'))
  await act(async () => {
    window.location.hash = '#home'
  })
  await act(async () => resolve(bootstrap()))
  expect(fixture.agentRequests).not.toHaveBeenCalled()
  expect(screen.queryByTestId('project-context')).toBeNull()
})

it('does not replay a failed cold Agent request when the user later retries development', async () => {
  window.history.replaceState(null, '', '#project/p-one/tasks')
  fixture.load.mockRejectedValueOnce(new Error('offline'))
  render(<PlatformProjectEntry />)
  publish([project])
  act(() => {
    window.dispatchEvent(
      new CustomEvent('platform-start-task-agent', {
        cancelable: true,
        detail: { projectId: 'p-one', taskId: 'task-one' }
      })
    )
  })
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('未能连接'))
  await act(async () => {
    screen.getByRole('button', { name: '重试连接' }).click()
  })
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  expect(fixture.agentRequests).not.toHaveBeenCalled()
})

it('does not send a project B cold request to the mounted bridge for project A', async () => {
  const second = { id: 'p-two', name: 'Two', directory: 'C:/example/two' }
  fixture.load.mockImplementation((id: string) =>
    Promise.resolve(
      id === 'p-one' ? bootstrap() : { ...bootstrap('Two'), project: { id: 'p-two', name: 'Two' } }
    )
  )
  render(<PlatformProjectEntry />)
  publish([project, second])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  await act(async () => {
    window.location.hash = '#project/p-one/tasks'
  })
  expect(fixture.load).toHaveBeenCalledTimes(1)
  expect(fixture.navigationData.at(-1)?.project.id).toBe('p-one')
  const request = { projectId: 'p-two', taskId: 'task-two' }
  act(() => {
    window.dispatchEvent(
      new CustomEvent('platform-start-task-agent', { cancelable: true, detail: request })
    )
  })
  await waitFor(() => expect(fixture.agentRequests).toHaveBeenCalledTimes(1))
  expect(fixture.agentRequests).toHaveBeenCalledWith(request)
  expect(screen.getByTestId('project-context').textContent).toBe('Two')
})

it('does not let a cancelled project A failure clear the pending request for project B', async () => {
  window.history.replaceState(null, '', '#project/p-one/tasks')
  let rejectA!: (error: Error) => void
  let resolveB!: (value: unknown) => void
  fixture.load.mockImplementation((id: string) =>
    id === 'p-one'
      ? new Promise((_resolve, reject) => {
          rejectA = reject
        })
      : new Promise((resolve) => {
          resolveB = resolve
        })
  )
  render(<PlatformProjectEntry />)
  publish([project, { id: 'p-two', name: 'Two', directory: 'C:/example/two' }])
  act(() => {
    window.dispatchEvent(
      new CustomEvent('platform-start-task-agent', {
        cancelable: true,
        detail: { projectId: 'p-one', taskId: 'task-one' }
      })
    )
  })
  await waitFor(() => expect(fixture.load).toHaveBeenCalledTimes(1))
  await act(async () => {
    window.location.hash = '#project/p-two/tasks'
  })
  const request = { projectId: 'p-two', taskId: 'task-two' }
  act(() => {
    window.dispatchEvent(
      new CustomEvent('platform-start-task-agent', { cancelable: true, detail: request })
    )
  })
  await waitFor(() => expect(fixture.load).toHaveBeenCalledTimes(2))
  await act(async () => {
    rejectA(new Error('late failure'))
    resolveB({ ...bootstrap('Two'), project: { id: 'p-two', name: 'Two' } })
  })
  await waitFor(() => expect(fixture.agentRequests).toHaveBeenCalledTimes(1))
  expect(fixture.agentRequests).toHaveBeenCalledWith(request)
  expect(screen.queryByRole('alert')).toBeNull()
})

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

it.each(['workspace', 'activity', 'tasks', 'review'])(
  'recognizes an archived %s route on a cold start without runtime bootstrap',
  async (tab) => {
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
  }
)

it('bootstraps a restored cold-start project and keeps archived metadata out of native selection', async () => {
  const archivedOther = {
    id: 'p-archived',
    name: 'Archived other',
    directory: 'C:/example/archived'
  }
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

it('preserves the project app and bridge across the mobile page and rejects dialog navigation', async () => {
  render(<PlatformProjectEntry />)
  publish([project])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  const app = screen.getByTestId('project-context')
  const overview = screen.getByTestId('studio-surface') as HTMLElement
  await act(async () => {
    window.location.hash = '#mobile'
  })
  await waitFor(() => expect(overview.hidden).toBe(false))
  expect(screen.getByTestId('project-context')).toBe(app)
  await act(async () => {
    window.location.hash = '#project/p-one/workspace'
  })
  await waitFor(() => expect(overview.hidden).toBe(true))
  expect(screen.getByTestId('project-context')).toBe(app)
  expect(fixture.load).toHaveBeenCalledTimes(1)
  expect(fixture.bridgeMounts).toHaveBeenCalledTimes(1)
  expect(fixture.bridgeUnmounts).not.toHaveBeenCalled()
  const dialog = document.createElement('dialog')
  dialog.setAttribute('open', '')
  document.body.append(dialog)
  await act(async () => {
    window.location.hash = '#mobile'
  })
  await waitFor(() => expect(window.location.hash).toBe('#project/p-one/workspace'))
  expect(overview.hidden).toBe(true)
  dialog.remove()
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
            name: ['activity', 'workspace'].includes(tab) ? '开发' : '进展'
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
  await act(async () => {
    window.location.hash = '#project/p-missing/workspace'
  })
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('不存在'))
  expect(screen.getByLabelText('当前项目').textContent).toBe('项目工作区')
  expect(screen.getByRole('link', { name: '返回项目总览' }).getAttribute('href')).toBe('#home')
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
  expect(screen.getByRole('link', { name: '返回项目总览' }).getAttribute('href')).toBe('#home')
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
  expect((screen.getByTestId('studio-surface') as HTMLElement).dataset.pending).toBe('true')
  expect(window.location.hash).toBe('#project/p-one/workspace')
})

it('keeps project B when a slower project A bootstrap arrives after switching', async () => {
  let resolveA!: (value: unknown) => void
  fixture.load.mockImplementation((id: string) =>
    id === project.id
      ? new Promise((resolve) => {
          resolveA = resolve
        })
      : Promise.resolve({ ...bootstrap('Two'), project: { id: 'p-two', name: 'Two' } })
  )
  render(<PlatformProjectEntry />)
  publish([project, { id: 'p-two', name: 'Two', directory: 'C:/example/fixture/two' }])
  await act(async () => {
    window.location.hash = '#project/p-two/workspace'
  })
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
    await act(async () => {
      window.location.hash = '#project/p-one/review'
    })
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('请先完成或关闭'))
    expect(window.location.hash).toBe('#project/p-one/workspace')
    expect(screen.getByRole('link', { name: '开发' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByLabelText('当前项目').textContent).toBe('One')
    expect((screen.getByTestId('studio-surface') as HTMLElement).hidden).toBe(true)
    dialog.removeAttribute('open')
    await act(async () => {
      window.location.hash = '#project/p-one/review'
    })
    await waitFor(() =>
      expect(screen.getByRole('link', { name: '进展' }).getAttribute('aria-current')).toBe('page')
    )
    expect((screen.getByTestId('studio-surface') as HTMLElement).hidden).toBe(false)
    expect(screen.getByLabelText('当前项目').textContent).toBe('One')
  } finally {
    host.remove()
  }
})


it('keeps the target title and hides the workspace until that project is activated', async () => {
  render(<PlatformProjectEntry />)
  const second = { id: 'p-two', name: 'Two', directory: 'C:/example/two' }
  publish([project, second])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  const app = screen.getByTestId('project-context')
  fixture.navigationReady = false
  let resolve!: (value: unknown) => void
  fixture.load.mockReturnValueOnce(new Promise((done) => { resolve = done }))
  await act(async () => { window.location.hash = '#project/p-two/workspace' })
  await waitFor(() => expect(fixture.load).toHaveBeenCalledTimes(2))
  expect(screen.getByLabelText('当前项目').textContent).toBe('Two')
  expect(document.title).toBe('Two · 掌控一切')
  expect(app.closest('.platform-project-content')?.hasAttribute('hidden')).toBe(true)
  expect(screen.getByTestId('studio-surface').dataset.pending).toBe('true')
  expect(screen.queryByRole('link', { name: '全部事项' })).toBeNull()
  expect(screen.getByRole('link', { name: '项目总览' }).getAttribute('href')).toBe('#home')
  await act(async () => resolve({ ...bootstrap('Two'), project: { id: 'p-two', name: 'Two' } }))
  await waitFor(() => expect(fixture.navigationData.at(-1)?.project.id).toBe('p-two'))
  expect(app.closest('.platform-project-content')?.hasAttribute('hidden')).toBe(true)
  expect(screen.queryByRole('alert')).toBeNull()
  act(() => fixture.markReady!(fixture.navigationData.at(-1)!))
  await waitFor(() => expect(app.closest('.platform-project-content')?.hasAttribute('hidden')).toBe(false))
  expect(screen.getByTestId('project-context')).toBe(app)
  expect(app.textContent).toBe('Two')
})


it('keeps the Studio host pending after bootstrap failure instead of revealing an old scope', async () => {
  fixture.load.mockRejectedValueOnce(new Error('offline'))
  render(<PlatformProjectEntry />)
  publish([project])
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('未能连接'))
  expect(screen.getByTestId('studio-surface').dataset.pending).toBe('true')
  expect(screen.getByRole('button', { name: '重试连接' })).toBeTruthy()
  expect(screen.queryByTestId('project-context')).toBeNull()
})


it('keeps only development and tasks in the primary navigation', async () => {
  render(<PlatformProjectEntry />)
  publish([project])
  await waitFor(() => expect(screen.getByTestId('project-context').textContent).toBe('One'))
  expect(screen.getByRole('link', { name: '开发' })).toBeTruthy()
  expect(screen.getByRole('link', { name: '进展' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: '活动' })).toBeNull()
  expect(screen.queryByRole('link', { name: '全部事项' })).toBeNull()
})

it('does not bootstrap an unregistered cross-project task request', async () => {
  window.history.replaceState(null, '', '#project/p-one/tasks')
  render(<PlatformProjectEntry />)
  publish([project])
  act(() => {
    window.dispatchEvent(new CustomEvent('platform-start-task-agent', {
      cancelable: true, detail: { projectId: 'unregistered', taskId: 'task' }
    }))
  })
  await act(async () => {})
  expect(fixture.load).not.toHaveBeenCalled()
  expect(window.location.hash).toBe('#project/p-one/tasks')
  expect(fixture.agentRequests).not.toHaveBeenCalled()
})
