// Exercise the delivered reader with synthetic DOM, timers and same-origin responses.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

class Element {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.style = {}; this.listeners = {}; this.listenerAdds = {}; this.value = ''; this.text = ''; this.hidden = false; this.open = false; this.isConnected = true; this.classList = {add() {}, remove() {}, toggle() {}}; }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = null; }
  replaceChildren(...nodes) { this.children = []; this.text = ''; this.append(...nodes); }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(node => node.textContent).join(''); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(key, callback) { this.listenerAdds[key]=(this.listenerAdds[key]||0)+1; this.listeners[key] = callback; }
  get all() { return this.children.flatMap(node => [node, ...node.all]); }
  querySelectorAll(selector) { return this.all.filter(node => matches(node, selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  get options() { return this.querySelectorAll('option'); }
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
function fixture({settingsEnabled=false, spiders=false, mobile=false} = {}) {
  const tree = new Element(), ids = new Map(), timers = new Map(), windowEvents = {}, documentEvents = {}, calls = [], writes = [];
  let timerId = 0;
  const html = fs.readFileSync(path.join(root, 'web/workspace/news-reader.html'), 'utf8');
  for (const [, tag, attributes] of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const node = new Element(tag);
    for (const [, key, value = ''] of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) { node.setAttribute(key, value); if (key === 'id') {node.id = value; ids.set(value, node);} if (key === 'class') node.className = value; if (key.startsWith('data-')) node.dataset[key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value; }
    tree.append(node);
  }
  const document = {hidden:false,documentElement:new Element('html'),getElementById:id => ids.get(id),createElement:tag => new Element(tag),createDocumentFragment:() => new Element('fragment'),querySelector:selector => tree.querySelector(selector),querySelectorAll:selector => tree.querySelectorAll(selector),addEventListener:(key,callback) => {documentEvents[key]=callback;}};
  const wrapper = tree.querySelector('.news-reader-root');
  wrapper.ownerDocument = document; wrapper.querySelector = selector => tree.querySelector(selector); wrapper.querySelectorAll = selector => tree.querySelectorAll(selector);
  ids.get('directory').append(tree.querySelector('.spider-home'));
  const state = {engineMounts:0,value:sample(),feed:null,research:null, settings:{reader_id:'fixture', settings:{schema:1,revision:1,sources:[],view:{source_id:null,group:null},schedule:{enabled:false,mode:'interval',interval_minutes:null,times:[],timezone:'Asia/Shanghai',browser:{enabled:false,topic:null,query:''}}},runtime:{owner:'owned',state:'idle',run_id:null,result:null}}};
  const response = value => ({ok:true,status:200,json:async () => value});
  const fetch = async (url, options = {}) => {
    calls.push({url,method:options.method || 'GET'}); await Promise.resolve();
    if (url === '/api/bootstrap') return response({csrf_token:'fixture'});
    if (url.endsWith('/settings')) return response(await (state.readSettings ? state.readSettings() : state.settings));
    if (url.includes('research/latest')) return response({job:null});
    if (url.includes('/research')) return response(await (state.research ? state.research(url,options) : running()));
    return response(await (state.feed ? state.feed(url,options) : state.value));
  };
  const window = {removeEventListener(){},addEventListener:(key,callback) => {windowEvents[key]=callback;}};
  const stored=new Map(spiders ? [['news-reader-pet','spider'],['news-reader-pet-enabled','true']] : []);
  window.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>{stored.set(key,value);writes.push({key,value});},removeItem:key=>stored.delete(key)};
  const context = {window,document,URL,Headers,AbortController,console,location:new URL('http://fixture.test/news'),matchMedia:query => ({matches:mobile && query.includes('max-width:720px')}),innerWidth:1280,innerHeight:800,
    fetch,localStorage:window.localStorage,queueMicrotask, setTimeout:(callback,ms) => {timers.set(++timerId,{callback,ms});return timerId;},clearTimeout:id => timers.delete(id)};
  if (settingsEnabled) vm.runInNewContext(fs.readFileSync(path.join(root,'web/workspace/news-settings.js'),'utf8'),context);
  if (spiders) window.NewsSpider={mount:options=>{state.engineMounts++;let running=true;return {setOptions(){},setCollecting(){},pointAt(){},pause(){running=false;},resume(){running=true;},destroy(){running=false;},cancel(id){options.onCancel?.({id});},capture(){return true;},inspect:()=>({running})};}};
  window.NewsSections={mount:() => { let rows=[],current=null; return {update(snapshot,wanted) { rows=Object.keys(snapshot.sample.streams).map(id => ({id})); const before=current; current=rows.some(row => row.id===wanted) ? wanted : rows[0]?.id ?? null; return before!==current && current!==wanted; },current:() => current,list:() => rows,select() {},isCustom:() => false,hasSources:() => true,problems:() => []}; }};
  window.NewsSearch={mount:() => ({refresh() {},close() {},isOpen:() => false,recent:() => []})};
  window.NewsPetWheel={create:() => ({isOpen:() => false,setPinned() {},refresh() {},close() {},destroy() {},toggle() {}})};

  for(const file of ['news-pets.js','news-pet-dial.js','news-pet-prefs.js','news-pet-director.js','news-reader.js']) vm.runInNewContext(fs.readFileSync(path.join(root,'web/workspace',file),'utf8'),context);
  return {calls,writes,timers,state,document,window,windowEvents,node:id => ids.get(id),
    async hidden(value) {document.hidden=value;documentEvents.visibilitychange();await flush();},
    async tick(ms) {const timer=[...timers].find(([,timer]) => timer.ms===ms); assert.ok(timer,`timer ${ms}`);timers.delete(timer[0]);timer[1].callback();await flush();}};
}


module.exports={fixture,flush,sample,running};
