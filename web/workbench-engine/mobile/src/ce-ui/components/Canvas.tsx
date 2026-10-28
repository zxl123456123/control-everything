import { View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useCeTheme } from '../theme/theme'
import { splitRgba } from '../theme/tokens'

/**
 * Backdrop behind every account screen: the flat page colour plus one static, very faint radial tint
 * at the top edge, so the lightly translucent cards have something to pick up. Nothing animates.
 * Decorative only.
 */
export function Canvas() {
  const { c } = useCeTheme()
  const stop = splitRgba(c.tint)
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
    >
      <Svg width="100%" height="45%">
        <Defs>
          <RadialGradient id="ce-canvas-tint" cx="50%" cy="0%" rx="75%" ry="100%">
            <Stop offset="0" stopColor={stop.color} stopOpacity={stop.opacity} />
            <Stop offset="1" stopColor={stop.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#ce-canvas-tint)" />
      </Svg>
    </View>
  )
}
