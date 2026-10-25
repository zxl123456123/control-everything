
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
test('news host fetches and mounts once, retains instance while hidden and destroys once',async()=>{
  const calls=[],visibility=[];let mounts=0,destroys=0;
  const root={dataset:{},querySelectorAll:()=>[]},host={textContent:'',dataset:{},replaceChildren(...nodes){this.children=nodes;queueMicrotask(()=>nodes[0].onload?.());},append(){}};
  const document={createElement:()=>({})},window={NewsSpider:{},NewsSettings:{},NewsReaderUI:{mount(){mounts++;return{setVisible:value=>visibility.push(value),destroy:()=>destroys++,inspect:()=>({})};}}};
  vm.runInNewContext(fs.readFileSync('web/workspace/news-surface.js','utf8'),{window,document,AbortController,queueMicrotask,MutationObserver:class{observe(){}disconnect(){}},DOMParser:class{parseFromString(){return{querySelector:()=>root};}},fetch:async url=>{calls.push(url);return{ok:true,text:async()=>'<fixture>'};}});
  const surface=window.NewsSurface.mount(host);surface.setVisible(true);await flush();surface.setVisible(false);surface.setVisible(true);await flush();
  assert.equal(mounts,1);assert.deepEqual(calls,['/news']);assert.deepEqual(visibility,[true,false,true]);assert.equal(root.dataset.embedded,'true');surface.destroy();surface.destroy();assert.equal(destroys,1);
});

test('scoped CSS defines root variables, theme and embedded sizing on :scope',()=>{
  const css=fs.readFileSync('web/workspace/news-reader.css','utf8');assert.match(css,/@scope \(.news-reader-root\)/);assert.match(css,/:scope\{color-scheme:light;--bg:/);assert.match(css,/:scope\[data-theme=dark\]/);assert.match(css,/:scope\[data-embedded=true\] #news-room\{height:100%/);assert.doesNotMatch(css,/\.news-reader-root\[data-(?:theme|embedded)/);
  assert.match(fs.readFileSync('web/workspace/studio-preview.css','utf8'),/data-news-surface=true\] .ce-content\{flex:1;min-height:0;overflow:hidden/);
});

test('selected reading tabs keep their explicit foreground above Studio inherited button color',()=>{
  const css=fs.readFileSync('web/workspace/news-reader.css','utf8');
  assert.match(css,/#news-room \.toolbar nav button\[aria-pressed=true\]\{background:var\(--chosen\);color:var\(--on\)\}/);
  assert.match(fs.readFileSync('web/workspace/studio-preview.css','utf8'),/#ce-studio button,#ce-studio input,#ce-studio textarea,#ce-studio select\{font:inherit;color:inherit\}/);
});

test('research selected topics, steps and submit retain explicit on-color above Studio buttons',()=>{
  const css=fs.readFileSync('web/workspace/news-reader.css','utf8');
  for(const selector of ['.research-topics button[aria-pressed=true]','.research-steps button[aria-pressed=true]','.research-query-row button']) {
    const start=css.indexOf('#research-panel '+selector+'{');assert.notEqual(start,-1,selector);
    const declarations=css.slice(start,css.indexOf('}',start));assert.match(declarations,/background:var\(--chosen\)/);assert.match(declarations,/color:var\(--on\)/);
  }
});

test('mobile filters reserve two compact rows without removing source or collection controls',()=>{
  const css=fs.readFileSync('web/workspace/news-reader.css','utf8');
  assert.match(css,/#news-room \.filters\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\);gap:6px\}/);
  assert.match(css,/#news-room \.filters>label,#news-room \.filters>select\{grid-column:span 2;min-width:0\}/);
  assert.match(css,/#news-room \.filters>button\{grid-column:span 3\}/);
  assert.match(css,/#news-room \.filters select,#news-room \.filters button\{width:100%;min-width:0;min-height:38px/);
  const html=fs.readFileSync('web/workspace/news-reader.html','utf8');for(const id of ['stream','source-filter','group-filter','refresh-feeds','refresh'])assert.match(html,new RegExp('id="'+id+'"'));
});
