// Real progress and collection-choice modules in Shadow DOM; all requests are synthetic.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../..');
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 10)); };

async function fixture(t) {
  const { Window } = await import(pathToFileURL(path.join(repo, 'web/workbench-engine/node_modules/happy-dom/lib/index.js')).href);
  const w = new Window({ url: 'http://fixture.test/studio' });
  const host = w.document.createElement('div'); w.document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' }), root = w.document.createElement('section'); shadow.append(root);
  for (const name of ['agents.js', 'project-progress-model.js', 'project-progress.js']) w.eval(fs.readFileSync(path.join(repo, 'web/workspace', name), 'utf8'));
  const items = [{ id: 'task-a', title: '坦克目标', project_id: 'p-a', state: 'todo' }, { id: 'task-b', title: '火柴人目标', project_id: 'p-b', state: 'todo' }];
  const snapshot = () => ({ workspace: { projects: { items: [{ id: 'p-a', name: '坦克游戏' }, { id: 'p-b', name: '火柴人游戏' }] } }, items });
  const posts = [];
  let failDetail = false;
  const api = w.ProjectProgress.create({ root,
    fetchJson: async url => {
      const id = url.split('/').at(url.endsWith('/progress') ? -2 : -1), item = items.find(row => row.id === id);
      if (url.endsWith('/progress')) {
        if (failDetail) throw new Error('synthetic detail unavailable');
        return { item, native_run: null, capabilities: { can_start: true }, messages: [] };
      }
      return { item, review_material: { sessions: [] } };
    },
    postJson: async (url, body) => { posts.push({ url, body }); const item = { id: 'task-new', state: 'todo', ...body }; items.push(item); return { item }; },
    onRefresh: async () => api.update(snapshot()),
  });
  t.after(() => { api.dispose(); w.happyDOM.abort(); w.close(); });
  await api.update(snapshot()); api.setProject('p-b'); await tick();
  const node = selector => { const value = shadow.querySelector(selector); assert.ok(value, selector); return value; };
  return { w, shadow, api, node, posts, snapshot, failDetail(value) { failDetail = value; } };
}

test('created details unlock after the write and catalog refresh complete', async t => {
  const f = await fixture(t);
  f.node('#pp-new').click(); const input = f.node('#pp-new-text'); input.value = '桌面开发目标'; input.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  [...f.node('#pp-new-dialog').querySelectorAll('button')].find(button => button.textContent === '保存事项').click();
  await tick();
  assert.equal(f.posts.length, 1); assert.equal(f.posts[0].body.project_id, 'p-b');
  assert.equal(f.node('#pp-detail').dataset.taskId, 'task-new');
  const refresh = () => [...f.node('#pp-detail').querySelectorAll('button')].find(button => button.textContent === '刷新详情');
  assert.equal(refresh().disabled, false);
  assert.equal(f.node('#pp-start').disabled, false);
  await f.api.update(f.snapshot());
  assert.equal(f.node('#pp-start').disabled, false, 'Identical polled facts must not relock details');
  f.failDetail(true); refresh().click(); await tick();
  assert.equal(f.node('#pp-start').disabled, true, 'Unavailable facts still lock business actions');
  assert.equal(refresh().disabled, false, 'A failed detail read remains retryable');
});

test('Shadow choice keeps a focused option through an unchanged poll and accepts its click', async t => {
  const f = await fixture(t), input = f.node('#pp-scope-query');
  input.focus(); input.click(); await tick();
  const option = [...f.shadow.querySelectorAll('[role="option"]')].find(row => row.textContent === '所有项目');
  assert.ok(option); option.dispatchEvent(new f.w.PointerEvent('pointerdown', { bubbles: true, composed: true })); option.focus();
  await f.api.update(f.snapshot()); await tick();
  assert.equal(option.isConnected, true, 'Polling must not detach the option between pointerdown and click');
  assert.equal(input.getAttribute('aria-expanded'), 'true', 'Focus inside the Shadow choice must keep it open');
  option.dispatchEvent(new f.w.PointerEvent('pointerup', { bubbles: true, composed: true })); option.click(); await tick();
  assert.equal(input.value, '所有项目'); assert.equal(f.node('#pp-scope').value, '');
  assert.equal(f.node('#pp-list').querySelectorAll('.pp-row').length, 2);
  assert.equal(input.getAttribute('aria-expanded'), 'false');
  await f.api.update(f.snapshot()); await tick();
  assert.equal(input.value, '所有项目');
});

test('a confirmed creation with failed initial details offers retry without enabling a write or repeating POST', async t => {
  const f = await fixture(t); f.failDetail(true);
  f.node('#pp-new').click(); const input = f.node('#pp-new-text'); input.value = '先保存目标'; input.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  [...f.node('#pp-new-dialog').querySelectorAll('button')].find(button => button.textContent === '保存事项').click(); await tick();
  assert.equal(f.posts.length, 1); assert.equal(f.node('#pp-new-dialog').open, false);
  assert.equal(f.shadow.querySelector('#pp-start'), null);
  const retry = [...f.node('#pp-detail').querySelectorAll('button')].find(button => button.textContent === '重试');
  assert.ok(retry); assert.equal(retry.disabled, false);
  f.failDetail(false); retry.click(); await tick();
  assert.equal(f.node('#pp-start').disabled, false); assert.equal(f.posts.length, 1);
});

test('Shadow mouse selection keeps focus on the combobox from mousedown through click', async t => {
  const f = await fixture(t), input = f.node('#pp-scope-query');
  input.focus(); input.click(); await tick();
  const option = [...f.shadow.querySelectorAll('[role="option"]')].find(row => row.textContent === '所有项目');
  option.dispatchEvent(new f.w.PointerEvent('pointerdown', { bubbles: true, composed: true, cancelable: true }));
  const down = new f.w.MouseEvent('mousedown', { bubbles: true, composed: true, cancelable: true, button: 0 });
  option.dispatchEvent(down);
  // happy-dom does not perform the browser's default mousedown focus action.
  if (!down.defaultPrevented) option.focus();
  await tick();
  assert.ok(f.shadow.activeElement === input, 'Listbox options must not steal DOM focus before click');
  assert.equal(input.getAttribute('aria-expanded'), 'true');
  option.dispatchEvent(new f.w.MouseEvent('mouseup', { bubbles: true, composed: true })); option.click(); await tick();
  assert.equal(input.value, '所有项目'); assert.equal(f.node('#pp-list').querySelectorAll('.pp-row').length, 2);
  assert.ok(f.shadow.activeElement === input); assert.equal(input.getAttribute('aria-expanded'), 'false');
});

test('an empty Shadow collection announces no options each time it reopens', async t => {
  const f = await fixture(t), select = f.w.document.createElement('select'); select.id = 'empty-choice'; f.shadow.append(select);
  const choice = f.w.WorkspaceAgents.attachCollectionChoice(select, '空集合'); t.after(() => choice.dispose());
  const input = f.node('#empty-choice-query'), status = select.nextElementSibling.querySelector('[role="status"]');
  for (let cycle = 0; cycle < 2; cycle++) {
    input.focus(); input.click();
    assert.equal(input.getAttribute('aria-expanded'), 'true'); assert.equal(status.hidden, false);
    assert.equal(status.textContent, '没有匹配的选项。'); assert.equal(input.hasAttribute('aria-activedescendant'), false);
    input.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(input.getAttribute('aria-expanded'), 'false'); assert.equal(status.hidden, true);
  }
});
