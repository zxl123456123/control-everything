// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/dom'

const source = readFileSync(resolve(process.cwd(), '../workspace/studio-preview.js'), 'utf8')
let root: HTMLElement, dispose: () => void
let project: {
  id: string
  name: string
  archived: boolean
  directories: { id: string; path: string }[]
  source: { kind: string; directory_id: null; relative_path: null }
}
let post: ReturnType<typeof vi.fn>,
  changed: ReturnType<typeof vi.fn>,
  scope: ReturnType<typeof vi.fn>,
  legacy: ReturnType<typeof vi.fn>,
  createBoard: ReturnType<typeof vi.fn>
beforeEach(async () => {
  project = {
    id: 'p-one',
    name: 'One',
    archived: false,
    directories: [{ id: 'main', path: 'C:/example/fixture/one' }],
    source: { kind: 'none', directory_id: null, relative_path: null }
  }
  root = document.createElement('div')
  root.dataset.unified = 'true'
  root.innerHTML = [
    'studio-content',
    'studio-status',
    'studio-rail',
    'studio-topbar',
    'studio-tasks',
    'studio-agent-board',
    'studio-monitor',
    'studio-monitor-content'
  ]
    .map((id) => `<div id="${id}"></div>`)
    .join('')
  document.body.append(root)
  post = vi.fn(async (_route, body) => {
    project = { ...project, ...body }
    return { status: 'ok', project }
  })
  changed = vi.fn(() => {
    if (project.archived) expect(root.querySelector('dialog')?.open).toBe(false)
  })
  scope = vi.fn()
  legacy = vi.fn()
  createBoard = vi.fn(() => ({ load: async () => {}, setProject: scope, dispose() {} }))
  Object.assign(window, {
    StudioData: {
      create: () => ({
        bootstrap: async () => {},
        snapshot: async () => ({
          workspace: { projects: { items: [project] } },
          agents: [],
          items: []
        }),
        api: vi.fn(),
        post,
        canWrite: () => true
      })
    },
    WorkspaceTaskCenter: { create: legacy },
    WorkspaceAgentBoard: { create: createBoard }
  })
  window.history.replaceState(null, '', '/studio#home')
  window.eval(source)
  dispose = (window as any).StudioPreview.mount(root, { onProjects: changed })
  await waitFor(() => expect(root.querySelector('[data-project-settings]')).not.toBeNull())
})
afterEach(() => {
  dispose?.()
  root.remove()
  vi.restoreAllMocks()
})

it('saves project metadata through the existing API and closes before publishing archived projects', async () => {
  root.querySelector<HTMLButtonElement>('[data-project-settings]')!.click()
  const dialog = root.querySelector<HTMLDialogElement>('dialog')!
  dialog.querySelector<HTMLInputElement>('[name="name"]')!.value = 'Renamed'
  dialog.querySelector<HTMLInputElement>('[name="archived"]')!.checked = true
  dialog
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await waitFor(() => expect(project.archived).toBe(true))
  expect(post).toHaveBeenCalledWith('/api/workspace/projects/save', {
    ...project,
    name: 'Renamed',
    archived: true
  })
  await waitFor(() => expect(changed).toHaveBeenLastCalledWith([]))
  root.querySelector<HTMLButtonElement>('[data-action="archived-projects"]')!.click()
  expect(root.querySelector('[data-project-settings]')).not.toBeNull()
  expect(root.querySelector('[data-open-project]')).toBeNull()
})

it('preserves the edit dialog and draft when the project save is rejected', async () => {
  post.mockRejectedValueOnce(new Error('Save rejected'))
  root.querySelector<HTMLButtonElement>('[data-project-settings]')!.click()
  const dialog = root.querySelector<HTMLDialogElement>('dialog')!
  dialog.querySelector<HTMLInputElement>('[name="name"]')!.value = 'Draft'
  dialog
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await waitFor(() =>
    expect(dialog.querySelector('[role="status"]')?.textContent).toBe('Save rejected')
  )
  expect(dialog.open).toBe(true)
  expect(dialog.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe('Draft')
  expect(post).toHaveBeenCalledTimes(1)
})

it('returns to the overview before opening project settings requested inside the workspace', async () => {
  window.history.replaceState(null, '', '/studio#project/p-one/workspace')
  window.dispatchEvent(
    new CustomEvent('platform-manage-project', { detail: { directory: String.raw`C:\example\fixture\one\\` } })
  )
  await waitFor(() => expect(root.querySelector<HTMLDialogElement>('dialog')?.open).toBe(true))
  expect(window.location.hash).toBe('#home')
})

it('uses one business task board and preserves review/attention filters across refreshes and legacy links', async () => {
  expect(createBoard.mock.calls[0][0]).toMatchObject({ unified: true })
  expect(legacy).not.toHaveBeenCalled()
  for (const [hash, id, filter] of [
    ['#project/p-one/manage', 'p-one', 'all'],
    ['#project/p-one/review', 'p-one', 'review'],
    ['#project/p-one/attention', 'p-one', 'attention'],
    ['#inbox/manage', '', 'all'],
    ['#inbox/review', '', 'review'],
    ['#attention', '', 'attention']
  ]) {
    window.location.hash = hash
    await waitFor(() => expect(scope).toHaveBeenLastCalledWith(id, filter))
    root.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click()
    await waitFor(() => expect(scope).toHaveBeenLastCalledWith(id, filter))
    expect(window.location.hash).toBe(hash)
    expect(root.querySelector<HTMLElement>('#studio-tasks')!.hidden).toBe(true)
    expect(root.querySelector('[data-edit-items]')).toBeNull()
  }
})

it('preserves the external executor board when Studio is mounted without the native platform shell', () => {
  dispose()
  root.dataset.unified = 'false'
  dispose = (window as any).StudioPreview.mount(root, { onProjects: changed })
  expect(createBoard.mock.calls.at(-1)?.[0]).toMatchObject({ unified: false })
  expect(root.querySelector('a[href$="/activity"]')).toBeNull()
})
