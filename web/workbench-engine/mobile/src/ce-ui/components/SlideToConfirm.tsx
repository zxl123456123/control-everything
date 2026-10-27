import { useState } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated'
import { ChevronsRight } from 'lucide-react-native'
import { triggerMediumImpact, triggerSelection } from '../../platform/haptics'
import { SLIDE_CONFIRM_THRESHOLD, slideProgress, springs } from '../motion/springs'
import { useCeTheme } from '../theme/theme'
import { ceHit, ceRadii, ceSpace } from '../theme/tokens'
import { CeText } from './CeText'

const THUMB = ceHit.primaryButton - 8

/**
 * Slide to confirm a destructive action. A long, deliberate gesture is the safeguard, and
 * `onConfirm` fires with the medium-impact haptic. Also exposes a plain accessible button action,
 * because a drag is not operable with a screen reader or switch control.
 */
export function SlideToConfirm({
  label,
  onConfirm,
  disabled,
  testID
}: {
  label: string
  onConfirm: () => void
  disabled?: boolean
  testID?: string
}) {
  const { c } = useCeTheme()
  const [width, setWidth] = useState(0)
  const x = useSharedValue(0)
  const travel = Math.max(0, width - THUMB - 8)

  const confirm = () => {
    triggerMediumImpact()
    onConfirm()
  }
  const pan = Gesture.Pan()
    .enabled(!disabled)
    .onBegin(() => {
      runOnJS(triggerSelection)()
    })
    .onUpdate((event) => {
      x.value = Math.min(travel, Math.max(0, event.translationX))
    })
    .onEnd(() => {
      if (slideProgress(x.value, travel + THUMB, THUMB) >= SLIDE_CONFIRM_THRESHOLD) {
        runOnJS(confirm)()
      }
      x.value = withSpring(0, springs.sheet)
    })

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  const fill = useAnimatedStyle(() => ({ width: x.value + THUMB + 4 }))
  const hint = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, Math.max(1, travel * 0.6)], [1, 0], 'clamp')
  }))

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="滑动或双击以确认"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => !disabled && confirm()}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        height: ceHit.primaryButton + 8,
        borderRadius: ceRadii.button + 4,
        backgroundColor: c.tones.danger.bg,
        borderWidth: 1,
        borderColor: c.tones.danger.dot,
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: disabled ? 0.5 : 1
      }}
    >
      <Animated.View
        style={[
          { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: c.tones.danger.bg },
          fill
        ]}
      />
      <Animated.View
        style={[{ alignItems: 'center', paddingLeft: THUMB, paddingHorizontal: ceSpace.lg }, hint]}
      >
        <CeText variant="callout" weight="600" style={{ color: c.tones.danger.fg }}>
          {label}
        </CeText>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 4,
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB,
              backgroundColor: c.danger,
              alignItems: 'center',
              justifyContent: 'center'
            },
            thumb
          ]}
        >
          <ChevronsRight size={22} color={c.onDanger} strokeWidth={2.6} />
        </Animated.View>
      </GestureDetector>
    </View>
  )
}
