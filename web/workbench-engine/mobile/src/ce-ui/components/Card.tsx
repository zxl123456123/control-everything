import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { ceRadii, ceSpace } from '../theme/tokens'
import { GlassSurface } from './Glass'

/** Glass card: translucent fill over the aurora, top highlight, gradient hairline, layered shadow. */
export function Card({
  children,
  style,
  padded = true
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  padded?: boolean
}) {
  return (
    <GlassSurface radius={ceRadii.card} style={[{ padding: padded ? ceSpace.lg : 0 }, style]}>
      {children}
    </GlassSurface>
  )
}
