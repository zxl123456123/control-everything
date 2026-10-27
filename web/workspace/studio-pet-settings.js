/*
 * Studio settings page for the news-reader pet: an on/off switch and a compact pet-form picker.
 * Both controls read and write NewsPetPrefs, so the embedded news reader follows them live (storage events)
 * and a change made in the reader (its own switcher or the dial's "hide pet") shows up here without a reload.
 *   window.StudioPetSettings.mount(container) -> dispose()
 * Requires news-pets.js and news-pet-prefs.js to be loaded first.
 */
'use strict';
window.StudioPetSettings = {
  /**
   * Renders the settings page into `container` and keeps it in sync with the stored preference.
   * @param {HTMLElement} container the Studio content area; its previous children are replaced
   * @returns {() => void} stops listening and empties the container
   */
  mount(container) {
    const prefs = window.NewsPetPrefs, pets = window.NewsPets;
    const make = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const row = (title, description, control) => {
      const text = make('div', 'ce-setting-text');
      text.append(make('h3', '', title), typeof description === 'string' ? make('p', '', description) : description);
      const node = make('div', 'ce-setting-row');
      node.append(text, ...(control ? [control] : []));
      return node;
    };

    const page = make('section', 'ce-settings-page ce-pet-settings');
    const heading = make('div', 'ce-heading'); heading.append(make('h1', '', '设置'));
    page.append(heading);
    if (!prefs || !pets) {
      const notice = make('div', 'ce-empty', '宠物组件未加载，暂时无法设置。'); notice.setAttribute('role', 'status');
      page.append(notice);
      container.replaceChildren(page);
      return () => container.replaceChildren();
    }

    const toggle = make('button', 'ce-switch');
    toggle.type = 'button'; toggle.id = 'studio-pet-enabled';
    toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', '显示宠物');
    toggle.append(make('span', 'ce-switch-thumb'));

    const select = make('select', 'ce-pet-select');
    select.id = 'studio-pet-form'; select.setAttribute('aria-label', '宠物形象');

    const dialHint = make('p', 'ce-pet-dial-hint');
    const status = make('p', 'ce-pet-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');

    const group = make('div', 'ce-settings-group');
    group.append(
      row('显示宠物', '在新闻阅读器里陪你阅读，也可以随时在这里关掉。', toggle),
      row('宠物形象', '切换后立即生效，新闻阅读器无需刷新。', select),
      row('快捷转盘', dialHint)
    );
    const section = make('section', 'ce-pet-section'); section.setAttribute('aria-labelledby', 'studio-pet-title');
    const title = make('h2', 'ce-pet-title', '宠物'); title.id = 'studio-pet-title';
    section.append(title, group, status);
    page.append(section);
    container.replaceChildren(page);

    /** Brings both controls in line with the stored preference. Rebuilds the option list only when the registry changed. */
    function sync(next = prefs.read()) {
      const forms = pets.list();
      if (select.options.length !== forms.length || forms.some((form, index) => select.options[index].value !== form.name)) {
        select.replaceChildren(...forms.map(form => { const option = make('option', '', form.label); option.value = form.name; return option; }));
      }
      select.value = next.pet;
      toggle.setAttribute('aria-checked', String(next.enabled));
      const dialPets = forms.filter(form => form.name !== 'spider');
      dialHint.textContent = next.pet === 'spider' || !dialPets.length
        ? '蜘蛛没有转盘；换成奶龙或狸花猫后，点击宠物即可打开。'
        : '点击宠物，或使用新闻阅读器顶部的「宠物转盘」按钮；方向键选择，回车执行，Esc 关闭。';
    }
    const saved = ok => { status.textContent = ok ? '' : '无法保存设置，请检查浏览器的存储权限。'; sync(); };
    const onToggle = () => saved(prefs.setEnabled(toggle.getAttribute('aria-checked') !== 'true'));
    const onSelect = () => saved(prefs.setPet(select.value));

    toggle.addEventListener('click', onToggle);
    select.addEventListener('change', onSelect);
    const unsubscribe = prefs.subscribe(sync);
    sync();
    return () => { unsubscribe(); container.replaceChildren(); };
  }
};
