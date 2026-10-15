---
format: 1920x1080
duration: 60s
message: 让开发回到一个清晰的工作空间
arc: 工作总览 → 上下文 → 可追溯交付
audience: GitHub仓库访问者
mode: autonomous
music: none
---

## Video direction

真实截图为主，深蓝/青绿技术视觉；左短标题、右截图，随旁白推进，关键点局部放大。章节干净切换。全片标明界面演示数据；数字不代表真实完成率。9句中文配音，字幕按实测单句音频同步，不估算词时间。截图从44c359f隔离生成。仅纳入已提交功能，不混入并行开发。

## Frame 1 — 从总览到行动
- src: compositions/frames/01-workspace.html
- duration: 18.26s
- transition_in: cut
- status: animated
- blueprint: compose
- asset_candidates: assets/screens/overview.png, assets/screens/tasks.png
- focal: assets/screens/overview.png
- scene: 从品牌落到真实总览与项目任务
- voiceover: 本地开发面板；项目任务集中展示；记录负责人、状态与会话关联。

Scene 1 (0–5.898s): 左“让开发 / 回到一个 / 工作空间。”右overview真实屏幕，轻入；3s依次显示“项目 · 任务 · 待办”。
Scene 2 (5.898–11.188s): 屏幕内项目区域局部放大1.10；左转“下一步 / 一眼可见”。
Scene 3 (11.188–18.26s): 换tasks截图，左“每一次推进 / 都有位置”；依次显示“负责人”“手工状态”“会话关联”，不宣称自动派发。最后1s停留。

## Frame 2 — 让上下文清楚
- src: compositions/frames/02-context.html
- duration: 19.412s
- transition_in: cut
- status: animated
- blueprint: compose
- asset_candidates: assets/screens/agents.png, assets/screens/sessions.png, assets/screens/usage.png, assets/screens/news.png
- focal: assets/screens/agents.png
- scene: 工具能力、会话证据、额度与资讯
- voiceover: 接入能力独立；消息按需读取；额度和资讯保留来源。

Scene 1 (0–6.378s): 左“工具再多 / 上下文依然清楚。”右agents真实截图，能力区局部放大1.08；“发现 / 观察 / 控制”标签分拍进入，不把发现当运行。
Scene 2 (6.378–12.868s): 换sessions长截图，窗口从上方证据区缓慢平移到Codex身份；左“按需读取 / 按证据定位”。
Scene 3 (12.868–19.412s): usage截图出现，15.8s在右下方用小尺寸news截图叠加真实资讯入口；左“每一种信息 / 保留自己的来源”。额度保持未查询，不虚构账单。末尾停留。

## Frame 3 — 交付有据，持续更新
- src: compositions/frames/03-delivery.html
- duration: 22.332s
- transition_in: cut
- status: animated
- blueprint: compose
- asset_candidates: assets/screens/garden.png
- focal: assets/screens/garden.png
- scene: 协作收据与当前进度边界
- voiceover: 任务产物与收据协作；展示精简；真实执行和Orca待验收。

Scene 1 (0–6.378s): 左“交付有据 / 进度可追溯。”右garden真实截图；依次“任务 → 产物 → 复核 → 验收”。
Scene 2 (6.378–12.244s): 真实garden卡片局部放大，左“保留有用功能”，短字“轻展示 · 重记录”。无像素人或三维元素。
Scene 3 (12.244–22.332s): 两列状态取代截图，标题“持续更新，边界清楚”。“已实现”：项目与任务、会话观察、协作收据；“待验收”：真实任务执行、Orca运行接入。最后2s显示“Control Everything”和“进度以仓库记录为准”。不淡出黑屏。
