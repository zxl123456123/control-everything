
'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('web/workspace/news-settings.js','utf8'),{window,URL,Intl,Date});
const ui=window.NewsSettings;
const settings=()=>({sources:[{id:'a',name:'A',kind:'rss',url:'https://example.com/rss',enabled:true,group:'AI',include:['Ａgent'],exclude:['spam']}],view:{source_id:null,group:null},schedule:{enabled:false,mode:'interval',interval_minutes:null,times:[],timezone:'Asia/Shanghai',browser:{enabled:false,topic:null,query:''}}});
test('literal normalized rules are reversible and never hide history',()=>{const s=settings(),item={source_id:'a',title:'Agent news',body_blocks:[]};assert.equal(ui.matches(item,s),true);item.title='spam agent';assert.equal(ui.matches(item,s),false);for(const view of ['saved','archived','read'])assert.equal(ui.matches(item,s,view),true);s.sources[0].exclude=[];assert.equal(ui.matches(item,s),true);s.sources[0].enabled=false;assert.equal(ui.matches(item,s),false);assert.equal(ui.matches(item,s,'saved'),true);});
test('schedule starts disabled and requires explicit frequency or daily time',()=>{const s=settings();assert.equal(ui.validateDraft(s),s);s.schedule.enabled=true;assert.throws(()=>ui.validateDraft(s),/15/);s.schedule.mode='daily';assert.throws(()=>ui.validateDraft(s),/每日/);s.schedule.times=['23:59'];assert.equal(ui.validateDraft(s),s);s.schedule.browser.enabled=true;assert.throws(()=>ui.validateDraft(s),/主题/);});
test('runtime labels distinguish ownership, busy, disabled and actual errors',()=>{assert.match(ui.runtimeText({owner:'owner_elsewhere'},settings()),/只读/);assert.match(ui.runtimeText({state:'blocked',reason:'cleanup_failed'},settings()),/cleanup_failed/);assert.match(ui.runtimeText({state:'running'},settings()),/收尾/);assert.match(ui.runtimeText({state:'idle'},settings()),/未启用/);});

class Node {
  constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.textContent='';this.open=false;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(){} addEventListener(name,callback){this.listeners[name]=callback;}
  showModal(){this.open=true;} close(){this.open=false;} remove(){}
  get all(){return this.children.flatMap(node=>[node,...node.all]);}
}
test('conflict keeps draft and original revision and saving never triggers collection',async()=>{
  const root=new Node('root');root.ownerDocument={createElement:tag=>new Node(tag)};const calls=[];
  const handle=ui.mount(root,{request:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return{ok:false,status:409,json:async()=>({settings:{...settings(),revision:2,sources:[{...settings().sources[0],name:'Server version'}]},runtime:{state:'idle'}})};}});
  handle.setSnapshot({settings:{...settings(),revision:1},runtime:{state:'idle'}});handle.open();
  assert.ok(root.all.some(node=>node.textContent.includes('计划更新本设置中启用的来源；专栏来源仍按需刷新')));
  const name=root.all.find(node=>node.tagName==='label'&&node.textContent==='名称').children[0];name.value='My draft';name.listeners.input();
  await root.all.find(node=>node.tagName==='button'&&node.textContent==='保存设置').onclick();
  assert.equal(calls.length,1);assert.equal(calls[0].body.expected_revision,1);assert.equal(calls[0].body.sources[0].name,'My draft');assert.equal(calls[0].url,'/api/workspace/news/settings');
  assert.equal(root.children[0].open,true);assert.match(root.all.find(node=>node.textContent.includes('本地草稿')).textContent,/保留/);
  root.all.find(node=>node.tagName==='button'&&node.textContent==='重载服务配置').onclick();
  assert.equal(root.all.find(node=>node.tagName==='label'&&node.textContent==='名称').children[0].value,'Server version');
  await root.all.find(node=>node.tagName==='button'&&node.textContent==='保存设置').onclick();assert.equal(calls.length,2);assert.equal(calls[1].body.expected_revision,2);
  handle.destroy();
});

for(const outcome of [200,409,503,'reject'])test(`destroy invalidates delayed settings ${outcome} without callback or DOM writes`,async()=>{
  const root=new Node('root');root.ownerDocument={createElement:tag=>new Node(tag)};
  let resolve,reject,calls=0,jsonReads=0;const updates=[];
  const handle=ui.mount(root,{onSettings:value=>updates.push(value),request:()=>{calls++;return new Promise((accept,fail)=>{resolve=accept;reject=fail;});}});
  handle.setSnapshot({settings:{...settings(),revision:1},runtime:{state:'idle'}});handle.open();updates.length=0;
  const save=root.all.find(node=>node.tagName==='button'&&node.textContent==='保存设置');const pending=save.onclick();assert.equal(calls,1);assert.equal(save.disabled,true);
  handle.destroy();const previous=root.all.map(node=>node.textContent);
  if(outcome==='reject')reject(new Error('late connection failure'));
  else resolve({ok:false,status:outcome,json:async()=>{jsonReads++;return{settings:{...settings(),revision:2},runtime:{state:'idle'},error:'late failure'};}});
  await pending;
  assert.equal(updates.length,0);assert.equal(jsonReads,0);assert.deepEqual(root.all.map(node=>node.textContent),previous);assert.equal(save.disabled,true);assert.equal(calls,1);
  await save.onclick();assert.equal(calls,1);
});

test('destroy during conflict JSON decoding also invalidates its envelope',async()=>{
  const root=new Node('root');root.ownerDocument={createElement:tag=>new Node(tag)};let finish,entered;const decoding=new Promise(resolve=>{entered=resolve;});const updates=[];
  const handle=ui.mount(root,{onSettings:value=>updates.push(value),request:async()=>({ok:false,status:409,json:()=>new Promise(resolve=>{finish=resolve;entered();})})});
  handle.setSnapshot({settings:{...settings(),revision:1},runtime:{state:'idle'}});handle.open();updates.length=0;
  const save=root.all.find(node=>node.tagName==='button'&&node.textContent==='保存设置'),pending=save.onclick();await decoding;
  assert.equal(typeof finish,'function');handle.destroy();const previous=root.all.map(node=>node.textContent);finish({settings:{...settings(),revision:2},runtime:{state:'idle'}});await pending;
  assert.equal(updates.length,0);assert.deepEqual(root.all.map(node=>node.textContent),previous);assert.equal(save.disabled,true);
});
