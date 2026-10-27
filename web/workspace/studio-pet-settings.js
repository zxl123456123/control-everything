/*
 * Studio settings page for the personal-workbench pet (设置 -> 外观 -> 宠物).
 *   window.StudioPetSettings.mount(container) -> dispose()
 * Every control reads and writes NewsPetPrefs, so the pet follows live (storage events) and a change made
 * elsewhere (the reader's own switcher, the dial's quiet or hide action) shows up here without a reload.
 * Press feedback, the switch and the sliding segmented control are CSS only (studio-preview.css, .ce-pet-*),
 * so prefers-reduced-motion and the light/dark tokens are handled in one place.
 * The page is deliberately quiet: short labels, one helper line, the rest lives in tooltips and aria-labels.
 * Requires news-pets.js, news-pet-dial.js and news-pet-prefs.js to be loaded first; news-pet-wheel.js adds the live ring preview.
 */
'use strict';
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SCOPE_TITLES = {any: '通用', news: '新闻页', studio: '工作台页'};
  const SIZE_OPTIONS = [['small', '小'], ['medium', '中'], ['large', '大']];
  const DOCK_OPTIONS = [['auto', '自动'], ['bl', '左下'], ['br', '右下']];
  const ASK = '宠物组件未加载，暂时无法设置。';

  // Static thumbnails drawn from the pets' own colours: nothing is mounted until the pet is switched on.
  const PORTRAITS = {
    spider: {blurb: '轻巧的网络管家', shapes: [
      ['path', {d: 'M32 4v56 M4 32h56 M12 12l40 40 M52 12L12 52', stroke: 'currentColor', 'stroke-opacity': '.14', 'stroke-width': '1', fill: 'none'}],
      ['circle', {cx: 32, cy: 32, r: 11, stroke: 'currentColor', 'stroke-opacity': '.14', fill: 'none'}],
      ['circle', {cx: 32, cy: 32, r: 22, stroke: 'currentColor', 'stroke-opacity': '.14', fill: 'none'}],
      ['path', {d: 'M24 34Q12 26 8 14 M23 37Q10 34 5 28 M23 40Q10 44 6 52 M25 43Q16 52 14 58 M40 34Q52 26 56 14 M41 37Q54 34 59 28 M41 40Q54 44 58 52 M39 43Q48 52 50 58', stroke: '#3b3b4a', 'stroke-width': '2.6', 'stroke-linecap': 'round', fill: 'none'}],
      ['ellipse', {cx: 32, cy: 39, rx: 10, ry: 11, fill: '#2a2a35'}],
      ['ellipse', {cx: 32, cy: 41, rx: 2.2, ry: 3.2, fill: '#e05d5d'}],
      ['circle', {cx: 32, cy: 25, r: 8, fill: '#383849'}],
      ['circle', {cx: 28.5, cy: 24, r: 2.5, fill: '#fff'}], ['circle', {cx: 35.5, cy: 24, r: 2.5, fill: '#fff'}],
      ['circle', {cx: 28.9, cy: 24.3, r: 1.2, fill: '#111'}], ['circle', {cx: 35.1, cy: 24.3, r: 1.2, fill: '#111'}]]},
    naidragon: {blurb: '圆滚滚的小黄龙', shapes: [
      ['ellipse', {cx: 32, cy: 57, rx: 17, ry: 3, fill: 'currentColor', 'fill-opacity': '.12'}],
      ['ellipse', {cx: 22, cy: 55, rx: 6, ry: 3.2, fill: '#f2b61f'}], ['ellipse', {cx: 42, cy: 55, rx: 6, ry: 3.2, fill: '#f2b61f'}],
      ['ellipse', {cx: 32, cy: 42, rx: 17, ry: 14, fill: '#ffcf33'}],
      ['ellipse', {cx: 32, cy: 46, rx: 10, ry: 8, fill: '#fff0b3'}],
      ['ellipse', {cx: 15, cy: 42, rx: 3.5, ry: 6, fill: '#ffc41f'}], ['ellipse', {cx: 49, cy: 42, rx: 3.5, ry: 6, fill: '#ffc41f'}],
      ['ellipse', {cx: 32, cy: 26, rx: 15, ry: 13, fill: '#ffd94d'}],
      ['circle', {cx: 25, cy: 13, r: 3, fill: '#7bd35a'}], ['circle', {cx: 32, cy: 11, r: 3.4, fill: '#7bd35a'}], ['circle', {cx: 39, cy: 13, r: 3, fill: '#7bd35a'}],
      ['ellipse', {cx: 26, cy: 26, rx: 2, ry: 2.7, fill: '#1f1a12'}], ['ellipse', {cx: 38, cy: 26, rx: 2, ry: 2.7, fill: '#1f1a12'}],
      ['circle', {cx: 26.7, cy: 25, r: .8, fill: '#fff'}], ['circle', {cx: 38.7, cy: 25, r: .8, fill: '#fff'}],
      ['circle', {cx: 20.5, cy: 31, r: 2.8, fill: '#ff9aa5', 'fill-opacity': '.8'}], ['circle', {cx: 43.5, cy: 31, r: 2.8, fill: '#ff9aa5', 'fill-opacity': '.8'}],
      ['path', {d: 'M29 31q3 3 6 0', stroke: '#1f1a12', 'stroke-width': '1.6', 'stroke-linecap': 'round', fill: 'none'}]]},
    tabbycat: {blurb: '懒洋洋的狸花猫', shapes: [
      ['ellipse', {cx: 32, cy: 52, rx: 15, ry: 9, fill: '#a8723a'}],
      ['path', {d: 'M16 30L18 9l13 11z', fill: '#a8723a'}], ['path', {d: 'M48 30L46 9 33 20z', fill: '#a8723a'}],
      ['path', {d: 'M20 25l1-9 6 6z', fill: '#f2a7a7'}], ['path', {d: 'M44 25l-1-9-6 6z', fill: '#f2a7a7'}],
      ['ellipse', {cx: 32, cy: 34, rx: 17, ry: 14, fill: '#b97d3f'}],
      ['path', {d: 'M32 21v6 M26.5 22l1 5 M37.5 22l-1 5', stroke: '#6b4423', 'stroke-width': '2', 'stroke-linecap': 'round', fill: 'none'}],
      ['ellipse', {cx: 32, cy: 40, rx: 7, ry: 5, fill: '#f1dcc0'}],
      ['ellipse', {cx: 25, cy: 33, rx: 3, ry: 3.4, fill: '#f4c542'}], ['ellipse', {cx: 39, cy: 33, rx: 3, ry: 3.4, fill: '#f4c542'}],
      ['ellipse', {cx: 25, cy: 33, rx: 1, ry: 2.4, fill: '#1a1a1a'}], ['ellipse', {cx: 39, cy: 33, rx: 1, ry: 2.4, fill: '#1a1a1a'}],
      ['path', {d: 'M30 38h4l-2 2.4z', fill: '#e58a96'}],
      ['path', {d: 'M32 40.4v1.4 M32 41.8q-2 2-4 1 M32 41.8q2 2 4 1', stroke: '#6b4423', 'stroke-width': '1.1', 'stroke-linecap': 'round', fill: 'none'}],
      ['path', {d: 'M14 38h8 M14 42l8-2 M50 38h-8 M50 42l-8-2', stroke: '#6b4423', 'stroke-opacity': '.5', 'stroke-width': '1', fill: 'none'}]]},
  };
  const GENERIC_PORTRAIT = {blurb: '', shapes: [['circle', {cx: 32, cy: 34, r: 18, fill: 'currentColor', 'fill-opacity': '.2'}]]};

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const svg = (shapes, size, className, box = 64) => {
    const root = document.createElementNS(SVG_NS, 'svg');
    root.setAttribute('viewBox', `0 0 ${box} ${box}`); root.setAttribute('width', String(size)); root.setAttribute('height', String(size));
    root.setAttribute('aria-hidden', 'true'); root.setAttribute('focusable', 'false');
    if (className) root.setAttribute('class', className);
    for (const [tag, attrs] of shapes) {
      const shape = document.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attrs)) shape.setAttribute(name, String(value));
      root.append(shape);
    }
    return root;
  };
  const icon = path => svg([['path', {d: path, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}]], 18, 'ce-chip-icon', 24);
  /** One setting: a short label and its control. `hint` is a tooltip and the control's accessible description, never visible text. */
  const row = (title, hint, control) => {
    const text = make('div', 'ce-setting-text');
    text.append(make('h3', '', title));
    const node = make('div', 'ce-setting-row ce-pet-row');
    node.title = hint; control.setAttribute('aria-description', hint);
    node.append(text, control);
    return node;
  };
  const section = (title, ...children) => {
    const node = make('section', 'ce-pet-section');
    const heading = make('h2', 'ce-pet-title', title);
    const group = make('div', 'ce-settings-group');
    group.append(...children);
    node.append(heading, group);
    return node;
  };

  /** A switch button; `sync(on)` mirrors the stored state into aria-checked. */
  function makeSwitch(id, label) {
    const node = make('button', 'ce-switch');
    node.type = 'button'; node.id = id;
    node.setAttribute('role', 'switch'); node.setAttribute('aria-label', label);
    node.append(make('span', 'ce-switch-thumb'));
    return node;
  }

  /** A sliding segmented control over native radios, so arrow keys and screen readers work without extra code. */
  function makeSegmented(name, label, options) {
    const node = make('div', 'ce-seg');
    node.setAttribute('role', 'radiogroup'); node.setAttribute('aria-label', label);
    node.append(make('span', 'ce-seg-thumb'));
    const inputs = options.map(([value, text]) => {
      const wrap = make('label', 'ce-seg-option ce-press');
      const input = make('input'); input.type = 'radio'; input.name = name; input.value = value;
      wrap.append(input, make('span', 'ce-seg-label', text));
      node.append(wrap);
      return input;
    });
    return {node, inputs};
  }

  window.StudioPetSettings = {
    /**
     * Renders the settings page into `container` and keeps it in sync with the stored preference.
     * @param {HTMLElement} container the Studio content area; its previous children are replaced
     * @returns {() => void} stops listening and empties the container
     */
    mount(container) {
      const prefs = window.NewsPetPrefs, pets = window.NewsPets, dial = window.NewsPetDial;
      const page = make('div', 'ce-settings-page ce-pet-settings');
      const heading = make('div', 'ce-heading'); heading.append(make('h1', '', '设置'));
      page.append(heading);
      if (!prefs || !pets || !dial) {
        const notice = make('div', 'ce-empty', ASK); notice.setAttribute('role', 'status');
        page.append(notice);
        container.replaceChildren(page);
        return () => container.replaceChildren();
      }

      const status = make('p', 'ce-pet-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      const notify = (text, tone = 'warn') => { status.textContent = text; status.dataset.tone = tone; };

      // --- 显示 + 形象 ---
      const enabled = makeSwitch('studio-pet-enabled', '显示宠物');
      const cards = make('div', 'ce-pet-cards'); cards.id = 'studio-pet-form';
      cards.setAttribute('role', 'radiogroup'); cards.setAttribute('aria-label', '宠物形象');
      // One visible line, only while a news-page-only form is selected: the rest of the helper text stays in tooltips.
      const newsOnlyNote = make('p', 'ce-pet-note'); newsOnlyNote.id = 'studio-pet-news-only';
      const pickerRow = make('div', 'ce-pet-picker'); pickerRow.append(cards, newsOnlyNote);

      // --- 行为 ---
      const quiet = makeSwitch('studio-pet-quiet', '安静模式');
      const newsFx = makeSwitch('studio-pet-news-fx', '新闻页互动');
      const pin = makeSwitch('studio-pet-dial-pin', '固定转盘');
      const size = makeSegmented('studio-pet-size', '宠物大小', SIZE_OPTIONS);
      const dock = makeSegmented('studio-pet-dock', '宠物位置', DOCK_OPTIONS);

      // --- 转盘 ---
      const count = make('span', 'ce-dial-count');
      const reset = make('button', 'ce-link-button ce-press', '恢复默认'); reset.type = 'button'; reset.id = 'studio-pet-dial-reset';
      const dialHead = make('div', 'ce-dial-head');
      const dialTitle = make('div', 'ce-setting-text');
      const dialHint = make('p', 'ce-pet-dial-hint', `点击宠物打开，选 ${dial.MIN}–${dial.MAX} 个`);
      dialTitle.append(make('h3', '', '转盘功能'), dialHint);
      const dialTools = make('div', 'ce-dial-tools'); dialTools.append(count, reset);
      dialHead.append(dialTitle, dialTools);
      const preview = make('div', 'ce-dial-preview'); preview.setAttribute('aria-hidden', 'true');
      const previewIcons = new Map();
      for (const action of dial.POOL) {
        const node = make('span', 'ce-dial-dot'); node.append(svg([['path', {d: action.icon, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}]], 16, '', 24));
        previewIcons.set(action.id, node); preview.append(node);
      }
      const chips = new Map();
      const chipGroups = make('div', 'ce-dial-groups');
      for (const scope of Object.keys(SCOPE_TITLES)) {
        const list = dial.POOL.filter(action => action.scope === scope);
        if (!list.length) continue;
        const group = make('div', 'ce-dial-group'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', SCOPE_TITLES[scope]);
        group.append(make('span', 'ce-dial-scope', SCOPE_TITLES[scope]));
        for (const action of list) {
          const chip = make('button', 'ce-chip ce-press'); chip.type = 'button'; chip.dataset.action = action.id;
          chip.append(icon(action.icon), make('span', 'ce-chip-label', action.label));
          chips.set(action.id, chip); group.append(chip);
        }
        chipGroups.append(group);
      }
      const dialPicker = make('div', 'ce-dial-picker'); dialPicker.append(preview, chipGroups);
      const dialBody = make('div', 'ce-dial-card'); dialBody.append(dialHead, dialPicker);

      page.append(
        section('宠物', row('显示宠物', '个人工作台的小伙伴；蜘蛛只在新闻页', enabled), pickerRow),
        section('行为',
          row('安静模式', '宠物原地休息，没有动作和提示', quiet),
          row('新闻页互动', '新文章、读完、采集失败时给一点小反应', newsFx),
          row('大小', '宠物在页面里的大小', size.node),
          row('位置', '左下会停在侧栏右边；窄屏的工作台页面里不显示', dock.node)),
        section('转盘', row('固定转盘', '展开后留在原处，点击别处不收起；Esc 或再点宠物收起', pin), dialBody), status);
      container.replaceChildren(page);

      // --- state -> DOM ---
      const cardInputs = new Map();
      function buildCards(forms) {
        cardInputs.clear();
        cards.replaceChildren(...forms.map(form => {
          const portrait = PORTRAITS[form.name] || GENERIC_PORTRAIT;
          const label = make('label', 'ce-pet-card ce-press');
          const input = make('input'); input.type = 'radio'; input.name = 'studio-pet-form'; input.value = form.name;
          const art = make('span', 'ce-pet-art'); art.append(svg(portrait.shapes, 72, 'ce-pet-portrait'));
          const meta = make('span', 'ce-pet-meta');
          meta.append(make('span', 'ce-pet-name', form.label));
          label.title = portrait.blurb;
          const tick = make('span', 'ce-pet-tick'); tick.append(svg([['path', {d: 'M18 33l10 10 18-22', fill: 'none', stroke: 'currentColor', 'stroke-width': '7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}]], 14, '', 64));
          label.append(input, art, meta, tick);
          input.addEventListener('change', () => { if (input.checked) saved(prefs.setPet(form.name)); });
          cardInputs.set(form.name, input);
          return label;
        }));
      }
      const mark = (node, on) => node.setAttribute('aria-checked', String(on));
      function selectOption(group, value) {
        const index = Math.max(0, group.inputs.findIndex(input => input.value === value));
        group.inputs.forEach((input, at) => { input.checked = at === index; });
        group.node.dataset.index = String(index);
      }

      /** Brings every control in line with the stored preference. Rebuilds the cards only when the registry changed. */
      function sync(next = prefs.read()) {
        const forms = pets.list();
        if (cardInputs.size !== forms.length || forms.some(form => !cardInputs.has(form.name))) buildCards(forms);
        for (const [name, input] of cardInputs) input.checked = name === next.pet;
        const everywhere = forms.filter(form => form.status).map(form => form.label), picked = forms.find(form => form.name === next.pet);
        newsOnlyNote.hidden = !picked || picked.status || !everywhere.length;
        newsOnlyNote.textContent = everywhere.length ? `${picked ? picked.label : ''}只在新闻页出现；想在工作台里看到，请选${everywhere.join('或')}。` : '';
        mark(enabled, next.enabled); mark(quiet, next.quiet); mark(newsFx, next.newsFx); mark(pin, next.dialPin);
        selectOption(size, next.size); selectOption(dock, next.dock);
        for (const [id, chip] of chips) chip.setAttribute('aria-pressed', String(next.dial.includes(id)));
        count.textContent = `已选 ${next.dial.length} / ${dial.MAX}`;
        dialBody.dataset.full = String(next.dial.length >= dial.MAX);
        reset.hidden = dial.serialize(next.dial) === dial.serialize(dial.DEFAULTS);
        layoutPreview(next.dial);
      }
      /** The ring preview: chosen actions sit on the ring in order, the others are folded into the hub. */
      function layoutPreview(ids) {
        const wheel = window.NewsPetWheel, spots = wheel ? wheel.layout(ids.length, 46) : [];
        for (const [id, node] of previewIcons) {
          const at = ids.indexOf(id);
          node.dataset.on = String(at >= 0 && Boolean(spots[at]));
          node.style.setProperty('--x', (spots[at] ? spots[at].x : 0) + 'px'); node.style.setProperty('--y', (spots[at] ? spots[at].y : 0) + 'px');
          node.style.setProperty('--i', String(Math.max(0, at)));
        }
      }
      function saved(ok) { notify(ok ? '' : '无法保存设置，请检查浏览器的存储权限。', 'error'); sync(); }

      const bindSwitch = (node, field) => node.addEventListener('click', () => saved(prefs.set({[field]: node.getAttribute('aria-checked') !== 'true'})));
      bindSwitch(enabled, 'enabled'); bindSwitch(quiet, 'quiet'); bindSwitch(newsFx, 'newsFx'); bindSwitch(pin, 'dialPin');
      for (const [group, field] of [[size, 'size'], [dock, 'dock']]) {
        for (const input of group.inputs) input.addEventListener('change', () => { if (input.checked) saved(prefs.set({[field]: input.value})); });
      }
      for (const [id, chip] of chips) {
        chip.addEventListener('click', () => {
          const result = dial.toggle(prefs.read().dial, id);
          if (!result.ok) { notify(result.reason === 'min' ? `转盘至少保留 ${dial.MIN} 个功能。` : `转盘最多 ${dial.MAX} 个功能，先取消一个再添加。`); sync(); return; }
          saved(prefs.set({dial: result.ids}));
        });
      }
      reset.addEventListener('click', () => saved(prefs.set({dial: [...dial.DEFAULTS]})));

      const unsubscribe = prefs.subscribe(sync);
      sync();
      return () => { unsubscribe(); container.replaceChildren(); };
    }
  };
})();
