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
  defaultPrompt: 'Default prompt'
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
  defaultPrompt: '默认提示词'
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
  'platform.repository.defaultPrompt': 'defaultPrompt'
}
