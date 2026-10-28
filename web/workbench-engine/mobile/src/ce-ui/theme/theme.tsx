import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { cePalettes, type CePalette, type CeScheme } from './tokens'

type CeTheme = { scheme: CeScheme; c: CePalette }

const ForcedSchemeContext = createContext<CeScheme | null>(null)

/** Pins a scheme below it; the preview harness and tests use it, the app follows the OS. */
export function CeSchemeProvider({ scheme, children }: { scheme: CeScheme; children: ReactNode }) {
  return <ForcedSchemeContext.Provider value={scheme}>{children}</ForcedSchemeContext.Provider>
}

export function useCeTheme(): CeTheme {
  const forced = useContext(ForcedSchemeContext)
  const system = useColorScheme()
  const scheme: CeScheme = forced ?? (system === 'light' ? 'light' : 'dark')
  return useMemo(() => ({ scheme, c: cePalettes[scheme] }), [scheme])
}
