// Isolated public-page research worker. It never loads a personal browser profile.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {capturePublicPost,canonicalPost}=require('./news-public-embed.js');
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),root=path.dirname(process.argv[2]);
const hosts=new Set(['x.com','twitter.com','publish.x.com','www.tmaker.io','tmaker.io','steipete.me','simonwillison.net','www.anthropic.com','anthropic.com','claude.dev','openai.com','developers.openai.com','blog.google','deepmind.google','developers.googleblog.com','huggingface.co','github.com','arxiv.org','code.claude.com','www.qbitai.com','sspai.com']);
const items=[],events=[];let browser,page,sequence=0,frameNumber=0;
const presets={
 coding:['https://www.tmaker.io/blog/how-to-make-the-most-of-ai','https://steipete.me/posts/just-talk-to-it'],
 agents:['https://www.tmaker.io/blog/how-to-make-the-most-of-ai','https://www.anthropic.com/engineering/building-effective-agents'],
 claude:['https://claude.dev/blog/solving-code-review-at-anthropic/','https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md'],
 models:['https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-argon/','https://openai.com/index/introducing-the-rosalind-academic-plan'],
 tibo:['https://x.com/tibo_maker/status/2110302154833510709','https://x.com/thsottiaux/status/2112712984644784534','https://www.tmaker.io/blog/how-to-make-the-most-of-ai']
};
const feeds={
 coding:['https://steipete.me/rss.xml','https://raw.githubusercontent.com/anthropics/claude-code/main/feed.xml'],
 agents:['https://steipete.me/rss.xml','https://raw.githubusercontent.com/anthropics/claude-code/main/feed.xml'],
 claude:['https://raw.githubusercontent.com/anthropics/claude-code/main/feed.xml'],
 models:['https://deepmind.google/blog/rss.xml','https://openai.com/news/rss.xml'],tibo:[]
};
const domesticFeeds=['https://www.qbitai.com/feed','https://sspai.com/feed'];
const sourceNames={'qbitai.com':'量子位','sspai.com':'少数派'};
const batchSize=20,knownUrls=new Set(config.known_urls||[]);
function emit(stage,message,extra={}){const row={seq:++sequence,time:new Date().toISOString(),stage,message,...extra};events.push(row);process.stdout.write(JSON.stringify(row)+'\n');}
function checkpoint(){const file=path.join(root,'result.json'),temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify({items,events},null,2));fs.renameSync(temporary,file);}
function safePage(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&hosts.has(u.hostname)?u.href:null;}catch{return null;}}
function safeResource(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&!['localhost','localhost.localdomain'].includes(u.hostname)&&!/^\d+(?:\.\d+){3}$/.test(u.hostname)&&!u.hostname.includes(':')&&!u.hostname.endsWith('.local');}catch{return false;}}
async function freshPage(){
 const previous=page;page=await previous.context().newPage();await previous.close();
 page.on('dialog',dialog=>dialog.dismiss());
}
async function frame(stage,message,url,extra={}){
 let screenshot;
 if(config.capture_frames)try{const name=`frame-${String(++frameNumber).padStart(3,'0')}.jpg`;await page.screenshot({path:path.join(root,name),type:'jpeg',quality:70,animations:'disabled',timeout:5000});screenshot=`/api/workspace/news/research-frame?job=${config.job_id}&name=${name}`;}catch{}
 emit(stage,message,{url:page.url()==='about:blank'?url:page.url(),requested_url:url,screenshot,...extra});
}
async function visit(url,label){
 emit('visit',label,{url});
 try{
  await freshPage();
  if(!config.capture_frames&&['www.qbitai.com','sspai.com'].includes(new URL(url).hostname)){
   const response=await page.context().request.get(url,{timeout:12000,maxRedirects:0});
   if(!response.ok()){await frame('blocked',`来源返回 HTTP ${response.status()}，未提取`,url);return false;}
   const body=await response.body();if(body.length>3*1024*1024)throw new Error('article_oversize');
   if(!/text\/html|application\/xhtml\+xml/i.test(response.headers()['content-type']||''))throw new Error('unsupported_content_type');
   emit('visit','已读取来源正文，无需加载页面脚本',{url});return {html:body.toString('utf8')};
  }
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:18000});
  const final=safePage(page.url());
  if(!final){await frame('blocked','来源跳转到未支持页面，未提取',url);return false;}
  if(response&&response.status()>=400){await frame('blocked',`来源返回 HTTP ${response.status()}，未将错误页作为新闻`,url,{status:response.status()});return false;}
  await frame('visit','页面已打开，等待提取内容',final,{title:await page.title()});
  if(config.capture_frames)fs.writeFileSync(path.join(root,`page-${frameNumber}.html`),await page.content());
  return {};
 }catch(error){await frame('blocked','来源页面暂时无法读取',url,{detail:String(error.message).split('\n')[0]});return false;}
}
async function discoverFeeds(urls){
 const candidates=[],seen=new Set(),pending=[...urls];let available=false;
 for(const url of pending){
  if(new URL(url).searchParams.has('paged')&&candidates.length>=batchSize)continue;
  emit('search','读取作者或官方订阅源',{url});
  try{
   let target=url,response;
   for(let hop=0;hop<4;hop++){
    try{response=await page.context().request.get(target,{timeout:10000,maxRedirects:0});}
    catch{
     emit('search','订阅请求暂未响应，重试一次',{url:target});
     response=await page.context().request.get(target,{timeout:10000,maxRedirects:0});
    }
    if(![301,302,303,307,308].includes(response.status()))break;
    const location=response.headers().location;if(!location||hop===3)throw new Error('redirect_rejected');
    const next=new URL(location,target);
    if(next.origin!==new URL(url).origin||next.username||next.password)throw new Error('redirect_rejected');
    target=next.href;
   }
   if(!response.ok())throw new Error('HTTP '+response.status());
   const body=await response.body();if(body.length>1024*1024)throw new Error('feed_oversize');
   const xml=body.toString('utf8');if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('unsupported_feed');
   const rows=await page.evaluate(xml=>{
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    const root=doc.documentElement;
    if(doc.querySelector('parsererror')||doc.querySelectorAll('*').length>50000||!((root.localName==='rss'&&root.getAttribute('version')==='2.0')||(root.localName==='feed'&&root.namespaceURI==='http://www.w3.org/2005/Atom')))throw new Error('invalid_feed');
    const clean=text=>String(text||'').replace(/\s+/g,' ').trim();
    return [...doc.querySelectorAll('item,entry')].map(entry=>{
     const atom=entry.localName==='entry',children=[...entry.children],field=name=>children.find(node=>node.localName===name);
     const link=atom?children.find(node=>node.localName==='link'&&(!node.getAttribute('rel')||node.getAttribute('rel')==='alternate')):field('link');
     const content=children.find(node=>node.localName===(atom?'content':'encoded'));
     const description=field(atom?'summary':'description');
     const textOf=node=>{
      if(!node||node.getAttribute('src'))return [];
      const kind=atom?node.getAttribute('type')||'text':'html';
      if(!['text','text/plain','html','text/html','xhtml'].includes(kind))return [];
      const html=new DOMParser().parseFromString(kind==='xhtml'?node.innerHTML:node.textContent,'text/html');
      html.querySelectorAll('script,style,iframe,object,nav,footer,[hidden],[aria-hidden="true"]').forEach(node=>node.remove());
      const elements=[...html.querySelectorAll('p,li,h2,h3,pre')].filter(node=>!node.parentElement.closest('p,li,h2,h3,pre'));
      return (elements.length?elements.map(node=>({type:/^H/.test(node.tagName)?'h2':node.tagName==='LI'?'li':'p',text:clean(node.textContent)})):[{type:'p',text:clean(html.body.textContent)}]).filter(block=>block.text);
     };
     return {url:atom?link?.getAttribute('href'):clean(link?.textContent),title:clean(field('title')?.textContent),
      published:clean(field(atom?'published':'pubDate')?.textContent)||null,updated:clean(field('updated')?.textContent)||null,
      blocks:textOf(content),summary:textOf(description).map(block=>block.text).join(' ')};
    }).filter(row=>row.title&&row.url).sort((a,b)=>(Date.parse(b.published||b.updated)||0)-(Date.parse(a.published||a.updated)||0));
   },xml);
   available=true;
   const aliases={coding:'编程',agents:'智能体',models:'模型',workflow:'工作流',tips:'技巧'};
   const terms=config.query.toLowerCase().split(/\s+/).filter(term=>term.length>1).flatMap(term=>aliases[term]?[term,aliases[term]]:[term]);
   const unseen=rows.filter(row=>!seen.has(row.url));rows.forEach(row=>seen.add(row.url));
   const matches=unseen.filter(row=>safePage(row.url)&&!knownUrls.has(row.url)&&(!terms.length||terms.some(term=>(row.title+' '+row.summary+' '+row.blocks.map(block=>block.text).join(' ')).toLowerCase().includes(term))));
   candidates.push(...matches);
   emit('search',`订阅源返回 ${rows.length} 条记录`,{url,counts:{links:rows.length}});
   const source=new URL(url),number=Number(source.searchParams.get('paged')||1);
   if(source.origin==='https://www.qbitai.com'&&source.pathname==='/feed'&&unseen.length&&candidates.length<batchSize&&number<4){
    source.searchParams.set('paged',String(number+1));pending.push(source.href);
   }
  }catch(error){emit('blocked','订阅源暂时无法读取',{url,detail:String(error.message).split('\n')[0]});}
 }
 return {available,candidates:[...new Map(candidates.map(row=>[row.url,row])).values()].sort((a,b)=>(Date.parse(b.published||b.updated)||0)-(Date.parse(a.published||a.updated)||0)).slice(0,batchSize)};
}
function keepFeedContent(row){
 const title=row.title.toLowerCase(),content=row.blocks.filter(block=>block.text.toLowerCase()!==title);
 const summary=row.summary?.toLowerCase()===title?'':row.summary;
 const explicit=content.length>0,blocks=explicit?content:summary?[{type:'p',text:summary}]:[];
 if(!blocks.length)return;
 let remaining=24000;const bounded=blocks.slice(0,64).map(block=>{const text=block.text.slice(0,remaining);remaining-=text.length;return{...block,text};}).filter(block=>block.text);
 const sourceId=new URL(row.url).hostname.replace(/^www\./,'').replace(/[^a-z0-9]/g,'_');
 const id=crypto.createHash('sha256').update(sourceId+':'+row.url).digest('hex').slice(0,24);
 items.push({id,source_id:sourceId,source_name:sourceNames[new URL(row.url).hostname.replace(/^www\./,'')]||new URL(row.url).hostname.replace(/^www\./,''),title:row.title,url:row.url,
  summary:summary?.slice(0,600)||null,stream:'ai',published_at:row.published&&Number.isFinite(Date.parse(row.published))?new Date(row.published).toISOString():null,published_raw:row.published,
  updated_at:row.updated&&Number.isFinite(Date.parse(row.updated))?new Date(row.updated).toISOString():null,
  fetched_at:new Date().toISOString(),body_blocks:bounded,images:[],content_kind:'summary',content_origin:'publisher_feed',content_type:'article',
  completeness:explicit?'feed_content':'feed_summary',incomplete:true,discovery:config.query,discovery_method:'publisher_feed'});
 emit('extract',explicit?'已保留官方订阅源内容':'已保留来源摘要，原文暂不可用',{url:row.url,counts:{blocks:bounded.length,images:0,characters:bounded.reduce((n,block)=>n+block.text.length,0)}});
 checkpoint();
}
async function extract(url,published=null,html=null){
 if(['/', '/technology/ai/', '/learn/codex'].includes(new URL(url).pathname)||/\/(?:tags|category|categories)\//.test(new URL(url).pathname)){
  emit('blocked','这是来源目录页，不把多篇标题列表当成一篇全文',{url});return;
 }
 if(!html)try { await page.waitForFunction(() => {
  const article=document.querySelector('article')||document.querySelector('.prose')||document.querySelector('.article')||document.querySelector('main');
  return [...article?.querySelectorAll('p,li,pre,.notion-text')||[]].some(node=>node.getClientRects().length&&!node.closest('nav,header,footer,[role="navigation"],.cookie-banner')&&(node.innerText||'').trim().length>=80);
 }, null, {timeout:3000}); } catch {}
 const data=await page.evaluate(({sourceUrl,html})=>{
  const doc=html?new DOMParser().parseFromString(html,'text/html'):document;
  const visible=node=>!!html||!!node.getClientRects().length;
  const text=node=>node?(html?node.textContent:node.innerText):'';
  const post=doc.querySelector('article [data-testid="tweetText"]');
  const article=post?.closest('article')||doc.querySelector('article')||doc.querySelector('.prose')||doc.querySelector('.article')||doc.querySelector('main');
  if(!article)return null;
  if(!post&&!doc.querySelector('article')&&[...doc.querySelectorAll('input[type="password"]')].some(visible))return null;
  const blocks=[],seen=new Set();
  const candidates=post?[post]:article.querySelectorAll('h2,h3,p,li,pre,.notion-text');
  for(const node of candidates){
   if(!visible(node)||node.closest('nav,footer,header,[role="navigation"],.cookie-banner,[hidden],[aria-hidden="true"]'))continue;
   if(node.tagName==='LI'&&node.querySelector('p'))continue;
   const value=text(node)?.replace(/\s+/g,' ').trim();
   if(!value||value.length<15||seen.has(value))continue;
   seen.add(value);blocks.push({type:/^H/.test(node.tagName)?'h2':node.tagName==='LI'?'li':'p',text:value});
  }
  const images=[];
  for(const img of article.querySelectorAll('img')){
   const url=img.currentSrc||img.getAttribute('src');
   if(!url||!visible(img)||(img.naturalWidth&&img.naturalWidth<200)||/avatar|logo|icon|badge/i.test((img.alt||'')+' '+url))continue;
   images.push({url,alt:img.alt||'',caption:text(img.closest('figure')?.querySelector('figcaption'))?.trim()||'',kind:'body'});
  }
  const cover=doc.querySelector('meta[property="og:image"]')?.content;
  if(cover&&!images.some(row=>row.url===cover))images.unshift({url:cover,alt:'',caption:'',kind:'cover'});
  const title=post?text(post).replace(/\s+/g,' ').trim().slice(0,100):text(doc.querySelector('h1'))?.trim()||doc.title;
  const clean=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
  const structured=[];
  for(const script of doc.querySelectorAll('script[type="application/ld+json"]')){
   try{const value=JSON.parse(script.textContent);for(const entry of Array.isArray(value)?value:[value]){structured.push(entry,...(Array.isArray(entry?.['@graph'])?entry['@graph']:[]));}}catch{}
  }
  const articleTypes=new Set(['Article','NewsArticle','BlogPosting','TechArticle','SocialMediaPosting']);
  const structuredArticles=structured.filter(entry=>entry&&[entry['@type']].flat().some(type=>articleTypes.has(type)));
  const identity=entry=>{const value=entry.mainEntityOfPage||entry.url||entry['@id'];return typeof value==='string'?value:value?.['@id']||value?.url;};
  const schema=structuredArticles.find(entry=>identity(entry)?.split('#')[0]===sourceUrl.split('#')[0])||structuredArticles.find(entry=>clean(entry.headline)===clean(title))||(structuredArticles.length===1&&!identity(structuredArticles[0])?structuredArticles[0]:null);
  const authorNames=value=>[value].flat().map(entry=>clean(typeof entry==='string'?entry:entry?.name)).filter(name=>name&&!/^https?:\/\//i.test(name));
  let authors=authorNames(schema?.author);
  if(!authors.length)authors=[...doc.querySelectorAll('meta[name="author"],meta[name="article-author"],meta[property="article:author"]')].map(node=>clean(node.content)).filter(name=>name&&!/^https?:\/\//i.test(name));
  if(!authors.length)authors=[...article.querySelectorAll('[rel="author"],[itemprop="author"],.byline')].filter(visible).map(node=>clean(node.querySelector('[itemprop="name"]')?.textContent||text(node)).replace(/^by\s+/i,'')).filter(Boolean);
  const published=clean(schema?.datePublished)||clean(doc.querySelector('meta[name="published_time"],meta[property="article:published_time"],meta[itemprop="datePublished"]')?.content)||clean(article.querySelector('time[datetime]')?.dateTime)||clean(text(article.querySelector('time')))||null;
  const references=[];
  for(const anchor of article.querySelectorAll('a[href]')){
   if(!visible(anchor)||anchor.closest('nav,footer,header,aside,[role="navigation"],.cookie-banner')||!anchor.closest('p,li,pre,h2,h3,.notion-text,figure,blockquote'))continue;
   const href=anchor.getAttribute('href');
   if(!href||href.startsWith('#'))continue;
   try{references.push({url:new URL(href,sourceUrl).href,label:clean(text(anchor)||anchor.getAttribute('aria-label')||anchor.querySelector('img')?.alt).slice(0,200)});}catch{}
  }
  return {title,blocks,images,published,author:[...new Set(authors)].slice(0,10).join(', ')||null,references,post:!!post};
 },{sourceUrl:url,html});
 if(!data){emit('blocked','未识别到可读正文，保留实际页面供查看',{url});return;}
 data.published ||= published&&Number.isFinite(Date.parse(published))?new Date(published).toISOString():null;
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
 const host=new URL(url).hostname.replace(/^www\./,'');
 const item={id,source_id:sourceId,source_name:sourceNames[host]||(data.post?'X · ':'')+host,title:data.title,url,summary:textBlocks.find(b=>b.type==='p')?.text.slice(0,500)||null,stream:'ai',published_at:timestamp,published_raw:data.published,author:data.author,fetched_at:new Date().toISOString(),body_blocks:textBlocks,images,content_kind:'full_text',content_origin:data.post?'social_post':'browser_article',content_type:data.post?'post':'article',completeness:'captured_body',references:references.slice(0,20),references_total:references.length,discovery:config.query,discovery_method:'public_browser'};
 items.push(item);
 checkpoint();
 // Show the extracted text, rather than a hero video or iframe still loading above it.
 await page.evaluate(()=>{
  const article=document.querySelector('article')||document.querySelector('.prose')||document.querySelector('.article')||document.querySelector('main');
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
   await freshPage();
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
 emit('search','从作者与官方订阅源匹配内容',{keywords:config.query});
 const domestic=['coding','agents','models'].includes(config.topic);
 let discovered=await discoverFeeds(domestic?domesticFeeds:feeds[config.topic]||[]);
 if(domestic&&!discovered.candidates.length){
  emit('search','国内订阅暂无匹配内容，继续检查官方与作者来源');
  const fallback=await discoverFeeds(feeds[config.topic]||[]);
  discovered={available:discovered.available||fallback.available,candidates:fallback.candidates};
 }
 const candidates=discovered.available?discovered.candidates:(presets[config.topic]||presets.coding).filter(url=>!postUrl(url)&&!knownUrls.has(url)).map(url=>({url,blocks:[],summary:''}));
 if(!discovered.available)emit('search',(feeds[config.topic]||[]).length?'订阅源不可用，读取预设作者原文；这些不是本次关键词检索结果':'读取该主题的作者原文；这些不是全网关键词检索结果');
 if(discovered.available&&!candidates.length)emit('search','订阅源中暂无匹配关键词的内容');
 let completed=0;
 if(candidates.length)emit('visit','准备检查来源正文',{progress:{phase:'visit',completed,total:candidates.length}});
 for(const row of candidates){
  const before=items.length;
  if(row.blocks.length)keepFeedContent(row);
  else{const source=await visit(row.url,'读取作者或官方原文');if(source)await extract(row.url,row.published,source.html);if(items.length===before)keepFeedContent(row);}
  emit('visit','来源正文检查进展',{progress:{phase:'visit',completed:++completed,total:candidates.length}});
 }
 emit('merge',items.length?`本次取得 ${items.length} 篇可读内容，准备合入阅读器`:'本次未取得可读正文，保留已有内容',{counts:{articles:items.length,images:items.reduce((n,i)=>n+i.images.length,0)}});
})().catch(error=>{emit('error','采集遇到错误，已有阅读记录保留',{detail:error.name});process.exitCode=1;}).finally(async()=>{checkpoint();if(browser)await browser.close();});
