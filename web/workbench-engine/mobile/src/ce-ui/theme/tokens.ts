// Design tokens for the Control Everything account / device screens.
// Palette is the slate scale used by web/workspace/remote-account.css, so the phone app and the
// browser portal read as one product. The rest of the Orca app keeps its graphite theme untouched.

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
  bg: '#020617',
  surface: '#0f172a',
  soft: '#1e293b',
  text: '#f8fafc',
  muted: '#94a3b8',
  line: '#263247',
  accent: '#2563eb',
  onAccent: '#ffffff',
  accentText: '#60a5fa',
  danger: '#dc2626',
  onDanger: '#ffffff',
  scrim: 'rgba(2, 6, 23, 0.72)',
  tones: {
    success: tone('#4ade80', '#22c55e', 0.14),
    warning: tone('#fbbf24', '#f59e0b', 0.14),
    neutral: tone('#94a3b8', '#64748b', 0.16),
    danger: tone('#f87171', '#ef4444', 0.14),
    info: tone('#60a5fa', '#3b82f6', 0.14)
  }
}

const light: CePalette = {
  // slate-50 instead of the portal's pure white so white cards lift off the page.
  bg: '#f8fafc',
  surface: '#ffffff',
  soft: '#f1f5f9',
  text: '#0f172a',
  muted: '#566277',
  line: '#e2e8f0',
  accent: '#2563eb',
  onAccent: '#ffffff',
  accentText: '#1d4ed8',
  danger: '#dc2626',
  onDanger: '#ffffff',
  scrim: 'rgba(15, 23, 42, 0.45)',
  tones: {
    success: tone('#166534', '#16a34a', 0.1),
    warning: tone('#92400e', '#d97706', 0.12),
    neutral: tone('#566277', '#94a3b8', 0.12),
    danger: tone('#b91c1c', '#dc2626', 0.1),
    info: tone('#1d4ed8', '#2563eb', 0.1)
  }
}

export const cePalettes: Record<CeScheme, CePalette> = { dark, light }

/** Nothing is smaller than 13; text a user must act on is 15 or larger. */
export const ceType = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.4 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.2 },
  headline: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
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

export const ceRadii = { button: 14, card: 20, sheet: 28, input: 14, pill: 999 } as const

export const ceHit = { min: 44, primaryButton: 52 } as const
