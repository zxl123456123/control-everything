// Only confirmed product UI copy belongs here; protocol names and user content stay unchanged.
const en = {
  setupCommand: 'Add a setup command to run when a new worktree is created.',
  detectedSetupCommand: 'Save the detected command to run whenever a worktree is created.',
  savedSetupCommand: 'Runs when a new worktree is created.',
  runtimeUnreachableTitle: 'Cannot connect to the project runtime',
  runtimeUnreachableDescription:
    'The workspace will reload when the runtime responds. Verify existing sessions after reconnecting.',
  remoteServers: 'Remote runtime servers',
  githubProjectAccountDescription:
    "The selected keychain login's short-lived token is injected into each gh call for this project. Project views continue using the active gh login.",
  branchNameDescription: 'Rename automatically created branches from the initial agent task.',
  defaultPrompt: 'Default prompt',
  externalWorktrees: 'External worktrees',
  externalWorktreeSettings: 'Open external worktree settings',
  externalWorktreeHelp: 'This setting never hides worktrees created through this app.',
  externalWorktreeRootHelp: 'Worktrees beneath this folder will be recognized.',
  editorSaveDescription: 'Configure how the editor saves file edits.',
  editorSaveDelay: 'How long the editor waits after your last edit before saving automatically.',
  editorSaveDefault:
    'How long the editor waits after your last edit before saving automatically. First launch defaults to',
  terminalCursor: 'Default cursor appearance for terminal panes.',
  remoteServerDescription:
    'Add a remote runtime server, share this computer, or choose where new projects open.',
  browserServerDescription: 'Connect this browser to a saved runtime server.',
  sshRuntimes: 'Runtimes on your SSH hosts',
  shareRuntimeServer: 'Share this runtime server',
  localClient: 'A browser or workspace client on this computer',
  localClientLink: 'This link only works in a browser or workspace client on this computer.',
  otherClientLink: 'Paste this into Add server on the other workspace client.',
  cursorUsageDescription:
    'Shows your monthly Cursor plan usage from the sign-in already on this computer. Only reads usage; never changes your Cursor login.',
  cursorSessionSource: 'Signed in. Reads the session stored in {{source}}.',
  cursorSession: 'Signed in. Reads the Cursor session stored on this computer.',
  cursorSessionExpired:
    'Sign-in expired — run cursor-agent login on the execution host, then click Refresh usage.'
}

const zh: Record<keyof typeof en, string> = {
  setupCommand: '添加新建工作树时运行的设置命令。',
  detectedSetupCommand: '保存检测到的命令，在每次创建工作树时运行。',
  savedSetupCommand: '在创建新工作树时运行。',
  runtimeUnreachableTitle: '无法连接项目运行组件',
  runtimeUnreachableDescription: '连接恢复后将重新载入工作区。已有会话状态请在恢复后核对。',
  remoteServers: '远程运行服务器',
  githubProjectAccountDescription:
    '此项目的每次 gh 调用会使用所选密钥环登录的短期令牌。项目视图继续使用当前活动的 gh 登录。',
  branchNameDescription: '根据初始智能体任务重命名自动创建的分支。',
  defaultPrompt: '默认提示词',
  externalWorktrees: '外部工作树',
  externalWorktreeSettings: '打开外部工作树设置',
  externalWorktreeHelp: '此设置不会隐藏通过本应用创建的工作树。',
  externalWorktreeRootHelp: '将识别此目录下的工作树。',
  editorSaveDescription: '配置编辑器保存文件修改的方式。',
  editorSaveDelay: '最后一次编辑后，自动保存前等待的时间。',
  editorSaveDefault: '最后一次编辑后，自动保存前等待的时间。首次启动默认值为',
  terminalCursor: '终端窗格的默认光标外观。',
  remoteServerDescription: '添加远程运行服务器、共享此电脑，或选择新项目的打开位置。',
  browserServerDescription: '将此浏览器连接到已保存的运行服务器。',
  sshRuntimes: 'SSH 主机上的运行组件',
  shareRuntimeServer: '共享此运行服务器',
  localClient: '此电脑上的浏览器或工作区客户端',
  localClientLink: '此链接仅适用于此电脑上的浏览器或工作区客户端。',
  otherClientLink: '在另一工作区客户端的“添加服务器”中粘贴此链接。',
  cursorUsageDescription:
    '从此电脑已有的登录信息读取 Cursor 月度套餐用量，只读取用量，不修改 Cursor 登录。',
  cursorSessionSource: '已登录。读取保存在 {{source}} 中的会话。',
  cursorSession: '已登录。读取此电脑上保存的 Cursor 会话。',
  cursorSessionExpired: '登录已过期，请在执行主机运行 cursor-agent login，然后点击刷新用量。'
}

