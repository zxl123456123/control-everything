// Design tokens for the Control Everything account / device screens: "Calm Glass" (v2).
// Follows the personal workbench (Studio) tone: neutral grey canvas, an ink primary button, hairline
// borders, one quiet blue (accentText) for focus and links. The same values drive
// web/workspace/remote-account.css and the Keycloak login theme (identity-theme/.../studio.css), so the
// phone app, the browser portal and the sign-in page read as one product. The rest of the Orca app keeps
// its graphite theme untouched.
//
// Solid fields (bg, surface, soft, line) stay opaque hex: they are the fallback fill and what contrast is
// tested against. The glass fields (glass, field) are lightly translucent rgba on top of a flat canvas with
// one static, very faint tint (no animated backdrop). expo-blur is NOT a dependency yet, so there is no
// real backdrop blur on the phone: translucency is kept light and text never depends on a blur.

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
  /** Translucent card fill and its hairline rim (start, end; near-equal on purpose). */
  glass: string
  glassRim: [string, string]
  /** Translucent secondary-button / pill fill and its 1px hairline. */
  field: string
  fieldEdge: string
  /** Border of text inputs: >= 3:1 against the surface (WCAG 1.4.11), same value as the Keycloak theme. */
  inputEdge: string
  /** The single static, very faint tint at the top of every screen (a radial wash over `bg`). */
  tint: string
  /** Outer shadow colour for cards. */
  shadow: string
  /** Opaque `glass` flattened over the canvas and its tint: the worst-case surface text sits on. */
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
  bg: '#1f1f1f',
  surface: '#282828',
  soft: '#303030',
  text: '#f4f4f4',
  muted: '#b4b4b4',
  line: '#3a3a3a',
  accent: '#f4f4f4',
  onAccent: '#202020',
  accentText: '#a6c8f1',
  danger: '#dc2626',
  onDanger: '#ffffff',
  scrim: 'rgba(0, 0, 0, 0.6)',
  glass: 'rgba(40, 40, 40, 0.62)',
  glassRim: ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.12)'],
  field: 'rgba(255, 255, 255, 0.06)',
  fieldEdge: 'rgba(255, 255, 255, 0.14)',
  inputEdge: '#929292',
  tint: 'rgba(166, 200, 241, 0.08)',
  shadow: '#000000',
  glassWorst: '#2a2f33',
  tones: {
    success: tone('#4ade80', '#22c55e', 0.14),
    warning: tone('#fbbf24', '#f59e0b', 0.14),
    neutral: tone('#b4b4b4', '#7c7c7c', 0.16),
    danger: tone('#fca5a5', '#f87171', 0.14),
    info: tone('#a6c8f1', '#7aa7dc', 0.14)
  }
}

const light: CePalette = {
  bg: '#f6f6f6',
  surface: '#ffffff',
  soft: '#efefef',
  text: '#202020',
  muted: '#5c5c5c',
  line: '#e2e2e2',
  accent: '#202020',
  onAccent: '#ffffff',
  accentText: '#285e9b',
  danger: '#dc2626',
  onDanger: '#ffffff',
  scrim: 'rgba(20, 20, 20, 0.4)',
  glass: 'rgba(255, 255, 255, 0.65)',
  glassRim: ['rgba(32, 32, 32, 0.12)', 'rgba(32, 32, 32, 0.12)'],
  field: 'rgba(255, 255, 255, 0.7)',
  fieldEdge: 'rgba(32, 32, 32, 0.14)',
  inputEdge: '#858585',
  tint: 'rgba(40, 94, 155, 0.09)',
  shadow: '#000000',
  glassWorst: '#e6ecf3',
  tones: {
    success: tone('#166534', '#16a34a', 0.1),
    warning: tone('#92400e', '#d97706', 0.12),
    neutral: tone('#5c5c5c', '#8a8a8a', 0.12),
    danger: tone('#b91c1c', '#dc2626', 0.1),
    info: tone('#285e9b', '#285e9b', 0.1)
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

export const ceRadii = { button: 12, card: 16, sheet: 20, input: 12, pill: 999 } as const

export const ceHit = { min: 44, primaryButton: 52 } as const

/** `rgba(r, g, b, a)` -> opaque `rgb(...)` plus its alpha, for SVG gradient stops (`stopColor` + `stopOpacity`). */
export function splitRgba(color: string): { color: string; opacity: number } {
  const match = color.match(/[\d.]+/g)
  if (!match || match.length < 3) return { color, opacity: 1 }
  const [r, g, b, a] = match.map(Number) as [number, number, number, number?]
  return { color: `rgb(${r}, ${g}, ${b})`, opacity: a ?? 1 }
}
