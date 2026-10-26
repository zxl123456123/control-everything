// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ActiveSettingsSectionProvider, SettingsSection, SettingsSectionScopeProvider } from './SettingsSection'

describe('settings content scope', () => {
  it('prevents forceVisible and a stale active section from rendering outside the directory scope', () => {
    let mounted = false
    function Field() { mounted = true; return <input aria-label="other project field" /> }
    const markup = renderToStaticMarkup(
      <SettingsSectionScopeProvider value={new Set(['repo-b'])}>
        <ActiveSettingsSectionProvider value="repo-a">
          <SettingsSection id="repo-a" title="A" description="" forceVisible><Field /></SettingsSection>
        </ActiveSettingsSectionProvider>
      </SettingsSectionScopeProvider>
    )
    expect(markup).toBe('')
    expect(mounted).toBe(false)
  })
  it('retains the original standalone force-visible behavior without a scope', () => {
    const markup = renderToStaticMarkup(<SettingsSection id="general" title="General" description="" forceVisible><input aria-label="field" /></SettingsSection>)
    expect(markup).toContain('aria-label="field"')
  })
})
