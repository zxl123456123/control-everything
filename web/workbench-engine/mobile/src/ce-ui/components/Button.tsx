import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import { PressableScale } from '../motion/PressableScale'
import { useCeTheme } from '../theme/theme'
import { ceHit, ceRadii, ceSpace } from '../theme/tokens'
import { CeText } from './CeText'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

/**
 * Variant + size + state, the shape the Bluesky and react-native-reusables buttons settle on.
 * `primary` is the single main action of a screen and is 52 high; the rest are 44.
 */
export function Button({
  label,
  onPress,
  variant = 'secondary',
  icon,
  loading = false,
  disabled = false,
  haptic = true,
  style,
  testID,
  accessibilityHint
}: {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  icon?: ReactNode
  loading?: boolean
  disabled?: boolean
  haptic?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  accessibilityHint?: string
}) {
  const { c } = useCeTheme()
  const inactive = disabled || loading
  const palette = {
    primary: { bg: c.accent, fg: c.onAccent, border: c.accent },
    danger: { bg: c.danger, fg: c.onDanger, border: c.danger },
    secondary: { bg: c.soft, fg: c.text, border: c.line },
    ghost: { bg: 'transparent', fg: c.accentText, border: 'transparent' }
  }[variant]
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      haptic={haptic}
      onPress={onPress}
      style={[
        {
          minHeight:
            variant === 'primary' || variant === 'danger' ? ceHit.primaryButton : ceHit.min,
          borderRadius: ceRadii.button,
          paddingHorizontal: ceSpace.xl,
          backgroundColor: palette.bg,
          borderWidth: 1,
          borderColor: palette.border,
          opacity: disabled && !loading ? 0.45 : 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: ceSpace.sm
        },
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : icon ? (
        <View>{icon}</View>
      ) : null}
      <CeText variant="callout" weight="600" style={{ color: palette.fg, fontSize: 16 }}>
        {label}
      </CeText>
    </PressableScale>
  )
}
