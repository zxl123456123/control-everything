'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let csrf = '', busy = false;
  async function request(path, method = 'GET') {
    const response = await fetch(path, {method, credentials:'same-origin', headers:{'X-Session-Client':'panel', ...(method === 'POST' ? {'X-Session-CSRF':csrf, 'Content-Type':'application/json'} : {})}, ...(method === 'POST' ? {body:'{}'} : {})});
    const value = await response.json();
    if (!response.ok) throw new Error(value.reason || '本机连接不可用');
    return value;
  }
  async function refresh() {
    if (busy) return;
    try {
      const value = await request('/api/desktop/remote/status');
      $('status').textContent = value.runtime_restart_required ? '绑定配置已保存，重新打开软件后启用远程连接；正在运行的工作请先正常结束。' : ({unbound:'尚未绑定账号', authorizing:'请打开授权页面，输入下方短码', awaiting_local_confirmation:'请核对账号后确认', online:'远程连接在线', offline:'远程连接离线', revoked:'远程连接已撤销'}[value.state] || value.code);
      $('account').textContent = value.account ? '账号：' + (value.account.name || value.account.sub) : '';
      $('confirm').hidden = value.state !== 'awaiting_local_confirmation';
      $('confirm').textContent = value.operation === 'recover' ? '确认恢复这台电脑的连接' : '确认绑定这台电脑';
      $('verification').hidden = !value.verification_uri;
      if (value.verification_uri) $('verification').href = value.verification_uri;
      $('code').textContent = value.user_code || '';
      $('authorize').disabled = value.configured === false || value.state === 'authorizing';
    } catch (error) { $('status').textContent = error.message; }
  }
  for (const action of ['authorize','confirm','revoke']) $(action).addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    try { await request('/api/desktop/remote/' + action, 'POST'); }
    catch (error) { $('status').textContent = error.message; }
    finally { busy = false; void refresh(); }
  });
  void request('/api/bootstrap').then(value => { csrf = value.csrf_token; return refresh(); }).catch(error => { $('status').textContent = error.message; });
  setInterval(() => { if (!document.hidden) void refresh(); }, 2000);
})();
