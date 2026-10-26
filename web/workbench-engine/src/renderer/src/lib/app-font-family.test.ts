import { describe, expect, it } from 'vitest'
import { buildAppFontFamily } from './app-font-family'

describe('management app font family', () => {
  it('uses the registered Geist face with explicit Chinese fallbacks', () => {
    expect(buildAppFontFamily(undefined)).toBe(
      '"Geist", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif'
    )
  })
  it('preserves a personal font first without duplicating a fallback', () => {
    expect(buildAppFontFamily(' Personal Font ')).toMatch(/^"Personal Font", "Geist",/)
    expect(buildAppFontFamily('Microsoft YaHei').match(/Microsoft YaHei/g)).toHaveLength(1)
  })
})
