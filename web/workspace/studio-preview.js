// Studio owns navigation and composition; management modules own task actions.
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const root = $('ce-studio'), content = $('studio-content'), status = $('studio-status');
  if (!window.StudioData || !window.WorkspaceTaskCenter || !window.WorkspaceAgentBoard) {
    status.textContent = '工作台资源尚未就绪，请通过本地服务的 /studio 页面打开。'; return;
  }
  const client = window.StudioData.create();
  const labels = { todo: '待办', doing: '进行中', blocked: '阻塞', review: '待验收', done: '已完成' };
  const icons = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    folder: '<path d="M3 7V4h6l3 3h9v13H3Z"/>',
    arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
    settings: '<path d="M3 6h7m4 0h7M3 12h3m4 0h11M3 18h11m4 0h3M10 3v6M6 9v6m8 0v6"/>',
    moon: '<path d="M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13Z"/>',
  };
  const icon = name => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.folder}</svg>`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let state = { workspace: null, agents: [], items: [] }, request = 0, query = '', initialized = false;
  try { root.dataset.theme = localStorage.getItem('ce-studio-theme') === 'dark' ? 'dark' : 'light'; } catch { /* Preferences are optional. */ }
  const tasks = window.WorkspaceTaskCenter.create({ root: $('studio-tasks'), fetchJson: client.api, postJson: client.post,
    canWrite: client.canWrite, onSaved: refresh, onProject: id => navigate('project/' + encodeURIComponent(id) + '/manage') });
  const board = window.WorkspaceAgentBoard.create({ root: $('studio-agent-board'), fetchJson: client.api, postJson: client.post,
    onRegister: () => { location.href = '/workspace#agents'; }, onAddProject: () => { location.href = '/workspace#projects'; },
    onProject: id => navigate(id ? 'project/' + encodeURIComponent(id) : 'attention') });
  const projects = () => state.workspace?.projects.items || [];
  const projectItems = id => state.items.filter(item => item.project_id === id);
  const attentionItems = () => state.items.filter(item => ['blocked', 'review'].includes(item.state) || ['waiting_user', 'failed'].includes(item.assignment_state));
  const projectUrl = id => '/workbench/web-index.html?project_id=' + encodeURIComponent(id);
  function route() {
    const parts = location.hash.slice(1).split('/');
    let id = ''; try { id = decodeURIComponent(parts[1] || ''); } catch { /* Invalid route stays on the overview. */ }
    return { view: ['tasks', 'attention', 'project', 'tools'].includes(parts[0]) ? parts[0] : 'home', id, tab: parts[2] || '' };
  }
  function navigate(value) { if (location.hash === '#' + value) render(); else location.hash = value; }
  function nav(label, href, name, active) { return `<a class="ce-nav${active ? ' is-current' : ''}" href="${href}">${icon(name)}${label}</a>`; }
  function renderChrome(current) {
    $('studio-rail').innerHTML = `<div class="ce-brand"><span class="ce-monogram">CE</span><span>Control<br>Everything</span></div><nav class="ce-navgroup">${nav('工作台', '#home', 'grid', current.view === 'home')}${nav('全部事项', '#tasks', 'check', current.view === 'tasks')}${nav('待处理', '#attention', 'check', current.view === 'attention')}</nav><nav class="ce-navgroup" aria-label="项目"><div class="ce-rail-label">项目</div>${projects().filter(p => !p.archived).map(p => `<a class="ce-nav ce-project-nav${current.id === p.id ? ' is-current' : ''}" href="${projectUrl(p.id)}"><span class="ce-navdot"></span>${escape(p.name)}</a>`).join('') || '<span class="ce-subtle">尚无登记项目</span>'}</nav><div class="ce-rail-bottom">${nav('工具与设置', '#tools', 'settings', current.view === 'tools')}<div class="ce-profile"><span class="ce-profile-avatar">CE</span><span>本地工作台</span></div></div>`;
    const chosen = projects().find(p => p.id === current.id);
    $('studio-topbar').innerHTML = `<header class="ce-topbar"><div class="ce-crumbs"><a href="#home">工作台</a>${current.view !== 'home' ? `<span> / ${escape(chosen?.name || ({ tasks: '全部事项', attention: '待处理', tools: '工具与设置' }[current.view] || '项目'))}</span>` : ''}</div><button class="ce-button ce-plain" data-action="refresh" type="button">刷新</button><button class="ce-iconbtn" data-action="theme" type="button" aria-label="切换外观">${icon('moon')}</button></header>`;
  }
  function taskRow(item) {
    const agent = state.agents.find(row => row.id === item.assigned_agent_id);
    return `<button class="ce-taskrow" type="button" data-task="${escape(item.id)}"><span class="ce-taskstatus-icon">${icon('check')}</span><span><span class="ce-taskrow-title">${escape(item.title)}</span><small>${escape(agent?.name || '未分配 Agent')}</small></span><span class="ce-state ${escape(item.state)}">${escape(labels[item.state] || '状态未知')}</span></button>`;
  }
  function projectCard(project) {
    const items = projectItems(project.id), pending = items.filter(item => ['review', 'blocked'].includes(item.state)).length;
    return `<article class="ce-project-card"><div class="ce-project-top"><span class="ce-project-icon">${icon('folder')}</span><span class="ce-state">${project.archived ? '已归档' : '已登记'}</span></div><a class="ce-project-title" href="${projectUrl(project.id)}">${escape(project.name)}${icon('arrow')}</a><p class="ce-project-desc">${escape(project.root || project.directories?.[0]?.path || '项目目录未提供')}</p><div class="ce-work-preview">${items.length ? items.slice(0, 2).map(item => `<div class="ce-minirow"><span class="ce-mini-copy">${escape(item.title)}<p>${escape(labels[item.state] || '状态未知')}</p></span></div>`).join('') : '<p class="ce-subtle">尚无本地事项，可以记录项目的下一步。</p>'}</div><div class="ce-project-foot"><span>${items.length} 项事项${pending ? ` · ${pending} 项待处理` : ''}</span><a class="ce-link" href="#project/${encodeURIComponent(project.id)}">平台事项 ${icon('arrow')}</a></div></article>`;
  }
  function home() {
    const filtered = projects().filter(p => !p.archived && p.name.toLowerCase().includes(query.toLowerCase()));
    const pending = attentionItems();
    return `<div class="ce-heading"><div><h1>工作台</h1><p>项目向前推进，需要你的地方一目了然。</p></div><a class="ce-button" href="/workspace#projects">登记项目文件夹 ${icon('arrow')}</a></div><div class="ce-toolbar"><h2>你的项目</h2><label class="ce-search"><input id="studio-project-search" aria-label="筛选项目" placeholder="查找项目" value="${escape(query)}"></label></div><section class="ce-project-grid" aria-label="真实项目">${filtered.map(projectCard).join('') || '<div class="ce-empty">没有匹配的项目。先登记一个项目文件夹，再进入完整工作区。</div>'}</section><div class="ce-home-lower"><section><div class="ce-sectionhead"><h2>需要你确认 <span class="ce-number">${pending.length}</span></h2><a class="ce-link" href="#attention">查看全部</a></div><div class="ce-task-list">${pending.slice(0, 5).map(taskRow).join('') || '<div class="ce-empty">当前没有待处理事项。</div>'}</div></section><section><div class="ce-sectionhead"><h2>工作空间</h2></div><div class="ce-tool-card"><h3>项目内，直接继续工作</h3><p>项目卡进入完整工作区。仓库、工作树、终端和项目配置在同一处；事项与人工验收保留在工作台。</p><a class="ce-button" href="#tasks">记录下一步 ${icon('arrow')}</a></div></section></div>`;
  }
  function render() {
    const current = route(); renderChrome(current);
    const chosen = projects().find(p => p.id === current.id);
    const manage = current.view === 'tasks' || current.view === 'project' && current.tab === 'manage';
    const showBoard = current.view === 'attention' || current.view === 'project' && !manage;
    $('studio-tasks').hidden = !manage; $('studio-agent-board').hidden = !showBoard;
    if (manage && initialized) tasks.setContext({ projectId: current.view === 'project' ? current.id : '' });
    if (showBoard) board.setProject(current.view === 'project' ? current.id : '', current.view === 'attention');
    if (!state.workspace) { content.innerHTML = '<div class="ce-empty">正在读取真实项目与事项。无法连接时请使用上方“刷新”重试。</div>'; return; }
    if (current.view === 'home') content.innerHTML = home();
    else if (current.view === 'tools') content.innerHTML = `<div class="ce-heading"><div><h1>工具与设置</h1><p>接入和本地记录沿用现有管理能力。</p></div></div><div class="ce-tool-grid"><article class="ce-tool-card">${icon('settings')}<h2>Agent 与接入</h2><p>${state.agents.length} 个已登记 Agent。工作区内的 Agent 能力与本地执行配置分别管理。</p><a class="ce-button" href="/workspace#agents">管理接入</a></article><article class="ce-tool-card">${icon('folder')}<h2>项目登记与来源</h2><p>管理业务项目目录与观察来源。项目运行设置在项目内的原配置面板中维护。</p><a class="ce-button" href="/workspace#projects">管理项目登记</a></article><article class="ce-tool-card">${icon('check')}<h2>项目监控</h2><p>实时事件源尚未接通。当前只显示真实事项和人工验收记录。</p></article></div>`;
    else if (current.view === 'project') content.innerHTML = chosen ? `<div class="ce-heading"><div><h1>${escape(chosen.name)}</h1><p>本地事项、交付材料与人工验收</p></div><a class="ce-button ce-primary" href="${projectUrl(chosen.id)}">进入项目工作区 ${icon('arrow')}</a></div><div class="ce-tabs"><a href="#project/${encodeURIComponent(chosen.id)}">进度与验收</a><a href="#project/${encodeURIComponent(chosen.id)}/manage">编辑事项</a></div>` : '<div class="ce-empty">项目已移出或不存在，请返回工作台重新选择。</div>';
    else content.innerHTML = `<div class="ce-heading"><div><h1>${current.view === 'tasks' ? '全部事项' : '需要你处理'}</h1><p>${current.view === 'tasks' ? '记录、编辑和归属保持在本地管理库。' : '核对实际材料，再作出人工审核。'}</p></div></div>`;
  }
  async function refresh() {
    const current = ++request; status.textContent = state.workspace ? '正在更新，暂保留上次记录…' : '正在读取本地工作台…'; status.classList.remove('error');
    try {
      if (!initialized) { await client.bootstrap(); initialized = true; }
      const next = await client.snapshot();
      if (current !== request) return;
      state = next; tasks.update(state.workspace); render();
      status.textContent = `${root.dataset.isolatedPreview === 'true' ? '隔离测试数据' : '本地数据'} · ${projects().filter(p => !p.archived).length} 个项目 · ${state.items.length} 项事项`;
      await board.load();
    } catch (error) {
      if (current !== request) return;
      status.textContent = `${error.message}。${state.workspace ? '仍显示上次读取的数据。' : '没有使用示例数据。'}`; status.classList.add('error');
    }
  }
  root.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'refresh') void refresh();
    if (action === 'theme') { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('ce-studio-theme', root.dataset.theme); } catch { /* Preferences are optional. */ } }
    const taskId = event.target.closest('[data-task]')?.dataset.task;
    if (taskId) { const item = state.items.find(row => row.id === taskId); if (item) { navigate('attention'); $('studio-agent-board').hidden = false; void board.open(item); } }
  });
  root.addEventListener('input', event => {
    if (event.target.id !== 'studio-project-search') return;
    query = event.target.value; const position = event.target.selectionStart; content.innerHTML = home();
    const input = $('studio-project-search'); input.focus(); input.setSelectionRange(position, position);
  });
  window.addEventListener('hashchange', () => { render(); if (initialized) void refresh(); });
  render(); void refresh();
})();
