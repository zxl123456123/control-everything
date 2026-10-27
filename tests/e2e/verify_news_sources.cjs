// Execute the actual browser worker against isolated publisher fixtures only.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../..');
const worker = path.join(root, 'web/workspace/news-browser.js');
const workerRequire = createRequire(worker);
const output = path.join(root, 'work/news-source-reliability-tests', String(Date.now()));
fs.mkdirSync(output, {recursive:true});
const checks = [];
const paragraph = 'A measured coding workflow records methods, useful results and the limits of its observations. '.repeat(5);
const rss = rows => '<rss version="2.0"><channel>' + rows.join('') + '</channel></rss>';
const entry = (url, title = 'Coding report') => `<item><title>${title}</title><link>${url}</link><description>A source-provided coding summary.</description></item>`;
const html = '<article><h1>Measured coding report</h1><p>' + paragraph + '</p><p>Second paragraph: ' + paragraph + '</p></article>';
let browser;
function check(name, value) { assert(value, name); checks.push(name); }

async function run(name, topic, query, feedFor) {
  const folder = path.join(output, name); fs.mkdirSync(folder);
  const config = path.join(folder, 'request.json');
  fs.writeFileSync(config, JSON.stringify({job_id:'a'.repeat(32),topic,query,capture_frames:false}));
  let context, resolve, exitCode = 0;
  const events = [], navigations = [], pages = [];
  const done = new Promise(ready => {resolve = ready;});
  const request = {get:async url => {
    const value = feedFor(url);
    return {ok:()=>typeof value==='string',status:()=>typeof value==='string'?200:value.status,
      headers:()=>typeof value==='string'?{}:{location:value.location},body:async()=>Buffer.from(value)};
  }};
  const ownedBrowser = {
    async newContext(options) {
      context = await browser.newContext(options);
      context.request.get = request.get;
      const newPage = context.newPage.bind(context), route = context.route.bind(context);
      context.newPage = async () => {const page = await newPage(); pages.push(page); return page;};
      context.route = async (pattern, handler) => route(pattern, incoming => handler({
        request:()=>incoming.request(), abort:()=>incoming.abort(),
        continue:async()=>{
          const req = incoming.request(), url = new URL(req.url());
          navigations.push({url:url.href,page:pages.indexOf(req.frame().page())});
          return incoming.fulfill({status:url.pathname.includes('blocked')?403:200,contentType:'text/html',body:html});
        }
      }));
      return context;
    },
    async close() {await context?.close(); resolve();}
  };
  const fakeProcess = {argv:['node',worker,config],platform:process.platform,
    stdout:{write:line=>events.push(JSON.parse(line))},set exitCode(value){exitCode=value;}};
  try {
    vm.runInNewContext(fs.readFileSync(worker,'utf8'), {
      require:id=>id==='playwright'?{chromium:{launch:async()=>ownedBrowser}}:workerRequire(id),
      process:fakeProcess,Buffer,URL,console
    }, {filename:worker});
    await done;
    check(name + ': worker exited normally', exitCode===0);
    check(name + ': every page closes', pages.every(page=>page.isClosed()));
    check(name + ': source navigations use distinct pages', new Set(navigations.map(row=>row.page)).size===navigations.length);
    check(name + ': default collection skips X and search engines', navigations.every(row=>!/(?:x\.com|bing\.com)/.test(new URL(row.url).hostname)));
    const result = JSON.parse(fs.readFileSync(path.join(folder,'result.json'),'utf8'));
    return {...result,events,navigations};
  } finally {await context?.close();}
}

(async()=>{
  browser = await chromium.launch({channel:'msedge',headless:true});
  const recovery = await run('failed-source','models','coding',url=>{
    if(url.includes('openai.com'))throw new Error('fixture feed timeout');
    return rss([entry('https://blog.google/blocked'),entry('https://blog.google/readable'),entry('https://localhost/private')]);
  });
  check('failure retains publisher summary without suppressing the next full article', recovery.items.length===2&&recovery.items.some(row=>row.content_kind==='full_text')&&recovery.items.some(row=>row.completeness==='feed_summary'));
  check('failed sources remain visible in events', recovery.events.some(event=>event.stage==='blocked'));
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Claude Code release</title><link href="https://github.com/anthropics/claude-code/releases/tag/test"/>' +
    '<updated>2026-10-01T00:00:00Z</updated><content type="html"><![CDATA[<p>Actual release note.</p><script>POISON</script><p>' + paragraph + '</p>]]></content></entry>' +
    '<entry><title>Claude title-only fixture</title><link href="https://github.com/anthropics/claude-code/releases/tag/title-only"/><content>Claude title-only fixture</content></entry></feed>';
  let attempts = 0;
  const inline = await run('inline-atom','claude','Claude',()=>{if(++attempts===1)throw new Error('fixture feed timeout'); return atom;});
  check('a transient feed failure retries once and recovers without a blocked source', attempts===2&&!inline.events.some(event=>event.stage==='blocked'));
  check('official Atom content is readable without opening the HTML page', inline.items.length===1&&inline.navigations.length===0&&inline.items[0].body_blocks.length===2);
  check('inline content stays labelled as publisher content', inline.items[0].completeness==='feed_content'&&inline.items[0].incomplete===true);
  check('feed markup is never executable or copied into text', !JSON.stringify(inline.items).includes('POISON'));
  check('a title repeated as feed content cannot become a readable article', !inline.items.some(row=>row.url.endsWith('/title-only')));
  const redirected = await run('feed-redirect','models','coding',url=>{
    if(url==='https://deepmind.google/blog/rss.xml')return {status:301,location:'/new-feed.xml'};
    if(url.includes('openai.com'))return {status:301,location:'https://localhost/private'};
    return rss([entry('https://blog.google/readable')]);
  });
  check('canonical same-origin feed redirects remain readable', redirected.items.length===1&&redirected.items[0].content_kind==='full_text');
  check('feed redirects cannot switch to a private or different origin', redirected.events.some(event=>event.detail==='redirect_rejected'));
  const unmatched = await run('no-match','coding','no-such-keyword',()=>rss([entry('https://steipete.me/readable')]));
  check('a keyword miss does not substitute unrelated preset articles', unmatched.items.length===0&&unmatched.navigations.length===0);
  const invalid = await run('invalid-feed','coding','coding',()=>'<html><body>A feed challenge page</body></html>');
  check('invalid feed uses separately identified author fallback', invalid.items.length===2&&invalid.events.some(event=>event.stage==='blocked'&&event.detail.includes('invalid_feed')));
  const report = {fixture:true,checks};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();});
