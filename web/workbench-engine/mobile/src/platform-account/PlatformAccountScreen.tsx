import { useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { colors, spacing } from '../theme/mobile-theme'
import { readPlatformBrowserPortal } from './browser-portal'
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
  const portal = readPlatformBrowserPortal(Constants.expoConfig)
  const [browserError, setBrowserError] = useState('')
  const [openingBrowser, setOpeningBrowser] = useState(false)
  const [cleanupRequested, setCleanupRequested] = useState(false)
  const browserPending = useRef(false)
  const nativeAccountAvailable = !['unconfigured', 'invalid-config'].includes(state.status)

  async function openComputers() {
    if (portal.status !== 'ready' || busy || browserPending.current) return
    browserPending.current = true
    setOpeningBrowser(true)
    setBrowserError('')
    try {
      await Linking.openURL(portal.url)
    } catch {
      setBrowserError('无法打开系统浏览器，请重试。')
    } finally {
      browserPending.current = false
      setOpeningBrowser(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable accessibilityRole="button" style={styles.back} onPress={() => router.back()}>
        <Text style={styles.link}>返回</Text>
      </Pressable>
      <Text style={styles.heading}>账号与设备</Text>
      <View style={styles.card}>
        <Text style={styles.status}>我的电脑</Text>
        {portal.status === 'ready' ? (
          <>
            <Text style={styles.text}>登录或注册后，查看并打开你有权限访问的电脑。</Text>
            <Text selectable style={styles.text}>
              {portal.origin}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || openingBrowser, busy: openingBrowser }}
              disabled={busy || openingBrowser}
              style={styles.primaryButton}
              onPress={() => void openComputers()}
            >
              <Text style={styles.primaryLabel}>
                {openingBrowser ? '正在打开浏览器…' : '登录 / 注册并查看电脑'}
              </Text>
            </Pressable>
            <Text style={styles.text}>电脑工作台将在系统浏览器中打开。</Text>
          </>
        ) : (
          <Text style={styles.text}>
            {portal.status === 'missing'
              ? '此安装包未配置远程服务入口。'
              : '此安装包的远程服务入口不可用。'}
            请联系发行者获取已配置的安装包。
          </Text>
        )}
        {browserError && (
          <Text accessibilityRole="alert" style={styles.text}>
            {browserError}
          </Text>
        )}
      </View>
      {nativeAccountAvailable && (
        <View style={styles.card}>
          <Text style={styles.status}>此 App 的账号</Text>
          <Text style={styles.text}>{labels[state.status]}</Text>
          {state.message && (
            <Text accessibilityRole="alert" style={styles.text}>
              {state.message}
            </Text>
          )}
          {state.account && (
            <>
              <Text style={styles.status}>
                {state.account.displayName ?? state.account.subject}
              </Text>
              {state.account.persistence === 'session-only' && (
                <Text style={styles.text}>仅本次会话有效，重启后需要重新登录。</Text>
              )}
            </>
          )}
          {['signed-out', 'login-error', 'expired'].includes(state.status) && (
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => void platformAccountController.login()}
            >
              <Text style={styles.link}>登录此 App</Text>
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
          <Text style={styles.text}>此 App 的账号尚不用于电脑连接。</Text>
        </View>
      )}
      {!busy && (
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => {
            setCleanupRequested(true)
            void platformAccountController.logout()
          }}
        >
          <Text style={styles.link}>
            {state.status === 'logout-error' ? '重试退出' : '退出并清除此 App 记录'}
          </Text>
        </Pressable>
      )}
      {!nativeAccountAvailable && cleanupRequested && state.message && (
        <Text accessibilityRole="alert" style={styles.text}>
          {state.message}
        </Text>
      )}
      <Text style={styles.text}>清除 App 记录不会结束系统浏览器会话或撤销已配对电脑。</Text>
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
  text: { color: colors.textSecondary, fontSize: 15, lineHeight: 23 },
  link: { color: colors.textPrimary, fontSize: 15 },
  back: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.bgRaised,
    borderRadius: 12
  },
  primaryButton: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surfaceBright,
    borderRadius: 12
  },
  primaryLabel: { color: colors.bgBase, fontSize: 16, fontWeight: '600' },
  card: { padding: spacing.md, backgroundColor: colors.bgPanel, borderRadius: 12, gap: spacing.sm }
})
