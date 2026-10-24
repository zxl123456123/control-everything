// Studio owns navigation and composition; management modules own task actions.
'use strict';
function projectEntryTab(items) {
  if (items.some(item => item.state === 'review')) return 'review';
  if (items.some(item => item.state === 'doing')) return 'tasks';
  return 'tasks';
}
function mountStudio(root, { onProjects = () => {} } = {}) {
  const $ = id => root.querySelector('#' + id);
  const content = $('studio-content'), status = $('studio-status');
  if (!window.StudioData || !window.WorkspaceAgentBoard) {
    status.textContent = '工作台资源尚未就绪，请通过本地服务的 /studio 页面打开。'; return;
  }
  const client = window.StudioData.create();
  const icons = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    folder: '<path d="M3 7V4h6l3 3h9v13H3Z"/>',
    arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
    settings: '<path d="M3 6h7m4 0h7M3 12h3m4 0h11M3 18h11m4 0h3M10 3v6M6 9v6m8 0v6"/>',
    moon: '<path d="M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13Z"/>',
  };
  const icon = name => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.folder}</svg>`;
  const CREATOR_URL_KEY = 'ce-studio-creator-url';
  let creatorUrl = 'http://127.0.0.1:8770/', creatorUrlError = '';
  function validateCreatorUrl(value) {
    const text = String(value || '');
    if (!text || /[\s\\]/u.test(text) || !/^https?:\/\//i.test(text)) throw new Error('请输入不含空白的完整 HTTP(S) 创作页面地址。');
    let parsed;
    try { parsed = new URL(text); } catch (_) { throw new Error('创作页面地址格式不正确。'); }
    if (parsed.username || parsed.password || text.includes('?') || text.includes('#')) throw new Error('请使用不含账号、密码、查询参数或片段的普通页面地址。');
    return parsed.href;
  }
  try {
    const saved = window.localStorage?.getItem(CREATOR_URL_KEY);
    if (saved) creatorUrl = validateCreatorUrl(saved);
  } catch (_) { try { window.localStorage?.removeItem(CREATOR_URL_KEY); } catch (_) { /* Storage can be disabled. */ } }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let state = { workspace: null, agents: [], items: [] }, request = 0, query = '', archivedProjects = false, initialized = false, disposed = false;
  let pendingTask = null;
  try { if (root.dataset.unified !== 'true') root.dataset.theme = localStorage.getItem('ce-studio-theme') === 'dark' ? 'dark' : 'light'; } catch { /* Preferences are optional. */ }
  const board = window.WorkspaceAgentBoard.create({ root: $('studio-agent-board'), fetchJson: client.api, postJson: client.post,
    unified: root.dataset.unified === 'true',
    onRegister: () => { location.href = '/workspace-admin#settings'; }, onAddProject: () => requestProject(),
    onProject: id => navigate(id ? 'project/' + encodeURIComponent(id) + '/tasks' : 'inbox') });
  const projects = () => state.workspace?.projects.items || [];
  const projectItems = id => state.items.filter(item => item.project_id === id);
  const projectUrl = (id, items = projectItems(id)) => root.dataset.unified === 'true' ? '#project/' + encodeURIComponent(id) + '/' + projectEntryTab(items) : '/workbench/web-index.html?project_id=' + encodeURIComponent(id);
  function route() {
    const parts = location.hash.slice(1).split('/');
    let id = ''; try { id = decodeURIComponent(parts[1] || ''); } catch { /* Invalid route stays on the overview. */ }
    const legacyProject = new URLSearchParams(location.search).get('project_id');
    if (!parts[0] && legacyProject && /^[a-z0-9][a-z0-9-]{0,63}$/.test(legacyProject)) return { view: 'project', id: legacyProject, tab: 'workspace' };
    if (['inbox', 'tasks', 'attention'].includes(parts[0])) return { view: 'inbox', id: '', tab: parts[0] === 'attention' || parts[1] === 'attention' ? 'attention' : parts[1] === 'review' ? 'review' : 'all' };
    if (parts[0] === 'mobile') return { view: 'mobile', id: '', tab: '' };
    return { view: ['tools', 'settings', 'agents'].includes(parts[0]) ? 'tools' : parts[0] === 'project' ? 'project' : 'home', id, tab: parts[2] === 'manage' ? 'tasks' : parts[2] === 'sessions' ? 'workspace' : parts[2] || 'workspace' };
  }
  function navigate(value) { if (location.hash === '#' + value) render(); else location.hash = value; }
  let previousRoute = route(), mobileReturnHash = '#home', disposeMobile = null;
  let onboarding = null, onboardingDialog = null, openingProject = false, projectTrigger = null;
  async function openProjectDialog() {
    if (openingProject) return;
    if (!window.WorkspaceOnboarding) { showPlatformNotice('添加项目暂不可用，请刷新页面后重试。'); return; }
    openingProject = true;
    projectTrigger = currentFocus();
    try {
      if (!onboarding) {
        const response = await fetch(new URL('/workspace-admin', location.origin), { credentials: 'same-origin' });
        if (!response.ok) throw new Error('添加项目暂不可用');
        const template = new DOMParser().parseFromString(await response.text(), 'text/html');
        const dialog = template.getElementById('onboarding-dialog');
        if (!dialog) throw new Error('添加项目界面未就绪');
        if (disposed) return;
        onboardingDialog = dialog;
        dialog.classList.add('ce-business-module'); visibleDialogTarget().append(dialog);
        onboarding = window.WorkspaceOnboarding.create({ dialog, fetchJson: client.api, postJson: client.post,
          onChanged: async () => { await refresh(); },
          manual: () => onboarding.open({ mode: 'existing' }), manage: () => { location.href = '/workspace-admin#projects'; } });
        dialog.addEventListener('close', () => restoreFocus(projectTrigger));
      }
      visibleDialogTarget();
      await onboarding.open();
    } catch (error) { if (!disposed) showPlatformNotice(error.message); }
    finally { openingProject = false; }
  }
  function requestProject() { void openProjectDialog(); }
  let projectDialogHost = null, projectDialogTarget = null;
  const currentFocus = () => document.activeElement?.shadowRoot?.activeElement || document.activeElement;
  const restoreFocus = trigger => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  function visibleDialogTarget() {
    if (root.dataset.unified !== 'true') return root;
    if (!projectDialogHost) {
      // Dialogs must retain their scoped styles outside the hidden Studio surface.
      projectDialogHost = document.createElement('div');
      projectDialogHost.className = 'platform-project-dialog-host';
      projectDialogHost.dataset.platformProjectDialog = '';
      const shadow = projectDialogHost.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = [...(root.getRootNode().styleSheets || [])]
        .filter(sheet => ['/workspace.css', '/studio-preview.css'].some(path => sheet.href?.endsWith(path)))
        .map(sheet => [...sheet.cssRules].map(rule => rule.cssText).join('\n')).join('\n');
      projectDialogTarget = document.createElement('div'); projectDialogTarget.id = 'ce-studio';
      projectDialogTarget.dataset.unified = 'true'; projectDialogTarget.style.display = 'contents';
      shadow.append(style, projectDialogTarget); document.body.append(projectDialogHost);
    }
    projectDialogTarget.dataset.theme = root.dataset.theme || 'light';
    return projectDialogTarget;
  }
  function showPlatformNotice(text) {
    const host = visibleDialogTarget(), trigger = currentFocus();
    const dialog = document.createElement('dialog');
    dialog.className = 'ce-project-settings';
    dialog.innerHTML = `<form><p role="status">${escape(text)}</p><button type="button" class="ce-button">关闭</button></form>`;
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { dialog.remove(); restoreFocus(trigger); }, { once: true });
    host.append(dialog);
    dialog.showModal();
  }
  let projectSettings = null;
  function openProjectSettings(id) {
    const project = projects().find(row => row.id === id);
    if (!project || project.read_only || project.source?.kind === 'codex') return;
    projectSettings?.close(); projectSettings?.remove();
    const dialog = document.createElement('dialog'); projectSettings = dialog;
    dialog.className = 'ce-project-settings';
    dialog.setAttribute('aria-label', '项目管理');
    const previousFocus = currentFocus(), target = visibleDialogTarget();
    dialog.addEventListener('close', () => {
      dialog.remove(); restoreFocus(previousFocus);
    }, { once: true });
    dialog.innerHTML = `<form><h2>项目管理</h2><fieldset><label>项目名称<input name="name" required maxlength="80" value="${escape(project.name)}"></label><label>项目目录<span class="ce-project-directory">${escape(project.directories?.find(row => row.id === 'main')?.path || project.root || '')}</span></label><label class="ce-project-archive"><input name="archived" type="checkbox"${project.archived ? ' checked' : ''}>归档项目</label><p class="ce-subtle">归档后从常用项目中收起，保留事项、文件和已打开的终端。</p><p class="ce-project-feedback" role="status"></p><div class="ce-project-settings-actions"><button type="button" class="ce-button" data-cancel-project>取消</button><button type="submit" class="ce-button ce-primary">保存</button></div></fieldset></form>`;
    target.append(dialog);
    const fields = dialog.querySelector('fieldset'), feedback = dialog.querySelector('[role="status"]');
    dialog.querySelector('[data-cancel-project]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', event => { if (fields.disabled) event.preventDefault(); });
    dialog.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); if (fields.disabled) return;
      fields.disabled = true; feedback.textContent = '';
      try {
        const result = await client.post('/api/workspace/projects/save', { id: project.id,
          name: dialog.querySelector('[name="name"]').value.trim(), archived: dialog.querySelector('[name="archived"]').checked,
          directories: project.directories.map(row => ({ id: row.id || row.binding_id, path: row.path })), source: project.source });
        if (result.status !== 'ok' || result.project?.id !== project.id) throw new Error('服务未确认保存');
        // Close before publishing the refreshed project list to both surfaces.
        dialog.close();
        await refresh();
      } catch (error) { feedback.textContent = error.reason === 'directory_conflict' ? '此目录已由其他活动项目使用，请先核对项目列表。' : error.message; }
      finally { fields.disabled = false; }
    });
    dialog.showModal(); dialog.querySelector('[name="name"]').focus();
  }
  const manageProject = event => {
    const normalize = value => String(value || '').replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
    const directory = event.detail?.directory;
    const matches = directory ? projects().filter(project => !project.archived && normalize(project.directories?.find(row => row.id === 'main')?.path || project.root) === normalize(directory)) : [];
    if (matches.length !== 1 || matches[0].read_only || matches[0].source?.kind === 'codex') {
      showPlatformNotice('请从项目总览管理已登记的项目。'); return;
    }
    openProjectSettings(matches[0].id);
  };
  function nav(label, href, name, active) { return `<a class="ce-nav${active ? ' is-current' : ''}" href="${href}"${active ? ' aria-current="page"' : ''}>${icon(name)}${label}</a>`; }
  function creatorLink(className='ce-nav'){return `<a class="${className} ce-creator-link" href="${escape(creatorUrl)}" target="_blank" rel="noopener noreferrer" aria-label="在新页面打开游戏创作">${icon('grid')}游戏创作${icon('arrow')}</a>`;}
  function creatorAddressForm(){return `<section class="ce-creator-address"><div><h2>游戏创作地址</h2><p>导航中的“游戏创作”会在新页面打开此地址。请先启动独立创作服务。</p></div><form data-creator-form="true"><label for="studio-creator-url">普通 HTTP(S) 页面地址</label><div class="ce-creator-address-row"><input id="studio-creator-url" data-creator-url type="text" inputmode="url" autocomplete="off" spellcheck="false" value="${escape(creatorUrl)}" aria-describedby="studio-creator-error"${creatorUrlError?' aria-invalid="true"':''}><button type="submit" class="ce-button">保存地址</button></div><p id="studio-creator-error" role="status">${escape(creatorUrlError)}</p></form></section>`;}
  function renderChrome(current) {
    $('studio-rail').innerHTML = `<div class="ce-brand"><span class="ce-monogram">CE</span><span>Control<br>Everything</span></div><nav class="ce-navgroup">${nav('项目', '#home', 'grid', current.view === 'home')}${nav('新闻', '/news', 'grid', false)}${nav('手机与设备', '#mobile', 'settings', current.view === 'mobile')}</nav><nav class="ce-navgroup" aria-label="项目"><div class="ce-rail-label">项目</div>${projects().filter(p => !p.archived).map(p => `<a class="ce-nav ce-project-nav${current.id === p.id ? ' is-current' : ''}" href="${projectUrl(p.id)}"><span class="ce-navdot"></span>${escape(p.name)}</a>`).join('') || '<span class="ce-subtle">尚无登记项目</span>'}</nav><nav class="ce-navgroup" aria-label="创作">${creatorLink()}</nav><div class="ce-rail-bottom">${nav('高级管理', '#tools', 'settings', current.view === 'tools')}<div class="ce-profile"><span class="ce-profile-avatar">CE</span><span>本地工作台</span></div></div>`;
    const chosen = projects().find(p => p.id === current.id);
    $('studio-topbar').innerHTML = `<header class="ce-topbar"><div class="ce-crumbs"><a href="#home">项目</a>${current.view !== 'home' ? `<span> / ${escape(chosen?.name || ({ inbox: '事项', tools: '高级管理', mobile: '手机与设备' }[current.view] || '项目'))}</span>` : ''}</div><a class="ce-button ce-plain ce-mobile-entry-mobile${current.view === 'mobile' ? ' is-current' : ''}" href="#mobile"${current.view === 'mobile' ? ' aria-current="page"' : ''}>手机与设备</a><a class="ce-button ce-plain ce-creator-mobile" href="/news">新闻</a>${creatorLink('ce-button ce-plain ce-creator-mobile')}<button class="ce-button ce-plain" data-action="refresh" type="button">刷新</button><button class="ce-iconbtn" data-action="theme" type="button" aria-label="切换外观">${icon('moon')}</button></header>`;
  }
  function projectCard(project) {
    const items = projectItems(project.id);
    const directory = project.directories?.find(row => row.id === 'main')?.path || project.root || '';
    const counts = [['todo', '待办'], ['doing', '进行中'], ['blocked', '阻塞'], ['review', '待验收'], ['done', '已完成']]
      .map(([value, label]) => { const count = items.filter(item => item.state === value).length; return count ? `<span class="ce-project-state" data-state="${value}">${count} ${label}</span>` : ''; }).join('');
    const entry = project.archived ? '<span class="ce-project-archived">已归档</span>' : `<a class="ce-project-entry" href="${projectUrl(project.id)}"${root.dataset.unified === 'true' ? ` data-open-project="${escape(project.id)}"` : ''} aria-label="进入工作区：${escape(project.name)}"><span class="ce-project-title">${escape(project.name)}</span><span class="ce-project-open">进入工作区 ${icon('arrow')}</span></a>`;
    return `<article class="ce-project-card${project.archived ? ' is-archived' : ''}"><div class="ce-project-top"><span class="ce-project-icon">${icon('folder')}</span>${!project.read_only && project.source?.kind !== 'codex' ? `<button type="button" class="ce-iconbtn" data-project-settings="${escape(project.id)}" aria-label="项目管理：${escape(project.name)}" title="项目管理">⋯</button>` : ''}</div>${project.archived ? `<span class="ce-project-title">${escape(project.name)}</span>` : ''}${entry}<p class="ce-project-desc" title="${escape(directory)}">${escape(directory || '未登记目录')}</p><div class="ce-project-foot">${counts || '<span>暂无事项</span>'}</div></article>`;
  }
  const stateLabel = { todo: '待办', doing: '进行中', blocked: '阻塞', review: '待验收', done: '已完成' };
  function latestItem(items) {
    const stamped = items.filter(item => item.updated_at);
    return [...stamped].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] || items[0];
  }
  function entryRow(project, item, label) {
    const when = item?.updated_at ? escape(item.updated_at) : '时间未知';
    const title = item ? escape(item.title || '未命名事项') : '尚未开始';
    const detail = item ? `${escape(stateLabel[item.state] || item.state)} · ${when}` : '尚未开始';
    const contents = `<span>${escape(label || project.name)}</span><strong>${title}</strong><span>${project.archived ? '已归档 · ' : ''}${detail}</span>`;
    const main = project.archived ? `<div class="ce-entry-main">${contents}</div>` : `<a class="ce-entry-main" href="${projectUrl(project.id, item ? [item] : [])}"${root.dataset.unified === 'true' ? ` data-open-project="${escape(project.id)}"` : ''}>${contents}</a>`;
    const management = !project.read_only && project.source?.kind !== 'codex' ? `<button type="button" class="ce-iconbtn" data-project-settings="${escape(project.id)}" aria-label="项目管理：${escape(project.name)}" title="项目管理">⋯</button>` : '';
    return `<div class="ce-entry-row">${main}${management}</div>`;
  }
  function home() {
    const filtered = projects().filter(p => Boolean(p.archived) === archivedProjects && p.name.toLowerCase().includes(query.toLowerCase()));
    const attention = state.items.filter(item => ['review', 'blocked'].includes(item.state) && filtered.some(project => project.id === item.project_id));
    const active = filtered.filter(project => projectItems(project.id).some(item => item.state === 'doing'));
    const rest = filtered.filter(project => !active.some(row => row.id === project.id) && !attention.some(item => item.project_id === project.id));
    const section = (title, rows) => rows.length ? `<section class="ce-entry-section"><h2>${title}</h2>${rows.join('')}</section>` : '';
    const body = archivedProjects
      ? filtered.map(project => entryRow(project, latestItem(projectItems(project.id)))).join('')
      : section('需要你处理', attention.map(item => entryRow(filtered.find(project => project.id === item.project_id), item)))
        + section('正在进行', active.map(project => entryRow(project, latestItem(projectItems(project.id).filter(item => item.state === 'doing')))))
        + section('其余项目', rest.map(project => entryRow(project, latestItem(projectItems(project.id)))));
    return `<div class="ce-heading"><div><h1>项目</h1></div><button type="button" class="ce-button ce-primary" data-action="add-project">添加项目</button></div><div class="ce-toolbar"><span class="ce-count">${filtered.length} 个项目</span><button type="button" class="ce-button ce-plain" data-action="archived-projects" aria-pressed="${archivedProjects}">${archivedProjects ? '返回常用项目' : '已归档'}</button><label class="ce-search"><input id="studio-project-search" aria-label="筛选项目" placeholder="查找项目" value="${escape(query)}"></label></div>${body || `<div class="ce-empty">${archivedProjects ? '没有已归档项目。' : '没有匹配的项目。先登记一个项目文件夹。'}</div>`}`;
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
  function render() {
    const current = route();
    if (current.view !== 'mobile' && disposeMobile) { disposeMobile(); disposeMobile = null; }
    const chosen = projects().find(p => p.id === current.id);
    // The native surface takes over when ready; retain the previous page during preparation.
    if (root.dataset.unified === 'true' && current.view === 'project' && ['workspace', 'activity'].includes(current.tab) && (!state.workspace || chosen && !chosen.archived)) {
      monitor?.setActive(false);
      if (state.workspace && !content.innerHTML.trim()) {
        renderChrome({ view: 'home', id: '', tab: 'workspace' });
        root.dataset.projectSurface = 'false'; content.innerHTML = home();
      }
      return;
    }
    renderChrome(current);
    root.dataset.projectSurface = current.view === 'project' ? 'true' : 'false';
    const showBoard = current.view === 'inbox' || current.view === 'project' && chosen && !chosen.archived && ['tasks', 'review', 'attention'].includes(current.tab);
    renderMonitor(current, chosen);
    $('studio-tasks').hidden = true; $('studio-agent-board').hidden = !showBoard;
    if (showBoard) board.setProject(current.view === 'project' ? current.id : '', current.tab === 'review' ? 'review' : current.tab === 'attention' ? 'attention' : 'all');
    if (current.view === 'mobile') {
      if (!disposeMobile) disposeMobile = window.StudioMobileEntry.mount(content, { returnHash: mobileReturnHash });
      return;
    }
    if (!state.workspace) { content.innerHTML = '<div class="ce-empty">正在读取真实项目与事项。无法连接时请使用上方“刷新”重试。</div>'; return; }
    if (current.view === 'home') content.innerHTML = home();
    else if (current.view === 'tools') content.innerHTML = `<div class="ce-heading"><div><h1>高级管理</h1></div></div>${creatorAddressForm()}<div class="ce-tool-grid"><article class="ce-tool-card">${icon('settings')}<h2>高级接入</h2><p>外部任务执行器与旧数据。</p><a class="ce-button" href="/workspace-admin#settings">高级设置</a></article><article class="ce-tool-card">${icon('folder')}<h2>项目档案</h2><a class="ce-button" href="/workspace-admin#projects">来源与历史</a></article></div>`;
    else if (current.view === 'project') content.innerHTML = chosen?.archived ? '<div class="ce-empty">项目已归档，仍停在当前页。<a class="ce-button" href="#home">返回项目</a><p>在“已归档”列表的项目管理中取消归档即可恢复。</p></div>' : chosen ? `<div class="ce-heading"><div><h1>${current.tab === 'monitor' ? '业务进度' : showBoard ? '事项' : escape(chosen.name)}</h1></div>${current.tab === 'monitor' ? `<a class="ce-button ce-plain" href="#project/${encodeURIComponent(chosen.id)}/tasks">返回事项</a>` : showBoard ? `<a class="ce-button ce-plain" href="#project/${encodeURIComponent(chosen.id)}/monitor">业务进度</a>` : ''}</div>${showBoard ? itemFilters(current) : ''}` : '<div class="ce-empty">项目已移出或不存在，<a href="#home">返回项目</a>重新选择。</div>';
    else content.innerHTML = `<div class="ce-heading"><h1>事项</h1></div>${itemFilters(current)}`;
  }
  function itemFilters(current) {
    const href = filter => current.view === 'project' ? '#project/' + encodeURIComponent(current.id) + '/' + (filter === 'all' ? 'tasks' : filter) : '#inbox' + (filter === 'all' ? '' : '/' + filter);
    const selected = ['review', 'attention'].includes(current.tab) ? current.tab : 'all';
    return `<nav class="ce-tabs" aria-label="事项筛选">${[['all', '全部'], ['review', '待验收'], ['attention', '需处理']].map(([value, label]) => `<a href="${href(value)}"${selected === value ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
  }
  async function refresh() {
    const current = ++request; status.textContent = state.workspace ? '正在更新，暂保留上次记录…' : '正在读取本地工作台…'; status.classList.remove('error');
    try {
      if (!initialized) { await client.bootstrap(); initialized = true; }
      const next = await client.snapshot();
      if (disposed || current !== request) return;
      state = next;
      const summarizeProject = project => ({ id: project.id, name: project.name, directory: project.directories?.find(row => row.id === 'main')?.path || project.root });
      onProjects(projects().filter(project => !project.archived).map(summarizeProject), {
        archived: projects().filter(project => project.archived).map(summarizeProject) });
      render();
      status.textContent = `${root.dataset.isolatedPreview === 'true' ? '隔离测试数据' : '本地数据'} · ${projects().filter(p => !p.archived).length} 个项目 · ${state.items.length} 项事项`;
      if (!$('studio-agent-board').hidden) await board.load();
    } catch (error) {
      if (disposed || current !== request) return;
      status.textContent = `${error.message}。${state.workspace ? '仍显示上次读取的数据。' : '没有使用示例数据。'}`; status.classList.add('error');
    }
  }
  root.addEventListener('click', event => {
    const projectLink = event.target.closest('[data-open-project]');
    if (projectLink && root.dataset.unified === 'true' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && (!event.button || event.button === 0)) {
      event.preventDefault(); navigate(projectLink.getAttribute('href').slice(1));
    }
    const settingsId = event.target.closest('[data-project-settings]')?.dataset.projectSettings;
    if (settingsId) openProjectSettings(settingsId);
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'refresh') void refresh();
    if (action === 'add-project') requestProject();
    if (action === 'archived-projects') { archivedProjects = !archivedProjects; render(); }
    if (action === 'theme') { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('ce-studio-theme', root.dataset.theme); } catch { /* Preferences are optional. */ } }
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
  root.addEventListener('submit', event => {
    if (event.target.dataset.creatorForm !== 'true') return;
    event.preventDefault();
    try {
      creatorUrl = validateCreatorUrl(root.querySelector('[data-creator-url]').value);
      creatorUrlError = '';
      try { window.localStorage?.setItem(CREATOR_URL_KEY, creatorUrl); } catch { /* Keep the address for this page. */ }
    } catch (error) { creatorUrlError = error.message; }
    render(); root.querySelector('[data-creator-url]')?.focus({ preventScroll: true });
  });
  root.addEventListener('input', event => {
    if (event.target.id !== 'studio-project-search') return;
    query = event.target.value; const position = event.target.selectionStart; content.innerHTML = home();
    const input = $('studio-project-search'); input.focus(); input.setSelectionRange(position, position);
  });
  const changed = () => {
    const next = route();
    if (next.view === 'mobile' && previousRoute.view !== 'mobile') {
      const tab = ['workspace', 'tasks', 'review', 'attention', 'activity', 'monitor'].includes(previousRoute.tab) ? previousRoute.tab : 'workspace';
      mobileReturnHash = previousRoute.view === 'project' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(previousRoute.id)
        ? '#project/' + encodeURIComponent(previousRoute.id) + '/' + tab : '#home';
    }
    previousRoute = next;
    render(); if (initialized) void refresh();
    if (pendingTask) { const pending = pendingTask; pendingTask = null; if (location.hash === pending.hash) void board.open(pending.item); }
  };
  window.addEventListener('hashchange', changed);
  window.addEventListener('platform-add-project', requestProject);
  window.addEventListener('platform-manage-project', manageProject);
  render(); void refresh();
  return () => { disposed = true; request++; disposeMobile?.(); window.removeEventListener('hashchange', changed); window.removeEventListener('platform-add-project', requestProject); window.removeEventListener('platform-manage-project', manageProject); onboardingDialog?.close(); onboardingDialog?.remove(); projectSettings?.close(); projectSettings?.remove(); projectDialogTarget?.querySelectorAll('dialog').forEach(dialog => dialog.close()); projectDialogHost?.remove(); monitor?.destroy(); board.dispose?.(); };
}
window.StudioPreview = { mount: mountStudio, projectEntryTab };
const standaloneStudio = document.getElementById('ce-studio');
if (standaloneStudio) mountStudio(standaloneStudio);
