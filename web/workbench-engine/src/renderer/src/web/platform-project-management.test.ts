// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/dom'

const source = readFileSync(resolve(process.cwd(), '../workspace/studio-shell.js'), 'utf8') + '\n' + readFileSync(resolve(process.cwd(), '../workspace/studio-preview.js'), 'utf8')
const styles = readFileSync(resolve(process.cwd(), '../workspace/studio-preview.css'), 'utf8')
const shellMarkup = [
  'studio-content', 'studio-status', 'studio-rail', 'studio-topbar',
  'studio-tasks', 'studio-agent-board', 'studio-monitor', 'studio-monitor-content'
].map(id => `<div id="${id}"></div>`).join('')
const menu = () => document.querySelector('[data-platform-project-dialog]')?.shadowRoot?.querySelector<HTMLElement>('[role="menu"]')
function openArchive() {
  root.querySelector<HTMLButtonElement>('[data-project-menu]')!.click()
  const action = menu()!.querySelector<HTMLButtonElement>('[data-project-archive]')!
  expect(menu()!.querySelectorAll('[role="menuitem"]')).toHaveLength(1)
  expect(menu()!.querySelector('a')).toBeNull()
  expect(action.querySelector('svg')).not.toBeNull()
  return action
}
function nativeAction(action: 'rename' | 'archive', fields: Record<string, unknown> = {}) {
  const waits: Promise<unknown>[] = [], controller = new AbortController()
  window.dispatchEvent(new CustomEvent('platform-native-project-action', { detail: {
    action, repoId: 'repo-one', directory: project.directories[0].path,
    executionHostId: 'runtime:fixture-env', signal: controller.signal,
    waitUntil: (promise: Promise<unknown>) => waits.push(promise), ...fields
  } }))
  expect(waits).toHaveLength(1)
  return { result: waits[0], controller }
}
function acceptRoute(hash: string) {
  const from = window.location.hash
  window.history.replaceState(null, '', hash)
  window.dispatchEvent(new CustomEvent('platform-navigation-accepted', {detail:{from,to:hash}}))
}
function mountStandalone() {
  dispose()
  const replacement = document.createElement('div')
  replacement.id = 'ce-studio'; replacement.dataset.unified = 'false'; replacement.innerHTML = shellMarkup
  root.replaceWith(replacement); root = replacement
  dispose = (window as any).StudioPreview.mount(root, { onProjects: changed })
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
  root.innerHTML = shellMarkup
  document.body.append(root)
  studioStyle = document.createElement('style'); studioStyle.textContent = styles; document.head.append(studioStyle)
  post = vi.fn(async (_route, body) => {
    const { expected, ...record } = body
    const original = { name: project.name, archived: project.archived, directories: project.directories, source: project.source }
    if (expected && JSON.stringify(expected) !== JSON.stringify(original))
      throw Object.assign(new Error('Project changed'), { reason: 'project_changed' })
    project = { ...project, ...record }
    return { status: 'ok', project }
  })
  changed = vi.fn(() => {
    if (project.archived) expect(menu()).toBeNull()
  })
  scope = vi.fn()
  legacy = vi.fn()
  createBoard = vi.fn(() => ({ load: async () => {}, update() {}, unavailable() {}, setActive() {}, setProject: scope, dispose() {} }))
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
    StudioPetSettings: { mount: () => () => {} },
    WorkspaceTaskCenter: { create: legacy },
    WorkspaceAgentBoard: { create: createBoard }
  })
  window.history.replaceState(null, '', '/studio#home')
  window.eval(source)
  root.id = 'ce-studio'
  dispose = (window as any).StudioPreview.mount(root, { onProjects: changed, runtimeHost: () => 'runtime:fixture-env' })
  await waitFor(() => expect(root.querySelector('[data-project-menu]')).not.toBeNull())
})
afterEach(() => {
  dispose?.()
  root.remove()
  studioStyle.remove()
  document.body.replaceChildren()
  delete (window as any).CERemoteContext
  vi.restoreAllMocks()
})

