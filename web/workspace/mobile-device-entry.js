'use strict';
window.StudioMobileEntry = {
  mount(container, { returnHash = '#home' } = {}) {
    let disposed = false, portalRevision = 0, copying = false;
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
    const label = make('label', '账号网页地址');
    const input = make('input');
    input.type = 'text'; input.readOnly = true;
    input.spellcheck = false;
    label.append(input);
    const copy = make('button', '复制地址', 'ce-button');
    copy.type = 'button'; copy.disabled = true;
    const feedback = make('p', '', 'ce-mobile-entry-feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    const open = make('a', '网页登录 / 注册', 'ce-button');
    open.target = '_blank'; open.rel = 'noopener noreferrer';
    const actions = make('div', '', 'ce-mobile-entry-actions'); actions.append(copy, open);
    connection.append(label, actions, feedback);
    const back = make('a', returnHash === '#home' ? '返回项目总览' : returnHash === '#workbench' ? '返回工作台' : '返回原项目', 'ce-button');
    back.href = returnHash;
    const guide = make('details', '', 'ce-mobile-guide');
    guide.hidden = true;
    guide.append(make('summary', '手机访问'), connection);
    const footer = make('div', '', 'ce-mobile-entry-footer');
    footer.append(guide, back); page.append(footer);
    container.replaceChildren(page);
    const remote = Boolean(window.CERemoteContext?.context);
    const setPortal = value => {
      if (disposed) return;
      let portal = '';
      try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase();
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/remote'
          || host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(host)) throw new Error('invalid_portal');
        portal = url.href;
      } catch { /* No phone link is shown without an actual configured public portal. */ }
      if (portal === input.value) return;
      portalRevision++; input.value = portal; feedback.textContent = '';
      guide.hidden = !portal; copy.disabled = copying || !portal;
      if (portal) open.href = portal; else open.removeAttribute?.('href');
    };
    if (remote) setPortal(new URL('/remote', window.location.origin).href);
    const disposeAccount = window.StudioAccountDevice.mount(account, { mode: remote ? 'remote' : 'local', returnHash, onPortal: setPortal });
    const onCopy = async () => {
      if (disposed || copying || copy.disabled || !input.value) return;
      const revision = portalRevision, address = input.value;
      copying = true;
      copy.disabled = true; copy.setAttribute('aria-busy', 'true');
      try {
        if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('unavailable');
        await navigator.clipboard.writeText(address);
        if (!disposed && revision === portalRevision) feedback.textContent = '地址已复制';
      } catch {
        if (!disposed && revision === portalRevision) {
          feedback.textContent = '无法自动复制，请选中地址后手动复制。';
          input.focus(); input.select();
        }
      } finally { copying = false; if (!disposed) { copy.disabled = !input.value; copy.setAttribute('aria-busy', 'false'); } }
    };
    copy.addEventListener('click', onCopy);
    return () => { disposed = true; disposeAccount(); copy.removeEventListener('click', onCopy); };
  }
};
