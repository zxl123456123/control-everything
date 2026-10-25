const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for(const [entry,mode] of [['remote-account','remote'],['desktop','local']]){
  test(entry+' delegates to the shared component and removes appearance listeners on pagehide',()=>{
    let mounted,disposed=0,click,mediaChange;const events={};const toggle={textContent:'',setAttribute(){},addEventListener(name,fn){click=fn;},removeEventListener(name,fn){assert.equal(fn,click);click=null;}};
    const html={dataset:{}};const media={matches:true,addEventListener(name,fn){mediaChange=fn;},removeEventListener(name,fn){assert.equal(fn,mediaChange);mediaChange=null;}};
    const root={};const storage=new Map();const window={matchMedia:()=>media,StudioAccountDevice:{mount(node,options){assert.equal(node,root);mounted=options;return()=>disposed++;}},addEventListener(name,fn){events[name]=fn;}};
    vm.runInNewContext(fs.readFileSync('web/workspace/'+entry+'.js','utf8'),{window,document:{documentElement:html,querySelector:s=>s==='[data-theme-toggle]'?toggle:root},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
    assert.equal(mounted.mode,mode);assert.equal(html.dataset.theme,'dark');click();assert.equal(html.dataset.theme,'light');assert.equal(storage.get('ce.account.theme'),'light');events.pagehide();assert.equal(disposed,1);assert.equal(click,null);assert.equal(mediaChange,null);events.pageshow();assert.equal(typeof click,'function');events.pageshow();events.pagehide();assert.equal(disposed,2);
    const page=fs.readFileSync('web/workspace/'+entry+'.html','utf8');assert.match(page,/\/remote\/account-device.js/);assert.match(page,/\/remote\/remote-account.css/);assert.doesNotMatch(page,/StudioData|iframe|bootstrap/);
  });
}
