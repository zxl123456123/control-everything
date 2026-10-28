import { type ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { staggerDelay } from './springs'
import { springs } from './springs'
import { useMotionEnabled } from './use-motion'

/** Entrance for the nth row of a list: rises and fades in, with a capped stagger. */
export function StaggerItem({
  index,
  children,
  style
}: {
  index: number
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const motion = useMotionEnabled()
  const entering = motion
    ? FadeInDown.delay(staggerDelay(index))
        .springify()
        .damping(springs.enter.damping)
        .stiffness(springs.enter.stiffness)
    : FadeIn.duration(120)
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  )
}
