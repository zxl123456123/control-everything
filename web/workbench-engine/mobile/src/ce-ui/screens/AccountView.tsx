import { View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { Globe, KeyRound, LogOut, Monitor, ScanLine } from 'lucide-react-native'
import type { AccountSnapshot } from '../../platform-account/controller'
import { Avatar } from '../components/Avatar'
import { Banner } from '../components/Banner'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { CeText } from '../components/CeText'
import { Expandable, Note } from '../components/Expandable'
import { MockBadge } from '../components/MockBadge'
import { NavRow } from '../components/NavRow'
import { StatusPill } from '../components/StatusPill'
import { copy } from '../copy'
import type { HubClient, HubMe } from '../hub/hub-client'
import { useMotionEnabled } from '../motion/use-motion'
import { presentAccountStatus, presentMembership } from '../status/device-status'
import { useCeTheme } from '../theme/theme'
import { ceSpace } from '../theme/tokens'
import { SessionExpiredGate } from './SessionGate'

export type AccountViewProps = {
  snapshot: AccountSnapshot
  /** `null` while loading or when the hub has no answer; membership then shows as not connected. */
  me: HubMe | null
  hubKind: HubClient['kind']
  portal: { ready: boolean; opening: boolean; error: string }
  onOpenPortal: () => void
  onOpenComputers: () => void
  onOpenInvite: () => void
  onOpenPair: () => void
  onRelogin: () => void
  onRestore: () => void
  onLogout: () => void
}

/**
 * Screen 3 (with 7's banner). Avatar, name, email, status badges and the way into the rest. The
 * long explanation is collapsed. Signed-in details are real (controller); email and membership
 * come from the hub client and are marked when they are mock data.
 */
export function AccountView(props: AccountViewProps) {
  const { snapshot, me, hubKind } = props
  const { c } = useCeTheme()
  const motion = useMotionEnabled()
  const expired = snapshot.status === 'expired'
  const loggingOut = snapshot.status === 'logging-out'
  const name = snapshot.account?.displayName ?? me?.name ?? snapshot.account?.subject ?? null
  const seed = snapshot.account?.subject ?? me?.subject ?? 'anonymous'
  const signedIn = snapshot.status === 'signed-in'
  return (
    <View style={{ gap: ceSpace.lg }}>
      <SessionExpiredGate expired={expired} onRelogin={props.onRelogin} />

      {snapshot.status === 'recovery-error' || snapshot.status === 'logout-error' ? (
        <Banner
          tone="danger"
          testID="ce-account-error"
          title={snapshot.status === 'logout-error' ? '退出未完成' : '账号恢复或保存失败'}
          message={snapshot.message}
          action={
            snapshot.status === 'recovery-error' ? (
              <Button label={copy.account.retryRestore} onPress={props.onRestore} />
            ) : undefined
          }
        />
      ) : null}

      <Animated.View entering={motion ? FadeInDown.duration(280) : undefined}>
        <Card style={{ alignItems: 'center', gap: ceSpace.md, paddingVertical: ceSpace.xxl }}>
          <Avatar name={name} seed={seed} size={72} />
          <View style={{ alignItems: 'center', gap: ceSpace.xs }}>
            <CeText variant="title" numberOfLines={1} testID="ce-account-name">
              {name ?? '未命名账号'}
            </CeText>
            {me?.email ? (
              <CeText variant="body" color="muted" numberOfLines={1}>
                {me.email}
              </CeText>
            ) : null}
          </View>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: ceSpace.sm,
              justifyContent: 'center'
            }}
          >
            <StatusPill
              presentation={presentAccountStatus(snapshot.status)}
              testID="ce-account-status"
            />
            {me ? (
              <StatusPill
                presentation={presentMembership(me.membership)}
                testID="ce-member-status"
              />
            ) : null}
          </View>
          {snapshot.account ? (
            <CeText variant="caption" color="muted" style={{ textAlign: 'center' }}>
              {snapshot.account.persistence === 'session-only'
                ? copy.account.sessionOnly
                : copy.account.sessionRefresh}
            </CeText>
          ) : null}
          {!me && signedIn ? (
            <CeText variant="caption" color="muted">
              {copy.account.memberUnavailable}
            </CeText>
          ) : null}
          <MockBadge kind={hubKind} align="center" />
        </Card>
      </Animated.View>

      <View style={{ gap: ceSpace.md }}>
        <NavRow
          testID="ce-nav-computers"
          icon={<Monitor size={22} color={c.accentText} />}
          title={copy.account.computers}
          hint={copy.account.computersHint}
          onPress={props.onOpenComputers}
        />
        <NavRow
          testID="ce-nav-invite"
          icon={<KeyRound size={22} color={c.accentText} />}
          title={copy.account.invite}
          hint={copy.account.inviteHint}
          onPress={props.onOpenInvite}
        />
        <NavRow
          testID="ce-nav-pair"
          icon={<ScanLine size={22} color={c.accentText} />}
          title={copy.account.pair}
          hint={copy.account.pairHint}
          onPress={props.onOpenPair}
        />
        {props.portal.ready ? (
          <NavRow
            testID="ce-nav-portal"
            icon={<Globe size={22} color={c.accentText} />}
            title={props.portal.opening ? copy.account.portalOpening : copy.account.portal}
            hint="登录、注册并查看电脑"
            disabled={props.portal.opening || loggingOut}
            onPress={props.onOpenPortal}
          />
        ) : null}
      </View>
      {props.portal.error ? (
        <Banner tone="danger" testID="ce-portal-error" title={props.portal.error} />
      ) : null}

      <Expandable testID="ce-account-more">
        {copy.account.learnMore.map((line) => (
          <Note key={line}>{line}</Note>
        ))}
      </Expandable>

      <Button
        testID="ce-logout-button"
        label={snapshot.status === 'logout-error' ? copy.account.retryLogout : copy.account.logout}
        icon={<LogOut size={18} color={c.text} />}
        loading={loggingOut}
        onPress={props.onLogout}
      />
    </View>
  )
}
