# R12 子agent协作小院实施报告：第 2 轮修补

`feature_name=subagent-garden`  
`impl_round=2`  
`date=2026-10-06（Asia/Shanghai）`  
`lwplan_version=e20c7af4a1980e3de086664d5432e13a8e57b328196b94b5757619ada1da4f98`  
`input_review=review_notes_impl_r1_1.md / REVISE / IMPL_DEFECT / SHA dc6e27c0f5a150b131d13aa83e04847e06633af917b4667b1718515942c2a46d`

本轮只修第一轮独立审查指出的 S4 失效云朵、首屏庭院和实施报告字段缺口。第一轮已经交付的 S1–S3 真工具、账本与跨根隔离不改；完整第一轮事实和失败见 [实施报告 r1](impl_report_r1.md)，独立红证据见 [ReviewImpl r1](review_notes_impl_r1_1.md)。此目录无 Git，不初始化或执行 commit/push。

## 逐文件变更事实

表格每行依次给出 `path`、`change_type`、`change_purpose`、`key_changes`、`related_tasks`。`r2 本轮` 列说明新修补；其它行是最终交付文件集合，沿用 r1 的已验证改动，没有在本轮伪称再次实现。

| path | change_type | change_purpose | key_changes | related_tasks / r2 本轮 |
|---|---|---|---|---|
| `session_panel/garden_native.py` | add | 绑定原生父子身份 | readonly id/source、明确 parent/root、坏链关闭 | S1；r2 未改 |
| `session_panel/garden.py` | add | 同根账本/真实收据 | per-root SQLite 事务、角色/版本/hash/独立复核/验收 | S2；r2 未改 |
| `session_panel/garden_mcp.py` | add | 注册八项可操作 MCP 工具 | raw schema 拒错、进程 caller 绑定 | S3；r2 未改 |
| `session_panel/garden_invoke.py` | add | 各子agent真实调用入口 | 固定 stdio ClientSession initialize/list/call、无身份覆盖 | S3；r2 未改 |
| `session_panel/gateway.py` | modify | 本根网页读/受控写桥接 | 固定 GET/status 与请求/验收 POST，旧动作路径保留 | S3；r2 未改 |
| `web/garden.js` | add+modify | 同根角色、云朵与失效表达 | r2 `currentReviewPassed()` 同时要求 `current_valid`、`reviewed_pass/accepted`、真实 pass；卡片/云朵/详情统一；首屏摘要仅来自当前有效验收 | S4；r2 修失效态和首屏摘要 |
| `web/index.html` | modify | 首屏真实摘要布局 | r2 在原 3D 舞台前加 `garden-peek`，旧观察 DOM/IDs 保留 | S4；r2 添加局部标记 |
| `web/style.css` | modify | 星露谷感觉与首屏可见性 | r2 恢复真实 3D panel 的首行顺序、紧凑本根摘要卡；旧观察样式不受新类影响 | S4；r2 局部布局 |
| `web/app.js` | modify | 安全挂载新小院 | 只有合法 garden_root 动态 import、选择域切换和固定刷新 | S4；r2 未改 |
| `web/cockpit.js` | modify | 新主题透传 | 可选 garden theme，旧 view 行为保持 | S4；r2 未改 |
| `web/robot3d.js` | modify | 真 3D 草木配色 | 仅材质色；几何、光强、粒子、AA/DPR/巡游/拾取不改 | S4；r2 未改 |
| `README.md` | modify | 作者可操作说明 | 实际八工具、固定调用、角色与隔离、桌面自动发现未验 | S3/S4；r2 未改 |
| `tests/test_garden.py` | add | 核状态与隔离负例 | 双根、并发幂等、hash/证据失效、角色/路径/锁 | S1/S2；r2 未改 |
| `tests/test_garden_mcp.py` | add | 核协议真注册 | raw extra/类型、真实 stdio 工具发现与 caller 拒绝 | S3；r2 未改 |
| `tests/test_garden_gateway.py` | add | 核受控 HTTP | root 绑定、CSRF/Host/Origin/body/超时/旧 fixture | S3；r2 未改 |
| `tests/verify_garden.cjs` | add+modify | 核新 UI 真状态 | r2 添加 artifact_changed/current_valid=false 的 reviewer 云朵/详情/首屏摘要撤销反例；原迟到 GET/POST/键盘/路由仍测 | S4；r2 添加独立红例的绿回归 |

