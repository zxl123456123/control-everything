import type { ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { useCeTheme } from '../theme/theme'
import { ceRadii, ceSpace } from '../theme/tokens'

export function Card({
  children,
  style,
  padded = true
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  padded?: boolean
}) {
  const { c } = useCeTheme()
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: ceRadii.card,
          borderWidth: 1,
          borderColor: c.line,
          padding: padded ? ceSpace.lg : 0
        },
        style
      ]}
    >
      {children}
    </View>
  )
}
