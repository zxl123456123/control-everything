/*
 * The pet's shortcut wheel, shared by every host (the news reader and the Studio mascot) and every pet.
 * The 3D pets keep their own built-in dial for stand-alone embeds only; every in-app host turns it off (`dial:false`, no
 * `actions`) and uses this one, so the wheel looks and behaves the same everywhere and never depends on where the pet stands.
 *
 *   slotPosition() pure geometry: where a slot's angle puts its button on the ring
 *   place()        pure geometry: where the ring sits, beside the pet's resting slot (its depot), inside the viewport
 *   create()       the wheel itself: DOM, motion, keyboard and pointer handling
 *
 * Design notes
 *   - Six fixed slots (NewsPetDial.SLOTS): an action's angle belongs to the action, never to how many are available. A slot the
 *     page cannot run is greyed out in place with its reason ("仅新闻页"); nothing moves to fill the gap, so the hand learns it.
 *   - Icon first: six round 48px buttons on a ring; the name (and reason) of the active one appears once, in the hub.
 *   - Motion is transform and opacity only: the plate and the buttons spring out of the hub in a short stagger (cubic-bezier
 *     with ~5% overshoot, 32ms apart) and fold back faster on an accelerate curve; hover magnifies, press rebounds, a greyed
 *     slot shakes once instead of doing nothing. prefers-reduced-motion reduces all of it to a fade.
 *   - Keyboard (the wheel has no global hotkeys): opening from the keyboard focuses the first available slot; arrows walk the
 *     ring, Home/End jump, 1-6 pick a slot by its place (12, 2, 4, 6, 8, 10 o'clock), Enter/Space run it, Esc closes and hands
 *     focus back to the trigger. Greyed slots stay focusable so a screen reader can say why they are off (aria-disabled).
 *   - The wheel never wanders with the pet: its anchor comes from the depot element, so it opens in the same place.
 *   - Only the buttons take pointer events, so the empty ring never blocks the page underneath.
 */
