import { useMemo, useReducer, type ReactNode } from 'react'
import { View } from 'react-native'
import { Banner } from '../../src/ce-ui/components/Banner'
import { ScreenFrame } from '../../src/ce-ui/components/ScreenFrame'
import { copy } from '../../src/ce-ui/copy'
import { createMockHubClient } from '../../src/ce-ui/hub/mock-hub-client'
import type { HubDevice, HubMe } from '../../src/ce-ui/hub/hub-client'
import type { DevicesState } from '../../src/ce-ui/hub/use-devices'
import {
  initialInviteState,
  inviteReducer,
  type InviteState
} from '../../src/ce-ui/invite/invite-code'
import { AccountView } from '../../src/ce-ui/screens/AccountView'
import { ComputersView } from '../../src/ce-ui/screens/ComputersScreen'
import { DeviceDetailSheet } from '../../src/ce-ui/screens/DeviceDetailSheet'
import { InviteView } from '../../src/ce-ui/screens/InviteScreen'
import { LoginView, type LoginStatus } from '../../src/ce-ui/screens/LoginView'
import { LogoutSheet } from '../../src/ce-ui/screens/LogoutSheet'
import { PairView } from '../../src/ce-ui/screens/PairScreen'
import { ReloginSheet, SessionExpiredGate } from '../../src/ce-ui/screens/SessionGate'
import { CeSchemeProvider, useCeTheme } from '../../src/ce-ui/theme/theme'
import type { CeScheme } from '../../src/ce-ui/theme/tokens'
import type { AccountSnapshot } from '../../src/platform-account/controller'

// Browser-only preview of the screens with fixed inputs. Everything here is mock data and none of
// it touches the real controller, hub or camera. Select with ?s=<scenario>&scheme=dark|light.

const noop = () => undefined
const NOW = Date.UTC(2026, 9, 27, 12, 0, 0)
const hub = createMockHubClient({ latencyMs: 0, now: () => NOW })
const me: HubMe = {
  subject: 'mock-subject',
  name: '演示用户',
  email: 'demo@example.invalid',
  membership: 'active',
  admin: false
}
const signedIn: AccountSnapshot = {
  status: 'signed-in',
  account: {
    issuer: 'https://id.example.invalid/realm',
    subject: 'mock-subject',
    displayName: '演示用户',
    expiresAt: NOW + 3_600_000,
    persistence: 'refresh'
  }
}
const portal = { ready: true, opening: false, error: '' }
const accountProps = {
  me,
  hubKind: 'mock' as const,
  portal,
  onOpenPortal: noop,
  onOpenComputers: noop,
  onOpenInvite: noop,
  onOpenPair: noop,
  onRelogin: noop,
  onRestore: noop,
  onLogout: noop
}
const login = (status: LoginStatus, message?: string) => (
  <ScreenFrame title="账号" onBack={noop}>
    <LoginView status={status} message={message} onLogin={noop} onRestore={noop} />
  </ScreenFrame>
)

function Invite({ steps }: { steps: Array<Parameters<typeof inviteReducer>[1]> }) {
  const [state] = useReducer((s: InviteState) => s, steps.reduce(inviteReducer, initialInviteState))
  return (
    <ScreenFrame title={copy.invite.title} subtitle={copy.invite.subtitle} onBack={noop}>
      <InviteView
        state={state}
        hubKind="mock"
        dispatch={noop}
        onPaste={noop}
        onSubmit={noop}
        onDone={noop}
      />
    </ScreenFrame>
  )
}

function Computers({
  state,
  sheetFor,
  kind = 'mock'
}: {
  state: DevicesState
  sheetFor?: string
  kind?: 'mock' | 'unavailable'
}) {
  const devices = state.phase === 'ready' ? state.devices : []
  const selected: HubDevice | null = devices.find((d) => d.id === sheetFor) ?? null
  return (
    <ScreenFrame title={copy.computers.title} subtitle={copy.computers.subtitle} onBack={noop}>
      <ComputersView
        state={state}
        hubKind={kind}
        now={NOW}
        portalReady
        onOpenPortal={noop}
        onSelect={noop}
        onPair={noop}
        onRetry={noop}
      />
      <DeviceDetailSheet device={selected} now={NOW} client={hub} onClose={noop} onRevoked={noop} />
    </ScreenFrame>
  )
}

