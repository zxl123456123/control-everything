import { describe, expect, it } from 'vitest'
import { avatarHue, avatarInitials } from './avatar-seed'

describe('avatar seed', () => {
  it('uses two initials for latin names and one character for CJK names', () => {
    expect(avatarInitials('Ada Lovelace')).toBe('AL')
    expect(avatarInitials('ada')).toBe('A')
    expect(avatarInitials('  演示用户 ')).toBe('演')
    expect(avatarInitials('')).toBe('?')
    expect(avatarInitials(null)).toBe('?')
  })
  it('keeps surrogate pairs whole', () => {
    expect(avatarInitials('😀 smile')).toBe('😀')
  })
  it('gives a stable hue in range', () => {
    expect(avatarHue('subject-1')).toBe(avatarHue('subject-1'))
    expect(avatarHue('subject-1')).not.toBe(avatarHue('subject-2'))
    for (const seed of ['', 'a', '演示', 'x'.repeat(500)]) {
      const hue = avatarHue(seed)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
  })
})
