const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for(const [entry,mode] of [['remote-account','remote'],['desktop','local']]){
  test(entry+' delegates theme lifecycle without storage or system listeners',()=>{
    let mounted,disposed=0,themeDisposed=0,unmounted=0;const events={},reads=[],mounts=[];
    const toggle={},status={},root={},body={};
    const window={CEUITheme:{earlyRead(key){reads.push(key);return{mount(options){mounts.push(options);return()=>unmounted++;},dispose(){themeDisposed++;}};}},StudioAccountDevice:{mount(node,options){assert.equal(node,root);mounted=options;return()=>disposed++;}},addEventListener(name,fn){events[name]=fn;}};
    vm.runInNewContext(fs.readFileSync('web/workspace/'+entry+'.js','utf8'),{window,document:{body,querySelector:s=>s==='[data-theme-toggle]'?toggle:s==='[data-theme-error]'?status:root}});
    assert.equal(mounted.mode,mode);assert.deepEqual(reads,['ce.account.theme']);assert.equal(mounts[0].roots[0],body);assert.equal(mounts[0].toggles[0],toggle);assert.equal(mounts[0].status,status);
    events.pageshow();assert.equal(reads.length,1);events.pagehide();assert.equal(disposed,1);assert.equal(unmounted,1);assert.equal(themeDisposed,1);events.pageshow();assert.equal(reads.length,2);events.pageshow();events.pagehide();assert.equal(disposed,2);assert.equal(themeDisposed,2);
    const page=fs.readFileSync('web/workspace/'+entry+'.html','utf8');
    assert.deepEqual([...page.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]),[entry==='desktop'?'/ui-theme.js':'/remote/ui-theme.js','/remote/account-device.js',entry==='desktop'?'/desktop.js':'/remote/remote-account.js']);
    assert.match(page,/data-ce-theme-key="ce.account.theme"/);assert.match(page,/\/remote\/remote-account.css/);assert.doesNotMatch(page,/StudioData|iframe|bootstrap|ui-dialog|<script>/);
  });
  test(entry+' exposes missing theme resource while preserving real account entry',()=>{
    const nodes={'[data-theme-toggle]':{},'[data-theme-error]':{},'[data-account-root]':{}};let mounted=0;
    vm.runInNewContext(fs.readFileSync('web/workspace/'+entry+'.js','utf8'),{window:{StudioAccountDevice:{mount(){mounted++;return()=>{};}},addEventListener(){}},document:{querySelector:s=>nodes[s]}});
    assert.equal(nodes['[data-theme-toggle]'].disabled,true);assert.equal(nodes['[data-theme-error]'].hidden,false);assert.match(nodes['[data-theme-error]'].textContent,/主题资源未加载/);assert.equal(mounted,1);
  });
  test(entry+' consumes the external head controller once and obtains a fresh controller after disposal',()=>{
    const events={},mounts=[];let reads=0;const first={mount(){mounts.push('head');return()=>{};},dispose(){}};
    vm.runInNewContext(fs.readFileSync('web/workspace/'+entry+'.js','utf8'),{window:{CEUITheme:{pageTheme:first,earlyRead(){reads++;return{mount(){mounts.push('resume');return()=>{};},dispose(){}};}},StudioAccountDevice:{mount(){return()=>{};}},addEventListener(key,fn){events[key]=fn;}},document:{body:{},querySelector(){return{};}}});
    assert.equal(reads,0);assert.deepEqual(mounts,['head']);events.pagehide();events.pageshow();assert.equal(reads,1);assert.deepEqual(mounts,['head','resume']);
  });
}
