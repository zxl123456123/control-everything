import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { Globe, MonitorOff, Plus, WifiOff } from 'lucide-react-native'
import {
  platformAccountController,
  usePlatformAccount,
  type AccountSnapshot
} from '../../platform-account/controller'
import { Button } from '../components/Button'
import { ComputerCard, ComputerCardSkeleton } from '../components/ComputerCard'
import { CeText } from '../components/CeText'
import { EmptyState } from '../components/EmptyState'
import { MockBadge } from '../components/MockBadge'
import { ScreenFrame } from '../components/ScreenFrame'
import { copy, hubErrorCopy } from '../copy'
import { useHubClient } from '../hub/hub-context'
import type { HubClient, HubDevice } from '../hub/hub-client'
import { useDevices, type DevicesState } from '../hub/use-devices'
import { Skeleton } from '../motion/Skeleton'
import { StaggerItem } from '../motion/Stagger'
import { useCeTheme } from '../theme/theme'
import { ceSpace } from '../theme/tokens'
import { usePortalOpener } from '../use-portal'
import { DeviceDetailSheet } from './DeviceDetailSheet'
import { SessionExpiredGate } from './SessionGate'

/** Screen 4, as a pure view so previews and tests can drive every state. */
export function ComputersView({
  state,
  hubKind,
  now,
  portalReady,
  onOpenPortal,
  onSelect,
  onPair,
  onRetry
}: {
  state: DevicesState
  hubKind: HubClient['kind']
  now: number
  portalReady: boolean
  onOpenPortal: () => void
  onSelect: (device: HubDevice) => void
  onPair: () => void
  onRetry: () => void
}) {
  const { c } = useCeTheme()
  if (state.phase === 'loading') {
    return (
      <View style={{ gap: ceSpace.md }} testID="ce-computers-loading" accessibilityLabel="正在加载">
        {[0, 1, 2].map((i) => (
          <ComputerCardSkeleton key={i}>
            <View style={{ flexDirection: 'row', gap: ceSpace.md, alignItems: 'center' }}>
              <Skeleton width={44} height={44} radius={14} />
              <View style={{ flex: 1, gap: ceSpace.sm }}>
                <Skeleton width="60%" height={18} />
                <Skeleton width="30%" height={14} />
              </View>
            </View>
            <Skeleton width={110} height={28} radius={14} />
          </ComputerCardSkeleton>
        ))}
      </View>
    )
  }
  if (state.phase === 'error') {
    const unavailable = state.error === 'unavailable'
    const text = hubErrorCopy[state.error]
    return (
      <EmptyState
        testID="ce-computers-error"
        icon={
          unavailable ? (
            <MonitorOff size={40} color={c.muted} strokeWidth={1.6} />
          ) : (
            <WifiOff size={40} color={c.muted} strokeWidth={1.6} />
          )
        }
        title={unavailable ? copy.computers.unavailableTitle : copy.computers.errorTitle}
        body={unavailable ? copy.computers.unavailableBody : text.body}
        action={
          unavailable ? (
            portalReady ? (
              <Button
                variant="primary"
                label={copy.account.portal}
                icon={<Globe size={18} color={c.onAccent} />}
                onPress={onOpenPortal}
              />
            ) : undefined
          ) : (
            <Button variant="primary" label={copy.computers.retry} onPress={onRetry} />
          )
        }
      />
    )
  }
  if (state.devices.length === 0) {
    return (
      <EmptyState
        testID="ce-computers-empty"
        icon={<MonitorOff size={40} color={c.muted} strokeWidth={1.6} />}
        title={copy.computers.emptyTitle}
        body={copy.computers.emptyBody}
        action={
          <Button
            variant="primary"
            label={copy.computers.pairCta}
            icon={<Plus size={18} color={c.onAccent} />}
            onPress={onPair}
          />
        }
      />
    )
  }
  return (
    <View style={{ gap: ceSpace.md }} testID="ce-computers-list">
      {hubKind === 'mock' ? (
        <CeText variant="callout" color="muted" style={{ fontWeight: '400' }}>
          {copy.mock.note}
        </CeText>
      ) : null}
      {state.devices.map((device, index) => (
        <StaggerItem key={device.id} index={index}>
          <ComputerCard device={device} now={now} onPress={() => onSelect(device)} />
        </StaggerItem>
      ))}
    </View>
  )
}

export function ComputersScreen() {
  const snapshot = usePlatformAccount()
  return (
    <AccountComputers
      key={JSON.stringify([
        snapshot.account?.issuer ?? snapshot.issuer,
        snapshot.account?.subject,
        snapshot.status
      ])}
      snapshot={snapshot}
    />
  )
}

function AccountComputers({ snapshot }: { snapshot: AccountSnapshot }) {
  const router = useRouter()
  const client = useHubClient()
  const portal = usePortalOpener()
  const { state, refresh, reload, replaceDevice } = useDevices(client)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const now = useMemo(() => Date.now(), [state])
  const selected =
    state.phase === 'ready' ? (state.devices.find((d) => d.id === selectedId) ?? null) : null
  return (
    <ScreenFrame
      title={copy.computers.title}
      subtitle={copy.computers.subtitle}
      onBack={() => router.back()}
      trailing={<MockBadge kind={client.kind} />}
      refreshing={state.phase === 'ready' && state.refreshing}
      onRefresh={state.phase === 'error' && state.error === 'unavailable' ? undefined : refresh}
    >
      <SessionExpiredGate
        expired={snapshot.status === 'expired'}
        onRelogin={() => void platformAccountController.login()}
      />
      <ComputersView
        state={state}
        hubKind={client.kind}
        now={now}
        portalReady={portal.portal.status === 'ready'}
        onOpenPortal={() => void portal.open()}
        onSelect={(device) => setSelectedId(device.id)}
        onPair={() => router.push('/ce-pair')}
        onRetry={() => void reload()}
      />
      <DeviceDetailSheet
        device={selected}
        now={now}
        client={client}
        onClose={() => setSelectedId(null)}
        onRevoked={(device) => replaceDevice(device)}
      />
    </ScreenFrame>
  )
}
