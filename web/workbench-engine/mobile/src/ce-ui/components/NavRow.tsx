import type { ReactNode } from 'react'
import { View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { PressableScale } from '../motion/PressableScale'
import { useCeTheme } from '../theme/theme'
import { ceRadii, ceSpace } from '../theme/tokens'
import { CeText } from './CeText'

/** Tappable row: icon tile, title, one-line hint, chevron. 64 high, so well past the 44 target. */
export function NavRow({
  icon,
  title,
  hint,
  onPress,
  disabled,
  testID
}: {
  icon: ReactNode
  title: string
  hint?: string
  onPress: () => void
  disabled?: boolean
  testID?: string
}) {
  const { c } = useCeTheme()
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${title}，${hint}` : title}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: ceSpace.md,
        padding: ceSpace.md,
        borderRadius: ceRadii.card,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.line,
        opacity: disabled ? 0.5 : 1
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: ceRadii.button,
          backgroundColor: c.soft,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <CeText variant="headline">{title}</CeText>
        {hint ? (
          <CeText variant="callout" color="muted" style={{ fontWeight: '400' }} numberOfLines={1}>
            {hint}
          </CeText>
        ) : null}
      </View>
      <ChevronRight size={20} color={c.muted} />
    </PressableScale>
  )
}