export const PLATFORM_UI_COPY = { en, zh }
export const PLATFORM_UI_NAMESPACE = 'platform'
export const PLATFORM_UI_COPY_KEYS: Partial<Record<string, keyof typeof en>> = {
  'auto.components.sidebar.SetupScriptPromptCardViews.0a98169776': 'setupCommand',
  'auto.components.sidebar.SetupScriptPromptCardViews.aef6c0a213': 'detectedSetupCommand',
  'auto.components.sidebar.SetupScriptPromptCard.a49196d538': 'savedSetupCommand',
  'auto.startup.webHostUnreachable.title': 'runtimeUnreachableTitle',
  'auto.startup.webHostUnreachable.description': 'runtimeUnreachableDescription',
  'auto.components.settings.runtime.environments.search.3517fb2ec0': 'remoteServers',
  'auto.components.settings.Settings.bd0181eeca': 'remoteServers',
  'auto.hooks.useSettingsNavigationMetadata.de0c2907a1': 'remoteServers',
  'auto.components.settings.RepositoryGitHubAccountSection.longDescription':
    'githubProjectAccountDescription',
  'auto.components.settings.source.control.action.recipe.options.branchName':
    'branchNameDescription',
  'platform.repository.defaultPrompt': 'defaultPrompt',
  'auto.components.sidebar.WorktreeVisibilityDialog.83a5ba8dd1': 'externalWorktrees',
  'auto.components.sidebar.SuppressExternalWorktreeInboxDialog.8c0b2e7a41':
    'externalWorktreeSettings',
  'auto.components.sidebar.WorktreeVisibilityHelpPopover.8db4e19a26': 'externalWorktreeHelp',
  'auto.components.sidebar.WorktreeVisibilitySourceList.rootHelp': 'externalWorktreeRootHelp',
  'auto.components.settings.GeneralEditorSettingsSection.d21136d9ef': 'editorSaveDescription',
  'auto.components.settings.GeneralEditorSettingsSection.1bec6d8318': 'editorSaveDelay',
  'auto.components.settings.general.search.8ea61ad55c': 'editorSaveDelay',
  'auto.components.settings.GeneralEditorSettingsSection.8112cd6dcf': 'editorSaveDefault',
  'auto.components.settings.TerminalAppearanceSection.d455f2ef4f': 'terminalCursor',
  'auto.components.settings.terminal.search.275a9d6395': 'terminalCursor',
  'auto.components.settings.runtime.environments.search.addShareDefault': 'remoteServerDescription',
  'auto.components.settings.runtime.environments.search.baec27aa8f': 'browserServerDescription',
  'auto.components.settings.managedServers.search.title': 'sshRuntimes',
  'auto.components.settings.RuntimePairingUrlGenerator.f8500e134a': 'shareRuntimeServer',
  'auto.components.settings.RuntimePairingUrlGenerator.localOnlyHelp': 'localClient',
  'auto.components.settings.RuntimePairingUrlGenerator.localLinkHelp': 'localClientLink',
  'auto.components.settings.RuntimePairingUrlGenerator.accessLinkHelp': 'otherClientLink',
  'auto.components.settings.CursorAccountsSection.subtitle': 'cursorUsageDescription',
  'auto.components.settings.CursorAccountsSection.signedInFrom': 'cursorSessionSource',
  'auto.components.settings.CursorAccountsSection.signedInGeneric': 'cursorSession',
  'auto.components.settings.CursorAccountsSection.expired': 'cursorSessionExpired'
}
