'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const embedded = window.parent !== window && new URLSearchParams(location.search).get('embedded') === '1';
  let active = !embedded, activityGeneration = 0;
  let theme, unmountTheme, researchComposing = false, initialTheme = window.CEUITheme?.pageTheme;
  function mountTheme() {
    if (embedded) { initialTheme?.dispose(); initialTheme = null; return; }
    theme = initialTheme || window.CEUITheme?.earlyRead('ce.news.theme'); initialTheme = null;
    if (theme) {
      $('theme').disabled = false;
      unmountTheme = theme.mount({roots: [document.documentElement, $('news-room'), $('research-panel')], toggles: [$('theme')], status: $('theme-error'),
        aliases: {'--bg':'--ce-bg','--paper':'--ce-panel','--ink':'--ce-text','--muted':'--ce-sub','--line':'--ce-line','--soft':'--ce-soft','--chosen':'--ce-primary','--on':'--ce-on-primary','--accent':'--ce-sub'}});
    } else { $('theme').disabled = true; $('theme-error').hidden = false; $('theme-error').textContent = '主题资源未加载，请刷新后重试。'; }
  }
  function unmountAppearance() { unmountTheme?.(); unmountTheme = null; theme?.dispose(); theme = null; }
  mountTheme();
  let csrf = null, frameObjectUrl = null, feedTimer = null, frameRequest = 0;
  async function readerFetch(url, options = {}) {
    if (destroyed || window.CERemoteContext?.active === false) throw new Error('新闻页面已失效，请重新打开。');
    if (!canPoll()) throw new Error('新闻已暂停，请返回新闻后重试。');
    const generation = activityGeneration;
    const aliases = {'/sample':'reader', '/article':'article', '/research':'research', '/research/latest':'research/latest', '/translate':'translate', '/reader/refresh':'reader/refresh'};
    const requested = new URL(url, location.origin);
    const target = aliases[requested.pathname] ? '/api/workspace/news/' + aliases[requested.pathname] + requested.search : url;
    const headers = new Headers(options.headers); headers.set('X-Session-Client', 'panel'); headers.delete('X-Preview-Request');
    if (options.method === 'POST') {
      if (!csrf) { const response = await (typeof window !== 'undefined' && window.CERemoteContext ? window.CERemoteContext.fetch : fetch)('/api/bootstrap', {headers:{'X-Session-Client':'panel'}}); if (!response.ok) throw new Error('无法连接新闻服务'); csrf = (await response.json()).csrf_token; }
      headers.set('X-Session-CSRF', csrf);
    }
    if (!canPoll() || generation !== activityGeneration) throw new Error('新闻已暂停，请返回新闻后重试。');
    return (typeof window !== 'undefined' && window.CERemoteContext ? window.CERemoteContext.fetch : fetch)(target, {...options, headers});
  }
  let storeKey = null, articleRetry = null, dayTimer = null, pendingOpen = null;
  const articleAttempts = new Map();
  const articles = new Map(), nodes = new Map(), documents = new Map(), loading = new Map();
  const tasks = new Map(), translations = new Map(), failedImages = new Set();
  let records = {}, currentId = null, selected = 'inbox', stream = 'ai', language = 'original';
  // Which pet is shown, and whether pets are on, lives in NewsPetPrefs so the Studio settings and this page stay in step.
  const director = window.NewsPetDirector, prefs = window.NewsPetPrefs, initialPrefs = prefs.read();
  let petPrefs = initialPrefs, petName = initialPrefs.pet, petEnabled = initialPrefs.enabled, petFallback = null;
  let petStatus = {agentsRunning:false, quotaLeftPercent:null}, realStatus = {...petStatus}, statusOverride = {}, statusFeed = null;
  // `paused` is the manual pause button; quiet mode (a stored preference) holds the pet still in the same way, see still().
  let engine = null, researchEngine = null, unsubscribePrefs = null, paused = false, collecting = false, undo = null, arrivalQueue = [];
  let visibleIds = [], translationRun = 0, translationAbort = null, renderedKey = '', destroyed = false;
  let mediaView = 'article', imageIndex = 0, mediaKey = '';
  let readingView = 'list', listScroll = 0;
  let researchJob = null, researchTimer = null, researchTopic = 'coding', researchBusy = false, researchFrameSeq = null;
  let feedReading = false, researchReading = false, suspended = false, feedAttempt = 0, lastFeedKey = '', feedFailed = false, feedSettled = false, arrivalBatch = 0;
  let historyReading = false, historyRestored = false;
  const still = () => paused || petPrefs.quiet;
  const stateText = () => still() ? (petPrefs.quiet ? '安静模式' : '动画已暂停') : collecting ? '正在采集信息' : '等待阅读';
  let wheel = null; // the shortcut wheel (NewsPetWheel); while it is open the pet stays quiet so no bubble covers it
  const reactor = director.createReactor({engine:() => engine, enabled:() => petEnabled && Boolean(engine) && !still() && petPrefs.newsFx && canPoll() && !wheel?.isOpen()});
  const canPoll = () => active && !destroyed && !suspended && !document.hidden && window.CERemoteContext?.active !== false;
  const researchEvents = new Map(), researchData = new Map();
  const topicQueries = {coding:'AI coding workflow coding agents tips', agents:'AI agents context engineering tools workflows', claude:'Claude Code coding tips workflows', models:'GPT Gemini coding models releases', tibo:'Tibo AI coding agents'};
  const changeText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  function safeUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; } }
  function validItem(item) { return item && /^[a-f0-9]{24}$/.test(item.id) && typeof item.title === 'string' && typeof item.source_name === 'string' && typeof item.source_id === 'string' && safeUrl(item.url) && ['ai', 'hn'].includes(item.stream) && (item.summary === null || typeof item.summary === 'string'); }
  function state(id) { return records[id] && typeof records[id] === 'object' ? records[id] : (records[id] = {read_at:null, archived_at:null, saved:false}); }
  function itemSignature(item) { return JSON.stringify([item.title, item.summary, item.url, item.body_blocks, item.images, item.feed_content, item.feed_content_truncated]); }
  function displayTitle(item) {
    if (item.content_origin !== 'x_public_embed') return item.title;
    const paragraph = (item.body_blocks || []).find(block => block.type === 'p' && typeof block.text === 'string' && block.text.trim())?.text || item.title;
    const clean = paragraph.replace(/https?:\/\/[^\s<>]+/giu, '').replace(/\s+/g, ' ').trim();
    const sentence = clean.match(/^.*?[.!?。！？](?=\s|$)/u)?.[0] || clean;
    const characters = Array.from(sentence);
    return characters.length > 80 ? characters.slice(0, 79).join('') + '…' : sentence || 'X 公开帖文';
  }
  function imageList(item) {
    const seen = new Set(), images = [];
    const documentImages = docFor(item)?.images;
    const candidates = [...(Array.isArray(documentImages) ? documentImages : []), ...(Array.isArray(item.images) ? item.images : [])];
    if (item.cover_url && !candidates.some(image => image?.kind === 'cover' && safeUrl(image.url))) candidates.push({url:item.cover_url, kind:'cover'});
    const ordered = [...candidates.filter(image => image?.kind !== 'cover'), ...candidates.filter(image => image?.kind === 'cover')];
    for (const raw of ordered) {
      const image = typeof raw === 'string' ? {url:raw} : raw;
      const url = safeUrl(image?.url); if (!url || seen.has(url)) continue;
      seen.add(url); images.push({url, alt:typeof image.alt === 'string' ? image.alt : '', caption:typeof image.caption === 'string' ? image.caption : ''});
    }
    return images;
  }
  function save() {
    if (destroyed || window.CERemoteContext?.active === false) return;
    if (!storeKey) return;
    for (const [id, item] of articles) state(id).snapshot = {...item};
    try { (window.CERemoteContext ? window.CERemoteContext.storage('localStorage') : (window.localStorage ?? localStorage)).setItem(storeKey, JSON.stringify(records)); $('storage-warning').hidden = true; }
    catch { $('storage-warning').hidden = false; }
  }
  function restoreStorage(scope) {
    if (typeof scope !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(scope)) throw new Error('新闻数据目录尚未确认。');
    const key = 'news-focused-reader-v2:' + scope;
    if (storeKey && key !== storeKey) { location.reload(); throw new Error('数据目录已切换，正在重新载入。'); }
    if (storeKey) return;
    storeKey = key;
    try {
      const stored = JSON.parse((window.CERemoteContext ? window.CERemoteContext.storage('localStorage') : (window.localStorage ?? localStorage)).getItem(storeKey) || '{}');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) records = stored;
    } catch { $('storage-warning').hidden = false; }
    for (const [id, row] of Object.entries(records)) if (row && validItem(row.snapshot) && row.snapshot.id === id) articles.set(id, row.snapshot);
  }
  function dateText(value) { const date = new Date(value); if (!value || !Number.isFinite(date.getTime())) return '日期未知'; const year = new Intl.DateTimeFormat('en', {year:'numeric', timeZone:'Asia/Shanghai'}); return new Intl.DateTimeFormat('zh-CN', {year:year.format(date) === year.format(new Date()) ? undefined : 'numeric', month:'short', day:'numeric', timeZone:'Asia/Shanghai'}).format(date); }
  function dayKey(value) { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit'}).format(date) : ''; }
  function publication(item) { return item.stream === 'hn' ? item.submitted_at : item.published_at || item.updated_at || (/^\d{4}-\d{2}-\d{2}$/.test(item.published_raw || '') ? item.published_raw : null); }
  function inDateRange(item) { return $('date-range').value === 'all' || dayKey(publication(item)) === dayKey(Date.now()); }
  function unavailable(item) { return item.completeness === 'feed_summary' || state(item.id).unavailable_signature === itemSignature(item); }
  function firstParagraph(item) { return bodyBlocks(item).find(block => block.type === 'p' && block.text.trim())?.text || ''; }
  function scheduleDayChange() {
    clearTimeout(dayTimer); if (!canPoll()) return;
    dayTimer = setTimeout(() => { render(); scheduleDayChange(); }, Date.parse(dayKey(Date.now()) + 'T00:00:00+08:00') + 86400000 - Date.now() + 50);
  }
  function matches(item, view = selected) { const row = state(item.id); return view === 'read' ? !!row.read_at : view === 'saved' ? !!row.saved : view === 'archived' ? !!row.archived_at : !row.archived_at; }
  function notice(text, canUndo = false) { $('toast-text').textContent = text; $('toast').hidden = false; $('undo').hidden = !canUndo; }
  let narrowLayout = null, desktopDirectoryOpen = false;
  function setDirectory(open) { if (readingView === 'article' && !matchMedia('(max-width:720px)').matches) desktopDirectoryOpen = open; $('animation-stage').dataset.directory = open ? 'open' : 'closed'; $('open-directory').setAttribute('aria-expanded', String(open)); $('open-directory').setAttribute('aria-label', open ? '收起新闻目录' : '展开新闻目录'); $('open-directory').title = open ? '收起新闻目录' : '展开新闻目录'; $('directory-backdrop').hidden = !open || !matchMedia('(max-width:720px)').matches; $('directory').inert = readingView === 'article' && matchMedia('(max-width:720px)').matches && !open; }
  function setReadingView(view) {
    if (readingView === 'list' && view === 'article') listScroll = $('title-list').scrollTop;
    readingView = view; $('animation-stage').dataset.readingView = view;
    $('reader').inert = view !== 'article';
    $('directory-title').textContent = view === 'list' ? $('date-range').value === 'all' ? '全部新闻' : '今日新闻' : '标题目录';
    setDirectory(view === 'article' && !matchMedia('(max-width:720px)').matches && desktopDirectoryOpen); syncHomeLayout();
    if (view === 'list') {
      $('title-list').scrollTop = listScroll;
      (nodes.get(currentId) || $('search')).focus({preventScroll:true});
      engine?.pointAt(null); cancelInvisible();
    }
  }
  function visibleElement(node) {
    if (!node || !node.isConnected || node.closest('[hidden]')) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent);
      if (css.display === 'none' || css.visibility === 'hidden') return false;
      if (/(auto|scroll|hidden|clip)/.test(css.overflow + css.overflowX + css.overflowY)) {
        const clip = parent.getBoundingClientRect(); left = Math.max(left, clip.left); top = Math.max(top, clip.top); right = Math.min(right, clip.right); bottom = Math.min(bottom, clip.bottom);
      }
    }
    return rect.bottom > top && rect.top < bottom && rect.right > left && rect.left < right;
  }
  const mountPet = options => window.NewsPets.mount(petName, options);
  // Only the full 3D pets (the ones that draw a status chip and own a dial) take the size and dock preferences.
  const fullPet = () => !petFallback && Boolean(window.NewsPets.list().find(pet => pet.name === petName)?.status);
  function mountMainPet() {
    const api = mountPet({root:$('animation-stage'), canvas:$('spider-canvas'), depot:$('web-depot'), onCapture:event => { const task = tasks.get(typeof event === 'string' ? event : event.id); $('spider-state').textContent = task?.kind === 'arrival' ? '正在接住新信息' : '正在收进仓库'; }, onDelivered:settleTask, onCancel:settleTask, dock:petDock, options:director.petOptions(petPrefs, fullPet())});
    api.setStatus?.(petStatus); api.setCollecting?.(collecting); return api;
  }
  function mountResearchPet() {
    const api = mountPet({root:$('research-animation-stage'), canvas:$('research-spider-canvas'), depot:$('research-web-depot')});
    api.setOptions({scale:0.7, dial:false}); api.setCollecting(collecting); api.setStatus?.(petStatus); return api;
  }
  function syncPetControls() {
    document.documentElement.dataset.pet = petName;
    const allowed = new Set(window.NewsPets.list().map(pet => pet.name));
    for (const select of document.querySelectorAll('.pet-select')) {
      for (const option of [...select.options]) if (!allowed.has(option.value)) option.remove();
      select.value = petFallback || petName;
      const group = select.closest('.pet-switch'); if (group) group.hidden = allowed.size < 2;
    }
    $('pet-dial').hidden = !petEnabled;
  }
  /** Stores the pet form; applyPrefs() reacts to the change like it does to one made in the Studio settings. */
  function switchPet(name) {
    if (destroyed || !prefs.setPet(name)) { syncPetControls(); return false; }
    return true;
  }
  function destroyPets() {
    for (const id of [...tasks.keys()]) cancelTask(id);
    arrivalQueue = []; engine?.destroy(); researchEngine?.destroy(); engine = researchEngine = null;
  }
  /** Mounts or removes the pet engines so they match the stored preference and which panels are open. */
  function syncPets() {
    if (destroyed || window.CERemoteContext?.active === false) return;
    // Reveal the stage first: a pet measures its surroundings when it mounts.
    for (const node of [$('spider-canvas'), document.querySelector('.spider-home'), $('research-spider-canvas'), document.querySelector('.research-spider-home')]) node.hidden = !petEnabled;
    if (petEnabled) {
      if (!engine) { engine = mountMainPet(); if (still()) engine.pause(); }
      if ($('research-panel').open && $('research-details').open && !researchEngine) { researchEngine = mountResearchPet(); if (still()) researchEngine.pause(); }
    } else { wheel?.close('api'); destroyPets(); }
    syncPetControls(); syncMotion();
  }
  function applyPrefs(next) {
    if (destroyed) return;
    const before = petPrefs, switched = next.pet !== petName;
    petPrefs = next; petName = next.pet; petEnabled = next.enabled;
    if (switched) { petFallback = null; wheel?.close('api'); destroyPets(); }
    syncPets();
    if (!switched && engine) {
      if (next.size !== before.size || next.dock !== before.dock) engine.setOptions?.(director.petOptions(next, fullPet()));
    }
    if (next.quiet !== before.quiet) { syncMotion(); $('spider-state').textContent = stateText(); if (!next.quiet) runArrival(); }
    if (switched && engine) { if (!still() && !$('research-panel').open) engine.pointAt($('article-title'), '阅读'); render(); runArrival(); }
  }
  window.addEventListener('news-pet-fallback', event => {
    if (destroyed || event.detail.pet !== petName) return;
    petFallback = event.detail.fallback; syncPetControls();
    notice(`${window.NewsPets.list().find(pet => pet.name === petName)?.label || '宠物'}暂时无法加载，已先用${window.NewsPets.list().find(pet => pet.name === petFallback)?.label || '默认宠物'}。`);
  });
  // Poll the status endpoints only while a status-aware pet is actually animating on an active, visible page.
  function syncPetStatusFeed() {
    const wanted = Boolean(window.PetStatusFeed) && petEnabled && canPoll() && !still() && Boolean(window.NewsPets?.list().find(pet => pet.name === petName)?.status);
    if (wanted && !statusFeed) {
      const fetchJson = async (url, signal) => {
        const response = await (window.CERemoteContext ? window.CERemoteContext.fetch : fetch)(url, {headers:{'X-Session-Client':'panel'}, credentials:'same-origin', cache:'no-store', signal});
        if (!response.ok) throw new Error('status');
        return response.json();
      };
      statusFeed = window.PetStatusFeed.start({apply:setRealPetStatus, fetchJson});
    } else if (!wanted && statusFeed) { statusFeed.stop(); statusFeed = null; }
  }
  function pushPetStatus() { petStatus = {...realStatus, ...statusOverride}; engine?.setStatus?.(petStatus); researchEngine?.setStatus?.(petStatus); return {...petStatus}; }
  function setPetStatus(next) { for (const [key, value] of Object.entries(next || {})) { if (value === undefined) delete statusOverride[key]; else statusOverride[key] = value; } return pushPetStatus(); }
  function setRealPetStatus(next) { Object.assign(realStatus, next); return pushPetStatus(); }
  function clearPetStatusOverride() { statusOverride = {}; return pushPetStatus(); }
  // resting spot for the 3D pet: the reader's bottom-right gutter, just above the footer, so it never sits on the article text or title
  function petDock() {
    const stage = $('animation-stage'), reader = $('reader'), footer = reader?.querySelector('.reader-footer');
    if (!stage || !footer || !reader.getClientRects().length || innerWidth < 720) return null; // narrow screens: stay at the depot, the pet-switch row sits where the dock would be
    const s = stage.getBoundingClientRect(), r = reader.getBoundingClientRect(), f = footer.getBoundingClientRect();
    return {x:Math.round(r.right - s.left - 56), y:Math.round(f.top - s.top - 6)};
  }
  // Inside the Studio the reader is an iframe, so navigation targets the surrounding page; stand-alone it opens the Studio.
  function goStudio(hash) { if (embedded) window.parent.location.hash = hash; else location.assign('/studio' + hash); }
  function openSearch() { if (readingView === 'article') $('open-directory').click(); $('search').focus(); }
  // Six fixed slots (NewsPetDial); the handler table is shared with the Studio mascot, this page only says where it is.
  const petActions = () => director.createActions({
    here:'news', go:goStudio, search:openSearch, prefs, notify:notice,
    afterHide:() => $('refresh').focus(),
  });
  document.querySelectorAll('.pet-select').forEach(select => select.addEventListener('change', () => switchPet(select.value)));
  // Where the pet rests, as a viewport rectangle: the reader's dock when it has one, else the depot slot.
  function wheelAnchor() {
    const dock = petDock(), stage = $('animation-stage');
    if (dock && stage && fullPet()) { const s = stage.getBoundingClientRect(); return {left:s.left + dock.x - 48, top:s.top + dock.y - 60, width:96, height:60}; }
    return $('web-depot');
  }
  wheel = window.NewsPetWheel.create({
    tapTarget:$('animation-stage'), anchor:wheelAnchor, actions:petActions, ignore:'#pet-dial', returnFocus:() => $('pet-dial'),
    onOpen:() => { $('pet-dial').setAttribute('aria-expanded', 'true'); },
    onClose:() => { $('pet-dial').setAttribute('aria-expanded', 'false'); },
  });
  $('pet-dial').addEventListener('click', event => { if (petEnabled) wheel.toggle(event.detail === 0); }); // detail 0: keyboard activation, so focus moves into the wheel
  function cancelTask(id) { tasks.delete(id); engine?.cancel(id); if (id.startsWith('arrival:')) { $('arrival-title').hidden = true; $('reader-state').hidden = false; } }
  function settleTask(event) {
    if (destroyed || window.CERemoteContext?.active === false) return;    const id = typeof event === 'string' ? event : event.id, task = tasks.get(id);
    if (!task) return;
    tasks.delete(id);
    if (task.kind === 'arrival') {
      $('arrival-title').hidden = true; $('reader-state').hidden = false;
      if (!arrivalQueue.length) { if (arrivalBatch > 1) reactor.react('arrival', {count:arrivalBatch}); arrivalBatch = 0; }
    }
    $('spider-state').textContent = stateText();
    queueMicrotask(() => { if (!destroyed) { render(); runArrival(); } });
  }
  function cancelInvisible() {
    let changed = false;
    for (const [id, task] of tasks) if (!visibleElement(task.node)) { cancelTask(id); changed = true; }
    if (changed) { render(); runArrival(); }
  }
  function createRow(item) {
    const row = make('button', 'title-row'); row.type = 'button'; row.dataset.id = item.id;
    const title = make('span', 'title-row-title'), meta = make('span', 'title-row-meta'), content = make('span', 'title-row-content'), thumbnail = make('img', 'title-row-thumbnail');
    thumbnail.alt = ''; thumbnail.loading = 'lazy'; thumbnail.referrerPolicy = 'no-referrer';
    thumbnail.addEventListener('error', () => { failedImages.add(thumbnail.src); thumbnail.hidden = true; });
    content.append(title, make('span', 'title-row-summary')); meta.append(make('span', 'row-dot'), make('span', 'row-source'), make('span', 'row-type'), make('span', 'row-date'), make('span', 'row-state'));
    row.append(content, thumbnail, meta); row.addEventListener('click', () => selectArticle(item.id, true)); return row;
  }
  function render() {
    if (!canPoll()) return;
    const previousIndex = Math.max(0, visibleIds.indexOf(currentId));
    const query = $('search').value.trim().toLocaleLowerCase();
    const items = [...articles.values()].filter(item => item.stream === stream && inDateRange(item) && !unavailable(item));
    $('directory-title').textContent = readingView === 'article' ? '标题目录' : $('date-range').value === 'all' ? '全部新闻' : '今日新闻';
    for (const view of ['inbox', 'read', 'saved', 'archived']) {
      document.querySelector(`[data-count="${view}"]`).textContent = items.filter(item => matches(item, view)).length;
      document.querySelector(`[data-view="${view}"]`).setAttribute('aria-pressed', String(selected === view));
    }
    visibleIds = [];
    let cursor = $('title-list').firstElementChild;
    for (const item of articles.values()) {
      let node = nodes.get(item.id);
      if (!node) { node = createRow(item); nodes.set(item.id, node); }
      const row = state(item.id), moving = tasks.has(item.id);
      const eligible = item.stream === stream && inDateRange(item) && !unavailable(item) && (matches(item) || moving && selected === 'inbox') && (!query || [displayTitle(item), item.title, item.source_name, firstParagraph(item)].join(' ').toLocaleLowerCase().includes(query));
      node.hidden = !eligible; if (eligible) visibleIds.push(item.id);
      node.dataset.pending = String(moving);
      changeText(node.querySelector('.title-row-title'), displayTitle(item));
      const excerpt = firstParagraph(item);
      changeText(node.querySelector('.title-row-summary'), excerpt); node.querySelector('.title-row-summary').hidden = !excerpt;
      const images = imageList(item), thumbnail = node.querySelector('.title-row-thumbnail');
      const thumbnailUrl = images.find(image => !failedImages.has(image.url))?.url;
      thumbnail.hidden = !thumbnailUrl; if (thumbnailUrl && thumbnail.getAttribute('src') !== thumbnailUrl) thumbnail.src = thumbnailUrl;
      changeText(node.querySelector('.row-type'), images.length ? '图文' : '文章');
      changeText(node.querySelector('.row-source'), item.source_name);
      changeText(node.querySelector('.row-date'), `${!item.submitted_at && !item.published_at && item.updated_at ? '更新 ' : ''}${dateText(publication(item))}`);
      node.querySelector('.row-date').hidden = $('date-range').value !== 'all' || !publication(item);
      changeText(node.querySelector('.row-state'), moving ? '归档中' : row.saved ? '★' : '');
      node.dataset.read = String(!!row.read_at);
      const dot = node.querySelector('.row-dot'); dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', row.read_at ? '已读' : '未读'); dot.title = row.read_at ? '已读' : '未读';
      // Only reorder a node when the incoming order changed.
      if (node !== cursor) $('title-list').insertBefore(node, cursor);
      cursor = node.nextElementSibling;
    }
    const nextId = visibleIds.includes(currentId) ? currentId : visibleIds[Math.min(previousIndex, visibleIds.length - 1)] || null;
    if (nextId !== currentId) {
      for (const [id, task] of tasks) if (task.kind === 'archive' && task.node === $('article-title')) cancelTask(id);
      currentId = nextId; $('article-scroll').scrollTop = 0; renderedKey = ''; mediaKey = ''; imageIndex = 0; stopTranslation();
    }
    for (const [id, node] of nodes) node.setAttribute('aria-current', String(id === currentId));
    $('list-total').textContent = `${visibleIds.length} 条`; $('list-empty').hidden = visibleIds.length > 0;
    $('list-empty-message').textContent = query ? '没有匹配的新闻' : ({read:'暂无已读新闻', saved:'暂无收藏新闻', archived:'暂无归档新闻'}[selected] || ($('date-range').value === 'all' ? '暂无可读新闻' : '今天还没有可读新闻'));
    $('clear-search').hidden = !query;
    observeNewsMood(query);
    $('show-history').hidden = $('date-range').value === 'all';
    renderArticle();
  }
  // Quiet, throttled reactions of the 3D pet to what the reader is showing; see NewsPetDirector for the gating and gaps.
  function observeNewsMood(query) {
    reactor.observeUnread([...articles.values()].filter(item => item.stream === stream && !records[item.id]?.read_at && !records[item.id]?.archived_at).length);
    if (visibleIds.length || !canPoll() || !petEnabled) return;
    if (query) reactor.later('search-empty', {key:query}, 800, () => !visibleIds.length && Boolean($('search').value.trim()));
    else if (!articles.size && feedSettled) reactor.later('list-empty', {}, 1200, () => !articles.size);
  }
  function stopTranslation() { translationRun++; translationAbort?.abort(); translationAbort = null; }
  function selectArticle(id, focus = false) {
    if (!canPoll() || !articles.has(id)) return;
    if (pendingOpen) nodes.get(pendingOpen.id)?.removeAttribute('aria-busy');
    pendingOpen = null;
    if (documents.get(id)?.reason === 'reader_busy') documents.delete(id);
    const item = articles.get(id);
    if (unavailable(item)) return;
    if (!bodyBlocks(item).length) { pendingOpen = {id, focus}; nodes.get(id)?.setAttribute('aria-busy', 'true'); void loadArticle(item); return; }
    for (const [taskId, task] of tasks) if (task.kind === 'archive' && task.node === $('article-title')) cancelTask(taskId);
    currentId = id; stopTranslation(); renderedKey = ''; mediaKey = ''; imageIndex = 0; $('article-scroll').scrollTop = 0;
    setReadingView('article'); render();
    if (petEnabled && !still() && petPrefs.newsFx) engine?.pointAt($('article-title'), '阅读');
    if (focus) $('article-title').focus({preventScroll:true});
  }
  function docFor(item) { const entry = documents.get(item.id); return entry?.signature === itemSignature(item) ? entry : null; }
  function bodyBlocks(item) {
    const entry = docFor(item);
    const blocks = entry?.content_kind === 'full_text' ? entry.blocks : item.body_blocks?.length ? item.body_blocks : entry?.blocks || [];
    const normalize = text => String(text || '').normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, '').toLocaleLowerCase();
    const titles = new Set([normalize(item.title), normalize(entry?.title)].filter(Boolean));
    return blocks.filter(block => {
      if (!block || !['p','h2','h3','h4','li','quote','code'].includes(block.type) || typeof block.text !== 'string') return false;
      return !/^h[234]$/.test(block.type) || !titles.has(normalize(block.text));
    });
  }
  function translationKey(item) { return item.id + ':' + JSON.stringify([displayTitle(item), item.summary, bodyBlocks(item).map(block => [block.type, block.text])]); }
  function renderArticle() {
    if (!canPoll()) return;    const item = articles.get(currentId), index = visibleIds.indexOf(currentId);
    $('article-position').textContent = item ? `${index + 1} / ${visibleIds.length}` : '0 / 0';
    $('previous').disabled = index <= 0; $('next').disabled = index < 0 || index >= visibleIds.length - 1;
    for (const id of ['mark-read', 'save-article', 'archive-article']) $(id).disabled = !item;
    $('article-content').hidden = !item; $('reader-empty').hidden = !!item;
    if (!item) {
      mediaView = 'article';
      $('empty-message').textContent = selected === 'archived' ? '暂无归档新闻。' : '暂无符合当前筛选的新闻，可调整筛选或采集信息。';
      $('translation-status').hidden = true; $('reader-state').textContent = '选择一条新闻开始阅读'; return;
    }
    const row = state(item.id), entry = docFor(item), blocks = bodyBlocks(item), key = translationKey(item), translated = translations.get(key);
    const useChinese = language !== 'original' && translated;
    const textAt = (offset, original) => useChinese && translated[offset] !== undefined ? translated[offset] : original;
    changeText($('article-title'), textAt(0, displayTitle(item)));
    $('article-title').title = textAt(0, displayTitle(item));
    const titlePair = language === 'bilingual' && translated?.[0] !== undefined;
    $('article-title-original').hidden = !titlePair; changeText($('article-title-original'), titlePair ? displayTitle(item) : '');
    const references = (entry?.references || item.references || []).filter(reference => safeUrl(reference.url));
    changeText($('article-source'), `${item.source_name}${references.length ? ` · ${references.length} 引用` : ''}`);
    const incomplete = !!(entry?.incomplete || item.incomplete), referencesTotal = entry?.references_total || item.references_total || references.length;
    const provenanceKey = JSON.stringify([item.id, item.author, item.published_at, item.submitted_at, item.published_raw, item.updated_at, entry?.updated_at, entry?.author, entry?.published_raw, references, referencesTotal, incomplete]);
    if ($('article-provenance').dataset.key !== provenanceKey) {
      const details = document.createDocumentFragment(), author = entry?.author || item.author, publishedRaw = entry?.published_raw || item.published_raw;
      if (typeof author === 'string') details.append(make('p', '', `作者：${author}`));
      const updated = entry?.updated_at || item.updated_at, date = item.submitted_at || item.published_at || updated;
      details.append(make('p', '', `${item.content_origin === 'hn_submission' ? '收录时间' : !item.published_at && updated ? '更新时间' : '发布时间'}：${date ? dateText(date) : publishedRaw || '日期未知'}`));
      if (item.content_origin === 'x_public_embed') details.append(make('p', '', incomplete ? '这是公开嵌入提供的帖文节选，未取得完整帖文或线程。' : '内容来自公开嵌入；未包含完整讨论线程。'));
      if (referencesTotal > references.length) details.append(make('p', '', `${referencesTotal} 条引用，展示其中 ${references.length} 条。`));
      for (const reference of references) {
        const link = make('a', '', reference.label || (reference.kind === 'x_post' ? '文中引用的 X 帖子' : reference.kind === 'paper' ? '相关论文' : '相关来源'));
        link.href = safeUrl(reference.url); link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.addEventListener('click', event => { const local = [...articles.values()].find(article => article.url === reference.url); if (local) { event.preventDefault(); if (!matches(local)) selected = state(local.id).archived_at ? 'archived' : 'inbox'; stream = local.stream; $('stream').value = stream; $('search').value = ''; if (!inDateRange(local)) $('date-range').value = 'all'; selectArticle(local.id, true); } });
        details.append(link);
      }
      $('article-provenance').replaceChildren(details); $('article-provenance').dataset.key = provenanceKey; $('source-details').open = false;
    }
    $('article-summary').hidden = true;
    $('article-summary-original').hidden = true;
    const hasBody = entry?.content_kind === 'full_text' || item.body_blocks?.length > 0;
    $('content-badge').textContent = imageList(item).length ? '图文' : '文章';
    $('content-status').hidden = true;
    $('retry-article').hidden = true;
    $('retry-article').disabled = [...loading.keys()].some(key => key.startsWith(item.id));
    renderMedia(item);
    const bodyKey = JSON.stringify([key, language, translated]);
    if (bodyKey !== renderedKey) {
      const fragment = document.createDocumentFragment();
      let list = null;
      blocks.forEach((block, offset) => {
        const value = textAt(offset + 2, block.text), tag = /^h[234]$/.test(block.type) ? 'h' + Math.min(5, Number(block.type[1]) + 1) : {li:'li', quote:'blockquote', code:'pre'}[block.type] || 'p';
        const node = make(tag, 'body-block');
        if (block.type === 'code') node.append(make('code', '', block.text)); else node.textContent = value;
        if (block.type === 'li') {
          if (!list) { list = make('ul', 'body-list'); fragment.append(list); }
          if (language === 'bilingual' && translated?.[offset + 2] !== undefined) node.append(make('p', 'original-text', block.text));
          list.append(node); return;
        }
        list = null;
        if (block.type !== 'code' && language === 'bilingual' && translated?.[offset + 2] !== undefined) { const pair = make('div', 'body-pair'); pair.append(node, make('p', 'original-text', block.text)); fragment.append(pair); }
        else fragment.append(node);
      });
      $('article-body').replaceChildren(fragment); renderedKey = bodyKey;
    }
    $('article-end').hidden = !hasBody || incomplete;
    $('mark-read').textContent = row.read_at ? '标为未读' : '标为已读';
    $('mark-read').setAttribute('aria-pressed', String(!!row.read_at));
    $('save-article').textContent = row.saved ? '已收藏' : '收藏'; $('save-article').setAttribute('aria-pressed', String(!!row.saved));
    $('archive-article').textContent = row.archived_at ? '移回' : '归档'; $('archive-article').setAttribute('aria-label', row.archived_at ? '移回阅读' : '已读并归档'); $('archive-article').disabled = tasks.has(item.id);
    $('reader-state').textContent = tasks.has(item.id) ? '正在归档…' : row.archived_at ? '已归档' : row.read_at ? '已读' : '未读';
    if (!entry && readingView === 'article') loadArticle(item);
    if (language !== 'original') ensureTranslation(item);
    else $('translation-status').hidden = true;
  }
  function imageFigure(image, index, gallery = false) {
    const figure = make('figure', 'article-image'), picture = make('img'), missing = make('p', 'image-unavailable', '这张图片暂时无法载入。'), pending = make('p', 'image-loading', '正在载入图片…');
    picture.alt = image.alt || `文章图片 ${index + 1}`; picture.referrerPolicy = 'no-referrer'; picture.decoding = 'async'; picture.loading = gallery || index === 0 ? 'eager' : 'lazy';
    const failed = failedImages.has(image.url);
    figure.hidden = failed && !gallery; missing.hidden = !failed; picture.hidden = failed;
    pending.hidden = failed || !gallery;
    picture.addEventListener('load', () => { pending.hidden = true; });
    picture.addEventListener('error', () => { failedImages.add(image.url); picture.hidden = true; pending.hidden = true; missing.hidden = false; figure.hidden = !gallery; });
    if (!failed) picture.src = image.url;
    figure.append(picture, pending, missing);
    if (image.caption || image.alt) {
      const caption = make('figcaption'), details = make('details');
      details.append(make('summary', '', '图片说明'), make('p', '', image.caption || image.alt)); caption.append(details); figure.append(caption);
    }
    return figure;
  }
  function renderMedia(item) {
    if (!canPoll()) return;    const images = imageList(item); imageIndex = Math.max(0, Math.min(imageIndex, images.length - 1));
    if (!images.length) mediaView = 'article';
    $('article-content').dataset.mediaView = mediaView;
    $('article-scroll').dataset.mediaView = mediaView;
    $('media-toolbar').hidden = !images.length; $('media-total').textContent = `${images.length} 张图片`;
    document.querySelectorAll('button[data-media-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mediaView === mediaView)));
    $('article-cover').hidden = !images.length || mediaView === 'gallery'; $('article-gallery').hidden = !images.length || mediaView !== 'gallery';
    const key = JSON.stringify([item.id, images, mediaView, imageIndex]); if (key === mediaKey) return;
    mediaKey = key;
    if (mediaView === 'gallery') { $('gallery-image').replaceChildren(imageFigure(images[imageIndex], imageIndex, true)); }
    else {
      $('article-cover').replaceChildren(...(images.length ? [imageFigure(images[0], 0)] : []));
      $('article-images').replaceChildren(...images.slice(1).map((image, index) => imageFigure(image, index + 1)));
    }
    $('image-position').textContent = images.length ? `${imageIndex + 1} / ${images.length}` : '';
    $('image-previous').disabled = imageIndex <= 0; $('image-next').disabled = imageIndex >= images.length - 1;
  }
  function validDocument(value, item) {
    return value && value.id === item.id && ['full_text', 'summary'].includes(value.content_kind) && Array.isArray(value.blocks) && value.blocks.every(block => block && ['p', 'h2', 'h3', 'h4', 'li', 'quote', 'code'].includes(block.type) && typeof block.text === 'string');
  }
  async function loadArticle(item, retry = false) {
    if (!canPoll()) return;
    const signature = itemSignature(item), requestKey = item.id + signature, generation = activityGeneration;
    if (loading.has(requestKey)) return;
    loading.set(requestKey, true);
    try {
      const response = await readerFetch('/article?id=' + encodeURIComponent(item.id) + (retry ? '&retry=1' : ''));
      if (!response.ok) throw new Error('正文读取未完成');
      const value = await response.json(); if (!validDocument(value, item)) throw new Error('正文格式不可用');
      if (!canPoll() || generation !== activityGeneration) return;
      if (articles.has(item.id) && itemSignature(articles.get(item.id)) === signature) documents.set(item.id, {...value, signature});
      if (value.content_kind !== 'full_text' && !value.feed_content && value.reason !== 'reader_busy' && !item.body_blocks?.length) { state(item.id).unavailable_signature = signature; save(); }
      if (value.reason === 'reader_busy' && (articleAttempts.get(requestKey) || 0) < 12) {
        articleAttempts.set(requestKey, (articleAttempts.get(requestKey) || 0) + 1);
        clearTimeout(articleRetry);
        articleRetry = setTimeout(() => {
          if (canPoll() && articles.has(item.id) && itemSignature(articles.get(item.id)) === signature) { documents.delete(item.id); if (currentId === item.id || pendingOpen?.id === item.id) void loadArticle(item); }
        }, 1500);
      }
    } catch {
      if (!canPoll() || generation !== activityGeneration) return;
      if (articles.has(item.id) && itemSignature(articles.get(item.id)) === signature) { documents.set(item.id, {id:item.id, signature, blocks:[], images:[], content_kind:'summary', reason:'unavailable'}); if (!item.body_blocks?.length && !item.feed_content) { state(item.id).unavailable_signature = signature; save(); } }
    } finally {
      loading.delete(requestKey);
      if (destroyed) return;
      if (pendingOpen?.id !== item.id) nodes.get(item.id)?.removeAttribute('aria-busy');
      if (pendingOpen?.id === item.id && canPoll() && generation !== activityGeneration) { void loadArticle(item); return; }
      if (pendingOpen?.id === item.id && canPoll() && (docFor(item)?.reason !== 'reader_busy' || articleAttempts.get(requestKey) >= 12)) {
        const pending = pendingOpen; pendingOpen = null; nodes.get(item.id)?.removeAttribute('aria-busy');
        if (visibleIds.includes(item.id) && !unavailable(item) && bodyBlocks(item).length) selectArticle(item.id, pending.focus);
      }
      if (unavailable(item)) render();
      if (currentId === item.id) { stopTranslation(); renderedKey = ''; render(); }
    }
  }
  $('retry-article').addEventListener('click', () => {
    const item = articles.get(currentId); if (!item) return;
    $('retry-article').disabled = true; $('content-status').textContent = '正在重新读取正文…';
    void loadArticle(item, true);
  });
  let translatingKey = null;
  function showTranslation(text) { $('translation-status').hidden = !text; $('translation-status').textContent = text; }
  async function ensureTranslation(item) {
    if (!canPoll()) return;
    const key = translationKey(item), blocks = bodyBlocks(item), texts = [displayTitle(item), '', ...blocks.map(block => block.type === 'code' ? '' : block.text)];
    const cache = translations.get(key);
    if (cache?.length === texts.length && texts.every((_, index) => typeof cache[index] === 'string')) { showTranslation('已翻译为中文 · 机器翻译，仅供参考'); return; }
    if (translatingKey === key && translationAbort && !translationAbort.signal.aborted) return;
    stopTranslation(); const run = translationRun, controller = new AbortController(); translationAbort = controller; translatingKey = key;
    showTranslation('正在翻译为中文…');
    const output = cache || new Array(texts.length); translations.set(key, output);
    try {
      const parts = [];
      texts.forEach((text, index) => { if (output[index] !== undefined) return; if (!text.trim()) { output[index] = text; return; } for (let start = 0; start < text.length; start += 5000) parts.push({index, text:text.slice(start, start + 5000)}); });
      let consumed = 0; const assembled = new Map();
      while (consumed < parts.length) {
        const batch = []; let chars = 0;
        while (consumed < parts.length && batch.length < 16 && chars + parts[consumed].text.length <= 18000) { const part = parts[consumed++]; chars += part.text.length; batch.push(part); }
        const response = await readerFetch('/translate', {method:'POST', headers:{'Content-Type':'application/json', 'X-Preview-Request':'1'}, body:JSON.stringify({texts:batch.map(part => part.text), source:'en', target:'zh'}), signal:controller.signal});
        if (!response.ok) throw new Error('本地翻译暂不可用，请稍后再试。');
        const value = await response.json();
        if (!Array.isArray(value.translations) || value.translations.length !== batch.length || value.translations.some(text => typeof text !== 'string')) throw new Error('翻译结果暂不可用，请稍后再试。');
        if (run !== translationRun || currentId !== item.id || language === 'original' || key !== translationKey(articles.get(item.id))) return;
        batch.forEach((part, index) => assembled.set(part.index, (assembled.get(part.index) || '') + value.translations[index]));
        for (const [index, text] of assembled) if (!parts.slice(consumed).some(part => part.index === index)) output[index] = text;
        renderedKey = ''; renderArticle(); showTranslation(consumed < parts.length ? `正在翻译为中文 · ${Math.round(consumed / parts.length * 100)}%` : '已翻译为中文 · 机器翻译，仅供参考');
      }
    } catch (error) {
      if (error.name !== 'AbortError' && run === translationRun && currentId === item.id) showTranslation(error.message || '本地翻译暂不可用，请稍后再试。');
    } finally { if (run === translationRun) { translationAbort = null; translatingKey = null; } }
  }
  function runArrival() {
    if (destroyed || window.CERemoteContext?.active === false) return;    if (!petEnabled || !engine || still() || !petPrefs.newsFx || tasks.size || !arrivalQueue.length) return;
    const item = arrivalQueue.shift(); $('arrival-title').textContent = '新消息 · ' + displayTitle(item); $('arrival-title').hidden = false; $('reader-state').hidden = true;
    const id = 'arrival:' + item.id;
    try { if (engine.capture({id, element:$('arrival-title'), label:displayTitle(item)})) { tasks.set(id, {kind:'arrival', node:$('arrival-title'), articleId:item.id}); $('spider-state').textContent = '新信息正在入站'; return; } } catch {}
    $('arrival-title').hidden = true; $('reader-state').hidden = false;
  }
  function archiveCurrent() {
    const item = articles.get(currentId); if (!item) return; const row = state(item.id);
    if (row.archived_at) { cancelTask(item.id); row.archived_at = null; save(); render(); notice('已移回阅读。'); return; }
    undo = {id:item.id, read_at:row.read_at, archived_at:row.archived_at}; row.read_at ||= new Date().toISOString(); row.archived_at = new Date().toISOString();
    let target = $('article-title');
    if (!visibleElement(target)) target = nodes.get(item.id)?.querySelector('.title-row-title');
    if (petEnabled && engine && !still() && petPrefs.newsFx && visibleElement(target)) {
      try { if (engine.capture({id:item.id, element:target, label:displayTitle(item)})) tasks.set(item.id, {kind:'archive', node:target, articleId:item.id}); } catch {}
    }
    if (!tasks.has(item.id)) reactor.react('archived'); // the capture is itself the pet's answer when it runs
    save(); render(); notice('已读并归档。', true);
  }
  function applySnapshot(value, animate = false, append = false) {
    if (destroyed || window.CERemoteContext?.active === false) return;
    if (!value?.sample?.streams || !Array.isArray(value.sample.sources)) throw new Error('本次采集未返回可用内容。');
    if (!storeKey || value.reader_id) restoreStorage(value.reader_id);
    const covers = new Map((value.covers?.items || []).map(item => [item.id, item]));
    const incoming = new Map(), oldIds = new Set(articles.keys());
    for (const [name, envelope] of Object.entries(value.sample.streams)) for (const raw of envelope.items || []) { const item = {...raw, stream:name, images:Array.isArray(raw.images) ? raw.images : [], body_blocks:Array.isArray(raw.body_blocks) ? raw.body_blocks : [], cover_url:covers.get(raw.id)?.url || raw.cover_url || null}; if (validItem(item)) incoming.set(item.id, item); }
    const failedSources = new Set(value.sample.sources.filter(source => source.reason).map(source => source.source_id || source.id));
    const retained = [];
    for (const [id, item] of articles) if (!incoming.has(id)) { const row = state(id); if (append || failedSources.has(item.source_id) || row.read_at || row.archived_at || row.saved || tasks.has(id)) retained.push([id, {...item, cached:true}]); else { cancelTask(id); nodes.get(id)?.remove(); nodes.delete(id); documents.delete(id); delete records[id]; } }
    articles.clear();
    for (const [id, item] of incoming) articles.set(id, item);
    for (const [id, item] of retained) articles.set(id, item);
    if (!currentId) currentId = [...articles.values()].find(item => item.stream === stream)?.id || null;
    const failureCount = failedSources.size, count = append ? articles.size : incoming.size;
    const time = new Date(value.sample.captured_at || NaN);
    const stamp = Number.isFinite(time.getTime()) ? new Intl.DateTimeFormat('zh-CN', {hour:'2-digit', minute:'2-digit', timeZone:'Asia/Shanghai'}).format(time) : '';
    $('snapshot-note').textContent = `${stamp ? stamp + ' 最近采集 · ' : ''}${count} 条信息${failureCount ? ` · ${failureCount} 个来源暂未更新，保留已有内容` : ''}`;
    if (animate && petEnabled && petPrefs.newsFx && !petPrefs.quiet) {
      const fresh = [...incoming.values()].filter(item => !oldIds.has(item.id));
      arrivalQueue.push(...fresh.slice(0, 3)); arrivalBatch = fresh.length;
    }
    save(); render(); cancelInvisible(); if (animate) runArrival();
  }
  document.querySelectorAll('[data-view]').forEach(control => control.addEventListener('click', () => { for (const [id, task] of tasks) if (task.kind === 'archive') cancelTask(id); selected = control.dataset.view; render(); }));
  $('search').addEventListener('input', () => { render(); cancelInvisible(); });
  $('date-range').addEventListener('change', () => { render(); cancelInvisible(); });
  $('show-history').addEventListener('click', () => { $('date-range').value = 'all'; render(); });
  bindSegmented($('stream'), value => { for (const [id, task] of tasks) if (task.kind === 'archive') cancelTask(id); stream = value; render(); });
  $('clear-search').addEventListener('click', () => { $('search').value = ''; render(); $('search').focus(); });
  $('directory-summary').addEventListener('click', event => { const show = event.currentTarget.getAttribute('aria-pressed') !== 'true'; event.currentTarget.setAttribute('aria-pressed', String(show)); event.currentTarget.setAttribute('aria-label', show ? '隐藏目录摘要' : '显示目录摘要'); $('directory').dataset.summaries = String(show); });
  $('back-to-list').addEventListener('click', () => setReadingView('list'));
  $('previous').addEventListener('click', () => { const index = visibleIds.indexOf(currentId); if (index > 0) selectArticle(visibleIds[index - 1]); });
  $('next').addEventListener('click', () => { const index = visibleIds.indexOf(currentId); if (index < visibleIds.length - 1) selectArticle(visibleIds[index + 1]); });
  $('open-directory').addEventListener('click', () => { const open = $('animation-stage').dataset.directory !== 'open'; setDirectory(open); if (open) $('search').focus(); });
  $('close-directory').addEventListener('click', () => { setDirectory(false); $('open-directory').focus(); cancelInvisible(); });
  $('directory-backdrop').addEventListener('click', () => { setDirectory(false); $('open-directory').focus(); cancelInvisible(); });
  $('mark-read').addEventListener('click', () => { if (!currentId) return; const row = state(currentId); row.read_at = row.read_at ? null : new Date().toISOString(); save(); render(); });
  $('save-article').addEventListener('click', () => { if (!currentId) return; const row = state(currentId); row.saved = !row.saved; save(); render(); if (row.saved) reactor.react('saved'); });
  $('archive-article').addEventListener('click', archiveCurrent);
  $('undo').addEventListener('click', () => { if (!undo) return; const {id, read_at, archived_at} = undo; cancelTask(id); Object.assign(state(id), {read_at, archived_at}); undo = null; save(); currentId = id; render(); notice('已撤销归档。'); });
  $('dismiss').addEventListener('click', () => { $('toast').hidden = true; });
  document.querySelectorAll('[data-language]').forEach(control => control.addEventListener('click', () => { language = control.dataset.language; stopTranslation(); document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === language))); renderedKey = ''; renderArticle(); }));
  function syncMotion() {
    if (destroyed || window.CERemoteContext?.active === false) return;    const show = petEnabled && !still() && canPoll();
    $('research-panel').dataset.motion = researchBusy && canPoll() && $('research-panel').open ? 'running' : 'paused';
    if (show && !$('research-panel').open) engine?.resume(); else engine?.pause();
    if (show && $('research-panel').open && $('research-details').open) researchEngine?.resume(); else researchEngine?.pause();
    $('pause').textContent = $('research-pause').textContent = paused ? '继续动画' : '暂停动画';
    syncPetStatusFeed();
  }
  $('pause').addEventListener('click', () => { paused = !paused; syncMotion(); $('spider-state').textContent = stateText(); if (!paused) runArrival(); });
  $('research-pause').addEventListener('click', () => $('pause').click());
  document.querySelectorAll('button[data-media-view]').forEach(button => button.addEventListener('click', () => { mediaView = button.dataset.mediaView; $('article-scroll').scrollTop = 0; renderMedia(articles.get(currentId)); }));
  $('image-previous').addEventListener('click', () => { imageIndex--; renderMedia(articles.get(currentId)); });
  $('image-next').addEventListener('click', () => { imageIndex++; renderMedia(articles.get(currentId)); });
  /**
   * Roving-tabindex radio group (WAI-ARIA radio pattern, the same model as Radix ToggleGroup type="single"):
   * one tab stop, arrows/Home/End move and select, and exactly one option is always checked.
   * @param {HTMLElement} root element with role="radiogroup" holding [role="radio"] buttons
   * @param {(value:string) => void} onChange called with the new data-value after a user change
   */
  function bindSegmented(root, onChange) {
    const items = [...root.querySelectorAll('[role="radio"]')];
    const choose = (item, focus) => {
      const changed = item.getAttribute('aria-checked') !== 'true';
      for (const other of items) { const on = other === item; other.setAttribute('aria-checked', String(on)); other.tabIndex = on ? 0 : -1; }
      if (focus) item.focus();
      if (changed) onChange(item.dataset.value);
    };
    root.addEventListener('click', event => { const item = event.target.closest('[role="radio"]'); if (item && root.contains(item)) choose(item, false); });
    root.addEventListener('keydown', event => {
      const at = items.indexOf(document.activeElement); if (at < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
      const step = {ArrowRight:1, ArrowDown:1, ArrowLeft:-1, ArrowUp:-1}[event.key];
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : step ? (at + step + items.length) % items.length : -1;
      if (next < 0) return; event.preventDefault(); choose(items[next], true);
    });
  }
  function setCollecting(active) {
    collecting = active; researchBusy = active; engine?.setCollecting?.(active);
    researchEngine?.setCollecting(active);
    $('refresh-label').textContent = active ? '查看采集进度' : '采集新闻'; $('refresh').dataset.running = String(active);
    $('research-panel').dataset.running = String(active);
    $('research-start').disabled = active; $('research-start').textContent = active ? '采集中…' : '开始采集';
    $('research-query').disabled = active; document.querySelectorAll('[data-topic]').forEach(button => { button.disabled = active; });
    $('capture-frames').disabled = active;
    if (!tasks.size) $('spider-state').textContent = still() ? stateText() : active ? '正在采集信息' : '等待阅读';
    syncMotion();
  }
  function frameUrl(value) {
    try { const url = new URL(value, location.href); return url.origin === location.origin && url.pathname === '/api/workspace/news/research-frame' && url.searchParams.has('job') && url.searchParams.has('name') ? url.href : null; } catch { return null; }
  }
  async function showResearchFrame(event) {
    if (!canPoll() || !$('research-panel').open || !$('research-details').open) return;
    const url = frameUrl(event.screenshot); if (!url) return;
    $('research-browser').hidden = false;
    const request = ++frameRequest, job = researchJob;
    researchFrameSeq = event.seq; $('research-frame').hidden = false; $('research-frame-empty').hidden = true;
    try {
      const response = await readerFetch(url); if (!response.ok) throw new Error('frame_unavailable');
      const blob = await response.blob(); if (!canPoll() || request !== frameRequest || job !== researchJob) return;
      if (frameObjectUrl) URL.revokeObjectURL(frameObjectUrl);
      frameObjectUrl = URL.createObjectURL(blob); $('research-frame').src = frameObjectUrl;
    } catch { if (request === frameRequest && job === researchJob) { $('research-frame').hidden = true; $('research-frame-empty').hidden = false; $('research-frame-empty').textContent = '截图暂不可用'; } }
    if (!canPoll() || request !== frameRequest || job !== researchJob) return;
     $('research-url').textContent = safeUrl(event.url) || safeUrl(event.requested_url) || event.title || '采集页面';
    $('research-host').textContent = eventHost(event) || '采集页面';
    $('research-frame-caption').textContent = event.title || event.message || '实际页面截图';
    for (const [seq, node] of researchEvents) node.setAttribute('aria-current', String(seq === researchFrameSeq));
    const frames = [...researchData.values()].filter(item => frameUrl(item.screenshot)), index = frames.findIndex(item => item.seq === event.seq);
    $('frame-position').textContent = `${index + 1} / ${frames.length}`;
    $('frame-previous').disabled = index <= 0; $('frame-next').disabled = index >= frames.length - 1;
    document.querySelectorAll('[data-step]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.step === eventStep(event))));
    document.querySelectorAll('.research-source').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.host === eventHost(event, true))));
    pointResearch(event);
  }
  function pointResearch(event) {
    if (!researchEngine || still() || !$('research-panel').open) return;
    const source = [...document.querySelectorAll('.research-source')].find(button => button.dataset.host === eventHost(event, true));
    researchEngine.pointAt(source?.querySelector('.source-name') || $('research-host'), event.stage || '浏览');
  }
  function eventHost(event, source = false) {
    try {
      const url = new URL(source && safeUrl(event.source_url) || safeUrl(event.url) || safeUrl(event.requested_url)), host = url.hostname.replace(/^www\./, '');
      const author = url.pathname.split('/')[1];
      return source && ['x.com','twitter.com'].includes(host) && author && !['search','i','home'].includes(author) ? `${host}/@${author}` : host;
    } catch { return ''; }
  }
  function eventStep(event) { return ['search','query','start'].includes(event.stage) ? 'search' : ['extract','normalize'].includes(event.stage) ? 'extract' : ['merge','complete'].includes(event.stage) ? 'merge' : 'visit'; }
  const ICON_PATHS = {ready:'M5 12.5l4.2 4.2L19 7', visited:'M7 17 17 7M9 7h8v8', blocked:'M12 7v6M12 16.8v.2'};
  /** Builds a 16px stroke icon from a fixed path table (no markup is parsed, so nothing from the page can reach it). */
  function stateIcon(kind) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    if (kind === 'active') { const ring = document.createElementNS(ns, 'circle'); ring.setAttribute('cx', '12'); ring.setAttribute('cy', '12'); ring.setAttribute('r', '8'); svg.append(ring); return svg; }
    const path = document.createElementNS(ns, 'path'); path.setAttribute('d', ICON_PATHS[kind]); svg.append(path); return svg;
  }
  /** Updates the per-source rows in place so a poll never replays the entry animation of rows already on screen. */
  function renderSourceRows(sources, latest) {
    const list = $('research-source-list'), rows = new Map([...list.querySelectorAll('.source-row')].map(row => [row.dataset.host, row]));
    $('research-source-empty').hidden = sources.size > 0;
    for (const [host, entry] of sources) {
      const blocked = ['blocked','error'].includes(entry.event.stage), kind = blocked ? 'blocked' : entry.extracted ? 'ready' : researchBusy && host === latest ? 'active' : 'visited';
      const text = {blocked:'受阻', ready:'已提取', active:'读取中', visited:'已浏览'}[kind];
      let row = rows.get(host);
      if (!row) { row = make('li', 'source-row'); row.dataset.host = host; row.append(make('span', 'source-icon'), make('span', 'source-host', host), make('span', 'source-status')); list.append(row); }
      if (row.dataset.state !== kind) { row.dataset.state = kind; row.firstChild.replaceChildren(stateIcon(kind)); }
      changeText(row.lastChild, text); row.setAttribute('aria-label', `${host}，${text}`);
    }
    if (researchBusy) list.scrollTop = list.scrollHeight;
  }
  function researchOverview(events) {
    const sources = new Map(); let articleCount = 0, imageCount = 0;
    for (const event of events) {
      const host = eventHost(event, true);
      if (host) { const prior = sources.get(host) || {}; sources.set(host, {event, frame:frameUrl(event.screenshot) ? event : prior.frame, extracted:prior.extracted || event.stage === 'extract'}); }
      if (event.stage === 'extract' && !event.progress) { articleCount++; imageCount += Number(event.counts?.images) || 0; }
      if (event.stage === 'merge' && Number.isFinite(event.counts?.articles)) { articleCount = event.counts.articles; imageCount = Number(event.counts.images) || imageCount; }
    }
    $('research-article-count').textContent = articleCount; $('research-image-count').textContent = imageCount; $('research-source-count').textContent = sources.size;
    $('research-sources-empty').hidden = sources.size > 0;
    renderSourceRows(sources, events.length ? eventHost(events.at(-1), true) : '');
    const fragment = document.createDocumentFragment();
    for (const [host, entry] of sources) {
      const button = make('button', 'research-source'), blocked = ['blocked','error'].includes(entry.event.stage);
      button.type = 'button'; button.dataset.host = host; button.dataset.state = blocked ? 'blocked' : entry.extracted ? 'ready' : 'visited';
      button.append(make('span', 'source-symbol', blocked ? '!' : entry.extracted ? '✓' : '↗'), make('span', 'source-name', host), make('span', 'source-state', blocked ? '受阻' : entry.extracted ? '已提取' : '已浏览'));
      button.disabled = !entry.frame; button.setAttribute('aria-label', `${host}，${blocked ? '访问受阻' : entry.extracted ? '已提取' : '已浏览'}${entry.frame ? '，回看页面' : '，暂无截图'}`);
      if (entry.frame) button.addEventListener('click', () => showResearchFrame(entry.frame)); fragment.append(button);
    }
    $('research-sources').replaceChildren(fragment);
    document.querySelectorAll('[data-step]').forEach(button => { const group = events.filter(event => eventStep(event) === button.dataset.step); button.disabled = !group.length; button.dataset.done = String(group.length > 0); });
  }
  function appendResearchEvents(events) {
    let latestFrame = null, changed = false;
    const stageNames = {search:'检索',visit:'浏览',open:'浏览',extract:'提取',normalize:'整理',capture:'页面画面',complete:'已收集',error:'未完成',blocked:'受阻',merge:'合入',source:'来源',query:'关键词',start:'开始'};
    for (const event of Array.isArray(events) ? events : []) {
      if (!Number.isInteger(event.seq) || researchEvents.has(event.seq) || typeof event.message !== 'string') continue;
      researchData.set(event.seq, event);
      changed = true;
      const row = make('li', 'research-event'), button = make('button', 'research-event-button'), time = new Date(event.time);
      button.type = 'button'; button.append(make('span', 'research-event-stage', stageNames[event.stage] || String(event.stage || '采集')), make('span', 'research-event-message', event.message));
      if (safeUrl(event.url) || safeUrl(event.requested_url)) button.append(make('span', 'research-event-url', safeUrl(event.url) || safeUrl(event.requested_url)));
      if (Number.isFinite(time.getTime())) button.append(make('time', '', new Intl.DateTimeFormat('zh-CN', {hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone:'Asia/Shanghai'}).format(time)));
      if (frameUrl(event.screenshot)) { button.addEventListener('click', () => showResearchFrame(event)); latestFrame = event; button.setAttribute('aria-label', `${event.message}，查看实际页面截图`); }
      else { button.disabled = true; }
      row.append(button); $('research-events').append(row); researchEvents.set(event.seq, row);
      if (!event.screenshot && safeUrl(event.url) && researchFrameSeq === null) $('research-url').textContent = event.url;
    }
    if (changed) { researchOverview([...researchData.values()]); pointResearch([...researchData.values()].at(-1)); } if (latestFrame && $('research-panel').open && $('research-details').open) showResearchFrame(latestFrame);
    $('research-count').textContent = `${researchEvents.size} 条记录`; $('research-log-count').textContent = researchEvents.size; $('research-events-empty').hidden = researchEvents.size > 0;
  }
  function renderResearchProgress(value) {
    const events = [...researchData.values()], latest = events.at(-1), measured = events.findLast(event => event.progress)?.progress;
    const phase = latest ? eventStep(latest) : 'search', running = value.state === 'running';
    const known = measured?.phase === phase && Number.isInteger(measured.completed) && Number.isInteger(measured.total) && measured.total > 0 && measured.completed >= 0 && measured.completed <= measured.total;
    const names = {search:'正在搜集',visit:'正在读取',extract:'正在整理',merge:'正在保存'};
    const percent = known ? Math.round(measured.completed / measured.total * 100) : 0;
    const count = Number($('research-article-count').textContent) || 0;
    const label = running ? names[phase] : {complete:count ? '采集完成' : '暂无新内容',partial:'部分完成',failed:'采集未完成'}[value.state];
    const text = running ? `${label}${known ? `，已处理 ${measured.completed} / ${measured.total}` : ''}` : `${label}${value.state === 'failed' ? '' : `，${count} 篇可读内容`}`;
    const meter = $('research-meter'); meter.dataset.state = value.state; meter.classList.toggle('indeterminate', running && !known);
    $('research-panel').dataset.state = value.state;
    $('research-feedback').hidden = false; meter.hidden = false; $('research-form').hidden = true;
    if (running) $('research-outcome').textContent = '';
    $('research-details').hidden = true;
    $('research-again').hidden = running;
    $('research-return').textContent = running ? '先去阅读' : '继续阅读';
    changeText($('research-state'), label);
    $('research-symbol').style.display = !running || known ? 'none' : '';
    $('research-value').hidden = running && !known;
    changeText($('research-value'), running ? `${percent}%` : value.state === 'failed' ? '!' : String(count));
    changeText($('research-value-label'), !running && value.state !== 'failed' ? '篇内容' : '');
    meter.setAttribute('aria-valuetext', text); changeText($('research-meter-label'), text);
    if (running && !known) meter.removeAttribute('aria-valuenow'); else meter.setAttribute('aria-valuenow', value.state === 'complete' || value.state === 'partial' ? '100' : String(percent));
    $('research-meter-fill').style.strokeDashoffset = String(100 - (value.state === 'complete' || value.state === 'partial' ? 100 : percent));
    const order = ['search','visit','extract','merge'], now = order.indexOf(phase);
    document.querySelectorAll('.stage-steps li').forEach((item, index) => {
      const done = value.state === 'complete' || value.state === 'partial' || index < now, here = index === now && value.state !== 'complete' && value.state !== 'partial';
      const state = done ? 'done' : here ? (running ? 'current' : 'error') : 'pending';
      item.dataset.state = state; if (state === 'current') item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
      item.lastChild.textContent = {done:'，已完成', current:'，进行中', error:'，未完成', pending:'，等待中'}[state];
    });
    document.querySelectorAll('[data-step]').forEach(button => {
      const current = button.dataset.step === phase;
      if (running && current) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
      button.dataset.current = String(current && running);
    });
  }
  function acceptResearch(value, restoring = false) {
    if (destroyed || window.CERemoteContext?.active === false) return;    if (!value || typeof value.job_id !== 'string' || !['running','complete','partial','failed'].includes(value.state)) throw new Error('本次采集状态不可用。');
    const arriving = researchJob !== value.job_id || $('research-panel').dataset.state === 'running' || restoring;
    researchJob = value.job_id; appendResearchEvents(value.events); $('research-panel').dataset.state = value.state;
    const events = [...researchData.values()], latest = events.at(-1);
    const start = Date.parse(events[0]?.time), end = value.state === 'running' ? Date.now() : Date.parse(value.finished_at || latest?.time);
    $('research-timing').textContent = Number.isFinite(start) && Number.isFinite(end) ? `${value.state === 'running' ? '已用' : '耗时'} ${Math.max(0, Math.round((end - start) / 1000))} 秒` : '';
    $('research-frame-mode').textContent = value.state === 'running' ? '采集中 · 步骤截图' : '已结束 · 截图回放';
    $('research-activity').textContent = value.state === 'running' ? latest?.message || '等待采集进展…' : events.some(event => frameUrl(event.screenshot)) ? '本次采集已结束。下方是步骤截图，可点来源回看；新内容在阅读室查看。' : '本次采集已结束，可展开采集记录查看各来源的处理情况。';
    if (value.state !== 'running' && typeof value.error === 'string') $('research-activity').textContent = value.error;
    const labels = {running:'正在采集', complete:'采集完成', partial:'部分来源已采集', failed:'采集未完成'};
    $('research-state').textContent = labels[value.state];
    renderResearchProgress(value);
    if (value.state === 'running') { setCollecting(true); clearTimeout(researchTimer); if (canPoll()) researchTimer = setTimeout(pollResearch, 1000); return; }
    clearTimeout(researchTimer); setCollecting(false);
    if (arriving && $('research-panel').open && $('research-details').open) { const extracted = events.findLast(event => event.stage === 'extract' && frameUrl(event.screenshot)); if (extracted) showResearchFrame(extracted); }
    if (value.result) { if (!restoring) applySnapshot(value.result, true, true); const count = $('research-article-count').textContent; $('research-outcome').textContent = restoring ? `上次收集 ${count} 篇可读内容。` : value.state === 'partial' ? `已收集 ${count} 篇内容，部分来源暂不可用。` : `已收集 ${count} 篇内容，可以继续阅读了。`; if (!restoring && !$('research-panel').open) notice($('research-outcome').textContent); }
    else { $('research-outcome').textContent = value.state === 'failed' ? `${typeof value.error === 'string' && value.error ? value.error + ' ' : ''}本次未取得新内容，已有新闻已保留。` : '本次没有新的可用信息，已有内容已保留。'; }
  }
  async function restoreResearch() {
    if (!canPoll() || historyReading || historyRestored) return;
    historyReading = true;
    try {
      const response = await readerFetch('/research/latest', {cache:'no-store'}); if (!response.ok || destroyed) return;
      if (researchJob || researchBusy) return;
      const value = await response.json(), job = value?.job; if (!canPoll()) return;
      historyRestored = true;
      if (!job || researchJob || researchBusy) return;
      if (typeof job.query === 'string') $('research-query').value = job.query;
      if (topicQueries[job.topic]) researchTopic = job.topic;
      $('capture-frames').checked = job.capture_frames === true;
      document.querySelectorAll('[data-topic]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.topic === researchTopic)));
      acceptResearch(job, true);
    } catch { /* Reading remains available when history cannot be loaded. */ }
    finally { historyReading = false; }
  }
  async function pollResearch() {
    if (!canPoll() || researchReading || !researchBusy || !researchJob) return;
    clearTimeout(researchTimer); researchReading = true;
    try { const response = await readerFetch('/research?id=' + encodeURIComponent(researchJob), {cache:'no-store'}); if (!response.ok) throw new Error('采集状态连接暂时中断'); const value = await response.json(); if (canPoll()) acceptResearch(value); }
    catch { if (canPoll() && researchBusy) { $('research-state').textContent = '连接暂时中断，正在重试'; researchTimer = setTimeout(pollResearch, 3000); } }
    finally { researchReading = false; }
  }
  $('refresh').addEventListener('click', () => {
    if (destroyed || window.CERemoteContext?.active === false) return;
    if (!$('research-panel').open) {
      try { $('research-panel').showModal(); }
      catch (error) { notice('无法打开采集工作台，请重试。' + error.message); return; }
    }
    syncPets();
    const events = [...researchData.values()];
    const event = researchData.get(researchFrameSeq) || (!researchBusy && events.findLast(event => event.stage === 'extract' && frameUrl(event.screenshot))) || events.findLast(event => frameUrl(event.screenshot));
    if (event && $('research-details').open) showResearchFrame(event);
    if (researchBusy) $('research-close').focus();
  });
  for (const id of ['research-close','research-return']) $(id).addEventListener('click', () => $('research-panel').close());
  $('research-again').addEventListener('click', () => {
    $('research-form').hidden = false; $('research-feedback').hidden = true; $('research-again').hidden = true; $('research-return').textContent = '取消';
    $('research-panel').removeAttribute('data-state'); $('research-query').focus();
  });
  $('research-details').addEventListener('toggle', () => {
    syncPets();
    if ($('research-details').open && $('research-panel').open) {
      const events = [...researchData.values()];
      const event = researchData.get(researchFrameSeq) || (!researchBusy && events.findLast(event => event.stage === 'extract' && frameUrl(event.screenshot))) || events.findLast(event => frameUrl(event.screenshot));
      if (event) showResearchFrame(event);
    }
  });
  $('research-panel').addEventListener('compositionstart', () => { researchComposing = true; });
  $('research-panel').addEventListener('compositionend', () => { researchComposing = false; });
  $('research-panel').addEventListener('cancel', event => { event.preventDefault(); if (!researchComposing && !event.isComposing) $('research-panel').close(); });
  $('research-panel').addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation?.(); if (researchComposing || event.isComposing || event.keyCode === 229) event.preventDefault(); } });
  $('research-panel').addEventListener('close', () => { researchEngine?.pointAt(null); syncMotion(); if (!destroyed && window.CERemoteContext?.active !== false) $('refresh').focus(); });
  $('research-frame').addEventListener('error', () => { $('research-frame').hidden = true; $('research-frame-empty').hidden = false; $('research-frame-empty').textContent = '这张实际截图暂时无法载入，可继续查看采集记录。'; });
  for (const [id, direction] of [['frame-previous', -1], ['frame-next', 1]]) $(id).addEventListener('click', () => { const frames = [...researchData.values()].filter(event => frameUrl(event.screenshot)), index = frames.findIndex(event => event.seq === researchFrameSeq); if (frames[index + direction]) showResearchFrame(frames[index + direction]); });
  document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-step]').forEach(control => control.setAttribute('aria-pressed', String(control === button)));
    const events = [...researchData.values()].filter(event => eventStep(event) === button.dataset.step), event = events.findLast(event => frameUrl(event.screenshot));
    if (event) showResearchFrame(event);
    else if (events.length) { document.querySelector('.research-log').open = true; researchEvents.get(events.at(-1).seq)?.scrollIntoView({block:'nearest'}); }
  }));
  document.querySelectorAll('[data-topic]').forEach(button => button.addEventListener('click', () => { researchTopic = button.dataset.topic; $('research-query').value = topicQueries[researchTopic]; document.querySelectorAll('[data-topic]').forEach(control => control.setAttribute('aria-pressed', String(control === button))); }));
  $('research-form').addEventListener('submit', async event => {
    event.preventDefault(); if (destroyed || window.CERemoteContext?.active === false || researchBusy) return; const query = $('research-query').value.trim(); if (!query) { $('research-query').focus(); return; }
    $('toast').hidden = true;
    clearTimeout(researchTimer); frameRequest++; researchJob = null; researchFrameSeq = null; researchEvents.clear(); researchData.clear(); $('research-events').replaceChildren(); $('research-events-empty').hidden = false; researchOverview([]);
    $('research-browser').hidden = true; renderResearchProgress({state:'running'});
    researchEngine?.pointAt(null);
    $('research-timing').textContent = ''; $('research-frame-mode').textContent = '采集中 · 步骤截图'; $('research-activity').textContent = '正在启动浏览器…';
    $('frame-position').textContent = '0 / 0'; $('frame-previous').disabled = true; $('frame-next').disabled = true; $('research-host').textContent = '等待页面'; document.querySelector('.research-log').open = false;
    $('research-frame').hidden = true; $('research-frame').removeAttribute('src'); $('research-frame-empty').hidden = false; $('research-frame-empty').textContent = '等待实际访问页面的截图…';
    $('research-url').textContent = '准备检索'; $('research-frame-caption').textContent = '只显示本次采集实际获得的页面画面。'; $('research-outcome').textContent = '关闭工作台后，采集仍会继续。'; $('research-state').textContent = '正在开始'; $('research-count').textContent = '0 条记录'; $('research-log-count').textContent = '0'; setCollecting(true);
    try {
      const response = await readerFetch('/research', {method:'POST', headers:{'Content-Type':'application/json', 'X-Preview-Request':'1'}, body:JSON.stringify({query, topic:researchTopic, capture_frames:$('capture-frames').checked})});
      const value = await response.json(); if (!response.ok && !(response.status === 409 && value.job_id)) throw new Error('采集暂时无法开始，请稍后重试。'); acceptResearch(value);
    } catch (error) { setCollecting(false); renderResearchProgress({state:'failed'}); $('research-state').textContent = '未能开始'; $('research-frame-mode').textContent = '未开始'; $('research-activity').textContent = error.message; $('research-outcome').textContent = error.message; }
  });
  document.addEventListener('keydown', event => {
    if (!canPoll() || event.isComposing || event.keyCode === 229) return;
    if ($('research-panel').open || readingView !== 'article') return;
    if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape' && $('animation-stage').dataset.directory === 'open') { setDirectory(false); $('open-directory').focus(); }
    if (event.key === 'ArrowLeft') { const button = mediaView === 'gallery' ? $('image-previous') : $('previous'); if (!button.disabled) { event.preventDefault(); button.click(); } }
    if (event.key === 'ArrowRight') { const button = mediaView === 'gallery' ? $('image-next') : $('next'); if (!button.disabled) { event.preventDefault(); button.click(); } }
  });
  function syncHomeLayout() {
    const home = document.querySelector('.spider-home');
    const mobile = readingView === 'article' && matchMedia('(max-width:720px)').matches;
    if (narrowLayout !== null && narrowLayout !== mobile && readingView === 'article') setDirectory(mobile ? false : desktopDirectoryOpen);
    narrowLayout = mobile;
    if (mobile) { if (home.parentElement !== $('reader')) $('reader').insertBefore(home, document.querySelector('.reader-footer')); }
    else { if (home.parentElement !== $('directory')) $('directory').append(home); }
    $('directory').inert = mobile && $('animation-stage').dataset.directory !== 'open';
  }
  let scrollFrame = 0;
  $('article-scroll').addEventListener('scroll', () => { // read-only and frame-throttled: it never changes scrolling
    if (scrollFrame || !currentId) return;
    scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; const box = $('article-scroll'); reactor.observeScroll({top:box.scrollTop, height:box.scrollHeight, client:box.clientHeight, key:currentId}); });
  }, {passive:true});
  $('article-scroll').addEventListener('scroll', cancelInvisible, {passive:true}); $('title-list').addEventListener('scroll', cancelInvisible, {passive:true}); window.addEventListener('resize', () => { syncHomeLayout(); cancelInvisible(); });
  function syncActivity() {
    if (destroyed) return;
    syncMotion();
    if (!canPoll()) { activityGeneration++; clearTimeout(researchTimer); clearTimeout(feedTimer); clearTimeout(articleRetry); clearTimeout(dayTimer); reactor.cancelPending(); return; }
    scheduleDayChange();
    if (documents.get(currentId)?.reason === 'reader_busy') documents.delete(currentId);
    if (pendingOpen && articles.has(pendingOpen.id)) { if (documents.get(pendingOpen.id)?.reason === 'reader_busy') documents.delete(pendingOpen.id); void loadArticle(articles.get(pendingOpen.id)); }
    render();
    void readFeeds(false, feedAttempt).then(() => restoreResearch());
    if (researchBusy) void pollResearch();
  }
  document.addEventListener('visibilitychange', syncActivity);
  const destroy = () => { destroyed = true; if (pendingOpen) nodes.get(pendingOpen.id)?.removeAttribute('aria-busy'); pendingOpen = null; reactor.cancelPending(); $('research-panel').dataset.motion = 'paused'; wheel?.destroy(); unsubscribePrefs?.(); unmountAppearance(); if ($('research-panel').open) $('research-panel').close(); clearTimeout(researchTimer); clearTimeout(feedTimer); clearTimeout(articleRetry); clearTimeout(dayTimer); if (frameObjectUrl) URL.revokeObjectURL(frameObjectUrl); stopTranslation(); statusFeed?.stop(); statusFeed = null; engine?.destroy(); researchEngine?.destroy(); };
  window.CERemoteContext?.onInactive(destroy);
  window.addEventListener('pagehide', event => { if (event.persisted) { suspended = true; unmountAppearance(); syncActivity(); } else destroy(); });
  window.addEventListener('pageshow', event => { if (event.persisted && !destroyed) { suspended = false; mountTheme(); syncActivity(); } });
  async function readFeeds(refresh = false, attempt = 0) {
    if (!canPoll() || feedReading) return;
    feedReading = true; feedAttempt = attempt; $('refresh-feeds').setAttribute('aria-busy', 'true');
    clearTimeout(feedTimer); $('refresh-feeds').disabled = true;
    try {
      const response = await readerFetch(refresh ? '/reader/refresh' : '/sample', refresh ? {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'} : {cache:'no-store'});
      if (!response.ok) throw new Error('新闻暂未更新，保留本机阅读记录。');
      const value = await response.json(); if (!canPoll()) return;
      const key = JSON.stringify([value.reader_id, value.sample?.captured_at,
        value.sample?.sources?.map(source => [source.id, source.source_id, source.reason]),
        Object.entries(value.sample?.streams || {}).map(([name, envelope]) => [name, envelope.items]), value.covers?.items]);
      if (key !== lastFeedKey || feedFailed) { applySnapshot(value, refresh, true); lastFeedKey = key; }
      feedFailed = false;
      if (canPoll() && value.refreshing && attempt < 35) feedTimer = setTimeout(() => readFeeds(false, attempt + 1), 1500);
    } catch (error) { if (!destroyed) { feedFailed = true; $('snapshot-note').textContent = error.message; if (refresh) reactor.react('refresh-failed'); } }
    finally { feedReading = false; feedSettled = true; if (!destroyed) { observeNewsMood($('search').value.trim()); $('refresh-feeds').disabled = false; $('refresh-feeds').setAttribute('aria-busy', 'false'); } }
  }
  $('refresh-feeds').addEventListener('click', () => { reactor.react('refreshing'); readFeeds(true); });
  async function start() {
    syncHomeLayout(); render();
    scheduleDayChange();
    paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
    unsubscribePrefs = prefs.subscribe(applyPrefs);
    syncPets(); syncPetStatusFeed();
    window.NewsReader = {setActive(value) { if (destroyed || active === value) return; active = value; if (!active) stopTranslation(); if (!active && $('research-panel').open) $('research-panel').close(); syncActivity(); }, dispose:destroy, get researchEngine() { return researchEngine; }, switchPet, setPetEnabled:enabled => prefs.setEnabled(enabled), setPetStatus, setRealPetStatus, clearPetStatusOverride, statusFeed:() => statusFeed?.inspect() || null, refreshStatus:() => statusFeed?.refresh(), pet:() => petName, inspect:() => ({items:articles.size, visible:visibleIds.length, currentId, selected, stream, language, readingView, mediaView, imageIndex, researchJob, researchEvents:researchEvents.size, active, pending:[...tasks.keys()], reading:JSON.parse(JSON.stringify(records)), collecting, pet:petName, petEnabled, engine:engine?.inspect(), researchEngine:researchEngine?.inspect(), destroyed}), get engine() { return engine; }, applySnapshot};
    await readFeeds();
    restoreResearch();
  }
  if (embedded) { document.documentElement.dataset.embedded = 'true'; document.querySelector('.top').hidden = true; }
  start();
})();
