import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentIcon, getAgentCatalog } from './agent-catalog'
import { getOpenInAppPresets, OpenInApplicationIcon } from './open-in-app-catalog'

function atPath(pathname: string): void {
  vi.stubGlobal('window', { location: { pathname } })
}

afterEach(() => vi.unstubAllGlobals())

describe('platform catalog icons', () => {
  it('renders every agent and application entry without remote image URLs on the platform', () => {
    atPath('/workbench/web-index.html')
    const rendered = [
      ...getAgentCatalog().map((entry) => renderToStaticMarkup(<AgentIcon agent={entry.id} />)),
      ...getOpenInAppPresets().map((preset) =>
        renderToStaticMarkup(<OpenInApplicationIcon application={preset} />)
      )
    ]
    expect(rendered.length).toBeGreaterThan(40)
    for (const markup of rendered) {
      expect(markup).toMatch(/<(?:img|svg)\b/)
      expect(markup).not.toMatch(/<(?:img|link)\b[^>]*(?:src|href)="(?:https?:)?\/\//)
      expect(markup).not.toContain('google.com')
    }
  })

  it('preserves the original bundled image and SVG output for every locally represented agent', () => {
    const catalog = getAgentCatalog()
    atPath('/web-index.html')
    const standalone = catalog.map((entry) => renderToStaticMarkup(<AgentIcon agent={entry.id} />))
    atPath('/workbench/web-index.html')
    let images = 0
    let glyphs = 0
    for (const [index, entry] of catalog.entries()) {
      if (standalone[index].includes('google.com')) continue
      const platform = renderToStaticMarkup(<AgentIcon agent={entry.id} />)
      expect(platform).toBe(standalone[index])
      if (platform.includes('<img')) images++
      if (platform.includes('<svg')) glyphs++
    }
    expect(images).toBeGreaterThan(0)
    expect(glyphs).toBeGreaterThan(0)
  })

  it.each(['/web-index.html', '/index.html', '/workbench/web-index.html/'])(
    'keeps the Google fallback outside the exact platform path: %s',
    (pathname) => {
      atPath(pathname)
      expect(renderToStaticMarkup(<AgentIcon agent="codebuddy" />)).toContain(
        'https://www.google.com/s2/favicons'
      )
      for (const preset of getOpenInAppPresets()) {
        expect(renderToStaticMarkup(<OpenInApplicationIcon application={preset} />)).toContain(
          `https://www.google.com/s2/favicons?domain=${preset.faviconDomain}`
        )
      }
    }
  )

  it('uses the existing letter and app glyphs when the platform has no bundled image', () => {
    atPath('/workbench/web-index.html')
    expect(renderToStaticMarkup(<AgentIcon agent="codebuddy" />)).toContain('>C</text>')
    for (const preset of getOpenInAppPresets()) {
      const markup = renderToStaticMarkup(<OpenInApplicationIcon application={preset} />)
      expect(markup).toContain('lucide-app-window')
      expect(markup).not.toContain('<img')
    }
  })
})
