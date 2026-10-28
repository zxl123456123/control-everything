import type { ReactNode } from 'react'
import { View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useMotionEnabled } from '../motion/use-motion'
import { useCeTheme } from '../theme/theme'
import { ceSpace } from '../theme/tokens'
import { CeText } from './CeText'

/** Icon disc + one headline + one sentence + the next action. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  testID
}: {
  icon: ReactNode
  title: string
  body?: string
  action?: ReactNode
  testID?: string
}) {
  const { c } = useCeTheme()
  const motion = useMotionEnabled()
  return (
    <Animated.View
      testID={testID}
      entering={motion ? FadeInDown.duration(260) : undefined}
      style={{
        alignItems: 'center',
        gap: ceSpace.md,
        paddingVertical: ceSpace.giant,
        paddingHorizontal: ceSpace.lg
      }}
    >
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 88,
          backgroundColor: c.soft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: ceSpace.sm
        }}
      >
        {icon}
      </View>
      <CeText variant="headline" style={{ textAlign: 'center' }}>
        {title}
      </CeText>
      {body ? (
        <CeText variant="body" color="muted" style={{ textAlign: 'center' }}>
          {body}
        </CeText>
      ) : null}
      {action ? (
        <View style={{ alignSelf: 'stretch', marginTop: ceSpace.md }}>{action}</View>
      ) : null}
    </Animated.View>
  )
}
