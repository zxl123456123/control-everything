/* Studio mascot: the chosen 3D pet as a small, quiet resident of the personal workbench.
 *
 * It is a floating overlay (pointer-events: none; the pet itself is hit-tested by the engine), so it never takes focus
 * or blocks a click. Where it lives is a policy, not a habit:
 *   shown   all Studio and project routes
 *   hidden  news (the reader owns its own pet)
 * Quiet mode, reduced motion and a hidden tab stop animation and status polling.
 * Preferences come from NewsPetPrefs; the wheel's six fixed slots from NewsPetDial and their handlers from NewsPetDirector
 * and the wheel itself from NewsPetWheel. */
(function (global) {
  'use strict';

  const MIN_WIDTH = 560;
  const HINT_KEY = 'news-reader-pet-hint';
  const HINT_DELAY = 1800;
  const DOCK_MARGIN = 64;
  const SPIDER_SIDE_MARGIN = 128;
  const SLOT = {width: 96, height: 64};
  const HINT_TEXT = '点我，打开快捷转盘';

  /**
   * Which routes get the mascot. Pure, so the decision can be tested without a browser.
   * @param {{view: string, tab?: string}} route the Studio route
   * @param {{compact?: boolean}} [env] compact: viewport narrower than MIN_WIDTH
   * @returns {{show: boolean, reason: string}}
   */
  function policy(route, env = {}) {
    if (route.view === 'news') return {show: false, reason: 'news-owns-pet'};
    return {show: true, reason: 'workbench'};
  }

  /**
   * @param {object} deps injected so the controller runs without a real page
   * @param {HTMLElement} deps.host the Studio root; the overlay is appended to it
   * @param {() => {view: string, tab?: string}} deps.route current route
   * @param {(hash: string) => void} deps.navigate
   * @param {object} deps.prefs NewsPetPrefs
   * @param {object} deps.director NewsPetDirector
   * @param {object} deps.wheel NewsPetWheel
   * @param {object} deps.pets NewsPets registry
   * @param {object} [deps.feed] PetStatusFeed (optional: without it the pet simply has no status)
   * @param {(url: string, signal?: AbortSignal) => Promise<object>} [deps.fetchJson]
   * @param {{compact: () => boolean, reduced: () => boolean, onChange: (fn: () => void) => () => void}} deps.env media queries
   * @param {Storage|null} [deps.storage]
   * @param {Function} [deps.setTimer]
   * @param {Function} [deps.clearTimer]
   */
  function create(deps) {
    const {host, prefs, director, pets, feed, env} = deps, doc = host.ownerDocument;
    const themeHost = deps.themeHost || host, railHost = deps.railHost || host;
    const setTimer = deps.setTimer || setTimeout, clearTimer = deps.clearTimer || clearTimeout;
    let current = prefs.read(), engine = null, wheel = null, parts = null, statusFeed = null, hintTimer = null, failedPet = '', disposed = false, lastActions = '', status = {};

    // A small polite live region of its own: the Studio status line is owned by page renders and would be cleared.
    const note = doc.createElement('div'); let noteTimer = null;
    note.className = 'ce-mascot-note'; note.setAttribute('role', 'status'); note.hidden = true; host.append(note);
    const notify = text => {
      note.textContent = text; note.hidden = false; clearTimer(noteTimer);
      noteTimer = setTimer(() => { note.hidden = true; note.textContent = ''; }, 5000);
    };

    const isFullPet = name => Boolean(pets.list().find(pet => pet.name === name)?.status);
    const still = () => current.quiet || env.reduced();
    const wanted = () => !disposed && current.enabled && failedPet !== current.pet && pets.list().some(pet => pet.name === current.pet)
      && policy(deps.route(), {compact: env.compact()}).show;

    function buildParts() {
      const root = doc.createElement('div'), canvas = doc.createElement('canvas'), depot = doc.createElement('div'), key = doc.createElement('button');
      root.className = 'ce-mascot'; root.dataset.pet = current.pet;
      canvas.setAttribute('aria-hidden', 'true'); depot.className = 'ce-mascot-depot'; depot.setAttribute('aria-hidden', 'true');
      key.type = 'button'; key.className = 'ce-mascot-key'; key.dataset.pet = current.pet; key.textContent = '宠物转盘'; key.setAttribute('aria-haspopup', 'menu');
      key.title = '打开宠物旁的快捷转盘';
      // detail 0 is keyboard activation: focus then moves into the wheel
      key.addEventListener('click', event => wheel?.toggle(event.detail === 0));
      root.append(canvas, depot); host.append(root, key);
      return {root, canvas, depot, key};
    }

    /** The shared six-slot table; here is the Studio view, so the slot for the page the wheel is on is greyed. */
    const actions = () => director.createActions({here: deps.route().view, go: deps.navigate, search: null, prefs, notify});
    /** What the wheel shows, as text: it is rebuilt when this changes (a route change greys another slot). */
    const signature = () => actions().map(item => `${item.id}:${item.enabled}:${item.checked}`).join();

    function options() {
      return {...director.petOptions(current, isFullPet(current.pet)), dock: current.dock === 'bl' ? 'bl' : 'br', margin: DOCK_MARGIN, theme: themeHost.dataset.theme === 'dark' ? 'dark' : 'light'};
    }

    function place() {
      if (!parts) return;
      const rail = railHost.querySelector('.ce-rail'), rect = rail && rail.getBoundingClientRect();
      // A bottom-left pet must sit beside the rail, never on top of its settings entry.
      const left = current.dock === 'bl', railEdge = left && rect && rect.width > 0 ? Math.round(rect.right) : 0;
      parts.root.style.left = `${railEdge}px`;
      parts.depot.dataset.dock = left ? 'bl' : 'br';
      parts.key.dataset.dock = left ? 'bl' : 'br';
      const sideMargin = current.pet === 'spider' ? SPIDER_SIDE_MARGIN : DOCK_MARGIN;
      parts.key.style.left = left ? `calc(${railEdge}px + max(${sideMargin}px, env(safe-area-inset-left)))` : '';
    }

    /**
     * The pet's resting slot in viewport pixels. The depot element is a 1px point at the dock corner, so the slot is the
     * pet-sized box that corner implies; the wheel is placed beside it and therefore never follows the pet's wandering.
     */
    function restingSlot() {
      const point = parts?.depot.getBoundingClientRect();
      if (!point) return null;
      const width = SLOT.width, height = SLOT.height;
      const left = current.pet === 'spider' ? point.left - width / 2 : current.dock === 'bl' ? point.left : point.left - width;
      return {left, top: point.top - height, width, height};
    }

    function mount() {
      parts = buildParts(); place();
      try {
        engine = pets.mount(current.pet, {root: parts.root, canvas: parts.canvas, depot: parts.depot, options: options()});
      } catch { fail(); return; }
      lastActions = signature();
      wheel = deps.wheel.create({
        tapTarget: parts.root, anchor: restingSlot, actions, ignore: '.ce-mascot-key', returnFocus: () => parts?.key || null,
        onOpen: () => parts?.key.setAttribute('aria-expanded', 'true'), onClose: () => parts?.key.setAttribute('aria-expanded', 'false'),
      });
      syncMotion();
      scheduleHint();
    }

    function unmount() {
      clearTimer(hintTimer); hintTimer = null;
      statusFeed?.stop(); statusFeed = null;
      wheel?.destroy(); wheel = null;
      engine?.destroy(); engine = null;
      parts?.root.remove(); parts?.key.remove(); parts = null;
    }

    /** One place decides whether the pet animates and polls: quiet, reduced motion and the page being hidden all mean no. */
    function syncMotion() {
      if (!engine) return;
      if (still()) engine.pause?.(); else engine.resume?.();
      const poll = !still() && Boolean(feed) && isFullPet(current.pet);
      if (poll && !statusFeed) {
        statusFeed = feed.start({apply: patch => { status = {...status, ...patch}; engine?.setStatus?.(status); }, fetchJson: deps.fetchJson});
      } else if (!poll && statusFeed) { statusFeed.stop(); statusFeed = null; }
    }

    function scheduleHint(tries = 3) {
      clearTimer(hintTimer); hintTimer = null;
      let seen = true; try { seen = Boolean(deps.storage?.getItem(HINT_KEY)); } catch { seen = true; }
      if (seen || still() || !isFullPet(current.pet)) return;
      hintTimer = setTimer(() => {
        hintTimer = null;
        if (!engine || still()) return;
        // react() answers false while the lazy engine is still loading; try again a few times, then give up quietly.
        if (wheel?.isOpen() || !engine.react?.(null, HINT_TEXT)) { if (tries > 1) scheduleHint(tries - 1); return; }
        try { deps.storage?.setItem(HINT_KEY, '1'); } catch { /* an unwritable store only means the hint may show again */ }
      }, HINT_DELAY);
    }

    function fail() {
      failedPet = current.pet; unmount();
      notify(`${pets.list().find(pet => pet.name === current.pet)?.label || '宠物'}暂时无法加载，工作台里先不显示它。`);
    }

    /** Reconciles the overlay with preferences, route and viewport. Cheap enough to call on every change. */
    function sync() {
      if (disposed) return;
      if (wanted() && !engine) mount();
      else if (!wanted() && engine) unmount();
      else if (engine) {
        const next = signature();
        if (next !== lastActions) { lastActions = next; wheel?.refresh(); }
        engine.setOptions?.(options()); place(); syncMotion();
      }
    }

    function onPrefs(next) {
      const before = current; current = next;
      if (next.pet !== before.pet) { failedPet = ''; unmount(); }
      if (next.quiet && !before.quiet) { clearTimer(hintTimer); hintTimer = null; }
      sync();
    }
    const onFallback = event => { if (!disposed && event.detail?.pet === current.pet) fail(); };
    const unsubscribePrefs = prefs.subscribe(onPrefs);
    const unsubscribeEnv = env.onChange(sync);
    doc.defaultView.addEventListener('news-pet-fallback', onFallback);
    const syncTheme = () => { if (host !== themeHost && host.dataset.theme !== themeHost.dataset.theme) host.dataset.theme = themeHost.dataset.theme; engine?.setOptions?.(options()); };
    syncTheme();
    const themeObserver = typeof global.MutationObserver === 'function'
      ? new global.MutationObserver(syncTheme) : null;
    themeObserver?.observe(themeHost, {attributes: true, attributeFilter: ['data-theme']});
    const railObserver = typeof global.ResizeObserver === 'function' && railHost.querySelector('.ce-rail')
      ? new global.ResizeObserver(place) : null;
    railObserver?.observe(railHost.querySelector('.ce-rail'));
    sync();

    return {
      /** Call after every route change. */
      setRoute: sync,
      inspect: () => ({mounted: Boolean(engine), pet: engine ? current.pet : '', polling: Boolean(statusFeed), still: still(), failedPet, policy: policy(deps.route(), {compact: env.compact()})}),
      dispose() {
        if (disposed) return;
        disposed = true; unsubscribePrefs(); unsubscribeEnv(); themeObserver?.disconnect(); railObserver?.disconnect();
        doc.defaultView.removeEventListener('news-pet-fallback', onFallback);
        clearTimer(noteTimer); note.remove(); unmount();
      },
    };
  }

  /** Wires the controller to the real page. */
  function mount(host, {route, navigate, themeHost, railHost}) {
    const query = text => (global.matchMedia ? global.matchMedia(text) : {matches: false, addEventListener() {}, removeEventListener() {}});
    const narrow = query(`(max-width: ${MIN_WIDTH - 1}px)`), reduced = query('(prefers-reduced-motion: reduce)');
    let storage = null; try { storage = global.localStorage; } catch { storage = null; }
    const fetcher = global.CERemoteContext ? global.CERemoteContext.fetch : global.fetch.bind(global);
    return create({
      host, themeHost, railHost, route, navigate, storage, prefs: global.NewsPetPrefs, director: global.NewsPetDirector, wheel: global.NewsPetWheel, pets: global.NewsPets,
      feed: global.PetStatusFeed,
      fetchJson: async (url, signal) => {
        const response = await fetcher(url, {headers: {'X-Session-Client': 'panel'}, credentials: 'same-origin', cache: 'no-store', signal});
        if (!response.ok) throw new Error('status');
        return response.json();
      },
      env: {
        compact: () => narrow.matches, reduced: () => reduced.matches,
        onChange(fn) {
          narrow.addEventListener('change', fn); reduced.addEventListener('change', fn);
          return () => { narrow.removeEventListener('change', fn); reduced.removeEventListener('change', fn); };
        },
      },
    });
  }

  global.StudioMascot = Object.freeze({policy, create, mount, MIN_WIDTH, HINT_KEY});
})(window);
