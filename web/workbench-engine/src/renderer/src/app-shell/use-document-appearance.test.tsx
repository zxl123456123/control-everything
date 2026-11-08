// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import { useAppStore } from '../store'

const mocks = vi.hoisted(() => ({
  applyDocumentTheme: vi.fn(),
  buildAppFontFamily: vi.fn((fontFamily: string | null | undefined) => fontFamily ?? '')
}))

vi.mock('../lib/document-theme', () => ({
  applyDocumentTheme: mocks.applyDocumentTheme
}))

vi.mock('@/lib/app-font-family', () => ({
  buildAppFontFamily: mocks.buildAppFontFamily
}))

vi.mock('../runtime/sync-runtime-graph', () => ({
  scheduleRuntimeGraphSync: vi.fn()
}))

import { useDocumentAppearance } from './use-document-appearance'

const initialState = useAppStore.getState()

describe('useDocumentAppearance', () => {
  beforeEach(() => {
    mocks.applyDocumentTheme.mockReset()
    mocks.buildAppFontFamily.mockClear()
    useAppStore.setState({
      settings: {
        ...getDefaultSettings('/tmp'),
        theme: 'dark'
      }
    })
  })

  afterEach(() => {
    useAppStore.setState(initialState, true)
    vi.restoreAllMocks()
    document.documentElement.style.removeProperty('--ce-workbench-opacity')
  })

  it('ignores unrelated settings object replacements', () => {
    const { unmount } = renderHook(() => useDocumentAppearance())

    expect(mocks.applyDocumentTheme).toHaveBeenCalledTimes(1)
    expect(mocks.buildAppFontFamily).toHaveBeenCalledTimes(1)

    act(() => {
      const settings = useAppStore.getState().settings!
      useAppStore.setState({
        settings: { ...settings, editorAutoSave: !settings.editorAutoSave }
      })
    })

    expect(mocks.applyDocumentTheme).toHaveBeenCalledTimes(1)
    expect(mocks.buildAppFontFamily).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('still applies changed theme and font values', () => {
    const { unmount } = renderHook(() => useDocumentAppearance())

    act(() => {
      const settings = useAppStore.getState().settings!
      useAppStore.setState({
        settings: { ...settings, theme: 'light', appFontFamily: 'Monaco' }
      })
    })

    expect(mocks.applyDocumentTheme).toHaveBeenLastCalledWith('light')
    expect(mocks.applyDocumentTheme).toHaveBeenCalledTimes(2)
    expect(mocks.buildAppFontFamily).toHaveBeenLastCalledWith('Monaco')
    expect(mocks.buildAppFontFamily).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('applies saved platform surface opacity without touching terminal opacity', () => {
    vi.spyOn(window.location, 'pathname', 'get').mockReturnValue('/studio')
    useAppStore.setState({
      settings: {
        ...getDefaultSettings('/tmp'),
        workbenchSurfaceOpacity: 0.68,
        terminalBackgroundOpacity: 0.9
      }
    })
    const { unmount } = renderHook(() => useDocumentAppearance())
    expect(document.documentElement.style.getPropertyValue('--ce-workbench-opacity')).toBe('0.68')

    act(() => {
      useAppStore.setState({
        settings: { ...useAppStore.getState().settings!, workbenchSurfaceOpacity: 1 }
      })
    })
    expect(document.documentElement.style.getPropertyValue('--ce-workbench-opacity')).toBe('1')
    expect(useAppStore.getState().settings?.terminalBackgroundOpacity).toBe(0.9)
    unmount()
    expect(document.documentElement.style.getPropertyValue('--ce-workbench-opacity')).toBe('')
  })

  it('clamps an old invalid opacity preference before applying it', () => {
    vi.spyOn(window.location, 'pathname', 'get').mockReturnValue('/studio')
    useAppStore.setState({
      settings: { ...getDefaultSettings('/tmp'), workbenchSurfaceOpacity: -1 }
    })
    const { unmount } = renderHook(() => useDocumentAppearance())
    expect(document.documentElement.style.getPropertyValue('--ce-workbench-opacity')).toBe('0.55')
    unmount()
  })
})