旧基线 29 个文件的最终比较在 `work/r12-garden-manifest-r2.json`：7 个上述既有文件改动、22 个旧文件原样、9 个新增，exit 0。旧 `tests/verify_robot_cockpit.cjs`、旧只读 MCP 与 Three.js vendor 没改。工作目录下的测试/运行证据和文档属于附属材料，不是另一个产品模块。

## 目标锁、反目标与作者体验

`goal_lock_check=aligned after r2`：G12.1 的柔和草木/像素工位和真实 3D 现在同在 574×866 首屏；首屏 `本主会话·4伙伴·1已验收`、来自真实 accept 收据的完成摘要与 382 像素可见真实 WebGL 舞台。G12.2 的当前有效复核展示现要求有效哈希及适用阶段；失效时两位角色都显示“文件已变化”，历史 pass 只能在完整收据中查看。G12.3 的 root UUID 域、其它主会话切换清空与显式返回不变。

`anti_goal_touch_check=clear after r2`：N12.1 的“历史 pass 不能当当前成功”已由受控红例→绿例核验；N12.2 的跨根、任意命令、自动派发、全局配置未扩展；N12.3 的旧 focus/connect/unknown、3D 几何/画质未改。客户端无法仅通过 cwd/agent_path/fork runtime 切换根。缩略摘要由当前 accept receipt 直接显示，动画仍只作装饰。页面像素角色/真实 3D 点击是同域 child 身份，不会把 child 送到旧远端消息路径。

`authoring_ergonomics_notes=pass`：八个工具仍是固定签名、固定角色方法，首屏只新增三个普通文本字段与一处 CSS；没有新配置语言、规则模板或泛用任务调度器。网页正常中文字和原 40px 主控，360/574/1024 实测无横向溢出；完整 UUID、SHA/收据放在展开详情。`declaration_readability_check=pass`：MCP schema 与 HTTP 精确字段维持，文档将自动加载限制写明。

## impl-safe 验证记录

每项 `evidence/owner/conclusion_if_missing` 明示如下。真机/浏览器/原生派发均列下一节 coordinator 承接，不冒称 impl-safe。

| 验证命令或静态检查 | evidence | owner | 实际结果 | conclusion_if_missing |
|---|---|---|---|---|
| `python work/r12-garden-syntax.py` 分别执行 5 个 Node parser | `work/r12-garden-syntax-r2.json` | root 产品作者 | 5 条各 exit 0，stdout/stderr 空 | JS 语法未验，不可继续 UI 验收 |
| `node tests/verify_garden.cjs` | `work/r12-garden-browser-repair.json`、其 stdout 指向的 `work/garden-browser-2026-10-05T16-34-44-762Z.json` | root 产品作者运行受控 fixture | 12 checks / 0 failure / exit 0；新增失效态与首屏摘要撤销 | 失效状态和域切换未验，不得称完成云朵可信 |
| `python work/r12-manifest.py` 对冻结旧集与新集逐字节 hash | `work/r12-garden-manifest-r2.json` | root 产品作者 | 29旧：7有意变、22原样；9新增齐全 / exit 0 | 变更范围及旧画质文件未核对 |
| `.venv/Scripts/python.exe -X utf8 -B -m unittest discover -s tests -v` | `work/r12-garden-python-full-r2.json` | root 产品作者 | `Ran 192 tests in 16.988s / OK / exit 0`；完整 stdout/stderr 已逐段读完，含 3 条 FastMCP/Pydantic `IncompleteFieldDefinitionWarning(lifespan)` | 后端/旧防护不得宣布通过 |

