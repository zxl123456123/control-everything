// Synthetic DOM and transport only; never connects to an observed session or terminal.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('web/sessions/index.html','utf8');
const source = fs.readFileSync('web/sessions/app.js','utf8').replace('\ninitializeSessionPage();','\n');
class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.listeners={};this.hidden=false;this.text='';this.subnodes={};this.classList={toggle(){},add(){},remove(){}};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.text='';this.children=[...children];}
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(key,fn){this.listeners[key]=fn;}
  removeEventListener(key){delete this.listeners[key];}
  querySelector(key){return this.subnodes[key]??=new Element();}
  querySelectorAll(){return this.children.flatMap(n=>[n,...n.querySelectorAll()]).filter(n=>n.tagName==='button');}
  focus(){this.focused=true;}
}
function fixture(){
  const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  const events={},documentEvents={},timers=new Map(),calls=[],reads=[],mounts=[],disposed=[];let next=0;
  const first={mount(options){mounts.push(options);return()=>disposed.push('unmount');},dispose(){disposed.push('dispose');}};
  const window={CEUITheme:{pageTheme:first,earlyRead(key){reads.push(key);return{mount: first.mount,dispose:first.dispose};}},addEventListener(key,fn){events[key]=fn;}};
  const document={body:new Element('body'),hidden:false,getElementById:id=>nodes.get(id),querySelector:key=>nodes.get(key.slice(1)),createElement:tag=>new Element(tag),addEventListener(key,fn){documentEvents[key]=fn;}};
  const context=vm.createContext({window,document,location:new URL('http://fixture.test/sessions'),URLSearchParams,performance:{now:()=>1000},setInterval(fn,delay){timers.set(++next,{fn,delay});return next;},clearInterval:id=>timers.delete(id),fetch(url,options){return new Promise((resolve,reject)=>calls.push({url,options,resolve,reject}));},navigator:{clipboard:{writeText:async()=>{}}},console});
  vm.runInContext(source,context);
  return{nodes,events,documentEvents,timers,calls,reads,mounts,disposed,document,run:code=>vm.runInContext(code,context)};
}
const reply=body=>({ok:true,json:async()=>body});
test('sessions consumes the head controller once and remounts a fresh one after BFCache',()=>{
  const f=fixture();assert.equal(f.calls.length,0);assert.equal(f.reads.length,0);assert.equal(f.mounts[0].roots[0],f.document.body);assert.equal(f.mounts[0].toggles[0],f.nodes.get('sessions-theme'));
  f.events.pagehide({persisted:true});assert.deepEqual(f.disposed,['unmount','dispose']);f.events.pageshow({persisted:true});assert.deepEqual(f.reads,['ce.sessions.theme']);f.events.pagehide({persisted:false});assert.equal(f.timers.size,0);
});
test('same-directory UUIDs remain separate and unknown or old evidence never qualifies for focus',()=>{
  const f=fixture();f.run(`state.connected=true;state.received=1000;state.snapshotAge=0;state.records=[{session_id:'11111111-1111-1111-1111-111111111111',cwd:'fixture/shared',age_ms:0,registration_state:'present',identity_state:'verified',terminal_binding:'confirmed',reason_codes:[]},{session_id:'22222222-2222-2222-2222-222222222222',cwd:'fixture/shared',age_ms:0,registration_state:'present',identity_state:'unknown',terminal_binding:'unknown',reason_codes:[]}];renderSessions();`);
  assert.equal(f.nodes.get('sessions').querySelectorAll().length,2);assert.equal(f.run('eligible(state.records[0])'),true);assert.equal(f.run('eligible(state.records[1])'),false);
  f.run('state.records[0].age_ms=5001');assert.equal(f.run('eligible(state.records[0])'),false);f.run('state.records[0].age_ms=30001');assert.equal(f.run('recordView(state.records[0]).category'),'unknown');assert.equal(f.calls.length,0);
});
test('message pagination keeps UUID and revision and ignores a late previous selection',async()=>{
  const f=fixture();f.run(`state.selected='A';var first=readMessages(0,'revision-a',20);state.epoch++;state.selected='B';state.reading=false;var second=readMessages(20,'revision-b',20);`);
  assert.equal(f.calls[0].url,'/api/sessions/A/messages?limit=20&offset=0&revision=revision-a');assert.equal(f.calls[1].url,'/api/sessions/B/messages?limit=20&offset=20&revision=revision-b');
  const page={available:true,items:[{uuid:'message-b',session_id:'B',type:'user',message:{content:'B body'}}],offset:20,next_offset:null,total_visible:21,reader_version:'fixture',read_at:'2026-10-26T00:00:00Z'};
  f.calls[1].resolve(reply(page));await f.run('second');f.calls[0].resolve(reply({...page,items:[{type:'user',uuid:'old',message:'A body'}],offset:0}));await f.run('first');
  assert.match(f.nodes.get('messages').textContent,/B body/);assert.doesNotMatch(f.nodes.get('messages').textContent,/A body/);assert.equal(f.nodes.get('page-range').textContent,'21–21 / 21');assert.equal(f.nodes.get('newer').disabled,true);
});
test('metadata timers pause while hidden and never read message bodies automatically',()=>{
  const f=fixture();f.document.hidden=true;for(const timer of f.timers.values())timer.fn();assert.equal(f.calls.length,0);f.document.hidden=false;f.run('state.initialized=true;state.capabilities={remote_sessions:false,workbench:false};');f.documentEvents.visibilitychange();assert.equal(f.calls.length,1);assert.match(f.calls[0].url,/^\/api\/codex\/threads\?offset=0$/);assert.equal(f.calls.some(r=>r.url.includes('/messages')),false);
});
test('standalone head is external, preserves actual identity controls and exposes optional evidence',()=>{
  assert.match(html,/<script src="\/ui-theme.js" data-ce-theme-key="ce.sessions.theme"><\/script>/);assert.doesNotMatch(html,/<script>/);assert.match(html,/<details class="panel evidence-panel">/);
  for(const id of ['session-id','focus-session','older','newer','codex-previous','codex-next','connection-state'])assert.match(html,new RegExp(`id="${id}"`));
});
