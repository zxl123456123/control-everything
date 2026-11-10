import { createHash } from 'node:crypto'

export const OPENCODE_OVERLAY_DIR = 'opencode-config-overlays'
export const OPENCODE_STATUS_PLUGIN_FILE = 'zkyq-opencode-status.js'

export function toSafeDirName(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 32)
}

export function sourceOverlayDirName(sourceConfigDir: string): string {
  return toSafeDirName(`source:${sourceConfigDir}`)
}
