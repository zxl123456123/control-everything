import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n, setRendererUiLanguage, translate } from './i18n'
import { PLATFORM_UI_COPY_KEYS } from './platform-ui-copy'
import { commandTemplateStateLabel } from '../components/settings/repository-source-control-ai-labels'
import { DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES } from '../../../shared/source-control-ai-actions'
import { buildRemoteSettingsSections } from '../hooks/settings-navigation-remote-sections'
import { getWebRuntimeEnvironmentsSearchEntry } from '../components/settings/runtime-environments-search'

const setupKey = 'auto.components.sidebar.SetupScriptPromptCardViews.0a98169776'
const setupFallback = 'Add a setup command to run when Orca creates new worktrees.'
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

  it('preserves user interpolation, compatibility names, attribution and unknown keys', () => {
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
})
