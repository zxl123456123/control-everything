// Cross-project progress surface. The backend remains the authority for every action.
'use strict';
(() => {
  function create({ root, fetchJson, postJson, onRefresh = null, legacyCreate, itemsHref = null, onProject = null }) {
    const model = window.ProjectProgressModel;
    let items = [], projects = [], agents = [], contextProject = '', routeFilter = 'all', scope = '', filter = 'all', query = '';
    let selected = null, facts = null, detailEpoch = 0, disposed = false, available = false, writeBusy = false;
    let listKey = '', legacy = null, newDraft = { text: '', project: '' }, createUnknown = false, detailFresh = false, active = true;
    const drafts = new Map(), intents = new Map(), expandedByTask = new Map();
    const el = (tag, cls = '', text) => { const node = document.createElement(tag); node.className = cls; if (text !== undefined) node.textContent = text; return node; };
    const button = (text, action, cls = '') => { const node = el('button', 'pp-button ' + cls, text); node.type = 'button'; node.addEventListener('click', action); return node; };
    const identify = (node, id) => { node.id = id; return node; };
    const field = (label, node) => { const wrap = el('label', 'pp-field', label); wrap.append(node); return wrap; };
    const time = value => { const stamp = model.timestamp(value); return Number.isFinite(stamp) ? new Date(stamp).toLocaleString('zh-CN', { hour12: false }) : '尚无来源记录'; };
    const base = id => '/api/workspace/tasks/' + encodeURIComponent(id);
    const token = () => window.crypto.randomUUID();
    const intent = (key, body) => {
      const { expected_revision, progress_revision, ...meaning } = body;
      if (key.startsWith('feedback:')) delete meaning.source_delivery_id;
      const hash = JSON.stringify(meaning), previous = intents.get(key);
      if (previous?.hash === hash) return previous.body;
      const bodyWithToken = { ...body, client_token: token() }; intents.set(key, { hash, body: bodyWithToken }); return bodyWithToken;
    };
    root.classList.add('project-progress');
    const heading = el('h2', 'pp-heading', '项目进展'), scopeLabel = el('p', 'pp-meta');
    const toolbar = el('div', 'pp-toolbar');
    const scopeSelect = identify(el('select'), 'pp-scope'); scopeSelect.setAttribute('aria-label', '查看项目范围');
    const search = identify(el('input'), 'pp-search'); search.type = 'search'; search.placeholder = '搜索目标或进展'; search.setAttribute('aria-label', '搜索目标或进展');
    const newButton = identify(button('新建事项', () => openNew(), 'pp-primary'), 'pp-new');
    toolbar.append(scopeSelect, search, button('刷新', () => load()), newButton);
    const scopeChoice = window.WorkspaceAgents?.attachCollectionChoice(scopeSelect, '查看项目范围');
    let ownerChoice = null;
    const filters = el('div', 'pp-filters'); filters.setAttribute('aria-label', '进展视角');
    const status = identify(el('p', 'pp-status'), 'pp-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const split = el('div', 'pp-split'), list = identify(el('div', 'pp-list'), 'pp-list'), panel = identify(el('section', 'pp-detail'), 'pp-detail');
    panel.setAttribute('aria-label', '目标与交付详情'); panel.tabIndex = -1;
    const legacyRoot = el('div', 'pp-legacy');
    split.append(list, panel); root.replaceChildren(heading, scopeLabel, toolbar, filters, status, split, legacyRoot);
    const dialog = identify(el('dialog', 'pp-new-dialog'), 'pp-new-dialog'); dialog.setAttribute('aria-label', '新建事项'); root.append(dialog);
    const notify = (text, failed = false) => { if (disposed) return; status.textContent = text; status.classList.toggle('pp-error', failed); };
    function setWriting(value) {
      writeBusy = value;
      if (disposed) return;
      newButton.disabled = value;
      for (const control of list.querySelectorAll('button')) if (control.dataset.newIdea === 'true') control.disabled = value;
    }
    scopeSelect.addEventListener('change', () => { scope = scopeSelect.value; renderList(); });
    search.addEventListener('input', () => { query = search.value; renderList(); });
    function renderScopes() {
      scopeSelect.replaceChildren();
      const add = (value, text) => { const option = el('option', '', text); option.value = value; scopeSelect.append(option); };
      add('', '所有项目'); for (const project of projects) add(project.id, project.name);
      add('__global__', '未归属项目');
      if (scope && scope !== '__global__' && !projects.some(project => project.id === scope)) add(scope, '原项目范围已失效');
      scopeSelect.value = scope; scopeChoice?.refresh();
    }
    function renderList() {
      const views = [['all', '全部'], ['attention', '需要我'], ['active', '正在推进'], ['delivery', '最近交付']];
      filters.replaceChildren();
      for (const [key, label] of views) {
        const count = items.filter(item => model.matches(item, { scope, filter: key })).length;
        const control = button(`${label} ${available ? count : '—'}`, () => { filter = key; renderList(); });
        control.dataset.filter = key; control.setAttribute('aria-pressed', String(filter === key)); filters.append(control);
      }
      if (routeFilter === 'review' && filter === 'review') filters.append(el('span', 'pp-meta', '旧链接：仅待验收'));
      const visible = items.filter(item => model.matches(item, { scope, filter, query }));
      scopeLabel.textContent = '查看范围：' + (scope === '__global__' ? '未归属项目' : scope ? projects.find(project => project.id === scope)?.name || '原项目范围已失效' : '所有项目');
      if (selected && !visible.some(item => item.id === selected)) {
        selected = null; facts = null; detailFresh = false; detailEpoch++; panel.dataset.taskId = ''; root.dataset.detailOpen = 'false';
      }
      const nextKey = JSON.stringify([visible, selected, scope, filter, query, available, projects]);
      if (nextKey === listKey) return; listKey = nextKey;
      split.dataset.empty = String(!visible.length);
      const scroll = list.scrollTop, historyOpen = list.querySelector('#pp-completed')?.open;
      list.replaceChildren();
      const projectTools = el('div', 'pp-project-tools');
      const groupIds = [...projects.map(project => project.id), ...(visible.some(item => !item.project_id) ? [''] : [])];
      for (const projectId of groupIds) {
        const rows = visible.filter(item => (item.project_id || '') === projectId); if (!rows.length) continue;
        if (projectId) {
          const name = projects.find(project => project.id === projectId)?.name || projectId;
          const tools = el('div', 'pp-group-tools'), records = el('a', 'pp-link', name + ' · 业务记录');
          records.href = '#project/' + encodeURIComponent(projectId) + '/monitor';
          records.title = '查看独立记录的项目业务进度';
          const addIdea = button('＋', () => openNew(projectId), 'pp-add-group');
          addIdea.setAttribute('aria-label', '新建事项：' + (projects.find(project => project.id === projectId)?.name || projectId));
          addIdea.dataset.newIdea = 'true'; addIdea.disabled = writeBusy;
          tools.append(records, addIdea); projectTools.append(tools);
        }
      }
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
          row.append(el('span', 'pp-meta', projects.find(project => project.id === item.project_id)?.name || '未归属项目'), el('strong', 'pp-row-title', item.title), el('span', 'pp-row-summary', value.summary || (value.delivered ? '有交付内容可查看' : value.active ? '查看最近来源与当前活动' : '打开查看目标和下一步')), el('span', 'pp-meta', '事项状态：' + stateLabel), caption);
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
      list.append(projectTools, board);
      if (buckets.done.length) {
        const history = identify(el('details', 'pp-history pp-completed'), 'pp-completed');
        history.open = Boolean(historyOpen || buckets.done.some(item => item.id === selected));
        history.append(el('summary', '', `已确认完成 · ${buckets.done.length}`));
        appendRows(history, buckets.done); list.append(history);
      }
      if (!visible.length) list.append(el('p', 'pp-empty', scope && scope !== '__global__' && !projects.some(project => project.id === scope) ? '原项目范围已失效，请明确选择其他范围。' : available ? query ? '没有匹配的记录。' : '这个视角下暂无记录。' : '正在读取项目进展…'));
      list.scrollTop = scroll;
      if (!selected) panel.replaceChildren(...(visible.length ? [el('div', 'pp-empty', '选择一项目标，查看最近进展和成果。')] : []));
    }
    async function update(snapshot) {
      if (disposed || !active) return;
      projects = snapshot.workspace.projects.items.filter(project => !project.archived);
      agents = snapshot.agents || agents;
      const ids = new Set(projects.map(project => project.id));
      items = snapshot.items.filter(item => !item.project_id || ids.has(item.project_id)); available = true;
      renderScopes(); renderList();
      if (selected && !root.hidden && !writeBusy) await readDetail(selected, false);
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
    function unavailable(error) { available = false; notify(error?.message || '读取失败，保留上次内容和草稿，请刷新重试。', true); renderList(); }
    function setProject(projectId, next = 'all') {
      next = next === true ? 'attention' : next;
      if (contextProject === (projectId || '') && routeFilter === next) return;
      if (contextProject !== (projectId || '')) {
        selected = null; facts = null; detailFresh = false; detailEpoch++; query = ''; search.value = ''; panel.dataset.taskId = ''; root.dataset.detailOpen = 'false';
      }
      contextProject = projectId || ''; routeFilter = next;
      // Ordinary entry aggregates projects; legacy focused routes retain their precise scope.
      scope = ['review', 'attention'].includes(next) || contextProject === '__global__' ? contextProject : '';
      filter = ['review', 'attention'].includes(next) ? next : 'all'; renderScopes(); renderList();
    }
    function needsProject(item) { return Boolean(onProject && item.project_id && item.project_id !== contextProject); }
    function source(item, resume = false) {
      if (needsProject(item)) { onProject(item.project_id, item); return; }
      const event = new CustomEvent('platform-open-task-session', { cancelable: true, detail: { projectId: item.project_id, taskId: item.id, resume } });
      if (window.dispatchEvent(event)) notify('工作区尚未连接，请从开发区查看原会话。', true);
    }
    function start(item) {
      if (needsProject(item)) { onProject(item.project_id, item); return; }
      const event = new CustomEvent('platform-start-task-agent', { cancelable: true, detail: { projectId: item.project_id, taskId: item.id } });
      if (window.dispatchEvent(event)) notify('工作区尚未连接，请先打开开发区。', true);
    }
    function adopt(item, session) {
      if (needsProject(item)) { onProject(item.project_id, item); return; }
      const event = new CustomEvent('platform-adopt-task-session', { cancelable: true,
        detail: { projectId: item.project_id, taskId: item.id, sessionId: session.id } });
      if (window.dispatchEvent(event)) notify('工作区尚未连接，请从原会话继续。', true);
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
        notify(error.message || '详情读取失败，草稿已保留。', true);
        if (facts) renderDetail();
        if (!facts) { panel.replaceChildren(button('返回列表', closeDetail), el('p', 'pp-empty', '暂不能核对最新材料，请重试。'), button('重试', () => readDetail(taskId, true))); }
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
      const view = model.detail(facts), item = view.item, draft = drafts.get(item.id) || { text: '', open: false };
      const crossProject = needsProject(item);
      drafts.set(item.id, draft);
      const focus = root.getRootNode?.()?.activeElement || document.activeElement;
      const editing = focus?.id === 'pp-feedback-text'; const selection = editing ? [focus.selectionStart, focus.selectionEnd] : null;
      rememberPanels(); panel.dataset.taskId = item.id;
      panel.replaceChildren();
      const top = el('div', 'pp-detail-heading'); top.append(button('‹ 返回', closeDetail, 'pp-back'), el('span', 'pp-meta', projects.find(project => project.id === item.project_id)?.name || '未归属项目'), button('刷新详情', () => readDetail(item.id, true)));
      panel.append(top, el('h2', '', item.title));
      const brief = facts.brief?.request_text;
      if (brief && brief !== item.title) panel.append(el('p', 'pp-copy', brief));
      if (view.native) panel.append(el('p', 'pp-meta', `最近来源：${time(view.sourceTime)}`));
      if (view.attention) {
        const attention = el('section', 'pp-attention'); attention.append(el('h3', '', '需要你处理'), el('p', 'pp-copy', view.attention.text || view.attention.message || '会话正在等待处理，请回到来源查看。'), button(crossProject ? '进入所属项目处理' : '返回会话处理', () => source(item)));
        panel.append(attention);
      }
      if (view.delivery) {
        const result = el('section', 'pp-result'); result.append(el('div', 'pp-eyebrow', item.accepted_delivery_id === view.delivery.id ? '此版本已确认' : '最近交付 · 尚未独立验证'), el('h3', '', 'Agent 返回内容'), resultText(view.delivery.summary || '暂无摘要'), renderMaterial(view.delivery.material || {}));
        panel.append(result);
      } else if (facts.legacy?.review_material?.agent_result?.summary) {
        const material = facts.legacy.review_material;
        panel.append(el('h3', '', '历史 Agent 提交内容'), resultText(material.agent_result.summary), renderMaterial(material));
      } else panel.append(el('p', 'pp-empty pp-result-empty', view.native ? '暂未取得可确认的交付。可以返回会话查看当前工作。' : '这里记录目标。开始开发后，实际来源与成果会汇集到这里。'));
      const actions = el('div', 'pp-actions');
      if (crossProject) actions.append(identify(button('进入所属项目处理', () => onProject(item.project_id, item)), 'pp-open-project'));
      if (view.canConfirm && item.accepted_delivery_id !== view.delivery?.id) actions.append(identify(button('确认完成', () => confirmDelivery(view), 'pp-primary'), 'pp-confirm'));
      if (view.canFeedback) actions.append(identify(button('提出修改', () => { draft.open = true; renderDetail(); panel.querySelector('#pp-feedback-text')?.focus(); }), 'pp-feedback-open'));
      if (!crossProject && view.native) actions.append(button('返回会话', () => source(item)));
      if (!crossProject && view.canResume) actions.append(button('恢复会话', () => source(item, true)));
      if (!crossProject && view.canStart) actions.append(identify(button('开始开发', () => start(item), 'pp-primary'), 'pp-start'));
      if (view.capabilities.can_reconcile_start && view.native?.brief_snapshot?.request) actions.append(button('核对并继续启动', () => perform(view,
        () => postJson(base(item.id) + '/native-start', view.native.brief_snapshot.request), '已核对原启动意图，请查看最新状态。')));
      panel.append(actions);
      if (view.native && view.delivery && !view.canConfirm && item.accepted_delivery_id !== view.delivery.id) panel.append(el('p', 'pp-meta',
        view.native.active_slot === 0 ? '跟踪已结束，历史交付仍可查看。' : view.native.observation_state === 'working' ? '后续工作仍在进行，暂不能确认这个版本。' : '当前来源或反馈尚待核对，暂不能确认这个版本。'));
      if (view.canFeedback && (draft.open || draft.text)) {
        const box = el('section', 'pp-feedback'), input = identify(el('textarea'), 'pp-feedback-text'); input.rows = 3; input.maxLength = 8000; input.placeholder = '说明哪里需要调整…'; input.value = draft.text;
        input.addEventListener('input', () => { draft.text = input.value; });
        const buttons = el('div', 'pp-actions');
        buttons.append(identify(button(view.canSend ? '发送并继续' : '保存意见并返回会话', () => feedback(view, view.canSend), 'pp-primary'), 'pp-feedback-send'));
        if (view.canSend) buttons.append(identify(button('仅保存', () => feedback(view, false)), 'pp-feedback-save'));
        box.append(field('修改意见', input), buttons); panel.append(box);
      }
      const messages = facts.messages || [], olderMessages = el('details', 'pp-history');
      olderMessages.append(el('summary', '', `更早的反馈 · ${Math.max(0, messages.length - 1)}`));
      for (const [index, message] of messages.entries()) {
        const record = el('div', 'pp-message'); record.append(resultText(message.body_text || ''), el('p', 'pp-meta', model.messageLabel(message)));
        const delivery = message.native_delivery;
        if (view.canSend && delivery?.native_run_id === view.native.id && ['saved', 'refused'].includes(delivery.state)) record.append(button(delivery.state === 'saved' ? '发送并继续' : '重试发送', () => sendSaved(view, message)));
        (index ? olderMessages : panel).append(record);
      }
      if (messages.length > 1) panel.append(olderMessages);
      const sessions = (facts.legacy?.review_material?.sessions || []).filter(session =>
        session.id && session.source_instance && ['codex', 'claude'].includes(session.source));
      if (!crossProject && view.capabilities.can_adopt && sessions.length) {
        const connect = el('details', 'pp-history'); connect.append(el('summary', '', '关联已有会话'),
          el('p', 'pp-meta', '选择已关联的来源，将核对当前工作区中的真实会话，不会新建会话。'));
        for (const session of sessions) connect.append(button(session.title || `${session.source} 会话`, () => adopt(item, session)));
        panel.append(connect);
      }
      if (!view.native) {
        const historic = el('details', 'pp-history'); historic.append(el('summary', '', '历史记录与操作'));
        historic.append(el('p', 'pp-meta', '原有外部执行、人工验收和会话关联保留原规则。'));
        if (facts.legacy?.review_material) historic.append(renderMaterial(facts.legacy.review_material));
        if (item.origin === 'todo') {
          const href = itemsHref ? itemsHref(item.project_id || contextProject) : '/workspace-admin#tasks';
          if (href) { const link = el('a', 'pp-link', itemsHref ? '打开事项管理' : '打开历史待办管理'); link.href = href; historic.append(link); }
          else historic.append(el('p', 'pp-meta', '请在项目事项管理中明确选择全局范围。'));
        }
        else historic.append(button(item.state === 'review' ? '历史人工确认' : '打开历史操作', () => openLegacy(item)));
        panel.append(historic);
      }
      if ((facts.legacy?.reviews || facts.reviews)?.length) {
        const history = el('details', 'pp-history'); history.append(el('summary', '', '确认历史'));
        for (const review of facts.reviews || facts.legacy.reviews) history.append(el('p', 'pp-copy', `${time(review.created_at)} · ${review.verdict}\n${review.reason || ''}`)); panel.append(history);
      }
      if (view.native) {
        const sourceLabel = model.row({ ...item, progress: { native_run_id: view.native.id, active_slot: view.native.active_slot, observation_state: view.native.observation_state } }).label;
        const technical = el('details', 'pp-history'); technical.append(el('summary', '', '来源信息'), el('p', 'pp-meta', `${view.native.agent || 'Agent'} · ${view.native.provider_session_id ? '已关联稳定会话' : '等待会话身份'} · ${sourceLabel}`)); panel.append(technical);
        if (view.capabilities.can_release) {
          technical.append(el('p', 'pp-meta', '结束跟踪会保留记录，不会停止原会话。'), button('结束跟踪', () => perform(view,
            () => postJson(base(item.id) + '/native-release', intent('release:' + item.id, { native_run_id: view.native.id,
              expected_revision: item.revision, expected_binding_revision: view.native.binding_revision, confirmed: true })), '已结束跟踪，原会话保持不变。')));
        }
      }
      for (const node of panel.querySelectorAll('button')) node.disabled = writeBusy;
      if (!detailFresh) for (const node of actions.querySelectorAll('button')) node.disabled = true;
      for (const node of panel.querySelectorAll('details')) node.open = Boolean(expandedByTask.get(item.id)?.has(node.querySelector('summary')?.textContent));
      if (editing) { const input = panel.querySelector('#pp-feedback-text'); input?.focus({ preventScroll: true }); input?.setSelectionRange?.(...selection); }
    }
    async function perform(view, action, success) {
      if (writeBusy || disposed) return;
      if (!detailFresh) { notify('请先刷新详情，核对最新材料后再操作。', true); return; }
      setWriting(true); renderDetail();
      try { await action(); if (disposed) return; notify(success); await readDetail(view.item.id, true); if (onRefresh) await onRefresh(); }
      catch (error) {
        if (error.status === 409) { intents.delete('review:' + view.item.id); intents.delete('feedback:' + view.item.id); }
        notify((error.message || '操作未确认') + '。输入已保留，请核对最新记录。', true); await readDetail(view.item.id, true);
      }
      finally { setWriting(false); if (!disposed) renderDetail(); }
    }
    function confirmDelivery(view) {
      const body = intent('review:' + view.item.id, { expected_revision: view.item.revision, progress_revision: view.item.progress_revision, delivery_id: view.delivery.id, verdict: 'approved', reason: '', confirmed: true });
      return perform(view, () => postJson(base(view.item.id) + '/delivery-review', body), '已确认这个交付版本。');
    }
    function feedback(view, send) {
      const draft = drafts.get(view.item.id); if (!draft?.text.trim()) { notify('先写一句需要修改的地方。', true); return; }
      const body = intent('feedback:' + view.item.id, { expected_revision: view.item.revision, progress_revision: view.item.progress_revision, source_delivery_id: view.delivery?.id || null, body_text: draft.text.trim(), send });
      return perform(view, async () => {
        await postJson(base(view.item.id) + '/native-feedback', body);
        draft.text = ''; draft.open = false; intents.delete('feedback:' + view.item.id);
        if (!view.canSend) source(view.item);
      }, send ? '意见已记录，送达情况见下方回执。' : '意见已保存，尚未发送。');
    }
    function sendSaved(view, message) {
      return perform(view, () => postJson(base(view.item.id) + '/native-messages/' + encodeURIComponent(message.id) + '/send', {}), '已核对本次发送，结果见回执。');
    }
    function openLegacy(item) {
      if (!legacyCreate) return;
      if (!legacy) legacy = legacyCreate({ root: legacyRoot, fetchJson, postJson, onRefresh });
      legacy.update({ workspace: { projects: { items: projects } }, agents, items }); void legacy.open(item);
    }
    function openNew(projectId) {
      if (writeBusy) return;
      const inherited = projectId || (contextProject && contextProject !== '__global__' ? contextProject : null);
      if (inherited) newDraft.project = inherited;
      ownerChoice?.dispose(); ownerChoice = null;
      dialog.replaceChildren(); const title = el('h2', '', '新建事项'), input = identify(el('textarea'), 'pp-new-text'); input.rows = 4; input.maxLength = 2000; input.value = newDraft.text; input.placeholder = '输入事项目标';
      input.addEventListener('input', () => { newDraft.text = input.value; });
      const owner = identify(el('select'), 'pp-new-project'); const empty = el('option', '', '选择所属项目'); empty.value = ''; owner.append(empty);
      for (const project of projects) { const option = el('option', '', project.name); option.value = project.id; owner.append(option); }
      owner.value = newDraft.project; owner.addEventListener('change', () => { newDraft.project = owner.value; syncLaunchLabel(); });
      const info = identify(el('p', 'pp-status'), 'pp-new-status'); info.setAttribute('role', 'status');
      if (createUnknown) info.textContent = '上次创建结果未确认，请先刷新列表核对，避免重复创建。';
      const controls = el('div', 'pp-actions');
      const save = button('保存事项', () => createItem(false), 'pp-primary'), launch = button('开始开发', () => createItem(true));
      function syncLaunchLabel() { launch.textContent = needsProject({ project_id: inherited || newDraft.project }) ? '保存并进入项目' : '开始开发'; }
      syncLaunchLabel();
      controls.append(save, launch, button('取消', () => dialog.close()));
      if (createUnknown) controls.append(button('已核对列表，继续记录', () => { createUnknown = false; info.textContent = '请确认列表没有这条目标，再保存。'; }));
      dialog.append(title, field('目标', input), inherited ? el('p', 'pp-meta', '所属项目：' + (projects.find(project => project.id === inherited)?.name || inherited)) : field('所属项目', owner), info, controls);
      if (!inherited) ownerChoice = window.WorkspaceAgents?.attachCollectionChoice(owner, '所属项目');
      async function createItem(startNow) {
        if (writeBusy) return;
        const title = newDraft.text.trim(), projectId = inherited || newDraft.project;
        if (!title || !projectId) { info.textContent = '填写目标并选择所属项目。'; return; }
        if (createUnknown) { info.textContent = '请先刷新列表核对上次创建结果；输入仍保留。'; return; }
        setWriting(true); save.disabled = launch.disabled = true;
        try {
          const result = await postJson('/api/workspace/items', { title, project_id: projectId, assigned_agent_id: null });
          if (!result.item?.id) throw new Error('未取得已创建记录');
          newDraft = { text: '', project: projectId }; dialog.close(); await load(); await open(result.item);
          if (startNow) start(result.item);
        } catch (error) { createUnknown = error.status !== 400 && error.status !== 403 && error.status !== 409; info.textContent = '创建结果未确认，输入已保留。' + error.message; }
        finally { setWriting(false); if (!disposed) renderDetail(); save.disabled = launch.disabled = false; }
      }
      dialog.showModal(); input.focus();
    }
    dialog.addEventListener('cancel', event => { if (writeBusy) event.preventDefault(); });
    const progressUpdated = () => { if (!disposed && active) void load(); };
    window.addEventListener('platform-task-progress-updated', progressUpdated);
    renderScopes(); renderList();
    function captureViewState() {
      rememberPanels();
      return { scope, filter, query, selectedTaskId: selected, listScrollTop: list.scrollTop, detailScrollTop: panel.scrollTop, detailOpen: root.dataset.detailOpen === 'true' };
    }
    async function restoreViewState(value) {
      if (!value || disposed || !active) return;
      scope = typeof value.scope === 'string' ? value.scope : '';
      filter = ['all', 'attention', 'active', 'delivery', 'review'].includes(value.filter) ? value.filter : 'all';
      query = typeof value.query === 'string' ? value.query : ''; search.value = query;
      selected = items.some(item => item.id === value.selectedTaskId && model.matches(item, { scope, filter, query })) ? value.selectedTaskId : null;
      facts = null; detailFresh = false; detailEpoch++; listKey = '';
      root.dataset.detailOpen = String(Boolean(selected && value.detailOpen));
      renderScopes(); renderList();
      const restoredId = selected, expectedEpoch = detailEpoch + (selected ? 1 : 0);
      const restoredScope = scope, restoredFilter = filter, restoredQuery = query;
      if (selected) await readDetail(selected, true);
      if (disposed || !active || detailEpoch !== expectedEpoch || selected !== restoredId || scope !== restoredScope || filter !== restoredFilter || query !== restoredQuery) return;
      list.scrollTop = Math.max(0, Number(value.listScrollTop) || 0); panel.scrollTop = Math.max(0, Number(value.detailScrollTop) || 0);
    }
    return { update, load, unavailable, setProject, open, captureViewState, restoreViewState,
      isEditing: () => writeBusy || dialog.open || Boolean(legacy?.isEditing?.()),
      focusEditor() { (dialog.open ? dialog.querySelector('textarea') : panel)?.focus(); },
      setActive(value) { if (disposed || active === Boolean(value)) return; active = Boolean(value); detailEpoch++; if (!active) rememberPanels(); legacy?.setActive?.(active); },
      refreshPresence() {}, dispose() { disposed = true; active = false; scopeChoice?.dispose(); ownerChoice?.dispose(); detailEpoch++; window.removeEventListener('platform-task-progress-updated', progressUpdated); legacy?.dispose(); if (dialog.open) dialog.close(); } };
  }
  window.ProjectProgress = { create };
})();
