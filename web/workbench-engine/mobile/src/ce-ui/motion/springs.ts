// Motion constants in one place so feel is tuned centrally and pure logic can be unit-tested.
// Spring values follow Reanimated's documented "responsive, slightly damped" range; the sheet
// values intentionally match the app's existing BottomDrawer so both sheets move alike.

export const springs = {
  /** Press feedback: quick, no overshoot. */
  press: { damping: 22, stiffness: 520, mass: 0.6 },
  /** Things that land: success check, badges. A little overshoot is the point. */
  pop: { damping: 11, stiffness: 260, mass: 0.7 },
  /** Bottom sheet settle. */
  sheet: { damping: 28, stiffness: 400 },
  /** List entrance. */
  enter: { damping: 18, stiffness: 180, mass: 0.9 }
} as const

export const durations = {
  fast: 120,
  base: 200,
  slow: 320,
  sheetShow: 180,
  sheetHide: 150
} as const

export const PRESSED_SCALE = 0.97
export const STAGGER_STEP_MS = 55
export const STAGGER_MAX_ITEMS = 8

export const pulse = {
  slow: { period: 2200, minOpacity: 0.45, ringScale: 2.1 },
  fast: { period: 800, minOpacity: 0.35, ringScale: 2.4 }
} as const

export const shake = { distance: 9, step: 55, cycles: 3 } as const

export const SHEET_DISMISS_DISTANCE = 80
export const SHEET_RUBBER_BAND = 0.25
export const SKELETON_PERIOD_MS = 1100

/** Delay for the nth list row; rows past the cap appear together so long lists never crawl in. */
export function staggerDelay(index: number): number {
  return Math.min(Math.max(index, 0), STAGGER_MAX_ITEMS - 1) * STAGGER_STEP_MS
}

/**
 * Rubber-band: past the top edge (negative translation) the sheet follows the finger at a fraction
 * of the distance; pulling down follows 1:1. Bounded so a wild drag cannot push it off screen.
 */
export function sheetDragOffset(translationY: number): number {
  if (translationY >= 0) return translationY
  return Math.max(translationY * SHEET_RUBBER_BAND, -48)
}

/** Dismiss on a long pull or a fast flick down. */
export function shouldDismissSheet(translationY: number, velocityY: number): boolean {
  return translationY > SHEET_DISMISS_DISTANCE || velocityY > 900
}

/** Slide-to-confirm: 0..1 progress for a thumb offset along a track. */
export function slideProgress(offset: number, trackWidth: number, thumbSize: number): number {
  const travel = trackWidth - thumbSize
  if (travel <= 0) return 0
  return Math.min(1, Math.max(0, offset / travel))
}
export const SLIDE_CONFIRM_THRESHOLD = 0.92
