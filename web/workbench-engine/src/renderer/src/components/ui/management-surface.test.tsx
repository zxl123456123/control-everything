// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ManagementSurfaceProvider, ManagementSurfaceVisibleProvider } from './management-surface'
import { Dialog, DialogContent, DialogTitle } from './dialog'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { Checkbox } from './checkbox'
import { RadioGroup, RadioGroupItem } from './radio-group'

let root: Root | undefined
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  delete document.documentElement.dataset.platformView
})

const cases: [string, () => ReactNode][] = [
  ['dialog-content', () => <Dialog open><DialogContent><DialogTitle>Settings</DialogTitle></DialogContent></Dialog>],
  ['popover-content', () => <Popover open><PopoverTrigger>Open</PopoverTrigger><PopoverContent>Settings</PopoverContent></Popover>],
  ['dropdown-menu-content', () => <DropdownMenu open><DropdownMenuTrigger>Open</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>Settings</DropdownMenuItem></DropdownMenuContent></DropdownMenu>],
  ['select-content', () => <Select open value="settings"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="settings">Settings</SelectItem></SelectContent></Select>]
]

describe('management portal scope', () => {
  it('keeps background management dialogs blocked in Studio and permits only an explicitly visible surface', () => {
    document.documentElement.dataset.platformView = 'studio'
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const content = (visible: boolean) => <ManagementSurfaceProvider value={true}>
      <ManagementSurfaceVisibleProvider value={visible}>
        <Dialog open><DialogContent><DialogTitle>Settings confirmation</DialogTitle></DialogContent></Dialog>
      </ManagementSurfaceVisibleProvider>
    </ManagementSurfaceProvider>
    act(() => root!.render(content(false)))
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
    act(() => root!.render(content(true)))
    expect(document.querySelector('[data-slot="dialog-content"]')?.classList.contains('ce-management-surface')).toBe(true)
    act(() => root!.render(content(false)))
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
    act(() => {
      document.documentElement.dataset.platformView = 'workspace'
      window.dispatchEvent(new Event('platform-surface-change'))
    })
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeNull()
  })
  it.each(cases)('marks the actual %s portal only when its consumer opts in', (slot, content) => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    for (const management of [false, true, false]) {
      act(() => root!.render(<ManagementSurfaceProvider value={management}>{content()}</ManagementSurfaceProvider>))
      const portal = document.querySelector(`[data-slot="${slot}"]`)
      expect(portal).not.toBeNull()
      expect(host.contains(portal)).toBe(false)
      expect(portal!.classList.contains('ce-management-surface')).toBe(management)
    }
  })
})

describe('management geometry scope', () => {
  it('leaves native and slotted controls at their own compact size', () => {
    const css = readFileSync('src/renderer/src/assets/main.css', 'utf8')
    const style = document.createElement('style')
    style.textContent = `.compact { width: 28px; height: 28px; }` + css
    document.body.append(style)
    const host = document.createElement('div')
    host.innerHTML = `<button class="compact" id="compact">Terminal</button>
      <section class="ce-management-surface">
        <button class="compact">Colour</button>
        <button class="compact" data-slot="popover-trigger">Custom</button>
        <button class="compact" role="combobox">Jira</button>
        <button class="compact" role="tab" data-slot="tabs-trigger">Avatar</button>
        <button class="compact" role="radio">Policy</button>
        <input class="compact" data-slot="input" />
        <input class="compact" type="color" />
        <button class="compact" data-slot="select-trigger">Account</button>
        <button class="compact" data-slot="button">Refresh</button>
        <button class="compact" data-slot="switch" role="switch">Toggle</button>
      </section>`
    document.body.append(host)
    for (const control of host.querySelectorAll('.ce-management-surface .compact')) {
      const size = getComputedStyle(control)
      expect(size.height).toBe('28px')
      expect(size.width).toBe('28px')
      expect(size.minHeight).not.toBe('40px')
      expect(size.minWidth).not.toBe('40px')
    }
    const compact = getComputedStyle(host.querySelector('#compact')!)
    expect(compact.width).toBe('28px')
    expect(compact.height).toBe('28px')
    expect(compact.minHeight).not.toBe('40px')
    const toggle = getComputedStyle(host.querySelector('[role="switch"]')!)
    expect(toggle.width).toBe('28px')
    expect(toggle.height).toBe('28px')
  })

  it('retains the native tab strip and icon grid layout', () => {
    const css = readFileSync('src/renderer/src/assets/main.css', 'utf8')
    const style = document.createElement('style')
    style.textContent = `[data-slot="tabs-list"] { height: 32px; }
      .grid-cols-10 { grid-template-columns: repeat(10, minmax(0, 1fr)); }` + css
    document.body.append(style)
    const host = document.createElement('div')
    host.className = 'ce-management-surface'
    host.innerHTML = `<div data-slot="tabs-list"><button role="tab">Avatar</button></div>
      <div data-slot="tabs-content"><div class="grid-cols-10"><button>Icon</button></div></div>`
    document.body.append(host)
    const tabs = getComputedStyle(host.querySelector('[data-slot="tabs-list"]')!)
    expect(tabs.height).toBe('32px')
    expect(tabs.flexWrap).not.toBe('wrap')
    expect(tabs.maxWidth).not.toBe('100%')
    const grid = getComputedStyle(host.querySelector('.grid-cols-10')!)
    expect(grid.gridTemplateColumns).toBe('repeat(10, minmax(0, 1fr))')
  })

  it('keeps actual checkbox and radio controls without a management overlay indicator', () => {
    const css = readFileSync('src/renderer/src/assets/main.css', 'utf8')
    const style = document.createElement('style')
    style.textContent = `.size-4 { width: 16px; height: 16px; border-width: 1px; }` + css
    document.body.append(style)
    const host = document.createElement('section')
    host.className = 'ce-management-surface'
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<>
      <Checkbox checked aria-label="Confirm" />
      <RadioGroup value="selected"><RadioGroupItem value="selected" aria-label="Choice" /></RadioGroup>
    </>))
    for (const slot of ['checkbox', 'radio-group-item']) {
      const control = host.querySelector(`[data-slot="${slot}"]`)!
      const hitBox = getComputedStyle(control)
      expect(control.tagName).toBe('BUTTON')
      expect(control.classList.contains('size-4')).toBe(true)
      expect(hitBox.width).toBe('16px')
      expect(hitBox.height).toBe('16px')
      expect(hitBox.borderWidth).toBe('1px')
    }
    expect(Array.from(style.sheet!.cssRules).some(rule =>
      rule instanceof CSSStyleRule && rule.selectorText.includes('.ce-management-surface') &&
      rule.selectorText.includes('::before')
    )).toBe(false)
  })
})
