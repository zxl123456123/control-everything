import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Modal, Pressable, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMotionEnabled } from '../motion/use-motion'
import { durations, sheetDragOffset, shouldDismissSheet, springs } from '../motion/springs'
import { useCeTheme } from '../theme/theme'
import { ceRadii, ceSpace, withAlpha } from '../theme/tokens'
import { CeText } from './CeText'

type Props = {
  visible: boolean
  onClose: () => void
  title: string
  children: ReactNode
  testID?: string
}

/**
 * Themed bottom sheet. The app's own BottomDrawer is dark-only (it reads graphite colours
 * directly), so account screens get this light/dark one. Feel matches it: same spring, same
 * dismiss distance, with a rubber-band when pulled upward.
 */
export function CeSheet({ visible, onClose, title, children, testID }: Props) {
  const { c } = useCeTheme()
  const motion = useMotionEnabled()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  // Keep the Modal mounted through the exit animation.
  const [mounted, setMounted] = useState(visible)
  const offset = useSharedValue(height)
  const backdrop = useSharedValue(0)

  const finishClose = useCallback(() => setMounted(false), [])
  useEffect(() => {
    if (visible) {
      setMounted(true)
      offset.value = height
      offset.value = motion
        ? withSpring(0, springs.sheet)
        : withTiming(0, { duration: durations.sheetShow })
      backdrop.value = withTiming(1, { duration: durations.sheetShow })
    } else if (mounted) {
      backdrop.value = withTiming(0, { duration: durations.sheetHide })
      offset.value = withTiming(height, { duration: durations.sheetHide }, (done) => {
        if (done) runOnJS(finishClose)()
      })
    }
    // `mounted` is deliberately read, not depended on: it only gates the hide branch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, motion, height])

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onUpdate((event) => {
      offset.value = sheetDragOffset(event.translationY)
    })
    .onEnd((event) => {
      if (shouldDismissSheet(event.translationY, event.velocityY)) {
        runOnJS(onClose)()
      } else {
        offset.value = withSpring(0, springs.sheet)
      }
    })

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))
  const scrimStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }))

  if (!mounted) return null
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: c.scrim
            },
            scrimStyle
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭"
            onPress={onClose}
            style={{ flex: 1 }}
          />
        </Animated.View>
        <Animated.View
          testID={testID}
          accessibilityViewIsModal
          style={[
            {
              maxHeight: height * 0.9,
              // Near-opaque on purpose: nothing blurs what is behind a sheet yet, so the fill carries legibility.
              backgroundColor: withAlpha(c.surface, 0.98),
              shadowColor: c.shadow,
              shadowOpacity: 0.25,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: -8 },
              borderTopLeftRadius: ceRadii.sheet,
              borderTopRightRadius: ceRadii.sheet,
              borderWidth: 1,
              borderBottomWidth: 0,
              borderColor: c.glassRim[1],
              paddingHorizontal: ceSpace.xl,
              paddingBottom: insets.bottom + ceSpace.xl,
              // Extra below-the-fold fill so the rubber-band never reveals a gap.
              marginBottom: -48,
              paddingTop: ceSpace.md
            },
            sheetStyle
          ]}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: ceRadii.sheet,
              right: ceRadii.sheet,
              height: 1,
              backgroundColor: c.glassRim[0],
              opacity: 0.7
            }}
          />
          <GestureDetector gesture={pan}>
            <View style={{ alignItems: 'center', paddingBottom: ceSpace.md }} collapsable={false}>
              <View
                style={{
                  width: 40,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: c.fieldEdge,
                  marginBottom: ceSpace.md
                }}
              />
              <CeText variant="title" accessibilityRole="header" style={{ alignSelf: 'stretch' }}>
                {title}
              </CeText>
            </View>
          </GestureDetector>
          <View style={{ gap: ceSpace.lg, paddingBottom: 48 }}>{children}</View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  )
}
