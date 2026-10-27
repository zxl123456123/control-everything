/* 奶龙 (naidragon): procedural 3D "Nailong" desk pet for the news reader (design checklist: NAIDRAGON_NOTES.md).
 * One plain-JS file, no assets or libraries: a hand-written WebGL1 renderer draws an ellipsoid rig + one body of revolution,
 * with a Canvas 2D fallback. Lazy-loaded by news-pets.js; same mount API as NewsSpider / NewsMantis plus
 * setStatus({agentsRunning, quotaLeftPercent}), poke(kind) and the action dial. Original geometry/colour/motion only. */
(function (global) {
 'use strict';
 const TAU = Math.PI * 2, PI = Math.PI;
 const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
 const lerp = (a, b, t) => a + (b - a) * t;
 const c01 = v => clamp(v, 0, 1);
 const sgn = v => (v < 0 ? -1 : 1);
 const ease = t => { t = c01(t); return t * t * (3 - 2 * t); };
 const env = (k, a, b, r) => ease((k - a) / r) * (1 - ease((k - b) / r)); // smooth in/hold/out envelope
 function damp(o, target, omega, dt) {
  if (dt <= 0) return o.x;
  const x = omega * dt, e = 1 / (1 + x + .48 * x * x + .235 * x * x * x);
  const change = o.x - target, temp = (o.v + omega * change) * dt;
  o.v = (o.v - omega * temp) * e; o.x = target + (change + temp) * e; return o.x;
 }
 // underdamped spring (jelly): semi-implicit Euler, sub-stepped
 function spring(o, target, k, c, dt) {
  const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
  for (let i = 0; i < n; i++) { o.v += (k * (target - o.x) - c * o.v) * h; o.x += o.v * h; }
  return o.x;
 }
 const sd = (x = 0) => ({x, v: 0});
 const CSS = `
.news-mantis-target.is-being-scanned{outline:2px solid #ffb21f!important;outline-offset:2px!important;box-shadow:0 0 14px rgba(255,190,40,.7),inset 0 0 8px rgba(255,230,140,.35)!important;background:rgba(255,214,90,.2)!important;transition:none!important}
@keyframes ndSnap{0%{transform:scale(1)}30%{transform:scale(1.12) rotate(-1.2deg);box-shadow:0 0 22px #ffc83a,0 0 30px #fff2b0}60%{transform:scale(.96)}100%{transform:scale(1)}}
.news-mantis-target.captured-burst-wobble{animation:ndSnap .6s cubic-bezier(.18,.89,.32,1.28) forwards!important;z-index:15}
.nd-paused .news-mantis-target{animation-play-state:paused!important}
.nd-bubble,.nd-dial,.nd-chip{--nd-bg:var(--nd-paper,var(--paper,#fffdf7));--nd-ink:var(--nd-fg,var(--ink,#2e2a1e));--nd-line:var(--nd-edge,var(--line,#e6dfc9));--nd-gold:var(--nd-accent,#e9a822);--nd-bd:color-mix(in srgb,var(--nd-gold) 55%,var(--nd-line))}
.nd-bubble{position:absolute;left:0;top:0;box-sizing:border-box;background:var(--nd-bg);color:var(--nd-ink);border:1px solid var(--nd-bd);font-family:inherit;box-shadow:0 8px 24px rgba(40,28,4,.16),0 1px 3px rgba(40,28,4,.1);z-index:calc(var(--nd-z,5) + 2);pointer-events:none;width:max-content;max-width:200px;padding:7px 13px;border-radius:14px;font-size:13px;font-weight:600;line-height:1.4;opacity:0;scale:.94;transition:opacity .18s,scale .18s}
.nd-bubble.on{opacity:1;scale:1}
.nd-bubble[data-hold=true]{opacity:0}
.nd-bubble::after{content:"";position:absolute;width:9px;height:9px;background:var(--nd-bg);border:0 solid var(--nd-bd);transform:rotate(45deg)}
.nd-bubble[data-side=top]::after{bottom:-5px;left:var(--tx,50%);margin-left:-4.5px;border-width:0 1px 1px 0}
.nd-bubble[data-side=bottom]::after{top:-5px;left:var(--tx,50%);margin-left:-4.5px;border-width:1px 0 0 1px}
.nd-bubble[data-side=left]::after{right:-5px;top:var(--ty,50%);margin-top:-4.5px;border-width:1px 1px 0 0}
.nd-bubble[data-side=right]::after{left:-5px;top:var(--ty,50%);margin-top:-4.5px;border-width:0 0 1px 1px}
.nd-dial{position:absolute;left:0;top:0;z-index:calc(var(--nd-z,5) + 3);width:216px;height:216px;visibility:hidden;pointer-events:none;user-select:none;touch-action:none;font-family:inherit;color:var(--nd-ink)}
.nd-dial .ring{position:absolute;inset:0;width:216px;height:216px;overflow:visible;pointer-events:none;fill:none;filter:drop-shadow(0 8px 16px rgba(40,28,4,.2))}
.nd-dial .disc{fill:var(--nd-bg);stroke:var(--nd-bd);stroke-width:1.2;pointer-events:auto}
.nd-dial .sec{fill:color-mix(in srgb,var(--nd-gold) 11%,var(--nd-bg));stroke:var(--nd-bg);stroke-width:5;stroke-linejoin:round;pointer-events:auto;cursor:pointer}
.nd-dial .sec[data-f=true]{fill:color-mix(in srgb,var(--nd-gold) 40%,var(--nd-bg))}
.nd-dial .notch{fill:var(--nd-gold)}
.nd-dial button{position:absolute;left:0;top:0;box-sizing:border-box;width:46px;height:46px;margin:-23px 0 0 -23px;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;font:inherit;display:grid;place-items:center;cursor:pointer;pointer-events:auto}
.nd-dial button svg{width:28px;height:28px;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;fill:none}
.nd-dial button:focus-visible{outline:2px solid var(--accent,#c98a00);outline-offset:1px}
.nd-dial .hub,.nd-dial .more{background:var(--nd-bg);border:1px solid var(--nd-bd)}
.nd-dial .hub{left:108px;top:108px;width:76px;height:76px;margin:-38px;font-size:14px;font-weight:700;line-height:1.15}
.nd-dial .more{left:190px;top:190px;width:44px;height:44px;margin:-22px}
.nd-chip{position:absolute;left:0;top:0;z-index:calc(var(--nd-z,5) + 1);display:flex;min-height:0;margin:0;line-height:1;align-items:center;gap:8px;height:26px;box-sizing:border-box;padding:0 11px 0 8px;border-radius:999px;border:1px solid var(--nd-line);background:color-mix(in srgb,var(--nd-bg) 94%,transparent);color:var(--nd-ink);font:inherit;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;box-shadow:0 2px 8px rgba(40,28,4,.1);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .2s,visibility 0s .2s}
.nd-chip[data-hold=true]{opacity:0!important;pointer-events:none!important}
.nd-chip[data-on=true]{opacity:.96;visibility:visible;pointer-events:auto;cursor:pointer;transition-delay:0s}
.nd-chip::after{content:"";position:absolute;inset:-9px}
.nd-chip>span{display:none;align-items:center;gap:5px}
.nd-chip[data-q] .q,.nd-chip[data-a] .a,.nd-chip[data-d] .d{display:inline-flex}
.nd-chip .q svg{width:15px;height:15px;fill:none;stroke-width:2.6}
.nd-chip .trk{stroke:var(--nd-line)}
.nd-chip .arc{stroke:#e0891a;stroke-linecap:round;stroke-dasharray:calc(var(--q,0) * .4084) 41}
.nd-chip[data-q=zero] .arc{stroke:#d64545}
.nd-chip .dot{width:7px;height:7px;border-radius:50%;background:#2fa15a;animation:ndDot 1.6s ease-in-out infinite}
.nd-chip .d{color:#2c8a4f}
.nd-chip:focus-visible{outline:2px solid var(--accent,#c98a00);outline-offset:2px}
@keyframes ndDot{50%{opacity:.35}}
.nd-root[data-nd-theme=dark] :is(.nd-bubble,.nd-dial,.nd-chip){--nd-bg:var(--nd-paper,#2b2618);--nd-ink:var(--nd-fg,#f6eed6);--nd-line:var(--nd-edge,#4d4630)}
.nd-root[data-nd-theme=light] :is(.nd-bubble,.nd-dial,.nd-chip){--nd-bg:var(--nd-paper,#fffdf7);--nd-ink:var(--nd-fg,#2e2a1e);--nd-line:var(--nd-edge,#e6dfc9)}
@media (prefers-reduced-motion:reduce){.nd-bubble,.nd-chip{transition:none}.nd-chip .dot{animation:none}}
.nd-pill{position:absolute;left:0;top:0;z-index:calc(var(--nd-z,5) + 1);pointer-events:none;padding:4px 11px;border-radius:999px;background:#fff7dc;color:#5d3a07;border:2px solid #f5a623;box-shadow:0 3px 9px rgba(120,70,0,.25);font:700 12px/1.2 system-ui,"PingFang SC","Microsoft YaHei",sans-serif;white-space:nowrap;will-change:transform}
.nd-z{position:absolute;left:0;top:0;z-index:calc(var(--nd-z,5) + 2);pointer-events:none;font:800 15px/1 system-ui,sans-serif;color:#d98a12;text-shadow:0 1px 0 #fff;will-change:transform}`;
 const mounts = new WeakMap();
 const COL = {
  top: [1, .885, .355], bot: [1, .85, .325], belly: [1, .93, .72], deep: [1, .86, .325], bump: [.97, .77, .2],
  eye: [.035, .03, .03], iris: [.2, .58, .27], white: [.985, .975, .93], claw: [.5, .27, .12], palm: [1, .66, .66],
  mouth: [.4, .12, .07], tongue: [1, .46, .52], drop: [.55, .82, 1], star: [1, .93, .55], star2: [1, .62, .75], brow: [.5, .27, .06], shadow: [0, 0, 0], crumb: [.86, .58, .24]
 };

 /* ---------- procedural geometry ---------- */
 const KZ = .94, TOP = 111;
 // silhouette authored in Blender (nd_blender/ndmodel.py): monotone cubic through [y, half-width] control points
 const CP = [[0, 0], [.8, 17], [3, 27], [8, 35], [16, 40.5], [26, 43], [36, 42], [46, 38.5], [54, 34.3], [60, 31.6], [65, 31], [71, 32.4], [78, 33.6], [85, 33], [92, 30.6], [98, 27], [103, 21.8], [106, 17.2], [108, 13.2], [109.6, 8.6], [110.6, 4.6], [111, 0]];
 const CD = CP.slice(1).map((c, i) => (c[1] - CP[i][1]) / (c[0] - CP[i][0])), CM = CP.map((c, i) => {
  if (!i || i === CP.length - 1) return CD[i ? i - 1 : 0];
  const h0 = c[0] - CP[i - 1][0], h1 = CP[i + 1][0] - c[0], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
  return CD[i - 1] * CD[i] > 0 ? (w1 + w2) / (w1 / CD[i - 1] + w2 / CD[i]) : 0;
 });
 function profile(y) {
  y = Math.min(111, Math.max(0, y)); let i = 0; while (i < CP.length - 2 && y > CP[i + 1][0]) i++;
  const x0 = CP[i][0], h = CP[i + 1][0] - x0, t = (y - x0) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * CP[i][1] + (t3 - 2 * t2 + t) * h * CM[i] + (3 * t2 - 2 * t3) * CP[i + 1][1] + (t3 - t2) * h * CM[i + 1];
 }
 const dprof = y => (profile(y + .4) - profile(y - .4)) / .8;
 function surf(y, phi, off = 0) { // point + outward normal + tangent on the pear
  const R = profile(Math.min(TOP - .8, Math.max(.8, y))), d = dprof(Math.min(TOP - 1, Math.max(1, y))), cp = Math.cos(phi), sp = Math.sin(phi);
  const ty = [d * cp, 1, KZ * d * sp], tp = [-R * sp, 0, KZ * R * cp];
  let n = [ty[1] * tp[2] - ty[2] * tp[1], ty[2] * tp[0] - ty[0] * tp[2], ty[0] * tp[1] - ty[1] * tp[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
  const tl = Math.hypot(tp[0], tp[1], tp[2]) || 1;
  return {p: [R * cp + n[0] * off, y + n[1] * off, KZ * R * sp + n[2] * off], n, t: [tp[0] / tl, tp[1] / tl, tp[2] / tl]};
 }
 function sphereMesh(lat, lon) {
  const v = [], ix = [];
  for (let i = 0; i <= lat; i++) for (let j = 0; j <= lon; j++) {
   const th = PI * i / lat, ph = TAU * j / lon, x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
   v.push(x, y, z, x, y, z);
  }
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) { const a = i * (lon + 1) + j, b = a + lon + 1; ix.push(a, b, a + 1, a + 1, b, b + 1); }
  return {v: new Float32Array(v), i: new Uint16Array(ix)};
 }
 function pearMesh() {
  const N = 44, S = 52, v = [], ix = [];
  for (let i = 0; i <= N; i++) {
   const y = TOP * (1 - Math.cos(PI * i / N)) / 2;
   for (let j = 0; j <= S; j++) {
    const s = surf(y, TAU * j / S);
    if (i === 0 || i === N) v.push(0, y, 0, 0, i ? 1 : -1, 0); else v.push(s.p[0], s.p[1], s.p[2], s.n[0], s.n[1], s.n[2]);
   }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < S; j++) { const a = i * (S + 1) + j, b = a + S + 1; ix.push(a, a + 1, b, a + 1, b + 1, b); }
  return {v: new Float32Array(v), i: new Uint16Array(ix)};
 }
 function patchMesh(yc, hy, hphi, rings, segs) { // raised cream decal that hugs the pear (offset 0 at its border)
  const v = [], ix = [];
  v.push(...patchVert(yc, hy, hphi, 0, 0));
  for (let r = 1; r <= rings; r++) for (let s = 0; s <= segs; s++) v.push(...patchVert(yc, hy, hphi, r / rings, TAU * s / segs));
  for (let s = 0; s < segs; s++) ix.push(0, 1 + s, 2 + s);
  for (let r = 1; r < rings; r++) for (let s = 0; s < segs; s++) {
   const a = 1 + (r - 1) * (segs + 1) + s, b = a + segs + 1; ix.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return {v: new Float32Array(v), i: new Uint16Array(ix)};
 }
 function patchVert(yc, hy, hphi, rho, tau) {
  const a = rho * Math.cos(tau), b = rho * Math.sin(tau), y = yc + b * hy, phi = PI / 2 + a * hphi;
  const m = 1 - rho * rho, off = .22 + 2.3 * Math.pow(ease(m * 2.2), .9);
  const s = surf(y, phi, off); return [s.p[0], s.p[1], s.p[2], s.n[0], s.n[1], s.n[2]];
 }
 const MESHES = {hi: () => sphereMesh(12, 16), lo: () => sphereMesh(7, 10), tiny: () => sphereMesh(4, 7), pear: pearMesh, patch: () => patchMesh(31, 24, .8, 6, 28)};
 const MESH_IDS = ['hi', 'lo', 'tiny', 'pear', 'patch'];

 /* ---------- parts (one pooled record per ellipsoid / mesh instance) ---------- */
 function newPart() { return {m: new Float32Array(16), n: new Float32Array(9), c: [1, 1, 1], c2: COL.bot, mesh: 'lo', def: 0, mode: 0, a: 1, gloss: .4, grad: 0}; }
 function setPart(p, mesh, col, cx, cy, cz, ax, ay, az, rx, ry, rz, def, mode, a, gloss) {
  const m = p.m, n = p.n;
  m[0] = ax[0] * rx; m[1] = ax[1] * rx; m[2] = ax[2] * rx; m[3] = 0;
  m[4] = ay[0] * ry; m[5] = ay[1] * ry; m[6] = ay[2] * ry; m[7] = 0;
  m[8] = az[0] * rz; m[9] = az[1] * rz; m[10] = az[2] * rz; m[11] = 0;
  m[12] = cx; m[13] = cy; m[14] = cz; m[15] = 1;
  n[0] = ax[0] / rx; n[1] = ax[1] / rx; n[2] = ax[2] / rx; n[3] = ay[0] / ry; n[4] = ay[1] / ry; n[5] = ay[2] / ry;
  n[6] = az[0] / rz; n[7] = az[1] / rz; n[8] = az[2] / rz;
  p.mesh = mesh; p.c = col; p.def = def; p.mode = mode || 0; p.a = a === undefined ? 1 : a; p.gloss = gloss === undefined ? .4 : gloss; p.grad = 0;
  return p;
 }
 const AX = [1, 0, 0], AY = [0, 1, 0], AZ = [0, 0, 1];

 /* ---------- WebGL1 renderer ---------- */
 const VS = `attribute vec3 aP;attribute vec3 aN;uniform mat4 uM,uBase,uVP;uniform mat3 uN;uniform float uDef;uniform vec4 uHead,uJ;uniform vec3 uSq;
varying vec3 vN;varying vec3 vP;varying float vY;
void main(){vec4 lp=uM*vec4(aP,1.);vec3 n=uN*aN;vec3 p=lp.xyz;vY=lp.y;vP=aP;
if(uDef>.5&&uDef<1.5){
float gy=(p.y-32.)/30.;float g=exp(-gy*gy);p.xz*=1.+uJ.z*g+uJ.w*g*.6;p.y+=uJ.w*5.*smoothstep(58.,104.,p.y);
float w=smoothstep(uHead.w-5.,uHead.w+10.,p.y);vec3 q=p-vec3(0.,uHead.w,0.);
float a=uHead.x*w,c=cos(a),s=sin(a);q.xy=vec2(c*q.x-s*q.y,s*q.x+c*q.y);n.xy=vec2(c*n.x-s*n.y,s*n.x+c*n.y);
a=uHead.y*w;c=cos(a);s=sin(a);q.yz=vec2(c*q.y-s*q.z,s*q.y+c*q.z);n.yz=vec2(c*n.y-s*n.z,s*n.y+c*n.z);
a=uHead.z*w;c=cos(a);s=sin(a);q.xz=vec2(c*q.x+s*q.z,-s*q.x+c*q.z);n.xz=vec2(c*n.x+s*n.z,-s*n.x+c*n.z);
p=q+vec3(0.,uHead.w,0.);float h=clamp(p.y/100.,0.,1.);p.x+=uJ.x*h*h;p.z+=uJ.y*h*h;}
vec4 wp=vec4(p,1.);vN=n;
if(uDef>.5&&uDef<1.5){wp=uBase*wp;vN=mat3(uBase)*n;}
if(uDef<1.5){wp.xz*=uSq.x;wp.y=wp.y*uSq.y+uSq.z;}
gl_Position=uVP*wp;}`;
 const FS = `precision mediump float;varying vec3 vN;varying vec3 vP;varying float vY;
uniform vec3 uC,uC2;uniform vec4 uP,uF;
void main(){vec3 N=normalize(vN);
if(uP.x>1.5){float d=length(vP.xz);float a=pow(clamp(1.-d,0.,1.),1.25)*uP.z;gl_FragColor=vec4(.2,.09,0.,.9)*a;return;}
float gk=uP.w;vec3 base=uC;float ao=1.,fe=1.;
if(gk>.5&&gk<1.5){base=mix(uC2,uC,smoothstep(.04,.96,clamp(vY/111.,0.,1.)));
float nk=(vP.y-63.)/6.;ao*=1.-.12*exp(-nk*nk);ao*=mix(.8,1.,smoothstep(0.,15.,vP.y));
float ck=(vP.y-98.)/9.;ao*=1.-.05*exp(-ck*ck)*step(vP.z,0.);}
else if(gk>1.5&&gk<2.5){float ph=atan(vP.z*1.0638,vP.x),a=(ph-1.5708)/.8,b=(vP.y-31.)/24.,r=sqrt(a*a+b*b);fe=1.-smoothstep(.84,1.,r);
base=mix(base*vec3(1.,.95,.84),base,smoothstep(.4,.85,1.-r));ao*=mix(.9,1.,smoothstep(.0,.35,1.-r));}
else if(gk>2.5){ao*=mix(.72,1.,smoothstep(-.95,.15,vP.z));}
float lu=dot(base,vec3(.3,.59,.11));base=mix(base,vec3(lu*.95+.1),uF.x*.5);
if(uP.x>.5){gl_FragColor=vec4(base*uP.z,uP.z);return;}
vec3 L=normalize(vec3(-.42,.78,.55)),V=normalize(vec3(0.,.14,1.));
float nl=dot(N,L),nv=max(dot(N,V),0.);
float wr=clamp((nl+.5)/1.5,0.,1.);float lit=smoothstep(.1,.86,wr);
vec3 col=base*mix(vec3(.94,.79,.6),vec3(1.04,1.03,.98),lit);
float sk=exp(-pow((nl-.05)*2.8,2.));col+=base*vec3(.17,.05,0.)*sk*(.55+.2*step(1.5,gk)*step(gk,2.5));
col+=base*vec3(.045,.06,.1)*max(dot(N,normalize(vec3(.75,.08,.5))),0.);
col+=base*vec3(.12,.06,.01)*max(-N.y,0.);
vec3 H=normalize(L+V);col+=vec3(1.,.97,.88)*pow(max(dot(N,H),0.),30.)*uP.y*.34;
float fr=pow(1.-nv,2.6);float bk=smoothstep(-.1,.7,dot(N,normalize(vec3(.62,.45,-.64))));
col+=vec3(1.,.9,.6)*fr*(.12+uF.y*.5)+vec3(1.,.93,.7)*fr*bk*.34+base*vec3(.25,.08,0.)*fr*.3;
col+=vec3(.22,.14,.0)*uF.z*lit;
float ed=smoothstep(.62,.98,1.-nv);col=mix(col,base*vec3(.92,.7,.34),ed*.34*(1.-uP.y*.4));
col*=ao;float al=uP.z*fe;gl_FragColor=vec4(min(col,vec3(1.))*al,al);}`;
 function createGL(canvas) {
  const opts = {alpha: true, premultipliedAlpha: true, antialias: true, depth: true, powerPreference: 'low-power', preserveDrawingBuffer: true};
  const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (gl.getShaderParameter && !gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (gl.getProgramParameter && !gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const U = {}; for (const n of ['uM', 'uBase', 'uVP', 'uN', 'uDef', 'uHead', 'uJ', 'uSq', 'uC', 'uC2', 'uP', 'uF']) U[n] = gl.getUniformLocation(prog, n);
  const aP = gl.getAttribLocation(prog, 'aP'), aN = gl.getAttribLocation(prog, 'aN');
  const meshes = {}; let tris = 0;
  for (const id of MESH_IDS) {
   const m = MESHES[id](), vb = gl.createBuffer(), ib = gl.createBuffer();
   gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, m.v, gl.STATIC_DRAW);
   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.i, gl.STATIC_DRAW);
   meshes[id] = {vb, ib, n: m.i.length, tris: m.i.length / 3};
  }
  gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aN);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  let cur = null;
  return {
   kind: 'webgl', gl, meshes,
   draw(parts, count, f, w, h) {
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(U.uVP, false, f.vp); gl.uniformMatrix4fv(U.uBase, false, f.base);
    gl.uniform4fv(U.uHead, f.head); gl.uniform4fv(U.uJ, f.jelly); gl.uniform3fv(U.uSq, f.sq); gl.uniform4fv(U.uF, f.fx);
    let t = 0;
    for (let i = 0; i < count; i++) {
     const p = parts[i], mesh = meshes[p.mesh];
     if (mesh !== cur) {
      cur = mesh; gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
      gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 24, 12);
     }
     gl.depthMask(p.mode !== 2 && p.a >= .99);
     gl.uniformMatrix4fv(U.uM, false, p.m); gl.uniformMatrix3fv(U.uN, false, p.n); gl.uniform1f(U.uDef, p.mode === 2 ? 2 : p.def);
     gl.uniform3fv(U.uC, p.c); gl.uniform3fv(U.uC2, p.c2); gl.uniform4f(U.uP, p.mode, p.gloss, p.a, p.grad);
     gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0); t += mesh.tris;
    }
    cur = null; return t;
   },
   dispose() {
    for (const id in meshes) { gl.deleteBuffer(meshes[id].vb); gl.deleteBuffer(meshes[id].ib); }
    gl.deleteProgram(prog);
    const ext = gl.getExtension && gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
   }
  };
 }

 /* ---------- Canvas 2D fallback: the same rig painted as shaded ellipses (no WebGL) ---------- */
 const css = (c, k = 1, a = 1) => `rgba(${Math.round(clamp(c[0] * k, 0, 1) * 255)},${Math.round(clamp(c[1] * k, 0, 1) * 255)},${Math.round(clamp(c[2] * k, 0, 1) * 255)},${a})`;
 function create2D(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const items = [];
  return {
   kind: '2d', ctx, meshes: {},
   draw(parts, count, f, w, h, dpr) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w / dpr, h / dpr);
    const B = f.base, sx = f.sq[0], sy = f.sq[1], hop = f.sq[2], u = f.u; items.length = 0;
    for (let i = 0; i < count; i++) {
     const p = parts[i], m = p.m, d1 = p.def === 1 && p.mode !== 2;
     let cx = m[12], cy = m[13], cz = m[14];
     const ax = [m[0], m[1], m[2]], ay = [m[4], m[5], m[6]], az = [m[8], m[9], m[10]];
     if (d1) {
      const R = v => [B[0] * v[0] + B[4] * v[1] + B[8] * v[2], B[1] * v[0] + B[5] * v[1] + B[9] * v[2], B[2] * v[0] + B[6] * v[1] + B[10] * v[2]];
      const c = R([cx, cy, cz]); cx = c[0] + B[12]; cy = c[1] + B[13]; cz = c[2] + B[14];
      const a = R(ax), b = R(ay), z = R(az); ax[0] = a[0]; ax[1] = a[1]; ax[2] = a[2]; ay[0] = b[0]; ay[1] = b[1]; ay[2] = b[2]; az[0] = z[0]; az[1] = z[1]; az[2] = z[2];
     }
     if (p.def < 2 && p.mode !== 2) { cx *= sx; cz *= sx; cy = cy * sy + hop; for (const v of [ax, ay, az]) { v[0] *= sx; v[1] *= sy; v[2] *= sx; } }
     items.push({p, cx, cy, cz, ax, ay, az, z: cz + (p.mode === 2 ? -999 : 0) + (p.mode === 1 && p.a < 1 ? 999 : 0)});
    }
    items.sort((a, b) => a.z - b.z);
    for (const it of items) {
     const {p, ax, ay, az} = it;
     const X = [ax[0], ay[0], az[0]], Y = [ax[1], ay[1], az[1]];
     const a = X[0] * X[0] + X[1] * X[1] + X[2] * X[2], b = -(X[0] * Y[0] + X[1] * Y[1] + X[2] * Y[2]), c = Y[0] * Y[0] + Y[1] * Y[1] + Y[2] * Y[2];
     const th = .5 * Math.atan2(2 * b, a - c), mid = (a + c) / 2, df = Math.sqrt(Math.max(0, ((a - c) / 2) ** 2 + b * b));
     const r1 = Math.sqrt(Math.max(.01, mid + df)) * u, r2 = Math.sqrt(Math.max(.01, mid - df)) * u;
     const x = f.ox + it.cx * u, y = f.oy - it.cy * u;
     if (p.mesh === 'pear2d') { // body + head as ONE silhouette (no seam): outline traced from the same profile as the 3D lathe
      const tp = (px, py, pz) => [f.ox + (B[0] * px + B[4] * py + B[8] * pz + B[12]) * sx * u, f.oy - ((B[1] * px + B[5] * py + B[9] * pz + B[13]) * sy + hop) * u];
      const ph = Math.atan2(KZ * B[8], B[0]), cph = Math.cos(ph), sph = Math.sin(ph), NS = 64, Ls = [], Rs = [];
      for (let i = 0; i <= NS; i++) { const yy = TOP * (1 - Math.cos(PI * i / NS)) / 2, rr = profile(yy); Ls.push(tp(rr * cph, yy, KZ * rr * sph)); Rs.push(tp(-rr * cph, yy, -KZ * rr * sph)); }
      const b0 = tp(0, 0, 0), b1 = tp(0, TOP, 0), bw = Math.abs(Ls[28][0] - Rs[28][0]) || 1, pale2 = f.fx[0] * .4;
      ctx.beginPath(); ctx.moveTo(Ls[0][0], Ls[0][1]); for (let i = 1; i <= NS; i++) ctx.lineTo(Ls[i][0], Ls[i][1]); for (let i = NS; i >= 0; i--) ctx.lineTo(Rs[i][0], Rs[i][1]); ctx.closePath();
      const lg = ctx.createLinearGradient(b0[0], b0[1], b1[0], b1[1]), c0 = p.c2.map(v => lerp(v, .8, pale2)), c1 = p.c.map(v => lerp(v, .8, pale2));
      lg.addColorStop(.04, css(c0, .98)); lg.addColorStop(.96, css(c1, 1.02)); ctx.fillStyle = lg; ctx.fill();
      ctx.save(); ctx.clip();
      const mx = (b0[0] + b1[0]) / 2, my = b0[1] + (b1[1] - b0[1]) * .5, rad = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) * .62;
      let g = ctx.createRadialGradient(mx - bw * .2, my - (b0[1] - b1[1]) * .1, rad * .05, mx, my, rad);
      g.addColorStop(0, 'rgba(255,248,200,.34)'); g.addColorStop(.5, 'rgba(255,248,200,0)'); g.addColorStop(1, 'rgba(150,80,10,.3)'); ctx.fillStyle = g; ctx.fillRect(mx - rad * 1.3, my - rad * 1.3, rad * 2.6, rad * 2.6);
      g = ctx.createLinearGradient(b0[0], b0[1], b0[0], b0[1] - (b0[1] - b1[1]) * .12); g.addColorStop(0, 'rgba(120,60,0,.22)'); g.addColorStop(1, 'rgba(120,60,0,0)'); ctx.fillStyle = g; ctx.fillRect(mx - bw, b0[1] - (b0[1] - b1[1]) * .12, bw * 2, (b0[1] - b1[1]) * .12);
      const nk = tp(0, 63, 0); g = ctx.createRadialGradient(nk[0], nk[1], 0, nk[0], nk[1], bw * .5); g.addColorStop(0, 'rgba(150,80,10,.10)'); g.addColorStop(1, 'rgba(150,80,10,0)');
      ctx.save(); ctx.translate(nk[0], nk[1]); ctx.scale(1, .22); ctx.translate(-nk[0], -nk[1]); ctx.fillStyle = g; ctx.fillRect(nk[0] - bw, nk[1] - bw, bw * 2, bw * 2); ctx.restore();
      ctx.restore(); continue;
     }
     if (p.mode === 2) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r1); g.addColorStop(0, `rgba(60,25,0,${.38 * p.a})`); g.addColorStop(1, 'rgba(60,25,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r1, Math.max(r2, 1), th, 0, TAU); ctx.fill(); continue;
     }
     const pale = f.fx[0] * .4;
     const col = p.c.map(v => lerp(v, .8, pale));
     ctx.globalAlpha = p.a; ctx.beginPath(); ctx.ellipse(x, y, r1, r2, th, 0, TAU);
     if (p.mode === 1) ctx.fillStyle = css(col);
     else {
      const rr = Math.max(r1, r2), g = ctx.createRadialGradient(x - rr * .32, y - rr * .4, rr * .08, x, y, rr * 1.05);
      g.addColorStop(0, css(col, 1.12)); g.addColorStop(.55, css(col, 1)); g.addColorStop(1, css(col, .72)); ctx.fillStyle = g;
     }
     ctx.fill(); ctx.globalAlpha = 1;
    }
    return 0;
   },
   dispose() {}
  };
 }

 /* ---------- the pet ---------- */
 const STAGE = {look: .55, crouch: .3, pounce: .36, grab: .34, deliver: 2};
 const ACT = ['look', 'crouch', 'pounce', 'grab'];
 const SAY = {
  hello: ['你好呀～', '嗨！我来啦', '早呀～'], click: ['嘿嘿', '哇！', '嘻嘻～', '摸摸头～'], spin: ['转圈圈～', '嗖——'], belly: ['好痒～', '咕噜咕噜', '别拍啦～'],
  grab: ['抓到啦！', '嘿！'], deliver: ['收好咯～', '放好啦！'], agents: ['Agent 开工了！', '我盯着呢！'], quota: ['额度快没啦…', '肚子饿扁了…', '有点慌…'], sad: ['额度用完了…', '呜呜…'], done: ['完成啦！', '搞定～'],
  drag: ['放我下来～', '呜哇～'], land: ['噗！', '啪叽'], yawn: ['困困…'], sleep: ['呼…'], surprise: ['哇！！'], wake: ['诶？'], point: ['这条！', '看这里～'], tongue: ['略略略～', '嘿嘿～'], dance: ['我是奶龙～', '摇起来！'], munch: ['好吃！', '再来一口～']
 };

