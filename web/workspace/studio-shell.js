// Presentation only; Studio owns data, navigation and registration state.
'use strict';
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const labels = { appearance: '外观', account: '账号与设备', sources: '高级接入', development: '开发工具偏好' };
  const projectUrl = (id, tab = 'workspace') => '#project/' + encodeURIComponent(id) + '/' + tab;
  const icons = {
    news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    settings: '<path d="M3 6h18M3 12h18M3 18h18M9 3v6M15 9v6M9 15v6"/>',
    account: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2"/><rect x="17" y="9" width="5" height="11" rx="1"/><path d="M19 17h1"/>',
    folder: '<path d="M3 7V4h6l3 3h9v13H3Z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    cards: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    sort: '<path d="M8 3v18m-4-4 4 4 4-4M16 21V3m-4 4 4-4 4 4"/>',
    list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
    attention: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/>',
    delivery: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6m-12 7 3 3 5-6"/>',
  };
  const icon = name => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  const available = project => !project.archived && project.binding_available !== false && Boolean(project.directories?.find(row => row.id === 'main')?.path || project.root);
  function renderNavigation({ current, creatorLink = '' }) {
    const link = (label, href, active, symbol) => `<a class="ce-nav${active ? ' is-current' : ''}" href="${href}"${active ? ' aria-current="page"' : ''} title="${escape(label)}" aria-label="${escape(label)}">${icon(symbol)}<span>${label}</span></a>`;
    return `<div class="ce-brand"><span class="ce-monogram" aria-hidden="true">⌘</span><span>Control Everything</span></div><nav class="ce-navgroup" aria-label="主导航">${link('项目总览', '#home', current.view === 'home', 'folder')}${link('新闻', '#news', current.view === 'news', 'news')}${creatorLink}</nav><div class="ce-rail-bottom"><nav class="ce-navgroup" aria-label="管理">${link(labels.account, '#settings/account', current.view === 'settings' && current.tab === 'account' || current.view === 'mobile', 'account')}</nav></div>`;
  }
  function projectCard({ project, items, counts, facts }, { developmentUrl }) {
    const name = escape(project.name), id = escape(project.id);
    const status = project.archived ? '已归档' : !available(project) ? '目录待配置' : project.read_only ? '来源项目' : '本机项目';
    const summary = items.length ? `<span>${facts.attention} 待处理</span><span aria-hidden="true">·</span><span>${facts.active} 推进中</span><span aria-hidden="true">·</span><span>${facts.delivered} 有交付</span>` : '<span>尚无事项记录</span>';
    return `<article class="ce-overview-card${project.archived ? ' is-archived' : ''}" data-project-card="${id}"><div class="ce-overview-title"><span class="ce-project-kind-icon">${icon('folder')}</span><h2><a class="ce-project-title-link" href="${escape(developmentUrl(project.id))}" data-open-project="${id}">${name}</a></h2><button type="button" class="ce-iconbtn" data-project-menu="${id}" aria-label="项目菜单：${name}" aria-haspopup="menu">⋯</button></div><div class="ce-overview-recent ce-project-facts">${summary}</div><div class="ce-overview-bottom"><span class="ce-project-badges"><span class="ce-project-status">${status}</span>${facts.attention && !project.archived ? '<span class="ce-project-status ce-needs-attention">需关注</span>' : ''}</span>${counts.review ? `<a class="ce-button ce-review-shortcut" href="${projectUrl(project.id, 'review')}">待验收 ${counts.review}</a>` : facts.attention ? `<a class="ce-button ce-plain" href="${projectUrl(project.id, 'attention')}">待处理 ${facts.attention}</a>` : ''}</div></article>`;
  }
  function renderOverview({ projects, items, query, attentionOnly, archivedOnly, sort, viewMode, developmentUrl, runtimeAvailable = true }) {
    const grouped = new Map(projects.map(project => [project.id, { project, items: [], counts: {}, facts: { attention: 0, active: 0, delivered: 0 }, latest: null }]));
    for (const item of items) {
      const row = grouped.get(item.project_id); if (!row) continue;
      row.items.push(item); row.counts[item.state] = (row.counts[item.state] || 0) + 1;
      const facts = window.ProjectProgressModel.row(item);
      for (const key of ['attention', 'active', 'delivered']) row.facts[key] += Number(facts[key]);
      if (!row.latest || String(item.updated_at || '') > String(row.latest.updated_at || '')) row.latest = item;
    }
    const filtered = [...grouped.values()].filter(row => (!archivedOnly || row.project.archived) && (!attentionOnly || row.facts.attention) && row.project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    filtered.sort((a, b) => (sort === 'updated' ? String(b.latest?.updated_at || '').localeCompare(String(a.latest?.updated_at || '')) : 0) || a.project.name.localeCompare(b.project.name, 'zh-CN'));
    const noMatch = Boolean(query || attentionOnly || archivedOnly);
    const unavailable = !runtimeAvailable || !projects.some(available);
    const unavailableMessage = !runtimeAvailable ? '项目运行组件未连接' : projects.every(project => project.archived) ? '项目均已归档' : '当前项目目录不可用';
    const totals = [...grouped.values()].reduce((total, row) => ({ attention: total.attention + row.facts.attention, delivered: total.delivered + row.facts.delivered }), { attention: 0, delivered: 0 });
    if (!projects.length) return '<div class="ce-heading ce-overview-heading"><h1 tabindex="-1">项目总览</h1></div><section class="ce-empty ce-projects-empty"><span class="ce-project-empty-icon" aria-hidden="true">' + icon('folder') + '</span><h2>还没有项目</h2><p>进入工作台，添加第一个项目。</p><a class="ce-button ce-primary" href="#workbench">进入工作台</a></section>';
    return `<div class="ce-heading ce-overview-heading"><h1 tabindex="-1">项目总览</h1></div>${projects.length ? `<section class="ce-summary-band" aria-label="项目与进展"><h2>项目与进展</h2><dl class="ce-summary-metrics"><div>${icon('folder')}<dt>项目</dt><dd>${projects.length}</dd></div><div>${icon('attention')}<dt>待处理</dt><dd>${totals.attention}</dd></div><div>${icon('delivery')}<dt>有交付</dt><dd>${totals.delivered}</dd></div></dl></section>` : ''}${unavailable ? `<section class="ce-setup-notice"><span>${unavailableMessage}</span><a class="ce-button" href="#workbench">进入工作台</a></section>` : ''}<div class="ce-toolbar ce-overview-toolbar"><label class="ce-search">${icon('search')}<input id="studio-project-search" type="search" aria-label="搜索项目名称" placeholder="搜索项目" value="${escape(query)}"></label><div class="ce-segment" aria-label="项目筛选"><button type="button" data-action="all-projects" aria-pressed="${!attentionOnly && !archivedOnly}">全部</button><button type="button" data-action="attention-projects" aria-pressed="${attentionOnly}">需关注</button><button type="button" data-action="archived-projects" aria-pressed="${archivedOnly}">已归档</button></div><label class="ce-project-sort-control" title="项目排序：${sort === 'name' ? '项目名称' : '最近更新'}">${icon('sort')}<select id="studio-project-sort" aria-label="项目排序"><option value="updated"${sort === 'updated' ? ' selected' : ''}>最近更新</option><option value="name"${sort === 'name' ? ' selected' : ''}>项目名称</option></select></label><div class="ce-segment" aria-label="项目视图"><button type="button" data-action="view-cards" aria-label="卡片视图" title="卡片视图" aria-pressed="${viewMode === 'cards'}">${icon('cards')}</button><button type="button" data-action="view-list" aria-label="列表视图" title="列表视图" aria-pressed="${viewMode === 'list'}">${icon('list')}</button></div></div><p class="ce-overview-count" role="status"${noMatch ? '' : ' hidden'}>${filtered.length} 个项目</p><div class="ce-overview-list" data-view="${viewMode}">${filtered.map(row => projectCard(row, { developmentUrl })).join('') || `<div class="ce-empty">${noMatch ? '没有匹配的项目。<button type="button" class="ce-button" data-action="clear-project-filters">清除筛选</button>' : '没有匹配的项目。'}</div>`}</div>`;
  }
  function renderSettingsLanding({ section, integrated, creatorForm = '' }) {
    const title = labels[section] || labels.development;
    if (section === 'sources') return `<section class="ce-settings-page"><div class="ce-heading"><h1>高级接入</h1></div><div class="ce-settings-group"><section class="ce-setting-row"><h2>项目与会话导入</h2><a class="ce-button ce-plain" href="/workspace-admin#settings" aria-label="管理项目与会话导入">管理</a></section><section class="ce-setting-row"><h2>事项 API 接入</h2><button class="ce-button ce-plain" type="button" data-action="external-access" aria-label="管理事项 API 接入">管理</button></section>${creatorForm}</div></section>`;
    return `<div class="ce-heading"><h1>${title}</h1></div><section class="ce-empty" role="status">${integrated ? '此设置入口尚未就绪。' : '请在已连接的项目工作台中使用开发设置。'}<a class="ce-button" href="#home">返回项目总览</a></section>`;
  }
  function renderProgressHeading({ project, tab, returnHash, scope = 'current' }) {
    const name = escape(project.name), management = ['items', 'board'].includes(tab);
    const title = tab === 'items' ? '全部事项' : tab === 'board' ? '事项看板' : '项目进展';
    const scopes = [['current', '当前项目'], ['all', '全部事项'], ['attention', '待处理'], ['active', '活动项目'], ['archived', '归档项目'], ['orphan', '未登记项目'], ['global', '全局事项']];
    return `<div class="ce-heading ce-progress-heading"><div><h1 tabindex="-1">${management ? name + ' · ' : ''}${title}</h1></div>${management ? `<a class="ce-button ce-plain" href="${escape(returnHash)}">返回项目进展</a>` : ''}</div>${tab === 'items' ? `<label class="ce-management-scope">查看范围<select id="studio-items-scope">${scopes.map(([value, label]) => `<option value="${value}"${scope === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}`;
  }
  window.StudioShell = { renderNavigation, renderOverview, renderSettingsLanding, renderProgressHeading, projectCard };
})();
