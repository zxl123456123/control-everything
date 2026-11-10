'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const window = {};
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
  return shell.renderOverview({projects:[project('one'),project('old',true)],items:[],query:'',
    projectFilter:'active',sort:'name',viewMode:'cards',developmentUrl:id=>'#project/'+id+'/workspace',...options});
}
const ids = html => [...html.matchAll(/data-project-card="([^"]+)"/g)].map(match => match[1]);

test('normal is the default and explicit all and archived filters preserve title destinations', () => {
  assert.deepEqual(ids(overview()), ['one']);
  assert.deepEqual(ids(overview({viewMode:'list'})), ['one']);
  assert.deepEqual(ids(overview({projectFilter:'all'})), ['old','one']);
  assert.deepEqual(ids(overview({projectFilter:'archived'})), ['old']);
  assert.deepEqual(ids(overview({query:'ONE'})), ['one']);
  assert.match(overview({projectFilter:'all'}), /href="#project\/old\/workspace"/);
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
  const offline = overview({projects:[project('one')],runtimeAvailable:false});
  assert.match(offline, /项目运行组件未连接，暂时只能查看项目总览/);
  assert.doesNotMatch(offline, /href="#workbench"/, 'no call to action that leads nowhere while the runtime is down');
  assert.match(offline, /<section class="ce-setup-notice" role="status">/);
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

test('retired advanced settings has no management controls or destinations', () => {
  const html = shell.renderSettingsLanding({ section: 'sources', integrated: true, creatorForm:'<form data-creator-form="true">游戏创作地址</form>' });
  assert.doesNotMatch(html, /高级接入|项目与会话导入|事项 API|external-access|workspace-admin|游戏创作|data-creator-form/);
});

test('settings and account keep distinct icons and no shared switcher', () => {
  const html = shell.renderNavigation({current:{view:'home'}});
  assert.ok(html.includes('<circle cx="12" cy="12" r="3"/>'), 'settings uses a gear');
  assert.ok(!html.includes('M3 6h18M3 12h18'), 'the sliders glyph is gone');
  assert.ok(html.includes('<circle cx="12" cy="8" r="4"/>'), 'account uses a person');
  assert.equal(shell.renderSettingsTabs, undefined);
  assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.html'),'utf8'), /studio-settings-nav/);
});

test('overview does not expose task progress summaries or shortcuts', () => {
  const html = overview({items:[{project_id:'one',state:'review',current_delivery_id:'delivery'}]});
  assert.doesNotMatch(html, /待处理|有交付|待验收|进行中|ce-summary-band|\/review|\/attention/);
  assert.match(html, /href="#project\/one\/workspace"/);
});
