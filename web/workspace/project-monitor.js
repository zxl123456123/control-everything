// Mountable project monitor. The host owns navigation and all runtime capabilities.
'use strict';
window.WorkspaceProjectMonitor = (() => {
  function create({ root, projectId, fetchJson, onTask }) {
    const model = window.WorkspaceMonitorModel;
    const node = (tag, text, cls = '') => {
      const value = document.createElement(tag); value.className = cls;
      if (text !== undefined) value.textContent = text;
      return value;
    };
    const button = (label, action, key = label) => {
      const value = node('button', label, 'button secondary'); value.type = 'button';
      value.setAttribute('data-monitor-control', key);
      value.addEventListener('click', action); return value;
    };
    const stamp = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未提供';
    let active = false, destroyed = false, generation = 0, timer = 0, reading = false;
    let snapshot = null, previous = null, view = { agents: [], tasks: [], flows: [] };
    let offset = 0, agentPage = 0, selection = null, detailGeneration = 0;
    let readAbort = null, detailAbort = null, executionPanel = null;
    const heading = node('div', undefined, 'monitor-heading');
    const title = node('div'); title.append(node('p', 'PROJECT ACTIVITY', 'eyebrow'), node('h3', '协作监控'));
    const refresh = button('刷新', () => load(true)); heading.append(title, refresh);
    const status = node('p', '正在读取项目记录…', 'monitor-status'); status.setAttribute('role', 'status');
    const coverage = node('p', '内部 Agent 活动尚未接通。外部会话仅显示关联信息，活动状态未知。', 'section-note');
    const canvas = node('canvas', '项目活动图。下方列表提供相同的任务与 Agent 入口。');
    canvas.setAttribute('aria-label', '项目协作活动图');
    const stage = node('div', undefined, 'monitor-stage'); stage.append(canvas);
    const agentPager = node('div', undefined, 'monitor-pager');
    const body = node('div', undefined, 'monitor-body');
    const list = node('section', undefined, 'monitor-list'), detail = node('section', undefined, 'monitor-detail');
    detail.setAttribute('aria-label', '选中对象详情'); body.append(list, detail);
    const pager = node('div', undefined, 'monitor-pager');
    root.className = 'project-monitor'; root.replaceChildren(heading, status, coverage, stage, agentPager, body, pager);
    const scene = window.WorkspaceMonitorScene.create({ canvas, onSelect: select });
    const visible = () => active && !destroyed && !document.hidden;
    function keepFocus(render) {
      const focused = document.activeElement;
      const inside = focused && root.contains(focused), key = focused?.getAttribute('data-monitor-control');
      render();
      if (!inside) return;
      const next = root.contains(focused) ? focused : key
        ? [...root.querySelectorAll('[data-monitor-control]')].find(value => value.getAttribute('data-monitor-control') === key) : null;
      next?.focus({ preventScroll: true });
    }
    function paint(flows = []) {
      const shown = view.agents.slice(agentPage * 12, (agentPage + 1) * 12);
      const ids = new Set(shown.map(agent => agent.id));
      scene.update({ ...view, agents: shown, selectedId: selection?.id,
        flows: flows.filter(flow => [flow.from, flow.to].every(id => id.startsWith('$') || ids.has(id))),
        notice: !view.agents.length ? '暂无关联的 Agent 实例' : `当前页 ${shown.length} / ${view.agents.length} 个实例` });
      agentPager.replaceChildren();
      if (view.agents.length > 12) {
        const prev = button('上一组工位', () => changeAgents(agentPage - 1)); prev.disabled = agentPage === 0;
        const next = button('下一组工位', () => changeAgents(agentPage + 1)); next.disabled = (agentPage + 1) * 12 >= view.agents.length;
        agentPager.append(prev, node('span', `工位 ${agentPage + 1} / ${Math.ceil(view.agents.length / 12)}`), next);
      }
    }
    function changeAgents(value) {
      scene.setActive(false); agentPage = value; previous = null; paint(); scene.setActive(visible());
    }
    function select(value) { selection = value; detailGeneration++; detailAbort?.abort(); executionPanel = null; paint(); renderDetail(); }
    function fact(label, value) { detail.append(node('p', `${label}：${value ?? '未提供'}`, 'monitor-fact')); }
    function renderDetail() {
      detail.replaceChildren(node('h4', '活动明细'));
      const agent = selection?.kind === 'agent' ? view.agents.find(row => row.id === selection.id) : null;
      const item = agent?.item || snapshot?.items.find(row => row.task.id === selection?.id);
      if (!item) { detail.append(node('p', '选择工位或事项，查看身份、状态来源和最近活动。', 'section-note')); return; }
      detail.append(node('h4', item.task.title));
      fact('事项', model.taskStates[item.task.state] || item.task.state);
      fact('事项 ID', item.task.id);
      if (agent) { fact('来源', agent.evidence); fact('活动记录', view.stale ? '读取中断，当前活动未知' : agent.stateLabel); }
      if (agent?.session) {
        fact('来源实例', agent.session.source_instance || '未提供'); fact('原生会话', agent.session.external_id);
        fact('元数据时间', stamp(agent.session.last_seen_at));
      } else if (item.claim) {
        fact('认领轮次', item.claim.id); fact('认领状态', model.runStates[item.claim.status] || item.claim.status);
        fact('最近报告', stamp(item.claim.heartbeat_at));
        detail.append(node('p', '报告时间不证明进程存活。执行结束与人工验收分别记录。', 'section-note'));
        if (item.execution) {
          fact('受控执行', item.execution.id); fact('执行记录', model.runStates[item.execution.state] || item.execution.state);
          fact('进程清理', item.execution.cleanup_state); fact('执行记录时间', stamp(item.execution.updated_at));
          if (item.execution.project_id !== projectId) fact('执行创建时项目', item.execution.project_id);
          if (executionPanel?.runId !== item.execution.id) {
            detailGeneration++; detailAbort?.abort();
            executionPanel = { runId: item.execution.id, node: node('div', undefined, 'monitor-execution-events') };
          }
          const events = executionPanel.node;
          detail.append(button('读取执行活动', () => readExecution(item, events)), events);
        }
        if (item.binding_state === 'conflict') detail.append(node('p', '执行关联不一致，未推测连接。', 'monitor-warning'));
      }
      if (item.latest_review) fact('最近人工验收', `${item.latest_review.verdict} · ${stamp(item.latest_review.created_at)}`);
      if (onTask) detail.append(button('打开项目事项', () => onTask(item.task.id)));
      detail.append(node('h4', '最近业务活动'));
      const events = snapshot.events.filter(event => event.task_id === item.task.id).slice(-12).reverse();
      for (const event of events) detail.append(node('p', `${stamp(event.created_at)} · ${model.eventLabels[event.kind] || event.kind} · ${model.sourceLabels[event.source] || '来源未提供'}`, 'monitor-fact'));
      if (!events.length) detail.append(node('p', '当前窗口没有活动记录。', 'section-note'));
    }
    async function readExecution(item, container, after = 0) {
      const request = ++detailGeneration;
      detailAbort?.abort(); detailAbort = new AbortController();
      container.replaceChildren(node('p', '正在读取执行活动…', 'section-note'));
      try {
        const data = await fetchJson(`/api/workspace/execution/runs/${encodeURIComponent(item.execution.id)}?after=${after}`, { signal: detailAbort.signal });
        if (request !== detailGeneration || !visible()) return;
        if (data?.run?.id !== item.execution.id || data.run.task_id !== item.task.id || !Array.isArray(data.events)
            || !Number.isSafeInteger(data.next_cursor) || data.next_cursor < after) throw new Error('mismatch');
        container.replaceChildren();
        if (data.gap) container.append(node('p', '较早事件已被裁剪，本页不是完整历史。', 'monitor-warning'));
        const seen = new Set();
        for (const event of data.events.slice(0, 200)) {
          if (!Number.isSafeInteger(event.seq) || event.seq <= after || seen.has(event.seq)) continue;
          seen.add(event.seq);
          const row = node('details', undefined, 'monitor-event');
          row.append(node('summary', `${event.seq} · ${event.kind} · ${stamp(event.observed_at)}`),
            node('pre', JSON.stringify(event.payload, null, 2)));
          container.append(row);
        }
        if (!seen.size) container.append(node('p', '此页暂无事件。', 'section-note'));
        if (data.has_more && data.next_cursor > after) container.append(button('下一页活动', () => readExecution(item, container, data.next_cursor)));
      } catch { if (request === detailGeneration && visible()) container.replaceChildren(node('p', '执行活动暂不可读；可能未启用执行服务。记录不会因此变为失败。', 'monitor-warning')); }
    }
    function renderLists() {
      list.replaceChildren(node('h4', '当前页事项与实例'));
      for (const item of snapshot.items) {
        const row = node('article', undefined, 'monitor-task');
        row.append(button(item.task.title, () => select({ kind: 'task', id: item.task.id }), 'task:' + item.task.id),
          node('span', model.taskStates[item.task.state] || item.task.state, 'badge'));
        for (const agent of view.agents.filter(agent => agent.taskId === item.task.id)) {
          row.append(button(`${agent.label} · ${view.stale ? '活动未知' : agent.stateLabel} · ${agent.evidence}`, () => select({ kind: 'agent', id: agent.id }), agent.id));
        }
        if (item.sessions.has_more) row.append(node('p', `会话仅列出 ${item.sessions.items.length} / ${item.sessions.total} 条`, 'section-note'));
        list.append(row);
      }
      if (!snapshot.items.length) list.append(node('p', snapshot.pagination.total
        ? '当前页已无事项，请返回上一页。' : '此项目暂无事项。先在“全部事项”中添加任务。', 'section-note'));
      pager.replaceChildren();
      const p = snapshot.pagination;
      const prev = button('上一页事项', () => changePage(Math.max(0, offset - 20))); prev.disabled = !offset;
      const next = button('下一页事项', () => changePage(offset + 20)); next.disabled = !p.has_more;
      const range = snapshot.items.length ? `${p.offset + 1}–${p.offset + snapshot.items.length}` : '本页 0';
      pager.append(prev, node('span', `${range} / ${p.total} 项`), next);
    }
    function changePage(value) {
      if (reading) return;
      offset = value; agentPage = 0; selection = null; previous = null; detailGeneration++;
      detailAbort?.abort(); executionPanel = null; scene.setActive(false);
      snapshot = null; view = { agents: [], tasks: [], flows: [] };
      paint(); list.replaceChildren(); detail.replaceChildren(); pager.replaceChildren();
      status.textContent = '正在读取这一页事项…';
      void load(true);
    }
    async function load() {
      if (!visible() || reading) return;
      clearTimeout(timer); reading = true; refresh.disabled = true;
      const request = generation;
      readAbort = new AbortController();
      try {
        const data = await fetchJson(`/api/workspace/monitor?${new URLSearchParams({ project_id: projectId, offset, limit: 20 })}`, { signal: readAbort.signal });
        if (request !== generation || !visible()) return;
        if (data?.project?.id !== projectId || !Array.isArray(data.items) || !Array.isArray(data.events)
            || data.pagination?.offset !== offset || !data.events_page) throw new Error('mismatch');
        const delta = model.changes(previous, data);
        if (delta.gap) scene.setActive(false);
        snapshot = data; previous = data; view = model.project(data);
        agentPage = Math.min(agentPage, Math.max(0, Math.ceil(view.agents.length / 12) - 1));
        status.textContent = `${stamp(data.sampled_at)} 读取 · 本页 ${data.items.length} 项 · 最近活动快照${delta.gap ? ' · 活动窗口出现缺口，已重新同步' : ''}`;
        status.className = 'monitor-status';
        coverage.textContent = `内部 Agent 活动尚未接通。显示本页事项的最新认领与关联会话；活动窗口 ${data.events.length} / ${data.events_page.total} 条${data.events_page.has_more ? '，较早记录未载入' : ''}。动作按记录状态展示，进程存活未核验；外部会话活动未知。`;
        keepFocus(() => { paint(delta.flows); scene.setActive(visible()); renderLists(); renderDetail(); });
      } catch (error) {
        if (request !== generation || !visible()) return;
        previous = null; detailGeneration++;
        if (error.status === 404) { snapshot = null; view = { agents: [], tasks: [], flows: [] }; list.replaceChildren(); detail.replaceChildren(); pager.replaceChildren(); }
        view = { ...view, stale: true, agents: view.agents.map(agent => ({ ...agent, status: 'unknown' })) };
        status.textContent = error.status === 404 ? '项目不存在或不可读取。' : '读取中断，保留上次记录；当前活动未知。可点击刷新重试。';
        status.className = 'monitor-status monitor-warning';
        keepFocus(() => { paint(); if (snapshot) { renderLists(); renderDetail(); } });
      } finally {
        if (request === generation) { reading = false; refresh.disabled = false; if (visible()) timer = setTimeout(load, 3000); }
      }
    }
    function syncActivity() {
      generation++; detailGeneration++; clearTimeout(timer); reading = false; previous = null;
      readAbort?.abort(); detailAbort?.abort(); executionPanel = null;
      scene.setActive(false);
      if (visible()) void load(true);
    }
    document.addEventListener('visibilitychange', syncActivity);
    return {
      setActive(value) { if (active === value || destroyed) return; active = value; syncActivity(); },
      destroy() { if (destroyed) return; active = false; destroyed = true; syncActivity(); scene.destroy(); document.removeEventListener('visibilitychange', syncActivity); root.replaceChildren(); },
    };
  }
  return { create };
})();
