import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Laptop, Monitor, Server } from 'lucide-react-native'
import { PressableScale } from '../motion/PressableScale'
import type { HubDevice, HubOs } from '../hub/hub-client'
import { formatLastSeen, presentDeviceState } from '../status/device-status'
import { useCeTheme } from '../theme/theme'
import { ceRadii, ceSpace } from '../theme/tokens'
import { copy } from '../copy'
import { CeText } from './CeText'
import { StatusPill } from './StatusPill'

const osIcon = {
  windows: Monitor,
  macos: Laptop,
  linux: Server,
  unknown: Monitor
} as const satisfies Record<HubOs, unknown>

/** One computer: name, OS, status pill (colour + icon + text, dot pulses for live states), last seen. */
export function ComputerCard({
  device,
  now,
  onPress
}: {
  device: HubDevice
  now: number
  onPress: () => void
}) {
  const { c } = useCeTheme()
  const status = presentDeviceState(device.state)
  const Icon = osIcon[device.os]
  const dim = status.tone === 'danger' && device.state === 'revoked'
  return (
    <PressableScale
      testID={`ce-device-${device.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${device.name}，${status.label}，${formatLastSeen(device.lastSeenAt, now)}`}
      onPress={onPress}
      style={{
        minHeight: 96,
        padding: ceSpace.lg,
        gap: ceSpace.md,
        borderRadius: ceRadii.card,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.line,
        opacity: dim ? 0.7 : 1
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: ceSpace.md }}>
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
          <Icon size={22} color={c.text} />
        </View>
        <View style={{ flex: 1 }}>
          <CeText variant="headline" numberOfLines={1}>
            {device.name}
          </CeText>
          <CeText variant="callout" color="muted" style={{ fontWeight: '400' }}>
            {copy.computers.os[device.os]}
          </CeText>
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: ceSpace.sm
        }}
      >
        <StatusPill presentation={status} />
        <CeText variant="caption" color="muted">
          {device.lastSeenAt === null
            ? '尚未连接'
            : `${copy.computers.lastSeen} ${formatLastSeen(device.lastSeenAt, now)}`}
        </CeText>
      </View>
    </PressableScale>
  )
}

export function ComputerCardSkeleton({ children }: { children: ReactNode }) {
  const { c } = useCeTheme()
  return (
    <View
      accessible={false}
      style={{
        minHeight: 96,
        padding: ceSpace.lg,
        gap: ceSpace.md,
        borderRadius: ceRadii.card,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.line
      }}
    >
      {children}
    </View>
  )
}
