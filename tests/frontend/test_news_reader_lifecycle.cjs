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
  assert.equal(handle.inspect().active,false);
  handle.setVisible(true); await flush(); assert.equal(handle.inspect().active,true);
  assert.equal(f.calls.slice(before).some(call=>call.method==='POST'),false);
  handle.setVisible(false);handle.destroy();const afterDestroy=f.calls.length;handle.setVisible(true);await flush();assert.equal(handle.inspect().active,false);assert.equal(f.calls.length,afterDestroy);const remounted=f.window.NewsReaderUI.mount(wrapper,{embedded:true});assert.notEqual(remounted,handle);await flush();assert.equal(f.state.engineMounts,2);remounted.destroy();
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
test('disabling pets stops both engines while refresh remains a business action',async()=>{
  const f=fixture({spiders:true});await flush();f.node('refresh').listeners.click();await flush();f.node('research-details').open=true;f.node('research-details').listeners.toggle();
  assert.equal(f.window.NewsReader.inspect().researchEngine.running,true);
  f.window.NewsReader.setPetEnabled(false);
  assert.equal(f.window.NewsReader.inspect().engine,undefined);assert.equal(f.window.NewsReader.inspect().researchEngine,undefined);
  await f.node('refresh-feeds').listeners.click();await flush();assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  assert.ok(f.writes.some(row=>row.key.includes('pet') && row.value.includes('false')));
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

test('mobile list remains the initial reading view',async()=>{
  const f=fixture({mobile:true});await flush();assert.equal(f.window.NewsReader.inspect().readingView,'list');assert.equal(f.node('animation-stage').dataset.readingView,'list');
});

function freshPreset() {
  return {reader_id:'fixture',sample:{captured_at:null,sources:[],streams:{ai:{items:[],sources:[],reason:'not_loaded',sampled_at:null}}},covers:{items:[]},refreshing:false,
    runtime:{owner:'owned',state:'disabled',run_id:null,last_attempt_at:null,result:null,pending_due:false}};
}
function freshFixture() {
  const f=fixture({settingsEnabled:true});f.state.value=freshPreset();
  f.state.settings.settings.sources=[{id:'fixture',name:'Fixture',enabled:true,group:'',include:[],exclude:[]}];return f;
}
const refreshPosts=f=>f.calls.filter(call=>call.method==='POST' && call.url.endsWith('/reader/refresh'));

test('a first visible fresh preset explicitly refreshes once without enabling its schedule',async()=>{
  const f=freshFixture();await flush();
  assert.equal(refreshPosts(f).length,1);assert.equal(f.state.settings.settings.schedule.enabled,false);
  assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  await f.hidden(true);await f.hidden(false);await f.tick(15000);
  assert.equal(refreshPosts(f).length,1);
});

test('prior attempts, successful empty caches, disabled sources and busy owners never auto-refresh',async()=>{
  for(const variant of ['failed','empty-success','attempt','run','refreshing','pending','elsewhere','disabled-sources']) {
    const f=freshFixture(),value=f.state.value;
    if(variant==='failed')value.runtime.result='failed';
    if(variant==='empty-success')value.sample.streams.ai.sampled_at='2026-10-28T00:00:00Z';
    if(variant==='attempt')value.runtime.last_attempt_at='2026-10-28T00:00:00Z';
    if(variant==='run')value.runtime.run_id='old-run';
    if(variant==='refreshing')value.refreshing=true;
    if(variant==='pending')value.runtime.pending_due=true;
    if(variant==='elsewhere')value.runtime.owner='owner_elsewhere';
    if(variant==='disabled-sources')f.state.settings.settings.sources[0].enabled=false;
    await flush();assert.equal(refreshPosts(f).length,0,variant);
    await f.hidden(true);await f.hidden(false);assert.equal(refreshPosts(f).length,0,variant);
  }
});

test('a failed initial refresh does not retry through settings polls or visibility',async()=>{
  const f=freshFixture();f.state.feed=(_url,options)=>{if(options.method==='POST')throw new Error('synthetic initial refresh failed');return f.state.value;};
  await flush();assert.equal(refreshPosts(f).length,1);assert.match(f.node('snapshot-note').textContent,/synthetic initial refresh failed/);
  await f.tick(15000);await f.hidden(true);await f.hidden(false);assert.equal(refreshPosts(f).length,1);
});

test('settings must load successfully before the first preset can auto-refresh',async()=>{
  const f=freshFixture();f.state.readSettings=()=>{throw new Error('synthetic settings unavailable');};await flush();assert.equal(refreshPosts(f).length,0);
});

test('hiding or destroying before the first read finishes never supplements an initial POST',async()=>{
  for(const action of ['hide','hide-resume','destroy']) {
    const f=freshFixture();let finish;
    f.state.feed=()=>new Promise(resolve=>{finish=resolve;});await flush();assert.equal(typeof finish,'function');
    if(action==='destroy')f.window.NewsReader.destroy();else await f.hidden(true);
    if(action==='hide-resume')await f.hidden(false);
    finish(f.state.value);await flush();assert.equal(refreshPosts(f).length,0,action);
  }
});

test('initial refresh waits for settings and cancels if that admission becomes hidden or destroyed',async()=>{
  for(const action of ['visible','hidden','destroyed']) {
    const f=freshFixture();let finish;
    f.state.readSettings=()=>new Promise(resolve=>{finish=resolve;});await flush();
    assert.equal(refreshPosts(f).length,0,action);assert.equal(typeof finish,'function');
    if(action==='hidden')await f.hidden(true);
    if(action==='destroyed')f.window.NewsReader.destroy();
    finish(f.state.settings);await flush();
    assert.equal(refreshPosts(f).length,action==='visible'?1:0,action);
    if(action==='hidden'){f.state.readSettings=null;await f.hidden(false);assert.equal(refreshPosts(f).length,0);}
  }
});