function Pair({
  status,
  error = ''
}: {
  status: 'scanning' | 'connecting' | 'success' | 'error'
  error?: string
}) {
  const { c } = useCeTheme()
  const camera = (
    <View
      style={{
        height: 320,
        borderRadius: 20,
        backgroundColor: '#111',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <View
        style={{
          width: 200,
          height: 200,
          borderRadius: 20,
          borderWidth: 3,
          borderColor: 'rgba(255,255,255,0.85)'
        }}
      />
      <View style={{ position: 'absolute', bottom: 12 }}>
        <Banner tone="info" title="预览占位：此处是相机取景框" />
      </View>
    </View>
  )
  void c
  return (
    <ScreenFrame title={copy.pair.title} subtitle={copy.pair.subtitle} onBack={noop}>
      <PairView
        status={status}
        errorMessage={error}
        camera={camera}
        onPasteOpen={noop}
        onRetry={noop}
        onCancel={noop}
      />
    </ScreenFrame>
  )
}

const READY = (devices: HubDevice[]): DevicesState => ({
  phase: 'ready',
  devices,
  refreshing: false
})
let seeded: HubDevice[] = []
void hub.listDevices().then((d) => (seeded = d))

const scenarios: Record<string, () => ReactNode> = {
  '1-login-unconfigured': () => login('unconfigured'),
  '1-login-invalid-config': () => login('invalid-config'),
  '1-login-signed-out': () => login('signed-out'),
  '1-login-signing-in': () => login('authorizing'),
  '1-login-error': () => login('login-error', '授权被取消或失败，请重试。'),
  '2-invite-empty': () => <Invite steps={[]} />,
  '2-invite-filled': () => <Invite steps={[{ type: 'edit', text: 'DEMOk3Tq9xLw2PzYv8NbR4' }]} />,
  '2-invite-error': () => (
    <Invite
      steps={[
        { type: 'edit', text: 'OLD0k3Tq9xLw2PzYv8NbR4' },
        { type: 'submit' },
        { type: 'failed', error: 'expired' }
      ]}
    />
  ),
  '2-invite-success': () => (
    <Invite
      steps={[
        { type: 'edit', text: 'DEMOk3Tq9xLw2PzYv8NbR4' },
        { type: 'submit' },
        { type: 'succeeded' }
      ]}
    />
  ),
  '3-account': () => (
    <ScreenFrame title={copy.account.title} onBack={noop}>
      <AccountView snapshot={signedIn} {...accountProps} />
    </ScreenFrame>
  ),
  '4-computers-loading': () => <Computers state={{ phase: 'loading' }} />,
  '4-computers-list': () => <Computers state={READY(seeded)} />,
  '4-computers-empty': () => <Computers state={READY([])} />,
  '4-computers-unavailable': () => (
    <Computers state={{ phase: 'error', error: 'unavailable' }} kind="unavailable" />
  ),
  '5-pair-scan': () => <Pair status="scanning" />,
  '5-pair-connecting': () => <Pair status="connecting" />,
  '5-pair-error': () => <Pair status="error" error={copy.pair.timeout} />,
  '6-device-sheet': () => <Computers state={READY(seeded)} sheetFor="mock-dev-studio" />,
  '6-device-sheet-old': () => <Computers state={READY(seeded)} sheetFor="mock-dev-old" />,
  '7-session-expired': () => (
    <ScreenFrame title={copy.account.title} onBack={noop}>
      <AccountView snapshot={{ ...signedIn, status: 'expired' }} {...accountProps} />
    </ScreenFrame>
  ),
  '7-relogin-sheet': () => (
    <ScreenFrame title={copy.account.title} onBack={noop}>
      <SessionExpiredGate expired onRelogin={noop} />
      <ReloginSheet visible onClose={noop} onConfirm={noop} />
    </ScreenFrame>
  ),
  '8-logout-sheet': () => (
    <ScreenFrame title={copy.account.title} onBack={noop}>
      <AccountView snapshot={signedIn} {...accountProps} />
      <LogoutSheet visible onClose={noop} onConfirm={noop} />
    </ScreenFrame>
  )
}

export function PreviewApp() {
  const params = new URLSearchParams(window.location.search)
  const scheme: CeScheme = params.get('scheme') === 'light' ? 'light' : 'dark'
  const name = params.get('s') ?? ''
  const render = scenarios[name]
  const list = useMemo(() => Object.keys(scenarios), [])
  return (
    <CeSchemeProvider scheme={scheme}>
      <div
        style={{
          width: 390,
          height: 844,
          margin: '0 auto',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex'
        }}
        id="phone"
      >
        {render ? render() : <pre>{list.join('\n')}</pre>}
      </div>
    </CeSchemeProvider>
  )
}

export const scenarioNames = Object.keys(scenarios)
