# 游戏空间 renderer 有界实施 r1

2026-10-04。feature_name=game-scene；impl_round=1；lwplan_version=N/A（root 已路由有界展示增量）。权威范围为 `game-scene-bounded.md` 与 `game-scene-github-research.md`，用户持续授权自动实施；本作者只修改 `web/robot3d.js` 与 `web/cockpit.js`。

变更事实：renderer 新增矩形房间、低墙与边界光轨、背景控制中心、真实记录对应的工位；席位 Map 根据本视图首次出现的 UUID 分配并保留，重排不改已有 home，删除释放位置。机器人按 0.75 单位/秒沿各自四个有限路点巡游，肩/髋 pivot 与脚同步步态，转身与相机仍使用 delta 指数阻尼。默认镜头稳定，保留拖动、滚轮、最短角重置、真实 UUID raycast；选中机器人在巡游模式冻结，显式回工位则允许全部角色返回。

粒子为一个 Points、192 个预分配位置，共享几何与材质，没有新增灯、贴图、物理、后处理、网络来源或真实状态推断。镜头绘制只读缓存 width/height；ResizeObserver/窗口 resize 更新缓存，DPR 上限 1.5，3D canvas 高 420px。鼠标位于画布时及已有 8 秒交互冷却期间冻结所有自动装饰；动画暂停、隐藏、reduced-motion、dispose 保持原生命周期停止语义。Pause 后的用户视角操作仍可单次/有限阻尼绘制。

cockpit 新增 `#robot-roam-free`（自由巡游）/`#robot-roam-home`（回到工位）按钮，互斥 aria-pressed，非 3D disabled；保留选择回调原始键，包括 root 计划使用的 `codex:<真实 UUID>`。renderer 返回私有 `setRoaming(enabled)` 与 `metrics` DOM；`#robot-frame-metrics` 是每秒显示最近最多 180 次可见 requestAnimationFrame 间隔推得的 FPS / p95，title 说明不是 GPU 或跨设备保证。不增加服务 API、存储或正文读取。

goal_lock_check：展示真实 UUID 的可活动空间、可回工位、有限光轨粒子；不把装饰推成 busy/done。anti_goal_touch_check：未改 app/index/style/tests、数据源、API、资格/消息/focus、终端配置、真实进程、SSH、Git。authoring_ergonomics_notes=N/A，无配置、声明式规则或 manifest 产品变更。产品 diff 为新增 178 行、删除 32 行，净增 146 行；未引入通用场景框架。related_tasks=房间/工位/巡游步态、粒子批量绘制、缓存尺寸、可见性能采样、无障碍展示控制。

## 本地验证与保全

本轮作者实际执行 `.venv/Scripts/python.exe -X utf8 -B work/verify-game-scene-renderer-r1.py`，工具 chunk `2791be`，退出 0；完整 stdout 已读：8 项静态/语法检查、失败 0。两次 `C:/nvm4w/nodejs/node.exe --check` 退出 0、stdout/stderr 均为空；root 完整 before SHA 两文件匹配。单 Points 固定 buffer、draw 无每帧 DOM 布局读取、两 owned 文件无 fetch/WebSocket/storage、产品净增不超过 250 的静态条件为 true。

证据：`work/game-scene-renderer-r1.verification.json`（完整 Node argv/exit/stdout/stderr）；`work/game-scene-renderer-r1.patch`（完整两文件统一 diff）；原 before 为 root 的 `work/game-scene-before-r1/web/` 与其 manifest，未覆盖。owner=本 renderer 作者。conclusion_if_missing=只记实施，不声称语法或行为通过。作者本轮没有执行 browser、HTTP、GUI、SSH、服务启动；没有把这 8 项静态检查当做流畅度或真实来源接入验收。本地验证未出现失败；实施过程中曾发现 schedule 闭包不能引用 try 内粒子局部变量，验证前已移到外层明确变量，未隐藏已运行的失败命令。

最终 SHA256：

- `web/robot3d.js`：`D1FA1903C6F960B31F0A0B99758E2A1815C63B6E7D17243D9077FF4B3A945DEF`
- `web/cockpit.js`：`A452132E4B3DE6E64D762709677A3011F6CEE97DA001EE3E0E67D0752FFEF38D`

## 交回 root 验证

coordinator_handoff_verifications：root 承接实际 Edge/IAB 的水平路径、腿/臂/脚步态、回工位、已有 UUID 与命名键 raycast、重排稳定座位、0/12/48 个 fixture 10 秒采样、资源数量稳定、粒子 buffer 不换对象、hover/暂停/hidden/reduced/resize/context fallback/dispose、移动端 360px，以及完整旧 fixture。evidence_expected=实际浏览器 JSON 逐条结果/完整退出码、10 秒帧间隔与资源记录、实际当前页面截图；owner=root；conclusion_if_missing=不能称丝滑、行为或来源接入成功。作者未验证实际 Codex / WezTerm 对话接入与定位；旧实机 BLOCKED 不因这次展示实施改变。

contract_drift_reports：无 scope 扩大；提醒 root 368 个 thread 若全部渲染会产生过多 draw calls，root 已决定按真实 Codex metadata 12 条/页展示。本 renderer 不自行截断记录或混入 demo。发现但未改动：真实 provider 接入、流程图 CSS、根页面布局及浏览器测试属于 root / 其他作者职责。

已知风险：FPS output 只采样本页面 rAF；共享几何没有自动合并机器人 draw calls，48 角色压力结果须实测。布局仅当前视图内稳定，页面重开按本次记录顺序重新分配；没有跨页面持久地图。回工位是展示操作，暂停时等待恢复动画再返回。无真实记录时保留空房，不创建角色。

回滚信息：可直接回滚独占两文件至 before；不得覆盖 root 的 app/index/style/tests 或数据源改动。建议英文提交消息：`feat(cockpit): add roaming robot workstations and batched light trails`。

无跨功能事实。
