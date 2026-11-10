import { useEffect, useState } from 'react'
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
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
  const { c, scheme } = useCeTheme()
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
  const [w, setW] = useState(0)
  const animated = useAnimatedStyle(() => ({ opacity: 0.7 + phase.value * 0.3 }))
  // The highlight band sweeps across once per period (transform only).
  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: -w * 0.6 + phase.value * w * 1.6 }]
  }))
  return (
    <Animated.View
      accessible={false}
      onLayout={(event) => setW(event.nativeEvent.layout.width)}
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: c.field,
          borderWidth: 1,
          borderColor: c.fieldEdge,
          overflow: 'hidden'
        },
        style,
        animated
      ]}
    >
      {motion && w > 0 ? (
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: w * 0.6 }, sweep]}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="ce-shimmer" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#ffffff" stopOpacity={0} />
                <Stop
                  offset="0.5"
                  stopColor="#ffffff"
                  stopOpacity={scheme === 'dark' ? 0.1 : 0.55}
                />
                <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#ce-shimmer)" />
          </Svg>
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}
