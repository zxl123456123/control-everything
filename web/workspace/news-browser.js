// Isolated public-page research worker. It never loads a personal browser profile.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {capturePublicPost,canonicalPost}=require('./news-public-embed.js');
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),root=path.dirname(process.argv[2]);
const hosts=new Set(['x.com','twitter.com','publish.x.com','www.bing.com','cn.bing.com','www.tmaker.io','tmaker.io','steipete.me','simonwillison.net','www.anthropic.com','anthropic.com','claude.dev','openai.com','developers.openai.com','blog.google','developers.googleblog.com','huggingface.co','github.com','arxiv.org','code.claude.com']);
const items=[],events=[];let browser,page,sequence=0,frameNumber=0;
const presets={
 coding:['https://www.tmaker.io/blog/how-to-make-the-most-of-ai','https://steipete.me/posts/just-talk-to-it'],
 agents:['https://www.tmaker.io/blog/how-to-make-the-most-of-ai','https://www.anthropic.com/engineering/building-effective-agents'],
 claude:['https://claude.dev/blog/solving-code-review-at-anthropic/','https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md'],
 models:['https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-argon/','https://openai.com/index/introducing-the-rosalind-academic-plan'],
 tibo:['https://x.com/tibo_maker/status/2110302154833510709','https://x.com/thsottiaux/status/2112712984644784534','https://www.tmaker.io/blog/how-to-make-the-most-of-ai']
};
function emit(stage,message,extra={}){const row={seq:++sequence,time:new Date().toISOString(),stage,message,...extra};events.push(row);process.stdout.write(JSON.stringify(row)+'\n');}
function checkpoint(){const file=path.join(root,'result.json'),temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify({items,events},null,2));fs.renameSync(temporary,file);}
function safePage(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&hosts.has(u.hostname)?u.href:null;}catch{return null;}}
function safeResource(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&!['localhost','localhost.localdomain'].includes(u.hostname)&&!/^\d+(?:\.\d+){3}$/.test(u.hostname)&&!u.hostname.includes(':')&&!u.hostname.endsWith('.local');}catch{return false;}}
function directLink(value){try{const u=new URL(value);if(u.hostname==='www.bing.com'&&u.pathname==='/ck/a'){const wrapped=u.searchParams.get('u');if(wrapped?.startsWith('a1'))value=Buffer.from(wrapped.slice(2),'base64url').toString('utf8');}return safePage(value);}catch{return null;}}
async function frame(stage,message,url,extra={}){
 let screenshot;
 if(config.capture_frames)try{const name=`frame-${String(++frameNumber).padStart(3,'0')}.jpg`;await page.screenshot({path:path.join(root,name),type:'jpeg',quality:70,animations:'disabled',timeout:5000});screenshot=`/api/workspace/news/research-frame?job=${config.job_id}&name=${name}`;}catch{}
 emit(stage,message,{url:page.url()==='about:blank'?url:page.url(),requested_url:url,screenshot,...extra});
}
async function visit(url,label){
 emit('visit',label,{url});
 try{
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:18000});
  const final=safePage(page.url());
  if(!final){await frame('blocked','来源跳转到未支持页面，未提取',url);return false;}
  if(response&&response.status()>=400){await frame('blocked',`来源返回 HTTP ${response.status()}，未将错误页作为新闻`,final);return false;}
  await frame('visit','页面已打开，等待提取内容',final,{title:await page.title()});
  if(config.capture_frames)fs.writeFileSync(path.join(root,`page-${frameNumber}.html`),await page.content());
  return true;
 }catch(error){await frame('blocked','页面打开失败，保留实际画面',url,{detail:String(error.message).split('\n')[0]});return false;}
}
async function extract(url){
 if(['/', '/technology/ai/', '/learn/codex'].includes(new URL(url).pathname)||/\/(?:tags|category|categories)\//.test(new URL(url).pathname)){
  emit('blocked','这是来源目录页，不把多篇标题列表当成一篇全文',{url});return;
 }
 try { await page.waitForFunction(() => {
  const article=document.querySelector('article')||document.querySelector('.prose')||document.querySelector('main');
  return [...article?.querySelectorAll('p,li,pre,.notion-text')||[]].some(node=>node.getClientRects().length&&!node.closest('nav,header,footer,[role="navigation"],.cookie-banner')&&(node.innerText||'').trim().length>=80);
 }, null, {timeout:3000}); } catch {}
 const data=await page.evaluate(sourceUrl=>{
  const visible=node=>!!node.getClientRects().length;
  const post=document.querySelector('article [data-testid="tweetText"]');
  const article=post?.closest('article')||document.querySelector('article')||document.querySelector('.prose')||document.querySelector('main');
  if(!article)return null;
  if(!post&&!document.querySelector('article')&&[...document.querySelectorAll('input[type="password"]')].some(visible))return null;
  const blocks=[],seen=new Set();
  const candidates=post?[post]:article.querySelectorAll('h2,h3,p,li,pre,.notion-text');
  for(const node of candidates){
   if(!visible(node)||node.closest('nav,footer,header,[role="navigation"],.cookie-banner'))continue;
   if(node.tagName==='LI'&&node.querySelector('p'))continue;
   const text=node.innerText?.replace(/\s+/g,' ').trim();
   if(!text||text.length<15||seen.has(text))continue;
   seen.add(text);blocks.push({type:/^H/.test(node.tagName)?'h2':node.tagName==='LI'?'li':'p',text});
  }
  const images=[];
  for(const img of article.querySelectorAll('img')){
   const url=img.currentSrc||img.getAttribute('src');
   if(!url||!visible(img)||(img.naturalWidth&&img.naturalWidth<200)||/avatar|logo|icon|badge/i.test((img.alt||'')+' '+url))continue;
   images.push({url,alt:img.alt||'',caption:img.closest('figure')?.querySelector('figcaption')?.innerText?.trim()||'',kind:'body'});
  }
  const cover=document.querySelector('meta[property="og:image"]')?.content;
  if(cover&&!images.some(row=>row.url===cover))images.unshift({url:cover,alt:'',caption:'',kind:'cover'});
  const title=post?post.innerText.replace(/\s+/g,' ').trim().slice(0,100):document.querySelector('h1')?.innerText?.trim()||document.title;
  const clean=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
  const structured=[];
  for(const script of document.querySelectorAll('script[type="application/ld+json"]')){
   try{const value=JSON.parse(script.textContent);for(const entry of Array.isArray(value)?value:[value]){structured.push(entry,...(Array.isArray(entry?.['@graph'])?entry['@graph']:[]));}}catch{}
  }
  const articleTypes=new Set(['Article','NewsArticle','BlogPosting','TechArticle','SocialMediaPosting']);
  const structuredArticles=structured.filter(entry=>entry&&[entry['@type']].flat().some(type=>articleTypes.has(type)));
  const identity=entry=>{const value=entry.mainEntityOfPage||entry.url||entry['@id'];return typeof value==='string'?value:value?.['@id']||value?.url;};
  const schema=structuredArticles.find(entry=>identity(entry)?.split('#')[0]===sourceUrl.split('#')[0])||structuredArticles.find(entry=>clean(entry.headline)===clean(title))||(structuredArticles.length===1&&!identity(structuredArticles[0])?structuredArticles[0]:null);
  const authorNames=value=>[value].flat().map(entry=>clean(typeof entry==='string'?entry:entry?.name)).filter(name=>name&&!/^https?:\/\//i.test(name));
  let authors=authorNames(schema?.author);
  if(!authors.length)authors=[...document.querySelectorAll('meta[name="author"],meta[name="article-author"],meta[property="article:author"]')].map(node=>clean(node.content)).filter(name=>name&&!/^https?:\/\//i.test(name));
  if(!authors.length)authors=[...article.querySelectorAll('[rel="author"],[itemprop="author"],.byline')].filter(visible).map(node=>clean(node.querySelector('[itemprop="name"]')?.textContent||node.innerText).replace(/^by\s+/i,'')).filter(Boolean);
  const published=clean(schema?.datePublished)||clean(document.querySelector('meta[name="published_time"],meta[property="article:published_time"],meta[itemprop="datePublished"]')?.content)||clean(article.querySelector('time[datetime]')?.dateTime)||clean(article.querySelector('time')?.innerText)||null;
  const references=[];
  for(const anchor of article.querySelectorAll('a[href]')){
   if(!visible(anchor)||anchor.closest('nav,footer,header,aside,[role="navigation"],.cookie-banner')||!anchor.closest('p,li,pre,h2,h3,.notion-text,figure,blockquote'))continue;
   const href=anchor.getAttribute('href');
   if(!href||href.startsWith('#'))continue;
   try{references.push({url:new URL(href,sourceUrl).href,label:clean(anchor.innerText||anchor.getAttribute('aria-label')||anchor.querySelector('img')?.alt).slice(0,200)});}catch{}
  }
  return {title,blocks,images,published,author:[...new Set(authors)].slice(0,10).join(', ')||null,references,post:!!post};
 },url);
 if(!data){emit('blocked','未识别到可读正文，保留实际页面供查看',{url});return;}
 const textBlocks=data.blocks.filter(b=>b.text!==data.title);
 const chars=textBlocks.reduce((n,b)=>n+b.text.length,0);
 if(chars<(data.post?15:300)||(!data.post&&/sign in|log in|access denied|just a moment|verify you are human/i.test(data.title))){emit('blocked','正文不足或访问受限，未用标题冒充全文',{url});return;}
 const sourceId=new URL(url).hostname.replace(/^www\./,'').replace(/[^a-z0-9]/g,'_');
 const images=data.images.filter(row=>safeResource(row.url)).filter((row,i,all)=>all.findIndex(r=>r.url===row.url)===i).slice(0,12);
 const references=[],referenceUrls=new Set();
 for(const row of data.references){
  if(!safeResource(row.url))continue;
  const link=new URL(row.url);link.hash='';
  if(link.href===url.split('#')[0]||referenceUrls.has(link.href))continue;
  const host=link.hostname.replace(/^www\./,'');
  const isX=['x.com','twitter.com'].includes(host);
  if(isX&&!/^\/[A-Za-z0-9_]+\/status\/\d+\/?$/.test(link.pathname))continue;
  const paper=(host==='arxiv.org'&&/^\/(abs|pdf|html)\//.test(link.pathname))||host==='doi.org'||(host==='openreview.net'&&/^\/(forum|pdf)$/.test(link.pathname))||/\bpaper\b|论文/i.test(row.label);
  referenceUrls.add(link.href);references.push({url:link.href,label:row.label||link.hostname,kind:isX?'x_post':paper?'paper':'source'});
 }
 const datePart=data.published?.slice(0,10);
 const validDate=datePart&&Number.isFinite(Date.parse(datePart))&&new Date(datePart).toISOString().slice(0,10)===datePart;
 const timestamp=validDate&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(data.published)&&Number.isFinite(Date.parse(data.published))?new Date(data.published).toISOString():null;
 const id=crypto.createHash('sha256').update(sourceId+':'+url).digest('hex').slice(0,24);
 const item={id,source_id:sourceId,source_name:(data.post?'X · ':'')+new URL(url).hostname.replace(/^www\./,''),title:data.title,url,summary:textBlocks.find(b=>b.type==='p')?.text.slice(0,500)||null,stream:'ai',published_at:timestamp,published_raw:data.published,author:data.author,fetched_at:new Date().toISOString(),body_blocks:textBlocks,images,content_kind:'full_text',content_origin:data.post?'social_post':'browser_article',content_type:data.post?'post':'article',completeness:'captured_body',references:references.slice(0,20),references_total:references.length,discovery:config.query,discovery_method:'public_browser'};
 items.push(item);
 checkpoint();
 // Show the extracted text, rather than a hero video or iframe still loading above it.
 await page.evaluate(()=>{
  const article=document.querySelector('article')||document.querySelector('.prose')||document.querySelector('main');
  const candidates=[...article?.querySelectorAll('.notion-text,pre')||[],...article?.querySelectorAll('p,li')||[]];
  const paragraph=candidates.find(node=>node.getClientRects().length&&!node.closest('nav,header,footer,aside,[role="navigation"],.cookie-banner')&&(node.innerText||'').trim().length>=80);
  paragraph?.scrollIntoView({block:'center',behavior:'instant'});
 });
 await frame('extract',`已提取 ${textBlocks.length} 段正文、${images.length} 张图片`,url,{title:data.title,counts:{blocks:textBlocks.length,images:images.length,characters:chars}});
}
function postUrl(value){try{return canonicalPost(value);}catch{return null;}}
async function capturePosts(urls){
 const referenced=items.flatMap(item=>(item.references||[]).filter(row=>row.kind==='x_post').map(row=>row.url));
 const posts=[...new Set([...referenced,...urls].map(postUrl).filter(Boolean))].slice(0,2);
 let completed=0;
 if(posts.length)emit('extract','准备读取公开帖文',{progress:{phase:'extract',completed,total:posts.length}});
 for(const url of posts){
  if(items.some(item=>postUrl(item.url)===url)){completed++;continue;}
  const discoveredFrom=items.filter(item=>(item.references||[]).some(row=>postUrl(row.url)===url)).map(item=>item.url);
  emit('visit','从已知链接读取 X 公开帖子',{url,source_url:url,discovered_from:discoveredFrom});
  try{
   const post=await capturePublicPost(page,url,frame);
   const blocks=post.text.split(/\n+/).map(text=>text.trim()).filter(Boolean).map(text=>({type:'p',text}));
   const id=crypto.createHash('sha256').update('x:'+post.canonical_url).digest('hex').slice(0,24);
   items.push({id,source_id:'x',source_name:'X · @'+new URL(url).pathname.split('/')[1],
    title:post.text.replace(/\s+/g,' ').slice(0,100),url:post.canonical_url,summary:null,stream:'ai',
    author:post.author,published_at:post.published_at,published_raw:post.published_raw,published_precision:post.published_precision,
    fetched_at:new Date().toISOString(),body_blocks:blocks,images:post.images,
    content_kind:post.incomplete?'summary':'full_text',content_origin:'x_public_embed',content_type:'post',
    completeness:'public_embed',incomplete:post.incomplete,references:post.references,references_total:post.references.length,
    discovery:config.query,discovery_method:'official_public_embed',discovered_from:discoveredFrom});
   checkpoint();
  }catch{ /* The helper records the real failure frame; other sources remain readable. */ }
  emit('extract','公开帖文检查进展',{progress:{phase:'extract',completed:++completed,total:posts.length}});
 }
}
(async()=>{
 browser=await chromium.launch({...(process.platform==='win32'?{channel:'msedge'}:{}),headless:true});
 const context=await browser.newContext({viewport:{width:1120,height:740},locale:'en-US',acceptDownloads:false,serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const request=route.request(),url=request.url();
  if(!safeResource(url)||['media','font'].includes(request.resourceType()))return route.abort();
  if(request.isNavigationRequest()&&request.frame()===page?.mainFrame()&&!safePage(url))return route.abort();
  return route.continue();
 });
 page=await context.newPage();page.on('dialog',dialog=>dialog.dismiss());
 const explicitPost=postUrl(config.query);
 if(explicitPost){
  emit('search','识别到 X 帖子链接，准备读取公开帖文',{url:explicitPost});
  await capturePosts([explicitPost]);
  emit('merge',items.length?'公开帖文已读取，准备合入阅读器':'本次未取得公开帖文，保留已有内容',{counts:{articles:items.length,images:items.reduce((n,item)=>n+item.images.length,0)}});
  return;
 }
 emit('search','准备检索 X 公开帖子与作者原文',{keywords:config.query});
 let found=[];
 const xSearch='https://x.com/search?q='+encodeURIComponent(config.query)+'&f=live';
 if(await visit(xSearch,'打开 X 关键词搜索')){
  try{await page.locator('[data-testid="tweetText"]').first().waitFor({timeout:4000});}catch{}
  found=await page.locator('article a[href*="/status/"]').evaluateAll(nodes=>nodes.map(node=>node.href));
  found=[...new Set(found.map(directLink).filter(Boolean))].slice(0,3);
  await frame(found.length?'search':'blocked',found.length?`X 页面返回 ${found.length} 条帖子链接`:'X 页面未提供可读取的公开帖子，继续检查公开索引',page.url());
 }
 const searchUrl='https://www.bing.com/search?q='+encodeURIComponent('site:x.com '+config.query);
 if(!found.length&&await visit(searchUrl,'打开公开搜索，查找关键词相关 X 帖子')){
  try{await page.locator('li.b_algo').first().waitFor({state:'attached',timeout:3000});}catch{}
  found=await page.locator('li.b_algo h2 a').evaluateAll(nodes=>nodes.map(node=>node.href));
  found=[...new Set(found.map(directLink).filter(url=>url&&/^https:\/\/(?:x|twitter)\.com\/[^/]+\/status\/\d+/.test(url)))].slice(0,3);
  await frame('search',found.length?`搜索页找到 ${found.length} 条公开帖子链接`:'当前搜索页未返回可用帖子链接',page.url(),{counts:{links:found.length}});
 }
 const seeds=presets[config.topic]||presets.coding;
 if(!found.length)emit('search','公开检索未取得帖子，继续检查预设关注作者与官方来源；这些不是本次搜索结果');
 const urls=[...new Set([...found,...seeds])].slice(0,found.length?4:3);
 const articles=urls.filter(url=>!postUrl(url));let completed=0;
 if(articles.length)emit('visit','准备检查来源正文',{progress:{phase:'visit',completed,total:articles.length}});
 for(const url of articles){if(await visit(url,'访问来源并读取正文与图片'))await extract(url);emit('visit','来源正文检查进展',{progress:{phase:'visit',completed:++completed,total:articles.length}});}
 await capturePosts(urls);
 emit('merge',items.length?`本次取得 ${items.length} 篇可读内容，准备合入阅读器`:'本次未取得可读正文，保留已有内容',{counts:{articles:items.length,images:items.reduce((n,i)=>n+i.images.length,0)}});
})().catch(error=>{emit('error','采集遇到错误，已有阅读记录保留',{detail:error.name});process.exitCode=1;}).finally(async()=>{checkpoint();if(browser)await browser.close();});
