const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture(account = 'a') {
  const events = {};
  const calls = [], data = new Map([['draft', 'legacy']]);
  const store = {get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const window = {addEventListener:(name,callback)=>{events[name]=callback;},location:{href:'https://workbench.example.test/studio',origin:'https://workbench.example.test'},document:{querySelector:s=>({content:s.includes('ce-remote-context')?'C'.repeat(32):account.repeat(64)})}, localStorage:store,sessionStorage:store,
    fetch:async (...args)=>{ calls.push(args); return {ok:true,json:async()=>({csrf_token:'csrf'})}; }};
  const context = vm.createContext({window,Headers,Request,URL,URLSearchParams,AbortController,setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync('web/workspace/remote-context.js','utf8'),context);
  return {window,context,data,calls,events};
}
test('plain scripts freeze the context and partition storage without touching legacy data',async()=>{
  const f=fixture(); const remote=f.window.CERemoteContext;
  assert.equal(remote.storage('localStorage').getItem('draft'),null);
  remote.storage('localStorage').setItem('draft','own');
  assert.equal(f.data.get('draft'),'legacy');
  assert.equal(f.data.get('ce.remote.'+'a'.repeat(64)+'.draft'),'own');
  await remote.fetch('/api/bootstrap');
  assert.equal(f.calls[0][1].headers.get('X-CE-Context'),'C'.repeat(32));
  await remote.fetch('https://external.test/image');
  assert.equal(f.calls[1][1].headers,undefined);
  await remote.fetch('blob:https://workbench.example.test/image');
  assert.equal(f.calls[2][1].headers,undefined);
});
test('StudioData wraps even an injected fetch implementation for its first bootstrap',async()=>{
  const f=fixture();
  vm.runInContext(fs.readFileSync('web/workspace/studio-data.js','utf8'),f.context);
  const calls=[];
  const client=f.window.StudioData.create({fetchImpl:async(input,options)=>{calls.push([input,options]);return {ok:true,json:async()=>({csrf_token:'csrf'})};}});
  await client.api('/api/bootstrap');
  assert.equal(calls[0][1].headers.get('X-CE-Context'),'C'.repeat(32));
});

const deferred = () => { let resolve; const promise = new Promise(done=>{resolve=done;}); return {promise,resolve}; };
test('a denied request permanently retires the page and rejects an admitted late response before rendering or cache',async()=>{
  const f=fixture(), late=deferred(); let rendered=null, stopped=0;
  f.window.fetch=()=>late.promise;
  const api=f.window.CERemoteContext;
  api.onInactive(()=>stopped++);
  const pending=api.fetch('/api/workspace').then(r=>r.json()).then(value=>{rendered=value;api.storage('localStorage').setItem('private',JSON.stringify(value));});
  const rejected=assert.rejects(pending,/remote_context_inactive/);
  f.window.fetch=async()=>({status:401,ok:false});
  assert.equal((await api.fetch('/api/bootstrap')).status,401);
  late.resolve({status:200,ok:true,json:async()=>({private:'account-A-delayed'})});
  await rejected;
  assert.equal(rendered,null); assert.equal(stopped,1); assert.equal(api.active,false);
  api.invalidate(); assert.equal(stopped,1);
  await assert.rejects(api.fetch('/api/workspace'),/remote_context_inactive/);
  assert.throws(()=>api.storage('localStorage').setItem('private','late'),/remote_context_inactive/);
  assert.equal(f.data.size,1); // Only the untouched legacy value.
});
test('already received response bodies and injected StudioData cannot deliver after retirement',async()=>{
  for(const body of ['json','text','blob']) {
    const f=fixture(), late=deferred(), api=f.window.CERemoteContext;
    f.window.fetch=async()=>({status:200,ok:true,[body]:()=>late.promise});
    const response=await api.fetch('/api/workspace');
    const pending=response[body](); const rejected=assert.rejects(pending,/remote_context_inactive/);
    api.invalidate(); late.resolve('private-delayed'); await rejected;
  }
  const f=fixture(), late=deferred();
  vm.runInContext(fs.readFileSync('web/workspace/studio-data.js','utf8'),f.context);
  const client=f.window.StudioData.create({fetchImpl:()=>late.promise});
  const rejected=assert.rejects(client.api('/api/workspace'),/remote_context_inactive/);
  f.window.CERemoteContext.invalidate();
  late.resolve({status:200,ok:true,json:async()=>({private:'late'})}); await rejected;
});
test('cross-tab notifications retire the frozen context and never reactivate it',()=>{
  const f=fixture(),api=f.window.CERemoteContext;
  f.events.storage({key:'unrelated',newValue:'value'}); assert.equal(api.active,true);
  f.events.storage({key:'ce.remote.session-change',newValue:'opaque-notification'});
  assert.equal(api.active,false); assert.throws(()=>api.assertActive(),/remote_context_inactive/);
  f.events.storage({key:'ce.remote.session-change',newValue:null}); assert.equal(api.active,false);
});
test('local pages keep native storage and response behavior after notifications',async()=>{
  const f=fixture(); f.window.document.querySelector=()=>null; delete f.window.CERemoteContext; delete f.window.CERemotePageState;
  vm.runInContext(fs.readFileSync('web/workspace/remote-context.js','utf8'),f.context);
  const api=f.window.CERemoteContext; api.invalidate();
  assert.equal(api.active,true);assert.equal(api.storage('localStorage'),f.window.localStorage);
  assert.deepEqual(await (await api.fetch('/api/bootstrap')).json(),{csrf_token:'csrf'});
});

test('a suspended tab detects a missed account notification before a delayed body or cache is consumed',async()=>{
  const f=fixture(),api=f.window.CERemoteContext;
  const response=await api.fetch('/api/bootstrap');
  f.window.localStorage.setItem('ce.remote.session-change','new-session-without-event');
  await assert.rejects(response.json(),/remote_context_inactive/);
  assert.equal(api.active,false);
});
