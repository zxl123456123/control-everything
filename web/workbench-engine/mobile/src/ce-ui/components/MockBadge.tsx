import { View } from 'react-native'
import { FlaskConical } from 'lucide-react-native'
import type { HubClient } from '../hub/hub-client'
import { useCeTheme } from '../theme/theme'
import { ceRadii, ceSpace } from '../theme/tokens'
import { CeText } from './CeText'

/** Always visible whenever the data on screen is invented. Renders nothing for a live client. */
export function MockBadge({
  kind,
  align = 'flex-start'
}: {
  kind: HubClient['kind']
  align?: 'flex-start' | 'center'
}) {
  const { c } = useCeTheme()
  if (kind !== 'mock') return null
  const t = c.tones.warning
  return (
    <View
      accessible
      accessibilityLabel="演示数据，非真实账号与电脑"
      testID="ce-mock-badge"
      style={{
        alignSelf: align,
        flexDirection: 'row',
        alignItems: 'center',
        gap: ceSpace.xs,
        minHeight: 28,
        paddingHorizontal: ceSpace.md,
        borderRadius: ceRadii.pill,
        backgroundColor: t.bg,
        borderWidth: 1,
        borderColor: t.dot
      }}
    >
      <FlaskConical size={14} color={t.fg} strokeWidth={2.2} />
      <CeText variant="caption" weight="700" style={{ color: t.fg }}>
        演示数据
      </CeText>
    </View>
  )
}
