const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../web/workspace/ui-dialog.js'), 'utf8');
const stylesheet = fs.readFileSync(path.join(__dirname, '../../web/workspace/workspace.css'), 'utf8');

// Deliberately synthetic DOM: native top-layer, focus trapping and IME need browser evidence.
function environment({guard = 'allow', context = null} = {}) {
  const created = [], errors = [], observers = [], focused = [];
  const document = {nodeType: 9, parentNode: null, isConnected: true, activeElement: null};
  class Node {
    constructor(tag, nodeType = 1) {
      this.tagName = tag.toUpperCase(); this.nodeType = nodeType; this.parentNode = null;
      this.children = []; this.attributes = new Map(); this.listeners = new Map();
      this.dataset = {}; this.style = {}; this.textContent = ''; this.hidden = false; this.inert = false;
      this.open = false; this.closeCalls = 0; this.disabled = false;
      created.push(this);
    }
    get isConnected() { return Boolean(this.parentNode?.isConnected || this.host?.isConnected); }
    get tabIndex() { return this.attributes.has('tabindex') ? Number(this.getAttribute('tabindex')) : this.tagName === 'BUTTON' ? 0 : -1; }
    set innerHTML(_) { throw new Error('HTML injection is forbidden'); }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    removeAttribute(key) { this.attributes.delete(key); }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
    getRootNode() { let node = this; while (node.parentNode) node = node.parentNode; return node; }
    attachShadow() { const root = new Node('#shadow-root', 11); root.host = this; this.shadowRoot = root; return root; }
    querySelector(selector) {
      function matches(node) {
        return selector.split(',').some(part => {
          part = part.trim();
          return part === 'h1' && node.tagName === 'H1' || part === 'h2' && node.tagName === 'H2' || part === '[role="heading"]' && node.getAttribute('role') === 'heading' || part === '[data-dialog-focus-fallback]' && 'dialogFocusFallback' in node.dataset;
        });
      }
      for (const child of this.children) { if (matches(child)) return child; const found = child.querySelector(selector); if (found) return found; }
      return null;
    }
    addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    focus() {
      focused.push(this);
      let node = this, root = node.getRootNode();
      while (root.nodeType === 11) { root.activeElement = node; node = root.host; root = node.getRootNode(); }
      document.activeElement = node;
    }
    showModal() { if (guard === 'throw') throw new Error('host modal guard denied'); if (guard !== 'silent') this.open = true; }
    close() { this.closeCalls++; this.open = false; dispatch(this, 'close'); }
    getBoundingClientRect() { return {left: 100, right: 540, top: 100, bottom: 400}; }
  }
  document.createElement = tag => new Node(tag);
  document.documentElement = new Node('html'); document.documentElement.parentNode = document;
  document.children = [document.documentElement]; document.body = new Node('body'); document.documentElement.append(document.body);
  const window = {
    document, CERemoteContext: context,
    console: {error: (...args) => errors.push(args)},
    confirm() { throw new Error('native confirmation fallback is forbidden'); },
    getComputedStyle: node => ({display: node.style.display || 'block', visibility: node.style.visibility || 'visible'}),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.active = true; this.targets = new Set(); observers.push(this); }
      observe(target) { this.targets.add(target); }
      disconnect() { this.active = false; }
    }
  };
  function dispatch(target, type, properties = {}) {
    const event = {target, type, defaultPrevented: false, stopped: false, ...properties,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }};
    const route = [];
    for (let node = target; node; node = node.parentNode || node.host) route.push(node);
    for (const node of route) {
      for (const listener of [...(node.listeners?.get(type) || [])]) listener(event);
      if (event.stopped) break;
    }
    return event;
  }
  vm.runInNewContext(source, {window});
  const node = tag => document.createElement(tag);
  function parts() {
    const dialog = created.findLast(item => item.tagName === 'DIALOG' && item.isConnected && item.className === 'ce-ui-confirm');
    return {dialog, cancel: dialog?.children[2].children[0], accept: dialog?.children[2].children[1], close: dialog?.children[0].children[1]};
  }
  return {api: window.CEUIDialog, document, node, dispatch, parts, created, errors, observers, focused,
    flushMutations(target) { for (const observer of observers) if (observer.active && observer.targets.has(target)) observer.callback(); }};
}

const question = {title: '解除关联', message: '解除当前关联？外部聊天及其内容会保留。'};

