import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n, setRendererUiLanguage, translate } from './i18n'
import { PLATFORM_UI_COPY_KEYS } from './platform-ui-copy'
import { commandTemplateStateLabel } from '../components/settings/repository-source-control-ai-labels'
import { DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES } from '../../../shared/source-control-ai-actions'
import { buildRemoteSettingsSections } from '../hooks/settings-navigation-remote-sections'
import { getWebRuntimeEnvironmentsSearchEntry } from '../components/settings/runtime-environments-search'

const setupKey = 'auto.components.sidebar.SetupScriptPromptCardViews.0a98169776'
const setupFallback = 'Add a setup command to run when Orca creates new worktrees.'
const dailySurfaceCopy = [
  [
    'settings.appearance.statusBar.sshToggleDescription',
    'Show configured SSH and remote Orca hosts when any are available.',
    'Show configured SSH and remote runtime hosts when any are available.',
    '有可用主机时，显示已配置的 SSH 主机和远程运行主机。'
  ],
  [
    'auto.components.settings.TerminalThemeSections.d56af60e6f',
    'Choose the theme used when Orca is in light mode.',
    'Choose the terminal theme used in light mode.',
    '选择浅色模式下使用的终端主题。'
  ],
  [
    'auto.components.settings.TerminalPane.69724e8f0c',
    'Choose what Orca opens for new local terminal panes.',
    'Choose the shell opened for new local terminal panes.',
    '选择新建本机终端窗格时使用的 Shell。'
  ],
  [
    'auto.components.settings.TerminalPane.59573d0b33',
    'Enter a shell name on PATH or an executable path. Orca starts it as a login shell.',
    'Enter a shell name on PATH or an executable path. The app starts it as a login shell.',
    '输入 PATH 中的 Shell 名称或可执行文件路径。本应用将以登录 Shell 启动它。'
  ],
  [
    'auto.components.sidebar.AddRepoCreateStep.b100311784',
    'Name it and Orca will create a real project with sensible defaults.',
    'Name your project to create it with sensible defaults.',
    '为项目命名，使用合理的默认设置创建项目。'
  ],
  [
    'auto.App.03a14f6b5b',
    'Retry the page or navigate to another Orca surface.',
    'Retry the page or navigate to another workspace view.',
    '重试此页面，或切换到其他工作区页面。'
  ]
] as const
const prompt = () =>
  commandTemplateStateLabel({
    hasOverride: false,
    inheritedTemplate: DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES.commitMessage,
    actionId: 'commitMessage'
  })

