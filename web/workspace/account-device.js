/* Account controls keep hub and local connector trust boundaries separate. */
(function (scope) {
  'use strict';
  function mount(container, {mode, returnHash} = {}) {
    if (!['remote', 'local'].includes(mode)) throw new Error('account_mode_required');
    const remote = mode === 'remote';
    const context = remote && scope.CERemoteContext?.context ? scope.CERemoteContext : null;
    let disposed = false, generation = 0, csrf = '', account = null, device = null;
    let admin = false, busy = false, reading = false, timer, configured = false;
    const pending = new Set();
    let controller = new AbortController();
    const listeners = [];
    container.innerHTML = `<section class="ce-account">
      <header class="ce-account-heading"><div><p class="ce-account-eyebrow">工作台 / 账号与设备</p><h1>账号与设备</h1><p>管理你的账号接入与电脑连接。</p></div><button type="button" data-action="refresh">刷新状态</button></header>
      <p class="ce-account-notice" data-node="status" role="status" aria-live="polite">正在读取连接状态…</p>
      <div class="ce-account-grid">
        <section class="ce-account-card"><div class="ce-account-card-title"><span class="ce-account-icon" aria-hidden="true">◎</span><div><h2>${remote ? '我的账号' : '本机账号接入'}</h2><p>${remote ? '账号身份与小组接入' : '授权后在本机核对并确认'}</p></div><span class="ce-account-badge" data-node="membership">读取中</span></div>
          <p class="ce-account-identity" data-node="account"></p>
          <p data-node="login" hidden><a class="ce-account-primary" href="/oauth2/start?rd=%2Fremote">登录 / 注册账号</a></p>
          <form data-node="activation" hidden><label>小组邀请码<input name="invite" required autocomplete="off" placeholder="输入收到的邀请码"></label><button class="ce-account-primary" type="submit">激活小组接入</button></form>
          <div data-node="local-actions" hidden><p data-node="local-help"></p><button class="ce-account-primary" type="button" data-action="authorize">登录账号 / 恢复连接</button><div data-node="grant" hidden><p>在授权页面输入短码：</p><output class="ce-account-code" data-node="code"></output><p><a data-node="verification" target="_blank" rel="noopener noreferrer">打开账号授权页面 ↗</a></p></div><button class="ce-account-primary" type="button" data-action="confirm" hidden>确认绑定这台电脑</button></div>
          <button type="button" data-action="logout" hidden>退出账号</button>
        </section>
        <section class="ce-account-card"><div class="ce-account-card-title"><span class="ce-account-icon" aria-hidden="true">▣</span><div><h2 data-node="device-name">我的电脑</h2><p>项目保留在你的电脑上</p></div><span class="ce-account-badge" data-node="device-state">读取中</span></div><p data-node="device-help"></p><p><a class="ce-account-primary" data-node="open" href="/studio" hidden>进入工作台 →</a></p><div class="ce-account-danger-zone" data-node="revoke-area" hidden><h3>断开远程连接</h3><p>撤销只断开远程连接，不会删除本机项目。</p><button class="ce-account-danger" type="button" data-action="revoke">撤销电脑连接</button></div></section>
        <section class="ce-account-card ce-account-invitations" data-node="invitations" hidden><div class="ce-account-card-title"><span class="ce-account-icon" aria-hidden="true">＋</span><div><h2>邀请成员</h2><p>为需要接入的小组成员生成一次性邀请码</p></div></div><button type="button" data-action="invitation">生成邀请码</button><p>邀请码有效 24 小时，只能使用一次。请自行交给需要接入的成员。</p><p data-node="invitation-result" hidden>本次邀请码：<output class="ce-account-code" data-node="invitation-code"></output></p></section>
      </div><p class="ce-account-footnote">iPhone 与 Android 可通过网站访问；当前未提供原生安装包。</p>
      <dialog class="ce-account-dialog" data-node="revoke-dialog" aria-label="撤销电脑连接"><h2>撤销电脑连接？</h2><p>这台电脑的远程连接将断开，不会删除本机项目。需要重新授权后才能恢复远程访问。</p><div class="ce-account-dialog-actions"><button type="button" data-action="cancel-revoke">取消</button><button class="ce-account-danger" type="button" data-action="confirm-revoke">确认撤销连接</button></div></dialog>
    </section>`;
    const $ = name => container.querySelector(`[data-node="${name}"]`);
    const action = name => container.querySelector(`[data-action="${name}"]`);
    const dialog = $('revoke-dialog');
    function on(node, event, handler) { node.addEventListener(event, handler); listeners.push(() => node.removeEventListener(event, handler)); }
    function clearInvitation() { $('invitation-code').textContent = ''; $('invitation-result').hidden = true; }
    function clearAccount() {
      csrf = ''; account = device = null; admin = false; busy = false; pending.clear();
      clearInvitation(); $('account').textContent = ''; $('membership').textContent = '未登录';
      $('device-name').textContent = '我的电脑'; $('device-state').textContent = '未连接';
      $('device-help').textContent = '登录后查看你的电脑连接。';
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
    function error(error) { if (!disposed && error.name !== 'AbortError') { $('status').textContent = error.message; $('status').dataset.tone = 'error'; } }
    async function request(path, body) {
      const mine = generation;
      const response = await scope.fetch(path, {method: body ? 'POST' : 'GET', credentials: 'same-origin', signal: controller.signal,
        headers: remote ? (body ? {'Content-Type':'application/json','X-CE-CSRF':csrf} : {}) : {'X-Session-Client':'panel', ...(body ? {'Content-Type':'application/json','X-Session-CSRF':csrf} : {})},
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
      if (!response.ok) throw new Error(remote ? '请求未成功，请刷新状态后重试。' : (value.reason || '本机连接不可用，请重试。'));
      return value;
    }
    const remoteStates = {pending:'等待绑定', provisioned:'正在准备连接', online:'在线', offline:'离线', revoking:'正在撤销连接', revoked:'连接已撤销'};
    function renderRemote(value) {
      if (value.session_changed === true || (account && account.sub !== value.account.sub)) {
        if (context) { endSession('/remote'); return; }
        retire(); notify();
      } else if (csrf && csrf !== value.csrf) { retire(); }
      csrf = value.csrf; account = value.account; device = value.device; admin = value.admin === true;
      clearInvitation(); $('login').hidden = true; action('logout').hidden = false;
      $('account').textContent = account.name || account.sub;
      $('membership').textContent = value.membership === 'active' ? '已激活' : '待激活';
      $('status').textContent = value.membership === 'active' ? '账号已就绪。你可以在这里管理电脑连接。' : '使用小组邀请码激活后，即可绑定电脑。';
      $('activation').hidden = value.membership === 'active'; $('invitations').hidden = !admin;
      $('device-name').textContent = device?.name || '我的电脑';
      $('device-state').textContent = device ? (remoteStates[device.state] || '状态未知') : '尚未绑定';
      $('device-state').dataset.tone = device?.state === 'online' ? 'success' : 'neutral';
      $('device-help').textContent = !device ? '在 Windows 软件中打开“绑定这台电脑”，登录后核对账号并确认。' : device.state === 'online' ? '电脑已在线，可以继续使用你的项目工作台。' : '电脑当前不可连接。账号与邀请管理仍可在这里使用。';
      $('open').hidden = device?.state !== 'online'; $('revoke-area').hidden = !device || device.state === 'revoked';
    }
    function renderLocal(value) {
      configured = value.configured !== false; device = value;
      $('local-actions').hidden = false;
      const unbound = !configured || ['unbound','authorizing','revoked'].includes(value.state);
      $('account').textContent = value.account ? (value.account.name || value.account.sub) : unbound ? '尚未绑定账号' : '连接已保存';
      $('membership').textContent = configured ? '本机接入' : '未配置';
      $('status').textContent = value.runtime_restart_required ? '绑定配置已保存，重新打开软件后启用远程连接；正在运行的工作请先正常结束。' : ({unbound:'尚未绑定账号',authorizing:'请打开授权页面，输入下方短码',awaiting_local_confirmation:'请核对账号后确认',online:'远程连接在线',offline:'远程连接离线',revoked:'远程连接已撤销'}[value.state] || '连接状态暂不可用');
      $('local-help').textContent = configured ? '授权完成后，请回到这里核对账号，再明确确认绑定。' : '尚未配置自建账号服务。请先完成本机连接配置。';
      $('device-state').textContent = remoteStates[value.state] || ({unbound:'尚未绑定',authorizing:'授权中',awaiting_local_confirmation:'等待确认'}[value.state] || '未连接');
      $('device-help').textContent = value.account ? '核对上方账号；只有点击确认后才会绑定这台电脑。' : unbound ? '完成账号授权后，即可通过手机访问工作台。' : '电脑连接状态以此处显示为准。';
      action('authorize').disabled = !configured || value.state === 'authorizing';
      action('confirm').hidden = value.state !== 'awaiting_local_confirmation';
      action('confirm').disabled = !configured;
      action('confirm').textContent = value.operation === 'recover' ? '确认恢复这台电脑的连接' : '确认绑定这台电脑';
      $('grant').hidden = !value.verification_uri; $('code').textContent = value.user_code || '';
      if (value.verification_uri) $('verification').href = value.verification_uri;
      $('revoke-area').hidden = !configured || ['unbound','revoked'].includes(value.state);
      $('open').hidden = false; $('open').textContent = '返回本机工作台 →';
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
      busy = true; const mine = generation, requestCsrf = csrf;
      const button = action(kind); if (button) button.disabled = true;
      if (kind === 'invitation') clearInvitation();
      try {
        const path = remote ? '/remote/api/' + (kind === 'invitation' ? 'invitations' : kind === 'revoke' ? 'devices/' + encodeURIComponent(device.device_id) + '/revoke' : kind) : '/api/desktop/remote/' + kind;
        const value = await request(path, body);
        if (!value || disposed || mine !== generation || requestCsrf !== csrf) return;
        if (kind === 'logout') {
          if (value.logout_url !== '/oauth2/sign_out') throw new Error('退出地址无效，请刷新后重试。');
          endSession(value.logout_url); return;
        }
        if (kind === 'invitation') {
          if (typeof value.invitation !== 'string' || !value.invitation) throw new Error('邀请码未生成，请重试。');
          $('invitation-code').textContent = value.invitation; $('invitation-result').hidden = false;
        } else { busy = false; await refresh(); }
      } catch (failure) { if (mine === generation) error(failure); }
      finally { if (!disposed && mine === generation) { pending.delete(kind); busy = pending.size > 0; if (button) button.disabled = !remote && (!configured || (kind === 'authorize' && device?.state === 'authorizing')); } }
    }
    on(action('refresh'), 'click', () => { void refresh(); });
    on($('activation'), 'submit', event => { event.preventDefault(); void mutate('activate', {invite: new FormData(event.currentTarget).get('invite')}); });
    for (const kind of ['invitation','logout','authorize','confirm']) on(action(kind), 'click', () => { void mutate(kind); });
    on(action('revoke'), 'click', () => { if (!disposed && !busy && device) dialog.showModal(); });
    on(action('cancel-revoke'), 'click', () => dialog.close());
    on(action('confirm-revoke'), 'click', () => { dialog.close(); void mutate('revoke'); });
    on(dialog, 'close', () => { if (!disposed) action('revoke').focus(); });
    function poll() { timer = scope.setTimeout(() => { if (disposed) return; if (!scope.document.hidden) void refresh(); poll(); }, 2000); }
    function dispose() {
      if (disposed) return; disposed = true; ++generation; csrf = ''; account = device = null;
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
