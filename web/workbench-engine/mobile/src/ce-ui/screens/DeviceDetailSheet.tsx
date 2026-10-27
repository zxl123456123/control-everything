import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { CeSheet } from '../components/CeSheet'
import { CeText } from '../components/CeText'
import { Banner } from '../components/Banner'
import { Button } from '../components/Button'
import { Expandable, Note } from '../components/Expandable'
import { SlideToConfirm } from '../components/SlideToConfirm'
import { StatusPill } from '../components/StatusPill'
import { copy, hubErrorCopy, toHubErrorKind } from '../copy'
import type { HubClient, HubDevice } from '../hub/hub-client'
import { canRevokeDevice, formatLastSeen, presentDeviceState } from '../status/device-status'
import { useCeTheme } from '../theme/theme'
import { ceSpace } from '../theme/tokens'

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: ceSpace.lg }}>
      <CeText variant="callout" color="muted" style={{ fontWeight: '400' }}>
        {label}
      </CeText>
      <CeText variant="callout" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </CeText>
    </View>
  )
}

function formatDate(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Screen 6. Facts about one computer plus revoke. Revoking is a slide (or the accessibility
 * action on it) with a heavy haptic, so it cannot be done by a stray tap.
 */
export function DeviceDetailSheet({
  device,
  now,
  client,
  onClose,
  onRevoked
}: {
  device: HubDevice | null
  now: number
  client: HubClient
  onClose: () => void
  onRevoked: (device: HubDevice) => void
}) {
  const { c } = useCeTheme()
  const [phase, setPhase] = useState<'idle' | 'revoking' | 'error'>('idle')
  const [errorBody, setErrorBody] = useState('')
  useEffect(() => {
    setPhase('idle')
    setErrorBody('')
  }, [device?.id])

  // Keep the last device while the sheet animates out.
  const [shown, setShown] = useState<HubDevice | null>(device)
  useEffect(() => {
    if (device) setShown(device)
  }, [device])
  const current = device ?? shown

  async function revoke() {
    if (!current || phase === 'revoking') return
    setPhase('revoking')
    try {
      await client.revokeDevice(current.id)
      onRevoked({ ...current, state: 'revoked' })
      setPhase('idle')
    } catch (error) {
      setErrorBody(hubErrorCopy[toHubErrorKind(error)].title)
      setPhase('error')
    }
  }

  const status = current ? presentDeviceState(current.state) : null
  return (
    <CeSheet
      visible={device !== null}
      onClose={onClose}
      title={current?.name ?? ''}
      testID="ce-device-sheet"
    >
      {current && status ? (
        <>
          <StatusPill presentation={status} testID="ce-device-sheet-status" />
          <View style={{ gap: ceSpace.md }}>
            <Fact label={copy.computers.system} value={copy.computers.os[current.os]} />
            <Fact label={copy.computers.lastSeen} value={formatLastSeen(current.lastSeenAt, now)} />
            <Fact label={copy.computers.boundAt} value={formatDate(current.boundAt)} />
            {current.appVersion ? (
              <Fact label={copy.computers.version} value={current.appVersion} />
            ) : null}
          </View>
          {phase === 'error' ? (
            <Banner tone="danger" title={copy.computers.revokeFailed} message={errorBody} />
          ) : null}
          {canRevokeDevice(current.state) ? (
            <Animated.View entering={FadeIn.duration(200)} style={{ gap: ceSpace.md }}>
              <SlideToConfirm
                testID="ce-revoke-slide"
                label={phase === 'revoking' ? copy.computers.revoking : copy.computers.revokeSlide}
                disabled={phase === 'revoking'}
                onConfirm={() => void revoke()}
              />
              <Expandable>
                <Note>{copy.computers.revokeBody}</Note>
              </Expandable>
            </Animated.View>
          ) : (
            <CeText variant="callout" style={{ color: c.tones.danger.fg }}>
              {copy.computers.revokeDone}
            </CeText>
          )}
          <Button label={copy.computers.close} onPress={onClose} />
        </>
      ) : null}
    </CeSheet>
  )
}
