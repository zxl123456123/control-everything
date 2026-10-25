'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {fixture,flush,sample,running}=require('./news_reader_fixture.cjs');

test('unchanged feed polls preserve storage and ignore changing transport age fields', async () => {
  const f = fixture(); await flush(); assert.equal(f.writes.length,1);
  f.state.value.sample.sources[0].cache_age_ms = 1500;
  await f.tick(1500); assert.equal(f.writes.length,1);
  f.state.value.sample.sources[0].reason = 'offline';
  await f.tick(1500); assert.equal(f.writes.length,2);
});

test('feed polling pauses in hidden pages and resumes one GET without replaying refresh POST', async () => {
  const f=fixture(); await flush(); await f.node('refresh-feeds').listeners.click(); await flush();
  assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  await f.hidden(true); assert.equal(f.timers.size,0);
  const before=f.calls.length; await f.hidden(false);
  assert.equal(f.calls.length,before+1); assert.equal(f.calls.at(-1).method,'GET'); assert.equal(f.writes.length,1);
});

test('an unchanged successful response clears a previous feed connection error', async () => {
  const f=fixture(); await flush(); const note=f.node('snapshot-note').textContent;
  f.state.feed=() => {throw new Error('offline fixture');};
  await f.tick(1500); assert.equal(f.node('snapshot-note').textContent,'offline fixture');
  f.state.feed=null; await f.hidden(true); await f.hidden(false);
  assert.equal(f.node('snapshot-note').textContent,note); assert.equal(f.writes.length,2);
});

test('overlapping visible events cannot start a second feed read', async () => {
  const f=fixture(); await flush(); let finish;
  f.state.feed=() => new Promise(resolve=>{finish=resolve;});
  await f.tick(1500); const before=f.calls.length;
  await f.hidden(true); await f.hidden(false); await f.hidden(false);
  assert.equal(f.calls.length,before); finish(sample(false)); await flush(); assert.equal(f.node('refresh-feeds').disabled,false);
});

test('research polling pauses while hidden and resumes without creating another job', async () => {
  const f=fixture(); await flush(); f.node('research-query').value='fixture query';
  await f.node('research-form').listeners.submit({preventDefault(){}}); await flush();
  const posts=f.calls.filter(call=>call.method==='POST').length;
  assert.ok([...f.timers.values()].some(timer=>timer.ms===1000));
  await f.hidden(true); assert.equal(f.timers.size,0);
  await f.hidden(false);
  assert.equal(f.calls.filter(call=>call.method==='POST').length,posts);
  assert.equal(f.calls.filter(call=>call.url.includes('/research?id=')).length,1);
});

test('BFCache suspension pauses timers and a destroyed page ignores late feed results', async () => {
  const f=fixture(); await flush(); f.windowEvents.pagehide({persisted:true}); assert.equal(f.timers.size,0);
  const before=f.calls.length; f.windowEvents.pageshow({persisted:true}); await flush(); assert.equal(f.calls.length,before+1);
  let finish; f.state.feed=() => new Promise(resolve=>{finish=resolve;}); await f.tick(1500);
  f.windowEvents.pagehide({persisted:false}); const writes=f.writes.length;
  const value=sample(); value.sample.captured_at='2026-10-25T00:00:00Z'; finish(value); await flush();
  assert.equal(f.writes.length,writes); assert.equal(f.timers.size,0);
});
