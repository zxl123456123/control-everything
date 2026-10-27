/* Pet status feed: silent GET polls of /api/workspace/usage and /observations; backs off, pauses while hidden. */
(function (global) {
  'use strict';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function quotaLeft(usage) {
    const codex = usage && usage.codex;
    if (!codex || (codex.status !== 'available' && codex.status !== 'stale') || !Array.isArray(codex.buckets)) return undefined;
    let used = null;
    for (const b of codex.buckets) for (const w of [b && b.primary, b && b.secondary]) {
      const v = w && typeof w.used_percent === 'number' ? w.used_percent : NaN;
      if (Number.isFinite(v)) used = used === null ? v : Math.max(used, v);
    }
    return used === null ? undefined : Math.round(clamp(100 - used, 0, 100) * 10) / 10;
  }
  function runningAgents(obs) {
    if (!obs || obs.status !== 'available' || !Array.isArray(obs.instances)) return undefined;
    return obs.instances.filter(i => i && i.status === 'available' && i.classification !== 'custom_exe').length;
  }
  function start(o = {}) {
    const doc = o.document || global.document, T = o.timers || {set: (f, ms) => setTimeout(f, ms), clear: id => clearTimeout(id)}, apply = o.apply || (() => {}), maxMs = o.maxMs || 300000;
    const fetchJson = o.fetchJson || (async (url, signal) => {
      const r = await global.fetch(url, {headers: {'X-Session-Client': 'panel'}, credentials: 'same-origin', cache: 'no-store', signal});
      if (!r.ok) throw new Error('status');
      return r.json();
    });
    const src = [['quotaLeftPercent', '/api/workspace/usage', o.usageMs || 60000, quotaLeft, null], ['agentsRunning', '/api/workspace/observations', o.observeMs || 15000, runningAgents, false]]
      .map(([key, url, base, parse, reset]) => ({key, url, base, parse, reset, fails: 0, timer: null, busy: false, value: undefined, delay: 0, polls: 0}));
    let stopped = false;
    const hidden = () => Boolean(doc && doc.hidden), say = (s, v) => { try { apply({[s.key]: v}); } catch (e) {} };
    const clearAll = () => { for (const s of src) { if (s.timer !== null) T.clear(s.timer); s.timer = null; } };
    function schedule(s, ms) { if (s.timer !== null) T.clear(s.timer); s.delay = ms; s.timer = hidden() ? null : T.set(() => poll(s), ms); }
    async function poll(s) {
      s.timer = null; if (stopped || s.busy || hidden()) return;
      s.busy = true; s.polls++;
      let v;
      try {
        const ctl = typeof AbortController === 'function' ? new AbortController() : null, g = ctl ? T.set(() => ctl.abort(), 8000) : null;
        try { v = s.parse(await fetchJson(s.url, ctl && ctl.signal)); } finally { if (g !== null) T.clear(g); }
      } catch (e) { v = undefined; }
      s.busy = false; if (stopped) return;
      if (v === undefined) { if (++s.fails >= 3 && s.value !== undefined && s.value !== s.reset) { s.value = s.reset; say(s, s.reset); } }
      else { s.fails = 0; if (v !== s.value) { s.value = v; say(s, v); } }
      schedule(s, Math.min(maxMs, s.base * Math.pow(2, Math.min(s.fails, 10))));
    }
    const onVis = () => { if (stopped) return; if (hidden()) clearAll(); else for (const s of src) if (s.timer === null && !s.busy) poll(s); };
    if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', onVis);
    for (const s of src) poll(s);
    return {
      refresh() { for (const s of src) if (!stopped && !s.busy && !hidden()) { if (s.timer !== null) T.clear(s.timer); poll(s); } },
      stop() { stopped = true; clearAll(); if (doc && doc.removeEventListener) doc.removeEventListener('visibilitychange', onVis); },
      inspect: () => ({stopped, hidden: hidden(), sources: src.map(s => ({url: s.url, key: s.key, fails: s.fails, delay: s.delay, polls: s.polls, value: s.value === undefined ? null : s.value, scheduled: s.timer !== null}))}),
    };
  }
  global.PetStatusFeed = Object.freeze({start, quotaLeft, runningAgents});
})(typeof window !== 'undefined' ? window : globalThis);
