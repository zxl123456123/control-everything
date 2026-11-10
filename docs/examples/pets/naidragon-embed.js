/* Embedding example for the Nailong pet: floating 160px widget, full-page overlay and sidebar slot. No inline script, no eval.
 * The built-in action dial (setActions / opt-dial) is for stand-alone embeds only like this one: inside the Studio and the news reader the
 * host-level NewsPetWheel is the only dial, and those hosts mount the pet with dial:false and no actions. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const stage = $('nd-widget'), logEl = $('log');
  let pet = null, mode = 'widget', feed = null, clicks = 0;
  const log = text => { logEl.textContent += text + '\n'; logEl.scrollTop = logEl.scrollHeight; };
  const options = () => ({size: +$('opt-size').value, dock: $('opt-dock').value, margin: +$('opt-margin').value, status: $('opt-status').checked, dial: $('opt-dial').checked, theme: $('opt-theme').value});
  const actions = [
    {id: 'a', label: '打开任务', icon: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z', run: () => log('action: 打开任务')},
    {id: 'b', label: '搜索', icon: 'M10.5 3a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15z M16 16l5 5', run: () => log('action: 搜索')},
    {id: 'c', label: '下一条', icon: 'M5 12h14 M13 6l6 6-6 6', run: () => log('action: 下一条')},
  ];
  function place() {
    stage.className = 'nd-stage' + (mode === 'widget' ? '' : ' ' + mode);
    if (mode === 'slot') $('nd-slot').append(stage); else document.body.append(stage); // re-parenting while mounted is supported
    $('nd-slot').hidden = mode !== 'slot';
  }
  function mount() {
    if (pet) return;
    place();
    pet = window.NewsPets.mount('naidragon', {
      root: stage, canvas: $('nd-canvas'), depot: $('nd-depot'), actions, options: options(),
      onAction: id => log('onAction ' + id), onCapture: e => log('onCapture ' + (e && e.id || e)), onDelivered: e => log('onDelivered ' + (e && e.id || e)), onCancel: id => log('onCancel ' + id),
    });
    if (window.PetStatusFeed) feed = window.PetStatusFeed.start({apply: s => pet && pet.setStatus(s)});
    log('mounted: ' + mode);
  }
  function destroy() {
    if (feed) { feed.stop(); feed = null; }
    if (pet) { pet.destroy(); pet = null; log('destroyed'); }
  }
  const remount = () => { destroy(); mount(); };
  for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => {
    mode = b.dataset.mode;
    for (const x of document.querySelectorAll('[data-mode]')) x.setAttribute('aria-pressed', String(x === b));
    remount();
  });
  const apply = () => { if (pet) pet.setOptions(options()); $('out-size').textContent = $('opt-size').value; document.body.dataset.theme = $('opt-theme').value; };
  for (const id of ['opt-size', 'opt-dock', 'opt-margin', 'opt-theme', 'opt-status', 'opt-dial']) $(id).addEventListener('input', apply);
  $('btn-remount').addEventListener('click', remount);
  $('btn-destroy').addEventListener('click', destroy);
  const glExt = () => { for (const c of stage.querySelectorAll('canvas')) { const gl = c.getContext('webgl'); if (gl) return gl.getExtension('WEBGL_lose_context'); } return null; };
  $('btn-loss').addEventListener('click', () => { const e = glExt(); if (e) e.loseContext(); log('context lost → ' + (pet && pet.inspect().renderer)); });
  $('btn-restore').addEventListener('click', () => { const e = glExt(); if (e) e.restoreContext(); setTimeout(() => log('context restored → ' + (pet && pet.inspect().renderer)), 120); });
  $('host-click').addEventListener('click', () => { $('host-count').textContent = String(++clicks); });
  const boot = () => { if (window.NewsPets) { $('out-size').textContent = $('opt-size').value; mount(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
