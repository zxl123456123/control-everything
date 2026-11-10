/* Coordinator-only: run against an isolated, already running real preview. */
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const origin=process.env.NEWS_PREVIEW_ORIGIN;
if(!origin)throw new Error('Set NEWS_PREVIEW_ORIGIN to the isolated preview; this harness never starts a service.');
const output=path.resolve(process.env.NEWS_EVIDENCE_DIR||'work/news-workbench-20261025/frontend/browser');
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),requests=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('/api/workspace/news/'))requests.push({url:new URL(request.url()).pathname,method:request.method(),at:Date.now()});});
  await page.addInitScript(()=>{
    window.__newsEvidence={documentId:crypto.randomUUID(),mounts:0,handles:[]};
    let reader;
    Object.defineProperty(window,'NewsReaderUI',{configurable:true,get:()=>reader,set(value){const mount=value.mount;value.mount=function(...args){const handle=mount.apply(this,args);window.__newsEvidence.mounts++;window.__newsEvidence.handles.push(handle);return handle;};reader=value;}});
  });
  try{
    await page.goto(origin+'/studio#home');
    await page.locator('#ce-studio').waitFor();
    const before=await page.evaluate(()=>window.__newsEvidence.documentId);
    const samples=[];
    for(let index=0;index<6;index++){
      const started=Date.now();await page.evaluate(()=>{location.hash='#news';});
      await page.locator('.ce-news-surface #news-room').waitFor({state:'visible'});
      await page.waitForFunction(()=>window.__newsEvidence.mounts===1);
      const article=await page.locator('.ce-news-surface #article-title').textContent();
      if(index===0)await page.locator('.ce-news-surface #article-scroll').evaluate(node=>{node.scrollTop=120;});
      const state=await page.locator('.ce-news-surface #article-scroll').evaluate(node=>node.scrollTop);
      await page.evaluate(()=>{location.hash='#home';});await page.locator('#studio-content').waitFor({state:'visible'});
      await page.evaluate(()=>{location.hash='#news';});await page.locator('.ce-news-surface #news-room').waitFor({state:'visible'});
      assert.equal(await page.evaluate(()=>window.__newsEvidence.documentId),before);
      assert.equal(await page.evaluate(()=>window.__newsEvidence.mounts),1);
      assert.equal(await page.locator('.ce-news-surface #article-title').textContent(),article);
      assert.equal(await page.locator('.ce-news-surface #article-scroll').evaluate(node=>node.scrollTop),state);
      samples.push({index,kind:index?'hot':'cold',roundTripMs:Date.now()-started});
    }
    await page.evaluate(()=>window.NewsPetPrefs.setEnabled(false));
    assert.equal(await page.evaluate(()=>window.__newsEvidence.handles[0].inspect().petEnabled),false);
    await page.locator('.ce-news-surface #source-settings').click();
    await page.getByRole('dialog',{name:'来源与更新'}).waitFor({state:'visible'});
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:360,height:800});await page.screenshot({path:path.join(output,'news-360.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:900});await page.screenshot({path:path.join(output,'news-desktop.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'switching.json'),JSON.stringify({samples,requests,errors,limitations:['No native project/terminal draft, public feed, translation-extra or background scheduling claim; coordinator must verify separately.']},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
