# 展示退役实施计划

受众：共享。日期：2026-10-15。类型：T3，跨前端、静态路由和浏览器测试；不改变业务协议。唯一输入为本目录 `clarifications.md` 完整实现基线及 `research.md`。Readiness 第 1 轮 PASS 已由 coordinator 复核。本文是计划，产品尚未按本计划实施。

## 1. 范围与主链

目标锁：G1 保存可恢复代码及真实进度；G2 删除装饰展示完整依赖链；G3 保留原生会话、消息、终端及协作业务。反目标 N1 不隐藏代替删除、不引入新框架/开关；N2 不改身份、CSRF、未知/陈旧状态、数据源/数据库；N3 不删未点名业务、不冒称真实验收、不混入并行项目兼容开发。

现状主链为 `index -> app -> cockpit -> robot3d -> Three`，旁路 `garden.getView/onView -> app.renderCockpit`。业务主链是 `原生列表 -> app/garden 选择函数 -> 既有 API -> 详情/收据 DOM`。本轮删除第一条和旁路，保留第二条；HTTP 服务只缩小 5 项静态白名单。后端身份、消息、终端、GardenService/MCP、workspace/progress/execution 及运行数据库不改，因其不以图形为数据源。

| research 事实 | 实现锚点 | 验证责任与口径 |
| --- | --- | --- |
| robot-panel 混有证据摘要与 garden 首屏摘要 | S1 index/garden/style | coordinator：完整首页两视图信息可见，无 canvas；保留身份键/链接 |
| recordView 服务列表及 eligible，owns 服务公开发言校验 | S1 app/garden | impl 保留函数语义；coordinator：四类证据、未知/陈旧禁止动作、同根与晚响应 |
| Three 为本地 vendor，非 npm 包依赖 | S1 5 文件/5 路由 | impl 搜索活引用；coordinator：退役地址404，加载首页不请求旧资源 |
| 机器人测试混有业务覆盖 | S2 session/garden 测试 | coordinator：逐项业务场景迁移及原生 DOM 断言；不能删断言求绿 |
| 历史机器人 BLOCKED、旧无 Git 约束 | S3 README/进度 | coordinator：旧报告不改，记录新提交和本轮验证边界 |

三个工作包顺序为 S1 → S2 → S3，S1/S2 作为同一完整清理提交，不发布中间缺测试状态。以下目标骨架贯穿入口、选择、garden 及静态路由；覆盖最小调用闭环，没有另建适配器。

## 2. 实施步骤

### S1 删除展示链，保留原生业务入口

**目标与消费**：G2/G3，N1/N2/N3。输入为原有 API/快照，输出仍是完整身份列表、消息/终端详情及协作收据；空快照、跨根、不可用、陈旧与晚响应分支原样保留。依赖：基线清理前提交 `4d32f6e` 已保存；Gate-2 通过后实施。

**关键锚点与步骤**：

1. `web/index.html` 删除 cockpit script、3D/像素/文字模式、旋转/暂停/巡游控件、robot-status/stage/legend、动画文案。原 robot-panel 变为 `evidence-panel`，标题改“会话证据”；其中 `evidence-flow`、`mapping-summary` 及全部复制/链接节点保留。将 `garden-peek` 和 `garden-scene-roster` 移入既有 `garden-panel`，置于 counts/标题之后、详细列表之前；保留节点 ID，不另造信息层。观察视图显示 evidence-panel，garden 视图隐藏它。`mapping-robot` 改 `mapping-identity` 并同步 app 引用，文案改“身份核验”。删除无效的巡游说明，保留“活动/完成未知”。
2. `web/app.js` 删除 cockpit 变量、完整 `selectRobot`、`renderCockpit`、SessionCockpit 初始化 try/catch；删除 `renderCodexThreads`、`renderSessions` 中的 renderCockpit 调用和 mount 的 onView 参数。原生 `selectSession`、`selectCodexThread`、`recordView`、`current`、`eligible`、`renderEvidenceFlow`、全部查询/分页/动作函数不变。仅改涉及机器人/巡游的文案与新身份摘要节点名。
3. `web/garden.js` 删除 `getView`、`mount` 的 onView 参数、所有 onView 调用、sceneHeading/originalSceneHeading 及切换/清理时对它的赋值；return 对外仅保留 `refresh/observeDomain/dispose`。内部 `owns`、`selectActor` 原样保留。`render` 删除 bot span 和 antenna/head/body/feet，按钮只 append 原 label；角色/职责/任务/摘要/收据/公开发言及焦点恢复都保留。保留 cloud 的折叠和公告业务，移除 new-result 装饰类即可，不删除 seen 的公告去重。
4. `web/style.css` 删除 robot-modes/controls/stage/canvas/legend/frame-metrics、garden-bot 零件、garden-idle、garden-cloud-pop、flow-light/vertical 动画，以及关联 page-hidden/motion-toggle 动画规则；保留 flow-track 的静态关系线、证据状态和响应式。robot-panel 的布局改给 evidence-panel；garden 首屏摘要沿既有样式放在 garden-panel 内。删除重复 section 标题所产生的空白，保持观察视图第1行证据、第2行workbench、第3行Codex；garden-panel在garden视图占第1行全宽。不重做配色或业务布局。
5. 删除 `web/cockpit.js`、`web/robot3d.js`、`web/vendor/three-0.186.0/three.module.js`、`three.core.js`、`LICENSE`。删除 gateway.do_GET 静态表中对应 5 条路由；保留 garden/app/style、workspace/progress/execution 与所有业务 API。

