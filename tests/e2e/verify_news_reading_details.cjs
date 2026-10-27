// Exercise the delivered reader against isolated article, date and failure fixtures.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../web/workspace');
const output=path.resolve('work/news-reading-details-tests',String(Date.now()));
fs.mkdirSync(output,{recursive:true});
const policy=fs.readFileSync(path.resolve(__dirname,'../../src/control_everything/http/news_reader.py'),'utf8').match(/CSP = \(([\s\S]*?)\)\r?\n/);
assert(policy,'retain the real news response policy');
const csp=Array.from(policy[1].matchAll(/"(?:[^"\\]|\\.)*"/g),match=>JSON.parse(match[0])).join('');
assert(csp.includes("script-src 'self';")&&!csp.includes("script-src 'self' 'unsafe-inline'"));
const origin='http://127.0.0.1:55109';
const ids=Object.fromEntries('abcdefghi'.split('').map((char,index)=>[char,(index+1).toString(16).repeat(24)]));
const firstParagraph='这是来自原文的第一个自然段，保留作者的实际表达，并用于帮助判断是否继续阅读。';
const code='function collect() {\n  return "<img src=x onerror=window.fixturePoison=true>";\n}';
const blocks=[{type:'p',text:firstParagraph},{type:'h2',text:'主章节'},{type:'p',text:'正文的第二个自然段，讨论实际方法与结果。'},
  {type:'h3',text:'子章节'},{type:'h4',text:'细节章节'},{type:'quote',text:'引用作者的话。'},
  {type:'code',text:code},{type:'li',text:'第一项实际步骤'},{type:'li',text:'第二项实际步骤'}];
const article=(id,title,extra={})=>({id,title,source_id:'fixture',source_name:'验证来源',url:'https://source.example/'+id,
  summary:'这段来源摘要不能冒充正文的第一个自然段。',images:[],body_blocks:[{type:'p',text:firstParagraph},{type:'p',text:'另一段完整正文。'}],
  content_kind:'full_text',published_at:'2026-10-27T04:00:00Z',fetched_at:'2026-10-27T05:00:00Z',...extra});
