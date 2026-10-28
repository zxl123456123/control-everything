import { useEffect } from 'react'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { Check } from 'lucide-react-native'
import { triggerSuccess } from '../../platform/haptics'
import { useCeTheme } from '../theme/theme'
import { durations, springs } from './springs'
import { useMotionEnabled } from './use-motion'

/** Green disc with a check that pops in; fires the success haptic once when it appears. */
export function SuccessCheck({ size = 72 }: { size?: number }) {
  const { c } = useCeTheme()
  const motion = useMotionEnabled()
  const disc = useSharedValue(motion ? 0 : 1)
  const mark = useSharedValue(motion ? 0 : 1)
  useEffect(() => {
    triggerSuccess()
    if (!motion) return
    disc.value = withSpring(1, springs.pop)
    mark.value = withDelay(120, withSpring(1, springs.pop))
  }, [disc, mark, motion])
  const discStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, disc.value * 2),
    transform: [{ scale: disc.value }]
  }))
  const markStyle = useAnimatedStyle(() => ({
    opacity: withTiming(mark.value > 0.05 ? 1 : 0, { duration: durations.fast }),
    transform: [{ scale: mark.value }]
  }))
  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel="成功"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: c.tones.success.dot,
          alignItems: 'center',
          justifyContent: 'center'
        },
        discStyle
      ]}
    >
      <Animated.View style={markStyle}>
        <Check size={size * 0.5} color="#ffffff" strokeWidth={3} />
      </Animated.View>
    </Animated.View>
  )
}
