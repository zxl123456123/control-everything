// Exercise the delivered reader with synthetic DOM, timers and same-origin responses.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

class Element {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.value = ''; this.text = ''; this.hidden = false; this.open = false; this.isConnected = true; this.classList = {add() {}, remove() {}, toggle() {}}; }
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
  focus() {}
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
function fixture() {
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
    if (url === '/api/bootstrap') return response({csrf_token:'fixture'});
    if (url.includes('research/latest')) return response({job:null});
    if (url.includes('/research')) return response(await (state.research ? state.research(url,options) : running()));
    return response(await (state.feed ? state.feed(url,options) : state.value));
  };
  const window = {addEventListener:(key,callback) => {windowEvents[key]=callback;}};
  const context = {window,document,URL,Headers,AbortController,console,location:new URL('http://fixture.test/news'),matchMedia:() => ({matches:false}),innerWidth:1280,innerHeight:800,
    fetch,localStorage:{getItem:() => null,setItem:(key,value) => writes.push({key,value})},queueMicrotask, setTimeout:(callback,ms) => {timers.set(++timerId,{callback,ms});return timerId;},clearTimeout:id => timers.delete(id)};
  vm.runInNewContext(fs.readFileSync(path.join(root,'web/workspace/news-reader.js'),'utf8'),context);
  return {calls,writes,timers,state,document,windowEvents,node:id => ids.get(id),
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
