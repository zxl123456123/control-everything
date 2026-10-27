/* 狸花猫 (tabbycat): procedural 3D chibi brown-tabby "clingy cat" desk pet for the news reader (design notes: TABBYCAT_NOTES.md).
 * One plain-JS file, no assets or libraries: a hand-written WebGL1 renderer draws an ellipsoid rig, a rounded head / body of revolution and a
 * dynamic tail tube, with a Canvas 2D fallback. Lazy-loaded by news-pets.js; same mount API as NewsTabbycat / NewsSpider /
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
 const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
 const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
 const CSS = `
.news-mantis-target.is-being-scanned{outline:2px solid #ffb21f!important;outline-offset:2px!important;box-shadow:0 0 14px rgba(255,190,40,.7),inset 0 0 8px rgba(255,230,140,.35)!important;background:rgba(255,214,90,.2)!important;transition:none!important}
@keyframes tcSnap{0%{transform:scale(1)}30%{transform:scale(1.12) rotate(-1.2deg);box-shadow:0 0 22px #ffc83a,0 0 30px #fff2b0}60%{transform:scale(.96)}100%{transform:scale(1)}}
.news-mantis-target.captured-burst-wobble{animation:tcSnap .6s cubic-bezier(.18,.89,.32,1.28) forwards!important;z-index:15}
.tc-paused .news-mantis-target{animation-play-state:paused!important}
.tc-bubble,.tc-dial,.tc-chip{--tc-bg:var(--tc-paper,var(--paper,#fffdf7));--tc-ink:var(--tc-fg,var(--ink,#2e2a1e));--tc-line:var(--tc-edge,var(--line,#e6dfc9));--tc-gold:var(--tc-accent,#e9a822);--tc-bd:color-mix(in srgb,var(--tc-gold) 55%,var(--tc-line))}
.tc-bubble{position:absolute;left:0;top:0;box-sizing:border-box;background:var(--tc-bg);color:var(--tc-ink);border:1px solid var(--tc-bd);font-family:inherit;box-shadow:0 8px 24px rgba(40,28,4,.16),0 1px 3px rgba(40,28,4,.1);z-index:calc(var(--tc-z,5) + 2);pointer-events:none;width:max-content;max-width:200px;padding:7px 13px;border-radius:14px;font-size:13px;font-weight:600;line-height:1.4;opacity:0;scale:.94;transition:opacity .18s,scale .18s}
.tc-bubble.on{opacity:1;scale:1}
.tc-bubble[data-hold=true]{opacity:0}
.tc-bubble::after{content:"";position:absolute;width:9px;height:9px;background:var(--tc-bg);border:0 solid var(--tc-bd);transform:rotate(45deg)}
.tc-bubble[data-side=top]::after{bottom:-5px;left:var(--tx,50%);margin-left:-4.5px;border-width:0 1px 1px 0}
.tc-bubble[data-side=bottom]::after{top:-5px;left:var(--tx,50%);margin-left:-4.5px;border-width:1px 0 0 1px}
.tc-bubble[data-side=left]::after{right:-5px;top:var(--ty,50%);margin-top:-4.5px;border-width:1px 1px 0 0}
.tc-bubble[data-side=right]::after{left:-5px;top:var(--ty,50%);margin-top:-4.5px;border-width:0 0 1px 1px}
.tc-dial{position:absolute;left:0;top:0;z-index:calc(var(--tc-z,5) + 3);width:216px;height:216px;visibility:hidden;pointer-events:none;user-select:none;touch-action:none;font-family:inherit;color:var(--tc-ink)}
.tc-dial .ring{position:absolute;inset:0;width:216px;height:216px;overflow:visible;pointer-events:none;fill:none;filter:drop-shadow(0 8px 16px rgba(40,28,4,.2))}
.tc-dial .disc{fill:var(--tc-bg);stroke:var(--tc-bd);stroke-width:1.2;pointer-events:auto}
.tc-dial .sec{fill:color-mix(in srgb,var(--tc-gold) 11%,var(--tc-bg));stroke:var(--tc-bg);stroke-width:5;stroke-linejoin:round;pointer-events:auto;cursor:pointer}
.tc-dial .sec[data-f=true]{fill:color-mix(in srgb,var(--tc-gold) 40%,var(--tc-bg))}
.tc-dial .notch{fill:var(--tc-gold)}
.tc-dial button{position:absolute;left:0;top:0;box-sizing:border-box;width:46px;height:46px;margin:-23px 0 0 -23px;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;font:inherit;display:grid;place-items:center;cursor:pointer;pointer-events:auto}
.tc-dial button svg{width:28px;height:28px;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;fill:none}
.tc-dial button:focus-visible{outline:2px solid var(--accent,#c98a00);outline-offset:1px}
.tc-dial .hub,.tc-dial .more{background:var(--tc-bg);border:1px solid var(--tc-bd)}
.tc-dial .hub{left:108px;top:108px;width:76px;height:76px;margin:-38px;font-size:14px;font-weight:700;line-height:1.15}
.tc-dial .more{left:190px;top:190px;width:44px;height:44px;margin:-22px}
.tc-chip{position:absolute;left:0;top:0;z-index:calc(var(--tc-z,5) + 1);display:flex;min-height:0;margin:0;line-height:1;align-items:center;gap:8px;height:26px;box-sizing:border-box;padding:0 11px 0 8px;border-radius:999px;border:1px solid var(--tc-line);background:color-mix(in srgb,var(--tc-bg) 94%,transparent);color:var(--tc-ink);font:inherit;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;box-shadow:0 2px 8px rgba(40,28,4,.1);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .2s,visibility 0s .2s}
.tc-chip[data-hold=true]{opacity:0!important;pointer-events:none!important}
.tc-chip[data-on=true]{opacity:.96;visibility:visible;pointer-events:auto;cursor:pointer;transition-delay:0s}
.tc-chip::after{content:"";position:absolute;inset:-9px}
.tc-chip>span{display:none;align-items:center;gap:5px}
.tc-chip[data-q] .q,.tc-chip[data-a] .a,.tc-chip[data-d] .d{display:inline-flex}
.tc-chip .q svg{width:15px;height:15px;fill:none;stroke-width:2.6}
.tc-chip .trk{stroke:var(--tc-line)}
.tc-chip .arc{stroke:#e0891a;stroke-linecap:round;stroke-dasharray:calc(var(--q,0) * .4084) 41}
.tc-chip[data-q=zero] .arc{stroke:#d64545}
.tc-chip .dot{width:7px;height:7px;border-radius:50%;background:#2fa15a;animation:tcDot 1.6s ease-in-out infinite}
.tc-chip .d{color:#2c8a4f}
.tc-chip:focus-visible{outline:2px solid var(--accent,#c98a00);outline-offset:2px}
@keyframes tcDot{50%{opacity:.35}}
.tc-root[data-tc-theme=dark] :is(.tc-bubble,.tc-dial,.tc-chip){--tc-bg:var(--tc-paper,#2b2618);--tc-ink:var(--tc-fg,#f6eed6);--tc-line:var(--tc-edge,#4d4630)}
.tc-root[data-tc-theme=light] :is(.tc-bubble,.tc-dial,.tc-chip){--tc-bg:var(--tc-paper,#fffdf7);--tc-ink:var(--tc-fg,#2e2a1e);--tc-line:var(--tc-edge,#e6dfc9)}
@media (prefers-reduced-motion:reduce){.tc-bubble,.tc-chip{transition:none}.tc-chip .dot{animation:none}}
.tc-pill{position:absolute;left:0;top:0;z-index:calc(var(--tc-z,5) + 1);pointer-events:none;padding:4px 11px;border-radius:999px;background:#fff7dc;color:#5d3a07;border:2px solid #f5a623;box-shadow:0 3px 9px rgba(120,70,0,.25);font:700 12px/1.2 system-ui,"PingFang SC","Microsoft YaHei",sans-serif;white-space:nowrap;will-change:transform}
.tc-z{position:absolute;left:0;top:0;z-index:calc(var(--tc-z,5) + 2);pointer-events:none;font:800 15px/1 system-ui,sans-serif;color:#d98a12;text-shadow:0 1px 0 #fff;will-change:transform}`;
 const mounts = new WeakMap();
 // Palette: grey-brown mackerel tabby (狸花猫): ground colour, dark stripes, cream muzzle / bib / belly, pink ears / nose / paw pads
 const COL = {
  fur: [.56, .43, .31], dark: [.2, .14, .11], cream: [.93, .85, .72], pink: [1, .6, .65], pad: [.96, .5, .58], nose: [.98, .5, .56],
  eye: [.12, .08, .06], mouth: [.42, .1, .12], tongue: [1, .5, .56], white: [.98, .97, .94], whisk: [1, 1, .97], shadow: [0, 0, 0],
  drop: [.55, .82, 1], star: [1, .93, .55], star2: [1, .62, .75], heart: [1, .45, .6], crumb: [.86, .58, .24], cheek: [1, .5, .55]
 };

 /* ---------- procedural geometry: radial shapes, rounded cones, discs and a dynamic tube ---------- */
 // head: chubby cheeks (widest low on the face) and a soft muzzle bump; body: an egg that is wider at the bottom. Part radii scale these unit shapes.
 function headShape(x, y, z) {
  const lat = Math.asin(clamp(y, -1, 1)), cheek = Math.exp(-Math.pow((lat + .3) / .5, 2)), ax = Math.abs(x);
  const s = 1 + .12 * cheek * Math.pow(ax, 1.3) + .035 * Math.exp(-Math.pow((lat + .45) / .35, 2)) * Math.pow(Math.max(0, z), 3) - .045 * ease((y - .72) / .28);
  return [x * s, y * s, z * s];
 }
 function bodyShape(x, y, z) { return [x * (1 - .1 * y) * (y < -.78 ? 1 - .06 * (-.78 - y) : 1), y * (y < -.6 ? 1 - .1 * (-.6 - y) : 1), z * (1 - .08 * y)]; }
 function radialMesh(lat, lon, fn) {
  const v = [], ix = [], dir = (th, ph) => [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)], E = 1e-3;
  for (let i = 0; i <= lat; i++) for (let j = 0; j <= lon; j++) {
   const th = PI * i / lat, ph = TAU * j / lon, d = dir(th, ph), p = fn(d[0], d[1], d[2]);
   let n = d;
   if (i > 0 && i < lat) {
    const a = fn(...dir(th + E, ph)), b = fn(...dir(th - E, ph)), c = fn(...dir(th, ph + E)), e = fn(...dir(th, ph - E));
    const tt = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], tp = [c[0] - e[0], c[1] - e[1], c[2] - e[2]];
    n = nrm(crs(tp, tt));
    if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0) n = [-n[0], -n[1], -n[2]];
   }
   v.push(p[0], p[1], p[2], n[0], n[1], n[2], j / lon, i / lat);
  }
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) { const a = i * (lon + 1) + j, b = a + lon + 1; ix.push(a, b, a + 1, a + 1, b, b + 1); }
  return {v: new Float32Array(v), i: new Uint16Array(ix)};
 }
 function coneMesh(rings, segs) { // rounded cone on +y (base radius 1 at y=0, rounded tip at y=1): ears and cheek tufts
  const v = [], ix = [], R = y => Math.sqrt(Math.max(0, 1 - y * y)) * (1 - .45 * y);
  for (let i = 0; i <= rings; i++) {
   const y = Math.sin(PI / 2 * i / rings), r = R(y), dr = (R(Math.min(1, y + .01)) - R(Math.max(0, y - .01))) / .02;
   for (let j = 0; j <= segs; j++) {
    const ph = TAU * j / segs, c = Math.cos(ph), s = Math.sin(ph);
    const n = i === rings ? [0, 1, 0] : nrm([c, -dr, s]);
    v.push(r * c, y, r * s, n[0], n[1], n[2], j / segs, y);
   }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = i * (segs + 1) + j, b = a + segs + 1; ix.push(a, b, a + 1, a + 1, b, b + 1); }
  return {v: new Float32Array(v), i: new Uint16Array(ix)};
 }
 function discMesh(rings, segs) { // flat-ish dome facing +z; local x/y span -1..1 (eyes, mouth, blush, hearts are painted on it by the shader)
  const v = [], ix = [], vert = (x, y) => { const z = .3 * (1 - x * x - y * y), n = nrm([.6 * x, .6 * y, 1]); v.push(x, y, z, n[0], n[1], n[2], x * .5 + .5, y * .5 + .5); };
  vert(0, 0);
  for (let r = 1; r <= rings; r++) for (let s = 0; s < segs; s++) vert(r / rings * Math.cos(TAU * s / segs), r / rings * Math.sin(TAU * s / segs));
  for (let s = 0; s < segs; s++) ix.push(0, 1 + s, 1 + (s + 1) % segs);
  for (let r = 1; r < rings; r++) for (let s = 0; s < segs; s++) {
   const a = 1 + (r - 1) * segs + s, a1 = 1 + (r - 1) * segs + (s + 1) % segs, b = 1 + r * segs + s, b1 = 1 + r * segs + (s + 1) % segs; ix.push(a, b, a1, a1, b, b1);
  }
  return {v: new Float32Array(v), i: new Uint16Array(ix)};
 }
 const TUBE = {N: 13, S: 10}; // dynamic tail tube: N rings of S+1 vertices + a tip vertex
 function tubeIndex() {
  const ix = [], {N, S} = TUBE;
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < S; j++) { const a = i * (S + 1) + j, b = a + S + 1; ix.push(a, b, a + 1, a + 1, b, b + 1); }
  const tip = N * (S + 1); for (let j = 0; j < S; j++) ix.push((N - 1) * (S + 1) + j, tip, (N - 1) * (S + 1) + j + 1);
  return {v: new Float32Array((N * (S + 1) + 1) * 8), i: new Uint16Array(ix)};
 }
 function sphereMesh(lat, lon) { return radialMesh(lat, lon, (x, y, z) => [x, y, z]); }
 const MESHES = {hi: () => sphereMesh(12, 16), lo: () => sphereMesh(7, 10), tiny: () => sphereMesh(4, 7), head: () => radialMesh(22, 30, headShape), body: () => radialMesh(16, 24, bodyShape), cone: () => coneMesh(8, 12), disc: () => discMesh(3, 24), tube: tubeIndex};
 const MESH_IDS = ['hi', 'lo', 'tiny', 'head', 'body', 'cone', 'disc', 'tube'];
 // materials (uP.w): 0 plain, 1 head, 2 body, 3 limb bracelets, 4 tail rings, 5 ear, 6 eye, 7 mouth, 8 blush strokes, 9 heart, 10 paw
 const M_PLAIN = 0, M_HEAD = 1, M_BODY = 2, M_LIMB = 3, M_TAIL = 4, M_EAR = 5, M_EYE = 6, M_MOUTH = 7, M_BLUSH = 8, M_HEART = 9, M_PAW = 10;

 /* ---------- parts (one pooled record per ellipsoid / mesh instance) ---------- */
 function newPart() { return {m: new Float32Array(16), n: new Float32Array(9), c: [1, 1, 1], c2: COL.dark, mesh: 'lo', def: 0, mode: 0, a: 1, gloss: .3, mat: 0, e: [0, 0, 0, 0], dyn: null, pts: null}; }
 function setPart(p, mesh, col, cx, cy, cz, ax, ay, az, rx, ry, rz, def, mode, a, gloss) {
  const m = p.m, n = p.n;
  m[0] = ax[0] * rx; m[1] = ax[1] * rx; m[2] = ax[2] * rx; m[3] = 0;
  m[4] = ay[0] * ry; m[5] = ay[1] * ry; m[6] = ay[2] * ry; m[7] = 0;
  m[8] = az[0] * rz; m[9] = az[1] * rz; m[10] = az[2] * rz; m[11] = 0;
  m[12] = cx; m[13] = cy; m[14] = cz; m[15] = 1;
  n[0] = ax[0] / rx; n[1] = ax[1] / rx; n[2] = ax[2] / rx; n[3] = ay[0] / ry; n[4] = ay[1] / ry; n[5] = ay[2] / ry;
  n[6] = az[0] / rz; n[7] = az[1] / rz; n[8] = az[2] / rz;
  p.mesh = mesh; p.c = col; p.c2 = COL.dark; p.def = def; p.mode = mode || 0; p.a = a === undefined ? 1 : a; p.gloss = gloss === undefined ? .3 : gloss; p.mat = 0;
  p.e[0] = p.e[1] = p.e[2] = p.e[3] = 0; p.dyn = null; p.pts = null;
  return p;
 }
 const AX = [1, 0, 0], AY = [0, 1, 0], AZ = [0, 0, 1];

 /* ---------- WebGL1 renderer ---------- */
 const VS = `attribute vec3 aP;attribute vec3 aN;attribute vec2 aU;uniform mat4 uM,uVP;uniform mat3 uN;uniform vec3 uSq;
varying vec3 vN;varying vec3 vP;varying vec2 vU;
void main(){vec4 wp=uM*vec4(aP,1.);vN=uN*aN;vP=aP;vU=aU;wp.xz*=uSq.x;wp.y=wp.y*uSq.y+uSq.z;gl_Position=uVP*wp;}`;
 const FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vN;varying vec3 vP;varying vec2 vU;
