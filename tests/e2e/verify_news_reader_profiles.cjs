const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('web/workspace'),id='a'.repeat(24),checks=[];
const item={id,title:'Saved article',summary:'Summary',source_id:'fixture',source_name:'Fixture',stream:'ai',url:'https://example.com/article',published_at:null,fetched_at:'2026-10-23T00:00:00Z'};
const snapshot={reader_id:'profile_b',sample:{sources:[],streams:{ai:{items:[item]},hn:{items:[]}}},covers:{items:[]}};
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage();let sampled=false,requests=0,early=false;
 await page.addInitScript(({id,item})=>{
   const row={read_at:null,archived_at:null,saved:true,snapshot:item};
   localStorage.setItem('news-focused-reader-v2',JSON.stringify({[id]:row}));
   localStorage.setItem('news-focused-reader-v2:profile_a',JSON.stringify({[id]:row}));
   localStorage.setItem('news-focused-reader-v2:profile_b',JSON.stringify({[id]:{...row,saved:false}}));
 },{id,item});
 await page.route('**/*',async route=>{const u=new URL(route.request().url());
   if(u.pathname==='/api/workspace/news/reader'){await new Promise(r=>setTimeout(r,250));sampled=true;return route.fulfill({json:snapshot});}
   if(u.pathname==='/api/workspace/news/article'){requests++;early ||= !sampled;return route.fulfill({json:{id,title:item.title,content_kind:requests===1?'summary':'full_text',reason:requests===1?'reader_busy':null,blocks:requests===1?[]:[{type:'p',text:'Recovered real body'}],images:[]}});}
   if(u.pathname==='/api/workspace/news/research/latest')return route.fulfill({json:{job:null}});
   const file=u.pathname==='/news'?'news-reader.html':u.pathname.slice(1);if(['news-reader.html','news-reader.css','news-reader.js','news-spider.js','news-pets.js','news-pet-status.js','news-naidragon.js'].includes(file))return route.fulfill({path:path.join(root,file)});return route.abort();
 });
 await page.goto('http://127.0.0.1:8766/news');
 await page.waitForFunction(()=>document.getElementById('article-body').textContent.includes('Recovered real body'));
 assert.equal(early,false);checks.push('no article read before profile sample and known IDs');
 assert.equal(requests,2);checks.push('busy document retries and recovers');
 assert.equal(await page.locator('#save-article').getAttribute('aria-pressed'),'false');checks.push('only matching profile reading state restored');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('news-focused-reader-v2:profile_a'))['a'.repeat(24)].saved),true);checks.push('other profile storage untouched');
 snapshot.sample.streams.ai.items=[item,{...item,id:'b'.repeat(24),title:'Second article',url:'https://example.com/second'}];requests=0;sampled=false;
 await page.reload();await page.waitForFunction(()=>window.NewsReader?.inspect().items===2);await page.waitForTimeout(100);
 await page.locator('.title-row[data-id="'+ 'b'.repeat(24)+'"]').click();await page.waitForTimeout(1700);
 await page.locator('.title-row[data-id="'+id+'"]').click();await page.waitForFunction(()=>document.getElementById('article-body').textContent.includes('Recovered real body'));
 assert.ok(requests>=3);checks.push('busy article is retried after leaving and returning');
 snapshot.reader_id='profile_c';snapshot.sample.streams.ai.items=[];sampled=false;
 await page.reload();await page.waitForFunction(()=>window.NewsReader?.inspect().items===0);assert.equal(await page.evaluate(()=>Object.keys(window.NewsReader.inspect().reading).length),0);checks.push('empty new profile never shows previous snapshots');
 console.log(JSON.stringify({checks,failures:0}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
