/* Standalone entry; account state belongs to the mounted component. */
(function () {
  'use strict';
  const toggle = document.querySelector('[data-theme-toggle]');
  const status = document.querySelector('[data-theme-error]');
  let dispose, theme, unmountTheme, started = false, initialTheme = window.CEUITheme?.pageTheme;
  function start() {
    if (started || window.CERemoteContext?.active === false) return;
    started = true; theme = initialTheme || window.CEUITheme?.earlyRead('ce.account.theme'); initialTheme = null;
    if (theme) {
      toggle.disabled = false;
      unmountTheme = theme.mount({roots: [document.body], toggles: [toggle], status,
        aliases: {'--ce-surface':'--ce-panel', '--ce-muted':'--ce-sub', '--ce-accent':'--ce-primary', '--ce-on-accent':'--ce-on-primary'}});
    } else {
      toggle.disabled = true; status.hidden = false;
      status.textContent = '主题资源未加载，请刷新后重试。';
    }
    if (window.StudioAccountDevice) {
      dispose = window.StudioAccountDevice.mount(document.querySelector('[data-account-root]'), {mode: 'local'});
    } else {
      status.hidden = false; status.textContent = '账号与设备资源未加载，请刷新后重试。';
    }
  }
  function stop() {
    started = false;
    dispose?.(); dispose = null;
    unmountTheme?.(); unmountTheme = null; theme?.dispose(); theme = null;
  }
  start();
  window.CERemoteContext?.onInactive(stop);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
})();
