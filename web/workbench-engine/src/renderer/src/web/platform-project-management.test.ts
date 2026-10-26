// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/dom'

const source = readFileSync(resolve(process.cwd(), '../workspace/studio-shell.js'), 'utf8') + '\n' + readFileSync(resolve(process.cwd(), '../workspace/studio-preview.js'), 'utf8')
const styles = readFileSync(resolve(process.cwd(), '../workspace/studio-preview.css'), 'utf8')
const modal = () => document.querySelector('[data-platform-project-dialog]')?.shadowRoot?.querySelector<HTMLDialogElement>('dialog')
function openManagement() {
  root.querySelector<HTMLButtonElement>('[data-project-menu]')!.click()
  document.querySelector('[data-platform-project-dialog]')!.shadowRoot!.querySelector<HTMLButtonElement>('[data-project-settings]')!.click()
  return modal()!
}
function acceptRoute(hash: string) {
  const from = window.location.hash
  window.history.replaceState(null, '', hash)
  window.dispatchEvent(new CustomEvent('platform-navigation-accepted', {detail:{from,to:hash}}))
}
let root: HTMLElement, dispose: () => void
let studioStyle: HTMLStyleElement
let project: {
  id: string
  name: string
  archived: boolean
  directories: { id: string; path: string }[]
  source: { kind: string; directory_id: null; relative_path: null }
}
let archivedRecords: (typeof project)[]
let post: ReturnType<typeof vi.fn>,
  changed: ReturnType<typeof vi.fn>,
  scope: ReturnType<typeof vi.fn>,
  legacy: ReturnType<typeof vi.fn>,
  createBoard: ReturnType<typeof vi.fn>
