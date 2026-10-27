/*
 * The pet's shortcut wheel, shared by every host (the news reader and the Studio mascot) and every pet.
 * The 3D pets keep their own built-in dial for stand-alone embeds only; every in-app host turns it off (`dial:false`, no
 * `actions`) and uses this one, so the wheel looks and behaves the same everywhere and never depends on where the pet stands.
 *
 *   place()    pure geometry: where the ring sits, beside the pet's resting slot (its depot), inside the viewport
 *   placeRail() pure geometry of the pinned layout: a slim vertical rail on the pet's side of the screen
 *   create()   the wheel itself: DOM, motion, keyboard, pointer handling, pinning
 *
 * Design notes
 *   - Icon first: six round 48px buttons on a ring; the name of the active one appears once, in the hub.
 *   - Motion is transform and opacity only: the plate and the buttons spring out of the hub in a short stagger and
 *     fold back faster; hover magnifies, press rebounds. prefers-reduced-motion reduces all of it to a fade.
 *   - The wheel never wanders with the pet: its anchor comes from the depot element, so it opens in the same place.
 *   - Pinned: the wheel stays open after an action and ignores clicks elsewhere; Esc, the pet or the trigger closes it.
 *     A pinned wheel is a slim vertical rail (a speed dial) hugging the pet's screen edge instead of a ring, so a wheel that
 *     stays open for a long time never sits on top of the page's own controls; names show as tooltips beside the buttons.
 *   - Only the buttons take pointer events, so the empty ring never blocks the page underneath.
 */
