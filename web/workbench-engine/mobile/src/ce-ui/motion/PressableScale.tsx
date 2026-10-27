import { type ReactNode } from 'react'
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { triggerSelection } from '../../platform/haptics'
import { PRESSED_SCALE, durations, springs } from './springs'
import { useMotionEnabled } from './use-motion'

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** Selection haptic on press-in. On by default; turn off for purely decorative taps. */
  haptic?: boolean
  pressedScale?: number
}

/** Pressable that squeezes on touch. Under reduced motion it dims instead of scaling. */
export function PressableScale({
  children,
  style,
  haptic = true,
  pressedScale = PRESSED_SCALE,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: Props) {
  const motion = useMotionEnabled()
  const progress = useSharedValue(0)
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: motion ? 1 - progress.value * (1 - pressedScale) : 1 }],
    opacity: motion ? 1 : 1 - progress.value * 0.3
  }))
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(event) => {
        if (haptic && !disabled) triggerSelection()
        progress.value = motion
          ? withSpring(1, springs.press)
          : withTiming(1, { duration: durations.fast })
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        progress.value = motion
          ? withSpring(0, springs.press)
          : withTiming(0, { duration: durations.fast })
        onPressOut?.(event)
      }}
    >
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  )
}
