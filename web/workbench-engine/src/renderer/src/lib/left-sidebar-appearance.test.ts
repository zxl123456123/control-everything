// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import { resolveLeftSidebarStyleVariables } from './left-sidebar-appearance'

afterEach(() => {
  delete document.documentElement.dataset.platformView
})

describe('platform sidebar appearance', () => {
  it('keeps platform chrome neutral without changing stored tint or terminal colors', () => {
    const settings = {
      ...getDefaultSettings('/tmp'),
      leftSidebarAppearanceMode: 'tinted' as const,
      leftSidebarTintColor: '#abcdef'
    }
    const saved = JSON.stringify(settings)
    expect(resolveLeftSidebarStyleVariables(settings, false)).toHaveProperty('--sidebar')
    document.documentElement.dataset.platformView = 'workspace'
    expect(resolveLeftSidebarStyleVariables(settings, false)).toBeUndefined()
    expect(JSON.stringify(settings)).toBe(saved)
  })
})