(function (global) {
  'use strict';

  const ICON_SIZE = 24, BUTTON = 48, HUB_PAD = 14, PLATE_PAD = 34, GAP = 16, EDGE = 12;
  const OUTSIDE_TAP_MS = 700;
  const RAIL_STEP = 56, RAIL_MIN_STEP = 44, RAIL_FIRST = 52, RAIL_HALF_WIDTH = 34, RAIL_BEHIND = 30, RAIL_TAIL = BUTTON / 2 + 10;
  const ROOT_CLASS = 'pw-wheel';
  const PIN_PATH = 'M9 3h6l-1 6 3 3v2H7v-2l3-3z M12 14v7';
  const PIN_LABEL = {off: '固定转盘', on: '取消固定'};

  const CSS = `
.${ROOT_CLASS}{--pw-plate:rgba(255,253,247,.94);--pw-btn:#fffdf7;--pw-ink:#2e2a1e;--pw-mute:#8a8167;--pw-line:#e6dfc9;--pw-accent:#c98a00;--pw-accent-ink:#fff;--pw-shadow:0 18px 40px rgba(40,28,4,.22),0 2px 6px rgba(40,28,4,.12);--pw-spring:cubic-bezier(.34,1.56,.64,1);
 position:fixed;left:0;top:0;width:0;height:0;z-index:var(--pw-z,40);pointer-events:none;visibility:hidden;user-select:none;-webkit-tap-highlight-color:transparent;font:600 14px/1.3 "Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif;color:var(--pw-ink);transition:visibility 0s linear .26s}
.${ROOT_CLASS}[data-theme=dark]{--pw-plate:rgba(43,38,24,.95);--pw-btn:#3a3322;--pw-ink:#f6eed6;--pw-mute:#b7ab8a;--pw-line:#4d4630;--pw-accent:#f2b83b;--pw-accent-ink:#2b2200;--pw-shadow:0 18px 40px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.35)}
.${ROOT_CLASS}[data-open=true]{visibility:visible;transition:none}
.${ROOT_CLASS} .pw-plate{position:absolute;left:0;top:0;border-radius:50%;background:var(--pw-plate);border:1px solid var(--pw-line);box-shadow:var(--pw-shadow);transform:translate(-50%,-50%) scale(.55);opacity:0;transition:transform .2s ease-in,opacity .16s ease-in,background-color .3s}
.${ROOT_CLASS}[data-open=true] .pw-plate{transform:translate(-50%,-50%) scale(1);opacity:1;transition:transform .55s var(--pw-spring),opacity .18s ease-out,background-color .3s}
.${ROOT_CLASS}[data-pinned=true][data-open=true] .pw-plate{background:transparent;box-shadow:none;border:1.5px dashed var(--pw-line);opacity:.9}
.${ROOT_CLASS}[data-pinned=true] .pw-label[data-on=false]{opacity:0}
.${ROOT_CLASS} .pw-item{position:absolute;left:0;top:0;width:0;height:0;transform:translate3d(0,0,0) scale(.3);opacity:0;transition:transform .18s ease-in,opacity .12s ease-in}
.${ROOT_CLASS}[data-open=true] .pw-item{transform:translate3d(var(--x),var(--y),0) scale(1);opacity:1;transition:transform .55s var(--pw-spring) calc(var(--i) * 32ms + 40ms),opacity .2s ease-out calc(var(--i) * 32ms + 40ms)}
.${ROOT_CLASS} button{position:absolute;left:0;top:0;box-sizing:border-box;width:${BUTTON}px;height:${BUTTON}px;margin:-${BUTTON / 2}px 0 0 -${BUTTON / 2}px;padding:0;border:1px solid var(--pw-line);border-radius:50%;background:var(--pw-btn);color:var(--pw-ink);display:grid;place-items:center;cursor:pointer;pointer-events:auto;touch-action:manipulation;transform:scale(1);transition:transform .45s var(--pw-spring),background-color .2s,color .2s,border-color .2s,box-shadow .25s}
.${ROOT_CLASS} button::after{content:"";position:absolute;inset:-6px;border-radius:50%}
.${ROOT_CLASS} button svg{width:${ICON_SIZE}px;height:${ICON_SIZE}px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.${ROOT_CLASS} button:hover,.${ROOT_CLASS} button:focus-visible,.${ROOT_CLASS} button[data-active=true]{transform:scale(1.14);background:var(--pw-accent);border-color:var(--pw-accent);color:var(--pw-accent-ink);box-shadow:0 6px 16px rgba(40,28,4,.22)}
.${ROOT_CLASS} button:focus-visible{outline:2px solid var(--pw-ink);outline-offset:3px}
.${ROOT_CLASS} button:active{transform:scale(.9);transition-duration:.07s,.2s,.2s,.2s,.25s}
.${ROOT_CLASS} .pw-hub{position:absolute;left:0;top:0;transform:translate(-50%,-50%);width:var(--hub);height:var(--hub);border-radius:50%;display:grid;grid-template-rows:1fr auto;justify-items:center;align-items:center;padding:${HUB_PAD}px 0 ${HUB_PAD}px;box-sizing:border-box;pointer-events:none;opacity:0;transition:opacity .12s}
.${ROOT_CLASS}[data-open=true] .pw-hub{opacity:1;transition:opacity .3s ease-out .16s}
.${ROOT_CLASS} .pw-label{max-width:calc(var(--hub) - 28px);text-align:center;font-size:15px;font-weight:700;letter-spacing:.01em;opacity:.55;transition:opacity .18s}
.${ROOT_CLASS} .pw-label[data-on=true]{opacity:1}
.${ROOT_CLASS} .pw-pin{position:relative;left:auto;top:auto;margin:0;width:40px;height:40px;background:var(--pw-btn);border-color:var(--pw-line);color:var(--pw-mute);box-shadow:0 2px 8px rgba(40,28,4,.12)}
.${ROOT_CLASS} .pw-pin svg{width:20px;height:20px;transition:transform .45s var(--pw-spring)}
.${ROOT_CLASS} .pw-pin[aria-checked=true]{color:var(--pw-accent)}
.${ROOT_CLASS} .pw-pin[aria-checked=true] svg{transform:rotate(-35deg) scale(1.1);fill:currentColor}
.${ROOT_CLASS} .pw-pin:hover,.${ROOT_CLASS} .pw-pin:focus-visible{background:var(--pw-btn);color:var(--pw-accent);border-color:var(--pw-accent)}
.${ROOT_CLASS} .pw-hub .pw-pin{pointer-events:auto}
.${ROOT_CLASS}[data-layout=rail] .pw-plate{border-radius:${RAIL_HALF_WIDTH}px;transition:transform .2s ease-in,opacity .16s ease-in,top .35s ease,height .35s ease,width .35s ease}
.${ROOT_CLASS}[data-layout=rail][data-open=true] .pw-plate{background:var(--pw-plate);border:1px solid var(--pw-line);box-shadow:0 8px 22px rgba(40,28,4,.16);opacity:1;transition:transform .55s var(--pw-spring),opacity .18s ease-out,top .35s ease,height .35s ease,width .35s ease}
.${ROOT_CLASS}[data-layout=rail] .pw-hub{width:0;height:0;padding:0;display:block}
.${ROOT_CLASS}[data-layout=rail] .pw-label{display:none}
.${ROOT_CLASS}[data-layout=rail] .pw-pin{position:absolute;left:0;top:0;margin:-20px 0 0 -20px;translate:var(--px,0) var(--py,0)}
.${ROOT_CLASS}[data-layout=rail] button::before{content:attr(aria-label);position:absolute;top:50%;padding:5px 10px;border-radius:999px;background:var(--pw-plate);border:1px solid var(--pw-line);color:var(--pw-ink);font-size:13px;font-weight:600;white-space:nowrap;pointer-events:none;opacity:0;transform:translateY(-50%);transition:opacity .15s ease-out;box-shadow:0 4px 12px rgba(40,28,4,.14)}
.${ROOT_CLASS}[data-layout=rail][data-side=left] button::before{right:calc(100% + 12px)}
.${ROOT_CLASS}[data-layout=rail][data-side=right] button::before{left:calc(100% + 12px)}
.${ROOT_CLASS}[data-layout=rail] button:hover::before,.${ROOT_CLASS}[data-layout=rail] button:focus-visible::before{opacity:1}
@media (prefers-reduced-motion:reduce){
 .${ROOT_CLASS} .pw-plate,.${ROOT_CLASS} .pw-item,.${ROOT_CLASS} button,.${ROOT_CLASS} .pw-pin svg{transition:opacity .12s!important}
 .${ROOT_CLASS}[data-open=true] .pw-plate{transform:translate(-50%,-50%) scale(1)}
 .${ROOT_CLASS} .pw-item{transform:translate3d(var(--x),var(--y),0) scale(1)}
 .${ROOT_CLASS} button:hover,.${ROOT_CLASS} button:focus-visible,.${ROOT_CLASS} button[data-active=true],.${ROOT_CLASS} button:active{transform:none}
}`;

  /** Ring radius for a viewport width: narrow screens get a tighter ring, never smaller buttons. */
  const ringRadius = viewportWidth => (viewportWidth < 420 ? 84 : 100);

  /**
   * Positions of `count` buttons on a ring of `radius`, the first at the top, clockwise.
   * @returns {{x: number, y: number}[]}
   */
  function layout(count, radius) {
    return Array.from({length: count}, (_, index) => {
      const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
      return {x: Math.round(Math.cos(angle) * radius * 100) / 100, y: Math.round(Math.sin(angle) * radius * 100) / 100};
    });
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

  /**
   * Geometry of the pinned layout. The rail starts at the pet's resting slot (the pin button sits there) and runs towards the
   * middle of the screen, on the pet's own screen edge, so it stays clear of the page content beside it.
   * @param {{left: number, top: number, width: number, height: number}} depot the pet's resting slot in viewport pixels
   * @param {{width: number, height: number}} viewport
   * @param {number} count number of action buttons
   * @param {number} [minTop] highest viewport y the rail may reach (a host keeps its toolbar and search field clear); the button pitch shrinks, down to RAIL_MIN_STEP, to fit
   * @returns {{x: number, y: number, dir: -1|1, side: 'left'|'right', edge: 'left'|'right', step: number, reach: number}} (x, y) is the pin's centre; dir -1 grows upwards; step is the button pitch; edge is the screen edge the rail hugs; reach is the rail's length past the pin
   */
  function placeRail(depot, viewport, count, minTop = EDGE) {
    const centreX = depot.left + depot.width / 2, centreY = depot.top + depot.height / 2;
    const dir = centreY > viewport.height / 2 ? -1 : 1;
    const clamp = (value, low, high) => Math.max(low, Math.min(Math.max(low, high), value));
    const rawY = dir < 0 ? depot.top - GAP - 20 : depot.top + depot.height + GAP + 20;
    const gaps = Math.max(0, count - 1), top = Math.max(EDGE, minTop);
    let step = RAIL_STEP;
    if (dir < 0 && gaps) {
      const room = clamp(rawY, EDGE + RAIL_BEHIND, viewport.height - EDGE - RAIL_BEHIND) - top - RAIL_FIRST - RAIL_TAIL;
      step = Math.max(RAIL_MIN_STEP, Math.min(RAIL_STEP, Math.floor(room / gaps)));
    }
    const reach = RAIL_FIRST + gaps * step + RAIL_TAIL;
    const y = dir < 0 ? clamp(rawY, top + reach, viewport.height - EDGE - RAIL_BEHIND) : clamp(rawY, EDGE + RAIL_BEHIND, viewport.height - EDGE - reach);
    return {x: Math.round(clamp(centreX, EDGE + RAIL_HALF_WIDTH, viewport.width - EDGE - RAIL_HALF_WIDTH)), y: Math.round(y), dir, side: centreX < viewport.width / 2 ? 'right' : 'left', edge: centreX < viewport.width / 2 ? 'left' : 'right', step, reach};
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
   * @param {() => {id: string, label: string, icon: string, run: () => void}[]} host.actions  current actions, 3 to 6
   * @param {boolean} [host.pinned]
   * @param {(pinned: boolean) => void} [host.onPinChange]  asked to store the new state; the host calls setPinned() back
   * @param {() => void} [host.onOpen]
   * @param {(reason: 'escape'|'outside'|'blur'|'choose'|'tap'|'api') => void} [host.onClose]
   * @param {() => HTMLElement|null} [host.returnFocus]  where focus goes when the wheel closes from the keyboard
   * @param {string} [host.ignore]  selector of triggers whose own click toggles the wheel (outside clicks on them are not "outside")
   * @param {() => number} [host.safeTop]  viewport y above which the pinned rail must not reach (keeps a toolbar or search field clear)
   * @param {(id: string) => void} [host.onChoose]
   */
  function create(host) {
    injectStyle();
    const root = document.createElement('div');
    root.className = ROOT_CLASS; root.dataset.open = 'false'; root.dataset.pinned = String(Boolean(host.pinned)); root.dataset.theme = pageTheme();
    root.setAttribute('role', 'menu'); root.setAttribute('aria-label', '宠物转盘'); root.hidden = false;
    const plate = document.createElement('div'); plate.className = 'pw-plate';
    const hub = document.createElement('div'); hub.className = 'pw-hub';
    const label = document.createElement('div'); label.className = 'pw-label'; label.setAttribute('aria-hidden', 'true');
    const pin = document.createElement('button'); pin.type = 'button'; pin.className = 'pw-pin'; pin.setAttribute('role', 'menuitemcheckbox'); pin.tabIndex = 0;
    pin.append(svgIcon(PIN_PATH)); hub.append(label, pin);
    root.append(plate, hub);
    document.body.append(root);

    let items = [], open = false, pinned = Boolean(host.pinned), active = -1, fromKeyboard = false, frame = 0, spot = null, destroyed = false;
    let hubText = '', closedAt = {reason: '', time: 0};
    const now = () => (global.performance && global.performance.now ? global.performance.now() : Date.now());

    function pageTheme() { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
    const radius = () => ringRadius(global.innerWidth);
    const idle = () => (pinned ? '已固定 · 点图标执行' : '快捷转盘');

    function setLabel(text) {
      hubText = text || '';
      label.textContent = hubText || idle(); label.dataset.on = String(Boolean(hubText));
    }
    function setActive(index) {
      active = index;
      items.forEach((entry, i) => { entry.button.dataset.active = String(i === index); entry.button.tabIndex = i === index || (index < 0 && i === 0) ? 0 : -1; });
      setLabel(index >= 0 && items[index] ? items[index].action.label : '');
    }
    function syncPin() {
      pin.setAttribute('aria-checked', String(pinned)); pin.setAttribute('aria-label', pinned ? PIN_LABEL.on : PIN_LABEL.off);
      root.dataset.pinned = String(pinned); if (!hubText) setLabel('');
    }

    function build() {
      for (const entry of items) entry.node.remove();
      const actions = (host.actions() || []).slice(0, 6);
      const r = radius();
      root.style.setProperty('--hub', (r - BUTTON / 2 - 10) * 2 + 'px');
      items = actions.map((action, i) => {
        const node = document.createElement('div'); node.className = 'pw-item'; node.style.setProperty('--i', String(i));
        node.setAttribute('role', 'none');
        const button = document.createElement('button'); button.type = 'button'; button.dataset.id = action.id; button.setAttribute('role', 'menuitem'); button.setAttribute('aria-label', action.label); button.tabIndex = -1;
        button.append(svgIcon(action.icon)); node.append(button); root.insertBefore(node, hub);
        button.addEventListener('pointerenter', () => { if (open) setActive(i); });
        button.addEventListener('focus', () => { if (open) setActive(i); });
        button.addEventListener('pointerleave', () => { if (document.activeElement !== button) setActive(-1); });
        button.addEventListener('click', event => { event.stopPropagation(); choose(i); });
        return {node, button, action};
      });
      setActive(-1); syncPin();
    }

    /** Tells the page which screen edge the open rail hugs (html[data-pw-rail]), so a host can leave that gutter free; cleared when the rail goes away. */
    function publishInset() {
      const edge = open && pinned && spot && spot.dir !== undefined ? spot.edge : '';
      const html = document.documentElement;
      if (edge) html.dataset.pwRail = edge; else if (html.dataset.pwRail) delete html.dataset.pwRail;
    }

    /** Positions every button for the current layout: a ring around the hub, or a rail from the pin when pinned. */
    function arrange() {
      const rail = pinned && spot && spot.dir !== undefined;
      root.dataset.layout = rail ? 'rail' : 'ring';
      if (rail) {
        const dir = spot.dir, step = spot.step || RAIL_STEP, last = RAIL_FIRST + Math.max(0, items.length - 1) * step;
        items.forEach((entry, i) => { entry.node.style.setProperty('--x', '0px'); entry.node.style.setProperty('--y', dir * (RAIL_FIRST + i * step) + 'px'); });
        const near = -dir * RAIL_BEHIND, far = dir * (last + RAIL_TAIL);
        plate.style.left = '0px'; plate.style.top = (near + far) / 2 + 'px'; plate.style.width = RAIL_HALF_WIDTH * 2 + 'px'; plate.style.height = Math.abs(far - near) + 'px';
        pin.style.setProperty('--px', '0px'); pin.style.setProperty('--py', '0px');
      } else {
        const r = radius(), spots = layout(items.length, r);
        items.forEach((entry, i) => { entry.node.style.setProperty('--x', spots[i].x + 'px'); entry.node.style.setProperty('--y', spots[i].y + 'px'); });
        plate.style.left = plate.style.top = '0px'; plate.style.width = plate.style.height = (r + PLATE_PAD) * 2 + 'px';
      }
    }

    function reposition() {
      frame = 0;
      const slot = host.anchor && host.anchor();
      const rect = slot && (typeof slot.getBoundingClientRect === 'function' ? slot.getBoundingClientRect() : slot);
      const box = rect && rect.width + rect.height > 2 ? rect : {left: global.innerWidth - 120, top: global.innerHeight - 90, width: 96, height: 60};
      const viewport = {width: global.innerWidth, height: global.innerHeight};
      spot = pinned ? placeRail(box, viewport, items.length, host.safeTop ? host.safeTop() : undefined) : place(box, viewport, radius());
      root.style.transform = `translate3d(${spot.x}px,${spot.y}px,0)`; root.dataset.side = spot.side;
      arrange(); publishInset();
    }
    const schedule = () => { if (open && !frame) frame = global.requestAnimationFrame(reposition); };

    function choose(index) {
      const entry = items[index]; if (!entry) return;
      const keyboard = fromKeyboard;
      try { entry.action.run(); } catch { /* an action that fails must not leave the wheel half open */ }
      host.onChoose && host.onChoose(entry.action.id);
      if (!pinned) close('choose', keyboard); else if (keyboard) entry.button.focus({preventScroll: true});
    }

    function openWheel(focus) {
      if (destroyed) return false;
      if (open) { if (focus) focusItem(Math.max(0, active)); return true; }
      build(); if (!items.length) return false;
      reposition(); open = true; publishInset(); fromKeyboard = Boolean(focus); root.dataset.theme = pageTheme(); root.dataset.open = 'true';
      document.addEventListener('pointerdown', onOutside, true); document.addEventListener('keydown', onKey, true); document.addEventListener('focusin', onFocusIn, true);
      global.addEventListener('resize', schedule); global.addEventListener('scroll', schedule, true);
      if (focus) focusItem(0);
      host.onOpen && host.onOpen();
      return true;
    }
    function focusItem(index) { const entry = items[((index % items.length) + items.length) % items.length]; if (entry) entry.button.focus({preventScroll: true}); }

    function close(reason = 'api', toTrigger = false) {
      if (!open) return false;
      open = false; publishInset(); root.dataset.open = 'false'; closedAt = {reason, time: now()};
      document.removeEventListener('pointerdown', onOutside, true); document.removeEventListener('keydown', onKey, true); document.removeEventListener('focusin', onFocusIn, true);
      global.removeEventListener('resize', schedule); global.removeEventListener('scroll', schedule, true);
      if (frame) { global.cancelAnimationFrame(frame); frame = 0; }
      if (root.contains(document.activeElement)) { const back = (toTrigger || reason === 'escape') && host.returnFocus && host.returnFocus(); if (back) back.focus({preventScroll: true}); else document.activeElement.blur(); }
      fromKeyboard = false; setActive(-1);
      host.onClose && host.onClose(reason);
      return true;
    }

    function onOutside(event) {
      if (pinned || root.contains(event.target)) return;
      if (host.tapTarget && host.tapTarget.contains(event.target)) return; // the pet's own tap decides
      if (host.ignore && event.target.closest && event.target.closest(host.ignore)) return;
      close('outside');
    }
    function onFocusIn(event) { if (!pinned && !root.contains(event.target) && event.target !== document.body && !(host.ignore && event.target.closest && event.target.closest(host.ignore))) close('blur'); }
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close('escape', true); return; }
      if (!root.contains(document.activeElement)) return;
      const buttons = items.map(entry => entry.button), here = buttons.indexOf(document.activeElement);
      const along = spot && spot.dir !== undefined ? -spot.dir : -1; // on the rail "up" follows the rail's own direction
      const move = {ArrowRight: 1, ArrowDown: -along, ArrowLeft: -1, ArrowUp: along}[event.key];
      if (move && here >= 0) { event.preventDefault(); fromKeyboard = true; focusItem(here + move); }
      else if (event.key === 'Home' && items.length) { event.preventDefault(); focusItem(0); }
      else if (event.key === 'End' && items.length) { event.preventDefault(); focusItem(items.length - 1); }
      else if (event.key === 'Tab' && here >= 0 && !event.shiftKey && here === buttons.length - 1) { event.preventDefault(); pin.focus({preventScroll: true}); }
      else if (event.key === 'Tab' && document.activeElement === pin && event.shiftKey) { event.preventDefault(); focusItem(items.length - 1); }
    }

    pin.addEventListener('click', event => { event.stopPropagation(); if (host.onPinChange) host.onPinChange(!pinned); else api.setPinned(!pinned); });
    pin.addEventListener('pointerenter', () => setLabel(pinned ? PIN_LABEL.on : PIN_LABEL.off));
    pin.addEventListener('focus', () => setLabel(pinned ? PIN_LABEL.on : PIN_LABEL.off));
    pin.addEventListener('pointerleave', () => { if (document.activeElement !== pin) setLabel(''); });
    pin.addEventListener('blur', () => setLabel(''));

    const onTap = event => {
      if (event.detail && event.detail.double) { close('tap'); return; }
      if (open) close('tap');
      else if (closedAt.reason === 'outside' && now() - closedAt.time < OUTSIDE_TAP_MS) closedAt = {reason: '', time: 0}; // the press that closed it was this tap
      else openWheel(false);
    };
    host.tapTarget && host.tapTarget.addEventListener('news-pet-tap', onTap);
    const themeObserver = typeof MutationObserver === 'function' ? new MutationObserver(() => { root.dataset.theme = pageTheme(); }) : null;
    if (themeObserver) themeObserver.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});

    const api = {
      open: focus => openWheel(Boolean(focus)),
      close: reason => close(reason || 'api'),
      toggle: focus => (open ? close('api') : openWheel(Boolean(focus))),
      isOpen: () => open,
      isPinned: () => pinned,
      /** Re-reads the actions from the host; keeps the wheel open when it was. */
      refresh() { if (destroyed) return; build(); if (open && !items.length) close('api'); else if (open) reposition(); },
      setPinned(next) { const was = pinned; pinned = Boolean(next); syncPin(); if (open && was !== pinned) reposition(); },
      destroy() {
        if (destroyed) return; close('api'); destroyed = true;
        host.tapTarget && host.tapTarget.removeEventListener('news-pet-tap', onTap); themeObserver && themeObserver.disconnect(); root.remove();
      },
      inspect: () => ({open, pinned, side: spot && spot.side, x: spot && spot.x, y: spot && spot.y, count: items.length, active, label: label.textContent, ids: items.map(entry => entry.action.id)}),
      element: root,
    };
    setLabel('');
    return api;
  }

  global.NewsPetWheel = Object.freeze({create, place, placeRail, layout, ringRadius, BUTTON, PLATE_PAD});
})(window);
