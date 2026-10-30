import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ElectronAppEnvironment } from './electron-app-environment'

const desktop = vi.hoisted(() => ({ isPackaged: true }))
vi.mock('electron', () => ({ app: desktop }))
vi.mock('node:fs', () => ({ existsSync: vi.fn() }))

const originalPlatform = process.platform
const originalResources = Object.getOwnPropertyDescriptor(process, 'resourcesPath')
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform })
  if (originalResources) Object.defineProperty(process, 'resourcesPath', originalResources)
  else Reflect.deleteProperty(process, 'resourcesPath')
  vi.clearAllMocks()
})

it.each([
  ['win32', true, true, 'zkyq'],
  ['win32', true, false, undefined],
  ['win32', false, true, undefined],
  ['darwin', true, true, undefined],
  ['linux', true, true, undefined]
] as const)('advertises only the available packaged Windows command (%s, %s, %s)', (platform, packaged, available, expected) => {
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
  Object.defineProperty(process, 'resourcesPath', { configurable: true, value: 'test-resources' })
  desktop.isPackaged = packaged
  vi.mocked(existsSync).mockReturnValue(available)
  const environment = new ElectronAppEnvironment()
  expect(environment.getCliAccountCommand()).toBe(expected)
  if (platform === 'win32' && packaged) {
    expect(existsSync).toHaveBeenCalledWith(join('test-resources', 'bin', 'zkyq.exe'))
  } else {
    expect(existsSync).not.toHaveBeenCalled()
  }
})