// CSP-safe: constructable sheets bypass style-src (inline <style> is blocked on /workspace); <style> stays the fallback.
function installStyle(root, css, nonce) {
 try { const sc = root.getRootNode(); if (!nonce && Array.isArray(sc.adoptedStyleSheets)) { const sh = new CSSStyleSheet(); sh.replaceSync(css); sc.adoptedStyleSheets = [...sc.adoptedStyleSheets, sh]; return {remove() { sc.adoptedStyleSheets = sc.adoptedStyleSheets.filter(s => s !== sh); }}; } } catch (e) { /* use <style> */ }
 const el = document.createElement('style'); if (nonce) el.setAttribute('nonce', String(nonce)); el.textContent = css; root.appendChild(el); return el;
}
 function mount({root, canvas, depot, onCapture, onDelivered, onCancel, onAction, actions, dock, followPointer = false, options, styleNonce}) {
  if (!root || !canvas || !depot || !root.contains(canvas) || !root.contains(depot)) {
   throw new TypeError('NewsNaidragon requires root, canvas and depot in the same stage');
  }
  if (mounts.has(canvas)) mounts.get(canvas).destroy();
  let sizeKey = '', seenDpr = 1, width = 1, height = 1, dpr = 1, bw = 1, bh = 1, boxKey = '', placed = false, ox = 0, oy = 0;
  let running = false, destroyed = false, rafId = null, timerId = null, lastFrame = null, frames = 0, ready = false, lostGL = false;
  let simTime = 0, speedMul = 1, sc = 1, sleepAfter = 28, collecting = false, patrolN = 0, dwell = 0, wpt = null, lastEl = null, interval = 33;
  let seed = 20261026, tris = 0, lastBubbleAt = -99;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const opt = {tilt: true, status: true, dial: true, dock: 'auto', margin: 12};
  const status = {agentsRunning: false, agentCount: 0, quotaLeftPercent: null};
  const pointer = {inside: false, x: 0, y: 0, moved: 0, down: false};
  const queue = [], transient = new Map(), perf = {n: 0, ms: 0, max: 0};
  let active = null, probe = null, probeTarget = null, probeT = 0, suppressClick = false;
  const previousStyle = canvas.getAttribute('style');
  const style = installStyle(root, CSS, styleNonce);
  // embedding: the stage must be a positioned box; every overlay is scoped by .nd-root and the --nd-z / --nd-* custom properties
  const rootPos0 = root.style.position, rootTheme0 = root.getAttribute('data-nd-theme'); let rootPosSet = false;
  if (global.getComputedStyle && global.getComputedStyle(root).position === 'static') { root.style.position = 'relative'; rootPosSet = true; }
  root.classList.add('nd-root');

  // renderer: private WebGL canvas first (so the reader's canvas stays usable by other pets), else 2D on the reader canvas
  let gcv = null, R = null, rendererKind = 'none';
  const place3d = el => {
   const s = el.style; s.position = 'absolute'; s.left = '0'; s.top = '0'; s.right = 'auto'; s.bottom = 'auto'; s.zIndex = 'var(--nd-z, 5)';
   s.pointerEvents = 'none'; s.willChange = 'transform'; el.setAttribute('aria-hidden', 'true');
  };
  try {
   gcv = document.createElement('canvas'); gcv.setAttribute('data-nd', 'gl'); place3d(gcv);
   R = createGL(gcv);
  } catch (e) { R = null; }
  if (R) { rendererKind = 'webgl'; canvas.parentNode.insertBefore(gcv, canvas.nextSibling); canvas.style.display = 'none'; }
  else {
   gcv = null; place3d(canvas);
   try { R = create2D(canvas); } catch (e) { R = null; }
   rendererKind = R ? 'canvas2d-fallback' : 'none';
  }
  let cvs = gcv || canvas, cs = cvs.style, used2d = !gcv;
  // WebGL context lost: keep the pet alive on the host canvas with the 2D painter; when the browser restores the context, go back to WebGL
  const onLost = e => {
   if (e && e.preventDefault) e.preventDefault();
   lostGL = true; if (destroyed || !gcv || rendererKind !== 'webgl') return;
   let r2 = null; try { canvas.style.display = ''; place3d(canvas); r2 = create2D(canvas); } catch (err) { r2 = null; }
   if (r2) { used2d = true; R = r2; rendererKind = 'canvas2d-fallback'; gcv.style.display = 'none'; cvs = canvas; cs = canvas.style; lostGL = false; boxKey = ''; resize(); }
   else { R = null; canvas.style.display = 'none'; }
  };
  const onRestored = () => {
   if (destroyed || !gcv) return;
   let r = null; try { r = createGL(gcv); } catch (err) { r = null; }
   if (!r) { lostGL = rendererKind === 'webgl'; return; }
   if (rendererKind === 'canvas2d-fallback') { try { const c2 = canvas.getContext('2d'); if (c2) { c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, canvas.width, canvas.height); } } catch (err) {} canvas.style.display = 'none'; }
   R = r; rendererKind = 'webgl'; lostGL = false; gcv.style.display = ''; cvs = gcv; cs = gcv.style; boxKey = ''; resize();
  };
  if (gcv && gcv.addEventListener) { gcv.addEventListener('webglcontextlost', onLost); gcv.addEventListener('webglcontextrestored', onRestored); }

  const dcv = document.createElement('canvas');
  const dctx = typeof dcv.getContext === 'function' ? dcv.getContext('2d') : null;
  if (dctx) {
   dcv.setAttribute('aria-hidden', 'true');
   Object.assign(dcv.style, {position: 'absolute', pointerEvents: 'none', zIndex: 'calc(var(--nd-z, 5) - 1)', left: '0', top: '0'});
   root.insertBefore(dcv, canvas);
  }
  const bubbleEl = document.createElement('div'); bubbleEl.className = 'nd-bubble'; bubbleEl.setAttribute('aria-hidden', 'true'); root.appendChild(bubbleEl);
  const MN = {el: null, open: false}, reduced = typeof global.matchMedia === 'function' ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const OV = {gap: 14, pad: 8, rects: {}, chipKey: '', done: 0, bubble: {w: 0, h: 0, side: null}, menu: {side: null}, chip: {w: 0, h: 0, side: null}};
  // small status chip beside the pet: quota ring while the quota is low, a running-agents count, a short "done" tick; hidden otherwise
  const chipEl = document.createElement('button'); chipEl.type = 'button'; chipEl.className = 'nd-chip'; chipEl.dataset.on = 'false'; chipEl.tabIndex = -1; chipEl.setAttribute('aria-hidden', 'true');
  const chipPart = (cls, text) => { const s = document.createElement('span'); s.className = cls; if (text !== undefined) s.textContent = text; return s; };
  const SVGNS = 'http:' + '//www.w3.org/2000/svg', svgEl = (tag, attrs, kids) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (kids || []).forEach(c => e.appendChild(c)); return e; };
  const chipQ = chipPart('q'), chipQt = chipPart('t', '');
  chipQ.appendChild(svgEl('svg', {viewBox: '0 0 16 16', 'aria-hidden': 'true'}, [svgEl('circle', {class: 'trk', cx: 8, cy: 8, r: 6.5}), svgEl('g', {transform: 'rotate(-90 8 8)'}, [svgEl('circle', {class: 'arc', cx: 8, cy: 8, r: 6.5})])]));
  chipQ.appendChild(chipQt);
  const chipA = chipPart('a'), chipAt = chipPart('t', ''), chipDot = document.createElement('b'); chipDot.className = 'dot'; chipA.append(chipDot, chipAt);
  const chipD = chipPart('d', '✓ 已完成');
  chipEl.append(chipQ, chipA, chipD); root.appendChild(chipEl);
  let hostActions = Array.isArray(actions) ? actions.filter(a => a && a.label) : [];

  function localRect(el) {
   const r = el.getBoundingClientRect(), st = root.getBoundingClientRect();
   return {left: r.left - st.left - root.clientLeft, top: r.top - st.top - root.clientTop, width: r.width, height: r.height};
  }
  function targetPosition(item) {
   const el = item.element;
   if (!el.isConnected || !root.contains(el) || el.hidden || el.offsetWidth <= 0 || el.offsetHeight <= 0) return null;
   const vis = global.getComputedStyle(el);
   if (vis.display === 'none' || vis.visibility === 'hidden' || vis.visibility === 'collapse') return null;
   const rect = localRect(el);
   let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
   let right = Math.min(width, rect.left + rect.width), bottom = Math.min(height, rect.top + rect.height);
   for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
    const o = global.getComputedStyle(p), pr = localRect(p);
    if (/^(auto|scroll|hidden|clip)$/.test(o.overflowX)) { left = Math.max(left, pr.left + p.clientLeft); right = Math.min(right, pr.left + p.clientLeft + p.clientWidth); }
    if (/^(auto|scroll|hidden|clip)$/.test(o.overflowY)) { top = Math.max(top, pr.top + p.clientTop); bottom = Math.min(bottom, pr.top + p.clientTop + p.clientHeight); }
   }
   if (right <= left || bottom <= top) return null;
   return {id: item.id, el, text: item.label, x: (left + right) / 2, y: (top + bottom) / 2, rect: {left, top, width: right - left, height: bottom - top}};
  }
  const cancelReason = item => item.element.isConnected && root.contains(item.element) ? 'not-visible' : 'detached';
  function cleanTarget(el) {
   if (!el) return;
   el.classList.remove('news-mantis-target', 'is-being-scanned', 'captured-burst-wobble'); transient.delete(el);
  }
  function notifyCancel(item, reason) { cleanTarget(item.element); if (typeof onCancel === 'function') onCancel({id: item.id, reason}); }

  const P = {x: 0, y: 0, face: 1, yaw: sd(0), yawBase: 0, spin: 0, spd: sd(), vx: 0, vy: 0, hop: 0, hv: 0, air: false, sq: sd(), wig: 0, stage: null, stageT: 0, phase: 'idle', pvx: 0, pvy: 0};
  const M = {
   roll: sd(), lean: sd(), nod: sd(), headYaw: sd(), headTilt: sd(), eyeX: sd(), eyeY: sd(), alert: sd(), quota: sd(), sad: sd(), busyT: 3, hungryT: 2, doneQ: false, carry: sd(), sleep: sd(),
   crouch: sd(), wave: sd(), point: sd(), pat: sd(), sit: sd(), lie: sd(), ground: sd(1), eyeO: sd(1), mouth: sd(), smile: sd(.6), happy: sd(), worry: sd(), spike: sd(), tailW: sd(), tailAmp: sd(.3),
   shx: sd(), shz: sd(), bulge: sd(), breath: sd(), cheek: [sd(), sd()], arm: [sd(.58), sd(.58)], tongue: sd(), tdrop: sd(), tcurl: sd(), cheekP: sd(), dance: sd(), munch: sd(), armF: [sd(), sd()], tail: [sd(), sd(), sd()], dang: sd(), dangV: 0, kick: sd(), surprise: sd(),
   legK: [sd(), sd()], feet: [], pills: [], fx: [], z: [], blink: 0, nextBlink: 2.4, dbl: 0, nextAct: 3.2, act: null, actT: 0, idleT: 0, wasAlert: false, wasQuota: false, bang: 0,
   stepSide: 0, walkBob: sd(), gait: {w: sd(), tm: 1, period: .34, last: 1, n: 0, cph: 0, sq: 0}, drag: null, dragT: 0, release: 0, talk: 0, bubbleT: 0, bubbleText: '', hello: false, sleepWake: false, wasSleep: false, moving: false, standing: false,
   look: null, aim: null, dest: null, tailT: 0, zT: 0, tipPx: [{x: 0, y: 0}, {x: 0, y: 0}], lastCheck: 0, dHop: false, sleepSide: 1, clicks: 0, clickT: 0
  };
  const unit = () => sc * .78 * (.9 + .22 * c01(P.y / Math.max(1, height)));
  function bounded(x, y) {
   const u = unit(), mx = Math.min(46 * u, width / 3);
   return {x: clamp(x, mx, width - mx), y: clamp(y, Math.min(46 * u, height / 3), height - 4)};
  }
  function resize() {
   if (destroyed) return;
   const w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight), nd = Math.min(2, global.devicePixelRatio || 1);
   // the stage changed size (window resize, re-parenting): a resting pet follows its home corner, any other pose is just kept inside
   const sized = sizeKey !== '' && sizeKey !== w + 'x' + h, rest = sized && (() => { const o = home(); return Math.hypot(P.x - o.x, P.y - o.y) < 10 * unit(); })();
   sizeKey = w + 'x' + h; seenDpr = global.devicePixelRatio || 1;
   width = w; height = h;
   const umax = sc * .82 * 1.12, nw = Math.ceil(225 * umax), nh = Math.ceil(232 * umax), key = [nw, nh, nd].join();
   if (key !== boxKey) {
    boxKey = key; placed = false; bw = nw; bh = nh; dpr = nd;
    cvs.width = Math.round(bw * dpr); cvs.height = Math.round(bh * dpr);
    cs.width = bw + 'px'; cs.height = bh + 'px';
   }
   updateDock(); lair.update(true);
   if (sized) { const t = rest ? home() : bounded(P.x, P.y); place(t.x, t.y); }
  }

  const lair = {
   hubX: 0, hubY: 0, w: 130, h: 110, wobble: 0, phase: 0, prey: [], dirty: true, key: '', dpr: 1,
   update(force) {
    const r = localRect(depot), cx = r.left + r.width / 2, cy = r.top + r.height / 2, w = Math.round(Math.min(150, r.width || 130)), h = Math.round(Math.min(130, r.height || 110));
    this.hubX = cx; this.hubY = cy;
    const key = [Math.round(cx - w / 2), Math.round(cy - h / 2), w, h, dpr].join();
    if (force && dctx && key !== this.key) {
     this.key = key; this.w = w; this.h = h;
     if (dcv.width !== Math.round(w * dpr) || dcv.height !== Math.round(h * dpr)) { dcv.width = Math.round(w * dpr); dcv.height = Math.round(h * dpr); }
     dcv.style.width = w + 'px'; dcv.style.height = h + 'px';
     dcv.style.transform = `translate3d(${Math.round(cx - w / 2)}px,${Math.round(cy - h / 2)}px,0)`; this.dirty = true;
    }
   },
   stash(pill) {
    this.wobble = Math.min(1.5, this.wobble + 1);
    this.prey.push({id: pill.id, text: pill.text, ang: ((this.prey.length) * 2.399) % TAU, ring: .45 + (this.prey.length % 3) * .22, born: simTime});
    if (this.prey.length > 12) this.prey.shift();
    this.dirty = true;
   },
   step(dt) {
    if (this.wobble > .005) { this.wobble *= Math.pow(.06, dt); this.phase += dt * 12; this.dirty = true; } else if (this.wobble) { this.wobble = 0; this.dirty = true; }
   },
   draw() { // a soft round cushion nest with the delivered headlines as little chips
    if (!dctx || !this.dirty) return; this.dirty = false;
    const c = dctx, w = this.w, h = this.h, x = w / 2, y = h * .56, rx = Math.min(w * .44, 62), ry = rx * .46, t = simTime;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    const wob = Math.sin(this.phase) * this.wobble * 2.2;
    c.fillStyle = 'rgba(110,60,0,.16)'; c.beginPath(); c.ellipse(x, y + ry * .55, rx * 1.04, ry * .6, 0, 0, TAU); c.fill();
    const g = c.createRadialGradient(x - rx * .25, y - ry * .5, 2, x, y, rx * 1.1);
    g.addColorStop(0, '#fff3c6'); g.addColorStop(.6, '#ffe08a'); g.addColorStop(1, '#f6b93b');
    c.fillStyle = g; c.strokeStyle = 'rgba(214,140,20,.75)'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(x, y + wob * .3, rx, ry, 0, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(214,140,20,.45)'; c.setLineDash([4, 5]); c.beginPath(); c.ellipse(x, y + wob * .3, rx * .78, ry * .66, 0, 0, TAU); c.stroke(); c.setLineDash([]);
    c.font = '700 9px system-ui,"PingFang SC","Microsoft YaHei",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const p of this.prey) {
     const a = p.ang, px = x + Math.cos(a) * rx * p.ring * 1.05, py = y + Math.sin(a) * ry * p.ring * .9 + wob * .4;
     const age = c01((t - p.born) / .4), label = Array.from(p.text).slice(0, 4).join(''), tw = c.measureText(label).width + 9;
     c.fillStyle = '#fffaf0'; c.strokeStyle = '#f5a623'; c.lineWidth = 1.4;
     c.beginPath(); c.roundRect(px - tw / 2, py - 6.5 * age, tw, 13 * age, 6.5); c.fill(); c.stroke();
     if (age > .8) { c.fillStyle = '#6b3f08'; c.fillText(label, px, py + .5); }
    }
   }
  };
  const depotHome = () => bounded(lair.hubX, lair.hubY + 22 * unit());
  // the host can name a resting spot (stage coords) that stays clear of the reading text; carrying/delivering still goes to the depot
  const dockPos = {x: 0, y: 0, ok: false};
  function updateDock() { if (typeof dock !== 'function') return; let d = null; try { d = dock(); } catch (e) {} dockPos.ok = Boolean(d && Number.isFinite(d.x) && Number.isFinite(d.y)); if (dockPos.ok) { dockPos.x = d.x; dockPos.y = d.y; } }
  const home = () => {
   if (opt.dock !== 'auto') { // a fixed corner of the stage (floating-widget / sidebar embedding); wins over the host dock() callback
    const u = unit(), m = opt.margin, x = opt.dock[1] === 'l' ? m + 44 * u : width - m - 44 * u, y = opt.dock[0] === 't' ? m + 108 * u : height - m;
    return bounded(x, y);
   }
   return dockPos.ok ? bounded(dockPos.x, dockPos.y) : depotHome();
  };

  function place(x, y) {
   P.x = x; P.y = y; P.spd.x = 0; P.pvx = P.vx = 0; P.pvy = P.vy = 0;
   M.feet = [-1, 1].map(side => ({side, ax: x, ay: y, sx: x, sy: y, tx: x, ty: y, t: 1, step: false, lift: 0, dur: .2}));
   for (const f of M.feet) { const s = slot(f.side, unit()); f.ax = f.sx = f.tx = s.x; f.ay = f.sy = f.ty = s.y; f.az = f.sz = f.tz = s.z; f.pitch = 0; }
  }
  function slot(side, u) {
   const ps = P.yaw.x, cy = Math.cos(ps), sy = Math.sin(ps);
   return {x: P.x + (side * 17 * cy + 7 * sy) * u, y: P.y, z: -side * 17 * sy + 19 * cy};
  }
  function say(key, force, ms = 2300) {
   const arr = SAY[key] || [key];
   if (!force && simTime - lastBubbleAt < 4.5) return;
   lastBubbleAt = simTime; M.bubbleText = arr[Math.floor(rnd() * arr.length)]; M.bubbleT = ms / 1000;
   bubbleEl.textContent = M.bubbleText; bubbleEl.classList.add('on'); OV.bubble.w = 0;
  }
  function spark(x, y, n = 8, kind = 'spark') {
   for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, s = 45 + rnd() * 80;
    M.fx.push({k: kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0, max: .6 + rnd() * .4, pink: rnd() < .35, s: .8 + rnd() * .7});
   }
  }
  function wake() { M.idleT = 0; if (M.sleep.x > .05) { M.act = null; M.sleepWake = true; } }
  function land() {
   const imp = Math.abs(P.hv), u = unit();
   if (imp > 90) { P.sq.v += imp * .014; M.bulge.v += imp * .05; M.shx.v += rnd() * 60 - 30; M.kick.v += imp * .01; spark(P.x, P.y - 4 * u, 3, 'puff'); }
   if (M.release && imp > 160) { P.hv = imp * .36; P.hop = .5; M.release--; return; }
   P.hop = 0; P.hv = 0; P.air = false; M.release = 0;
  }
  function poke(kind) {
   if (destroyed) return false;
   const u = unit();
   if (typeof kind === 'string' && kind.slice(0, 5) === 'view:') { P.spin = +kind.slice(5) || 0; P.yawBase = P.spin; M.spinning = 0; }
   else if (kind === 'hop') { if (!P.air) { P.hv = 330; P.air = true; P.sq.v -= 3.5; P.wig = .8; M.happy.x = 1; spark(P.x + 20 * u, P.y - 92 * u, 4); } wake(); say('click', true); }
   else if (kind === 'wave') { M.act = 'wave'; M.actT = 0; wake(); }
   else if (kind === 'spin') { if (!M.spinning) { P.spin += TAU; P.yawBase += TAU; M.spinning = 1; P.hv = 300; P.air = true; P.sq.v -= 3; M.happy.x = 1; M.mouth.v += 4; spark(P.x, P.y - 60 * u, 6); say('spin', true); } wake(); }
   else if (kind === 'belly') { M.act = 'pat'; M.actT = 0; M.bulge.v += 38; wake(); say('belly', true); }
   else if (kind === 'surprise') { P.hv = 440; P.air = true; P.sq.v -= 4.5; M.surprise.x = 1; M.mouth.x = 1; M.eyeO.x = 1.35; M.bang = 1; spark(P.x, P.y - 100 * u, 5); wake(); say('surprise', true); }
   else if (kind === 'wiggle') { P.wig = 1.3; M.happy.x = 1; M.tailAmp.x = .9; M.act = 'wiggle'; M.actT = 0; wake(); }
   else if (kind === 'tongue') { M.act = 'tongue'; M.actT = 0; M.happy.x = 1; M.kick.v += 3; wake(); say('tongue', true); }
   else if (kind === 'dance') { M.act = 'dance'; M.actT = 0; wake(); say('dance', true, 2600); }
   else if (kind === 'munch') { M.act = 'munch'; M.actT = 0; wake(); say('munch', true, 2400); }
   else if (kind === 'yawn') { M.act = 'yawn'; M.actT = 0; }
   else if (kind === 'plop') { M.act = 'plop'; M.actT = 0; P.sq.v += 5; M.bulge.v += 14; wake(); }
   else if (kind === 'tilt') { M.act = 'tilt'; M.actT = 0; wake(); }
   else if (kind === 'blink') { M.blink = 1e-3; }
   else if (kind === 'sleep') { M.idleT = sleepAfter + 1; }
   else if (kind === 'wake') { wake(); M.idleT = 0; }
   else if (kind === 'bubble') say('hello', true);
   else return false;
   return true;
  }
  const aimFor = (tg, sdr, ax) => {
   const u = unit(), r = tg.rect, x = clamp(ax, r.left + 5, r.left + r.width - 5);
   return {aim: {x, y: tg.y}, stand: bounded(x - sdr * 82 * u, tg.y + 42 * u), land: bounded(x - sdr * 42 * u, tg.y + 42 * u)};
  };

  /* ---------- pointer interaction: click hop / double-click spin / belly pat / drag-dangle ---------- */
  function toLocal(e) { const st = root.getBoundingClientRect(); return {x: e.clientX - st.left - root.clientLeft, y: e.clientY - st.top - root.clientTop}; }
  function hit(x, y) { const u = unit(); return Math.pow((x - P.x) / (38 * u), 2) + Math.pow((y - (P.y - 52 * u - P.hop * u)) / (54 * u), 2) < 1; }
  function pointerMove(e) {
   if (e.pointerType && e.pointerType !== 'mouse') { pointer.inside = false; return; }
   const l = toLocal(e), x = l.x, y = l.y;
   pointer.moved += Math.hypot(x - pointer.x, y - pointer.y);
   pointer.x = x; pointer.y = y; pointer.inside = x >= 0 && x <= width && y >= 0 && y <= height;
   if (pointer.moved > 90 && M.sleep.x > .3 && Math.hypot(x - P.x, y - P.y) < 150 * unit()) { wake(); say('wake', true); }
   if (pointer.down && !M.drag && Math.hypot(x - pointer.down.x, y - pointer.down.y) > 6) startDrag();
  }
  const pointerLeave = () => { pointer.inside = false; };
  function pointerDown(e) {
   if (destroyed || (e.button !== undefined && e.button !== 0) || (e.isPrimary === false)) return;
   const t = e.target;
   if (t && t.closest && ((MN.el && MN.el.contains(t)) || chipEl.contains(t) || (!root.contains(t) && t.closest('[aria-modal="true"],dialog[open]')))) return;
   if (!root.clientWidth || !root.clientHeight || document.hidden) return;
   const l = toLocal(e);
   if (!hit(l.x, l.y)) return;
   if (e.stopPropagation) e.stopPropagation();
   pointer.down = {x: l.x, y: l.y, t: performance.now(), belly: l.y > P.y - 62 * unit() && l.y < P.y - 8 * unit()};
   pointer.x = l.x; pointer.y = l.y; suppressClick = true; wake();
   if (e.preventDefault) e.preventDefault();
   global.addEventListener('pointerup', pointerUp); global.addEventListener('pointercancel', pointerUp);
  }
  function pointerUp() {
   global.removeEventListener('pointerup', pointerUp); global.removeEventListener('pointercancel', pointerUp);
   const d = pointer.down; pointer.down = false;
   setTimeout(() => { suppressClick = false; }, 60);
   if (destroyed || !d) return;
   if (M.drag) { endDrag(); return; }
   const now = performance.now();
   if (now - M.clickT < 380) { M.clickT = 0; closeMenu(); poke('spin'); }
   else { M.clickT = now; if (d.belly) poke('belly'); else poke('hop'); if (hostActions.length && opt.dial) toggleMenu(); }
  }
  /* action dial beside the pet: click a sector, or drag / wheel the ring and click the hub to confirm; the corner toggle flips pages (max 6 sectors) */
  const DW = 216, DC = 108, RI = 40, RO = 92, RB = 66;
  const K = k => () => poke(k), MORE = [['pat', '拍肚皮', 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z', K('belly')], ['nap', '午睡', 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z', K('sleep')],
   ['dance', '跳舞', 'M9 18V6l11-2v12 M9 18a3 3 0 1 1-6 0a3 3 0 0 1 6 0z M20 16a3 3 0 1 1-6 0a3 3 0 0 1 6 0z', K('dance')],
   ['status', '状态', 'M5 20V11 M12 20V5 M19 20v-7', () => { const q = status.quotaLeftPercent, n = status.agentCount; wake(); say((q === null ? '额度未知' : '额度剩余 ' + Math.round(q) + '%') + ' · ' + n + ' 个运行中', true, 3400); }]].map(a => ({id: a[0], label: a[1], icon: a[2], run: a[3]}));
  const DL = {page: 0, f: 0, rot: sd(0), o: sd(0), items: [], btns: [], secs: [], cx: 0, cy: 0, drag: null, sw: false, wh: 0, fi: -1, lr: 9, vis: false};
  const modn = (a, n) => (a % n + n) % n, stepA = () => TAU / DL.items.length, focusIdx = () => modn(Math.round(-DL.rot.x / stepA()), DL.items.length);
  // hit-test relative to the dial centre: hub / ring sector (by angle + rotation) / outside
  function dialHit(dx, dy) {
   const r = Math.hypot(dx, dy), n = DL.items.length;
   if (r < RI) return {zone: 'hub', i: focusIdx()};
   if (r > RO) return {zone: 'out', i: -1};
   const s = stepA(); return {zone: 'ring', i: Math.floor(modn(Math.atan2(dy, dx) + Math.PI / 2 - DL.rot.x + s / 2, TAU) / s) % n};
  }
  const pt = (r, a) => (DC + r * Math.cos(a)).toFixed(0) + ' ' + (DC + r * Math.sin(a)).toFixed(0);
  function sectorD(w) { const a = -w / 2, b = w / 2, g = w > Math.PI ? 1 : 0, r = RI + 3; return 'M' + pt(r, a) + 'L' + pt(RO, a) + 'A' + RO + ' ' + RO + ' 0 ' + g + ' 1 ' + pt(RO, b) + 'L' + pt(r, b) + 'A' + r + ' ' + r + ' 0 ' + g + ' 0 ' + pt(r, a) + 'Z'; }
  const iconSvg = d => svgEl('svg', {viewBox: '0 0 24 24', 'aria-hidden': 'true'}, [svgEl('path', {d: String(d || 'M12 5v14M5 12h14')})]);
  function dialBtn(cls, label, d) { const b = document.createElement('button'); b.className = cls; b.setAttribute('role', 'menuitem'); b.setAttribute('aria-label', label); if (d) b.appendChild(iconSvg(d)); return b; }
  function setPage(p) {
   if (!MN.el) return;
   DL.btns.concat(DL.secs).forEach(e => e.remove());
   DL.page = p; DL.items = (p ? MORE : hostActions).slice(0, 6); DL.btns = []; DL.secs = []; DL.f = DL.rot.x = DL.rot.v = 0; DL.fi = -1; DL.lr = 9; DL.o.x = Math.min(DL.o.x, .82);
   const d = sectorD(stepA() - .045);
   DL.items.forEach((a, i) => {
    const sec = svgEl('path', {d, class: 'sec'}), b = dialBtn('', a.label, a.icon); b.dataset.i = String(i); b.tabIndex = MN.open ? 0 : -1;
    DL.g.appendChild(sec); MN.el.appendChild(b); DL.secs.push(sec); DL.btns.push(b);
   });
   DL.tog.setAttribute('aria-label', p ? '返回' : '更多'); DL.tgp.setAttribute('d', p ? 'M14 6l-6 6 6 6' : 'M5 12h.01 M12 12h.01 M19 12h.01');
   updateDial(0, true);
  }
  function buildMenu() {
   if (MN.el) { MN.el.remove(); MN.el = null; }
   if (!hostActions.length || destroyed) return;
   const el = MN.el = document.createElement('div'); el.className = 'nd-dial'; el.setAttribute('role', 'menu'); el.setAttribute('aria-label', '奶龙转盘'); el.dataset.open = String(MN.open);
   DL.g = svgEl('g', {}); DL.hub = dialBtn('hub', '确认'); DL.tog = dialBtn('more', '更多', 'M5 12h.01'); DL.tgp = DL.tog.children[0].children[0];
   el.append(svgEl('svg', {viewBox: '0 0 216 216', class: 'ring', 'aria-hidden': 'true'}, [svgEl('circle', {cx: DC, cy: DC, r: RO + 3, class: 'disc'}), DL.g, svgEl('path', {d: 'M101 1h14l-7 11z', class: 'notch'})]), DL.hub, DL.tog);
   DL.hub.addEventListener('click', e => { e.stopPropagation(); if (DL.sw) DL.sw = false; else if (DL.items[focusIdx()]) chooseAction(DL.items[focusIdx()], focusIdx()); });
   DL.tog.addEventListener('click', e => { e.stopPropagation(); dialPage(); });
   el.addEventListener('pointerdown', dialDown); el.addEventListener('pointermove', dialMove); el.addEventListener('pointerup', dialUp); el.addEventListener('pointercancel', dialUp);
   el.addEventListener('click', dialClick); el.addEventListener('wheel', dialWheel, {passive: false});
   root.appendChild(el); OV.menu.side = null; DL.vis = false; DL.page = 0; setPage(0);
  }
  function dialPage() { if (!MN.el) return false; setPage(1 - DL.page); return true; }
  function dialRotate(k) { if (!MN.el) return false; DL.f += k; if (DL.btns.includes(document.activeElement)) DL.btns[modn(DL.f, DL.items.length)].focus({preventScroll: true}); return true; }
  function updateDial(dt, force) {
   const el = MN.el; if (!el) return;
   const rm = reduced && reduced.matches, n = DL.items.length, s = stepA();
   const T = (o, t, k, c) => rm ? (o.x = t, o.v = 0) : spring(o, t, k, c, dt);
   T(DL.o, +MN.open, 300, 21); if (!DL.drag) T(DL.rot, -DL.f * s, 230, 24);
   const vis = MN.open || DL.o.x > .02; if (vis !== DL.vis) { DL.vis = vis; el.style.visibility = vis ? 'visible' : 'hidden'; }
   if (!vis && !force) return;
   const fi = focusIdx();
   if (force || Math.abs(DL.rot.x - DL.lr) > 5e-4) {
    DL.lr = DL.rot.x;
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * s + DL.rot.x; DL.secs[i].setAttribute('transform', 'rotate(' + (a * 180 / Math.PI).toFixed(1) + ' ' + DC + ' ' + DC + ')'); DL.btns[i].style.transform = 'translate(' + (DC + RB * Math.cos(a)).toFixed(1) + 'px,' + (DC + RB * Math.sin(a)).toFixed(1) + 'px)'; }
   }
   if (force || fi !== DL.fi) {
    DL.fi = fi; DL.secs.forEach((e, i) => { e.dataset.f = String(i === fi); }); DL.hub.textContent = DL.items[fi].label; DL.hub.setAttribute('aria-label', '确认:' + DL.items[fi].label);
   }
  }
  function openMenu(focus) {
   if (destroyed || !hostActions.length || !opt.dial) return false;
   if (!MN.el) buildMenu();
   MN.open = true; MN.el.dataset.open = 'true'; if (DL.page) setPage(0); DL.f = DL.rot.x = DL.rot.v = 0; DL.btns.concat(DL.hub, DL.tog).forEach(b => { b.tabIndex = 0; }); wake();
   // The render loop reveals the dial on its next frame; a hidden element cannot take focus, so reveal it now.
   if (focus && DL.btns[0]) { if (!DL.vis) { DL.vis = true; MN.el.style.visibility = 'visible'; } DL.btns[0].focus({preventScroll: true}); }
   return true;
  }
  function closeMenu() {
   if (!MN.open) return false;
   MN.open = false; DL.drag = null; if (MN.el) { MN.el.dataset.open = 'false'; DL.btns.concat(DL.hub, DL.tog).forEach(b => { b.tabIndex = -1; }); if (MN.el.contains(document.activeElement)) document.activeElement.blur(); }
   return true;
  }
  function toggleMenu(focus) { return MN.open ? !closeMenu() : openMenu(focus); }
  function chooseAction(a, index) {
   const detail = {id: a.id || String(index), label: a.label, index}; closeMenu(); say(a.label, true, 1300);
   try { if (typeof a.run === 'function') a.run(detail); } catch (e) {}
   try { if (typeof onAction === 'function') onAction(detail); } catch (e) {}
   try { root.dispatchEvent(new CustomEvent('news-pet-action', {detail})); } catch (e) {}
  }
  const dialXY = e => { const l = toLocal(e); return {x: l.x - DL.cx, y: l.y - DL.cy}; };
  function dialDown(e) {
   DL.sw = false; if (!MN.open || (e.button !== undefined && e.button !== 0)) return;
   const p = dialXY(e), r = Math.hypot(p.x, p.y); if (r < RI || r > RO) return;
   DL.drag = {a: Math.atan2(p.y, p.x), moved: 0, on: false}; try { MN.el.setPointerCapture(e.pointerId); } catch (x) {}
  }
  function dialMove(e) {
   const d = DL.drag; if (!d) return;
   const p = dialXY(e), a = Math.atan2(p.y, p.x); let da = a - d.a; da -= TAU * Math.round(da / TAU); d.a = a; d.moved += Math.abs(da) * Math.hypot(p.x, p.y);
   if (!d.on && d.moved > 7) { d.on = true; DL.sw = true; wake(); }
   if (d.on) { DL.rot.x += da; DL.rot.v = 0; }
  }
  function dialUp() { const d = DL.drag; DL.drag = null; if (d && d.on) DL.f = Math.round(-DL.rot.x / stepA()); }
  function dialClick(e) {
   if (e.stopPropagation) e.stopPropagation();
   if (DL.sw) { DL.sw = false; return; }
   const t = e.target, p = dialXY(e), g = e.clientX || e.clientY ? dialHit(p.x, p.y) : null, i = g && g.zone === 'ring' ? g.i : t && t.dataset && t.dataset.i !== undefined ? +t.dataset.i : -1;
   if (DL.items[i]) chooseAction(DL.items[i], i);
  }
  function dialWheel(e) { if (!MN.open) return; if (e.preventDefault) e.preventDefault(); DL.wh += e.deltaY || 0; if (Math.abs(DL.wh) >= 40) { dialRotate(DL.wh > 0 ? 1 : -1); DL.wh = 0; } }
  // arrows only act while the dial is open
  function onMenuKey(e) {
   if (destroyed || !MN.open) return;
   if (e.key === 'Escape') { if (closeMenu()) e.preventDefault(); return; }
   if (/^Arrow(Left|Right)$/.test(e.key)) { e.preventDefault(); dialRotate(e.key === 'ArrowRight' ? 1 : -1); }
   else if (/^Arrow(Up|Down)$/.test(e.key)) { e.preventDefault(); dialPage(); }
  }
  function onMenuOutside(e) { if (MN.open && MN.el && !MN.el.contains(e.target) && !(chipEl && chipEl.contains(e.target))) { const l = toLocal(e); if (!hit(l.x, l.y)) closeMenu(); } }
  if (hostActions.length) buildMenu();
  const clickGuard = e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } };
  function startDrag() {
   const u = unit();
   M.drag = {ox: pointer.x - P.x, lastX: pointer.x, lastY: pointer.y, vx: 0};
   M.act = null; P.air = false; P.hop = 0; P.hv = 0; M.dang.x = 0; M.dang.v = 0; P.stage = P.stage; say('drag', true, 2400); M.surprise.x = .6;
   spark(P.x, P.y - 100 * u, 3);
  }
  function endDrag() {
   const u = unit(), th = M.dang.x;
   P.x += 108 * u * Math.sin(th) * .6; P.y -= 108 * u * (1 - Math.cos(th)) * .6;
   const b = bounded(P.x, P.y); P.x = b.x; P.y = b.y;
   M.roll.x = th * .5; M.roll.v = M.dang.v * .3; M.dang.x = 0; M.dang.v = 0; M.drag = null;
   P.hop = 28; P.hv = 0; P.air = true; M.release = 2; P.spd.x = 0; M.happy.x = .8;
   for (const f of M.feet) { const s = slot(f.side, u); f.ax = f.sx = f.tx = s.x; f.ay = f.sy = f.ty = s.y; f.az = f.sz = f.tz = s.z; f.step = false; f.t = 1; f.pitch = 0; }
  }

  function simulate(dt) {
   const t = simTime += dt, spd = speedMul, u = unit();
   lair.step(dt);
   for (const [el, ticks] of transient) { if (ticks <= dt * 60) cleanTarget(el); else transient.set(el, ticks - dt * 60); }
   probeTarget = probe && (probeT -= dt) > 0 ? targetPosition(probe) : null;
   if (!probeTarget && probe) { probe.element.classList.remove('news-spider-probe'); probe = null; }
   while (!active && queue.length && !destroyed && !M.drag) {
    const next = queue.shift(), tg = targetPosition(next);
    if (tg) { active = next; active.target = tg; active.side = sgn(tg.x - P.x); active.ax = P.x + active.side * 40 * u; P.stage = 'approach'; P.stageT = 0; wake(); }
    else notifyCancel(next, cancelReason(next));
   }
   if (destroyed) return;
   if (active && P.stage !== 'carry' && P.stage !== 'deliver') {
    const tg = targetPosition(active);
    if (!tg) { const c = active; active = null; P.stage = null; clearPills(); notifyCancel(c, cancelReason(c)); if (destroyed) return; }
    else active.target = tg;
   }
   const tg = active && active.target;
   let look = null, dest = null, standing = false, aim = null, faceDir = 0, calm = true;
   const T = {point: 0, crouch: 0, lean: 0, wave: 0, pat: 0, mouth: 0, smile: .62, sit: 0, lie: 0, happy: 0, tail: .3, tailSpd: 4.4, spike: 0, tongue: 0, cheek: 0, dance: 0, munch: 0, tilt: 0, nodAdd: 0, eyeC: 0, worry: 0, wig: 0, surprise: 0};
   if (M.drag) { calm = false; standing = true; }
   else if (active && P.stage === 'approach') {
    const s = aimFor(tg, active.side, active.ax); dest = s.stand; aim = s.aim; look = tg; calm = false; T.point = .55; T.tail = .45; T.tailSpd = 7;
    if (Math.hypot(P.x - dest.x, P.y - dest.y) < 6 * u && Math.abs(P.spd.x) < 14) { P.stage = 'look'; P.stageT = 0; tg.el.classList.add('news-mantis-target', 'is-being-scanned'); say('point', true, 1500); }
   }
   if (active && ACT.includes(P.stage) && !M.drag) {
    P.stageT += dt * spd; standing = true; calm = false; look = tg; faceDir = active.side;
    const s = aimFor(tg, active.side, active.ax); aim = s.aim; tg.el.classList.add('news-mantis-target');
    if (P.stage !== 'pounce') dest = P.stage === 'look' || P.stage === 'crouch' ? s.stand : s.land;
    if (P.stage === 'look') {
     T.point = 1; T.lean = .12; T.tail = .6; T.tailSpd = 9; T.spike = .6; T.smile = .8;
     if (P.stageT >= STAGE.look) { P.stage = 'crouch'; P.stageT = 0; }
    } else if (P.stage === 'crouch') {
     T.crouch = 1; T.lean = -.14; T.tail = .85; T.tailSpd = 16; T.point = 0; T.wig = .5; T.smile = .9; T.eyeC = -.2;
     if (P.stageT >= STAGE.crouch) {
      P.stage = 'pounce'; P.stageT = 0; P.hv = 360; P.air = true; P.sq.v -= 4; M.pounceFrom = {x: P.x, y: P.y}; M.pounceTo = s.land;
     }
    } else if (P.stage === 'pounce') {
     const k = ease(P.stageT / STAGE.pounce), a = M.pounceFrom, b = M.pounceTo;
     P.x = lerp(a.x, b.x, k); P.y = lerp(a.y, b.y, k); dest = b; T.point = 1; T.lean = .5; T.mouth = .45; T.surprise = .3;
     if (P.stageT >= STAGE.pounce) { P.stage = 'grab'; P.stageT = 0; P.sq.v += 3.5;
      tg.el.classList.remove('is-being-scanned'); tg.el.classList.add('captured-burst-wobble'); transient.set(tg.el, 90);
      spark(aim.x, aim.y, 9);
      addPill({id: active.id, text: active.label, x: aim.x, y: aim.y});
      say('grab', true, 1500);
      if (typeof onCapture === 'function') onCapture({id: active.id, label: active.label});
      if (destroyed || !active) return;
     }
    } else if (P.stage === 'grab') {
     T.point = 1 - ease(P.stageT / STAGE.grab) * .6; T.lean = .3; T.happy = 1; T.mouth = .3; T.smile = 1; T.tail = .7; T.tailSpd = 12;
     if (P.stageT >= STAGE.grab) { P.stage = 'carry'; P.stageT = 0; active.target = null; }
    }
   }
   if (active && P.stage === 'carry' && !M.drag) { dest = depotHome(); look = dest; calm = false; T.tail = .55; T.tailSpd = 8; T.smile = .85; }
   if (!active && !M.drag) {
    if (P.stage === 'deliver') {
     P.stageT += dt; dest = depotHome(); standing = true; calm = false; faceDir = 0; T.happy = 1; T.smile = 1; T.mouth = .6; T.tail = .9; T.tailSpd = 14; T.wig = .6;
     T.wave = P.stageT > .5 && P.stageT < 1.9 ? 1 : 0;
     if (P.stageT > .12 && !M.dHop) { M.dHop = true; poke('hop'); spark(P.x, P.y - 100 * u, 8); say('deliver', true, 1700); }
     if (P.stageT > STAGE.deliver) { P.stage = null; M.dHop = false; }
    } else if (probeTarget) {
     if (!probe.side) { probe.side = sgn(probeTarget.x - P.x); probe.ax = P.x + probe.side * 40 * u; }
     const s = aimFor(probeTarget, probe.side, probe.ax); dest = dockPos.ok ? home() : s.stand; aim = s.aim; look = probeTarget; calm = false;
     const near = Math.hypot(P.x - dest.x, P.y - dest.y) < 6 * u; faceDir = near ? (dockPos.ok ? sgn(probeTarget.x - P.x) : probe.side) : 0; standing = near;
     T.point = near ? 1 : .35; T.lean = near ? .15 : 0; T.tail = .5; T.spike = .4; M.probeAim = aim;
    } else if (followPointer && pointer.inside) {
     const sdr = sgn(P.x - pointer.x); dest = bounded(pointer.x + sdr * 70 * u, pointer.y + 30 * u); look = pointer; calm = false;
    } else if (MN.open) { dest = {x: P.x, y: P.y}; standing = true;
    } else if (collecting) {
     calm = false;
     if (!wpt) wpt = waypoint();
     dest = wpt;
     if (Math.hypot(P.x - wpt.x, P.y - wpt.y) < 6 * u) {
      standing = true; dwell += dt;
      if (wpt.el) { const tt = targetPosition({id: 'w', element: wpt.el, label: ''}); if (tt) look = {x: tt.x, y: tt.y}; T.point = .7; T.lean = .1; }
      if (dwell > 1.4 + rnd() * .1) { dwell = 0; wpt = null; }
     }
    } else dest = home();
   }
   if (active && P.stage === 'carry' && !M.drag) {
    const h = depotHome();
    if (Math.hypot(h.x - P.x, h.y - P.y) < 10 * unit()) {
     const done = active;
     for (const p of M.pills) { lair.stash(p); if (p.el) p.el.remove(); }
     M.pills = []; P.stage = 'deliver'; P.stageT = 0; M.dHop = false; active = null;
     if (typeof onDelivered === 'function') onDelivered({id: done.id, label: done.label});
    }
   }
   if (destroyed) return;
   const wasPhase = P.phase;
   P.phase = M.drag ? 'dangling' : P.stage === 'carry' ? 'carry' : P.stage === 'deliver' ? 'deliver' : P.stage === 'approach' ? 'approach' : ACT.includes(P.stage) ? P.stage
    : probe ? 'probe' : (followPointer && pointer.inside) ? 'follow' : collecting ? 'patrol' : M.sleep.x > .6 ? 'sleep' : 'idle';
   if (P.phase !== wasPhase && wasPhase === 'sleep') M.idleT = 0;

   // status moods
   const alertOn = !!status.agentsRunning, pct = status.quotaLeftPercent;
   const qT = pct === null || pct === undefined || !Number.isFinite(pct) ? 0 : (pct < 20 ? clamp(.55 + (20 - pct) / 20, 0, 1) : 0);
   const sadT = pct !== null && pct !== undefined && Number.isFinite(pct) && pct <= .5 ? 1 : 0;
   damp(M.alert, alertOn ? 1 : 0, 5, dt); damp(M.quota, qT, 3, dt); damp(M.sad, sadT, 2.5, dt);
   damp(M.carry, P.stage === 'carry' || P.stage === 'grab' ? 1 : 0, 9, dt);
   if (alertOn && !M.wasAlert) { M.bang = 1.2; wake(); say('agents', true, 2100); M.kick.v += 4; }
   if (sadT && !M.wasSad) { wake(); say('sad', true, 2800); M.act = null; }
   else if (qT > .5 && !M.wasQuota && !sadT) { wake(); say('quota', true, 2400); }
   M.wasAlert = alertOn; M.wasQuota = qT > .5; M.wasSad = !!sadT;
   if (M.quota.x > .5 && M.sad.x < .5 && M.sleep.x < .3 && (M.hungryT -= dt) <= 0) { M.hungryT = 3.2 + rnd() * 1.6; M.bulge.v += 9; M.nod.v += 1.2; }
   if (alertOn && !M.act && !active && !M.drag && !P.air && M.sleep.x < .2 && M.quota.x < .5) { if ((M.busyT -= dt) <= 0) { M.busyT = 5 + rnd() * 2; M.act = 'wiggle'; M.actT = 0; } } else if (!alertOn) M.busyT = 3;
   if (M.doneQ) {
    M.doneQ = false; OV.done = 4; wake(); say('done', true, 2600);
    if (M.sad.x < .5 && !active && !M.drag) { M.act = 'dance'; M.actT = 0; M.nextAct = 4.5; M.kick.v += 3; spark(P.x, P.y - 96 * u, 10); }
   }
   if (M.bang > 0) M.bang -= dt;
   updateChip(dt);
   T.spike = Math.max(T.spike, M.alert.x * 1.1 + (M.bang > 0 ? .4 : 0));
   T.worry = M.quota.x; T.smile = lerp(T.smile, -.7, M.quota.x); T.tail = lerp(T.tail, .12, M.quota.x * .8);
   const busy = !calm || M.alert.x > .3 || M.quota.x > .3;
   M.idleT = busy || P.air ? 0 : M.idleT + dt;
   const sleepy = M.idleT > sleepAfter && !M.sleepWake;
   if (M.sleepWake && M.sleep.x < .06) M.sleepWake = false;
   damp(M.sleep, sleepy ? 1 : 0, sleepy ? 1.5 : 6, dt);
   if (sleepy && !M.wasSleep && M.sleep.x < .3) { M.act = 'yawn'; M.actT = 0; say('yawn', true, 2000); }
   M.wasSleep = sleepy;
   M.nextBlink -= dt;
   if (M.nextBlink <= 0 && M.blink === 0 && M.sleep.x < .5) { M.blink = 1e-3; M.dbl = rnd() < .22 ? 1 : 0; M.nextBlink = 2.2 + rnd() * 3.4; }
   if (M.blink > 0) { M.blink += dt / .17; if (M.blink >= 1) { M.blink = M.dbl ? 1e-3 : 0; M.dbl = 0; } }
   M.nextAct -= dt;
   if (calm && !M.act && M.sleep.x < .2 && M.quota.x < .5 && M.nextAct <= 0 && Math.abs(P.spd.x) < 4 && !P.air) {
    const r = rnd(); M.act = r < .16 ? 'wave' : r < .28 ? 'tilt' : r < .4 ? 'look' : r < .52 ? 'pat' : r < .6 ? 'wiggle' : r < .7 ? 'tongue' : r < .78 ? 'dance' : r < .85 ? 'munch' : r < .93 ? 'yawn' : 'plop'; M.actT = 0; M.nextAct = 3.2 + rnd() * 4.2;
    if (M.act === 'wave') say('hello');
   }
   let lookT = null;
   if (M.act) {
    M.actT += dt; const a = M.act, k = M.actT;
    if (a === 'wave') { T.wave = 1; T.smile = 1; T.happy = .6; T.tilt = .12; T.tail = .6; T.tailSpd = 8; if (k > 2.5) M.act = null; }
    else if (a === 'tilt') { T.tilt = .34 * sgn(Math.sin(seed)); T.nodAdd = -.06; T.eyeC = -.15; if (k > 1.8) M.act = null; }
    else if (a === 'look') { lookT = {x: P.x + Math.sin(k * 2.1) * 140, y: P.y - 70 * u + Math.cos(k * 1.6) * 24}; if (k > 2.6) M.act = null; }
    else if (a === 'pat') { T.pat = 1; T.happy = .5; T.smile = 1; T.tail = .5; T.tilt = .06; T.mouth = .2; if (Math.floor(k * 3.4) !== Math.floor((k - dt) * 3.4) && k > .35) { M.bulge.v += 26; M.shx.v += rnd() * 30 - 15; M.cheek[0].v += 20; M.cheek[1].v += 20; } if (k > 2.2) M.act = null; }
    else if (a === 'wiggle') { T.wig = 1; T.happy = 1; T.tail = .9; T.tailSpd = 15; T.smile = 1; T.mouth = .3; if (k > 1.4) M.act = null; }
    else if (a === 'tongue') { const te = env(k, .2, 2.05, .5); T.tongue = te; T.smile = 1; T.happy = .9; T.mouth = 0; T.tilt = .26 * sgn(Math.sin(seed)) * te + Math.sin(k * 8) * .04 * te; T.tail = .7; T.tailSpd = 9; if (k > 2.5) M.act = null; }
    else if (a === 'dance') { T.dance = 1; T.happy = 1; T.smile = 1; T.mouth = .3 + .2 * Math.sin(k * 6.4); T.tail = 1; T.tailSpd = 13; T.tilt = .24 * Math.sin(k * 6.4); T.nodAdd = Math.abs(Math.sin(k * 6.4)) * -.1; if (Math.floor(k * 6.4 / PI) !== Math.floor((k - dt) * 6.4 / PI)) { M.bulge.v += 16; M.shx.v += 16 * (Math.floor(k * 6.4 / PI) % 2 ? 1 : -1); P.sq.v -= .9; } if (k > 3.4) M.act = null; }
    else if (a === 'munch') { const mw = env(k, .12, 2.3, .4), kc = Math.max(0, k - .12) * 2.9, cyc = .5 - .5 * Math.cos(kc * TAU); /* jaw cycle: 0 closed .. 1 open */ T.munch = mw; T.happy = .7 * mw; T.smile = lerp(.62, .8, mw); T.mouth = mw * (.06 + .62 * cyc); T.cheek = mw * (.25 + .6 * (1 - cyc)); T.nodAdd = mw * .05 * cyc; T.eyeC = .45 * mw; T.tail = .3 + .3 * mw; if (Math.floor(kc) !== Math.floor(Math.max(0, k - dt - .12) * 2.9) && k > .5 && k < 2.2) { M.bulge.v += 1.5; spark(P.x + 6 * u, P.y - 62 * u, 2, 'crumb'); } if (k > 2.8) M.act = null; }
    else if (a === 'yawn') { const yw = env(k, .2, 1.45, .55); T.mouth = yw; T.eyeC = .85 * env(k, .3, 1.4, .45); T.nodAdd = -.22 * yw; T.smile = .62 * (1 - yw); T.tilt = .05 * yw; if (k > 2.2) M.act = null; }
    else if (a === 'plop') { T.sit = 1; T.happy = .4; T.smile = .9; T.tail = .5; if (k > 3.6) { M.act = null; P.hv = 120; P.air = true; P.sq.v -= 3; } }
    if (!calm && !(M.act === 'wave' && P.stage === 'deliver')) M.act = null;
   }
   if (M.act) calm = calm && true;
   if (M.sleep.x > .02) { T.sit = Math.max(T.sit, c01(M.sleep.x * 2.2)); T.lie = c01((M.sleep.x - .62) * 3); T.eyeC = Math.max(T.eyeC, c01((M.sleep.x - .3) * 3)); T.smile = Math.max(T.smile, .25); T.tail = lerp(T.tail, .06, M.sleep.x); }
   if (M.sad.x > .02) { const s = M.sad.x; T.sit = Math.max(T.sit, .85 * s); T.smile = lerp(T.smile, -1, s); T.worry = Math.max(T.worry, s); T.eyeC = Math.max(T.eyeC, .32 * s); T.nodAdd += .16 * s; T.tail = lerp(T.tail, .03, s); T.happy = lerp(T.happy, 0, s); T.dance = T.wig = 0; }
   if (alertOn) lookT = lookT || {x: P.x + Math.sin(t * 1.3) * 170, y: P.y - 82 * u + Math.sin(t * .9) * 22};
   if (!look && pointer.inside && M.sleep.x < .5 && Math.hypot(pointer.x - P.x, pointer.y - P.y) < 280 * u) look = pointer;
   look = look || lookT;
   if (!look) look = {x: P.x + P.face * 100, y: P.y - 70 * u};
   if (M.drag) { look = {x: pointer.x, y: pointer.y + 60 * u}; }

   // locomotion
   const dx = dest ? dest.x - P.x : 0, dy = dest ? dest.y - P.y : 0, dd = Math.hypot(dx, dy);
   const tired = 1 - .25 * M.quota.x - .2 * M.alert.x - .4 * M.sleep.x;
   const vmax = 92 * spd * tired * (P.stage === 'carry' ? .9 : 1) * Math.sqrt(unit());
   const grounded = !P.air && !M.drag && M.sit.x < .5 && M.lie.x < .2;
   const go = dest && !standing && dd > 3 * u && grounded && M.sleep.x < .8 ? Math.min(vmax, dd * 4) : 0;
   damp(P.spd, go, 7, dt);
   if (M.drag) {
    const dr = M.drag, ty = pointer.y + 108 * u * .98, tx = pointer.x - dr.ox * 0;
    const ax0 = P.x, ay0 = P.y;
    P.x += (tx - P.x) * Math.min(1, dt * 22); P.y += (ty - P.y) * Math.min(1, dt * 22);
    const vx = (P.x - ax0) / Math.max(dt, 1e-3), acc = (vx - dr.vx) / Math.max(dt, 1e-3); dr.vx = vx;
    const L = 80 * u;
    M.dang.v += (-(1500 / L) * Math.sin(M.dang.x) - 6 * M.dang.v - clamp(acc, -9000, 9000) / L * Math.cos(M.dang.x)) * dt;
    M.dang.x = clamp(M.dang.x + M.dang.v * dt, -1.3, 1.3);
    dr.lastX = pointer.x; dr.lastY = pointer.y;
    P.spd.x = 0;
   } else if (dest && dd > 1e-3 && P.stage !== 'pounce') { const k = P.spd.x * dt / dd; P.x += dx * k; P.y += dy * k * .9; }
   let want = faceDir || (Math.abs(dx) > 5 * u && go > 0 ? sgn(dx) : P.face);
   if (want !== P.face && !M.drag) { P.face = want; P.yawBase = P.spin + (M.sleep.x < .5 ? 0 : 0); P.sq.v += 1.5; M.shx.v += -sgn(want) * 25; }
   P.vx = (P.x - P.pvx) / Math.max(dt, 1e-3); P.vy = (P.y - P.pvy) / Math.max(dt, 1e-3); P.pvx = P.x; P.pvy = P.y;
   const walking = Math.abs(P.vx) + Math.abs(P.vy) > 8 && !P.air && !M.drag;
   damp(M.gait.w, !P.air && !M.drag ? c01((Math.hypot(P.vx, P.vy) - 6) / 36) : 0, 6, dt); const gw = M.gait.w.x;
   // yaw: 3/4 turn toward travel direction, front-facing when idle
   let yawT = P.spin + P.face * lerp(.15, .62, standing && faceDir ? 1 : gw);
   if (M.sleep.x > .3) yawT = P.spin + P.face * .3;
   if (M.act === 'tilt' || M.act === 'wave' || M.act === 'pat' || M.act === 'yawn' || M.act === 'tongue' || M.act === 'dance' || M.act === 'munch') yawT = P.spin + P.face * .08;
   if (M.drag) yawT = P.spin;
   damp(P.yaw, yawT, M.spinning ? 7 : 7.5, dt);
   if (M.spinning && Math.abs(P.yaw.x - P.spin) < .08 && !P.air) { M.spinning = 0; const base = P.spin; P.spin = 0; P.yaw.x -= base; P.yawBase = 0; }
   // air + squash
   if (P.air) {
    P.hv -= 2000 * dt; P.hop += P.hv * dt;
    if (P.hop <= 0 && P.hv < 0) land();
   }
   P.wig = Math.max(0, P.wig - dt * 1.1);
   spring(P.sq, M.gait.sq * .05 + T.crouch * .3 + M.sit.x * .12 + M.sleep.x * .05 + clamp(P.hv / 1300, -.15, .15) * (P.air ? -1 : 0), 340, 15, dt);
   P.sq.x = clamp(P.sq.x, -.42, .45);
   // jelly drivers (acceleration)
   const ax = (P.vx - (M.pvx || 0)) / Math.max(dt, 1e-3), ay = (P.vy - (M.pvy || 0)) / Math.max(dt, 1e-3); M.pvx = P.vx; M.pvy = P.vy;
   spring(M.shx, clamp(-ax * .0035, -9, 9), 150, 7.5, dt);
   spring(M.shz, 0, 150, 7, dt);
   spring(M.bulge, clamp(ay * .0005, -.2, .2) * 0, 190, 6.5, dt);
   spring(M.kick, 0, 220, 9, dt);
   M.bulge.x = clamp(M.bulge.x, -.3, .3) * 1;
   for (let i = 0; i < 2; i++) spring(M.cheek[i], 0, 170, 6, dt);
   stepFeet(dt, u, walking, grounded);
   damp(M.lean, T.lean + clamp(P.spd.x / 230, 0, .22), 9, dt);
   damp(M.crouch, T.crouch, 14, dt);
   damp(M.point, T.point, 10, dt); damp(M.wave, T.wave, 7, dt); damp(M.pat, T.pat, 8, dt);
   damp(M.sit, T.sit, 6, dt); damp(M.lie, T.lie, 3.2, dt);
   damp(M.ground, grounded || P.stage === 'crouch' ? 1 : 0, 16, dt);
   damp(M.happy, T.happy, 3.2, dt);
   damp(M.worry, T.worry, 5, dt); damp(M.spike, T.spike, 9, dt);
   damp(M.surprise, T.surprise, 6, dt); damp(M.tongue, T.tongue, 7, dt); damp(M.dance, T.dance, 8, dt); damp(M.munch, T.munch, 7, dt);
   // tongue lag (droop, curl) and cheek puff: critically damped followers of the same envelopes, so nothing pops between states
   damp(M.tdrop, M.tongue.x * (.5 + .4 * c01(-M.nod.x * 3)), 5, dt); damp(M.tcurl, M.tongue.x * (Math.sin(t * 6.2) * .55 + clamp(M.headTilt.x * 2.4, -.7, .7)), 7, dt); damp(M.cheekP, T.cheek, T.cheek > 0 ? 8 : 14, dt);
   damp(M.tailAmp, T.tail, 6, dt);
   M.tailPhase = (M.tailPhase || 0) + dt * T.tailSpd;
   // head / eyes
   const ang = Math.atan2(look.x - P.x, 140 * u), body = P.yaw.x - P.spin;
   const hy = M.drag ? 0 : clamp(ang * .4 * (M.act === 'tongue' || M.act === 'dance' || M.act === 'munch' || M.act === 'wave' ? .3 : 1) - body * .72, -.55, .55), hn = clamp((look.y - (P.y - 84 * u)) / (210 * u), -.5, .45);
   damp(M.headYaw, hy * (M.sleep.x > .4 ? .2 : 1), 11, dt);
   damp(M.nod, hn * .7 + T.nodAdd + M.sleep.x * .45 + T.crouch * .12 + T.point * .12, 9, dt);
   damp(M.headTilt, T.tilt + gw * Math.sin(M.gait.cph) * .02 + M.sleep.x * .12 - M.quota.x * .1, 8, dt);
   damp(M.eyeX, clamp((look.x - P.x) / (150 * u), -1, 1) * (M.sleep.x > .4 ? 0 : 1), 12, dt);
   damp(M.eyeY, clamp((look.y - (P.y - 84 * u)) / (150 * u), -1, 1) * (M.sleep.x > .4 ? 0 : -1), 12, dt);
   const blinkW = M.blink > 0 ? Math.sin(c01(M.blink) * PI) : 0;
   damp(M.eyeO, 1 + M.surprise.x * .3 + M.alert.x * .08 - Math.max(T.eyeC, blinkW) * 1.1 + (M.happy.x > .5 ? -.35 * M.happy.x : 0), 26, dt);
   damp(M.mouth, Math.max(T.mouth, M.drag ? .8 : 0, M.surprise.x * .7, M.bubbleT > 0 ? .07 + .09 * Math.abs(Math.sin(t * 8.6) * Math.sin(t * 2.3 + 1)) : 0), 8.5, dt);
   damp(M.smile, M.drag ? -.2 : T.smile, 7, dt);
   // roll: waddle sway / wiggle / lie / dangle
   const sway = M.stepSide * .11 * gw;
   const wob = Math.sin(t * 22) * P.wig * .12 + Math.sin(t * 17) * T.wig * .1 + Math.sin(t * 6.4) * .13 * M.dance.x;
   spring(M.roll, sway + wob, 130, 11, dt);
   M.look = look; M.aim = aim; M.dest = dest; M.standing = standing; M.moving = walking;
   // arm springs
   for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1, waving = side === -1 && M.wave.x > .02;
    let th = .58 + M.walkBob.x * 0, fw = .2;
    th += M.stepSide * -side * .3 * gw;
    th += M.alert.x * .5 * (side === -1 ? 1 : 1) + M.surprise.x * 1.2 + (P.air ? .9 : 0) + (M.drag ? 1.5 + Math.sin(t * 14 + i * 2) * .5 : 0);
    th = lerp(th, 2.65, M.carry.x * (P.stage === 'carry' || P.stage === 'grab' ? 1 : 0));
    if (waving) { th = lerp(th, 2.6 + Math.sin(t * 10) * .32, M.wave.x); }
    if (M.dance.x > .02) th = lerp(th, 2.15 + Math.sin(t * 6.4 + i * PI) * .7, M.dance.x);
    th += (T.crouch ? -.4 : 0) * 0 + M.quota.x * .5 * 0;
    if (T.crouch) { th = -.25; fw = -.2; }
    spring(M.arm[i], th, 170, 10 + (waving ? 2 : 0), dt); spring(M.armF[i], fw, 160, 10, dt);
   }
   // tail segments
   const wagBase = Math.sin(M.tailPhase) * M.tailAmp.x;
   for (let i = 0; i < 3; i++) spring(M.tail[i], wagBase * (1 + i * .5) - P.vx * .0035 * (i + 1) + M.shx.x * .012, 120 - i * 20, 6.5, dt);
   // fx
   if (M.sleep.x > .6) { M.zT -= dt; if (M.zT <= 0) { M.zT = 1.2; addZ(); } }
   for (let i = M.fx.length - 1; i >= 0; i--) { const f = M.fx[i]; f.life += dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.k === 'spark' || f.k === 'crumb') f.vy += 120 * dt; if (f.k === 'puff') { f.vx *= .93; f.vy *= .93; } if (f.life >= f.max) M.fx.splice(i, 1); }
   for (let i = M.z.length - 1; i >= 0; i--) { const z = M.z[i]; z.life += dt; z.x += 9 * dt; z.y -= 16 * dt; if (z.life > 2.4) { z.el.remove(); M.z.splice(i, 1); } }
   if (M.bubbleT > 0) { M.bubbleT -= dt; if (M.bubbleT <= 0) bubbleEl.classList.remove('on'); }
   for (const p of M.pills) tether(p, dt, u);
  }

  function waypoint() {
   const u = unit(), els = Array.from(root.querySelectorAll('.title-row-title,#article-title,#article-summary,#article-body p'));
   const pool = els.filter(el => el !== lastEl && targetPosition({id: 'w', element: el, label: ''}));
   if (!dockPos.ok && pool.length && patrolN % 4 !== 3) {
    const el = pool[Math.floor(rnd() * pool.length)], tg = targetPosition({id: 'w', element: el, label: ''}), r = tg.rect;
    lastEl = el; patrolN++;
    return {...bounded(r.left + 40 * u + rnd() * Math.max(1, r.width - 80 * u), r.top + 14 * u), el};
   }
   patrolN++; lastEl = null;
   if (dockPos.ok) return patrolN % 2 ? bounded(dockPos.x + (rnd() - .7) * 150 * u, dockPos.y + (rnd() - .5) * 16 * u) : bounded(lair.hubX + (rnd() - .3) * 110, lair.hubY + 18 * u + (rnd() - .5) * 30);
   return bounded(lair.hubX + (rnd() - .3) * 150, lair.hubY + 18 * u + (rnd() - .5) * 40);
  }
  // Phase-driven gait: alternating swing feet on a cadence that follows ground speed; the stance foot stays pinned in world space.
  function stepFeet(dt, u, walking, grounded) {
   const g = M.gait, gw = g.w.x, sp = Math.hypot(P.vx, P.vy), vd = sp > 1 ? [P.vx / sp, P.vy / sp] : [P.face, 0];
   let swinging = null;
   g.tm += dt;
   for (const f of M.feet) {
    const s = slot(f.side, u);
    if (!grounded) { f.ax = f.tx = f.sx = s.x; f.ay = f.ty = f.sy = s.y; f.az = f.tz = f.sz = s.z; f.step = false; f.lift = 0; f.pitch = 0; continue; }
    if (f.step) {
     f.t += dt / f.dur; swinging = f;
     if (f.t >= 1) { f.t = 1; f.step = false; f.ax = f.tx; f.ay = f.ty; f.az = f.tz; f.lift = 0; f.pitch = 0; g.n++; M.bulge.v += 2.2 * gw; M.shz.v += .6 * gw; }
     else {
      const k = ease(f.t);
      f.ax = lerp(f.sx, f.tx, k); f.ay = lerp(f.sy, f.ty, k); f.az = lerp(f.sz, f.tz, k);
      f.lift = Math.pow(Math.sin(f.t * PI), .85) * f.h; f.pitch = -.55 * Math.sin(f.t * TAU) * f.pw; // toe peels off, heel strikes
     }
    }
   }
   const [fa, fb] = M.feet;
   if (!fa.step && !fb.step && grounded) {
    const walk = gw > .12 && sp > 6, sa = slot(fa.side, u), sb = slot(fb.side, u);
    const da = Math.hypot(fa.ax - sa.x, (fa.ay - sa.y) * 2, (fa.az - sa.z) * u), db = Math.hypot(fb.ax - sb.x, (fb.ay - sb.y) * 2, (fb.az - sb.z) * u);
    let f = null, s = null;
    if (walk) {
     g.period = lerp(g.period, clamp(1 / (2 * (1.0 + sp / (200 * u))), .22, .46), Math.min(1, dt * 6));
     if (g.tm >= g.period) { f = M.feet[g.last > 0 ? 0 : 1]; s = f === fa ? sa : sb; }
    } else if (Math.max(da, db) > 3.5 * u) { f = da >= db ? fa : fb; s = f === fa ? sa : sb; }
    if (f) {
     g.last = f.side; g.tm = 0;
     const dur = walk ? clamp(g.period * .9, .1, .4) : .24, lead = walk ? clamp(sp * g.period * .22, 0, 14 * u) : 0;
     f.step = true; f.t = 0; f.sx = f.ax; f.sy = f.ay; f.sz = f.az; f.dur = dur; f.tz = s.z;
     f.tx = s.x + P.vx * dur * .85 + vd[0] * lead; f.ty = s.y + (P.vy * dur * .85 + vd[1] * lead) * .6;
     f.h = (3 + 5 * gw) * (walk ? clamp(.45 + sp / 120, .45, 1) : .55); f.pw = .35 + .65 * gw;
    }
   }
   // body rhythm: one squash and one swing-side roll per footfall (two per cycle), all derived from the step phase
   const ph = clamp(g.tm / Math.max(g.period, .1), 0, 1);
   g.cph = (g.n % 2) * PI + ph * PI;
   g.sq = gw * (.5 + .5 * Math.cos(TAU * (ph - .78)));
   M.stepSide = g.last * Math.sin(PI * ph);
  }
  function addPill(o) {
   const el = document.createElement('div'); el.className = 'nd-pill';
   const lab = Array.from(String(o.text || '新闻')); el.textContent = lab.slice(0, 11).join('') + (lab.length > 11 ? '…' : '');
   root.appendChild(el); M.pills.push({id: o.id, text: o.text, x: o.x, y: o.y, vx: 0, vy: 0, ang: 0, av: 0, el});
  }
  function clearPills() { for (const p of M.pills) if (p.el) p.el.remove(); M.pills = []; }
  function tether(p, dt, u) {
   const a = M.anchor; if (!a) return;
   const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
   for (let i = 0; i < n; i++) {
    p.vx += (240 * (a.x - p.x) - 17 * p.vx) * h; p.vy += (240 * (a.y - p.y) - 17 * p.vy) * h; p.x += p.vx * h; p.y += p.vy * h;
    p.av += (180 * (clamp(p.vx * .0016, -.45, .45) - p.ang) - 12 * p.av) * h; p.ang += p.av * h;
   }
  }
  function addZ() {
   const el = document.createElement('div'); el.className = 'nd-z'; el.textContent = M.z.length % 2 ? 'z' : 'Z'; root.appendChild(el);
   M.z.push({el, x: M.headTop ? M.headTop.x + 16 : P.x, y: M.headTop ? M.headTop.y : P.y - 80, life: 0});
  }

  /* ---------- the 3D rig: part list -> renderer ---------- */
  const parts = [], F = {vp: new Float32Array(16), base: new Float32Array(16), head: new Float32Array(4), jelly: new Float32Array(4), sq: new Float32Array(3), fx: new Float32Array(4), u: 1, ox: 0, oy: 0};
  let np = 0;
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function addP(mesh, col, c, ax, ay, az, r, def, mode, a, gloss) { if (!parts[np]) parts[np] = newPart(); const p = setPart(parts[np], mesh, col, c[0], c[1], c[2], ax, ay, az, r[0], r[1], r[2], def, mode, a, gloss); np++; return p; }
  function limb(a, b, r, col, rf = .55, gloss = .4) {
   const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]) || 1e-3, dn = [d[0] / len, d[1] / len, d[2] / len];
   const up = Math.abs(dn[1]) < .9 ? [0, 1, 0] : [1, 0, 0], ax = nrm(crs(up, dn)), ay = crs(dn, ax);
   const lp = addP('lo', col, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], ax, ay, dn, [r, r, len / 2 + r * rf], 0, 0, 1, gloss); lp.grad = 3; return lp;
  }
  function feat(mesh, col, y, phi, off, rx, ry, rz, tilt, mode, a, gloss) {
   const s = surf(y, phi, off), t = s.t, n = s.n, up = crs(t, n); let ax = t, ay = up;
   if (tilt) { const c = Math.cos(tilt), sn = Math.sin(tilt); ax = [t[0] * c + up[0] * sn, t[1] * c + up[1] * sn, t[2] * c + up[2] * sn]; ay = [-t[0] * sn + up[0] * c, -t[1] * sn + up[1] * c, -t[2] * sn + up[2] * c]; }
   return addP(mesh, col, s.p, ax, ay, n, [rx, ry, rz], 1, mode, a, gloss);
  }
  const T = {x: sd(0), y: sd(0)};
  function tiltStep(dt) {
   const live = pointer.inside && !(reduced && reduced.matches) && !M.drag && opt.tilt, u = unit();
   const tx = live ? clamp((pointer.x - P.x) / (260 * u), -1, 1) * .09 : 0, ty = live ? clamp((pointer.y - (P.y - 50 * u)) / (260 * u), -1, 1) * .05 : 0;
   damp(T.x, tx, 5, dt); damp(T.y, ty, 5, dt);
   if (!tx && Math.abs(T.x.x) < 1e-4) T.x.x = T.x.v = 0;
   if (!ty && Math.abs(T.y.x) < 1e-4) T.y.x = T.y.v = 0;
  }
  function pose() {
   np = 0;
   const u = unit(), t = simTime, ps = P.yaw.x, cy = Math.cos(ps), sy = Math.sin(ps), is2d = R && R.kind === '2d';
   const sq = P.sq.x, sxs = 1 + .5 * sq, sys = lerp(1 - .85 * sq, 1 / (sxs * sxs), .6), hop = P.hop; // volume-aware jelly: width and height trade off
   const roll = M.roll.x - M.lie.x * P.face * 1.5 + (M.drag ? M.dang.x : 0) - P.face * M.lean.x * .5, cr = Math.cos(roll), sr = Math.sin(roll);
   const pv = M.drag ? 108 : lerp(3, 33, M.lie.x), drop = M.sit.x * 5.5 + M.lie.x * 2;
   const ex = [cy * cr, cy * sr, -sy], ey = [-sr, cr, 0], ez = [sy * cr, sy * sr, cy], lx = -P.face * M.lie.x * 24, p0 = [pv * sr + lx, pv - pv * cr - drop, 0];
   const b = F.base;
   b[0] = ex[0]; b[1] = ex[1]; b[2] = ex[2]; b[3] = 0; b[4] = ey[0]; b[5] = ey[1]; b[6] = ey[2]; b[7] = 0; b[8] = ez[0]; b[9] = ez[1]; b[10] = ez[2]; b[11] = 0; b[12] = p0[0]; b[13] = p0[1]; b[14] = p0[2]; b[15] = 1;
   const bp = (x, y, z) => [x * ex[0] + y * ey[0] + z * ez[0] + p0[0], x * ex[1] + y * ey[1] + z * ez[1] + p0[1], x * ex[2] + y * ey[2] + z * ez[2] + p0[2]];
   const toStage = p => ({x: P.x + p[0] * sxs * u, y: P.y - (p[1] * sys + hop) * u});
   const toRig = (sx, sy2) => [(sx - P.x) / (sxs * u), ((P.y - sy2) / u - hop) / sys, 22];
   const open = M.mouth.x, ey0 = M.eyeO.x;
   F.head[0] = M.headTilt.x; F.head[1] = M.nod.x; F.head[2] = M.headYaw.x; F.head[3] = 62;
   F.jelly[0] = M.shx.x; F.jelly[1] = M.shz.x; F.jelly[2] = (M.bulge.x + M.kick.x * .6) * .5; F.jelly[3] = (Math.sin(t * (2.8 - 1.5 * M.sleep.x)) * (.55 + .5 * M.sleep.x)) * .03 + M.breath.x * .03;
   F.sq[0] = sxs; F.sq[1] = sys; F.sq[2] = hop; F.fx[0] = M.quota.x; F.fx[1] = M.alert.x; F.fx[2] = M.happy.x * .35; F.fx[3] = t;
   // contact shadow
   const lift = 1 / (1 + Math.max(0, hop) / 60), shw = (47 + M.lie.x * 14 + M.sit.x * 3) * lift * (1 + sq * .5), shd = (41 + M.lie.x * 6) * lift;
   addP('lo', COL.shadow, [lx, .3, 0], AX, AY, AZ, [shw, 1, shd], 2, 2, .5 * lift, 0);
   addP('lo', COL.shadow, [lx, .3, 0], AX, AY, AZ, [shw * .7, 1, shd * .66], 2, 2, .44 * lift, 0);
   // body: smooth pear + cream belly
   if (is2d) {
    addP('pear2d', COL.top, [0, 0, 0], AX, AY, AZ, [1, 1, 1], 1, 0, 1, .4).c2 = COL.bot;
    addP('hi', COL.belly, [0, 31, 19], AX, AY, AZ, [27, 22, 21], 1, 0, 1, .3);
   } else {
    addP('pear', COL.top, [0, 0, 0], AX, AY, AZ, [1, 1, 1], 1, 0, 1, .4).grad = 1; parts[np - 1].c2 = COL.bot;
    addP('patch', COL.belly, [0, 0, 0], AX, AY, AZ, [1, 1, 1], 1, 0, 1, .28).grad = 2;
   }
   // three flat olive bumps down the back of the head and spine (they lift a little when alert)
   const sp = M.spike.x;
   [[98, 6.2], [85, 5.6], [72, 5]].forEach(([by, br]) => feat('lo', COL.bump, by, -PI / 2, -.1 + sp * 2.2, br, br * .84 * (1 + .35 * sp), 3.4 + sp * 1.2, 0, 0, 1, .35));
   // face: wide-set big eyes (white rim, green iris, dark pupil), no nose / ears / blush
   const eX = M.eyeX.x, eY = M.eyeY.x, e = Math.max(.1, ey0);
   for (const s of [1, -1]) {
    const phi = PI / 2 + s * (.46 - .03 * M.surprise.x) - eX * .03, yy = 90 + eY * .8;
    if (e > .3) {
     const ir = Math.min(e, 1.3);
     feat('lo', COL.white, yy, phi, -.3, 4.4, 5.1 * Math.min(e, 1.35), 2.6, 0, 0, 1, .6);
     feat('lo', COL.iris, yy + eY * .4, phi - eX * .03, 1.0, 3.9, 4.6 * ir, 1.7, 0, 0, 1, .55);
     feat('lo', COL.eye, yy + eY * .7, phi - eX * .05, 1.7, 2.7 * (1 - M.surprise.x * .2), 3.3 * ir * (1 - M.surprise.x * .2), 1.5, 0, 0, 1, .6);
     if (e > .45) feat('tiny', COL.white, yy + 2 * ir + eY * .7, phi - s * .02 - eX * .05, 2.7, 1.5, 1.5, .8, 0, 1, 1, 0);
     if (e > .6) feat('tiny', COL.white, yy - 2.2 * ir + eY * .7, phi + s * .05 - eX * .05, 2.5, .8, .8, .5, 0, 1, .85, 0);
    } else feat('lo', COL.eye, yy - 1.5, phi, .1, 4, .85 + e * 2, 1.4, s * -.12, 0, 1, .4);
    if (M.worry.x > .08) feat('lo', COL.brow, 101 + (1 - M.worry.x) * -1, PI / 2 + s * .46, -.2, 4.6 * M.worry.x, 1.15, .9, s * .38, 0, 1, .2);
   }
   const sm = M.smile.x + .03 * Math.sin(t * 1.9), y0 = 74, tg = M.tongue.x, mo = Math.max(open, tg * .6), om = ease(mo / .14);
   if (om > .002) { // mouth interior grows from nothing; a resting tongue sits inside it
    const oy = (1 + mo * 4.6) * om, ox2 = (2.6 + mo * 2.4) * om;
    feat(mo < .2 ? 'tiny' : 'lo', COL.mouth, y0 - oy * .35, PI / 2, -.25, ox2, oy, 2 * om, 0, 0, 1, .35);
    if (tg < .4 && mo > .3) feat('lo', COL.tongue, y0 - oy * .9, PI / 2, .15, ox2 * .62, oy * .45, 1.3 * om, 0, 0, 1, .2);
   }
   if (mo < .5) for (let j = -5; j <= 5; j++) feat('tiny', COL.mouth, y0 + (j * j * .115 - 1.5) * sm * .8 + .3, PI / 2 - j * .045, .35, 1.05, 1.05, 1, 0, 0, 1 - c01(mo * 2.2), .2);
   for (let s = 0; s < 2; s++) { // cheeks swell while the jaw closes on a bite
    const cp = clamp(M.cheekP.x, 0, 1.3);
    if (cp > .1) feat('tiny', COL.bot, 70, PI / 2 + (s ? 1 : -1) * .36, -.2, 3.4 + 5 * cp, 3.8 + 5 * cp, .4 + 4.2 * cp, 0, 0, 1, .4);
   }
   if (tg > .01) { // tongue: anchored inside the mouth, slides out over the lower lip, then droops and curls with a slight lag
    const em = ease(tg * 3.5), dr = M.tdrop.x, cu = M.tcurl.x, L = (3 + 13.5 * tg) * (1 + .1 * dr), a0 = y0 - (1 + mo * 4.6) * .3;
    for (let i = 0; i < 3; i++) {
     const q = (i + .5) / 3, tip = q > .8 ? .84 : 1;
     feat('lo', COL.tongue, a0 - L * q, PI / 2 + .02 + cu * .09 * q * q, .1 + 2.2 * Math.sin(q * 1.3) * (1 - dr * .35), (4.4 + 1.5 * q) * em * tip, (L / 3 * 1.1 + 1.2) * em, (1.7 + .5 * q) * em, cu * .25 * q, 0, 1, .3);
    }
    feat('tiny', COL.mouth, a0 - L * .5, PI / 2 + .02 + cu * .09 * .25, 2.6, .35 * em, L * .32 * em, .3, 0, 0, 1, .1);
   }
   // tail: short, thick, body-coloured, drooping (3 jelly segments)
   {
    let px = 0, py = 16, pz = -34;
    const rr = [11, 10, 9, 8.1, 7.1, 6.2], dl = [3.4, 3.5, 3.5, 3.5, 3.5, 3.3], dy = [-.03, -.07, -.08, -.06, -.02, .03];
    for (let k = 0; k < 6; k++) {
     const a = M.tail[k > 2 ? 1 : 0].x, d = nrm([Math.sin(a) * (1 + k * .1), dy[k] + .1 * M.tailAmp.x * k, -Math.cos(a)]);
     px += d[0] * dl[k]; py += d[1] * dl[k]; pz += d[2] * dl[k];
     const w = bp(px, py, pz); addP(k > 0 ? 'lo' : 'hi', COL.deep, w, AX, AY, AZ, [rr[k], rr[k] * .94, rr[k]], 0, 0, 1, .4);
    }
   }
   // legs + feet
   const g = M.ground.x;
   for (let i = 0; i < 2; i++) {
    const f = M.feet[i], s = f.side, hip = bp(s * 17, 14, 6);
    const air = bp(s * 17, 3 + (M.drag ? Math.sin(t * 13 + i * 2.4) * 4 + 2 : 0) + M.kick.x * .3, 16 + (M.drag ? 3 : 0));
    const pl = [(f.ax - P.x) / (sxs * u), 5.5 + Math.max(0, f.lift) + clamp((P.y - f.ay) / u * .6, -3, 3), f.az + (f.ay - P.y) / u * -.55];
    // planted foot, relative to ground; sit puts both feet forward
    const sit = [s * 19 * cy + 34 * sy, 5.5, -s * 19 * sy + 34 * cy];
    const grd = [lerp(pl[0], sit[0], M.sit.x), lerp(pl[1], sit[1], M.sit.x), lerp(pl[2], sit[2], M.sit.x)];
    const fp = [lerp(air[0], grd[0], g), lerp(air[1], grd[1], g), lerp(air[2], grd[2], g)];
    limb(hip, [fp[0], fp[1] + 3, fp[2] - 2], 9.2, COL.deep, .5, .35);
    const tw = M.sit.x * .45 * s, fa = [Math.cos(ps + tw), 0, -Math.sin(ps + tw)], fz = [Math.sin(ps + tw), 0, Math.cos(ps + tw)];
    const pc = Math.cos(f.pitch || 0), pn = Math.sin(f.pitch || 0), fy2 = [-fz[0] * pn, pc, -fz[2] * pn], fz2 = [fz[0] * pc, pn, fz[2] * pc];
    addP('lo', COL.deep, fp, fa, fy2, fz2, [9.8, 6, 11.6], 0, 0, 1, .4);
    for (let c = -1; c <= 1; c++) { // three rounded toes, fanned a little, each with a small dark claw
     const tz = 9.6 + (c ? -.6 : 1.4), tx = c * 5.5, tl = [fp[0] + fz2[0] * tz + fa[0] * tx, fp[1] - .5 + fz2[1] * tz, fp[2] + fz2[2] * tz + fa[2] * tx];
     addP('tiny', COL.deep, tl, fa, fy2, fz2, [4.4, 3.9, 5], 0, 0, 1, .4);
     addP('tiny', COL.claw, [tl[0] + fz2[0] * 3.9 + fa[0] * c * .5, tl[1] + .3 + fz2[1] * 3.9, tl[2] + fz2[2] * 3.9 + fa[2] * c * .5], fa, fy2, fz2, [2, 1.7, 2.4], 0, 0, 1, .3);
    }
   }
   // arms
   const hands = [];
   const pt = M.aim || (M.look && (M.point.x > .05) ? M.look : null);
   let pArm = -1;
   if (pt) { const sh0 = bp(-34, 48, 9), sh1 = bp(34, 48, 9), dxs = pt.x - P.x; pArm = dxs * (sh1[0] - sh0[0]) >= 0 ? 1 : 0; }
   for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1, th = M.arm[i].x, fw = M.armF[i].x, sh = bp(s * 34, 48, 9);
    const dloc = nrm([s * Math.sin(th), -Math.cos(th), fw]), L = 15 + (i === 0 ? M.wave.x * 5 : 0), dir = [dloc[0] * ex[0] + dloc[1] * ey[0] + dloc[2] * ez[0], dloc[0] * ex[1] + dloc[1] * ey[1] + dloc[2] * ez[1], dloc[0] * ex[2] + dloc[1] * ey[2] + dloc[2] * ez[2]];
    let tip = [sh[0] + dir[0] * L, sh[1] + dir[1] * L, sh[2] + dir[2] * L];
    if (M.pat.x > .02) { const q = bp(s * 21, 38 + Math.sin(t * 13 + i) * 1.4 * M.pat.x, 37), mix = M.pat.x; const dd = nrm([q[0] - sh[0], q[1] - sh[1], q[2] - sh[2]]); const tp2 = [sh[0] + dd[0] * L * 1.02, sh[1] + dd[1] * L * 1.02, sh[2] + dd[2] * L * 1.02]; tip = [lerp(tip[0], tp2[0], mix), lerp(tip[1], tp2[1], mix), lerp(tip[2], tp2[2], mix)]; }
    if (i === pArm && pt && M.point.x > .02) {
     const tr = toRig(pt.x, pt.y), dd = [tr[0] - sh[0], tr[1] - sh[1], tr[2] - sh[2]], dl = Math.hypot(dd[0], dd[1], dd[2]) || 1, reach = Math.min(L + 8, dl), tp2 = [sh[0] + dd[0] / dl * reach, sh[1] + dd[1] / dl * reach, sh[2] + dd[2] / dl * reach];
     const m2 = ease(M.point.x); tip = [lerp(tip[0], tp2[0], m2), lerp(tip[1], tp2[1], m2), lerp(tip[2], tp2[2], m2)];
    }
    limb(sh, tip, 9.2, COL.deep, .5, .4);
    addP('lo', COL.deep, tip, AX, AY, AZ, [9.2, 9, 8.4], 0, 0, 1, .4);
    { // pink palm pad + three brown claws; the palm turns to face forward when the arm is raised
     const inw = [-s * ex[0], -s * ex[1], -s * ex[2]], w = c01((th - 1.1) / .9), pn = nrm([lerp(inw[0], ez[0], w), lerp(inw[1], ez[1], w), lerp(inw[2], ez[2], w)]);
     let pp = crs(dir, pn); const pl = Math.hypot(pp[0], pp[1], pp[2]);
     if (pl > .05) {
      pp = [pp[0] / pl, pp[1] / pl, pp[2] / pl]; const pu = crs(pn, pp);
      addP('lo', COL.palm, [tip[0] + pn[0] * 5.7, tip[1] + pn[1] * 5.7, tip[2] + pn[2] * 5.7], pp, pu, pn, [4.4, 4.8, 2.2], 0, 0, 1, .35);
      for (let c = -1; c <= 1; c++) {
       const o = c * 3.6, b = 7 + (c ? 0 : .8), cq = [tip[0] + dir[0] * b + pp[0] * o, tip[1] + dir[1] * b + pp[1] * o, tip[2] + dir[2] * b + pp[2] * o];
       addP('tiny', COL.claw, cq, pp, crs(dir, pp), dir, [1.7, 1.7, 3], 0, 0, 1, .3);
      }
     }
    }
    const st = toStage(tip); M.tipPx[i].x = st.x; M.tipPx[i].y = st.y; hands.push(st);
   }
   // sweat drop (low quota)
   if (M.quota.x > .12) { const w = bp(30, 104 - ((t * 9) % 14), 16); addP('lo', COL.drop, w, AX, AY, AZ, [3, 4.3, 2.8], 0, 0, M.quota.x, .9); }
   // sparkles + dust
   for (const f of M.fx) {
    const k = f.life / f.max, x = (f.x - P.x) / (sxs * u), y = ((P.y - f.y) / u - hop) / sys;
    if (f.k === 'puff') addP('lo', COL.white, [x, y, 18], AX, AY, AZ, [3 + k * 8, 3 + k * 5, 3], 2, 1, .45 * (1 - k), 0);
    else if (f.k === 'crumb') addP('tiny', COL.crumb, [x, y, 24], AX, AY, AZ, [2.2 * f.s, 1.8 * f.s, 1.8], 2, 1, c01(2 * (1 - k)), 0);
    else {
     const s = f.s * (1 - k * .55) * (1 + .3 * Math.sin(f.life * 30)), col = f.pink ? COL.star2 : COL.star, a = c01(2.2 * (1 - k));
     addP('tiny', col, [x, y, 30], AX, AY, AZ, [4.6 * s, 1.15 * s, 1.1], 2, 1, a, 0); addP('tiny', col, [x, y, 30], AX, AY, AZ, [1.15 * s, 4.6 * s, 1.1], 2, 1, a, 0);
    }
   }
   M.pArm = pArm >= 0 ? pArm : undefined;
   // anchors for DOM bits
   const top = toStage(bp(0, 113, 0)); M.headTop = top;
   if (P.stage === 'grab') { const h = hands[pArm >= 0 ? pArm : 0]; M.anchor = {x: h.x, y: h.y}; }
   else M.anchor = {x: top.x, y: top.y - 9 * u - 4};
   // camera: gentle perspective + slight downward pitch, origin anchored at (.5, .8) of the pet canvas
   const cw = bw, ch = bh, Dd = 700, cp = Math.cos(.14 + T.y.x), spn = Math.sin(.14 + T.y.x), vp = F.vp;
   const xo = F.ox = P.x - Math.round(P.x - bw * .5), yo = F.oy = P.y - Math.round(P.y - bh * .8); F.u = u;
   const xc = (xo - cw / 2) / (cw / 2), yc = (ch / 2 - yo) / (ch / 2), A = u / (cw / 2), Bq = u / (ch / 2);
   vp[0] = A; vp[1] = 0; vp[2] = 0; vp[3] = 0;
   vp[4] = -xc * spn / Dd; vp[5] = Bq * cp - yc * spn / Dd; vp[6] = -spn / 200; vp[7] = -spn / Dd;
   vp[8] = -xc * cp / Dd; vp[9] = -Bq * spn - yc * cp / Dd; vp[10] = -cp / 200; vp[11] = -cp / Dd;
   vp[12] = xc; vp[13] = yc; vp[14] = 0; vp[15] = 1;
   if (T.x.x) { // pointer-following camera tilt: orbit the camera a few degrees around the pet (parallax, no re-lighting)
    const tc = Math.cos(T.x.x), ts = Math.sin(T.x.x);
    for (let r = 0; r < 4; r++) { const c0 = vp[r], c2 = vp[8 + r]; vp[r] = tc * c0 - ts * c2; vp[8 + r] = ts * c0 + tc * c2; }
   }
  }
  /* ---------- overlay layout: bubble / dial / chip sit beside the pet's body box, flip when short of room and never overlap it or each other ---------- */
  const rectHit = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  function bodyRect() {
   const u = unit(), top = Math.min(M.headTop ? M.headTop.y : 1e9, P.y - (108 + Math.max(0, P.hop)) * u) - (M.carry.x > .5 ? 26 : 5);
   return {x: P.x - 50 * u, y: top, w: 100 * u, h: Math.max(10, P.y + 6 - top)};
  }
  function placeBox(w, h, B, order, avoid, prev, anchor) {
   const g = OV.gap, pad = OV.pad, cx = B.x + B.w / 2, cy = anchor === undefined ? B.y + B.h / 2 : anchor;
   const list = prev && order.includes(prev) ? [prev, ...order.filter(s => s !== prev)] : order;
   let best = null;
   for (const side of list) {
    let x, y, ok;
    if (side === 'top') { y = B.y - g - h; x = clamp(cx - w / 2, pad, width - w - pad); ok = y >= pad; }
    else if (side === 'bottom') { y = B.y + B.h + g; x = clamp(cx - w / 2, pad, width - w - pad); ok = y + h <= height - pad; }
    else if (side === 'left') { x = B.x - g - w; y = clamp(cy - h / 2, pad, height - h - pad); ok = x >= pad; }
    else { x = B.x + B.w + g; y = clamp(cy - h / 2, pad, height - h - pad); ok = x + w <= width - pad; }
    if (!ok) { x = clamp(x, pad, Math.max(pad, width - w - pad)); y = clamp(y, pad, Math.max(pad, height - h - pad)); }
    const r = {x, y, w, h}; let pen = ok ? 0 : 1e5; for (const a of avoid) pen += rectHit(r, a);
    if (!best || pen < best.pen) best = {side, r, pen};
    if (pen === 0) break;
   }
   return best;
  }
  function putBox(el, slot, r, side, tail) {
   const t = 'translate3d(' + Math.round(r.x) + 'px,' + Math.round(r.y) + 'px,0)';
   if (slot.t !== t) { el.style.transform = t; slot.t = t; }
   if (el.dataset.side !== side) el.dataset.side = side;
   el.style.setProperty(side === 'top' || side === 'bottom' ? '--tx' : '--ty', Math.round(tail) + 'px'); slot.side = side;
  }
  function updateChip(dt) {
   const q = status.quotaLeftPercent, n = status.agentCount, low = q !== null && q < 20;
   if (OV.done > 0) OV.done -= dt;
   const key = [low, q === null ? -1 : Math.round(q), n, OV.done > 0].join();
   if (key === OV.chipKey) return; OV.chipKey = key;
   const on = low || n > 0 || OV.done > 0;
   chipEl.dataset.on = String(on); chipEl.tabIndex = on && hostActions.length ? 0 : -1;
   if (on) chipEl.removeAttribute('aria-hidden'); else chipEl.setAttribute('aria-hidden', 'true');
   if (low) { chipEl.dataset.q = q <= 0 ? 'zero' : 'low'; chipQt.textContent = '额度 ' + Math.round(q) + '%'; chipEl.style.setProperty('--q', String(Math.round(q))); } else chipEl.removeAttribute('data-q');
   if (n > 0) { chipEl.dataset.a = 'on'; chipAt.textContent = n + ' 个运行中'; } else chipEl.removeAttribute('data-a');
   if (OV.done > 0 && n === 0) chipEl.dataset.d = 'on'; else chipEl.removeAttribute('data-d');
   chipEl.setAttribute('aria-label', [low ? '额度剩余 ' + Math.round(q) + '%' : '', n > 0 ? n + ' 个 Agent 运行中' : '', OV.done > 0 && n === 0 ? '已完成' : ''].filter(Boolean).join('，') || '状态');
   OV.chip.w = 0;
  }
  function layoutOverlay() {
   const showB = bubbleEl.classList.contains('on') && M.bubbleT > 0, showM = Boolean(MN.el && DL.vis), showC = chipEl.dataset.on === 'true';
   if (!showB && !showM && !showC) { OV.rects = {}; return; }
   const B = bodyRect(), rects = {body: B}, avoid = [B], head = M.headTop || {x: P.x, y: B.y + 5}, headY = head.y + 26 * unit(), prefLeft = B.x + B.w / 2 > width - (B.x + B.w / 2);
   if (showM) {
    const p = placeBox(DW, DW, B, prefLeft ? ['left', 'right', 'top', 'bottom'] : ['right', 'left', 'top', 'bottom'], avoid, OV.menu.side, dockPos.ok ? P.y + 6 - DW / 2 : undefined), r = p.r, el = MN.el, o = Math.max(0, DL.o.x);
    DL.cx = r.x + DC; DL.cy = r.y + DC; OV.menu.side = p.side; el.style.opacity = String(clamp(o * 1.6, 0, 1));
    el.style.transformOrigin = clamp(P.x - r.x, 0, DW).toFixed(0) + 'px ' + clamp(P.y - 60 * unit() - r.y, 0, DW).toFixed(0) + 'px';
    el.style.transform = 'translate3d(' + Math.round(r.x) + 'px,' + Math.round(r.y) + 'px,0) scale(' + o.toFixed(3) + ')'; rects.dial = r; avoid.push(r);
   }
   if (showB && showM) bubbleEl.dataset.hold = 'true';
   else if (showB) {
    if (!OV.bubble.w) { OV.bubble.w = bubbleEl.offsetWidth || 120; OV.bubble.h = bubbleEl.offsetHeight || 34; }
    const p = placeBox(OV.bubble.w, OV.bubble.h, B, ['top', prefLeft ? 'left' : 'right', prefLeft ? 'right' : 'left'].concat(dockPos.ok ? [] : ['bottom']), avoid, OV.bubble.side, headY);
    if (p.pen > 0) { bubbleEl.dataset.hold = 'true'; } else {
     bubbleEl.dataset.hold = 'false'; putBox(bubbleEl, OV.bubble, p.r, p.side, p.side === 'top' || p.side === 'bottom' ? head.x - p.r.x : headY - p.r.y); rects.bubble = p.r; avoid.push(p.r);
    }
   }
   if (showC) {
    if (!OV.chip.w) { OV.chip.w = chipEl.offsetWidth || 110; OV.chip.h = chipEl.offsetHeight || 26; }
    const p = placeBox(OV.chip.w, OV.chip.h, B, [prefLeft ? 'left' : 'right', prefLeft ? 'right' : 'left', 'top'].concat(dockPos.ok ? [] : ['bottom']), avoid, OV.chip.side, P.y - OV.chip.h / 2 - 4);
    if (p.pen > 0) chipEl.dataset.hold = 'true'; else { chipEl.dataset.hold = 'false'; putBox(chipEl, OV.chip, p.r, p.side, 0); rects.chip = p.r; }
   }
   OV.rects = rects;
  }
  function draw() {
   if (!R || lostGL) return;
   const t = R.draw(parts, np, F, Math.round(bw * dpr), Math.round(bh * dpr), dpr);
   if (t) tris = t;
   const tx = Math.round(P.x - bw * .5), ty = Math.round(P.y - bh * .8);
   cs.transform = `translate3d(${tx}px,${ty}px,0)`;
   layoutOverlay();
   for (const p of M.pills) p.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0) translate(-50%,-50%) rotate(${p.ang.toFixed(3)}rad)`;
   for (const z of M.z) { const k = z.life / 2.4; z.el.style.opacity = String(Math.min(1, z.life * 3) * (1 - k * k)); z.el.style.transform = `translate3d(${z.x.toFixed(1)}px,${z.y.toFixed(1)}px,0) scale(${(.7 + k * .6).toFixed(2)})`; }
  }

  function frame(dt) {
   const t0 = performance.now();
   if (dt > 0) simulate(dt); else if (!ready) simulate(.001);
   if (destroyed) return;
   ready = true;
   if (dt > 0) tiltStep(dt);
   pose(); updateDial(dt);
   if (frames++ % 12 === 0) { updateDock(); lair.update(true); }
   lair.draw(); draw();
   const energetic = M.moving || P.stage || P.air || M.fx.length || M.pills.length || M.drag || P.wig > 0 || (M.act && M.act !== 'look' && M.act !== 'tilt' && M.act !== 'yawn' && M.act !== 'plop') || M.spinning || Math.abs(P.sq.v) > .08 || Math.abs(M.bulge.v) > .25 || Math.abs(M.bulge.x) > .02 || Math.abs(M.shx.x) > .08 || M.blink > 0 || (collecting && !M.standing) || M.feet.some(f => f.step) || Math.abs(M.arm[0].v) + Math.abs(M.arm[1].v) > .05;
   interval = energetic ? 1000 / 60 : reduced && reduced.matches ? 500 : M.sleep.x > .92 && !M.alert.x ? 85 : 1000 / 30;
   if (reduced && reduced.matches && interval < 100) interval = 100;
   const ms = performance.now() - t0; perf.n++; perf.ms += ms; perf.max = Math.max(perf.max, ms);
  }
  function schedule() {
   if (!running || destroyed) return;
   if (interval > 20 && typeof setTimeout === 'function') timerId = setTimeout(() => { timerId = null; if (running && !destroyed) rafId = requestAnimationFrame(render); }, interval - 10);
   else rafId = requestAnimationFrame(render);
  }
  function render(time) {
   rafId = null;
   if (!running || destroyed) return;
   if ((global.devicePixelRatio || 1) !== seenDpr) resize(); // some shells change the ratio without a resize/matchMedia event
   if (root.isConnected === false || document.hidden) { // detached or hidden stage: no drawing, wake up slowly
    lastFrame = null; timerId = setTimeout(() => { timerId = null; if (running && !destroyed) rafId = requestAnimationFrame(render); }, 500); return;
   }
   if (lastFrame === null || time - lastFrame >= interval - 4) {
    const dt = lastFrame === null ? 1 / 60 : Math.min((time - lastFrame) / 1000, 1 / 10);
    lastFrame = time;
    frame(dt);
    if (destroyed || !running) return;
    schedule();
   } else rafId = requestAnimationFrame(render);
  }
  const onVisibility = () => { lastFrame = null; };
  document.addEventListener('visibilitychange', onVisibility);
  // devicePixelRatio change (window moved to another monitor, browser zoom): re-arm a resolution query and re-measure
  let dprMq = null;
  const onDpr = () => { watchDpr(); resize(); };
  function watchDpr() {
   if (dprMq && dprMq.removeEventListener) dprMq.removeEventListener('change', onDpr); dprMq = null;
   if (destroyed || typeof global.matchMedia !== 'function') return;
   try { dprMq = global.matchMedia('(resolution: ' + (global.devicePixelRatio || 1) + 'dppx)'); if (dprMq && dprMq.addEventListener) dprMq.addEventListener('change', onDpr); } catch (e) { dprMq = null; }
  }
  watchDpr();
  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(root); resizeObserver.observe(depot); }
  global.addEventListener('resize', resize);
  global.addEventListener('pointermove', pointerMove, {passive: true});
  root.addEventListener('pointerleave', pointerLeave, {passive: true});
  // hit-tested on the document (capture), so the pet is clickable even when the host stage is pointer-events:none; only a hit on the pet itself is consumed
  document.addEventListener('pointerdown', pointerDown, true);
  document.addEventListener('click', clickGuard, true);
  document.addEventListener('keydown', onMenuKey); document.addEventListener('pointerdown', onMenuOutside, true);
  const stopTimers = () => {
   if (rafId !== null) cancelAnimationFrame(rafId); rafId = null;
   if (timerId !== null) clearTimeout(timerId); timerId = null;
  };

  /* options (mount `options`, root data-nd-* attributes, setOptions): size|scale, speed, sleepAfter, dock auto|tl|tr|bl|br, margin, status, dial, tilt, theme auto|light|dark */
  const num = v => (v === undefined || v === null || v === '' ? NaN : Number(v)), flag = (v, d) => (v === undefined || v === null || v === '' ? d : !(v === false || /^(false|0|off|no)$/i.test(String(v))));
  function applyOptions(o) {
   let moveHome = false; const sc0 = sc;
   if (Number.isFinite(num(o.scale))) sc = clamp(num(o.scale), .5, 1.8);
   if (Number.isFinite(num(o.size))) sc = clamp(num(o.size) / 84, .5, 1.8); // pet height in CSS px (~84 px at scale 1)
   if (Number.isFinite(num(o.speed))) speedMul = clamp(num(o.speed), .5, 3);
   if (Number.isFinite(num(o.sleepAfter))) sleepAfter = clamp(num(o.sleepAfter), 3, 600);
   if (typeof o.dock === 'string' && /^(auto|tl|tr|bl|br)$/.test(o.dock)) { moveHome = moveHome || opt.dock !== o.dock; opt.dock = o.dock; }
   if (Number.isFinite(num(o.margin))) opt.margin = clamp(num(o.margin), 0, 120);
   if ('tilt' in o) opt.tilt = flag(o.tilt, opt.tilt);
   if ('dial' in o) { opt.dial = flag(o.dial, opt.dial); if (!opt.dial) closeMenu(); }
   if ('status' in o) {
    opt.status = flag(o.status, opt.status);
    if (!opt.status) { status.agentsRunning = false; status.agentCount = 0; status.quotaLeftPercent = null; OV.done = 0; }
    OV.chipKey = ''; updateChip(0);
   }
   if (o.theme === 'auto' || o.theme === 'light' || o.theme === 'dark') root.setAttribute('data-nd-theme', o.theme);
   resize(); if (moveHome || sc !== sc0) { const h = home(); place(h.x, h.y); }
  }
  const api = {
   pointAt(element, label = '') {
    if (destroyed) return false;
    if (probe) probe.element.classList.remove('news-spider-probe');
    probe = null; probeTarget = null; probeT = 0;
    if (!element || !root.contains(element)) return false;
    const item = {id: element.id || label, element, label}, tgt = targetPosition(item);
    if (!tgt) return false;
    probe = item; element.classList.add('news-spider-probe'); wake();
    probeT = Math.hypot(tgt.x - P.x, tgt.y - P.y) / Math.max(1, 92 * speedMul) + 3;
    return true;
   },
   capture({id, element, label}) {
    if (destroyed || id === undefined || id === null || !element || !root.contains(element)) return false;
    const key = String(id);
    if ((active && active.id === key) || queue.some(i => i.id === key)) return false;
    queue.push({id: key, element, label: Array.from(String(label || element.textContent || '新闻')).slice(0, 24).join('')});
    resize(); wake(); return true;
   },
   cancel(id) {
    if (destroyed) return false;
    const key = String(id); let cancelled = false;
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].id === key) { const it = queue[i]; queue.splice(i, 1); cancelled = true; notifyCancel(it, 'cancelled'); }
    if (active && active.id === key) { const it = active; active = null; P.stage = null; clearPills(); cancelled = true; notifyCancel(it, 'cancelled'); }
    return cancelled;
   },
   setActions(list) { if (destroyed) return; const was = MN.open; hostActions = Array.isArray(list) ? list.filter(a => a && a.label) : []; MN.open = was && hostActions.length > 0; buildMenu(); if (MN.open) openMenu(); },
   openMenu(focus) { return openMenu(!!focus); }, closeMenu() { return closeMenu(); }, toggleMenu(focus) { return toggleMenu(!!focus); }, dialPage, dialRotate, dialHit,
   setCollecting(v) { if (destroyed) return; collecting = Boolean(v); wpt = null; dwell = 0; patrolN = 0; if (collecting) wake(); },
   setStatus(next = {}) {
    if (destroyed || !next || !opt.status) return;
    if ('agentsRunning' in next) {
     const v = next.agentsRunning, was = status.agentCount, now = typeof v === 'number' ? (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0) : (v ? 1 : 0);
     status.agentsRunning = now > 0; status.agentCount = now; if (was > now) M.doneQ = true;
    }
    if ('quotaLeftPercent' in next) {
     const v = next.quotaLeftPercent;
     status.quotaLeftPercent = v === null || v === undefined || !Number.isFinite(Number(v)) ? null : clamp(Number(v), 0, 100);
    }
    updateChip(0);
   },
   poke,
   /** Host reaction: a gesture and a short bubble. */
   react(kind, text) { if (destroyed || MN.open) return false; if (kind) poke(kind); if (text) say(`${text}`.slice(0, 24), true, 2600); return true; },
   pause() {
    if (running || rafId !== null || timerId !== null) { running = false; stopTimers(); }
    root.classList.add('nd-paused');
    if (!destroyed) { try { frame(0); } catch (e) {} }
   },
   resume() {
    if (destroyed || running) return;
    running = true; lastFrame = null; root.classList.remove('nd-paused'); resize();
    frame(0); rafId = requestAnimationFrame(render);
   },
   step(dt = 1 / 60) { if (!destroyed) frame(clamp(dt, 0, .1)); },
   setOptions(o) { if (!destroyed && o && typeof o === 'object') applyOptions(o); },
   inspect() {
    const u = unit();
    return {
     running, destroyed, collecting, followPointer, renderer: rendererKind, tris,
     probe: probe ? {id: probe.id, contact: !!(probeTarget && M.probeAim && M.pArm !== undefined && M.tipPx[M.pArm] && Math.hypot(M.tipPx[M.pArm].x - M.probeAim.x, M.tipPx[M.pArm].y - M.probeAim.y) < 12 * u + 2 && M.point.x > .6)} : null,
     phase: ACT.includes(P.stage) ? 'scanning' : active && P.stage === 'carry' ? 'carrying' : active ? 'approaching' : probe ? 'probing'
      : followPointer && pointer.inside ? 'following' : collecting ? 'collecting' : M.sleep.x > .6 ? 'sleeping' : 'idle',
     state: P.phase, stage: P.stage,
     activeId: active ? active.id : null, queueIds: queue.map(i => i.id), deliveredIds: lair.prey.map(i => i.id),
     pills: M.pills.map(p => ({id: p.id, x: p.x, y: p.y})),
     position: {x: P.x, y: P.y}, pointer: {...pointer, down: !!pointer.down},
     target: active && active.target ? {x: active.target.x, y: active.target.y} : null,
     destination: {x: lair.hubX, y: lair.hubY}, depot: {x: lair.hubX, y: lair.hubY},
     pet: 'naidragon', scale: sc, speed: speedMul, unit: u, height: 108 * u,
     hands: M.tipPx.map(h => ({x: h.x, y: h.y})), headTop: M.headTop ? {...M.headTop} : null,
     weights: {alert: M.alert.x, quota: M.quota.x, carry: M.carry.x, wave: M.wave.x, sleep: M.sleep.x, sit: M.sit.x, lie: M.lie.x, pat: M.pat.x, sad: M.sad.x},
     mood: {sq: P.sq.x, crouch: M.crouch.x, blink: M.blink, hop: P.hop, sleeping: M.sleep.x > .6, act: M.act, face: P.face, dragging: !!M.drag, bubble: M.bubbleT > 0 ? M.bubbleText : ''},
     canvas: {w: bw, h: bh, dpr, pixels: Math.round(bw * dpr) * Math.round(bh * dpr), depot: dctx ? [lair.w, lair.h] : null},
     rig: {base: Array.from(F.base).map(v => +v.toFixed(2)), vp: Array.from(F.vp).map(v => +v.toFixed(3)), head: Array.from(F.head), jelly: Array.from(F.jelly), sq: Array.from(F.sq), yaw: P.yaw.x, feet: M.feet.map(f => ({x: +f.ax.toFixed(2), y: +f.ay.toFixed(2), lift: +f.lift.toFixed(2), swing: !!f.step, z: +(f.az || 0).toFixed(2)})), face: {mouth: M.mouth.x, tongue: M.tongue.x, munch: M.munch.x, smile: M.smile.x, eye: M.eyeO.x, cheek: M.cheekP ? M.cheekP.x : 0, droop: M.tdrop ? M.tdrop.x : 0, curl: M.tcurl ? M.tcurl.x : 0}, body: {sq: P.sq.x, bob: M.walkBob.x, roll: M.roll.x, lean: M.lean.x, nod: M.nod.x, tilt: M.headTilt.x, arm: M.arm.map(a => a.x), gait: M.gait ? M.gait.w.x : 0}},
     perf: {frames: perf.n, avgMs: perf.n ? perf.ms / perf.n : 0, maxMs: perf.max, intervalMs: interval},
     status: {agentsRunning: status.agentsRunning, quotaLeftPercent: status.quotaLeftPercent}, agentCount: status.agentCount, menu: {open: MN.open, items: hostActions.map(a => a.id || a.label)}, dial: {open: MN.open, page: DL.page, focus: DL.fi, rot: DL.rot.x, o: DL.o.x, labels: DL.items.map(a => a.label), cx: DL.cx, cy: DL.cy}, dock: dockPos.ok ? {x: dockPos.x, y: dockPos.y} : null,
     chip: {on: chipEl.dataset.on === 'true', text: chipEl.getAttribute('aria-label') || ''}, layout: Object.fromEntries(Object.entries(OV.rects).map(([k, r]) => [k, {x: r.x, y: r.y, w: r.w, h: r.h}])), bubbleSide: OV.bubble.side, menuSide: OV.menu.side, source: 'procedural-webgl-naidragon'
    };
   },
   destroy() {
    if (destroyed) return;
    api.pause(); destroyed = true; stopTimers();
    document.removeEventListener('visibilitychange', onVisibility);
    if (resizeObserver) resizeObserver.disconnect();
    global.removeEventListener('resize', resize); global.removeEventListener('pointermove', pointerMove);
    global.removeEventListener('pointerup', pointerUp); global.removeEventListener('pointercancel', pointerUp);
    root.removeEventListener('pointerleave', pointerLeave); document.removeEventListener('pointerdown', pointerDown, true); document.removeEventListener('click', clickGuard, true);
    if (dprMq && dprMq.removeEventListener) dprMq.removeEventListener('change', onDpr); dprMq = null;
    document.removeEventListener('keydown', onMenuKey); document.removeEventListener('pointerdown', onMenuOutside, true); if (MN.el) MN.el.remove(); MN.el = null; MN.open = false;
    if (active) cleanTarget(active.element);
    for (const el of Array.from(transient.keys())) cleanTarget(el);
    for (const q of queue) cleanTarget(q.element);
    queue.length = 0; active = null; if (probe) probe.element.classList.remove('news-spider-probe'); probe = null; probeTarget = null;
    clearPills(); M.fx.length = 0; for (const z of M.z) z.el.remove(); M.z.length = 0;
    if (gcv) { if (gcv.removeEventListener) { gcv.removeEventListener('webglcontextlost', onLost); gcv.removeEventListener('webglcontextrestored', onRestored); } }
    if (R && R.dispose) R.dispose(); R = null;
    if (gcv && gcv.remove) gcv.remove();
    style.remove(); root.classList.remove('nd-paused', 'nd-root');
    if (rootTheme0 === null) root.removeAttribute('data-nd-theme'); else root.setAttribute('data-nd-theme', rootTheme0);
    if (rootPosSet) root.style.position = rootPos0; bubbleEl.remove(); chipEl.remove();
    if (dctx && typeof dcv.remove === 'function') dcv.remove();
    if (used2d) { try { const c2 = canvas.getContext('2d'); if (c2) { c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, canvas.width, canvas.height); } } catch (e) {} }
    if (previousStyle === null) canvas.removeAttribute('style'); else canvas.setAttribute('style', previousStyle);
    mounts.delete(canvas);
   }
  };
  M.pArm = undefined;
  const ds = root.dataset || {};
  applyOptions({size: ds.ndSize, scale: ds.ndScale, speed: ds.ndSpeed, dock: ds.ndDock, margin: ds.ndMargin, status: ds.ndStatus, dial: ds.ndDial, tilt: ds.ndTilt, theme: ds.ndTheme, ...(options || {})});
  resize(); lair.update(true);
  place(home().x, home().y);
  mounts.set(canvas, api);
  api.resume();
  return api;
 }
 global.NewsNaidragon = Object.freeze({mount});
})(window);
