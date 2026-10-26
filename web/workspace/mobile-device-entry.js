'use strict';
window.StudioMobileEntry = {
  mount(container, { returnHash = '#home' } = {}) {
    let disposed = false;
    const make = (tag, text, className) => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    const page = make('section', '', 'ce-mobile-entry');
    const account = make('div', '', 'ce-mobile-account');
    page.append(account);
    const connection = make('section', '', 'ce-mobile-entry-card');
    connection.append(make('h2', '浏览器访问地址'));
    const address = new URL('/studio', window.location.origin);
    const label = make('label', '当前服务入口');
    const input = make('input');
    input.type = 'text'; input.readOnly = true; input.value = address.href;
    input.spellcheck = false;
    label.append(input);
    const copy = make('button', '复制地址', 'ce-button');
    copy.type = 'button';
    const feedback = make('p', '', 'ce-mobile-entry-feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    const hostname = address.hostname.toLowerCase();
    const loopback = hostname === 'localhost' || hostname.endsWith('.localhost')
      || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname);
    connection.append(label, copy, feedback, make('p', loopback
      ? '这是本机地址，在手机上打开会指向手机自身；请使用已配置的手机可访问地址。'
      : '请先确认手机可访问此地址。当前浏览器地址不代表手机已经能够连接。', 'ce-mobile-entry-note'));
    connection.append(make('p', '使用手机浏览器访问；当前未提供原生手机安装包。', 'ce-mobile-entry-note'));
    const back = make('a', returnHash === '#home' ? '返回项目总览' : '返回原项目', 'ce-button');
    back.href = returnHash;
    const guide = make('details', '', 'ce-mobile-guide');
    guide.append(make('summary', '手机访问'), connection);
    const footer = make('div', '', 'ce-mobile-entry-footer');
    footer.append(guide, back); page.append(footer);
    container.replaceChildren(page);
    const disposeAccount = window.StudioAccountDevice.mount(account, {
      mode: window.CERemoteContext?.context ? 'remote' : 'local', returnHash
    });
    const onCopy = async () => {
      if (disposed || copy.disabled) return;
      copy.disabled = true; copy.setAttribute('aria-busy', 'true');
      try {
        if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('unavailable');
        await navigator.clipboard.writeText(address.href);
        if (!disposed) feedback.textContent = '地址已复制';
      } catch {
        if (!disposed) {
          feedback.textContent = '无法自动复制，请选中地址后手动复制。';
          input.focus(); input.select();
        }
      } finally { if (!disposed) { copy.disabled = false; copy.setAttribute('aria-busy', 'false'); } }
    };
    copy.addEventListener('click', onCopy);
    return () => { disposeAccount(); disposed = true; copy.removeEventListener('click', onCopy); };
  }
};
