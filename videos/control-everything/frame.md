---
name: Control Everything — midnight workspace
seed: blue-professional
colors:
  canvas: '#0B1220'
  surface: '#142233'
  ink: '#EDF4FA'
  muted: '#AEC0D0'
  accent: '#75DFCE'
  blue: '#9FC8FF'
  border: '#314457'
typography:
  display: { fontFamily: 'Demo Sans', weight: 700 }
  body: { fontFamily: 'Demo Sans', weight: 400 }
---

1920×1080. Adapted Blue Professional restraint to the product's actual dark surface and Chinese text: cream/cobalt swapped for midnight/mint; rounded browser cards and hairlines retained. No particles or pseudo-3D robots. Captured screenshots are the only UI visual; do not invent feature widgets.

Local OFL Source Han Sans CN subset renamed Demo Sans. Every subcomposition declares @font-face inside template: assets/fonts/DemoSans-Regular.woff2 weight400; assets/fonts/DemoSans-Bold.woff2 weight600 900. Parent loads assets/gsap.min.js. Google Fonts download failed, so this locally available open-source font keeps CJK rendering deterministic.

Typography: wordmark100px, Chinese heading64px, eyebrow22px, supporting30px; line-height1.3. Left text width420px; screenshots start at x560. Break headline into short separate block lines.

Parent owns global top brand, top-right“界面演示数据” and captions. Content safe area x96–1824,y140–885. Caption band y930–1010. Do not duplicate narration.

Browser stage x560,y150,w1264,h720 with deliberate overflow:hidden crop; real screenshot width100%, natural ratio. Thin border #314457,18px corners, gentle shadow. Focus via inner image scale1→1.10 and authored x/y,1.2s power2.inOut. Use composed HTML typography, no fake UI.

Motion: fromTo opacity+y entrance0.65s power3.out. Screenshot exchanges0.45s at narration cues. Final states held readable. No CSS transitions or time/random; no visibility tween on clips. Foreground elements inside full-duration clip. Mark intentional overlaps with data-layout-allow-overlap.

Parent window.videoData maps chapter IDs to {duration,cues}; cues are actual sentence start times. Use this map for tween positions so regenerating narration updates timings. Build injects root data-duration. Font is subset from content,storyboard,scene HTML.
