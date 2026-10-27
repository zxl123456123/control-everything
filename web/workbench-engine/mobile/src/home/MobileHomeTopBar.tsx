import { Settings } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { OrcaLogo } from '../components/OrcaLogo'
import { colors, spacing } from '../theme/mobile-theme'

export function MobileHomeTopBar({
  onOpenSettings,
  onOpenPlatformAccount
}: {
  onOpenSettings: () => void
  onOpenPlatformAccount: () => void
}) {
  return (
    <View style={styles.topBar}>
      <View style={styles.brandLockup}>
        <View style={styles.logoMark}>
          <OrcaLogo size={18} />
        </View>
        <Text style={styles.brandName}>Orca</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="账号与设备"
          onPress={onOpenPlatformAccount}
          style={{ minHeight: 44, justifyContent: 'center', padding: spacing.sm }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 15 }}>账号与设备</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          onPress={onOpenSettings}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Settings size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md
  },
  brandLockup: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  logoMark: { marginRight: spacing.sm },
  brandName: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconButtonPressed: { backgroundColor: colors.bgRaised }
})
