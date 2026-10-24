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
