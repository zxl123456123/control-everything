/*
 * Optional code-host connection in the Studio (GitHub through the local gh CLI).
 *   window.StudioCodeHost.mountStrip(host, {api, unified, storage?}) -> {show(projectId|null), dispose()}
 *     a dismissible one-line strip above a GitHub project's pages;
 *   window.StudioCodeHost.mountSettings(container, {api, unified}) -> dispose()
 *     the "代码托管连接（可选）" card, appended to the Studio settings page.
 * Only read-only status comes from GET /api/workspace/code-host (account name, never a credential). Connecting is not done here:
 * inside Orca the button opens Orca's own Settings > Integrations (the GitHub card there installs/checks gh); on a plain
 * Studio page it copies `gh auth login`. This is separate from the Keycloak account login (members, devices, invites).
 * The strip's markup/spacing follows the existing .ce-setup-notice; no code is copied from Orca.
 */
(() => {
  'use strict';
  const COMMAND = 'gh auth login';
  const DISMISS_KEY = 'ce-studio-code-host-dismissed';
  const INTEGRATIONS_HASH = '#settings/integrations';
  const INSTALL_URL = 'https://cli.github.com/';
  const scope = typeof window !== 'undefined' ? window : globalThis;
  const SEPARATION = '这与“账号登录（Keycloak）”无关：账号登录管成员、设备与邀请；代码托管连接只管 PR、Issue 与检查结果。两者互不相通。';

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /** Maps the backend answer to one of: connected, signed-out, missing, unknown (null when it is not a GitHub project). */
  function describe(value, {needProject = true} = {}) {
    const github = value && value.tools && value.tools.github;
    if (needProject && (!value || !value.project || value.project.provider !== 'github')) return null;
    if (!github || github.unavailable) return {state: 'unknown', user: ''};
    if (!github.installed) return {state: 'missing', user: ''};
    return github.authenticated ? {state: 'connected', user: github.user || ''} : {state: 'signed-out', user: ''};
  }

  const LABEL = {
    connected: user => user ? `已连接 @${user}` : '已连接',
    'signed-out': () => '未连接',
    missing: () => '未安装 gh',
    unknown: () => '暂时读取不到',
  };
  const TONE = {connected: 'success', 'signed-out': 'warning', missing: 'warning', unknown: 'neutral'};

  function query(projectId, refresh) {
    const parts = [];
    if (projectId) parts.push('project_id=' + encodeURIComponent(projectId));
    if (refresh) parts.push('refresh=1');
    return '/api/workspace/code-host' + (parts.length ? '?' + parts.join('&') : '');
  }

  async function copyCommand() {
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('unavailable');
      await navigator.clipboard.writeText(COMMAND);
      return true;
    } catch (_) { return false; }
  }

  function defaultStorage() {
    try { return scope.CERemoteContext ? scope.CERemoteContext.storage('localStorage') : scope.localStorage; } catch (_) { return null; }
  }

  function integrationsLink(label, className = 'ce-button') {
    const link = make('a', className, label);
    link.href = INTEGRATIONS_HASH;
    return link;
  }

  /** The "connect" control: Orca's integrations page when embedded in Orca, otherwise a copy button. */
  function connectControl({state, unified, onCopied, className = 'ce-button'}) {
    if (state === 'missing' && !unified) {
      const link = make('a', className, '安装 gh');
      link.href = INSTALL_URL; link.target = '_blank'; link.rel = 'noopener noreferrer';
      return link;
    }
    if (unified) return integrationsLink('连接', className);
    const button = make('button', className, '复制 ' + COMMAND);
    button.type = 'button';
    button.addEventListener('click', async () => onCopied(await copyCommand()));
    return button;
  }

  function mountStrip(host, {api, unified = false, storage} = {}) {
    storage = storage === undefined ? defaultStorage() : storage;
    let disposed = false, ticket = 0, shownFor = null;
    const dismissed = () => { try { return storage?.getItem(DISMISS_KEY) === '1'; } catch (_) { return false; } };
    function hide() { ticket += 1; host.hidden = true; host.replaceChildren(); }
    function paint({state, user}) {
      const strip = make('div', 'ce-code-host'); strip.dataset.state = state;
      strip.setAttribute('role', 'status');
      const dot = make('span', 'ce-code-host-dot'); dot.setAttribute('aria-hidden', 'true');
      const text = make('span', 'ce-code-host-text');
      text.append(make('strong', '', '代码托管（可选）'), make('span', 'ce-code-host-state', LABEL[state](user)),
        make('span', 'ce-code-host-note', '只用于 PR、Issue 和检查结果；不连接也能完整使用。'));
      const live = make('span', 'ce-code-host-live'); live.setAttribute('aria-live', 'polite');
      const actions = make('span', 'ce-code-host-actions');
      if (state === 'signed-out' || state === 'missing') {
        actions.append(connectControl({state, unified, onCopied: ok => { live.textContent = ok ? `已复制，请在终端运行 ${COMMAND}` : `无法复制，请手动运行 ${COMMAND}`; }}), live);
      }
      const close = make('button', 'ce-iconbtn ce-code-host-close'); close.type = 'button';
      close.setAttribute('aria-label', '关闭代码托管提示'); close.title = '关闭，之后可在 设置 里查看';
      close.textContent = '×';
      close.addEventListener('click', () => {
        try { storage?.setItem(DISMISS_KEY, '1'); } catch (_) { /* Without storage the strip only hides for this page. */ }
        hide();
      });
      strip.append(dot, text, actions, close);
      host.replaceChildren(strip);
      host.hidden = false;
    }
    return {
      /** projectId = a project page that Studio renders itself; null hides the strip. */
      async show(projectId) {
        if (disposed || projectId === shownFor) return;
        shownFor = projectId;
        const mine = ++ticket;
        if (!projectId || dismissed()) { hide(); return; }
        let value;
        try { value = await api(query(projectId)); } catch (_) { value = null; }
        if (disposed || mine !== ticket) return;
        const shown = describe(value);
        if (!shown || shown.state === 'unknown') { hide(); return; }
        paint(shown);
      },
      dispose() { disposed = true; hide(); },
    };
  }

  function mountSettings(container, {api, unified = false} = {}) {
    const page = make('div', 'ce-settings-page ce-code-host-settings');
    const group = make('section', 'ce-settings-group ce-code-host-card'); group.setAttribute('aria-labelledby', 'studio-code-host-title');
    const head = make('div', 'ce-setting-row ce-code-host-head');
    const text = make('div', 'ce-setting-text');
    const title = make('h3', '', '代码托管连接（可选）'); title.id = 'studio-code-host-title';
    text.append(title, make('p', '', '登录本机的 GitHub 命令行 gh 后，Studio 才能为 GitHub 项目显示 PR、Issue 和检查结果。不登录也能照常使用其他功能；这些数据只在你的电脑上读取，不会上传。'));
    const status = make('span', 'ce-code-host-badge', '正在读取…'); status.dataset.tone = 'neutral'; status.setAttribute('role', 'status');
    head.append(text, status);
    const body = make('div', 'ce-setting-row ce-code-host-body');
    const hint = make('p', 'ce-code-host-hint', ''); hint.setAttribute('aria-live', 'polite');
    const actions = make('div', 'ce-code-host-actions');
    body.append(hint, actions);
    const separation = make('p', 'ce-code-host-separation', SEPARATION);
    group.append(head, body);
    page.append(make('h2', 'ce-code-host-label', '代码托管'), group, separation);
    container.append(page);

    let disposed = false, ticket = 0;
    const live = make('span', 'ce-code-host-live'); live.setAttribute('aria-live', 'polite');
    const copy = make('button', 'ce-button ce-press', '复制 ' + COMMAND); copy.type = 'button';
    copy.addEventListener('click', async () => { live.textContent = (await copyCommand()) ? `已复制，请在终端运行 ${COMMAND}` : `无法复制，请手动运行 ${COMMAND}`; });
    const recheck = make('button', 'ce-button ce-plain ce-press', '重新检测'); recheck.type = 'button';
    recheck.addEventListener('click', () => load(true));

    function paint(shown) {
      const state = shown ? shown.state : 'unknown';
      status.textContent = LABEL[state](shown && shown.user);
      status.dataset.tone = TONE[state];
      hint.textContent = state === 'connected' ? 'gh 已登录，Studio 不保存也不读取你的令牌。'
        : state === 'missing' ? '这台电脑还没有安装 GitHub 命令行 gh（cli.github.com）。装好后再回来重新检测。'
        : state === 'signed-out' ? `在终端运行 ${COMMAND}，按提示登录 GitHub，然后点“重新检测”。`
        : '暂时读取不到 gh 的状态，可稍后重新检测。';
      const items = [];
      if (unified && state !== 'connected') items.push(integrationsLink('在 Orca 里连接', 'ce-button ce-primary ce-press'));
      if (state !== 'connected' && state !== 'missing') items.push(copy);
      if (state === 'missing' && !unified) {
        const link = make('a', 'ce-button ce-primary ce-press', '安装 gh'); link.href = INSTALL_URL; link.target = '_blank'; link.rel = 'noopener noreferrer';
        items.push(link);
      }
      items.push(recheck, live);
      actions.replaceChildren(...items);
    }
    async function load(refresh) {
      const mine = ++ticket;
      recheck.disabled = true;
      let value;
      try { value = await api(query(null, refresh)); } catch (_) { value = null; }
      if (disposed || mine !== ticket) return;
      recheck.disabled = false;
      live.textContent = '';
      paint(describe(value, {needProject: false}));
    }
    load(false);
    return () => { disposed = true; page.remove(); };
  }

  scope.StudioCodeHost = {COMMAND, DISMISS_KEY, INTEGRATIONS_HASH, SEPARATION, describe, mountStrip, mountSettings};
})();
