import { useSettingsStoreModel } from './use-settings-store-model'
import { useSettingsInteractionController } from './use-settings-interaction-controller'
import { useSettingsPageEffects } from './use-settings-page-effects'
import { useSettingsNavigationModel } from './use-settings-navigation-model'
import { useSettingsTerminalModel } from './use-settings-terminal-model'
import { useSettingsRepoScrollEffects } from './use-settings-repo-scroll-effects'
import { buildSettingsViewModel, useSettingsNavigationActions } from './settings-view-model'
import { renderSettingsLoading, renderSettingsPage } from './settings-page-renderer'
import type { LoadedSettingsStoreModel, SettingsRenderContext } from './settings-render-context'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { SettingsDraftContext, resolvePlatformSettingsTarget } from '@/web/platform-settings-navigation'
import { ManagementSurfaceProvider, ManagementSurfaceVisibleProvider } from '../ui/management-surface'
import { ConfirmationDialogContext } from '../confirmation-dialog-context'
import { isSettingsSectionInScope } from '@/lib/settings-navigation-types'

function Settings(): React.JSX.Element {
  const model = useSettingsStoreModel()
  const interactions = useSettingsInteractionController(model)
  const navigation = useSettingsNavigationModel(model, interactions)
  useSettingsPageEffects(model, interactions, navigation.navSections)
  const terminal = useSettingsTerminalModel(model, navigation)
  useSettingsRepoScrollEffects(model, interactions, navigation, terminal)
  const actions = useSettingsNavigationActions(model, interactions)
  const presentation = model.presentation
  const unavailable = presentation?.scope.kind === 'global' && presentation.scope.entry === 'development' &&
    !presentation.scope.environmentId ? 'environment' as const : undefined
  const catalog = {
    repos: model.repos, projects: model.settingsProjectList, sections: navigation.navSections
  }
  const resolved = presentation ? resolvePlatformSettingsTarget(presentation.scope, catalog, presentation.initialTarget) ??
    (presentation.scope.kind === 'global' && !presentation.initialTarget?.intent
      ? resolvePlatformSettingsTarget(presentation.scope, catalog) : null) : null
  const targetKey = resolved ? JSON.stringify([
    presentation?.scope.kind === 'project' ? { ...presentation.scope, name: undefined } : presentation?.scope,
    resolved.target
  ]) : ''
  const appliedTarget = useRef('')
  useEffect(() => {
    if (presentation?.visible === false) {
      appliedTarget.current = ''
      return
    }
    if (!resolved || !model.settings || appliedTarget.current === targetKey) return
    appliedTarget.current = targetKey
    // An existing validated Cmd+J/subsection intent is consumed by the original page effect once.
    if (presentation && model.settingsNavigationTarget &&
      model.settingsNavigationTarget.pane === resolved.target.pane && resolvePlatformSettingsTarget(presentation.scope, {
        repos: model.repos, projects: model.settingsProjectList, sections: navigation.navSections
      }, model.settingsNavigationTarget)) return
    useAppStore.getState().openSettingsTarget(resolved.target)
  }, [targetKey, model.settings, resolved, presentation, model.settingsNavigationTarget,
    model.repos, model.settingsProjectList, navigation.navSections])
  const initialReady = presentation?.visible !== false && resolved && model.settings && !model.settingsNavigationTarget &&
    model.activeSectionId === resolved.ready.sectionId ? resolved.ready : null
  const [enteredTarget, setEnteredTarget] = useState('')
  useEffect(() => {
    if (presentation?.visible === false || !resolved) setEnteredTarget('')
    else if (initialReady) setEnteredTarget(targetKey)
    else setEnteredTarget((current) => current === targetKey ? current : '')
  }, [presentation?.visible, resolved, initialReady, targetKey])
  const ready = initialReady ?? (
    presentation?.visible !== false && presentation?.scope.kind === 'global' && resolved &&
    enteredTarget === targetKey && model.settings && !model.settingsNavigationTarget &&
    isSettingsSectionInScope(model.activeSectionId, presentation.scope) &&
    navigation.navSections.some((section) => section.id === model.activeSectionId)
      ? resolved.ready : null
  )
  const readyKey = JSON.stringify(ready)
  useEffect(() => {
    presentation?.onReady?.(ready)
    // The callback and canonical ready identity are the handshake, not catalog object churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentation?.onReady, readyKey])
  useEffect(() => () => presentation?.onReady?.(null), [presentation?.onReady])

  if (!model.settings) {
    return renderSettingsLoading(interactions, unavailable)
  }

  const view = buildSettingsViewModel(model, navigation)
  const context: SettingsRenderContext = {
    model: model as LoadedSettingsStoreModel,
    interactions,
    navigation,
    terminal,
    actions,
    view
  }
  return (
    <ManagementSurfaceProvider value={true}>
    <ManagementSurfaceVisibleProvider value={presentation?.visible === true && ready !== null}>
    <SettingsDraftContext.Provider value={interactions.draftContext}>
    <ConfirmationDialogContext.Provider value={model.confirm}>
      {presentation && (!resolved || presentation.visible === false) ? renderSettingsLoading(interactions,
        unavailable ?? (presentation.scope.kind === 'global' && navigation.navSections.length > 0 ? 'entry' : undefined)
      ) : renderSettingsPage(context)}
    </ConfirmationDialogContext.Provider>
    </SettingsDraftContext.Provider>
    </ManagementSurfaceVisibleProvider>
    </ManagementSurfaceProvider>
  )
}

export default Settings
