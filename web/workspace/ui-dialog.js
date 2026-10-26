/* Boolean confirmation only; callers retain permissions, drafts and business writes. */
(function (scope) {
  'use strict';
  if (scope.CEUIDialog) return;
  const document = scope.document;
  let activeRequest = null;
  let sequence = 0;

  const parent = node => node?.parentNode || node?.host || null;
  function within(node, owner) {
    for (; node; node = parent(node)) if (node === owner) return true;
    return false;
  }
  function usable(node) {
    if (!node?.isConnected) return false;
    for (let current = node; current; current = parent(current)) {
      if (current.nodeType !== 1) continue;
      if (current.hidden || current.inert || current.getAttribute('aria-hidden') === 'true') return false;
      const style = scope.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }
  function deepFocus() {
    let node = document.activeElement;
    while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
    return node;
  }

  function create({root = document.body, owner = root, fallback = null, onError} = {}) {
    const context = scope.CERemoteContext || null;
    let disposed = false;
    let pending = null;
    let error = null;
    let unsubscribeContext;

    function report(cause) {
      error = cause;
      scope.console?.error('CEUIDialog:', cause);
      try { onError?.(cause); } catch (callbackError) { scope.console?.error('CEUIDialog error handler:', callbackError); }
    }
    function restoreFocus(trigger) {
      const candidates = [trigger, fallback, owner.querySelector?.('[data-dialog-focus-fallback], h1, h2, [role="heading"]')];
      let target = candidates.find(node => within(node, owner) && usable(node) && !node.disabled && typeof node.focus === 'function');
      if (!target) target = owner.host || owner;
      if (!usable(target) || typeof target.focus !== 'function') return;
      const previous = target.getAttribute('tabindex');
      if (target.tabIndex < 0) target.setAttribute('tabindex', '-1');
      target.focus({preventScroll: true});
      if (previous === null) target.removeAttribute('tabindex');
      else target.setAttribute('tabindex', previous);
    }

    function confirm({title, message, trigger = deepFocus()} = {}) {
      if (disposed || activeRequest) return Promise.resolve(false);
      try {
        context?.assertActive();
        if (!usable(root) || !usable(owner)) throw new Error('确认操作所属页面已失效');
        if (typeof title !== 'string' || !title.trim() || typeof message !== 'string' || !message.trim()) throw new Error('确认操作缺少标题或后果说明');
      } catch (cause) { report(cause); return Promise.resolve(false); }
      error = null;
      return new Promise(resolve => {
        const dialog = document.createElement('dialog');
        dialog.className = 'ce-ui-confirm';
        dialog.setAttribute('role', 'alertdialog');
        dialog.setAttribute('aria-modal', 'true');
        const id = 'ce-ui-confirm-' + ++sequence;
        dialog.id = id;
        dialog.setAttribute('aria-labelledby', id + '-title');
        dialog.setAttribute('aria-describedby', id + '-message');
        const header = document.createElement('div'); header.className = 'ce-ui-confirm-header';
        const heading = document.createElement('h2'); heading.id = id + '-title'; heading.textContent = title;
        const description = document.createElement('p'); description.id = id + '-message'; description.textContent = message;
        const actions = document.createElement('div'); actions.className = 'ce-ui-confirm-actions';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消'; cancel.autofocus = true;
        const accept = document.createElement('button'); accept.type = 'button'; accept.textContent = '确认'; accept.dataset.confirm = '';
        const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.dataset.close = ''; close.setAttribute('aria-label', '取消并关闭');
        header.append(heading, close); actions.append(cancel, accept); dialog.append(header, description, actions);
        const removals = [];
        let settled = false, composing = false, backdropDown = false, observer;
        const request = {finish};
        pending = activeRequest = request;

        function listen(node, name, handler) {
          node.addEventListener(name, handler);
          removals.push(() => node.removeEventListener(name, handler));
        }
        function finish(accepted = false) {
          if (settled) return;
          if (accepted) {
            try {
              context?.assertActive();
              if (disposed || !usable(root) || !usable(owner)) throw new Error('确认操作所属页面已失效');
            } catch (cause) { accepted = false; report(cause); }
          }
          settled = true;
          observer?.disconnect();
          for (const remove of removals) remove();
          if (activeRequest === request) activeRequest = null;
          pending = null;
          try { if (dialog.open) dialog.close(); } catch (cause) { accepted = false; report(cause); }
          dialog.remove();
          if (!disposed && usable(owner)) restoreFocus(trigger);
          resolve(accepted === true);
        }
        const requestClose = () => finish(false);
        listen(cancel, 'click', requestClose);
        listen(close, 'click', requestClose);
        listen(accept, 'click', () => finish(true));
        listen(dialog, 'close', requestClose);
        listen(dialog, 'compositionstart', () => { composing = true; });
        listen(dialog, 'compositionend', () => { composing = false; });
        listen(dialog, 'cancel', event => {
          event.preventDefault(); event.stopPropagation();
          if (!composing) requestClose();
        });
        listen(dialog, 'keydown', event => {
          if (event.key !== 'Escape') return;
          event.preventDefault(); event.stopPropagation();
          if (!composing && !event.isComposing && event.keyCode !== 229) requestClose();
        });
        const outside = event => {
          const bounds = dialog.getBoundingClientRect();
          return event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
        };
        listen(dialog, 'pointerdown', event => { backdropDown = outside(event); });
        listen(dialog, 'click', event => { if (backdropDown && outside(event)) requestClose(); backdropDown = false; });

        try {
          root.append(dialog);
          dialog.showModal();
          if (!dialog.open) throw new Error('确认弹层未获准打开');
          cancel.focus({preventScroll: true});
          // Observe only ownership ancestors, including Shadow hosts, while this request exists.
          observer = new scope.MutationObserver(() => {
            if (!usable(root) || !usable(owner)) requestClose();
          });
          const targets = new Set();
          for (const start of [root, owner]) for (let node = start; node; node = parent(node)) targets.add(node);
          for (const target of targets) observer.observe(target, {childList: true, attributes: true, attributeFilter: ['hidden', 'inert', 'aria-hidden', 'class', 'style']});
        } catch (cause) { report(cause); finish(false); }
      });
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      pending?.finish(false);
      unsubscribeContext?.();
    }
    unsubscribeContext = context?.onInactive(dispose);
    return Object.freeze({confirm, dispose, get error() { return error; }});
  }

  scope.CEUIDialog = Object.freeze({create});
})(window);
