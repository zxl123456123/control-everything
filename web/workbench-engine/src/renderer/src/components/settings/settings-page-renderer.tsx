import { ActiveSettingsSectionProvider, SettingsSectionScopeProvider } from './SettingsSection'
import { SettingsContentScrollElementProvider } from './settings-content-scroll-element'
import { SettingsSidebar } from './SettingsSidebar'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { SettingsInteractionController } from './use-settings-interaction-controller'
import type { SettingsRenderContext } from './settings-render-context'
import {
  renderAccountsSettingsSection,
  renderAgentsSettingsSection,
  renderDesktopCapabilitySettingsSections,
  renderLinearSettingsSection,
  renderOrchestrationSettingsSection
} from './settings-capability-section-renderers'
import {
  renderArtifactsSettingsSection,
  renderSessionHistorySettingsSection,
  renderAutomationsSettingsSection,
  renderGeneralSettingsSection,
  renderIntegrationsSettingsSection,
  renderMobileSettingsSection,
  renderOrcaAccountSettingsSection,
  renderSetupGuideSettingsSection,
  renderShareSkillsSettingsSection
} from './settings-setup-workflow-section-renderers'
import {
  renderGitSettingsSection,
  renderTasksSettingsSection
} from './settings-git-task-section-renderers'
import {
  renderBrowserSettingsSection,
  renderFloatingWorkspaceSettingsSection,
  renderMobileEmulatorSettingsSection,
  renderQuickCommandsSettingsSection,
  renderTerminalSettingsSection
} from './settings-interface-primary-section-renderers'
import {
  renderAppearanceSettingsSection,
  renderChatSettingsSection,
  renderInputSettingsSection,
  renderNotificationsSettingsSection,
  renderShortcutsSettingsSection,
  renderStatsSettingsSection
} from './settings-interface-secondary-section-renderers'
import {
  renderDeveloperPermissionsSettingsSection,
  renderPrivacySettingsSection,
  renderServersSettingsSection,
  renderSshSettingsSection
} from './settings-remote-security-section-renderers'
import {
  renderAdvancedSettingsSection,
  renderDevSettingsSection,
  renderExperimentalSettingsSection,
  renderPluginsSettingsSection
} from './settings-advanced-section-renderers'
import { renderProjectSettingsSections } from './settings-project-section-renderer'
import {
  SettingsHostScopePicker,
  shouldShowSettingsHostScopePicker
} from './SettingsHostScopePicker'

export function renderSettingsLoading(
  interactions: SettingsInteractionController,
  unavailable?: 'environment' | 'entry'
): React.JSX.Element {
  return (
    <div
      ref={interactions.setSettingsRootNode}
      className="settings-view-shell ce-management-surface flex min-h-0 flex-1 overflow-hidden bg-background"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground" role="status">
        {unavailable ? (unavailable === 'environment'
          ? '尚未连接开发环境。请先打开已登记项目，再访问开发偏好。' : '当前设置入口不可用，请返回后选择可用的设置。')
          : translate('auto.components.settings.Settings.c7ad095d96', 'Loading settings...')}
        {unavailable && <button type="button" onClick={() => void interactions.closeSettingsPageWithPromptGuard()}>返回</button>}
      </div>
    </div>
  )
}

