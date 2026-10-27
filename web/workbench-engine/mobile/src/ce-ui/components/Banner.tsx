import type { ReactNode } from 'react'
import { View } from 'react-native'
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated'
import { Info, ShieldAlert, TriangleAlert } from 'lucide-react-native'
import { useMotionEnabled } from '../motion/use-motion'
import { useCeTheme } from '../theme/theme'
import { ceRadii, ceSpace, type CeTone } from '../theme/tokens'
import { CeText } from './CeText'

const bannerIcons = { info: Info, warning: TriangleAlert, danger: ShieldAlert } as const

/** Inline notice: tone colour + icon + a title the user can act on. `action` is any node (a Button). */
export function Banner({
  tone,
  title,
  message,
  action,
  testID
}: {
  tone: Extract<CeTone, 'info' | 'warning' | 'danger'>
  title: string
  message?: string
  action?: ReactNode
  testID?: string
}) {
  const { c } = useCeTheme()
  const motion = useMotionEnabled()
  const t = c.tones[tone]
  const Icon = bannerIcons[tone]
  return (
    <Animated.View
      testID={testID}
      accessibilityRole="alert"
      entering={motion ? FadeInDown.duration(220) : undefined}
      exiting={motion ? FadeOut.duration(120) : undefined}
      style={{
        borderRadius: ceRadii.card,
        padding: ceSpace.lg,
        gap: ceSpace.md,
        backgroundColor: t.bg,
        borderWidth: 1,
        borderColor: t.dot
      }}
    >
      <View style={{ flexDirection: 'row', gap: ceSpace.md, alignItems: 'flex-start' }}>
        <View style={{ paddingTop: 2 }}>
          <Icon size={20} color={t.fg} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: ceSpace.xs }}>
          <CeText variant="callout" weight="700" style={{ color: t.fg }}>
            {title}
          </CeText>
          {message ? (
            <CeText variant="callout" color="muted" style={{ fontWeight: '400' }}>
              {message}
            </CeText>
          ) : null}
        </View>
      </View>
      {action}
    </Animated.View>
  )
}
