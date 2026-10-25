'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,flush}=require('./news_reader_fixture.cjs');
test('explicit surface visibility pauses and resumes without POST replay', async () => {
  const f=fixture({spiders:true}); await flush();
  const wrapper=f.document.querySelector('.news-reader-root');
  const beforeMount=f.calls.length;
  const handle=f.window.NewsReaderUI.mount(wrapper,{embedded:true});
  assert.equal(f.window.NewsReaderUI.mount(wrapper),handle);await flush();
  assert.equal(f.calls.length,beforeMount);assert.equal(f.state.engineMounts,1);assert.equal(wrapper.listenerAdds.keydown,1);
  handle.setVisible(false); const before=f.calls.length; await flush();
  assert.equal(handle.inspect().visible,false);
  handle.setVisible(true); await flush(); assert.equal(handle.inspect().visible,true);
  assert.equal(f.calls.slice(before).some(call=>call.method==='POST'),false);
  handle.setVisible(false);handle.destroy();const afterDestroy=f.calls.length;handle.setVisible(true);await flush();assert.equal(handle.inspect().visible,false);assert.equal(f.calls.length,afterDestroy);const remounted=f.window.NewsReaderUI.mount(wrapper,{embedded:true});assert.notEqual(remounted,handle);await flush();assert.equal(f.state.engineMounts,2);remounted.destroy();
});

test('settings polls stop with explicit visibility and run changes refresh the reader once',async()=>{
  const f=fixture({settingsEnabled:true});await flush();
  assert.equal(f.calls.filter(call=>call.url.endsWith('/settings')).length,1);
  const reads=f.calls.filter(call=>call.url.endsWith('/reader')).length;
  f.state.settings.runtime={owner:'owned',state:'running',run_id:'run1',result:null};
  await f.tick(15000);assert.equal(f.calls.filter(call=>call.url.endsWith('/reader')).length,reads+1);
  await f.hidden(true);assert.equal(f.timers.size,0);
  await f.hidden(false);assert.equal(f.calls.filter(call=>call.url.endsWith('/settings')).length,3);
});
test('hiding spiders pauses both engines while refresh remains a business action',async()=>{
  const f=fixture({spiders:true});await flush();f.node('refresh').listeners.click();await flush();
  assert.equal(f.window.NewsReader.inspect().researchEngine.running,true);
  f.node('spider-visible').listeners.click();
  assert.equal(f.window.NewsReader.inspect().engine.running,false);assert.equal(f.window.NewsReader.inspect().researchEngine.running,false);
  assert.equal(f.node('spider-visible').getAttribute('aria-pressed'),'false');
  await f.node('refresh-feeds').listeners.click();await flush();assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  assert.ok(f.writes.some(row=>row.key==='news-spider-visible-v1:fixture'&&row.value==='false'));
});

test('source and group option labels are text rather than class names',async()=>{
  const f=fixture({settingsEnabled:true});
  f.state.settings.settings.sources=[{id:'openai',name:'OpenAI News',enabled:true,group:'AI',include:[],exclude:[]}];await flush();
  assert.deepEqual(f.node('source-filter').children.map(option=>option.textContent),['全部来源','OpenAI News']);
  assert.deepEqual(f.node('group-filter').children.map(option=>option.textContent),['全部分组','AI']);
});

test('settings finishing while hidden restore source and group options at the same revision',async()=>{
  const f=fixture({settingsEnabled:true});let finish;
  f.state.settings.settings.sources=[{id:'openai',name:'OpenAI News',enabled:true,group:'AI',include:[],exclude:[]}];
  f.state.readSettings=()=>new Promise(resolve=>{finish=resolve;});await flush();
  const wrapper=f.document.querySelector('.news-reader-root'),handle=f.window.NewsReaderUI.mount(wrapper);handle.setVisible(false);
  finish(f.state.settings);await flush();assert.equal(f.node('source-filter').children.length,0);
  f.state.readSettings=null;handle.setVisible(true);await flush();
  assert.deepEqual(f.node('source-filter').children.map(option=>option.textContent),['全部来源','OpenAI News']);assert.deepEqual(f.node('group-filter').children.map(option=>option.textContent),['全部分组','AI']);
});
test('disabled sources do not count as failed updates while enabled errors remain visible',async()=>{
  const f=fixture({settingsEnabled:true});
  f.state.settings.settings.sources=[{id:'disabled',name:'Disabled',enabled:false,group:'',include:[],exclude:[]},{id:'enabled',name:'Enabled',enabled:true,group:'',include:[],exclude:[]}];await flush();
  f.window.NewsReader.applySnapshot({reader_id:'fixture',sample:{captured_at:null,sources:[{id:'disabled',reason:'not_fetched'},{id:'enabled',reason:'offline'}],streams:{ai:{items:[]},hn:{items:[]}}},covers:{items:[]}});
  assert.match(f.node('snapshot-note').textContent,/1 个来源暂未更新/);assert.doesNotMatch(f.node('snapshot-note').textContent,/2 个来源/);
  f.state.settings.settings.sources[1].enabled=false;
  f.window.NewsReader.applySnapshot({reader_id:'fixture',sample:{captured_at:null,sources:[{id:'disabled',reason:'not_fetched'},{id:'enabled',reason:'offline'}],streams:{ai:{items:[]},hn:{items:[]}}},covers:{items:[]}});
  assert.doesNotMatch(f.node('snapshot-note').textContent,/暂未更新/);
});

test('mobile directory closes from both controls while retaining the article reader',async()=>{
  const f=fixture({mobile:true});await flush();
  f.node('open-directory').listeners.click();assert.equal(f.node('animation-stage').dataset.directory,'open');assert.equal(f.node('directory').inert,false);
  f.node('close-directory').listeners.click();assert.equal(f.node('animation-stage').dataset.directory,'closed');assert.equal(f.node('directory').inert,true);assert.equal(f.node('directory-backdrop').hidden,true);assert.equal(f.node('reader').hidden,false);assert.equal(f.node('article-scroll').isConnected,true);
  f.node('open-directory').listeners.click();f.node('directory-backdrop').listeners.click();assert.equal(f.node('animation-stage').dataset.directory,'closed');assert.equal(f.node('open-directory').getAttribute('aria-expanded'),'false');
});
