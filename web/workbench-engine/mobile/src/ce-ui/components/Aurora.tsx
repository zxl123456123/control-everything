import { useEffect } from 'react'
import { View, useWindowDimensions } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'
import { useMotionEnabled } from '../motion/use-motion'
import { useCeTheme } from '../theme/theme'
import { splitRgba } from '../theme/tokens'

/** Blob layout as fractions of the window: [left, top, diameter, drift px, period ms]. */
const blobs = [
  [-0.28, -0.12, 1.25, 26, 14000],
  [0.3, 0.2, 1.0, -30, 17000],
  [-0.35, 0.62, 1.15, 34, 19000],
  [0.38, 0.78, 0.95, -24, 16000]
] as const

function Blob({
  color,
  index,
  width,
  height,
  motion
}: {
  color: string
  index: number
  width: number
  height: number
  motion: boolean
}) {
  const [left, top, size, drift, period] = blobs[index]!
  const diameter = size * width
  const phase = useSharedValue(0)
  useEffect(() => {
    cancelAnimation(phase)
    if (!motion) {
      phase.value = 0
      return
    }
    phase.value = withRepeat(
      withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    )
    return () => cancelAnimation(phase)
  }, [motion, period, phase])
  // transform only: cheap on the UI thread, and it never forces the cards above to re-composite.
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: phase.value * drift },
      { translateY: phase.value * drift * -0.7 },
      { scale: 1 + phase.value * 0.06 }
    ]
  }))
  const stop = splitRgba(color)
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: left * width,
          top: top * height,
          width: diameter,
          height: diameter
        },
        style
      ]}
    >
      <Svg width={diameter} height={diameter}>
        <Defs>
          <RadialGradient id={`ce-aurora-${index}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={stop.color} stopOpacity={stop.opacity} />
            <Stop offset="0.55" stopColor={stop.color} stopOpacity={stop.opacity * 0.35} />
            <Stop offset="1" stopColor={stop.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={diameter / 2}
          fill={`url(#ce-aurora-${index})`}
        />
      </Svg>
    </Animated.View>
  )
}

/**
 * Ambient backdrop behind every account screen: four soft colour blobs drifting slowly over the
 * page colour. SVG radial gradients (no blur filter, no native module). Under reduced motion the
 * blobs stay put. Decorative only.
 */
export function Aurora() {
  const { c } = useCeTheme()
  const { width, height } = useWindowDimensions()
  const motion = useMotionEnabled()
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
    >
      {c.aurora.map((color, index) => (
        <Blob
          key={index}
          color={color}
          index={index}
          width={width}
          height={height}
          motion={motion}
        />
      ))}
    </View>
  )
}
