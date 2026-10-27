import { describe, expect, it } from 'vitest'
import {
  SHEET_DISMISS_DISTANCE,
  sheetDragOffset,
  shouldDismissSheet,
  slideProgress,
  staggerDelay,
  STAGGER_MAX_ITEMS,
  STAGGER_STEP_MS
} from './springs'

describe('motion helpers', () => {
  it('staggers rows but caps the delay at eight rows', () => {
    expect(staggerDelay(0)).toBe(0)
    expect(staggerDelay(3)).toBe(3 * STAGGER_STEP_MS)
    expect(staggerDelay(50)).toBe((STAGGER_MAX_ITEMS - 1) * STAGGER_STEP_MS)
    expect(staggerDelay(-2)).toBe(0)
  })
  it('rubber-bands a sheet pulled up and follows a sheet pulled down', () => {
    expect(sheetDragOffset(40)).toBe(40)
    expect(sheetDragOffset(-40)).toBe(-10)
    expect(sheetDragOffset(-4000)).toBe(-48)
  })
  it('dismisses on a long pull or a fast flick, not on a small nudge', () => {
    expect(shouldDismissSheet(SHEET_DISMISS_DISTANCE + 1, 0)).toBe(true)
    expect(shouldDismissSheet(10, 1200)).toBe(true)
    expect(shouldDismissSheet(30, 200)).toBe(false)
  })
  it('maps a thumb position to slide progress and clamps it', () => {
    expect(slideProgress(0, 300, 52)).toBe(0)
    expect(slideProgress(124, 300, 52)).toBe(0.5)
    expect(slideProgress(999, 300, 52)).toBe(1)
    expect(slideProgress(-5, 300, 52)).toBe(0)
    expect(slideProgress(10, 40, 52)).toBe(0)
  })
})
