import { useReducedMotionEnabled } from '../../platform/use-reduced-motion'

/** True unless the OS asks for reduced motion. Until the setting is read we assume motion is fine. */
export function useMotionEnabled(): boolean {
  return useReducedMotionEnabled() !== true
}
