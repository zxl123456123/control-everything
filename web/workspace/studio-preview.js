// Studio owns project navigation and composition.
'use strict';
function projectEntryTab() { return 'workspace'; }
let initialStudioTheme = window.CEUITheme?.pageTheme || window.CEStudioTheme || null;
function mountStudio(root, { onProjects = () => {}, runtimeHost = () => null } = {}) {
  const $ = id => root.querySelector('#' + id);
  const content = $('studio-content'), status = $('studio-status');
  if (!window.StudioData || !window.StudioShell) {
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
  let state = { workspace: null }, request = 0, query = '', projectFilter = 'active', initialized = false, disposed = false;
  let projectSort = 'updated', refreshMessage = '', loadFailure = '', viewMode = 'cards';
  let studioVisible = true;
  let railCollapsed = false, newsHost = null, newsReader = null, newsTheme = null;
  let overviewReturn = null;
  let refreshPromise = null, refreshAgain = false, refreshTimer = null, lastRead = 0;
  const refreshInterval = 15000;
  const visibleBusiness = () => !disposed && !document.hidden && !(root.dataset.unified === 'true' && route().view === 'project' && ['workspace', 'activity'].includes(route().tab));
  const renderedHtml = new WeakMap();
  const setHtml = (node, html) => { if (disposed) return; window.CERemoteContext?.assertActive(); if (renderedHtml.get(node) !== html) { node.innerHTML = html; renderedHtml.set(node, html); } };
  const standaloneTheme = root.dataset.unified === 'true' ? null : (initialStudioTheme || window.CEUITheme?.earlyRead('ce-studio-theme'));
  if (standaloneTheme) initialStudioTheme = null;
  const unmountTheme = standaloneTheme?.mount({ roots: [root], status: $('studio-theme-status') });
  const projects = () => state.workspace?.projects.items || [];
  const developmentUrl = id => root.dataset.unified === 'true' ? '#project/' + encodeURIComponent(id) + '/workspace' : '/workbench/web-index.html?project_id=' + encodeURIComponent(id);
  function route() {
    const [view, encoded = '', tab = ''] = location.hash.slice(1).split('/');
    let id = ''; try { id = decodeURIComponent(encoded); } catch { /* Invalid links return to projects. */ }
    if (!view && location.search) id = new URLSearchParams(location.search).get('project_id') || '';
    if ((view === 'project' || !view) && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
      return { view: 'project', id, tab: ['activity', 'settings'].includes(tab) ? tab : 'workspace' };
    }
    if (['inbox', 'tasks', 'attention'].includes(view)) return { view: 'home', id: '', tab: '' };
    if (view === 'news') return { view: 'news', id: '', tab: '' };
    if (view === 'mobile') return { view: 'mobile', id: '', tab: '' };
    if (['workbench', 'project-setup', 'workspace'].includes(view)) return { view: 'workbench', id: '', tab: '' };
    if (view === 'settings' && id === 'sources' || ['tools', 'agents'].includes(view)) return { view: 'home', id: '', tab: '' };
    if (view === 'settings') return { view: 'settings', id: '', tab: id === 'mobile' ? 'account' : /^[a-z][a-z0-9-]{0,63}$/.test(id) ? id : 'appearance' };
    return { view: ['tools', 'agents'].includes(view) ? 'tools' : 'home', id: '', tab: '' };
  }
  function navigate(value) { if (location.hash === '#' + value) render(); else location.hash = value; }
  let previousRoute = route(), mobileReturnHash = '#home', disposeMobile = null, disposePets = null;
  let acceptedHash = location.hash || '#home', navigationGeneration = 0;
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
    setHtml($('studio-topbar'), `<header class="ce-topbar"><button class="ce-iconbtn ce-rail-toggle" data-action="rail-toggle" type="button" aria-label="${railCollapsed ? '展开导航' : '收起导航'}" title="${railCollapsed ? '展开导航' : '收起导航'}" aria-controls="studio-rail" aria-expanded="${!railCollapsed}">${icon('sidebar')}</button><button class="ce-iconbtn ce-menu-trigger" data-action="navigation" type="button" aria-label="打开导航" aria-controls="studio-navigation" aria-expanded="${drawer.open}">${icon('menu')}</button><div class="ce-crumbs"><a href="#home">项目</a>${!['home', 'inbox'].includes(current.view) ? `<span> / ${escape(accountPage ? '账号与设备' : chosen?.name || ({ inbox: '事项', tools: '高级管理', mobile: '账号与设备', news: '新闻', settings: '设置', project: state.workspace ? '未找到项目' : '项目' }[current.view] || '项目'))}</span>` : ''}</div><a class="ce-button ce-plain ce-mobile-entry-mobile${accountPage ? ' is-current' : ''}" href="#settings/account"${accountPage ? ' aria-current="page"' : ''}>账号与设备</a><a class="ce-button ce-plain ce-creator-mobile" href="#news">新闻</a>${accountPage || current.view === 'news' ? '' : `<button class="ce-iconbtn" data-action="refresh" type="button" title="刷新当前页面" aria-label="刷新当前页面" aria-busy="false">${icon('refresh')}</button>`}<button class="ce-iconbtn" data-action="theme" type="button" aria-label="${root.dataset.theme === 'dark' ? '切换浅色外观' : '切换深色外观'}">${icon(root.dataset.theme === 'dark' ? 'sun' : 'moon')}</button></header>`);
    syncAppearance();
  }
  function home() {
    return window.StudioShell.renderOverview({ projects: projects(), query, projectFilter,
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
  function showNews(active) {
    active = active && studioVisible;
    if (newsHost) { newsHost.hidden = !active; newsHost.inert = !active; }
    newsReader?.setVisible(active);
    if (!active || newsHost) return;
    newsHost = document.createElement('section'); newsHost.className = 'ce-news-surface';
    newsHost.setAttribute('aria-label', '新闻阅读室'); content.parentElement.append(newsHost);
    newsReader = window.NewsSurface.mount(newsHost, {themeHost:root});
    newsReader.setVisible(active);
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
      if (state.workspace && !content.innerHTML.trim()) {
        renderChrome({ view: 'home', id: '', tab: 'workspace' });
        root.dataset.projectSurface = 'false'; setHtml(content, home());
      }
      return;
    }
    renderChrome(current);
    root.dataset.projectSurface = current.view === 'project' ? 'true' : 'false';
    if (current.view === 'news') return;
    if (current.view === 'mobile' || current.view === 'settings' && current.tab === 'account') {
      if (!disposeMobile) { renderedHtml.delete(content); disposeMobile = window.StudioMobileEntry.mount(content, { returnHash: mobileReturnHash }); }
      return;
    }
    if (current.view === 'settings' && current.tab === 'appearance') {
      if (!disposePets) { renderedHtml.delete(content); disposePets = window.StudioPetSettings.mount(content); }
      return;
    }
    if (!state.workspace) {
      setHtml(content, loadFailure
        ? window.StudioShell.renderStatePanel({ tone: 'error', title: '无法读取项目', message: loadFailure, actions: window.StudioShell.retryButton() })
        : window.StudioShell.loadingPlaceholder());
      return;
    }
    if (current.view === 'home') renderHome();
    else if (current.view === 'workbench') setHtml(content, '<div class="ce-heading"><h1>项目工作台</h1></div>' + engineUnavailable());
    else if (current.view === 'settings') setHtml(content, window.StudioShell.renderSettingsLanding({ section: current.tab, integrated: root.dataset.unified === 'true' }));
    else if (current.view === 'project' && current.tab === 'settings') setHtml(content, `<div class="ce-heading"><h1>${escape(chosen?.name || '项目')} · 项目设置</h1></div><div class="ce-empty" role="status">${chosen ? '此入口尚未就绪。' : '项目已移出或不存在。'}<a class="ce-button" href="#home">返回项目总览</a></div>`);
    else if (current.view === 'project') setHtml(content, chosen?.archived ? '<div class="ce-empty">项目已归档，仍停在当前页。<a class="ce-button" href="#home">返回项目</a><p>在“已归档”列表选择恢复项目。</p></div>' : chosen ? `<div class="ce-heading"><h1>${escape(chosen.name)}</h1></div>${engineUnavailable()}` : window.StudioShell.renderStatePanel({ title: '未找到这个项目', message: '它可能已被移出或删除。', actions: '<a class="ce-button ce-primary" href="#home">返回项目总览</a>' }));
  }
  /** Explains the blank workspace when the embedded workbench engine is not mounted, with a way onward. */
  function engineUnavailable() {
    return window.StudioShell.renderStatePanel({
      title: '项目运行组件未连接',
      message: '请从已装配内置工作台的服务打开项目。',
      actions: '<a class="ce-button" href="#home">返回项目总览</a>',
    });
  }
  function renderStatus(current) {
    if (disposed || window.CERemoteContext?.active === false) return;
    if (!state.workspace) { status.textContent = refreshMessage; status.hidden = Boolean(loadFailure); return; }
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
    if (!state.workspace && loadFailure) { loadFailure = ''; render(); }
    try {
      if (!initialized) { await client.bootstrap(); initialized = true; }
      const next = await client.snapshot();
      if (disposed || current !== request) return;
      state = next; lastRead = Date.now(); refreshMessage = ''; loadFailure = '';
      const summarizeProject = project => ({ id: project.id, name: project.name, directory: project.directories?.find(row => row.id === 'main')?.path || project.root });
      onProjects(projects().filter(project => !project.archived).map(summarizeProject), {
        archived: projects().filter(project => project.archived).map(summarizeProject) });
      render();
      renderStatus(route());
      return true;
    } catch (error) {
      if (disposed || current !== request) return;
      refreshMessage = `${error.message}。${state.workspace ? '仍显示上次读取的数据。' : '没有使用示例数据。'}`;
      if (!state.workspace) {
        // Transport errors carry draft-preservation wording meant for writes; a failed first read has no draft.
        loadFailure = ['network_error', 'timeout'].includes(error.reason) ? (error.reason === 'timeout' ? '读取超时，本地工作台没有及时响应。' : '本地工作台没有响应，请确认服务已启动。') : error.message;
        render();
      }
      renderStatus(route()); status.classList.add('error');
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
    if (action === 'skip-to-content') root.querySelector('main.ce-content')?.focus();
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
  });
  root.addEventListener('input', event => {
    if (event.target.id !== 'studio-project-search') return;
    query = event.target.value; const position = event.target.selectionStart; setHtml(content, home());
    const input = $('studio-project-search'); input.focus(); input.setSelectionRange(position, position);
  });
  root.addEventListener('change', event => {
    if (event.target.id !== 'studio-project-sort') return;
    projectSort = event.target.value === 'name' ? 'name' : 'updated'; setHtml(content, home());
    $('studio-project-sort').focus();
  });
  const changed = event => {
    closeNavigation();
    closeProjectMenu();
    const next = route();
    const from = event?.detail?.from || acceptedHash, to = event?.detail?.to || location.hash || '#home';
    acceptedHash = to;
    if (previousRoute.view === 'home' && next.view !== 'home') {
      const host = root.dataset.unified === 'true' ? root.getRootNode().host?.closest('.platform-studio-surface') : document.scrollingElement;
      const trigger = currentFocus();
      overviewReturn = { scrollTop: host?.scrollTop || 0, trigger,
        projectId: trigger?.closest?.('[data-project-card]')?.dataset.projectCard || next.id };
    }
    const nextAccount = next.view === 'mobile' || next.view === 'settings' && next.tab === 'account';
    const previousAccount = previousRoute.view === 'mobile' || previousRoute.view === 'settings' && previousRoute.tab === 'account';
    if (nextAccount && !previousAccount) {
      const tab = ['workspace', 'activity'].includes(previousRoute.tab) ? previousRoute.tab : 'workspace';
      mobileReturnHash = previousRoute.view === 'project' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(previousRoute.id)
        ? '#project/' + encodeURIComponent(previousRoute.id) + '/' + tab : previousRoute.view === 'workbench' ? '#workbench' : '#home';
    }
    previousRoute = next;
    render();
    if (next.view === 'home' && overviewReturn) {
      const host = root.dataset.unified === 'true' ? root.getRootNode().host?.closest('.platform-studio-surface') : document.scrollingElement;
      if (host) host.scrollTop = overviewReturn.scrollTop;
      restoreFocus(overviewReturn.trigger?.isConnected ? overviewReturn.trigger : root.querySelector(`[data-project-card="${overviewReturn.projectId}"] .ce-project-title-link`) || content.querySelector('h1'));
    }
    if (initialized && visibleBusiness() && Date.now() - lastRead >= refreshInterval) void refresh(false);
    scheduleRefresh();
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
    if (!document.hidden) render();
    if (visibleBusiness() && initialized && Date.now() - lastRead >= refreshInterval) void refresh(false);
    scheduleRefresh();
  };
  document.addEventListener('visibilitychange', visibilityChanged);
  render(); void refresh();
  let mascotHost = null;
  if (window.StudioMascot && window.NewsPetPrefs && window.NewsPetDirector) {
    const options = {route, navigate: hash => { location.hash = hash; }};
    if (root.dataset.unified === 'true') {
      // The Studio surface is hidden while the native workbench is visible. Keep the
      // mascot in its own styled surface outside that hidden subtree.
      mascotHost = document.createElement('div'); mascotHost.className = 'ce-global-mascot-host';
      const shadow = mascotHost.attachShadow({mode: 'open'}), style = document.createElement('link');
      const surface = document.createElement('div'); surface.id = 'ce-studio'; surface.className = 'ce-global-mascot-surface';
      style.rel = 'stylesheet'; style.href = '/studio-preview.css';
      style.onload = () => { if (!disposed) mascot = window.StudioMascot.mount(surface, {...options, themeHost: root, railHost: root}); };
      shadow.append(style, surface); document.body.append(mascotHost);
    } else mascot = window.StudioMascot.mount(root, options);
  }
  const dispose = () => { disposed = true; for (const controller of pendingArchives) controller.abort(); pendingArchives.clear(); mascot?.dispose(); mascotHost?.remove(); newsReader?.destroy(); newsTheme?.disconnect(); newsHost?.remove(); navigationGeneration++; unsubscribeAppearance?.(); unmountTheme?.(); standaloneTheme?.dispose(); closeProjectMenu(); closeNavigation(); restoreNavigation(); drawer.remove(); window.removeEventListener('resize', resizeNavigation); window.removeEventListener('scroll', closeProjectMenu, true); document.removeEventListener('pointerdown', dismissProjectMenu); request++; clearTimeout(refreshTimer); document.removeEventListener('visibilitychange', visibilityChanged); disposeMobile?.(); disposePets?.(); window.removeEventListener('hashchange', requestedNavigation); window.removeEventListener('platform-navigation-accepted', changed); window.removeEventListener('platform-add-project', requestProject); window.removeEventListener('platform-native-project-adopted', nativeProjectAdopted); window.removeEventListener('platform-native-project-action', nativeProjectAction); nativeProjectWrites.clear(); projectDialogTarget?.querySelectorAll('dialog').forEach(dialog => dialog.close()); projectDialogHost?.remove(); };
  const unsubscribeContext = window.CERemoteContext?.onInactive(dispose);
  const handle = () => { unsubscribeContext?.(); dispose(); };
  handle.setVisible = value => { studioVisible=!!value; newsReader?.setVisible(studioVisible && route().view === 'news'); };
  return handle;
}
window.StudioPreview = { mount: mountStudio, projectEntryTab };
const standaloneStudio = document.getElementById('ce-studio');
if (standaloneStudio) mountStudio(standaloneStudio);
