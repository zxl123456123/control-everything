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

test('zero, all archived and known unavailable projects reach one secondary configuration entry', () => {
  for (const projects of [[],[project('old',true)],[{...project('one'),binding_available:false}]]) {
    const html = overview({projects});
    assert.equal((html.match(/href="#project-setup"/g) || []).length, 1);
    assert.doesNotMatch(html, /data-action="open-project-dialog"/);
  }
  assert.doesNotMatch(overview({projects:[project('one')]}), /href="#project-setup"/);
  assert.match(overview({projects:[project('one')],runtimeAvailable:false}), /href="#project-setup"/);
});

test('the main sidebar has one project destination and four distinct settings entries', () => {
  const html = shell.renderNavigation({current:{view:'settings',tab:'development'},settingsOpen:true});
  assert.equal((html.match(/href="#home"/g) || []).length, 1);
  assert.doesNotMatch(html, /href="#project\/|href="#workspace"|ce-navdot/);
  for (const section of ['appearance','account','sources','development']) assert.ok(html.includes('href="#settings/'+section+'"'));
  assert.match(html, /href="#settings\/development" aria-current="page"/);
});

test('registration results show only confirmed projects and a read failure offers reread without recreation', () => {
  const html = shell.renderProjectSetup({result:{projects:[project('one'),project('two')],failedCount:1}});
  assert.match(html, /href="#project\/one\/workspace"/); assert.match(html, /href="#project\/two\/workspace"/);
  assert.doesNotMatch(html, /data-project-card|项目总览<\/h1>/);
  const failed = shell.renderProjectSetup({result:{error:true,projects:[]}});
  assert.match(failed, /data-action="retry-registration"/); assert.match(failed, /无需再次创建/);
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


test('source settings exposes optional external access without a second agent setup form', () => {
  const html = shell.renderSettingsLanding({ section: 'sources', integrated: true });
  assert.equal((html.match(/data-action="external-access"/g) || []).length, 1);
  assert.match(html, /外部程序接入/); assert.doesNotMatch(html, /agent-form|兼容|命令|审批/);
});
