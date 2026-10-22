// Same-origin management requests; credentials never enter browser storage.
'use strict';
(() => {
  const reasons = {
    item_changed: '这条事项已被其他窗口修改，请重新读取后核对草稿',
    list_changed: '事项列表已变化，请重新读取',
    csrf_rejected: '保存凭据已失效，请刷新页面后重试',
    workspace_unavailable: '本地工作台尚未就绪',
    execution_review_conflict: '运行或清理状态尚不允许人工验收',
    review_state_conflict: '事项已不处于待验收状态，请重新读取',
    profile_required: '请使用已初始化的本地工作台服务',
  };
  const failure = (reason, status = null) => Object.assign(new Error(reasons[reason] || '请求未成功，请重新读取后重试'), { reason, status });
  function create({ fetchImpl = window.fetch.bind(window), timeoutMs = 40000 } = {}) {
    let csrf = '';
    async function api(path, options = {}) {
      if (typeof path !== 'string' || !path.startsWith('/api/') || path.includes('\\') || path.includes('#')) throw failure('invalid_request');
      const controller = new AbortController();
      const abort = () => controller.abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      const timer = setTimeout(abort, timeoutMs);
      try {
        const response = await fetchImpl(path, { ...options, credentials: 'same-origin', signal: controller.signal,
          headers: { ...options.headers, 'X-Session-Client': 'panel' } });
        const result = await response.json();
        if (!response.ok) throw Object.assign(failure(result?.reason || 'http_error', response.status), { field: result?.field });
        return result;
      } catch (error) {
        if (typeof error.reason === 'string') throw error;
        throw Object.assign(failure(error.name === 'AbortError' ? 'timeout' : 'network_error'), {
          message: error.name === 'AbortError' ? '读取超时，现有草稿保留，请重试' : '无法连接本地工作台，现有草稿保留，请检查服务',
        });
      } finally {
        clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      }
    }
    async function bootstrap() {
      csrf = '';
      const result = await api('/api/bootstrap');
      if (result.capabilities?.profile !== true || typeof result.csrf_token !== 'string' || !result.csrf_token) throw failure('profile_required');
      csrf = result.csrf_token;
      return result;
    }
    async function post(path, body, options = {}) {
      if (!csrf) throw failure('csrf_rejected', 403);
      return api(path, { ...options, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-CSRF': csrf }, body: JSON.stringify(body) });
    }
    async function readItems() {
      const items = []; let offset = 0, revision = null;
      while (true) {
        const query = new URLSearchParams({ limit: '100', offset: String(offset) });
        if (revision !== null) query.set('list_revision', String(revision));
        const page = await api('/api/workspace/items?' + query);
        if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total) || page.total < 0 || !Number.isSafeInteger(page.list_revision)
            || (revision !== null && revision !== page.list_revision) || (page.total > offset && !page.items.length)) throw failure('list_changed', 409);
        revision = page.list_revision; items.push(...page.items); offset += page.items.length;
        if (offset >= page.total) return items;
      }
    }
    async function snapshot() {
      const [workspace, agents, items] = await Promise.all([api('/api/workspace'), api('/api/workspace/agents'), readItems()]);
      if (workspace.projects?.status !== 'available' || !Array.isArray(workspace.projects.items) || !Array.isArray(agents.items)) throw failure('workspace_unavailable');
      return { workspace, agents: agents.items, items };
    }
    return { api, post, bootstrap, snapshot, canWrite: () => Boolean(csrf) };
  }
  window.StudioData = { create };
})();
