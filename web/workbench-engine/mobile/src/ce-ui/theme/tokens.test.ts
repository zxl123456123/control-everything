import { describe, expect, it } from 'vitest'
import {
  cePalettes,
  ceHit,
  ceRadii,
  ceSpace,
  ceType,
  splitRgba,
  withAlpha,
  type CeScheme
} from './tokens'

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
    expect(ceType.display).toMatchObject({ fontSize: 34, lineHeight: 40, fontWeight: '600' })
    expect(ceType.title).toMatchObject({ fontSize: 24, lineHeight: 30, fontWeight: '600' })
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
    expect(ceRadii).toMatchObject({ button: 16, card: 24, sheet: 28 })
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

describe('palette parity with the browser portal and the Keycloak theme', () => {
  it('uses the shared Aurora Glass values', () => {
    expect(cePalettes.dark).toMatchObject({
      bg: '#05060e',
      surface: '#0e1020',
      text: '#f5f7ff',
      muted: '#b3bbd4',
      accent: '#5b5ef0',
      accentB: '#8b4df5',
      accentText: '#aab6ff'
    })
    expect(cePalettes.light).toMatchObject({
      bg: '#eef0fb',
      text: '#0b1020',
      muted: '#475069',
      accent: '#4f46e5',
      accentB: '#7c3aed',
      accentText: '#4338ca'
    })
  })
})

describe.each(schemes)('%s glass surfaces', (scheme) => {
  const p = cePalettes[scheme]
  it('has a translucent fill in the 0.45-0.65 range', () => {
    for (const fill of [p.glass]) {
      const alpha = Number(fill.match(/[\d.]+/g)![3])
      expect(alpha).toBeGreaterThanOrEqual(0.45)
      expect(alpha).toBeLessThanOrEqual(0.65)
    }
  })
  it('keeps text AA on glass over the brightest aurora blob (worst case)', () => {
    expect(contrast(p.text, p.glassWorst)).toBeGreaterThanOrEqual(7)
    expect(contrast(p.muted, p.glassWorst)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(p.accentText, p.glassWorst)).toBeGreaterThanOrEqual(4.5)
  })
  it('keeps both gradient stops readable under white button labels', () => {
    expect(contrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(p.onAccent, p.accentB)).toBeGreaterThanOrEqual(4.5)
  })
  it('keeps every status tone readable on the worst-case glass', () => {
    for (const toneColors of Object.values(p.tones)) {
      expect(contrast(toneColors.fg, over(toneColors.bg, p.glassWorst))).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('has four aurora blobs', () => {
    expect(p.aurora).toHaveLength(4)
  })
})

describe('splitRgba', () => {
  it('separates colour and opacity for SVG stops', () => {
    expect(splitRgba('rgba(79, 102, 255, 0.68)')).toEqual({
      color: 'rgb(79, 102, 255)',
      opacity: 0.68
    })
  })
})

describe('withAlpha', () => {
  it('converts hex to rgba', () => {
    expect(withAlpha('#4ade80', 0.14)).toBe('rgba(74, 222, 128, 0.14)')
  })
})
