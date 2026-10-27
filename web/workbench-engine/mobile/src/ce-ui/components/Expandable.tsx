import { useState, type ReactNode } from 'react'
import { View } from 'react-native'
import Animated, {
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { ChevronDown } from 'lucide-react-native'
import { PressableScale } from '../motion/PressableScale'
import { springs } from '../motion/springs'
import { useMotionEnabled } from '../motion/use-motion'
import { useCeTheme } from '../theme/theme'
import { ceHit, ceSpace } from '../theme/tokens'
import { CeText } from './CeText'

/**
 * "了解更多": long explanatory copy lives here, collapsed by default, so the main screen stays
 * short. The trigger is a full-width 44pt row.
 */
export function Expandable({
  label = '了解更多',
  children,
  testID
}: {
  label?: string
  children: ReactNode
  testID?: string
}) {
  const { c } = useCeTheme()
  const motion = useMotionEnabled()
  const [open, setOpen] = useState(false)
  const turn = useSharedValue(0)
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }))
  const toggle = () => {
    const next = !open
    setOpen(next)
    turn.value = motion
      ? withSpring(next ? 1 : 0, springs.press)
      : withTiming(next ? 1 : 0, { duration: 0 })
  }
  return (
    <Animated.View layout={motion ? LinearTransition.duration(200) : undefined}>
      <PressableScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={open ? `收起${label}` : label}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={{
          minHeight: ceHit.min,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: ceSpace.xs
        }}
      >
        <CeText variant="callout" color="accent" weight="600">
          {open ? '收起' : label}
        </CeText>
        <Animated.View style={chevron}>
          <ChevronDown size={18} color={c.accentText} />
        </Animated.View>
      </PressableScale>
      {open ? (
        <Animated.View
          entering={motion ? FadeIn.duration(200) : undefined}
          style={{ gap: ceSpace.sm, paddingBottom: ceSpace.sm }}
        >
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

/** One line inside an Expandable; keeps the 15pt floor for text people may need to act on. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <View>
      <CeText variant="callout" color="muted" style={{ fontWeight: '400' }}>
        {children}
      </CeText>
    </View>
  )
}
