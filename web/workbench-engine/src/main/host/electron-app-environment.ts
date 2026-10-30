import { app } from 'electron'
import { existsSync } from 'node:fs'
import type { AppEnvironment, AppPathName, AppProcessMetric } from '../../shared/app-environment'
import { getBundledLauncherPath } from '../cli/bundled-cli-launcher-path'

/**
 * Electron-backed AppEnvironment for the desktop app: a pass-through to
 * `electron.app`, so desktop path, version and lifecycle behaviour is unchanged.
 */
export class ElectronAppEnvironment implements AppEnvironment {
  getPath(name: AppPathName): string {
    return app.getPath(name)
  }

  getAppPath(): string {
    return app.getAppPath()
  }

  getVersion(): string {
    return app.getVersion()
  }

  isPackaged(): boolean {
    return app.isPackaged
  }

  getCliAccountCommand(): 'zkyq' | undefined {
    if (!app.isPackaged || !['win32', 'linux'].includes(process.platform)) return undefined
    const launcher = getBundledLauncherPath(process.platform, process.resourcesPath)
    return launcher && existsSync(launcher) ? 'zkyq' : undefined
  }

  onWillQuit(handler: () => void): void {
    app.on('will-quit', handler)
  }

  exit(code = 0): void {
    app.exit(code)
  }

  getAppMetrics(): AppProcessMetric[] {
    // Electron's ProcessMetric is structurally compatible with the loose mirror
    // (pid plus optional cpu/memory); the nominal types differ, hence the cast.
    return app.getAppMetrics() as unknown as AppProcessMetric[]
  }
}
