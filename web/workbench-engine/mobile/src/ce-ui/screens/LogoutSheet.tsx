import { LogOut } from 'lucide-react-native'
import { Button } from '../components/Button'
import { CeSheet } from '../components/CeSheet'
import { CeText } from '../components/CeText'
import { Expandable, Note } from '../components/Expandable'
import { copy } from '../copy'
import { triggerMediumImpact } from '../../platform/haptics'
import { useCeTheme } from '../theme/theme'

/** Confirms the local logout. What it does and does not touch is one tap away under 了解更多. */
export function LogoutSheet({
  visible,
  busy,
  onClose,
  onConfirm
}: {
  visible: boolean
  busy?: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { c } = useCeTheme()
  return (
    <CeSheet
      visible={visible}
      onClose={onClose}
      title={copy.logout.sheetTitle}
      testID="ce-logout-sheet"
    >
      <CeText variant="body" color="muted">
        {copy.logout.body}
      </CeText>
      <Expandable testID="ce-logout-more">
        {copy.logout.learnMore.map((line) => (
          <Note key={line}>{line}</Note>
        ))}
      </Expandable>
      <Button
        label={copy.logout.confirm}
        variant="danger"
        loading={busy}
        icon={<LogOut size={18} color={c.onDanger} />}
        haptic={false}
        onPress={() => {
          triggerMediumImpact()
          onConfirm()
        }}
      />
      <Button label={copy.logout.cancel} variant="secondary" onPress={onClose} />
    </CeSheet>
  )
}
