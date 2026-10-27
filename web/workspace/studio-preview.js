// Studio owns navigation and composition; management modules own task actions.
'use strict';
function projectEntryTab() { return 'workspace'; }
let initialStudioTheme = window.CEUITheme?.pageTheme || window.CEStudioTheme || null;
function mountStudio(root, { onProjects = () => {}, runtimeHost = () => null } = {}) {
  const $ = id => root.querySelector('#' + id);
  const content = $('studio-content'), status = $('studio-status');
  if (!window.StudioData || !window.WorkspaceAgentBoard || !window.StudioShell) {
    status.textContent = '工作台资源尚未就绪，请通过本地服务的 /studio 页面打开。'; return;
  }
  const client = window.StudioData.create();
  let mascot = null;
  const icons = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    folder: '<path d="M3 7V4h6l3 3h9v13H3Z"/>',
    arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
    settings: '<path d="M3 6h7m4 0h7M3 12h3m4 0h11M3 18h11m4 0h3M10 3v6M6 9v6m8 0v6"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
    refresh: '<path d="M20 7v5h-5M20 12a8 8 0 1 1-2.3-5.7"/>',
    archive: '<rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v14h14V7m-10 5h6"/>',
    restore: '<path d="M3 7v5h5M3 12a9 9 0 1 1 3 7"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>', moon: '<path d="M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13Z"/>',
  };
  const icon = name => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.folder}</svg>`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let state = { workspace: null, agents: [], items: [] }, request = 0, query = '', projectFilter = 'active', initialized = false, disposed = false;
  let projectSort = 'updated', refreshMessage = '', viewMode = 'cards';
  let railCollapsed = false, newsHost = null, newsReader = null, newsTheme = null, externalAccess = null;
  let overviewReturn = null;
  let pendingTask = null, taskCenter = null, legacyBoard = null, taskTarget = '', itemsScope = 'current', legacyScope = null, progressReturn = null;
  const consumerSnapshots = new WeakMap();
  let refreshPromise = null, refreshAgain = false, refreshTimer = null, lastRead = 0;
  const refreshInterval = 15000;
  const visibleBusiness = () => !disposed && !document.hidden && !(root.dataset.unified === 'true' && route().view === 'project' && ['workspace', 'activity'].includes(route().tab));
  const renderedHtml = new WeakMap();
  const setHtml = (node, html) => { if (disposed) return; window.CERemoteContext?.assertActive(); if (renderedHtml.get(node) !== html) { node.innerHTML = html; renderedHtml.set(node, html); } };
  const standaloneTheme = root.dataset.unified === 'true' ? null : (initialStudioTheme || window.CEUITheme?.earlyRead('ce-studio-theme'));
  if (standaloneTheme) initialStudioTheme = null;
  const unmountTheme = standaloneTheme?.mount({ roots: [root], status: $('studio-theme-status') });
  const board = window.WorkspaceAgentBoard.create({ root: $('studio-agent-board'), fetchJson: client.api, postJson: client.post,
    unified: true,
    itemsHref: id => /^[a-z0-9][a-z0-9-]{0,63}$/.test(id || '') ? '#project/' + encodeURIComponent(id) + '/items' : null,
    onRefresh: () => refresh(),
    onRegister: () => { navigate('settings/sources'); }, onAddProject: () => requestProject(),
    onProject: (id, item) => {
      const destination = id ? 'project/' + encodeURIComponent(id) + '/tasks' : 'inbox';
      if (item) pendingTask = { item, hash: '#' + destination };
      navigate(destination);
    } });
  const projects = () => state.workspace?.projects.items || [];
  const projectHash = (id, tab) => '#project/' + encodeURIComponent(id) + '/' + tab;
  const pageHost = () => root.dataset.unified === 'true' ? root.getRootNode().host?.closest('.platform-studio-surface') : document.scrollingElement;
  const progressRoute = value => value.view === 'project' && ['tasks', 'review', 'attention'].includes(value.tab);
  const managementRoute = value => value.view === 'project' && ['items', 'board'].includes(value.tab);
  function activeEditor() {
    if (!$('studio-tasks').hidden && taskCenter?.isEditing()) return taskCenter;
    if (!$('studio-legacy-board')?.hidden && legacyBoard?.isEditing()) return legacyBoard;
    if (!$('studio-agent-board').hidden && board.isEditing?.()) return board;
    return null;
  }
  function editingBlocked() {
    const editor = activeEditor();
    if (!editor) return false;
    status.hidden = false; status.textContent = '请先保存或关闭当前编辑，再切换页面或范围。'; editor.focusEditor?.(); return true;
  }
  const beforeNavigate = event => {
    if (externalAccess?.isOpen()) {
      if (event.detail?.waitUntil) event.detail.waitUntil(externalAccess.requestClose()); else event.preventDefault();
      return;
    }
    if (!editingBlocked()) return;
    event.preventDefault(); event.detail?.waitUntil?.(Promise.resolve(false));
  };
  window.addEventListener('platform-before-navigate', beforeNavigate);
  function renderConsumers(current, chosen) {
    const wasItems = !$('studio-tasks').hidden;
    const progress = (current.view === 'inbox' || progressRoute(current) && chosen && !chosen.archived) && Boolean(state.workspace && window.ProjectProgress && window.ProjectProgressModel);
    const items = current.view === 'project' && current.tab === 'items' && Boolean(chosen && state.workspace && initialized && client.canWrite() && window.WorkspaceTaskCenter);
    const legacy = current.view === 'project' && current.tab === 'board' && Boolean(chosen && !chosen.archived && state.workspace && initialized && client.canWrite());
    $('studio-agent-board').hidden = !progress; board.setActive?.(progress);
    $('studio-tasks').hidden = !items;
    if ($('studio-legacy-board')) $('studio-legacy-board').hidden = !legacy;
    taskCenter?.setActive(items); legacyBoard?.setActive(legacy);
    if (progress) {
      board.setProject(current.view === 'project' ? current.id : '', current.tab === 'review' ? 'review' : current.tab === 'attention' ? 'attention' : 'all');
      if (consumerSnapshots.get(board) !== state) { consumerSnapshots.set(board, state); void board.update(state); }
    }
    if (items) {
      if (!taskCenter) taskCenter = window.WorkspaceTaskCenter.create({ root: $('studio-tasks'), fetchJson: client.api, postJson: client.post,
        canWrite: client.canWrite, onSaved: () => refresh(), onProject: id => navigate('project/' + encodeURIComponent(id) + '/tasks') });
      taskCenter.setActive(true);
      if (taskTarget !== current.id) {
        taskTarget = current.id; itemsScope = 'current';
        taskCenter.update(state.workspace, { refresh: false });
        void taskCenter.setContext({ projectId: current.id, scope: 'all', state: '' });
        consumerSnapshots.set(taskCenter, state);
      } else if (consumerSnapshots.get(taskCenter) !== state) {
        consumerSnapshots.set(taskCenter, state); taskCenter.update(state.workspace);
      } else if (!wasItems) void taskCenter.refresh();
      $('studio-tasks').querySelector('#item-scope')?.closest?.('label')?.setAttribute('hidden', '');
    }
    if (legacy) {
      if (!legacyBoard) legacyBoard = window.WorkspaceAgentBoard.create({ root: $('studio-legacy-board'), fetchJson: client.api, postJson: client.post, unified: false,
        onRefresh: () => refresh(), itemsHref: id => projectHash(id && id !== '__global__' ? id : route().id, 'items'),
        onProject: id => { if (editingBlocked()) return; if (id && id !== '__global__') navigate('project/' + encodeURIComponent(id) + '/board'); else { legacyScope = id; legacyBoard.setProject(id, 'all'); } },
        onRegister: () => navigate('settings/sources'), onAddProject: () => requestProject() });
      legacyBoard.setActive(true);
      legacyBoard.setProject(legacyScope === null ? current.id : legacyScope, 'all');
      if (consumerSnapshots.get(legacyBoard) !== state) { consumerSnapshots.set(legacyBoard, state); void legacyBoard.update(state); }
    }
    return { progress, items, legacy };
  }
  const developmentUrl = id => root.dataset.unified === 'true' ? '#project/' + encodeURIComponent(id) + '/workspace' : '/workbench/web-index.html?project_id=' + encodeURIComponent(id);
  function route() {
    const [view, encoded = '', tab = ''] = location.hash.slice(1).split('/');
    let id = ''; try { id = decodeURIComponent(encoded); } catch { /* Invalid links return to projects. */ }
    if (!view && location.search) id = new URLSearchParams(location.search).get('project_id') || '';
    if ((view === 'project' || !view) && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
      const page = tab === 'manage' ? 'tasks' : tab;
      return { view: 'project', id, tab: ['tasks', 'review', 'attention', 'activity', 'monitor', 'settings', 'items', 'board'].includes(page) ? page : 'workspace' };
    }
    if (['inbox', 'tasks', 'attention'].includes(view)) return { view: 'inbox', id: '', tab: view === 'attention' || encoded === 'attention' ? 'attention' : encoded === 'review' ? 'review' : 'all' };
    if (view === 'news') return { view: 'news', id: '', tab: '' };
    if (view === 'mobile') return { view: 'mobile', id: '', tab: '' };
    if (['workbench', 'project-setup', 'workspace'].includes(view)) return { view: 'workbench', id: '', tab: '' };
    if (view === 'settings') return { view: 'settings', id: '', tab: id === 'mobile' ? 'account' : /^[a-z][a-z0-9-]{0,63}$/.test(id) ? id : 'appearance' };
    return { view: ['tools', 'agents'].includes(view) ? 'tools' : 'home', id: '', tab: '' };
  }
  function navigate(value) { if (location.hash === '#' + value) render(); else location.hash = value; }
  let previousRoute = route(), mobileReturnHash = '#home', disposeMobile = null, disposePets = null;
  let acceptedHash = location.hash || '#home', navigationGeneration = 0, acceptedVersion = 0;
  function requestProject() {
    const current = route();
    if (root.dataset.unified === 'true' && (current.view === 'workbench' || current.view === 'project' && ['workspace', 'activity'].includes(current.tab))) {
      closeNavigation();
      window.dispatchEvent(new CustomEvent('platform-open-add-repo'));
    }
    else navigate('workbench');
  }
  let projectDialogHost = null, projectDialogTarget = null;
  let themeSaving = false;
  function syncAppearance() {
    if (disposed) return;
    const saved = root.dataset.unified === 'true' ? window.CEPlatformAppearance?.getSnapshot() : standaloneTheme ? { theme: standaloneTheme.theme, error: standaloneTheme.error } : null;
    if (saved && root.dataset.theme !== saved.theme) root.dataset.theme = saved.theme;
    if (projectDialogTarget) projectDialogTarget.dataset.theme = root.dataset.theme || 'light';
    const toggle = root.querySelector('[data-action="theme"]');
    if (toggle) {
      toggle.innerHTML = icon(root.dataset.theme === 'dark' ? 'sun' : 'moon');
      toggle.setAttribute('aria-label', root.dataset.theme === 'dark' ? '切换浅色外观' : '切换深色外观');
      toggle.disabled = themeSaving || !!saved?.pending || (root.dataset.unified !== 'true' && !standaloneTheme);
      let status = root.querySelector('[data-theme-status]');
      if (saved?.error && !status) {
        status = document.createElement('span'); status.dataset.themeStatus = ''; status.setAttribute('role', 'alert');
        toggle.insertAdjacentElement('beforebegin', status);
      }
      if (status) { status.textContent = saved?.error || ''; status.hidden = !saved?.error; }
    }
  }
  const unsubscribeAppearance = root.dataset.unified === 'true' ? window.CEPlatformAppearance?.subscribe(syncAppearance) : null;
  syncAppearance();
  const currentFocus = () => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
  };
  const restoreFocus = trigger => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  function visibleDialogTarget() {
    closeNavigation();
    if (root.dataset.unified !== 'true') return root;
    if (!projectDialogHost) {
      // Dialogs must retain their scoped styles outside the hidden Studio surface.
      projectDialogHost = document.createElement('div');
      projectDialogHost.className = 'platform-project-dialog-host';
      projectDialogHost.dataset.platformProjectDialog = '';
      const shadow = projectDialogHost.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = [...(root.getRootNode().styleSheets || [])]
        .filter(sheet => ['/workspace.css', '/studio-preview.css', '/remote/remote-account.css'].some(path => sheet.href?.endsWith(path)))
        .map(sheet => [...sheet.cssRules].map(rule => rule.cssText).join('\n')).join('\n');
      projectDialogTarget = document.createElement('div'); projectDialogTarget.id = 'ce-studio';
      projectDialogTarget.dataset.unified = 'true'; projectDialogTarget.style.display = 'contents';
      shadow.append(style, projectDialogTarget); document.body.append(projectDialogHost);
    }
    projectDialogTarget.dataset.theme = root.dataset.theme || 'light';
    return projectDialogTarget;
  }
  function openExternalAccess() {
    if (disposed || window.CERemoteContext?.active === false) return;
    if (!window.WorkspaceAgents?.openAccess) { showPlatformNotice('接入管理尚未就绪，请刷新重试。'); return; }
    const trigger = currentFocus(), openedHash = acceptedHash;
    externalAccess = window.WorkspaceAgents.openAccess({ host: visibleDialogTarget(),
      fetchJson: client.api, postJson: client.post, restoreFocus: () => restoreFocus(trigger),
      isCurrent: () => !disposed && acceptedHash === openedHash && window.CERemoteContext?.active !== false });
  }
  function showPlatformNotice(text, { projects: savedProjects = [], retry = null } = {}) {
    const host = visibleDialogTarget(), trigger = currentFocus();
    const dialog = document.createElement('dialog');
    dialog.className = 'ce-project-settings';
    dialog.innerHTML = `<form><p role="status">${escape(text)}</p><button type="button" class="ce-button">关闭</button></form>`;
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    const actions = document.createElement('div'); actions.className = 'ce-registration-actions';
    for (const project of savedProjects) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'ce-button'; button.textContent = project.name;
      button.addEventListener('click', () => { dialog.close(); navigate('project/' + encodeURIComponent(project.id) + '/workspace'); });
      actions.append(button);
    }
    if (retry) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'ce-button ce-primary'; button.textContent = '重新读取';
      button.addEventListener('click', () => { dialog.close(); void retry(); }); actions.append(button);
    }
    if (actions.childElementCount) dialog.querySelector('p').after(actions);
    dialog.addEventListener('close', () => { dialog.remove(); restoreFocus(trigger); }, { once: true });
    host.append(dialog);
    dialog.showModal();
  }
  const pendingArchives = new Set();
  async function setProjectArchived(id, archived, button) {
    const project = projects().find(row => row.id === id);
    if (disposed || window.CERemoteContext?.active === false || !client.canWrite() ||
      !project || project.read_only || project.source?.kind === 'codex' || nativeProjectWrites.has(id)) return;
    const controller = new AbortController();
    pendingArchives.add(controller);
    nativeProjectWrites.set(id, controller.signal);
    const unsubscribe = window.CERemoteContext?.onInactive(() => controller.abort());
    const directories = project.directories.map(row => ({ id: row.id || row.binding_id, path: row.path }));
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = archived ? '正在归档…' : '正在恢复…';
    try {
      const result = await client.post('/api/workspace/projects/save', {
        id, name: project.name, archived, directories, source: project.source,
        expected: { name: project.name, archived: Boolean(project.archived), directories, source: project.source }
      }, { signal: controller.signal });
      if (disposed || controller.signal.aborted || window.CERemoteContext?.active === false) return;
      if (result.status !== 'ok' || result.project?.id !== id || result.project.archived !== archived)
        throw new Error('服务未确认项目状态，请刷新后重试。');
      closeProjectMenu();
      const confirmed = await refresh();
      if (disposed || controller.signal.aborted || window.CERemoteContext?.active === false) return;
      refreshMessage = confirmed
        ? `${archived ? '已归档' : '已恢复'}「${project.name}」`
        : '项目状态已保存，列表尚未确认，请刷新。';
      renderStatus(route());
    } catch (error) {
      if (disposed || controller.signal.aborted || window.CERemoteContext?.active === false) return;
      closeProjectMenu();
      refreshMessage = error.reason === 'directory_conflict' ? '目录已被其他项目使用，无法恢复。'
        : error.reason === 'native_managed_project' ? '项目仍有运行中的任务，请结束后再归档。'
        : error.reason === 'project_changed' ? '项目已变化，请刷新后重试。' : error.message;
      renderStatus(route()); status.classList.add('error');
    } finally {
      pendingArchives.delete(controller);
      unsubscribe?.();
      if (nativeProjectWrites.get(id) === controller.signal) nativeProjectWrites.delete(id);
    }
  }
  let projectMenu = null, projectMenuTrigger = null;
  function closeProjectMenu() {
    projectMenu?.remove(); projectMenu = null;
    projectMenuTrigger?.setAttribute?.('aria-expanded', 'false');
    if (projectMenuTrigger) restoreFocus(projectMenuTrigger.isConnected ? projectMenuTrigger : content.querySelector('h1'));
    projectMenuTrigger = null;
  }
  function openProjectMenu(id, trigger) {
    const project = projects().find(row => row.id === id);
    if (!project || project.read_only || project.source?.kind === 'codex' || !client.canWrite() || nativeProjectWrites.has(id)) return;
    closeProjectMenu(); projectMenuTrigger = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    const menu = document.createElement('div'); projectMenu = menu;
    menu.className = 'ce-project-menu'; menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', project.name);
    menu.innerHTML = `<button type="button" role="menuitem" data-project-archive="${escape(id)}">${icon(project.archived ? 'restore' : 'archive')}<span>${project.archived ? '恢复项目' : '归档项目'}</span></button>`;
    visibleDialogTarget().append(menu);
    const bounds = trigger.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(bounds.left, window.innerWidth - 228)) + 'px';
    const roomBelow = window.innerHeight - bounds.bottom - 8;
    menu.style.maxHeight = Math.max(88, roomBelow < 160 ? bounds.top - 8 : roomBelow) + 'px';
    if (roomBelow < 160) menu.style.bottom = Math.max(8, window.innerHeight - bounds.top) + 'px';
    else menu.style.top = bounds.bottom + 4 + 'px';
    const entries = [...menu.querySelectorAll('[role="menuitem"]')];
    entries[0]?.focus();
    menu.addEventListener('keydown', event => {
      if (event.isComposing) return;
      const index = entries.indexOf(menu.getRootNode().activeElement || document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : event.key === 'ArrowDown' ? (index + 1) % entries.length : event.key === 'ArrowUp' ? (index - 1 + entries.length) % entries.length : -1;
      if (next >= 0) { event.preventDefault(); entries[next]?.focus(); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeProjectMenu(); }
    });
    menu.addEventListener('click', event => {
      // Standalone menus live inside root; their actions must not run again in its delegate.
      event.stopPropagation();
      const archive = event.target.closest('[data-project-archive]');
      if (archive) { event.preventDefault(); void setProjectArchived(id, !project.archived, archive); }
    });
  }
  const dismissProjectMenu = event => {
    if (projectMenu && !event.composedPath().includes(projectMenu) && !event.composedPath().includes(projectMenuTrigger)) closeProjectMenu();
  };
  document.addEventListener('pointerdown', dismissProjectMenu);
  window.addEventListener('scroll', closeProjectMenu, true);
  const drawer = document.createElement('dialog');
  drawer.id = 'studio-navigation'; drawer.className = 'ce-navigation-drawer';
  drawer.setAttribute('aria-label', '工作台导航');
  root.append(drawer);
  let menuTrigger = null, savedScroll = null;
  function restoreNavigation() {
    if (savedScroll) {
      const { host, overflow, touchAction, top, left } = savedScroll;
      host.style.overflow = overflow; host.style.touchAction = touchAction;
      host.scrollTop = top; host.scrollLeft = left; savedScroll = null;
    }
    root.querySelector('[data-action="navigation"]')?.setAttribute('aria-expanded', 'false');
    if (!disposed) (menuTrigger?.isConnected ? menuTrigger : root.querySelector('[data-action="navigation"]'))?.focus({ preventScroll: true });
    menuTrigger = null;
  }
  function closeNavigation() { if (drawer.open) drawer.close(); }
  function openNavigation() {
    if (drawer.open || disposed || root.querySelector('dialog[open]')) return;
    menuTrigger = root.querySelector('[data-action="navigation"]');
    const host = root.dataset.unified === 'true'
      ? root.getRootNode().host?.closest('.platform-studio-surface') : document.scrollingElement;
    if (host) {
      savedScroll = { host, overflow: host.style.overflow, touchAction: host.style.touchAction, top: host.scrollTop, left: host.scrollLeft };
      host.style.overflow = 'hidden'; host.style.touchAction = 'pan-y';
    }
    drawer.innerHTML = `<div class="ce-drawer-header"><strong>工作台导航</strong><button class="ce-iconbtn" data-action="close-navigation" type="button" aria-label="关闭导航">×</button></div>${renderNav(route(), true)}`;
    drawer.showModal(); menuTrigger?.setAttribute('aria-expanded', 'true');
  }
  drawer.addEventListener('close', restoreNavigation);
  drawer.addEventListener('click', event => { if (event.target === drawer) closeNavigation(); });
  const resizeNavigation = () => { closeProjectMenu(); if (window.innerWidth > 1023) closeNavigation(); };
  window.addEventListener('resize', resizeNavigation);
  function renderNav(current) { return window.StudioShell.renderNavigation({ current }); }
  function renderChrome(current) {
    setHtml($('studio-rail'), renderNav(current));
    const chosen = projects().find(p => p.id === current.id);
    const accountPage = current.view === 'mobile' || current.view === 'settings' && current.tab === 'account';
    setHtml($('studio-topbar'), `<header class="ce-topbar"><button class="ce-iconbtn ce-rail-toggle" data-action="rail-toggle" type="button" aria-label="${railCollapsed ? '展开导航' : '收起导航'}" title="${railCollapsed ? '展开导航' : '收起导航'}" aria-controls="studio-rail" aria-expanded="${!railCollapsed}">${icon('sidebar')}</button><button class="ce-iconbtn ce-menu-trigger" data-action="navigation" type="button" aria-label="打开导航" aria-controls="studio-navigation" aria-expanded="${drawer.open}">${icon('menu')}</button><div class="ce-crumbs"><a href="#home">项目</a>${!['home', 'inbox'].includes(current.view) ? `<span> / ${escape(accountPage ? '账号与设备' : chosen?.name || ({ inbox: '事项', tools: '高级管理', mobile: '账号与设备', news: '新闻', settings: '设置' }[current.view] || '项目'))}</span>` : ''}</div><a class="ce-button ce-plain ce-mobile-entry-mobile${accountPage ? ' is-current' : ''}" href="#settings/account"${accountPage ? ' aria-current="page"' : ''}>账号与设备</a><a class="ce-button ce-plain ce-creator-mobile" href="#news">新闻</a>${accountPage || current.view === 'news' || root.dataset.unified === 'true' && (current.view === 'inbox' || current.view === 'project' && ['tasks', 'review', 'attention'].includes(current.tab)) ? '' : `<button class="ce-iconbtn" data-action="refresh" type="button" title="刷新当前页面" aria-label="刷新当前页面" aria-busy="false">${icon('refresh')}</button>`}<button class="ce-iconbtn" data-action="theme" type="button" aria-label="${root.dataset.theme === 'dark' ? '切换浅色外观' : '切换深色外观'}">${icon(root.dataset.theme === 'dark' ? 'sun' : 'moon')}</button></header>`);
    syncAppearance();
  }
  function home() {
    return window.StudioShell.renderOverview({ projects: projects(), items: state.items, query, projectFilter,
      writable: client.canWrite(), sort: projectSort, viewMode, developmentUrl, runtimeAvailable: root.dataset.unified === 'true' });
  }
  function renderHome() {
    const active = currentFocus();
    const card = active?.closest?.('[data-project-card]');
    const selector = active?.id === 'studio-project-search' || active?.id === 'studio-project-sort' ? '#' + active.id
      : card ? `[data-project-card="${card.dataset.projectCard}"] ${active.hasAttribute('data-project-menu') ? '[data-project-menu]' : '.ce-project-title-link'}`
      : active?.dataset?.action ? `[data-action="${active.dataset.action}"]` : '';
    const range = active?.id === 'studio-project-search' ? [active.selectionStart, active.selectionEnd] : null;
    setHtml(content, home());
    if (selector && !active?.isConnected) {
      const replacement = root.querySelector(selector) || content.querySelector('h1');
      replacement?.focus({ preventScroll: true });
      if (range) replacement?.setSelectionRange?.(...range);
    }
    if (projectMenu && !projectMenuTrigger?.isConnected) closeProjectMenu();
  }
  let monitor = null, monitorProject = '';
  function renderMonitor(current, chosen) {
    if (monitor && (!projects().some(project => project.id === monitorProject)
        || current.view === 'project' && current.id !== monitorProject)) {
      monitor.destroy(); monitor = null; monitorProject = '';
    }
    const active = current.view === 'project' && current.tab === 'monitor' && Boolean(chosen && !chosen.archived);
    $('studio-monitor').hidden = !active;
    if (!active) { monitor?.setActive(false); return; }
    if (!window.WorkspaceProjectMonitor) {
      $('studio-monitor-content').textContent = '监控资源尚未就绪，请刷新页面。'; return;
    }
    if (!monitor) {
      monitorProject = chosen.id;
      monitor = window.WorkspaceProjectMonitor.create({ root: $('studio-monitor-content'), projectId: chosen.id,
        fetchJson: client.api, onTask: () => navigate('project/' + encodeURIComponent(chosen.id) + '/tasks') });
    }
    monitor.setActive(true);
  }
  function showNews(active) {
    if (newsHost) { newsHost.hidden = !active; newsHost.inert = !active; }
    newsReader?.setActive(active);
    if (!active || newsHost) return;
    newsHost = document.createElement('section'); newsHost.className = 'ce-news-surface';
    newsHost.setAttribute('aria-label', '新闻阅读室'); content.parentElement.append(newsHost);
    const frame = document.createElement('iframe'); frame.title = '新闻阅读器';
    const feedback = document.createElement('p'); feedback.setAttribute('role', 'status');
    feedback.textContent = '正在打开新闻…'; newsHost.append(feedback, frame);
    const syncTheme = () => {
      try { if (frame.contentDocument?.documentElement) { const target = frame.contentDocument.documentElement; target.dataset.theme = root.dataset.theme || 'light'; target.style.setProperty('--ce-font-family', getComputedStyle(root).fontFamily); } } catch { /* A sign-in redirect is outside this reader's scope. */ }
    };
    frame.addEventListener('load', () => {
      if (disposed) return;
      try { newsReader = frame.contentWindow?.NewsReader; } catch { newsReader = null; }
      if (newsReader?.setActive) { feedback.hidden = true; syncTheme(); newsReader.setActive(route().view === 'news'); }
      else {
        feedback.textContent = '新闻暂不可用。'; feedback.setAttribute('role', 'alert');
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重试';
        retry.addEventListener('click', () => { feedback.textContent = '正在打开新闻…'; frame.src = '/news?embedded=1'; });
        feedback.append(retry);
      }
    });
    newsTheme = new MutationObserver(syncTheme);
    newsTheme.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    frame.src = '/news?embedded=1';
  }
  function render() {
    if (disposed || window.CERemoteContext?.active === false) return;
    const current = route();
    mascot?.setRoute();
    showNews(current.view === 'news'); content.hidden = current.view === 'news';
    renderStatus(current);
    if (current.view !== 'mobile' && !(current.view === 'settings' && current.tab === 'account') && disposeMobile) { disposeMobile(); disposeMobile = null; }
    if (!(current.view === 'settings' && current.tab === 'appearance') && disposePets) { disposePets(); disposePets = null; }
    const chosen = projects().find(p => p.id === current.id);
    // The native surface takes over when ready; retain the previous page during preparation.
    if (root.dataset.unified === 'true' && (current.view === 'workbench' || current.view === 'project' && ['workspace', 'activity'].includes(current.tab) && (!state.workspace || chosen && !chosen.archived))) {
      monitor?.setActive(false);
      taskCenter?.setActive(false); legacyBoard?.setActive(false); board.setActive?.(false);
      $('studio-tasks').hidden = true; if ($('studio-legacy-board')) $('studio-legacy-board').hidden = true;
      $('studio-agent-board').hidden = true;
      if (state.workspace && !content.innerHTML.trim()) {
        renderChrome({ view: 'home', id: '', tab: 'workspace' });
        root.dataset.projectSurface = 'false'; setHtml(content, home());
      }
      return;
    }
    renderChrome(current);
    root.dataset.projectSurface = current.view === 'project' ? 'true' : 'false';
    const consumers = renderConsumers(current, chosen), showBoard = consumers.progress;
    renderMonitor(current, chosen);
    if (current.view === 'news') return;
    if (current.view === 'mobile' || current.view === 'settings' && current.tab === 'account') {
      if (!disposeMobile) { renderedHtml.delete(content); disposeMobile = window.StudioMobileEntry.mount(content, { returnHash: mobileReturnHash }); }
      return;
    }
    if (current.view === 'settings' && current.tab === 'appearance') {
      if (!disposePets) { renderedHtml.delete(content); disposePets = window.StudioPetSettings.mount(content); }
      return;
    }
    if (!state.workspace) { setHtml(content, '<div class="ce-empty">正在读取真实项目与事项。无法连接时请使用上方“刷新”重试。</div>'); return; }
    if (current.view === 'home') renderHome();
    else if (current.view === 'workbench') setHtml(content, '<div class="ce-heading"><h1>项目工作台</h1></div><div class="ce-empty" role="status">项目运行组件未连接，请从已装配内置工作台的服务打开。</div>');
    else if (current.view === 'settings') setHtml(content, window.StudioShell.renderSettingsLanding({ section: current.tab, integrated: root.dataset.unified === 'true' }));
    else if (current.view === 'project' && ['items', 'board'].includes(current.tab)) {
      const returnHash = progressReturn?.platformId === current.id ? progressReturn.originHash : projectHash(current.id, 'tasks');
      const heading = chosen ? window.StudioShell.renderProgressHeading({ project: chosen, tab: current.tab, returnHash, scope: itemsScope }) : '<div class="ce-heading"><h1 tabindex="-1">项目事项</h1></div>';
      const ready = current.tab === 'items' ? consumers.items : consumers.legacy;
      const problem = !chosen ? '项目已移出或不存在。' : current.tab === 'board' && chosen.archived ? '项目已归档，事项看板不包含归档项目。' : '事项管理资源或写入凭据尚未就绪，请重新读取。';
      setHtml(content, heading + (ready ? '' : `<div class="ce-empty" role="status">${problem}${chosen?.archived && current.tab === 'board' ? `<a class="ce-button" href="${projectHash(current.id, 'items')}">查看归档事项</a>` : ''}<a class="ce-button" href="#home">返回项目总览</a></div>`));
    }
    else if (current.view === 'project' && current.tab === 'settings') setHtml(content, `<div class="ce-heading"><h1>${escape(chosen?.name || '项目')} · 项目设置</h1></div><div class="ce-empty" role="status">${chosen ? '此入口尚未就绪。' : '项目已移出或不存在。'}<a class="ce-button" href="#home">返回项目总览</a></div>`);
    else if (current.view === 'tools') setHtml(content, `<div class="ce-heading"><div><h1>高级管理</h1></div></div><div class="ce-tool-grid"><article class="ce-tool-card">${icon('settings')}<h2>高级接入</h2><p>外部任务执行器与旧数据。</p><a class="ce-button" href="/workspace-admin#settings">高级设置</a></article><article class="ce-tool-card">${icon('folder')}<h2>项目档案</h2><a class="ce-button" href="/workspace-admin#projects">来源与历史</a></article></div>`);
    else if ((current.view === 'inbox' || progressRoute(current) && chosen && !chosen.archived) && !(window.ProjectProgress && window.ProjectProgressModel)) setHtml(content, '<div class="ce-heading"><h1 tabindex="-1">项目进展</h1></div><div class="ce-empty" role="status">进展资源尚未就绪，请刷新页面。<a class="ce-button" href="#home">返回项目总览</a></div>');
    else if (current.view === 'project') setHtml(content, chosen?.archived ? '<div class="ce-empty">项目已归档，仍停在当前页。<a class="ce-button" href="#home">返回项目</a><p>在“已归档”列表选择恢复项目。</p></div>' : chosen ? showBoard ? window.StudioShell.renderProgressHeading({ project: chosen, tab: current.tab }) + itemFilters(current) : `<div class="ce-heading"><h1>${current.tab === 'monitor' ? '业务进度' : escape(chosen.name)}</h1>${current.tab === 'monitor' ? `<a class="ce-button ce-plain" href="#project/${encodeURIComponent(chosen.id)}/tasks">返回进展</a>` : ''}</div>` : '<div class="ce-empty">项目已移出或不存在，<a href="#home">返回项目</a>重新选择。</div>');
    else setHtml(content, `<div class="ce-heading"><h1>事项</h1></div>${itemFilters(current)}`);
  }
  function itemFilters(current) {
    const href = filter => current.view === 'project' ? '#project/' + encodeURIComponent(current.id) + '/' + (filter === 'all' ? 'tasks' : filter) : '#inbox' + (filter === 'all' ? '' : '/' + filter);
    const selected = ['review', 'attention'].includes(current.tab) ? current.tab : 'all';
    if (root.dataset.unified === 'true') return '';
    return `<nav class="ce-tabs" aria-label="事项筛选">${[['all', current.view === 'project' ? '本项目全部' : '全部'], ['review', '待验收'], ['attention', '需处理']].map(([value, label]) => `<a href="${href(value)}"${selected === value ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
  }
  function renderStatus(current) {
    if (disposed || window.CERemoteContext?.active === false) return;
    if (!state.workspace) { status.hidden = false; status.textContent = refreshMessage; return; }
    status.textContent = refreshMessage || '';
    status.hidden = !status.textContent;
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (initialized && visibleBusiness()) refreshTimer = setTimeout(() => refresh(false), refreshInterval);
  }
  function syncRefreshButton() {
    const button = root.querySelector('[data-action="refresh"]');
    if (button) { button.disabled = Boolean(refreshPromise); button.setAttribute('aria-busy', String(Boolean(refreshPromise))); }
  }
  function refresh(force = true) {
    if (disposed) return Promise.resolve();
    if (refreshPromise) { if (force) refreshAgain = true; return refreshPromise; }
    refreshPromise = (async () => {
      let ok = false;
      do { refreshAgain = false; ok = await readSnapshot(force); } while (refreshAgain && !disposed);
      return ok;
    })().finally(() => { refreshPromise = null; if (!disposed) syncRefreshButton(); scheduleRefresh(); });
    syncRefreshButton();
    return refreshPromise;
  }
  function nativeProjectAdopted(event) {
    const detail = event.detail;
    if (root.dataset.unified !== 'true' || disposed || !detail ||
      typeof detail.projectId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(detail.projectId) ||
      typeof detail.waitUntil !== 'function') return;
    detail.waitUntil((async () => {
      window.CERemoteContext?.assertActive();
      const ok = await refresh(true);
      window.CERemoteContext?.assertActive();
      return Boolean(ok && !disposed && projects().some(project => project.id === detail.projectId && !project.archived));
    })());
  }
  const nativeProjectWrites = new Map();
  function nativeProjectAction(event) {
    const detail = event.detail;
    if (root.dataset.unified !== 'true' || disposed || !detail ||
      !['rename', 'archive'].includes(detail.action) || typeof detail.waitUntil !== 'function') return;
    detail.waitUntil((async () => {
      const normalize = value => String(value || '').replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
      const host = runtimeHost();
      const signal = detail.signal;
      const check = () => {
        window.CERemoteContext?.assertActive();
        if (disposed || !signal || signal.aborted || host !== runtimeHost() || !host ||
          detail.executionHostId !== host) throw new Error('项目所在电脑已变化，请重新打开项目。');
      };
      check();
      if (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function' ||
        typeof detail.repoId !== 'string' || !detail.repoId ||
        typeof detail.directory !== 'string' || !detail.directory) throw new Error('项目身份未确认。');
      const matches = projects().filter(project => !project.archived &&
        normalize(project.directories?.find(row => (row.id || row.binding_id) === 'main')?.path || project.root) === normalize(detail.directory));
      if (matches.length !== 1 || matches[0].read_only || matches[0].source?.kind === 'codex')
        throw new Error('项目登记已变化，请重新选择项目。');
      const project = matches[0];
      if (nativeProjectWrites.has(project.id)) throw new Error('项目正在保存，请稍后重试。');
      const name = detail.action === 'rename' ? detail.name : project.name;
      if (typeof name !== 'string' || !name.trim() || Array.from(name.trim()).length > 80) throw new Error('项目名称须为 1 至 80 个字符。');
      const release = () => {
        if (nativeProjectWrites.get(project.id) === signal) nativeProjectWrites.delete(project.id);
        signal.removeEventListener('abort', release);
      };
      nativeProjectWrites.set(project.id, signal);
      signal.addEventListener('abort', release, { once: true });
      const confirm = async () => {
        check();
        if (!await refresh(true)) throw new Error('项目已保存，但列表尚未确认，请重新读取。');
        check();
        const saved = projects().find(row => row.id === project.id);
        if (!saved || saved.name !== name.trim() || Boolean(saved.archived) !== (detail.action === 'archive') ||
          normalize(saved.directories?.find(row => (row.id || row.binding_id) === 'main')?.path || saved.root) !== normalize(detail.directory))
          throw new Error('项目已保存，但列表尚未确认，请重新读取。');
      };
      try {
        check();
        const result = await client.post('/api/workspace/projects/save', {
          id: project.id, name: name.trim(), archived: detail.action === 'archive',
          directories: project.directories.map(row => ({ id: row.id || row.binding_id, path: row.path })), source: project.source,
          expected: { name: project.name, archived: Boolean(project.archived),
            directories: project.directories.map(row => ({ id: row.id || row.binding_id, path: row.path })), source: project.source }
        }, { signal });
        check();
        if (result.status !== 'ok' || result.project?.id !== project.id) throw new Error('服务未确认保存项目。');
        if (detail.action === 'rename') return confirm;
        await confirm();
        release();
      } catch (error) { release(); throw error; }
    })());
  }
  async function readSnapshot(force) {
    const current = ++request;
    if (!state.workspace || force) refreshMessage = state.workspace ? '正在更新，暂保留上次记录…' : '正在读取本地工作台…';
    renderStatus(route());
    status.classList.remove('error');
    try {
      if (!initialized) { await client.bootstrap(); initialized = true; }
      const next = await client.snapshot();
      if (disposed || current !== request) return;
      state = next; lastRead = Date.now(); refreshMessage = '';
      consumerSnapshots.delete(board); if (taskCenter) consumerSnapshots.delete(taskCenter); if (legacyBoard) consumerSnapshots.delete(legacyBoard);
      const summarizeProject = project => ({ id: project.id, name: project.name, directory: project.directories?.find(row => row.id === 'main')?.path || project.root });
      onProjects(projects().filter(project => !project.archived).map(summarizeProject), {
        archived: projects().filter(project => project.archived).map(summarizeProject) });
      render();
      renderStatus(route());
      return true;
    } catch (error) {
      if (disposed || current !== request) return;
      refreshMessage = `${error.message}。${state.workspace ? '仍显示上次读取的数据。' : '没有使用示例数据。'}`; renderStatus(route()); status.classList.add('error');
      if (!$('studio-agent-board').hidden) board.unavailable();
      if (!$('studio-legacy-board')?.hidden) legacyBoard?.unavailable();
      return false;
    }
  }
  root.addEventListener('click', async event => {
    if (drawer.open && event.target.closest('a[href]')) closeNavigation();
    const projectLink = event.target.closest('[data-open-project]');
    if (projectLink && root.dataset.unified === 'true' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && (!event.button || event.button === 0)) {
      event.preventDefault(); navigate(projectLink.getAttribute('href').slice(1));
    }
    const menuId = event.target.closest('[data-project-menu]')?.dataset.projectMenu;
    if (menuId) { event.preventDefault(); openProjectMenu(menuId, event.target.closest('[data-project-menu]')); }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'refresh') void refresh();
    if (action === 'external-access') openExternalAccess();
    if (action === 'rail-toggle') { railCollapsed = !railCollapsed; root.dataset.railCollapsed = String(railCollapsed); renderChrome(route()); root.querySelector('[data-action="rail-toggle"]')?.focus(); }
    if (action === 'add-project') requestProject();
    if (action === 'view-cards' || action === 'view-list') { viewMode = action === 'view-list' ? 'list' : 'cards'; render(); }
    if (['active-projects', 'all-projects', 'archived-projects'].includes(action)) { projectFilter = ({ 'active-projects': 'active', 'all-projects': 'all', 'archived-projects': 'archived' })[action]; render(); }
    if (action === 'clear-project-filters') { query = ''; projectFilter = 'active'; render(); }
    if (action === 'navigation') openNavigation();
    if (action === 'close-navigation') closeNavigation();
    if (action === 'theme') {
      if (themeSaving) return;
      themeSaving = true;
      syncAppearance();
      try {
        const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
        if (root.dataset.unified === 'true') {
          if (!window.CEPlatformAppearance) throw new Error('外观设置尚未就绪，请重新加载页面。');
          const result = await window.CEPlatformAppearance.requestTheme(next);
          if (result.error) throw new Error(result.error);
        } else {
          if (!standaloneTheme) throw new Error('外观设置尚未就绪，请重新加载页面。');
          const result = standaloneTheme.requestTheme(next);
          if (!result.ok) throw result.error;
        }
      } catch (error) { if (!disposed) showPlatformNotice(error.message); }
      finally { themeSaving = false; syncAppearance(); }
    }
    const taskId = event.target.closest('[data-task]')?.dataset.task;
    if (taskId) {
      const item = state.items.find(row => row.id === taskId);
      if (item) {
        const destination = item.project_id ? 'project/' + encodeURIComponent(item.project_id) + '/review' : 'inbox/attention';
        if (location.hash === '#' + destination) void board.open(item);
        else { pendingTask = { item, hash: '#' + destination }; navigate(destination); }
      }
    }
    const edit = event.target.closest('[data-edit-items]');
    if (edit) { event.preventDefault(); navigate('project/' + encodeURIComponent(route().id) + '/manage'); }
    const management = event.target.closest('a[href="#tasks"]');
    if (management && route().view === 'project') { event.preventDefault(); navigate('project/' + encodeURIComponent(route().id) + '/manage'); }
    else if (management) { event.preventDefault(); navigate('inbox/manage'); }
  });
  root.addEventListener('input', event => {
    if (event.target.id !== 'studio-project-search') return;
    query = event.target.value; const position = event.target.selectionStart; setHtml(content, home());
    const input = $('studio-project-search'); input.focus(); input.setSelectionRange(position, position);
  });
  root.addEventListener('change', event => {
    if (event.target.id === 'studio-items-scope') {
      if (editingBlocked()) { event.target.value = itemsScope; return; }
      const value = event.target.value;
      if (!['current', 'all', 'attention', 'active', 'archived', 'orphan', 'global'].includes(value)) return;
      itemsScope = value;
      taskCenter.update(state.workspace, { refresh: false });
      void taskCenter.setContext({ projectId: value === 'current' ? route().id : '', scope: value === 'current' ? 'all' : value, state: '' });
      $('studio-tasks').querySelector('#item-scope')?.closest?.('label')?.setAttribute('hidden', '');
      return;
    }
    if (event.target.id !== 'studio-project-sort') return;
    projectSort = event.target.value === 'name' ? 'name' : 'updated'; setHtml(content, home());
    $('studio-project-sort').focus();
  });
  const changed = event => {
    acceptedVersion++;
    closeNavigation();
    closeProjectMenu();
    const next = route();
    const from = event?.detail?.from || acceptedHash, to = event?.detail?.to || location.hash || '#home';
    if (from !== to) externalAccess?.dispose();
    acceptedHash = to;
    let restore = null;
    if (progressRoute(previousRoute) && managementRoute(next) && previousRoute.id === next.id) {
      progressReturn = { originHash: from, platformId: previousRoute.id, view: board.captureViewState?.(),
        pageScrollTop: pageHost()?.scrollTop || 0, trigger: currentFocus() };
    } else if (progressReturn && managementRoute(previousRoute) && previousRoute.id === progressReturn.platformId
        && next.id === progressReturn.platformId && to === progressReturn.originHash) restore = progressReturn;
    else if (!(progressReturn && managementRoute(next) && next.id === progressReturn.platformId
        && (managementRoute(previousRoute) && previousRoute.id === next.id || from === progressReturn.originHash))) progressReturn = null;
    if (previousRoute.id !== next.id) legacyScope = null;
    if (previousRoute.view === 'home' && next.view !== 'home') {
      const host = root.dataset.unified === 'true' ? root.getRootNode().host?.closest('.platform-studio-surface') : document.scrollingElement;
      const trigger = currentFocus();
      overviewReturn = { scrollTop: host?.scrollTop || 0, trigger,
        projectId: trigger?.closest?.('[data-project-card]')?.dataset.projectCard || next.id };
    }
    const nextAccount = next.view === 'mobile' || next.view === 'settings' && next.tab === 'account';
    const previousAccount = previousRoute.view === 'mobile' || previousRoute.view === 'settings' && previousRoute.tab === 'account';
    if (nextAccount && !previousAccount) {
      const tab = ['workspace', 'tasks', 'review', 'attention', 'activity', 'monitor'].includes(previousRoute.tab) ? previousRoute.tab : 'workspace';
      mobileReturnHash = previousRoute.view === 'project' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(previousRoute.id)
        ? '#project/' + encodeURIComponent(previousRoute.id) + '/' + tab : previousRoute.view === 'workbench' ? '#workbench' : '#home';
    }
    previousRoute = next;
    render();
    if (restore) {
      const version = acceptedVersion;
      void Promise.resolve(board.restoreViewState?.(restore.view)).then(() => {
        if (disposed || version !== acceptedVersion || acceptedHash !== restore.originHash) return;
        const host = pageHost(); if (host) host.scrollTop = restore.pageScrollTop;
        restoreFocus(restore.trigger?.isConnected ? restore.trigger : content.querySelector('[data-action="management-menu"]') || content.querySelector('h1'));
      });
    }
    if (next.view === 'home' && overviewReturn) {
      const host = root.dataset.unified === 'true' ? root.getRootNode().host?.closest('.platform-studio-surface') : document.scrollingElement;
      if (host) host.scrollTop = overviewReturn.scrollTop;
      restoreFocus(overviewReturn.trigger?.isConnected ? overviewReturn.trigger : root.querySelector(`[data-project-card="${overviewReturn.projectId}"] .ce-project-title-link`) || content.querySelector('h1'));
    }
    if (initialized && visibleBusiness() && Date.now() - lastRead >= refreshInterval) void refresh(false);
    scheduleRefresh();
    if (pendingTask) { const pending = pendingTask; pendingTask = null; if (location.hash === pending.hash) void board.open(pending.item); }
  };
  const requestedNavigation = () => {
    if (root.dataset.unified === 'true') return;
    const from = acceptedHash;
    const to = ['#workspace', '#project-setup'].includes(location.hash) ? '#workbench' : location.hash || '#home';
    if (to === from) return;
    const generation = ++navigationGeneration;
    window.history.replaceState(null, '', from);
    if (projectMenu) return;
    const waits = [];
    const event = new CustomEvent('platform-before-navigate', { cancelable: true, detail: { from, to, waitUntil: result => waits.push(Promise.resolve(result)) } });
    window.dispatchEvent(event);
    const commit = () => {
      if (disposed || generation !== navigationGeneration || window.CERemoteContext?.active === false) return;
      acceptedHash = to; window.history.replaceState(null, '', to);
      window.dispatchEvent(new CustomEvent('platform-navigation-accepted', { detail: { from, to } }));
    };
    if (event.defaultPrevented) return;
    if (!waits.length) commit();
    else void Promise.all(waits).then(results => { if (results.every(result => result === true)) commit(); }).catch(() => {});
  };
  window.addEventListener('hashchange', requestedNavigation);
  window.addEventListener('platform-navigation-accepted', changed);
  if (location.hash === '#workspace' && root.dataset.unified !== 'true') requestedNavigation();
  window.addEventListener('platform-add-project', requestProject);
  window.addEventListener('platform-native-project-adopted', nativeProjectAdopted);
  window.addEventListener('platform-native-project-action', nativeProjectAction);
  const visibilityChanged = () => {
    if (document.hidden) { board.setActive?.(false); taskCenter?.setActive(false); legacyBoard?.setActive(false); }
    else {
      consumerSnapshots.delete(board); if (taskCenter) consumerSnapshots.delete(taskCenter); if (legacyBoard) consumerSnapshots.delete(legacyBoard);
      render();
    }
    if (visibleBusiness() && initialized && Date.now() - lastRead >= refreshInterval) void refresh(false);
    scheduleRefresh();
  };
  document.addEventListener('visibilitychange', visibilityChanged);
  render(); void refresh();
  if (window.StudioMascot && window.NewsPetPrefs && window.NewsPetDirector) mascot = window.StudioMascot.mount(root, { route, navigate: hash => { location.hash = hash; } });
  const dispose = () => { disposed = true; for (const controller of pendingArchives) controller.abort(); pendingArchives.clear(); mascot?.dispose(); externalAccess?.dispose(); newsReader?.dispose(); newsTheme?.disconnect(); newsHost?.remove(); progressReturn = null; navigationGeneration++; unsubscribeAppearance?.(); unmountTheme?.(); standaloneTheme?.dispose(); closeProjectMenu(); closeNavigation(); restoreNavigation(); drawer.remove(); window.removeEventListener('resize', resizeNavigation); window.removeEventListener('scroll', closeProjectMenu, true); document.removeEventListener('pointerdown', dismissProjectMenu); request++; clearTimeout(refreshTimer); document.removeEventListener('visibilitychange', visibilityChanged); disposeMobile?.(); disposePets?.(); window.removeEventListener('hashchange', requestedNavigation); window.removeEventListener('platform-before-navigate', beforeNavigate); window.removeEventListener('platform-navigation-accepted', changed); window.removeEventListener('platform-add-project', requestProject); window.removeEventListener('platform-native-project-adopted', nativeProjectAdopted); window.removeEventListener('platform-native-project-action', nativeProjectAction); nativeProjectWrites.clear(); projectDialogTarget?.querySelectorAll('dialog').forEach(dialog => dialog.close()); projectDialogHost?.remove(); monitor?.destroy(); taskCenter?.dispose(); legacyBoard?.dispose(); board.dispose?.(); };
  const unsubscribeContext = window.CERemoteContext?.onInactive(dispose);
  return () => { unsubscribeContext?.(); dispose(); };
}
window.StudioPreview = { mount: mountStudio, projectEntryTab };
const standaloneStudio = document.getElementById('ce-studio');
if (standaloneStudio) mountStudio(standaloneStudio);