**整链删除函数完整名单**（整文件含匿名监听/回调及闭包状态一起删除，不保留空壳）：

- cockpit：`create`、`listen`、`setStatus`、`clearRestore`、`stopScene`、`select`、`drawPixel`（含局部 `rect`）、`schedulePixel`、`showPixelOrText`、`unavailable`、`enable3d`、`setMode`、返回方法 `update/dispose`、`window.SessionCockpit` 导出。
- robot3d：`createRobotScene`、巡游 helper `line/arc`、`moveRobot`、`listen`、`dispose`、`fail`、`moveParticles`、`schedule`、`draw`、`clearBatches`、`uploadBatches`、`rebuildBatches`、`block`、`makeRobot`（含 `part`）、`update`、`pauseAutomatic`、`resize`、返回方法 `setRoaming/rotate/setAnimation`。Third-party Three 两文件及其全部导出整体删除，不局部修改库。
- app：`selectRobot/renderCockpit`；garden：`getView`。其余函数不作整链删除。

**目标骨架及调用边界**（说明预计职责，不要求逐字照抄）：

```js
// app.js bootstrap: direct business module, no rendering adapter.
garden = module.mount({ root: result.garden_root, query, csrf: () => state.csrf });
// renderSessions ends with renderCoverage(); renderCodexThreads retains renderEvidenceFlow().
// Existing list click -> selectSession/selectCodexThread is unchanged.

// garden.js mount:
export function mount({ root, query, csrf }) {
  function selectActor(key) {
    if (!owns(key)) return;
    selected = key.slice(6); dialogueGeneration++;
    dialogue = { state: 'idle', actorId: selected };
    render(); loadPublic(selected);
  }
  // clear, refresh, cloud click: render() remains; onView() disappears.
  // switchView still sets active/domain, clears stale state, then refreshes.
  return { refresh, observeDomain, dispose() { /* existing domain/listener cleanup */ } };
}
```

`gateway.py` 目标静态表保留 `/`、`/app.js`、`/style.css`、`/garden.js` 和既有 workspace/progress/execution 文件；未知路径继续进入原404处理。不存在新数据字段、状态、配置或迁移脚本。接口收缩只影响已退役的内部渲染接口及静态资产，须同步测试调用方。

**作者体验/可读性**：沿用原生 button/details 与稳定业务 ID；移除失效控制和图形术语，保留有意义的“未知、旧证据、待复核”解释。代码片段必填条件已满足：展示的是修改后的调用顺序和跨文件 mount 接口。

**验收与责任**：impl 做语法、活引用扫描、单元测试，完整输出/退出码及差异范围写入 `impl_report_r1.md`，本机完整日志置 `work/display-retirement-impl.log`；coordinator 用 S2 浏览器及本机合成 HTTP 读取确认页面两视图、404和保留功能，保存 `work/display-retirement-browser*.json/png` 并在实施报告记录摘要。真实远端、模型、服务重启均不属于 impl-safe，也不在本轮验收范围。缺任一必要证据只标未验证。

