/* Pet registry for the news reader. Every pet implements the NewsSpider mount contract:
 * mount({root, canvas, depot, onCapture, onDelivered, onCancel, followPointer, actions, onAction, dock, options, styleNonce}) ->
 * `actions` are [{id,label,icon?,run}] for the click-to-open radial dial; `dock()` may return {x,y} (stage coords) = where the pet rests clear of the text.
 * {pointAt, capture, cancel, setCollecting, pause, resume, setOptions, inspect, destroy, setStatus}. */
(function (global) {
  'use strict';
  const pets = new Map();
  const METHODS = ['pointAt', 'capture', 'cancel', 'setCollecting', 'pause', 'resume', 'setOptions', 'inspect', 'destroy'];
  function register(name, definition) {
    const key = String(name || '').trim();
    if (!/^[a-z][a-z0-9-]*$/.test(key)) throw new TypeError('invalid pet name');
    if (!definition || typeof definition.mount !== 'function') throw new TypeError('pet needs mount()');
    pets.set(key, {name: key, label: String(definition.label || key), mount: definition.mount});
    return key;
  }
  function mount(name, options) {
    const pet = pets.get(name);
    if (!pet) throw new Error('unknown pet: ' + name);
    const api = pet.mount(options);
    for (const method of METHODS) if (typeof api[method] !== 'function') throw new TypeError(pet.name + ' is missing ' + method + '()');
    if (typeof api.setStatus !== 'function') api.setStatus = () => {};
    return api;
  }
  // Heavier pets are lazy: the script is injected (same-origin, CSP script-src 'self') only when that pet is picked.
  // mount() stays synchronous: the proxy queues calls until the script arrives, then replays them on the real pet.
  const LAZY_API = ['pointAt', 'capture', 'cancel', 'setCollecting', 'pause', 'resume', 'setOptions', 'setStatus', 'poke', 'step', 'setActions', 'openMenu', 'closeMenu', 'toggleMenu'];
  const loading = new Map();
  // Lazy scripts are resolved next to this file (works under a sub-path or a WebView virtual host); '/' when the base is unknown.
  const BASE = (() => { try { const cur = document.currentScript; return cur && cur.src ? cur.src.replace(/[^/]*$/, '') : '/'; } catch (e) { return '/'; } })();
  function loadScript(src) {
    src = /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(src) ? src : BASE + src;
    if (!loading.has(src)) {
      loading.set(src, new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src; el.async = true; el.onload = () => resolve(); el.onerror = () => { loading.delete(src); el.remove(); reject(new Error('failed to load ' + src)); };
        document.head.appendChild(el);
      }));
    }
    return loading.get(src);
  }
  function lazy(globalName, src, fallback) {
    return options => {
      if (global[globalName]) return global[globalName].mount(options);
      const calls = [];
      let real = null, dead = false, state = 'loading';
      const proxy = {};
      for (const method of LAZY_API) proxy[method] = (...args) => {
        if (real) return typeof real[method] === 'function' ? real[method](...args) : undefined;
        if (dead) return false;
        if (method === 'pause' || method === 'resume') { for (let i = calls.length - 1; i >= 0; i--) if (calls[i][0] === 'pause' || calls[i][0] === 'resume') calls.splice(i, 1); }
        calls.push([method, args]); return method === 'capture' || method === 'pointAt' || method === 'poke' ? true : undefined;
      };
      proxy.inspect = () => real ? real.inspect() : {pet: name(), loading: state === 'loading', state, running: false, destroyed: dead, renderer: 'none'};
      proxy.destroy = () => { if (real) return real.destroy(); dead = true; calls.length = 0; };
      const name = () => globalName;
      loadScript(src).then(() => {
        if (dead) return;
        real = global[globalName].mount(options); state = 'ready';
        for (const [method, args] of calls.splice(0)) { try { if (typeof real[method] === 'function') real[method](...args); } catch (e) { /* replay is best-effort */ } }
      }).catch(() => {
        if (dead) return;
        state = 'failed';
        const fb = [].concat(fallback || []).find(n => pets.has(n)); if (fb) { real = pets.get(fb).mount(options); for (const [method, args] of calls.splice(0)) { try { if (typeof real[method] === 'function') real[method](...args); } catch (e) { /* ignore */ } } }
      });
      return proxy;
    };
  }
  const list = () => [...pets.values()].map(pet => ({name: pet.name, label: pet.label}));
  if (global.NewsSpider) register('spider', {label: '蜘蛛', mount: options => global.NewsSpider.mount(options)});
  register('naidragon', {label: '奶龙', mount: lazy('NewsNaidragon', 'news-naidragon.js', ['spider'])});
  global.NewsPets = Object.freeze({register, mount, list});
})(window);
