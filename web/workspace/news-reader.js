'use strict';
(function () {
  const $ = id => document.getElementById(id);
  let csrf = null, frameObjectUrl = null, feedTimer = null, frameRequest = 0;
  async function readerFetch(url, options = {}) {
    const aliases = {'/sample':'reader', '/article':'article', '/research':'research', '/research/latest':'research/latest', '/translate':'translate', '/reader/refresh':'reader/refresh'};
    const requested = new URL(url, location.origin);
    const target = aliases[requested.pathname] ? '/api/workspace/news/' + aliases[requested.pathname] + requested.search : url;
    const headers = new Headers(options.headers); headers.set('X-Session-Client', 'panel'); headers.delete('X-Preview-Request');
    if (options.method === 'POST') {
      if (!csrf) { const response = await fetch('/api/bootstrap', {headers:{'X-Session-Client':'panel'}}); if (!response.ok) throw new Error('无法连接新闻服务'); csrf = (await response.json()).csrf_token; }
      headers.set('X-Session-CSRF', csrf);
    }
    return fetch(target, {...options, headers});
  }
  let storeKey = null, articleRetry = null;
  const articleAttempts = new Map();
  const articles = new Map(), nodes = new Map(), documents = new Map(), loading = new Map();
  const tasks = new Map(), translations = new Map(), failedImages = new Set();
  let records = {}, currentId = null, selected = 'inbox', stream = 'ai', language = 'original';
  let engine = null, researchEngine = null, paused = false, collecting = false, undo = null, arrivalQueue = [];
  let visibleIds = [], translationRun = 0, translationAbort = null, renderedKey = '', destroyed = false;
  let mediaView = 'article', imageIndex = 0, mediaKey = '';
  let researchJob = null, researchTimer = null, researchTopic = 'coding', researchBusy = false, researchFrameSeq = null;
  let feedReading = false, researchReading = false, suspended = false, feedAttempt = 0, lastFeedKey = '', feedFailed = false;
  let historyReading = false, historyRestored = false;
  const canPoll = () => !destroyed && !suspended && !document.hidden;
  const researchEvents = new Map(), researchData = new Map();
  const topicQueries = {coding:'AI coding workflow coding agents tips', agents:'AI agents context engineering tools workflows', claude:'Claude Code coding tips workflows', models:'GPT Gemini coding models releases', tibo:'Tibo AI coding agents'};
  const changeText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  function safeUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; } }
  function validItem(item) { return item && /^[a-f0-9]{24}$/.test(item.id) && typeof item.title === 'string' && typeof item.source_name === 'string' && typeof item.source_id === 'string' && safeUrl(item.url) && ['ai', 'hn'].includes(item.stream) && (item.summary === null || typeof item.summary === 'string'); }
  function state(id) { return records[id] && typeof records[id] === 'object' ? records[id] : (records[id] = {read_at:null, archived_at:null, saved:false}); }
  function itemSignature(item) { return JSON.stringify([item.title, item.summary, item.url, item.body_blocks, item.images]); }
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
    for (const raw of candidates) {
      const image = typeof raw === 'string' ? {url:raw} : raw;
      const url = safeUrl(image?.url); if (!url || seen.has(url)) continue;
      seen.add(url); images.push({url, alt:typeof image.alt === 'string' ? image.alt : '', caption:typeof image.caption === 'string' ? image.caption : ''});
    }
    return images;
  }
  function save() {
    if (!storeKey) return;
    for (const [id, item] of articles) state(id).snapshot = {...item};
    try { localStorage.setItem(storeKey, JSON.stringify(records)); $('storage-warning').hidden = true; }
    catch { $('storage-warning').hidden = false; }
  }
  function restoreStorage(scope) {
    if (typeof scope !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(scope)) throw new Error('新闻数据目录尚未确认。');
    const key = 'news-focused-reader-v2:' + scope;
    if (storeKey && key !== storeKey) { location.reload(); throw new Error('数据目录已切换，正在重新载入。'); }
    if (storeKey) return;
    storeKey = key;
    try {
      const stored = JSON.parse(localStorage.getItem(storeKey) || '{}');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) records = stored;
    } catch { $('storage-warning').hidden = false; }
    for (const [id, row] of Object.entries(records)) if (row && validItem(row.snapshot) && row.snapshot.id === id) articles.set(id, row.snapshot);
  }
  function dateText(value) { const date = new Date(value); if (!value || !Number.isFinite(date.getTime())) return '日期未知'; const year = new Intl.DateTimeFormat('en', {year:'numeric', timeZone:'Asia/Shanghai'}); return new Intl.DateTimeFormat('zh-CN', {year:year.format(date) === year.format(new Date()) ? undefined : 'numeric', month:'short', day:'numeric', timeZone:'Asia/Shanghai'}).format(date); }
  function matches(item, view = selected) { const row = state(item.id); return view === 'read' ? !!row.read_at : view === 'saved' ? !!row.saved : view === 'archived' ? !!row.archived_at : !row.archived_at; }
  function notice(text, canUndo = false) { $('toast-text').textContent = text; $('toast').hidden = false; $('undo').hidden = !canUndo; }
  function setDirectory(open) { $('animation-stage').dataset.directory = open ? 'open' : 'closed'; $('open-directory').setAttribute('aria-expanded', String(open)); $('directory-backdrop').hidden = !open; $('directory').inert = matchMedia('(max-width:720px)').matches && !open; }
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
  function cancelTask(id) { tasks.delete(id); engine?.cancel(id); if (id.startsWith('arrival:')) { $('arrival-title').hidden = true; $('reader-state').hidden = false; } }
  function settleTask(event) {
    const id = typeof event === 'string' ? event : event.id, task = tasks.get(id);
    if (!task) return;
    tasks.delete(id);
    if (task.kind === 'arrival') { $('arrival-title').hidden = true; $('reader-state').hidden = false; }
    $('spider-state').textContent = paused ? '休息一会儿' : collecting ? '正在搜集新信息' : '陪你慢慢读';
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
    const previousIndex = Math.max(0, visibleIds.indexOf(currentId));
    const query = $('search').value.trim().toLocaleLowerCase();
    const items = [...articles.values()].filter(item => item.stream === stream);
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
      const eligible = item.stream === stream && (matches(item) || moving && selected === 'inbox') && (!query || [displayTitle(item), item.title, item.source_name, item.summary || ''].join(' ').toLocaleLowerCase().includes(query));
      node.hidden = !eligible; if (eligible) visibleIds.push(item.id);
      node.dataset.pending = String(moving);
      changeText(node.querySelector('.title-row-title'), displayTitle(item));
      const excerpt = item.summary || item.body_blocks?.find(block => block.type === 'p')?.text || '';
      changeText(node.querySelector('.title-row-summary'), excerpt); node.querySelector('.title-row-summary').hidden = !excerpt;
      const images = imageList(item), thumbnail = node.querySelector('.title-row-thumbnail');
      const thumbnailUrl = images.find(image => !failedImages.has(image.url))?.url;
      thumbnail.hidden = !thumbnailUrl; if (thumbnailUrl && thumbnail.getAttribute('src') !== thumbnailUrl) thumbnail.src = thumbnailUrl;
      changeText(node.querySelector('.row-type'), images.length > 1 ? `${images.length} 图` : images.length ? '图文' : docFor(item)?.content_kind === 'full_text' || item.body_blocks?.length ? '正文' : item.summary ? '摘要' : '仅标题');
      changeText(node.querySelector('.row-source'), item.source_name);
      changeText(node.querySelector('.row-date'), dateText(item.submitted_at || item.published_at));
      changeText(node.querySelector('.row-state'), moving ? '归档中' : row.saved ? '◇' : row.read_at ? '已读' : '');
      node.querySelector('.row-dot').hidden = !!row.read_at;
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
    renderArticle();
  }
  function stopTranslation() { translationRun++; translationAbort?.abort(); translationAbort = null; }
  function selectArticle(id, focus = false) {
    if (!articles.has(id)) return;
    if (documents.get(id)?.reason === 'reader_busy') documents.delete(id);
    for (const [taskId, task] of tasks) if (task.kind === 'archive' && task.node === $('article-title')) cancelTask(taskId);
    currentId = id; stopTranslation(); renderedKey = ''; mediaKey = ''; imageIndex = 0; $('article-scroll').scrollTop = 0;
    setDirectory(false); render();
    if (!paused) engine?.pointAt($('article-title'), '阅读');
    if (focus) $('article-title').focus({preventScroll:true});
  }
  function docFor(item) { const entry = documents.get(item.id); return entry?.signature === itemSignature(item) ? entry : null; }
  function bodyBlocks(item) {
    const entry = docFor(item);
    const blocks = entry?.content_kind === 'full_text' ? entry.blocks : item.body_blocks?.length ? item.body_blocks : entry?.blocks || [];
    const normalize = text => String(text || '').normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, '').toLocaleLowerCase();
    const titles = new Set([normalize(item.title), normalize(entry?.title)].filter(Boolean));
    let firstParagraph = true;
    return blocks.filter(block => {
      if (!block || !['p','h2','li'].includes(block.type) || typeof block.text !== 'string') return false;
      if (block.type === 'p') { const opening = firstParagraph; firstParagraph = false; if (block.text === item.summary && (opening || entry?.content_kind !== 'full_text')) return false; }
      return block.type !== 'h2' || !titles.has(normalize(block.text));
    });
  }
  function translationKey(item) { return item.id + ':' + JSON.stringify([displayTitle(item), item.summary, bodyBlocks(item).map(block => [block.type, block.text])]); }
  function renderArticle() {
    const item = articles.get(currentId), index = visibleIds.indexOf(currentId);
    $('article-position').textContent = item ? `${index + 1} / ${visibleIds.length}` : '0 / 0';
    $('previous').disabled = index <= 0; $('next').disabled = index < 0 || index >= visibleIds.length - 1;
    for (const id of ['mark-read', 'save-article', 'archive-article']) $(id).disabled = !item;
    $('article-content').hidden = !item; $('reader-empty').hidden = !!item;
    if (!item) {
      mediaView = 'article';
      $('empty-message').textContent = selected === 'archived' ? '看完的内容会收在这里。' : '换个筛选，或采集新的信息。';
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
    const provenanceKey = JSON.stringify([item.id, item.author, item.published_at, item.submitted_at, item.published_raw, entry?.author, entry?.published_raw, references, referencesTotal, incomplete]);
    if ($('article-provenance').dataset.key !== provenanceKey) {
      const details = document.createDocumentFragment(), author = entry?.author || item.author, publishedRaw = entry?.published_raw || item.published_raw;
      if (typeof author === 'string') details.append(make('p', '', `作者：${author}`));
      const date = item.submitted_at || item.published_at;
      details.append(make('p', '', `${item.content_origin === 'hn_submission' ? '收录时间' : '发布时间'}：${date ? dateText(date) : publishedRaw || '日期未知'}`));
      if (item.content_origin === 'x_public_embed') details.append(make('p', '', incomplete ? '这是公开嵌入提供的帖文节选，未取得完整帖文或线程。' : '内容来自公开嵌入；未包含完整讨论线程。'));
      if (referencesTotal > references.length) details.append(make('p', '', `${referencesTotal} 条引用，展示其中 ${references.length} 条。`));
      for (const reference of references) {
        const link = make('a', '', reference.label || (reference.kind === 'x_post' ? '文中引用的 X 帖子' : reference.kind === 'paper' ? '相关论文' : '相关来源'));
        link.href = safeUrl(reference.url); link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.addEventListener('click', event => { const local = [...articles.values()].find(article => article.url === reference.url); if (local) { event.preventDefault(); if (!matches(local)) selected = state(local.id).archived_at ? 'archived' : 'inbox'; stream = local.stream; $('stream').value = stream; $('search').value = ''; selectArticle(local.id, true); } });
        details.append(link);
      }
      $('article-provenance').replaceChildren(details); $('article-provenance').dataset.key = provenanceKey; $('source-details').open = false;
    }
    const summary = item.summary || '';
    $('article-summary').hidden = !summary; changeText($('article-summary'), textAt(1, summary));
    const summaryPair = !!summary && language === 'bilingual' && translated?.[1] !== undefined;
    $('article-summary-original').hidden = !summaryPair; changeText($('article-summary-original'), summaryPair ? summary : '');
    const hasBody = entry?.content_kind === 'full_text' || item.body_blocks?.length > 0;
    $('content-badge').textContent = item.content_origin === 'x_public_embed' ? incomplete ? '帖文节选' : '公开帖文' : hasBody ? '正文' : '来源摘要';
    $('content-status').textContent = hasBody ? '' : !entry ? '正在载入正文，先读来源摘要…' : '暂未取得完整正文，目前展示来源摘要。';
    if (entry && !blocks.length && !summary) $('content-status').textContent = '来源暂未提供正文或摘要，目前仅有标题。';
    renderMedia(item);
    const bodyKey = JSON.stringify([key, language, translated]);
    if (bodyKey !== renderedKey) {
      const fragment = document.createDocumentFragment();
      blocks.forEach((block, offset) => {
        const value = textAt(offset + 2, block.text), tag = block.type === 'h2' ? 'h3' : block.type === 'li' ? 'li' : 'p';
        const node = make(tag, 'body-block', value);
        if (language === 'bilingual' && translated?.[offset + 2] !== undefined) { const pair = make('div', 'body-pair'); pair.append(node, make('p', 'original-text', block.text)); fragment.append(pair); }
        else fragment.append(node);
      });
      $('article-body').replaceChildren(fragment); renderedKey = bodyKey;
    }
    $('article-end').hidden = !hasBody || incomplete;
    $('mark-read').textContent = row.read_at ? '标为未读' : '标为已读';
    $('save-article').textContent = row.saved ? '◆ 已收藏' : '◇ 收藏'; $('save-article').setAttribute('aria-pressed', String(!!row.saved));
    $('archive-article').textContent = row.archived_at ? '↶' : '×'; $('archive-article').setAttribute('aria-label', row.archived_at ? '移回阅读' : '已读并归档'); $('archive-article').disabled = tasks.has(item.id);
    $('reader-state').textContent = tasks.has(item.id) ? '正在收进仓库…' : row.archived_at ? '已归档' : row.read_at ? '已读' : '读完点 ×，收进仓库';
    if (!entry) loadArticle(item);
    if (language !== 'original') ensureTranslation(item);
    else $('translation-status').hidden = true;
  }
  function imageFigure(image, index, gallery = false) {
    const figure = make('figure', 'article-image'), picture = make('img'), missing = make('p', 'image-unavailable', '这张图片暂时无法载入。'), pending = make('p', 'image-loading', '正在载入图片…');
    picture.alt = image.alt || `文章图片 ${index + 1}`; picture.referrerPolicy = 'no-referrer'; picture.decoding = 'async'; picture.loading = gallery || index === 0 ? 'eager' : 'lazy';
    missing.hidden = !failedImages.has(image.url); picture.hidden = !missing.hidden;
    pending.hidden = !missing.hidden;
    picture.addEventListener('load', () => { pending.hidden = true; });
    picture.addEventListener('error', () => { failedImages.add(image.url); picture.hidden = true; pending.hidden = true; missing.hidden = false; });
    if (missing.hidden) picture.src = image.url;
    figure.append(picture, pending, missing);
    if (image.caption || image.alt) {
      const caption = make('figcaption'), details = make('details');
      details.append(make('summary', '', '图片说明'), make('p', '', image.caption || image.alt)); caption.append(details); figure.append(caption);
    }
    return figure;
  }
  function renderMedia(item) {
    const images = imageList(item); imageIndex = Math.max(0, Math.min(imageIndex, images.length - 1));
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
    return value && value.id === item.id && ['full_text', 'summary'].includes(value.content_kind) && Array.isArray(value.blocks) && value.blocks.every(block => block && ['p', 'h2', 'li'].includes(block.type) && typeof block.text === 'string');
  }
  async function loadArticle(item) {
    const signature = itemSignature(item), requestKey = item.id + signature;
    if (loading.has(requestKey)) return;
    loading.set(requestKey, true);
    try {
      const response = await readerFetch('/article?id=' + encodeURIComponent(item.id));
      if (!response.ok) throw new Error('正文读取未完成');
      const value = await response.json(); if (!validDocument(value, item)) throw new Error('正文格式不可用');
      if (articles.has(item.id) && itemSignature(articles.get(item.id)) === signature) documents.set(item.id, {...value, signature});
      if (value.reason === 'reader_busy' && (articleAttempts.get(requestKey) || 0) < 12) {
        articleAttempts.set(requestKey, (articleAttempts.get(requestKey) || 0) + 1);
        clearTimeout(articleRetry);
        articleRetry = setTimeout(() => {
          if (!destroyed && articles.has(item.id) && itemSignature(articles.get(item.id)) === signature) { documents.delete(item.id); if (currentId === item.id) render(); }
        }, 1500);
      }
    } catch {
      if (articles.has(item.id) && itemSignature(articles.get(item.id)) === signature) documents.set(item.id, {id:item.id, signature, blocks:[], images:[], content_kind:'summary', reason:'unavailable'});
    } finally {
      loading.delete(requestKey);
      if (currentId === item.id) { stopTranslation(); renderedKey = ''; render(); }
    }
  }
  let translatingKey = null;
  function showTranslation(text) { $('translation-status').hidden = !text; $('translation-status').textContent = text; }
  async function ensureTranslation(item) {
    const key = translationKey(item), blocks = bodyBlocks(item), texts = [displayTitle(item), item.summary || '', ...blocks.map(block => block.text)];
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
    if (!engine || paused || tasks.size || !arrivalQueue.length) return;
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
    if (engine && !paused && visibleElement(target)) {
      try { if (engine.capture({id:item.id, element:target, label:displayTitle(item)})) tasks.set(item.id, {kind:'archive', node:target, articleId:item.id}); } catch {}
    }
    save(); render(); notice('已读并归档。', true);
  }
  function applySnapshot(value, animate = false, append = false) {
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
    if (animate) arrivalQueue.push(...[...incoming.values()].filter(item => !oldIds.has(item.id)).slice(0, 3));
    save(); render(); cancelInvisible(); if (animate) runArrival();
  }
  document.querySelectorAll('[data-view]').forEach(control => control.addEventListener('click', () => { for (const [id, task] of tasks) if (task.kind === 'archive') cancelTask(id); selected = control.dataset.view; render(); }));
  $('search').addEventListener('input', () => { render(); cancelInvisible(); });
  $('stream').addEventListener('change', () => { for (const [id, task] of tasks) if (task.kind === 'archive') cancelTask(id); stream = $('stream').value; render(); });
  $('clear-search').addEventListener('click', () => { $('search').value = ''; render(); $('search').focus(); });
  $('directory-summary').addEventListener('click', event => { const show = event.currentTarget.getAttribute('aria-pressed') !== 'true'; event.currentTarget.setAttribute('aria-pressed', String(show)); event.currentTarget.setAttribute('aria-label', show ? '隐藏目录摘要' : '显示目录摘要'); $('directory').dataset.summaries = String(show); });
  $('previous').addEventListener('click', () => { const index = visibleIds.indexOf(currentId); if (index > 0) selectArticle(visibleIds[index - 1]); });
  $('next').addEventListener('click', () => { const index = visibleIds.indexOf(currentId); if (index < visibleIds.length - 1) selectArticle(visibleIds[index + 1]); });
  $('open-directory').addEventListener('click', () => { setDirectory(true); $('search').focus(); });
  $('close-directory').addEventListener('click', () => { setDirectory(false); $('open-directory').focus(); cancelInvisible(); });
  $('directory-backdrop').addEventListener('click', () => { setDirectory(false); $('open-directory').focus(); cancelInvisible(); });
  $('mark-read').addEventListener('click', () => { if (!currentId) return; const row = state(currentId); row.read_at = row.read_at ? null : new Date().toISOString(); save(); render(); });
  $('save-article').addEventListener('click', () => { if (!currentId) return; const row = state(currentId); row.saved = !row.saved; save(); render(); });
  $('archive-article').addEventListener('click', archiveCurrent);
  $('undo').addEventListener('click', () => { if (!undo) return; const {id, read_at, archived_at} = undo; cancelTask(id); Object.assign(state(id), {read_at, archived_at}); undo = null; save(); currentId = id; render(); notice('已撤销归档。'); });
  $('dismiss').addEventListener('click', () => { $('toast').hidden = true; });
  document.querySelectorAll('[data-language]').forEach(control => control.addEventListener('click', () => { language = control.dataset.language; stopTranslation(); document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === language))); renderedKey = ''; renderArticle(); }));
  $('theme').addEventListener('click', () => { const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; $('theme').setAttribute('aria-label', dark ? '切换浅色' : '切换深色'); });
  function syncMotion() {
    const show = !paused && canPoll();
    if (show && !$('research-panel').open) engine?.resume(); else engine?.pause();
    if (show && $('research-panel').open) researchEngine?.resume(); else researchEngine?.pause();
    $('pause').textContent = $('research-pause').textContent = paused ? '继续动画' : '暂停动画';
  }
  $('pause').addEventListener('click', () => { paused = !paused; syncMotion(); $('spider-state').textContent = paused ? '休息一会儿' : collecting ? '正在搜集新信息' : '陪你慢慢读'; if (!paused) runArrival(); });
  $('research-pause').addEventListener('click', () => $('pause').click());
  document.querySelectorAll('button[data-media-view]').forEach(button => button.addEventListener('click', () => { mediaView = button.dataset.mediaView; $('article-scroll').scrollTop = 0; renderMedia(articles.get(currentId)); }));
  $('image-previous').addEventListener('click', () => { imageIndex--; renderMedia(articles.get(currentId)); });
  $('image-next').addEventListener('click', () => { imageIndex++; renderMedia(articles.get(currentId)); });
  function setCollecting(active) {
    collecting = active; researchBusy = active; engine?.setCollecting?.(active);
    researchEngine?.setCollecting(active);
    $('refresh').textContent = active ? '◌ 查看采集过程' : researchJob ? '↻ 采集工作台' : '↻ 采集新信息';
    $('research-panel').dataset.running = String(active);
    $('research-start').disabled = active; $('research-start').textContent = active ? '采集中…' : '开始采集 ↗';
    $('research-query').disabled = active; document.querySelectorAll('[data-topic]').forEach(button => { button.disabled = active; });
    if (!tasks.size) $('spider-state').textContent = paused ? '休息一会儿' : active ? '正在搜集新信息' : '陪你慢慢读';
  }
  function frameUrl(value) {
    try { const url = new URL(value, location.href); return url.origin === location.origin && url.pathname === '/api/workspace/news/research-frame' && url.searchParams.has('job') && url.searchParams.has('name') ? url.href : null; } catch { return null; }
  }
  async function showResearchFrame(event) {
    const url = frameUrl(event.screenshot); if (!url) return;
    const request = ++frameRequest, job = researchJob;
    researchFrameSeq = event.seq; $('research-frame').hidden = false; $('research-frame-empty').hidden = true;
    try {
      const response = await readerFetch(url); if (!response.ok) throw new Error('frame_unavailable');
      const blob = await response.blob(); if (destroyed || request !== frameRequest || job !== researchJob) return;
      if (frameObjectUrl) URL.revokeObjectURL(frameObjectUrl);
      frameObjectUrl = URL.createObjectURL(blob); $('research-frame').src = frameObjectUrl;
    } catch { if (request === frameRequest && job === researchJob) { $('research-frame').hidden = true; $('research-frame-empty').hidden = false; $('research-frame-empty').textContent = '截图暂不可用'; } }
    if (destroyed || request !== frameRequest || job !== researchJob) return;
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
    if (!researchEngine || paused || !$('research-panel').open) return;
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
  function researchOverview(events) {
    const sources = new Map(); let articleCount = 0, imageCount = 0;
    for (const event of events) {
      const host = eventHost(event, true);
      if (host) { const prior = sources.get(host) || {}; sources.set(host, {event, frame:frameUrl(event.screenshot) ? event : prior.frame, extracted:prior.extracted || event.stage === 'extract'}); }
      if (event.stage === 'extract') { articleCount++; imageCount += Number(event.counts?.images) || 0; }
      if (event.stage === 'merge' && Number.isFinite(event.counts?.articles)) { articleCount = event.counts.articles; imageCount = Number(event.counts.images) || imageCount; }
    }
    $('research-article-count').textContent = articleCount; $('research-image-count').textContent = imageCount; $('research-source-count').textContent = sources.size;
    $('research-sources-empty').hidden = sources.size > 0;
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
    if (changed) { researchOverview([...researchData.values()]); pointResearch([...researchData.values()].at(-1)); } if (latestFrame) showResearchFrame(latestFrame);
    $('research-count').textContent = `${researchEvents.size} 条记录`; $('research-log-count').textContent = researchEvents.size; $('research-events-empty').hidden = researchEvents.size > 0;
  }
  function acceptResearch(value, restoring = false) {
    if (!value || typeof value.job_id !== 'string' || !['running','complete','partial','failed'].includes(value.state)) throw new Error('本次采集状态不可用。');
    const arriving = researchJob !== value.job_id || $('research-panel').dataset.state === 'running' || restoring;
    researchJob = value.job_id; appendResearchEvents(value.events); $('research-panel').dataset.state = value.state;
    const events = [...researchData.values()], latest = events.at(-1);
    const start = Date.parse(events[0]?.time), end = value.state === 'running' ? Date.now() : Date.parse(value.finished_at || latest?.time);
    $('research-timing').textContent = Number.isFinite(start) && Number.isFinite(end) ? `${value.state === 'running' ? '已用' : '耗时'} ${Math.max(0, Math.round((end - start) / 1000))} 秒` : '';
    $('research-frame-mode').textContent = value.state === 'running' ? '采集中 · 步骤截图' : '已结束 · 截图回放';
    $('research-activity').textContent = value.state === 'running' ? latest?.message || '等待采集进展…' : '本次采集已结束。下方是步骤截图，可点来源回看；新内容在阅读室查看。';
    const labels = {running:'正在采集', complete:'采集完成', partial:'部分来源已采集', failed:'采集未完成'};
    $('research-state').textContent = labels[value.state];
    if (value.state === 'running') { setCollecting(true); clearTimeout(researchTimer); if (canPoll()) researchTimer = setTimeout(pollResearch, 1000); return; }
    clearTimeout(researchTimer); setCollecting(false);
    if (arriving) { const extracted = events.findLast(event => event.stage === 'extract' && frameUrl(event.screenshot)); if (extracted) showResearchFrame(extracted); }
    if (value.result) { if (!restoring) applySnapshot(value.result, true, true); $('research-outcome').textContent = restoring ? '上次采集记录，可点选步骤与来源回看。' : value.state === 'partial' ? '可用内容已收集，部分来源受阻。' : '新内容已收集，阅读进度已保留。'; if (!restoring) notice($('research-outcome').textContent); }
    else { $('research-outcome').textContent = value.state === 'failed' ? '本次未取得可用信息，已有内容与阅读进度已保留。' : '本次没有新的可用信息，已有内容已保留。'; }
    if (value.error && typeof value.error === 'string') $('research-outcome').textContent += ` ${value.error}`;
  }
  async function restoreResearch() {
    if (!canPoll() || historyReading || historyRestored) return;
    historyReading = true;
    try {
      const response = await readerFetch('/research/latest', {cache:'no-store'}); if (!response.ok || destroyed) return;
      if (researchJob || researchBusy) return;
      const value = await response.json(), job = value?.job; if (destroyed) return;
      historyRestored = true;
      if (!job || researchJob || researchBusy) return;
      if (typeof job.query === 'string') $('research-query').value = job.query;
      if (topicQueries[job.topic]) researchTopic = job.topic;
      document.querySelectorAll('[data-topic]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.topic === researchTopic)));
      acceptResearch(job, true);
    } catch { /* Reading remains available when history cannot be loaded. */ }
    finally { historyReading = false; }
  }
  async function pollResearch() {
    if (!canPoll() || researchReading || !researchBusy || !researchJob) return;
    clearTimeout(researchTimer); researchReading = true;
    try { const response = await readerFetch('/research?id=' + encodeURIComponent(researchJob), {cache:'no-store'}); if (!response.ok) throw new Error('采集状态连接暂时中断'); const value = await response.json(); if (!destroyed) acceptResearch(value); }
    catch { if (canPoll() && researchBusy) { $('research-state').textContent = '连接暂时中断，正在重试'; researchTimer = setTimeout(pollResearch, 3000); } }
    finally { researchReading = false; }
  }
  $('refresh').addEventListener('click', () => {
    if (!$('research-panel').open) $('research-panel').showModal();
    if (!researchEngine && window.NewsSpider) {
      researchEngine = window.NewsSpider.mount({root:$('research-animation-stage'), canvas:$('research-spider-canvas'), depot:$('research-web-depot')});
      researchEngine.setOptions({scale:0.7}); researchEngine.setCollecting(collecting);
    }
    syncMotion();
    const event = researchData.get(researchFrameSeq) || [...researchData.values()].at(-1);
    if (event) pointResearch(event);
    if (researchBusy) $('research-close').focus();
  });
  for (const id of ['research-close','research-return']) $(id).addEventListener('click', () => $('research-panel').close());
  $('research-panel').addEventListener('close', () => { researchEngine?.pointAt(null); syncMotion(); $('refresh').focus(); });
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
    event.preventDefault(); if (researchBusy) return; const query = $('research-query').value.trim(); if (!query) { $('research-query').focus(); return; }
    clearTimeout(researchTimer); frameRequest++; researchJob = null; researchFrameSeq = null; researchEvents.clear(); researchData.clear(); $('research-events').replaceChildren(); $('research-events-empty').hidden = false; researchOverview([]);
    researchEngine?.pointAt(null);
    $('research-timing').textContent = ''; $('research-frame-mode').textContent = '采集中 · 步骤截图'; $('research-activity').textContent = '正在启动浏览器…';
    $('frame-position').textContent = '0 / 0'; $('frame-previous').disabled = true; $('frame-next').disabled = true; $('research-host').textContent = '等待页面'; document.querySelector('.research-log').open = false;
    $('research-frame').hidden = true; $('research-frame').removeAttribute('src'); $('research-frame-empty').hidden = false; $('research-frame-empty').textContent = '等待实际访问页面的截图…';
    $('research-url').textContent = '准备检索'; $('research-frame-caption').textContent = '只显示本次采集实际获得的页面画面。'; $('research-outcome').textContent = '关闭工作台后，采集仍会继续。'; $('research-state').textContent = '正在开始'; $('research-count').textContent = '0 条记录'; $('research-log-count').textContent = '0'; setCollecting(true);
    try {
      const response = await readerFetch('/research', {method:'POST', headers:{'Content-Type':'application/json', 'X-Preview-Request':'1'}, body:JSON.stringify({query, topic:researchTopic})});
      const value = await response.json(); if (!response.ok && !(response.status === 409 && value.job_id)) throw new Error('采集暂时无法开始，请稍后重试。'); acceptResearch(value);
    } catch (error) { setCollecting(false); $('research-state').textContent = '未能开始'; $('research-frame-mode').textContent = '未开始'; $('research-activity').textContent = error.message; $('research-outcome').textContent = error.message; }
  });
  document.addEventListener('keydown', event => {
    if ($('research-panel').open) return;
    if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape' && $('animation-stage').dataset.directory === 'open') { setDirectory(false); $('open-directory').focus(); }
    if (event.key === 'ArrowLeft') { const button = mediaView === 'gallery' ? $('image-previous') : $('previous'); if (!button.disabled) { event.preventDefault(); button.click(); } }
    if (event.key === 'ArrowRight') { const button = mediaView === 'gallery' ? $('image-next') : $('next'); if (!button.disabled) { event.preventDefault(); button.click(); } }
  });
  function syncHomeLayout() {
    const home = document.querySelector('.spider-home');
    const mobile = matchMedia('(max-width:720px)').matches;
    if (mobile) { if (home.parentElement !== $('reader')) $('reader').insertBefore(home, document.querySelector('.reader-footer')); }
    else { if (home.parentElement !== $('directory')) $('directory').append(home); setDirectory(false); }
    $('directory').inert = mobile && $('animation-stage').dataset.directory !== 'open';
  }
  $('article-scroll').addEventListener('scroll', cancelInvisible, {passive:true}); $('title-list').addEventListener('scroll', cancelInvisible, {passive:true}); window.addEventListener('resize', () => { syncHomeLayout(); cancelInvisible(); });
  function syncActivity() {
    syncMotion();
    if (!canPoll()) { clearTimeout(researchTimer); clearTimeout(feedTimer); return; }
    void readFeeds(false, feedAttempt).then(() => restoreResearch());
    if (researchBusy) void pollResearch();
  }
  document.addEventListener('visibilitychange', syncActivity);
  window.addEventListener('pagehide', event => { if (event.persisted) { suspended = true; syncActivity(); } else { destroyed = true; clearTimeout(researchTimer); clearTimeout(feedTimer); clearTimeout(articleRetry); if (frameObjectUrl) URL.revokeObjectURL(frameObjectUrl); stopTranslation(); engine?.destroy(); researchEngine?.destroy(); } });
  window.addEventListener('pageshow', event => { if (event.persisted) { suspended = false; syncActivity(); } });
  async function readFeeds(refresh = false, attempt = 0) {
    if (!canPoll() || feedReading) return;
    feedReading = true; feedAttempt = attempt;
    clearTimeout(feedTimer); $('refresh-feeds').disabled = true;
    try {
      const response = await readerFetch(refresh ? '/reader/refresh' : '/sample', refresh ? {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'} : {cache:'no-store'});
      if (!response.ok) throw new Error('新闻暂未更新，保留本机阅读记录。');
      const value = await response.json(); if (destroyed) return;
      const key = JSON.stringify([value.reader_id, value.sample?.captured_at,
        value.sample?.sources?.map(source => [source.id, source.source_id, source.reason]),
        Object.entries(value.sample?.streams || {}).map(([name, envelope]) => [name, envelope.items]), value.covers?.items]);
      if (key !== lastFeedKey || feedFailed) { applySnapshot(value, refresh, true); lastFeedKey = key; }
      feedFailed = false;
      if (canPoll() && value.refreshing && attempt < 35) feedTimer = setTimeout(() => readFeeds(false, attempt + 1), 1500);
    } catch (error) { if (!destroyed) { feedFailed = true; $('snapshot-note').textContent = error.message; } }
    finally { feedReading = false; if (!destroyed) $('refresh-feeds').disabled = false; }
  }
  $('refresh-feeds').addEventListener('click', () => readFeeds(true));
  async function start() {
    syncHomeLayout(); render();
    if (window.NewsSpider) {
      engine = window.NewsSpider.mount({root:$('animation-stage'), canvas:$('spider-canvas'), depot:$('web-depot'), onCapture:event => { const task = tasks.get(typeof event === 'string' ? event : event.id); $('spider-state').textContent = task?.kind === 'arrival' ? '正在接住新信息' : '正在收进仓库'; }, onDelivered:settleTask, onCancel:settleTask});
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { paused = true; engine.pause(); $('pause').textContent = '启用动画'; $('spider-state').textContent = '已减少动效'; }
    }
    syncMotion();
    window.NewsReader = {inspect:() => ({items:articles.size, visible:visibleIds.length, currentId, selected, stream, language, mediaView, imageIndex, researchJob, researchEvents:researchEvents.size, pending:[...tasks.keys()], reading:JSON.parse(JSON.stringify(records)), collecting, engine:engine?.inspect(), researchEngine:researchEngine?.inspect(), destroyed}), engine, applySnapshot};
    await readFeeds();
    restoreResearch();
  }
  start();
})();
