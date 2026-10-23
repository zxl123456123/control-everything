/* News reading companion, adapted from the upstream animation.
 * Adapted from felixyu9722/WebCrawlerMY by @felixyu9722.
 * https://github.com/felixyu9722/WebCrawlerMY
 * Upstream commit: 549ea978ba1bea7017bcc3625b354f1c2f2e5307
 * index.html blob: 210603466cb7fa0688c95a50dc2ebf82a00e3b9c
 * Source ranges: IK 2336-2355; lair 2565-2844; particles 2852-2983;
 * tether 3552-3632; species 3635-3705; spider 3710-5053.
 * Original IK, foot placement, organic idle motion, tether physics, web,
 * optical cones, scanner, articulated rendering and particles are retained.
 * README advertises MIT; repository has no LICENSE and API license=null.
 * Source attribution is retained here; see docs/usage.md for provenance.
 */
(function (global) {
  'use strict';
  const mounts = new WeakMap();
  function mount({root, canvas, depot, onCapture, onDelivered, onCancel, followPointer = true}) {
    if (!root || !canvas || !depot || !root.contains(canvas) || !root.contains(depot)) {
      throw new TypeError('NewsSpider requires root, canvas and depot in the same stage');
    }
    if (mounts.has(canvas)) mounts.get(canvas).destroy();
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    let width = 1, height = 1, dpr = 1;
    let running = false, destroyed = false, rafId = null, lastFrame = null;
    let currentSpeedMultiplier = 1.8;
    let collecting = false, patrolIndex = 0, patrolHoldTicks = 0;
    const pointer = {inside: false, x: 0, y: 0};
    const queue = [];
    let active = null;
    const transientTargets = new Map();
    const previousCanvasStyle = canvas.getAttribute('style');
    const style = document.createElement('style');
    style.textContent = "    @keyframes newsSpiderScanningBuzz {\n      0% { transform: translate(0, 0) scale(1.05); }\n      20% { transform: translate(-2px, 1px) scale(1.06) skewX(-2deg); }\n      40% { transform: translate(2px, -1.5px) scale(1.05) skewX(2deg); }\n      60% { transform: translate(-1.5px, -1px) scale(1.06) rotate(1deg); }\n      80% { transform: translate(1.5px, 1.5px) scale(1.05) rotate(-1deg); }\n      100% { transform: translate(0, 0) scale(1.05); }\n    }\n\n    .news-spider-target.is-being-scanned {\n      animation: newsSpiderScanningBuzz 0.12s infinite linear !important;\n      outline: 2px solid #00f0ff !important;\n      outline-offset: 2px !important;\n      box-shadow: 0 0 18px rgba(0, 240, 255, 0.9), inset 0 0 10px rgba(255, 0, 127, 0.6) !important;\n      background: rgba(0, 240, 255, 0.28) !important;\n      color: #ffffff !important;\n      text-shadow: 0 0 8px #00f0ff, -1.5px 0 #ff007f, 1.5px 0 #00f0ff !important;\n      z-index: 10;\n    }\n\n    /* 2. 抓取完成瞬间：强力弹性爆震扭曲 (Capture Burst Wobble) */\n    @keyframes newsSpiderCaptureWobble {\n      0% { transform: scale(1); }\n      25% { transform: scale(1.32) rotate(3.5deg) skewX(-6deg); box-shadow: 0 0 28px #ff007f, 0 0 40px #00f0ff; }\n      50% { transform: scale(0.9) rotate(-3deg) skewX(5deg); }\n      75% { transform: scale(1.14) rotate(1.2deg); }\n      90% { transform: scale(0.98); }\n      100% { transform: scale(1); }\n    }\n\n    .news-spider-target.captured-burst-wobble {\n      animation: newsSpiderCaptureWobble 0.8s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards !important;\n      z-index: 15;\n    }";
    root.appendChild(style);
    style.textContent += '\n.news-spider-paused .news-spider-target { animation-play-state: paused !important; }';
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.pointerEvents = 'none';
    canvas.setAttribute('aria-hidden', 'true');
    const playSound = () => {};

    function localRect(element) {
      const rect = element.getBoundingClientRect();
      const stage = root.getBoundingClientRect();
      return {
        left: rect.left - stage.left - root.clientLeft,
        top: rect.top - stage.top - root.clientTop,
        width: rect.width, height: rect.height
      };
    }

    function targetPosition(item) {
      const element = item.element;
      if (!element.isConnected || !root.contains(element) || element.hidden ||
          element.offsetWidth <= 0 || element.offsetHeight <= 0) return null;
      const visibility = global.getComputedStyle(element);
      if (visibility.display === 'none' || visibility.visibility === 'hidden' || visibility.visibility === 'collapse') return null;
      const rect = localRect(element);
      let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
      let right = Math.min(width, rect.left + rect.width), bottom = Math.min(height, rect.top + rect.height);
      // Intersect scroll/clip ancestors so an offscreen card is not chased.
      for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
        const overflow = global.getComputedStyle(parent);
        const parentRect = localRect(parent);
        if (/^(auto|scroll|hidden|clip)$/.test(overflow.overflowX)) {
          left = Math.max(left, parentRect.left + parent.clientLeft);
          right = Math.min(right, parentRect.left + parent.clientLeft + parent.clientWidth);
        }
        if (/^(auto|scroll|hidden|clip)$/.test(overflow.overflowY)) {
          top = Math.max(top, parentRect.top + parent.clientTop);
          bottom = Math.min(bottom, parentRect.top + parent.clientTop + parent.clientHeight);
        }
      }
      if (right <= left || bottom <= top) return null;
      return { id: item.id, el: item.element, text: item.label,
        x: (left + right) / 2, y: (top + bottom) / 2,
        rect: {left, top, width: right - left, height: bottom - top} };
    }

    function cancellationReason(item) {
      return item.element.isConnected && root.contains(item.element) ? 'not-visible' : 'detached';
    }

    function notifyCancel(item, reason) {
      cleanTarget(item.element);
      if (typeof onCancel === 'function') onCancel({id: item.id, reason});
    }

    function pointerMove(event) {
      if (event.pointerType !== 'mouse') {
        pointer.inside = false;
        return;
      }
      const stage = root.getBoundingClientRect();
      pointer.x = event.clientX - stage.left - root.clientLeft;
      pointer.y = event.clientY - stage.top - root.clientTop;
      pointer.inside = pointer.x >= 0 && pointer.x <= width && pointer.y >= 0 && pointer.y <= height;
    }

    function pointerLeave() { pointer.inside = false; }

    function boundedPoint(x, y) {
      const margin = Math.min(64, width / 3, height / 3);
      return {x: Math.max(margin, Math.min(width - margin, x)), y: Math.max(margin, Math.min(height - margin, y))};
    }

    function idleDestination(spider) {
      if (followPointer && pointer.inside) {
        const angle = Math.atan2(pointer.y - spider.y, pointer.x - spider.x);
        return boundedPoint(pointer.x - Math.cos(angle) * 60, pointer.y - Math.sin(angle) * 60);
      }
      if (collecting) {
        const points = [
          boundedPoint(webLair.hubX + 130, webLair.hubY + 80),
          boundedPoint(width * 0.56, height * 0.3),
          boundedPoint(width * 0.76, height * 0.68),
          boundedPoint(width * 0.34, height * 0.72)
        ];
        const point = points[patrolIndex % points.length];
        if (Math.hypot(spider.x - point.x, spider.y - point.y) < 20) {
          if (++patrolHoldTicks >= 30) { patrolIndex++; patrolHoldTicks = 0; }
        }
        return point;
      }
      return {x: webLair.hubX, y: webLair.hubY};
    }

    function cleanTarget(element) {
      if (!element) return;
      element.classList.remove('news-spider-target', 'is-being-scanned', 'captured-burst-wobble');
      transientTargets.delete(element);
    }

    function resize() {
      if (destroyed) return;
      const nextWidth = Math.max(1, root.clientWidth);
      const nextHeight = Math.max(1, root.clientHeight);
      const nextDpr = Math.min(1.5, global.devicePixelRatio || 1, Math.sqrt(8000000 / (nextWidth * nextHeight)));
      canvas.style.height = nextHeight + 'px';
      if (nextWidth !== width || nextHeight !== height || nextDpr !== dpr) {
        width = nextWidth; height = nextHeight; dpr = nextDpr;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      webLair.updatePosition();
    }

function solve2SegmentIK(x0, y0, x2, y2, l1, l2, bendRight = true) {
  const dx = x2 - x0;
  const dy = y2 - y0;
  let dist = Math.hypot(dx, dy);

  const maxDist = (l1 + l2) * 0.999;
  if (dist > maxDist) dist = maxDist;
  if (dist < 1) dist = 1;

  const baseAngle = Math.atan2(dy, dx);
  const cosAlpha = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const clampedCos = Math.max(-1, Math.min(1, cosAlpha));
  const alpha = Math.acos(clampedCos);

  const kneeAngle = bendRight ? baseAngle + alpha : baseAngle - alpha;
  const x1 = x0 + Math.cos(kneeAngle) * l1;
  const y1 = y0 + Math.sin(kneeAngle) * l1;

  return { x1, y1 };
}
class CyberWebLair {
  constructor() {
    this.cachedPrey = [];
    this.wobble = 0;
    this.wobblePhase = 0;
    this.spokesCount = 10;
    this.ringsCount = 5;
    this.hubX = 0; this.hubY = 0; this.radius = 70;
  }
  updatePosition() {
    const rect = localRect(depot);
    this.hubX = rect.left + rect.width / 2;
    this.hubY = rect.top + rect.height / 2;
    this.radius = Math.max(35, Math.min(96, Math.min(rect.width, rect.height) * 0.35));
  }
  triggerWobble(strength = 1.0) {
    this.wobble = Math.min(1.5, this.wobble + strength);
  }
  stashPrey(pill) {
    this.triggerWobble(0.85);
    const index = this.cachedPrey.length;
    const spokeIdx = index % this.spokesCount;
    const ringIdx = (Math.floor(index / this.spokesCount) % (this.ringsCount - 1)) + 1;
    this.cachedPrey.push({
      id: pill.id, text: pill.text, bgCol: pill.bgCol, textCol: pill.textCol,
      angle: (spokeIdx / this.spokesCount) * Math.PI * 2,
      dist: (ringIdx / this.ringsCount) * this.radius,
      spokeIdx, ringIdx, timeCreated: Date.now()
    });
    // Limit only decorative tokens. News records are owned by the host.
    if (this.cachedPrey.length > 20) this.cachedPrey.shift();
  }
  update() {
    if (this.wobble > 0.005) {
      this.wobble *= 0.94;
      this.wobblePhase += 0.22;
    } else {
      this.wobble = 0;
    }
  }

  draw(ctx, scrollY) {
    const screenHubX = this.hubX;
    const screenHubY = this.hubY - scrollY;

    if (screenHubY < -this.radius * 2.5 || screenHubY > height + this.radius * 2.5) return;

    ctx.save();
    const wave = Math.sin(this.wobblePhase) * this.wobble * 9;
    const spokeR = this.radius * 1.35;
    const now = Date.now();

    // 0. 蛛网背景柔光星云晕圈 (增强与页面背景、文字的对比度，让网一目了然)
    const auraGrad = ctx.createRadialGradient(screenHubX, screenHubY, 0, screenHubX, screenHubY, spokeR * 1.15);
    auraGrad.addColorStop(0, 'rgba(0, 240, 255, 0.22)');
    auraGrad.addColorStop(0.35, 'rgba(255, 0, 127, 0.12)');
    auraGrad.addColorStop(0.75, 'rgba(10, 18, 32, 0.45)');
    auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(screenHubX, screenHubY, spokeR * 1.15, 0, Math.PI * 2);
    ctx.fill();

    // 0.1 脉冲扫描光波环 (每 3.5 秒从网中心向外扩散一次，视觉灵动鲜明)
    const pulseCycle = (now % 3500) / 3500;
    const pulseR = pulseCycle * spokeR;
    const pulseAlpha = Math.sin(pulseCycle * Math.PI) * 0.45;
    ctx.strokeStyle = `rgba(0, 240, 255, ${pulseAlpha})`;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(screenHubX, screenHubY, pulseR, 0, Math.PI * 2);
    ctx.stroke();

    // 1. 辐射主蛛丝 (双层高对比度发光主骨架)
    for (let i = 0; i < this.spokesCount; i++) {
      const angle = (i / this.spokesCount) * Math.PI * 2;
      const endX = screenHubX + Math.cos(angle) * spokeR;
      const endY = screenHubY + Math.sin(angle) * spokeR;
      const cpX = (screenHubX + endX) / 2 + Math.sin(angle) * wave * 0.4;
      const cpY = (screenHubY + endY) / 2 - Math.cos(angle) * wave * 0.4;

      // 1.1 外层发光晕
      ctx.strokeStyle = `rgba(0, 240, 255, ${0.45 + this.wobble * 0.35})`;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(screenHubX, screenHubY);
      ctx.quadraticCurveTo(cpX, cpY, endX, endY);
      ctx.stroke();

      // 1.2 亮白核心丝线 (高锐度，绝不模糊)
      ctx.strokeStyle = `rgba(180, 245, 255, ${0.85 + this.wobble * 0.15})`;
      ctx.shadowBlur = 4;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(screenHubX, screenHubY);
      ctx.quadraticCurveTo(cpX, cpY, endX, endY);
      ctx.stroke();

      // 1.3 蛛网锚固端发光节点
      ctx.fillStyle = '#00f0ff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(endX, endY, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. 螺旋环状蛛丝 (带真实自然下垂微弧度 + 交织发光数据露珠节点)
    for (let r = 1; r <= this.ringsCount; r++) {
      const ringRadius = (r / this.ringsCount) * this.radius;
      const ringAlpha = 0.55 + (r / this.ringsCount) * 0.25 + this.wobble * 0.2;
      const isMagenta = r % 2 === 0;

      ctx.strokeStyle = isMagenta ? `rgba(255, 0, 127, ${ringAlpha})` : `rgba(0, 240, 255, ${ringAlpha})`;
      ctx.shadowColor = isMagenta ? '#ff007f' : '#00f0ff';
      ctx.shadowBlur = 9;
      ctx.lineWidth = 1.8;

      ctx.beginPath();
      for (let i = 0; i <= this.spokesCount; i++) {
        const spokeIdx = i % this.spokesCount;
        const angle = (spokeIdx / this.spokesCount) * Math.PI * 2;
        const ringW = Math.sin(this.wobblePhase + r) * this.wobble * 5;
        const currentR = ringRadius + ringW;

        const x = screenHubX + Math.cos(angle) * currentR;
        const y = screenHubY + Math.sin(angle) * currentR;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          // 真实蛛丝微弧度自然下垂 (Catenary droop sag)
          const prevAngle = ((spokeIdx - 1 + this.spokesCount) % this.spokesCount / this.spokesCount) * Math.PI * 2;
          const midAngle = (prevAngle + angle) / 2 + (angle < prevAngle ? Math.PI : 0);
          const sagR = currentR * 0.95;
          const cpX = screenHubX + Math.cos(midAngle) * sagR;
          const cpY = screenHubY + Math.sin(midAngle) * sagR;
          ctx.quadraticCurveTo(cpX, cpY, x, y);
        }
      }
      ctx.closePath();
      ctx.stroke();

      // 2.1 每个网格交汇点：绘制闪烁的数码露珠 / 全息光节点 (露珠让蛛网轮廓极为显眼夺目)
      for (let i = 0; i < this.spokesCount; i++) {
        const angle = (i / this.spokesCount) * Math.PI * 2;
        const ringW = Math.sin(this.wobblePhase + r) * this.wobble * 5;
        const currentR = ringRadius + ringW;
        const nodeX = screenHubX + Math.cos(angle) * currentR;
        const nodeY = screenHubY + Math.sin(angle) * currentR;

        const twinkle = 0.7 + Math.sin(now * 0.0035 + i * 0.8 + r * 1.2) * 0.3;
        ctx.fillStyle = isMagenta ? `rgba(255, 80, 160, ${twinkle})` : `rgba(100, 245, 255, ${twinkle})`;
        ctx.shadowColor = isMagenta ? '#ff007f' : '#00f0ff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(nodeX, nodeY, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. 蛛网核心高能发光纽扣
    ctx.fillStyle = '#070b12';
    ctx.strokeStyle = '#ff007f';
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(screenHubX, screenHubY, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(screenHubX, screenHubY, 5, 0, Math.PI * 2);
    ctx.fill();

    // 4. 挂在蛛网上的资料食物与捕获昆虫
    for (let prey of this.cachedPrey) {
      const x = screenHubX + Math.cos(prey.angle) * prey.dist;
      const y = screenHubY + Math.sin(prey.angle) * prey.dist;

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      const textW = ctx.measureText(prey.text).width;
      const pillW = textW + 12;
      const pillH = 16;

      // 极简暗灰轻量化数据食物茧
      ctx.fillStyle = prey.bgCol === '#ff1e42' ? '#ff1e42' : 'rgba(20, 26, 36, 0.92)';
      ctx.strokeStyle = prey.bgCol === '#ff1e42' ? 'rgba(255, 30, 66, 0.8)' : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x - pillW / 2, y - pillH / 2, pillW, pillH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = prey.textCol === '#ffffff' ? '#ffffff' : '#cbd5e1';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(prey.text, x, y);

      ctx.restore();
    }

    ctx.restore();
  }
}
class CyberFireworkSpark {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.6 + Math.random() * 5.4;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - 1.2; // 向上初速弹跳
    this.color = color;
    this.life = 1.0;
    this.decay = 0.018 + Math.random() * 0.022; // 约 35~50 帧
    this.radius = 2.0 + Math.random() * 2.2;
    this.history = []; // 发光流光拖尾
    this.flickerSpeed = 0.2 + Math.random() * 0.3;
    this.phase = Math.random() * Math.PI * 2;
  }

  update() {
    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > 5) this.history.shift();

    this.vx *= 0.94; // 空气阻力
    this.vy *= 0.94;
    this.vy += 0.12; // 赛博重力

    this.x += this.vx;
    this.y += this.vy;
    this.life -= this.decay;
    this.phase += this.flickerSpeed;
  }

  draw(ctx, scrollY) {
    if (this.life <= 0) return;
    const sx = this.x;
    const sy = this.y - scrollY;

    ctx.save();
    const flicker = 0.75 + Math.sin(this.phase) * 0.25;
    ctx.globalAlpha = Math.max(0, this.life * flicker);

    // 1. 发光尾迹
    if (this.history.length > 1) {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = Math.max(1, this.radius * 0.75 * this.life);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.history[0].x, this.history[0].y - scrollY);
      for (let i = 1; i < this.history.length; i++) {
        ctx.lineTo(this.history[i].x, this.history[i].y - scrollY);
      }
      ctx.lineTo(sx, sy);
      ctx.stroke();
    }

    // 2. 烟花火花本体外发光
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(sx, sy, this.radius * this.life, 0, Math.PI * 2);
    ctx.fill();

    // 3. 耀眼白光核心
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(0.8, this.radius * 0.45 * this.life), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

class CyberFireworkShockwave {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.radius = 3;
    this.maxRadius = 38 + Math.random() * 16;
    this.life = 1.0;
    this.decay = 0.04;
  }

  update() {
    this.radius += (this.maxRadius - this.radius) * 0.18 + 0.8;
    this.life -= this.decay;
  }

  draw(ctx, scrollY) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life * 0.8);
    ctx.strokeStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2 * this.life;
    ctx.beginPath();
    ctx.arc(this.x, this.y - scrollY, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

const activeFireworks = [];
const activeShockwaves = [];

function triggerFirework(x, y, primaryColor = '#ff007f') {
  const palette = [primaryColor, '#00f0ff', '#39ff14', '#ffff00', '#ffffff', '#ff1e42', '#b522ff', '#ffaa00'];
  const sparkCount = 38 + Math.floor(Math.random() * 16); // 38~54 颗小烟火火花
  for (let i = 0; i < sparkCount; i++) {
    const col = palette[Math.floor(Math.random() * palette.length)];
    activeFireworks.push(new CyberFireworkSpark(x, y, col));
  }
  activeShockwaves.push(new CyberFireworkShockwave(x, y, primaryColor));
  activeShockwaves.push(new CyberFireworkShockwave(x, y, '#ffffff'));
}

function updateAndDrawFireworks(ctx, scrollY) {
  for (let i = activeShockwaves.length - 1; i >= 0; i--) {
    const sw = activeShockwaves[i];
    sw.update();
    sw.draw(ctx, scrollY);
    if (sw.life <= 0) activeShockwaves.splice(i, 1);
  }
  for (let i = activeFireworks.length - 1; i >= 0; i--) {
    const p = activeFireworks[i];
    p.update();
    p.draw(ctx, scrollY);
    if (p.life <= 0) activeFireworks.splice(i, 1);
  }
}
class UserTetheredPill {
  constructor(text, bgCol, textCol, targetX, targetY, scale = 1.0) {
    this.text = text;
    // 纯粹灰色无色显示
    this.bgCol = 'rgba(20, 26, 36, 0.9)';
    this.textCol = '#cbd5e1';
    this.scale = scale;
    this.x = targetX + (Math.random() - 0.5) * 60;
    this.y = targetY + (Math.random() - 0.5) * 60;
    this.vx = 0;
    this.vy = 0;
    this.angle = (Math.random() - 0.5) * 0.25;
    this.springDist = (60 + Math.random() * 20) * Math.max(1, scale * 0.85);
  }

  update(anchorX, anchorY) {
    const dx = anchorX - this.x;
    const dy = anchorY - this.y;
    const dist = Math.hypot(dx, dy);

    const force = (dist - this.springDist) * 0.06;
    const angle = Math.atan2(dy, dx);

    this.vx += Math.cos(angle) * force;
    this.vy += Math.sin(angle) * force;

    this.vx *= 0.82;
    this.vy *= 0.82;

    this.x += this.vx;
    this.y += this.vy;

    const targetAngle = Math.atan2(this.vy, this.vx) * 0.25;
    this.angle += (targetAngle - this.angle) * 0.1;
  }

  draw(ctx, scrollY, anchorX, anchorY) {
    const screenX = this.x;
    const screenY = this.y - scrollY;
    const screenAnchorX = anchorX;
    const screenAnchorY = anchorY - scrollY;

    // 1. 拖带细丝：纯粹浅灰极细微线，完全零 shadowBlur，极大降低 GPU 渲染负担
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1 * this.scale;
    ctx.beginPath();
    ctx.moveTo(screenAnchorX, screenAnchorY);
    ctx.lineTo(screenX, screenY);
    ctx.stroke();
    ctx.restore();

    // 2. 携带的文字：清爽灰色显示，无浓烈色彩与外发光
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(this.angle);

    const fontSize = Math.round(10.5 * Math.min(1.3, this.scale));
    ctx.font = `500 ${fontSize}px "JetBrains Mono", monospace`;
    const textW = ctx.measureText(this.text).width;
    const pillW = textW + 14 * this.scale;
    const pillH = 18 * this.scale;

    // 暗灰半透底板 + 极细无色边框 (零 shadowBlur，零卡顿)
    ctx.fillStyle = 'rgba(18, 24, 34, 0.9)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 3 * this.scale);
    ctx.fill();
    ctx.stroke();

    // 素雅浅灰文字
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.text, 0, 0.5);

    ctx.restore();
  }
}
const SPECIES_CONFIGS = {
  weaver: {
    name: '织网长腿 / Kaki Panjang',
    bodyBg: '#080c14',
    bodyBorder: '#ff007f',
    coreDot: '#ffff00',
    legColor: '#3d7eff',
    jointColor: '#00f0ff',
    meshColor: 'rgba(61, 126, 255, 0.45)',
    baseSpeed: 2.7,
    turnSpeed: 0.08,
    strideThreshold: 50,
    l1: 44,
    l2: 54,
    restDistMultiplier: 1.35,
    hasEyeCone: true, // 开启长腿眼睛前向强光照射特效
    hasEyeLight: true,
    eyeBeamLength: 195, // 优雅适中的探照光锥
    eyeBeamSpread: 0.28, // 凝聚的光锥角度
    eyeBeamColor: 'rgba(0, 220, 255, 0.075)', // 配合织网长腿的青蓝透明淡雅光色
    eyeBeamCoreColor: 'rgba(230, 250, 255, 0.22)',
    hasFangs: false,
    hasWebMesh: true
  },
  watcher: {
    name: '大眼探秘 / Mata Besar',
    bodyBg: '#091219',
    bodyBorder: '#00f0ff',
    coreDot: '#ffaa00',
    legColor: '#00f0ff',
    jointColor: '#ffaa00',
    meshColor: 'rgba(0, 240, 255, 0.25)',
    baseSpeed: 2.4,
    turnSpeed: 0.09,
    strideThreshold: 42,
    l1: 34,
    l2: 42,
    restDistMultiplier: 1.0,
    hasEyeCone: true,
    hasEyeLight: true,
    eyeBeamLength: 165,
    eyeBeamSpread: 0.35,
    eyeBeamColor: 'rgba(0, 240, 255, 0.07)',
    eyeBeamCoreColor: 'rgba(230, 250, 255, 0.2)',
    hasFangs: false,
    hasWebMesh: false
  },
  berserker: {
    name: '凶暴疾行 / Ganas',
    bodyBg: '#18070a',
    bodyBorder: '#ff1e42',
    coreDot: '#ff9100',
    legColor: '#ff1e42',
    jointColor: '#ff9100',
    meshColor: 'rgba(255, 30, 66, 0.35)',
    baseSpeed: 4.2,
    turnSpeed: 0.14,
    strideThreshold: 40,
    l1: 30,
    l2: 38,
    restDistMultiplier: 0.95,
    hasEyeCone: false,
    hasEyeLight: true,
    eyeBeamLength: 150,
    eyeBeamSpread: 0.25,
    eyeBeamColor: 'rgba(255, 30, 66, 0.075)',
    eyeBeamCoreColor: 'rgba(255, 200, 215, 0.2)',
    hasFangs: true,
    hasWebMesh: false
  }
};
class CyberSpider {
  constructor(x, y, speciesKey = 'weaver', scale = 1.0) {
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.scale = scale;
    this.speedMultiplier = currentSpeedMultiplier;
    this.setSpecies(speciesKey);

    this.destX = x;
    this.destY = y;
    this.stateTimer = 0;

    // 核心控制标志
    this.isExecutingPriorityTask = false;
    this.isStashingFood = false;
    this.isHuntingFly = false;   // 是否正暴走追捕小飞虫！
    this.isCarryingFly = false;  // 是否正咬着飞虫运往蜘蛛网！
    this.eyesRed = false;        // 眼睛是否处于捕食血红状态！

    // 活体停歇微动控制 (Organic Idle Life System)
    this.idleTicks = 0;
    this.idleBob = 0;
    this.headTwitchAngle = 0;
    this.targetHeadTwitch = 0;

    this.currentTarget = null;
    this.targetOrigin = 'auto';
    this.isScanning = false;
    this.scanProgress = 0;
    this.autoHarvestCooldown = 0; // 自主漫游时抓取完成后的停歇冷却
    this.isInspectingEmptySpot = false; // 用户在漫游时点击空位的好奇探查状态
    this.inspectTimer = 0;

    this.userTetheredPills = [];

    this.bodyBadge = '新闻采集';
    this.legs = [];
    this.initLegs();
    this.gaitGroup = 0;

    // 惊悚特技拟物系统 (自主偶发飞扑突脸吓人 / 隐匿消散倒挂吊落)
    this.trickState = null; // null | 'pounce' | 'rappel'
    this.trickTimer = 0;
    this.trickCooldown = 750 + Math.random() * 600; // ~12-22秒尝试首次特技
    this.jumpScale = 1.0;
    this.jumpGlitch = 0;
    this.trickOpacity = 1.0;
    this.silkAnchorY = 0;
    this.rappelStartY = 0;
    this.rappelTargetY = 0;

    // 🕸️ 蛛网大扫除与狂欢跳舞状态
    this.isCleaningWeb = false;
    this.isDancing = false;
    this.danceTimer = 0;
  }
  setSpeedMultiplier(spd) {
    this.speedMultiplier = spd;
    this.speed = this.cfg.baseSpeed * Math.max(0.9, Math.sqrt(this.scale)) * this.speedMultiplier;
  }

  setScale(newScale) {
    this.scale = newScale;
    this.rebuildLegDimensions();
    this.userTetheredPills.forEach(p => p.scale = newScale);
  }

  setSpecies(speciesKey) {
    this.speciesKey = speciesKey;
    this.species = speciesKey;
    this.cfg = SPECIES_CONFIGS[speciesKey];
    this.speed = this.cfg.baseSpeed * Math.max(0.9, Math.sqrt(this.scale)) * this.speedMultiplier;
    this.turnSpeed = this.cfg.turnSpeed * Math.min(1.8, Math.max(0.8, this.speedMultiplier));
    this.strideThreshold = this.cfg.strideThreshold * this.scale;
    if (this.legs && this.legs.length > 0) {
      this.rebuildLegDimensions();
    }
  }

  initLegs() {
    this.legs = [];
    for (let i = 0; i < 8; i++) {
      const isRightSide = i < 4;
      const legIndex = isRightSide ? i : i - 4;

      const hipForward = (1.5 - legIndex) * 8 * this.scale;
      const hipLateral = (isRightSide ? 14 : -14) * this.scale;

      const restDist = (54 + (legIndex === 0 || legIndex === 3 ? 16 : 8)) * this.cfg.restDistMultiplier * this.scale;
      const restAngleOffset = (isRightSide ? 1 : -1) * (0.75 + legIndex * 0.42);

      const initialFootX = this.x + Math.cos(this.angle + restAngleOffset) * restDist;
      const initialFootY = this.y + Math.sin(this.angle + restAngleOffset) * restDist;

      this.legs.push({
        id: i,
        isRightSide,
        legIndex,
        hipForward,
        hipLateral,
        restDist,
        restAngleOffset,
        l1: this.cfg.l1 * this.scale,
        l2: this.cfg.l2 * this.scale,
        footX: initialFootX,
        footY: initialFootY,
        prevFootX: initialFootX,
        prevFootY: initialFootY,
        stepTargetX: initialFootX,
        stepTargetY: initialFootY,
        isStepping: false,
        stepProgress: 1.0,
        gaitGroup: (isRightSide ? legIndex : legIndex + 1) % 2
      });
    }
  }

  rebuildLegDimensions() {
    this.speed = this.cfg.baseSpeed * Math.max(0.9, Math.sqrt(this.scale)) * this.speedMultiplier;
    this.strideThreshold = this.cfg.strideThreshold * this.scale;
    for (let leg of this.legs) {
      leg.hipForward = (1.5 - leg.legIndex) * 8 * this.scale;
      leg.hipLateral = (leg.isRightSide ? 14 : -14) * this.scale;
      leg.l1 = this.cfg.l1 * this.scale;
      leg.l2 = this.cfg.l2 * this.scale;
      leg.restDist = (54 + (leg.legIndex === 0 || leg.legIndex === 3 ? 16 : 8)) * this.cfg.restDistMultiplier * this.scale;
    }
  }
  update() {
    this.stateTimer++;
    while (!active && queue.length && !destroyed) {
      const next = queue.shift();
      const target = targetPosition(next);
      if (target) {
        active = next;
        this.currentTarget = target;
        this.targetOrigin = 'user';
        this.isExecutingPriorityTask = true;
        this.scanProgress = 0;
      } else {
        notifyCancel(next, cancellationReason(next));
      }
    }
    if (destroyed) return;
    if (this.currentTarget && active) {
      const target = targetPosition(active);
      if (!target) {
        const cancelled = active;
        active = null;
        this.currentTarget = null;
        this.isScanning = false;
        this.scanProgress = 0;
        this.isExecutingPriorityTask = false;
        this.destX = webLair.hubX;
        this.destY = webLair.hubY;
        notifyCancel(cancelled, cancellationReason(cancelled));
        if (destroyed) return;
      } else {
        this.currentTarget = target;
        this.destX = this.currentTarget.x;
        this.destY = this.currentTarget.y;
      }
    } else if (this.isStashingFood) {
      this.destX = webLair.hubX;
      this.destY = webLair.hubY;
    } else if (!active) {
      const point = idleDestination(this);
      this.destX = point.x;
      this.destY = point.y;
      this.bodyBadge = collecting ? '正在采集' : '新闻采集';
    }

    const dx = this.destX - this.x;
    const dy = this.destY - this.y;
    const distToDest = Math.hypot(dx, dy);

    // 追捕猎物时速度提升 +75%
    const currentActualSpeed = this.isHuntingFly ? this.speed * 1.75 : this.speed;

    if (distToDest > 8 * this.scale) {
      this.idleTicks = 0;
      const targetAngle = Math.atan2(dy, dx);
      let diffAngle = targetAngle - this.angle;
      while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
      while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;

      this.angle += diffAngle * (this.isHuntingFly ? this.turnSpeed * 1.6 : this.turnSpeed);

      if (Math.abs(diffAngle) < 1.3) {
        const moveDist = Math.min(currentActualSpeed, distToDest);
        this.x += Math.cos(this.angle) * moveDist;
        this.y += Math.sin(this.angle) * moveDist;
      }
    } else {
      // ==========================================
      // 【核心功能】：活体静止微动 (停着的时候像活蜘蛛一样微动)
      // ==========================================
      this.idleTicks++;

      // 1. 身体微弱呼吸起伏 (Breathing Bob)
      this.idleBob = Math.sin(this.idleTicks * 0.06) * 1.4 * this.scale;

      // 2. 头部左右微动观察环境 (Scanning Head Twitches)
      if (this.idleTicks % 70 === 0) {
        // 随机左右轻微晃头
        this.targetHeadTwitch = (Math.random() - 0.5) * 0.26;
      }
      this.headTwitchAngle += (this.targetHeadTwitch - this.headTwitchAngle) * 0.08;

      // 3. 腿部偶然位置微调踩踏 (Organic Leg Probing)
      if (this.idleTicks % 85 === 0 && Math.random() < 0.65) {
        // 随机挑选一只前足抬起轻踏一下探索地面
        const pickLeg = this.legs[Math.floor(Math.random() * 8)];
        if (!pickLeg.isStepping) {
          pickLeg.isStepping = true;
          pickLeg.stepProgress = 0;
          pickLeg.prevFootX = pickLeg.footX;
          pickLeg.prevFootY = pickLeg.footY;
          pickLeg.stepTargetX = pickLeg.footX + (Math.random() - 0.5) * 8 * this.scale;
          pickLeg.stepTargetY = pickLeg.footY + (Math.random() - 0.5) * 8 * this.scale;
          playSound('step', this.scale * 1.2);
        }
      }
    }

    // 3. 驱动 8 肢逆向运动学
    this.updateGait();

    // 4. 更新跟随药丸
    for (let pill of this.userTetheredPills) {
      pill.update(this.x, this.y);
    }
    if (this.isStashingFood && distToDest < 18 * this.scale) {
      const delivered = active;
      for (const pill of this.userTetheredPills) webLair.stashPrey(pill);
      this.userTetheredPills = [];
      this.isStashingFood = false;
      this.isExecutingPriorityTask = false;
      this.bodyBadge = '已送达';
      active = null;
      if (delivered && typeof onDelivered === 'function') {
        onDelivered({id: delivered.id, label: delivered.label});
      }
      return;
    }

    if (this.currentTarget) {
      const distance = Math.hypot(this.x - this.currentTarget.x, this.y - this.currentTarget.y);
      if (distance < 60 * this.scale) {
        this.destX = this.x;
        this.destY = this.y;
        this.isScanning = true;
        this.scanProgress += 0.035 * this.speedMultiplier;
        const element = this.currentTarget.el;
        element.classList.add('news-spider-target', 'is-being-scanned');
        if (this.scanProgress >= 1) {
          const captured = active;
          element.classList.remove('is-being-scanned');
          element.classList.add('captured-burst-wobble');
          transientTargets.set(element, 90);
          triggerFirework(this.currentTarget.x, this.currentTarget.y, this.cfg.bodyBorder);
          const pill = new UserTetheredPill(captured.label, this.cfg.bodyBorder, '#ffffff', this.x, this.y, this.scale);
          pill.id = captured.id;
          this.userTetheredPills.push(pill);
          this.bodyBadge = captured.label.slice(0, 14);
          this.currentTarget = null;
          this.isScanning = false;
          this.scanProgress = 0;
          this.isStashingFood = true;
          this.destX = webLair.hubX;
          this.destY = webLair.hubY;
          if (typeof onCapture === 'function') {
            onCapture({id: captured.id, label: captured.label});
          }
        }
      } else {
        this.isScanning = false;
        this.scanProgress = 0;
      }
    }
  }

  updateGait() {
    const stepPeriod = Math.max(3, Math.round(6 / (this.isHuntingFly ? this.speedMultiplier * 1.6 : this.speedMultiplier)));
    if (this.stateTimer % stepPeriod === 0) {
      this.gaitGroup = 1 - this.gaitGroup;
    }

    const cos = Math.cos(this.angle + this.headTwitchAngle * 0.5);
    const sin = Math.sin(this.angle + this.headTwitchAngle * 0.5);

    for (let leg of this.legs) {
      const hipX = this.x + (cos * leg.hipForward - sin * leg.hipLateral);
      const hipY = this.y + (sin * leg.hipForward + cos * leg.hipLateral);
      leg.hipX = hipX;
      leg.hipY = hipY;

      const lead = 18 * this.scale * this.speedMultiplier;
      const idealFootX = hipX + Math.cos(this.angle + leg.restAngleOffset) * leg.restDist + cos * lead;
      const idealFootY = hipY + Math.sin(this.angle + leg.restAngleOffset) * leg.restDist + sin * lead;

      const pullDist = Math.hypot(leg.footX - idealFootX, leg.footY - idealFootY);

      if (!leg.isStepping && pullDist > this.strideThreshold && leg.gaitGroup === this.gaitGroup) {
        leg.isStepping = true;
        leg.stepProgress = 0;
        leg.prevFootX = leg.footX;
        leg.prevFootY = leg.footY;
        leg.stepTargetX = idealFootX + (Math.random() - 0.5) * 6 * this.scale;
        leg.stepTargetY = idealFootY + (Math.random() - 0.5) * 6 * this.scale;
        playSound('step', this.scale);
      }

      if (leg.isStepping) {
        leg.stepProgress += 0.18 * (this.isHuntingFly ? this.speedMultiplier * 1.5 : this.speedMultiplier);
        if (leg.stepProgress >= 1.0) {
          leg.isStepping = false;
          leg.stepProgress = 1.0;
          leg.footX = leg.stepTargetX;
          leg.footY = leg.stepTargetY;
        } else {
          const t = leg.stepProgress;
          leg.footX = leg.prevFootX + (leg.stepTargetX - leg.prevFootX) * t;
          leg.footY = leg.prevFootY + (leg.stepTargetY - leg.prevFootY) * t;
          leg.liftZ = Math.sin(t * Math.PI) * 16 * this.scale;
        }
      } else {
        leg.liftZ = 0;
      }

      const bend = leg.isRightSide ? true : false;
      const ik = solve2SegmentIK(leg.hipX, leg.hipY, leg.footX, leg.footY - (leg.liftZ || 0), leg.l1, leg.l2, bend);
      leg.kneeX = ik.x1;
      leg.kneeY = ik.y1;
    }
  }
  draw(ctx, scrollY, targets) {
    if (this.trickOpacity <= 0.01) return; // 隐匿状态完全不可见！

    let screenX = this.x;
    let screenY = this.y - scrollY + (this.idleBob || 0); // 融入活体呼吸微动！
    const sc = this.scale;
    const renderAngle = this.angle + (this.headTwitchAngle || 0); // 融入晃头探照角度！

    ctx.save();
    if (this.trickOpacity < 1.0) {
      ctx.globalAlpha = this.trickOpacity;
    }

    // 突脸吓人震颤偏移与飞扑倍率
    if (this.jumpGlitch > 0) {
      screenX += (Math.random() - 0.5) * this.jumpGlitch;
      screenY += (Math.random() - 0.5) * this.jumpGlitch;
    }
    const jScale = this.jumpScale || 1.0;
    if (jScale !== 1.0) {
      ctx.translate(screenX, screenY);
      ctx.scale(jScale, jScale);
      ctx.translate(-screenX, -screenY);
    }

    // ==========================================
    // 【真实蜘蛛吐长白丝倒挂特效】(Realistic White Silk Thread Rappel)
    // (用户指令：要真实蜘蛛那种吊卦 - 稍微白色长线下来效果)
    // ==========================================
    if (this.trickState === 'rappel' && this.silkAnchorY !== undefined) {
      ctx.save();
      // 丝线锚点：world Y → screen Y（固定在页面顶端，随滚动而变化）
      const anchorScreenY = Math.max(-80, this.silkAnchorY - scrollY);
      // 蜘蛛尾部 (Spinneret)：angle = π/2（头朝下）时尾部在躯体上方
      const tailX = screenX - Math.cos(this.angle) * (15 * sc);
      const tailY = screenY - Math.sin(this.angle) * (15 * sc);
      const totalFrames = this.rappelDropFrames || 300;

      // 1. 外层柔和白丝半透光晕
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
      ctx.shadowBlur = 4;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(screenX, anchorScreenY);
      const sway = Math.sin(this.trickTimer * 0.12) * 8 * (1 - (this.trickTimer / totalFrames));
      const ctrlY = (anchorScreenY + tailY) * 0.52;
      ctx.quadraticCurveTo(screenX + sway, ctrlY, tailX, tailY);
      ctx.stroke();

      // 2. 内层精细纯白长丝芯线 (纤细真丝质感)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(screenX, anchorScreenY);
      ctx.quadraticCurveTo(screenX + sway, ctrlY, tailX, tailY);
      ctx.stroke();

      // 3. 丝线与尾部出丝口连接处的微小白光节点
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(tailX, tailY, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // 4. 丝线上缓缓滑落的晶莹微光微粒 (Glistering Silk Shimmer)
      const shimmerP = (this.trickTimer * 0.035) % 1.0;
      const shimX = screenX + (tailX - screenX) * shimmerP + sway * Math.sin(shimmerP * Math.PI);
      const shimY = anchorScreenY + (tailY - anchorScreenY) * shimmerP;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(shimX, shimY, 1.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }



    // 2. 绘制与周边文献的蛛网激光丝线
    if (targets && targets.length > 0) {
      ctx.save();
      let count = 0;
      const maxConnectDist = 360 * sc;
      for (let t of targets) {
        const targetScreenY = t.y - scrollY;
        const dist = Math.hypot(this.x - t.x, this.y - t.y);
        if (dist < maxConnectDist && targetScreenY > -40 && targetScreenY < height + 40) {
          count++;
          if (count > 5) break;

          const alpha = Math.max(0.08, (1 - dist / maxConnectDist) * 0.45);
          ctx.strokeStyle = count % 2 === 0 ? `rgba(0, 240, 255, ${alpha})` : `rgba(255, 0, 127, ${alpha})`;
          ctx.lineWidth = 1 * sc;
          ctx.beginPath();
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(t.x, targetScreenY);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 3. 绘制正在交互的目标的高亮框与聚焦激光 (含扫描能量束与进度 HUD)
    if (this.currentTarget && this.currentTarget.el) {
      const r = this.currentTarget.rect;
      ctx.save();
      const focusCol = this.targetOrigin === 'user' ? '#ff007f' : this.cfg.bodyBorder;
      ctx.strokeStyle = focusCol;
      ctx.shadowColor = focusCol;
      ctx.shadowBlur = (this.isScanning ? 20 : 12) * sc;
      ctx.lineWidth = (this.isScanning ? 2.5 : 1.8) * sc;

      const pad = 4 * sc;
      const bx = r.left - pad;
      const by = r.top - pad;
      const bw = r.width + pad * 2;
      const bh = r.height + pad * 2;

      if (this.isScanning) {
        // 扫描态：绘制四角高科技锁定准星括号 (Reticle Brackets)
        const cornerLen = Math.min(10 * sc, bw * 0.25);
        ctx.beginPath();
        // 左上
        ctx.moveTo(bx, by + cornerLen); ctx.lineTo(bx, by); ctx.lineTo(bx + cornerLen, by);
        // 右上
        ctx.moveTo(bx + bw - cornerLen, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + cornerLen);
        // 右下
        ctx.moveTo(bx + bw, by + bh - cornerLen); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw - cornerLen, by + bh);
        // 左下
        ctx.moveTo(bx + cornerLen, by + bh); ctx.lineTo(bx, by + bh); ctx.lineTo(bx, by + bh - cornerLen);
        ctx.stroke();

        // 内部脉冲半透明高亮底色
        ctx.fillStyle = this.targetOrigin === 'user' ? 'rgba(255, 0, 127, 0.12)' : 'rgba(0, 240, 255, 0.12)';
        ctx.fillRect(bx, by, bw, bh);

        // 激光束：带有微弱电弧抖动的双重高能激光
        const targetCenterX = r.left + r.width / 2;
        const targetCenterY = r.top + r.height / 2;
        const jitterX = (Math.random() - 0.5) * 4 * sc;
        const jitterY = (Math.random() - 0.5) * 4 * sc;

        ctx.lineWidth = 1.2 * sc;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(targetCenterX + jitterX, targetCenterY + jitterY);
        ctx.stroke();

        // 头部微型抓取进度指示条 (HUD Progress)
        const pW = Math.max(34, bw);
        const pH = 3 * sc;
        const px = r.left + r.width / 2 - pW / 2;
        const py = by - 8 * sc;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(px, py, pW, pH);
        ctx.fillStyle = focusCol;
        ctx.fillRect(px, py, pW * Math.min(1.0, this.scanProgress), pH);
      } else {
        // 移动接近态：普通矩形框与直线引导
        ctx.strokeRect(bx, by, bw, bh);
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(r.left + r.width / 2, r.top + r.height / 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4. 绘制【仅由用户点击抓取的实体数据药丸】
    for (let pill of this.userTetheredPills) {
      pill.draw(ctx, scrollY, this.x, this.y);
    }

    // 5. 肢足阴影
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 3.5 * sc;
    ctx.lineCap = 'round';
    for (let leg of this.legs) {
      ctx.beginPath();
      ctx.moveTo(leg.hipX, leg.hipY - scrollY + 4 * sc);
      ctx.lineTo(leg.kneeX, leg.kneeY - scrollY + 4 * sc);
      ctx.lineTo(leg.footX, leg.footY - scrollY + 4 * sc);
      ctx.stroke();
    }
    ctx.restore();

    // 6. 还原截图中的【蛛足之间的网状连线 (Web Mesh)】
    if (this.cfg.hasWebMesh) {
      ctx.save();
      ctx.strokeStyle = this.cfg.meshColor;
      ctx.lineWidth = 1 * sc;
      for (let i = 0; i < 3; i++) {
        const lA = this.legs[i];
        const lB = this.legs[i + 1];
        ctx.beginPath();
        ctx.moveTo(lA.kneeX, lA.kneeY - scrollY);
        ctx.lineTo(lB.kneeX, lB.kneeY - scrollY);
        ctx.stroke();

        const lC = this.legs[i + 4];
        const lD = this.legs[i + 5];
        ctx.beginPath();
        ctx.moveTo(lC.kneeX, lC.kneeY - scrollY);
        ctx.lineTo(lD.kneeX, lD.kneeY - scrollY);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 7. 绘制 8 条机械蜘蛛足
    ctx.save();
    for (let leg of this.legs) {
      const hx = leg.hipX;
      const hy = leg.hipY - scrollY;
      const kx = leg.kneeX;
      const ky = leg.kneeY - scrollY - (leg.liftZ || 0);
      const fx = leg.footX;
      const fy = leg.footY - scrollY - (leg.liftZ || 0);

      // 第一段：髋 -> 膝
      ctx.strokeStyle = '#202a3a';
      ctx.lineWidth = 2.6 * sc;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(kx, ky);
      ctx.stroke();

      // 第二段：膝 -> 脚尖
      const legColor = this.eyesRed ? '#ff1e42' : this.cfg.legColor;
      ctx.strokeStyle = legColor;
      ctx.shadowColor = legColor;
      ctx.shadowBlur = 8 * sc;
      ctx.lineWidth = 1.8 * sc;
      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.lineTo(fx, fy);
      ctx.stroke();

      // 膝关节发光节点
      const jointColor = this.eyesRed ? '#ffaa00' : this.cfg.jointColor;
      ctx.fillStyle = jointColor;
      ctx.shadowColor = jointColor;
      ctx.shadowBlur = 10 * sc;
      ctx.beginPath();
      ctx.arc(kx, ky, 3 * sc, 0, Math.PI * 2);
      ctx.fill();

      // 脚尖锐点
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(fx, fy, 2 * sc, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 8. 绘制蜘蛛赛博躯体 (融入活体晃头角度)
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(renderAngle);

    // 若具有凶暴螯齿或正处于追捕状态 (张开螯肢)
    if (this.cfg.hasFangs || this.eyesRed) {
      const fangPinch = Math.sin(this.stateTimer * 0.35) * 5 * sc;
      ctx.strokeStyle = '#ff1e42';
      ctx.shadowColor = '#ff1e42';
      ctx.shadowBlur = 10 * sc;
      ctx.lineWidth = 2.6 * sc;
      ctx.beginPath();
      ctx.moveTo(14 * sc, -6 * sc);
      ctx.lineTo(26 * sc, -10 * sc + fangPinch);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(14 * sc, 6 * sc);
      ctx.lineTo(26 * sc, 10 * sc - fangPinch);
      ctx.stroke();
    }

    // 核心胶囊
    ctx.fillStyle = this.cfg.bodyBg;
    ctx.strokeStyle = this.eyesRed ? '#ff1e42' : this.cfg.bodyBorder;
    ctx.shadowColor = this.eyesRed ? '#ff1e42' : this.cfg.bodyBorder;
    ctx.shadowBlur = 12 * sc;
    ctx.lineWidth = 2 * sc;
    ctx.beginPath();
    ctx.roundRect(-16 * sc, -11 * sc, 32 * sc, 22 * sc, 5 * sc);
    ctx.fill();
    ctx.stroke();

    // 明黄感应核心小圆点 (狂暴时闪烁红光)
    ctx.fillStyle = this.eyesRed ? '#ff1e42' : this.cfg.coreDot;
    ctx.shadowColor = this.eyesRed ? '#ff1e42' : this.cfg.coreDot;
    ctx.shadowBlur = 10 * sc;
    ctx.beginPath();
    ctx.arc(4 * sc, 0, 3 * sc, 0, Math.PI * 2);
    ctx.fill();

    // ==========================================
    // 【长腿/蜘蛛眼睛强光照射效果】(Eye Headlight Illumination Cones & Beam Projection)
    // 包含：双重复眼前向投射高能光锥、地面/页面文字照射高亮光斑、轴心强光束与微动光波
    // ==========================================
    if (this.cfg.hasEyeLight || this.cfg.hasEyeCone || this.species === 'weaver') {
      ctx.save();
      // 不使用过曝的 screen 混色，采用标准平滑淡彩透明渐变，保持原汁原味的通透感与蜘蛛原生色调
      const beamLen = (this.cfg.eyeBeamLength || 195) * sc;
      const spread = (this.cfg.eyeBeamSpread || 0.28);
      const flicker = 0.96 + Math.sin(this.stateTimer * 0.1) * 0.04;

      // 配合整体蜘蛛色调的淡雅透明色 (极低不透明度，通透不遮挡文字)
      let beamMainCol = this.eyesRed
        ? 'rgba(255, 30, 66, 0.09)'
        : (this.cfg.eyeBeamColor || 'rgba(0, 220, 255, 0.075)');
      if (this.isDancing) {
        beamMainCol = `hsla(${(Date.now() * 0.4) % 360}, 100%, 65%, 0.16)`;
      }
      const beamCoreCol = this.eyesRed
        ? 'rgba(255, 180, 195, 0.22)'
        : (this.cfg.eyeBeamCoreColor || 'rgba(220, 250, 255, 0.2)');
      const groundSpotCol = this.eyesRed
        ? 'rgba(255, 30, 66, 0.05)'
        : 'rgba(0, 220, 255, 0.045)';

      const eyeYs = [-4.5 * sc, 4.5 * sc];

      // 1. 左右复眼分别向前射出柔和通透的探照光锥
      for (let ey of eyeYs) {
        const ex = 14 * sc;

        const coneGrad = ctx.createRadialGradient(
          ex, ey, 2 * sc,
          ex + beamLen * 0.65, ey, beamLen
        );
        coneGrad.addColorStop(0, beamCoreCol);
        coneGrad.addColorStop(0.2, beamMainCol);
        coneGrad.addColorStop(0.65, this.eyesRed ? 'rgba(255, 30, 66, 0.025)' : 'rgba(0, 220, 255, 0.02)');
        coneGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = coneGrad;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.arc(ex, ey, beamLen, -spread, spread);
        ctx.closePath();
        ctx.fill();

        // 微细柔光轴线
        const rayGrad = ctx.createLinearGradient(ex, ey, ex + beamLen * 0.85, ey);
        rayGrad.addColorStop(0, beamCoreCol);
        rayGrad.addColorStop(0.4, beamMainCol);
        rayGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.strokeStyle = rayGrad;
        ctx.lineWidth = 0.9 * sc;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + beamLen * 0.85, ey);
        ctx.stroke();
      }

      // 2. 投射在前方地面/网页文字上的极微弱柔和光晕 (轻盈淡透，不晃眼)
      const spotX = beamLen * 0.68;
      const spotRadiusX = beamLen * 0.38 * flicker;
      const spotRadiusY = beamLen * 0.22 * flicker;

      const spotGrad = ctx.createRadialGradient(
        spotX, 0, 3 * sc,
        spotX, 0, spotRadiusX
      );
      spotGrad.addColorStop(0, groundSpotCol);
      spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = spotGrad;
      ctx.beginPath();
      ctx.ellipse(spotX, 0, spotRadiusX, spotRadiusY, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // ==========================================
    // 前部复眼传感器与白炽晶状体 (Front Optical Sensors with Specular Glint)
    // ==========================================
    let eyeColor = this.eyesRed ? '#ff003c' : '#00f0ff';
    if (this.isDancing) {
      eyeColor = `hsl(${(Date.now() * 0.4) % 360}, 100%, 65%)`;
    }
    ctx.fillStyle = eyeColor;
    ctx.shadowColor = eyeColor;
    ctx.shadowBlur = (this.eyesRed ? 22 : 14) * sc;

    // 主复眼外环
    ctx.beginPath();
    ctx.arc(14 * sc, -4.5 * sc, 3.4 * sc, 0, Math.PI * 2);
    ctx.arc(14 * sc, 4.5 * sc, 3.4 * sc, 0, Math.PI * 2);
    ctx.fill();

    // 核心白炽强光点 (高能光源焦点)
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8 * sc;
    ctx.beginPath();
    ctx.arc(14.6 * sc, -4.5 * sc, 1.4 * sc, 0, Math.PI * 2);
    ctx.arc(14.6 * sc, 4.5 * sc, 1.4 * sc, 0, Math.PI * 2);
    ctx.fill();

    // 若属于大眼探秘品种，额外渲染侧翼副眼传感器
    if (this.species === 'watcher') {
      ctx.fillStyle = this.eyesRed ? '#ffaa00' : '#ffaa00';
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 8 * sc;
      ctx.beginPath();
      ctx.arc(6 * sc, -9 * sc, 2.5 * sc, 0, Math.PI * 2);
      ctx.arc(6 * sc, 9 * sc, 2.5 * sc, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // 9. 背部微型状态标签
    ctx.save();
    const badgeFontSize = Math.round(9.5 * Math.min(1.4, sc));
    ctx.font = `bold ${badgeFontSize}px "JetBrains Mono", monospace`;
    let badgeText = this.bodyBadge;
    if (this.isDancing) badgeText = '💃 CELEBRATION DANCE! 🎉';
    else if (this.isCleaningWeb) badgeText = '🧹 CLEANING WEB LAIR!';
    else if (this.isHuntingFly) badgeText = '🚨 HUNTING INSECT!';
    else if (this.isCarryingFly) badgeText = '🪰 CARRYING PREY...';
    else if (this.isStashingFood) badgeText = '🕸️ STASHING PREY...';

    const badgeW = ctx.measureText(badgeText).width + 10 * sc;
    const badgeH = 15 * sc;
    const bx = screenX - badgeW / 2;
    const by = screenY - 30 * sc;

    ctx.fillStyle = 'rgba(8, 12, 18, 0.92)';
    let bColor = this.eyesRed ? '#ff1e42' : (this.isStashingFood ? '#ff007f' : this.cfg.bodyBorder);
    if (this.isDancing) bColor = `hsl(${(Date.now() * 0.4) % 360}, 100%, 60%)`;
    else if (this.isCleaningWeb) bColor = '#00f0ff';
    ctx.strokeStyle = bColor;
    ctx.shadowColor = bColor;
    ctx.shadowBlur = 6 * sc;
    ctx.lineWidth = 1 * sc;
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeW, badgeH, 3 * sc);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = this.eyesRed ? '#ff99a8' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, screenX, by + badgeH / 2);
    ctx.restore();
    ctx.restore(); // 恢复外层特技全局透明度与放大矩阵
  }
}

    const webLair = new CyberWebLair();
    resize();
    const crawler = new CyberSpider(webLair.hubX, webLair.hubY, 'watcher', 1.0);
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(root);
      resizeObserver.observe(depot);
    }
    global.addEventListener('resize', resize);
    root.addEventListener('pointermove', pointerMove, {passive: true});
    root.addEventListener('pointerleave', pointerLeave, {passive: true});

    function render(time) {
      rafId = null;
      if (!running || destroyed) return;
      // Keep the original 60 Hz simulation rate on high-refresh displays.
      if (lastFrame === null || time - lastFrame >= 1000 / 60 - 0.5) {
        lastFrame = time;
        webLair.updatePosition();
        ctx.clearRect(0, 0, width, height);
        webLair.update();
        webLair.draw(ctx, 0);
        for (const [element, ticks] of transientTargets) {
          if (ticks <= 1) cleanTarget(element);
          else transientTargets.set(element, ticks - 1);
        }
        crawler.update();
        if (destroyed || !running) return;
        const visibleTargets = queue.map(targetPosition).filter(Boolean);
        if (crawler.currentTarget) visibleTargets.push(crawler.currentTarget);
        crawler.draw(ctx, 0, visibleTargets);
        updateAndDrawFireworks(ctx, 0);
      }
      if (running && !destroyed) rafId = requestAnimationFrame(render);
    }

    const api = {
      capture({id, element, label}) {
        if (destroyed || id === undefined || id === null || !element || !root.contains(element)) return false;
        const key = String(id);
        if ((active && active.id === key) || queue.some(item => item.id === key)) return false;
        const shortLabel = Array.from(String(label || element.textContent || '新闻')).slice(0, 24).join('');
        queue.push({id: key, element, label: shortLabel});
        resize();
        return true;
      },
      cancel(id) {
        if (destroyed) return false;
        const key = String(id);
        let cancelled = false;
        for (let index = queue.length - 1; index >= 0; index--) {
          if (queue[index].id === key) {
            const cancelledItem = queue[index];
            queue.splice(index, 1);
            cancelled = true;
            notifyCancel(cancelledItem, 'cancelled');
          }
        }
        if (active && active.id === key) {
          const cancelledItem = active;
          active = null;
          crawler.currentTarget = null;
          crawler.userTetheredPills = [];
          crawler.isScanning = false;
          crawler.scanProgress = 0;
          crawler.isStashingFood = false;
          crawler.isExecutingPriorityTask = false;
          crawler.destX = webLair.hubX;
          crawler.destY = webLair.hubY;
          cancelled = true;
          notifyCancel(cancelledItem, 'cancelled');
        }
        return cancelled;
      },
      setCollecting(value) {
        if (destroyed) return;
        collecting = Boolean(value);
        patrolIndex = 0;
        patrolHoldTicks = 0;
      },
      pause() {
        running = false;
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = null;
        root.classList.add('news-spider-paused');
      },
      resume() {
        if (destroyed || running) return;
        running = true;
        lastFrame = null;
        root.classList.remove('news-spider-paused');
        resize();
        rafId = requestAnimationFrame(render);
      },
      setOptions(options = {}) {
        if (destroyed) return;
        if (options.species && SPECIES_CONFIGS[options.species]) crawler.setSpecies(options.species);
        if (Number.isFinite(options.scale)) crawler.setScale(Math.max(0.6, Math.min(2.3, options.scale)));
        if (Number.isFinite(options.speed)) {
          currentSpeedMultiplier = Math.max(0.5, Math.min(3, options.speed));
          crawler.setSpeedMultiplier(currentSpeedMultiplier);
        }
      },
      inspect() {
        return {
          running, destroyed, collecting, followPointer,
          phase: crawler.isScanning ? 'scanning' : crawler.isStashingFood ? 'carrying' : active ? 'approaching' : followPointer && pointer.inside ? 'following' : collecting ? 'collecting' : 'idle',
          activeId: active ? active.id : null,
          queueIds: queue.map(item => item.id),
          deliveredIds: webLair.cachedPrey.map(item => item.id),
          pills: crawler.userTetheredPills.map(item => ({id: item.id, x: item.x, y: item.y})),
          position: {x: crawler.x, y: crawler.y},
          pointer: {...pointer},
          target: crawler.currentTarget ? {x: crawler.currentTarget.x, y: crawler.currentTarget.y} : null,
          destination: {x: crawler.destX, y: crawler.destY},
          depot: {x: webLair.hubX, y: webLair.hubY},
          species: crawler.speciesKey, scale: crawler.scale, speed: crawler.speedMultiplier,
          legs: crawler.legs.map(leg => ({x: leg.footX, y: leg.footY, kneeX: leg.kneeX, kneeY: leg.kneeY})),
          source: 'felixyu9722/WebCrawlerMY@549ea978'
        };
      },
      destroy() {
        if (destroyed) return;
        api.pause();
        destroyed = true;
        if (resizeObserver) resizeObserver.disconnect();
        global.removeEventListener('resize', resize);
        root.removeEventListener('pointermove', pointerMove);
        root.removeEventListener('pointerleave', pointerLeave);
        if (active) cleanTarget(active.element);
        for (const element of Array.from(transientTargets.keys())) cleanTarget(element);
        queue.length = 0;
        active = null;
        crawler.userTetheredPills.length = 0;
        activeFireworks.length = 0;
        activeShockwaves.length = 0;
        style.remove();
        root.classList.remove('news-spider-paused');
        ctx.clearRect(0, 0, width, height);
        if (previousCanvasStyle === null) canvas.removeAttribute('style');
        else canvas.setAttribute('style', previousCanvasStyle);
        mounts.delete(canvas);
      }
    };
    mounts.set(canvas, api);
    api.resume();
    return api;
  }
  global.NewsSpider = Object.freeze({mount});
})(window);
