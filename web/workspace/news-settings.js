/* Profile settings, reversible display rules and honest runtime labels. */
'use strict';
(function () {
  const clone = value => JSON.parse(JSON.stringify(value));
  const fold = value => String(value || '').normalize('NFKC').toLocaleLowerCase();
  function matches(item, settings, view = 'inbox') {
    if (!settings || view !== 'inbox') return true;
    const source = settings.sources.find(source => source.id === item.source_id);
    if (source && !source.enabled) return false;
    if (settings.view.source_id && settings.view.source_id !== item.source_id) return false;
    if (settings.view.group && source?.group !== settings.view.group) return false;
    const text = fold([item.title, item.summary, ...(item.body_blocks || []).map(block => block.text)].join(' '));
    return (!source?.include.length || source.include.some(word => text.includes(fold(word)))) && !source?.exclude.some(word => text.includes(fold(word)));
  }
  function validateDraft(draft) {
    if (draft.sources.length > 24) throw new Error('最多保存24个来源。');
    for (const source of draft.sources) {
      if (!source.name.trim() || source.name.length > 80) throw new Error('来源名称须为1至80字。');
      if (source.group.length > 40) throw new Error('分组名称最多40字。');
      if (source.kind === 'rss') { let url; try { url = new URL(source.url); } catch {} if (!url || url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('请输入公开HTTPS RSS/Atom地址。'); }
      for (const words of [source.include, source.exclude]) if (words.length > 20 || words.some(word => !word.trim() || word.length > 80)) throw new Error('关键词最多20个，每个1至80字。');
    }
    const plan = draft.schedule;
    try { new Intl.DateTimeFormat('en', {timeZone:plan.timezone}).format(); } catch { throw new Error('请输入有效时区，例如Asia/Shanghai。'); }
    if (plan.enabled && plan.mode === 'interval' && (!Number.isInteger(plan.interval_minutes) || plan.interval_minutes < 15 || plan.interval_minutes > 10080)) throw new Error('更新间隔须为15至10080分钟。');
    if (plan.enabled && plan.mode === 'daily' && (!plan.times.length || plan.times.length > 8 || new Set(plan.times).size !== plan.times.length || plan.times.some(time => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)))) throw new Error('请选择1至8个不同的每日时刻（HH:MM）。');
    if (plan.browser.enabled && (!['coding','agents','claude','models','tibo'].includes(plan.browser.topic) || !plan.browser.query.trim() || plan.browser.query.length > 240)) throw new Error('纳入浏览采集须明确选择主题并填写关键词。');
    return draft;
  }
  function runtimeText(runtime, settings) {
    if (!runtime) return '更新状态暂不可用';
    if (runtime.owner === 'owner_elsewhere') return '另一服务正在管理更新，本页只读';
    if (runtime.owner === 'blocked' || runtime.state === 'blocked') return '更新受限：' + (runtime.reason || '请检查服务');
    if (runtime.state === 'running') return settings?.schedule.enabled ? '正在更新' : '计划已关闭，当前采集收尾中';
    if (runtime.pending_due) return '等待当前采集结束后更新';
    if (!settings?.schedule.enabled) return '定时更新未启用';
    if (runtime.result === 'failed' || runtime.result === 'partial' || runtime.result === 'interrupted') return ({failed:'上次更新失败',partial:'上次更新部分失败',interrupted:'上次更新已中断'}[runtime.result]) + (runtime.reason ? '：' + runtime.reason : '');
    return runtime.next_run_at ? '下次更新：' + new Date(runtime.next_run_at).toLocaleString('zh-CN', {timeZone:settings.schedule.timezone}) + ' · ' + settings.schedule.timezone : '等待服务计算下次更新';
  }
  function mount(root, {request, onSettings = () => {}}) {
    const document = root.ownerDocument, dialog = document.createElement('dialog'); dialog.className = 'news-settings-dialog'; dialog.setAttribute('aria-label', '来源与更新'); root.append(dialog);
    let current, draft, runtime, destroyed = false, saving = false;
    const make = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
    function field(parent, title, value, change, type = 'text') {
      const label = make('label', title), input = make('input'); input.type = type;
      if (type === 'checkbox') input.checked = !!value; else input.value = value ?? '';
      input.addEventListener('input', () => change(type === 'checkbox' ? input.checked : input.value)); label.append(input); parent.append(label); return input;
    }
    function render() {
      if (!draft) return;
      dialog.replaceChildren(); dialog.append(make('h2', '来源与更新'));
      const status = make('p', runtimeText(runtime, current)); status.setAttribute('role','status'); dialog.append(status);
      if(runtime?.last_attempt_at) {const last=make('details');last.append(make('summary','上次更新'),make('p',new Date(runtime.last_attempt_at).toLocaleString('zh-CN',{timeZone:current.schedule.timezone})+' · '+({success:'成功',partial:'部分失败',failed:'失败',skipped:'未执行',interrupted:'已中断'}[runtime.result] || '状态待确认')));if(runtime.reason)last.append(make('p',runtime.reason));dialog.append(last);}
      const sources = make('section'); sources.append(make('h3','新闻来源'));
      const groups = new Map();
      for (const source of draft.sources) {
        const group = make('details'); group.open = !source.id; group.append(make('summary', source.name || '新增来源'));
        field(group,'启用来源',source.enabled,value => {source.enabled=value;},'checkbox');
        field(group,'名称',source.name,value => {source.name=value;}); field(group,'分组',source.group,value => {source.group=value;});
        if (!source.id || source.id.startsWith('feed_')) field(group,'公开HTTPS RSS/Atom地址',source.url,value => {source.url=value;});
        field(group,'包含关键词（逗号分隔）',source.include.join(', '),value => {source.include=value.split(/[,，]/).map(word=>word.trim()).filter(Boolean);});
        field(group,'排除关键词（逗号分隔）',source.exclude.join(', '),value => {source.exclude=value.split(/[,，]/).map(word=>word.trim()).filter(Boolean);});
        const name=source.group || '未分组';
        if (!groups.has(name)) { const section=make('details'); section.open=true;section.append(make('summary',name));groups.set(name,section);sources.append(section); }
        groups.get(name).append(group);
      }
      const add = make('button','添加订阅'); add.type='button'; add.disabled=draft.sources.length>=24;
      add.onclick=()=>{draft.sources.push({id:null,kind:'rss',url:'',name:'',enabled:true,group:'',include:[],exclude:[]});render();}; sources.append(add,make('p','停用和筛选保留历史，已读、收藏和归档仍可找到。')); dialog.append(sources);
      const plan = make('section'); plan.append(make('h3','定时更新'));
      field(plan,'启用定时更新',draft.schedule.enabled,value=>{draft.schedule.enabled=value;},'checkbox');
      const mode = make('label','更新方式'), select=make('select');
      for (const [value,title] of [['interval','间隔频率'],['daily','每日时刻']]) { const option=make('option',title); option.value=value; select.append(option); }
      select.value=draft.schedule.mode; select.onchange=()=>{draft.schedule.mode=select.value;render();};mode.append(select);plan.append(mode);
      if(draft.schedule.mode==='interval') field(plan,'间隔分钟（15至10080）',draft.schedule.interval_minutes,value=>{draft.schedule.interval_minutes=value===''?null:Number(value);},'number');
      else field(plan,'每日时刻（HH:MM，逗号分隔）',draft.schedule.times.join(', '),value=>{draft.schedule.times=value.split(/[,，]/).map(time=>time.trim()).filter(Boolean);});
      field(plan,'时区',draft.schedule.timezone,value=>{draft.schedule.timezone=value;});
      field(plan,'将公开浏览采集纳入计划',draft.schedule.browser.enabled,value=>{draft.schedule.browser.enabled=value;render();},'checkbox');
      if(draft.schedule.browser.enabled){ const label=make('label','浏览主题'), topic=make('select'); for(const [value,title] of [['','请选择'],['coding','AI Coding'],['agents','Agent'],['claude','Claude Code'],['models','模型'],['tibo','Tibo']]) {const option=make('option',title);option.value=value;topic.append(option);}topic.value=draft.schedule.browser.topic||'';topic.onchange=()=>{draft.schedule.browser.topic=topic.value||null;};label.append(topic);plan.append(label);field(plan,'浏览关键词',draft.schedule.browser.query,value=>{draft.schedule.browser.query=value;});}
      plan.append(make('p','关闭网页后服务继续执行已启用计划；退出服务后停止。保存设置不会立即采集。'));dialog.append(plan);
      const error=make('p');error.setAttribute('role','alert');dialog.append(error);
      const footer=make('footer'), save=make('button','保存设置'), cancel=make('button','取消'), reload=make('button','重载服务配置');save.type=cancel.type=reload.type='button';
      save.disabled=saving;
      save.onclick=async()=>{
        if(destroyed || saving)return;
        try {
          validateDraft(draft); saving=true; save.disabled=true;
          const response=await request('/api/workspace/news/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_revision:draft.revision,sources:draft.sources,view:draft.view,schedule:draft.schedule})});
          if(destroyed)return;
          const value=await response.json();
          if(destroyed)return;
          if(response.status===409 && value.settings){current=value.settings;runtime=value.runtime;onSettings(value);}
          if(!response.ok)throw new Error(response.status===409?'设置已被其他页面修改。本地草稿已保留，请重载服务配置后合并。':value.message||value.error||'保存失败，草稿已保留。');
          current=value.settings;runtime=value.runtime;draft=clone(current);onSettings(value);dialog.close();
        } catch(failure) {if(!destroyed)error.textContent=failure.message;}
        finally {saving=false;if(!destroyed)save.disabled=false;}
      };
      cancel.onclick=()=>{if(!destroyed)dialog.close();};reload.onclick=()=>{if(!destroyed){draft=clone(current);render();}};footer.append(save,cancel,reload);dialog.append(footer);
    }
    return {open(){if(destroyed || !current)return;draft ||= clone(current);render();dialog.showModal();},setSnapshot(value){if(destroyed)return;current=value.settings;runtime=value.runtime;onSettings(value);},setRuntime(value){if(!destroyed)runtime=value;},destroy(){if(destroyed)return;destroyed=true;dialog.close();dialog.remove();}};
  }
  window.NewsSettings = {mount, matches, validateDraft, runtimeText};
})();
