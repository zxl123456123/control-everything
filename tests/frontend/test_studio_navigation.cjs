'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const window = {};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/project-progress-model.js'), 'utf8'), {window});
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-shell.js'), 'utf8'), {window});
const shell = window.StudioShell;
test('integrated Studio retains its single authority-backed theme control', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.css'), 'utf8');
  assert.doesNotMatch(css, /#ce-studio\[data-unified="true"\]\s+\[data-action="theme"\]\s*\{[^}]*display\s*:\s*none/);
  const source = fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.js'), 'utf8');
  assert.ok(source.includes('window.CEPlatformAppearance.requestTheme('), 'integrated theme keeps its existing authority');
});
const project = (id, archived = false) => ({id, name:id, archived, directories:[{id:'main',path:'C:/example/'+id}]});
function overview(options = {}) {
  return shell.renderOverview({projects:[project('one'),project('old',true)],items:[],query:'',attentionOnly:false,
    archivedOnly:false,sort:'name',viewMode:'cards',developmentUrl:id=>'#project/'+id+'/workspace',...options});
}
const ids = html => [...html.matchAll(/data-project-card="([^"]+)"/g)].map(match => match[1]);

test('cards and list share all registered records, and filters never change title destinations', () => {
  assert.deepEqual(ids(overview()), ['old','one']);
  assert.deepEqual(ids(overview({viewMode:'list'})), ['old','one']);
  assert.deepEqual(ids(overview({archivedOnly:true})), ['old']);
  assert.deepEqual(ids(overview({query:'ONE'})), ['one']);
  assert.match(overview(), /href="#project\/old\/workspace"/);
  assert.doesNotMatch(overview(), /ce-development-shortcut|data-action="add-project"/);
});

test('zero, all archived and unavailable projects reach the native workbench without an outer project form', () => {
  for (const projects of [[],[project('old',true)],[{...project('one'),binding_available:false}]]) {
    const html = overview({projects});
    assert.equal((html.match(/href="#workbench"/g) || []).length, 1);
    assert.doesNotMatch(html, /project-setup|项目配置|data-action="open-project-dialog"/);
  }
  const empty = overview({projects:[]});
  assert.match(empty, /还没有项目/); assert.doesNotMatch(empty, /studio-project-search|ce-summary-band/);
  assert.doesNotMatch(overview({projects:[project('one')]}), /href="#workbench"/);
  assert.match(overview({projects:[project('one')],runtimeAvailable:false}), /项目运行组件未连接/);
});

test('the sidebar offers settings and account management while advanced compatibility settings stay off routine navigation', () => {
  const html = shell.renderNavigation({current:{view:'settings',tab:'account'}, creatorLink:'<a href="http://127.0.0.1:8770/">游戏创作</a>'});
  assert.equal((html.match(/href="#home"/g) || []).length, 1);
  assert.doesNotMatch(html, /href="#project\/|href="#workspace"|ce-navdot/);
  assert.ok(html.includes('href="#settings/account"'));
  assert.ok(html.includes('href="#settings/appearance"'), 'the pet settings page is reachable from the bottom-left');
  assert.doesNotMatch(html, /settings-toggle|settings\/development|settings\/sources|来源与接入|高级接入/);
  assert.doesNotMatch(html, /<span class="ce-rail-label">管理<\/span>/);
  assert.doesNotMatch(html, /游戏创作|8770/);
  assert.equal((html.match(/href="#news"/g) || []).length, 1);
  assert.match(html, /href="#settings\/account" aria-current="page"/);
  const management = html.match(/<nav class="ce-navgroup" aria-label="管理">([^]*?)<\/nav>/)[1];
  const symbols = [...management.matchAll(/<svg[^>]*>([^]*?)<\/svg>/g)].map(match => match[1]);
  assert.equal(symbols.length, 2); assert.match(symbols[1], /circle/);
  assert.doesNotMatch(html, /href="#settings\/appearance"[^>]*aria-current/);
  assert.match(shell.renderNavigation({current:{view:'settings',tab:'appearance'}}), /href="#settings\/appearance" aria-current="page"/);
  assert.doesNotMatch(shell.renderNavigation({current:{view:'settings',tab:'sources'}}), /settings\/sources/);
  assert.equal(shell.renderProjectSetup, undefined);
});

test('overview facts use progress semantics and exclude records outside registered projects', () => {
  const html = overview({items:[
    {project_id:'one',state:'doing',progress:{native_run_id:'native',active_slot:0,observation_state:'working'}},
    {project_id:'one',state:'todo',assignment_state:'waiting_user'},
    {project_id:'one',state:'done',current_delivery_id:'delivery'},
    {project_id:'one',state:'doing'},
    {project_id:'missing',state:'review',current_delivery_id:'orphan-delivery'},
  ]});
  assert.match(html, /<dt>项目<\/dt><dd>2<\/dd>/);
  assert.match(html, /<dt>待处理<\/dt><dd>1<\/dd>/);
  assert.match(html, /<dt>有交付<\/dt><dd>1<\/dd>/);
  assert.match(html, /<span>1 推进中<\/span>/);
  assert.deepEqual(ids(overview({attentionOnly:true,items:[{project_id:'one',state:'todo',assignment_state:'waiting_user'}]})), ['one']);
});


test('advanced settings retains precise compatibility destinations without restoring a routine entry', () => {
  const html = shell.renderSettingsLanding({ section: 'sources', integrated: true, creatorForm:'<form data-creator-form="true">游戏创作地址</form>' });
  assert.equal((html.match(/data-action="external-access"/g) || []).length, 1);
  assert.match(html, /<h1>高级接入<\/h1>/);
  assert.match(html, /项目与会话导入/); assert.match(html, /事项 API 接入/);
  assert.doesNotMatch(html, /agent-form|兼容|命令|审批|项目来源|外部程序接入/);
  assert.match(html, /href="\/workspace-admin#settings"/); assert.doesNotMatch(html, /workspace-admin#projects/);
  assert.equal((html.match(/class="ce-setting-row"/g) || []).length, 2);
  assert.match(html, /aria-label="管理项目与会话导入">管理/);
  assert.match(html, /aria-label="管理事项 API 接入">管理/);
  assert.doesNotMatch(html, /<p\b|ce-tool-card|ce-access-setting/);
  assert.doesNotMatch(html, /游戏创作|data-creator-form/);
});
