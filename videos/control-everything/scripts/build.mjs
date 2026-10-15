// Assemble real narration timing, authored scenes and a single caption track.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const content=JSON.parse(fs.readFileSync(path.join(root,'content.json'),'utf8'));
const voice=JSON.parse(fs.readFileSync(path.join(root,'voice.json'),'utf8'));
const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const timing={}, clips=[]; let start=0;
content.chapters.forEach((chapter,index)=>{
  let local=.8; const cues=[];
  const lines=voice.clips.filter(c=>c.chapter===chapter.id);
  if(lines.length!==chapter.lines.length) throw new Error(`Regenerate voice for ${chapter.id}`);
  lines.forEach((line,i)=>{
    if(line.text!==chapter.lines[i]) throw new Error(`Narration is stale: ${chapter.id}`);
    cues.push(local); clips.push({...line,start:start+local}); local+=line.duration+.25;
  });
  const duration=local-.25+(index===content.chapters.length-1?2.6:1);
  timing[chapter.id]={start,duration:Number(duration.toFixed(3)),cues}; start+=duration;
});
const duration=Number(start.toFixed(3));
const sceneId=id=>id.replace(/^\d+-/,'scene-');
const runtimeTiming=Object.fromEntries(Object.entries(timing).map(([id,value])=>[sceneId(id),value]));
const scenes=content.chapters.map((chapter,index)=>{
  const t=timing[chapter.id],src=`compositions/frames/${chapter.id}.html`,file=path.join(root,src);
  if(!fs.existsSync(file)) throw new Error(`Missing authored frame ${src}`);
  let html=fs.readFileSync(file,'utf8');
  const tag=html.match(/<div[^>]*data-composition-id=[^>]+>/)?.[0];
  const previous=tag?.match(/data-duration="([\d.]+)"/)?.[1];
  if(previous) html=html.replaceAll(`data-duration="${previous}"`,`data-duration="${t.duration}"`);
  fs.writeFileSync(file,html);
  return `<div id="${sceneId(chapter.id)}" class="clip scene" data-composition-id="${sceneId(chapter.id)}" data-composition-src="${src}" data-start="${t.start.toFixed(3)}" data-duration="${t.duration}" data-track-index="${index+1}" data-width="1920" data-height="1080"></div>`;
}).join('\n');
const audio=clips.map((c,i)=>`<audio id="voice-${i}" src="${c.path}" data-start="${c.start.toFixed(3)}" data-duration="${c.duration}" data-track-index="10" data-volume="1"></audio>`).join('\n');
const captions=clips.map((c,i)=>`<div id="caption-${i}" class="clip caption" data-start="${c.start.toFixed(3)}" data-duration="${(c.duration+.12).toFixed(3)}" data-track-index="20" data-layout-allow-caption-zone><span>${esc(c.text)}</span></div>`).join('\n');
fs.writeFileSync(path.join(root,'index.html'),`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(content.title)} · 仓库介绍</title>
<script src="assets/gsap.min.js"></script><script>window.videoData=${JSON.stringify(runtimeTiming)};</script>
<style>
@font-face{font-family:'Demo Sans';src:url('assets/fonts/DemoSans-Regular.woff2') format('woff2');font-weight:400}
@font-face{font-family:'Demo Sans';src:url('assets/fonts/DemoSans-Bold.woff2') format('woff2');font-weight:600 900}
*{box-sizing:border-box}body{margin:0;background:#0B1220;color:#EDF4FA;font-family:'Demo Sans',sans-serif}#root{position:relative;width:100%;height:100%;overflow:hidden;background:#0B1220}.scene{position:absolute;inset:0}.chrome{position:absolute;inset:0;pointer-events:none;z-index:100}.brand{position:absolute;left:96px;top:48px;font-size:26px;font-weight:700;letter-spacing:.8px}.brand span{color:#75DFCE}.badge{position:absolute;right:96px;top:48px;font-size:22px;color:#AEC0D0}.header-line{position:absolute;left:96px;right:96px;top:105px;height:1px;background:#314457}.caption{position:absolute;left:80px;right:80px;top:931px;height:77px;display:flex;align-items:center;justify-content:center;z-index:120;font-size:34px;line-height:1.4;text-align:center}.caption span{padding:12px 28px;background:#142233;border-radius:10px;border:1px solid #314457}.progress-track{position:absolute;left:96px;right:96px;bottom:35px;height:3px;background:#314457}.progress{height:100%;background:#75DFCE;transform-origin:left}.edition{position:absolute;left:96px;bottom:51px;color:#AEC0D0;font-size:17px}
</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="1920" data-height="1080">
${scenes}
<div id="film-chrome" class="clip chrome" data-start="0" data-duration="${duration}" data-track-index="19"><div class="brand">Control <span>Everything</span></div><div class="badge">真实界面 · 演示数据</div><div class="header-line"></div><div class="edition">${esc(content.version)}</div><div class="progress-track"><div id="film-progress" class="progress"></div></div></div>
${audio}
${captions}
</div><script>const mainTimeline=gsap.timeline({paused:true});mainTimeline.fromTo('#film-progress',{scaleX:0},{scaleX:1,duration:${duration},ease:'none'},0);window.__timelines['main']=mainTimeline;</script></body></html>`);
fs.writeFileSync(path.join(root,'timing.json'),JSON.stringify({duration,chapters:timing,clips},null,2)+'\n');
const srtTime=s=>new Date(Math.round(s*1000)).toISOString().slice(11,23).replace('.',',');
fs.writeFileSync(path.join(root,'intro.zh-CN.srt'),clips.map((c,i)=>`${i+1}\n${srtTime(c.start)} --> ${srtTime(c.start+c.duration)}\n${c.text}\n`).join('\n'));
console.log(`Built ${content.chapters.length} chapters / ${clips.length} measured voice+caption clips / ${duration}s`);
