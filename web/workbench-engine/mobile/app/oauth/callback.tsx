import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { colors, spacing } from '../../src/theme/mobile-theme'
import { usePlatformAccount } from '../../src/platform-account/controller'

// Only the live AuthRequest response chain can authenticate; never consume route parameters.
export default function OAuthCallback() {
  const router = useRouter()
  const state = usePlatformAccount()
  useEffect(() => {
    if (state.status === 'signed-in') router.replace('/platform-account')
  }, [state.status, router])
  return (
    <View
      style={{
        flex: 1,
        padding: spacing.lg,
        paddingTop: spacing.xl,
        backgroundColor: colors.bgBase
      }}
    >
      <Text style={{ color: colors.textPrimary }}>
        {state.status === 'authorizing'
          ? '正在验证本次授权，请稍候。'
          : '授权已中断，请返回平台账号重新登录。'}
      </Text>
      <Pressable
        accessibilityRole="button"
        style={{ minHeight: 44, justifyContent: 'center' }}
        onPress={() => router.replace('/platform-account')}
      >
        <Text style={{ color: colors.textPrimary, paddingVertical: spacing.lg }}>返回平台账号</Text>
      </Pressable>
    </View>
  )
}