beforeEach(async () => {
  archivedRecords = []
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
  studioStyle = document.createElement('style'); studioStyle.textContent = styles; document.head.append(studioStyle)
  post = vi.fn(async (_route, body) => {
    project = { ...project, ...body }
    return { status: 'ok', project }
  })
  changed = vi.fn(() => {
    if (project.archived) expect(modal()?.open ?? false).toBe(false)
  })
  scope = vi.fn()
  legacy = vi.fn()
  createBoard = vi.fn(() => ({ load: async () => {}, update() {}, unavailable() {}, setProject: scope, dispose() {} }))
  Object.assign(window, {
    StudioData: {
      create: () => ({
        bootstrap: async () => {},
        snapshot: async () => ({
          workspace: { projects: { items: [...archivedRecords, project] } },
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
  root.id = 'ce-studio'
  dispose = (window as any).StudioPreview.mount(root, { onProjects: changed })
  await waitFor(() => expect(root.querySelector('[data-project-menu]')).not.toBeNull())
})
afterEach(() => {
  dispose?.()
  root.remove()
  studioStyle.remove()
  vi.restoreAllMocks()
})

it('saves project metadata through the existing API and closes before publishing archived projects', async () => {
  const dialog = openManagement()
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
  await waitFor(() => expect(changed.mock.calls.at(-1)?.[0]).toEqual([]))
  root.querySelector<HTMLButtonElement>('[data-action="archived-projects"]')!.click()
  expect(root.querySelector('[data-project-menu]')).not.toBeNull()
  expect(root.querySelector('[data-open-project]')?.getAttribute('href')).toBe('#project/p-one/workspace')
  const restore = openManagement()
  restore.querySelector<HTMLInputElement>('[name="archived"]')!.checked = false
  restore
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await waitFor(() =>
    expect(changed.mock.calls.at(-1)?.[0]).toEqual([
      { id: project.id, name: 'Renamed', directory: project.directories[0].path }
    ])
  )
  expect(post).toHaveBeenCalledTimes(2)
})

it('preserves the edit dialog and draft when the project save is rejected', async () => {
  post.mockRejectedValueOnce(new Error('Save rejected'))
  const dialog = openManagement()
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

it('opens project management in the current workspace and restores focus on cancel', async () => {
  window.history.replaceState(null, '', '/studio#project/p-one/workspace')
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  root.hidden = true
  window.dispatchEvent(
    new CustomEvent('platform-manage-project', {
      detail: { directory: String.raw`C:\example\fixture\one\\` }
    })
  )
  const modal = () =>
    document
      .querySelector('[data-platform-project-dialog]')
      ?.shadowRoot?.querySelector<HTMLDialogElement>('dialog')
  await waitFor(() => expect(modal()?.open).toBe(true))
  expect(window.location.hash).toBe('#project/p-one/workspace')
  expect(modal()!.closest('[hidden]')).toBeNull()
  modal()!.querySelector<HTMLButtonElement>('[data-cancel-project]')!.click()
  await waitFor(() => expect(modal()?.open ?? false).toBe(false))
  expect(window.location.hash).toBe('#project/p-one/workspace')
  expect(document.activeElement).toBe(trigger)
  trigger.remove()
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
    acceptRoute(hash)
    await waitFor(() => expect(scope).toHaveBeenLastCalledWith(id, filter))
    expect(root.querySelector('[data-action="refresh"]')).toBeNull()
    await createBoard.mock.calls[0][0].onRefresh()
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

it('opens workspace from the project title and keeps the directory inside project information', () => {
  const card = root.querySelector('.ce-overview-card')!
  expect(card.textContent).not.toContain(project.directories[0].path)
  expect(card.textContent).toContain('尚无事项')
  expect(card.querySelector('[data-open-project]')?.getAttribute('href')).toBe('#project/p-one/workspace')
  expect(card.querySelector('.ce-development-shortcut')).toBeNull()
  expect(openManagement().textContent).toContain(project.directories[0].path)
})

it('saves the platform name from native project management without leaving the workspace', async () => {
  window.history.replaceState(null, '', '/studio#project/p-one/workspace')
  root.hidden = true
  window.dispatchEvent(
    new CustomEvent('platform-manage-project', {
      detail: { directory: project.directories[0].path }
    })
  )
  const dialog = document
    .querySelector('[data-platform-project-dialog]')!
    .shadowRoot!.querySelector<HTMLDialogElement>('dialog')!
  expect(dialog.closest('#ce-studio')?.getAttribute('data-unified')).toBe('true')
  dialog.querySelector<HTMLInputElement>('[name="name"]')!.value = 'Workspace rename'
  dialog
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await waitFor(() =>
    expect(changed.mock.calls.at(-1)?.[0]).toEqual([
      { id: project.id, name: 'Workspace rename', directory: project.directories[0].path }
    ])
  )
  expect(post).toHaveBeenCalledWith('/api/workspace/projects/save', {
    ...project,
    name: 'Workspace rename'
  })
  expect(window.location.hash).toBe('#project/p-one/workspace')
  await waitFor(() => expect(modal()?.open ?? false).toBe(false))
})

it('manages the active project when an archived project retains the same directory', async () => {
  const archived = { ...project, id: 'p-old', name: 'Archived predecessor', archived: true }
  archivedRecords.push(archived)
  const previous = changed.mock.calls.length
  root.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click()
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(previous + 1))
  window.history.replaceState(null, '', '/studio#project/p-one/workspace')
  root.hidden = true
  window.dispatchEvent(
    new CustomEvent('platform-manage-project', {
      detail: { directory: project.directories[0].path }
    })
  )
  const modal = () =>
    document
      .querySelector('[data-platform-project-dialog]')
      ?.shadowRoot?.querySelector<HTMLDialogElement>('dialog')
  await waitFor(() => expect(modal()?.open).toBe(true))
  expect(modal()!.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe('One')
  modal()!.querySelector<HTMLInputElement>('[name="name"]')!.value = 'Active renamed'
  modal()!
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/workspace/projects/save', {
      ...project,
      id: 'p-one',
      name: 'Active renamed'
    })
  )
  expect(window.location.hash).toBe('#project/p-one/workspace')
  expect(archived).toMatchObject({ id: 'p-old', name: 'Archived predecessor', archived: true })
  await waitFor(() => expect(modal()?.open ?? false).toBe(false))
})

it('keeps the project menu separate from navigation and closes it on resize with focus restored', () => {
  const trigger = root.querySelector<HTMLButtonElement>('[data-project-menu]')!
  trigger.click()
  const shadow = document.querySelector('[data-platform-project-dialog]')!.shadowRoot!
  const menu = shadow.querySelector<HTMLElement>('[role="menu"]')!
  expect(window.location.hash).toBe('#home')
  expect(menu.querySelector('a')?.getAttribute('href')).toBe('#project/p-one/settings')
  menu.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown',bubbles:true}))
  expect(shadow.activeElement?.textContent).toBe('项目进展')
  window.dispatchEvent(new Event('resize'))
  expect(shadow.querySelector('[role="menu"]')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

it('preserves the current overview search focus and selection when refreshed data changes its DOM', async () => {
  const input = root.querySelector<HTMLInputElement>('#studio-project-search')!
  input.focus(); input.setSelectionRange(0,0)
  project.name = 'Updated'
  await createBoard.mock.calls[0][0].onRefresh()
  const replacement = root.querySelector<HTMLInputElement>('#studio-project-search')!
  expect(replacement).not.toBe(input)
  expect(document.activeElement).toBe(replacement)
  expect(replacement.selectionStart).toBe(0)
})

it('opens standalone project information once without repeating its delegated action', async () => {
  dispose(); root.dataset.unified = 'false'
  dispose = (window as any).StudioPreview.mount(root, {onProjects:changed})
  await waitFor(() => expect(root.querySelector('[data-project-menu]')).not.toBeNull())
  const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
  root.querySelector<HTMLButtonElement>('[data-project-menu]')!.click()
  root.querySelector<HTMLButtonElement>('[role="menu"] [data-project-settings]')!.click()
  expect(show).toHaveBeenCalledTimes(1)
  expect(root.querySelector<HTMLDialogElement>('.ce-project-settings')?.open).toBe(true)
})

it('keeps focus on the settings disclosure after expanding its entries', () => {
  root.querySelector<HTMLButtonElement>('[data-action="settings-toggle"]')!.click()
  const toggle = root.querySelector<HTMLButtonElement>('[data-action="settings-toggle"]')!
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(toggle)
  expect(root.querySelector<HTMLElement>('#studio-settings-links')!.hidden).toBe(false)
})

it('resolves the drawer disclosure controls to its own unique settings list', () => {
  root.querySelector<HTMLButtonElement>('[data-action="navigation"]')!.click()
  const drawer = root.querySelector<HTMLDialogElement>('#studio-navigation')!
  drawer.querySelector<HTMLButtonElement>('[data-action="settings-toggle"]')!.click()
  const toggle = drawer.querySelector<HTMLButtonElement>('[data-action="settings-toggle"]')!
  const controlled = document.getElementById(toggle.getAttribute('aria-controls')!)!
  expect(controlled.closest('dialog')).toBe(drawer)
  expect(controlled.hidden).toBe(false)
  expect(root.querySelectorAll('#studio-settings-links')).toHaveLength(1)
  expect(root.querySelectorAll('#studio-drawer-settings-links')).toHaveLength(1)
  expect(document.activeElement).toBe(toggle)
})

it('applies overview text roles and input height after the complete Studio cascade', () => {
  const heading = getComputedStyle(root.querySelector('h1')!)
  const title = getComputedStyle(root.querySelector('.ce-overview-title h2')!)
  const search = getComputedStyle(root.querySelector('#studio-project-search')!)
  expect([heading.fontSize,heading.lineHeight]).toEqual(['24px','32px'])
  expect([title.fontSize,title.lineHeight]).toEqual(['18px','26px'])
  expect([search.height,search.minHeight]).toEqual(['40px','40px'])
  expect(getComputedStyle(root.querySelector('.ce-overview-recent')!).paddingLeft).toBe('0px')
  root.querySelector<HTMLButtonElement>('[data-action="view-list"]')!.click()
  expect(getComputedStyle(root.querySelector('.ce-overview-recent')!).paddingLeft).toBe('0px')
})