**风险/回滚**：garden 摘要移动后旧 selector/布局漏改会导致空白或脚本异常；S2 以完整首页验证。保留业务数据，不运行 DB 迁移。失败时停止提交，按 diff 修本批；若需撤销已推送清理，coordinator 仅以新增 revert 提交回退本批、重新验证，不覆盖并行改动或改写历史。

### S2 迁移业务回归，删除图形专项断言

**目标与消费**：G2/G3，N1/N2/N3。依赖 S1；关键文件 `tests/verify_robot_cockpit.cjs` → `tests/verify_session_panel.cjs`、`tests/verify_garden.cjs`、`tests/test_gateway.py`。先看旧 harness 的 `installObservation/latestView/openPage/main`，因为它将业务检查绑定到 cockpit 捕获；目标是测试真实 DOM/请求，不在产品保留测试适配器。

**步骤与完整场景边界**：

1. 将旧混合 harness 改名为 `verify_session_panel.cjs`，保留 loopback Python fixture、请求记录、网络 guard、错误检查、合成时间/visibility/interval 控制及资源清理。删除 `mode`、`graphicsFailure`、`canvasGeometry`、`pickEveryRobot`、`graphicsNormal`、`pixelAndPicking`、`pendingModes`、`motionLifecycle`、`gameSpace`、`personalSpaceMotion`、`gamePerformance`、`gameBatching`、`gameFrustum`、`pickCodexRobot`，删除图形捕获/故障注入、专用命令参数及 Three 资源 hash/syntax 检查。仅保留可选 `--fixture`，文档使用无参数默认全业务回归。
2. 逐项保留 `basicBehavior`、`classification`、`epoch`、`apiFailures`、`unknownRegistrationFocus`、`workbenchBehavior/Failures/Pending`、`mappingEvidence/WithoutCsrf/Responsive`、`codexIdentity/Failures/LateResponses`。移除这些场景内模式/拾取调用；`latestView` 捕获改为直接 DOM 断言或仅在测试内的 DOM 读取 helper，不能从已不存在的 cockpit 获取数据。完整 UUID 命名空间、四类分组、分页、陈旧选择清空、按需正文、晚响应隔离及动作禁用断言必须保留。
3. 对上述断言采用实际证据：远端按钮 `data-session-id`、Codex按钮 `data-session-key`、各组 `data-category`、`aria-pressed`、mapping-key、所选详情与实际请求计数。Codex和远端同 UUID 必须分别存在；选择为空应同时检查无 pressed 按钮、映射/详情为空，不能仅查数量。
4. `verify_garden.cjs` 删除 fake robot-stage/heading/motion-toggle 及 onView/getView 外部依赖，沿用保留的公开接口。保留快照哈希、阶段动作、摘要去重、跨域/晚响应/隐藏取消、键盘/轮询焦点和>4角色覆盖。responsive 验证改为360/574/1024px无溢出，摘要及至少第一个角色/事项在首屏，无人物/画布；不再要求场景120px。至少另加一次完整生产 index/app/garden 组合 fixture，覆盖合法 bootstrap root 挂载、两视图切换、列表选择、摘要/详情，防止自造HTML掩盖接线错误。
5. `test_gateway.py` 将旧图形成功路由测试替换为5个退役URL的404/route_not_found和无业务调用；现存 app/style/garden 逐字节/MIME/CSP/nosniff 测试保留或迁移。路径前缀/查询/编码拒绝仍测。所有首页浏览器场景验证不请求退役资源、无 canvas/人物DOM；仍保留 API client header、外部/生产网络零请求断言。

**目标断言片段**：

```js
// Test-side DOM observation; never restore a product renderer seam.
const local = page.locator('#codex-list button[data-session-key]');
const remote = page.locator('#sessions button[data-session-id]');
// Check exact IDs, aria-pressed, mapping-key and detail visibility for each transition.
// No /cockpit.js, /robot3d.js or /vendor/three-0.186.0/* request may be emitted.
```

**验收与责任**：impl 运行 JS 语法检查、`python -B -m unittest discover -s tests -q`、`node tests/test_execution_ui.cjs`，保存完整输出与退出码，不把测试数减少自动判为通过；报告逐场景迁移对应。coordinator 运行 `node tests/verify_session_panel.cjs` 与 `node tests/verify_garden.cjs`，读完整 JSON 的 failures/blocked_requests/cleanup 并查看桌面与360px两视图截图。浏览器/HTTP集成由 coordinator 承接，impl 不代做真实环境操作；若命令失败先记录再修，若产物不完整保持未验证。证据路径同 S1，报告区分两类主体。

