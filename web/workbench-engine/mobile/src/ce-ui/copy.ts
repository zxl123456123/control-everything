import type { HubErrorKind } from './hub/hub-client'
import type { InviteErrorKind } from './invite/invite-code'

// All user-facing Chinese copy for the account/device screens. Short on purpose: anything that
// needs a paragraph goes behind an "了解更多" expander (see components/Expandable).

export const copy = {
  account: {
    title: '账号与设备',
    subtitle: '登录后管理你的电脑',
    computers: '我的电脑',
    computersHint: '查看、打开和撤销已绑定的电脑',
    invite: '邀请码激活',
    inviteHint: '输入管理员给你的邀请码',
    pair: '配对新电脑',
    pairHint: '扫码或粘贴电脑上的配对码',
    portal: '在浏览器中打开工作台',
    portalOpening: '正在打开浏览器…',
    portalFailed: '无法打开系统浏览器，请重试。',
    logout: '退出此 App',
    clearRecord: '清除此 App 记录',
    retryLogout: '重试退出',
    retryRestore: '重试恢复',
    session: '此 App 的登录',
    sessionOnly: '仅本次会话有效，重启后需要重新登录',
    sessionRefresh: '已保存，重启后自动恢复',
    member: '成员状态',
    memberUnavailable: '成员状态暂未接入',
    learnMore: [
      '此 App 的账号目前只用于登录与管理，尚不用于电脑连接。',
      '退出此 App 不会结束系统浏览器里的会话，也不会撤销已配对电脑的权限。'
    ]
  },
  login: {
    title: '登录 Control Everything',
    subtitle: '登录或注册，管理你的电脑',
    signIn: '登录 / 注册',
    signingIn: '正在系统浏览器中授权…',
    restoring: '正在恢复账号…',
    retry: '重新登录',
    unconfigured: '此安装包未配置登录',
    unconfiguredBody: '请联系发行者获取已配置的安装包。',
    invalid: '登录配置不可用',
    invalidBody: '此安装包的登录配置无法使用，请联系发行者。',
    failedTitle: '登录没有完成',
    recoveryTitle: '账号恢复失败',
    learnMore: [
      '点击后会在系统浏览器中完成登录，App 不会看到你的密码。',
      '登录凭据保存在本机的安全存储中。'
    ]
  },
  computers: {
    title: '我的电脑',
    subtitle: '你有权限访问的电脑',
    emptyTitle: '还没有绑定电脑',
    emptyBody: '在电脑上安装 Control Everything，然后配对。',
    pairCta: '配对新电脑',
    unavailableTitle: '此版本暂未接入电脑列表',
    unavailableBody: '可以先在浏览器里查看和管理电脑。',
    errorTitle: '没能加载电脑',
    retry: '重试',
    lastSeen: '最近在线',
    boundAt: '绑定时间',
    system: '系统',
    version: '版本',
    revokeTitle: '撤销这台电脑',
    revokeSlide: '滑动以撤销连接',
    revokeBody: '撤销后，这台电脑将无法再被此账号连接。需要重新配对才能恢复。',
    revoking: '正在撤销…',
    revokeDone: '连接已撤销',
    revokeFailed: '撤销失败，请重试',
    close: '关闭',
    os: { windows: 'Windows', macos: 'macOS', linux: 'Linux', unknown: '未知系统' }
  },
  invite: {
    title: '邀请码激活',
    subtitle: '输入管理员给你的邀请码',
    submit: '激活',
    submitting: '正在激活…',
    paste: '粘贴',
    clear: '清除',
    successTitle: '已激活',
    successBody: '你现在可以管理自己的电脑了。',
    done: '完成',
    hint: '邀请码区分大小写，共 16 位以上',
    learnMore: [
      '邀请码只能使用一次，并且有有效期。',
      '如果提示已过期或已使用，请向管理员重新索取。'
    ]
  },
  pair: {
    title: '配对新电脑',
    subtitle: '扫描电脑上的二维码',
    paste: '改为粘贴配对码',
    pasteTitle: '粘贴配对码',
    pastePlaceholder: 'orca://pair?code=… 或配对码',
    pasteSubmit: '配对',
    connecting: '正在连接电脑…',
    cancel: '取消',
    retry: '重试',
    cameraNeeded: '需要相机权限才能扫码',
    allowCamera: '允许使用相机',
    invalidQr: '这不是有效的配对二维码',
    invalidCode: '配对码无效，请从电脑上重新复制',
    timeout: '连接超时，请确认电脑在线后重试',
    failed: '配对失败，请重试',
    learnMore: [
      '在电脑端的 Control Everything 里打开“配对手机”，会显示二维码和配对码。',
      '手机和电脑需要能互相访问网络。'
    ]
  },
  expired: {
    title: '登录已过期',
    body: '重新登录后继续使用。',
    action: '重新登录',
    sheetTitle: '重新登录',
    sheetBody: '将打开系统浏览器完成登录。已绑定的电脑不会受影响。',
    later: '稍后再说'
  },
  logout: {
    sheetTitle: '退出此 App？',
    body: '会清除此 App 保存的登录凭据。',
    confirm: '退出',
    cancel: '取消',
    learnMore: [
      '不会结束系统浏览器里的会话。',
      '不会撤销已配对电脑的权限。',
      '如果身份服务支持，会同时通知它撤销本机授权。'
    ]
  },
  mock: {
    note: '以下为演示数据，不是你的真实账号或电脑。'
  }
} as const

