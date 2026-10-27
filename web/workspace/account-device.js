/* Account controls keep hub and local connector trust boundaries separate. */
(function (scope) {
  'use strict';
  const symbols = {
    account: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    computer: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    members: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]}</svg>`;
  const connectionTone = state => state === 'online' ? 'success' : ['pending','enrolling','connecting','authorizing','awaiting_local_confirmation'].includes(state) ? 'warning' : ['revoking','revoked'].includes(state) ? 'danger' : 'neutral';
  function mount(container, {mode, returnHash, onPortal} = {}) {
    if (!['remote', 'local'].includes(mode)) throw new Error('account_mode_required');
    const remote = mode === 'remote';
    const context = remote && scope.CERemoteContext?.context ? scope.CERemoteContext : null;
    let disposed = false, generation = 0, csrf = '', account = null, device = null;
    let admin = false, busy = false, reading = false, timer, configured = false, revokeTarget = null, composing = false;
    let membersOffset = 0, membersTotal = 0, membersEpoch = 0, membersReading = false, adminViewEpoch = 0;
    const membersLimit = 25;
    const pending = new Set();
    let controller = new AbortController();
    const listeners = [];
    container.innerHTML = `<section class="ce-account">
      <header class="ce-account-heading"><h1 tabindex="-1">账号与设备</h1><button class="ce-account-refresh" type="button" data-action="refresh" aria-label="刷新" title="刷新"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 1-2.3-5.7"/></svg></button></header>
      <p class="ce-account-notice" data-node="status" role="status" aria-live="polite">正在读取连接状态…</p>
      <div class="ce-account-grid">
        <section class="ce-account-card ce-account-setting"><div class="ce-account-card-title"><span class="ce-account-media">${icon('account')}</span><h2>账号</h2><span class="ce-account-badge" data-node="membership">读取中</span></div><div class="ce-account-body">
          <p class="ce-account-identity" data-node="account"></p>
          <p data-node="login" hidden><a class="ce-account-primary" href="/oauth2/start?rd=%2Fremote">登录 / 注册账号</a></p>
          <form data-node="activation" hidden><label>小组邀请码<input name="invite" required autocomplete="off" placeholder="输入收到的邀请码"></label><button class="ce-account-primary" type="submit">激活小组接入</button></form>
          <div data-node="local-actions" hidden><p data-node="local-help"></p><button class="ce-account-primary" type="button" data-action="authorize">登录 / 注册账号</button><div data-node="grant" hidden><p>授权码</p><output class="ce-account-code" data-node="code"></output><p><a data-node="verification" target="_blank" rel="noopener noreferrer">在浏览器中登录 / 注册 ↗</a></p></div><button class="ce-account-primary" type="button" data-action="confirm" hidden>确认绑定这台电脑</button></div>
          <button type="button" data-action="logout" hidden>退出账号</button>
        </div></section>
        <section class="ce-account-card ce-account-setting"><div class="ce-account-card-title"><span class="ce-account-media">${icon('computer')}</span><h2 data-node="device-name">电脑接入</h2><span class="ce-account-badge" data-node="device-state">读取中</span></div><div class="ce-account-body"><p data-node="device-help"></p><p><a class="ce-account-primary" data-node="open" href="/studio" hidden>进入工作台 →</a></p><div class="ce-account-danger-zone" data-node="revoke-area" hidden><button class="ce-account-danger" type="button" data-action="revoke">撤销电脑连接</button></div></div></section>
      </div>
      <section class="ce-account-card ce-account-members" data-node="invitations" hidden>
        <div class="ce-account-card-title"><span class="ce-account-media">${icon('members')}</span><h2 data-node="members-title">成员</h2><button type="button" data-action="invitation">邀请成员</button></div>
        <p data-node="invitation-result" hidden><output class="ce-account-code" data-node="invitation-code"></output><br>24 小时内有效，仅可使用一次。</p><p data-node="members-status" role="status" aria-live="polite"></p>
        <div class="ce-account-members-wrap" data-node="members-table" hidden><table class="ce-account-members-table"><thead><tr><th scope="col">成员</th><th scope="col">角色</th><th scope="col">成员状态</th><th scope="col">电脑</th><th scope="col">注册时间</th></tr></thead><tbody data-node="members-list"></tbody></table></div>
        <nav class="ce-account-pagination" data-node="members-pages" aria-label="成员分页" hidden><button type="button" data-action="members-previous" aria-label="上一页" title="上一页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><span data-node="members-page"></span><button type="button" data-action="members-next" aria-label="下一页" title="下一页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button></nav>
      </section>
      <dialog class="ce-account-dialog" data-node="revoke-dialog" aria-label="撤销电脑连接"><h2>撤销电脑连接？</h2><p>这台电脑的远程连接将断开，不会删除本机项目。需要重新授权后才能恢复远程访问。</p><p data-node="revoke-error" class="ce-account-dialog-error" role="alert" tabindex="-1" hidden></p><div class="ce-account-dialog-actions"><button type="button" data-action="cancel-revoke" autofocus>取消</button><button class="ce-account-danger" type="button" data-action="confirm-revoke">确认撤销连接</button></div></dialog>
    </section>`;
    const $ = name => container.querySelector(`[data-node="${name}"]`);
    const action = name => container.querySelector(`[data-action="${name}"]`);
    const dialog = $('revoke-dialog');
    function on(node, event, handler) { node.addEventListener(event, handler); listeners.push(() => node.removeEventListener(event, handler)); }
    function clearInvitation() { $('invitation-code').textContent = ''; $('invitation-result').hidden = true; }
    function clearMembers() {
      membersEpoch++; membersOffset = membersTotal = 0; membersReading = false;
      $('members-list').replaceChildren(); $('members-table').hidden = $('members-pages').hidden = true;
      $('members-title').textContent = '成员'; $('members-status').textContent = '';
    }
    function recheckAdminView() {
      if (disposed) return;
      adminViewEpoch++; clearMembers(); clearInvitation(); $('invitations').hidden = true;
      if (!scope.document.hidden) void refresh();
    }
    function clearAccount() {
      csrf = ''; account = device = null; admin = false; busy = false; pending.clear();
      clearMembers(); onPortal?.('');
      clearInvitation(); $('account').textContent = ''; $('membership').textContent = '未登录';
      $('membership').dataset.tone = $('device-state').dataset.tone = 'neutral';
      $('device-name').textContent = '电脑接入'; $('device-state').textContent = '未连接';
      $('device-help').textContent = '';
      for (const name of ['activation','invitations','revoke-area','open']) $(name).hidden = true;
      for (const name of ['invitation','logout','revoke']) action(name).disabled = false;
      action('logout').hidden = true;
      if (dialog.open) dialog.close();
    }
    function notify() { try { scope.localStorage.setItem('ce.remote.session-change', Date.now() + ':' + Math.random()); } catch { /* Server enforcement remains authoritative. */ } }
    function retire() { ++generation; controller.abort(); controller = new AbortController(); clearAccount(); }
    function endSession(destination) {
      retire(); notify(); context?.invalidate();
      // Invalidation may synchronously dispose this component; navigation must still happen.
      scope.location.assign(destination);
    }
    function error(error) {
      if (!disposed && error.name !== 'AbortError') {
        $('status').textContent = error.message; $('status').dataset.tone = 'error';
        if (dialog.open) { $('revoke-error').textContent = error.message; $('revoke-error').hidden = false; $('revoke-error').focus(); }
      }
    }
    async function request(path, body) {
      const mine = generation;
      const response = await scope.fetch(path, {method: body ? 'POST' : 'GET', credentials: 'same-origin', signal: controller.signal,
        headers: remote ? (body ? {'Content-Type':'application/json','X-CE-CSRF':csrf} : path.startsWith('/remote/api/admin/members?') ? {'X-CE-CSRF':csrf} : {}) : {'X-Session-Client':'panel', ...(body ? {'Content-Type':'application/json','X-Session-CSRF':csrf} : {})},
        ...(body ? {body: JSON.stringify(body)} : {})});
      if (disposed || mine !== generation) return null;
      if (remote && response.status === 401) {
        if (context) endSession('/remote');
        else { retire(); notify(); $('login').hidden = false; $('status').textContent = '请登录账号后继续。'; }
        return null;
      }
      let value;
      try { value = await response.json(); } catch { throw new Error('账号服务暂不可用，请稍后重试。'); }
      if (disposed || mine !== generation) return null;
      if (!response.ok) {
        const memberError = path.startsWith('/remote/api/admin/members?') && ({member_directory_not_configured:'成员目录未配置。',member_directory_unavailable:'成员列表暂时不可用，请刷新重试。'})[value.error];
        const failure = new Error(memberError || (remote ? '请求未成功，请刷新状态后重试。' : (value.reason || '本机连接不可用，请重试。')));
        failure.status = response.status; throw failure;
      }
      return value;
    }
    const remoteStates = {pending:'等待绑定', provisioned:'正在准备连接', enrolling:'绑定中', connecting:'连接中', online:'在线', offline:'离线', revoking:'正在撤销连接', revoked:'连接已撤销'};
    async function loadMembers(offset = membersOffset) {
      if (disposed || !remote || !admin || !csrf || scope.document.hidden) return;
      const epoch = ++membersEpoch, mine = generation, requestCsrf = csrf;
      membersReading = true; $('members-status').textContent = '正在读取成员…'; $('members-status').dataset.tone = '';
      action('members-previous').disabled = action('members-next').disabled = true;
      try {
        const value = await request(`/remote/api/admin/members?limit=${membersLimit}&offset=${offset}`);
        if (!value || disposed || mine !== generation || epoch !== membersEpoch || !admin || requestCsrf !== csrf || scope.document.hidden) return;
        if (!Array.isArray(value.items) || !Number.isSafeInteger(value.total) || value.total < 0 || value.offset !== offset || value.limit !== membersLimit || value.items.length !== Math.min(membersLimit, Math.max(0, value.total - offset)))
          throw new Error('成员列表未完整读取，请刷新重试。');
        if (offset && offset >= value.total) { void loadMembers(0); return; }
        const rows = value.items.map(member => {
          const row = scope.document.createElement('tr'); row.setAttribute('role', 'row');
          const joined = member.account?.enabled === false ? '账号停用' : ({active:'已激活',disabled:'接入停用',inactive:'待激活'})[member.membership] || '状态未知';
          const registered = typeof member.account?.registered_at === 'number' && Number.isFinite(member.account.registered_at)
            ? new Date(member.account.registered_at * 1000).toLocaleString('zh-CN', {hour12:false}) : '—';
          const values = [member.account?.name || '未命名成员', member.admin === true ? '管理员' : '成员', joined,
            member.device ? `${member.device.name || '电脑'} · ${remoteStates[member.device.state] || '状态未知'}` : '未绑定', registered];
          for (const [index, text] of values.entries()) {
            const cell = scope.document.createElement('td'); cell.setAttribute('role', 'cell');
            const content = scope.document.createElement('span'); content.textContent = text;
            if (index === 1) {
              content.className = 'ce-account-role'; content.textContent = '';
              const symbol = scope.document.createElement('span'); symbol.className = 'ce-account-role-icon'; symbol.innerHTML = icon(member.admin === true ? 'shield' : 'account');
              const label = scope.document.createElement('span'); label.textContent = text; content.append(symbol, label);
            } else if (index === 2) {
              content.className = 'ce-account-badge';
              content.dataset.tone = member.account?.enabled === false || member.membership === 'disabled' ? 'danger' : member.membership === 'active' ? 'success' : member.membership === 'inactive' ? 'warning' : 'neutral';
            } else if (index === 3 && member.device) {
              content.className = 'ce-account-computer'; content.textContent = '';
              const name = scope.document.createElement('span'); name.textContent = (member.device.name || '电脑') + ' · ';
              const state = scope.document.createElement('span'); state.className = 'ce-account-badge'; state.textContent = remoteStates[member.device.state] || '状态未知'; state.dataset.tone = connectionTone(member.device.state);
              content.append(name, state);
            } else if (index === 3) {
              content.className = 'ce-account-badge'; content.dataset.tone = 'neutral';
            }
            cell.append(content);
            cell.dataset.label = ['成员','角色','成员状态','电脑','注册时间'][index]; row.append(cell);
          }
          return row;
        });
        membersOffset = value.offset; membersTotal = value.total;
        $('members-list').replaceChildren(...rows); $('members-title').textContent = `成员 · ${membersTotal}`;
        $('members-status').textContent = rows.length ? '' : '暂无注册成员。';
        $('members-table').hidden = !rows.length; $('members-pages').hidden = membersTotal <= membersLimit;
        $('members-page').textContent = `${Math.floor(membersOffset / membersLimit) + 1} / ${Math.max(1, Math.ceil(membersTotal / membersLimit))}`;
      } catch (failure) {
        if (disposed || mine !== generation || epoch !== membersEpoch || !admin || requestCsrf !== csrf) return;
        if (failure.status === 403) { clearMembers(); $('invitations').hidden = true; error(failure); }
        else { $('members-status').textContent = failure.message; $('members-status').dataset.tone = 'error'; }
      } finally {
        if (!disposed && epoch === membersEpoch) {
          membersReading = false;
          action('members-previous').disabled = membersOffset === 0;
          action('members-next').disabled = membersOffset + membersLimit >= membersTotal;
        }
      }
    }
    function renderRemote(value) {
      if (value.session_changed === true || (account && account.sub !== value.account.sub)) {
        if (context) { endSession('/remote'); return; }
        retire(); notify();
      } else if (csrf && csrf !== value.csrf) { retire(); }
      csrf = value.csrf; account = value.account; device = value.device; admin = value.admin === true;
      if (onPortal && scope.location.origin) onPortal(scope.location.origin + '/remote');
      clearInvitation(); $('login').hidden = true; action('logout').hidden = false;
      $('account').textContent = account.name || account.sub;
      $('membership').textContent = value.membership === 'active' ? '已激活' : '待激活';
      $('membership').dataset.tone = value.membership === 'active' ? 'success' : 'warning';
      $('status').textContent = '';
      $('activation').hidden = value.membership === 'active'; $('invitations').hidden = !admin || scope.document.hidden;
      if (!admin) clearMembers();
      $('device-name').textContent = device?.name || '电脑接入';
      $('device-state').textContent = device ? (remoteStates[device.state] || '状态未知') : '尚未绑定';
      $('device-state').dataset.tone = connectionTone(device?.state);
      $('device-help').textContent = !device ? (value.membership === 'active' ? '请在电脑端登录账号并确认绑定。' : '激活小组接入后，在电脑端登录账号并确认绑定。') : '';
      $('open').hidden = device?.state !== 'online'; $('revoke-area').hidden = !device || device.state === 'revoked';
      if (admin) void loadMembers();
    }
    function renderLocal(value) {
      configured = value.configured !== false; device = value;
      onPortal?.(configured && typeof value.portal_url === 'string' ? value.portal_url : '');
      $('local-actions').hidden = !configured;
      $('account').textContent = value.account ? (value.account.name || value.account.sub) : '';
      $('membership').textContent = !configured ? '账号服务未配置' : value.account ? '已登录' : ['connecting','online','offline'].includes(value.state) ? '连接已保存' : '未登录';
      $('membership').dataset.tone = configured && value.account ? 'success' : 'neutral';
      $('status').textContent = value.runtime_restart_required ? '绑定配置已保存，重新打开软件后启用远程连接；正在运行的工作请先正常结束。' : '';
      $('local-help').textContent = value.state === 'awaiting_local_confirmation' ? '请核对账号后确认绑定。' : '';
      $('device-state').textContent = remoteStates[value.state] || ({unbound:'尚未绑定',authorizing:'授权中',awaiting_local_confirmation:'等待确认'}[value.state] || '未连接');
      $('device-state').dataset.tone = connectionTone(value.state);
      $('device-help').textContent = configured ? '' : '此版本没有启用账号服务，不影响本机项目的使用。';
      action('authorize').disabled = !configured || value.state === 'authorizing';
      action('authorize').hidden = !configured || value.state === 'awaiting_local_confirmation';
      action('authorize').textContent = value.state === 'authorizing' ? '授权中' : ['online','offline'].includes(value.state) ? '重新连接' : '登录 / 注册账号';
      action('confirm').hidden = value.state !== 'awaiting_local_confirmation';
      action('confirm').disabled = !configured;
      action('confirm').textContent = value.operation === 'recover' ? '确认恢复这台电脑的连接' : '确认绑定这台电脑';
      $('grant').hidden = !value.verification_uri; $('code').textContent = value.user_code || '';
      if (value.verification_uri) $('verification').href = value.verification_uri;
      $('revoke-area').hidden = !configured || ['unbound','revoked'].includes(value.state);
      $('open').hidden = typeof returnHash === 'string'; $('open').textContent = '返回工作台 →';
      if (typeof returnHash === 'string' && /^#[a-zA-Z0-9/_-]*$/.test(returnHash)) $('open').href = '/studio' + returnHash;
    }
    async function refresh() {
      if (disposed || (!remote && busy) || reading) return;
      reading = true; const mine = generation;
      try {
        if (!remote && !csrf) { const bootstrap = await request('/api/bootstrap'); if (!bootstrap || disposed || mine !== generation) return; csrf = bootstrap.csrf_token; }
        const value = await request(remote ? '/remote/api/session' : '/api/desktop/remote/status');
        if (!value || disposed || mine !== generation) return;
        $('status').dataset.tone = '';
        if (remote) renderRemote(value); else renderLocal(value);
      } catch (failure) { if (mine === generation) error(failure); }
      finally { reading = false; }
    }
    async function mutate(kind, body = {}) {
      if (disposed || pending.has(kind) || (!remote && busy) || reading || !csrf || (kind === 'invitation' && !admin) || (!remote && !configured)) return;
      pending.add(kind);
      busy = true; const mine = generation, requestCsrf = csrf, requestView = adminViewEpoch;
      const button = action(kind); if (button) button.disabled = true;
      if (kind === 'revoke') { action('cancel-revoke').disabled = true; action('confirm-revoke').disabled = true; }
      if (button) button.setAttribute?.('aria-busy', 'true');
      if (kind === 'invitation') clearInvitation();
      try {
        const path = remote ? '/remote/api/' + (kind === 'invitation' ? 'invitations' : kind === 'revoke' ? 'devices/' + encodeURIComponent(device.device_id) + '/revoke' : kind) : '/api/desktop/remote/' + kind;
        const value = await request(path, body);
        if (!value || disposed || mine !== generation || requestCsrf !== csrf || kind === 'invitation' && (!admin || scope.document.hidden || requestView !== adminViewEpoch)) return;
        if (kind === 'logout') {
          if (value.logout_url !== '/oauth2/sign_out') throw new Error('退出地址无效，请刷新后重试。');
          endSession(value.logout_url); return;
        }
        if (kind === 'invitation') {
          if (typeof value.invitation !== 'string' || !value.invitation) throw new Error('邀请码未生成，请重试。');
          $('invitation-code').textContent = value.invitation; $('invitation-result').hidden = false;
        } else { busy = false; await refresh(); }
        return true;
      } catch (failure) { if (mine === generation) error(failure); }
      finally { if (!disposed && mine === generation) { pending.delete(kind); busy = pending.size > 0; if (button) { button.disabled = !remote && (!configured || (kind === 'authorize' && device?.state === 'authorizing')); button.setAttribute?.('aria-busy', 'false'); } if (kind === 'revoke') { action('cancel-revoke').disabled = false; action('confirm-revoke').disabled = false; } } }
      return false;
    }
    on(action('refresh'), 'click', () => { void refresh(); });
    if (remote) {
      on(scope.document, 'visibilitychange', recheckAdminView);
      on(scope, 'focus', recheckAdminView);
    }
    on(action('members-previous'), 'click', () => { if (!membersReading && membersOffset > 0) void loadMembers(membersOffset - membersLimit); });
    on(action('members-next'), 'click', () => { if (!membersReading && membersOffset + membersLimit < membersTotal) void loadMembers(membersOffset + membersLimit); });
    on($('activation'), 'submit', event => { event.preventDefault(); void mutate('activate', {invite: new FormData(event.currentTarget).get('invite')}); });
    for (const kind of ['invitation','logout','authorize','confirm']) on(action(kind), 'click', () => { void mutate(kind); });
    const revokeIdentity = () => device && JSON.stringify([generation, csrf, remote ? device.device_id : device.account?.sub, device.state]);
    on(action('revoke'), 'click', () => {
      if (disposed || busy || reading || !device) return;
      revokeTarget = revokeIdentity(); $('revoke-error').hidden = true;
      try { dialog.showModal(); action('cancel-revoke').focus(); }
      catch (failure) { error(new Error('无法打开撤销确认，请重试。' + failure.message)); }
    });
    const closeRevoke = () => { if (!busy) dialog.close(); };
    on(action('cancel-revoke'), 'click', closeRevoke);
    on(action('confirm-revoke'), 'click', async () => {
      if (disposed || busy || reading || !dialog.open) return;
      if (!revokeTarget || revokeTarget !== revokeIdentity()) { error(new Error('电脑连接状态已变化，请取消后重新核对。')); return; }
      if (await mutate('revoke')) { if (!disposed && dialog.open) dialog.close(); }
    });
    on(dialog, 'compositionstart', () => { composing = true; });
    on(dialog, 'compositionend', () => { composing = false; });
    on(dialog, 'cancel', event => { event.preventDefault(); if (!composing && !event.isComposing) closeRevoke(); });
    on(dialog, 'keydown', event => { if (event.key === 'Escape') { event.stopPropagation?.(); if (composing || event.isComposing || event.keyCode === 229) event.preventDefault(); } });
    on(dialog, 'close', () => { revokeTarget = null; if (!disposed) action('revoke').focus(); });
    function poll() { timer = scope.setTimeout(() => { if (disposed) return; if (!scope.document.hidden) void refresh(); poll(); }, 2000); }
    function dispose() {
      if (disposed) return; disposed = true; ++generation; ++membersEpoch; csrf = ''; account = device = null;
      controller.abort(); scope.clearTimeout(timer); unsubscribe();
      for (const remove of listeners) remove();
      if (dialog.open) dialog.close(); container.replaceChildren();
    }
    let unsubscribe = () => {};
    if (context) unsubscribe = context.onInactive(dispose);
    if (!disposed) { void refresh(); if (!remote) poll(); }
    return dispose;
  }
  scope.StudioAccountDevice = Object.freeze({mount});
})(window);