uniform vec3 uC,uC2;uniform vec4 uP,uF,uE;
const float PI=3.14159265;
const vec3 LIGHT=vec3(.93,.85,.72);
float seg(vec2 p,vec2 a,vec2 b,float w0,float w1){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);float d=length(pa-ba*h);float w=mix(w0,w1,h);return 1.-smoothstep(w*.55,w,d);}
vec4 eye(){vec2 e=vP.xy;float r=length(e);float aa=1.-smoothstep(.94,1.,r);if(aa<.02)discard;
float a=uP.y,s=abs(a),x2=e.x*e.x;float arc=a>0.?(.3-.9*x2):(-.5+.85*x2);
float lo=mix(-1.,arc,s),up=mix(1.,arc,s);
float bd=min(abs(e.y-lo),abs(e.y-up));float line=1.-smoothstep(.1,.2,bd);
float inside=step(lo,e.y)*step(e.y,up);
if(inside<.5&&line<.02)discard;
vec3 top=vec3(.42,.26,.05),mid=vec3(.92,.6,.1),bot=vec3(1.,.9,.42);
float gy=clamp(.5-e.y*.5,0.,1.);vec3 ir=mix(top,mid,smoothstep(.0,.5,gy));ir=mix(ir,bot,smoothstep(.45,1.,gy));
ir=mix(ir,vec3(.5,.66,.2),smoothstep(.55,.95,r)*smoothstep(.0,.6,gy)*.55);
vec2 lk=vec2(uE.x,uE.y)*.26;float pr=.3+.2*uE.z;vec2 pp=(e-lk)*vec2(1.,.82);float pd=length(pp);
vec3 col=mix(ir,vec3(.03,.02,.02),1.-smoothstep(pr-.05,pr+.03,pd));
col=mix(col,vec3(.17,.1,.03),smoothstep(.78,.97,r)*.8);
col=mix(col,vec3(.05,.03,.03),smoothstep(.5,.92,e.y)*.7);
float h1=1.-smoothstep(.24,.3,length((e-vec2(-.3,.38))*vec2(1.,1.1)));col=mix(col,vec3(1.),h1*.98);
float h2=1.-smoothstep(.1,.14,length(e-vec2(.34,-.36)));col=mix(col,vec3(1.),h2*.92);
col=mix(col,vec3(.07,.04,.035),line);
return vec4(col,aa*clamp(max(inside,line),0.,1.));}
vec4 mouth(){vec2 e=vP.xy;float o=uE.x,sm=uE.y;float al=0.;vec3 col=vec3(.2,.06,.07);
float ax=abs(e.x),t=(ax-.5)/.5;float lobe=-.4*sm*sqrt(max(0.,1.-t*t));float yy=-.18+lobe+.12*sm*(1.-ax);
float ln=1.-smoothstep(.035,.085,abs(e.y-yy+(ax<.5?0.:0.)));ln*=1.-smoothstep(.92,1.,ax);ln*=step(ax,1.);
float ph=(1.-smoothstep(.05,.14,ax))*step(-.1,e.y)*step(e.y,.85)*(1.-smoothstep(.0,.12,abs(e.x)-.05));
float closed=max(ln,ph*.0)*(1.-smoothstep(.0,.3,o));
vec2 c=vec2(0.,-.2-.4*o);vec2 q=(e-c)/vec2(.78,.12+.62*o);float d=length(q);float ov=1.-smoothstep(.85,1.,d);ov*=smoothstep(.02,.18,o);
vec3 inner=mix(vec3(.45,.09,.12),vec3(.2,.04,.06),smoothstep(-1.,1.,e.y));
float tg=(1.-smoothstep(.0,.25,length((e-vec2(0.,-.2-.7*o))*vec2(1.,1.5))-.34*o))*step(e.y,-.15-.2*o)*smoothstep(.2,.5,o);
col=mix(inner,vec3(1.,.5,.56),tg);al=max(ov,closed*.8);col=mix(col,vec3(.5,.24,.22),closed*(1.-ov));
if(al<.02)discard;return vec4(col,al);}
vec4 blush(){vec2 e=vP.xy;float a=0.;for(int i=0;i<3;i++){float cx=-.55+.55*float(i);a=max(a,seg(e,vec2(cx-.14,-.35),vec2(cx+.14,.35),.16,.14));}
a*=uE.x;if(a<.02)discard;return vec4(vec3(1.,.42,.5),a*.85);}
vec4 heart(){vec2 e=vP.xy*1.25;e.y+=.12;float x=e.x,y=e.y;float v=pow(x*x+y*y-1.,3.)-x*x*y*y*y;float a=1.-smoothstep(-.02,.06,v);if(a<.02)discard;
return vec4(mix(vec3(1.,.45,.6),vec3(1.,.8,.85),smoothstep(-.4,.9,y)*.45)*1.,a);}
void main(){vec3 N=normalize(vN);
if(uP.x>1.5){float d=length(vP.xz);float a=pow(clamp(1.-d,0.,1.),1.25)*uP.z;gl_FragColor=vec4(.07,.04,.02,.9)*a;return;}
float mt=uP.w;
if(mt>5.5&&mt<6.5){vec4 c=eye();gl_FragColor=vec4(c.rgb*c.a,c.a);return;}
if(mt>6.5&&mt<7.5){vec4 c=mouth();gl_FragColor=vec4(c.rgb*c.a,c.a);return;}
if(mt>7.5&&mt<8.5){vec4 c=blush();gl_FragColor=vec4(c.rgb*c.a*uP.z,c.a*uP.z);return;}
if(mt>8.5&&mt<9.5){vec4 c=heart();gl_FragColor=vec4(c.rgb*c.a*uP.z,c.a*uP.z);return;}
vec3 base=uC;float ao=1.,sss=0.;
if(mt>.5&&mt<1.5){vec3 d=normalize(vP);float lon=atan(d.x,d.z),lat=asin(clamp(d.y,-1.,1.));vec2 q=vec2(abs(lon),lat);
float st=seg(q,vec2(0.,.6),vec2(0.,1.02),.085,.035);
st=max(st,seg(q,vec2(.3,.54),vec2(.42,.96),.07,.03));
st=max(st,seg(q,vec2(1.,-.1),vec2(1.45,.0),.055,.026));st=max(st,seg(q,vec2(.98,-.3),vec2(1.4,-.28),.05,.024));
float bk=smoothstep(1.7,2.1,q.x);st=max(st,bk*smoothstep(.7,.9,sin(lat*8.)))*.9;
float mz=(1.-smoothstep(.42,.72,q.x))*(1.-smoothstep(-.38,-.1,lat))*step(0.,d.z);float chin=1.-smoothstep(-.92,-.62,lat);float cr=max(mz,chin*.8);
base=mix(base,base*1.1,smoothstep(.2,.9,d.y));base=mix(base,LIGHT,cr);base=mix(base,uC2,st*(1.-cr)*.95);
ao*=mix(.78,1.,smoothstep(-1.,-.55,lat));sss=.08;}
else if(mt>1.5&&mt<2.5){vec3 d=normalize(vP);float lon=atan(d.x,d.z);
float bw=.6+.12*(-d.y);float bib=smoothstep(.2,.5,d.z)*(1.-smoothstep(bw-.2,bw,abs(d.x)));bib*=1.-smoothstep(.55,.95,d.y)*.4;
float ring=smoothstep(.62,.9,sin(d.y*7.+.8*sin(lon*2.+1.)))*.85;
float dors=(1.-smoothstep(.05,.17,abs(d.x)))*(1.-smoothstep(-.65,-.2,d.z));
base=mix(base,LIGHT,bib*.95);base=mix(base,uC2,max(ring*(1.-bib)*smoothstep(.0,.25,-d.z+.55),dors*.85));
ao*=mix(.62,1.,smoothstep(-1.,-.55,d.y));ao*=1.-.3*smoothstep(.55,1.,d.y)*step(0.,d.z);}
else if(mt>2.5&&mt<3.5){float zz=vP.z;float br=max(1.-smoothstep(.06,.12,abs(zz-.15-uE.x)),1.-smoothstep(.06,.12,abs(zz-.55-uE.x)));base=mix(base,uC2,br*.9);ao*=mix(.85,1.,smoothstep(-1.,-.2,vP.y));sss=.12;}
else if(mt>3.5&&mt<4.5){float s=vU.x;float b=sin(s*PI*2.*5.+.9);float dk=smoothstep(.0,.3,b)*smoothstep(.1,.22,s);dk=max(dk,smoothstep(.84,.92,s));base=mix(base,uC2,dk*.95);base=mix(base,base*1.08,smoothstep(.4,.9,vP.y)*0.);sss=.1;}
else if(mt>4.5&&mt<5.5){float inner=smoothstep(.0,.25,vP.z)*(1.-smoothstep(.5,.72,abs(vP.x)/(1.-vP.y*.75)))*smoothstep(.06,.2,vP.y)*(1.-smoothstep(.72,.9,vP.y));
base=mix(base,vec3(1.,.62,.66),inner*.92);base=mix(base,uC2,smoothstep(.86,.98,vP.y)*(1.-inner)*.8);sss=.9;ao*=mix(.8,1.,smoothstep(.0,.3,vP.y));}
else if(mt>9.5){float dk=1.-smoothstep(.04,.09,abs(abs(vP.x)-.33))*1.;float on=smoothstep(.45,.62,vP.z)*step(.15,vP.y)*dk*.45;base=mix(base,uC2,on);sss=.35;}
float lu=dot(base,vec3(.3,.59,.11));base=mix(base,vec3(lu*.95+.1),uF.x*.5);
if(uP.x>.5){gl_FragColor=vec4(base*uP.z,uP.z);return;}
vec3 L=normalize(vec3(-.42,.78,.55)),V=normalize(vec3(0.,.14,1.));
float nl=dot(N,L),nv=max(dot(N,V),0.);
float wr=clamp((nl+.55)/1.55,0.,1.);float lit=smoothstep(.08,.9,wr);
vec3 col=base*mix(vec3(.66,.6,.7),vec3(1.06,1.03,.97),lit);
float sk=exp(-pow((nl-.02)*2.6,2.));col+=base*vec3(.2,.07,.02)*sk*.5;
col+=base*vec3(.05,.065,.1)*max(dot(N,normalize(vec3(.75,.08,.5))),0.);
col+=base*vec3(.1,.07,.04)*max(-N.y,0.);
vec3 H=normalize(L+V);col+=vec3(1.,.97,.9)*pow(max(dot(N,H),0.),24.)*uP.y*.3;
float fr=pow(1.-nv,2.4);float bkl=smoothstep(-.1,.7,dot(N,normalize(vec3(.62,.45,-.64))));
col+=vec3(1.,.9,.72)*fr*bkl*.4+base*fr*.2+base*vec3(.18,.1,.05)*fr*.3;
col+=base*vec3(.95,.3,.18)*sss*pow(clamp(dot(N,-L)*.5+.5,0.,1.),2.)*.7;
col+=vec3(.2,.14,.02)*uF.z*lit;
float ed=smoothstep(.62,.98,1.-nv);col=mix(col,base*vec3(.78,.6,.5),ed*.3*(1.-uP.y*.5));
col*=ao;float al=uP.z;gl_FragColor=vec4(min(col,vec3(1.))*al,al);}`;
 function createGL(canvas) {
  const opts = {alpha: true, premultipliedAlpha: true, antialias: true, depth: true, powerPreference: 'low-power', preserveDrawingBuffer: true};
  const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (gl.getShaderParameter && !gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (gl.getProgramParameter && !gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const U = {}; for (const n of ['uM', 'uVP', 'uN', 'uSq', 'uC', 'uC2', 'uP', 'uF', 'uE']) U[n] = gl.getUniformLocation(prog, n);
  const aP = gl.getAttribLocation(prog, 'aP'), aN = gl.getAttribLocation(prog, 'aN'), aU = gl.getAttribLocation(prog, 'aU');
  const meshes = {};
  for (const id of MESH_IDS) {
   const m = MESHES[id](), vb = gl.createBuffer(), ib = gl.createBuffer();
   gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, m.v, id === 'tube' ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.i, gl.STATIC_DRAW);
   meshes[id] = {vb, ib, n: m.i.length, tris: m.i.length / 3};
  }
  gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aN); gl.enableVertexAttribArray(aU);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  let cur = null;
  return {
   kind: 'webgl', gl, meshes,
   draw(parts, count, f, w, h) {
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(U.uVP, false, f.vp); gl.uniform3fv(U.uSq, f.sq); gl.uniform4fv(U.uF, f.fx);
    let t = 0;
    for (let i = 0; i < count; i++) {
     const p = parts[i], mesh = meshes[p.mesh];
     if (mesh !== cur) {
      cur = mesh; gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
      gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 32, 0); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 32, 12); gl.vertexAttribPointer(aU, 2, gl.FLOAT, false, 32, 24);
     }
     if (p.dyn) gl.bufferSubData(gl.ARRAY_BUFFER, 0, p.dyn);
     gl.depthMask(p.mode !== 2 && p.a >= .99 && p.mat !== M_BLUSH && p.mat !== M_HEART);
     gl.uniformMatrix4fv(U.uM, false, p.m); gl.uniformMatrix3fv(U.uN, false, p.n);
     gl.uniform3fv(U.uC, p.c); gl.uniform3fv(U.uC2, p.c2); gl.uniform4f(U.uP, p.mode, p.gloss, p.a, p.mat); gl.uniform4fv(U.uE, p.e);
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

 /* ---------- Canvas 2D fallback: the same rig painted as shaded ellipses, cone ears, a tube-less tail and drawn faces (no WebGL) ---------- */
 const css = (c, k = 1, a = 1) => `rgba(${Math.round(clamp(c[0] * k, 0, 1) * 255)},${Math.round(clamp(c[1] * k, 0, 1) * 255)},${Math.round(clamp(c[2] * k, 0, 1) * 255)},${a})`;
 const STRIPES = [[[0, .6], [0, 1.02]], [[.2, .56], [.3, .98]], [[.42, .48], [.62, .86]], [[1, -.1], [1.5, 0]]];
 function create2D(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const items = [];
  function eye2d(a, e) {
   const sq = Math.abs(a);
   ctx.lineCap = 'round'; ctx.lineJoin = 'round';
   if (sq > .55) { ctx.beginPath(); for (let i = 0; i <= 12; i++) { const x = -.8 + 1.6 * i / 12, y = a > 0 ? .25 - .8 * x * x : -.45 + .8 * x * x; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.strokeStyle = css(COL.eye); ctx.lineWidth = .3; ctx.stroke(); return; }
   ctx.save(); ctx.scale(1, 1 - sq * 1.2); ctx.translate(0, sq * .4);
   const g = ctx.createLinearGradient(0, 1, 0, -1); g.addColorStop(0, '#6b430c'); g.addColorStop(.45, '#eb9a1a'); g.addColorStop(1, '#fde66a');
   ctx.beginPath(); ctx.arc(0, 0, .96, 0, TAU); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = .1; ctx.strokeStyle = 'rgba(40,24,8,.9)'; ctx.stroke();
   ctx.beginPath(); ctx.ellipse(e[0] * .26, e[1] * .26, .3 + .2 * e[2], (.3 + .2 * e[2]) * 1.2, 0, 0, TAU); ctx.fillStyle = '#080505'; ctx.fill();
   ctx.fillStyle = 'rgba(255,255,255,.97)'; ctx.beginPath(); ctx.ellipse(-.32, .36, .23, .26, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(.32, -.34, .1, 0, TAU); ctx.fill();
   ctx.restore();
  }
  function mouth2d(o, sm) {
   ctx.lineCap = 'round';
   if (o > .15) { ctx.beginPath(); ctx.ellipse(0, -.2 - .4 * o, .7, .15 + .6 * o, 0, 0, TAU); ctx.fillStyle = '#6e1a1f'; ctx.fill(); ctx.beginPath(); ctx.ellipse(0, -.2 - .8 * o, .4, .25 * o, 0, 0, TAU); ctx.fillStyle = '#ff8090'; ctx.fill(); return; }
   ctx.strokeStyle = '#3a1612'; ctx.lineWidth = .16; ctx.beginPath(); ctx.moveTo(-1, -.18 + .1 * sm); ctx.quadraticCurveTo(-.5, -.18 - .55 * sm, 0, -.18); ctx.quadraticCurveTo(.5, -.18 - .55 * sm, 1, -.18 + .1 * sm); ctx.stroke();
  }
  function heart2d() { ctx.beginPath(); ctx.moveTo(0, -.7); ctx.bezierCurveTo(-1.3, .1, -.5, 1, 0, .4); ctx.bezierCurveTo(.5, 1, 1.3, .1, 0, -.7); ctx.fillStyle = '#ff7396'; ctx.fill(); }
  return {
   kind: '2d', ctx, meshes: {},
   draw(parts, count, f, w, h, dpr) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w / dpr, h / dpr);
    const sx = f.sq[0], sy = f.sq[1], hop = f.sq[2], u = f.u; items.length = 0;
    for (let i = 0; i < count; i++) {
     const p = parts[i], m = p.m;
     let cx = m[12], cy = m[13], cz = m[14];
     const ax = [m[0], m[1], m[2]], ay = [m[4], m[5], m[6]], az = [m[8], m[9], m[10]];
     if (p.mesh === 'cone' && p.mat !== M_EAR) { cx += ay[0] * .5; cy += ay[1] * .5; cz += ay[2] * .5; for (let k = 0; k < 3; k++) ay[k] *= .5; }
     if (p.mode !== 2) { cx *= sx; cz *= sx; cy = cy * sy + hop; for (const v of [ax, ay, az]) { v[0] *= sx; v[1] *= sy; v[2] *= sx; } }
     items.push({p, cx, cy, cz, ax, ay, az, z: cz + (p.mode === 2 ? -999 : 0) + (p.mat === M_EYE || p.mat === M_MOUTH || p.mat === M_BLUSH ? 12 : 0) + (p.mode === 1 && p.a < 1 ? 999 : 0)});
    }
    items.sort((a, b) => a.z - b.z);
    const pale = f.fx[0] * .4;
    for (const it of items) {
     const {p, ax, ay, az} = it, x = f.ox + it.cx * u, y = f.oy - it.cy * u;
     const X = [ax[0], ay[0], az[0]], Y = [ax[1], ay[1], az[1]];
     const a = X[0] * X[0] + X[1] * X[1] + X[2] * X[2], b = -(X[0] * Y[0] + X[1] * Y[1] + X[2] * Y[2]), c = Y[0] * Y[0] + Y[1] * Y[1] + Y[2] * Y[2];
     const th = .5 * Math.atan2(2 * b, a - c), mid = (a + c) / 2, df = Math.sqrt(Math.max(0, ((a - c) / 2) ** 2 + b * b));
     const r1 = Math.sqrt(Math.max(.01, mid + df)) * u, r2 = Math.sqrt(Math.max(.01, mid - df)) * u;
     const col = p.c.map(v => lerp(v, .8, pale));
     if (p.mode === 2) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r1); g.addColorStop(0, `rgba(30,18,10,${.4 * p.a})`); g.addColorStop(1, 'rgba(30,18,10,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r1, Math.max(r2, 1), th, 0, TAU); ctx.fill(); continue;
     }
     const aff = () => ctx.setTransform(dpr * ax[0] * u, -dpr * ax[1] * u, dpr * ay[0] * u, -dpr * ay[1] * u, dpr * x, dpr * y);
     if (p.mat === M_EYE || p.mat === M_MOUTH || p.mat === M_BLUSH || p.mat === M_HEART) {
      if (p.mat === M_BLUSH && p.e[0] < .05) continue;
      ctx.save(); ctx.globalAlpha = p.mat === M_EYE || p.mat === M_MOUTH ? 1 : p.a; aff();
      if (p.mat === M_EYE) eye2d(p.gloss, p.e); else if (p.mat === M_MOUTH) mouth2d(p.e[0], p.e[1]);
      else if (p.mat === M_HEART) heart2d(); else { ctx.strokeStyle = 'rgba(255,100,125,.8)'; ctx.lineWidth = .22; ctx.lineCap = 'round'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-.69 + .55 * k, -.3); ctx.lineTo(-.41 + .55 * k, .3); ctx.stroke(); } }
      ctx.restore(); continue;
     }
     if (p.mesh === 'tube') {
      const pts = p.pts; if (!pts) continue;
      ctx.globalAlpha = 1;
      for (let k = pts.length - 1; k >= 0; k--) {
       const q = pts[k], s = k / (pts.length - 1), dk = (Math.sin(s * TAU * 5 + .9) > .1 && s > .1) || s > .88;
       ctx.beginPath(); ctx.arc(f.ox + q[0] * sx * u, f.oy - (q[1] * sy + hop) * u, q[3] * u, 0, TAU);
       const cc = (dk ? p.c2 : p.c).map(v => lerp(v, .8, pale)); ctx.fillStyle = css(cc, 1 - .08 * (1 - s)); ctx.fill();
      }
      continue;
     }
     if (p.mat === M_EAR) {
      ctx.save(); ctx.globalAlpha = p.a; aff(); ctx.beginPath(); ctx.moveTo(-1, 0); ctx.quadraticCurveTo(-.9, .55, 0, 1); ctx.quadraticCurveTo(.9, .55, 1, 0); ctx.closePath(); ctx.fillStyle = css(col); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-.6, .08); ctx.quadraticCurveTo(-.5, .45, 0, .72); ctx.quadraticCurveTo(.5, .45, .6, .08); ctx.closePath(); ctx.fillStyle = css(COL.pink, 1, .95); ctx.fill(); ctx.restore(); continue;
     }
     ctx.globalAlpha = p.a; ctx.beginPath(); ctx.ellipse(x, y, r1, r2, th, 0, TAU);
     if (p.mode === 1) ctx.fillStyle = css(col);
     else {
      const rr = Math.max(r1, r2), g = ctx.createRadialGradient(x - rr * .32, y - rr * .4, rr * .08, x, y, rr * 1.05);
      g.addColorStop(0, css(col, 1.14)); g.addColorStop(.55, css(col, 1)); g.addColorStop(1, css(col, .68)); ctx.fillStyle = g;
     }
     ctx.fill();
     if (p.mode === 0 && (p.mat === M_HEAD || p.mat === M_BODY || p.mat === M_LIMB)) { // tabby stripes + cream muzzle / bib, clipped to the ellipse
      ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, r1, r2, th, 0, TAU); ctx.clip();
      const P3 = (lx, ly, lz) => [x + (ax[0] * lx + ay[0] * ly + az[0] * lz) * u, y - (ax[1] * lx + ay[1] * ly + az[1] * lz) * u, ax[2] * lx + ay[2] * ly + az[2] * lz];
      ctx.lineCap = 'round'; ctx.strokeStyle = css(COL.dark, 1, .92);
      const poly = (pts, lw) => { ctx.lineWidth = lw * u; ctx.beginPath(); let on = false; for (const q of pts) { if (q[2] < .05) { on = false; continue; } on ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); on = true; } ctx.stroke(); };
      if (p.mat === M_HEAD) {
       const at = (lon, lat) => P3(Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat));
       for (const s of STRIPES) for (const sg of [-1, 1]) { const pts = []; for (let k = 0; k <= 6; k++) pts.push(at(sg * lerp(s[0][0], s[1][0], k / 6), lerp(s[0][1], s[1][1], k / 6))); poly(pts, s[0][0] > .9 ? 1.6 : 2.2); }
       const mz = P3(0, -.62, .8); ctx.fillStyle = css(COL.cream, 1, .95); ctx.beginPath(); ctx.ellipse(mz[0], mz[1], r1 * .46, r2 * .3, th, 0, TAU); ctx.fill();
      } else if (p.mat === M_BODY) {
       const bib = P3(0, -.15, .9); const g = ctx.createRadialGradient(bib[0], bib[1], 1, bib[0], bib[1], r2 * .75); g.addColorStop(0, css(COL.cream, 1, .98)); g.addColorStop(.75, css(COL.cream, 1, .9)); g.addColorStop(1, css(COL.cream, 1, 0)); ctx.fillStyle = g;
       ctx.beginPath(); ctx.ellipse(bib[0], bib[1], r1 * .6, r2 * .72, th, 0, TAU); ctx.fill();
       for (const sg of [-1, 1]) for (const yy of [.2, .5]) { const pts = []; for (let k = 0; k <= 8; k++) { const lon = sg * lerp(1.05, 1.5, k / 8), rr = Math.sqrt(1 - yy * yy); pts.push(P3(rr * Math.sin(lon), yy, rr * Math.cos(lon))); } poly(pts, 2.4); } // two short flank stripes, like the 3D body
      }
      ctx.restore();
     }
     ctx.globalAlpha = 1;
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
  hello: ['喵~', '喵喵！', '喵呜~'], click: ['喵？', '喵~', '喵喵！'], meow: ['喵~', '喵喵！', '喵呜~'], meow2: ['喵喵喵！', '喵~喵~', '喵呜呜~'], rub: ['蹭蹭~', '喵~蹭蹭', '最喜欢你啦~'], belly: ['摸摸肚皮~', '呼噜~', '喵呜~'],
  knead: ['踩奶~', '踩踩踩~'], purr: ['呼噜呼噜~', '咕噜咕噜~'], groom: ['舔舔~', '洗洗脸~'], stretch: ['伸个懒腰~'], grab: ['抓到啦！喵', '喵！'], deliver: ['收好咯~喵', '放好啦！喵'],
  agents: ['Agent 开工啦，喵！', '我盯着呢~喵'], quota: ['额度快没啦…喵', '肚子饿扁了…喵'], sad: ['额度用完了…喵呜', '呜呜…喵'], done: ['完成啦！喵~', '搞定~喵！'],
  drag: ['放我下来喵~', '喵呜~！'], land: ['噗！', '啪叽'], yawn: ['哈欠…喵'], sleep: ['呼…'], surprise: ['喵！！'], wake: ['喵？'], point: ['这条喵！', '看这里~喵'], pounce: ['扑！喵']
 };

// CSP-safe: constructable sheets bypass style-src (inline <style> is blocked on /workspace); <style> stays the fallback.
function installStyle(root, css, nonce) {
 try { const sc = root.getRootNode(); if (!nonce && Array.isArray(sc.adoptedStyleSheets)) { const sh = new CSSStyleSheet(); sh.replaceSync(css); sc.adoptedStyleSheets = [...sc.adoptedStyleSheets, sh]; return {remove() { sc.adoptedStyleSheets = sc.adoptedStyleSheets.filter(s => s !== sh); }}; } } catch (e) { /* use <style> */ }
 const el = document.createElement('style'); if (nonce) el.setAttribute('nonce', String(nonce)); el.textContent = css; root.appendChild(el); return el;
}
 function mount({root, canvas, depot, onCapture, onDelivered, onCancel, onAction, actions, dock, followPointer = false, options, styleNonce}) {
  if (!root || !canvas || !depot || !root.contains(canvas) || !root.contains(depot)) {
   throw new TypeError('NewsTabbycat requires root, canvas and depot in the same stage');
  }
  if (mounts.has(canvas)) mounts.get(canvas).destroy();
  let sizeKey = '', seenDpr = 1, width = 1, height = 1, dpr = 1, bw = 1, bh = 1, boxKey = '', placed = false, ox = 0, oy = 0;
  let running = false, destroyed = false, rafId = null, timerId = null, lastFrame = null, frames = 0, ready = false, lostGL = false;
  let hourOpt = null, simTime = 0, speedMul = 1, sc = 1, sleepAfter = 28, collecting = false, patrolN = 0, dwell = 0, wpt = null, lastEl = null, interval = 33;
  let seed = 20261026, tris = 0, lastBubbleAt = -99;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const opt = {tilt: true, status: true, dial: true, dock: 'auto', margin: 12};
  const status = {agentsRunning: false, agentCount: 0, quotaLeftPercent: null};
  const pointer = {inside: false, x: 0, y: 0, moved: 0, down: false};
  const queue = [], transient = new Map(), perf = {n: 0, ms: 0, max: 0};
  let active = null, probe = null, probeTarget = null, probeT = 0, suppressClick = false;
  const previousStyle = canvas.getAttribute('style');
  const style = installStyle(root, CSS, styleNonce);
  // embedding: the stage must be a positioned box; every overlay is scoped by .tc-root and the --tc-z / --tc-* custom properties
  const rootPos0 = root.style.position, rootTheme0 = root.getAttribute('data-tc-theme'); let rootPosSet = false;
  if (global.getComputedStyle && global.getComputedStyle(root).position === 'static') { root.style.position = 'relative'; rootPosSet = true; }
  root.classList.add('tc-root');

  // renderer: private WebGL canvas first (so the reader's canvas stays usable by other pets), else 2D on the reader canvas
  let gcv = null, R = null, rendererKind = 'none';
  const place3d = el => {
   const s = el.style; s.position = 'absolute'; s.left = '0'; s.top = '0'; s.right = 'auto'; s.bottom = 'auto'; s.zIndex = 'var(--tc-z, 5)';
   s.pointerEvents = 'none'; s.willChange = 'transform'; el.setAttribute('aria-hidden', 'true');
  };
  try {
   gcv = document.createElement('canvas'); gcv.setAttribute('data-tc', 'gl'); place3d(gcv);
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
   Object.assign(dcv.style, {position: 'absolute', pointerEvents: 'none', zIndex: 'calc(var(--tc-z, 5) - 1)', left: '0', top: '0'});
   root.insertBefore(dcv, canvas);
  }
  const bubbleEl = document.createElement('div'); bubbleEl.className = 'tc-bubble'; bubbleEl.setAttribute('aria-hidden', 'true'); root.appendChild(bubbleEl);
  const MN = {el: null, open: false}, reduced = typeof global.matchMedia === 'function' ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const OV = {gap: 14, pad: 8, rects: {}, chipKey: '', done: 0, bubble: {w: 0, h: 0, side: null}, menu: {side: null}, chip: {w: 0, h: 0, side: null}};
  // small status chip beside the pet: quota ring while the quota is low, a running-agents count, a short "done" tick; hidden otherwise
  const chipEl = document.createElement('button'); chipEl.type = 'button'; chipEl.className = 'tc-chip'; chipEl.dataset.on = 'false'; chipEl.tabIndex = -1; chipEl.setAttribute('aria-hidden', 'true');
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
   // posture weights (sit is the resting pose; stand = none of them): sit upright / loaf / belly-up / curled sleep, plus crouch + stretch
   sit: sd(1), loaf: sd(), lie: sd(), curl: sd(), crouch: sd(), stretch: sd(), ground: sd(1), sleep: sd(), hang: sd(),
   // head + face
   nod: sd(), headYaw: sd(), headTilt: sd(), eyeX: sd(), eyeY: sd(), squint: sd(), sleepy: sd(), pupil: sd(.15), mouth: sd(), smile: sd(.5), blush: sd(), tongue: sd(),
   earBack: [sd(), sd()], earFwd: sd(), earT: [sd(), sd()], cheekP: sd(),
   // motion channels
   roll: sd(), lean: sd(), rub: sd(), rubPh: 0, rubDir: 1, purr: sd(), knead: sd(), kneadPh: 0, groom: sd(), groomSide: 1, cheer: sd(), point: sd(), swat: sd(), reach: null,
   paw: [{lift: sd(), fwd: sd()}, {lift: sd(), fwd: sd()}], hindLift: [sd(), sd()], wiggle: sd(),
   tailUp: sd(.2), tailWrap: sd(.8), tailAmp: sd(.25), tailFluff: sd(), tailPh: 0, tailJ: [sd(), sd(), sd()], tailTip: sd(), earAim: {x: sd(), y: sd()}, pose: -1, trn: null, tipT: 2,
   shx: sd(), shz: sd(), bulge: sd(), kick: sd(), breath: sd(), alert: sd(), quota: sd(), sad: sd(), carry: sd(), surprise: sd(), happy: sd(), worry: sd(),
   dang: sd(), dangV: 0, doneQ: false, busyT: 3, hungryT: 2, wasAlert: false, wasQuota: false, wasSad: false, bang: 0,
   feet: [], pills: [], fx: [], z: [], blink: 0, nextBlink: 2.2, dbl: 0, nextAct: 3.2, act: null, actT: 0, av: {}, idleT: 0, release: 0, aff: 0, nearT: 0, still: 0, ptv: 0, hist: [], tally: {}, night: 0, lastAct: '', actGap: 0,
   stepSide: 0, gait: {w: sd(), ph: 0, on: false, ls: 14, dir: [0, 1], n: 0, bob: 0, roll: 0, pitch: 0, amp: 0, cnt: 0}, drag: null, dragT: 0, talk: 0, bubbleT: 0, bubbleText: '', sleepWake: false, wasSleep: false, moving: false, standing: false,
   look: null, aim: null, dest: null, zT: 0, tipPx: [{x: 0, y: 0}, {x: 0, y: 0}], clicks: 0, clickT: 0, tearT: 0, purrT: 0, dHop: false, eyeCs: sd()
  };
  const unit = () => sc * .78 * (.9 + .22 * c01(P.y / Math.max(1, height)));
  function bounded(x, y) {
   const u = unit(), mx = Math.min(44 * u, width / 3);
   return {x: clamp(x, mx, width - mx), y: clamp(y, Math.min(46 * u, height / 3), height - 4)};
  }
  // posture blend: value for stand / sit / loaf / belly-up / curled, mixed by the (smoothed) posture weights
  const pk = (st, si, lo, li, cu) => lerp(lerp(lerp(lerp(st, si, M.sit.x), lo, M.loaf.x), li, M.lie.x), cu, M.curl.x);
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
    c.fillStyle = 'rgba(70,40,30,.16)'; c.beginPath(); c.ellipse(x, y + ry * .55, rx * 1.04, ry * .6, 0, 0, TAU); c.fill();
    const g = c.createRadialGradient(x - rx * .25, y - ry * .5, 2, x, y, rx * 1.1);
    g.addColorStop(0, '#fff0ea'); g.addColorStop(.6, '#f7cfc6'); g.addColorStop(1, '#e49f9a');
    c.fillStyle = g; c.strokeStyle = 'rgba(176,96,96,.75)'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(x, y + wob * .3, rx, ry, 0, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(176,96,96,.45)'; c.setLineDash([4, 5]); c.beginPath(); c.ellipse(x, y + wob * .3, rx * .78, ry * .66, 0, 0, TAU); c.stroke(); c.setLineDash([]);
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
   M.feet = [[-1, 0], [1, 0], [-1, 1], [1, 1]].map(([side, hind]) => ({side, hind, ax: x, ay: y, az: 0, sx: x, sy: y, t: 1, step: false, lift: 0, pitch: 0, h: 4, land: 0}));
   resetFeet(unit()); M.gait.on = false;
  }
  // where a foot rests, as a point on the ground (stage px: x across, y toward the camera) plus its rig depth relative to the body
  function slot(f, u) {
   const ps = P.yaw.x, cy = Math.cos(ps), sy = Math.sin(ps), s = f.side, sxs = 1 + .5 * P.sq.x;
   const lat = f.hind ? pk(15, 25, 24, 16, 18) : pk(12, 11, 11, 11, 10), fwd = f.hind ? pk(-17, 13, 4, -6, 6) : pk(21, 24, 26, 18, 16) + 22 * M.stretch.x;
   const z = -s * lat * sy + fwd * cy;
   return {x: P.x + (s * lat * cy + fwd * sy) * sxs * u, y: P.y + z * u, z};
  }
  function resetFeet(u) { for (const f of M.feet) { const s = slot(f, u); f.ax = f.sx = s.x; f.ay = f.sy = s.y; f.az = s.z; f.step = false; f.t = 1; f.lift = 0; f.pitch = 0; f.land = 0; } }
  function say(key, force, ms = 2300) {
   const arr = SAY[key] || [key];
   if (!force && simTime - lastBubbleAt < 4.5) return;
   lastBubbleAt = simTime; M.bubbleText = arr[Math.floor(rnd() * arr.length)]; M.bubbleT = ms / 1000;
   bubbleEl.textContent = M.bubbleText; bubbleEl.classList.add('on'); OV.bubble.w = 0;
  }
  function spark(x, y, n = 8, kind = 'spark') {
   for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, s = kind === 'heart' ? 14 + rnd() * 16 : 45 + rnd() * 80;
    M.fx.push({k: kind, x, y, vx: kind === 'heart' ? Math.cos(a) * s * .7 : Math.cos(a) * s, vy: kind === 'heart' ? -26 - rnd() * 16 : Math.sin(a) * s - 40, life: 0, max: kind === 'heart' ? 1.3 + rnd() * .5 : .6 + rnd() * .4, pink: rnd() < .35, s: .8 + rnd() * .7});
   }
  }
  // a menu change must not wait for a slow idle tick (reduced motion idles at 2 fps): run the next frame now
  function nudge() { if (!running || destroyed || rafId !== null) return; if (timerId !== null) { clearTimeout(timerId); timerId = null; } rafId = requestAnimationFrame(render); }
  function wake() { M.idleT = 0; if (M.sleep.x > .05) { M.act = null; M.sleepWake = true; } }
  function land() {
   const imp = Math.abs(P.hv), u = unit();
   if (imp > 90) { P.sq.v += imp * .014; M.bulge.v += imp * .05; M.shx.v += rnd() * 60 - 30; M.kick.v += imp * .01; spark(P.x, P.y - 4 * u, 3, 'puff'); }
   if (M.release && imp > 160) { P.hv = imp * .36; P.hop = .5; M.release--; return; }
   P.hop = 0; P.hv = 0; P.air = false; M.release = 0;
  }
  const ACTS = {meow: 1, meow2: 1, tilt: 1, twitch: 1, blinkslow: 1, groom: 1, knead: 1, purr: 1, stretch: 1, yawn: 1, roll: 1, rub: 1, chase: 1, look: 1, loaf: 1, tailflick: 1, cheer: 1, wiggle: 1, sit: 1};
  function startAct(a, force) { M.act = a; M.actT = 0; M.av = {}; M.lastAct = a; M.hist.push(a); if (M.hist.length > 6) M.hist.shift(); if (force) M.nextAct = Math.max(M.nextAct, 3); wake(); }
  function poke(kind) {
   if (destroyed) return false;
   const u = unit();
   if (typeof kind === 'string' && kind.slice(0, 5) === 'view:') { P.spin = +kind.slice(5) || 0; P.yawBase = P.spin; M.spinning = 0; }
   else if (kind === 'hop') { if (!P.air) { P.hv = 300; P.air = true; P.sq.v -= 3.2; P.wig = .6; M.happy.x = 1; spark(P.x + 20 * u, P.y - 90 * u, 4); } wake(); say('meow', true); }
   else if (kind === 'belly') startAct('roll');
   else if (kind === 'surprise') { P.hv = 420; P.air = true; P.sq.v -= 4.2; M.surprise.x = 1; M.mouth.x = .6; M.tailFluff.x = 1; M.bang = 1; spark(P.x, P.y - 100 * u, 5); wake(); say('surprise', true); }
   else if (kind === 'wiggle') { P.wig = 1.3; M.happy.x = 1; startAct('wiggle'); }
   else if (kind === 'sleep') { M.idleT = sleepAfter + 1; }
   else if (kind === 'wake') { wake(); M.idleT = 0; }
   else if (kind === 'blink') { M.blink = 1e-3; }
   else if (kind === 'bubble') say('hello', true);
   else if (kind === 'click') { wake(); startAct(rnd() < .5 ? 'meow' : 'meow2', true); }
   else if (kind === 'dance') startAct('cheer');
   else if (kind === 'tongue') startAct('groom');
   else if (ACTS[kind]) startAct(kind, true);
   else return false;
   return true;
  }
  const aimFor = (tg, sdr, ax) => {
   const u = unit(), r = tg.rect, x = clamp(ax, r.left + 5, r.left + r.width - 5);
   return {aim: {x, y: tg.y}, stand: bounded(x - sdr * 62 * u, tg.y + 40 * u), land: bounded(x - sdr * 36 * u, tg.y + 40 * u)};
  };

  /* ---------- pointer interaction: click meow / double-click belly-up / drag by the scruff ---------- */
  function toLocal(e) { const st = root.getBoundingClientRect(); return {x: e.clientX - st.left - root.clientLeft, y: e.clientY - st.top - root.clientTop}; }
  function hit(x, y) { const u = unit(), k = 1 - .3 * M.loaf.x - .35 * M.lie.x - .4 * M.curl.x; return Math.pow((x - P.x) / (42 * u), 2) + Math.pow((y - (P.y - 50 * u * k - P.hop * u)) / (54 * u * k), 2) < 1; }
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
   if (now - M.clickT < 380) { M.clickT = 0; closeMenu(); poke('belly'); }
   else { M.clickT = now; poke('click'); if (hostActions.length && opt.dial) toggleMenu(); }
  }
  /* action dial beside the pet: click a sector, or drag / wheel the ring and click the hub to confirm; the corner toggle flips pages (max 6 sectors) */
  const DW = 216, DC = 108, RI = 40, RO = 92, RB = 66;
  const K = k => () => poke(k), MORE = [['pat', '摸肚皮', 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z', K('belly')], ['rub', '蹭蹭', 'M4 14c2-6 6-8 8-8s6 2 8 8 M9 12v.01 M15 12v.01 M10 16c1 1 3 1 4 0', K('rub')],
   ['knead', '踩奶', 'M8 11a2 2 0 1 0 0-.01 M16 11a2 2 0 1 0 0-.01 M12 7a2 2 0 1 0 0-.01 M12 13c-3 0-5 2-5 4 0 2 2 2 5 1 3 1 5 1 5-1 0-2-2-4-5-4z', K('knead')], ['purr', '呼噜', 'M3 12c3-5 6 5 9 0s6 5 9 0', K('purr')], ['nap', '睡觉', 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z', K('sleep')],
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
   const el = MN.el = document.createElement('div'); el.className = 'tc-dial'; el.setAttribute('role', 'menu'); el.setAttribute('aria-label', '狸花猫转盘'); el.dataset.open = String(MN.open);
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
   MN.open = true; MN.el.dataset.open = 'true'; if (DL.page) setPage(0); DL.f = DL.rot.x = DL.rot.v = 0; DL.btns.concat(DL.hub, DL.tog).forEach(b => { b.tabIndex = 0; }); wake(); nudge();
   // The render loop reveals the dial on its next frame; a hidden element cannot take focus, so reveal it now.
   if (focus && DL.btns[0]) { if (!DL.vis) { DL.vis = true; MN.el.style.visibility = 'visible'; } DL.btns[0].focus({preventScroll: true}); }
   return true;
  }
  function closeMenu() {
   if (!MN.open) return false;
   MN.open = false; DL.drag = null; if (MN.el) { MN.el.dataset.open = 'false'; DL.btns.concat(DL.hub, DL.tog).forEach(b => { b.tabIndex = -1; }); if (MN.el.contains(document.activeElement)) document.activeElement.blur(); }
   nudge();
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
   resetFeet(u); M.gait.on = false;
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
   const T = {point: 0, crouch: 0, lean: 0, mouth: 0, smile: .62, sit: 0, lie: 0, loaf: 0, curl: 0, stretch: 0, happy: 0, tail: .3, tailSpd: 4.4, tongue: 0, cheek: 0, tilt: 0, nodAdd: 0, eyeC: 0, worry: 0, wig: 0, surprise: 0, squint: 0, sleepy: 0, pupil: 0, blush: .12, earFwd: 0, earBack: 0, tailUp: 0, tailWrap: 0, fluff: 0, groom: 0, purr: 0, knead: 0, cheer: 0, rub: 0};
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
     T.point = 1; T.lean = .12; T.tail = .6; T.tailSpd = 9; T.smile = .8;
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
     T.cheer = P.stageT > .5 && P.stageT < 1.9 ? 1 : 0;
     if (P.stageT > .12 && !M.dHop) { M.dHop = true; poke('hop'); spark(P.x, P.y - 100 * u, 8); say('deliver', true, 1700); }
     if (P.stageT > STAGE.deliver) { P.stage = null; M.dHop = false; }
    } else if (probeTarget) {
     if (!probe.side) { probe.side = sgn(probeTarget.x - P.x); probe.ax = P.x + probe.side * 40 * u; }
     const s = aimFor(probeTarget, probe.side, probe.ax); dest = dockPos.ok ? home() : s.stand; aim = s.aim; look = probeTarget; calm = false;
     const near = Math.hypot(P.x - dest.x, P.y - dest.y) < 6 * u; faceDir = near ? (dockPos.ok ? sgn(probeTarget.x - P.x) : probe.side) : 0; standing = near;
     T.point = near ? 1 : .35; T.lean = near ? .15 : 0; T.tail = .5; M.probeAim = aim;
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
    if (M.sad.x < .5 && !active && !M.drag) { M.act = 'cheer'; M.actT = 0; M.nextAct = 4.5; M.kick.v += 3; spark(P.x, P.y - 96 * u, 10); }
   }
   if (M.bang > 0) M.bang -= dt;
   updateChip(dt);

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
   // what the cat is in the mood for: affection grows while the pointer stays near and still, sleepiness comes with the evening, nothing repeats
   const hr = hourOpt !== null ? hourOpt : (new Date().getHours() + new Date().getMinutes() / 60);
   const nightT = hr >= 22 || hr < 5 ? 1 : hr >= 20 ? (hr - 20) / 2 : hr < 7 ? (7 - hr) / 2 : 0;
   M.night = lerp(M.night, nightT, Math.min(1, dt * .5));
   const pDist = pointer.inside ? Math.hypot(pointer.x - P.x, pointer.y - P.y) : 1e9, pNear = pDist < 340 * u && M.sleep.x < .6;
   M.ptv = lerp(M.ptv, pointer.inside ? Math.hypot(pointer.x - (M.pp ? M.pp.x : pointer.x), pointer.y - (M.pp ? M.pp.y : pointer.y)) / Math.max(dt, 1e-3) : 0, Math.min(1, dt * 8)); M.pp = {x: pointer.x, y: pointer.y};
   M.nearT = pNear ? M.nearT + dt : Math.max(0, M.nearT - dt * 2); M.still = pNear && M.ptv < 90 ? M.still + dt : Math.max(0, M.still - dt * 3);
   M.aff = clamp(M.aff + (M.still > 1.5 ? .06 : pNear ? .015 : -.012) * dt, 0, 1);
   M.actGap += dt; M.nextAct -= dt;
   if (calm && !M.act && M.sleep.x < .2 && M.quota.x < .5 && M.nextAct <= 0 && Math.abs(P.spd.x) < 4 && !P.air) {
    const n = M.night, af = M.aff, h = M.hist, pk = pNear && M.nearT > 2, play = pointer.inside && pDist > 160 * u && pDist < 460 * u && M.ptv > 60 && af < .55 && n < .6;
    const W = {meow: 1, tilt: .8, look: .8, tailflick: .8, groom: 1.1, blinkslow: .7 + 1.4 * af, twitch: .6, stretch: .7 * (1 + .5 * n), yawn: .35 * (1 + 4 * n), purr: .5 + 1.4 * af, knead: .4 + .9 * af + .9 * n, loaf: .35 * (1 + 4 * n), wiggle: .3 * (1 - .7 * n),
     meow2: pk ? .3 + 1.3 * af : 0, rub: pk && pDist > 70 * u ? .2 + 1.6 * af : 0, roll: af > .55 ? 1.1 * af : 0, chase: play ? 1.4 : 0};
    W.look *= 1 - .5 * n; W.groom *= 1 + .5 * n; W.groom *= 1 - .4 * af;
    // what tends to follow what: a stretch ends in a yawn or a meow, a groom in a slow blink, a belly roll in a stretch, kneading in a loaf
    const FOL = {stretch: {yawn: 1.6, meow: 1.8}, groom: {blinkslow: 1.8, loaf: 1.6}, yawn: {loaf: 2.2 * (1 + n), groom: 1.4}, roll: {stretch: 2.6, purr: 1.5}, knead: {loaf: 3, purr: 2}, rub: {purr: 2.5, meow2: 1.6}, chase: {groom: 3, look: 1.5}, loaf: {stretch: 2, yawn: 1.5}, purr: {blinkslow: 1.6, knead: 1.5}};
    const fo = FOL[M.lastAct]; if (fo) for (const kk in fo) if (W[kk]) W[kk] *= fo[kk];
    const REC = [0, .15, .4, .7]; // the last act never repeats at once, the ones before it come back less often
    for (let i = 0; i < 4 && i < h.length; i++) if (W[h[h.length - 1 - i]] !== undefined) W[h[h.length - 1 - i]] *= REC[i];
    let tot = 0; for (const kk in W) tot += W[kk];
    let r = rnd() * tot, pick = 'meow'; for (const kk in W) { r -= W[kk]; if (r <= 0) { pick = kk; break; } }
    M.act = pick; M.actT = 0; M.av = {}; M.actGap = 0; h.push(pick); if (h.length > 6) h.shift(); M.lastAct = pick; M.tally[pick] = (M.tally[pick] || 0) + 1;
    M.nextAct = (3.2 + rnd() * 4.2) * (1 + .8 * n) * (1 - .4 * af);
   }
   let lookT = null;
   const wantStandAct = M.act === 'stretch' || (M.act === 'chase' && M.av.ph < 3);
   if (M.act) {
    M.actT += dt; const a = M.act, k = M.actT, av = M.av, ptrNear = pointer.inside && Math.hypot(pointer.x - P.x, pointer.y - P.y) < 520 * u;
    if (a === 'meow' || a === 'meow2') { // 喵~ / 喵喵！: the mouth opens and shuts with the voice, the chin lifts, the eyes narrow a little
     const two = a === 'meow2', me = two ? Math.max(env(k, .1, .5, .16), env(k, .74, 1.16, .16)) : env(k, .12, .95, .4);
     T.mouth = (two ? .55 : .7) * me; T.nodAdd = -.2 * me; T.eyeC = .22 * me; T.happy = .5; T.tail = .5; T.tailSpd = 5; T.tilt = .06 * Math.sin(k * 3); T.earFwd = .3; T.blush = .4;
     if (k > .08 && !av.said) { av.said = 1; say(two ? 'meow2' : 'meow', true, 1700); M.bulge.v += 3; }
     if (k > (two ? 1.9 : 1.6)) M.act = null;
    } else if (a === 'tilt') { T.tilt = .34 * sgn(Math.sin(seed)); T.nodAdd = -.05; T.pupil = .8; T.earFwd = .8; T.eyeC = -.1; if (k > 1.9) M.act = null; }
    else if (a === 'twitch') { if (!av.s) { av.s = 1; M.earT[0].v += 22; M.earT[1].v -= 6; M.headTilt.v += .6; } if (k > .5 && av.s === 1) { av.s = 2; M.earT[1].v += 22; } if (k > 1.1) M.act = null; }
    else if (a === 'blinkslow') { T.sleepy = env(k, .2, .75, .45); T.happy = .5; T.blush = .5; T.smile = .85; if (k > 1.5) M.act = null; }
    else if (a === 'look') { lookT = {x: P.x + Math.sin(k * 2.1) * 150, y: P.y - 60 * u + Math.cos(k * 1.6) * 30}; T.earFwd = .5; T.pupil = .5; if (k > 2.8) M.act = null; }
    else if (a === 'tailflick') { if (!av.s) { av.s = 1; M.tailJ[0].v += 8; M.tailJ[1].v -= 10; M.tailJ[2].v += 12; } T.tailUp = .9; T.tailWrap = 0; T.tail = .6; if (k > 1.5) M.act = null; }
    else if (a === 'groom') { // lick a paw
     if (!av.s) { av.s = 1; M.groomSide = rnd() < .5 ? -1 : 1; }
     const ge = env(k, .3, 2.9, .5); T.groom = ge; T.squint = .35 * ge; T.sleepy = .5 * ge; T.nodAdd = .2 * ge; T.tilt = .12 * ge * M.groomSide; T.smile = .7; T.mouth = .14 * ge * (.5 + .5 * Math.sin(k * 9)); T.tongue = ge * (.5 + .5 * Math.sin(k * 9));
     if (k > 3.5) M.act = null;
    } else if (a === 'knead') { // 踩奶: loaf, alternate front paws, purr
     T.loaf = 1; const ke = env(k, .9, 4.6, .6); T.knead = ke; T.purr = ke; T.squint = .9 * ke; T.blush = .7 * ke; T.smile = .9; T.tail = .35; T.tailWrap = .9; T.nodAdd = .08 * ke; T.tilt = Math.sin(k * 3.2) * .05 * ke;
     if (k > 1.2 && !av.said) { av.said = 1; say('knead', true, 2200); }
     if (k > 5.6) M.act = null;
    } else if (a === 'purr') { const pe = env(k, .4, 3.4, .6); T.purr = pe; T.sleepy = .75 * pe; T.blush = .6 * pe; T.smile = .9; T.nodAdd = .06; T.tail = .25; if (k > .6 && !av.said) { av.said = 1; say('purr', true, 2400); } if (k > 4) M.act = null; }
    else if (a === 'stretch') {
     const se = env(k, .55, 2.0, .7); T.stretch = se; T.mouth = .45 * env(k, 1.0, 1.7, .4); T.eyeC = .85 * env(k, .9, 1.9, .4); T.tail = .5; T.tailUp = 1; T.tailWrap = 0; T.nodAdd = .1 * se;
     if (k > .15 && !av.said) { av.said = 1; say('stretch', true, 1700); }
     if (k > 3) M.act = null;
    } else if (a === 'yawn') { const yw = env(k, .2, 1.45, .55); T.mouth = yw; T.eyeC = .85 * env(k, .3, 1.4, .45); T.nodAdd = -.24 * yw; T.tongue = .5 * yw; T.smile = .45 * (1 - yw); T.earBack = .4 * yw; if (k > 2.2) M.act = null; }
    else if (a === 'roll') { // belly up and wriggle
     const re = env(k, .55, 4.6, .8); T.lie = re; T.squint = .85 * env(k, 1, 4.4, .5); T.blush = .8 * re; T.purr = .8 * env(k, 1.2, 4.2, .6); T.mouth = .1 * re; T.smile = .9; T.tail = .5; T.tailSpd = 4; T.wig = .5 * env(k, 1, 4.2, .6); T.nodAdd = -.1 * re;
     if (k > .8 && !av.said) { av.said = 1; say('belly', true, 2300); }
     if (k > 5.6) M.act = null;
    } else if (a === 'rub') { // 蹭蹭: walk to the pointer (or the nearest stage edge), lean into it and sweep the cheek along it
     if (!av.s) { av.s = 1; av.ptr = ptrNear; av.dirW = P.x < width / 2 ? -1 : 1; av.t0 = -1; }
     let dir, tx, ty;
     if (av.ptr && ptrNear) { dir = sgn(pointer.x - P.x) || av.dir || 1; tx = pointer.x - dir * 34 * u; ty = pointer.y + 6 * u; av.px = pointer.x; }
     else { dir = av.dirW; const mx = Math.min(44 * u, width / 3); tx = dir < 0 ? mx : width - mx; ty = P.y; if (av.ptr) { av.ptr = false; av.t0 = -1; } }
     av.dir = dir; M.rubDir = dir; dest = bounded(tx, ty);
     const near = Math.hypot(dest.x - P.x, dest.y - P.y) < 8 * u && Math.abs(P.spd.x) < 18;
     if (near && av.t0 < 0) { av.t0 = k; say('rub', true, 2300); }
     if (av.t0 >= 0) {
      standing = true; faceDir = dir; const kk = k - av.t0; T.rub = env(kk, .25, 3.8, .6); T.squint = .85 * T.rub; T.blush = .85 * T.rub; T.purr = .5 * T.rub; T.smile = 1; T.tailUp = 1; T.tailWrap = 0; T.tail = .55; T.tailSpd = 6; T.lean = 0;
      if (Math.floor(kk / .7) !== Math.floor((kk - dt) / .7) && kk > .3) spark(P.x + dir * 8 * u, P.y - 78 * u, 1, 'heart');
      if (kk > 4.2 || (av.ptr && ptrNear && Math.abs(pointer.x - av.px) > 90 * u)) M.act = null;
     } else if (k > 9) M.act = null;
    } else if (a === 'chase') { // stalk the pointer, wiggle, pounce, swat
     if (!av.s) { av.s = 1; av.ph = 0; }
     if (!pointer.inside && av.ph < 3) M.act = null;
     else if (av.ph === 0) { // approach to ~140px
      const dd2 = Math.hypot(pointer.x - P.x, pointer.y - P.y), dir = sgn(pointer.x - P.x) || 1; faceDir = dir; T.pupil = .8; T.earFwd = 1; T.tail = .7; T.tailSpd = 9; lookT = pointer;
      if (dd2 > 190 * u) dest = bounded(pointer.x - dir * 150 * u, pointer.y + 10 * u); else { standing = true; av.ph = 1; av.t1 = k; }
      if (k > 7) M.act = null;
     } else if (av.ph === 1) { // stalk: crouch + butt wiggle
      standing = true; faceDir = sgn(pointer.x - P.x) || 1; lookT = pointer; T.crouch = 1; T.pupil = 1; T.earFwd = 1; T.tail = .9; T.tailSpd = 18; T.wig = .7; T.eyeC = -.2; T.lean = -.1;
      if (k - av.t1 > 1.15) { av.ph = 2; av.t2 = k; av.from = {x: P.x, y: P.y}; const dr = sgn(pointer.x - P.x) || 1; av.to = bounded(pointer.x - dr * 30 * u, pointer.y + 8 * u); P.hv = 380; P.air = true; P.sq.v -= 4; say('pounce', true, 1200); }
     } else if (av.ph === 2) { // airborne
      standing = true; const kk = (k - av.t2) / .38, e2 = ease(clamp(kk, 0, 1)); P.x = lerp(av.from.x, av.to.x, e2); P.y = lerp(av.from.y, av.to.y, e2); dest = null; lookT = pointer; T.point = 1; T.mouth = .35; T.pupil = 1; T.earFwd = 1;
      M.aim = {x: pointer.x, y: pointer.y};
      if (kk >= 1) { av.ph = 3; av.t3 = k; P.sq.v += 3; spark(pointer.x, pointer.y, 6); }
     } else { // swat + happy
      standing = true; const kk = k - av.t3; dest = null; lookT = pointer; T.point = kk < .7 ? 1 : 0; T.happy = 1; T.smile = 1; T.tail = .9; T.tailSpd = 12; T.mouth = .2; T.wig = .3; T.earFwd = .6;
      if (kk > 2.0) M.act = null;
     }
    } else if (a === 'cheer') {
     const ce = env(k, .15, 2.2, .35); T.cheer = ce; T.happy = 1; T.smile = 1; T.mouth = .45; T.tail = 1; T.tailSpd = 12; T.tailUp = 1; T.tailWrap = 0; T.squint = .8 * ce; T.blush = .6;
     for (const hk of [.3, 1.0, 1.7]) if (k >= hk && k - dt < hk && !P.air) { P.hv = 280; P.air = true; P.sq.v -= 3; M.kick.v += 3; }
     if (k > 2.6) M.act = null;
    } else if (a === 'wiggle') { T.knead = .45; T.earFwd = 1; T.pupil = .5; T.wig = .5; T.tail = .7; T.tailSpd = 10; T.nodAdd = .1 * Math.sin(k * 7); if (k > 1.8) M.act = null; }
    else if (a === 'loaf') { T.loaf = 1; T.sleepy = .5 * env(k, 1, 5, 1); T.smile = .8; T.tailWrap = 1; T.tail = .2; T.purr = .3 * env(k, 1.5, 5, 1); if (k > 6) M.act = null; }
    else if (a === 'sit') { if (k > 1) M.act = null; }
    if (!calm) M.act = null;
   }
   if (M.sleep.x > .02) { const sl = M.sleep.x; T.loaf = Math.max(T.loaf, c01(sl * 2.4)); T.curl = c01((sl - .5) * 2.6); T.sleepy = Math.max(T.sleepy, c01((sl - .25) * 3)); T.smile = Math.max(T.smile, .5); T.tail = lerp(T.tail, .05, sl); T.tailWrap = Math.max(T.tailWrap, sl); T.purr = Math.max(T.purr, .35 * c01((sl - .7) * 3)); T.earBack = Math.max(T.earBack, .2 * sl); T.lie = 0; }
   if (M.sad.x > .02) { const s = M.sad.x; T.smile = lerp(T.smile, -1, s); T.worry = Math.max(T.worry, s); T.eyeC = Math.max(T.eyeC, .28 * s); T.nodAdd += .22 * s; T.tail = lerp(T.tail, .03, s); T.tailUp = lerp(T.tailUp, 0, s); T.tailWrap = lerp(T.tailWrap, 0, s); T.earBack = Math.max(T.earBack, .95 * s); T.happy = lerp(T.happy, 0, s); T.wig = 0; T.lie = T.knead = T.squint = 0; }
   if (alertOn) lookT = lookT || {x: P.x + Math.sin(t * 1.3) * 170, y: P.y - 62 * u + Math.sin(t * .9) * 22};
   if (!look && pointer.inside && M.sleep.x < .5 && Math.hypot(pointer.x - P.x, pointer.y - P.y) < 520 * u) look = pointer;
   look = look || lookT;
   if (!look) look = {x: P.x + P.face * 100, y: P.y - 55 * u};
   if (M.drag) { look = {x: pointer.x, y: pointer.y + 60 * u}; }

   // locomotion
   const dx = dest ? dest.x - P.x : 0, dy = dest ? dest.y - P.y : 0, dd = Math.hypot(dx, dy);
   const moveWant = !!dest && !standing && dd > (M.sit.x < .5 ? 2.5 : 8) * u && !M.drag;
   const wantStand = moveWant || wantStandAct || (P.stage && P.stage !== 'deliver') || !!probeTarget || P.stage === 'carry';
   T.sit = wantStand && !M.drag ? 0 : 1;
   if (M.act === 'chase' && M.av.ph === 1) T.sit = 0;
   // short transitions between the resting poses: stand -> sit, sit -> loaf, loaf -> sleep curl, sleep -> wake stretch
   {
    const pose = M.sleep.x > .5 ? 3 : T.loaf > .5 ? 2 : T.sit ? 1 : 0;
    if (M.pose < 0) M.pose = pose;
    if (pose !== M.pose) {
     const from = M.pose; M.pose = pose; M.trn = {from, to: pose, t: 0, s: 0};
     if (from === 3 && !M.act && pose < 3) { M.act = 'stretch'; M.actT = 0; M.av = {}; M.lastAct = 'stretch'; M.nextAct = Math.max(M.nextAct, 3); } // wake up with a stretch
    }
    const tr = M.trn;
    if (tr) {
     tr.t += dt; const k = tr.t;
     if (tr.to === 1 && tr.from === 0) { // sit down: the head lifts as the rump drops, a little thump when it lands
      const e = Math.sin(PI * c01(k / .8)); T.nodAdd -= .13 * e; T.earBack = Math.max(T.earBack, .12 * e);
      if (tr.s < 1 && k > .1) { tr.s = 1; P.sq.v -= 1.4; M.tailJ[0].v += 4; } if (tr.s < 2 && k > .38) { tr.s = 2; M.bulge.v += 2.4; }
      if (k > .9) M.trn = null;
     } else if (tr.to === 2) { // settle into a loaf: lean forward, tuck the paws in, ears flatten a touch
      const e = Math.sin(PI * c01(k / 1.1)); T.nodAdd += .15 * e; T.earBack = Math.max(T.earBack, .22 * e); T.sleepy = Math.max(T.sleepy, .25 * e);
      if (tr.s < 1 && k > .35) { tr.s = 1; P.sq.v -= 1.2; M.bulge.v += 2.2; M.tailJ[1].v -= 4; }
      if (k > 1.2) M.trn = null;
     } else if (tr.to === 3) { // nod off: the head droops, jerks up once, droops again, then the curl
      const e = Math.exp(-k * .85); T.nodAdd += .24 * e * Math.max(0, Math.sin(k * 5.2)) - .08 * e * Math.max(0, -Math.sin(k * 5.2));
      if (k > 3) M.trn = null;
     } else if (tr.from === 3) { // wake: ears snap up, the eyes pop open; the stretch act does the rest
      const e = Math.exp(-k * 2.2); T.earFwd = Math.max(T.earFwd, .7 * e); T.earBack = 0; if (tr.s < 1) { tr.s = 1; M.earT[0].v += 12; M.earT[1].v += 12; }
      if (k > 1.4) M.trn = null;
     } else M.trn = null;
    }
    // idle cursor reactions: the ears swivel toward the pointer, the tip of the tail flicks now and then
    const awake = M.sleep.x < .4 && !M.drag && pointer.inside && !(reduced && reduced.matches);
    const pd = Math.hypot(pointer.x - P.x, pointer.y - P.y);
    const aimOn = awake && pd < 640 * u;
    damp(M.earAim.x, aimOn ? clamp((pointer.x - P.x) / (240 * u), -1, 1) : 0, 7, dt);
    damp(M.earAim.y, aimOn ? clamp((P.y - 60 * u - pointer.y) / (240 * u), -1, 1) : 0, 7, dt);
    spring(M.tailTip, 0, 150, 7, dt);
    if (awake && pd < 520 * u && !M.act && !M.drag && M.sleep.x < .2) {
     if ((M.tipT -= dt) <= 0) { M.tipT = 1.6 + rnd() * 2.6; M.tailTip.v += (rnd() < .5 ? -1 : 1) * 7; M.tailJ[2].v += 3; }
    } else M.tipT = Math.max(M.tipT, 1.2);
   }
   const tired = 1 - .25 * M.quota.x - .2 * M.alert.x - .4 * M.sleep.x;
   const vmax = 92 * spd * tired * (P.stage === 'carry' ? .9 : 1) * Math.sqrt(unit());
   const grounded = !P.air && !M.drag && M.sit.x < .35 && M.lie.x < .2 && M.loaf.x < .3 && M.curl.x < .3;
   const go = dest && !standing && dd > 3 * u && grounded && M.sleep.x < .8 ? Math.min(vmax, dd * 4) : 0;
   damp(P.spd, go, 7, dt);
   if (M.drag) {
    const dr = M.drag, ty = pointer.y + 100 * u, tx = pointer.x - dr.ox * 0;
    const ax0 = P.x, ay0 = P.y;
    P.x += (tx - P.x) * Math.min(1, dt * 22); P.y += (ty - P.y) * Math.min(1, dt * 22);
    const vx = (P.x - ax0) / Math.max(dt, 1e-3), acc = (vx - dr.vx) / Math.max(dt, 1e-3); dr.vx = vx;
    const L = 74 * u;
    M.dang.v += (-(1500 / L) * Math.sin(M.dang.x) - 6 * M.dang.v - clamp(acc, -9000, 9000) / L * Math.cos(M.dang.x)) * dt;
    M.dang.x = clamp(M.dang.x + M.dang.v * dt, -1.3, 1.3);
    dr.lastX = pointer.x; dr.lastY = pointer.y;
    P.spd.x = 0;
   } else if (dest && dd > 1e-3 && P.stage !== 'pounce') { const k = P.spd.x * dt / dd; P.x += dx * k; P.y += dy * k * .9; }
   let want = faceDir || (Math.abs(dx) > 5 * u && go > 0 ? sgn(dx) : P.face);
   if (want !== P.face && !M.drag) { P.face = want; P.yawBase = P.spin; P.sq.v += 1.2; M.shx.v += -sgn(want) * 20; }
   P.vx = (P.x - P.pvx) / Math.max(dt, 1e-3); P.vy = (P.y - P.pvy) / Math.max(dt, 1e-3); P.pvx = P.x; P.pvy = P.y;
   const walking = Math.abs(P.vx) + Math.abs(P.vy) > 8 && !P.air && !M.drag;
   damp(M.gait.w, !P.air && !M.drag && grounded ? c01((Math.hypot(P.vx, P.vy) - 6) / 36) : 0, 6, dt); const gw = M.gait.w.x;
   // yaw: 3/4 turn toward travel direction (nearly side-on while walking), front-facing when idle
   let yawT = P.spin + P.face * lerp(.16, .9, standing && faceDir ? .45 : gw);
   if (M.sleep.x > .3) yawT = P.spin + P.face * .4;
   if (M.act && M.act !== 'rub' && M.act !== 'chase' && M.act !== 'stretch' && M.act !== 'look') yawT = P.spin + P.face * (M.act === 'roll' ? .2 : .1);
   const wrapA = a => a - TAU * Math.round(a / TAU);
   if (!M.drag && !M.spinning && !P.spin && M.sleep.x < .3 && !(M.act && M.act !== 'rub' && M.act !== 'chase' && M.act !== 'stretch' && M.act !== 'look') && Math.hypot(P.vx, P.vy) > 10 && gw > .02) {
    // walking: face the way we are going, a little turned toward the viewer (side-on is about 1.2 rad; up the page shows the back, down the page the face)
    const psi = Math.atan2(P.vx, P.vy + .36 * Math.abs(P.vx)), cur = P.yaw.x;
    yawT = lerp(yawT, cur + wrapA(psi - cur), c01(gw * 1.5));
   }
   if (M.drag) yawT = P.spin;
   const yawPrev = P.yaw.x;
   if (!M.spinning && !P.spin) { P.yaw.x = wrapA(P.yaw.x); yawT = P.yaw.x + wrapA(yawT - P.yaw.x); }
   damp(P.yaw, yawT, M.spinning ? 7 : 6.5, dt);
   if (!M.spinning && !P.spin && !M.drag) { const dy = P.yaw.x - yawPrev, cap = 5 * dt; if (Math.abs(dy) > cap) { P.yaw.x = yawPrev + Math.sign(dy) * cap; P.yaw.v *= .6; } }
   if (M.spinning && Math.abs(P.yaw.x - P.spin) < .08 && !P.air) { M.spinning = 0; const base = P.spin; P.spin = 0; P.yaw.x -= base; P.yawBase = 0; }
   if (P.air) {
    P.hv -= 2000 * dt; P.hop += P.hv * dt;
    if (P.hop <= 0 && P.hv < 0) land();
   }
   P.wig = Math.max(0, P.wig - dt * 1.1);
   spring(P.sq, T.crouch * .22 + M.sit.x * .05 + M.sleep.x * .05 + clamp(P.hv / 1300, -.15, .15) * (P.air ? -1 : 0), 340, 15, dt);
   P.sq.x = clamp(P.sq.x, -.42, .45);
   const ax = (P.vx - (M.pvx || 0)) / Math.max(dt, 1e-3), ay = (P.vy - (M.pvy || 0)) / Math.max(dt, 1e-3); M.pvx = P.vx; M.pvy = P.vy;
   spring(M.shx, clamp(-ax * .0035, -9, 9), 150, 7.5, dt);
   spring(M.shz, 0, 150, 7, dt);
   spring(M.bulge, clamp(ay * .0005, -.2, .2) * 0, 190, 6.5, dt);
   spring(M.kick, 0, 220, 9, dt);
   M.bulge.x = clamp(M.bulge.x, -.3, .3);
   for (let i = 0; i < 2; i++) { spring(M.earT[i], 0, 260, 12, dt); spring(M.hindLift[i], 0, 160, 12, dt); }
   stepFeet(dt, u, walking, grounded);
   damp(M.lean, T.lean + clamp(P.spd.x / 230, 0, .1), 9, dt);
   damp(M.crouch, T.crouch, 12, dt); damp(M.point, T.point, 10, dt);
   damp(M.sit, T.sit, 6, dt); damp(M.loaf, T.loaf, 4.2, dt); damp(M.lie, T.lie, 3.6, dt); damp(M.curl, T.curl, 2.6, dt); damp(M.stretch, T.stretch, 4.5, dt); damp(M.hang, M.drag ? 1 : 0, 14, dt);
   damp(M.ground, grounded || P.stage === 'crouch' ? 1 : 0, 16, dt);
   damp(M.happy, T.happy, 3.2, dt); damp(M.worry, T.worry, 5, dt); damp(M.surprise, T.surprise, 6, dt);
   damp(M.squint, T.squint + M.happy.x * .35, 9, dt); damp(M.sleepy, T.sleepy, 8, dt); damp(M.blush, T.blush + M.quota.x * 0, 5, dt); damp(M.tongue, T.tongue, 8, dt);
   damp(M.purr, T.purr, 5, dt); damp(M.knead, T.knead, 6, dt); damp(M.groom, T.groom, 6, dt); damp(M.cheer, T.cheer, 7, dt); damp(M.rub, T.rub, 5, dt); damp(M.cheekP, T.cheek || 0, 8, dt);
   M.kneadPh += dt * TAU * (M.act === 'wiggle' ? 3.2 : 1.7) * (M.knead.x > .02 ? 1 : 0); M.rubPh += dt * TAU * 1.15 * M.rub.x;
   damp(M.earFwd, T.earFwd + M.alert.x * .9 + M.surprise.x, 10, dt);
   for (let i = 0; i < 2; i++) damp(M.earBack[i], T.earBack + M.quota.x * .55 + M.sad.x * .4 + (M.drag ? .5 : 0), 9, dt);
   damp(M.pupil, T.pupil + M.alert.x * .3 + M.quota.x * .5 + M.surprise.x * .6 + M.worry.x * .2 - M.sleepy.x * .15, 8, dt);
   damp(M.tailUp, T.tailUp, 4, dt); damp(M.tailWrap, T.tailWrap, 3, dt); damp(M.tailAmp, T.tail, 6, dt); damp(M.tailFluff, T.fluff + M.surprise.x, 8, dt);
   damp(M.wiggle, T.wig, 8, dt);
   M.tailPh = (M.tailPh || 0) + dt * T.tailSpd;
   // head / eyes
   const ang = Math.atan2(look.x - P.x, 140 * u), body = wrapA(P.yaw.x - P.spin);
   const hy = M.drag ? 0 : clamp(ang * .5 * (M.act === 'meow' || M.act === 'meow2' || M.act === 'groom' || M.act === 'knead' ? .3 : 1) - body * .74 * c01(Math.cos(body) * 3 + 1), -.6, .6), hn = clamp((look.y - (P.y - 60 * u)) / (210 * u), -.5, .45);
   damp(M.headYaw, hy * (M.sleep.x > .4 ? .2 : 1), 11, dt);
   damp(M.nod, hn * .7 - M.gait.pitch * 2.2 + T.nodAdd + M.sleep.x * .15 + T.crouch * .1 + T.point * .12, 9, dt);
   damp(M.headTilt, T.tilt + -M.gait.roll * .9 + M.sleep.x * .1 - M.quota.x * .08, 8, dt);
   damp(M.eyeX, clamp((look.x - P.x) / (150 * u), -1, 1) * (M.sleep.x > .4 ? 0 : 1), 12, dt);
   damp(M.eyeY, clamp((look.y - (P.y - 60 * u)) / (150 * u), -1, 1) * (M.sleep.x > .4 ? 0 : -1), 12, dt);
   const blinkW = M.blink > 0 ? Math.sin(c01(M.blink) * PI) : 0;
   M.blinkW = blinkW;
   damp(M.eyeCs, T.eyeC, 14, dt);
   damp(M.mouth, Math.max(T.mouth, M.drag ? .6 : 0, M.surprise.x * .7, M.bubbleT > 0 && M.act !== 'meow' && M.act !== 'meow2' ? .06 + .07 * Math.abs(Math.sin(t * 8.6) * Math.sin(t * 2.3 + 1)) : 0), 9, dt);
   damp(M.smile, M.drag ? -.2 : T.smile, 7, dt);
   // roll / wiggle
   const sway = M.gait.roll;
   const wob = Math.sin(t * 20) * P.wig * .1 + Math.sin(t * 17) * M.wiggle.x * .09;
   spring(M.roll, sway + wob, 130, 11, dt);
   if (walking && (M.act === 'knead' || M.act === 'purr' || M.act === 'groom' || M.act === 'stretch' || M.act === 'yawn' || M.act === 'roll' || M.act === 'rub' || M.act === 'loaf' || M.act === 'sit')) M.act = null; // a sit-down gesture ends when the pet sets off
   M.look = look; M.aim = aim || M.aim; M.dest = dest; M.standing = standing; M.moving = walking;
   // tail joints: lagging wave
   const wagBase = Math.sin(M.tailPh) * M.tailAmp.x;
   for (let i = 0; i < 3; i++) spring(M.tailJ[i], wagBase * (1 + i * .4) * .6 - P.vx * .0025 * (i + 1) - M.gait.roll * 5 * (i + 1) * .6 + M.shx.x * .01, 110 - i * 20, 6.2, dt);
   // fx
   if (M.sleep.x > .6) { M.zT -= dt; if (M.zT <= 0) { M.zT = 1.2; addZ(); } }
   for (let i = M.fx.length - 1; i >= 0; i--) { const f = M.fx[i]; f.life += dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.k === 'spark') f.vy += 120 * dt; if (f.k === 'puff') { f.vx *= .93; f.vy *= .93; } if (f.k === 'heart') f.vx += Math.sin(f.life * 5 + f.s * 7) * 22 * dt; if (f.life >= f.max) M.fx.splice(i, 1); }
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
  // Phase-driven four-foot walk: diagonal pairs (FL+HR, FR+HL) swing in turn on a cadence that follows ground speed; stance feet stay pinned in world space.
  // Gait: a lateral-sequence walk (LH, LF, RH, RF) whose phase advances with the DISTANCE travelled, so the stride follows the speed.
  // Planted feet are pinned to the ground (stage x/y) and never slide; a swinging foot arcs to a point half a stride ahead of its slot.
  const GAIT_O = [.25, .75, 0, .5], GAIT_BETA = .62; // phase offsets per foot [FL, FR, HL, HR], duty factor
  function stepFeet(dt, u, walking, grounded) {
   const g = M.gait, gw = g.w.x, sxs = 1 + .5 * P.sq.x;
   const stand = M.sit.x < .5 && M.loaf.x < .4 && M.lie.x < .2 && M.curl.x < .3;
   if (!grounded || !stand) {
    g.on = false; g.amp = 0; g.bob = g.roll = g.pitch = 0;
    if (P.air || M.drag) { resetFeet(u); return; }
    // sitting / lying down: the paws glide to their resting spots (critically damped, so nothing snaps)
    for (const f of M.feet) {
     const s = slot(f, u), ox = {x: f.ax, v: f.vx || 0}, oy = {x: f.ay, v: f.vy || 0};
     damp(ox, s.x, 11, dt); damp(oy, s.y, 11, dt); f.ax = ox.x; f.vx = ox.v; f.ay = oy.x; f.vy = oy.v;
     f.az = (f.ay - P.y) / u; f.step = false; f.t = 1; f.lift *= Math.max(0, 1 - dt * 14); f.pitch *= Math.max(0, 1 - dt * 14); f.sx = f.ax; f.sy = f.ay;
    }
    return;
   }
   const vx = P.vx / (u * sxs), vz = P.vy / u, sp = Math.hypot(vx, vz), walk = gw > .12 && sp > (g.on ? 2.2 : 3.5); // hysteresis: a brief dip in speed does not restart the cycle
   if (sp > 3) { const k = Math.min(1, dt * 8); g.dir[0] = lerp(g.dir[0], vx / sp, k); g.dir[1] = lerp(g.dir[1], vz / sp, k); const l = Math.hypot(g.dir[0], g.dir[1]) || 1; g.dir[0] /= l; g.dir[1] /= l; }
   g.ls = lerp(g.ls, lerp(7, 20, c01((sp - 10) / 85)), Math.min(1, dt * 5));
   if (walk) {
    if (!g.on) { // the hind-left paw leaves first, then FL, HR, FR: a paw that would be 'overdue' at the start waits for its own turn (no extra catch-step)
     g.on = true; g.ph = (GAIT_O[2] + GAIT_BETA) % 1;
     for (let k = 0; k < 4; k++) { const f = M.feet[k]; f.arm = k === 2 || ((g.ph - GAIT_O[k]) % 1 + 1) % 1 < GAIT_BETA * .9; }
    }
    g.ph = (g.ph + sp * dt / (g.ls / GAIT_BETA)) % 1;
   } else g.on = false;
   g.svx = lerp(g.svx || 0, P.vx, Math.min(1, dt * 6)); g.svy = lerp(g.svy || 0, P.vy, Math.min(1, dt * 6));
   const wk = c01((gw - .1) / .3), lead = g.ls * .5 * wk;
   let air = 0; for (const f of M.feet) if (f.step) air++;
   for (let k = 0; k < 4; k++) {
    const f = M.feet[k], s = slot(f, u);
    f.land = Math.max(0, f.land - dt * 6);
    if (f.step) {
     const rate = lerp(dt / .2, Math.max(sp * dt / (g.ls / GAIT_BETA) / (1 - GAIT_BETA), dt / .42), wk), rem = Math.min(.5, (1 - f.t) / Math.max(rate / dt, .5));
     f.t += rate;
     // aim at where the slot will be when the paw lands, so the paw arrives with no speed of its own (it is the ground that moves under it)
     let tx = s.x + g.dir[0] * lead * sxs * u + g.svx * rem, ty = s.y + g.dir[1] * lead * u + g.svy * rem;
     if (f.t >= 1) { if (f.hx === undefined) { f.hx = tx; f.hy = ty; } tx = f.hx; ty = f.hy; } // from touchdown time on the aim is a fixed spot on the ground
     f.t = Math.min(f.t, 1);
     const e = f.t * f.t * (3 - 2 * f.t), wx = lerp(f.sx, tx, e) - f.ax, wy = lerp(f.sy, ty, e) - f.ay;
     // the paw follows its path with a capped acceleration, so it eases off the ground and onto it
     let dvx = wx - (f.vx || 0), dvy = wy - (f.vy || 0); const dm = Math.hypot(dvx, dvy), cap = 2.9 * u / 1.47;
     if (dm > cap) { dvx *= cap / dm; dvy *= cap / dm; }
     f.vx = (f.vx || 0) + dvx; f.vy = (f.vy || 0) + dvy; const vm = Math.hypot(f.vx, f.vy), vcap = 7.2 * u / 1.47; if (vm > vcap) { f.vx *= vcap / vm; f.vy *= vcap / vm; } f.ax += f.vx; f.ay += f.vy;
     f.lift = Math.pow(Math.sin(Math.pow(f.t, .8) * PI), 1.1) * f.h; f.pitch = .6 * (1 - f.t) * (1 - f.t);
     if (f.t >= 1 && Math.hypot(tx - f.ax, ty - f.ay) < 1.4 && Math.hypot(f.vx, f.vy) < 1.8) {
      f.step = false; f.hx = undefined; f.vx = f.vy = 0; f.lift = 0; f.pitch = 0; f.land = 1; f.arm = false; air--; g.n++;
      if (f.hind) { M.bulge.v += 1.3 * gw; M.shz.v += .4 * gw; } else { M.earT[f.side > 0 ? 1 : 0].v += 5 * gw; }
     }
    }
   }
   // lift-off: in the walk each foot leaves when its own phase reaches the end of its stance; at rest the worst-placed foot shuffles into place
   const disp = M.feet.map(f => { const s = slot(f, u); return Math.hypot((f.ax - s.x) / (u * sxs), (f.ay - s.y) / u); });
   const go = (k, h) => { const f = M.feet[k]; f.vx = f.vy = 0; f.hx = undefined; f.step = true; f.t = 0; f.sx = f.ax; f.sy = f.ay; f.h = h; air++; };
   const hLift = (walk ? 3.2 + 2.6 * c01((sp - 10) / 50) : 2.4) * (.55 + .45 * gw);
   g.gap = (g.gap || 0) + dt;
   if (walk) {
    // most overdue paw first; two paws never leave in the same instant (a lateral-sequence walk has one footfall per quarter stride)
    const order = [0, 1, 2, 3].filter(k => !M.feet[k].step).map(k => [k, ((g.ph - GAIT_O[k]) % 1 + 1) % 1]).sort((a, b) => b[1] - a[1]);
    for (const [k, p] of order) {
     const f = M.feet[k];
     if (p < GAIT_BETA * .9) f.arm = true; // a paw that has just landed waits for its next stance to run its course
     const rch = M.dbgLegs && M.dbgLegs[k] ? M.dbgLegs[k].raw || 0 : 0; // a planted leg that is nearly at full stretch lets go early: the bones never overstretch
     const due = (f.arm !== false && p >= GAIT_BETA && air < 2) || (f.arm !== false && disp[k] > g.ls * 1.25 && air < 3);
     if ((due && g.gap > .07) || (rch > .88 && air < 3 && p > .3) || rch > .95) { go(k, hLift); g.gap = 0; }
    }
   } else if (air === 0) {
    let mi = 0; for (let i = 1; i < 4; i++) if (disp[i] > disp[mi]) mi = i;
    if (disp[mi] > 3) go(mi, hLift);
   }
   // body motion that goes with the footfalls: two bobs per stride, a rock side to side, a nod
   const amp = gw * c01(sp / 14); g.amp = lerp(g.amp, amp, Math.min(1, dt * 10));
   g.bob = -g.amp * 1.15 * Math.cos(TAU * 2 * (g.ph - .375));
   g.roll = g.amp * .038 * Math.sin(TAU * (g.ph - .12));
   g.pitch = g.amp * .028 * Math.sin(TAU * 2 * (g.ph - .2));
  }
  function addPill(o) {
   const el = document.createElement('div'); el.className = 'tc-pill';
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
   const el = document.createElement('div'); el.className = 'tc-z'; el.textContent = M.z.length % 2 ? 'z' : 'Z'; root.appendChild(el);
   M.z.push({el, x: M.headTop ? M.headTop.x + 16 : P.x, y: M.headTop ? M.headTop.y : P.y - 80, life: 0});
  }

  /* ---------- the 3D rig: part list -> renderer ---------- */
  const parts = [], F = {vp: new Float32Array(16), base: new Float32Array(16), head: new Float32Array(4), jelly: new Float32Array(4), sq: new Float32Array(3), fx: new Float32Array(4), u: 1, ox: 0, oy: 0};
  let np = 0;
  const tailBuf = new Float32Array((TUBE.N * (TUBE.S + 1) + 1) * 8);
  function addP(mesh, col, c, ax, ay, az, r, def, mode, a, gloss) { if (!parts[np]) parts[np] = newPart(); const p = setPart(parts[np], mesh, col, c[0], c[1], c[2], ax, ay, az, r[0], r[1], r[2], def, mode, a, gloss); np++; return p; }
  function limb(a, b, r, col, rf = .55, gloss = .35) {
   const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]) || 1e-3, dn = [d[0] / len, d[1] / len, d[2] / len];
   const up = Math.abs(dn[1]) < .9 ? [0, 1, 0] : [1, 0, 0], ax = nrm(crs(up, dn)), ay = crs(dn, ax);
   const lp = addP('lo', col, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], ax, ay, dn, [r, r, len / 2 + r * rf], 0, 0, 1, gloss); lp.mat = M_LIMB; lp.c2 = COL.dark; return lp;
  }
  const T = {x: sd(0), y: sd(0)};
  function tiltStep(dt) {
   const live = pointer.inside && !(reduced && reduced.matches) && !M.drag && opt.tilt, u = unit();
   const tx = live ? clamp((pointer.x - P.x) / (260 * u), -1, 1) * .09 : 0, ty = live ? clamp((pointer.y - (P.y - 50 * u)) / (260 * u), -1, 1) * .05 : 0;
   damp(T.x, tx, 5, dt); damp(T.y, ty, 5, dt);
   if (!tx && Math.abs(T.x.x) < 1e-4) T.x.x = T.x.v = 0;
   if (!ty && Math.abs(T.y.x) < 1e-4) T.y.x = T.y.v = 0;
  }
  // rotation Ry(psi) * Rz(rho) * Rx(theta) as three column vectors
  function rotM(psi, th, rho) {
   const cx = Math.cos(th), sx = Math.sin(th), cz = Math.cos(rho), sz = Math.sin(rho), cy = Math.cos(psi), sy = Math.sin(psi);
   const f = v => { const a = [v[0] * cz - v[1] * sz, v[0] * sz + v[1] * cz, v[2]]; return [a[0] * cy + a[2] * sy, a[1], -a[0] * sy + a[2] * cy]; };
   return [f([1, 0, 0]), f([0, cx, sx]), f([0, -sx, cx])];
  }
  const mvR = (R, v) => [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2], R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]];
  const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const vlerp = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // tail profiles: [initial pitch, per-segment pitch increment, per-segment yaw increment]
  const TAILP = {low: [-.4, .05, 0], up: [.95, -.115, .0], wrap: [-.06, .015, .19]};
  function pose() {
   np = 0;
   const u = unit(), t = simTime, ps = P.yaw.x, cyw = Math.cos(ps), syw = Math.sin(ps), is2d = R && R.kind === '2d';
   const sq = P.sq.x, sxs = 1 + .5 * sq, sys = lerp(1 - .85 * sq, 1 / (sxs * sxs), .6), hop = P.hop;
   const toStage = p => ({x: P.x + p[0] * sxs * u, y: P.y - (p[1] * sys + hop) * u});
   const toRig = (sx, sy2) => [(sx - P.x) / (sxs * u), ((P.y - sy2) / u - hop) / sys, 22];
   const sit = M.sit.x, loaf = M.loaf.x, lie = M.lie.x, curl = M.curl.x, crouch = M.crouch.x, str = M.stretch.x, hang = M.hang.x, slp = M.sleep.x;
   const stand = (1 - sit) * (1 - loaf) * (1 - lie) * (1 - curl);
   const purrV = Math.sin(t * 33) * M.purr.x + Math.sin(t * 21) * M.purr.x * .5;
   const jy = (M.bulge.x + M.kick.x * .6) * .5 + (Math.sin(t * (2.8 - 1.5 * slp)) * (.55 + .5 * slp)) * .03 + M.breath.x * .03 + purrV * .008;
   F.jelly[0] = M.shx.x; F.jelly[1] = M.shz.x; F.jelly[2] = jy; F.jelly[3] = purrV;
   /* --- body frame --- */
   const rx = pk(31, 32, 35, 31, 37) * (1 - jy * .5), ry = pk(29, 29, 31, 30, 28) * (1 + jy), rz = pk(29.5, 30, 27, 29, 26) * (1 - jy * .5);
   const th = pk(1.36, 0, 1.5, -1.1, 1.5) + crouch * .16 * stand + str * .5 * stand + M.point.x * .12 * stand - M.cheer.x * .35 * stand + M.gait.pitch * stand;
   const hangD = hang * M.dang.x;
   const roll0 = M.roll.x - lie * P.face * .12 + hangD - P.face * M.lean.x * .5 * (1 - c01(M.gait.w.x * 1.2)) + M.rub.x * M.rubDir * .1 * Math.sin(M.rubPh);
   let cy0 = pk(36.5, 30, 24, 30, 22) - crouch * 10 * stand - str * 4 * stand + M.gait.bob * stand;
   const rubX = M.rubDir * M.rub.x * (7 + 5 * Math.sin(M.rubPh));
   const cxL = M.shx.x * .3 + rubX + purrV * .25 + Math.sin(t * 36) * M.worry.x * .6, czL = M.shz.x * .3 + pk(0, 0, 0, 0, 0) + M.cheer.x * 3;
   let C = [cxL * cyw + czL * syw, cy0, -cxL * syw + czL * cyw];
   if (hang > .01) { // hang from the scruff: rotate the whole body about the grab point
    const piv = [0, 100, 0], a = hangD, d = vsub(C, piv);
    C = vadd(piv, [d[0] * Math.cos(a) - d[1] * Math.sin(a), d[0] * Math.sin(a) + d[1] * Math.cos(a), d[2]]);
    C = vlerp([C[0], cy0, C[2]], C, hang); C[1] += hang * 4;
   }
   const bps = ps + Math.sin(t * 23) * M.wiggle.x * .12;
   const Rb = rotM(bps, th, roll0), bl = (x, y, z) => vadd(C, mvR(Rb, [x, y, z]));
   const bodyOff = [0, 0, 0];
   addP('body', COL.fur, C, Rb[0], Rb[1], Rb[2], [rx, ry, rz], 1, 0, 1, .22).mat = M_BODY;
   {
    const b = F.base; b[0] = Rb[0][0]; b[1] = Rb[0][1]; b[2] = Rb[0][2]; b[3] = 0; b[4] = Rb[1][0]; b[5] = Rb[1][1]; b[6] = Rb[1][2]; b[7] = 0; b[8] = Rb[2][0]; b[9] = Rb[2][1]; b[10] = Rb[2][2]; b[11] = 0; b[12] = C[0]; b[13] = C[1]; b[14] = C[2]; b[15] = 1;
   }
   { const ct = Math.max(0, th), dl = [0, Math.sin(ct), Math.cos(ct)], cc = bl(dl[0] * rx * .9, dl[1] * ry * .86 - (stand > .5 ? 5 : 0), dl[2] * rz * .86); const ay = nrm([syw * .3, -1, cyw * .3]), ax = nrm(crs(ay, [syw, 0, cyw])), az = crs(ax, ay); addP('cone', COL.cream, vadd(cc, vmul(ay, -3)), ax, ay, az, [9, 9, 6.5], 0, 0, 1, .15); }
   /* --- head --- */
   const hrx = 41 * (1 + M.surprise.x * .02), hry = 35.5 * (1 - jy * .4), hrz = 35;
   const hOff = [pk(0, 0, 0, 0, 0), pk(27, 43, 6, 35, 9), pk(39, 8, 40, -14, 31)];
   const hp0 = [hOff[0] + M.headYaw.x * 0, hOff[1], hOff[2] + (1 - hang) * 0];
   const hOffAdj = [rubX * .55 - M.rubDir * M.rub.x * 3, hp0[1] - hang * 0, hp0[2]];
   const hth = pk(.2, .05, .12, -.62, .62) + M.nod.x + M.rub.x * .05 * Math.sin(M.rubPh * 2) - str * .3 - M.cheer.x * .15 + hang * -.1;
   const hps = ps + M.headYaw.x * (1 - .5 * curl) + curl * P.face * .6 + M.rub.x * M.rubDir * .3 * Math.sin(M.rubPh);
   const hro = M.headTilt.x + roll0 * .5 + purrV * .006 + M.rub.x * M.rubDir * .12 * Math.cos(M.rubPh);
   const Rh = rotM(hps, hth, hro);
   let H = [C[0] + hOffAdj[2] * syw + hOffAdj[0] * cyw, C[1] + hOffAdj[1], C[2] + hOffAdj[2] * cyw - hOffAdj[0] * syw];
   if (hang > .01) { H = vlerp(H, vadd(C, mvR(Rb, [0, 41 * 1.0, 6])), 0); H[1] = lerp(H[1], C[1] + 36, hang * .0); }
   const hd = addP('head', COL.fur, H, Rh[0], Rh[1], Rh[2], [hrx, hry, hrz], 1, 0, 1, .22); hd.mat = M_HEAD;
   F.head[0] = M.headTilt.x; F.head[1] = M.nod.x; F.head[2] = M.headYaw.x; F.head[3] = 62;
   const hdl = (x, y, z) => vadd(H, mvR(Rh, [x, y, z]));
   // a feature glued to the head surface: (lon, lat) on the unit head shape, pushed out by off, tangent frame rolled by tilt
   const hfeat = (mesh, col, lon, lat, off, rxx, ryy, rzz, tilt, mode, a, gloss) => {
    const d = [Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat)], s = headShape(d[0], d[1], d[2]);
    const nl = nrm([d[0] / hrx, d[1] / hry, d[2] / hrz]), pos = [s[0] * hrx + nl[0] * off, s[1] * hry + nl[1] * off, s[2] * hrz + nl[2] * off];
    let ax = nrm(crs([0, 1, 0], nl)), ay = crs(nl, ax);
    if (tilt) { const c = Math.cos(tilt), sn = Math.sin(tilt); const a1 = vadd(vmul(ax, c), vmul(ay, sn)), a2 = vadd(vmul(ax, -sn), vmul(ay, c)); ax = a1; ay = a2; }
    return addP(mesh, col, hdl(pos[0], pos[1], pos[2]), mvR(Rh, ax), mvR(Rh, ay), mvR(Rh, nl), [rxx, ryy, rzz], 1, mode, a, gloss);
   };
   // ears
   const earTips = [];
   for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1, bk = M.earBack[i].x, fw = M.earFwd.x, tw = M.earT[i].x;
    const ea = M.earAim, phi = s * (.3 + .55 * bk + .15 * tw) + ea.x.x * (.2 + .06 * s * ea.x.x), tht = bk * .6 - fw * .4 - tw * .2 + M.surprise.x * -.15 + hang * .15 + slp * .25 - ea.y.x * .16 - Math.abs(ea.x.x) * .08;
    const ay = [Math.sin(phi), Math.cos(phi) * Math.cos(tht), -Math.cos(phi) * Math.sin(tht)], ax = nrm(crs(ay, [0, 0, 1])), az = crs(ax, ay);
    const d = [Math.sin(s * .92) * Math.cos(.66), Math.sin(.66), Math.cos(s * .92) * Math.cos(.66)], sh = headShape(d[0], d[1], d[2]);
    const pos = [sh[0] * hrx, sh[1] * hry - 3.5, sh[2] * hrz];
    const wl = mvR(Rh, ax), yl = mvR(Rh, ay), zl = mvR(Rh, az), bp = hdl(pos[0], pos[1], pos[2]);
    const ep = addP('cone', COL.fur, bp, wl, yl, zl, [14, 18 * (1 - .15 * bk), 9.5], 1, 0, 1, .12); ep.mat = M_EAR; ep.c2 = COL.dark;
    earTips.push(vadd(bp, vmul(yl, 18.5)));
   }
   // eyes (big glossy anime eyes: the disc carries the painted iris / highlights)
   const blinkW = M.blink > 0 ? Math.sin(c01(M.blink / .2) * PI) : 0;
   const closed = Math.max(M.sleepy.x, blinkW, M.eyeCs ? Math.max(0, M.eyeCs.x) : 0, slp);
   const wide = M.eyeCs ? Math.max(0, -M.eyeCs.x) : 0;
   let lid = clamp(M.squint.x * (1 - closed) - closed * (1 - M.squint.x), -1, 1);
   const eyeP = [];
   for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1, ey = hfeat('disc', COL.eye, s * .51, -.16, -.5, 12 * (1 + .1 * wide), 14 * (1 + .14 * wide + .05 * M.surprise.x), 3.4, s * -.07, 1, 1, lid);
    ey.mat = M_EYE; ey.e[0] = clamp(M.eyeX.x, -1, 1); ey.e[1] = clamp(M.eyeY.x, -1, 1); ey.e[2] = M.pupil.x + .35 * M.surprise.x - .12 * M.squint.x;
    ey.def = 0; eyeP.push([ey.m[12], ey.m[13], ey.m[14]]);
   }
   // nose, mouth, blush, whiskers, cheek tufts
   const nose = hfeat('tiny', COL.nose, 0, -.36, -.2, 2.9, 2.1, 2, 0, 0, 1, .6);
   const mo = M.mouth.x, sm = clamp(M.smile.x + M.happy.x * .35, -.2, 1);
   if (mo > .015 || sm > -.1) { const mp = hfeat('disc', COL.mouth, 0, -.56, -.3, 8, 6, 1.4, 0, 1, 1, 0); mp.mat = M_MOUTH; mp.e[0] = mo; mp.e[1] = sm; }
   const bl2 = M.blush.x + .12;
   if (bl2 > .03) for (let i = 0; i < 2; i++) { const s = i ? 1 : -1, bp = hfeat('disc', COL.cheek, s * .92, -.3, -.4, 9.5, 5.6, 1.2, s * .12, 1, 1, 0); bp.mat = M_BLUSH; bp.e[0] = clamp(bl2, 0, 1); }
   for (let i = 0; i < 2; i++) for (let j = -1; j <= 1; j++) {
    const s = i ? 1 : -1, d0 = nrm([s * 1, j * .2 - .08 + .03 * Math.sin(t * 2 + j + i), .24 - .1 * M.earBack[i].x]);
    const lon = s * .62, lat = -.34 + j * .035, dd = [Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat)], sh = headShape(dd[0], dd[1], dd[2]);
    const bp = [sh[0] * hrx, sh[1] * hry, sh[2] * hrz], L = 15, c = vadd(bp, vmul(d0, L * .5));
    const az2 = nrm(crs(d0, [0, 1, 0])), ay2 = crs(az2, d0);
    addP('tiny', COL.whisk, hdl(c[0], c[1], c[2]), mvR(Rh, d0), mvR(Rh, ay2), mvR(Rh, az2), [L * .5, .5, .5], 0, 1, .65, .2);
   }
   for (let i = 0; i < 2; i++) for (let k = 0; k < 3; k++) {
    const s = i ? 1 : -1, lon = s * 1.43, lat = -.14 - k * .24, d = [Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat)], sh = headShape(d[0], d[1], d[2]);
    const pos = [sh[0] * hrx - s * 2.5, sh[1] * hry, sh[2] * hrz - 1], ay = nrm([s * (.55 + .25 * M.cheekP.x), -.1 - k * .32, -.78]);
    const ax = nrm(crs(ay, [0, 0, 1])), az = crs(ax, ay), w = (6.6 - k * .6) * (1 + .25 * M.cheekP.x), lg = (8 - k * .9) * (1 + .15 * M.cheekP.x);
    const tf = addP('cone', [.84, .72, .56], hdl(pos[0], pos[1], pos[2]), mvR(Rh, ax), mvR(Rh, ay), mvR(Rh, az), [w, lg, 4.2], 0, 0, 1, .12);
   }
   /* --- legs and paws --- */
   const gz = [syw, 0, cyw];
   const shl = i => { const s = i ? 1 : -1; return bl(s * rx * .52, pk(.55, .25, .5, .3, .4) * ry, pk(.32, .72, .55, .66, .6) * rz); };
   const hipl = i => { const s = i ? 1 : -1; return bl(s * rx * .8, pk(-.52, -.35, -.38, -.4, -.3) * ry, pk(.12, -.12, .0, -.12, .0) * rz); };
   // two-bone IK: the knee/elbow position for a hip h, a paw p, bone lengths l1/l2 and a bend direction. Out of reach the bones scale together.
   const ikKnee = (h, p, l1, l2, pole, rf) => {
    const d = vsub(p, h), dl = Math.hypot(d[0], d[1], d[2]) || 1e-3, tot = (l1 + l2) * .999, k = dl > tot ? dl / tot : 1, L1 = l1 * k, L2 = l2 * k, dn = vmul(d, 1 / dl);
    const x = clamp((dl * dl + L1 * L1 - L2 * L2) / (2 * dl), -L1, L1), hh = Math.sqrt(Math.max(0, L1 * L1 - x * x));
    let pv = vsub(pole, vmul(dn, vdot(pole, dn))); if (Math.hypot(pv[0], pv[1], pv[2]) < 1e-3) pv = [0, 0, 1]; pv = nrm(pv);
    if (rf) rf.reach = dl / (l1 + l2);
    return vadd(vadd(h, vmul(dn, x)), vmul(pv, hh));
   };
   const hands = [], pawC = [];
   const dbgLegs = M.dbgLegs || (M.dbgLegs = [null, null, null, null]), pawR0 = h => (h ? 4.9 : 5) * .92;
   const gi = M.groomSide > 0 ? 1 : 0, pt = M.aim && M.point.x > .02 ? M.aim : null;
   let pArm = -1;
   if (pt) pArm = (pt.x - P.x) >= 0 ? 1 : 0;
   const airK = c01(hop / 16) * (1 - .3 * sit);
   const rigFeet = [], LEG = {f: 20.5, h1: 18, h2: 17.5, hf: 19.5, th: [10.2, 12, 13]};
   for (let k = 0; k < 4; k++) {
    const f = M.feet[k], s = f.side, hind = f.hind, side = s > 0 ? 1 : 0;
    const gx = (f.ax - P.x) / (sxs * u), gzv = (f.ay - P.y) / u; // the planted foot's place on the ground, relative to the body
    let F0 = [gx, f.lift, gzv];
    const pl = hind ? M.hindLift[side] : M.paw[side];
    let wl = 0, up = 0;
    if (!hind) { // front paws: knead biscuits, groom, reach, cheer
     const kp = M.knead.x * Math.max(0, Math.sin(M.kneadPh + side * PI)), kf = Math.cos(M.kneadPh + side * PI);
     F0 = vadd(F0, [0, kp * 11 + pl.lift.x * 12, M.knead.x * kf * 4.5 + pl.fwd.x * 10]); wl += kp * .6;
     if (M.knead.x > .02) { const q = hdl(s * 24, -35 + kp * 10, 32 + kf * 3.5); F0 = vlerp(F0, q, M.knead.x * .85); wl += M.knead.x * .5; up = Math.max(up, M.knead.x * .6); } // the biscuit paws come up beside the chin so they show
     const sh = shl(side);
     if (M.cheer.x > .02) { const q = vadd(sh, [s * 9, 22 + 3 * Math.sin(t * 15 + side * 2), 8]); F0 = vlerp(F0, q, M.cheer.x); wl += M.cheer.x; up = Math.max(up, M.cheer.x); }
     if (side === gi && M.groom.x > .02) { const q = hdl(s * 11 + Math.sin(t * 9) * 2.4 * 0, -17 + Math.sin(t * 8) * 4 * 1, 29 - Math.abs(Math.sin(t * 8)) * 2); F0 = vlerp(F0, q, M.groom.x); wl += M.groom.x; up = Math.max(up, M.groom.x); }
     if (side === pArm && M.point.x > .02) { const tr = toRig(pt.x, pt.y), dd = vsub(tr, sh), dl = Math.hypot(dd[0], dd[1], dd[2]) || 1, rc = Math.min(dl, 36), q = vadd(sh, vmul(dd, rc / dl)); F0 = vlerp(F0, q, ease(M.point.x)); wl += M.point.x; up = Math.max(up, M.point.x); }
     if (lie > .02) { const q = vadd(shl(side), [s * 4, 14 + 3 * Math.sin(t * 3 + side), 12]); F0 = vlerp(F0, q, lie); wl += lie; }
     if (hang > .02) { const q = vadd(shl(side), [s * 2, -26 + Math.sin(t * 5 + side) * 1.2, 13]); F0 = vlerp(F0, q, hang); wl += hang * .8; }
     if (airK > .02) { F0 = vadd(F0, [0, 6 * airK, 12 * airK]); wl += airK * .5; }
    } else {
     F0 = vadd(F0, [0, pl.x * 10 * 0 + M.hindLift[side].x * 10, 0]);
     if (lie > .02) { const q = bl(s * rx * .85, pk(-.4, -.4, -.4, -.8, -.4) * ry + 28, -rz * .2); const q2 = vadd(hipl(side), mvR(Rb, [s * 3, -4, -14])); F0 = vlerp(F0, q2, lie); wl += lie; }
     if (hang > .02) { const q = vadd(hipl(side), [s * 3, -24 + Math.sin(t * 4.4 + side) * 1.2, 5]); F0 = vlerp(F0, q, hang); wl += hang * .8; }
     if (airK > .02) { F0 = vadd(F0, [0, 4 * airK, -8 * airK]); }
     if (str > .02) F0 = vadd(F0, [0, 0, -4 * str]);
    }
    const pawR = hind ? [6.2, 4.9, 7.4] : [6.3, 5, 7.2];
    const pc = [F0[0], F0[1] + pawR[1] * .92, F0[2]], anc = hind ? hipl(side) : shl(side);
    rigFeet.push({pc, anc, wl: clamp(wl, 0, 1), hind, s, side, pitch: f.pitch, k, up});
   }
   for (const rf of rigFeet) {
    const {pc, anc, hind, s} = rf, leg = nrm(vsub(pc, anc)), lerpDn = vlerp([0, -1, 0], leg, rf.wl); let dn = nrm(lerpDn);
    // legs: two-bone IK with fixed bone lengths (identical for left and right), so a leg never stretches while the body walks
    const lat = [cyw, 0, -syw], fl0 = hind ? LEG.hf : lerp(LEG.f, Math.max(11, Math.hypot(pc[0] - anc[0], pc[1] - anc[1], pc[2] - anc[2]) * .56), rf.up);
    { // hard stop: the paw can never be further from the hip than the bones can reach, so a leg is never drawn stretched (it would rather be pulled a hair toward the body)
     const A = hind ? vadd(anc, [0, -5, 2]) : anc, tot = (hind ? LEG.h1 + LEG.h2 : 2 * fl0) * .985, dv = vsub(pc, A), dl = Math.hypot(dv[0], dv[1], dv[2]);
     rf.raw = dl * .985 / tot;
     if (dl > tot) { const k = tot / dl; pc[0] = A[0] + dv[0] * k; pc[1] = A[1] + dv[1] * k; pc[2] = A[2] + dv[2] * k; rf.clamped = (rf.clamped || 0) + 1; }
    }
    const knee = ikKnee(hind ? vadd(anc, [0, -5, 2]) : anc, pc, hind ? LEG.h1 : fl0, hind ? LEG.h2 : fl0, hind
     ? vadd(vadd(vmul(gz, 1), vmul(lat, s * .25)), [0, .2, 0]) : vlerp(vadd(vadd(vmul(gz, -1), vmul(lat, s * .45)), [0, .35, 0]), vadd(vadd(vmul(lat, s * .7), [0, -.85, 0]), vmul(gz, .15)), rf.up), rf);
    if (!hind) { limb(anc, knee, 6, COL.fur, .4, .3); limb(knee, pc, 5, COL.fur, .4, .3); }
    else {
     const hh = addP('body', COL.fur, vadd(anc, mvR(Rb, [-s * 4.5, 1.5, -1.5])), Rb[0], Rb[1], Rb[2], LEG.th, 1, 0, 1, .22); hh.mat = M_BODY;
     const hock = vadd(pc, vadd([0, 5.5, 0], vmul(gz, -3.2)));
     limb(vadd(anc, [0, -5, 2]), knee, 5.6, COL.fur, .4, .3); limb(knee, hock, 4.9, COL.fur, .4, .3); limb(hock, pc, 4.5, COL.fur, .4, .3);
    }
    // paw: pale cream mitten with a darker toe-line, flat pads on the underside
    let ay = vmul(dn, -1); let fw = vsub(gz, vmul(ay, vdot(gz, ay))); fw = nrm(fw); const ax = crs(ay, fw);
    if (rf.pitch) { const c = Math.cos(rf.pitch), sn = Math.sin(rf.pitch); fw = nrm(vadd(vmul(fw, c), vmul(ay, -sn))); ay = crs(fw, ax); dn = vmul(ay, -1); }
    const paw = addP('lo', COL.cream, pc, ax, ay, fw, hind ? [6.3, 4.9, 7.4] : [6.4, 5, 7.2], 0, 0, 1, .3); paw.mat = M_PAW; paw.c2 = [.62, .5, .42];
    const view = [0, .14, 1], pn = dn; // pads face along dn
    if (vdot(pn, view) > -.1 || true) {
     const base = vadd(pc, vmul(dn, 4.3)), fwd = vadd(base, vmul(fw, -.8));
     if (vdot(pn, view) > .12) { // soles only show when they turn toward the viewer (they used to shine through the body)
      addP('tiny', COL.pad, fwd, ax, fw, vmul(dn, -1), [3.6, 3.2, 1.1], 0, 1, 1, .35);
      for (let q = -1; q <= 1; q++) addP('tiny', COL.pad, vadd(vadd(base, vmul(fw, 4.6 - Math.abs(q) * 1)), vmul(ax, q * 3.1)), ax, fw, vmul(dn, -1), [1.55, 1.7, 1], 0, 1, 1, .35);
     }
    }
    dbgLegs[rigFeet.indexOf(rf)] = {an: anc, kn: knee, pc, pk: pc[1] - pawR0(hind), hind, side: rf.side, reach: rf.reach, raw: rf.raw};
    { const lf = rf.pc[1] - pawR0(hind), a = clamp(.5 * (1 - lf / 7) * (1 - hang) * (1 - .5 * lie), 0, .5); if (a > .02) addP('lo', COL.shadow, [pc[0], .5, pc[2] + 1], [1, 0, 0], [0, 1, 0], [0, 0, 1], [8.5 + 1.5 * lf * .3, 1, 10.5 + lf * .4], 0, 2, a, 0); }
   hands.push(toStage(pc));
    if (!hind) { const st = toStage(pc), i = rf.side; M.tipPx[i].x = st.x; M.tipPx[i].y = st.y; }
   }
   M.dbg = {C, th, roll: roll0, sxs, sys, hop, u, yaw: ps};
   /* --- tail: a smooth tube from a turtle walk, blended between low / question-mark / wrapped around the feet --- */
   {
    const tu = M.tailUp.x, tw = M.tailWrap.x, wrapSide = P.face * (curl > .3 ? 1 : 1);
    const mix3 = idx => lerp(lerp(TAILP.low[idx], TAILP.up[idx], tu), TAILP.wrap[idx], tw);
    const fl = M.tailFluff.x, N = TUBE.N, S = TUBE.S, L = 5.3 * (1 + .05 * tw);
    const p0 = bl(0, pk(-.72, -.8, -.5, -.5, -.35) * ry, pk(-.28, -.5, -.8, -.4, -.6) * rz);
    const pts = [p0]; const hs = [];
    let h = nrm([0, Math.sin(mix3(0)), -Math.cos(mix3(0))]); h = [h[0] * cyw + h[2] * syw, h[1], -h[0] * syw + h[2] * cyw];
    const sideSign = wrapSide;
    for (let i = 0; i < N - 1; i++) {
     const wag = M.tailAmp.x * Math.sin(M.tailPh - i * .55) * (.03 + .09 * i / N) * (1 - .8 * tw) + M.tailAmp.x * Math.sin(M.tailPh * .5 - i * .3) * .02 * tw;
     let yaw = (mix3(2) * sideSign + wag + M.tailJ[Math.min(2, i >> 2)].x * .035 * (.5 + i / N)) * (1 + .3 * curl);
     let pitch = mix3(1) + (1 - tu) * (1 - tw) * .13 * c01((i - 3) / 6) + (i < 2 ? 0 : 0) - M.tailTip.x * .22 * (i > 7 ? 1 : 0) + (M.worry.x * -.025 + M.sad.x * -.04) * (i > 3 ? 1 : 0);
     if (tu > .4 && i > 8) pitch += M.tailTip.x * .22;
     // yaw about the world up axis, then pitch about the local right axis
     const cy = Math.cos(yaw), sy = Math.sin(yaw);
     h = [h[0] * cy + h[2] * sy, h[1], -h[0] * sy + h[2] * cy];
     const rt = nrm(crs(h, [0, 1, 0])), up = crs(rt, h), cp = Math.cos(pitch), sp = Math.sin(pitch);
     h = nrm(vadd(vmul(h, cp), vmul(up, sp)));
     hs.push(h);
     let q = vadd(pts[i], vmul(h, L));
     const rr = 6.4 * (1 + .4 * fl) * (1 - .1 * (i / N));
     if (q[1] < rr * .9) q[1] = lerp(q[1], rr * .9, .85);
     pts.push(q);
    }
    hs.push(hs[hs.length - 1]);
    const buf = tailBuf; let o = 0, pl = [];
    for (let i = 0; i < N; i++) {
     const c = pts[i], hh = hs[i], s = i / (N - 1), rr = 6.5 * (1 + .45 * fl) * (1 - .1 * s) * (i === 0 ? .96 : 1) * (1 + .1 * Math.sin(Math.PI * Math.min(1, s * 1.1)) * 0), rtv = Math.abs(hh[1]) > .97 ? [1, 0, 0] : nrm(crs(hh, [0, 1, 0])), upv = crs(rtv, hh);
     const taper = i === N - 1 ? .8 : i === N - 2 ? .95 : 1;
     for (let j = 0; j <= S; j++) {
      const a = TAU * j / S, ca = Math.cos(a), sa = Math.sin(a), nn = [rtv[0] * ca + upv[0] * sa, rtv[1] * ca + upv[1] * sa, rtv[2] * ca + upv[2] * sa];
      buf[o++] = c[0] + nn[0] * rr * taper; buf[o++] = c[1] + nn[1] * rr * taper; buf[o++] = c[2] + nn[2] * rr * taper; buf[o++] = nn[0]; buf[o++] = nn[1]; buf[o++] = nn[2]; buf[o++] = s; buf[o++] = j / S;
     }
     pl.push([c[0], c[1], c[2], rr]);
    }
    const lastH = hs[N - 1], lc = pts[N - 1], lr = 6.5 * (1 + .45 * fl) * (1 - .1) * .62;
    buf[o++] = lc[0] + lastH[0] * lr; buf[o++] = lc[1] + lastH[1] * lr; buf[o++] = lc[2] + lastH[2] * lr; buf[o++] = lastH[0]; buf[o++] = lastH[1]; buf[o++] = lastH[2]; buf[o++] = 1; buf[o++] = 0;
    const tp = addP('tube', COL.fur, [0, 0, 0], AX, AY, AZ, [1, 1, 1], 1, 0, 1, .2); tp.mat = M_TAIL; tp.c2 = COL.dark; tp.dyn = buf; tp.pts = pl;
   }
   // soft contact shadow
   {
    const lat = pk(36, 38, 42, 38, 42), fw = pk(48, 38, 46, 40, 40), off = pk(3, -1, 2, -4, 2) + 6 * M.stretch.x, sa = c01(1 - hop / 90) * .62 * (1 - .4 * hang);
    addP('lo', COL.shadow, [syw * off + cxL * cyw, .3, cyw * off - cxL * syw], [cyw, 0, -syw], AY, [syw, 0, cyw], [lat * (1 + .08 * sq), 1, fw], 0, 2, sa, 0);
   }
   // pills (DOM) get their anchor; hearts / sparks / puffs
   if (M.sad.x > .25) for (let i = 0; i < 2; i++) { const e = eyeP[i], k = (t * .9 + i * .45) % 1; addP('tiny', COL.drop, [e[0] + (i ? 1 : -1) * 2, e[1] - 8 - k * 20, e[2] + 12], AX, AY, AZ, [1.7, 3.3, 1.7], 0, 0, M.sad.x * (1 - k), .8); }
   if (M.quota.x > .12) { const e = hdl(30, 22 - ((t * 9) % 14), 18); addP('lo', COL.drop, e, AX, AY, AZ, [3, 4.3, 2.8], 0, 0, M.quota.x, .9); }
   for (const f of M.fx) {
    const k = f.life / f.max, x = (f.x - P.x) / (sxs * u), y = ((P.y - f.y) / u - hop) / sys;
    if (f.k === 'puff') addP('lo', COL.white, [x, y, 18], AX, AY, AZ, [3 + k * 8, 3 + k * 5, 3], 2, 1, .45 * (1 - k), 0);
    else if (f.k === 'heart') { const s = f.s * (1 - k * .3), hp = addP('disc', COL.heart, [x, y, 40], AX, AY, AZ, [6.5 * s, 6.5 * s, 1], 1, 1, c01(2.2 * (1 - k)), 0); hp.mat = M_HEART; }
    else {
     const s = f.s * (1 - k * .55) * (1 + .3 * Math.sin(f.life * 30)), col = f.pink ? COL.star2 : COL.star, a = c01(2.2 * (1 - k));
     addP('tiny', col, [x, y, 30], AX, AY, AZ, [4.6 * s, 1.15 * s, 1.1], 2, 1, a, 0); addP('tiny', col, [x, y, 30], AX, AY, AZ, [1.15 * s, 4.6 * s, 1.1], 2, 1, a, 0);
    }
   }
   F.sq[0] = sxs; F.sq[1] = sys; F.sq[2] = hop; F.fx[0] = M.quota.x; F.fx[1] = M.alert.x; F.fx[2] = M.happy.x * .35; F.fx[3] = t;
   M.pArm = pArm >= 0 ? pArm : undefined;
   // anchors for DOM bits
   let hy = -1e9; for (const e of earTips) hy = Math.max(hy, e[1]); hy = Math.max(hy, H[1] + hry * .9);
   const top = toStage([H[0], hy, H[2]]); M.headTop = top;
   const mouthP = hdl(0, -14, hrz * .9), mst = toStage(mouthP);
   if (P.stage === 'grab') { const h = hands[pArm >= 0 ? pArm : 0]; M.anchor = {x: h.x, y: h.y}; }
   else M.anchor = {x: mst.x, y: mst.y + 4 * u};
   // camera: gentle perspective + slight downward pitch, origin anchored at (.5, .8) of the pet canvas
   const cw = bw, ch = bh, Dd = 700, cp = Math.cos(.14 + T.y.x), spn = Math.sin(.14 + T.y.x), vp = F.vp;
   const xo = F.ox = P.x - Math.round(P.x - bw * .5), yo = F.oy = P.y - Math.round(P.y - bh * .8); F.u = u;
   const xc = (xo - cw / 2) / (cw / 2), yc = (ch / 2 - yo) / (ch / 2), A = u / (cw / 2), Bq = u / (ch / 2);
   vp[0] = A; vp[1] = 0; vp[2] = 0; vp[3] = 0;
   vp[4] = -xc * spn / Dd; vp[5] = Bq * cp - yc * spn / Dd; vp[6] = -spn / 200; vp[7] = -spn / Dd;
   vp[8] = -xc * cp / Dd; vp[9] = -Bq * spn - yc * cp / Dd; vp[10] = -cp / 200; vp[11] = -cp / Dd;
   vp[12] = xc; vp[13] = yc; vp[14] = 0; vp[15] = 1;
   if (T.x.x) {
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
   const energetic = M.moving || P.stage || P.air || M.fx.length || M.pills.length || M.drag || P.wig > 0 || (M.act && M.act !== 'look' && M.act !== 'tilt' && M.act !== 'yawn' && M.act !== 'plop') || M.spinning || Math.abs(P.sq.v) > .08 || Math.abs(M.bulge.v) > .25 || Math.abs(M.bulge.x) > .02 || Math.abs(M.shx.x) > .08 || M.blink > 0 || (collecting && !M.standing) || M.feet.some(f => f.step) || (M.purr.x > .05 && M.sleep.x < .9) || M.knead.x > .05 || M.rub.x > .05 || M.groom.x > .02 || Math.abs(M.roll.v) > .05 || M.cheer.x > .05;
   interval = energetic ? 1000 / 60 : reduced && reduced.matches ? 500 : 1000 / 30; // asleep it still draws at 30 fps: the old 85 ms step made the breathing visibly stutter
   if (reduced && reduced.matches && interval < 100) interval = 100;
   if (MN.open || DL.o.x > .02) interval = Math.min(interval, 100);
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

  /* options (mount `options`, root data-tc-* attributes, setOptions): size|scale, speed, sleepAfter, dock auto|tl|tr|bl|br, margin, status, dial, tilt, theme auto|light|dark */
  const num = v => (v === undefined || v === null || v === '' ? NaN : Number(v)), flag = (v, d) => (v === undefined || v === null || v === '' ? d : !(v === false || /^(false|0|off|no)$/i.test(String(v))));
  function applyOptions(o) {
   let moveHome = false; const sc0 = sc;
   if (Number.isFinite(num(o.scale))) sc = clamp(num(o.scale), .5, 1.8);
   if (Number.isFinite(num(o.size))) sc = clamp(num(o.size) / 84, .5, 1.8); // pet height in CSS px (~84 px at scale 1)
   if (Number.isFinite(num(o.speed))) speedMul = clamp(num(o.speed), .5, 3);
   if ('hour' in o) hourOpt = Number.isFinite(num(o.hour)) ? clamp(num(o.hour), 0, 24) : null; // 0-24 pins the time of day (tests, demos); otherwise the clock decides
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
   if (o.theme === 'auto' || o.theme === 'light' || o.theme === 'dark') root.setAttribute('data-tc-theme', o.theme);
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
   pause() {
    if (running || rafId !== null || timerId !== null) { running = false; stopTimers(); }
    root.classList.add('tc-paused');
    if (!destroyed) { try { frame(0); } catch (e) {} }
   },
   resume() {
    if (destroyed || running) return;
    running = true; lastFrame = null; root.classList.remove('tc-paused'); resize();
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
     pet: 'tabbycat', scale: sc, speed: speedMul, unit: u, height: 108 * u,
     hands: M.tipPx.map(h => ({x: h.x, y: h.y})), headTop: M.headTop ? {...M.headTop} : null,
     weights: {alert: M.alert.x, quota: M.quota.x, carry: M.carry.x, cheer: M.cheer.x, sleep: M.sleep.x, sit: M.sit.x, lie: M.lie.x, loaf: M.loaf.x, curl: M.curl.x, purr: M.purr.x, knead: M.knead.x, sad: M.sad.x},
     mood: {aff: +M.aff.toFixed(3), night: +M.night.toFixed(3), hist: M.hist.slice(), tally: Object.assign({}, M.tally), sq: P.sq.x, crouch: M.crouch.x, blink: M.blink, hop: P.hop, sleeping: M.sleep.x > .6, act: M.act, face: P.face, dragging: !!M.drag, pose: M.pose, trn: M.trn ? M.trn.from + '>' + M.trn.to : '', earAim: [+M.earAim.x.x.toFixed(3), +M.earAim.y.x.toFixed(3)], tailTip: +M.tailTip.x.toFixed(3), tailTipV: +M.tailTip.v.toFixed(2), bubble: M.bubbleT > 0 ? M.bubbleText : ''},
     canvas: {w: bw, h: bh, dpr, pixels: Math.round(bw * dpr) * Math.round(bh * dpr), depot: dctx ? [lair.w, lair.h] : null},
     rig: {base: Array.from(F.base).map(v => +v.toFixed(2)), vp: Array.from(F.vp).map(v => +v.toFixed(3)), head: Array.from(F.head), jelly: Array.from(F.jelly), sq: Array.from(F.sq), yaw: P.yaw.x, feet: M.feet.map(f => ({x: +f.ax.toFixed(2), y: +f.ay.toFixed(2), lift: +f.lift.toFixed(2), swing: !!f.step, z: +(f.az || 0).toFixed(2)})), legs: (M.dbgLegs || []).map((l, i) => l && ({an: l.an.map(v => +v.toFixed(2)), pc: l.pc.map(v => +v.toFixed(2)), side: l.side, hind: l.hind, reach: +(l.reach || 0).toFixed(3), stance: !M.feet[i].step})), dbg: M.dbg ? {C: M.dbg.C.map(v => +v.toFixed(2)), th: +M.dbg.th.toFixed(4), roll: +M.dbg.roll.toFixed(4), sxs: M.dbg.sxs, sys: M.dbg.sys, hop: M.dbg.hop, u: M.dbg.u, yaw: M.dbg.yaw} : null, face: {mouth: M.mouth.x, tongue: M.tongue.x, smile: M.smile.x, squint: M.squint.x, sleepy: M.sleepy.x, ears: [M.earBack[0].x, M.earBack[1].x], cheek: M.cheekP.x, pupil: M.pupil.x}, body: {sq: P.sq.x, roll: M.roll.x, lean: M.lean.x, nod: M.nod.x, tilt: M.headTilt.x, purr: M.purr.x, knead: M.knead.x, rub: M.rub.x, tail: {up: M.tailUp.x, wrap: M.tailWrap.x, amp: M.tailAmp.x}, gait: M.gait ? M.gait.w.x : 0}},
     perf: {frames: perf.n, avgMs: perf.n ? perf.ms / perf.n : 0, maxMs: perf.max, intervalMs: interval},
     status: {agentsRunning: status.agentsRunning, quotaLeftPercent: status.quotaLeftPercent}, agentCount: status.agentCount, menu: {open: MN.open, items: hostActions.map(a => a.id || a.label)}, dial: {open: MN.open, page: DL.page, focus: DL.fi, rot: DL.rot.x, o: DL.o.x, labels: DL.items.map(a => a.label), cx: DL.cx, cy: DL.cy}, dock: dockPos.ok ? {x: dockPos.x, y: dockPos.y} : null,
     chip: {on: chipEl.dataset.on === 'true', text: chipEl.getAttribute('aria-label') || ''}, layout: Object.fromEntries(Object.entries(OV.rects).map(([k, r]) => [k, {x: r.x, y: r.y, w: r.w, h: r.h}])), bubbleSide: OV.bubble.side, menuSide: OV.menu.side, shape: parts.slice(0, np).filter(p => p.mode !== 2 && (p.mesh === 'head' || p.mesh === 'body' || p.mat === M_EYE || p.mat === M_EAR)).map(p => ({mesh: p.mesh, mat: p.mat, w: 2 * Math.hypot(p.m[0], p.m[1], p.m[2]), h: 2 * Math.hypot(p.m[4], p.m[5], p.m[6]), x: p.m[12], y: p.m[13]})), source: 'procedural-webgl-tabbycat'
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
    style.remove(); root.classList.remove('tc-paused', 'tc-root');
    if (rootTheme0 === null) root.removeAttribute('data-tc-theme'); else root.setAttribute('data-tc-theme', rootTheme0);
    if (rootPosSet) root.style.position = rootPos0; bubbleEl.remove(); chipEl.remove();
    if (dctx && typeof dcv.remove === 'function') dcv.remove();
    if (used2d) { try { const c2 = canvas.getContext('2d'); if (c2) { c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, canvas.width, canvas.height); } } catch (e) {} }
    if (previousStyle === null) canvas.removeAttribute('style'); else canvas.setAttribute('style', previousStyle);
    mounts.delete(canvas);
   }
  };
  M.pArm = undefined;
  const ds = root.dataset || {};
  applyOptions({size: ds.tcSize, scale: ds.tcScale, speed: ds.tcSpeed, dock: ds.tcDock, margin: ds.tcMargin, status: ds.tcStatus, dial: ds.tcDial, tilt: ds.tcTilt, theme: ds.tcTheme, ...(options || {})});
  resize(); lair.update(true);
  place(home().x, home().y);
  mounts.set(canvas, api);
  api.resume();
  return api;
 }
 global.NewsTabbycat = Object.freeze({mount});
})(window);
