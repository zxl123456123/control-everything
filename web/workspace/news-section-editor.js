/**
 * Floating editor for news 专栏 (sections) and the add-source picker.
 *
 * One popover handles "new" and "edit": name, emoji, colour, source list, keyword filter, reorder, delete, and
 * restoring the two default sections. The picker lists a curated, health-checked catalogue by category and accepts any
 * RSS/Atom URL after a fetch test that shows the feed title and newest article, or the exact reason it failed and what
 * to try. Edits are a draft until 保存; nothing is written to the server before that.
 *
 * Exposes `window.NewsSectionEditor.mount(options)`; used by news-sections.js.
 */
(() => {
  'use strict';

  const COLORS = [['teal', '青'], ['orange', '橙'], ['blue', '蓝'], ['purple', '紫'], ['pink', '粉'], ['green', '绿'], ['red', '红'], ['gray', '灰']];
  const MAX_SOURCES = 12, MAX_KEYWORDS = 10;
  const ICON = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    test: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 1-2.3-5.7"/></svg>',
  };
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const urlHost = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
  const words = text => [...new Set(String(text).split(/[,，、;；\n]+/).map(word => word.trim()).filter(Boolean))];
  const copy = section => ({id: section.id || null, name: section.name || '', emoji: section.emoji || '', color: section.color || 'teal', preset: section.preset || null,
    sources: (section.sources || []).map(source => ({id: source.id, url: source.url, name: source.name})), include: [...(section.include || [])], exclude: [...(section.exclude || [])]});
  const payloadOf = section => section.preset
    ? {id: section.id, name: section.name, emoji: section.emoji, color: section.color}
    : {...(section.id ? {id: section.id} : {}), name: section.name, emoji: section.emoji, color: section.color, sources: section.sources.map(({url, name}) => ({url, name})), include: section.include, exclude: section.exclude};

  /** "example.com/feed" and "http://…" both become an https URL; anything else is left for the server to reject. */
  function normaliseUrl(value) {
    const text = String(value).trim();
    if (!text) return '';
    if (/^http:\/\//i.test(text)) return 'https://' + text.slice(7);
    return /^https:\/\//i.test(text) ? text : /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : 'https://' + text;
  }
  const ago = value => {
    const time = Date.parse(value || ''); if (!Number.isFinite(time)) return '';
    const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
    return minutes < 60 ? `${minutes || 1} 分钟前` : minutes < 1440 ? `${Math.round(minutes / 60)} 小时前` : `${Math.round(minutes / 1440)} 天前`;
  };

  /**
   * @param {object} options
   * @param {() => HTMLElement} options.anchor element the popover hangs under
   * @param {(path:string, init?:object) => Promise<Response>} options.request reader fetch
   * @param {(text:string) => void} options.announce toast
   * @param {() => {sections:Array, removed:string[], current:string|null, statuses:Map}} options.getState
   * @param {(list:Array) => Promise<{sections:Array, removed_presets:string[]}>} options.save
   * @param {() => Promise<object>} options.restore
   * @param {(id:string) => void} options.select
   */
  function mount({host = document.body, anchor, request, announce, getState, save, restore, select}) {
    const lifecycle = new AbortController();
    const listen = (target, type, callback, options = {}) => target.addEventListener(type, callback, {...options, signal:lifecycle.signal});
    let root = null, ui = null, draft = null, initial = '', trigger = null, catalog = null, catalogError = '', category = 'all', filter = '', busy = false;
    const health = new Map(); // url -> {state:'ok'|'bad'|'busy', text}
    const narrow = () => window.matchMedia('(max-width: 560px)').matches;

    function build() {
      root = make('div'); root.id = 'sections-popover'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-labelledby', 'sp-title'); root.dataset.open = 'false'; root.inert = true;
      root.innerHTML = `
        <div class="sp-head"><h2 id="sp-title"></h2><button type="button" class="ghost icon-only" data-act="close" aria-label="关闭">${ICON.close}</button></div>
        <div class="sp-body">
          <div class="sp-restore sp-hint" hidden></div>
          <div class="sp-field"><label for="sp-name">名称</label>
            <div class="sp-row"><input id="sp-emoji" class="emoji" type="text" maxlength="8" aria-label="图标（可选）" placeholder="🙂" autocomplete="off"><input id="sp-name" type="text" maxlength="16" placeholder="例如：设计灵感、投资、每日科学" autocomplete="off" required></div>
            <p class="sp-hint err" id="sp-name-error" hidden></p></div>
          <div class="sp-field"><span class="sp-label" id="sp-color-label">颜色</span><div class="sp-swatches" role="radiogroup" aria-labelledby="sp-color-label"></div></div>
          <div class="sp-field sp-sources-field"><span class="sp-label">来源 <span class="sp-count"></span></span>
            <ul class="sp-sources" aria-label="已添加的来源"></ul>
            <div class="sp-empty">还没有来源。点下面的按钮挑选，或粘贴任意 RSS / Atom 地址。</div>
            <button type="button" class="outline" data-act="toggle-picker" aria-expanded="false" aria-controls="sp-picker">＋ 添加来源</button>
            <div class="sp-picker" id="sp-picker" hidden>
              <div class="sp-chips" role="group" aria-label="来源分类"></div>
              <input id="sp-filter" type="text" placeholder="筛选来源名称" aria-label="筛选来源名称" autocomplete="off">
              <ul class="sp-catalog" aria-label="可选来源"></ul>
              <div class="sp-field"><label for="sp-url">或粘贴 RSS / Atom 地址（站点首页也可以）</label>
                <div class="sp-row"><input id="sp-url" type="text" inputmode="url" placeholder="https://example.com/feed.xml" autocomplete="off" spellcheck="false"><button type="button" class="outline" data-act="probe">检测</button></div></div>
              <div class="sp-result" hidden role="status"></div>
            </div></div>
          <div class="sp-field sp-words-field"><label for="sp-include">只看包含这些词的文章（可选）</label><input id="sp-include" type="text" placeholder="用逗号分隔，满足任意一个即可" autocomplete="off">
            <label for="sp-exclude">排除包含这些词的文章（可选）</label><input id="sp-exclude" type="text" placeholder="例如：广告, 招聘" autocomplete="off">
            <p class="sp-hint">最多 10 个词，匹配标题、摘要和来源名。</p></div>
          <p class="sp-hint sp-preset-note" hidden>这是内置专栏，来源由系统维护（已选用国内外都能访问的来源）；可以改名、换颜色、调整顺序，也可以删除后随时恢复。</p>
          <p class="sp-hint err sp-error" role="alert" hidden></p>
        </div>
        <div class="sp-foot">
          <button type="button" class="ghost icon-only" data-act="earlier" aria-label="前移一位" title="前移一位">${ICON.left}</button>
          <button type="button" class="ghost icon-only" data-act="later" aria-label="后移一位" title="后移一位">${ICON.right}</button>
          <button type="button" class="ghost danger" data-act="delete">删除</button>
          <span class="spacer"></span>
          <button type="button" class="ghost" data-act="close">取消</button>
          <button type="button" class="primary" data-act="save">保存</button>
        </div>`;
      host.append(root);
      const q = selector => root.querySelector(selector);
      ui = {title: q('#sp-title'), name: q('#sp-name'), emoji: q('#sp-emoji'), nameError: q('#sp-name-error'), swatches: q('.sp-swatches'), sources: q('.sp-sources'), empty: q('.sp-empty'), count: q('.sp-count'),
        sourcesField: q('.sp-sources-field'), wordsField: q('.sp-words-field'), include: q('#sp-include'), exclude: q('#sp-exclude'), presetNote: q('.sp-preset-note'), error: q('.sp-error'),
        picker: q('#sp-picker'), toggle: q('[data-act=toggle-picker]'), chips: q('.sp-chips'), filter: q('#sp-filter'), catalog: q('.sp-catalog'), url: q('#sp-url'), result: q('.sp-result'),
        restore: q('.sp-restore'), earlier: q('[data-act=earlier]'), later: q('[data-act=later]'), del: q('[data-act=delete]'), save: q('[data-act=save]')};
      ui.swatches.append(...COLORS.map(([id, label]) => { const swatch = make('button'); swatch.type = 'button'; swatch.className = 'sp-swatch'; swatch.dataset.color = id; swatch.dataset.value = id; swatch.setAttribute('role', 'radio'); swatch.setAttribute('aria-label', label); return swatch; }));
      listen(root, 'click', onClick);
      listen(root, 'keydown', onKey);
      listen(ui.name, 'input', () => { draft.list[draft.index].name = ui.name.value; ui.nameError.hidden = true; });
      listen(ui.emoji, 'input', () => { draft.list[draft.index].emoji = ui.emoji.value.trim(); });
      listen(ui.include, 'input', () => { draft.list[draft.index].include = words(ui.include.value); });
      listen(ui.exclude, 'input', () => { draft.list[draft.index].exclude = words(ui.exclude.value); });
      listen(ui.filter, 'input', () => { filter = ui.filter.value.trim().toLocaleLowerCase(); paintCatalog(); });
      listen(ui.url, 'keydown', event => { if (event.key === 'Enter') { event.preventDefault(); probe(); } });
      listen(ui.swatches, 'keydown', event => {
        const items = [...ui.swatches.children], at = items.indexOf((host.getRootNode?.().activeElement || document.activeElement)); const step = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[event.key];
        if (at < 0 || !step) return; event.preventDefault(); const next = items[(at + step + items.length) % items.length]; next.focus(); setColor(next.dataset.value);
      });
      listen(document, 'pointerdown', event => {
        if (!isOpen() || root.contains(event.target) || event.composedPath?.().includes(root) || trigger?.contains?.(event.target) || event.target.closest?.('.section-bar')) return;
        if (dirty()) { root.animate?.([{transform: 'translateX(0)'}, {transform: 'translateX(-5px)'}, {transform: 'translateX(5px)'}, {transform: 'translateX(0)'}], {duration: 220}); return; }
        close(false);
      }, true);
      listen(window, 'resize', () => { if (isOpen()) place(); });
    }

    const isOpen = () => Boolean(root && root.dataset.open === 'true');
    const current = () => draft.list[draft.index];
    const dirty = () => JSON.stringify(draft.list.map(payloadOf)) !== initial;

    function place() {
      const sheet = narrow(); root.dataset.sheet = String(sheet);
      if (sheet) { root.style.left = root.style.top = root.style.maxHeight = ''; return; }
      const box = (anchor() || document.body).getBoundingClientRect(), width = Math.min(420, window.innerWidth - 16);
      const left = Math.min(Math.max(8, box.right - width), window.innerWidth - width - 8), top = Math.min(box.bottom + 8, window.innerHeight - 220);
      root.style.left = left + 'px'; root.style.top = top + 'px'; root.style.maxHeight = `${Math.max(240, window.innerHeight - top - 12)}px`;
      root.style.transformOrigin = `${Math.max(0, box.right - left - 24)}px top`;
    }

    /**
     * Open the editor.
     * @param {'new'|'edit'} mode
     * @param {string|null} id section to edit (ignored for 'new')
     * @param {HTMLElement} from element that gets focus back on close
     */
    function open(mode, id, from) {
      if (!root) build();
      const state = getState();
      const list = state.sections.map(copy); let index = list.findIndex(section => section.id === id);
      if (mode === 'new' || index < 0) { if (list.length >= 12) { announce('专栏最多 12 个，请先删除一个。'); return; } list.push({id: null, name: '', emoji: '', color: COLORS[list.length % COLORS.length][0], preset: null, sources: [], include: [], exclude: []}); index = list.length - 1; mode = 'new'; }
      draft = {mode, list, index}; initial = JSON.stringify(list.map(payloadOf));
      trigger = from || (host.getRootNode?.().activeElement || document.activeElement); busy = false;
      ui.toggle.setAttribute('aria-expanded', 'false'); ui.picker.hidden = true; ui.result.hidden = true; ui.url.value = ''; ui.error.hidden = true; ui.nameError.hidden = true;
      paint(); place();
      root.inert = false; root.dataset.open = 'true'; trigger?.setAttribute?.('aria-expanded', 'true');
      requestAnimationFrame(() => ui.name.focus({preventScroll: true}));
    }
    function close(restoreFocus = true) {
      if (!isOpen()) return;
      root.dataset.open = 'false'; root.inert = true; trigger?.setAttribute?.('aria-expanded', 'false');
      if (restoreFocus) trigger?.focus?.({preventScroll: true});
    }

    function paint() {
      const section = current(), state = getState();
      ui.title.textContent = draft.mode === 'new' ? '新建专栏' : '编辑专栏';
      ui.name.value = section.name; ui.emoji.value = section.emoji; ui.include.value = section.include.join('，'); ui.exclude.value = section.exclude.join('，');
      ui.sourcesField.hidden = ui.wordsField.hidden = Boolean(section.preset); ui.presetNote.hidden = !section.preset;
      for (const swatch of ui.swatches.children) { const on = swatch.dataset.value === section.color; swatch.setAttribute('aria-checked', String(on)); swatch.tabIndex = on ? 0 : -1; }
      paintSources(); paintFoot();
      const missing = state.removed || [];
      ui.restore.hidden = missing.length === 0;
      if (missing.length) { ui.restore.replaceChildren(`已删除的默认专栏：${missing.map(id => ({ai: 'AI 新闻', hn: 'Hacker News'}[id] || id)).join('、')} `, Object.assign(make('button', 'ghost', '恢复'), {type: 'button'})); ui.restore.lastChild.dataset.act = 'restore'; }
    }
    function paintFoot() {
      ui.earlier.disabled = draft.mode === 'new' || draft.index === 0; ui.later.disabled = draft.mode === 'new' || draft.index === draft.list.length - 1;
      ui.earlier.hidden = ui.later.hidden = ui.del.hidden = draft.mode === 'new';
      ui.del.textContent = '删除'; delete ui.del.dataset.confirm;
      ui.save.disabled = busy; ui.save.textContent = busy ? '保存中…' : draft.mode === 'new' ? '创建' : '保存';
    }

    // ---- sources ----
    function dot(url) { const dotNode = make('span', 'health'); const state = health.get(url) || statusFromReader(url); dotNode.dataset.state = state.state; dotNode.title = state.text || '尚未检测'; dotNode.setAttribute('role', 'img'); dotNode.setAttribute('aria-label', state.text || '尚未检测'); return dotNode; }
    function statusFromReader(url) {
      const source = getState().statuses.get(url); if (!source) return {state: '', text: ''};
      return source.reason ? {state: 'bad', text: `${source.message || '读取失败'}${source.hint ? '：' + source.hint : ''}`} : source.last_success_at ? {state: 'ok', text: '最近一次读取成功'} : {state: '', text: '等待读取'};
    }
    function paintSources() {
      const section = current();
      ui.sources.replaceChildren(...section.sources.map(source => {
        const row = make('li', 'sp-source'), label = make('span'); label.append(make('span', 'name', source.name), make('span', 'host', urlHost(source.url)));
        const test = make('button', 'ghost icon-only'); test.type = 'button'; test.dataset.act = 'test'; test.dataset.url = source.url; test.setAttribute('aria-label', `检测 ${source.name}`); test.title = '检测'; test.innerHTML = ICON.test;
        const remove = make('button', 'ghost icon-only'); remove.type = 'button'; remove.dataset.act = 'remove'; remove.dataset.url = source.url; remove.setAttribute('aria-label', `移除 ${source.name}`); remove.title = '移除'; remove.innerHTML = ICON.close;
        row.append(dot(source.url), label, test, remove); return row;
      }));
      ui.empty.hidden = section.sources.length > 0; ui.count.textContent = `${section.sources.length} / ${MAX_SOURCES}`;
      if (!ui.picker.hidden) paintCatalog();
    }
    function addSource(source) {
      const section = current();
      if (section.sources.some(item => item.url === source.url)) { announce('这个来源已经在专栏里了。'); return; }
      if (section.sources.length >= MAX_SOURCES) { showError(`一个专栏最多 ${MAX_SOURCES} 个来源。`); return; }
      section.sources.push({id: source.id, url: source.url, name: source.name}); ui.error.hidden = true; paintSources();
    }
    async function ensureCatalog() {
      if (catalog) return;
      try {
        const response = await request('/catalog', {cache: 'no-store'}); if (!response.ok) throw new Error('catalog');
        const value = await response.json(); if (!Array.isArray(value.sources) || !Array.isArray(value.categories)) throw new Error('catalog');
        catalog = value; catalogError = '';
      } catch { catalogError = '来源目录暂时无法载入，请稍后重试，或直接粘贴 RSS 地址。'; }
    }
    function paintCatalog() {
      ui.chips.replaceChildren(...[{id: 'all', name: '全部'}, ...(catalog?.categories || [])].map(item => { const chip = make('button', 'sp-chip', item.name); chip.type = 'button'; chip.dataset.act = 'category'; chip.dataset.id = item.id; chip.setAttribute('aria-pressed', String(item.id === category)); return chip; }));
      if (!catalog) { ui.catalog.replaceChildren(Object.assign(make('li', 'sp-empty', catalogError || '正在载入来源目录…'))); return; }
      const have = new Set(current().sources.map(source => source.url));
      const rows = catalog.sources.filter(source => (category === 'all' || source.category === category) && (!filter || `${source.name} ${source.url} ${source.note || ''}`.toLocaleLowerCase().includes(filter)));
      ui.catalog.replaceChildren(...(rows.length ? rows.map(source => {
        const row = make('li', 'sp-cat-row'), label = make('span', 'name', source.name);
        if (source.language) label.append(make('span', 'lang', source.language === 'zh' ? '中文' : source.language.toUpperCase()));
        if (source.note) label.append(make('span', 'note', source.note));
        const test = make('button', 'ghost icon-only'); test.type = 'button'; test.dataset.act = 'test'; test.dataset.url = source.url; test.setAttribute('aria-label', `检测 ${source.name}`); test.title = '检测'; test.innerHTML = ICON.test;
        const added = have.has(source.url), add = make('button', added ? 'ghost' : 'outline', added ? '已添加' : '添加'); add.type = 'button'; add.dataset.act = 'add'; add.dataset.url = source.url; add.disabled = added; add.setAttribute('aria-label', `${added ? '已添加' : '添加'} ${source.name}`);
        row.append(dot(source.url), label, test, add); return row;
      }) : [make('li', 'sp-empty', '没有符合的来源。')]));
    }
    async function check(url, name) {
      health.set(url, {state: 'busy', text: '检测中…'}); repaintHealth();
      const result = await testSource(url);
      health.set(url, result.ok ? {state: 'ok', text: `可访问 · ${result.title || name || urlHost(url)}${result.latest ? ' · 最新：' + result.latest.title : ''}`} : {state: 'bad', text: `${result.error.message}${result.error.hint ? '：' + result.error.hint : ''}`});
      repaintHealth(); return result;
    }
    function repaintHealth() {
      for (const list of [ui.sources, ui.catalog]) for (const row of list.children) {
        const test = row.querySelector('[data-act=test]'); if (!test) continue;
        const old = row.querySelector('.health'), fresh = dot(test.dataset.url); old?.replaceWith(fresh);
      }
    }
    /** POST /source-test; always resolves to `{ok:true,…}` or `{ok:false,error:{code,message,hint}}`. */
    async function testSource(url) {
      try {
        const response = await request('/source-test', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url})});
        const value = await response.json();
        if (response.status === 429) return {ok: false, error: {code: 'busy', message: '检测请求太多', hint: '请稍等几秒再试。'}};
        if (value && typeof value.ok === 'boolean') return value.ok || value.error ? value : {ok: false, error: {code: 'failed', message: '检测失败', hint: '请稍后重试。'}};
      } catch { /* network problem between the page and the app server */ }
      return {ok: false, error: {code: 'failed', message: '没能完成检测', hint: '请确认本地服务仍在运行，然后重试。'}};
    }
    async function probe() {
      const url = normaliseUrl(ui.url.value); if (!url) { ui.url.focus(); return; }
      ui.url.value = url; showResult({state: 'busy'});
      const result = await testSource(url); health.set(result.ok ? result.url : url, result.ok ? {state: 'ok', text: '可访问'} : {state: 'bad', text: result.error.message});
      showResult(result.ok ? {state: 'ok', result, url: result.url} : {state: 'bad', error: result.error});
    }
    function showResult(value) {
      const box = ui.result; box.hidden = false; box.dataset.state = value.state; box.replaceChildren();
      if (value.state === 'busy') { box.append(make('strong', '', '正在检测…'), make('span', 'latest', '最多需要十几秒。')); return; }
      if (value.state === 'bad') { box.append(make('strong', '', value.error.message), make('span', 'fix', value.error.hint || '')); return; }
      const {result} = value, add = make('button', 'outline', '添加到专栏'); add.type = 'button'; add.dataset.act = 'add-probed'; add.dataset.url = result.url; add.dataset.name = result.title || urlHost(result.url); add.style.marginTop = '8px';
      box.append(make('strong', '', `${result.title || urlHost(result.url)} · ${result.format === 'atom' ? 'Atom' : 'RSS'} · ${result.count} 篇`),
        make('span', 'latest', result.latest ? `最新：${result.latest.title}${result.latest.published_at ? '（' + ago(result.latest.published_at) + '）' : ''}` : '订阅里暂时没有文章。'));
      if (result.discovered) box.append(make('span', 'fix', `已从网页自动找到订阅地址：${result.url}`));
      if (result.china_warning) box.append(make('span', 'warn', result.china_warning));
      box.append(add);
    }

    // ---- actions ----
    function setColor(color) { current().color = color; for (const swatch of ui.swatches.children) { const on = swatch.dataset.value === color; swatch.setAttribute('aria-checked', String(on)); swatch.tabIndex = on ? 0 : -1; } }
    function showError(text) { ui.error.textContent = text; ui.error.hidden = false; }
    function move(step) {
      const to = draft.index + step; if (to < 0 || to >= draft.list.length) return;
      const [row] = draft.list.splice(draft.index, 1); draft.list.splice(to, 0, row); draft.index = to; paintFoot();
      announce(`「${row.name || '新专栏'}」现在排第 ${to + 1} 位（保存后生效）。`);
    }
    async function commit(list, message, after) {
      busy = true; paintFoot(); ui.error.hidden = true;
      try { const value = await save(list); busy = false; close(false); after?.(value); announce(message); }
      catch (error) { busy = false; paintFoot(); showError(error.message); }
    }
    async function submit() {
      const section = current(); section.name = ui.name.value.trim();
      if (!section.name) { ui.nameError.textContent = '请给专栏起个名字。'; ui.nameError.hidden = false; ui.name.focus(); return; }
      if (!section.preset) { section.include = words(ui.include.value); section.exclude = words(ui.exclude.value); if (section.include.length > MAX_KEYWORDS || section.exclude.length > MAX_KEYWORDS) { showError(`关键词最多 ${MAX_KEYWORDS} 个。`); return; } }
      const created = draft.mode === 'new', before = new Set(getState().sections.map(row => row.id));
      await commit(draft.list.map(payloadOf), created ? `已创建专栏「${section.name}」。` : `已保存专栏「${section.name}」。`, value => {
        const fresh = created ? value.sections.find(row => !before.has(row.id)) : value.sections.find(row => row.id === section.id);
        if (fresh) select(fresh.id);
      });
    }
    async function remove() {
      if (ui.del.dataset.confirm !== 'true') { ui.del.dataset.confirm = 'true'; ui.del.textContent = '确认删除'; setTimeout(() => { if (ui.del.dataset.confirm === 'true') { ui.del.textContent = '删除'; delete ui.del.dataset.confirm; } }, 4000); return; }
      const name = current().name, list = draft.list.filter((_, at) => at !== draft.index).map(payloadOf);
      await commit(list, `已删除专栏「${name}」。`);
    }
    async function onClick(event) {
      const button = event.target.closest('[data-act], .sp-swatch'); if (!button || !root.contains(button)) return;
      if (button.classList.contains('sp-swatch')) { setColor(button.dataset.value); return; }
      const act = button.dataset.act, url = button.dataset.url;
      if (act === 'close') close();
      else if (act === 'save') submit();
      else if (act === 'delete') remove();
      else if (act === 'earlier') move(-1);
      else if (act === 'later') move(1);
      else if (act === 'restore') { try { const value = await restore(); close(false); announce('已恢复默认专栏。'); select(value.sections.find(row => row.preset)?.id); } catch (error) { showError(error.message); } }
      else if (act === 'toggle-picker') {
        const show = ui.picker.hidden; ui.picker.hidden = !show; button.setAttribute('aria-expanded', String(show));
        if (show) { paintCatalog(); await ensureCatalog(); paintCatalog(); ui.filter.focus({preventScroll: true}); }
      }
      else if (act === 'category') { category = button.dataset.id; paintCatalog(); }
      else if (act === 'add') { const row = catalog?.sources.find(source => source.url === url); if (row) { addSource(row); health.has(url) || check(url, row.name); } }
      else if (act === 'remove') { const section = current(); section.sources = section.sources.filter(source => source.url !== url); paintSources(); }
      else if (act === 'test') { const name = current().sources.find(source => source.url === url)?.name || catalog?.sources.find(source => source.url === url)?.name; button.disabled = true; await check(url, name); button.disabled = false; }
      else if (act === 'probe') probe();
      else if (act === 'add-probed') { addSource({url, name: button.dataset.name}); ui.url.value = ''; ui.result.hidden = true; }
    }
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === 'Enter' && event.target.matches('#sp-name, #sp-emoji, #sp-include, #sp-exclude')) { event.preventDefault(); submit(); }
    }

    return {destroy(){lifecycle.abort();close();root?.remove();},open, close, isOpen, refresh: () => { if (isOpen()) repaintHealth(); }};
  }

  window.NewsSectionEditor = {mount, normaliseUrl};
})();
