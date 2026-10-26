// Business facts only: viewing a record never resolves it or proves a delivery.
'use strict';
(() => {
  const labels = { todo: '待推进', doing: '正在推进', blocked: '需要处理', review: '待验收', done: '已确认完成' };
  const deliveryLabels = { saved: '意见已保存，尚未发送', sending: '正在核对送达', input_accepted: '输入已接受，等待继续执行', turn_started: '已观察到继续执行', refused: '尚未送达', unknown: '送达未确认，请回会话核对' };
  function row(item) {
    const p = item.progress || {};
    const native = Boolean(p.native_run_id);
    const attention = item.state !== 'done' && (Boolean(p.attention) || ['blocked', 'review'].includes(item.state)
      || ['waiting_user', 'waiting_review', 'blocked', 'failed'].includes(item.assignment_state));
    const delivered = Boolean(p.current_delivery_id || p.has_delivery || item.current_delivery_id);
    const activityLabels = { working: '正在推进', idle: '待继续', waiting: '等待来源更新', interrupted: '已中断', unknown: '来源暂未同步', blocked: '需要处理' };
    return { item, attention, delivered, active: native ? p.active_slot === 1 && p.observation_state === 'working' : item.state === 'doing',
      label: native && p.active_slot === 0 ? '跟踪已结束' : native && item.state !== 'done' ? activityLabels[p.observation_state] || labels[item.state] || '状态未确认' : labels[item.state] || '状态未确认',
      summary: p.summary || (typeof p.attention === 'object' ? p.attention?.text : '') || '',
      time: p.source_time || p.observed_at || item.updated_at || '' };
  }
  function matches(item, { scope = '', filter = 'all', query = '' } = {}) {
    const value = row(item);
    if (scope === '__global__' ? item.project_id : scope && item.project_id !== scope) return false;
    if (filter === 'attention' && !value.attention || filter === 'active' && !value.active
      || filter === 'delivery' && !value.delivered || filter === 'review' && item.state !== 'review') return false;
    return !query || [item.title, value.summary].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase());
  }
  function detail(facts) {
    const item = facts.item, native = facts.native_run, capabilities = facts.capabilities || {};
    const tracked = native?.active_slot === 1;
    const delivery = facts.current_delivery || null;
    return { item, native, delivery, attention: facts.attention || null, capabilities,
      canConfirm: Boolean(tracked && delivery && capabilities.can_review === true),
      canFeedback: Boolean(tracked && capabilities.can_feedback === true),
      canSend: Boolean(tracked && capabilities.can_send_feedback === true),
      canResume: Boolean(tracked && capabilities.can_resume === true),
      canStart: capabilities.can_start === true,
      sourceTime: facts.source_time || native?.observed_at || null };
  }
  function messageLabel(message) {
    const delivery = message.native_delivery;
    if (delivery && ['input_accepted', 'turn_started'].includes(delivery.state)
      && (delivery.receipt?.bindingState !== 'current' || delivery.receipt?.receiptState !== 'completed')) {
      return delivery.state === 'turn_started' ? '此前已观察到继续执行，当前来源需回会话核对' : '此前输入已接受，当前来源需回会话核对';
    }
    return delivery ? deliveryLabels[delivery.state] || '送达状态未知'
      : message.delivery_state === 'sent' ? '人工标记已发送' : '历史消息';
  }
  function safeUrl(value) {
    if (typeof value !== 'string') return null;
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
    catch { return null; }
  }
  function timestamp(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (typeof value !== 'string' || !value.trim()) return NaN;
    return /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : Date.parse(value);
  }
  window.ProjectProgressModel = { row, matches, detail, messageLabel, safeUrl, timestamp };
})();