export function renderSettingsPage(context: SettingsRenderContext): React.JSX.Element {
  const { model, interactions, navigation, actions, view } = context
  return (
    <div
      ref={interactions.setSettingsRootNode}
      className="settings-view-shell ce-management-surface flex min-h-0 flex-1 overflow-hidden bg-background"
    >
      <SettingsSidebar
        settings={model.settings}
        activeSectionId={model.activeSectionId}
        generalGroups={view.generalNavGroups}
        repoSections={view.repoNavSections}
        hasRepos={model.repos.length > 0}
        showProjects={model.presentation?.scope.kind !== 'global'}
        showSetupGuide={!model.presentation || navigation.navSections.some((section) => section.id === 'setup-guide')}
        searchInputRef={interactions.searchInputRef}
        // Why: deep-links open panes/modals that own focus; plain entry lands in search.
        searchAutoFocus={model.settingsNavigationTarget == null}
        onBack={interactions.closeSettingsPageWithPromptGuard}
        onSelectSection={actions.scrollToSection}
      />

      <div className="settings-content-column flex min-h-0 min-w-0 flex-1 flex-col">
        {!model.isWebClient &&
        shouldShowSettingsHostScopePicker(model.settingsHostScope, model.runtimeEnvironments) ? (
          <SettingsHostScopePicker
            scope={model.settingsHostScope}
            environments={model.runtimeEnvironments}
            onChoose={model.setSettingsHostChoice}
          />
        ) : null}
        <div
          ref={interactions.setContentScrollNode}
          className={cn(
            'min-h-0 flex-1',
            view.isFocusedShortcutsPane ? 'overflow-hidden' : 'overflow-y-auto scrollbar-sleek'
          )}
        >
          <div
            className={cn(
              'settings-content-body mx-auto flex w-full flex-col gap-10 pt-10',
              view.isFocusedShortcutsPane ? 'h-full pb-6' : 'pb-24',
              'max-w-none'
            )}
          >
            {navigation.visibleNavSections.length === 0 ? (
              <div className="flex min-h-[24rem] items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 text-sm text-muted-foreground">
                {translate(
                  'auto.components.settings.Settings.3c88ec55d6',
                  'No settings found for "'
                )}
                {model.settingsSearchQuery.trim()}
                {translate('auto.components.settings.Settings.add3b97ee6', '"')}
              </div>
            ) : (
              <SettingsContentScrollElementProvider value={interactions.contentScrollElement}>
                <SettingsSectionScopeProvider value={model.presentation ? new Set(navigation.navSections.map((section) => section.id)) : undefined}>
                <ActiveSettingsSectionProvider value={model.activeSectionId}>
                  {renderAgentsSettingsSection(context)}
                  {renderAccountsSettingsSection(context)}
                  {renderOrchestrationSettingsSection(context)}
                  {renderLinearSettingsSection(context)}
                  {renderDesktopCapabilitySettingsSections(context)}
                  {renderOrcaAccountSettingsSection(context)}
                  {renderSetupGuideSettingsSection(context)}
                  {renderGeneralSettingsSection(context)}
                  {renderIntegrationsSettingsSection(context)}
                  {renderMobileSettingsSection(context)}
                  {renderAutomationsSettingsSection(context)}
                  {renderArtifactsSettingsSection(context)}
                  {renderShareSkillsSettingsSection(context)}
                  {renderSessionHistorySettingsSection(context)}
                  {renderGitSettingsSection(context)}
                  {renderTasksSettingsSection(context)}
                  {renderTerminalSettingsSection(context)}
                  {renderQuickCommandsSettingsSection(context)}
                  {renderBrowserSettingsSection(context)}
                  {renderMobileEmulatorSettingsSection(context)}
                  {renderFloatingWorkspaceSettingsSection(context)}
                  {renderAppearanceSettingsSection(context)}
                  {renderChatSettingsSection(context)}
                  {renderInputSettingsSection(context)}
                  {renderNotificationsSettingsSection(context)}
                  {renderShortcutsSettingsSection(context)}
                  {renderStatsSettingsSection(context)}
                  {renderServersSettingsSection(context)}
                  {renderSshSettingsSection(context)}
                  {renderDeveloperPermissionsSettingsSection(context)}
                  {renderPrivacySettingsSection(context)}
                  {renderAdvancedSettingsSection(context)}
                  {renderDevSettingsSection(context)}
                  {renderExperimentalSettingsSection(context)}
                  {renderPluginsSettingsSection(context)}
                  {renderProjectSettingsSections(context)}
                </ActiveSettingsSectionProvider>
                </SettingsSectionScopeProvider>
              </SettingsContentScrollElementProvider>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
