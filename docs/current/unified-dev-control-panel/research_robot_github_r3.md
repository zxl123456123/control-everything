# 机器人 / 像素 / 3D 会话看板：GitHub 与渲染技术调研 r3

获取日期：2026-10-03（Asia/Shanghai）。角色：repo_researcher。本稿为可核查事实材料，不决定产品方案，不改实现。

用户范围：继续解决大量「未映射成功」，参考 GitHub 现成技术，增加机器人、像素小人或 3D 显示，同时保留真实会话功能。本轮只读取公开原作者仓库、官方文档与当前代码；未安装、启动或执行外部仓库脚本，未托管，未外发私有会话。

## A. 系统边界与现有能力

已观察到：当前系统是 Python 标准库 HTTP 网关 + 原生 JS/CSS 页面，元数据与三个只读 MCP 查询复用 `SessionService`。网页有选择 UUID、按需消息分页、刷新观察、复制 ID、证据足够时定位已有 Zellij pane；定位是现有唯一网页操作，MCP 无发送、审批、resume、终止工具。[本仓库 README](../../../README.md)

已观察到：`merge_observation()` 与 `mark_unknown()` 都把 `activity_state`、`task_completion` 设为 `unknown`。进程已观察、身份核验、终端位置是独立事实；机器人无法从这些事实推出「正在写代码」「等待审批」「项目完成」。`slot` 空值在前端显示「未映射槽位」，并不等价于会话不存在。证据陈旧或断连时会保留上次结果、使当前位置与操作失效。证据锚点：`session_panel/service.py:87,96,132`；`web/app.js:37,39,56`。

已观察到：网关当前静态白名单只有 `/`、`/app.js`、`/style.css`，CSP 为 `default-src 'self'; img-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'`。外部 CDN JS、同源图片、贴图、未列出的 vendor 文件不是即插即用；内联脚本也受默认脚本策略约束。证据锚点：`session_panel/gateway.py:63,96`。`img-src 'none'` 禁止加载图片资源，见 [MDN 官方参考](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/img-src)。

## B. 当前入口与主流程

1. 浏览器 `web/index.html` 载入同源 `app.js` / `style.css`，通过 `/api/bootstrap` 取得定位 token。
2. `/api/sessions` 查询一份共享索引；服务独立观察远端注册 / 进程与本机 Zellij 清单，再合并证据。
3. 选中 UUID 才调用 `/api/sessions/{uuid}/messages`；消息不因动画帧或元数据刷新而读取。
4. `/api/sessions/{uuid}/focus` 重新核验后仅切换已有 pane。页面可见时 10 秒刷新元数据，隐藏时暂停。

上述均为代码观察，非推断。渲染库只解决视觉与拾取，不能修复源数据身份或 pane 绑定。

## C. 关键模块与职责

| 当前模块 | 已观察到的职责 | 对可视化参考的边界 |
| --- | --- | --- |
| `session_panel/source.py` | 固定来源、版本、时限与槽位文件 | 外部 demo 自报状态不能替代此来源 |
| `session_panel/service.py` | 元数据索引、证据合并、陈旧处理、官方消息 reader | 模型未提供真实 busy/done |
| `session_panel/gateway.py` | loopback HTTP、静态白名单、Host/Origin/CSRF/CSP | 依赖/资产加载必须与真实 HTTP 约束相容 |
| `web/app.js` | 同一个选择与请求状态、分页、定位资格 | 现成 renderer 可参考；整套 store/API 并不能直接换入 |
| `web/index.html` / `style.css` | 语义按钮、状态提示、窄屏布局 | 现有键盘与文字功能是现实能力，不能由纯画布自动获得 |

## D. 原作者 GitHub 候选核查

均读取 README、LICENSE 与下列关键实现。表中的 `pushed_at` 是 GitHub API 返回的仓库时间，仅作快照事实，不据此宣称热门、成熟或持续维护。固定 SHA 使证据可重读。

