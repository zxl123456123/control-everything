import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import type { PulseSpeed } from '../status/device-status'
import { pulse } from './springs'
import { useMotionEnabled } from './use-motion'

/**
 * Status dot. Online breathes slowly, in-progress states pulse fast, settled states stay still.
 * The dot is decoration: the pill beside it always carries the status as text and an icon.
 */
export function PulseDot({
  color,
  speed,
  size = 10
}: {
  color: string
  speed: PulseSpeed
  size?: number
}) {
  const motion = useMotionEnabled()
  const active = motion && speed !== 'none'
  const phase = useSharedValue(0)
  useEffect(() => {
    cancelAnimation(phase)
    phase.value = 0
    if (!active) return
    const period = pulse[speed === 'fast' ? 'fast' : 'slow'].period
    phase.value = withRepeat(
      withTiming(1, { duration: period, easing: Easing.out(Easing.quad) }),
      -1,
      false
    )
    return () => cancelAnimation(phase)
  }, [active, speed, phase])
  const config = pulse[speed === 'fast' ? 'fast' : 'slow']
  const ring = useAnimatedStyle(() => ({
    opacity: active ? (1 - phase.value) * config.minOpacity : 0,
    transform: [{ scale: 1 + phase.value * (config.ringScale - 1) }]
  }))
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: color
          },
          ring
        ]}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: color,
          // Glow dot: a soft halo of its own colour (iOS + web).
          shadowColor: color,
          shadowOpacity: 0.9,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 }
        }}
      />
    </View>
  )
}
