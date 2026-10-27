import { useEffect } from 'react'
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import { useCeTheme } from '../theme/theme'
import { SKELETON_PERIOD_MS } from './springs'
import { useMotionEnabled } from './use-motion'

/** Placeholder block that breathes (opacity only, so it is cheap and reduced-motion friendly). */
export function Skeleton({
  width = '100%',
  height,
  radius = 10,
  style
}: {
  width?: DimensionValue
  height: number
  radius?: number
  style?: StyleProp<ViewStyle>
}) {
  const { c } = useCeTheme()
  const motion = useMotionEnabled()
  const phase = useSharedValue(0)
  useEffect(() => {
    cancelAnimation(phase)
    if (!motion) {
      phase.value = 0
      return
    }
    phase.value = withRepeat(
      withTiming(1, { duration: SKELETON_PERIOD_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    )
    return () => cancelAnimation(phase)
  }, [motion, phase])
  const animated = useAnimatedStyle(() => ({ opacity: 0.55 + phase.value * 0.45 }))
  return (
    <Animated.View
      accessible={false}
      style={[{ width, height, borderRadius: radius, backgroundColor: c.soft }, style, animated]}
    />
  )
}
