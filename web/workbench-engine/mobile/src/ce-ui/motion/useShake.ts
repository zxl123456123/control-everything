import { useCallback } from 'react'
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { triggerError } from '../../platform/haptics'
import { shake } from './springs'
import { useMotionEnabled } from './use-motion'

/**
 * Horizontal shake for a rejected input, with the error haptic. Under reduced motion the haptic
 * still fires but the element does not move (callers show the error text and colour regardless).
 */
export function useShake() {
  const motion = useMotionEnabled()
  const x = useSharedValue(0)
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  const run = useCallback(() => {
    triggerError()
    if (!motion) return
    const steps = []
    for (let i = 0; i < shake.cycles; i += 1) {
      const sign = i % 2 === 0 ? 1 : -1
      steps.push(withTiming(sign * shake.distance, { duration: shake.step }))
    }
    steps.push(withSpring(0, { damping: 12, stiffness: 400 }))
    x.value = withSequence(...steps)
  }, [motion, x])
  return { style, shake: run }
}
