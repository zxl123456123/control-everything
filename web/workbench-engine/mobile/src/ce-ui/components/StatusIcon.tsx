import {
  Ban,
  CircleHelp,
  Hourglass,
  Link2,
  Loader,
  LogIn,
  ShieldAlert,
  ShieldOff,
  UserCheck,
  Wifi,
  WifiOff
} from 'lucide-react-native'
import type { StatusIconKey } from '../status/device-status'

const icons = {
  hourglass: Hourglass,
  link: Link2,
  loader: Loader,
  wifi: Wifi,
  'wifi-off': WifiOff,
  'shield-off': ShieldOff,
  ban: Ban,
  help: CircleHelp,
  'user-check': UserCheck,
  'log-in': LogIn,
  'shield-alert': ShieldAlert
} as const satisfies Record<StatusIconKey, unknown>

export function StatusIcon({
  name,
  size = 16,
  color
}: {
  name: StatusIconKey
  size?: number
  color: string
}) {
  const Icon = icons[name]
  return <Icon size={size} color={color} strokeWidth={2.2} />
}
