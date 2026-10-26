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
    const steps = make('section', '', 'ce-mobile-entry-card');
    const list = make('ol');
    for (const text of ['确认手机已能访问你配置的服务地址。', '在 iPhone Safari 中打开该地址，进入 /studio 工作台。', '选择项目，使用现有项目工作区；本页仅提供接入说明。']) list.append(make('li', text));
    steps.append(make('h2', '在 iPhone 上使用'), list);
    const capabilities = make('section', '', 'ce-mobile-entry-card');
    capabilities.append(make('h2', '浏览器与独立 App'), make('p', 'iPhone Safari 与 Android 浏览器使用同一个自建网站。Windows 软件中确认账号后绑定电脑。原生 iOS、Android 安装包当前未交付；网站可用不代表原生安装与真机登录已经验证。'));
    const back = make('a', returnHash === '#home' ? '返回项目总览' : '返回原项目', 'ce-button');
    back.href = returnHash;
    const guide = make('details', '', 'ce-mobile-guide');
    guide.append(make('summary', '在手机浏览器中使用'), connection, steps, capabilities);
    page.append(guide, back);
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
