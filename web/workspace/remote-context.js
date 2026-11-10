/* One immutable edge-issued page context; never mutate native Storage prototypes. */
(function (scope) {
  'use strict';
  if (scope.CERemoteContext) return;
  const context = scope.document.querySelector('meta[name="ce-remote-context"]')?.content;
  const storageScope = scope.document.querySelector('meta[name="ce-storage-scope"]')?.content;
  if ((context || storageScope) && (!/^[A-Za-z0-9_-]{32}$/.test(context || '') || !/^[a-f0-9]{64}$/.test(storageScope || ''))) {
    throw new Error('remote_context_invalid');
  }
  // Shared with the engine helper on this page; invalidation is permanent.
  function sessionNotice() { try { return scope.localStorage.getItem('ce.remote.session-change'); } catch { return undefined; } }
  const state = scope.CERemotePageState || (scope.CERemotePageState = {active: true, notice: sessionNotice(), listeners: new Set()});
  function assertActive() {
    if (context && state.active && state.notice !== sessionNotice()) invalidate();
    if (context && !state.active) throw new Error('remote_context_inactive');
  }
  function onInactive(callback) {
    if (!context) return () => {};
    if (!state.active) { callback(); return () => {}; }
    state.listeners.add(callback);
    return () => state.listeners.delete(callback);
  }
  function showInactiveNotice() {
    const show = () => {
      const dialog = scope.document.createElement('dialog');
      dialog.setAttribute('aria-label', '工作区登录状态已失效');
      dialog.setAttribute('role', 'alertdialog');
      dialog.innerHTML = '<h2>请重新确认账号</h2><p>当前工作区的登录状态或访问权限已变化，请返回账号页重新登录并确认。</p><a href="/remote">返回账号页重新登录</a>';
      // The engine resets native dialog styles; scope the layout to this notice.
      Object.assign(dialog.style, {
        position: 'fixed', inset: '0', margin: 'auto', boxSizing: 'border-box',
        width: 'min(440px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 32px)',
        padding: '24px', border: '1px solid var(--ce-line, var(--border, #e4e4e4))',
        borderRadius: '24px', background: 'var(--ce-panel, var(--background, #ffffff))',
        color: 'var(--ce-text, var(--foreground, #202020))', fontFamily: 'system-ui, sans-serif',
        fontSize: '15px', lineHeight: '1.6', overflow: 'auto', overflowWrap: 'anywhere',
        boxShadow: '0 16px 48px #0003'
      });
      Object.assign(dialog.querySelector('h2').style, {margin: '0', fontSize: '20px', fontWeight: '600'});
      Object.assign(dialog.querySelector('p').style, {margin: '16px 0 24px'});
      Object.assign(dialog.querySelector('a').style, {
        display: 'block', boxSizing: 'border-box', minHeight: '44px', padding: '10px 16px',
        borderRadius: '12px', textAlign: 'center', textDecoration: 'none', fontWeight: '600',
        background: 'var(--ce-primary, var(--primary, #202020))',
        color: 'var(--ce-on-primary, var(--primary-foreground, #ffffff))',
        outline: '2px solid var(--ce-ring, var(--ring, #626262))', outlineOffset: '3px'
      });
      dialog.addEventListener('cancel', event => event.preventDefault());
      scope.document.body.append(dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      dialog.querySelector('a').focus();
    };
    if (scope.document.body) show();
    else scope.addEventListener('DOMContentLoaded', show, {once: true});
  }
  onInactive(showInactiveNotice);
  function invalidate() {
    if (!context || !state.active) return;
    state.active = false;
    for (const callback of [...state.listeners]) { try { callback(); } catch { /* Stop every consumer. */ } }
    state.listeners.clear();
  }
  if (context) scope.addEventListener?.('storage', event => {
    if (event.key === 'ce.remote.session-change' && event.newValue) invalidate();
  });
  function responseGuard(response) {
    if (!context) return response;
    return new Proxy(response, {get(target, key) {
      if (key === 'clone') return () => { assertActive(); return responseGuard(target.clone()); };
      const value = Reflect.get(target, key, target);
      if (['json', 'text', 'blob', 'arrayBuffer', 'formData', 'bytes'].includes(key) && typeof value === 'function') {
        return async (...args) => { assertActive(); const result = await value.apply(target, args); assertActive(); return result; };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    }});
  }
  async function fetchWith(fetchImpl, input, init) {
    assertActive();
    const response = await fetchImpl(input, options(input, init));
    const url = new URL(typeof input === 'string' ? input : input.url || input.href, scope.location.href);
    if (context && ['http:', 'https:'].includes(url.protocol) && url.origin === scope.location.origin && (response.status === 401 || response.status === 403)) invalidate();
    else assertActive();
    return responseGuard(response);
  }
  function storage(kind) {
    const original = scope[kind];
    if (!context) return original;
    const prefix = 'ce.remote.' + storageScope + '.';
    const keys = () => { assertActive(); return Array.from({length: original.length}, (_, index) => original.key(index)).filter(key => key?.startsWith(prefix)); };
    return Object.freeze({
      get length() { return keys().length; },
      key: index => keys()[index]?.slice(prefix.length) ?? null,
      getItem: key => { assertActive(); return original.getItem(prefix + key); },
      setItem: (key, value) => { assertActive(); original.setItem(prefix + key, value); },
      removeItem: key => { assertActive(); original.removeItem(prefix + key); },
      clear: () => keys().forEach(key => original.removeItem(key))
    });
  }
  function options(input, init = {}) {
    assertActive();
    const url = new URL(typeof input === 'string' ? input : input.url || input.href, scope.location.href);
    if (!context || !['http:', 'https:'].includes(url.protocol) || url.origin !== scope.location.origin) return init;
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('X-CE-Context', context);
    return {...init, headers};
  }
  scope.CERemoteContext = Object.freeze({context: context || null, storageScope: storageScope || null, storage, options, assertActive, onInactive, invalidate, fetchWith,
    get active() { if (context && state.active && state.notice !== sessionNotice()) invalidate(); return !context || state.active; },
    fetch: (input, init) => fetchWith(scope.fetch.bind(scope), input, init)});
})(window);
