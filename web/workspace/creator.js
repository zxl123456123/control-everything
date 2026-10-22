'use strict';

(function (scope) {
  const ACTIONS = ['edit', 'play', 'check'];
  const NAMES = {edit: 'Godot 编辑器', play: '独立试玩', check: '资源导入检查'};
  const STATES = {starting: '正在启动', running: '进程运行中', exited: '进程已退出', failed: '运行失败'};
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const idValid = value => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
  const integerOrNull = value => value === null || Number.isInteger(value);
  const bounded = (value, limit = 1200) => String(value ?? '').slice(0, limit);

  function validProject(project) {
    return object(project) && idValid(project.id) && typeof project.name === 'string' && project.name.length > 0 &&
      ['2d', '3d'].includes(project.kind) && typeof project.project_path === 'string' && typeof project.user_data_key === 'string';
  }

  function validClientUrl(value) {
    if (value === '') return true;
    if (typeof value !== 'string' || /[\s\\?#]/u.test(value) || !/^https?:\/\//i.test(value)) return false;
    try { const url = new URL(value); return !url.username && !url.password; } catch (_) { return false; }
  }

  function validateState(value) {
    if (!object(value) || value.version !== 2 || typeof value.csrf_token !== 'string' || !value.csrf_token ||
        typeof value.library_path !== 'string' || !Array.isArray(value.projects) || !value.projects.every(validProject) ||
        new Set(value.projects.map(project => project.id)).size !== value.projects.length ||
        !Array.isArray(value.busy_project_ids) || !value.busy_project_ids.every(idValid) || !object(value.operations) ||
        !object(value.capabilities) || !['create', ...ACTIONS].every(key => typeof value.capabilities[key] === 'boolean') ||
        !object(value.agent) || value.agent.mode !== 'workbench_client' || value.agent.connection_state !== 'unverified' ||
        value.agent.can_submit !== false || !validClientUrl(value.agent.client_url)) {
      throw new Error('项目库响应与当前页面版本不兼容；请检查创作服务后刷新。');
    }
    for (const action of ACTIONS) {
      const op = value.operations[action];
      if (op === null) continue;
      if (!object(op) || typeof op.run_id !== 'string' || !op.run_id || !idValid(op.project_id) || op.action !== action ||
          !Object.hasOwn(STATES, op.state) || !integerOrNull(op.pid) || !integerOrNull(op.exit_code) || typeof op.reason !== 'string' ||
          !(op.result === null || object(op.result)) || !(action === 'check' ? [null, true, false].includes(op.verified) : op.verified === null)) {
        throw new Error('运行记录格式不兼容；当前结果未验证。');
      }
    }
    return value;
  }

  function validateDetail(value, projectId) {
    if (!object(value) || !validProject(value.project) || value.project.id !== projectId || !Array.isArray(value.files) ||
        !value.files.every(file => object(file) && typeof file.path === 'string' && typeof file.kind === 'string') ||
        typeof value.files_truncated !== 'boolean' || typeof value.brief !== 'string') {
      throw new Error('项目详情与所选工程不匹配；请重新打开项目。');
    }
    return value;
  }

  function describe(action, op) {
    if (!op) return '尚未运行';
    if (action === 'check') {
      const result = op.result;
      const checksPass = Array.isArray(result?.checks) && result.checks.length > 0 && result.checks.every(check =>
        object(check) && typeof check.name === 'string' && check.passed === true && typeof check.detail === 'string');
      if (op.state === 'exited' && op.exit_code === 0 && op.verified === true && result?.scope === 'godot_import' && result.passed === true && checksPass) {
        return '本次资源导入检查通过';
      }
      if (op.verified === false || op.state === 'failed') return '本次资源导入检查未通过';
      return `${STATES[op.state]} · 资源导入结果未验证`;
    }
    return STATES[op.state];
  }

  function create({root, document = scope.document, fetch: request = scope.fetch.bind(scope), clipboard = scope.navigator?.clipboard,
    serviceOrigin = scope.location?.origin || '', setTimeout: later = scope.setTimeout.bind(scope), clearTimeout: cancel = scope.clearTimeout.bind(scope)}) {
    const element = name => root.querySelector(`[data-creator="${name}"]`);
    const node = (tag, text = '', className = '') => { const item = document.createElement(tag); item.textContent = bounded(text, 8000); item.className = className; return item; };
    let snapshot = null, connected = false, selectedId = null, detail = null, detailRequest = 0;
    let loadingDetail = false, posting = false, disposed = false, refreshing = null, timer = null, stateRequestSequence = 0;
    let projectSignature = '', operationSignature = '';
    const drafts = new Map(), awaiting = new Map();

    function message(text, error = false) {
      element('message').textContent = bounded(text);
      element('message').hidden = !text;
      element('message').dataset.error = String(error);
    }
    function keepDraft() { if (selectedId && drafts.has(selectedId) && !loadingDetail) drafts.get(selectedId).text = element('brief').value; }
    function stopTimer() { if (timer !== null) cancel(timer); timer = null; }
    function schedule() {
      stopTimer();
      const active = snapshot?.busy_project_ids.length || ACTIONS.some(action => ['starting', 'running'].includes(snapshot?.operations[action]?.state));
      if (!disposed && connected && !document.hidden && (active || awaiting.size)) timer = later(() => { timer = null; void refreshState(); }, 2000);
    }
    function pendingProject(id) { return [...awaiting.values()].some(value => value.projectId === id); }

    function renderProjects() {
      if (!snapshot) return;
      const signature = JSON.stringify([snapshot.projects, selectedId, snapshot.busy_project_ids]);
      if (signature === projectSignature) return;
      projectSignature = signature;
      const buttons = snapshot.projects.map(project => {
        const button = node('button', '', 'ce-creator-project');
        button.type = 'button'; button.dataset.projectId = project.id; button.setAttribute('aria-pressed', String(project.id === selectedId));
        const copy = node('span'); copy.append(node('strong', project.name), node('small', snapshot.busy_project_ids.includes(project.id) ? '本服务中运行' : '打开工程'));
        button.append(node('span', project.kind.toUpperCase(), 'ce-creator-project-icon'), copy);
        button.addEventListener('click', () => { void selectProject(project.id); });
        return button;
      });
      element('projects').replaceChildren(...buttons);
      element('count').textContent = String(snapshot.projects.length);
    }

    function renderOperations() {
      if (!snapshot) return;
      const signature = JSON.stringify([snapshot.operations, snapshot.projects]);
      if (signature === operationSignature) return;
      operationSignature = signature;
      const rows = [];
      for (const action of ACTIONS) {
        const op = snapshot.operations[action];
        if (!op) continue;
        const project = snapshot.projects.find(item => item.id === op.project_id);
        const row = node('article', '', 'ce-creator-run');
        const owner = node('div'); owner.append(node('strong', `${project?.name || '未知项目'} · ${NAMES[action]}`), node('small', `项目 ${op.project_id} · 运行 ${op.run_id}`));
        const outcome = node('div'); outcome.append(node('p', describe(action, op)));
        if (op.reason) outcome.append(node('p', op.reason, 'ce-creator-run-reason'));
        row.append(owner, outcome);
        const extra = node('details'); extra.append(node('summary', '运行详情'));
        const lines = [`进程：${op.pid ?? '未知'}；退出码：${op.exit_code ?? '尚未退出'}`];
        if (op.result?.scope === 'godot_import') {
          if (typeof op.result.checked_at === 'string') lines.push(`检查时间：${bounded(op.result.checked_at, 100)}`);
          if (typeof op.result.log_path === 'string') lines.push(`本机日志：${bounded(op.result.log_path, 2000)}`);
          if (Array.isArray(op.result.checks)) for (const check of op.result.checks.slice(0, 20)) {
            if (object(check) && typeof check.name === 'string' && typeof check.passed === 'boolean' && typeof check.detail === 'string') lines.push(`${check.passed ? '通过' : '未通过'} · ${bounded(check.name, 100)}：${bounded(check.detail, 350)}`);
          }
        }
        extra.append(node('pre', lines.join('\n'))); row.append(extra); rows.push(row);
      }
      element('operations').replaceChildren(...(rows.length ? rows : [node('p', '暂无运行记录。', 'ce-creator-muted')]));
    }

    function renderControls() {
      const selectedReady = Boolean(detail && detail.project.id === selectedId && !loadingDetail);
      const busy = snapshot?.busy_project_ids.includes(selectedId) || pendingProject(selectedId);
      element('create').disabled = !connected || posting || snapshot?.capabilities.create !== true;
      for (const action of ACTIONS) element(action).disabled = !connected || posting || !selectedReady || busy || awaiting.has(action) || snapshot?.capabilities[action] !== true;
      element('save-brief').disabled = !connected || posting || !selectedReady;
      element('copy').disabled = !selectedReady;
      element('brief').disabled = !selectedReady;
      element('refresh').disabled = posting || Boolean(refreshing) || loadingDetail;
      element('busy').hidden = !busy;
      element('busy').textContent = busy ? '本项目有原生操作进行中，请在对应窗口结束后再启动其他操作。' : '';
      const draft = drafts.get(selectedId);
      element('draft-state').textContent = draft && draft.text !== draft.saved ? '未保存 · 切换项目会保留草稿' : '说明已保存';
      element('help').hidden = connected;
      element('library-empty').hidden = connected && Boolean(snapshot?.projects.length);
      element('library-empty').textContent = connected ? '项目库还是空的，从一个新工程开始。' : '项目库尚未读取成功。';
      if (snapshot) {
        element('library-path').textContent = bounded(snapshot.library_path, 2000);
        const configured = Boolean(snapshot.agent.client_url);
        element('agent-open').hidden = !configured;
        if (configured) element('agent-open').href = snapshot.agent.client_url;
        else element('agent-open').removeAttribute('href');
        element('agent-status').textContent = configured ? '连接状态以工作区为准。上下文需手动粘贴，尚未自动发送或绑定会话。' : '项目工作区接入待配置；可先复制上下文，自动发送尚未接通。';
      }
    }

    function renderDetail() {
      element('empty').hidden = Boolean(detail && !loadingDetail);
      element('project-panel').hidden = !detail || loadingDetail;
      element('context-panel').hidden = true;
      if (!detail || loadingDetail) {
        element('empty-title').textContent = loadingDetail ? '正在打开工程…' : '让一个想法有自己的工程';
        element('empty-copy').textContent = loadingDetail ? '读取场景、资源和创作说明。' : '创建 2D 或 3D 空白工程，或从项目库打开已有项目。';
        return;
      }
      const draft = drafts.get(selectedId);
      element('name').textContent = detail.project.name;
      element('kind').textContent = `${detail.project.kind.toUpperCase()} · GODOT 工程`;
      element('project-path').textContent = detail.project.project_path;
      element('user-data-key').textContent = detail.project.user_data_key;
      element('brief').value = draft.text;
      element('file-count').textContent = `${detail.files.length} 项`;
      const files = detail.files.map(file => {
        const label = node('label', '', 'ce-creator-file');
        const input = node('input'); input.type = 'checkbox'; input.checked = draft.paths.has(file.path);
        input.addEventListener('change', () => { if (input.checked) draft.paths.add(file.path); else draft.paths.delete(file.path); });
        const text = node('span', file.path); text.append(node('small', {scene: '场景', script: '脚本', material: '材质', resource: '资源'}[file.kind] || file.kind));
        label.append(input, text); return label;
      });
      element('files').replaceChildren(...files);
      element('files-note').textContent = detail.files_truncated ? '文件较多，仅显示有界扫描的部分结果。' : detail.files.length ? '这里只列出工程文件，节点与属性请在 Godot 中编辑。' : '当前没有可列出的场景或资源。';
    }

    async function getJson(url, options = {}, expectedStatus = 200) {
      const response = await request(url, {credentials: 'same-origin', cache: 'no-store', ...options});
      let body;
      try { body = await response.json(); } catch (_) { throw new Error('创作服务响应无法读取，请刷新后重试。'); }
      if (!response.ok) throw new Error(object(body) && typeof body.message === 'string' ? bounded(body.message) : `创作服务请求失败（HTTP ${response.status}）。`);
      if (response.status !== expectedStatus) throw new Error('创作服务返回了意外的响应状态，操作结果未确认。');
      return body;
    }
    function post(url, body, status) {
      return getJson(url, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Creator-CSRF': snapshot.csrf_token}, body: JSON.stringify(body)}, status);
    }

    function refreshState() {
      if (disposed) return Promise.resolve();
      if (refreshing) return refreshing;
      stopTimer();
      const requestSequence = ++stateRequestSequence;
      refreshing = (async () => {
        try {
          const next = validateState(await getJson('/api/creator/state'));
          if (disposed) return;
          if (snapshot && snapshot.csrf_token !== next.csrf_token) awaiting.clear();
          snapshot = next; connected = true;
          // Only a state request begun after acceptance can reconcile a replaced run.
          for (const [action, pending] of awaiting) if (requestSequence > pending.afterStateRequest) awaiting.delete(action);
          element('connection').textContent = '本机项目库已读取';
          renderProjects(); renderOperations();
        } catch (error) {
          if (disposed) return;
          connected = false;
          element('connection').textContent = '项目库读取失败';
          message(error.message, true);
        } finally {
          refreshing = null;
          if (!disposed) { renderControls(); schedule(); }
        }
      })();
      renderControls();
      return refreshing;
    }

    async function selectProject(projectId) {
      if (disposed || !connected || !snapshot.projects.some(project => project.id === projectId)) return;
      keepDraft(); selectedId = projectId; detail = null; loadingDetail = true;
      const requestId = ++detailRequest;
      renderProjects(); renderDetail(); renderControls();
      try {
        const loaded = validateDetail(await getJson(`/api/creator/projects/${projectId}`), projectId);
        if (disposed || selectedId !== projectId || requestId !== detailRequest) return;
        detail = loaded;
        const draft = drafts.get(projectId);
        if (!draft) drafts.set(projectId, {text: loaded.brief, saved: loaded.brief, paths: new Set()});
        else { if (draft.text === draft.saved) draft.text = loaded.brief; draft.saved = loaded.brief; }
      } catch (error) {
        if (!disposed && selectedId === projectId && requestId === detailRequest) message(error.message, true);
      } finally {
        if (!disposed && selectedId === projectId && requestId === detailRequest) {
          loadingDetail = false; renderDetail(); renderControls();
          if (detail) element('name').focus?.({preventScroll: true});
        }
      }
    }

    async function refresh() {
      keepDraft(); await refreshState();
      if (connected && selectedId) await selectProject(selectedId);
    }

    async function createProject(name = element('project-name').value, kind = element('project-kind').value) {
      if (disposed || element('create').disabled) return;
      if (/[\u0000-\u001f\u007f]/u.test(name)) { message('项目名称不能包含换行或控制字符。', true); return; }
      name = name.trim();
      if (!name || [...name].length > 80 || /[\u0000-\u001f\u007f]/u.test(name) || !['2d', '3d'].includes(kind)) { message('请填写 1～80 字的项目名称并选择 2D 或 3D。', true); return; }
      posting = true; renderControls();
      try {
        const result = await post('/api/creator/projects', {name, kind}, 201);
        if (!object(result) || !validProject(result.project)) throw new Error('创建响应缺少有效工程，结果未确认。');
        if (disposed) return;
        element('project-name').value = '';
        message(`项目“${result.project.name}”已创建。`);
        await refreshState(); await selectProject(result.project.id);
        element('create-form').hidden = true;
      } catch (error) { if (!disposed) message(error.message, true); }
      finally { posting = false; if (!disposed) renderControls(); }
    }

    async function saveBrief() {
      if (disposed || element('save-brief').disabled) return;
      keepDraft();
      const projectId = selectedId, text = drafts.get(projectId).text;
      if ([...text].length > 4000) { message('创作说明最多 4000 字。', true); return; }
      posting = true; renderControls();
      try {
        const result = await post('/api/creator/brief', {project_id: projectId, text}, 200);
        if (!object(result) || result.project_id !== projectId || result.saved !== true) throw new Error('说明保存回执与项目不匹配，尚未确认保存。');
        if (disposed) return;
        drafts.get(projectId).saved = text;
        message(`“${snapshot.projects.find(project => project.id === projectId)?.name || projectId}”的创作说明已保存。`);
      } catch (error) { if (!disposed) message(error.message, true); }
      finally { posting = false; if (!disposed) renderControls(); }
    }

    async function sendAction(action) {
      if (disposed || !ACTIONS.includes(action) || element(action).disabled) return;
      const projectId = selectedId;
      posting = true; renderControls();
      try {
        const result = await post('/api/creator/action', {project_id: projectId, action}, 202);
        if (!object(result) || typeof result.run_id !== 'string' || !result.run_id || result.state !== 'starting') throw new Error('服务未返回预期的启动回执；请刷新运行记录。');
        if (disposed) return;
        awaiting.set(action, {projectId, afterStateRequest: stateRequestSequence});
        message(`${NAMES[action]}请求已发送；结果请查看对应项目的运行记录。`);
      } catch (error) { if (!disposed) message(error.message, true); }
      finally { posting = false; if (!disposed) { renderControls(); await refreshState(); element('message').focus?.({preventScroll: true}); } }
    }

    async function copyContext() {
      if (disposed || element('copy').disabled) return;
      keepDraft();
      const project = detail.project, draft = drafts.get(selectedId);
      const paths = detail.files.filter(file => draft.paths.has(file.path)).map(file => `- ${file.path}`);
      const text = [
        `游戏创作项目：${project.name}`, `项目 ID：${project.id}`, `源码目录：${project.project_path}`, `工程类型：${project.kind.toUpperCase()} / Godot`,
        '', '用户创作说明：', draft.text || '尚未填写。', '', '选中的资源路径（相对工程）：', paths.join('\n') || '未选择。', '',
        '在同一源码目录开展工作。场景树、材质和参数使用独立 Godot 编辑器；从创作工作台可打开编辑器或独立试玩。',
        `本机创作服务：${serviceOrigin || '请使用当前页面的来源地址'}`, '资源导入检查（仅本机固定入口，不代表玩法或所有脚本验证）：',
        '1. GET /api/creator/state 获取本次服务的临时 csrf_token；不要持久保存该令牌。',
        '2. 以当前服务来源作为 Origin，使用 Content-Type: application/json 与 X-Creator-CSRF 头，POST /api/creator/action：',
        JSON.stringify({project_id: project.id, action: 'check'}),
        '3. 202 仅表示请求已发送。继续 GET /api/creator/state，核对 operations.check 的 project_id、返回的 run_id、退出码与 result.scope=godot_import，再读取检查项。',
        '本服务只观察自己启动的进程；工程修改后重新检查。此文本没有发送给 Agent，也没有自动绑定工作区会话。'
      ].join('\n');
      element('context').value = text;
      element('context-panel').hidden = false;
      try {
        if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
        await clipboard.writeText(text);
        if (!disposed && selectedId === project.id) message('Agent 上下文已复制；请在项目工作区中手动粘贴。');
      } catch (_) {
        if (disposed || selectedId !== project.id) return;
        element('context-panel').open = true;
        element('context').focus?.(); element('context').select?.();
        message('自动复制不可用。完整上下文已展开，请手动复制。', true);
      }
    }

    element('create-form').addEventListener('submit', event => { event.preventDefault(); void createProject(); });
    element('new').addEventListener('click', () => { element('create-form').hidden = false; element('project-name').focus?.(); });
    element('brief').addEventListener('input', () => { keepDraft(); renderControls(); });
    element('save-brief').addEventListener('click', () => { void saveBrief(); });
    element('copy').addEventListener('click', () => { void copyContext(); });
    for (const action of ACTIONS) element(action).addEventListener('click', () => { void sendAction(action); });
    element('refresh').addEventListener('click', () => { message(''); void refresh(); });
    element('theme').addEventListener('click', () => {
      const dark = root.dataset.theme !== 'dark'; root.dataset.theme = dark ? 'dark' : 'light';
      element('theme').textContent = dark ? '浅色主题' : '深色主题'; element('theme').setAttribute('aria-label', `切换为${dark ? '浅色' : '深色'}主题`);
    });
    function visibilityChanged() { stopTimer(); if (!document.hidden) void refreshState(); }
    document.addEventListener('visibilitychange', visibilityChanged);
    function dispose() { disposed = true; stopTimer(); document.removeEventListener('visibilitychange', visibilityChanged); }
    const ready = refreshState();
    return {ready, refresh, refreshState, selectProject, createProject, saveBrief, sendAction, copyContext, dispose};
  }

  const api = {create, validateState, validateDetail, describe};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { scope.CreatorWorkbench = api; const root = scope.document.getElementById('ce-studio'); if (root) create({root}); }
})(typeof window === 'undefined' ? globalThis : window);