| 仓库 | 本轮固定 SHA | GitHub `pushed_at`（UTC） |
| --- | --- | --- |
| [AI Agent Session Center](https://github.com/coding-by-feng/ai-agent-session-center) | `86c9e9391ae3b2ed71cb953a06f8d43040703b64` | 2026-10-01 00:02:11 |
| [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) | `3537e140c2094761beae748592aeb92ece8edfdd` | 2026-09-21 15:27:44 |
| [Agent Office Dashboard](https://github.com/masakav3/Agent-Office-Dashboard) | `ca3e5fc64ceb8092983bf8eb509afff57b3f085e` | 2026-06-07 12:57:45 |
| [VirtOffice](https://github.com/OneByJorah/VirtOffice) | `8ef3f896f45b5ea4c73c5ea81e49c701c264b5de` | 2026-09-13 17:50:06 |

### D1. AI Agent Session Center：最直接的机器人技术参考

已核事实：代码 [MIT，Kason Zhan](https://github.com/coding-by-feng/ai-agent-session-center/blob/86c9e9391ae3b2ed71cb953a06f8d43040703b64/LICENSE)。[README](https://github.com/coding-by-feng/ai-agent-session-center/blob/86c9e9391ae3b2ed71cb953a06f8d43040703b64/README.md) 列出 3D 机器人、平面列表、终端 / SSH / 队列 / resume；同时明确会话匹配使用启发式，同 cwd 可能串联。

关键实现：

- [robot3DGeometry.ts](https://github.com/coding-by-feng/ai-agent-session-center/blob/86c9e9391ae3b2ed71cb953a06f8d43040703b64/src/lib/robot3DGeometry.ts#L23) 使用 Box / Cylinder / Sphere 几何体与材质拼机器人，可参考程序化建模，避免取得第三方角色贴图。
- [Robot3DModel.tsx](https://github.com/coding-by-feng/ai-agent-session-center/blob/86c9e9391ae3b2ed71cb953a06f8d43040703b64/src/components/3d/Robot3DModel.tsx#L10)、[CyberdromeScene.tsx](https://github.com/coding-by-feng/ai-agent-session-center/blob/86c9e9391ae3b2ed71cb953a06f8d43040703b64/src/components/3d/CyberdromeScene.tsx#L10) 依赖 React Three Fiber / drei / Zustand；不是原生 JS 可直接挂载的独立组件。
- [robotStateMap.ts:36](https://github.com/coding-by-feng/ai-agent-session-center/blob/86c9e9391ae3b2ed71cb953a06f8d43040703b64/src/lib/robotStateMap.ts#L35) 未知状态默认 `idle`，不符合本系统的 unknown 语义。
- [cli.js:42](https://github.com/coding-by-feng/ai-agent-session-center/blob/86c9e9391ae3b2ed71cb953a06f8d43040703b64/bin/cli.js#L42) 首跑进入向导；[setup-wizard.js:274](https://github.com/coding-by-feng/ai-agent-session-center/blob/86c9e9391ae3b2ed71cb953a06f8d43040703b64/hooks/setup-wizard.js#L274) 执行 hooks 安装。不能把默认 `npx` 当作纯只读浏览。

参考价值 / 代价（推断）：几何构成、动画与 3D/DOM 分离有直接参考价值；整个产品的 Node、React、PTY、数据库和控制链不能原样适配现有 HTTP 查询，且发送 / 自动排队 / resume 超出本轮既有只读权限。2D 列表是 README 能力，自动无 GPU 降级路径本轮未核实（U2）。

### D2. Pixel Agents：真实事件与 Canvas 2D 像素角色

`pablodelucca/pixel-agents` 本轮打开后重定向到上述上游。代码 [MIT，Pablo De Lucca](https://github.com/pixel-agents-hq/pixel-agents/blob/3537e140c2094761beae748592aeb92ece8edfdd/LICENSE)。[README](https://github.com/pixel-agents-hq/pixel-agents/blob/3537e140c2094761beae748592aeb92ece8edfdd/README.md) 描述 React + Canvas 2D 办公室、子 agent、布局编辑，以及 hooks 主路径 / JSONL 启发式回退。

关键实现：

- [provider.ts](https://github.com/pixel-agents-hq/pixel-agents/blob/3537e140c2094761beae748592aeb92ece8edfdd/core/src/provider.ts#L14) 将 `toolStart`、`toolEnd`、`turnEnd`、`permissionRequest` 分开；当前实际 provider 为 Claude。
- [claude.ts:137–238](https://github.com/pixel-agents-hq/pixel-agents/blob/3537e140c2094761beae748592aeb92ece8edfdd/server/src/providers/hook/claude/claude.ts#L137) 映射 Pre/PostToolUse、Stop、Notification、SessionStart/End 等；`Stop` 表示 turnEnd，idle_prompt 另带 awaitingInput。
- [gameLoop.ts](https://github.com/pixel-agents-hq/pixel-agents/blob/3537e140c2094761beae748592aeb92ece8edfdd/webview-ui/src/office/engine/gameLoop.ts#L9) 明确取得 `2d` context、关闭像素平滑、可停止 requestAnimationFrame 循环。

参考价值 / 代价（推断）：Canvas 像素绘制与事件分层能参考，渲染不要求 WebGL；本系统没有这些 hooks 的活动事件，不能凭注册 / 历史消息制作同样的工作动画。整体 Fastify / WebSocket / React 不是现有依赖。资产 README 有来源说明，未逐件核定素材许可证（U3）；MIT 代码许可不替代每件素材来源核查。

### D3. Agent Office Dashboard：原生 Three.js 与同源离线依赖

代码 [MIT，MATYPE](https://github.com/masakav3/Agent-Office-Dashboard/blob/ca3e5fc64ceb8092983bf8eb509afff57b3f085e/LICENSE)。[README](https://github.com/masakav3/Agent-Office-Dashboard/blob/ca3e5fc64ceb8092983bf8eb509afff57b3f085e/README.md) 说明 Flask + 文件存储 + hooks，以会话为房间，本地 vendor Three r160；3D 资产来自 Kenney CC0，旧首页残留图片需另审。

关键实现：

- [office3d.html:118](https://github.com/masakav3/Agent-Office-Dashboard/blob/ca3e5fc64ceb8092983bf8eb509afff57b3f085e/frontend/office3d.html#L118) import map 只指向同源 vendor；[office3d.js:4–59](https://github.com/masakav3/Agent-Office-Dashboard/blob/ca3e5fc64ceb8092983bf8eb509afff57b3f085e/frontend/office3d.js#L4) 为原生 Three.js、OrthographicCamera、OrbitControls、GLTFLoader。
- [office3d.js:1623](https://github.com/masakav3/Agent-Office-Dashboard/blob/ca3e5fc64ceb8092983bf8eb509afff57b3f085e/frontend/office3d.js#L1623) 轮询 `/cc/rooms`；`?rooms=N` 是明确标注的合成演示。捕获异常后静默重试，未在此处把旧数据变为未知。
- [cc_state_push.py:220](https://github.com/masakav3/Agent-Office-Dashboard/blob/ca3e5fc64ceb8092983bf8eb509afff57b3f085e/hooks/cc_state_push.py#L220) 通过 hooks 推送状态；Stop 写 idle 并给完成字样，无法证明项目完成。

参考价值 / 代价（推断）：这四个候选里，原生 JS renderer 与 Python HTTP 结构最接近当前项目；只读元数据仍需独立映射，不能连带接入它的推送、天气 / 位置等额外服务。GLTF、阴影与 bloom 带来资产路由、加载预算、GPU 成本。其静默错误策略与现有证据过期策略不一致。Kenney 原作者 [Mini Characters](https://kenney.nl/assets/mini-characters) 页面确认 CC0，但本轮未逐件比对仓库资产（U3）。

### D4. VirtOffice：标准库 HTTP 兼容，但含 demo 与推算状态

代码 [MIT，Jhonattan L. Jimenez](https://github.com/OneByJorah/VirtOffice/blob/8ef3f896f45b5ea4c73c5ea81e49c701c264b5de/LICENSE)。[README](https://github.com/OneByJorah/VirtOffice/blob/8ef3f896f45b5ea4c73c5ea81e49c701c264b5de/README.md) 描述 Python 标准库、Three.js、SSE / polling / webhook 与 Hermes bridge。

关键实现：

- [office.html:579](https://github.com/OneByJorah/VirtOffice/blob/8ef3f896f45b5ea4c73c5ea81e49c701c264b5de/public/office.html#L579) 运行时从 cdnjs 取 Three r128；[662–692](https://github.com/OneByJorah/VirtOffice/blob/8ef3f896f45b5ea4c73c5ea81e49c701c264b5de/public/office.html#L662) 轮询 `/api/agents` 与 SSE。
- [server.py:188](https://github.com/OneByJorah/VirtOffice/blob/8ef3f896f45b5ea4c73c5ea81e49c701c264b5de/server.py#L188) 来源失败 / 无 JSON 时使用 DEMO_AGENTS；[office.html:622](https://github.com/OneByJorah/VirtOffice/blob/8ef3f896f45b5ea4c73c5ea81e49c701c264b5de/public/office.html#L622) 缺统计时填随机计数。
- [hermes_bridge.py:192–290](https://github.com/OneByJorah/VirtOffice/blob/8ef3f896f45b5ea4c73c5ea81e49c701c264b5de/scripts/hermes_bridge.py#L192) 用标题关键字归属 agent、结束后的近期会话仍推作 working，tasksDone 为文件 / 活动 / 会话数的组合估算。

参考价值 / 代价（推断）：原生页面 / 标准库服务可供阅读参考；demo 回退、随机统计、按时间 / 标题推活动的逻辑与当前真实性约束不相容。CDN、内联 JS 与现有 CSP 不相容。不会因它能动起来就把外部 demo 当作本项目真实会话。

### D5. 筛查后不列为优先的像素项目

[Star Office UI 原作者仓库](https://github.com/ringhyacinth/Star-Office-UI) 读取到固定 SHA `f29c107e9728a72f2635f10b4e8203b29b37221d`。其 [LICENSE](https://github.com/ringhyacinth/Star-Office-UI/blob/f29c107e9728a72f2635f10b4e8203b29b37221d/LICENSE) 明确代码 MIT，仓库美术资产仅非商用。已读前端 Phaser.AUTO、`/status` / `/agents` 读取、后端 `/set_state` / `/agent-push`；[backend/app.py:154](https://github.com/ringhyacinth/Star-Office-UI/blob/f29c107e9728a72f2635f10b4e8203b29b37221d/backend/app.py#L154) 状态超时自动改 idle；实现默认 300 秒，注释仍写 25 秒。它是状态上报系统，无法仅靠目前的只读身份事实恢复工作活动。资产限制与 auto-idle 的语义代价已核实，不作为素材直接复制来源。

其他搜索命中 `office-for-claude-agents` 等 fork；未执行逐件许可 / 实现核查，未把它们纳入适配结论。搜索排名 / 名称不作为维护或正确性证据。

## E. 成熟渲染库与官方做法

以下是能力 / 代价事实，非本轮选型。

| 库与许可证 | 已核能力 | 与当前边界的关系 / 代价（推断） |
| --- | --- | --- |
| [Three.js，MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE) | [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) 现依赖 WebGL2，r163 起不支持 WebGL1；[WebGL addon](https://threejs.org/docs/pages/WebGL.html) 有支持检测；[OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) 官方 addon 提供绕目标旋转、缩放、平移 | 可程序化搭机器人；无 WebGL2 时不会自动变成 Canvas 2D 机器人。WebGPURenderer 回退也是 WebGL2，不是无 GPU 回退。当前机器 / Edge 支持待 U1 核实 |
| [Phaser 3.80.1，MIT](https://github.com/phaserjs/phaser/blob/v3.80.1/LICENSE.md) | [官方教程](https://docs.phaser.io/phaser/getting-started/making-your-first-phaser-game) 的 AUTO 先 WebGL 后 Canvas；[固定版 CreateRenderer](https://github.com/phaserjs/phaser/blob/v3.80.1/src/core/CreateRenderer.js#L28) 确认此能力，与实际 build 是否包含两种 renderer 有关；关闭平滑能显示像素精灵 | 适合 2D sprites / 场景动画，并非完整 3D；引入整套游戏引擎是否划算仍需按画面范围判断，不能假定每个 WebGL 特效都有 Canvas 等价 |
| [PixiJS 8.16.0，MIT](https://github.com/pixijs/pixijs/blob/v8.16.0/LICENSE) | [官方 8.16.0 发布说明](https://pixijs.com/blog/8.16.0) 声明 Canvas 回归且实验性；[固定版 autoDetectRenderer](https://github.com/pixijs/pixijs/blob/v8.16.0/src/rendering/renderers/autoDetectRenderer.ts#L24) 的顺序含 webgl / webgpu / canvas；[可访问性模块](https://pixijs.com/8.x/guides/components/accessibility) 通过显式启用的 DOM overlay 提供键盘与读屏语义 | 可提供较轻的 2D scene graph；Canvas 覆盖仍是实验状态。官方 renderer guide 仍写 Coming-soon，与发布说明不一致：本轮以固定代码确认能力，但不据此保证所有效果与打包形式均回退（U4） |

离线依赖：Three [官方安装说明](https://threejs.org/manual/pages/installation.html) 有构建与 CDN 两条路径，addons 需显式导入，核心与 addons 版本不能混用，CDN 中断会影响页面。已观察到 masakav3 项目实际采用同源 vendor。由此推断本项目如使用依赖，需要可审阅的本地文件 / 构建产物及对应静态路由；仅粘贴官方 CDN 例子不会满足现有离线与 CSP 约束。具体 bundle、版本、体积尚未做实现核验。

无 GPU / WebGL 失败：官方 Three capability 检测只能辨认 WebGL2 支持，无法保证驱动 / 上下文永不丢失；Canvas 2D 或语义 DOM 的存在是另一条渲染能力。四个项目的 3D 都没有被本轮在本机安装运行，因此没有本机性能或恢复证据。

可访问性与动画：MDN [canvas 官方参考](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas#accessibility) 指出画布不自动暴露所绘对象语义；当前 DOM 列表的键盘选择 / 文字证据不能由 3D 自动取代。MDN [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) 可检测系统减少运动偏好；[W3C WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide) 对与正文并行且自动持续的非必要动画说明暂停 / 停止 / 隐藏控制。父任务实现时需核验真实交互；调研未声称候选整体满足 WCAG。

## F. 已阅读材料与来源记录

本仓库：`README.md`、`web/index.html`、`web/app.js`、`web/style.css`、`session_panel/gateway.py`、`session_panel/source.py`、`session_panel/service.py` 的相关实现。

公开来源：上述五仓库 README / LICENSE，固定 SHA 的关键源文件与 GitHub API repo/tree 元数据；Three、Phaser、PixiJS 官方文档 / 固定源码；Kenney 原作者资产页面；MDN、W3C 官方参考。引用就近列在相应事实旁。公开源码只在内存阅读，没有引入项目或执行；没有复制未核许可代码 / 素材。

检索式包括 `site:github.com pixel agents office claude code license`、`site:github.com 3d agent dashboard office Three.js`、`site:github.com Star Office UI agent pixel license` 及官方域名渲染 / 降级查询。首批搜索包含非原作者 fork，随后改读原作者仓库；不使用非原作者摘要作最终事实依据。

本轮失败 / 局限留痕：

- 第一次公开源码抽取的换行模式错误，输出大段源码并被工具截断；后续使用正确 `\r?\n` 与窄行区间重新获取所引用事实。
- 一次 Star Office 匹配模式的 PowerShell 单引号转义导致 ParserError，退出码 1；已去掉模式内引号并重跑，读取输出退出码 0。
- 一次单区间 PowerShell 数组展开导致对应区间空输出；已改显式 `lo/hi` 后重读 masakav3 的轮询 / hook / import map 和 Star 超时逻辑。
- `git status --short` 在此 cwd 返回「not a git repository」；同一命令后续 Test-Path 导致整条 shell 退出码 0，不能把该退出码当 Git 成功。本 agent 未初始化 Git、提交、推送或碰其他文件。
- 未运行外部候选，不提供性能、端到端功能或本机 WebGL 成功结论；未核定源仓库性能 / 测试数量等 README 自报指标。

## G. 不确定点清单

| 编号 | 尚未核定 | 如何关闭 / 是否阻塞当前材料 |
| --- | --- | --- |
| U1 | 用户实际浏览器的 WebGL2、GPU、上下文恢复与帧率 | 父任务本机 capability / 失效 / 小窗口核验；不阻塞调研，但阻塞保证 3D 可用 |
| U2 | AI Agent Session Center 的 2D 是否能自动接住 renderer 初始化错误 | 已核 README 平面列表，未核完整 fallback 调用链；采用时查调用路径 / 本机禁用 GPU，不把 README 当功能验收 |
| U3 | Pixel Agents 每件 sprite 与 masakav3 每件模型的来源 / 许可完整性 | 如复制具体资产逐件审 LICENSE / notices / 原作者；目前仅允许思路参考，不阻塞程序化几何参考 |
| U4 | Pixi Canvas 8.16.0 在具体 bundle 与所用效果上的完整回退 | 已核固定源码存在 Canvas；官方 guide 与发布说明冲突。若选用再核 bundle 与禁用 WebGL 测试 |
| U5 | 当前大量未映射的每条原因与新鲜观察状态 | 由并行绑定调研 / 真实观察确认；本稿只描述真实代码，不靠视觉渲染推断 pane |

这些是技术核验项，本阶段没有阻塞调研、需要用户拍板的问题。没有把未关闭项暗示为 readiness PASS。

## H. 给 readiness reviewer 的最小可核查证据

1. 真实语义：`session_panel/service.py:87,96,132`、`web/app.js:37,39,56`；确认 unknown、UUID、证据年龄、唯一绑定资格。
2. 静态现实：`session_panel/gateway.py:63,96`；确认新依赖 / 图片 / 内联脚本与现策略的相容性。
3. 最贴题源码：AI Agent Session Center `robot3DGeometry.ts:23`、`robotStateMap.ts:35`、`CyberdromeScene.tsx:10`；区分可参考几何、依赖与未知状态陷阱。
4. 原生 JS 参考：Agent Office Dashboard `office3d.html:118`、`office3d.js:4,38,51,59,1623`；区分 renderer 与 hook 数据层。
5. 像素降级事实：Pixel Agents `gameLoop.ts:9`、Phaser 3.80.1 `CreateRenderer.js:28`；确认 Canvas 存在，不把 2D 当 3D 无损回退。
6. 未采纳语义：VirtOffice `server.py:188` / `hermes_bridge.py:192`、Star `backend/app.py:154`；避免 demo、随机统计、标题 / 时间估算与 auto-idle 冒充证据。

已观察到的事实集中在实现 / 许可 / 接口能力；适配价值与代价明确标作推断。仍开放 U1–U5；本稿不授权新控制链，也不以完成动画代替项目完成判断。

无新增跨功能事实：固定来源、CSP、unknown 语义与现有文档已经一致，未重复提出写入全局规则。
