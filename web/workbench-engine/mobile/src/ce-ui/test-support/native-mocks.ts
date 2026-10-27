import { createElement, useRef, type ReactNode } from 'react'

/**
 * Factories for `vi.mock` so render tests can mount ce-ui components under react-test-renderer
 * without native modules. They are intentionally small: host components are plain strings, the
 * animation hooks run their worklets eagerly. Layout and motion are NOT exercised by these tests.
 */

const host = (name: string) => name

export function reactNativeMock() {
  return {
    View: host('View'),
    Text: host('Text'),
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    TextInput: host('TextInput'),
    Modal: host('Modal'),
    ActivityIndicator: host('ActivityIndicator'),
    RefreshControl: host('RefreshControl'),
    StyleSheet: { create: <T>(x: T) => x, hairlineWidth: 1, absoluteFillObject: {} },
    Platform: { OS: 'ios', select: <T>(o: { ios?: T; default?: T }) => o.ios ?? o.default },
    Linking: { openSettings: () => Promise.resolve(), openURL: () => Promise.resolve() },
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: () => ({ remove: () => undefined })
    },
    useColorScheme: () => 'dark',
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 })
  }
}

/** Chainable no-op used for entering/exiting layout animations (FadeIn.delay(1).springify()). */
function chain(): unknown {
  const target = () => chained
  const chained: unknown = new Proxy(target, { get: () => target, apply: () => chained })
  return chained
}

export function reanimatedMock() {
  const Animated = {
    View: ({ children, ...props }: { children?: ReactNode }) =>
      createElement('AnimatedView', props, children),
    Text: ({ children, ...props }: { children?: ReactNode }) =>
      createElement('AnimatedText', props, children)
  }
  const identity = (value: unknown) => value
  return {
    default: Animated,
    useSharedValue: (initial: unknown) => useRef({ value: initial }).current,
    useAnimatedStyle: (fn: () => unknown) => fn(),
    useAnimatedReaction: () => undefined,
    withSpring: identity,
    withTiming: identity,
    withDelay: (_delay: number, value: unknown) => value,
    withRepeat: identity,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    cancelAnimation: () => undefined,
    runOnJS: (fn: unknown) => fn,
    interpolate: (value: number) => value,
    Easing: new Proxy({}, { get: () => () => 0 }),
    FadeIn: chain(),
    FadeOut: chain(),
    FadeInDown: chain(),
    LinearTransition: chain()
  }
}

export function gestureHandlerMock() {
  const gesture: unknown = new Proxy(() => gesture, { get: () => () => gesture })
  return {
    Gesture: { Pan: () => gesture, Tap: () => gesture, Native: () => gesture },
    GestureDetector: ({ children }: { children?: ReactNode }) => children,
    GestureHandlerRootView: ({ children, ...props }: { children?: ReactNode }) =>
      createElement('View', props, children)
  }
}

/** Every lucide export becomes a host component named after the icon. */
export function lucideMock() {
  return new Proxy(
    {},
    {
      has: () => true,
      get: (_t, name) => (name === '__esModule' || name === 'then' ? undefined : String(name))
    }
  )
}

export function safeAreaMock() {
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }
}

export function hapticsMock(fn: () => void) {
  return {
    triggerSelection: fn,
    triggerSuccess: fn,
    triggerError: fn,
    triggerMediumImpact: fn,
    triggerEdgeBump: fn
  }
}
