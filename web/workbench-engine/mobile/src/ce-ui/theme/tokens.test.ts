import { describe, expect, it } from 'vitest'
import { cePalettes, ceHit, ceRadii, ceSpace, ceType, withAlpha, type CeScheme } from './tokens'

function channel(value: number): number {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
function luminance(hex: string): number {
  const n = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16)
  return 0.2126 * channel(n(1)) + 0.7152 * channel(n(3)) + 0.0722 * channel(n(5))
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}
/** Flattens a translucent tone fill over the surface it sits on. */
function over(rgba: string, base: string): string {
  const [r, g, b, a] = rgba.match(/[\d.]+/g)!.map(Number) as [number, number, number, number]
  const mix = (top: number, offset: number) =>
    Math.round(top * a + Number.parseInt(base.slice(offset, offset + 2), 16) * (1 - a))
  return `#${[mix(r, 1), mix(g, 3), mix(b, 5)].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

const schemes: CeScheme[] = ['dark', 'light']

describe('type scale', () => {
  it('matches the agreed scale and never drops below 13', () => {
    expect(ceType.display).toMatchObject({ fontSize: 32, lineHeight: 38 })
    expect(ceType.title).toMatchObject({ fontSize: 24, lineHeight: 30 })
    expect(ceType.headline).toMatchObject({ fontSize: 18, lineHeight: 26 })
    expect(ceType.body).toMatchObject({ fontSize: 16, lineHeight: 24 })
    expect(ceType.callout).toMatchObject({ fontSize: 15, lineHeight: 22 })
    expect(ceType.caption).toMatchObject({ fontSize: 13, lineHeight: 18 })
    for (const style of Object.values(ceType)) {
      expect(style.fontSize).toBeGreaterThanOrEqual(13)
      expect(style.lineHeight).toBeGreaterThan(style.fontSize)
    }
  })
})

describe('spacing, radii and touch targets', () => {
  it('stays on the 4pt grid', () => {
    for (const value of Object.values(ceSpace)) expect(value % 4).toBe(0)
  })
  it('keeps the agreed radii and hit sizes', () => {
    expect(ceRadii).toMatchObject({ button: 14, card: 20, sheet: 28 })
    expect(ceHit.min).toBeGreaterThanOrEqual(44)
    expect(ceHit.primaryButton).toBe(52)
  })
})

describe.each(schemes)('%s palette', (scheme) => {
  const p = cePalettes[scheme]
  it('keeps text readable on every surface', () => {
    for (const surface of [p.bg, p.surface, p.soft]) {
      expect(contrast(p.text, surface)).toBeGreaterThanOrEqual(7)
      expect(contrast(p.muted, surface)).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('keeps button labels readable on their fills', () => {
    expect(contrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(p.onDanger, p.danger)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(p.accentText, p.surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('keeps every status tone readable on its own tint over cards and the page', () => {
    for (const toneColors of Object.values(p.tones)) {
      for (const base of [p.bg, p.surface]) {
        expect(contrast(toneColors.fg, over(toneColors.bg, base))).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})

describe('palette parity with the browser portal', () => {
  it('uses the portal slate values', () => {
    expect(cePalettes.dark).toMatchObject({
      bg: '#020617',
      surface: '#0f172a',
      soft: '#1e293b',
      text: '#f8fafc',
      muted: '#94a3b8',
      line: '#263247'
    })
    expect(cePalettes.light).toMatchObject({
      soft: '#f1f5f9',
      text: '#0f172a',
      line: '#e2e8f0'
    })
  })
})

describe('withAlpha', () => {
  it('converts hex to rgba', () => {
    expect(withAlpha('#4ade80', 0.14)).toBe('rgba(74, 222, 128, 0.14)')
  })
})
