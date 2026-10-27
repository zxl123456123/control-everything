import { View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { KeyRound, MonitorSmartphone, TriangleAlert } from 'lucide-react-native'
import type { AccountStatus } from '../../platform-account/controller'
import { Banner } from '../components/Banner'
import { Button } from '../components/Button'
import { CeText } from '../components/CeText'
import { Expandable, Note } from '../components/Expandable'
import { copy } from '../copy'
import { useMotionEnabled } from '../motion/use-motion'
import { useCeTheme } from '../theme/theme'
import { ceSpace } from '../theme/tokens'

export type LoginStatus = Extract<
  AccountStatus,
  | 'unconfigured'
  | 'invalid-config'
  | 'signed-out'
  | 'authorizing'
  | 'restoring'
  | 'login-error'
  | 'recovery-error'
>

/**
 * Screen 1. Pure view over the existing OIDC controller state: unconfigured, invalid-config,
 * signed-out, signing-in (authorizing / restoring) and error. One primary action at most.
 */
export function LoginView({
  status,
  message,
  onLogin,
  onRestore
}: {
  status: LoginStatus
  message?: string
  onLogin: () => void
  onRestore: () => void
}) {
  const { c } = useCeTheme()
  const motion = useMotionEnabled()
  const busy = status === 'authorizing' || status === 'restoring'
  const unusable = status === 'unconfigured' || status === 'invalid-config'
  return (
    <View style={{ gap: ceSpace.xl }}>
      <Animated.View
        entering={motion ? FadeInDown.duration(300) : undefined}
        style={{ alignItems: 'center', gap: ceSpace.lg, paddingVertical: ceSpace.xl }}
      >
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 28,
            backgroundColor: unusable ? c.soft : c.accent,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {unusable ? (
            <TriangleAlert size={44} color={c.muted} strokeWidth={1.8} />
          ) : (
            <MonitorSmartphone size={44} color={c.onAccent} strokeWidth={1.8} />
          )}
        </View>
        <View style={{ gap: ceSpace.xs, alignItems: 'center' }}>
          <CeText variant="title" style={{ textAlign: 'center' }}>
            {status === 'unconfigured'
              ? copy.login.unconfigured
              : status === 'invalid-config'
                ? copy.login.invalid
                : copy.login.title}
          </CeText>
          <CeText variant="body" color="muted" style={{ textAlign: 'center' }}>
            {status === 'unconfigured'
              ? copy.login.unconfiguredBody
              : status === 'invalid-config'
                ? copy.login.invalidBody
                : copy.login.subtitle}
          </CeText>
        </View>
      </Animated.View>

      {status === 'login-error' || status === 'recovery-error' ? (
        <Banner
          tone="danger"
          testID="ce-login-error"
          title={status === 'login-error' ? copy.login.failedTitle : copy.login.recoveryTitle}
          message={message}
        />
      ) : null}

      {unusable ? null : (
        <View style={{ gap: ceSpace.md }}>
          <Button
            testID="ce-login-button"
            variant="primary"
            icon={busy ? undefined : <KeyRound size={18} color={c.onAccent} />}
            loading={busy}
            label={
              status === 'authorizing'
                ? copy.login.signingIn
                : status === 'restoring'
                  ? copy.login.restoring
                  : status === 'login-error'
                    ? copy.login.retry
                    : copy.login.signIn
            }
            onPress={onLogin}
          />
          {status === 'recovery-error' ? (
            <Button label={copy.account.retryRestore} onPress={onRestore} />
          ) : null}
          <Expandable testID="ce-login-more">
            {copy.login.learnMore.map((line) => (
              <Note key={line}>{line}</Note>
            ))}
          </Expandable>
        </View>
      )}
    </View>
  )
}
