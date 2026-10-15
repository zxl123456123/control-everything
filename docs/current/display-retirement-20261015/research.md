# 展示退役调研

日期：2026-10-15（Asia/Shanghai）。受众：共享。状态：只读调研；未修改产品、未运行真实远端或控制动作，本文不代表实施或验收。

结论：机器人展示有独立的渲染依赖链，可以退役；会话选择、消息分页、终端证据与协作收据已有原生 DOM 入口。不能把名称含 robot/garden 的整个区域或后端一起删除，因为其中混有有效业务功能。

## A. 系统边界与现有能力

- `/` 提供远端 Claude 会话索引、按 UUID 读取消息、核验后定位既有终端，以及本机 Codex 元数据索引。
- `/workspace` 提供项目、任务、执行、额度等工作台能力；`/progress` 提供项目进度。这些入口不依赖 Three 或机器人模块。
- 同主会话协作由 `GardenService` 和根 Thread UUID 约束；页面提供角色、任务、产物 SHA-256、复核与验收收据、按需公开发言。装饰角色不是业务数据源。
- 位置、身份、活动和完成是不同语义；删动画不应改变现有证据门槛或把历史未验收动作改称可用。

## B. 入口与主流程

1. `web/index.html:8` 加载 `cockpit.js`，随后 `app.js` 建立业务页面。
2. `web/app.js:463` 创建 `SessionCockpit`；`renderCockpit`（283）把当前会话和 Codex 身份转换为图形数据，或接受 garden 的 `getView()`。
3. `web/cockpit.js:186` 动态导入 `robot3d.js`；后者首行导入 `/vendor/three-0.186.0/three.module.js`，再依赖同目录 core。像素 canvas 和文字回退也在 cockpit 内。
4. 原生列表独立调用 `selectSession` / `selectCodexThread`；渲染点击仅通过 `selectRobot`（app.js:197）转发到这些同一业务选择函数。
5. `/api/bootstrap` 有合法 `garden_root` 时，app.js:474 动态挂载 garden；garden 的 `observeDomain` 清空跨根内容，刷新只读收据快照，明确点击才读取公开发言。
6. `gateway.py:158` 是精确静态资源白名单；图形退役需要同步删除白名单入口，而不是把目录映射放宽。

## C. 模块与删除边界

以下是依赖调查所得的候选最小退役集合，供唯一实施计划使用；未执行删除。

| 文件或区域 | 已观察事实 | 退役边界 |
| --- | --- | --- |
| `web/cockpit.js`、`web/robot3d.js` | 模式、canvas、WebGL、拾取、巡游、粒子、帧率均只服务图形 | 整文件候选删除 |
| `web/vendor/three-0.186.0/` 三个文件 | 唯一产品入口是 robot3d；无 package.json 或 npm 锁文件 | 模块、core、LICENSE 随依赖一起退役；保留历史研究与许可证来源记录 |
| `web/index.html` 机器人区 | 图形控件、stage、说明与 `evidence-flow` / `mapping-summary` 同处一个 section | 删图形控件、stage、动画说明；保留证据链、完整身份键复制、详情与工作台链接 |
| `web/app.js` | cockpit 变量、初始化、renderCockpit、selectRobot 仅图形用途；recordView 被列表分类及 eligible 使用 | 移除前者调用链；保留 recordView/current/eligible、完整 ID、分页与终端前置条件 |
| `web/garden.js:52–99` | onView/getView/sceneHeading 连接图形；owns 同时被公开发言校验使用 | 移除图形接口和 scene heading 耦合；保留 owns 内部校验、observeDomain、代际隔离与可见性取消 |
| `web/garden.js:145–206` | peek、roster 是真实任务摘要；garden-bot 是纯装饰 span/i；garden-cloud 载有状态/摘要和折叠交互 | 保留有用摘要与角色按钮；删除 garden-bot 及零件创建。cloud 的数据及折叠不可随形状一起删除 |
| `web/style.css` | robot-stage 等和 garden-bot / garden-idle 是独立装饰；flow-light 是证据链粒子；多条样式仍引用 robot-panel | 删除已退役选择器与动画，取消依赖 robot-motion-toggle 的规则；保留布局、证据状态、焦点、响应式、详情和收据样式 |
| `session_panel/gateway.py:162–174` | 5 个图形资源白名单条目，无图形业务 API | 仅删这 5 个静态条目，garden.js/API/MCP/SQLite 不属于退役依赖 |

需要同步处理的布局事实：workbench 固定 grid-row:2，codex 固定 grid-row:3，garden-panel 也是第 2 行；原 robot-panel 在第 1 行且承载 garden 的首屏摘要。直接移除外层 panel 会使证据摘要和 garden 首屏节点丢失，或留下布局空行。最小变更应保留信息容器并改为业务名称，或在现有业务 panel 内安置同一节点，不能仅隐藏旧 canvas。

## E. 官方成熟做法与取舍

