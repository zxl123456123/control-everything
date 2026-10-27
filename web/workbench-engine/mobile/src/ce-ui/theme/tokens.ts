// Design tokens for the Control Everything account / device screens: "Aurora Glass".
// Same indigo -> violet accent, ink-navy dark / lavender-white light palette, radii and spacing as
// web/workspace/remote-account.css and the Keycloak login theme (identity-theme/.../studio.css), so the
// phone app, the browser portal and the sign-in page read as one product. The rest of the Orca app keeps
// its graphite theme untouched.
//
// Solid fields (bg, surface, soft, line) stay opaque hex: they are the fallback fill, what contrast is
// tested against, and what Android/older devices show. The glass fields (glass*, field*) are translucent
// rgba layered on top of the animated aurora backdrop. expo-blur is NOT a dependency yet, so the blur
// itself is simulated with translucency + a top-lit gradient + a gradient hairline (see Glass.tsx).

export type CeScheme = 'light' | 'dark'
export type CeTone = 'success' | 'warning' | 'neutral' | 'danger' | 'info'

export type CePalette = {
  /** Screen background. */
  bg: string
  /** Cards and sheets. */
  surface: string
  /** Inputs, pills, quiet fills. */
  soft: string
  text: string
  muted: string
  line: string
  /** Primary action fill (white text on it is >= 4.5:1 in both schemes). */
  accent: string
  onAccent: string
  /** Accent used as text or an icon on `bg` / `surface`. */
  accentText: string
  danger: string
  onDanger: string
  /** Scrim behind sheets. */
  scrim: string
  /** Second stop of the accent gradient (the first is `accent`). */
  accentB: string
  /** Colour of the accent glow under primary buttons and brand marks. */
  glow: string
  /** Translucent card fill, top-lit highlight laid over it, and the hairline rim gradient (start, end). */
  glass: string
  glassHi: string
  glassRim: [string, string]
  /** Translucent input / secondary-button fill and its 1px edge. */
  field: string
  fieldEdge: string
  /** Ambient aurora blobs behind every screen (4), in paint order. */
  aurora: [string, string, string, string]
  /** Outer shadow colour for glass cards. */
  shadow: string
  /** Opaque `glass` flattened over the brightest aurora blob: the worst-case surface text sits on. */
  glassWorst: string
  tones: Record<CeTone, { fg: string; bg: string; dot: string }>
}

/** `#rrggbb` + alpha -> `rgba(...)`. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function tone(fg: string, dot: string, alpha: number): { fg: string; bg: string; dot: string } {
  return { fg, bg: withAlpha(fg, alpha), dot }
}

const dark: CePalette = {
  bg: '#05060e',
  surface: '#0e1020',
  soft: '#171a32',
  text: '#f5f7ff',
  muted: '#b3bbd4',
  line: '#262a47',
  accent: '#5b5ef0',
  accentB: '#8b4df5',
  onAccent: '#ffffff',
  accentText: '#aab6ff',
  danger: '#e11d48',
  onDanger: '#ffffff',
  scrim: 'rgba(3, 4, 12, 0.62)',
  glow: 'rgba(99, 102, 241, 0.6)',
  glass: 'rgba(14, 16, 34, 0.58)',
  glassHi: 'rgba(255, 255, 255, 0.09)',
  glassRim: ['rgba(255, 255, 255, 0.5)', 'rgba(129, 140, 248, 0.22)'],
  field: 'rgba(255, 255, 255, 0.06)',
  fieldEdge: 'rgba(255, 255, 255, 0.15)',
  aurora: [
    'rgba(79, 102, 255, 0.68)',
    'rgba(192, 80, 255, 0.5)',
    'rgba(34, 211, 238, 0.38)',
    'rgba(236, 72, 190, 0.34)'
  ],
  shadow: '#000000',
  glassWorst: '#1b2358',
  tones: {
    success: tone('#4ade80', '#22c55e', 0.14),
    warning: tone('#fbbf24', '#f59e0b', 0.14),
    neutral: tone('#b3bbd4', '#6d7a9a', 0.16),
    danger: tone('#ff9bab', '#fb7185', 0.14),
    info: tone('#aab6ff', '#818cf8', 0.14)
  }
}

const light: CePalette = {
  bg: '#eef0fb',
  surface: '#ffffff',
  soft: '#f1f2fd',
  text: '#0b1020',
  muted: '#475069',
  line: '#d9dcf0',
  accent: '#4f46e5',
  accentB: '#7c3aed',
  onAccent: '#ffffff',
  accentText: '#4338ca',
  danger: '#e11d48',
  onDanger: '#ffffff',
  scrim: 'rgba(11, 16, 32, 0.45)',
  glow: 'rgba(79, 70, 229, 0.42)',
  glass: 'rgba(255, 255, 255, 0.62)',
  glassHi: 'rgba(255, 255, 255, 0.6)',
  glassRim: ['rgba(255, 255, 255, 1)', 'rgba(79, 70, 229, 0.18)'],
  field: 'rgba(255, 255, 255, 0.7)',
  fieldEdge: 'rgba(15, 23, 60, 0.16)',
  aurora: [
    'rgba(99, 102, 241, 0.55)',
    'rgba(236, 72, 153, 0.38)',
    'rgba(34, 211, 238, 0.42)',
    'rgba(251, 191, 36, 0.28)'
  ],
  shadow: '#3730a3',
  glassWorst: '#dcdffa',
  tones: {
    success: tone('#166534', '#16a34a', 0.1),
    warning: tone('#92400e', '#d97706', 0.12),
    neutral: tone('#475069', '#8a94b0', 0.12),
    danger: tone('#9f1239', '#e11d48', 0.1),
    info: tone('#4338ca', '#4f46e5', 0.1)
  }
}

export const cePalettes: Record<CeScheme, CePalette> = { dark, light }

/** Nothing is smaller than 13; text a user must act on is 15 or larger. Headings are tight-tracked, 600 weight. */
export const ceType = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '600', letterSpacing: -1 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '600', letterSpacing: -0.5 },
  headline: { fontSize: 18, lineHeight: 26, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' }
} as const
export type CeTypeKey = keyof typeof ceType

/** 4pt grid. */
export const ceSpace = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  huge: 32,
  giant: 48
} as const

export const ceRadii = { button: 16, card: 24, sheet: 28, input: 16, pill: 999 } as const

export const ceHit = { min: 44, primaryButton: 52 } as const

/** `rgba(r, g, b, a)` -> opaque `rgb(...)` plus its alpha, for SVG gradient stops (`stopColor` + `stopOpacity`). */
export function splitRgba(color: string): { color: string; opacity: number } {
  const match = color.match(/[\d.]+/g)
  if (!match || match.length < 3) return { color, opacity: 1 }
  const [r, g, b, a] = match.map(Number) as [number, number, number, number?]
  return { color: `rgb(${r}, ${g}, ${b})`, opacity: a ?? 1 }
}
