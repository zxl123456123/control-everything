// Exercise the delivered reader with synthetic DOM, timers and same-origin responses.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

class Element {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.style = {}; this.value = ''; this.text = ''; this.hidden = false; this.open = false; this.isConnected = true; this.classList = {add() {}, remove() {}, toggle() {}}; }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
  replaceChildren(...nodes) { this.children = []; this.text = ''; this.append(...nodes); }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(node => node.textContent).join(''); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(key, callback) { this.listeners[key] = callback; }
  get all() { return this.children.flatMap(node => [node, ...node.all]); }
  querySelectorAll(selector) { return this.all.filter(node => matches(node, selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get nextElementSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null; }
  insertBefore(node, before) { node.remove(); node.parentElement = this; const index = this.children.indexOf(before); this.children.splice(index < 0 ? this.children.length : index, 0, node); }
  closest() { return null; }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.(); }
}
function matches(node, selector) {
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('.')) return (node.className || '').split(' ').includes(selector.slice(1));
  const attribute = selector.match(/^(\w+)?\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
  if (attribute) return (!attribute[1] || node.tagName === attribute[1].toUpperCase()) && Object.hasOwn(node.attributes, attribute[2]) && (!attribute[3] || node.attributes[attribute[2]] === attribute[3]);
  return node.tagName === selector.toUpperCase();
}
const sample = (refreshing = true) => ({ reader_id: 'fixture', sample: {captured_at: null, sources: [{id:'fixture',reason:null,cache_age_ms:0}], streams: {ai:{items:[]},hn:{items:[]}}}, covers:{items:[]}, refreshing });
const running = () => ({job_id:'fixture-job',state:'running',events:[]});
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function fixture(remote = false, withTheme = true) {
  const tree = new Element(), ids = new Map(), timers = new Map(), windowEvents = {}, documentEvents = {}, calls = [], writes = [];
  let timerId = 0;
  const html = fs.readFileSync(path.join(root, 'web/workspace/news-reader.html'), 'utf8');
  for (const [, tag, attributes] of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const node = new Element(tag);
    for (const [, key, value = ''] of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) { node.setAttribute(key, value); if (key === 'id') {node.id = value; ids.set(value, node);} if (key === 'class') node.className = value; if (key.startsWith('data-')) node.dataset[key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value; }
    tree.append(node);
  }
  const document = {hidden:false,documentElement:new Element('html'),getElementById:id => ids.get(id),createElement:tag => new Element(tag),createDocumentFragment:() => new Element('fragment'),querySelector:selector => tree.querySelector(selector),querySelectorAll:selector => tree.querySelectorAll(selector),addEventListener:(key,callback) => {documentEvents[key]=callback;}};
  ids.get('directory').append(tree.querySelector('.spider-home'));
  const state = {value:sample(),feed:null,research:null};
  const response = value => ({ok:true,status:200,json:async () => value});
  const fetch = async (url, options = {}) => {
    calls.push({url,method:options.method || 'GET'});
    if (url === '/api/bootstrap') return response(state.bootstrap ? await state.bootstrap() : {csrf_token:'fixture'});
    if (url.includes('research/latest')) return response({job:null});
    if (url.includes('/research')) return response(await (state.research ? state.research(url,options) : running()));
    return response(await (state.feed ? state.feed(url,options) : state.value));
  };
  const window = {addEventListener:(key,callback) => {windowEvents[key]=callback;}};
  const themeReads=[],themeMounts=[],themeDisposals=[];
  if(withTheme)window.CEUITheme={earlyRead(key){if(window.CERemoteContext)assert.equal(Object.isFrozen(window.CERemoteContext),true);themeReads.push(key);return{mount(options){themeMounts.push(options);return()=>{};},dispose(){themeDisposals.push(key);}};}};
  const context = {window,document,URL,URLSearchParams,Headers,AbortController,console,location:new URL('http://fixture.test/news'),matchMedia:() => ({matches:false}),innerWidth:1280,innerHeight:800,
    fetch,Request,localStorage:{getItem:() => null,setItem:(key,value) => writes.push({key,value})},queueMicrotask, setTimeout:(callback,ms) => {timers.set(++timerId,{callback,ms});return timerId;},clearTimeout:id => timers.delete(id)};
  if (remote) {
    const query = document.querySelector;
    document.querySelector = selector => selector.includes('ce-remote-context') ? {content:'A'.repeat(32)} : selector.includes('ce-storage-scope') ? {content:'a'.repeat(64)} : query(selector);
    Object.assign(window,{location:new URL('https://workbench.example.test/news'),document,fetch,localStorage:context.localStorage,sessionStorage:context.localStorage});
    vm.runInNewContext(fs.readFileSync(path.join(root,'web/workspace/remote-context.js'),'utf8'),context);
  }
  vm.runInNewContext(fs.readFileSync(path.join(root,'web/workspace/news-reader.js'),'utf8'),context);
  return {calls,writes,timers,state,window,document,windowEvents,themeReads,themeMounts,themeDisposals,node:id => ids.get(id),
    async hidden(value) {document.hidden=value;documentEvents.visibilitychange();await flush();},
    async tick(ms) {const timer=[...timers].find(([,timer]) => timer.ms===ms); assert.ok(timer,`timer ${ms}`);timers.delete(timer[0]);timer[1].callback();await flush();}};
}

test('unchanged feed polls preserve storage and ignore changing transport age fields', async () => {
  const f = fixture(); await flush(); assert.equal(f.writes.length,1);
  f.state.value.sample.sources[0].cache_age_ms = 1500;
  await f.tick(1500); assert.equal(f.writes.length,1);
  f.state.value.sample.sources[0].reason = 'offline';
  await f.tick(1500); assert.equal(f.writes.length,2);
});

test('feed polling pauses in hidden pages and resumes one GET without replaying refresh POST', async () => {
  const f=fixture(); await flush(); await f.node('refresh-feeds').listeners.click(); await flush();
  assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  await f.hidden(true); assert.equal(f.timers.size,0);
  const before=f.calls.length; await f.hidden(false);
  assert.equal(f.calls.length,before+1); assert.equal(f.calls.at(-1).method,'GET'); assert.equal(f.writes.length,1);
});

test('an unchanged successful response clears a previous feed connection error', async () => {
  const f=fixture(); await flush(); const note=f.node('snapshot-note').textContent;
  f.state.feed=() => {throw new Error('offline fixture');};
  await f.tick(1500); assert.equal(f.node('snapshot-note').textContent,'offline fixture');
  f.state.feed=null; await f.hidden(true); await f.hidden(false);
  assert.equal(f.node('snapshot-note').textContent,note); assert.equal(f.writes.length,2);
});

test('overlapping visible events cannot start a second feed read', async () => {
  const f=fixture(); await flush(); let finish;
  f.state.feed=() => new Promise(resolve=>{finish=resolve;});
  await f.tick(1500); const before=f.calls.length;
  await f.hidden(true); await f.hidden(false); await f.hidden(false);
  assert.equal(f.calls.length,before); finish(sample(false)); await flush(); assert.equal(f.node('refresh-feeds').disabled,false);
});

test('research polling pauses while hidden and resumes without creating another job', async () => {
  const f=fixture(); await flush(); f.node('research-query').value='fixture query';
  await f.node('research-form').listeners.submit({preventDefault(){}}); await flush();
  const posts=f.calls.filter(call=>call.method==='POST').length;
  assert.ok([...f.timers.values()].some(timer=>timer.ms===1000));
  await f.hidden(true); assert.equal(f.timers.size,0);
  await f.hidden(false);
  assert.equal(f.calls.filter(call=>call.method==='POST').length,posts);
  assert.equal(f.calls.filter(call=>call.url.includes('/research?id=')).length,1);
});

test('BFCache suspension pauses timers and a destroyed page ignores late feed results', async () => {
  const f=fixture(); await flush(); f.windowEvents.pagehide({persisted:true}); assert.equal(f.timers.size,0);
  const before=f.calls.length; f.windowEvents.pageshow({persisted:true}); await flush(); assert.equal(f.calls.length,before+1);
  let finish; f.state.feed=() => new Promise(resolve=>{finish=resolve;}); await f.tick(1500);
  f.windowEvents.pagehide({persisted:false}); const writes=f.writes.length;
  const value=sample(); value.sample.captured_at='2026-10-25T00:00:00Z'; finish(value); await flush();
  assert.equal(f.writes.length,writes); assert.equal(f.timers.size,0);
});

test('remote retirement destroys the existing reader, cancels polling and ignores admitted late feeds',async()=>{
  const f=fixture(true);await flush();
  let release;f.state.feed=()=>new Promise(resolve=>{release=resolve});
  await f.tick(1500);const written=f.writes.length;
  f.windowEvents.storage({key:'ce.remote.session-change',newValue:'opaque-session-change'});
  assert.equal(f.timers.size,0);
  release(sample(false));await flush();assert.equal(f.writes.length,written);
  const calls=f.calls.length;await f.hidden(false);assert.equal(f.calls.length,calls);
  f.windowEvents.pageshow({persisted:true});await flush();assert.equal(f.calls.length,calls);
});

test('news theme uses its exact key and actual roots, suspends for BFCache and disposes on context retirement',async()=>{
  const f=fixture(true);await flush();assert.deepEqual(f.themeReads,['ce.news.theme']);
  assert.equal(f.themeMounts[0].roots[0],f.document.documentElement);assert.equal(f.themeMounts[0].roots[1],f.node('news-room'));assert.equal(f.themeMounts[0].roots[2],f.node('research-panel'));assert.equal(f.themeMounts[0].toggles[0],f.node('theme'));assert.equal(f.themeMounts[0].status,f.node('theme-error'));
  f.windowEvents.pagehide({persisted:true});assert.equal(f.themeDisposals.length,1);f.windowEvents.pageshow({persisted:true});await flush();assert.equal(f.themeReads.length,2);
  f.windowEvents.storage({key:'ce.remote.session-change',newValue:'fixture-retired'});assert.equal(f.themeDisposals.length,2);assert.equal(f.timers.size,0);
});

test('missing news theme resource is visible and cannot fake a successful theme change',async()=>{
  const f=fixture(false,false);await flush();assert.equal(f.node('theme').disabled,true);assert.equal(f.node('theme-error').hidden,false);assert.match(f.node('theme-error').textContent,/资源未加载/);assert.equal(f.node('theme').listeners.click,undefined);
});

test('research IME consumes only the dialog cancel, returns focus and never creates a collection job',async()=>{
  const f=fixture();await flush();f.node('refresh').listeners.click();assert.equal(f.node('research-panel').open,true);
  const panel=f.node('research-panel');let prevented=0;panel.listeners.compositionstart();panel.listeners.cancel({preventDefault(){prevented++;}});assert.equal(prevented,1);assert.equal(panel.open,true);
  panel.listeners.compositionend();panel.listeners.cancel({preventDefault(){}});assert.equal(panel.open,false);assert.equal(f.node('refresh').focused,true);assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
});

test('news opens with cards and restores the same filtered list, selection and scroll after reading',async()=>{
  const f=fixture();await flush();
  const id='a'.repeat(24), value=sample(false);
  f.node('date-range').value='all';
  value.sample.streams.ai.items=[{id,title:'Design review',source_id:'fixture',source_name:'Example',url:'https://example.test/article',summary:'Actual article summary',body_blocks:[{type:'p',text:'Article body.'}]}];
  f.windowEvents.resize();
  f.window.NewsReader.applySnapshot(value);
  const list=f.node('title-list'), card=list.querySelector('.title-row');
  assert.equal(f.window.NewsReader.inspect().readingView,'list');
  assert.equal(f.node('directory').inert,false);
  f.node('search').value='Design';f.node('search').listeners.input();list.scrollTop=145;
  card.listeners.click();await flush();
  assert.equal(f.window.NewsReader.inspect().readingView,'article');
  assert.equal(f.node('reader').inert,false);
  assert.equal(f.node('article-title').textContent,'Design review');
  f.node('back-to-list').listeners.click();
  assert.equal(f.window.NewsReader.inspect().readingView,'list');
  assert.equal(f.node('reader').inert,true);
  assert.equal(f.node('search').value,'Design');
  assert.equal(f.window.NewsReader.inspect().currentId,id);
  assert.equal(list.scrollTop,145);assert.equal(card.focused,true);
  assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
});

test('news card empty states distinguish search results from an empty collection',async()=>{
  const f=fixture();await flush();
  assert.equal(f.node('list-empty-message').textContent,'今天还没有可读新闻');
  assert.equal(f.node('show-history').hidden,false);
  assert.equal(f.node('clear-search').hidden,true);
  f.node('search').value='missing';f.node('search').listeners.input();
  assert.equal(f.node('list-empty-message').textContent,'没有匹配的新闻');
  assert.equal(f.node('clear-search').hidden,false);
});

test('full news cascade gives list cards intrinsic rows without changing the compact reader directory',async()=>{
  const {pathToFileURL}=require('node:url');
  const {Window}=await import(pathToFileURL(path.join(root,'web/workbench-engine/node_modules/happy-dom/lib/index.js')).href);
  function resolved(view){
    const w=new Window();
    try {
      w.document.body.innerHTML=`<main id="news-room"><section id="animation-stage" data-reading-view="${view}"><aside id="directory"><div id="title-list"><button class="title-row"><span class="title-row-content"><span class="title-row-title">Long article title</span><span class="title-row-summary">Article summary</span></span><img class="title-row-thumbnail"><span class="title-row-meta">Source</span></button></div></aside></section></main>`;
      const style=w.document.createElement('style');style.textContent=fs.readFileSync(path.join(root,'web/workspace/news-reader.css'),'utf8');w.document.head.append(style);
      const list=w.document.getElementById('title-list'),card=list.querySelector('.title-row');
      return {rows:w.getComputedStyle(list).gridAutoRows,minHeight:w.getComputedStyle(card).minHeight,alignSelf:w.getComputedStyle(card).alignSelf};
    } finally {w.happyDOM.abort();w.close();}
  }
  const list=resolved('list'),reader=resolved('article');
  assert.equal(list.rows,'max-content');assert.equal(list.minHeight,'min-content');assert.equal(list.alignSelf,'start');
  assert.notEqual(reader.rows,'max-content');assert.equal(reader.minHeight,'40px');
});


test('retained reader pauses feed requests while inactive and preserves its instance', async () => {
  const f=fixture(); await flush(); const before=f.calls.length, reader=f.window.NewsReader;
  reader.setActive(false); assert.equal(f.timers.size,0);
  await f.hidden(true); await f.hidden(false); assert.equal(f.calls.length,before);
  reader.setActive(true); await flush(); assert.equal(f.calls.length,before+1);
  assert.equal(f.window.NewsReader,reader); assert.equal(reader.inspect().active,true);
  reader.setActive(false); reader.dispose(); reader.setActive(true); await flush();
  assert.equal(reader.inspect().destroyed,true); assert.equal(f.calls.length,before+1);
});


test('hidden reader rejects late feed writes and research screenshot follow-ups', async () => {
  const f=fixture(); await flush();
  let finishFeed; f.state.feed=()=>new Promise(resolve=>{finishFeed=resolve;});
  await f.tick(1500);
  f.node('research-query').value='AI agents';
  await f.node('research-form').listeners.submit({preventDefault(){}}); await flush();
  let finishResearch; f.state.research=()=>new Promise(resolve=>{finishResearch=resolve;});
  await f.tick(1000);
  f.window.NewsReader.setActive(false); const calls=f.calls.length, writes=f.writes.length;
  const value=sample(false); value.sample.captured_at='2026-10-26T01:00:00Z'; finishFeed(value);
  finishResearch({...running(),events:[{seq:1,message:'fixture screenshot',stage:'capture',url:'https://example.com',screenshot:'/api/workspace/news/research-frame?job=fixture-job&name=1.jpg'}]});
  await flush(); assert.equal(f.calls.length,calls); assert.equal(f.writes.length,writes); assert.equal(f.timers.size,0);
});


test('hiding during bootstrap prevents the pending collection POST and never replays it', async () => {
  const f=fixture(); await flush(); let bootstrap;
  f.state.bootstrap=()=>new Promise(resolve=>{bootstrap=resolve;});
  f.node('research-query').value='AI agents';
  const submit=f.node('research-form').listeners.submit({preventDefault(){}}); await flush();
  f.window.NewsReader.setActive(false); bootstrap({csrf_token:'fixture'}); await submit; await flush();
  assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
  f.window.NewsReader.setActive(true); await flush();
  assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
});


test('resuming before bootstrap returns cannot revive a cancelled collection intent', async () => {
  const f=fixture(); await flush(); let bootstrap;
  f.state.bootstrap=()=>new Promise(resolve=>{bootstrap=resolve;});
  f.node('research-query').value='AI agents';
  const submit=f.node('research-form').listeners.submit({preventDefault(){}}); await flush();
  f.window.NewsReader.setActive(false); f.window.NewsReader.setActive(true);
  bootstrap({csrf_token:'fixture'}); await submit; await flush();
  assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
});
