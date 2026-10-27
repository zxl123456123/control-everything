import type { ReactNode } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import { PressableScale } from '../motion/PressableScale'
import { useCeTheme } from '../theme/theme'
import { ceHit, ceSpace } from '../theme/tokens'
import { Aurora } from './Aurora'
import { CeText } from './CeText'

/**
 * Page chrome for the account screens: themed background, our own large-title header with a 44pt
 * back target, safe-area padding, and optional pull-to-refresh. Hides the stack header from
 * inside the screen so the shared `_layout` stays untouched.
 */
export function ScreenFrame({
  title,
  subtitle,
  onBack,
  trailing,
  children,
  refreshing,
  onRefresh,
  scroll = true
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  trailing?: ReactNode
  children: ReactNode
  refreshing?: boolean
  onRefresh?: () => void
  scroll?: boolean
}) {
  const { c } = useCeTheme()
  const insets = useSafeAreaInsets()
  const header = (
    <View style={{ gap: ceSpace.xs, paddingBottom: ceSpace.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: ceHit.min,
          justifyContent: 'space-between'
        }}
      >
        {onBack ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="返回"
            onPress={onBack}
            style={{
              width: ceHit.min,
              height: ceHit.min,
              borderRadius: ceHit.min,
              backgroundColor: c.field,
              borderWidth: 1,
              borderColor: c.fieldEdge,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <ChevronLeft size={24} color={c.text} />
          </PressableScale>
        ) : (
          <View />
        )}
        {trailing}
      </View>
      <CeText variant="display" accessibilityRole="header">
        {title}
      </CeText>
      {subtitle ? (
        <CeText variant="body" color="muted">
          {subtitle}
        </CeText>
      ) : null}
    </View>
  )
  const padding = {
    paddingTop: insets.top + ceSpace.sm,
    paddingBottom: insets.bottom + ceSpace.xxl,
    paddingHorizontal: ceSpace.xl,
    gap: ceSpace.lg
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Aurora />
      <Stack.Screen options={{ headerShown: false }} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={padding}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={!!refreshing}
                onRefresh={onRefresh}
                tintColor={c.accentText}
                colors={[c.accent]}
                progressBackgroundColor={c.surface}
              />
            ) : undefined
          }
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padding]}>
          {header}
          {children}
        </View>
      )}
    </View>
  )
}
