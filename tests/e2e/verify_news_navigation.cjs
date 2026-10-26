// Real Studio and reader documents with explicit synthetic business data, no external services.
'use strict';
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const assets = path.join(root, 'web/workspace');
const output = path.join(root, 'work/news-inline-navigation');
fs.mkdirSync(output, { recursive: true });
const counts = { documents: 0, feeds: 0, refreshes: 0 };
let holdArticle = false, articleReady, releaseArticle;
const items = [1, 2].map(n => ({ id: String(n).repeat(24), title: `隔离示例 ${n}：在工作台内阅读新闻`,
  source_name: '合成来源', source_id: 'fixture', url: `https://example.com/${n}`, summary: '用于验证导航、正文位置和局部刷新的合成文章。',
  body_blocks: Array.from({length:30}, (_, i) => ({type:'p', text:`第 ${i + 1} 段。` + '切换页面后应保留当前阅读位置，更新数据不应重新加载工作台。'.repeat(5)})),
  published_at: '2026-10-26T00:00:00Z', images: [] }));
const snapshot = () => ({reader_id:'navigation-fixture', sample:{captured_at:'2026-10-26T00:00:00Z', sources:[], streams:{ai:{items},hn:{items:[]}}}, covers:{items:[]}});
const project = {id:'fixture',name:'隔离测试项目',root:'C:/example/project',archived:false};
function policy(file, name) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const block = source.match(new RegExp(name + ' = \\(([\\s\\S]*?)\\)\\r?\\n'));
  assert(block, name);
  return [...block[1].matchAll(/"(?:[^"\\]|\\.)*"/g)].map(row => JSON.parse(row[0])).join('');
}
const readerPolicy = policy('src/control_everything/http/news_reader.py', 'CSP');
const studioPolicy = policy('src/control_everything/http/workbench.py', 'STUDIO_CSP');
const allowed = new Set(['studio-preview.css','studio-preview.js','workspace.css','news-reader.css','news-reader.js','news-spider.js','ui-theme.js','ui-dialog.js','studio-shell.js','project-progress-model.js']);
const server = createServer((req,res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const reply = (body,type='application/json',csp) => {res.writeHead(200,{'Content-Type':type,...(csp ? {'Content-Security-Policy':csp} : {})});res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));};
  if (url.pathname === '/studio') return reply(fs.readFileSync(path.join(assets,'studio-preview.html'),'utf8').replace('id="ce-studio"','id="ce-studio" data-isolated-preview="true"'), 'text/html; charset=utf-8', studioPolicy.replace("frame-src 'none'", `frame-src ${url.origin}/news`));
  if (url.pathname === '/news') { counts.documents++; return reply(fs.readFileSync(path.join(assets,'news-reader.html')), 'text/html; charset=utf-8', url.search === '?embedded=1' ? readerPolicy.replace("frame-ancestors 'none'", "frame-ancestors 'self'") : readerPolicy); }
  if (url.pathname === '/studio-data.js') return reply(`window.StudioData={create:()=>({bootstrap:async()=>{},snapshot:async()=>(${JSON.stringify({workspace:{projects:{items:[project]}},items:[],agents:[]})}),canWrite:()=>false})};`, 'text/javascript');
  if (url.pathname === '/agents.js') return reply('window.WorkspaceAgentBoard={create:()=>({update(){},unavailable(){},setProject(){},dispose(){}})};', 'text/javascript');
  if (url.pathname === '/api/bootstrap') return reply({csrf_token:'fixture-token'});
  if (url.pathname === '/api/workspace/news/reader') { counts.feeds++; return reply(snapshot()); }
  if (url.pathname === '/api/workspace/news/reader/refresh') { counts.refreshes++; return setTimeout(()=>reply(snapshot()),250); }
  if (url.pathname === '/api/workspace/news/research/latest') return reply({job:null});
  if (url.pathname === '/api/workspace/news/article') { const item=items.find(item=>item.id===url.searchParams.get('id')); if (holdArticle) { releaseArticle=()=>reply({id:item.id,content_kind:'full_text',blocks:item.body_blocks,images:[{url:'https://localhost/late-news-image.svg',alt:'合成延迟图片'}],reason:null}); articleReady(); return; } return reply({id:item.id,content_kind:'full_text',blocks:item.body_blocks,images:[],reason:null}); }
  const filename = url.pathname.slice(1);
  if (allowed.has(filename)) return reply(fs.readFileSync(path.join(assets,filename)),filename.endsWith('.css') ? 'text/css' : 'text/javascript');
  if (url.pathname.endsWith('.js')) return reply('', 'text/javascript');
  if (url.pathname.endsWith('.css')) return reply('', 'text/css');
  res.writeHead(404);res.end();
});
async function main() {
  await new Promise(resolve=>server.listen(process.env.NEWS_PREVIEW_PORT || 0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  console.log('Synthetic preview: '+origin+'/studio');
  if (process.argv.includes('--serve')) return;
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[], checks=[];
  const check=(name,value)=>{assert(value,name);checks.push(name);};
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/studio');
    await page.getByRole('heading',{name:'隔离测试项目'}).waitFor();
    await page.evaluate(()=>window.navigationIdentity={});
    const documentIdentity=await page.evaluateHandle(()=>window.navigationIdentity);
    await page.locator('#studio-rail a[href="#news"]').click();
    const reader=page.frameLocator('iframe[title="新闻阅读器"]');
    await reader.locator('#title-list .title-row').first().waitFor();
    check('latest reader opens as card list',await reader.locator('#animation-stage').getAttribute('data-reading-view')==='list');
    await page.screenshot({path:path.join(output,'latest-list.png')});
    const frame=page.frames().find(frame=>frame.url().includes('/news?'));
    const readerIdentity=await frame.evaluateHandle(()=>window.NewsReader);
    await reader.locator('#title-list .title-row').nth(1).click();
    await reader.locator('#article-scroll').evaluate(el=>el.scrollTop=350);
    const before=await frame.evaluate(()=>({id:NewsReader.inspect().currentId,scroll:document.getElementById('article-scroll').scrollTop}));
    check('article can scroll',before.scroll>0);
    await page.getByRole('button',{name:'收起导航',exact:true}).click();
    await page.screenshot({path:path.join(output,'latest-collapsed.png')});
    check('navigation collapses',await page.locator('#studio-rail').evaluate(el=>el.getBoundingClientRect().width<=70));
    await page.getByRole('button',{name:'展开导航',exact:true}).click();
    await reader.locator('#open-directory').click();
    await reader.locator('#open-directory').click();
    check('directory collapses while article remains',!await reader.locator('#directory').isVisible() && await reader.locator('#article-title').isVisible());
    await reader.locator('#open-directory').click();
    await page.locator('#studio-rail a[href="#home"]').click();
    check('hidden reader stops activity',!await frame.evaluate(()=>NewsReader.inspect().active));
    await page.goBack();
    await page.locator('.ce-news-surface').waitFor({state:'visible'});
    check('same document and reader after history navigation',await page.evaluate(identity=>window.navigationIdentity===identity,documentIdentity) && await frame.evaluate(identity=>NewsReader===identity,readerIdentity));
    check('selection and scroll survive',await frame.evaluate(before=>NewsReader.inspect().currentId===before.id && document.getElementById('article-scroll').scrollTop===before.scroll,before));
    check('news document loaded once',counts.documents===1);
    await page.getByRole('button',{name:'切换深色外观',exact:true}).click();
    await frame.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    check('reader inherits theme and font',await frame.evaluate(()=>!getComputedStyle(document.body).fontFamily.includes('Times New Roman')));
    await page.screenshot({path:path.join(output,'latest-dark.png')});
    await page.getByRole('button',{name:'切换浅色外观',exact:true}).click();
    await reader.getByRole('button',{name:'更新新闻',exact:true}).click();
    check('refresh reports busy',await reader.locator('#refresh-feeds').getAttribute('aria-busy')==='true');
    await reader.locator('#refresh-feeds[aria-busy=false]').waitFor();
    check('refresh is local and retains position',counts.refreshes===1 && counts.documents===1 && await frame.evaluate(before=>document.getElementById('article-scroll').scrollTop===before.scroll,before));
    await page.screenshot({path:path.join(output,'desktop.png')});
    await page.setViewportSize({width:390,height:844});
    await reader.locator('#open-directory').click();
    check('mobile directory opens',await reader.locator('#open-directory').getAttribute('aria-expanded')==='true');
    await reader.locator('#close-directory').click();
    check('mobile fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth) && await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(output,'mobile.png')});
    await page.getByRole('button',{name:'打开导航',exact:true}).click();
    await page.locator('#studio-navigation a[href="#home"]').click();
    await page.getByRole('heading',{name:'隔离测试项目'}).waitFor();
    check('mobile returns directly to projects',page.url().endsWith('#home'));
    const latePage=await browser.newPage({viewport:{width:1440,height:1000}});
    latePage.on('pageerror',error=>errors.push(error.message));
    let imageRequests=0;
    await latePage.route('https://localhost/late-news-image.svg',route=>{imageRequests++;return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/>'});});
    holdArticle=true; const articlePending=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('article request did not start')),5000);articleReady=()=>{clearTimeout(timer);resolve();};});
    await latePage.setViewportSize({width:1440,height:1000}); await latePage.goto(origin+'/studio#news');
    const delayed=latePage.frameLocator('iframe[title="新闻阅读器"]');
    await delayed.locator('#title-list .title-row').first().click(); await articlePending;
    const delayedFrame=latePage.frames().find(frame=>frame.url().includes('/news?'));
    await latePage.locator('#studio-rail a[href="#home"]').click();
    await delayedFrame.waitForFunction(()=>!NewsReader.inspect().active);
    const response=latePage.waitForResponse(response=>response.url().includes('/article?id='));
    releaseArticle(); await response; await delayedFrame.waitForTimeout(150);
    check('late article cannot start an image request while hidden',imageRequests===0);
    await latePage.locator('#studio-rail a[href="#news"]').click();
    await delayedFrame.waitForFunction(()=>document.querySelector('img[src="https://localhost/late-news-image.svg"]')?.naturalWidth>0);
    check('cached late article renders its image only after return',imageRequests>0);
    await latePage.close();
    holdArticle=false;
    await page.goto(origin+'/news');
    await page.locator('#title-list .title-row').first().waitFor();
    await page.locator('#title-list .title-row').first().click();
    check('standalone reader remains active',await page.evaluate(()=>NewsReader.inspect().active));
    check('no runtime errors',errors.length===0);
    fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify({fixture:true,checks,errors,counts},null,2));
    console.log(JSON.stringify({checks,errors,counts},null,2));
  } finally {await browser.close();server.close();}
}
main().catch(error=>{console.error(error);server.close();process.exitCode=1;});
