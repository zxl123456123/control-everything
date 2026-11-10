// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareUsageCard, type ShareUsageCardProps } from './ShareUsageCard'
import { ShareUsageButton } from './ShareUsageButton'
import { i18n, setRendererUiLanguage } from '@/i18n/i18n'
import { toPng } from 'html-to-image'

vi.mock('html-to-image', () => ({ toPng: vi.fn() }))
vi.mock('../ui/dialog', () => {
  const Wrapper = ({ children }: { children: ReactNode }) => <>{children}</>
  return {
    Dialog: Wrapper,
    DialogContent: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
    DialogTrigger: Wrapper
  }
})
vi.mock('../ui/tooltip', () => {
  const Wrapper = ({ children }: { children: ReactNode }) => <>{children}</>
  return {
    Tooltip: Wrapper,
    TooltipContent: Wrapper,
    TooltipProvider: Wrapper,
    TooltipTrigger: Wrapper
  }
})

const usage: ShareUsageCardProps = {
  provider: 'codex',
  range: '7d',
  daily: [],
  summary: {
    scope: 'orca',
    range: '7d',
    sessions: 1,
    events: 2,
    inputTokens: 1000,
    cachedInputTokens: 0,
    outputTokens: 200,
    reasoningOutputTokens: 0,
    totalTokens: 1200,
    estimatedCostUsd: 0.12,
    hasUnpricedModels: false,
    topModel: 'Orca custom model',
    topProject: null,
    hasAnyCodexData: true
  }
}

describe('usage sharing product identity', () => {
  let root: Root | undefined
  const openUrl = vi.fn()
  const writeClipboardImage = vi.fn()

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    openUrl.mockReset()
    writeClipboardImage.mockReset()
    vi.mocked(toPng).mockReset()
    Object.assign(window, { api: { shell: { openUrl }, ui: { writeClipboardImage } } })
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    if (root) act(() => root?.unmount())
    root = undefined
    document.body.replaceChildren()
    window.history.replaceState(null, '', '/')
  })

  it.each(['/studio', '/workbench/web-index.html', '/web-index.html'])(
    'brands the rendered card on %s',
    async (path) => {
      window.history.replaceState(null, '', path)
      await setRendererUiLanguage('zh')
      const html = renderToStaticMarkup(<ShareUsageCard {...usage} />)
      expect(html).toContain('掌控一切')
      expect(html).toContain('>CE</span>')
      expect(html).toContain('github.com/zxl123456123/control-everything')
      expect(html).not.toContain('Orca IDE')
      expect(html).not.toContain('318.60232')
      expect(html).toContain('Orca custom model')
    }
  )

  it.each(['/studio', '/workbench/web-index.html', '/web-index.html'])(
    'uses the matching outgoing share identity on %s',
    async (path) => {
      window.history.replaceState(null, '', path)
      const container = document.createElement('div')
      document.body.appendChild(container)
      root = createRoot(container)
      await act(async () => root?.render(<ShareUsageButton {...usage} />))
      const share = Array.from(container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Share on X')
      )
      expect(share).toBeDefined()
      expect(openUrl).not.toHaveBeenCalled()
      await act(async () => share?.click())
      const url = new URL(openUrl.mock.calls[0][0])
      expect(url.origin + url.pathname).toBe('https://x.com/intent/post')
      const text = url.searchParams.get('text')
      expect(text).toContain('1.2k tokens · $0.12 est. cost')
      expect(text).toContain('Control Everything')
      expect(text).toContain('github.com/zxl123456123/control-everything')
      expect(text).not.toMatch(/orca_build|stablyai/)
    }
  )

  it('still captures the branded card to the clipboard', async () => {
    window.history.replaceState(null, '', '/web-index.html')
    vi.mocked(toPng).mockResolvedValue('data:image/png;base64,fixture')
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root?.render(<ShareUsageButton {...usage} />))
    const copy = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Copy image')
    )
    expect(copy).toBeDefined()
    await act(async () => copy?.click())
    expect(toPng).toHaveBeenCalledOnce()
    const card = vi.mocked(toPng).mock.calls[0][0] as HTMLElement
    expect(card.textContent).toContain('Control Everything')
    expect(writeClipboardImage).toHaveBeenCalledWith('data:image/png;base64,fixture')
  })
})
