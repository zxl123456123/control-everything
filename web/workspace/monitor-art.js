/*
 * Adapted from azir-dispatch/office at 44ae133dc27290de6bb0e11909b5b60dc2f8c708.
 * Source: https://github.com/JosssphZhou/azir-dispatch
 * Preserved: text cell widths, poses, identity colours, desk/monitor art,
 * orthogonal wire glyphs and moving task labels. Browser and business adapters
 * replace ANSI output, fixed model zones and the original dispatch state.
 *
 * MIT License
 *
 * Copyright (c) 2026 JosssphZhou
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * NOTICE
 * This directory contains Herdr Office, copied from https://github.com/michaellandi/herdr-office.
 * Upstream baseline commit: 12ca55cf4de63223c61d5025b62a09ed23547a4b.
 * The upstream MIT license and copyright notice are preserved in LICENSE.
 * azir-dispatch additions are identified in git history and are not part of the upstream work.
 * This browser extraction carries that complete license text below.
 *
 * MIT License
 *
 * Copyright (c) 2026 Mike Landi
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
'use strict';
window.WorkspaceMonitorArt = (() => {
  const P = {
    bg: '#12161e', panel: '#1a202b', ink: '#e6ebf5', soft: '#aab4c6', faint: '#6c7890', line: '#2e3848',
    manager: '#f0a66f', jevA: '#a77bff', jevB: '#ff6fb5', sol: '#6cb6ff', working: '#5ce08a',
    waiting: '#ffc14d', done: '#4fd6e8', unknown: '#c48bff', idle: '#8b97aa', error: '#ffc14d',
    desk: '#8a6a45', screen: '#0a0f18',
  };
  const STATUS = { working: '工作中', waiting: '等待处理', done: '已结束', idle: '空闲', unknown: '活动未知', error: '执行失败' };
  const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
  const WIDE_RANGES = [[0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
    [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe6f],
    [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1f9ff], [0x20000, 0x3fffd]];
  const clean = value => String(value ?? '').replace(ANSI, '').replace(/[\x00-\x1f\x7f]/g, ' ');
  function charWidth(cp) {
    if (cp === 0x200d || cp === 0xfe0f || (cp >= 0x0300 && cp <= 0x036f)) return 0;
    return WIDE_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi) ? 2 : 1;
  }
  function width(value) { return [...String(value).replace(ANSI, '')].reduce((sum, ch) => sum + charWidth(ch.codePointAt(0)), 0); }
  function truncate(value, max) {
    const text = clean(value);
    if (max <= 0) return '';
    if (width(text) <= max) return text;
    let out = '', used = 0;
    for (const ch of text) { const w = charWidth(ch.codePointAt(0)); if (used + w > max - 1) break; out += ch; used += w; }
    return out + '…';
  }
  function center(value, max) {
    const clipped = truncate(value, max), slack = Math.max(0, max - width(clipped)), left = Math.floor(slack / 2);
    return ' '.repeat(left) + clipped + ' '.repeat(slack - left);
  }
  const POSES = {
    working: { emote: 'skin', frames: [
      ['    ▄▄▄▄▄   ', '    (·_·)   ', '   ╭──┴──╮  ', '  ╱│ ███ │╲ '],
      ['    ▄▄▄▄▄   ', '    (·_·)   ', '   ╭──┴──╮  ', '  ╲│ ███ │╱ '],
      ['    ▄▄▄▄▄   ', '    (·_·)   ', '   ╭──┴──╮  ', '  ╱│ ███ │╲ '],
      ['    ▄▄▄▄▄   ', '    (·_·)   ', '   ╭──┴──╮  ', '  ╲│ ███ │╱ '],
      ['    ▄▄▄▄▄   ', '    (·_·)   ', '   ╭──┴──╮  ', '  ╱│ ███ │╲ '],
      ['    ▄▄▄▄▄   ', '    (·_·)   ', '   ╭──┴──╮  ', '  ╲│ ███ │╱ '],
      ['    ▄▄▄▄▄   ', '    (-_-)   ', '   ╭──┴──╮  ', '  ╱│ ███ │╲ '],
      ['    ▄▄▄▄▄   ', '    (·_·)   ', '   ╭──┴──╮  ', '  ╲│ ███ │╱ '],
    ] },
    blocked: { emote: 'skin', frames: [
      ['    ▄▄▄▄▄ o ', '    (°o°) │ ', '   ╭──┴───┘ ', '   │ ███ │  '],
      ['    ▄▄▄▄▄  o', '    (°o°) ╱ ', '   ╭──┴───┘ ', '   │ ███ │  '],
    ] },
    idle: { emote: 'status', frames: [
      ['    ▄▄▄▄▄ z ', '    (-_-)   ', '   ╭──┴──╮  ', '   │ ███ │  '],
      ['    ▄▄▄▄▄ zZ', '    (-_-)   ', '   ╭──┴──╮  ', '   │ ███ │  '],
    ] },
    done: { emote: 'skin', frames: [
      ['  o ▄▄▄▄▄ o ', '  │ (^_^) │ ', '  └───┬───┘ ', '   │ ███ │  '],
      ['  · ▄▄▄▄▄ · ', '  │ (^_^) │ ', '  └───┬───┘ ', '   │ ███ │  '],
    ] },
    unknown: { emote: 'status', frames: [
      ['    ▄▄▄▄▄ ? ', '    (o_O)   ', '  ╱╭──┴──╮╲ ', '   │ ███ │  '],
      ['    ▄▄▄▄▄  ?', '    (o_O)   ', '  ╱╭──┴──╮╲ ', '   │ ███ │  '],
    ] },
  };
  const pose = (status, frame) => { const p = POSES[status] || POSES.unknown; return { rows: p.frames[frame % p.frames.length], emote: p.emote }; };
  const CHUG = '▁▂▃▄▅▆▇▆▅▄▃▂';
  function runningScreen(label, frame) { const shift = (frame * 3) % CHUG.length; return [center(label, 12), CHUG.slice(shift) + CHUG.slice(0, shift)]; }
  const SHIRTS = ['#e06c75', '#61afef', '#98c379', '#e5c07b', '#c678dd', '#56b6c2', '#d19a66', '#7f9ff5', '#e39ec1', '#84cc8f'];
  const HAIR = ['#2e2620', '#4a3220', '#7a5c3a', '#26303e', '#5c3a2a', '#171c24', '#8a7f6a'];
  const SKIN = ['#f0c7a1', '#d9a173', '#b57b4f', '#8d5a3b', '#6b422b', '#f5d5b8'];
  function identity(id) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return { shirt: SHIRTS[h % SHIRTS.length], hair: HAIR[(h >>> 8) % HAIR.length], skin: SKIN[(h >>> 16) % SKIN.length] };
  }
  const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, '0')).join('');
  function grid(cols, rows) {
    const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ ch: ' ', fg: P.ink, bg: P.bg, bold: false })));
    function cell(x, y, ch, fg, bg, bold) {
      const row = cells[y];
      if (row[x].ch === '' && x > 0) row[x - 1] = { ...row[x - 1], ch: ' ' };
      if (width(row[x].ch) === 2 && x + 1 < cols) row[x + 1] = { ...row[x + 1], ch: ' ' };
      row[x] = { ch, fg, bg: bg ?? row[x].bg, bold };
    }
    function put(x, y, value, fg = P.ink, { limit = cols, bg, bold = false } = {}) {
      if (y < 0 || y >= rows) return 0;
      let at = Math.round(x);
      const text = truncate(value, Math.max(0, Math.min(limit, cols - Math.max(0, at))));
      for (const ch of text) {
        const w = width(ch); if (!w) continue;
        if (at >= 0 && at + w <= cols) {
          cell(at, y, ch, fg, bg, bold);
          if (w === 2) {
            if (width(cells[y][at + 1].ch) === 2 && at + 2 < cols) cells[y][at + 2] = { ...cells[y][at + 2], ch: ' ' };
            cells[y][at + 1] = { ch: '', fg, bg: bg ?? cells[y][at + 1].bg, bold };
          }
        }
        at += w;
      }
      return width(text);
    }
    function fillRect(x, y, w, h, bg) {
      for (let r = Math.max(0, y); r < Math.min(rows, y + h); r++) for (let c = Math.max(0, x); c < Math.min(cols, x + w); c++) cells[r][c] = { ch: ' ', fg: P.ink, bg, bold: false };
    }
    function box(x, y, w, h, tint, { bg, heavy = false } = {}) {
      if (bg) fillRect(x, y, w, h, bg);
      const [tl, tr, bl, br, hz, vt] = heavy ? ['┏', '┓', '┗', '┛', '━', '┃'] : ['╭', '╮', '╰', '╯', '─', '│'];
      put(x, y, tl + hz.repeat(w - 2) + tr, tint, { bg });
      for (let r = 1; r < h - 1; r++) { put(x, y + r, vt, tint, { bg }); put(x + w - 1, y + r, vt, tint, { bg }); }
      put(x, y + h - 1, bl + hz.repeat(w - 2) + br, tint, { bg });
    }
    return { cols, rows, cells, put, fillRect, box, get: (x, y) => cells[y]?.[x] };
  }
  function nodeBox(c, box, title, line, tint) {
    const { x, y, w, h } = box;
    c.box(x, y, w, h, tint, { bg: P.panel });
    c.put(x + 2, y, ` ${title} `, P.bg, { bg: tint, bold: true, limit: w - 4 });
    c.put(x + 2, y + 1, line, P.ink, { limit: w - 4, bg: P.panel });
  }
  function card(c, agent, box, frame, selected) {
    const { x, y, w, h } = box, st = Object.hasOwn(STATUS, agent.status) ? agent.status : 'unknown', tint = P[st], bg = P.panel;
    c.box(x, y, w, h, selected ? P.ink : tint, { bg });
    const put = (r, text, fg = P.ink, opts = {}) => c.put(x + 2, y + r, text, fg, { limit: w - 4, bg, ...opts });
    c.put(x + 1, y + 1, '▌', tint, { bg });
    put(1, agent.label || 'Agent', P.ink, { bold: true });
    put(2, agent.taskTitle || '未关联事项');
    put(3, agent.provider || '来源未提供', P.soft);
    put(4, agent.evidence || '', P.faint);
    const artY = y + (h >= 15 ? 6 : 5), id = identity(String(agent.id));
    const figure = pose(st === 'waiting' || st === 'error' ? 'blocked' : st, frame).rows;
    const personX = w < 30 ? x + 1 : x + Math.max(2, Math.floor((w - 38) / 2));
    for (let r = 0; r < 4; r++) [...figure[r]].forEach((ch, i) => {
      if (ch === ' ') return;
      const color = r === 0 ? (i >= 4 && i <= 8 ? id.hair : id.skin) : r === 1 ? id.skin : id.shirt;
      c.put(personX + i, artY + r, ch, color, { bg });
    });
    const monX = personX + 13, monW = Math.min(20, x + w - 3 - monX);
    const spark = st === 'working' ? runningScreen('', frame)[1] : '';
    c.put(monX, artY, '┌' + '─'.repeat(monW - 2) + '┐', P.faint, { bg });
    c.fillRect(monX + 1, artY + 1, monW - 2, 2, P.screen);
    for (let r = 1; r <= 2; r++) { c.put(monX, artY + r, '│', P.faint, { bg }); c.put(monX + monW - 1, artY + r, '│', P.faint, { bg }); }
    c.put(monX + 1, artY + 1, center(agent.stateLabel || STATUS[st], monW - 2), tint, { bg: P.screen });
    c.put(monX + 1, artY + 2, [...spark.repeat(3)].slice(0, monW - 2).join(''), tint, { bg: P.screen });
    c.put(monX, artY + 3, '└' + '─'.repeat(Math.floor((monW - 3) / 2)) + '┴' + '─'.repeat(Math.ceil((monW - 3) / 2)) + '┘', P.faint, { bg });
    c.put(x + 1, artY + 4, '▀'.repeat(w - 2), P.desk, { bg });
    c.put(x + 1, y + h - 3, '▌', tint, { bg });
    put(h - 3, agent.stateLabel || STATUS[st], tint, { bold: true });
  }
  const run = (x0, x1, y) => { const pts = [], step = x1 >= x0 ? 1 : -1; for (let x = x0; x !== x1 + step; x += step) pts.push([x, y]); return pts; };
  const col = (x, y0, y1) => { const pts = [], step = y1 >= y0 ? 1 : -1; for (let y = y0; y !== y1 + step; y += step) pts.push([x, y]); return pts; };
  const dedupe = pts => pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  function drop(x0, yTop, x1, yBottom, wireY) {
    return { pts: dedupe([...col(x0, yTop, wireY), ...run(x0, x1, wireY), ...col(x1, wireY, yBottom)]), prev: [x0, yTop - 1], next: [x1, yBottom + 1] };
  }
  const reverse = route => ({ pts: [...route.pts].reverse(), prev: route.next, next: route.prev });
  const GLYPH = { ud: '│', lr: '─', dr: '╭', dl: '╮', ur: '╰', ul: '╯', u: '│', d: '│', l: '─', r: '─', udl: '┤', udr: '├', ulr: '┴', dlr: '┬', udlr: '┼' };
  function drawRoute(c, route, tint) {
    c.wires ??= new Map();
    route.pts.forEach(([x, y], i, pts) => {
      const near = [i === 0 ? route.prev : pts[i - 1], i === pts.length - 1 ? route.next : pts[i + 1]];
      const seen = c.wires.get(`${x},${y}`) || new Set();
      near.filter(Boolean).forEach(([nx, ny]) => seen.add(ny < y ? 'u' : ny > y ? 'd' : nx < x ? 'l' : 'r'));
      c.wires.set(`${x},${y}`, seen);
      const under = c.get(x, y); if (!under || under.ch === '') return;
      c.put(x, y, GLYPH[['u', 'd', 'l', 'r'].filter(d => seen.has(d)).join('')] || '│', tint, { bg: under.bg });
    });
  }
  function flight(c, route, progress, label, tint) {
    const [px, py] = route.pts[Math.min(route.pts.length - 1, Math.floor(progress * route.pts.length))];
    const text = ` ▣ ${truncate(label || '事项', 14)} `;
    const x = Math.max(0, Math.min(c.cols - width(text), px - Math.floor(width(text) / 2)));
    c.put(x, py, text, P.bg, { bg: tint, bold: true });
    return { x, y: py, w: width(text), h: 1 };
  }
  return { P, STATUS, width, truncate, center, pose, runningScreen, identity, mix, grid, nodeBox, card, run, col, dedupe, drop, reverse, drawRoute, flight };
})();
