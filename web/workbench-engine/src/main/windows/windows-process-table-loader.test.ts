import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const file = vi.hoisted(() => ({ path: 'C:/example/windows-process-tree.node', bytes: 'patched-addon-fixture' }))
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>()
  return { ...actual, readFileSync: (...args: Parameters<typeof actual.readFileSync>) =>
    args[0] === file.path ? Buffer.from(file.bytes) : actual.readFileSync(...args) }
})
import {
  __setWindowsProcessTreeRequireForTests,
  isWindowsProcessStartTimeAvailable,
  isWindowsProcessTableAvailable,
  readWindowsProcessCreationTime
} from './windows-process-table'

const platform = Object.getOwnPropertyDescriptor(process, 'platform')
const sibling = './windows-process-tree.node'
const npm = '@vscode/windows-process-tree'
const packaged = { ProcessDataFlag: { None: 0, CommandLine: 2, CreationTime: 4 },
  supportedProcessDataFlags: 7, getProcessCreationTime: () => 111, getAllProcesses: vi.fn() }

beforeEach(() => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
  file.bytes = 'patched-addon-fixture'
})
afterEach(() => {
  __setWindowsProcessTreeRequireForTests()
  if (platform) Object.defineProperty(process, 'platform', platform)
})

it('chooses the deployed sibling even when an ancestor npm package is installed', () => {
  const native = { supportedProcessDataFlags: 7, getProcessCreationTime: vi.fn(() => 222), getProcessList: vi.fn() }
  const load = Object.assign(vi.fn((specifier: string) => specifier === sibling ? native : packaged),
    { resolve: vi.fn(() => file.path) })
  __setWindowsProcessTreeRequireForTests(load)
  expect(isWindowsProcessTableAvailable()).toBe(true)
  expect(isWindowsProcessStartTimeAvailable()).toBe(true)
  expect(readWindowsProcessCreationTime(12)).toBe(222)
  expect(load).toHaveBeenCalledWith(sibling)
  expect(load).not.toHaveBeenCalledWith(npm)
  expect(native.getProcessList).not.toHaveBeenCalled()
})

it.each(['load-error', 'bad-shape', 'unpatched'])(
  'keeps a present but bad deployed sibling unavailable without npm fallback: %s', (failure) => {
    file.bytes = failure === 'unpatched' ? 'ReadProcessMemory' : 'patched-addon-fixture'
    const load = Object.assign(vi.fn((specifier: string) => {
      if (specifier === npm) return packaged
      if (failure === 'load-error') throw new Error('fixture addon rejected')
      return failure === 'bad-shape' ? {} : { supportedProcessDataFlags: 7, getProcessList: vi.fn() }
    }), { resolve: vi.fn(() => file.path) })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      __setWindowsProcessTreeRequireForTests(load)
      expect(isWindowsProcessTableAvailable()).toBe(false)
      expect(isWindowsProcessStartTimeAvailable()).toBe(false)
      expect(readWindowsProcessCreationTime(12)).toBeNull()
      expect(load).not.toHaveBeenCalledWith(npm)
    } finally {
      warning.mockRestore()
    }
  }
)

it('keeps the desktop npm path when no deployed sibling exists', () => {
  const load = Object.assign(vi.fn(() => packaged), {
    resolve: vi.fn(() => { throw Object.assign(new Error('fixture missing'), { code: 'MODULE_NOT_FOUND' }) })
  })
  __setWindowsProcessTreeRequireForTests(load)
  expect(isWindowsProcessTableAvailable()).toBe(true)
  expect(readWindowsProcessCreationTime(12)).toBe(111)
  expect(load).toHaveBeenCalledWith(npm)
  expect(load).not.toHaveBeenCalledWith(sibling)
})