**作者体验/风险/回滚**：保留旧业务场景名便于 diff 对照；输出改为 session-panel，移除只与 GPU 相关的噪声。晚响应/根域条件不能借测试迁移简化。任何迁移覆盖遗漏均先修测试再结论；回滚 S1 时一同回滚这批测试，不能单独恢复图形测试指向缺失模块。

### S3 同步现行说明、审查与 Git 交付

**目标与消费**：G1/G2/G3，N1/N3；依赖 S1/S2 的完整证据。关键文件：根 `README.md`（网页/协作说明、验证命令）、`docs/DEVELOPMENT_STATUS.md`（本轮整理）、本目录 README/实施报告。目标形态是当前文档描述原生业务，旧机器人/协作批次报告仍是历史，不额外整理全库文档。

**步骤**：更新根说明删去仍提供3D/像素/巡游/FPS的声明；原任务摘要/职责/收据和按需公开发言说明保留；测试命令换为会话 harness 并列 garden。当前进度写清基线提交与退役提交、必要验证、已知失败和真实环境限制。共享目录并行 `project-progress-compat-20261014/lwplan.md` 不修改、不暂存。

**验收/责任/证据**：impl 记录文件清单、计划映射、实际测试输出/退出码和全部本轮失败；coordinator 运行 diff检查、审阅已暂存清单、`git log --oneline origin/main..HEAD`，只暂存本批明确路径。独立实施审查后，coordinator 按既有授权单独 commit+push，并核对远端 HEAD 与提交；证据和最终审查结论在本目录引用。缺回归/审查/远端结果不得称交付完成。本工作包不涉及新业务分支，文字已足够，无需代码片段。

**作者体验/回滚**：中文说明先讲保留的功能，英文提交建议 `refactor(ui): retire decorative session rendering`。Git保留清理前恢复点；回滚只新增 revert，不 reset/clean/强推、不删本机运行数据。无部署迁移或停机：本次只交付仓库，运行中的网关保持现状；加载新版本需之后按服务归属流程处理。

## 3. 风险、Gate 与阶段留痕

- U1 已关闭为本次仅同一展示链；U2 运行服务版本不作为本次验收，不重启；U3 由 S1/S2 的实际测试收口，当前未验证。观察/协作不同视图均要检查，防止移除 robot-panel 后误隐藏业务。
- 新假设、新风险及阶段切换须由 coordinator 即时对齐，留痕在本目录 README/clarifications/对应 review。当前研究→规划阶段已收到 Readiness PASS；规划→审查由本 Gate-1 结果触发。旧 BLOCKED、旧“无Git”和并行兼容计划均不得静默改写。
- 本轮无阻塞问题，因范围、保留业务及回滚已由基线确定。若出现新业务删除/验收/回滚口径不唯一，按 P0阻塞、P1高风险、P2优化一次性批量输出 `【DELEGATE_QUESTION】需要用户确认：…；影响阶段：…；A) 推荐方案及原因；B) 备选及权衡；请回复Q1=A…`，先回写基线再继续。普通实施授权已存在，不重复问许可。
- Gate-1 由计划作者检查 T3 Required Set：目标/反目标、不影响层、函数/接口清单、迁移兼容、片段闭环、执行顺序、作者体验、风险/回滚、验证分层与证据三元组全部可定位；失败则修订，不进入实施。
- Gate-2 由独立 plan reviewer 主检、coordinator 复核；须顺读完整主链、上述片段和测试迁移，核对保留函数/业务断言、静态404、布局、责任与可读性。失败返回当前 lwplan 修订；口径冲突先回基线。只有 Gate-2 PASS 后按既有用户授权实施；本 Gate-1 不代替审查或产品验收。

Gate-1 作者自检：目标锁/反目标映射完成；验证责任分层已落盘；证据产物/责任归属/证据不足约束已落盘；作者体验门证据已提供；核心链路总览、research事实映射与片段闭环充分性已落盘。状态：READY_FOR_REVIEW，尚未获得 Gate-2。

规划准备期间曾读取不存在的 `docs/DOCUMENTATION_CONVENTIONS.md`，命令报告路径不存在；这是路径查找失败，不据此创建新规范或扩展范围。另有宽输出截断，关键函数与Readiness报告已定向读取。未运行产品测试，无跨功能事实。
