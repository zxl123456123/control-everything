// Read-only cross-project progress; task management remains in its existing surfaces.
'use strict';
(() => {
  function create({ root, fetchJson, onRefresh = null }) {
    const model = window.ProjectProgressModel;
    let items = [], projects = [], contextProject = '', routeFilter = 'all', scope = '', filter = 'all';
    let selected = null, facts = null, detailEpoch = 0, disposed = false, available = false;
    let listKey = '', detailFresh = false, active = true;
    const expandedByTask = new Map();
    const el = (tag, cls = '', text) => { const node = document.createElement(tag); node.className = cls; if (text !== undefined) node.textContent = text; return node; };
    const button = (text, action, cls = '') => { const node = el('button', 'pp-button ' + cls, text); node.type = 'button'; node.addEventListener('click', action); return node; };
    const identify = (node, id) => { node.id = id; return node; };
    const time = value => { const stamp = model.timestamp(value); return Number.isFinite(stamp) ? new Date(stamp).toLocaleString('zh-CN', { hour12: false }) : '尚无来源记录'; };
    const base = id => '/api/workspace/tasks/' + encodeURIComponent(id);
    const refreshButton = action => {
      const node = button('', action, 'pp-icon-button');
      node.setAttribute('aria-label', '刷新'); node.title = '刷新';
      node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 1-2.3-5.7"/></svg>';
      return node;
    };
    root.classList.add('project-progress');
    const toolbar = el('div', 'pp-toolbar');
    const scopeNote = identify(el('p', 'pp-scope-note'), 'pp-scope-note');
    toolbar.append(scopeNote, identify(refreshButton(() => load()), 'pp-refresh'));
    const status = identify(el('p', 'pp-status'), 'pp-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const split = el('div', 'pp-split'), list = identify(el('div', 'pp-list'), 'pp-list'), panel = identify(el('section', 'pp-detail'), 'pp-detail');
    panel.setAttribute('aria-label', '目标与交付详情'); panel.tabIndex = -1;
    split.append(list, panel); root.replaceChildren(toolbar, status, split);
    const notify = (text, failed = false) => { if (disposed) return; status.textContent = text; status.classList.toggle('pp-error', failed); };
    function renderList() {
      const scopeName = scope && projects.find(project => project.id === scope)?.name;
      scopeNote.textContent = scope ? (scopeName ? `仅显示「${scopeName}」的事项` : '仅显示当前项目的事项') : '显示全部项目的事项';
      const visible = items.filter(item => model.matches(item, { scope, filter }));
      if (selected && !visible.some(item => item.id === selected)) {
        selected = null; facts = null; detailFresh = false; detailEpoch++; panel.dataset.taskId = ''; root.dataset.detailOpen = 'false';
      }
      const nextKey = JSON.stringify([visible, selected, scope, filter, available, projects]);
      if (nextKey === listKey) return; listKey = nextKey;
      split.dataset.empty = String(!visible.length);
      const scroll = list.scrollTop, historyOpen = list.querySelector('#pp-completed')?.open;
      list.replaceChildren();
      const board = el('div', 'pp-board'); board.setAttribute('aria-label', '项目进展三栏');
      const columns = [['pending', '待推进'], ['doing', '进行中'], ['review', '待验收']];
      const buckets = { pending: [], doing: [], review: [], done: [] };
      for (const item of visible) {
        const value = model.row(item);
        const key = item.state === 'done' ? 'done' : item.state === 'review' ? 'review'
          : item.state === 'doing' || value.active ? 'doing' : 'pending';
        buckets[key].push(item);
      }
      function appendRows(container, rows) {
        for (const item of rows) {
          const value = model.row(item), row = button('', () => open(item), 'pp-row');
          row.dataset.taskId = item.id; row.setAttribute('aria-pressed', String(item.id === selected));
          const caption = el('div', 'pp-row-caption'); caption.append(el('span', 'pp-dot pp-dot-' + (value.attention ? 'attention' : value.active ? 'active' : 'neutral')), el('span', '', value.label));
          if (value.time) caption.append(el('time', '', time(value.time)));
          const stateLabel = { todo: '待推进', doing: '进行中', review: '待验收', blocked: '受阻', done: '已确认完成' }[item.state] || '状态未确认';
          row.append(el('span', 'pp-project-tag', projects.find(project => project.id === item.project_id)?.name || '未归属项目'), el('strong', 'pp-row-title', item.title));
          if (value.summary) row.append(el('span', 'pp-row-summary', value.summary));
          // The column already names todo, doing and review; only states that differ from their column need a label.
          if (!['todo', 'doing', 'review'].includes(item.state)) row.append(el('span', 'pp-meta', '事项状态：' + stateLabel));
          row.append(caption);
          container.append(row);
        }
      }
      for (const [key, label] of columns) {
        const column = el('section', 'pp-column'); column.dataset.column = key;
        column.append(el('h3', '', `${label} · ${buckets[key].length}`));
        appendRows(column, buckets[key]);
        if (!buckets[key].length) column.append(el('p', 'pp-empty', available ? '暂无事项' : '正在读取…'));
        board.append(column);
      }
      list.append(board);
      if (buckets.done.length) {
        const history = identify(el('details', 'pp-history pp-completed'), 'pp-completed');
        history.open = Boolean(historyOpen || buckets.done.some(item => item.id === selected));
        history.append(el('summary', '', `已确认完成 · ${buckets.done.length}`));
        appendRows(history, buckets.done); list.append(history);
      }
      if (!visible.length) list.append(el('p', 'pp-empty', available ? '暂无项目进展。' : '正在读取项目进展…'));
      list.scrollTop = scroll;
      if (!selected) panel.replaceChildren();
    }
    async function update(snapshot) {
      if (disposed || !active) return;
      projects = snapshot.workspace.projects.items.filter(project => !project.archived);
      const ids = new Set(projects.map(project => project.id));
      items = snapshot.items.filter(item => !item.project_id || ids.has(item.project_id)); available = true;
      notify(''); renderList();
      if (selected && !root.hidden) await readDetail(selected, false);
    }
    async function load() {
      if (disposed || !active) return;
      if (onRefresh) return onRefresh();
      try {
        const workspace = await fetchJson('/api/workspace'); const rows = []; let offset = 0, revision = null;
        while (true) {
          const params = new URLSearchParams({ limit: '100', offset: String(offset) }); if (revision !== null) params.set('list_revision', String(revision));
          const page = await fetchJson('/api/workspace/items?' + params);
          if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total) || !Number.isSafeInteger(page.list_revision)
            || revision !== null && revision !== page.list_revision || page.total > offset && !page.items.length) throw new Error('列表未完整读取');
          rows.push(...page.items); revision = page.list_revision; offset += page.items.length; if (offset >= page.total) break;
        }
        await update({ workspace, items: rows });
      } catch (error) { unavailable(error); }
    }
    function unavailable(error) { available = false; notify(error?.message || '读取失败，保留上次内容，请刷新重试。', true); renderList(); }
    function setProject(projectId, next = 'all') {
      next = next === true ? 'attention' : next;
      if (contextProject === (projectId || '') && routeFilter === next) return;
      if (contextProject !== (projectId || '')) {
        selected = null; facts = null; detailFresh = false; detailEpoch++; panel.dataset.taskId = ''; root.dataset.detailOpen = 'false';
      }
      contextProject = projectId || ''; routeFilter = next;
      // Ordinary entry aggregates projects; legacy focused routes retain their precise scope.
      scope = ['review', 'attention'].includes(next) ? contextProject : '';
      filter = ['review', 'attention'].includes(next) ? next : 'all'; renderList();
    }
    async function open(item) {
      if (disposed || !active) return;
      rememberPanels();
      selected = typeof item === 'string' ? item : item.id; facts = null;
      panel.dataset.taskId = '';
      root.dataset.detailOpen = 'true'; renderList();
      if (!selected) return;
      panel.replaceChildren(el('p', 'pp-empty', '正在读取目标与材料…')); await readDetail(selected, true);
      if (active && !disposed) { panel.focus({ preventScroll: true }); panel.scrollIntoView?.({ block: 'nearest' }); }
    }
    async function readDetail(taskId, force) {
      const epoch = ++detailEpoch;
      try {
        const listed = items.find(item => item.id === taskId);
        const result = listed?.origin === 'todo' ? { item: listed, capabilities: {}, native_run: null }
          : await fetchJson(base(taskId) + '/progress');
        if (disposed || !active || epoch !== detailEpoch || selected !== taskId) return;
        if (result.item?.id !== taskId) throw new Error('详情与当前目标不一致');
        if ((!result.native_run || result.capabilities?.can_adopt) && result.item.origin !== 'todo') {
          result.legacy = await fetchJson('/api/workspace/agent-tasks/' + encodeURIComponent(taskId));
          if (result.legacy.item?.id !== taskId) throw new Error('历史材料与当前目标不一致');
        }
        if (disposed || !active || epoch !== detailEpoch || selected !== taskId) return;
        const changed = JSON.stringify(result) !== JSON.stringify(facts) || !detailFresh; facts = result; detailFresh = true;
        if (force || changed) renderDetail();
      } catch (error) {
        if (disposed || !active || epoch !== detailEpoch || selected !== taskId) return;
        detailFresh = false;
        notify(error.message || '详情读取失败，请重试。', true);
        if (facts) renderDetail();
        if (!facts) { panel.replaceChildren(button('返回列表', closeDetail), el('p', 'pp-empty', '暂不能核对最新材料，请重试。'), refreshButton(() => readDetail(taskId, true))); }
      }
    }
    function closeDetail() { root.dataset.detailOpen = 'false'; list.querySelector(`[data-task-id="${selected}"]`)?.focus(); }
    function renderMaterial(material = {}) {
      const area = el('div', 'pp-material');
      const files = material.files || [];
      for (const file of files) area.append(el('p', 'pp-file', typeof file === 'string' ? file : `${file.path || file.name || '材料'}${file.exists === false ? ' · 文件未找到' : ''}`));
      for (const entry of material.references || []) {
        const url = model.safeUrl(typeof entry === 'string' ? entry : entry.url);
        if (!url) continue; const link = el('a', 'pp-link', entry.title || '打开参考材料'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; area.append(link);
      }
      const tests = material.tests;
      area.append(el('p', 'pp-meta', tests?.status === 'passed' ? '来源报告测试通过，尚未经独立核验' : tests?.status === 'failed' ? '来源报告测试未通过' : '尚无可核验的测试记录'));
      if (Array.isArray(tests?.commands) && tests.commands.length) area.append(el('pre', 'pp-evidence', tests.commands.join('\n')));
      return area;
    }
    function resultText(text) {
      const body = el('div', 'pp-result-text');
      if (text.length <= 1600) body.append(el('p', 'pp-copy', text));
      else {
        body.append(el('p', 'pp-copy', text.slice(0, 800) + '…'));
        const full = el('details', 'pp-history'); full.append(el('summary', '', '查看完整返回'), el('p', 'pp-copy', text)); body.append(full);
      }
      return body;
    }
    function rememberPanels() {
      if (!panel.dataset.taskId) return;
      expandedByTask.set(panel.dataset.taskId, new Set([...panel.querySelectorAll('details')]
        .filter(node => node.open).map(node => node.querySelector('summary')?.textContent)));
    }
    function renderDetail() {
      if (!facts || disposed) return;
      const view = model.detail(facts), item = view.item;
      rememberPanels(); panel.dataset.taskId = item.id;
      panel.replaceChildren();
      const top = el('div', 'pp-detail-heading');
      top.append(button('‹ 返回', closeDetail, 'pp-back'), el('span', 'pp-project-tag', projects.find(project => project.id === item.project_id)?.name || '未归属项目'), refreshButton(() => readDetail(item.id, true)));
      panel.append(top, el('h2', '', item.title));
      const brief = facts.brief?.request_text;
      if (brief && brief !== item.title) panel.append(el('p', 'pp-copy', brief));
      if (view.native) panel.append(el('p', 'pp-meta', `来源时间：${time(view.sourceTime)}`));
      if (view.attention) {
        const attention = el('section', 'pp-attention');
        attention.append(el('h3', '', '待处理记录'), el('p', 'pp-copy', view.attention.text || view.attention.message || '来源等待处理。'));
        panel.append(attention);
      }
      if (view.delivery) {
        const result = el('section', 'pp-result');
        result.append(el('div', 'pp-eyebrow', item.accepted_delivery_id === view.delivery.id ? '已确认交付' : '交付记录 · 待核验'), el('h3', '', 'Agent 返回内容'), resultText(view.delivery.summary || '暂无摘要'), renderMaterial(view.delivery.material || {}));
        panel.append(result);
      } else if (facts.legacy?.review_material?.agent_result?.summary) {
        const material = facts.legacy.review_material;
        panel.append(el('h3', '', '历史 Agent 提交内容'), resultText(material.agent_result.summary), renderMaterial(material));
      } else panel.append(el('p', 'pp-empty pp-result-empty', '暂无交付记录。'));
      const messages = facts.messages || [], olderMessages = el('details', 'pp-history');
      olderMessages.append(el('summary', '', `历史反馈 · ${Math.max(0, messages.length - 1)}`));
      for (const [index, message] of messages.entries()) {
        const record = el('div', 'pp-message');
        record.append(resultText(message.body_text || ''), el('p', 'pp-meta', model.messageLabel(message)));
        (index ? olderMessages : panel).append(record);
      }
      if (messages.length > 1) panel.append(olderMessages);
      if (!view.native && facts.legacy?.review_material) {
        const historic = el('details', 'pp-history');
        historic.append(el('summary', '', '历史材料'), renderMaterial(facts.legacy.review_material)); panel.append(historic);
      }
      if ((facts.legacy?.reviews || facts.reviews)?.length) {
        const history = el('details', 'pp-history'); history.append(el('summary', '', '确认历史'));
        for (const review of facts.reviews || facts.legacy.reviews) history.append(el('p', 'pp-copy', `${time(review.created_at)} · ${review.verdict}\n${review.reason || ''}`));
        panel.append(history);
      }
      if (view.native) {
        const sourceLabel = model.row({ ...item, progress: { native_run_id: view.native.id, active_slot: view.native.active_slot, observation_state: view.native.observation_state } }).label;
        const technical = el('details', 'pp-history');
        technical.append(el('summary', '', '来源信息'), el('p', 'pp-meta', `${view.native.agent || 'Agent'} · ${view.native.provider_session_id ? '已关联稳定会话' : '等待会话身份'} · ${sourceLabel}`)); panel.append(technical);
      }
      for (const node of panel.querySelectorAll('details')) node.open = Boolean(expandedByTask.get(item.id)?.has(node.querySelector('summary')?.textContent));
    }
    const progressUpdated = () => { if (!disposed && active) void load(); };
    window.addEventListener('platform-task-progress-updated', progressUpdated);
    renderList();
    function captureViewState() {
      rememberPanels();
      return { scope, filter, query: '', selectedTaskId: selected, listScrollTop: list.scrollTop, detailScrollTop: panel.scrollTop, detailOpen: root.dataset.detailOpen === 'true' };
    }
    async function restoreViewState(value) {
      if (!value || disposed || !active) return;
      // Stale navigation packets cannot restore removed scope/search controls.
      scope = ['review', 'attention'].includes(routeFilter) ? contextProject : '';
      filter = ['review', 'attention'].includes(routeFilter) ? routeFilter : 'all';
      selected = items.some(item => item.id === value.selectedTaskId && model.matches(item, { scope, filter })) ? value.selectedTaskId : null;
      facts = null; detailFresh = false; detailEpoch++; listKey = '';
      root.dataset.detailOpen = String(Boolean(selected && value.detailOpen));
      renderList();
      const restoredId = selected, expectedEpoch = detailEpoch + (selected ? 1 : 0);
      const restoredScope = scope, restoredFilter = filter;
      if (selected) await readDetail(selected, true);
      if (disposed || !active || detailEpoch !== expectedEpoch || selected !== restoredId || scope !== restoredScope || filter !== restoredFilter) return;
      list.scrollTop = Math.max(0, Number(value.listScrollTop) || 0); panel.scrollTop = Math.max(0, Number(value.detailScrollTop) || 0);
    }
    return { update, load, unavailable, setProject, open, captureViewState, restoreViewState,
      isEditing: () => false,
      focusEditor() { panel.focus(); },
      setActive(value) { if (disposed || active === Boolean(value)) return; active = Boolean(value); detailEpoch++; if (!active) rememberPanels(); },
      refreshPresence() {}, dispose() { disposed = true; active = false; detailEpoch++; window.removeEventListener('platform-task-progress-updated', progressUpdated); } };
  }
  window.ProjectProgress = { create };
})();