## coordinator_handoff_verifications

下表是不能靠作者单元测试替代的真实/跨层结果，由同一 root 以 coordinator 身份独立执行并留证；`evidence_expected` 为本轮可检查的确切产物。

| 非 impl-safe 项与移交原因 | 承接方式 / owner | evidence_expected 与当前状态 | conclusion_if_missing |
|---|---|---|---|
| 原生子agent交付→另一 reviewer claim/record→root验收，涉及各自真实 caller | root coordinator 实际 dispatch 与每段独立哈希 | `work/r12-garden-worker-calls.json`、`r12-garden-reviewer-calls.json`、`r12-garden-root-preaccept.json`、`r12-garden-live.json`；revision10/current_valid=true，r2 未改账本/产物 | 不能声称真人子agent真实工具链已跑通 |
| 已有自有本地 8766 进程归属、实际服务 root/API 与现资源字节 | root coordinator 不停用户进程；原旧进程已自行退出后空端口启动自有 hidden 网关 | `work/live-session-gateway-reload-r12.json` 红、`work/live-session-gateway-start-r12.json` 绿；r2 最新 `work/r12-garden-service-r2.json` 六资源 SHA 与 accepted 状态 exit0 | 不能称当前用户页面已接入新代码 |
| 真实 IAB 574 首屏/360/1024/旧观察 tab/控制，需亲看页面 | root coordinator CUA 只读 DOM/点击，截真实可见页面 | `work/r12-garden-iab-r2.json` 与 JPEG 实际编码的 `work/r12-garden-iab-r2.jpg`：574 真实 stageTop484、可见382px、页面高2283<2600、无横溢；360可见254px/总高2558、1024可见415px；另 `work/r12-garden-iab-r2-full.jpg` 是本页完整长图（默认窄面板宽459），显示真庭院与两只角色云朵；之前 `r12-garden-iab.json` 只见云朵无首屏庭院，保留为红 | 不得称舒适首屏验收完成；截图不能由 fixture 代替 |
| 旧无 garden context 完整浏览器回归，确认旧交互不受首屏标记/CSS影响 | root coordinator 跑不修改的旧 harness | `work/r12-garden-legacy-browser-r2.json` 与 stdout 指向的完整 JSON：1403/0/exit0 | 旧观察/守卫兼容未验 |
| 48 角色同质量连续60秒，不能用短窗或降低设置代替 | root coordinator 跑原 harness 原参数 | `work/r12-garden-perf48-final.json`、`work/robot-cockpit-fixture-r1-2026-10-05T16-36-28-946Z.json`：60009.8ms、9894 帧、164.86 FPS、p95 6.8ms、慢帧0、draw83、8/0/exit0；CSS/HTML hash 是 r2 当前值 | 性能/画质不能称守住 |
| 新代码/报告 fresh 独立 ReviewImpl | root coordinator 委派不同于作者、计划与业务 reviewer 的审查者 | `docs/current/subagent-garden/review_notes_impl_r2_1.md` 待执行 | R12 产品最终技术门不放行 |

真实 IAB 的页面帧率字段在后台浏览器中出现过 1–2 FPS/p95约1006ms，`document.hidden=false` 而 Codex IAB visibility getter 返回 false，即便 set(true) 也未确认窗口呈现；因此**不**把该短时读数当可见前台性能证明，也不宣称所有硬件达标。连续性能的适用范围是本机受控 headless Edge 的可见 rAF/WebGL 样本。用户若打开页面到前台，可继续观察自己的机器表现。真实 IAB 截图保留当时字段，没有裁切或伪造。

## contract_drift_reports、红色记录和风险