export const hubErrorCopy: Record<HubErrorKind, { title: string; body: string }> = {
  'invalid-invite': { title: '邀请码无效', body: '请检查是否输入完整，注意区分大小写。' },
  'expired-invite': { title: '邀请码已过期', body: '请向管理员重新索取邀请码。' },
  'used-invite': { title: '邀请码已被使用', body: '每个邀请码只能使用一次。' },
  'rate-limited': { title: '尝试太频繁', body: '请稍后再试。' },
  unauthorized: { title: '登录已失效', body: '请重新登录后再试。' },
  network: { title: '网络不可用', body: '请检查网络后重试。' },
  unavailable: { title: '此版本暂未接入', body: '这项功能还在开发中。' },
  'member-disabled': { title: '此账号已被停用', body: '请联系管理员恢复访问。' },
  'not-found': { title: '找不到这台电脑', body: '它可能已被移除，请下拉刷新列表。' }
}

export function hubErrorToInviteError(kind: HubErrorKind): InviteErrorKind {
  switch (kind) {
    case 'invalid-invite':
      return 'invalid'
    case 'expired-invite':
      return 'expired'
    case 'used-invite':
      return 'used'
    case 'rate-limited':
      return 'rate-limited'
    case 'unauthorized':
      return 'unauthorized'
    case 'unavailable':
      return 'unavailable'
    case 'member-disabled':
      return 'disabled'
    default:
      return 'network'
  }
}

export const inviteErrorCopy: Record<InviteErrorKind, { title: string; body: string }> = {
  invalid: hubErrorCopy['invalid-invite'],
  expired: hubErrorCopy['expired-invite'],
  used: hubErrorCopy['used-invite'],
  'rate-limited': hubErrorCopy['rate-limited'],
  unauthorized: hubErrorCopy.unauthorized,
  network: hubErrorCopy.network,
  unavailable: hubErrorCopy.unavailable,
  disabled: hubErrorCopy['member-disabled'],
  'clipboard-empty': { title: '剪贴板是空的', body: '先复制邀请码，再点“粘贴”。' }
}

export function toHubErrorKind(error: unknown): HubErrorKind {
  const kind = (error as { kind?: unknown } | null)?.kind
  return typeof kind === 'string' && kind in hubErrorCopy ? (kind as HubErrorKind) : 'network'
}
