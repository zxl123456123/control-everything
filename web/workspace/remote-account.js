'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let csrf = '', device = null, admin = false, invitationPending = false;
  function clearInvitation() { $('invitation-code').textContent = ''; $('invitation-result').hidden = true; }
  async function api(path, body) {
    const response = await fetch('/remote/api/' + path, {method: body ? 'POST':'GET', credentials:'same-origin', headers:body ? {'Content-Type':'application/json','X-CE-CSRF':csrf} : {}, ...(body ? {body:JSON.stringify(body)} : {})});
    if (response.status === 401) {
      csrf = ''; device = null; admin = false; clearInvitation(); $('invitations').hidden = true;
      $('login').hidden = false; $('activation').hidden = true; $('device').hidden = true; $('logout').hidden = true;
      $('account').textContent = '';
      throw new Error('请登录账号后继续。');
    }
    let value;
    try { value = await response.json(); } catch { throw new Error('账号服务暂不可用，请稍后重试。'); }
    if (!response.ok) throw new Error('请求未成功，请重新读取后重试。');
    return value;
  }
  function notifySessionChange() {
    try { window.localStorage.setItem('ce.remote.session-change', Date.now() + ':' + Math.random()); }
    catch { /* Notifications only accelerate server-enforced invalidation. */ }
  }
  async function refresh() {
    const value = await api('session');
    if (value.session_changed === true) notifySessionChange();
    csrf = value.csrf; device = value.device; admin = value.admin === true;
    clearInvitation(); $('invitations').hidden = !admin;
    $('login').hidden = true; $('logout').hidden = false;
    $('account').textContent = '当前账号：' + (value.account.name || value.account.sub);
    $('status').textContent = value.membership === 'active' ? '小组接入已激活' : '请使用小组邀请码激活接入';
    $('activation').hidden = value.membership === 'active'; $('device').hidden = !device;
    if (device) { $('device-name').textContent = device.name || '我的电脑'; $('device-state').textContent = ({pending:'等待绑定',provisioned:'正在准备连接',online:'在线',offline:'离线',revoking:'正在撤销连接',revoked:'连接已撤销'}[device.state] || '连接状态暂不可用'); $('open').hidden = device.state !== 'online'; }
  }
  $('create-invitation').addEventListener('click', async () => {
    if (!admin || !csrf || invitationPending) return;
    const requestCsrf = csrf;
    invitationPending = true; $('create-invitation').disabled = true; clearInvitation();
    try {
      const value = await api('invitations', {});
      if (!admin || csrf !== requestCsrf) return;
      if (typeof value.invitation !== 'string' || !value.invitation) throw new Error('邀请码未生成，请稍后重试。');
      $('invitation-code').textContent = value.invitation; $('invitation-result').hidden = false;
    } catch (error) { showError(error); }
    finally { invitationPending = false; $('create-invitation').disabled = false; }
  });
  $('activation').addEventListener('submit', event => { event.preventDefault(); void api('activate', {invite:new FormData(event.target).get('invite')}).then(refresh).catch(showError); });
  $('revoke').addEventListener('click', async () => {
    if (!device || !window.confirm('撤销后将断开这台电脑的远程连接，不会删除本机项目。确定继续吗？')) return;
    try { await api('devices/' + encodeURIComponent(device.device_id) + '/revoke', {}); await refresh(); }
    catch (error) { showError(error); }
  });
  $('logout').addEventListener('click', () => { void api('logout', {}).then(value => { clearInvitation(); admin = false; csrf = ''; $('invitations').hidden = true; notifySessionChange(); location.assign(value.logout_url); }).catch(showError); });
  function showError(error) { $('status').textContent = error.message; }
  void refresh().catch(showError);
})();