(function (global) {
  'use strict';

  const ICON_SIZE = 24, BUTTON = 48, HUB_PAD = 14, PLATE_PAD = 34, GAP = 16, EDGE = 12;
  const OUTSIDE_TAP_MS = 700, NOPE_MS = 320;
  const ROOT_CLASS = 'pw-wheel';

  const CSS = `
.${ROOT_CLASS}{--pw-plate:rgba(255,253,247,.94);--pw-btn:#fffdf7;--pw-btn-pet:#fbf3dc;--pw-ink:#2e2a1e;--pw-mute:#8a8167;--pw-line:#e6dfc9;--pw-accent:#c98a00;--pw-accent-ink:#fff;--pw-shadow:0 18px 40px rgba(40,28,4,.22),0 2px 6px rgba(40,28,4,.12);--pw-spring:cubic-bezier(.34,1.56,.64,1);--pw-exit:cubic-bezier(.3,0,.8,.15);
 position:fixed;left:0;top:0;width:0;height:0;z-index:var(--pw-z,40);pointer-events:none;visibility:hidden;user-select:none;-webkit-tap-highlight-color:transparent;font:600 14px/1.3 "Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif;color:var(--pw-ink);transition:visibility 0s linear .26s}
.${ROOT_CLASS}[data-theme=dark]{--pw-plate:rgba(43,38,24,.95);--pw-btn:#3a3322;--pw-btn-pet:#453c27;--pw-ink:#f6eed6;--pw-mute:#b7ab8a;--pw-line:#4d4630;--pw-accent:#f2b83b;--pw-accent-ink:#2b2200;--pw-shadow:0 18px 40px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.35)}
.${ROOT_CLASS}[data-open=true]{visibility:visible;transition:none}
.${ROOT_CLASS} .pw-plate{position:absolute;left:0;top:0;border-radius:50%;background:var(--pw-plate);border:1px solid var(--pw-line);box-shadow:var(--pw-shadow);transform:translate(-50%,-50%) scale(.55);opacity:0;transition:transform .2s var(--pw-exit),opacity .16s ease-in,background-color .3s}
.${ROOT_CLASS}[data-open=true] .pw-plate{transform:translate(-50%,-50%) scale(1);opacity:1;transition:transform .55s var(--pw-spring),opacity .18s ease-out,background-color .3s}
.${ROOT_CLASS} .pw-item{position:absolute;left:0;top:0;width:0;height:0;transform:translate3d(0,0,0) scale(.3);opacity:0;transition:transform .18s var(--pw-exit),opacity .12s ease-in}
.${ROOT_CLASS}[data-open=true] .pw-item{transform:translate3d(var(--x),var(--y),0) scale(1);opacity:1;transition:transform .55s var(--pw-spring) calc(var(--i) * 32ms + 40ms),opacity .2s ease-out calc(var(--i) * 32ms + 40ms)}
.${ROOT_CLASS} button{position:absolute;left:0;top:0;box-sizing:border-box;width:${BUTTON}px;height:${BUTTON}px;margin:-${BUTTON / 2}px 0 0 -${BUTTON / 2}px;padding:0;border:1px solid var(--pw-line);border-radius:50%;background:var(--pw-btn);color:var(--pw-ink);display:grid;place-items:center;cursor:pointer;pointer-events:auto;touch-action:manipulation;transform:scale(1);transition:transform .45s var(--pw-spring),background-color .2s,color .2s,border-color .2s,box-shadow .25s,opacity .2s}
.${ROOT_CLASS} .pw-item[data-group=pet] button{background:var(--pw-btn-pet)}
.${ROOT_CLASS} button::after{content:"";position:absolute;inset:-6px;border-radius:50%}
.${ROOT_CLASS} button svg{width:${ICON_SIZE}px;height:${ICON_SIZE}px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.${ROOT_CLASS} button:hover,.${ROOT_CLASS} button:focus-visible,.${ROOT_CLASS} button[data-active=true]{transform:scale(1.14);background:var(--pw-accent);border-color:var(--pw-accent);color:var(--pw-accent-ink);box-shadow:0 6px 16px rgba(40,28,4,.22)}
.${ROOT_CLASS} button:focus-visible{outline:2px solid var(--pw-ink);outline-offset:3px}
.${ROOT_CLASS} button:active{transform:scale(.9);transition-duration:.07s,.2s,.2s,.2s,.25s,.2s}
.${ROOT_CLASS} button[aria-checked=true]{border-color:var(--pw-accent);box-shadow:inset 0 0 0 1.5px var(--pw-accent)}
.${ROOT_CLASS} button[aria-checked=true]::before{content:"";position:absolute;right:2px;top:2px;width:10px;height:10px;border-radius:50%;background:var(--pw-accent);border:2px solid var(--pw-btn)}
.${ROOT_CLASS} button[aria-disabled=true]{opacity:.42;cursor:not-allowed}
.${ROOT_CLASS} button[aria-disabled=true]:hover,.${ROOT_CLASS} button[aria-disabled=true]:focus-visible,.${ROOT_CLASS} button[aria-disabled=true][data-active=true]{transform:scale(1.04);background:var(--pw-btn);border-color:var(--pw-mute);color:var(--pw-ink);box-shadow:none;opacity:.7}
.${ROOT_CLASS} button[aria-disabled=true]:active{transform:scale(1)}
.${ROOT_CLASS} button[data-nope=true]{animation:pw-nope ${NOPE_MS}ms cubic-bezier(.36,.07,.19,.97)}
@keyframes pw-nope{20%{translate:-4px 0}40%{translate:4px 0}60%{translate:-3px 0}80%{translate:2px 0}}
.${ROOT_CLASS} .pw-hub{position:absolute;left:0;top:0;transform:translate(-50%,-50%);width:var(--hub);height:var(--hub);border-radius:50%;display:grid;align-content:center;justify-items:center;gap:2px;padding:${HUB_PAD}px;box-sizing:border-box;pointer-events:none;opacity:0;transition:opacity .12s}
.${ROOT_CLASS}[data-open=true] .pw-hub{opacity:1;transition:opacity .3s ease-out .16s}
.${ROOT_CLASS} .pw-label{max-width:calc(var(--hub) - 28px);text-align:center;font-size:15px;font-weight:700;letter-spacing:.01em;opacity:.55;transition:opacity .18s}
.${ROOT_CLASS} .pw-label[data-on=true]{opacity:1}
.${ROOT_CLASS} .pw-reason{min-height:1.3em;max-width:calc(var(--hub) - 28px);text-align:center;font-size:12px;font-weight:600;color:var(--pw-mute);opacity:0;transition:opacity .18s}
.${ROOT_CLASS} .pw-reason[data-on=true]{opacity:1}
@media (prefers-reduced-motion:reduce){
 .${ROOT_CLASS} .pw-plate,.${ROOT_CLASS} .pw-item,.${ROOT_CLASS} button{transition:opacity .12s!important}
 .${ROOT_CLASS} button[data-nope=true]{animation:none}
 .${ROOT_CLASS}[data-open=true] .pw-plate{transform:translate(-50%,-50%) scale(1)}
 .${ROOT_CLASS} .pw-item{transform:translate3d(var(--x),var(--y),0) scale(1)}
 .${ROOT_CLASS} button:hover,.${ROOT_CLASS} button:focus-visible,.${ROOT_CLASS} button[data-active=true],.${ROOT_CLASS} button:active{transform:none}
}`;

  /** Ring radius for a viewport width: narrow screens get a tighter ring, never smaller buttons. */
  const ringRadius = viewportWidth => (viewportWidth < 420 ? 84 : 100);

  /**
   * Where a slot's button sits relative to the ring's centre. 0 degrees is straight up, angles grow clockwise.
   * @param {number} angle degrees
   * @param {number} radius ring radius
   * @returns {{x: number, y: number}}
   */
  function slotPosition(angle, radius) {
    const rad = angle * Math.PI / 180, round = value => Math.round(value * 100) / 100;
    return {x: round(Math.sin(rad) * radius), y: round(-Math.cos(rad) * radius)};
  }

  /**
   * Where the wheel's centre goes. The wheel sits beside the pet's resting slot, on the side with more room, level with
   * the slot but clamped so the whole plate stays inside the viewport. Same input, same output: no jitter.
   * @param {{left: number, top: number, width: number, height: number}} depot the pet's resting slot in viewport pixels
   * @param {{width: number, height: number}} viewport
   * @param {number} radius ring radius
   * @returns {{x: number, y: number, side: 'left'|'right'}}
   */
  function place(depot, viewport, radius) {
    const half = radius + PLATE_PAD;
    const centreX = depot.left + depot.width / 2, centreY = depot.top + depot.height / 2;
    const side = centreX < viewport.width / 2 ? 'right' : 'left';
    const rawX = side === 'right' ? depot.left + depot.width + GAP + half : depot.left - GAP - half;
    const clamp = (value, low, high) => Math.max(low, Math.min(Math.max(low, high), value));
    return {
      x: Math.round(clamp(rawX, half + EDGE, viewport.width - half - EDGE)),
      y: Math.round(clamp(centreY, half + EDGE, viewport.height - half - EDGE)),
      side,
    };
  }

  function svgIcon(path, className) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    if (className) svg.setAttribute('class', className);
    const shape = document.createElementNS(NS, 'path'); shape.setAttribute('d', path); svg.append(shape);
    return svg;
  }

  function injectStyle() {
    if (document.getElementById('news-pet-wheel-style')) return;
    const style = document.createElement('style'); style.id = 'news-pet-wheel-style'; style.textContent = CSS;
    (document.head || document.documentElement).append(style);
  }

  /**
   * @param {object} host
   * @param {HTMLElement} host.tapTarget  element that reports `news-pet-tap` when the pet is tapped (the pet's root)
   * @param {() => (HTMLElement|{left: number, top: number, width: number, height: number}|null)} host.anchor  the pet's resting slot (an element or a viewport rect); the wheel is anchored beside it
   * @param {() => {id: string, label: string, icon: string, angle: number, group?: string, run: () => void, enabled?: boolean, reason?: string, checked?: boolean}[]} host.actions  one entry per fixed slot (NewsPetDirector.createActions)
   * @param {() => void} [host.onOpen]
   * @param {(reason: 'escape'|'outside'|'blur'|'choose'|'tap'|'api') => void} [host.onClose]
   * @param {() => HTMLElement|null} [host.returnFocus]  where focus goes when the wheel closes from the keyboard
   * @param {string} [host.ignore]  selector of triggers whose own click toggles the wheel (outside clicks on them are not "outside")
   * @param {(id: string) => void} [host.onChoose]
   */
  function create(host) {
    injectStyle();
    const root = document.createElement('div');
    root.className = ROOT_CLASS; root.dataset.open = 'false'; root.dataset.theme = pageTheme();
    root.setAttribute('role', 'menu'); root.setAttribute('aria-label', '宠物转盘'); root.hidden = false;
    const plate = document.createElement('div'); plate.className = 'pw-plate';
    const hub = document.createElement('div'); hub.className = 'pw-hub';
    const label = document.createElement('div'); label.className = 'pw-label'; label.setAttribute('aria-hidden', 'true');
    const reason = document.createElement('div'); reason.className = 'pw-reason'; reason.setAttribute('aria-hidden', 'true');
    hub.append(label, reason);
    root.append(plate, hub);
    document.body.append(root);

    let items = [], open = false, active = -1, fromKeyboard = false, frame = 0, spot = null, destroyed = false;
    let closedAt = {reason: '', time: 0};
    const now = () => (global.performance && global.performance.now ? global.performance.now() : Date.now());

    function pageTheme() { return document.documentElement.dataset.theme === 'dark' || document.documentElement.classList.contains('dark') ? 'dark' : 'light'; }
    const radius = () => ringRadius(global.innerWidth);
    const usable = entry => entry.action.enabled !== false;

    function setLabel(action) {
      label.textContent = action ? action.label : '快捷转盘'; label.dataset.on = String(Boolean(action));
      const why = action && action.enabled === false ? action.reason || '' : '';
      reason.textContent = why; reason.dataset.on = String(Boolean(why));
    }
    function setActive(index) {
      active = index;
      items.forEach((entry, i) => { entry.button.dataset.active = String(i === index); entry.button.tabIndex = i === index || (index < 0 && i === 0) ? 0 : -1; });
      setLabel(index >= 0 && items[index] ? items[index].action : null);
    }

    /** The accessible name carries the state, so a screen reader hears "搜索新闻，仅新闻页" or "安静模式，已开启". */
    function nameOf(action) {
      const state = action.enabled === false ? action.reason : typeof action.checked === 'boolean' ? (action.checked ? '已开启' : '已关闭') : '';
      return state ? `${action.label}，${state}` : action.label;
    }

    function build() {
      for (const entry of items) entry.node.remove();
      const actions = host.actions() || [];
      root.style.setProperty('--hub', (radius() - BUTTON / 2 - 10) * 2 + 'px');
      items = actions.map((action, i) => {
        const node = document.createElement('div'); node.className = 'pw-item'; node.style.setProperty('--i', String(i));
        node.setAttribute('role', 'none'); if (action.group) node.dataset.group = action.group;
        const button = document.createElement('button'); button.type = 'button'; button.dataset.id = action.id; button.setAttribute('aria-label', nameOf(action)); button.tabIndex = -1;
        if (typeof action.checked === 'boolean') { button.setAttribute('role', 'menuitemcheckbox'); button.setAttribute('aria-checked', String(action.checked)); } else button.setAttribute('role', 'menuitem');
        if (action.enabled === false) button.setAttribute('aria-disabled', 'true');
        button.append(svgIcon(action.icon)); node.append(button); root.insertBefore(node, hub);
        button.addEventListener('pointerenter', () => { if (open) setActive(i); });
        button.addEventListener('focus', () => { if (open) setActive(i); });
        button.addEventListener('pointerleave', () => { if (document.activeElement !== button) setActive(-1); });
        button.addEventListener('animationend', () => { delete button.dataset.nope; });
        button.addEventListener('click', event => { event.stopPropagation(); choose(i); });
        return {node, button, action};
      });
      setActive(-1);
    }

    /** Puts every button at its slot's own angle: the ring is the same whatever is available. */
    function arrange() {
      const r = radius();
      items.forEach(entry => { const at = slotPosition(entry.action.angle, r); entry.node.style.setProperty('--x', at.x + 'px'); entry.node.style.setProperty('--y', at.y + 'px'); });
      plate.style.left = plate.style.top = '0px'; plate.style.width = plate.style.height = (r + PLATE_PAD) * 2 + 'px';
    }

    function reposition() {
      frame = 0;
      const slot = host.anchor && host.anchor();
      const rect = slot && (typeof slot.getBoundingClientRect === 'function' ? slot.getBoundingClientRect() : slot);
      const box = rect && rect.width + rect.height > 2 ? rect : {left: global.innerWidth - 120, top: global.innerHeight - 90, width: 96, height: 60};
      spot = place(box, {width: global.innerWidth, height: global.innerHeight}, radius());
      root.style.transform = `translate3d(${spot.x}px,${spot.y}px,0)`; root.dataset.side = spot.side;
      arrange();
    }
    const schedule = () => { if (open && !frame) frame = global.requestAnimationFrame(reposition); };

    /** Runs a slot. A greyed one only shakes: the wheel stays open and nothing happens. */
    function choose(index) {
      const entry = items[index]; if (!entry) return;
      if (!usable(entry)) { entry.button.dataset.nope = 'true'; setActive(index); return; }
      const keyboard = fromKeyboard;
      try { entry.action.run(); } catch { /* an action that fails must not leave the wheel half open */ }
      host.onChoose && host.onChoose(entry.action.id);
      close('choose', keyboard);
    }

    function openWheel(focus) {
      if (destroyed) return false;
      if (open) { if (focus) focusItem(firstUsable()); return true; }
      build(); if (!items.length) return false;
      reposition(); open = true; fromKeyboard = Boolean(focus); root.dataset.theme = pageTheme(); root.dataset.open = 'true';
      document.addEventListener('pointerdown', onOutside, true); document.addEventListener('keydown', onKey, true); document.addEventListener('focusin', onFocusIn, true);
      global.addEventListener('resize', schedule); global.addEventListener('scroll', schedule, true);
      if (focus) focusItem(firstUsable());
      host.onOpen && host.onOpen();
      return true;
    }
    const firstUsable = () => Math.max(0, items.findIndex(usable));
    function focusItem(index) { const entry = items[((index % items.length) + items.length) % items.length]; if (entry) entry.button.focus({preventScroll: true}); }

    function close(reason = 'api', toTrigger = false) {
      if (!open) return false;
      open = false; root.dataset.open = 'false'; closedAt = {reason, time: now()};
      document.removeEventListener('pointerdown', onOutside, true); document.removeEventListener('keydown', onKey, true); document.removeEventListener('focusin', onFocusIn, true);
      global.removeEventListener('resize', schedule); global.removeEventListener('scroll', schedule, true);
      if (frame) { global.cancelAnimationFrame(frame); frame = 0; }
      if (root.contains(document.activeElement)) { const back = (toTrigger || reason === 'escape') && host.returnFocus && host.returnFocus(); if (back) back.focus({preventScroll: true}); else document.activeElement.blur(); }
      fromKeyboard = false; setActive(-1);
      host.onClose && host.onClose(reason);
      return true;
    }

    function isInside(event) {
      return event.composedPath().some(node => node === root || node === host.tapTarget || host.ignore && node.matches?.(host.ignore));
    }
    function onOutside(event) { if (!isInside(event)) close('outside'); }
    function onFocusIn(event) { if (event.target !== document.body && !isInside(event)) close('blur'); }
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close('escape', true); return; }
      if (!root.contains(document.activeElement) || event.altKey || event.ctrlKey || event.metaKey) return;
      const here = items.findIndex(entry => entry.button === document.activeElement);
      const move = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[event.key], digit = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1;
      if (move && here >= 0) { event.preventDefault(); fromKeyboard = true; focusItem(here + move); }
      else if (event.key === 'Home') { event.preventDefault(); focusItem(0); }
      else if (event.key === 'End') { event.preventDefault(); focusItem(items.length - 1); }
      else if (digit >= 0 && digit < items.length) { event.preventDefault(); fromKeyboard = true; focusItem(digit); choose(digit); }
    }

    const onTap = event => {
      if (event.detail && event.detail.double) { close('tap'); return; }
      if (open) close('tap');
      else if (closedAt.reason === 'outside' && now() - closedAt.time < OUTSIDE_TAP_MS) closedAt = {reason: '', time: 0}; // the press that closed it was this tap
      else openWheel(false);
    };
    host.tapTarget && host.tapTarget.addEventListener('news-pet-tap', onTap);
    const themeObserver = typeof MutationObserver === 'function' ? new MutationObserver(() => { root.dataset.theme = pageTheme(); }) : null;
    if (themeObserver) themeObserver.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme', 'class']});

    const api = {
      open: focus => openWheel(Boolean(focus)),
      close: reason => close(reason || 'api'),
      toggle: focus => (open ? close('api') : openWheel(Boolean(focus))),
      isOpen: () => open,
      /** Re-reads the actions from the host (a page change greys other slots); keeps the wheel open when it was. */
      refresh() { if (destroyed) return; build(); if (open && !items.length) close('api'); else if (open) reposition(); },
      destroy() {
        if (destroyed) return; close('api'); destroyed = true;
        host.tapTarget && host.tapTarget.removeEventListener('news-pet-tap', onTap); themeObserver && themeObserver.disconnect(); root.remove();
      },
      inspect: () => ({open, side: spot && spot.side, x: spot && spot.x, y: spot && spot.y, count: items.length, active, label: label.textContent, reason: reason.textContent, ids: items.map(entry => entry.action.id)}),
      element: root,
    };
    setLabel(null);
    return api;
  }

  global.NewsPetWheel = Object.freeze({create, place, slotPosition, ringRadius, BUTTON, PLATE_PAD});
})(window);
