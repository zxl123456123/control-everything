// Presentation only; Studio owns data, navigation and registration state.
'use strict';
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const labels = { appearance: '外观', account: '账号与设备', sources: '来源与工具', development: '开发工具偏好' };
  const projectUrl = (id, tab = 'workspace') => '#project/' + encodeURIComponent(id) + '/' + tab;
  const icons = {
    news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    settings: '<path d="M3 6h18M3 12h18M3 18h18M9 3v6M15 9v6M9 15v6"/>',
    folder: '<path d="M3 7V4h6l3 3h9v13H3Z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    cards: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    sort: '<path d="M8 3v18m-4-4 4 4 4-4M16 21V3m-4 4 4-4 4 4"/>',
    list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
  };
  const icon = name => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  const available = project => !project.archived && project.binding_available !== false && Boolean(project.directories?.find(row => row.id === 'main')?.path || project.root);
  function renderNavigation({ current, settingsOpen, creatorLink = '', navigationId = 'studio-settings-links' }) {
    const link = (label, href, active) => `<a class="ce-nav${active ? ' is-current' : ''}" href="${href}"${active ? ' aria-current="page"' : ''} title="${escape(label)}" aria-label="${escape(label)}">${icon(href === '#news' ? 'news' : href === '#home' ? 'folder' : 'settings')}<span>${label}</span></a>`;
    return `<div class="ce-brand">Control Everything</div><nav class="ce-navgroup" aria-label="主导航">${link('项目总览', '#home', current.view === 'home')}${link('新闻', '#news', current.view === 'news')}${creatorLink}</nav><div class="ce-rail-bottom"><button class="ce-nav ce-settings-toggle" type="button" data-action="settings-toggle" aria-expanded="${settingsOpen}" aria-controls="${escape(navigationId)}" aria-label="设置" title="设置">${icon('settings')}<span>设置</span> <span aria-hidden="true">${settingsOpen ? '−' : '+'}</span></button><nav id="${escape(navigationId)}" class="ce-navgroup ce-settings-links" aria-label="设置"${settingsOpen ? '' : ' hidden'}>${Object.entries(labels).map(([section, label]) => link(label, '#settings/' + section, current.view === 'settings' && current.tab === section || section === 'account' && current.view === 'mobile')).join('')}</nav><div class="ce-profile">个人工作台</div></div>`;
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
    const needsSetup = !projects.length || !runtimeAvailable || !projects.some(available);
    const setupMessage = !projects.length ? '尚无项目' : projects.every(project => project.archived) ? '项目均已归档' : '当前项目暂不可开发';
    const totals = [...grouped.values()].reduce((total, row) => ({ attention: total.attention + row.facts.attention, delivered: total.delivered + row.facts.delivered }), { attention: 0, delivered: 0 });
    return `<div class="ce-heading ce-overview-heading"><h1 tabindex="-1">项目总览</h1></div>${projects.length ? `<section class="ce-summary-band" aria-label="项目与进展"><h2>项目与进展</h2><dl class="ce-summary-metrics"><div><dt>项目</dt><dd>${projects.length}</dd></div><div><dt>待处理</dt><dd>${totals.attention}</dd></div><div><dt>有交付</dt><dd>${totals.delivered}</dd></div></dl></section>` : ''}${needsSetup ? `<section class="ce-setup-notice"><span>${setupMessage}</span><a class="ce-button" href="#project-setup">项目配置</a></section>` : ''}<div class="ce-toolbar ce-overview-toolbar"><label class="ce-search">${icon('search')}<input id="studio-project-search" type="search" aria-label="搜索项目名称" placeholder="搜索项目" value="${escape(query)}"></label><div class="ce-segment" aria-label="项目筛选"><button type="button" data-action="all-projects" aria-pressed="${!attentionOnly && !archivedOnly}">全部</button><button type="button" data-action="attention-projects" aria-pressed="${attentionOnly}">需关注</button><button type="button" data-action="archived-projects" aria-pressed="${archivedOnly}">已归档</button></div><label class="ce-project-sort-control" title="项目排序：${sort === 'name' ? '项目名称' : '最近更新'}">${icon('sort')}<select id="studio-project-sort" aria-label="项目排序"><option value="updated"${sort === 'updated' ? ' selected' : ''}>最近更新</option><option value="name"${sort === 'name' ? ' selected' : ''}>项目名称</option></select></label><div class="ce-segment" aria-label="项目视图"><button type="button" data-action="view-cards" aria-label="卡片视图" title="卡片视图" aria-pressed="${viewMode === 'cards'}">${icon('cards')}</button><button type="button" data-action="view-list" aria-label="列表视图" title="列表视图" aria-pressed="${viewMode === 'list'}">${icon('list')}</button></div></div><p class="ce-overview-count" role="status"${noMatch ? '' : ' hidden'}>${filtered.length} 个项目</p><div class="ce-overview-list" data-view="${viewMode}">${filtered.map(row => projectCard(row, { developmentUrl })).join('') || `<div class="ce-empty">${noMatch ? '没有匹配的项目。<button type="button" class="ce-button" data-action="clear-project-filters">清除筛选</button>' : '通过项目配置添加本机目录或来源项目。'}</div>`}</div>`;
  }
  function renderProjectSetup({ result = null }) {
    const ids = result?.projects || [];
    const choose = ids.length > 1 || ids.length && result?.failedCount;
    return `<div class="ce-heading"><h1 tabindex="-1">项目配置</h1><a class="ce-button ce-plain" href="#home">返回项目总览</a></div><section class="ce-project-setup"><h2>${result?.error ? '项目已保存，列表尚未更新' : choose ? '选择已加入的项目' : '添加项目目录'}</h2>${result?.error ? '<p role="alert">请重新读取工作台，无需再次创建项目。</p><button type="button" class="ce-button" data-action="retry-registration">重新读取</button>' : choose ? `<ul class="ce-registration-results">${ids.map(project => `<li><a class="ce-button" href="${projectUrl(project.id)}">${escape(project.name)}</a></li>`).join('')}</ul>` : '<p>添加已有目录、新建目录，或明确选择来源中的项目。</p>'}${result?.failedCount ? `<p role="status">${result.failedCount} 项未加入，未成功的选择已保留。</p>` : ''}${result?.error ? '' : '<button type="button" class="ce-button ce-primary" data-action="open-project-dialog">新建项目</button>'}</section>`;
  }
  function renderSettingsLanding({ section, integrated, creatorForm = '' }) {
    const title = labels[section] || labels.development;
    if (section === 'sources') return `<div class="ce-heading"><h1>来源与工具</h1></div><section class="ce-tool-card"><h2>来源与接入</h2><a class="ce-button" href="/workspace-admin#settings">管理来源与工具</a><a class="ce-button ce-plain" href="/workspace-admin#projects">来源与历史</a></section><section class="ce-access-setting"><span>外部程序接入</span><button class="ce-button ce-plain" type="button" data-action="external-access">管理</button></section>${creatorForm}`;
    return `<div class="ce-heading"><h1>${title}</h1></div><section class="ce-empty" role="status">${integrated ? '此设置入口尚未就绪。' : '请在已连接的项目工作台中使用开发设置。'}<a class="ce-button" href="#home">返回项目总览</a></section>`;
  }
  function renderProgressHeading({ project, tab, returnHash, scope = 'current' }) {
    const name = escape(project.name), id = escape(project.id), management = ['items', 'board'].includes(tab);
    const title = tab === 'items' ? '全部事项' : tab === 'board' ? '事项看板' : '项目进展';
    const scopes = [['current', '当前项目'], ['all', '全部事项'], ['attention', '待处理'], ['active', '活动项目'], ['archived', '归档项目'], ['orphan', '未登记项目'], ['global', '全局事项']];
    return `<div class="ce-heading ce-progress-heading"><div><h1 tabindex="-1">${name} · ${title}</h1></div>${management ? `<a class="ce-button ce-plain" href="${escape(returnHash)}">返回项目进展</a>` : `<button type="button" class="ce-button" data-action="management-menu" aria-haspopup="menu" data-management-project="${id}">事项管理</button>`}</div>${tab === 'items' ? `<label class="ce-management-scope">查看范围<select id="studio-items-scope">${scopes.map(([value, label]) => `<option value="${value}"${scope === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}`;
  }
  window.StudioShell = { renderNavigation, renderOverview, renderProjectSetup, renderSettingsLanding, renderProgressHeading, projectCard };
})();
