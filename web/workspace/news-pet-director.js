/* Reader-side director for the news-page pet: which dial actions to build, how the size/dock preferences map onto a pet,
 * and a small throttled reactor that lets the pet answer real reader events (new articles, unread zero, saving, empty
 * results, a failed refresh, reaching the end of an article). It never touches the DOM and never moves the reader:
 * reactions only call the pet's own react(kind, text). Pets without react(), such as the spider, are simply left alone. */
(function (global) {
  'use strict';

  const SIZE_SCALE = Object.freeze({small: 0.8, medium: 1, large: 1.25});
  const GLOBAL_GAP = 3000; // at most one reaction every three seconds, whatever the kind
  const SEEN_LIMIT = 60;

  /** gesture: a poke() kind the 3D pets know (unknown kinds only skip the gesture); gap: per-kind cooldown in ms. */
  const REACTIONS = Object.freeze({
    arrival: {gesture: 'hop', gap: 15000, text: detail => (detail.count > 1 ? `来了 ${detail.count} 条新文章` : '来了一条新文章')},
    refreshing: {gesture: 'wiggle', gap: 10000, text: '去找新文章啦'},
    'refresh-failed': {gesture: 'surprise', gap: 20000, text: '这次没更新成功', urgent: true},
    'all-read': {gesture: 'dance', gap: 120000, text: '未读都看完啦'},
    saved: {gesture: 'wiggle', gap: 2500, text: '收藏好啦'},
    archived: {gesture: 'hop', gap: 2500, text: '已读归档'},
    'search-empty': {gesture: 'tilt', gap: 15000, text: '没搜到，换个词试试'},
    'list-empty': {gesture: 'yawn', gap: 120000, text: '这里还没有新闻'},
    'read-end': {gesture: 'wiggle', gap: 8000, text: '读到底啦'},
  });

  /**
   * Turns the stored dial ids into the actions a pet's dial expects. An id without a handler is dropped, so a surface
   * only ever shows shortcuts it can really run.
   * @param {string[]} ids chosen action ids, already normalised for this surface
   * @param {Record<string, () => void>} handlers one function per action id
   * @returns {{id: string, label: string, icon: string, run: () => void}[]}
   */
  function buildActions(ids, handlers) {
    const pool = new Map(global.NewsPetDial.POOL.map(entry => [entry.id, entry]));
    return ids.filter(id => pool.has(id) && typeof handlers[id] === 'function')
      .map(id => ({id, label: pool.get(id).label, icon: pool.get(id).icon, run: handlers[id]}));
  }

  /** Pet options derived from the stored preferences; only pets with the full engine take size and dock. */
  function petOptions(prefs, full) {
    if (!full) return {};
    // dial:false hands the shortcut wheel over to NewsPetWheel; the pet then only reports taps
    return {scale: SIZE_SCALE[prefs.size] || 1, dock: prefs.dock === 'bl' || prefs.dock === 'br' ? prefs.dock : 'auto', dial: false};
  }

  /**
   * @param {{engine: () => object|null, enabled: () => boolean, now?: () => number, setTimer?: Function, clearTimer?: Function}} host
   *   enabled() is the single gate: pet visible, not paused or quiet, news interactions on, page visible.
   */
  function createReactor(host) {
    const now = host.now || (() => Date.now()), setTimer = host.setTimer || setTimeout, clearTimer = host.clearTimer || clearTimeout;
    const lastByKind = new Map(), seen = new Set(), pending = new Map();
    let lastAny = -Infinity, unread = null, atEnd = false;

    function react(kind, detail = {}) {
      const spec = REACTIONS[kind];
      if (!spec || !host.enabled()) return false;
      const t = now(), key = detail.key === undefined ? null : `${kind}:${detail.key}`;
      if (!spec.urgent && t - lastAny < GLOBAL_GAP) return false;
      if (t - (lastByKind.get(kind) ?? -Infinity) < spec.gap) return false;
      if (key && seen.has(key)) return false;
      const engine = host.engine();
      if (!engine || typeof engine.react !== 'function') return false;
      if (!engine.react(spec.gesture, typeof spec.text === 'function' ? spec.text(detail) : spec.text)) return false;
      lastAny = t; lastByKind.set(kind, t);
      if (key) { seen.add(key); if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value); }
      return true;
    }

    /** Reacts after `ms` if `confirm()` still holds, e.g. a search that is still empty once typing has stopped. */
    function later(kind, detail, ms, confirm) {
      clearTimer(pending.get(kind));
      pending.set(kind, setTimer(() => { pending.delete(kind); if (confirm()) react(kind, detail); }, ms));
    }

    /** Edge-triggered: only the move from some unread articles to none counts, never the first reading. */
    function observeUnread(count) {
      const emptied = unread !== null && unread > 0 && count === 0;
      unread = count;
      return emptied ? react('all-read') : false;
    }

    /** Fires once per article when a long article has been scrolled to its end. */
    function observeScroll({top, height, client, key}) {
      const end = height > client * 1.6 && top + client >= height - 24;
      const fire = end && !atEnd;
      atEnd = end;
      return fire ? react('read-end', {key}) : false;
    }

    function cancelPending() { for (const timer of pending.values()) clearTimer(timer); pending.clear(); }
    return {react, later, observeUnread, observeScroll, cancelPending};
  }

  global.NewsPetDirector = Object.freeze({SIZE_SCALE, REACTIONS, buildActions, petOptions, createReactor});
})(window);