describe('platform UI copy through the existing translation entry', () => {
  beforeEach(async () => {
    vi.stubGlobal('window', { location: { pathname: '/workbench/web-index.html' } })
    await i18n.changeLanguage('en')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await i18n.changeLanguage('en')
  })

  it.each(['en', 'zh'] as const)(
    'uses neutral confirmed copy in %s without rewriting the upstream catalog',
    async (language) => {
      await setRendererUiLanguage(language)
      expect(translate(setupKey, setupFallback)).toBe(
        language === 'zh'
          ? '添加新建工作树时运行的设置命令。'
          : 'Add a setup command to run when a new worktree is created.'
      )
      expect(translate('auto.startup.webHostUnreachable.description', 'Original fallback')).toBe(
        language === 'zh'
          ? '连接恢复后将重新载入工作区。已有会话状态请在恢复后核对。'
          : 'The workspace will reload when the runtime responds. Verify existing sessions after reconnecting.'
      )
      expect(prompt()).toBe(language === 'zh' ? '默认提示词' : 'Default prompt')
      for (const key of Object.keys(PLATFORM_UI_COPY_KEYS))
        expect(translate(key, 'Orca fallback')).not.toMatch(/Orca|Original fallback/)
      expect(i18n.t(setupKey, { ns: 'translation', defaultValue: setupFallback })).toContain('Orca')
    }
  )

  it.each(['/web-index.html', '/workbench/other.html', '/workbench/web-index.html/', '/'])(
    'preserves standalone and other paths: %s',
    (pathname) => {
      window.location.pathname = pathname
      expect(translate(setupKey, setupFallback)).toBe(setupFallback)
      expect(prompt()).toBe('Orca default prompt')
      for (const [key, fallback] of dailySurfaceCopy) {
        expect(translate(key, fallback)).toBe(fallback)
      }
    }
  )

  it.each(['en', 'zh'] as const)(
    'preserves settings and recovery meaning on both platform routes in %s',
    async (language) => {
      await setRendererUiLanguage(language)
      for (const pathname of ['/studio', '/workbench/web-index.html']) {
        window.location.pathname = pathname
        for (const [key, fallback, en, zh] of dailySurfaceCopy) {
          expect(translate(key, fallback)).toBe(language === 'zh' ? zh : en)
          expect(i18n.t(key, { ns: 'translation', defaultValue: fallback })).toContain('Orca')
        }
      }
    }
  )

  it.each(['/studio', '/workbench/web-index.html'])(
    'uses the same daily UI names on the real platform route %s',
    async (pathname) => {
      window.location.pathname = pathname
      await setRendererUiLanguage('zh')
      expect(
        translate(
          'auto.components.sidebar.WorktreeVisibilityDialog.83a5ba8dd1',
          'Non-Orca worktrees'
        )
      ).toBe('外部工作树')
      expect(
        translate('auto.components.settings.GeneralEditorSettingsSection.d21136d9ef', 'Orca editor')
      ).toBe('配置编辑器保存文件修改的方式。')
      expect(
        translate('auto.components.settings.TerminalAppearanceSection.d455f2ef4f', 'Orca cursor')
      ).toBe('终端窗格的默认光标外观。')
      expect(
        translate(
          'auto.components.settings.CursorAccountsSection.signedInFrom',
          'Orca reads {{source}}',
          {
            source: 'Orca user keychain'
          }
        )
      ).toBe('已登录。读取保存在 Orca user keychain 中的会话。')
    }
  )

  it.each(['en', 'zh'] as const)(
    'uses the platform server title in the real settings navigation in %s',
    async (language) => {
      await setRendererUiLanguage(language)
      const serverSection = () =>
        buildRemoteSettingsSections(
          {
            isMac: false,
            isWindows: true,
            isLocalWindowsHost: false,
            isWindowsTerminalHost: true,
            isWebClient: true,
            nativeChatEnabled: false,
            hostQueuesMessages: false,
            managedBrowserCreationEnabled: false,
            mobileEmulatorCreationEnabled: false,
            isDev: false,
            isLinearConnected: false,
            repos: []
          },
          getWebRuntimeEnvironmentsSearchEntry(),
          new Map()
        ).find((section) => section.id === 'servers')
      expect(serverSection()?.title).toBe(
        language === 'zh' ? '远程运行服务器' : 'Remote runtime servers'
      )
      window.location.pathname = '/web-index.html'
      expect(serverSection()?.title).toBe(
        language === 'zh' ? '远程 Orca 服务器' : 'Remote Orca Servers'
      )
    }
  )

  it.each(['en', 'zh'] as const)('preserves user copy and technical names in %s', async (language) => {
    await setRendererUiLanguage(language)
    expect(
      translate(
        'platform.test.userCopy',
        '{{project}} · orca.yaml · $ORCA_ROOT_PATH · Orca MIT License',
        { project: 'Orca user project' }
      )
    ).toBe('Orca user project · orca.yaml · $ORCA_ROOT_PATH · Orca MIT License')
    expect(
      commandTemplateStateLabel({
        hasOverride: true,
        inheritedTemplate: '',
        actionId: 'commitMessage'
      })
    ).toBe('Repository custom prompt')
    expect(
      commandTemplateStateLabel({
        hasOverride: false,
        inheritedTemplate: 'Orca user prompt',
        actionId: 'commitMessage'
      })
    ).toBe('Global custom prompt')
  })

  it('keeps the Chinese translation bundle unloaded until the existing lazy loader fetches it', async () => {
    i18n.removeResourceBundle('zh', 'translation')
    expect(i18n.hasResourceBundle('zh', 'platform')).toBe(true)
    expect(i18n.hasResourceBundle('zh', 'translation')).toBe(false)
    const request = vi.spyOn(globalThis, 'fetch')
    await setRendererUiLanguage('zh')
    expect(request).toHaveBeenCalled()
    expect(i18n.hasResourceBundle('zh', 'translation')).toBe(true)
    expect(translate('menu.file', 'File')).not.toBe('File')
    expect(translate(setupKey, setupFallback)).toBe('添加新建工作树时运行的设置命令。')
  })

  it.each(['en', 'zh'] as const)(
    'keeps account scope and CLI constraints in concise %s copy',
    async (language) => {
      await setRendererUiLanguage(language)
      expect(
        translate('auto.components.settings.Settings.ad6c529693', 'AI Provider Accounts')
      ).toBe(language === 'zh' ? 'AI 账号' : 'AI accounts')
      expect(
        translate('accounts.remoteScopeAccountsAddHere', '', { value0: 'Orca user host' })
      ).toContain('Orca user host')
      const help = translate('accounts.managedData.description', '')
      expect(help).toContain('SSH')
      expect(help).toContain('WSL')
      expect(help).not.toContain('Orca')
      for (const key of [
        'auto.components.settings.AccountsPane.d676c41fc6',
        'auto.components.web.preloadApi.cursorAccounts.hostOnly',
        'auto.components.settings.ZcodePlanAccountsSection.detailsUnavailable',
        'auto.components.settings.ZcodePlanAccountsSection.hostOnly',
        'settings.terminal.windows.administratorScope',
        'settings.terminal.windows.launchAdministrator'
      ]) {
        expect(translate(key, 'Orca fallback')).not.toContain('Orca')
      }
      expect(translate('auto.components.settings.usageCredentialHost.cookieNeedsDesktop', '', {
        host: 'Orca user host'
      })).toContain('Orca user host')
      expect(
        translate('auto.components.settings.AccountsPane.opencodeGo.apiKey.description', '')
      ).toContain('OPENCODE_API_KEY')
      expect(translate('auto.components.sidebar.WorkspaceKanbanPinDropTarget.c30151c5ee', '')).toBe(
        language === 'zh' ? '拖入固定，状态不变' : 'Drop to pin · Keep status'
      )
      window.location.pathname = '/web-index.html'
      expect(translate('accounts.managedData.setup', 'Setup instructions')).toBe(
        'Setup instructions'
      )
    }
  )
})
