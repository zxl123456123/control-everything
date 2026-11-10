/* Same-document news loader; the host owns its lifetime. */
'use strict';
(function () {
  let modules;
  function loadModules() {
    if (!modules) modules = (async () => {
      for (const src of ['/news-spider.js','/news-pets.js','/news-pet-dial.js','/news-pet-wheel.js','/news-pet-prefs.js','/news-pet-director.js','/news-pet-status.js','/news-section-editor.js','/news-sections.js','/news-search.js','/news-settings.js','/news-reader.js']) {
        const name = {'/news-spider.js':'NewsSpider','/news-pets.js':'NewsPets','/news-pet-dial.js':'NewsPetDial','/news-pet-wheel.js':'NewsPetWheel','/news-pet-prefs.js':'NewsPetPrefs','/news-pet-director.js':'NewsPetDirector','/news-pet-status.js':'PetStatusFeed','/news-section-editor.js':'NewsSectionEditor','/news-sections.js':'NewsSections','/news-search.js':'NewsSearch','/news-settings.js':'NewsSettings','/news-reader.js':'NewsReaderUI'}[src];
        if (window[name]) continue;
        await new Promise((resolve, reject) => {
          const script = document.createElement('script'); script.src = src; script.async = false;
          script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('新闻资源加载失败，请重试。')); };
          document.head.append(script);
        });
      }
    })().catch(error => { modules = null; throw error; });
    return modules;
  }
  function mount(host, {onReturn, themeHost = host} = {}) {
    let reader, pending, visible = false, destroyed = false;
    const controller = new AbortController();
    async function ensure() {
      if (reader || destroyed) return;
      if (pending) return pending;
      pending = (async () => {
        host.textContent = '正在打开新闻…';
        const [response] = await Promise.all([(window.CERemoteContext?.fetch || fetch)('/news', {signal:controller.signal, credentials:'same-origin'}), loadModules()]);
        if (!response.ok) throw new Error('新闻暂不可用，请重试。');
        const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
        const root = parsed.querySelector('.news-reader-root');
        if (!root) throw new Error('新闻模板不完整，请重试。');
        if (destroyed) return;
        root.dataset.embedded = 'true';
        const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/news-reader.css';
        const styled = new Promise((resolve,reject) => {style.onload=resolve;style.onerror=()=>reject(new Error('新闻样式加载失败，请重试。'));});
        const sectionsStyle=document.createElement('link');sectionsStyle.rel='stylesheet';sectionsStyle.href='/news-sections.css';
        host.replaceChildren(style, sectionsStyle, root);
        await styled; if (destroyed) return;
        const syncTheme = () => { root.dataset.theme = themeHost.dataset.theme || 'light'; };
        syncTheme();
        observer = new MutationObserver(syncTheme); observer.observe(themeHost, {attributes:true, attributeFilter:['data-theme']});
        reader = window.NewsReaderUI.mount(root, {embedded:true, onReturn, themeHost:root}); reader.setVisible(visible);
      })().catch(error => {
        if (destroyed) return;
        host.textContent = error.message;
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重试';
        retry.addEventListener('click', () => ensure()); host.append(retry);
      }).finally(() => { pending = null; });
      return pending;
    }
    let observer;
    return {setVisible(next) { visible = !!next; reader?.setVisible(visible); if (visible) void ensure(); },
      destroy() { if (destroyed) return; destroyed = true; controller.abort(); observer?.disconnect(); reader?.destroy(); },
      inspect:() => ({mounted:!!reader, visible, destroyed, reader:reader?.inspect()})};
  }
  window.NewsSurface = {mount};
})();
