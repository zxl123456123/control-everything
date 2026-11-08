export const DEFAULT_WORKBENCH_SURFACE_OPACITY = 0.82
export const MIN_WORKBENCH_SURFACE_OPACITY = 0.55

/** Old profiles have no surface preference; keep text opaque at every setting. */
export function normalizeWorkbenchSurfaceOpacity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(MIN_WORKBENCH_SURFACE_OPACITY, value))
    : DEFAULT_WORKBENCH_SURFACE_OPACITY
}
