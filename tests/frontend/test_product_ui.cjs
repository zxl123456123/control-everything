// Product examples stay inside synthetic DOM and timers; there is no business transport.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('web/product/index.html','utf8'),source=fs.readFileSync('web/product/product.js','utf8');
class Element{
  constructor(dataset={}){this.dataset=dataset;this.listeners={};this.attributes={};this.hidden=false;this.textContent='';this.classList={add(){},toggle(){}};}
  addEventListener(key,fn){this.listeners[key]=fn;}
  setAttribute(key,value){this.attributes[key]=String(value);}
  focus(){this.focused=true;}
  animate(){return{};}
}
function fixture(){
  const tabs=['projects','tasks','sessions','usage'].map(scene=>new Element({scene})),panels=tabs.map(()=>new Element()),play=new Element(),experience=new Element();
  const tasks=['design','docs','release'].map(task=>new Element({task})),next=new Element({next:'tasks'}),nodes=new Map(['product-theme','product-theme-error','demo-task-title','demo-task-note','demo-task-state'].map(key=>[key,new Element()]));nodes.set('demo-play',play);nodes.set('experience',experience);
  const body=new Element(),events={},documentEvents={},timers=new Map(),observers=[],reads=[],mounts=[],disposals=[];let seq=0;
  const motion={matches:false,addEventListener(key,fn){this.change=fn;}};
  const head={mount(options){mounts.push(options);return()=>disposals.push('unmount');},dispose(){disposals.push('dispose');}};
  const document={body,hidden:false,getElementById:id=>nodes.get(id),querySelector:key=>key==='.task-preview'?new Element():nodes.get(key.slice(1)),querySelectorAll:key=>key==='[data-scene]'?tabs:key==='.demo-scene'?panels:key==='[data-next], [data-jump]'?[next]:key==='[data-task]'?tasks:[],addEventListener(key,fn){documentEvents[key]=fn;}};
  const window={CEUITheme:{pageTheme:head,earlyRead(key){reads.push(key);return{mount:head.mount,dispose:head.dispose};}},matchMedia:()=>motion,addEventListener(key,fn){events[key]=fn;}};
  class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(){}unobserve(){}disconnect(){this.disconnected=true;}}
  vm.runInNewContext(source,{window,document,IntersectionObserver:Observer,setTimeout(fn,delay){timers.set(++seq,{fn,delay});return seq;},clearTimeout:id=>timers.delete(id)});
  return{tabs,panels,play,tasks,next,nodes,body,events,document,documentEvents,timers,observers,motion,reads,mounts,disposals};
}
test('product theme reuses its head controller and lifecycle never needs a business API',()=>{
  const f=fixture();assert.equal(f.reads.length,0);assert.equal(f.mounts[0].roots[0],f.body);assert.equal(f.timers.size,0);f.events.pagehide({persisted:true});f.events.pageshow({persisted:true});assert.deepEqual(f.reads,['ce.product.theme']);f.events.pagehide({persisted:false});assert.ok(f.observers.every(o=>o.disconnected));
});
test('demo tabs move focus manually and activate only on Enter, Space or an explicit control',()=>{
  const f=fixture();let prevented=0;f.tabs[0].listeners.keydown({key:'ArrowRight',preventDefault(){prevented++;}});assert.equal(prevented,1);assert.equal(f.tabs[1].focused,true);assert.notEqual(f.tabs[1].attributes['aria-selected'],'true');
  f.tabs[1].listeners.keydown({key:'Enter',preventDefault(){}});assert.equal(f.tabs[1].attributes['aria-selected'],'true');assert.equal(f.panels[0].hidden,true);assert.equal(f.panels[1].hidden,false);
  f.tabs[1].listeners.keydown({key:'End',preventDefault(){}});assert.equal(f.tabs[3].focused,true);f.tabs[3].listeners.keydown({key:' ',preventDefault(){}});assert.equal(f.panels[3].hidden,false);f.next.listeners.click();assert.equal(f.panels[1].hidden,false);
});
test('autoplay pauses for hidden pages, reduced motion and focused scene content',()=>{
  const f=fixture();f.observers[0].callback([{isIntersecting:true}]);f.play.listeners.click();assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].delay,6000);
  f.document.hidden=true;f.documentEvents.visibilitychange();assert.equal(f.timers.size,0);f.document.hidden=false;f.documentEvents.visibilitychange();assert.equal(f.timers.size,1);
  f.panels[0].listeners.focusin();assert.equal(f.timers.size,0);f.play.listeners.click();assert.equal(f.timers.size,1);f.motion.matches=true;f.motion.change();assert.equal(f.timers.size,0);assert.equal(f.play.disabled,true);
});
test('task demonstration changes only its labelled example text and keeps publication and concept boundaries',()=>{
  const f=fixture();f.tasks[1].listeners.click();assert.equal(f.nodes.get('demo-task-title').textContent,'补充安装指南');assert.equal(f.nodes.get('demo-task-state').textContent,'进行中');
  assert.match(html,/交互演示 · 示例数据/);assert.match(html,/概念示意/);assert.match(html,/规划中/);assert.match(html,/releases/);assert.match(html,/data-ce-theme-key="ce.product.theme"/);assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
});
