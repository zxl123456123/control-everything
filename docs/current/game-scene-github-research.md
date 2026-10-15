# 游戏式机器人空间：本批 GitHub 与官方参考

调研日期：2026-10-04。只读查看原作者仓库、官方文档和本地实现；未安装、启动、下载或执行第三方项目。下述是实现建议，不是性能或会话接入验收。

## 当前缺口（代码事实）

`web/robot3d.js` 已有 PerspectiveCamera、拖动/滚轮、指数阻尼、共享几何和材质、暂停/隐藏清理。角色目前按记录序号排网格，动画只有上下浮动与小幅摆头；场景主要是圆盘和地面网格，没有房间、路径、步态、空间工作站或流程图。`web/cockpit.js` 把记录限制为 sessionId/label/category，并保留像素/文字降级。装饰动画不能证明真实 activity/completion。

## 已实际打开的主要来源

| 来源 | 已读事实 | 采用的做法与边界 |
| --- | --- | --- |
| [Three.js r186 粒子示例源码](https://github.com/mrdoob/three.js/blob/r186/examples/webgl_points_sprites.html)；[InstancedMesh 官方文档](https://threejs.org/docs/pages/InstancedMesh.html) | 示例用一个 BufferGeometry 保存粒子位置，Points/PointsMaterial 加法混合；实例化适合同几何/材质不同变换，减少 draw calls | 光粒子按单个 Points 批量更新；重复地砖/灯柱可实例化。保留本地 Three r186，不引入 CDN、TSL/WebGPU、示例贴图或调试 GUI |
| [AI Agent Office Simulation](https://github.com/yakobusdamar/ai-agent-office-simulation)；[MovementSystem 源码](https://github.com/yakobusdamar/ai-agent-office-simulation/blob/main/src/simulation/MovementSystem.ts)；[Waypoints 源码](https://github.com/yakobusdamar/ai-agent-office-simulation/blob/main/src/simulation/Waypoints.ts) | MovementSystem 按 speed×dt 消耗路径距离；Waypoints 提供避开桌子的直角通道。README 明确是预设演示，不是真实 AI 系统；其 package 使用 Three r170/TS/Vite | 参考常速路径、通道与座位分离。巡游只装饰，不搬预设任务/完成庆典；不复制未逐件核定许可的代码/模型或换项目构建体系 |
| [Bruno Simon folio-2025](https://github.com/brunosimon/folio-2025)；[原作者 README](https://github.com/brunosimon/folio-2025/blob/main/readme.md) | README 将 Time/Inputs、Physics、View、Zones/Lighting、InstancedGroup、Rendering/Monitoring 分层；另有模型/纹理压缩流程。代码许可证 MIT | 参考“区域有用途”和渲染末端采样。此面板只需装饰行走，不引入车辆物理、音效、天气、资源压缩管线或完整游戏项目 |
| [Roost](https://github.com/sorryhumans/roost)；[原作者 README](https://github.com/sorryhumans/roost/blob/main/README.md) | README 描述 waypoint/行为状态机、固定座位、弱 GPU 降质及无 WebGL 卡片回退；也用项目最新 transcript/时间窗口推状态。模型含 Mixamo 与 CC0/CC-BY 单件许可 | 参考“稳定座位+交互巡视+降级”的产品组织。其时间推状态不能替代本系统身份证据；不复制真实模型、collector、React/Fastify/SSE 或 demo agents |

仓库主分支页面是本日读取快照，不据星数或 README 的 FPS 自报宣称热门、成熟或本机性能。Three 粒子代码固定为 r186；其他 main 引用可变。

## 本批可落地的有界场景

1. 镜头默认高处三分之四视角，固定观察目标、拖动环绕、滚轮缩放；通过有深度的底座、低墙、工位、信号塔和少量霓虹线形成等距指挥室。默认不持续转动镜头，避免机器人背面和观看晕动。
2. 空间分为“已确认位置 / 待绑定 / 旧证据 / 未知”四区；这四区直接来自现有 category。不能仅凭头像颜色声称工作、审批或完成。
3. 真实 UUID 是机器人身份；座位按 UUID 稳定，列表重排不移动其他机器人的工位。无真实记录时保留空房、显示 0，不能补 demo 机器人。
4. 座位与角色姿态分离：工位归属保持稳定，角色可以沿自己的有限通道巡游再返回；最多相邻两个路点，dt 常速推进、转向短角阻尼、腿/臂反相摆动。点选 UUID 时先稳定到工位，便于连续拾取。
5. 安排位置先用明确的“选中机器人 → 分区/座位”控件，布局状态只影响展示，不改变 pane、项目路径、会话来源或执行任何命令。第一版可仅保存在页面内；不要顺手设计完整地图编辑器。
6. 三维光轨连接入口、证据塔与各区域；128–256 个 Points 就够形成流向，预分配 Float32Array，只改 attribute 后置 needsUpdate。粒子不参与 raycast，depthWrite=false，避免每个粒子一个 Mesh、PointLight 或 DOM。
7. 流程图用同页 DOM/SVG 展示“来源 → 身份证据 → 会话索引 → 按需对话 → 终端位置核验”；边的流动只说明关系，节点文本/可用状态来自实际 API。没有实际步骤事件时，不能展示任务执行进度、运行中或完成。
8. 保留全部文字列表、UUID 选择、消息分页、显式定位；光效与巡游不发网络请求，不读正文，也不更新真实证据。

这是对现有 Three renderer 的扩展建议；无需新增游戏引擎、React、物理库或动画库。

## 丝滑的验证方式

Three [WebGLRenderer.info](https://threejs.org/docs/pages/WebGLRenderer.html) 提供 draw calls/三角形/粒子以及 geometry/texture 数量，可辅助定位重复对象。MDN [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) 说明动画速度应由时间戳决定，回调频率取决于显示器刷新率，后台页面通常暂停。

- 每帧只做数值推进和已有对象变换；不新建几何、材质、数组、路径或 DOM，不重复 setSize。尺寸只在 ResizeObserver/窗口变化后更新。装饰几何/材质集中 dispose。
- 第一版保持单次 render、有限粒子、无实时阴影/全屏 bloom；用发光颜色和加法粒子形成光感。先测再增加效果。用粒子材质不能证明真正 bloom。
- 暂停、prefers-reduced-motion、隐藏页面要同时冻结巡游、步态、粒子与流程图 CSS 动画；恢复时重置时间戳，不追赶隐藏期间距离。
- 代码/fixture 测试：UUID 保留、重排座位稳定、删除释放、点击与拖动互斥、粒子不可选、暂停/隐藏零持续帧、context lost 降级、dispose、无后台正文请求。
- 实际 IAB：真实页面刷新，拖动/缩放/点选/暂停/分区安排，确认交互稳定及当前真实 0/非 0 记录；截图只能证明画面，不能证明 FPS。
- 独立本机 Edge：真实 rAF 连续采样至少 10 秒，分别 0/12/48 个明确标注的 fixture 记录，记录 viewport、DPR、浏览器、总样本、median/p95 帧间隔、>33.3ms 比例、render 调用/资源数量；样本不写回生产索引。
- 建议目标：实测典型 12 角色时 p95≤20ms、>33.3ms 比例<1%；目标未达先减 DPR/粒子/装饰 draw calls。目标是设计验收线，不是调研得到的事实或对任意机器的“必须 60 FPS”保证。
- 本机 Edge fixture 帧率不能当作 Codex IAB GPU/物理显示流畅度；真实 Codex/WezTerm 对话可见性另由来源、UUID、正文分页、终端关联证据验收。

## 本轮读取与局限

实际完整读取 `web/robot3d.js`、`web/cockpit.js`；读取旧 `unified-dev-control-panel/research_robot_github_r3.md` 的相关候选/官方技术段。初次旧文件路径错误退出 1，后用 rg 找到正确位置；大合并输出截断后用窄区间重读相关段。外部源码仅浏览阅读，没有运行，也未复制资产；因此不给外部项目或本机新场景的 FPS/成功接入结论。
