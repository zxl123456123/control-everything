// Lifecycle and responsive layout for the original office art. No data source or business writes.
'use strict';
window.WorkspaceMonitorScene = (() => {
  const MAX_AGENTS = 12, MAX_FLOWS = 12, FLIGHT_MS = 2400, TRAIL_MS = 5000;
  function layout(agents, width) {
    const cols = Math.max(29, Math.min(190, Math.floor(width / 7))), gap = 4;
    const cw = width / cols, ch = cw * 2.16, nodes = new Map();
    const nodeColumns = cols >= 80 ? 3 : 1, nodeW = Math.floor((cols - 4 - gap * (nodeColumns - 1)) / nodeColumns);
    ['$tasks', '$review', '$done'].forEach((id, i) => nodes.set(id, {
      id, kind: 'node', x: 2 + (i % nodeColumns) * (nodeW + gap), y: 3 + Math.floor(i / nodeColumns) * 8, w: nodeW, h: 5,
    }));
    const start = nodeColumns === 3 ? 12 : 28;
    const columns = Math.min(Math.max(1, agents.length), Math.max(1, Math.floor((cols - 4 + gap) / 38)));
    const cardW = Math.floor((cols - 4 - gap * (columns - 1)) / columns), cards = [];
    agents.slice(0, MAX_AGENTS).forEach((agent, i) => {
      const box = { id: agent.id, kind: 'agent', x: 2 + (i % columns) * (cardW + gap), y: start + Math.floor(i / columns) * 18, w: cardW, h: 14 };
      cards.push(box); nodes.set(agent.id, box);
    });
    const rows = start + Math.max(1, Math.ceil(cards.length / columns)) * 18;
    return { cols, rows, width, height: Math.ceil(rows * ch), cw, ch, cards, nodes };
  }
  function route(art, from, to) {
    const anchor = box => {
      const x = box.x + Math.floor(box.w / 2), y = box.kind === 'node' ? box.y + box.h : box.y - 1;
      return { x, y, bus: y + (box.kind === 'node' ? 1 : -1), inside: [x, y + (box.kind === 'node' ? -1 : 1)] };
    };
    const a = anchor(from), b = anchor(to);
    return { pts: art.dedupe([...art.col(a.x, a.y, a.bus), ...art.run(a.x, 0, a.bus),
      ...art.col(0, a.bus, b.bus), ...art.run(0, b.x, b.bus), ...art.col(b.x, b.bus, b.y)]), prev: a.inside, next: b.inside };
  }
  function create({ canvas, onSelect = () => {} }) {
    const art = window.WorkspaceMonitorArt, ctx = canvas.getContext('2d', { alpha: false });
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let data = { agents: [], tasks: [], stale: false, notice: '' }, flights = [], merged = 0;
    let active = false, destroyed = false, timer = null, raf = null, observing = false, geometry = null, hitboxes = [];
    const seen = new Set();
    const visible = () => active && !destroyed && !document.hidden;
    const now = () => performance.now();
    function cancel() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    }
    function stop() {
      cancel(); flights = []; merged = 0;
      if (observing) { observer.disconnect(); observing = false; }
    }
    function measure() {
      const measured = canvas.parentElement?.getBoundingClientRect().width || canvas.getBoundingClientRect().width || 280;
      geometry = layout(data.agents, Math.max(1, measured));
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const pixelWidth = Math.ceil(geometry.width * ratio), pixelHeight = Math.ceil(geometry.height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth; canvas.height = pixelHeight;
        canvas.style.width = '100%'; canvas.style.height = `${geometry.height}px`;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.imageSmoothingEnabled = false;
    }
    function paint(c) {
      const { cw, ch, width, height } = geometry;
      const style = getComputedStyle(canvas), palette = new Map();
      if (style.getPropertyValue('--monitor-bg').trim()) {
        // Recolor the original cell art at paint time; identities and animation stay intact.
        const colors = { bg: style.getPropertyValue('--monitor-bg').trim(), panel: style.getPropertyValue('--monitor-panel').trim(),
          ink: style.getPropertyValue('--monitor-ink').trim(), soft: style.getPropertyValue('--monitor-soft').trim() };
        if (style.colorScheme === 'light') Object.assign(colors, { faint: '#64748b', line: '#cbd5e1',
          manager: '#9a4c16', jevA: '#7544bd', jevB: '#aa2869', sol: '#285e9c', working: '#267342',
          waiting: '#94600f', done: '#176b78', unknown: '#7544bd', idle: '#64748b', error: '#94600f' });
        for (const [key, value] of Object.entries(colors)) palette.set(art.P[key], value);
      }
      const color = value => palette.get(value) || value;
      // Full clears prevent old glyphs surviving fractional cell edges.
      ctx.fillStyle = color(art.P.bg); ctx.fillRect(0, 0, width, height);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      let lastFont = '';
      for (let y = 0; y < c.rows; y++) {
        for (let x = 0; x < c.cols; x++) { ctx.fillStyle = color(c.cells[y][x].bg); ctx.fillRect(x * cw, y * ch, cw + 0.25, ch + 0.25); }
        for (let x = 0; x < c.cols; x++) {
          const cell = c.cells[y][x]; if (!cell.ch || cell.ch === ' ') continue;
          const px = x * cw, py = y * ch, cp = cell.ch.codePointAt(0);
          ctx.fillStyle = color(cell.fg);
          if (cp === 0x2580) { ctx.fillRect(px, py, cw, ch / 2); continue; }
          if (cp >= 0x2581 && cp <= 0x2588) { const h = ch * (cp - 0x2580) / 8; ctx.fillRect(px, py + ch - h, cw, h); continue; }
          const font = `${cell.bold ? 600 : 400} ${cw * 1.83}px "Cascadia Mono", Consolas, "Liberation Mono", "Microsoft YaHei", monospace`;
          if (font !== lastFont) { ctx.font = font; lastFont = font; }
          ctx.fillText(cell.ch, px, py + ch / 2 + 0.25, cw * art.width(cell.ch));
        }
      }
    }
    function render() {
      if (!visible()) return;
      const time = now(), animate = !motion.matches && !data.stale;
      flights = flights.filter(flow => time < flow.startedAt + FLIGHT_MS + TRAIL_MS && geometry.nodes.has(flow.from) && geometry.nodes.has(flow.to));
      const c = art.grid(geometry.cols, geometry.rows), { P } = art;
      hitboxes = [];
      c.fillRect(0, 0, c.cols, 1, P.panel);
      c.put(1, 0, ` 项目协作 · ${data.agents.length} 个实例 `, P.bg, { bg: P.sol, bold: true, limit: c.cols - 2 });
      const taskNode = geometry.nodes.get('$tasks');
      art.nodeBox(c, taskNode, '项目事项', `本页 ${data.tasks.length} 项`, P.manager);
      data.tasks.slice(0, 2).forEach((task, i) => {
        c.put(taskNode.x + 2, taskNode.y + 2 + i, task.title, P.ink, { bg: P.panel, limit: taskNode.w - 4 });
        hitboxes.push({ kind: 'task', id: task.id, x: taskNode.x + 1, y: taskNode.y + 2 + i, w: taskNode.w - 2, h: 1 });
      });
      art.nodeBox(c, geometry.nodes.get('$review'), '人工验收', '提交不等于验收通过', P.jevA);
      art.nodeBox(c, geometry.nodes.get('$done'), '验收结果', '依据人工验收记录', P.done);
      for (const box of geometry.cards) {
        art.drawRoute(c, route(art, taskNode, box), P.line);
        const agent = data.agents.find(value => value.id === box.id);
        const status = data.stale ? 'unknown' : agent.status;
        const frame = animate && ['working', 'waiting'].includes(status) ? Math.floor(time / 320) : 0;
        art.card(c, { ...agent, status, stateLabel: data.stale ? '活动未知' : agent.stateLabel }, box, frame, data.selectedId === agent.id);
        hitboxes.push({ ...box, kind: 'agent' });
      }
      if (!geometry.cards.length) c.put(2, geometry.rows - 6, '本页尚无可展示的 Agent 实例', P.soft, { limit: c.cols - 4 });
      for (const flow of flights) {
        const age = time - flow.startedAt, path = route(art, geometry.nodes.get(flow.from), geometry.nodes.get(flow.to));
        const tint = flow.to === '$review' ? P.jevA : flow.to === '$done' ? P.done : P.manager;
        const fade = Math.max(0, (age - FLIGHT_MS - 3000) / 2000);
        art.drawRoute(c, path, art.mix(tint, P.line, fade));
        if (age <= FLIGHT_MS) hitboxes.push({ ...art.flight(c, path, age / FLIGHT_MS, flow.label, tint), kind: 'task', id: flow.taskId });
      }
      const notices = [data.stale ? '来源陈旧 · 活动未知' : data.notice, data.hiddenAgents ? `另有 ${data.hiddenAgents} 个实例，请在列表翻页` : '', merged ? `${merged} 条流转已合并展示，详情保留原记录` : ''].filter(Boolean);
      c.put(1, c.rows - 1, notices.join(' · ') || '选择工位或任务块，查看下方记录', P.soft, { limit: c.cols - 2 });
      canvas.setAttribute('aria-label', `项目协作，${data.agents.length} 个实例。${notices.join('。')}。完整记录与选择入口见下方列表。`);
      paint(c);
    }
    function schedule() {
      cancel();
      if (!visible() || motion.matches || data.stale) return;
      const time = now(), moving = flights.some(flow => time < flow.startedAt + FLIGHT_MS);
      const people = data.agents.some(agent => ['working', 'waiting'].includes(agent.status));
      if (!moving && !people && !flights.length) return;
      const delay = moving ? 40 : 320;
      timer = setTimeout(() => {
        timer = null;
        if (!visible()) return;
        raf = requestAnimationFrame(() => { raf = null; render(); schedule(); });
      }, delay);
    }
    function refresh() { if (visible()) { measure(); render(); schedule(); } }
    const themeObserver = new MutationObserver(refresh);
    const themeRoot = canvas.closest('#ce-studio');
    if (themeRoot) themeObserver.observe(themeRoot, { attributes: true, attributeFilter: ['data-theme'] });
    const observer = new ResizeObserver(() => {
      if (!visible()) return;
      const measured = canvas.parentElement?.getBoundingClientRect().width || canvas.getBoundingClientRect().width;
      if (measured && measured !== geometry?.width) refresh();
    });
    function resume() {
      if (!visible()) { stop(); return; }
      if (!observing) { observer.observe(canvas.parentElement || canvas); observing = true; }
      refresh();
    }
    function onVisibility() { if (document.hidden) stop(); else resume(); }
    function onMotion() { flights = []; merged = 0; refresh(); }
    function onClick(event) {
      if (!visible() || !geometry) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (event.clientX - rect.left) * geometry.cols / rect.width;
      const y = (event.clientY - rect.top) * geometry.height / rect.height / geometry.ch;
      const hit = [...hitboxes].reverse().find(box => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h);
      if (hit) onSelect({ kind: hit.kind, id: hit.id });
    }
    document.addEventListener('visibilitychange', onVisibility);
    motion.addEventListener('change', onMotion);
    canvas.addEventListener('click', onClick);
    return {
      update(value) {
        if (destroyed) return;
        const agents = Array.isArray(value.agents) ? value.agents : [], incoming = Array.isArray(value.flows) ? value.flows : [];
        data = { ...value, agents: agents.slice(0, MAX_AGENTS), tasks: value.tasks || [], hiddenAgents: Math.max(0, agents.length - MAX_AGENTS) };
        const ids = new Set(data.agents.map(agent => agent.id));
        const endpoint = id => ids.has(id) || ['$tasks', '$review', '$done'].includes(id);
        if (data.stale || !visible() || motion.matches) flights = [];
        flights = flights.filter(flow => endpoint(flow.from) && endpoint(flow.to));
        const time = now();
        for (const flow of incoming) {
          if (!flow.id || seen.has(flow.id)) continue;
          seen.add(flow.id); if (seen.size > 512) seen.delete(seen.values().next().value);
          if (data.stale || !visible() || motion.matches || !endpoint(flow.from) || !endpoint(flow.to) || flow.from === flow.to) continue;
          if (flights.length >= MAX_FLOWS) { merged++; continue; }
          flights.push({ ...flow, startedAt: time });
        }
        refresh();
      },
      setActive(value) {
        if (destroyed) return;
        if (active === Boolean(value)) return;
        active = Boolean(value);
        if (active) resume(); else stop();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true; stop(); seen.clear(); hitboxes = [];
        themeObserver.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        motion.removeEventListener('change', onMotion);
        canvas.removeEventListener('click', onClick);
      },
    };
  }
  return { create, layout };
})();
