import { View } from 'react-native'
import { useCeTheme } from '../theme/theme'
import { avatarHue, avatarInitials } from './avatar-seed'
import { CeText } from './CeText'

export function Avatar({
  name,
  seed,
  size = 64
}: {
  name: string | null
  seed: string
  size?: number
}) {
  const { scheme } = useCeTheme()
  const hue = avatarHue(seed)
  const bg = scheme === 'dark' ? `hsl(${hue}, 45%, 28%)` : `hsl(${hue}, 70%, 90%)`
  const fg = scheme === 'dark' ? `hsl(${hue}, 80%, 88%)` : `hsl(${hue}, 60%, 26%)`
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <CeText variant="title" style={{ color: fg, fontSize: size * 0.4, lineHeight: size * 0.5 }}>
        {avatarInitials(name)}
      </CeText>
    </View>
  )
}
