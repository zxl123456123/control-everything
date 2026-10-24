const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('web/workspace/remote-account.js', 'utf8');
const settle = async () => { for (let index=0; index<8; index++) await Promise.resolve(); };
function page(fetcher) {
  const nodes = new Map(), calls=[], notifications=[];
  const get = id => { if (!nodes.has(id)) nodes.set(id,{hidden:false,textContent:'',events:{},addEventListener(name,callback){this.events[name]=callback;}}); return nodes.get(id); };
  const window={confirm:()=>false,localStorage:{setItem:(key,value)=>notifications.push([key,value])}};
  vm.runInNewContext(source,{window,document:{getElementById:get},fetch:async(...args)=>{calls.push(args);return fetcher(...args);},location:{assign(){}},FormData});
  return {get,calls,window,notifications};
}
test('plain text anonymous 401 preserves login and hides every session action before JSON parsing', async()=>{
  let parsed=false;
  const fixture=page(async()=>({status:401,ok:false,json:async()=>{parsed=true;throw new Error('Unauthorized');}}));
  await settle();
  assert.equal(parsed,false);
  assert.equal(fixture.get('login').hidden,false);
  for(const id of ['activation','device','logout','invitations']) assert.equal(fixture.get(id).hidden,true);
  assert.equal(fixture.get('status').textContent,'请登录账号后继续。');
});
test('trusted display name and Chinese state are shown, and revocation requires explicit confirmation', async()=>{
  const fixture=page(async(path)=>({status:200,ok:true,json:async()=>path.endsWith('/session')?{
    csrf:'synthetic-csrf',account:{sub:'account-uuid',name:'小组成员'},membership:'active',device:{device_id:'device-a',name:'我的电脑',state:'online'}
  }: {revoked:true}}));
  await settle();
  assert.equal(fixture.get('account').textContent,'当前账号：小组成员');
  assert.equal(fixture.get('device-state').textContent,'在线');
  assert.equal(fixture.get('login').hidden,true);
  assert.equal(fixture.get('open').hidden,false);
  await fixture.get('revoke').events.click();
  assert.equal(fixture.calls.length,1);
  fixture.window.confirm=message=>{assert.match(message,/不会删除本机项目/);return true;};
  await fixture.get('revoke').events.click();
  assert.equal(fixture.calls[1][0],'/remote/api/devices/device-a/revoke');
  assert.equal(fixture.calls[1][1].headers['X-CE-CSRF'],'synthetic-csrf');
  assert.equal(fixture.calls[1][1].method,'POST');
});

test('only an explicit newly-created hub session or successful logout broadcasts an opaque retirement',async()=>{
  for(const changed of [undefined,false,true]) {
    const fixture=page(async(path)=>({status:200,ok:true,json:async()=>path.endsWith('/session')?{
      csrf:'synthetic-csrf',account:{sub:'owner',name:'Member'},membership:'active',device:null,session_changed:changed
    }:{logout_url:'/oauth2/sign_out'}}));
    await settle();
    assert.equal(fixture.notifications.length,changed===true?1:0);
    fixture.get('logout').events.click();await settle();
    assert.equal(fixture.notifications.length,changed===true?2:1);
    for(const [key,value] of fixture.notifications) {assert.equal(key,'ce.remote.session-change');assert.doesNotMatch(value,/owner|synthetic-csrf/);}
  }
});

test('only a boolean administrator session exposes invitations; ordinary members cannot issue them',async()=>{
  for(const admin of [undefined,false,'true',true]) {
    const f=page(async()=>({status:200,ok:true,json:async()=>({csrf:'synthetic-csrf',account:{sub:'member'},membership:'active',device:null,admin})}));
    await settle();assert.equal(f.get('invitations').hidden,admin!==true);
    if(admin!==true){await f.get('create-invitation').events.click();assert.equal(f.calls.length,1);}
  }
});
test('administrator issues one invite with CSRF, disables duplicate clicks and keeps the result only in the page',async()=>{
  let release;
  const f=page(path=>path.endsWith('/session')?Promise.resolve({status:200,ok:true,json:async()=>({csrf:'synthetic-csrf',account:{sub:'admin'},membership:'active',device:null,admin:true})}):path.endsWith('/invitations')?new Promise(resolve=>{release=resolve;}):Promise.resolve({status:200,ok:true,json:async()=>({logout_url:'/oauth2/sign_out'})}));
  await settle();
  const pending=f.get('create-invitation').events.click();
  assert.equal(f.get('create-invitation').disabled,true);assert.equal(f.get('invitation-result').hidden,true);
  await f.get('create-invitation').events.click();assert.equal(f.calls.length,2);
  assert.equal(f.calls[1][0],'/remote/api/invitations');assert.equal(f.calls[1][1].method,'POST');
  assert.equal(f.calls[1][1].headers['X-CE-CSRF'],'synthetic-csrf');assert.equal(f.calls[1][1].body,'{}');
  release({status:200,ok:true,json:async()=>({invitation:'synthetic-invitation',expires_in:86400})});await pending;
  assert.equal(f.get('invitation-code').textContent,'synthetic-invitation');assert.equal(f.get('invitation-result').hidden,false);
  assert.equal(f.get('create-invitation').disabled,false);assert.equal(f.notifications.length,0);
  f.get('logout').events.click();await settle();
  assert.equal(f.get('invitation-code').textContent,'');assert.equal(f.get('invitations').hidden,true);
});
test('invitation rejection never shows a successful code and an anonymous response removes the admin controls',async()=>{
  for(const status of [403,401]) {
    const f=page(async path=>path.endsWith('/session')?{status:200,ok:true,json:async()=>({csrf:'synthetic-csrf',account:{sub:'admin'},membership:'active',device:null,admin:true})}:{status,ok:false,json:async()=>({error:'denied'})});
    await settle();await f.get('create-invitation').events.click();
    assert.equal(f.get('invitation-code').textContent,'');assert.equal(f.get('invitation-result').hidden,true);assert.equal(f.get('create-invitation').disabled,false);
    if(status===401){assert.equal(f.get('invitations').hidden,true);assert.equal(f.get('login').hidden,false);}
  }
});
test('invite result cannot reappear after a concurrent session denial',async()=>{
  let release;
  const f=page(path=>path.endsWith('/session')?Promise.resolve({status:200,ok:true,json:async()=>({csrf:'synthetic-csrf',account:{sub:'admin'},membership:'active',device:null,admin:true})}):path.endsWith('/invitations')?new Promise(resolve=>{release=resolve;}):Promise.resolve({status:401,ok:false}));
  await settle();const pending=f.get('create-invitation').events.click();
  f.get('logout').events.click();await settle();
  release({status:200,ok:true,json:async()=>({invitation:'synthetic-late-invitation',expires_in:86400})});await pending;
  assert.equal(f.get('invitations').hidden,true);assert.equal(f.get('invitation-code').textContent,'');assert.equal(f.get('invitation-result').hidden,true);
});
