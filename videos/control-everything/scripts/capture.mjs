// Capture committed product UI with deterministic, synthetic API responses.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const project = path.resolve(import.meta.dirname, '..');
const repo = path.resolve(project, '../..');
const revision = execFileSync('git', ['rev-parse', process.argv[2] || 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
const resources = {
  'index.html': 'sessions/index.html', 'app.js': 'sessions/app.js', 'style.css': 'sessions/style.css',
  'workspace.html': 'workspace/workspace.html', 'workspace.js': 'workspace/workspace.js',
  'workspace.css': 'workspace/workspace.css', 'execution.js': 'workspace/execution.js',
};
const source = name => {
  if (!Object.hasOwn(resources, name)) throw new Error(`Unknown capture resource: ${name}`);
  return execFileSync('git', ['show', `${revision}:web/${resources[name]}`], { cwd: repo });
};
const out = path.join(project, 'assets/screens'); fs.mkdirSync(out, { recursive: true });
const now = '2026-10-15T05:00:00Z';
const uid = n => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const projects = [
  { id: 'panel', name: 'Control Everything', state: '在做', percent: 72, note: '打磨清晰、实用的开发工作台' },
  { id: 'docs', name: '知识库与文档', state: '在做', percent: 45, note: '整理资料，让上下文可以复用' },
  { id: 'tools', name: '开发工具集', state: '等我', percent: null, note: '等待下一轮需求确认' },
].map(p => ({ ...p, manual_recorded: p.percent !== null, manual_reason: p.percent === null ? 'not_recorded' : null, records_available: true, records: [], sessions: [] }));
const tasks = [
  ['更新仓库介绍与演示视频', 'panel', 'codex', 'doing'],
  ['检查会话列表与消息分页', 'panel', 'claude', 'review'],
  ['整理开发进度与交付记录', 'docs', 'codex', 'todo'],
  ['精简无用展示，保留核心功能', 'panel', 'codex', 'done'],
].map((t,i) => ({ id: uid(i+10), title:t[0], project_id:t[1], provider_id:t[2], state:t[3], session_key:null, session_link_state:'not_linked', source:'manual', created_at:now, updated_at:now }));
const providers = [['codex','Codex'],['claude','Claude Code'],['opencode','OpenCode']].map(([id,name]) => ({ id,name, discovery:{status:'found',commands:[id],reason:null}, capabilities:{observe_sessions:id!=='opencode',open_existing_ui:true,dispatch:false,cancel:false,approve:false,read_quota:id==='codex'}, observation_note:'命令发现、会话观察与执行能力独立核验',entrypoints:[{label:'查看会话',href:'/'}] }));
const sessions = { available:true,reason:null,source:'codex_local',sampled_at:now,items:[{thread_id:uid(20),session_key:`codex:${uid(20)}`,cwd:'E:/demo/control-everything',source_kind:'cli',created_at:now,updated_at:now,archived:false,activity_state:'unknown',task_completion:'unknown'}],offset:0,limit:12,total_visible:1,next_offset:null,coverage:{total_count:1,archived_count:0,excluded_subagent_count:0,excluded_other_source_count:0} };
const snapshot = {status:'ok',sampled_at:now,today:'2026-10-15',projects:{status:'available',reason:null,items:projects},tasks:{status:'available',reason:null,total:tasks.length,limit:500,items:tasks},todos:{status:'available',reason:null,items:[{id:'one',text:'确认今天最重要的一件事',project_id:'panel',done:false},{id:'two',text:'把交付结果写进仓库',project_id:'docs',done:true}]},providers,sessions,entrypoints:[]};
const usage = {status:'ok',codex:{status:'not_checked',source:'codex_app_server',sampled_at:null,last_success_at:null,reason:null,error_code:null,buckets:[]},manual_records:[],manual_status:'available',manual_reason:null,manual_total:0,manual_limit:100};
const news = {status:'ok',sampled_at:now,items:[{id:'reading',source_id:'openai',source_name:'OpenAI News',title:'从官方来源阅读 AI 动态',url:'https://openai.com/news/',published_at:now,fetched_at:now}],sources:[{id:'openai',name:'OpenAI News',status:'available',reason:null,sampled_at:now,last_success_at:now,item_count:1}]};
const errors=[],requests=[];
const browser=await chromium.launch(process.env.DEMO_BROWSER ? {channel:process.env.DEMO_BROWSER,headless:true} : {headless:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const req=route.request(), u=new URL(req.url());
    if(u.origin!=='http://demo.local') throw new Error(`External request blocked: ${u.origin}`);
    requests.push({path:u.pathname,method:req.method()});
    if(req.method()!=='GET') throw new Error('Capture never writes data');
    const staticName={'/workspace':'workspace.html','/':'index.html'}[u.pathname] || u.pathname.slice(1);
    if(/\.(html|css|js)$/.test(staticName)) return route.fulfill({body:source(staticName),contentType:staticName.endsWith('.css')?'text/css':staticName.endsWith('.js')?'text/javascript':'text/html'});
    const payload={'/api/bootstrap':{csrf_token:'demo-only'},'/api/workspace':snapshot,'/api/workspace/usage':usage,'/api/workspace/news':news,'/api/codex/threads':sessions,'/api/sessions':{sessions:[],source:{user:'demo',host:'example.invalid',config_dir:'/demo'},coverage:{registration_count:0,process_count:0,confirmed_binding_count:0},observed_at:now,age_ms:0,status:'observed'},'/api/workbench':{status:'unknown',reason:'workbench_unavailable'}}[u.pathname];
    if(payload) return route.fulfill({json:payload});
    return route.fulfill({status:503,json:{status:'unavailable',reason:'demo_read_only'}});
  });
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://demo.local/workspace'); await page.locator('#projects-list article').first().waitFor();
  for(const view of ['overview','tasks','agents','usage','news']){
    await page.locator(`[data-view="${view}"]`).click(); await page.waitForTimeout(150);
    await page.screenshot({path:path.join(out,`${view}.png`)});
  }
  await page.goto('http://demo.local/'); await page.locator('#codex-list button').first().click();
  await page.screenshot({path:path.join(out,'sessions.png'),fullPage:true});
  if(errors.length) throw new Error(errors.join('\n'));
  fs.writeFileSync(path.join(project,'capture-manifest.json'),JSON.stringify({revision,synthetic:true,productionRequests:0,viewport:{width:1440,height:900},screens:['overview','tasks','agents','usage','news','sessions'],requests},null,2)+'\n');
  console.log(`Captured 6 actual UI views from ${revision}; synthetic data only.`);
} finally { await browser.close(); }
