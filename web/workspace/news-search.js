/**
 * Floating search panel for the news list.
 *
 * The capsule field keeps a single border (see news-sections.css); on click or ↓ a panel opens under it with a live
 * result count, quick filters (时间, 来源) and recent searches. Enter records the search and closes the panel, Esc closes
 * it, ↓ moves into the panel, ↑ comes back, and focus leaving the field closes it. The field stays a plain input, so
 * everything that already listens to it keeps working.
 *
 * Exposes `window.NewsSearch.mount(options)`.
 */
(() => {
  'use strict';

  const MAX_RECENT = 6;
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';

  /**
   * @param {object} options
   * @param {HTMLInputElement} options.input the search field
   * @param {HTMLElement} options.wrap element the panel is positioned against (position: relative)
   * @param {() => {query:string, count:number, range:'today'|'all', source:string|null, sources:Array<{name:string, count:number}>}} options.state current list state
   * @param {(value:'today'|'all') => void} options.setRange
   * @param {(name:string|null) => void} options.setSource
   * @param {() => void} options.clear empty the field and re-render
   * @param {{read:() => string[], write:(list:string[]) => void}} options.store recent searches
   * @returns {{refresh:() => void, close:() => void, isOpen:() => boolean, recent:() => string[]}}
   */
  function mount({input, wrap, state, setRange, setSource, clear, store}) {
    const lifecycle = new AbortController();
    const listen = (target, type, callback, options = {}) => target.addEventListener(type, callback, {...options, signal:lifecycle.signal});
    const panel = make('div'); panel.id = 'search-panel'; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', '搜索选项'); panel.dataset.open = 'false'; panel.inert = true;
    wrap.append(panel);
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-haspopup', 'dialog'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', panel.id); input.setAttribute('autocomplete', 'off');
    let recents = [];
    const isOpen = () => panel.dataset.open === 'true';

    function remember(query) {
      const value = query.trim(); if (!value) return;
      recents = [value, ...store.read().filter(item => item !== value)].slice(0, MAX_RECENT); store.write(recents);
    }
    function chip(label, pressed, key, count) {
      const button = make('button', 'sr-chip', label); button.type = 'button'; button.setAttribute('aria-pressed', String(pressed)); button.dataset.key = key;
      if (count !== undefined) button.append(make('small', '', String(count)));
      return button;
    }
    function paint() {
      const s = state(); recents = store.read();
      const keep = (wrap.getRootNode?.().activeElement || document.activeElement) && panel.contains((wrap.getRootNode?.().activeElement || document.activeElement)) ? (wrap.getRootNode?.().activeElement || document.activeElement).dataset.key : null;
      const count = make('div', 'sr-count'), total = make('span'); total.setAttribute('aria-live', 'polite'); total.append(s.query ? '找到 ' : '当前列表 ', Object.assign(make('strong'), {textContent: String(s.count)}), ' 条');
      count.append(total);
      if (s.query || s.source) { const reset = make('button', 'ghost', '清除'); reset.type = 'button'; reset.dataset.key = 'reset'; count.append(reset); }
      const time = make('div', 'sr-group'); time.append(Object.assign(make('div', 'sr-title'), {textContent: '时间'}));
      const timeChips = make('div', 'sr-chips'); timeChips.append(chip('今天', s.range === 'today', 'range:today'), chip('全部日期', s.range === 'all', 'range:all')); time.append(timeChips);
      const nodes = [count, time];
      if (s.sources.length > 1 || s.source) {
        const sources = make('div', 'sr-group'); sources.append(Object.assign(make('div', 'sr-title'), {textContent: '来源'}));
        const row = make('div', 'sr-chips'); row.append(chip('全部', !s.source, 'source:'), ...s.sources.map(source => chip(source.name, s.source === source.name, 'source:' + source.name, source.count)));
        sources.append(row); nodes.push(sources);
      }
      const history = make('div', 'sr-group'), title = make('div', 'sr-title'); title.append('最近搜索');
      if (recents.length) { const wipe = make('button', 'ghost', '清除记录'); wipe.type = 'button'; wipe.dataset.key = 'wipe'; wipe.style.minHeight = '28px'; title.append(wipe); }
      history.append(title);
      if (recents.length) {
        const list = make('ul', 'sr-recent');
        for (const text of recents) {
          const item = make('li'), pick = make('button', 'pick'), del = make('button', 'del', '×');
          pick.type = 'button'; pick.dataset.key = 'recent:' + text; pick.dataset.value = text; pick.innerHTML = CLOCK; pick.append(make('span', '', text));
          del.type = 'button'; del.dataset.key = 'del:' + text; del.dataset.value = text; del.setAttribute('aria-label', `删除搜索记录 ${text}`);
          item.append(pick, del); list.append(item);
        }
        history.append(list);
      } else history.append(make('div', 'sr-empty', '还没有搜索记录。'));
      nodes.push(history);
      const foot = make('div', 'sr-foot'); foot.innerHTML = '<span class="keys"><kbd>↵</kbd> 搜索 <kbd>Esc</kbd> 关闭 <kbd>↓</kbd> 选择</span>';
      nodes.push(foot);
      panel.replaceChildren(...nodes);
      if (keep) panel.querySelector(`[data-key="${CSS.escape(keep)}"]`)?.focus({preventScroll: true});
    }
    function open() { if (isOpen()) return; paint(); panel.inert = false; panel.dataset.open = 'true'; input.setAttribute('aria-expanded', 'true'); }
    function close(focusInput = false) {
      if (!isOpen()) return;
      panel.dataset.open = 'false'; panel.inert = true; input.setAttribute('aria-expanded', 'false');
      if (focusInput) input.focus();
    }
    const items = () => [...panel.querySelectorAll('button:not(:disabled)')];

    listen(input, 'pointerdown', () => open());
    listen(input, 'click', () => open());
    // Typing hands the screen back to the results: the list header carries the live count, and a click or ↓ brings the panel back.
    listen(input, 'input', () => close());
    listen(input, 'keydown', event => {
      if (event.key === 'Escape' && isOpen()) { event.preventDefault(); event.stopPropagation(); close(); }
      else if (event.key === 'Enter') { event.preventDefault(); remember(input.value); close(); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); if (!isOpen()) open(); items()[0]?.focus(); }
    });
    listen(panel, 'keydown', event => {
      const rows = items(), at = rows.indexOf((wrap.getRootNode?.().activeElement || document.activeElement));
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      else if (event.key === 'ArrowDown' && at >= 0) { event.preventDefault(); rows[Math.min(at + 1, rows.length - 1)].focus(); }
      else if (event.key === 'ArrowUp' && at >= 0) { event.preventDefault(); if (at === 0) input.focus(); else rows[at - 1].focus(); }
    });
    listen(panel, 'mousedown', event => event.preventDefault()); // clicking a chip must not move focus out of the field
    listen(panel, 'click', event => {
      const button = event.target.closest('button'); if (!button) return; const key = button.dataset.key || '';
      if (key === 'reset') { setSource(null); clear(); }
      else if (key === 'wipe') { store.write([]); recents = []; paint(); }
      else if (key.startsWith('range:')) setRange(key.slice(6));
      else if (key.startsWith('source:')) setSource(key.slice(7) || null);
      else if (key.startsWith('del:')) { store.write(store.read().filter(item => item !== button.dataset.value)); paint(); }
      else if (key.startsWith('recent:')) { input.value = button.dataset.value; input.dispatchEvent(new Event('input', {bubbles: true})); remember(input.value); close(true); }
    });
    listen(wrap, 'focusout', event => { if (!event.relatedTarget || !wrap.contains(event.relatedTarget)) close(); });
    listen(document, 'pointerdown', event => { if (isOpen() && !wrap.contains(event.target) && !event.composedPath?.().includes(wrap)) close(); }, true);

    return {destroy(){lifecycle.abort();close();panel.remove();},refresh: () => { if (isOpen()) paint(); }, close, isOpen, recent: () => store.read()};
  }

  window.NewsSearch = {mount};
})();
