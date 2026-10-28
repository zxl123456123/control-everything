/**
 * News 专栏 (sections) switcher.
 *
 * Replaces the old fixed two-button "channel" control. A section is a named bundle of feeds with an optional keyword
 * filter; the list lives on the server per profile (see news_sections.py) and arrives with every reader snapshot.
 *
 * The strip is a WAI-ARIA tablist with a roving tabindex (one tab stop, arrows/Home/End move and select), a trailing
 * "+" and an edit button that open the floating editor (news-section-editor.js). It scrolls horizontally with edge
 * fades when there are more tabs than room, so nothing is ever clipped. Alt+Shift+←/→ reorders the focused tab,
 * F2 / double-click / the context-menu key edits it.
 *
 * Exposes `window.NewsSections.mount(options)`.
 */
(() => {
  'use strict';

  /** Sections shown when an older server (or a test fixture) sends streams but no section list. */
  const LEGACY_NAMES = {ai: 'AI 新闻', hn: 'Hacker News'};
  const LEGACY_COLORS = {ai: 'teal', hn: 'orange'};
  const reduced = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  /**
   * Turn a snapshot into a section list.
   * @param {{sections?:Array, removed_presets?:string[]}|undefined} envelope `snapshot.sections`
   * @param {string[]} streamKeys keys of `snapshot.sample.streams`, used when there is no envelope
   * @returns {{sections:Array, removed:string[]}}
   */
  function fromSnapshot(envelope, streamKeys) {
    if (envelope && Array.isArray(envelope.sections)) return {sections: envelope.sections.filter(valid), removed: Array.isArray(envelope.removed_presets) ? envelope.removed_presets : []};
    return {sections: streamKeys.map(id => ({id, name: LEGACY_NAMES[id] || id, emoji: '', color: LEGACY_COLORS[id] || 'gray', preset: LEGACY_NAMES[id] ? id : undefined, sources: [], include: [], exclude: []})), removed: []};
  }
  const valid = section => section && /^[a-z][a-z0-9]{1,15}$/.test(section.id) && typeof section.name === 'string';

  /**
   * @param {object} options
   * @param {HTMLElement} options.tabs the `role="tablist"` container
   * @param {HTMLButtonElement} options.add the "+" button
   * @param {HTMLButtonElement} options.edit the "edit current section" button
   * @param {(id:string|null) => void} options.onSelect called after the user (or a data change) selects another section
   * @param {() => void} options.onSaved called after the server accepted a new section list
   * @param {(path:string, init?:object) => Promise<Response>} options.request reader fetch (adds CSRF and session headers)
   * @param {(text:string) => void} options.announce polite status message (toast)
   */
  function mount({host, tabs, add, edit, onSelect, onSaved, request, announce}) {
    const lifecycle = new AbortController();
    const listen = (target, type, callback, options = {}) => target.addEventListener(type, callback, {...options, signal:lifecycle.signal});
    let sections = [], removed = [], current = null, statuses = new Map(), key = '';
    const editor = window.NewsSectionEditor?.mount({host,
      anchor: () => tabs.closest('.section-bar') || tabs,
      request,
      announce,
      getState: () => ({sections, removed, current, statuses}),
      save: payload => save(payload),
      restore: () => save({restore: true}),
      select: id => select(id, {focus: false}),
    });

    async function save(payload) {
      const response = await request('/sections', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload.restore ? payload : {sections: payload})});
      let value = null;
      try { value = await response.json(); } catch { /* handled below */ }
      if (!response.ok || !value?.sections) {
        const error = new Error(ERRORS[value?.error] || '保存失败，请稍后重试。'); error.code = value?.error || 'failed'; throw error;
      }
      adopt(value);
      return value;
    }
    /** Use a server-confirmed list straight away, so the new tab exists before the next snapshot arrives. */
    function adopt(value) {
      const previous = current;
      sections = value.sections; removed = value.removed_presets || []; key = JSON.stringify({sections, removed});
      if (!sections.some(section => section.id === current)) current = sections[0]?.id ?? null;
      paint();
      if (current !== previous) onSelect(current);
      onSaved?.(value);
    }

    const tabFor = id => tabs.querySelector(`[data-value="${CSS.escape(id)}"]`);
    function measure() {
      const more = tabs.scrollWidth - tabs.clientWidth > 2;
      tabs.dataset.moreStart = String(more && tabs.scrollLeft > 2);
      tabs.dataset.moreEnd = String(more && tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 2);
    }
    function paint() {
      tabs.replaceChildren(...sections.map(section => {
        const tab = document.createElement('button');
        tab.type = 'button'; tab.className = 'section-tab'; tab.id = 'tab-' + section.id; tab.setAttribute('role', 'tab'); tab.dataset.value = section.id; tab.dataset.color = section.color || 'gray';
        tab.setAttribute('aria-controls', 'title-list');
        const mark = document.createElement('span');
        if (section.emoji) { mark.className = 'tab-emoji'; mark.textContent = section.emoji; } else mark.className = 'tab-dot';
        mark.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span'); name.className = 'tab-name'; name.textContent = section.name;
        tab.append(mark, name);
        return tab;
      }));
      mark();
      tabs.hidden = sections.length === 0;
      edit.disabled = !current; edit.hidden = sections.length === 0;
      requestAnimationFrame(measure);
    }
    function mark() {
      for (const tab of tabs.children) {
        const on = tab.dataset.value === current;
        tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on || (!current && tab === tabs.firstElementChild) ? 0 : -1;
      }
    }
    /** Select a section; returns true when the selection changed. */
    function select(id, {focus = false, silent = false} = {}) {
      if (!sections.some(section => section.id === id)) id = sections[0]?.id ?? null;
      const changed = id !== current; current = id; mark();
      const tab = id && tabFor(id);
      if (tab) {
        if (focus) tab.focus();
        tab.scrollIntoView?.({inline: 'nearest', block: 'nearest', behavior: reduced() ? 'auto' : 'smooth'});
      }
      if (changed && !silent) onSelect(id);
      return changed;
    }
    /**
     * Feed in a fresh snapshot. Re-renders only when the list changed.
     * @param {object} snapshot reader snapshot
     * @param {string} preferred section to keep selected when it still exists
     * @returns {boolean} whether the selected section differs from `preferred`
     */
    function update(snapshot, preferred) {
      const next = fromSnapshot(snapshot.sections, Object.keys(snapshot.sample?.streams || {}));
      statuses = new Map((snapshot.sample?.sources || []).map(source => [source.url || source.id, source]));
      const nextKey = JSON.stringify(next);
      sections = next.sections; removed = next.removed;
      if (nextKey !== key) { key = nextKey; current = sections.some(section => section.id === preferred) ? preferred : (sections[0]?.id ?? null); paint(); }
      else { current = sections.some(section => section.id === preferred) ? preferred : (sections[0]?.id ?? null); mark(); }
      editor?.refresh?.();
      return current !== preferred;
    }

    listen(tabs, 'click', event => { const tab = event.target.closest('[role="tab"]'); if (tab && tabs.contains(tab)) select(tab.dataset.value); });
    listen(tabs, 'dblclick', event => { const tab = event.target.closest('[role="tab"]'); if (tab) { select(tab.dataset.value); editor?.open('edit', tab.dataset.value, tab); } });
    listen(tabs, 'contextmenu', event => { const tab = event.target.closest('[role="tab"]'); if (tab) { event.preventDefault(); select(tab.dataset.value); editor?.open('edit', tab.dataset.value, tab); } });
    listen(tabs, 'scroll', measure, {passive: true});
    const resize = window.ResizeObserver ? new ResizeObserver(measure) : null;
    if (resize) resize.observe(tabs); else listen(window, 'resize', measure);
    listen(tabs, 'keydown', async event => {
      const tab = event.target.closest('[role="tab"]'); if (!tab || event.ctrlKey || event.metaKey) return;
      const at = sections.findIndex(section => section.id === tab.dataset.value);
      if (event.key === 'F2' || (event.key === 'ContextMenu') || (event.key === 'F10' && event.shiftKey)) { event.preventDefault(); select(tab.dataset.value); editor?.open('edit', tab.dataset.value, tab); return; }
      const step = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[event.key];
      if (event.altKey && event.shiftKey && step) {
        event.preventDefault();
        const to = at + step; if (to < 0 || to >= sections.length) return;
        const next = sections.slice(); [next[at], next[to]] = [next[to], next[at]];
        try { await save(next); select(tab.dataset.value, {focus: true, silent: true}); announce(`已把「${next[to].name}」移到第 ${to + 1} 位。`); }
        catch (error) { announce(error.message); }
        return;
      }
      if (event.altKey) return;
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : step ? (at + step + sections.length) % sections.length : -1;
      if (target < 0) return;
      event.preventDefault(); select(sections[target].id, {focus: true});
    });
    listen(add, 'click', () => editor?.open('new', null, add));
    listen(edit, 'click', () => current && editor?.open('edit', current, edit));

    return {destroy(){lifecycle.abort();resize?.disconnect();editor?.destroy();},update, select, current: () => current, list: () => sections.slice(), editor, hasSources: id => Boolean(sections.find(section => section.id === id)?.sources?.length), isCustom: id => { const section = sections.find(row => row.id === id); return Boolean(section && !section.preset); }, saveList: save, problems: id => (sections.find(section => section.id === id)?.sources || []).map(source => statuses.get(source.url)).filter(row => row?.reason).map(row => ({name: row.name, message: row.message, hint: row.hint}))};
  }

  /** Chinese messages for the codes news_sections.SectionError can return. */
  const ERRORS = {
    invalid_name: '名称不能为空，且不超过 16 个字。', invalid_emoji: '图标最多 8 个字符。', invalid_color: '颜色不可用。', too_many_sources: '一个专栏最多 12 个来源。',
    invalid_sources: '来源格式不正确。', invalid_source: '来源格式不正确。', invalid_source_url: '来源地址必须是公开的 https 链接。', invalid_keywords: '关键词最多 10 个，每个不超过 30 个字。',
    invalid_sections: '专栏最多 12 个。', invalid_section: '专栏数据不正确。', unknown_section: '这个专栏已不存在，请刷新后重试。', duplicate_section: '专栏重复。', busy: '服务正忙，请稍后重试。',
  };

  window.NewsSections = {mount, fromSnapshot, ERRORS};
})();
