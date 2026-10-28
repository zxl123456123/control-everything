import { Text, type TextProps } from 'react-native'
import { ceType, type CeTypeKey } from '../theme/tokens'
import { useCeTheme } from '../theme/theme'

type Color = 'text' | 'muted' | 'accent' | 'danger' | 'onAccent'

/** Themed text. Every size comes from the type scale, so nothing renders under 13. */
export function CeText({
  variant = 'body',
  color = 'text',
  weight,
  style,
  ...rest
}: TextProps & { variant?: CeTypeKey; color?: Color; weight?: '500' | '600' | '700' }) {
  const { c } = useCeTheme()
  const resolved =
    color === 'accent'
      ? c.accentText
      : color === 'danger'
        ? c.tones.danger.fg
        : color === 'onAccent'
          ? c.onAccent
          : c[color]
  return (
    <Text
      {...rest}
      style={[ceType[variant], { color: resolved }, weight ? { fontWeight: weight } : null, style]}
    />
  )
}
