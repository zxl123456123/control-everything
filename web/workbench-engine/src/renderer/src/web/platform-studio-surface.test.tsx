// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import PlatformStudioSurface from './platform-studio-surface'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('downloads dependencies in order once and keeps load-error recovery available during navigation', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: async () => '<div id="ce-studio"></div>'
  }))
  const scripts: HTMLScriptElement[] = []
  // Observe scheduling without enabling network execution in the test environment.
  vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
    scripts.push(...nodes.filter((node): node is HTMLScriptElement => node instanceof HTMLScriptElement))
  })
  const onProjects = vi.fn()
  const view = render(<PlatformStudioSurface hidden={false} onProjects={onProjects} />)
  // Every download is scheduled before the first script finishes, without changing execution order.
  expect(scripts.map((script) => new URL(script.src).pathname)).toEqual([
    '/onboarding.js', '/execution.js', '/task-center.js', '/monitor-art.js',
    '/monitor-scene.js', '/monitor-model.js', '/project-monitor.js',
    '/project-space.js', '/agents.js', '/studio-data.js', '/mobile-device-entry.js', '/news-surface.js', '/studio-preview.js'
  ])
  expect(scripts.every((script) => script.async === false)).toBe(true)
  view.rerender(<PlatformStudioSurface hidden onProjects={onProjects} />)
  view.rerender(<PlatformStudioSurface hidden={false} pending onProjects={onProjects} />)
  expect(view.container.querySelector('section')?.hasAttribute('inert')).toBe(false)
  expect(view.container.querySelector<HTMLElement>('.platform-studio-host')?.hidden).toBe(true)
  view.rerender(<PlatformStudioSurface hidden={false} onProjects={onProjects} />)
  expect(view.container.querySelector('section')?.hasAttribute('inert')).toBe(false)
  expect(view.container.querySelector<HTMLElement>('.platform-studio-host')?.hidden).toBe(false)
  expect(scripts).toHaveLength(13)
  view.rerender(<PlatformStudioSurface hidden={false} pending onProjects={onProjects} />)
  await act(async () => { scripts[0].dispatchEvent(new Event('error')) })
  expect(screen.getByRole('alert').textContent).toContain('工作台资源加载失败')
  expect(screen.getByRole('button', { name: '重新加载' }).closest('[inert]')).toBeNull()
})

it('passes visibility to the retained Studio handle when listener identity changes', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true, text:async()=>'<div id="ce-studio"></div>'}))
  const setVisible = vi.fn()
  const unmount = Object.assign(vi.fn(), {setVisible})
  const mount = vi.fn(() => unmount)
  vi.stubGlobal('StudioPreview', {mount})
  vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
    for (const node of nodes) if (node instanceof HTMLScriptElement) queueMicrotask(()=>node.dispatchEvent(new Event('load')))
  })
  const append = ShadowRoot.prototype.append
  vi.spyOn(ShadowRoot.prototype, 'append').mockImplementation(function (this: ShadowRoot, ...nodes) {
    append.apply(this, nodes.filter(node => !(node instanceof HTMLLinkElement)))
    for (const node of nodes) if (node instanceof HTMLLinkElement) queueMicrotask(()=>node.dispatchEvent(new Event('load')))
  })
  const view=render(<PlatformStudioSurface hidden={false} onProjects={vi.fn()} />)
  await act(async()=>{for(let i=0;i<20;i++)await Promise.resolve()})
  expect(mount).toHaveBeenCalledTimes(1)
  expect(setVisible).toHaveBeenLastCalledWith(true)
  view.rerender(<PlatformStudioSurface hidden onProjects={vi.fn()} />)
  expect(setVisible).toHaveBeenLastCalledWith(false)
  view.rerender(<PlatformStudioSurface hidden={false} onProjects={vi.fn()} />)
  expect(mount).toHaveBeenCalledTimes(1)
  expect(setVisible).toHaveBeenLastCalledWith(true)
  view.unmount()
  expect(unmount).toHaveBeenCalledTimes(1)
})
