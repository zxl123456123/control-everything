const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('web/workspace/account-device.js', 'utf8');
const settle = async () => { for(let i=0;i<30;i++) await Promise.resolve(); };
const response = (value,status=200) => ({status,ok:status>=200&&status<300,json:async()=>value});
const session = extra => ({csrf:'synthetic-csrf',account:{sub:'member',name:'测试成员'},membership:'active',admin:false,device:null,...extra});
function fixture(fetcher, {mode='remote',embedded=false,members=async()=>response({items:[],total:0,limit:25,offset:0})}={}) {
  const nodes=new Map(),calls=[],navigations=[],notices=[],portals=[],timers=new Map(),inactive=new Set();
  let sequence=0,focused=null,unmounted=false;
  function node(name,hidden=false) {
    const events=new Map();let ownText='';
    return {hidden,dataset:{},disabled:false,open:false,children:[],
      get textContent(){return ownText+this.children.map(child=>child.textContent||'').join('');},set textContent(value){ownText=String(value);this.children=[];},
      append(...children){this.children.push(...children);},replaceChildren(...children){ownText='';this.children=children;},setAttribute(name,value){this[name]=value;},
      addEventListener(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},
      removeEventListener(name,fn){events.get(name)?.delete(fn);},
      emit(name,event={}){for(const fn of [...(events.get(name)||[])])fn({currentTarget:this,preventDefault(){},...event});},
      focus(){focused=name;},showModal(){this.open=true;},close(){this.open=false;this.emit('close');},
      get listenerCount(){return [...events.values()].reduce((a,b)=>a+b.size,0);}};
  }
  const container={set innerHTML(value){for(const tag of value.matchAll(/<[^>]*data-(node|action)="([^"]+)"[^>]*>/g)){nodes.set(tag[1]+':'+tag[2],node(tag[2],/\bhidden\b/.test(tag[0])));}},querySelector(selector){const m=selector.match(/data-(node|action)="([^"]+)"/);return nodes.get(m[1]+':'+m[2]);},replaceChildren(){unmounted=true;}};
  const context=embedded?{context:'synthetic',active:true,onInactive(fn){inactive.add(fn);return()=>inactive.delete(fn);},invalidate(){this.active=false;for(const fn of [...inactive])fn();inactive.clear();}}:null;
  const document=node('document'),windowEvents=node('window');document.createElement=tag=>node(tag);
  const window={document,CERemoteContext:context,addEventListener:(...args)=>windowEvents.addEventListener(...args),removeEventListener:(...args)=>windowEvents.removeEventListener(...args),localStorage:{setItem:(...args)=>notices.push(args)},location:{assign:url=>navigations.push(url)},setTimeout(fn){timers.set(++sequence,fn);return sequence;},clearTimeout(id){timers.delete(id);},fetch:async(path,options)=>{calls.push({path,options});return path.startsWith('/remote/api/admin/members?')?members(path,options):fetcher(path,options);}};
  vm.runInNewContext(source,{window,AbortController,FormData});
  const dispose=window.StudioAccountDevice.mount(container,{mode,returnHash:'#projects',onPortal:value=>portals.push(value)});
  return {calls,navigations,notices,portals,timers,context,dispose,window,windowEvents,visibility(hidden){document.hidden=hidden;document.emit('visibilitychange');},focusWindow(){windowEvents.emit('focus');},get:name=>nodes.get('node:'+name),button:name=>nodes.get('action:'+name),click(name){nodes.get('action:'+name).emit('click');},get focused(){return focused;},get unmounted(){return unmounted;},async tick(){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();await settle();}};
}
test('raw independent 401 never parses JSON and exposes only login',async()=>{
  let parsed=false;const f=fixture(async()=>({status:401,ok:false,json(){parsed=true;throw Error('unexpected');}}));await settle();
  assert.equal(parsed,false);assert.equal(f.get('login').hidden,false);assert.equal(f.get('account').textContent,'');
  for(const name of ['activation','invitations','revoke-area','open'])assert.equal(f.get(name).hidden,true);
  assert.match(f.get('status').textContent,/请登录/);assert.equal(f.navigations.length,0);f.dispose();
});
test('independent new session adopts its account and successful logout retires page state',async()=>{
  const f=fixture(path=>response(path.endsWith('/session')?session({session_changed:true,admin:true}):{logout_url:'/oauth2/sign_out'}));await settle();
  assert.equal(f.get('account').textContent,'测试成员');assert.equal(f.get('invitations').hidden,false);assert.equal(f.notices.length,1);
  f.click('logout');await settle();assert.deepEqual(f.navigations,['/oauth2/sign_out']);assert.equal(f.notices.length,2);assert.equal(f.get('account').textContent,'');f.dispose();
});
test('remote mode never loads bootstrap and keeps unbound and offline account management usable',async()=>{
  for(const device of [null,{device_id:'d',name:'测试电脑',state:'offline'},{device_id:'d',name:'测试电脑',state:'online'}]){
    const f=fixture(async()=>response(session({device})));await settle();assert.equal(f.calls[0].path,'/remote/api/session');assert.equal(f.calls.length,1);
    assert.equal(f.get('account').textContent,'测试成员');assert.equal(f.get('open').hidden,device?.state!=='online');assert.equal(f.timers.size,0);f.dispose();
  }
});
test('only boolean admin exposes invitations; non-admin click cannot send a write',async()=>{
  for(const admin of [false,'true',true]){const f=fixture(async()=>response(session({admin})));await settle();assert.equal(f.get('invitations').hidden,admin!==true);if(admin!==true){f.click('invitation');await settle();assert.equal(f.calls.length,1);}f.dispose();}
});
test('invitation disables repeat writes, includes CSRF and stays only in DOM',async()=>{
  let release;const f=fixture(path=>path.endsWith('/session')?response(session({admin:true})):new Promise(resolve=>release=resolve));await settle();
  f.click('invitation');f.click('invitation');assert.equal(f.calls.length,3);assert.equal(f.button('invitation').disabled,true);const write=f.calls.find(call=>call.options.method==='POST');assert.equal(write.options.headers['X-CE-CSRF'],'synthetic-csrf');assert.equal(write.options.body,'{}');
  release(response({invitation:'synthetic-invite'}));await settle();assert.equal(f.get('invitation-code').textContent,'synthetic-invite');assert.equal(f.notices.length,0);assert.equal(f.button('invitation').disabled,false);f.dispose();
});
test('business 403 preserves session, hides invitation result and permits explicit retry',async()=>{
  const f=fixture(path=>response(path.endsWith('/session')?session({admin:true}):{error:'admin_required'},path.endsWith('/session')?200:403),{embedded:true});await settle();f.click('invitation');await settle();
  assert.equal(f.context.active,true);assert.equal(f.navigations.length,0);assert.equal(f.get('invitation-result').hidden,true);assert.equal(f.button('invitation').disabled,false);assert.match(f.get('status').textContent,/请求未成功/);f.dispose();
});
test('raw embedded 401 stops same-page consumers and navigates even if invalidation disposes synchronously',async()=>{
  let reads=0;const f=fixture(()=>++reads===1?response(session()):response({},401),{embedded:true});let stopped=false;f.context.onInactive(()=>stopped=true);await settle();f.click('refresh');await settle();
  assert.equal(stopped,true);assert.equal(f.context.active,false);assert.equal(f.unmounted,true);assert.deepEqual(f.navigations,['/remote']);
});
test('session_changed and account replacement retire embedded context before rendering another identity',async()=>{
  for(const change of [{session_changed:true},{account:{sub:'second',name:'其他人'}}]){let reads=0;const f=fixture(()=>response(session(++reads===1?{}:change)),{embedded:true});await settle();f.click('refresh');await settle();assert.equal(f.context.active,false);assert.deepEqual(f.navigations,['/remote']);assert.notEqual(f.get('account').textContent,'其他人');}
});
test('late invitation cannot reappear after same-tab 401, new CSRF, role loss, or unmount',async()=>{
  for(const change of ['401','csrf','role','dispose']){let release,reads=0;const f=fixture(path=>path.endsWith('/invitations')?new Promise(resolve=>release=resolve):(++reads===1?response(session({admin:true})):change==='401'?response({},401):response(session(change==='role'?{admin:false}:{admin:true,csrf:'new-synthetic-csrf'}))));await settle();f.click('invitation');if(change==='dispose')f.dispose();else f.click('refresh');await settle();release(response({invitation:'late-synthetic-invite'}));await settle();assert.equal(f.get('invitation-code').textContent,'');assert.equal(f.get('invitation-result').hidden,true);f.dispose();}
});
test('logout validates destination then navigates after synchronous context disposal without refresh',async()=>{
  for(const url of ['/oauth2/sign_out','https://example.invalid/logout']){const f=fixture(path=>response(path.endsWith('/session')?session():{logout_url:url}),{embedded:true});await settle();f.click('logout');await settle();assert.equal(f.calls.length,2);assert.deepEqual(f.navigations,url==='/oauth2/sign_out'?['/oauth2/sign_out']:[]);assert.equal(f.context.active,url!=='/oauth2/sign_out');f.dispose();}
});
test('revocation uses modal confirmation, cancel sends nothing and close restores focus',async()=>{
  const f=fixture(path=>response(path.endsWith('/session')?session({device:{device_id:'device/a',state:'online'}}):{revoked:true}));await settle();f.click('revoke');assert.equal(f.get('revoke-dialog').open,true);f.click('cancel-revoke');assert.equal(f.calls.length,1);assert.equal(f.focused,'revoke');f.click('revoke');f.click('confirm-revoke');await settle();assert.equal(f.calls[1].path,'/remote/api/devices/device%2Fa/revoke');f.dispose();
});
test('local mode loads bootstrap once, retains explicit confirmation and disables unconfigured actions',async()=>{
  for(const configured of [false,true]){const f=fixture(path=>response(path==='/api/bootstrap'?{csrf_token:'synthetic-local-csrf'}:{configured,state:'awaiting_local_confirmation',account:{sub:'account',name:'本机待核对'},operation:'recover'}),{mode:'local'});await settle();assert.deepEqual(f.calls.map(c=>c.path),['/api/bootstrap','/api/desktop/remote/status']);assert.equal(f.button('authorize').disabled,!configured);assert.equal(f.button('confirm').hidden,false);assert.match(f.button('confirm').textContent,/恢复/);assert.equal(f.calls.length,2);f.click('confirm');await settle();assert.equal(f.calls.length,configured?4:2);if(configured){assert.equal(f.calls[2].options.headers['X-Session-CSRF'],'synthetic-local-csrf');assert.equal(f.calls[2].options.headers['X-CE-CSRF'],undefined);}f.dispose();}
});
test('local rows show identity only when supplied and keep stable states out of the notice',async()=>{
  for(const state of ['unbound','authorizing','revoked','online','offline','connecting','enrolling']) {
    const f=fixture(path=>response(path==='/api/bootstrap'?{csrf_token:'local'}:{state,configured:true}),{mode:'local'});await settle();
    assert.equal(f.get('account').textContent,''); assert.equal(f.get('membership').textContent,['online','offline','connecting'].includes(state)?'连接已保存':'未登录');
    assert.equal(f.get('status').textContent,''); assert.equal(f.get('device-help').textContent,'');
    assert.equal(f.get('device-state').textContent,({unbound:'尚未绑定',authorizing:'授权中',revoked:'连接已撤销',online:'在线',offline:'离线',connecting:'连接中',enrolling:'绑定中'})[state]); f.dispose();
  }
  const f=fixture(path=>response(path==='/api/bootstrap'?{csrf_token:'local'}:{state:'unbound',configured:false}),{mode:'local'});await settle();assert.equal(f.get('membership').textContent,'账号服务未配置');assert.equal(f.get('local-actions').hidden,true);assert.equal(f.button('authorize').disabled,true);assert.equal(f.button('authorize').hidden,true);f.dispose();
});
test('local polling is serial, visibility-aware and disposal clears timers/listeners/late responses',async()=>{
  let release,reads=0;const f=fixture(path=>path==='/api/bootstrap'?response({csrf_token:'local'}):++reads===1?response({state:'online',configured:true}):new Promise(resolve=>release=resolve),{mode:'local'});await settle();assert.equal(f.get('device-state').textContent,'在线');assert.equal(f.timers.size,1);f.window.document.hidden=true;await f.tick();assert.equal(reads,1);f.window.document.hidden=false;await f.tick();await f.tick();assert.equal(reads,2);const signal=f.calls.at(-1).options.signal;f.dispose();assert.equal(signal.aborted,true);assert.equal(f.timers.size,0);assert.equal(f.button('authorize').listenerCount,0);release(response({state:'offline',account:{sub:'late'}}));await settle();assert.notEqual(f.get('account').textContent,'late');
});

test('compact local rows retain authorization codes, explicit account confirmation, restart notice and read errors',async()=>{
  let current={configured:true,state:'authorizing',verification_uri:'https://example.test/activate',user_code:'SYNTHETIC'};
  const f=fixture(path=>response(path==='/api/bootstrap'?{csrf_token:'local'}:current),{mode:'local'});await settle();
  assert.equal(f.get('grant').hidden,false);assert.equal(f.get('code').textContent,'SYNTHETIC');assert.equal(f.get('verification').href,current.verification_uri);assert.equal(f.button('authorize').disabled,true);
  current={configured:true,state:'awaiting_local_confirmation',account:{sub:'synthetic-account',name:'待核对账号'}};f.click('refresh');await settle();
  assert.equal(f.get('account').textContent,'待核对账号');assert.equal(f.button('confirm').hidden,false);assert.equal(f.button('authorize').hidden,true);assert.match(f.get('local-help').textContent,/核对账号/);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
  current={configured:true,state:'online',runtime_restart_required:true};f.click('refresh');await settle();assert.match(f.get('status').textContent,/重新打开软件/);
  current=null;f.window.fetch=async()=>{throw new Error('Synthetic unavailable');};f.click('refresh');await settle();assert.equal(f.get('status').textContent,'Synthetic unavailable');assert.equal(f.get('status').dataset.tone,'error');f.dispose();
});

test('revocation keeps the domain dialog and its target on failure, prevents repeats and blocks closing while pending',async()=>{
  let release;const f=fixture(path=>path.endsWith('/session')?response(session({device:{device_id:'synthetic-device',state:'online'}})):new Promise(resolve=>release=resolve));await settle();
  f.click('revoke');assert.equal(f.focused,'cancel-revoke');f.click('confirm-revoke');f.click('confirm-revoke');
  assert.equal(f.calls.length,2);assert.equal(f.get('revoke-dialog').open,true);assert.equal(f.button('confirm-revoke').disabled,true);
  f.click('cancel-revoke');assert.equal(f.get('revoke-dialog').open,true);
  release(response({},403));await settle();assert.equal(f.get('revoke-dialog').open,true);assert.equal(f.get('revoke-error').hidden,false);assert.match(f.get('revoke-error').textContent,/请求未成功/);assert.equal(f.focused,'revoke-error');assert.equal(f.button('confirm-revoke').disabled,false);
  f.click('cancel-revoke');assert.equal(f.focused,'revoke');f.dispose();
});

test('revocation rejects a changed connection identity and IME cancel keeps the current layer',async()=>{
  let reads=0;const f=fixture(()=>response(session({device:{device_id:++reads===1?'first':'replacement',state:'online'}})));await settle();f.click('revoke');
  let prevented=0;f.get('revoke-dialog').emit('compositionstart');f.get('revoke-dialog').emit('cancel',{preventDefault(){prevented++;}});assert.equal(prevented,1);assert.equal(f.get('revoke-dialog').open,true);
  f.get('revoke-dialog').emit('compositionend');f.click('refresh');await settle();f.click('confirm-revoke');await settle();
  assert.equal(f.calls.filter(call=>call.options.method==='POST').length,0);assert.match(f.get('revoke-error').textContent,/状态已变化/);assert.equal(f.get('revoke-dialog').open,true);
  f.get('revoke-dialog').emit('cancel');assert.equal(f.get('revoke-dialog').open,false);f.dispose();
});

const directoryMember = index => ({account:{sub:'private-sub-'+index,name:'成员 '+index,registered_at:1704067200,enabled:true},membership:'active',admin:index===0,device:index===0?{device_id:'private-device',name:'工作电脑',state:'online'}:null});
const directoryPage = (items,total=items.length,offset=0) => ({items,total,limit:25,offset});
test('only a real admin reads the registered directory using a same-origin CSRF-protected GET',async()=>{
  for(const admin of [false,'true',true]) {
    let requests=0;
    const f=fixture(()=>response(session({admin})),{members:async(path,options)=>{requests++;assert.equal(path,'/remote/api/admin/members?limit=25&offset=0');assert.equal(options.method,'GET');assert.equal(options.credentials,'same-origin');assert.equal(options.headers['X-CE-CSRF'],'synthetic-csrf');assert.equal(options.body,undefined);return response(directoryPage([{...directoryMember(0),account:{...directoryMember(0).account,name:'<img src=x onerror=alert(1)>'}}]));}});
    await settle();assert.equal(requests,admin===true?1:0);
    if(admin===true){const rows=f.get('members-list').children;assert.equal(rows.length,1);assert.equal(rows[0].children.length,5);assert.equal(rows[0].children[0].textContent,'<img src=x onerror=alert(1)>');assert.equal(rows[0].children[1].textContent,'管理员');assert.equal(rows[0].children[2].textContent,'已激活');assert.equal(rows[0].children[3].textContent,'工作电脑 · 在线');assert.notEqual(rows[0].children[4].textContent,'—');assert.doesNotMatch(JSON.stringify(rows),/private-sub|private-device|deviceToken/);}
    else {assert.equal(f.get('members-list').children.length,0);assert.equal(f.get('invitations').hidden,true);}f.dispose();
  }
});
test('member pagination advances by the server page and does not duplicate a pending read',async()=>{
  let release;const offsets=[];
  const f=fixture(()=>response(session({admin:true})),{members:async(path)=>{const offset=Number(new URL('https://example.test'+path).searchParams.get('offset'));offsets.push(offset);if(offset===25)return new Promise(resolve=>release=resolve);return response(directoryPage(Array.from({length:25},(_,i)=>directoryMember(i)),26));}});
  await settle();assert.equal(f.get('members-page').textContent,'1 / 2');assert.equal(f.button('members-previous').disabled,true);f.click('members-next');f.click('members-next');assert.deepEqual(offsets,[0,25]);assert.equal(f.button('members-next').disabled,true);
  release(response(directoryPage([directoryMember(25)],26,25)));await settle();assert.equal(f.get('members-page').textContent,'2 / 2');assert.equal(f.get('members-list').children[0].children[0].textContent,'成员 25');assert.equal(f.button('members-next').disabled,true);
  f.click('members-previous');await settle();assert.deepEqual(offsets,[0,25,0]);assert.equal(f.get('members-page').textContent,'1 / 2');f.dispose();
});
test('member directory configuration and read failures are real errors, never invented empty success',async()=>{
  for(const code of ['member_directory_not_configured','member_directory_unavailable']){const f=fixture(()=>response(session({admin:true})),{members:()=>response({error:code},503)});await settle();assert.equal(f.get('members-table').hidden,true);assert.equal(f.get('members-status').dataset.tone,'error');assert.match(f.get('members-status').textContent,/未配置|不可用/);assert.doesNotMatch(f.get('members-status').textContent,/暂无注册成员/);assert.equal(f.get('invitations').hidden,false);f.dispose();}
  const f=fixture(()=>response(session({admin:true})),{members:()=>response(directoryPage([],1))});await settle();assert.match(f.get('members-status').textContent,/未完整读取/);f.dispose();
  {const f=fixture(()=>response(session({admin:true})),{members:()=>response({...directoryPage([directoryMember(0)]),source:'hub_members'})});await settle();assert.equal(f.get('members-table').hidden,false);assert.match(f.get('members-status').textContent,/目录未配置/);f.dispose();}
});
test('directory responses cannot survive retirement, CSRF rotation, role loss or unmount',async()=>{
  for(const change of ['401','identity','csrf','role','dispose']) {
    let release,reads=0,memberReads=0;
    const f=fixture(()=>++reads===1?response(session({admin:true})):change==='401'?response({},401):response(session(change==='identity'?{admin:true,account:{sub:'replacement',name:'其他账号'}}:change==='csrf'?{admin:true,csrf:'new'}:{admin:false})),{embedded:true,members:()=>++memberReads===1?new Promise(resolve=>release=resolve):response(directoryPage([]))});
    await settle();if(change==='dispose')f.dispose();else f.click('refresh');await settle();release(response(directoryPage([directoryMember(0)])));await settle();assert.equal(f.get('members-list').children.length,0);if(change==='role')assert.equal(f.get('invitations').hidden,true);f.dispose();
  }
});
test('a forbidden directory read clears previously visible rows and retains the valid account context',async()=>{
  let reads=0;const f=fixture(()=>response(session({admin:true})),{embedded:true,members:()=>++reads===1?response(directoryPage([directoryMember(0)])):response({error:'admin_required'},403)});await settle();assert.equal(f.get('members-list').children.length,1);f.click('refresh');await settle();assert.equal(f.get('members-list').children.length,0);assert.equal(f.get('invitations').hidden,true);assert.equal(f.context.active,true);assert.match(f.get('status').textContent,/刷新状态/);f.dispose();
});
test('local status publishes only a configured portal while keeping account and computer confirmation separate',async()=>{
  let state={configured:true,state:'unbound',portal_url:'https://portal.example.test/remote'};const f=fixture(path=>response(path==='/api/bootstrap'?{csrf_token:'local'}:state),{mode:'local'});await settle();assert.equal(f.portals.at(-1),state.portal_url);assert.equal(f.get('account').textContent,'');assert.equal(f.button('confirm').hidden,true);assert.equal(f.get('device-state').textContent,'尚未绑定');assert.equal(f.button('authorize').textContent,'登录 / 注册账号');
  state={configured:false,state:'unbound',portal_url:'https://portal.example.test/remote'};f.click('refresh');await settle();assert.equal(f.portals.at(-1),'');assert.equal(f.button('authorize').hidden,true);f.dispose();
});

test('real account DOM keeps members private to admins and uses the full responsive theme cascade',async t=>{
  const path=require('node:path');const {pathToFileURL}=require('node:url');
  const {Window}=await import(pathToFileURL(path.resolve('web/workbench-engine/node_modules/happy-dom/lib/index.js')).href);
  for(const theme of ['light','dark'])for(const width of [1280,390]){
  const w=new Window({url:'https://example.test/remote',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
  w.happyDOM.setViewport({width,height:844});
  t.after(()=>{w.happyDOM.abort();w.close();});
  w.document.write('<main id="ce-studio"></main>');const root=w.document.getElementById('ce-studio');
  root.dataset.theme=theme;
  const remotePage=new w.DOMParser().parseFromString(fs.readFileSync('web/workspace/remote-account.html','utf8'),'text/html');
  const brand=remotePage.querySelector('.ce-account-brand');w.document.body.prepend(brand);
  for(const name of ['workspace.css','remote-account.css','studio-preview.css']){const style=w.document.createElement('style');style.textContent=fs.readFileSync('web/workspace/'+name,'utf8');w.document.head.append(style);}
  const directory=[{...directoryMember(0),account:{...directoryMember(0).account,name:'<img src=x onerror=alert(1)>'},device:{device_id:'private-device',name:'工作电脑',state:'offline'}},{...directoryMember(1),membership:'inactive'},{...directoryMember(2),account:{...directoryMember(2).account,enabled:false}}];
  let admin=true;w.fetch=async path=>response(path.startsWith('/remote/api/admin/members?')?directoryPage(directory):session({admin}));
  w.eval(source);const dispose=w.StudioAccountDevice.mount(root,{mode:'remote'});t.after(dispose);
  for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(root.querySelectorAll('table tbody tr').length,3);assert.equal(root.querySelectorAll('img').length,0);assert.equal(root.querySelector('td').textContent,'<img src=x onerror=alert(1)>');
  assert.equal(w.getComputedStyle(root.querySelector('td')).fontSize,'15px');assert.equal(w.getComputedStyle(root.querySelector('h2')).fontSize,'16px');assert.equal(w.getComputedStyle(root.querySelector('tbody tr')).display,width===390?'grid':'table-row');
  const rows=[...root.querySelectorAll('tbody tr')];
  assert.equal(rows[0].cells[2].textContent,'已激活');assert.equal(rows[0].cells[2].querySelector('.ce-account-badge').dataset.tone,'success');
  assert.equal(rows[0].cells[3].textContent,'工作电脑 · 离线');assert.equal(rows[0].cells[3].querySelector('.ce-account-badge').dataset.tone,'neutral');
  assert.equal(rows[1].cells[2].textContent,'待激活');assert.equal(rows[1].cells[2].querySelector('.ce-account-badge').dataset.tone,'warning');
  assert.equal(rows[2].cells[2].textContent,'账号停用');assert.equal(rows[2].cells[2].querySelector('.ce-account-badge').dataset.tone,'danger');
  assert.equal(w.getComputedStyle(rows[0].cells[2].querySelector('.ce-account-badge')).fontSize,'14px');
  assert.equal(w.getComputedStyle(rows[0].cells[1].querySelector('.ce-account-role')).fontSize,'15px');
  assert.equal(rows[0].cells[1].querySelector('svg').getAttribute('aria-hidden'),'true');
  const icons=[...root.querySelectorAll('.ce-account-setting .ce-account-media svg')];assert.equal(icons.length,2);assert.notEqual(icons[0].innerHTML,icons[1].innerHTML);assert.ok(icons.every(icon=>icon.getAttribute('aria-hidden')==='true'));
  assert.equal(root.querySelector('.ce-account-grid').contains(root.querySelector('[data-node="invitations"]')),false);assert.equal(root.querySelectorAll('th').length,5);assert.equal(root.querySelector('input[type="checkbox"]'),null);
  assert.equal(w.getComputedStyle(root.querySelector('.ce-account-media')).width,'32px');assert.equal(w.getComputedStyle(root.querySelector('.ce-account-members-wrap')).borderRadius,'8px');
  const refreshStyle=w.getComputedStyle(root.querySelector('[data-action="refresh"]'));assert.equal(refreshStyle.minHeight,width===390?'44px':'36px');assert.match(refreshStyle.transition,/transform 180ms/);
  const themeButton=brand.querySelector('[data-theme-toggle]');assert.equal(themeButton.closest('.ce-account'),null);
  assert.equal(w.getComputedStyle(themeButton).minHeight,width===390?'44px':'36px');assert.match(w.getComputedStyle(themeButton).transition,/transform 180ms/);
  themeButton.disabled=true;assert.equal(Number(w.getComputedStyle(themeButton).opacity),0.5);themeButton.disabled=false;
  themeButton.setAttribute('aria-busy','true');assert.equal(w.getComputedStyle(themeButton).cursor,'wait');themeButton.removeAttribute('aria-busy');
  assert.equal(w.getComputedStyle(root.querySelector('input')).fontSize,width===390?'16px':'15px');
  admin=false;root.querySelector('[data-action="refresh"]').click();for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(root.querySelector('[data-node="invitations"]').hidden,true);assert.equal(root.querySelectorAll('tbody tr').length,0);
  }
});

test('a hidden standalone page clears members and invitation before resuming into a logged-out session',async()=>{
  let expired=false;const f=fixture(path=>expired?response({},401):response(path.endsWith('/session')?session({admin:true}):{invitation:'synthetic-private-invite'}),{members:()=>response(directoryPage([directoryMember(0)]))});await settle();f.click('invitation');await settle();assert.equal(f.get('members-list').children.length,1);assert.equal(f.get('invitation-code').textContent,'synthetic-private-invite');
  const before=f.calls.length;f.visibility(true);assert.equal(f.get('members-list').children.length,0);assert.equal(f.get('invitation-code').textContent,'');assert.equal(f.get('invitations').hidden,true);assert.equal(f.calls.length,before);
  expired=true;f.visibility(false);assert.equal(f.get('members-list').children.length,0);assert.equal(f.get('invitations').hidden,true);await settle();assert.equal(f.get('login').hidden,false);assert.equal(f.calls.filter(call=>call.path.startsWith('/remote/api/admin/members?')).length,1);f.dispose();
});
test('directory and invitation replies from before concealment cannot repopulate the hidden or resumed admin view',async()=>{
  let finishDirectory;const delayed=fixture(()=>response(session({admin:true})),{members:()=>new Promise(resolve=>finishDirectory=resolve)});await settle();delayed.visibility(true);finishDirectory(response(directoryPage([directoryMember(0)])));await settle();assert.equal(delayed.get('members-list').children.length,0);assert.equal(delayed.get('invitations').hidden,true);delayed.dispose();
  let finishInvite;const f=fixture(path=>path.endsWith('/session')?response(session({admin:true})):new Promise(resolve=>finishInvite=resolve));await settle();f.click('invitation');f.visibility(true);f.visibility(false);await settle();finishInvite(response({invitation:'old-private-invite'}));await settle();assert.equal(f.get('invitation-code').textContent,'');assert.equal(f.get('invitation-result').hidden,true);f.dispose();
});
test('focus clears the directory before serial reauthorization and disposal removes the lifecycle listeners',async()=>{
  let reads=0,finish;const f=fixture(()=>++reads===1?response(session({admin:true})):new Promise(resolve=>finish=resolve),{members:()=>response(directoryPage([directoryMember(0)]))});await settle();assert.equal(f.get('members-list').children.length,1);
  f.focusWindow();f.focusWindow();assert.equal(f.get('members-list').children.length,0);assert.equal(f.get('invitations').hidden,true);assert.equal(reads,2);
  finish(response(session({admin:false})));await settle();assert.equal(f.get('members-list').children.length,0);assert.equal(f.get('invitations').hidden,true);assert.equal(f.window.document.listenerCount,1);assert.equal(f.windowEvents.listenerCount,1);
  f.dispose();assert.equal(f.window.document.listenerCount,0);assert.equal(f.windowEvents.listenerCount,0);const calls=f.calls.length;f.focusWindow();f.visibility(false);await settle();assert.equal(f.calls.length,calls);
});
test('local connector polling does not gain remote admin view listeners',async()=>{
  const f=fixture(path=>response(path==='/api/bootstrap'?{csrf_token:'local'}:{configured:false,state:'unbound'}),{mode:'local'});await settle();assert.equal(f.window.document.listenerCount,0);assert.equal(f.windowEvents.listenerCount,0);const calls=f.calls.length;f.focusWindow();f.visibility(false);await settle();assert.equal(f.calls.length,calls);f.dispose();
});
