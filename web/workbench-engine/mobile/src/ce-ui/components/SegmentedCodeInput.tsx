import { useRef, useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { groupInvite, INVITE_MAX_LENGTH } from '../invite/invite-code'
import { useCeTheme } from '../theme/theme'
import { ceHit, ceRadii, ceSpace } from '../theme/tokens'
import { CeText } from './CeText'

type Props = {
  value: string
  onChangeText: (text: string) => void
  onSubmit?: () => void
  hasError?: boolean
  disabled?: boolean
  /** Shake style from `useShake`, applied to the whole field. */
  animatedStyle?: object
  testID?: string
}

/**
 * Invite code field shown as groups of four. One real (invisible) TextInput owns the text so
 * paste, autofill and the OS keyboard all behave; the groups are only the rendering. Case is kept
 * and no separators are stored: the server compares the exact string.
 */
export function SegmentedCodeInput({
  value,
  onChangeText,
  onSubmit,
  hasError,
  disabled,
  animatedStyle,
  testID
}: Props) {
  const { c } = useCeTheme()
  const input = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)
  const groups = groupInvite(value)
  const caretGroup = Math.min(Math.floor(value.length / 4), groups.length - 1)
  const border = hasError ? c.tones.danger.dot : focused ? c.accent : c.line
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessible={false}
        onPress={() => input.current?.focus()}
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: ceSpace.sm,
          padding: ceSpace.md,
          minHeight: ceHit.primaryButton + ceSpace.md * 2,
          borderRadius: ceRadii.input,
          borderWidth: focused || hasError ? 2 : 1,
          borderColor: border,
          backgroundColor: c.soft
        }}
      >
        {groups.map((group, index) => (
          <View
            key={index}
            style={{
              minWidth: 68,
              minHeight: ceHit.min,
              paddingHorizontal: ceSpace.sm,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: ceRadii.button - 4,
              backgroundColor: group.filled ? c.surface : 'transparent',
              borderWidth: 1,
              borderColor: index === caretGroup && focused ? c.accent : c.line
            }}
          >
            <CeText variant="headline" style={{ letterSpacing: 2 }}>
              {group.chars || (index === caretGroup && focused ? '|' : '·')}
            </CeText>
          </View>
        ))}
        <TextInput
          ref={input}
          testID={testID}
          accessibilityLabel="邀请码"
          accessibilityHint="输入或粘贴管理员给你的邀请码，区分大小写"
          value={value}
          editable={!disabled}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmit}
          returnKeyType="go"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          textContentType="oneTimeCode"
          maxLength={INVITE_MAX_LENGTH * 2}
          // Invisible but focusable and full-size, so taps anywhere always reach it.
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            opacity: 0.015,
            color: 'transparent'
          }}
        />
      </Pressable>
    </Animated.View>
  )
}