- [MDN button](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button)：原生按钮支持键盘及辅助技术激活。已有会话/角色按钮可直接承担选择，采用现有 DOM 与焦点保持路径；无需新交互库或 canvas 的替代仿真。
- [W3C APG Read Me First](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/)：ARIA 是行为承诺，错误 ARIA 会覆盖正确的原生语义。采用现有标题、button、details、ol 收据列表；不为退役额外实现自定义 listbox/键盘协议。
- [npm 官方卸载说明](https://docs.npmjs.com/uninstalling-packages-and-dependencies/)：包管理项目应同步移除 dependency 与锁文件。本仓库无 package.json，Three 是本地固定文件，因此这里采用引用链＋文件＋静态路由一起移除，不执行无关 npm uninstall，也不新增打包工具。

## F. 历史状态与文档冲突

- `docs/current/session-robot-cockpit/README.md` 仍记载 impl_reviewing / BLOCKED，原因是缺真实成功定位证据；这是历史批次的事实，本次退役不能替其通过或补做机器人验收。
- `docs/current/subagent-garden/README.md` 与 `subagent-garden-detail/README.md` 记载旧协作/详情批次 PASS；收据链有用，不能因清除展示而删其业务。
- 三份 README 均含“当前无 Git／不初始化 Git”的旧范围描述；用户当前明确要求 Git 整理，历史快照保留，新进度说明需明确该约束已由新请求替代。
- 根 README 目前宣称 3D/像素、巡游、FPS 等已实现，并以 `verify_robot_cockpit.cjs` 为现行测试入口。退役实施时需更新根说明与当前进度索引；旧报告作为历史证据保留，不批量改写旧验收结果。

## G. 不确定点

- U1：用户“比如像素人”还可能包括其它功能，但未明确列出。当前可明确收敛到同一装饰渲染链（3D、像素、巡游、人物 CSS、粒子）；其它业务功能不在本次擅自删除范围。这不阻塞已明确的退役。
- U2：未核验正在运行的网关加载了哪个文件版本；本调研只证明磁盘依赖边界。运行中部署由 coordinator 决定，不接管现有进程。
- U3：本次未运行产品回归；下面是需要保留/替换的验证覆盖，不是通过结果。

## H. 可核查证据与必要验证

### 代码锚点

- `app.js:138/186/292/322/372`：Codex/远端列表、选择、详情独立 DOM 路径。
- `app.js:233–281`：证据链与身份摘要；`recordView` 的四类证据同属原列表和定位资格。
- `garden.js:18`：快照有效性；`113`：按需公开发言；`127`：写入；`245–272`：请求复核、验收、复制复核请求；文件末尾：根域切换和清理。
- `gateway.py:158–178`：静态白名单；`199`：garden 读取；文件前部 `GARDEN_POST`：两个写入路由；上述业务入口不需要图形依赖。

### 测试替换范围

1. `tests/verify_robot_cockpit.cjs` 是混合测试，不可整文件删了就失去业务覆盖。保留/迁移 basicBehavior、classification、epoch、apiFailures、unknownRegistrationFocus、workbenchBehavior/Failures/Pending、mappingEvidence/WithoutCsrf/Responsive、codexIdentity/Failures/LateResponses 的业务断言；移除 WebGL、pixel、motion、space、batching、fps、frustum、拾取及回退场景。Codex 场景中的图形点击改为现有原生按钮选择。
2. 新的会话浏览器入口应真实加载 index.html/app.js，使用原有 loopback fixture、全请求记录、外部/生产网络拦截。验证初始与轮询没有消息请求；明确选择才读消息；切换 Codex 清空远端正文并禁止定位；陈旧/未知证据不触发控制请求；映射与分页仍正确；键盘选择和窄屏无横向溢出。
3. `tests/verify_garden.cjs` 保留已验收摘要、哈希失效、根域/晚响应隔离、公开发言按需与隐藏取消、复核请求、键盘和轮询焦点。其自造 HTML 当前仍含 robot-stage/robot-heading；需要与新业务节点对齐。360/574/1024px 几何断言由“stageVisible >=120”替换为真实角色/职责/摘要首屏可见，无图形节点。不要删除整个 responsive 场景。
4. `tests/test_gateway.py:227–257` 原图形 static 200 检查应转为退役 URL 精确 404、无业务调用，继续检查存活 app/garden/style 资源的字节、MIME、CSP/nosniff；路径前缀/查询/编码拒绝仍需保留。
5. 运行全部 Python unittest 和语法检查，执行会话与 garden 受控浏览器测试；workspace/execution 不改产品也应覆盖其已有测试，避免主入口错误连带影响。
6. 增加部署层负断言：完整首页不再请求 cockpit/robot3d/three，不创建 canvas/人物 DOM，代码和静态路由无活引用。历史 docs 可保留这些词，不能以全库字符串零匹配作为退役成功判据。

本轮读取中宽输出数次被截断，已对关键引用、garden 业务链、测试入口和 gateway 静态断言分段补读；未发生产品测试失败，因为本研究未执行产品测试。无跨功能事实。