test('confirmation uses text content and named alertdialog; cancellation receives initial focus', async () => {
  const env = environment(), controller = env.api.create();
  const result = controller.confirm({title: '<img src=x>', message: '<script>write()</script>\n真实后果'});
  const {dialog, cancel, accept} = env.parts();
  assert.equal(dialog.getAttribute('role'), 'alertdialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(dialog.children[0].children[0].textContent, '<img src=x>');
  assert.equal(dialog.children[1].textContent, '<script>write()</script>\n真实后果');
  assert.equal(env.document.activeElement, cancel);
  assert.equal(cancel.autofocus, true);
  assert.equal(accept.type, 'button');
  assert.equal(env.created.some(node => node.tagName === 'STYLE'), false, 'confirmation uses the existing CSP-approved stylesheet');
  assert.match(stylesheet, /:is\(body,#ce-studio\) dialog\.ce-ui-confirm\[role='alertdialog'\]/);
  assert.match(stylesheet, /width:min\(440px/);
  env.dispatch(accept, 'click');
  env.dispatch(accept, 'click');
  assert.equal(await result, true);
  assert.equal(dialog.closeCalls, 1);
  assert.equal(dialog.isConnected, false);
  assert.equal([...dialog.listeners.values()].every(set => set.size === 0), true);
  controller.dispose();
});

test('cancel, X, cancel event, Escape and backdrop all take the false close path', async () => {
  for (const action of ['cancel', 'close', 'native-cancel', 'escape', 'backdrop']) {
    const env = environment(), controller = env.api.create(), result = controller.confirm(question);
    const nodes = env.parts();
    if (action === 'cancel' || action === 'close') env.dispatch(nodes[action], 'click');
    if (action === 'native-cancel') assert.equal(env.dispatch(nodes.dialog, 'cancel').defaultPrevented, true);
    if (action === 'escape') {
      const event = env.dispatch(nodes.cancel, 'keydown', {key: 'Escape'});
      assert.equal(event.defaultPrevented, true); assert.equal(event.stopped, true);
    }
    if (action === 'backdrop') {
      env.dispatch(nodes.dialog, 'pointerdown', {clientX: 50, clientY: 50});
      env.dispatch(nodes.dialog, 'click', {clientX: 50, clientY: 50});
    }
    assert.equal(await result, false, action);
    assert.equal(nodes.dialog.closeCalls, 1, action);
    controller.dispose();
  }
});

test('a drag beginning in the body does not become a backdrop cancellation', async () => {
  const env = environment(), controller = env.api.create(), result = controller.confirm(question), {dialog, cancel} = env.parts();
  env.dispatch(dialog, 'pointerdown', {clientX: 200, clientY: 200});
  env.dispatch(dialog, 'click', {clientX: 50, clientY: 50});
  assert.equal(dialog.open, true);
  env.dispatch(cancel, 'click'); assert.equal(await result, false);
});

test('the first Escape belongs to this modal; a later Escape can still reach the original parent', async () => {
  const env = environment(), parent = env.node('dialog'); parent.open = true; env.document.body.append(parent);
  let parentEscapes = 0;
  parent.addEventListener('keydown', event => { if (event.key === 'Escape') { parentEscapes++; parent.close(); } });
  const controller = env.api.create({root: parent}), result = controller.confirm(question), {cancel} = env.parts();
  env.dispatch(cancel, 'keydown', {key: 'Escape'});
  assert.equal(await result, false);
  assert.equal(parent.open, true); assert.equal(parentEscapes, 0);
  env.dispatch(parent, 'keydown', {key: 'Escape'});
  assert.equal(parentEscapes, 1); assert.equal(parent.closeCalls, 1);
  controller.dispose();
});

test('IME composition and keyCode 229 keep confirmation open', async () => {
  const env = environment(), controller = env.api.create(), result = controller.confirm(question), {dialog, cancel} = env.parts();
  env.dispatch(cancel, 'keydown', {key: 'Escape', keyCode: 229});
  assert.equal(dialog.open, true);
  env.dispatch(dialog, 'compositionstart');
  env.dispatch(dialog, 'cancel');
  env.dispatch(cancel, 'keydown', {key: 'Escape', isComposing: true});
  assert.equal(dialog.open, true);
  env.dispatch(dialog, 'compositionend'); env.dispatch(cancel, 'keydown', {key: 'Escape'});
  assert.equal(await result, false);
});

test('a duplicate request returns false rather than sharing true or creating a queue', async () => {
  const env = environment(), first = env.api.create(), secondRoot = env.node('section'); env.document.body.append(secondRoot);
  const second = env.api.create({root: secondRoot}), pending = first.confirm(question);
  assert.equal(await first.confirm(question), false);
  assert.equal(await second.confirm(question), false);
  assert.equal(env.created.filter(node => node.tagName === 'DIALOG').length, 1);
  env.dispatch(env.parts().accept, 'click'); assert.equal(await pending, true);
  const next = second.confirm(question); assert.equal(env.parts().dialog.parentNode, secondRoot);
  env.dispatch(env.parts().cancel, 'click'); assert.equal(await next, false);
  first.dispose(); second.dispose();
});

test('showModal exception or a silent denial resolves false with an observable error', async () => {
  for (const guard of ['throw', 'silent']) {
    const env = environment({guard}), seen = [], controller = env.api.create({onError: error => seen.push(error.message)});
    assert.equal(await controller.confirm(question), false);
    assert.equal(seen.length, 1); assert(controller.error);
    assert.equal(env.errors.length, 1);
    assert.equal(env.parts().dialog, undefined);
    controller.dispose();
  }
});

test('dispose and context retirement resolve false and remove only owned nodes and listeners', async () => {
  for (const reason of ['dispose', 'context']) {
    let retire, unsubscribed = 0;
    const context = {assertActive() {}, onInactive(callback) { retire = callback; return () => { unsubscribed++; }; }};
    const env = environment({context}), other = env.node('dialog'); other.open = true; env.document.body.append(other);
    const controller = env.api.create(), result = controller.confirm(question), {dialog, accept} = env.parts();
    if (reason === 'dispose') controller.dispose(); else retire();
    env.dispatch(accept, 'click');
    assert.equal(await result, false);
    assert.equal(dialog.isConnected, false);
    assert.equal(other.open, true); assert.equal(other.isConnected, true);
    assert.equal(env.observers.every(observer => !observer.active), true);
    assert.equal(unsubscribed, 1);
    assert.equal(await controller.confirm(question), false);
  }
});

test('hidden, inert or disconnected owners and targets retire pending confirmations', async () => {
  for (const reason of ['hidden-owner', 'inert-target', 'removed-owner', 'late-accept']) {
    const env = environment(), owner = env.node('section'), target = env.node('div'); env.document.body.append(owner, target);
    const controller = env.api.create({root: target, owner}), result = controller.confirm(question), {accept} = env.parts();
    if (reason === 'inert-target') target.inert = true;
    else if (reason === 'removed-owner') owner.remove();
    else owner.hidden = true;
    if (reason === 'late-accept') env.dispatch(accept, 'click');
    else env.flushMutations(reason === 'removed-owner' ? env.document.body : reason === 'inert-target' ? target : owner);
    assert.equal(await result, false, reason);
    assert.equal(env.parts().dialog, undefined);
    controller.dispose();
  }
});

test('deep activeElement in nested Shadow roots is restored within its owner', async () => {
  const env = environment(), host = env.node('div'); env.document.body.append(host);
  const shadow = host.attachShadow(), innerHost = env.node('div'); shadow.append(innerHost);
  const inner = innerHost.attachShadow(), owner = env.node('section'), target = env.node('div'), trigger = env.node('button');
  inner.append(owner); owner.append(trigger); env.document.body.append(target); trigger.focus();
  assert.equal(env.document.activeElement, host);
  const controller = env.api.create({root: target, owner}), result = controller.confirm(question);
  env.dispatch(env.parts().cancel, 'click'); assert.equal(await result, false);
  assert.equal(env.focused.at(-1), trigger); assert.equal(inner.activeElement, trigger);
  controller.dispose();
});

test('display:contents targets remain usable and a hidden Shadow host retires its owner', async () => {
  const env = environment(), host = env.node('div'), target = env.node('div'); env.document.body.append(host, target);
  target.style.display = 'contents';
  const shadow = host.attachShadow(), owner = env.node('section'); shadow.append(owner);
  const controller = env.api.create({root: target, owner}), result = controller.confirm(question);
  assert.equal(env.parts().dialog.open, true);
  host.hidden = true; env.flushMutations(host);
  assert.equal(await result, false);
  assert.equal(env.parts().dialog, undefined);
  controller.dispose();
});

test('already inactive context resolves false without creating a stale dialog', async () => {
  const context = {assertActive() { throw new Error('remote_context_inactive'); }, onInactive(callback) { callback(); return () => {}; }};
  const env = environment({context}), controller = env.api.create();
  assert.equal(await controller.confirm(question), false);
  assert.equal(env.created.some(node => node.tagName === 'DIALOG'), false);
});

test('an invalid or foreign trigger restores only the corresponding owner heading', async () => {
  for (const invalid of ['removed', 'foreign', 'inert']) {
    const env = environment(), owner = env.node('section'), other = env.node('section'), heading = env.node('h1'), trigger = env.node('button');
    env.document.body.append(owner, other); owner.append(heading); (invalid === 'foreign' ? other : owner).append(trigger);
    const controller = env.api.create({root: owner, owner, fallback: heading}), result = controller.confirm({...question, trigger});
    if (invalid === 'removed') trigger.remove();
    if (invalid === 'inert') trigger.inert = true;
    env.dispatch(env.parts().cancel, 'click'); assert.equal(await result, false);
    assert.equal(env.focused.at(-1), heading, invalid);
    assert.equal(heading.getAttribute('tabindex'), null);
    controller.dispose();
  }
});

test('disposing another root cannot cancel the active owner and missing consequences cannot open', async () => {
  const env = environment(), first = env.api.create(), other = env.api.create(), result = first.confirm(question);
  other.dispose(); assert.equal(env.parts().dialog.open, true);
  env.dispatch(env.parts().cancel, 'click'); assert.equal(await result, false);
  assert.equal(await first.confirm({title: '确认'}), false);
  assert.match(first.error.message, /后果说明/);
  first.dispose();
});
