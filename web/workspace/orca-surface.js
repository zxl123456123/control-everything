'use strict';

(function (scope) {
  const DEFAULT_URL = 'http://127.0.0.1:8767/web-index.html';
  const STORAGE_KEY = 'ce-studio-orca-client-url';

  function validateClientUrl(value) {
    const text = String(value || '').trim();
    if (!text || /[\s\\]/u.test(text) || !/^https?:\/\//i.test(text)) {
      throw new Error('请输入完整的 HTTP(S) 客户端页面地址。');
    }
    let parsed;
    try { parsed = new URL(text); } catch (_) {
      throw new Error('客户端地址格式不正确。');
    }
    // Pairing offers belong to Orca, never to the outer shell or its storage.
    if (parsed.username || parsed.password || text.includes('?') || text.includes('#')) {
      throw new Error('请使用不含账号、密码、查询参数或片段的页面地址；配对链接请在 Orca 内填写。');
    }
    return parsed.href;
  }

  function create({root, storage}) {
    if (storage === undefined) {
      try { storage = scope.CERemoteContext ? scope.CERemoteContext.storage('localStorage') : scope.localStorage; } catch (_) { storage = null; }
    }
    const element = name => root.querySelector(`[data-orca="${name}"]`);
    const input = element('url');
    const error = element('error');
    const status = element('status');
    const open = element('open');
    const host = element('frame-host');
    let frame = null;
    let currentUrl = DEFAULT_URL;
    try {
      const saved = storage?.getItem(STORAGE_KEY);
      if (saved) currentUrl = validateClientUrl(saved);
    } catch (_) {
      try { storage?.removeItem(STORAGE_KEY); } catch (_) { /* Storage can be disabled. */ }
    }
    input.value = currentUrl;
    open.href = currentUrl;

    function loadClient() {
      if (!frame) {
        frame = root.ownerDocument.createElement('iframe');
        frame.title = 'Orca 原生 Web 客户端';
        frame.setAttribute('referrerpolicy', 'no-referrer');
        frame.addEventListener('load', () => {
          status.textContent = '已尝试打开客户端；连接情况请以 Orca 页面为准。';
        });
        frame.addEventListener('error', () => {
          status.textContent = '客户端页面未能打开，请检查地址或在新窗口打开。';
        });
        host.append(frame);
      }
      status.textContent = '正在打开客户端；连接状态请以 Orca 内显示为准。';
      frame.src = currentUrl;
    }

    function show(visible) {
      root.hidden = !visible;
      if (visible && !frame) loadClient();
    }

    element('form').addEventListener('submit', event => {
      event.preventDefault();
      let nextUrl;
      try { nextUrl = validateClientUrl(input.value); } catch (reason) {
        error.textContent = reason.message;
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        return;
      }
      input.removeAttribute('aria-invalid');
      error.hidden = true;
      input.value = nextUrl;
      if (nextUrl === currentUrl) return;
      currentUrl = nextUrl;
      open.href = currentUrl;
      try { storage?.setItem(STORAGE_KEY, currentUrl); } catch (_) { /* Keep the selected address for this page. */ }
      loadClient();
    });
    element('reload').addEventListener('click', loadClient);
    return {show};
  }

  const api = {create, validateClientUrl};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.OrcaSurface = api;
})(typeof window === 'undefined' ? globalThis : window);
