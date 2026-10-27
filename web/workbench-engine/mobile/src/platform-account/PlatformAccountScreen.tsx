import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { Globe } from 'lucide-react-native'
import { Banner } from '../ce-ui/components/Banner'
import { Button } from '../ce-ui/components/Button'
import { NavRow } from '../ce-ui/components/NavRow'
import { ScreenFrame } from '../ce-ui/components/ScreenFrame'
import { copy } from '../ce-ui/copy'
import type { HubMe } from '../ce-ui/hub/hub-client'
import { useHubClient } from '../ce-ui/hub/hub-context'
import { AccountView } from '../ce-ui/screens/AccountView'
import { LoginView, type LoginStatus } from '../ce-ui/screens/LoginView'
import { LogoutSheet } from '../ce-ui/screens/LogoutSheet'
import { useCeTheme } from '../ce-ui/theme/theme'
import { ceSpace } from '../ce-ui/theme/tokens'
import { usePortalOpener } from '../ce-ui/use-portal'
import { platformAccountController, usePlatformAccount } from './controller'

const signedInStatuses = ['signed-in', 'expired', 'logging-out', 'logout-error']

/**
 * Account entry. Signed-in states render the account view; everything else renders the login
 * view. The controller, OIDC flow and browser-portal rules are unchanged: this is a new skin.
 */
export function PlatformAccountScreen() {
  const router = useRouter()
  const { c } = useCeTheme()
  const state = usePlatformAccount()
  const hub = useHubClient()
  const busy = ['restoring', 'authorizing', 'logging-out'].includes(state.status)
  const portal = usePortalOpener(busy)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [cleanupRequested, setCleanupRequested] = useState(false)
  const [me, setMe] = useState<HubMe | null>(null)

  const signedIn = signedInStatuses.includes(state.status)
  const nativeAccountAvailable = !['unconfigured', 'invalid-config'].includes(state.status)

  // Membership comes from the hub client. A failure just leaves it empty: the account view then
  // says membership is not connected instead of guessing.
  useEffect(() => {
    if (state.status !== 'signed-in') return
    let live = true
    hub.getMe().then(
      (value) => live && setMe(value),
      () => live && setMe(null)
    )
    return () => {
      live = false
    }
  }, [hub, state.status])

  function confirmLogout() {
    setCleanupRequested(true)
    setLogoutOpen(false)
    void platformAccountController.logout()
  }

  const portalProps = {
    ready: portal.portal.status === 'ready',
    opening: portal.opening,
    error: portal.error
  }

  return (
    <ScreenFrame title={copy.account.title} onBack={() => router.back()}>
      {signedIn ? (
        <AccountView
          snapshot={state}
          me={me}
          hubKind={hub.kind}
          portal={portalProps}
          onOpenPortal={() => void portal.open()}
          onOpenComputers={() => router.push('/ce-computers')}
          onOpenInvite={() => router.push('/ce-invite')}
          onOpenPair={() => router.push('/ce-pair')}
          onRelogin={() => void platformAccountController.login()}
          onRestore={() => void platformAccountController.restore()}
          onLogout={() => setLogoutOpen(true)}
        />
      ) : (
        <View style={{ gap: ceSpace.lg }}>
          <LoginView
            status={state.status as LoginStatus}
            message={state.message}
            onLogin={() => void platformAccountController.login()}
            onRestore={() => void platformAccountController.restore()}
          />
          {portalProps.ready ? (
            <NavRow
              testID="ce-nav-portal"
              icon={<Globe size={22} color={c.accentText} />}
              title={portalProps.opening ? copy.account.portalOpening : copy.account.portal}
              hint="登录、注册并查看电脑"
              disabled={busy || portalProps.opening}
              onPress={() => void portal.open()}
            />
          ) : null}
          {portalProps.error ? (
            <Banner tone="danger" testID="ce-portal-error" title={portalProps.error} />
          ) : null}
          {!nativeAccountAvailable && cleanupRequested && state.message ? (
            <Banner tone="info" testID="ce-cleanup-result" title={state.message} />
          ) : null}
          {!busy ? (
            <Button
              testID="ce-clear-button"
              variant="ghost"
              label={copy.account.clearRecord}
              onPress={() => setLogoutOpen(true)}
            />
          ) : null}
        </View>
      )}
      <LogoutSheet
        visible={logoutOpen}
        busy={state.status === 'logging-out'}
        onClose={() => setLogoutOpen(false)}
        onConfirm={confirmLogout}
      />
    </ScreenFrame>
  )
}
