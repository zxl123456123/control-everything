// Read models are presentation only; they never advance business state.
'use strict';
window.WorkspaceMonitorModel = (() => {
  const taskStates = { todo: '待办', doing: '进行中', blocked: '阻塞', review: '待人工验收', done: '已完成' };
  const runStates = { claimed: '已认领', running: '运行中', waiting_review: '已提交，待验收',
    changes_requested: '需要修改', completed: '已结束', failed: '失败', cancelled: '已取消',
    preparing: '准备中', starting: '启动中', waiting_approval: '等待权限处理', cancelling: '取消中',
    cancel_requested: '已请求取消', cancelled_before_send: '发送前取消',
    unknown: '结果未知', interrupted: '已中断', queued: '排队中' };
  const eventLabels = { assigned: '分配事项', claimed: '认领任务', progress: '报告进度',
    waiting_review: '提交验收', changes_requested: '退回修改', completed: '人工验收完成',
    failed: '报告失败', blocked: '报告阻塞' };
  function project(snapshot) {
    const agents = [], tasks = [];
    for (const item of snapshot.items) {
      const task = item.task, claim = item.claim, execution = item.execution;
      tasks.push({ id: task.id, title: task.title, state: task.state });
      if (claim) {
        let status = 'unknown';
        const raw = execution?.state || claim.status;
        if (['running', 'claimed', 'starting', 'preparing', 'queued'].includes(raw)) status = 'working';
        if (['waiting_review', 'waiting_approval', 'changes_requested', 'cancel_requested'].includes(raw)) status = 'waiting';
        if (['failed', 'interrupted', 'cancelled', 'cancelled_before_send'].includes(raw)) status = 'error';
        if (raw === 'completed') status = task.state === 'done' ? 'done' : 'waiting';
        if (item.binding_state === 'conflict') status = 'unknown';
        agents.push({ id: 'claim:' + claim.id, label: claim.agent_name || 'Agent', provider: claim.agent_kind || 'agent',
          status, taskId: task.id, taskTitle: task.title, evidence: execution ? '本平台执行记录' : 'Agent 自报记录',
          stateLabel: item.binding_state === 'conflict' ? '关联待核对，活动未知' : runStates[raw] || raw, item, type: 'claim' });
      }
      for (const session of item.sessions.items) {
        const key = session.id || JSON.stringify([task.id, session.source, session.source_instance, session.external_id]);
        agents.push({ id: 'session:' + key, label: session.source || '外部会话', provider: session.source,
          status: 'unknown', taskId: task.id, taskTitle: task.title, evidence: '会话元数据',
          stateLabel: '活动未知', item, session, type: 'session' });
      }
    }
    return { agents, tasks, flows: [], stale: false };
  }
  function changes(previous, next) {
    const empty = { flows: [], gap: false };
    if (!previous || previous.project.id !== next.project.id || previous.pagination.offset !== next.pagination.offset
        || JSON.stringify(previous.items.map(row => row.task.id)) !== JSON.stringify(next.items.map(row => row.task.id))) return empty;
    const seen = new Set(previous.events.map(event => event.id));
    // These are bounded windows, not a durable event cursor. A lost overlap resets animation.
    if (next.events_page.total < previous.events_page.total
        || seen.size && next.events.length && !next.events.some(event => seen.has(event.id))
        || !seen.size && next.events_page.has_more) return { flows: [], gap: true };
    const items = new Map(next.items.map(item => [item.task.id, item]));
    const flows = [];
    for (const event of next.events) {
      if (seen.has(event.id)) continue;
      const item = items.get(event.task_id);
      if (!item?.claim || item.claim.id !== event.run_id) continue;
      const agent = 'claim:' + item.claim.id;
      const ends = { claimed: ['$tasks', agent], waiting_review: [agent, '$review'],
        changes_requested: ['$review', agent], completed: ['$review', '$done'] }[event.kind];
      if (ends) flows.push({ id: event.id, taskId: item.task.id, label: item.task.title, from: ends[0], to: ends[1] });
    }
    return { flows, gap: false };
  }
  const sourceLabels = { execution_bridge: '受控执行记录', agent_reported: 'Agent 自报', human_review: '人工验收', workspace: '工作台记录' };
  return { project, changes, taskStates, runStates, eventLabels, sourceLabels };
})();
