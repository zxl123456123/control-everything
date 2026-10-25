/* Standalone entry; account state belongs to the mounted component. */
(function () {
  'use strict';
  const toggle = document.querySelector('[data-theme-toggle]');
  const preference = 'ce.account.theme';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let selected;
  try { selected = localStorage.getItem(preference); } catch { /* Optional appearance preference. */ }
  function applyTheme() {
    const dark = selected ? selected === 'dark' : media.matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    toggle.textContent = dark ? '浅色模式' : '深色模式';
    toggle.setAttribute('aria-label', '切换到' + toggle.textContent);
  }
  function changeTheme() {
    selected = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(preference, selected); } catch { /* Appearance remains usable without storage. */ }
    applyTheme();
  }
  let dispose;
  function start() {
    if (dispose) return;
    applyTheme(); toggle.addEventListener('click', changeTheme); media.addEventListener('change', applyTheme);
    dispose = window.StudioAccountDevice.mount(document.querySelector('[data-account-root]'), {mode:'remote'});
  }
  function stop() {
    dispose?.(); dispose = null;
    toggle.removeEventListener('click', changeTheme); media.removeEventListener('change', applyTheme);
  }
  start();
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
})();
