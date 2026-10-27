/*
 * The pet's action dial, as data: which shortcuts exist, which ones a page may show, and how many are enabled.
 * Hosts (the news reader, the Studio mascot) own what each action does; this module only owns the pool, the
 * defaults and the validation, so the Studio settings checklist and every dial agree without a shared UI.
 *   scope 'any'    works on every page that hosts the pet
 *   scope 'news'   needs the news reader (article list, search, refresh)
 *   scope 'studio' needs the Studio shell around the reader
 * The dial shows between MIN and MAX actions: fewer is not worth a ring, more cannot be hit comfortably.
 */
(function (global) {
  'use strict';
  const MIN = 3, MAX = 6;
  const POOL = Object.freeze([
    {id: 'workspace', label: '打开工作台', scope: 'any', icon: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z'},
    {id: 'next', label: '下一条', scope: 'news', icon: 'M5 12h14 M13 6l6 6-6 6'},
    {id: 'previous', label: '上一条', scope: 'news', icon: 'M19 12H5 M11 6l-6 6 6 6'},
    {id: 'search', label: '搜索新闻', scope: 'news', icon: 'M10.5 3a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15z M16 16l5 5'},
    {id: 'collect', label: '采集新闻', scope: 'news', icon: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7'},
    {id: 'save', label: '收藏本条', scope: 'news', icon: 'M7 4h10v16l-5-4-5 4z'},
    {id: 'archive', label: '读完归档', scope: 'news', icon: 'M4 6h16v4H4z M6 10v9h12v-9 M10 14h4'},
    {id: 'news', label: '去看新闻', scope: 'studio', icon: 'M5 5h11v14H5z M16 9h3v8a2 2 0 0 1-2 2 M8 9h5 M8 13h5'},
    {id: 'quiet', label: '安静模式', scope: 'any', icon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'},
    {id: 'pet-settings', label: '宠物设置', scope: 'any', icon: 'M4 7h10 M18 7h2 M4 17h2 M10 17h10 M16 5v4 M8 15v4'},
    {id: 'hide-pet', label: '隐藏宠物', scope: 'any', icon: 'M3 3l18 18 M10.6 6.2A9.5 9.5 0 0 1 12 6c5 0 8.5 4.5 9.5 6a14 14 0 0 1-2.4 2.9 M6.6 7.7A14 14 0 0 0 2.5 12C3.5 13.5 7 18 12 18c1.2 0 2.3-.3 3.3-.7'},
  ].map(Object.freeze));
  const DEFAULTS = Object.freeze(['workspace', 'next', 'search', 'collect', 'quiet', 'pet-settings']);
  const STUDIO_FALLBACK = Object.freeze(['workspace', 'news', 'quiet', 'pet-settings']);
  const byId = new Map(POOL.map(action => [action.id, action]));
  const surfaces = {news: new Set(['any', 'news']), studio: new Set(['any', 'studio'])};

  /** Valid ids in pool order, without duplicates and within MAX. Too few valid ids resolve to the defaults. */
  function normalize(ids) {
    const wanted = new Set(Array.isArray(ids) ? ids : []);
    const list = POOL.filter(action => wanted.has(action.id)).map(action => action.id).slice(0, MAX);
    return list.length >= MIN ? list : [...DEFAULTS];
  }

  /** Parses the stored comma list; null (never set) and garbage both give the defaults. */
  const parse = text => normalize(typeof text === 'string' ? text.split(',') : null);
  const serialize = ids => normalize(ids).join(',');

  /**
   * Turns one action on or off. Refuses to go below MIN or above MAX.
   * @returns {{ids: string[], ok: boolean, reason?: 'min'|'max'|'unknown'}}
   */
  function toggle(ids, id) {
    const current = normalize(ids);
    if (!byId.has(id)) return {ids: current, ok: false, reason: 'unknown'};
    if (current.includes(id)) return current.length <= MIN ? {ids: current, ok: false, reason: 'min'} : {ids: current.filter(item => item !== id), ok: true};
    if (current.length >= MAX) return {ids: current, ok: false, reason: 'max'};
    return {ids: normalize([...current, id]), ok: true};
  }

  /** The action definitions one surface can run; tops the list up to MIN from that surface's fallback when the choice does not fit it. */
  function forSurface(ids, surface) {
    const allowed = surfaces[surface] || surfaces.news;
    const fits = id => allowed.has(byId.get(id)?.scope);
    let list = normalize(ids).filter(fits);
    for (const id of surface === 'studio' ? STUDIO_FALLBACK : DEFAULTS) if (list.length < MIN && fits(id) && !list.includes(id)) list.push(id);
    return list.map(id => byId.get(id));
  }

  global.NewsPetDial = Object.freeze({MIN, MAX, POOL, DEFAULTS, normalize, parse, serialize, toggle, forSurface});
})(window);
