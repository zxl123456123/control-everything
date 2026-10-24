import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { colors, spacing } from '../theme/mobile-theme'
import { platformAccountController, usePlatformAccount } from './controller'

const labels = {
  unconfigured: '平台账号尚未配置',
  'invalid-config': '平台账号配置不可用',
  restoring: '正在恢复账号',
  'signed-out': '尚未登录',
  authorizing: '正在系统浏览器中授权',
  'signed-in': '平台账号已登录',
  expired: '账号会话已过期',
  'recovery-error': '账号恢复或保存失败',
  'login-error': '登录失败',
  'logging-out': '正在退出此 App',
  'logout-error': '退出未完成'
}
export function PlatformAccountScreen() {
  const router = useRouter()
  const state = usePlatformAccount()
  const busy = ['restoring', 'authorizing', 'logging-out'].includes(state.status)
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable accessibilityRole="button" style={styles.back} onPress={() => router.back()}>
        <Text style={styles.link}>返回</Text>
      </Pressable>
      <Text style={styles.heading}>平台账号</Text>
      <Text style={styles.status}>{labels[state.status]}</Text>
      {state.issuer && <Text style={styles.text}>身份服务：{state.issuer}</Text>}
      {state.message && (
        <Text accessibilityRole="alert" style={styles.text}>
          {state.message}
        </Text>
      )}
      {state.account && (
        <View style={styles.card}>
          <Text style={styles.status}>{state.account.displayName ?? state.account.subject}</Text>
          <Text style={styles.text}>账号：{state.account.subject}</Text>
          <Text style={styles.text}>
            {state.account.persistence === 'session-only'
              ? '仅本次会话有效，重启后需要重新登录。'
              : '已安全保存此 App 的账号恢复凭据。'}
          </Text>
        </View>
      )}
      {['signed-out', 'login-error', 'expired'].includes(state.status) && (
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => void platformAccountController.login()}
        >
          <Text style={styles.link}>使用系统浏览器登录</Text>
        </Pressable>
      )}
      {['recovery-error', 'expired'].includes(state.status) && (
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => void platformAccountController.restore()}
        >
          <Text style={styles.link}>重试恢复或保存</Text>
        </Pressable>
      )}
      {!busy && (
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => void platformAccountController.logout()}
        >
          <Text style={styles.link}>
            {state.status === 'logout-error' ? '重试退出' : '退出并清除此 App 记录'}
          </Text>
        </Pressable>
      )}
      <Text style={styles.text}>
        平台账号登录不等于电脑授权。电脑授权与原生远程连接尚未接入；已有配对电脑保持各自的连接状态。
      </Text>
      <Text style={styles.text}>
        退出只清除此 App 的平台账号凭据，不会结束系统浏览器会话或撤销已配对电脑。
      </Text>
    </ScrollView>
  )
}
const styles = StyleSheet.create({
  page: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.bgBase,
    flexGrow: 1
  },
  heading: { color: colors.textPrimary, fontSize: 24, fontWeight: '700' },
  status: { color: colors.textPrimary, fontSize: 18, fontWeight: '600' },
  text: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  link: { color: colors.textPrimary, fontSize: 15 },
  back: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.bgRaised,
    borderRadius: 12
  },
  card: { padding: spacing.md, backgroundColor: colors.bgPanel, borderRadius: 12, gap: spacing.sm }
})
