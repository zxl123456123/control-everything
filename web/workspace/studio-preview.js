// Studio owns navigation and composition; management modules own task actions.
'use strict';
function mountStudio(root, { onProjects = () => {} } = {}) {
  const $ = id => root.querySelector('#' + id);
  const content = $('studio-content'), status = $('studio-status');
  if (!window.StudioData || !window.WorkspaceTaskCenter || !window.WorkspaceAgentBoard) {
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
  let state = { workspace: null, agents: [], items: [] }, request = 0, query = '', initialized = false, disposed = false;
  let pendingTask = null;
  try { if (root.dataset.unified !== 'true') root.dataset.theme = localStorage.getItem('ce-studio-theme') === 'dark' ? 'dark' : 'light'; } catch { /* Preferences are optional. */ }
  const tasks = window.WorkspaceTaskCenter.create({ root: $('studio-tasks'), fetchJson: client.api, postJson: client.post,
    canWrite: client.canWrite, onSaved: refresh, onProject: id => navigate('project/' + encodeURIComponent(id) + '/manage') });
  const board = window.WorkspaceAgentBoard.create({ root: $('studio-agent-board'), fetchJson: client.api, postJson: client.post,
    onRegister: () => { location.href = '/workspace-admin#settings'; }, onAddProject: () => requestProject(),
    onProject: id => navigate(id ? 'project/' + encodeURIComponent(id) + '/tasks' : 'inbox') });
  const projects = () => state.workspace?.projects.items || [];
  const projectItems = id => state.items.filter(item => item.project_id === id);
  const projectUrl = id => root.dataset.unified === 'true' ? '#project/' + encodeURIComponent(id) + '/workspace' : '/workbench/web-index.html?project_id=' + encodeURIComponent(id);
  function route() {
    const parts = location.hash.slice(1).split('/');
    let id = ''; try { id = decodeURIComponent(parts[1] || ''); } catch { /* Invalid route stays on the overview. */ }
    const legacyProject = new URLSearchParams(location.search).get('project_id');
    if (!parts[0] && legacyProject && /^[a-z0-9][a-z0-9-]{0,63}$/.test(legacyProject)) return { view: 'project', id: legacyProject, tab: 'workspace' };
    if (['inbox', 'tasks', 'attention'].includes(parts[0])) return { view: 'inbox', id: '', tab: parts[1] === 'manage' ? 'manage' : parts[0] === 'attention' || parts[1] === 'attention' ? 'attention' : 'all' };
    return { view: ['tools', 'settings', 'agents'].includes(parts[0]) ? 'tools' : parts[0] === 'project' ? 'project' : 'home', id, tab: parts[2] === 'attention' ? 'review' : parts[2] === 'sessions' ? 'workspace' : parts[2] || 'workspace' };
  }
  function navigate(value) { if (location.hash === '#' + value) render(); else location.hash = value; }
  let onboarding = null, openingProject = false, pendingProject = false, returnTo = '', addedProject = '';
  async function openProjectDialog() {
    if (openingProject) return;
    if (!window.WorkspaceOnboarding) { location.href = '/workspace#projects'; return; }
    openingProject = true;
    try {
      if (!onboarding) {
        const response = await fetch('/workspace-admin', { credentials: 'same-origin' });
        if (!response.ok) throw new Error('添加项目暂不可用');
        const template = new DOMParser().parseFromString(await response.text(), 'text/html');
        const dialog = template.getElementById('onboarding-dialog');
        if (!dialog) throw new Error('添加项目界面未就绪');
        if (disposed) return;
        dialog.classList.add('ce-business-module'); root.append(dialog);
        onboarding = window.WorkspaceOnboarding.create({ dialog, fetchJson: client.api, postJson: client.post,
          onChanged: async project => { await refresh(); addedProject = project?.id || ''; },
          manual: () => onboarding.open({ mode: 'existing' }), manage: () => { location.href = '/workspace-admin#projects'; } });
        dialog.addEventListener('close', () => {
          const destination = addedProject ? 'project/' + encodeURIComponent(addedProject) + '/workspace' : returnTo;
          addedProject = ''; returnTo = '';
          if (destination) navigate(destination);
        });
      }
      await onboarding.open();
    } catch (error) { status.textContent = error.message; status.classList.add('error'); }
    finally { openingProject = false; }
  }
  function requestProject() {
    const current = route();
    if (current.view === 'project') returnTo = 'project/' + encodeURIComponent(current.id) + '/' + current.tab;
    if (location.hash !== '#home') { pendingProject = true; navigate('home'); }
    else void openProjectDialog();
  }
  function nav(label, href, name, active) { return `<a class="ce-nav${active ? ' is-current' : ''}" href="${href}">${icon(name)}${label}</a>`; }
  function creatorLink(className='ce-nav'){return `<a class="${className} ce-creator-link" href="${escape(creatorUrl)}" target="_blank" rel="noopener noreferrer" aria-label="在新页面打开游戏创作">${icon('grid')}游戏创作${icon('arrow')}</a>`;}
  function creatorAddressForm(){return `<section class="ce-creator-address"><div><h2>游戏创作地址</h2><p>导航中的“游戏创作”会在新页面打开此地址。请先启动独立创作服务。</p></div><form data-creator-form="true"><label for="studio-creator-url">普通 HTTP(S) 页面地址</label><div class="ce-creator-address-row"><input id="studio-creator-url" data-creator-url type="text" inputmode="url" autocomplete="off" spellcheck="false" value="${escape(creatorUrl)}" aria-describedby="studio-creator-error"${creatorUrlError?' aria-invalid="true"':''}><button type="submit" class="ce-button">保存地址</button></div><p id="studio-creator-error" role="status">${escape(creatorUrlError)}</p></form></section>`;}
  function renderChrome(current) {
    $('studio-rail').innerHTML = `<div class="ce-brand"><span class="ce-monogram">CE</span><span>Control<br>Everything</span></div><nav class="ce-navgroup">${nav('项目', '#home', 'grid', current.view === 'home')}</nav><nav class="ce-navgroup" aria-label="项目"><div class="ce-rail-label">项目</div>${projects().filter(p => !p.archived).map(p => `<a class="ce-nav ce-project-nav${current.id === p.id ? ' is-current' : ''}" href="${projectUrl(p.id)}"><span class="ce-navdot"></span>${escape(p.name)}</a>`).join('') || '<span class="ce-subtle">尚无登记项目</span>'}</nav><nav class="ce-navgroup" aria-label="创作">${creatorLink()}</nav><div class="ce-rail-bottom">${nav('工具与设置', '#tools', 'settings', current.view === 'tools')}<div class="ce-profile"><span class="ce-profile-avatar">CE</span><span>本地工作台</span></div></div>`;
    const chosen = projects().find(p => p.id === current.id);
    $('studio-topbar').innerHTML = `<header class="ce-topbar"><div class="ce-crumbs"><a href="#home">项目</a>${current.view !== 'home' ? `<span> / ${escape(chosen?.name || ({ inbox: '事项收件箱', tools: '工具与设置' }[current.view] || '项目'))}</span>` : ''}</div>${creatorLink('ce-button ce-plain ce-creator-mobile')}<button class="ce-button ce-plain" data-action="refresh" type="button">刷新</button><button class="ce-iconbtn" data-action="theme" type="button" aria-label="切换外观">${icon('moon')}</button></header>`;
  }
  function projectCard(project) {
    const items = projectItems(project.id), pending = items.filter(item => ['review', 'blocked'].includes(item.state)).length;
    const title = root.dataset.unified === 'true'
      ? `<button type="button" class="ce-project-title" data-open-project="${escape(project.id)}">${escape(project.name)}</button>`
      : `<a class="ce-project-title" href="${projectUrl(project.id)}">${escape(project.name)}</a>`;
    return `<article class="ce-project-card"><div class="ce-project-top"><span class="ce-project-icon">${icon('folder')}</span></div>${title}<p class="ce-project-desc" title="${escape(project.root || project.directories?.[0]?.path || '')}">${escape((project.root || project.directories?.[0]?.path || '').replaceAll('\\', '/').split('/').filter(Boolean).at(-1) || '')}</p><div class="ce-project-foot"><span>${items.filter(item => item.state !== 'done').length} 项待完成${pending ? ` · ${pending} 项待确认` : ''}</span></div></article>`;
  }
  function home() {
    const filtered = projects().filter(p => !p.archived && p.name.toLowerCase().includes(query.toLowerCase()));
    return `<div class="ce-heading"><div><h1>项目</h1></div><button type="button" class="ce-button ce-primary" data-action="add-project">添加项目</button></div><div class="ce-toolbar"><span class="ce-count">${filtered.length} 个项目</span><label class="ce-search"><input id="studio-project-search" aria-label="筛选项目" placeholder="查找项目" value="${escape(query)}"></label></div><section class="ce-project-grid" aria-label="真实项目">${filtered.map(projectCard).join('') || '<div class="ce-empty">没有匹配的项目。先登记一个项目文件夹，再进入工作区。</div>'}</section>`;
  }
  let monitor = null, monitorProject = '';
  function renderMonitor(current, chosen) {
    if (monitor && (!projects().some(project => project.id === monitorProject)
        || current.view === 'project' && current.id !== monitorProject)) {
      monitor.destroy(); monitor = null; monitorProject = '';
    }
    const active = current.view === 'project' && current.tab === 'monitor' && Boolean(chosen);
    $('studio-monitor').hidden = !active;
    if (!active) { monitor?.setActive(false); return; }
    if (!window.WorkspaceProjectMonitor) {
      $('studio-monitor-content').textContent = '监控资源尚未就绪，请刷新页面。'; return;
    }
    if (!monitor) {
      monitorProject = chosen.id;
      monitor = window.WorkspaceProjectMonitor.create({ root: $('studio-monitor-content'), projectId: chosen.id,
        fetchJson: client.api, onTask: () => navigate('project/' + encodeURIComponent(chosen.id) + '/manage') });
    }
    monitor.setActive(true);
  }
  function render() {
    const current = route(); renderChrome(current);
    root.dataset.projectSurface = current.view === 'project' ? 'true' : 'false';
    const chosen = projects().find(p => p.id === current.id);
    const manage = ['project', 'inbox'].includes(current.view) && current.tab === 'manage';
    const showBoard = current.view === 'inbox' && !manage || current.view === 'project' && ['tasks', 'review'].includes(current.tab);
    renderMonitor(current, chosen);
    $('studio-tasks').hidden = !manage; $('studio-agent-board').hidden = !showBoard;
    if (manage && initialized) tasks.setContext({ projectId: current.view === 'project' ? current.id : '' });
    if (showBoard) board.setProject(current.view === 'project' ? current.id : '', current.tab === 'attention' || current.tab === 'review');
    if (!state.workspace) { content.innerHTML = '<div class="ce-empty">正在读取真实项目与事项。无法连接时请使用上方“刷新”重试。</div>'; return; }
    if (current.view === 'home') content.innerHTML = home();
    else if (current.view === 'tools') content.innerHTML = `<div class="ce-heading"><div><h1>工具与设置</h1></div></div>${creatorAddressForm()}<div class="ce-tool-grid"><article class="ce-tool-card">${icon('settings')}<h2>高级接入</h2><p>外部任务执行器与旧数据。</p><a class="ce-button" href="/workspace-admin#settings">高级设置</a></article><article class="ce-tool-card">${icon('folder')}<h2>项目档案</h2><a class="ce-button" href="/workspace-admin#projects">归档与来源</a></article></div>`;
    else if (current.view === 'project') content.innerHTML = chosen ? `<div class="ce-heading"><div><h1>${escape({ tasks: '项目事项', manage: '编辑事项', review: '验收与确认', monitor: '协作监控', workspace: chosen.name }[current.tab] || '项目事项')}</h1></div>${current.tab === 'manage' ? `<a class="ce-button" href="#project/${encodeURIComponent(chosen.id)}/tasks">返回项目事项</a>` : `<a class="ce-button" href="#project/${encodeURIComponent(chosen.id)}/manage" data-edit-items>编辑事项</a>`}</div>${root.dataset.unified === 'true' ? '' : `<div class="ce-tabs"><a href="${projectUrl(chosen.id)}">开发</a><a href="#project/${encodeURIComponent(chosen.id)}/tasks">事项</a><a href="#project/${encodeURIComponent(chosen.id)}/review">验收</a><a href="#project/${encodeURIComponent(chosen.id)}/monitor">协作监控</a></div>`}` : '<div class="ce-empty">项目已移出或不存在，请返回项目列表重新选择。</div>';
    else content.innerHTML = `<div class="ce-heading"><div><h1>${manage ? '编辑事项' : '事项收件箱'}</h1><p>跨项目查看事项；进入项目后，开发和交付在同一处继续。</p></div>${manage ? '<a class="ce-button" href="#inbox">返回收件箱</a>' : ''}</div>${manage ? '' : `<nav class="ce-tabs" aria-label="事项筛选"><a href="#inbox" aria-current="${current.tab !== 'attention' ? 'page' : 'false'}">全部</a><a href="#inbox/attention" aria-current="${current.tab === 'attention' ? 'page' : 'false'}">需要我处理</a></nav>`}`;
  }
  async function refresh() {
    const current = ++request; status.textContent = state.workspace ? '正在更新，暂保留上次记录…' : '正在读取本地工作台…'; status.classList.remove('error');
    try {
      if (!initialized) { await client.bootstrap(); initialized = true; }
      const next = await client.snapshot();
      if (disposed || current !== request) return;
      state = next;
      onProjects(projects().filter(project => !project.archived).map(project => ({ id: project.id, name: project.name, directory: project.directories?.find(row => row.id === 'main')?.path || project.root })));
      tasks.update(state.workspace); render();
      status.textContent = `${root.dataset.isolatedPreview === 'true' ? '隔离测试数据' : '本地数据'} · ${projects().filter(p => !p.archived).length} 个项目 · ${state.items.length} 项事项`;
      if (!$('studio-agent-board').hidden) await board.load();
    } catch (error) {
      if (disposed || current !== request) return;
      status.textContent = `${error.message}。${state.workspace ? '仍显示上次读取的数据。' : '没有使用示例数据。'}`; status.classList.add('error');
    }
  }
  root.addEventListener('click', event => {
    const project = event.target.closest('[data-open-project]')?.dataset.openProject;
    if (project) navigate('project/' + encodeURIComponent(project) + '/workspace');
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'refresh') void refresh();
    if (action === 'add-project') requestProject();
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
    render(); if (initialized) void refresh();
    if (pendingProject && route().view === 'home') { pendingProject = false; requestAnimationFrame(() => void openProjectDialog()); }
    if (pendingTask) { const pending = pendingTask; pendingTask = null; if (location.hash === pending.hash) void board.open(pending.item); }
  };
  window.addEventListener('hashchange', changed);
  window.addEventListener('platform-add-project', requestProject);
  render(); void refresh();
  return () => { disposed = true; request++; window.removeEventListener('hashchange', changed); window.removeEventListener('platform-add-project', requestProject); monitor?.destroy(); board.dispose?.(); };
}
window.StudioPreview = { mount: mountStudio };
const standaloneStudio = document.getElementById('ce-studio');
if (standaloneStudio) mountStudio(standaloneStudio);
