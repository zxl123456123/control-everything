import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { PressableScale } from '../motion/PressableScale'
import { useCeTheme } from '../theme/theme'
import { ceHit, ceRadii, ceSpace, withAlpha } from '../theme/tokens'
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
  const { c, scheme } = useCeTheme()
  const inactive = disabled || loading
  const filled = variant === 'primary' || variant === 'danger'
  const palette = {
    primary: { bg: c.accent, fg: c.onAccent, border: 'transparent' },
    danger: { bg: c.danger, fg: c.onDanger, border: 'transparent' },
    secondary: { bg: c.field, fg: c.text, border: c.fieldEdge },
    ghost: { bg: 'transparent', fg: c.accentText, border: 'transparent' }
  }[variant]
  const gradient = variant === 'danger' ? [c.danger, '#be123c'] : [c.accent, c.accentB]
  const glow = variant === 'danger' ? withAlpha('#e11d48', 0.4) : c.glow
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
          borderWidth: filled ? 0 : 1,
          borderColor: palette.border,
          opacity: disabled && !loading ? 0.45 : 1,
          // Glow under filled buttons (iOS + web). Android keeps the flat gradient.
          ...(filled && !disabled
            ? {
                shadowColor: glow,
                shadowOpacity: 1,
                shadowRadius: scheme === 'dark' ? 22 : 18,
                shadowOffset: { width: 0, height: 8 }
              }
            : null),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: ceSpace.sm
        },
        style
      ]}
    >
      {filled ? <ButtonFill from={gradient[0]!} to={gradient[1]!} id={variant} /> : null}
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

/** Diagonal accent gradient plus a 1px top highlight, sized by percentages so it needs no layout pass. */
function ButtonFill({ from, to, id }: { from: string; to: string; id: string }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`ce-btn-${id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
          <LinearGradient id={`ce-btn-hi-${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.28} />
            <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" rx={ceRadii.button} fill={`url(#ce-btn-${id})`} />
        <Rect width="100%" height="100%" rx={ceRadii.button} fill={`url(#ce-btn-hi-${id})`} />
      </Svg>
    </View>
  )
}