`contract_drift_reports`：第 1 轮 ReviewImpl 首个 drift 为 `web/garden.js` reviewer 仅看历史 pass，把后端派生 `artifact_changed` 仍显示成功（违反 N12.1），已报告 root、r2 以当前有效与阶段统一谓词修补并把独立红例纳入正式 fixture；第二个 drift 为上一版 CSS 为优先显示卡片把整个真实 3D 庭院移到第二行，使 574 首屏看不到（违 LW §S4），r2 恢复 3D 首行并在场景前贴真实摘要；第三个是 r1 实施报告缺 safe-code-changes 明示最小字段，本 r2 逐项补齐。审查者判三者为 `IMPL_DEFECT`，无新的用户目标或计划 how 缺口，LW 不改。本轮字段没有 N/A related_tasks；每行均绑定 S1–S4。

原失败按观察保留：Readiness 最初缺基线6–10/源目录，LW 首次 REVISE 两处 how、计划代理两次 capacity、计划审查 checker 首次 SyntaxError；后端首 11 单测 1 fail+11 errors/exit1（SQLite 句柄和全数字大小写 fixture），首协调者脚本 `ModuleNotFoundError`/exit1，业务 reviewer 猜错两文件两次读取exit1；新浏览器首 9/1/exit1（owns null），误用 Node 跑 Python wrapper/exit1，旧 owned 网关重载因旧进程已自行退出得到 exit1（未杀任何进程），IAB 第一次 fullPage 截图失败、跨调用保存时一次 `fullShot is not defined`（后续同 API 成功保存 `r12-garden-iab-r2-full.jpg`）、一次 AX复制点击失败、剪贴板读回为空。第 1 轮独立审查的失效态 Edge **11 checks/1 fail/exit1**、首屏缺真实庭院和报告缺字段，以及 reviewer manifest checker 错读新增项的 9 假红/exit1 均留在 `review_notes_impl_r1_1.md`。本轮第一次合并 fixture 补丁因空格上下文不符两次 `apply_patch` 拒绝，随后逐块按实际源行落地，不改变运行状态；一次尝试用本机 `.venv` 的 PIL 读截图报 `ModuleNotFoundError`，改读文件头发现浏览器截图实际为 JPEG，保留旧 `.png` 历史证据、最终另存 `.jpg`。第二轮独立审查首次调度遇到模型 capacity 错误，已在同审查者上重试，不能把调度失败当作审查通过。旧 R11 历史全 fixture 1392/1与1397/2、CSRF36/1、窄屏42/1、持续性能红 p95 30.2ms/慢帧3.8069%、另一短窗p95 51.2ms/慢帧10.5333%、更早35.1098FPS/p95 60.9ms/慢帧19.658%、真实 workbench23/1 timeout 与远端正文/Wez/活动限制都保留在 r1/旧报告。

未完成：fresh ReviewImpl/root Gate 尚未结束；未证当前桌面自动发现/热加载新 MCP，未证 IAB 剪贴板实际读回，也未消除旧远端/终端观察限制。实现风险是原生 SQLite 内部 source schema 更新、本机同 OS 账户可信边界以及 user machine 的渲染表现；前两者在不满足时关闭或明确 unavailable，第三者只给本机受控采样界限。

`rollback=需人工介入`：当前真实 `work/garden-state/<root UUID>.sqlite` 保存已验收收据，不自动删除或重置；R11 原产品字节保存在 `work/r12-before/`，回退 S4 只按已保存的精确旧 web 文件人工比对覆盖、再测旧全回归。当前 8766 有自有 hidden 网关，任何停止/重启前须再次核 PID、绝对路径、argv、父子与 birth、端口和 action latch，不得凭旧记录 kill。撤销 S1–S3 先审计账本/工具依赖，再决定是否保留真实证据，不改用户全局配置或其它主会话。

**英文提交建议**：`fix(garden): withdraw stale review clouds and show live courtyard above the fold`。无 Git，本轮不提交。
