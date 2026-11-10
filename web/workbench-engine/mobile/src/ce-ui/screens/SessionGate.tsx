import { useState } from 'react'
import { LogIn } from 'lucide-react-native'
import { Banner } from '../components/Banner'
import { Button } from '../components/Button'
import { CeSheet } from '../components/CeSheet'
import { CeText } from '../components/CeText'
import { copy } from '../copy'
import { useCeTheme } from '../theme/theme'

/**
 * Shown on any screen that needs a signed-in account when the session has expired: a banner with
 * one clear action, which opens a sheet explaining what re-login does. Never opens by itself.
 */
export function SessionExpiredGate({
  expired,
  onRelogin
}: {
  expired: boolean
  onRelogin: () => void
}) {
  const { c } = useCeTheme()
  const [open, setOpen] = useState(false)
  if (!expired) return null
  return (
    <>
      <Banner
        testID="ce-session-expired"
        tone="info"
        title={copy.expired.title}
        message={copy.expired.body}
        action={
          <Button
            label={copy.expired.action}
            variant="primary"
            icon={<LogIn size={18} color={c.onAccent} />}
            onPress={() => setOpen(true)}
          />
        }
      />
      <ReloginSheet
        visible={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false)
          onRelogin()
        }}
      />
    </>
  )
}

export function ReloginSheet({
  visible,
  onClose,
  onConfirm
}: {
  visible: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { c } = useCeTheme()
  return (
    <CeSheet
      visible={visible}
      onClose={onClose}
      title={copy.expired.sheetTitle}
      testID="ce-relogin-sheet"
    >
      <CeText variant="body" color="muted">
        {copy.expired.sheetBody}
      </CeText>
      <Button
        label={copy.expired.action}
        variant="primary"
        icon={<LogIn size={18} color={c.onAccent} />}
        onPress={onConfirm}
      />
      <Button label={copy.expired.later} variant="ghost" onPress={onClose} />
    </CeSheet>
  )
}
