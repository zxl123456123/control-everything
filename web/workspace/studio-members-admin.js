/* Admin-only member console for Studio settings. The hub enforces authorization; this module only renders and calls it. */
(function (scope) {
  'use strict';
  const doc = scope.document;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const svg = body => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const icons = {
    refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
    chevron: svg('<path d="m6 9 6 6 6-6"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    members: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>')
  };
  // Device states shown to admins; the tone reuses the Studio status colors.
  const deviceStates = {
    online: ['在线', 'success'], offline: ['离线', 'neutral'], provisioned: ['待连接', 'warning'], pending: ['待连接', 'warning'],
    revoking: ['撤销中', 'warning'], revoked: ['已撤销', 'danger']
  };
  const errors = {
    admin_required: '只有管理员可以管理成员。', cannot_change_admin: '管理员账号不能被停用。', member_not_found: '成员不存在，请刷新后重试。',
    device_not_found: '设备不存在或已撤销，请刷新后重试。', rate_limited: '操作太频繁，请稍后再试。', membership_required: '当前账号尚未激活。'
  };
  const fallbackError = '请求未成功，请刷新后重试。';
  const live = device => device.state !== 'revoked' && device.state !== 'revoking';

  function ago(seconds, now = Date.now() / 1000) {
    if (!Number.isFinite(seconds)) return '从未活动';
    const gap = Math.max(0, now - seconds);
    if (gap < 60) return '刚刚';
    if (gap < 3600) return Math.floor(gap / 60) + ' 分钟前';
    if (gap < 86400) return Math.floor(gap / 3600) + ' 小时前';
    if (gap < 86400 * 30) return Math.floor(gap / 86400) + ' 天前';
    return new Date(seconds * 1000).toLocaleDateString('zh-CN');
  }
  const tag = (label, tone) => `<span class="ce-mem-tag" data-tone="${tone}">${esc(label)}</span>`;
  const person = member => member.name || '未命名成员';
  const shortId = sub => String(sub).length > 14 ? String(sub).slice(0, 8) + '…' : String(sub);

  async function probe() {
    try {
      const response = await scope.fetch('/remote/api/session', {credentials: 'same-origin'});
      if (!response.ok) return false;
      return (await response.json()).admin === true;
    } catch { return false; }
  }

  function mount(container) {
    const controller = new AbortController();
    let disposed = false, generation = 0, csrf = '', self = '', page = null, loading = true, notice = null, blocked = '';
    let query = '', filter = 'all', invitation = '';
    const open = new Set(), busy = new Set();
    const listeners = [];
    container.innerHTML = `<section class="ce-members" aria-labelledby="ce-members-title">
      <div class="ce-heading"><div><h1 id="ce-members-title" tabindex="-1">成员管理</h1><p data-node="summary">查看小组成员与电脑连接，管理访问权限。</p></div>
        <div class="ce-heading-actions"><button class="ce-iconbtn" type="button" data-action="refresh" aria-label="刷新成员" title="刷新成员">${icons.refresh}</button>
        <button class="ce-button ce-primary" type="button" data-action="invite">${icons.plus}<span>邀请成员</span></button></div></div>
      <p class="ce-mem-invite" data-node="invite" hidden><span>邀请码</span><output data-node="code"></output><small>24 小时内有效，仅可使用一次。</small></p>
      <p class="ce-mem-notice" data-node="notice" role="status" aria-live="polite" hidden></p>
      <div class="ce-mem-toolbar" data-node="toolbar"><label class="ce-search">${icons.search}<input type="search" data-node="query" placeholder="筛选成员" aria-label="筛选成员" autocomplete="off"></label>
        <div class="ce-segment ce-mem-filter" role="group" aria-label="成员状态">${[['all', '全部'], ['active', '已启用'], ['disabled', '已停用']].map(([key, label]) => `<button type="button" data-filter="${key}" aria-pressed="${key === 'all'}">${label}</button>`).join('')}</div></div>
      <div class="ce-mem-card" data-node="list" aria-live="polite" aria-busy="true"></div>
      <nav class="ce-mem-pager" data-node="pager" aria-label="成员分页" hidden><button class="ce-button" type="button" data-action="prev">上一页</button><span data-node="range"></span><button class="ce-button" type="button" data-action="next">下一页</button></nav>
    </section>`;
    const $ = name => container.querySelector(`[data-node="${name}"]`);
    const on = (node, type, handler) => { node.addEventListener(type, handler); listeners.push(() => node.removeEventListener(type, handler)); };

    async function api(path, body) {
      const mine = generation;
      const response = await scope.fetch(path, {method: body ? 'POST' : 'GET', credentials: 'same-origin', signal: controller.signal,
        headers: body ? {'Content-Type': 'application/json', 'X-CE-CSRF': csrf} : csrf ? {'X-CE-CSRF': csrf} : {}, ...(body ? {body: JSON.stringify(body)} : {})});
      if (disposed || mine !== generation) return null;
      let value = {};
      try { value = await response.json(); } catch { /* Handled by status below. */ }
      if (response.status === 401) throw Object.assign(new Error('登录已过期，请重新登录后继续。'), {expired: true});
      if (!response.ok) throw Object.assign(new Error(errors[value.error] || fallbackError), {status: response.status});
      return value;
    }
    const say = (text, tone = 'error') => { notice = text ? {text, tone} : null; paintNotice(); };
    function paintNotice() {
      const node = $('notice'); node.hidden = !notice; node.textContent = notice?.text || ''; node.dataset.tone = notice?.tone || '';
    }
    function visible() {
      const needle = query.trim().toLowerCase();
      return (page?.items || []).filter(member => (filter === 'all' || member.membership === filter)
        && (!needle || [person(member), member.sub].some(text => String(text).toLowerCase().includes(needle))));
    }
    function deviceCell(member) {
      const devices = member.devices || [], main = devices.find(live) || devices[0];
      if (!main) return '<span class="ce-mem-muted">未绑定电脑</span>';
      const [label, tone] = deviceStates[main.state] || ['状态未知', 'neutral'];
      return `<span class="ce-mem-dev"><span class="ce-mem-dot" data-tone="${tone}" aria-hidden="true"></span><span class="ce-mem-devname">${esc(main.name || '电脑')}</span><span class="ce-mem-muted">${label}${devices.length > 1 ? ' · 共 ' + devices.length + ' 台' : ''}</span></span>`;
    }
    function detail(member) {
      const isSelf = member.sub === self, disabled = member.membership === 'disabled';
      const devices = (member.devices || []).map(device => {
        const [label, tone] = deviceStates[device.state] || ['状态未知', 'neutral'];
        const key = `revoke:${member.sub}:${device.device_id}`;
        return `<li class="ce-mem-device"><span class="ce-mem-dot" data-tone="${tone}" aria-hidden="true"></span>
          <div><strong>${esc(device.name || '电脑')}</strong><span class="ce-mem-muted">${label} · 最近在线 ${esc(ago(device.last_seen))}${device.cleanup_failed ? ' · 清理未完成' : ''}</span></div>
          ${live(device) ? `<button class="ce-button ce-danger" type="button" data-action="revoke" data-sub="${esc(member.sub)}" data-device="${esc(device.device_id)}" data-key="${esc(key)}"${busy.has(key) ? ' disabled aria-busy="true"' : ''}>强制下线并撤销</button>` : ''}</li>`;
      }).join('') || '<li class="ce-mem-muted ce-mem-nodev">这位成员还没有绑定电脑。</li>';
      const key = 'status:' + member.sub;
      const control = member.admin ? '<span class="ce-mem-muted">管理员账号不能被停用。</span>'
        : `<button class="ce-button ${disabled ? 'ce-primary' : 'ce-danger'}" type="button" data-action="status" data-sub="${esc(member.sub)}" data-next="${disabled ? 'active' : 'disabled'}" data-key="${esc(key)}"${busy.has(key) ? ' disabled aria-busy="true"' : ''}>${disabled ? '恢复成员' : '停用成员'}</button>`;
      return `<div class="ce-mem-detail" id="ce-mem-d-${esc(member.sub)}"><div class="ce-mem-detail-head"><div><h3>电脑</h3></div></div><ul class="ce-mem-devices">${devices}</ul>
        <div class="ce-mem-detail-foot"><span class="ce-mem-muted">账号 ID ${esc(shortId(member.sub))}${isSelf ? ' · 这是你自己' : ''}</span>${control}</div></div>`;
    }
    function row(member, index) {
      const expanded = open.has(member.sub), disabled = member.membership === 'disabled';
      const key = 'row:' + member.sub, label = person(member);
      return `<div class="ce-mem-item" role="listitem" data-disabled="${disabled}" style="--i:${Math.min(index, 8)}">
        <button class="ce-mem-row" type="button" data-action="toggle" data-sub="${esc(member.sub)}" data-key="${esc(key)}" aria-expanded="${expanded}" aria-controls="ce-mem-d-${esc(member.sub)}" aria-label="${esc(label)}，${expanded ? '收起' : '展开'}详情">
          <span class="ce-mem-id"><span class="ce-mem-avatar" aria-hidden="true">${esc([...label][0] || '?')}</span>
            <span class="ce-mem-name"><strong>${esc(label)}</strong><span class="ce-mem-muted">${esc(shortId(member.sub))}</span></span></span>
          <span class="ce-mem-tags">${member.admin ? tag('管理员', 'info') : ''}${tag(disabled ? '已停用' : '已启用', disabled ? 'danger' : 'success')}${member.sub === self ? tag('你', 'neutral') : ''}</span>
          <span class="ce-mem-meta"><span class="ce-mem-cell">${deviceCell(member)}</span>
          <span class="ce-mem-cell ce-mem-muted" title="${member.last_active ? esc(new Date(member.last_active * 1000).toLocaleString('zh-CN')) : ''}">${esc(ago(member.last_active))}</span></span>
          <span class="ce-mem-caret" aria-hidden="true">${icons.chevron}</span></button>
        ${expanded ? detail(member) : ''}</div>`;
    }
    function paint() {
      const holder = doc.activeElement?.closest?.('[data-key]'), focused = container.contains(holder) ? holder.dataset.key : '';
      const list = $('list'); list.setAttribute('aria-busy', String(loading));
      if (blocked) {
        list.innerHTML = `<div class="ce-mem-empty">${icons.members}<strong>${esc(blocked)}</strong></div>`;
        $('toolbar').hidden = $('pager').hidden = true; container.querySelectorAll('.ce-heading-actions button').forEach(button => { button.hidden = true; });
        $('summary').textContent = ''; return;
      }
      if (loading && !page) {
        list.innerHTML = Array.from({length: 4}, () => '<div class="ce-mem-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>').join('');
        return;
      }
      const rows = visible(), online = (page?.items || []).reduce((sum, member) => sum + (member.devices || []).filter(device => device.state === 'online').length, 0);
      $('summary').textContent = page ? `共 ${page.total} 位成员 · ${online} 台电脑在线` : '';
      if (!page) list.innerHTML = '';
      else if (!rows.length) list.innerHTML = `<div class="ce-mem-empty">${icons.members}<strong>${page.total ? '没有符合条件的成员' : '还没有成员'}</strong><span>${page.total ? '换个关键词或状态试试。' : '点击“邀请成员”，把邀请码发给对方即可。'}</span></div>`;
      else list.innerHTML = `<div class="ce-mem-head" aria-hidden="true"><span>成员</span><span>状态</span><span>电脑</span><span>最近活动</span><span></span></div><div role="list">${rows.map(row).join('')}</div>`;
      const pages = page && page.total > page.limit;
      $('pager').hidden = !pages;
      if (pages) {
        $('range').textContent = `${page.offset + 1}–${Math.min(page.offset + page.limit, page.total)} / ${page.total}`;
        container.querySelector('[data-action="prev"]').disabled = page.offset <= 0;
        container.querySelector('[data-action="next"]').disabled = page.offset + page.limit >= page.total;
      }
      if (focused) container.querySelector(`[data-key="${(scope.CSS?.escape || (value => value.replace(/["\\]/g, '\\$&')))(focused)}"]`)?.focus({preventScroll: true});
    }
    function fail(error) {
      if (disposed || error.name === 'AbortError') return;
      if (error.expired) { blocked = ''; say(error.message); return; }
      say(error.message || fallbackError);
    }
    async function load(offset = page?.offset || 0) {
      const mine = ++generation; loading = true; paint(); say('');
      try {
        if (!csrf) {
          const response = await scope.fetch('/remote/api/session', {credentials: 'same-origin', signal: controller.signal});
          if (disposed || mine !== generation) return;
          if (!response.ok) throw Object.assign(new Error('登录已过期，请重新登录后继续。'), {expired: true});
          const session = await response.json();
          if (disposed || mine !== generation) return;
          if (session.admin !== true) { blocked = '只有管理员可以管理成员。'; loading = false; paint(); return; }
          csrf = session.csrf; self = session.account?.sub || '';
        }
        const value = await api(`/remote/api/admin/roster?limit=25&offset=${offset}`);
        if (!value || disposed || mine !== generation) return;
        if (!Array.isArray(value.items)) throw new Error(fallbackError);
        page = value;
      } catch (error) {
        if (mine === generation) fail(error.status === 403 ? Object.assign(error, {message: errors.admin_required}) : error);
        if (mine === generation && error.status === 403) { blocked = errors.admin_required; page = null; }
      }
      if (!disposed && mine === generation) { loading = false; paint(); }
    }
    async function confirmed(title, message, trigger) {
      if (!scope.CEUIDialog) { say('确认界面尚未就绪，未执行操作。'); return false; }
      const dialog = scope.CEUIDialog.create({root: container, owner: container, fallback: container.querySelector('h1'), onError: error => say(error.message)});
      try { return await dialog.confirm({title, message, trigger}); } finally { dialog.dispose?.(); }
    }
    async function act(key, work, success) {
      if (busy.has(key) || disposed) return;
      busy.add(key); paint(); say('');
      try { await work(); if (disposed) return; await load(); if (success) say(success, 'success'); }
      catch (error) { fail(error); }
      finally { busy.delete(key); if (!disposed) paint(); }
    }
    on(container, 'click', event => {
      const button = event.target.closest('[data-action],[data-filter]');
      if (!button || !container.contains(button)) return;
      if (button.dataset.filter) {
        filter = button.dataset.filter;
        container.querySelectorAll('[data-filter]').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
        paint(); return;
      }
      const member = page?.items.find(item => item.sub === button.dataset.sub);
      switch (button.dataset.action) {
        case 'refresh': void load(); break;
        case 'prev': void load(Math.max(0, page.offset - page.limit)); break;
        case 'next': void load(page.offset + page.limit); break;
        case 'toggle': if (open.has(button.dataset.sub)) open.delete(button.dataset.sub); else open.add(button.dataset.sub); paint(); break;
        case 'invite': void act('invite', async () => {
          const value = await api('/remote/api/invitations', {});
          if (!value || typeof value.invitation !== 'string' || !value.invitation) throw new Error('邀请码未生成，请重试。');
          invitation = value.invitation; $('code').textContent = invitation; $('invite').hidden = false;
        }, ''); break;
        case 'status': if (member) void (async () => {
          const next = button.dataset.next, label = person(member);
          if (next === 'disabled' && !await confirmed(`停用 ${label}？`, '停用后该成员会被立即退出登录，也无法再进入工作台；电脑连接不会被删除，之后可以随时恢复。', button)) return;
          await act(button.dataset.key, () => api('/remote/api/admin/members/status', {sub: member.sub, status: next}), next === 'disabled' ? `已停用 ${label}。` : `已恢复 ${label}。`);
        })(); break;
        case 'revoke': if (member) void (async () => {
          if (!await confirmed('强制下线并撤销这台电脑？', `${person(member)} 的这台电脑会立即断开，并需要重新绑定后才能再次连接。`, button)) return;
          await act(button.dataset.key, () => api(`/remote/api/devices/${encodeURIComponent(button.dataset.device)}/revoke`, {}), '电脑已撤销。');
        })(); break;
        default:
      }
    });
    on($('query'), 'input', event => { query = event.target.value; paint(); });
    void load();
    return () => {
      if (disposed) return;
      disposed = true; generation++; csrf = ''; page = null; controller.abort(); listeners.forEach(off => off()); container.textContent = '';
    };
  }

  scope.StudioMembersAdmin = {probe, mount, ago};
})(window);
