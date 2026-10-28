import { useEffect, useReducer } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { ClipboardPaste, X } from 'lucide-react-native'
import {
  platformAccountController,
  usePlatformAccount,
  type AccountSnapshot
} from '../../platform-account/controller'
import { Banner } from '../components/Banner'
import { Button } from '../components/Button'
import { CeText } from '../components/CeText'
import { Expandable, Note } from '../components/Expandable'
import { MockBadge } from '../components/MockBadge'
import { ScreenFrame } from '../components/ScreenFrame'
import { SegmentedCodeInput } from '../components/SegmentedCodeInput'
import { copy, hubErrorToInviteError, inviteErrorCopy, toHubErrorKind } from '../copy'
import { useHubClient } from '../hub/hub-context'
import type { HubClient } from '../hub/hub-client'
import {
  initialInviteState,
  inviteReducer,
  inviteValidity,
  type InviteAction,
  type InviteState
} from '../invite/invite-code'
import { SuccessCheck } from '../motion/SuccessCheck'
import { useShake } from '../motion/useShake'
import { useCeTheme } from '../theme/theme'
import { ceSpace } from '../theme/tokens'
import { SessionExpiredGate } from './SessionGate'

/** Screen 2 as a pure view: segmented input, paste, shake on error, success check. */
export function InviteView({
  state,
  hubKind,
  dispatch,
  onPaste,
  onSubmit,
  onDone
}: {
  state: InviteState
  hubKind: HubClient['kind']
  dispatch: (action: InviteAction) => void
  onPaste: () => void
  onSubmit: () => void
  onDone: () => void
}) {
  const { c } = useCeTheme()
  const { style: shakeStyle, shake } = useShake()
  useEffect(() => {
    if (state.errorCount > 0) shake()
    // Replay on every failed attempt, even an identical one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.errorCount])

  if (state.status === 'success') {
    return (
      <View
        style={{ alignItems: 'center', gap: ceSpace.lg, paddingVertical: ceSpace.giant }}
        testID="ce-invite-success"
      >
        <SuccessCheck />
        <CeText variant="title">{copy.invite.successTitle}</CeText>
        <CeText variant="body" color="muted" style={{ textAlign: 'center' }}>
          {copy.invite.successBody}
        </CeText>
        <View style={{ alignSelf: 'stretch', marginTop: ceSpace.lg }}>
          <Button variant="primary" label={copy.invite.done} onPress={onDone} />
        </View>
      </View>
    )
  }
  const submitting = state.status === 'submitting'
  const error = state.error ? inviteErrorCopy[state.error] : null
  return (
    <View style={{ gap: ceSpace.lg }}>
      <MockBadge kind={hubKind} />
      <SegmentedCodeInput
        testID="ce-invite-input"
        value={state.value}
        onChangeText={(text) => dispatch({ type: 'edit', text })}
        onSubmit={onSubmit}
        hasError={state.status === 'error'}
        disabled={submitting}
        animatedStyle={shakeStyle}
      />
      {error ? (
        <Banner tone="danger" testID="ce-invite-error" title={error.title} message={error.body} />
      ) : (
        <CeText variant="callout" color="muted" style={{ fontWeight: '400' }}>
          {copy.invite.hint}
        </CeText>
      )}
      <View style={{ flexDirection: 'row', gap: ceSpace.md }}>
        <Button
          testID="ce-invite-paste"
          label={copy.invite.paste}
          icon={<ClipboardPaste size={18} color={c.text} />}
          disabled={submitting}
          onPress={onPaste}
          style={{ flex: 1 }}
        />
        <Button
          label={copy.invite.clear}
          icon={<X size={18} color={c.text} />}
          disabled={submitting || state.value.length === 0}
          onPress={() => dispatch({ type: 'clear' })}
          style={{ flex: 1 }}
        />
      </View>
      <Button
        testID="ce-invite-submit"
        variant="primary"
        label={submitting ? copy.invite.submitting : copy.invite.submit}
        loading={submitting}
        disabled={inviteValidity(state.value) === 'empty'}
        onPress={onSubmit}
      />
      <Expandable>
        {copy.invite.learnMore.map((line) => (
          <Note key={line}>{line}</Note>
        ))}
      </Expandable>
    </View>
  )
}

export function InviteScreen() {
  const snapshot = usePlatformAccount()
  return (
    <AccountInvite
      key={JSON.stringify([
        snapshot.account?.issuer ?? snapshot.issuer,
        snapshot.account?.subject,
        snapshot.status
      ])}
      snapshot={snapshot}
    />
  )
}

function AccountInvite({ snapshot }: { snapshot: AccountSnapshot }) {
  const router = useRouter()
  const client = useHubClient()
  const [state, dispatch] = useReducer(inviteReducer, initialInviteState)

  async function paste() {
    let text = ''
    try {
      text = await Clipboard.getStringAsync()
    } catch {
      text = ''
    }
    if (text.trim()) dispatch({ type: 'paste', text })
    else dispatch({ type: 'failed', error: 'clipboard-empty' })
  }
  async function submit() {
    if (state.status === 'submitting') return
    dispatch({ type: 'submit' })
    if (state.value.length < 16) return
    try {
      await client.activateInvite(state.value)
      dispatch({ type: 'succeeded' })
    } catch (error) {
      dispatch({ type: 'failed', error: hubErrorToInviteError(toHubErrorKind(error)) })
    }
  }
  return (
    <ScreenFrame
      title={copy.invite.title}
      subtitle={copy.invite.subtitle}
      onBack={() => router.back()}
    >
      <SessionExpiredGate
        expired={snapshot.status === 'expired'}
        onRelogin={() => void platformAccountController.login()}
      />
      <InviteView
        state={state}
        hubKind={client.kind}
        dispatch={dispatch}
        onPaste={() => void paste()}
        onSubmit={() => void submit()}
        onDone={() => router.back()}
      />
    </ScreenFrame>
  )
}