it('archives and restores through the existing CAS API, preserving fields and publishing active identities', async () => {
  const original = structuredClone(project), archive = openArchive()
  expect(archive.textContent).toContain('归档项目')
  archive.click()
  await waitFor(() => expect(project.archived).toBe(true))
  expect(post).toHaveBeenCalledWith('/api/workspace/projects/save', {
    ...original, archived: true,
    expected: { name: original.name, archived: false, directories: original.directories, source: original.source }
  }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
  await waitFor(() => expect(changed.mock.calls.at(-1)?.[0]).toEqual([]))
  await waitFor(() => expect(root.querySelector('#studio-status')?.textContent).toContain('已归档'))
  expect(root.querySelector('[data-project-card]')).toBeNull()
  root.querySelector<HTMLButtonElement>('[data-action="archived-projects"]')!.click()
  expect(root.querySelector('[data-open-project]')?.getAttribute('href')).toBe('#project/p-one/workspace')
  const restore = openArchive(); expect(restore.textContent).toContain('恢复项目'); restore.click()
  await waitFor(() => expect(project.archived).toBe(false))
  await waitFor(() => expect(changed.mock.calls.at(-1)?.[0]).toEqual([
    { id: project.id, name: original.name, directory: original.directories[0].path }
  ]))
  expect(post).toHaveBeenCalledTimes(2)
  expect(project.name).toBe(original.name)
  expect(root.querySelector('[data-project-card]')).toBeNull()
})

it('keeps its card and explicit failure when CAS rejects the archive without replaying', async () => {
  post.mockRejectedValueOnce(Object.assign(new Error('Project changed'), { reason: 'project_changed' }))
  openArchive().click()
  await waitFor(() => expect(root.querySelector('#studio-status')?.textContent).toContain('项目已变化'))
  expect(root.querySelector('[data-project-card]')).not.toBeNull()
  expect(project.archived).toBe(false)
  expect(root.querySelector('.ce-project-settings')).toBeNull()
  expect(post).toHaveBeenCalledTimes(1)
})

it('retired native management requests cannot reopen an outer project form or change the route', async () => {
  window.history.replaceState(null, '', '/studio#project/p-one/workspace')
  const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus()
  root.hidden = true
  window.dispatchEvent(new CustomEvent('platform-manage-project', {
    detail: { directory: 'C:/example/fixture/one' }
  }))
  expect(document.querySelector('.ce-project-settings')).toBeNull()
  expect(document.querySelector('[data-platform-project-dialog]')).toBeNull()
  expect(window.location.hash).toBe('#project/p-one/workspace')
  expect(document.activeElement).toBe(trigger); expect(post).not.toHaveBeenCalled()
})

it('does not mount retired task boards for legacy links', async () => {
  expect(createBoard).not.toHaveBeenCalled()
  expect(legacy).not.toHaveBeenCalled()
  for (const hash of [
    '#project/p-one/manage', '#project/p-one/review', '#project/p-one/attention',
    '#inbox/manage', '#inbox/review', '#attention'
  ]) {
    acceptRoute(hash)
    expect(createBoard).not.toHaveBeenCalled()
    expect(legacy).not.toHaveBeenCalled()
    expect(scope).not.toHaveBeenCalled()
    expect(window.location.hash).toBe(hash)
    expect(root.querySelector('[data-edit-items]')).toBeNull()
  }
})

it('does not fall back to the legacy executor board without the native shell', async () => {
  mountStandalone()
  await waitFor(() => expect(root.querySelector('[data-project-menu]')).not.toBeNull())
  acceptRoute('#project/p-one/board')
  await waitFor(() => expect(root.textContent).toContain('项目运行组件未连接'))
  expect(createBoard).not.toHaveBeenCalled()
  expect(root.querySelector('a[href$="/activity"]')).toBeNull()
  expect(post).not.toHaveBeenCalled()
})

it('opens workspace from its title without exposing directory details or a replacement form', () => {
  const card = root.querySelector('.ce-overview-card')!
  expect(card.textContent).not.toContain(project.directories[0].path)
  expect(card.textContent).not.toContain('尚无事项')
  expect(card.querySelector('[data-open-project]')?.getAttribute('href')).toBe('#project/p-one/workspace')
  expect(card.querySelector('.ce-development-shortcut')).toBeNull()
  expect(openArchive().textContent).toContain('归档项目')
  expect(menu()?.textContent).not.toMatch(/项目设置|项目进展|项目信息|项目管理/)
})

it('keeps native rename confirmation on the same workspace without the retired form', async () => {
  acceptRoute('#project/p-one/workspace'); root.hidden = true
  const request = nativeAction('rename', { name: 'Workspace rename' })
  const confirm = await request.result as () => Promise<void>
  expect(project.name).toBe('Workspace rename')
  expect(document.querySelector('.ce-project-settings')).toBeNull()
  await confirm(); request.controller.abort()
  expect(changed.mock.calls.at(-1)?.[0]).toEqual([
    { id: project.id, name: 'Workspace rename', directory: project.directories[0].path }
  ])
  expect(window.location.hash).toBe('#project/p-one/workspace')
  expect(post).toHaveBeenCalledTimes(1)
})

it('native actions use the active project when an archived record shares its directory', async () => {
  const archived = { ...project, id: 'p-old', name: 'Archived predecessor', archived: true }
  archivedRecords.push(archived)
  const reads = changed.mock.calls.length
  root.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click()
  await waitFor(() => expect(changed.mock.calls.length).toBeGreaterThan(reads))
  acceptRoute('#project/p-one/workspace')
  const request = nativeAction('rename', { name: 'Active renamed' })
  const confirm = await request.result as () => Promise<void>; await confirm(); request.controller.abort()
  expect(post.mock.calls[0][1]).toMatchObject({ id: 'p-one', name: 'Active renamed', archived: false })
  expect(archived).toMatchObject({ id: 'p-old', name: 'Archived predecessor', archived: true })
  expect(window.location.hash).toBe('#project/p-one/workspace')
})

it('keeps the one-action menu separate and restores focus on resize and keyboard dismissal', () => {
  const trigger = root.querySelector<HTMLButtonElement>('[data-project-menu]')!, action = openArchive()
  const shadow = document.querySelector('[data-platform-project-dialog]')!.shadowRoot!
  expect(window.location.hash).toBe('#home')
  action.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  expect(shadow.activeElement).toBe(action)
  window.dispatchEvent(new Event('resize'))
  expect(menu()).toBeNull(); expect(document.activeElement).toBe(trigger)
  openArchive().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(menu()).toBeNull(); expect(document.activeElement).toBe(trigger)
  expect(post).not.toHaveBeenCalled()
})

it('preserves the current overview search focus and selection when refreshed data changes its DOM', async () => {
  const input = root.querySelector<HTMLInputElement>('#studio-project-search')!
  input.focus(); input.setSelectionRange(0,0)
  project.name = 'Updated'
  root.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click()
  await waitFor(() => expect(root.querySelector('[data-open-project]')?.textContent).toBe('Updated'))
  const replacement = root.querySelector<HTMLInputElement>('#studio-project-search')!
  expect(replacement).not.toBe(input)
  expect(document.activeElement).toBe(replacement)
  expect(replacement.selectionStart).toBe(0)
})

it('standalone archive bubbling performs one save without opening another dialog', async () => {
  mountStandalone()
  await waitFor(() => expect(root.querySelector('[data-project-menu]')).not.toBeNull())
  const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
  root.querySelector<HTMLButtonElement>('[data-project-menu]')!.click()
  root.querySelector<HTMLButtonElement>('[data-project-archive]')!.click()
  await waitFor(() => expect(project.archived).toBe(true))
  expect(post).toHaveBeenCalledTimes(1); expect(show).not.toHaveBeenCalled()
  expect(root.querySelector('.ce-project-settings')).toBeNull()
})

it('offers a focusable direct settings destination without the retired disclosure', () => {
  const link = root.querySelector<HTMLAnchorElement>('#studio-rail a[href="#settings/appearance"]')!
  link.focus(); expect(document.activeElement).toBe(link)
  expect(root.querySelector('[data-action="settings-toggle"]')).toBeNull()
  acceptRoute(link.getAttribute('href')!)
  expect(root.querySelector('#studio-rail a[aria-current="page"]')?.getAttribute('href')).toBe('#settings/appearance')
})

it('drawer settings link uses the same destination and native dialog close returns to its trigger', () => {
  const trigger = root.querySelector<HTMLButtonElement>('[data-action="navigation"]')!; trigger.click()
  const drawer = root.querySelector<HTMLDialogElement>('#studio-navigation')!
  const link = drawer.querySelector<HTMLAnchorElement>('a[href="#settings/appearance"]')!
  link.focus(); expect(document.activeElement).toBe(link)
  expect(drawer.querySelector('[data-action="settings-toggle"]')).toBeNull()
  drawer.close()
  expect(drawer.open).toBe(false); expect(document.activeElement).toBe(trigger)
  expect(post).not.toHaveBeenCalled()
})

it('applies overview text roles and lets the search input fill its single wrapper', () => {
  const heading = getComputedStyle(root.querySelector('h1')!)
  const title = getComputedStyle(root.querySelector('.ce-project-title-link')!)
  const search = getComputedStyle(root.querySelector('#studio-project-search')!)
  expect([heading.fontSize,heading.lineHeight]).toEqual(['24px','32px'])
  expect([title.fontSize,title.lineHeight]).toEqual(['16px','24px'])
  expect([search.height,search.minHeight]).toEqual(['100%','0'])
  expect(root.querySelector('.ce-overview-recent')).toBeNull()
  root.querySelector<HTMLButtonElement>('[data-action="view-list"]')!.click()
  expect(root.querySelector('.ce-overview-recent')).toBeNull()
})
