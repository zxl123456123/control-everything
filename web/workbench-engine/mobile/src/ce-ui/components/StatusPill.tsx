import { View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { PulseDot } from '../motion/PulseDot'
import { useMotionEnabled } from '../motion/use-motion'
import type { StatusPresentation } from '../status/device-status'
import { useCeTheme } from '../theme/theme'
import { ceRadii, ceSpace } from '../theme/tokens'
import { CeText } from './CeText'
import { StatusIcon } from './StatusIcon'

/**
 * Status is always colour + icon + text (never colour alone). When the state changes the pill
 * cross-fades and re-flows rather than snapping.
 */
export function StatusPill({
  presentation,
  testID
}: {
  presentation: StatusPresentation
  testID?: string
}) {
  const { c } = useCeTheme()
  const motion = useMotionEnabled()
  const tone = c.tones[presentation.tone]
  return (
    <Animated.View
      key={presentation.label}
      testID={testID}
      accessible
      accessibilityLabel={`状态：${presentation.label}`}
      entering={motion ? FadeIn.duration(220) : undefined}
      exiting={motion ? FadeOut.duration(120) : undefined}
      layout={motion ? LinearTransition.duration(200) : undefined}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: ceSpace.sm,
        minHeight: 28,
        paddingHorizontal: ceSpace.md,
        paddingVertical: ceSpace.xs,
        borderRadius: ceRadii.pill,
        backgroundColor: tone.bg
      }}
    >
      <PulseDot color={tone.dot} speed={presentation.pulse} size={8} />
      <View>
        <StatusIcon name={presentation.icon} size={14} color={tone.fg} />
      </View>
      <CeText variant="caption" weight="600" style={{ color: tone.fg }}>
        {presentation.label}
      </CeText>
    </Animated.View>
  )
}
