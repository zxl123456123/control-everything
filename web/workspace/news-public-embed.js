// Read known public posts through X's documented Publish interface.
function canonicalPost(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('invalid_post_url'); }
  const match = url.pathname.match(/^\/([a-z0-9_]{1,15})\/status\/(\d{1,25})\/?$/i);
  if (url.protocol !== 'https:' || !['x.com', 'twitter.com'].includes(url.hostname) || url.username || url.password || url.port || !match) throw new Error('invalid_post_url');
  return `https://x.com/${match[1]}/status/${match[2]}`;
}

async function capturePublicPost(page, postUrl, onFrame = async () => {}) {
  const canonical = canonicalPost(postUrl);
  let payload = null;
  try {
    const response = await page.goto('https://publish.x.com/', {waitUntil:'domcontentloaded', timeout:18000});
    if (response && response.status() >= 400) throw new Error(`publish_http_${response.status()}`);
    await page.locator('#configuration-query').waitFor({state:'visible', timeout:7000});
    await onFrame('visit', '打开 X 公开帖子展示', page.url(), {source_url:canonical});
    await page.locator('#configuration-query').fill(canonical);
    await page.locator('#configuration-query').press('Enter');
    await page.getByText('Embedded Post', {exact:true}).waitFor({state:'visible', timeout:7000});
    const embedResponse = page.waitForResponse(r => {
      try {
        const url = new URL(r.url());
        return url.origin === 'https://publish.x.com' && url.pathname === '/oembed' && canonicalPost(url.searchParams.get('url')) === canonical;
      } catch { return false; }
    }, {timeout:18000}).catch(() => null);
    await page.getByText('Embedded Post', {exact:true}).click({timeout:7000});
    const official = await embedResponse;
    if (official?.ok()) { try { payload = await official.json(); } catch {} }
    await page.locator('.EmbedCode-code').waitFor({state:'visible', timeout:10000});
    const html = typeof payload?.html === 'string' ? payload.html : await page.locator('.EmbedCode-code').innerText();
    const post = await page.evaluate(({html, canonical}) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const quote = doc.querySelector('blockquote.twitter-tweet');
      const paragraph = quote?.querySelector('p');
      if (!paragraph) return null;
      paragraph.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
      const text = paragraph.textContent.trim();
      const date = [...quote.querySelectorAll('a[href]')].findLast(a => {
        try { return new URL(a.href).pathname === new URL(canonical).pathname; } catch { return false; }
      });
      const attribution = [...quote.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join(' ').trim().replace(/^[—–-]\s*/, '');
      const month = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const raw = date?.textContent.trim() || null;
      const match = raw?.match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
      const monthIndex = match ? month.indexOf(match[1]) : -1;
      return {text, author:attribution, published_raw:match && monthIndex >= 0 ? `${match[3]}-${String(monthIndex+1).padStart(2,'0')}-${match[2].padStart(2,'0')}` : raw, published_display:raw, published_at:null, incomplete:/(?:…|\.{3})\s*$/.test(text)};
    }, {html, canonical});
    if (!post?.text) throw new Error('embed_text_unavailable');

    let media = {images:[], references:[], incomplete:false};
    const deadline = Date.now() + 10000;
    let frame, scrolledFrame = false;
    while (Date.now() < deadline) {
      frame = page.frames().find(f => { try { const u=new URL(f.url()); return ['platform.twitter.com','platform.x.com'].includes(u.hostname) && u.pathname === '/embed/Tweet.html' && u.searchParams.get('id') === new URL(canonical).pathname.split('/').pop(); } catch { return false; } });
      if (frame && !scrolledFrame) {
        const postId = new URL(canonical).pathname.split('/').pop();
        await page.locator(`iframe[src*="/embed/Tweet.html"][src*="id=${postId}"]`).scrollIntoViewIfNeeded({timeout:2000}).catch(() => {});
        scrolledFrame = true;
      }
      if (frame && await frame.locator('body').innerText({timeout:1000}).then(text => text.includes(post.text.slice(0,40)) && text.includes('Follow')).catch(() => false)) break;
      await page.waitForTimeout(300);
    }
    if (frame) {
      await page.waitForTimeout(500);
      media = await frame.evaluate(({prefix}) => {
        const images=[], references=[];
        const visible=node => !!node.getClientRects().length;
        const primaryText=[...document.querySelectorAll('[data-testid="tweetText"]')].find(node=>node.innerText.startsWith(prefix));
        const primaryArticle=primaryText?.closest('article');
        for (const node of document.querySelectorAll('img,video[poster],[style*="background-image"]')) {
          if (!visible(node)) continue;
          if (!primaryArticle || node.closest('article') !== primaryArticle) continue;
          const value=node.tagName === 'VIDEO' ? node.poster : node.tagName === 'IMG' ? node.currentSrc || node.src : getComputedStyle(node).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
          let url; try {url=new URL(value);} catch {continue;}
          if(url.protocol!=='https:' || url.hostname!=='pbs.twimg.com' || !/^\/(?:media|card_img|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\//.test(url.pathname)) continue;
          if(images.some(image=>image.url===url.href)) continue;
          const preview=/video_thumb/.test(url.pathname)||node.tagName==='VIDEO';
          images.push({url:url.href,alt:node.alt||'',caption:preview?'视频预览图':url.pathname.startsWith('/card_img/')?'链接预览图':'',kind:'body'});
        }
        for(const a of document.querySelectorAll('a[href]')){
          if(!visible(a)) continue;
          const u=new URL(a.href);
          if(!['x.com','twitter.com'].includes(u.hostname)||!/^\/[a-z0-9_]{1,15}\/status\/\d+\/?$/i.test(u.pathname)) continue;
          const url='https://x.com'+u.pathname.replace(/\/$/,'');
          if(!references.some(r=>r.url===url)) references.push({url,label:a.innerText.trim(),kind:'x_post',relation:'embed_reference'});
        }
        return {images,references,incomplete:[...primaryText?.querySelectorAll('a,button')||[]].some(node=>visible(node)&&/^(?:show|read) more$/i.test(node.textContent.trim()))};
      },{prefix:post.text.slice(0,40)}).catch(() => media);
      const postId = new URL(canonical).pathname.split('/').pop();
      await page.locator(`iframe[src*="/embed/Tweet.html"][src*="id=${postId}"]`).scrollIntoViewIfNeeded({timeout:3000}).catch(() => {});
      await frame.evaluate(async () => {
        const decoding = Promise.allSettled([...document.images].map(image => image.decode()));
        await Promise.race([decoding, new Promise(resolve => setTimeout(resolve, 2500))]);
      }).catch(() => {});
    }
    await onFrame('extract', '已读取 X 公开帖文', page.url(), {source_url:canonical, counts:{characters:post.text.length,images:media.images.length},content_kind:'public_embed'});
    return {canonical_url:canonical,...post,author:post.author||payload?.author_name||new URL(canonical).pathname.split('/')[1],images:media.images,references:media.references.filter(row=>row.url!==canonical),completeness:'public_embed',incomplete:post.incomplete||media.incomplete,published_precision:'day'};
  } catch (error) {
    await onFrame('blocked', 'X 公开帖暂时无法读取', page.url(), {source_url:canonical,detail:String(error.message).split('\n')[0]});
    throw error;
  }
}

module.exports = {capturePublicPost, canonicalPost};
