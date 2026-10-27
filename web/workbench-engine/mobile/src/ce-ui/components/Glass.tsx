import { useId, useState, type ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { useCeTheme } from '../theme/theme'
import { ceRadii, splitRgba, type CePalette } from '../theme/tokens'

/**
 * Outer style of a glass surface: translucent fill, radius and a layered shadow. Apply it to the
 * element that also hosts a `<GlassLayer />` as its first child. The shadow is iOS / web; Android
 * gets none on purpose (elevation draws a hard grey slab under translucent fills).
 */
export function glassBox(
  c: CePalette,
  scheme: 'light' | 'dark',
  radius: number = ceRadii.card,
  fill: string = c.glass
): ViewStyle {
  return {
    backgroundColor: fill,
    borderRadius: radius,
    shadowColor: c.shadow,
    shadowOpacity: scheme === 'dark' ? 0.5 : 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 }
  }
}

/**
 * Paints the "glass" details on top of a translucent fill: a top-lit highlight gradient and a
 * 1px gradient hairline rim (bright top-left -> faint bottom-right), the same two layers as the web
 * `::before` rim + inset highlight. Pure decoration: absolutely positioned, never takes touches.
 * Real backdrop blur needs expo-blur (one native rebuild) - until then the fill alpha is kept higher
 * so text contrast does not depend on a blur that is not there.
 */
export function GlassLayer({
  radius = ceRadii.card,
  tint,
  edge
}: {
  radius?: number
  /** Optional tone wash over the glass (a status colour at low alpha). */
  tint?: string
  /** Override of the rim gradient (start, end). */
  edge?: [string, string]
}) {
  const { c } = useCeTheme()
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const rim = edge ?? c.glassRim
  const hi = splitRgba(c.glassHi)
  const r0 = splitRgba(rim[0])
  const r1 = splitRgba(rim[1])
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout
        setSize((prev) =>
          prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }
        )
      }}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius }}
    >
      {tint ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: radius,
            backgroundColor: tint
          }}
        />
      ) : null}
      {size ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id={`${id}hi`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={hi.color} stopOpacity={hi.opacity} />
              <Stop offset="0.55" stopColor={hi.color} stopOpacity={0} />
            </LinearGradient>
            <LinearGradient id={`${id}rim`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={r0.color} stopOpacity={r0.opacity} />
              <Stop offset="1" stopColor={r1.color} stopOpacity={r1.opacity} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} rx={radius} fill={`url(#${id}hi)`} />
          <Rect
            x={0.5}
            y={0.5}
            width={Math.max(size.w - 1, 0)}
            height={Math.max(size.h - 1, 0)}
            rx={Math.max(radius - 0.5, 0)}
            fill="none"
            stroke={`url(#${id}rim)`}
            strokeWidth={1}
          />
        </Svg>
      ) : null}
    </View>
  )
}

/** A glass card body: translucent fill + shadow + highlight + rim, children above. */
export function GlassSurface({
  children,
  radius = ceRadii.card,
  style,
  tint,
  edge,
  fill
}: {
  children?: ReactNode
  radius?: number
  style?: StyleProp<ViewStyle>
  tint?: string
  edge?: [string, string]
  fill?: string
}) {
  const { c, scheme } = useCeTheme()
  return (
    <View style={[glassBox(c, scheme, radius, fill), style]}>
      <GlassLayer radius={radius} tint={tint} edge={edge} />
      {children}
    </View>
  )
}