const items=[
  article(ids.a,'今日图文：层级清晰的标题',{published_at:'2026-10-26T16:00:00Z',body_blocks:blocks,references:[{url:'https://source.example/'+ids.b,label:'相关历史报道'}],images:[{url:'https://assets.example/site-logo.svg',kind:'cover',alt:'来源封面'},{url:'https://assets.example/cover.svg',kind:'body',alt:'验证图片'}]}),
  article(ids.b,'昨天的文章',{published_at:'2026-10-26T15:59:59Z'}),
  article(ids.c,'今天结束前的文章',{published_at:'2026-10-27T15:59:59Z'}),
  article(ids.d,'发布日期未知',{published_at:null}),
  article(ids.e,'今天更新的发布说明',{published_at:null,updated_at:'2026-10-27T04:00:00Z'}),
  article(ids.f,'只提供日期的文章',{published_at:null,published_raw:'2026-10-27'}),
  article(ids.g,'正文暂时不可用',{body_blocks:[],content_kind:undefined}),
  article(ids.h,'明天的文章',{published_at:'2026-10-27T16:00:00Z'}),
  article(ids.i,'今天收录的 Hacker News',{stream:'hn',content_origin:'hn_submission',published_at:'2020-01-01T00:00:00Z',submitted_at:'2026-10-27T04:00:00Z'})
];
const snapshot=rows=>({reader_id:'reading-details-fixture',sample:{captured_at:'2026-10-27T05:00:00Z',sources:[],streams:{ai:{items:rows.filter(row=>row.stream!=='hn')},hn:{items:rows.filter(row=>row.stream==='hn')}}},covers:{items:[]}});
const checks=[],errors=[],cspErrors=[];
let browser;
function check(name,value){assert(value,name);checks.push(name);}
async function makePage(rows=items,time='2026-10-27T04:00:00Z',articleFor=null){
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce',colorScheme:'light'});
  await page.clock.setFixedTime(new Date(time));
  const requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/Content Security Policy|violates the following.*directive/i.test(message.text()))cspErrors.push(message.text());});
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname==='assets.example')return url.pathname==='/unavailable.svg'?route.fulfill({status:404,body:'missing image'}):route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#e4e7eb"/></svg>'});
    if(url.origin!==origin)return route.abort();
    if(url.pathname.startsWith('/api/')&&request.headers()['x-session-client']!=='panel')return route.fulfill({status:403,body:'missing client header'});
    if(url.pathname==='/api/bootstrap')return route.fulfill({json:{csrf_token:'fixture'}});
    if(url.pathname==='/api/workspace/news/reader')return route.fulfill({json:snapshot(rows)});
    if(url.pathname==='/api/workspace/news/research/latest')return route.fulfill({json:{job:null}});
    if(url.pathname==='/api/workspace/news/article'){
      const id=url.searchParams.get('id'),row=rows.find(item=>item.id===id);requests.push(id);
      const value=id===ids.g&&!row?.body_blocks?.length?{id,title:row.title,content_kind:'summary',reason:'unavailable',blocks:[{type:'p',text:row.summary}],images:[]}:
        {id,title:row.title,content_kind:'full_text',reason:null,blocks:row.body_blocks,images:row.images};
      return route.fulfill({json:articleFor?await articleFor(id,row):value});
    }
    const file=url.pathname==='/'?'news-reader.html':url.pathname.slice(1);
    if(['news-reader.html','news-reader.js','news-reader.css','news-spider.js','news-pets.js','news-pet-dial.js','news-pet-wheel.js','news-pet-prefs.js','news-pet-director.js','news-pet-status.js','news-naidragon.js','news-tabbycat.js','ui-theme.js'].includes(file))return route.fulfill({path:path.join(root,file),headers:{'Content-Security-Policy':csp}});
    return route.abort();
  });
  await page.goto(origin+'/');
  await page.waitForFunction(count=>window.NewsReader?.inspect().items===count,rows.length);
  return {page,requests};
}
async function visibleIds(page){return page.locator('.title-row:visible').evaluateAll(nodes=>nodes.map(node=>node.dataset.id));}
(async()=>{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const {page,requests}=await makePage();
  check('news defaults to today',await page.locator('#date-range').inputValue()==='today');
  assert.deepEqual(await visibleIds(page),[ids.a,ids.c,ids.e,ids.f,ids.g]);check('today uses Shanghai publication day, release update and date-only metadata',true);
  check('a recent fetch never turns an old or undated article into today news',!(await visibleIds(page)).includes(ids.b)&&!(await visibleIds(page)).includes(ids.d));
  check('a known date-only publication is not labelled unknown',!(await page.locator(`.title-row[data-id="${ids.f}"] .row-date`).textContent()).includes('日期未知'));
  check('cards use the first body paragraph rather than the publisher summary',await page.locator(`.title-row[data-id="${ids.a}"] .title-row-summary`).innerText()===firstParagraph);
  check('cards distinguish picture articles from text articles',await page.locator(`.title-row[data-id="${ids.a}"] .row-type`).innerText()==='图文'&&await page.locator(`.title-row[data-id="${ids.c}"] .row-type`).innerText()==='文章');
  check('article images take priority over a generic feed cover',(await page.locator(`.title-row[data-id="${ids.a}"] .title-row-thumbnail`).getAttribute('src')).endsWith('/cover.svg'));
  check('the unread dot has an accessible meaning',await page.locator(`.title-row[data-id="${ids.a}"] .row-dot`).getAttribute('aria-label')==='未读');
  await page.locator('#date-range').selectOption('all');
  check('history is available through an explicit date choice',(await visibleIds(page)).length===8&&(await visibleIds(page)).includes(ids.d));
  await page.locator('#date-range').selectOption('today');
  await page.locator('#stream').selectOption('hn');
  check('Hacker News uses submission day instead of an invented publication day',JSON.stringify(await visibleIds(page))===JSON.stringify([ids.i]));
  await page.locator('#stream').selectOption('ai');
  await page.locator(`.title-row[data-id="${ids.a}"]`).click();
  await page.locator('#article-body h3').waitFor();
  check('the reader retains the first paragraph exactly once',await page.locator('#article-body .body-block').evaluateAll((nodes,text)=>nodes.filter(node=>node.textContent===text).length,firstParagraph)===1&&!(await page.locator('#article-summary').isVisible()));
  check('body heading hierarchy is nested below the article title',await page.locator('#article-body h3').innerText()==='主章节'&&await page.locator('#article-body h4').innerText()==='子章节'&&await page.locator('#article-body h5').innerText()==='细节章节');
  check('quotes and code retain their semantics and whitespace',await page.locator('#article-body blockquote').innerText()==='引用作者的话。'&&await page.locator('#article-body pre code').textContent()===code);
  check('article title and body have visibly different hierarchy',await page.evaluate(()=>{const title=getComputedStyle(document.getElementById('article-title')),body=getComputedStyle(document.getElementById('article-body'));return title.color!==body.color&&parseFloat(title.fontSize)>parseFloat(body.fontSize);}));
  check('source-looking HTML is rendered as text and never executed',await page.locator('#article-body img').count()===0&&await page.evaluate(()=>window.fixturePoison===undefined));
  check('unnecessary reading warnings and transport footer stay hidden',!(await page.locator('.room-footer').isVisible())&&!(await page.locator('#retry-article').isVisible())&&!(await page.locator('#content-status').isVisible()));
  check('footer actions have readable labels',await page.locator('#mark-read').innerText()==='标为已读'&&(await page.locator('#save-article').innerText()).includes('收藏')&&(await page.locator('#archive-article').innerText()).includes('归档'));
  await page.locator('#article-source').click();await page.getByRole('link',{name:'相关历史报道',exact:true}).click();
  check('an explicit historical reference opens the requested article',await page.locator('#article-title').innerText()==='昨天的文章'&&await page.locator('#date-range').inputValue()==='all');
  await page.locator('#back-to-list').click();await page.locator('#date-range').selectOption('today');await page.locator(`.title-row[data-id="${ids.a}"]`).click();
  await page.locator('#mark-read').click();
  check('read action exposes its pressed state',await page.locator('#mark-read').getAttribute('aria-pressed')==='true');
  await page.locator('#save-article').click();
  check('bookmark action exposes its pressed state',await page.locator('#save-article').getAttribute('aria-pressed')==='true');
  await page.locator('#back-to-list').click();
  check('read status changes the source-side dot and card state',await page.locator(`.title-row[data-id="${ids.a}"]`).getAttribute('data-read')==='true'&&await page.locator(`.title-row[data-id="${ids.a}"] .row-dot`).getAttribute('aria-label')==='已读');
  await page.reload();await page.waitForFunction(()=>window.NewsReader?.inspect().items===9);
  check('read and bookmark choices survive a reload',await page.locator(`.title-row[data-id="${ids.a}"]`).getAttribute('data-read')==='true'&&await page.evaluate(id=>window.NewsReader.inspect().reading[id].saved,ids.a));
  await page.locator(`.title-row[data-id="${ids.g}"]`).click();
  await page.waitForFunction(id=>document.querySelector(`.title-row[data-id="${id}"]`).hidden,ids.g);
  check('a failed body is fetched once and never opens the reader',requests.filter(id=>id===ids.g).length===1&&await page.locator('#animation-stage').getAttribute('data-reading-view')==='list');
  check('failure details do not replace the reading surface with small warning copy',!(await page.locator('#retry-article').isVisible())&&!(await page.locator('#content-status').isVisible()));
  await page.reload();await page.waitForFunction(()=>window.NewsReader?.inspect().items===9);
  check('a known unavailable body stays hidden across reloads',!(await visibleIds(page)).includes(ids.g)&&requests.filter(id=>id===ids.g).length===1);
  const repaired=items.map(row=>row.id===ids.g?{...row,content_kind:'full_text',body_blocks:[{type:'p',text:'重新取得的实际正文。'}]}:row);
  await page.evaluate(value=>window.NewsReader.applySnapshot(value,false,true),snapshot(repaired));
  check('new usable body content makes a previously unavailable article eligible again',(await visibleIds(page)).includes(ids.g));
  await page.locator(`.title-row[data-id="${ids.c}"]`).click();
  check('another article still opens after a neighboring source failed',await page.locator('#article-title').innerText()==='今天结束前的文章');
  await page.locator('#back-to-list').click();
  for(const theme of ['light','dark']){
    if(theme==='dark')await page.locator('#theme').click();
    check('actual theme control applies '+theme,await page.locator('html').getAttribute('data-theme')===theme);
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:900});
      check('news list fits '+theme+' '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&await page.locator('#date-range').evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
      check('all collection toolbar controls remain inside the viewport '+theme+' '+width,await page.locator('.filters button,.filters select').evaluateAll(nodes=>nodes.filter(node=>!node.hidden&&getComputedStyle(node).display!=='none').every(node=>{const r=node.getBoundingClientRect();return r.width>=40&&r.left>=0&&r.right<=innerWidth;})));
      await page.screenshot({path:path.join(output,`list-${theme}-${width}.png`)});
      await page.locator(`.title-row[data-id="${ids.a}"]`).click();
      check('reading text and action group fit '+theme+' '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&await page.locator('.article-actions').evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
      check('reading actions stay legible '+theme+' '+width,await page.locator('.article-actions button').evaluateAll(nodes=>nodes.every(node=>parseFloat(getComputedStyle(node).fontSize)>=14&&node.getBoundingClientRect().height>=40)));
      await page.screenshot({path:path.join(output,`article-${theme}-${width}.png`)});
      await page.locator('#back-to-list').click();
    }
  }
  await page.close();
  const {page:empty}=await makePage([items[1]]);
  check('an empty today view offers history without changing the date automatically',await empty.locator('#show-history').isVisible()&&await empty.locator('#date-range').inputValue()==='today');
  await empty.locator('#show-history').click();
  check('the history action reveals older articles',await empty.locator('#date-range').inputValue()==='all'&&(await visibleIds(empty)).length===1);
  await empty.close();
  const {page:midnight}=await makePage([items[0],items[7]],'2026-10-27T15:59:59Z');
  check('before Shanghai midnight only that day is visible',JSON.stringify(await visibleIds(midnight))===JSON.stringify([ids.a]));
  await midnight.clock.setFixedTime(new Date('2026-10-27T16:00:01Z'));
  await midnight.waitForFunction(id=>document.querySelector(`.title-row[data-id="${id}"]`).hidden,ids.a,{timeout:4000});
  check('the open reader automatically changes its day at Shanghai midnight',JSON.stringify(await visibleIds(midnight))===JSON.stringify([ids.h]));
  await midnight.close();
  const {page:brokenImage}=await makePage([article(ids.a,'有正文但图片不可用',{images:[{url:'https://assets.example/unavailable.svg',kind:'body'}]})]);
  await brokenImage.locator(`.title-row[data-id="${ids.a}"]`).click();
  await brokenImage.waitForFunction(()=>document.querySelector('#article-cover .article-image')?.hidden);
  check('failed images do not interrupt normal text reading',await brokenImage.locator('.image-unavailable:visible').count()===0&&await brokenImage.locator('#article-body').innerText().then(text=>text.includes(firstParagraph)));
  await brokenImage.close();
  let busyAttempts=0;
  const {page:busy}=await makePage([items[0],items[6]],undefined,(id,row)=>id===ids.g&&++busyAttempts===1?
    {id,title:row.title,content_kind:'summary',reason:'reader_busy',blocks:[],images:[]}:
    {id,title:row.title,content_kind:'full_text',reason:null,blocks:[{type:'p',text:'稍候后取得的可读正文。'}],images:[]});
  await busy.locator(`.title-row[data-id="${ids.g}"]`).click();
  await busy.waitForFunction(id=>document.querySelector(`.title-row[data-id="${id}"]`).getAttribute('aria-busy')==='true',ids.g);
  await busy.evaluate(()=>window.NewsReader.setActive(false));
  await busy.evaluate(()=>window.NewsReader.setActive(true));
  await busy.waitForFunction(id=>window.NewsReader.inspect().readingView==='article'&&window.NewsReader.inspect().currentId===id,ids.g,{timeout:4500});
  check('a pending busy article resumes after the reader becomes active again',busyAttempts===2&&await busy.locator('#article-title').innerText()==='正文暂时不可用');
  await busy.close();
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const {page:cancelled,requests:cancelRequests}=await makePage([items[0],items[6]],undefined,async(id,row)=>id===ids.g?pending:
    {id,title:row.title,content_kind:'full_text',reason:null,blocks:row.body_blocks,images:row.images});
  await cancelled.locator(`.title-row[data-id="${ids.g}"]`).click();
  await cancelled.waitForFunction(id=>document.querySelector(`.title-row[data-id="${id}"]`).getAttribute('aria-busy')==='true',ids.g);
  await cancelled.locator(`.title-row[data-id="${ids.a}"]`).click();
  release({id:ids.g,title:'正文暂时不可用',content_kind:'full_text',reason:null,blocks:[{type:'p',text:'后台完成的正文。'}],images:[]});
  await cancelled.waitForFunction(id=>document.querySelector(`.title-row[data-id="${id}"]`).getAttribute('aria-busy')!=='true',ids.g,{timeout:3000});
  check('choosing another article clears a completed request without stealing focus',cancelRequests.filter(id=>id===ids.g).length===1&&await cancelled.locator('#article-title').innerText()===items[0].title);
  await cancelled.close();
  let releaseFiltered;
  const filteredBody=new Promise(resolve=>{releaseFiltered=resolve;});
  const {page:filtered}=await makePage([items[0],items[6]],undefined,async(id,row)=>id===ids.g?filteredBody:
    {id,title:row.title,content_kind:'full_text',reason:null,blocks:row.body_blocks,images:row.images});
  const filteredResponse=filtered.waitForResponse(response=>response.url().includes('/article?id='+ids.g));
  await filtered.locator(`.title-row[data-id="${ids.g}"]`).click();await filtered.locator('#search').fill('今日图文');
  releaseFiltered({id:ids.g,title:'正文暂时不可用',content_kind:'full_text',reason:null,blocks:[{type:'p',text:'搜索条件改变后返回的正文。'}],images:[]});
  await (await filteredResponse).finished();await filtered.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  check('a late result outside the new search cannot open a different article',await filtered.locator('#animation-stage').getAttribute('data-reading-view')==='list'&&await filtered.locator(`.title-row[data-id="${ids.g}"]`).getAttribute('aria-busy')!=='true');
  await filtered.close();
  let releaseRetired;
  const lateBody=new Promise(resolve=>{releaseRetired=resolve;});
  const {page:retired}=await makePage([items[0],items[6]],undefined,async(id,row)=>id===ids.g?lateBody:
    {id,title:row.title,content_kind:'full_text',reason:null,blocks:row.body_blocks,images:row.images});
  const completedRetired=retired.waitForResponse(response=>response.url().includes('/article?id='+ids.g));
  await retired.locator(`.title-row[data-id="${ids.g}"]`).click();
  await retired.evaluate(()=>window.NewsReader.dispose());
  releaseRetired({id:ids.g,title:'正文暂时不可用',content_kind:'full_text',reason:null,blocks:[{type:'p',text:'页面退休后返回的正文。'}],images:[]});
  await (await completedRetired).finished();
  await retired.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  check('a late body cannot open an article after its reader has retired',await retired.evaluate(()=>{const value=window.NewsReader.inspect();return value.destroyed&&value.readingView==='list';}));
  await retired.close();
  check('no page runtime errors',errors.length===0);check('no CSP violations',cspErrors.length===0);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({fixture:true,checks,errors,cspErrors},null,2));
  console.log(JSON.stringify({output,fixture:true,checks,errors,cspErrors},null,2));
})().catch(error=>{fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({fixture:true,checks,errors,cspErrors,error:String(error)},null,2));console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
