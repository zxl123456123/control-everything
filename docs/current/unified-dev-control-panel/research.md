# 本机控制面板与代码库调研

日期：2026-10-03（Asia/Shanghai）。角色：repo_researcher。按 `codebase-research` 执行，只读调研；未递归委派、启动服务、操作终端会话、修改既有产品或提交代码。

已确认目标：日常项目开发效率优先，3D 与 Jev 用来辅助理解与决策。本文提供事实，不替代高层方案、低层方案或实施批准。用户答复和未决范围见 [clarifications.md](clarifications.md)。Jev 官方身份与能力由专项调研承担。

## A. 系统边界与现有能力

### 1. 本轮工作目录

`E:/project-funny/mianban-develop` 的初始为空、非 Git 仓库由协调者在 README 留证。本轮没有应用源码、服务或可供改造的既有项目；现有资产在其它明确目录。

### 2. Terminal Workbench：最接近当前用户桌面控制台的实际产品

源码和配置根为 `D:/terminal-workbench`。现有产品包括 WezTerm、Zellij、Yazi、bottom、YASB、GlazeWM、音乐播放器/音频频谱与两个 Control 界面。`README.txt:1` 和 `config/zellij/layouts/workbench.kdl:1` 描述五个标准内页：Work-Windows、Work-for-Linux、Monitor、Music、Control。

- **Control TUI**：`apps/control-center/control_tui.py:65` 是 Textual 程序，显示 GlazeWM 工作区与程序卡片，支持窗口聚焦、拖动调度、背景图片切换。`on_mount:111` 每 8 秒轮询，读取在 `asyncio.to_thread` 内执行；仅结构签名变化时重绘并保留滚动位置。
- **Control 网页**：`apps/control-center/dashboard.html:1` 是原生 HTML/CSS/JS，显示窗口工作区、背景切换、Music 标签恢复。`refresh:126` GET `/api/state`，末尾每 5 秒轮询。网页没有项目、Git、CI、Agent 任务、服务运行或 GPU/渲染队列的数据模型。
- **Monitor**：`config/zellij/layouts/monitor.kdl:5` 直接运行 `apps/bottom/btm.exe`；`config/bottom/readable.toml:1` 保持 1 秒刷新，CPU、磁盘、内存、网络、进程五类视图。它是独立终端 UI，不经 `/api/state` 提供 JSON 数据。
- **桌面顶栏**：`config/yasb/config.yaml:20` 声明 CPU、流量、C 盘/多盘用量、时间与 GlazeWM 工作区；Search 启用开发工具、端口查看、IP 信息。没有观察到这些 widget 被 Control 后端消费。
- **远端 shell**：既有 Zellij 布局通过系统 OpenSSH 启动三个命名面板和远端 `pane.sh`；本轮不 SSH、不读取终端屏幕内容。布局和 cwd 恢复仅说明连接与工作位置，不说明 Agent 的任务状态或服务健康。

### 3. Nova Agent Studio：已有 Codex 可视化工作台资产

`E:/ai-agent` 是以 `codex/` 开源实现为二次开发基线的工作区（`AGENTS.md:3`）。`codex/apps/agent-studio` 已有 React、TypeScript、Vite、Zustand、XYFlow UI 与 Node Gateway。

- `src/components/WorkflowCanvas.tsx:1` 使用 XYFlow，实现节点、边、拖动、缩放与新增节点。
- `server/appServerClient.mjs:23` 通过子进程 `codex app-server` 的 stdio JSON-RPC 接入实际线程/turn，处理通知和 server requests。
- `src/adapters/codexGateway.ts:20` 包含账户、模型、历史、创建/恢复 session、SSE 消息、审批、停止、压缩、用户问答接口。
- `server/appServerTransport.mjs:23` 映射 thread、turn、token usage、command execution、file change、MCP、web search 等通知。
- **工作流编排仍是模拟**：`src/adapters/mockRuntime.ts:44` 按固定步骤和 650ms 延迟产出事件，`src/App.tsx:285` 调用它；`App.tsx:318` 展示 `Mock runtime`。已有节点画布和真 Codex 对话，不等于已有真正可执行的跨工具 DAG。
- 插件 catalog 为 `src/store.ts:4` 的静态条目。没有证据表明这里的启用按钮等同于 Codex Desktop 插件安装或账号级配置。

本轮仅核对源码，没有启动或探测 Studio 4173/4174，也没有运行其测试。其运行状态、与当前 Codex Desktop 所有存量线程的完整共享范围仍未知。

### 4. Natively 架构面板：另一个在开发中的项目，作为事实参考

`E:/ai-contro/123` 为 React/Electron 产品；当前包声明名 `operations-agent`、版本 `2.8.28`。其 `AGENTS.md:18` 索引动态架构面板，要求拓扑变化同步维护 manifest。本轮不改该目录，不覆盖其它聊天工作。

- `src/components/architecture/ArchitectureFlowPanel.tsx:1` 已有源码图、节点详情、提示词/模式只读检查、配置刷新、本地分类预览、真实请求观察、基线差异。
- `src/components/architecture/FlowCanvas.tsx:21` 为手写 SVG 图；教学路线动画和已观察节点高亮是两种数据来源。它不是 XYFlow，也不是3D场景。
- `src/architecture/flow-manifest.json` 声明图与源码/配置绑定；构建索引为 `scripts/architecture-flow-source-index.mjs`，通过 `virtual:architecture-flow` 导入。不能自动发现全代码库语义拓扑。
- `electron/intelligence/ArchitectureObservation.ts:37` 为租约式观察核心；`electron/ipcHandlers.ts:166` 注册窄范围观察 IPC，`electron/preload.ts:1089` 向 renderer 暴露读取/观察 API。
- 真实观察字段包括请求/尝试/阶段时间、引擎、终态、展示/历史门禁、证据数量、提示词组合摘要等；实际插点在共享聊天、WTA 和修复路径，不代表全部录音、STT、截图捕获、JIT RAG、phone 或其它分支已覆盖。
- 它服务这一产品的请求链路，不是 Codex/WezTerm 通用运行监控，不是多聊天知识脑图。对话脑图所需的议题、决定、任务、源码/提交关联没有在上述组件内观察到通用模型。

项目 `package.json` 已依赖 `three` 和 `thinking-orbs`；`src/components/ProfileIntelligenceSettings.tsx:8` 使用 `ThinkingOrb`。这证明局部视觉组件依赖，不能据此宣称已有模型导入、建模、轨道相机或 C4D 集成。

## B. 入口与主流程

### Workbench

`Start-TerminalWorkbench.cmd` → 指定工作台 WezTerm 配置 → Zellij `workbench-v4` → 标准标签布局 → shell/SSH、bottom、Music、Control 各自程序。

独立网页流程为 `control_center.py open` → 健康检查/启动本机 server → browser → GET state → GlazeWM CLI query → JSON 卡片。TUI 直接 import 同一 Python 文件的 `workspace_state` 与操作函数，不依赖网页 HTTP server。

`control_center.py:91` 读取 `workspaces` 与 `monitors`，递归收集窗口的 id/title/processName/hasFocus/displayState/state，并输出工作区名、显示器、窗口集合。这里的 workspace 是 GlazeWM 工作区，不是项目根目录或 Windows 原生虚拟桌面。

### Nova Agent Studio

React UI → `/api` HTTP/SSE → Node loopback Gateway → 常驻 stdio App Server → Codex 持久化 Thread/Turn。工作流 UI 单独使用 mock adapter。以上流程从源码与 README 相互核对，不构成现场运行验证。

### Natively

主 Settings 或浏览器 `?panel=architecture` → lazy 架构面板 → 静态 manifest/source index + bounded reader → Electron 窄 IPC → 租约观察核心 → 已接入生产路径的真实阶段。普通浏览器缺少 Electron bridge 时真实配置/观察未连接；静态图可展示。

## C. 关键模块与复用事实

| 既有资产 | 已有职责 | 可参考边界/缺口 |
| --- | --- | --- |
| Workbench `workspace_state` | GlazeWM窗口/工作区归组 | 数据只覆盖桌面受管理窗口；没有项目归属或任务语义 |
| Workbench网页/token/loopback服务 | 本地展示与窄范围桌面操作 | 现有接口并非监控总线；不能把窗口在线等同于服务健康 |
| Workbench bottom/YASB | 本机资源与端口入口 | 独立 UI/插件状态；尚无统一可消费的采样 schema |
| Workbench启动与cwd记忆 | 恢复工作位置/标准标签 | 远端任务不会因布局恢复而自动继续，README明确说明 |
| Nova XYFlow画布 | 2D节点边与交互 | UI可参考，编排执行是模拟 |
| Nova AppServer client/transport | 真实Codex线程/turn及事件转译 | 只观察其连接/管理范围；存量Desktop聊天全覆盖未知 |
| Natively manifest/source index | 从图定位源码片段和版本指纹 | 当前图人工维护，范围属于该产品 |
| Natively runtime observation contract | 有容量限制的无正文阶段事件 | Electron信任边界；无现成跨进程/跨主机接口 |
| Natively baseline model | 安全摘要与迭代差异 | 不是业务行为自动变化判断，未知仍保持未知 |

这里列出职责和边界，不决定复制、迁移或重写。具体取舍属于后续方案。

## D. 数据、状态、配置与接口

### Workbench API

`control_center.py:17` 根目录硬编码 `D:/terminal-workbench`；`PORT:29` 为8765。server `:422` 只监听127.0.0.1，Host须精确匹配本机端口。

| Method/path | 数据/操作 | 源码锚点 |
| --- | --- | --- |
| GET `/health` | 固定应用标识 | `control_center.py:314` |
| GET `/api/state` | workspaces、appearance、images；失败含warning | `control_center.py:337` |
| GET `/images/{name}` | 允许目录图片 | `control_center.py:325` |
| POST `/api/window` | 聚焦或移动GlazeWM窗口 | `control_center.py:357` |
| POST `/api/appearance` | 写appearance并touch WezTerm配置 | `control_center.py:355` |
| POST `/api/music` | 恢复/切换Music标签 | `control_center.py:359` |

POST要求进程生成的 `X-Workbench-Token`，body上限4096 bytes。图片选择限已有目录，文件30MiB和8000万像素上限。GET state 的后端失败使用HTTP200+warning，不是资源监控健康状态。Glaze query 5秒超时，操作6秒超时。

配置：`config/wezterm/wezterm.lua`、`appearance.json`；`config/zellij/config.kdl` 与 layouts；`config/bottom/readable.toml`；YASB、GlazeWM、Yazi各自文件。`Start-TerminalWorkbench.cmd:13` 设置工作台环境/路径，默认工作根 `D:/workspace-for-everything`。没有观察到统一项目注册表、历史采样数据库或远端监控凭据适配器。

### Nova Gateway

`server/index.mjs:18` loopback，默认 Gateway4174、web4173；环境变量可覆盖；`vite.config.ts` 固定本地API代理。sessions与pending approvals/user inputs为进程内Map。AppServer请求有30秒超时。

只读候选入口有`/api/health`、`/api/threads`（一次limit30，返回nextCursor）、`/api/models`。**不能把所有GET当作无副作用**：`server/index.mjs:275` 的GET `/api/threads/{id}` 先调用`thread/resume`，active writer错误才退回`thread/read(includeTurns:false)`。若后续做只读存量监控，现有此GET不可直接当无扰动采集接口。

`/api/sessions`及messages、interrupt、compact、approvals、user-inputs、account login/logout属于控制/执行接口，本轮没有调用。

### Natively observation

协议在`src/architecture/runtime-contract.mjs`：固定引擎/阶段/终态词汇、内容白名单，marker不含提问/回答/提示词正文；快照上限262144 bytes。核心最多4租约、60秒期限、32活跃+100已结束请求，每请求4尝试/每尝试24阶段，最后租约释放后清空观察。摘要是组合system/user产物，不等于最终网络提示词或云端TTFT。

基线为localStorage `architecture-flow-baselines-v1`，最多5历史/100节点/200边/256KiB。详见项目权威说明`docs/interview-assistant/architecture-flow-panel.md`。本文未独立重跑其中宣称的产品测试。

## E. 本轮实际读取与状态核验

1. `wezterm cli list --format json` exit0：只返回window0/tab0/pane0，title为wezterm，cwd空。历史inventory notes明确通用CLI曾连接独立背景mux。因此本轮结果仅代表该CLI连接的mux，不能判定活动Zellij的四远端开发面板不存在或已停止。
2. GET `http://127.0.0.1:8765/health`、GET `/api/state` 均连接拒绝。当前浏览器Control server未被本轮确认在运行；未为了调研启动它。Control TUI是独立进程，不能从该拒绝推断它也未运行。
3. `wo-x/work/inventory_data.json` 是**2026-10-03 09:21北京时间快照**：四WezTerm开发面板分别关联论文研究、workflow-for-coding、内容制作、私有服务监控；三方向共享`/srv/projects/n8n_test`。这些是历史来源，不是当前实时核验；未访问远端Uptime Kuma接口，也未确认其端口/在线状态。
4. Workbench现有最新`docs/current/workbench-usability-20261003/README.md`与`installation.md`已记三文件受控备份安装，下一自然新进程加载，真实使用验收仍待定。它比旧聊天“待安装”摘要更新。本轮读到安装后的`control_tui.py`刷新逻辑与启动器错误报告；没有复跑安装hash、测试或触发新进程，不能把源码存在当当前UI已加载。
5. 在明确的目标源码范围内搜索Jev、TypeSafe AI、C4D、Cinema4D、GLTFLoader、OrbitControls，没有命中集成代码。只检查常见Maxon目录未得到安装条目；不能据此断言本机未安装C4D。版本/渲染器/许可仍为用户待确认点。
6. `C:/Users/ZXL/Documents/Codex/2026-10-03/n/work/project_rpc.py` 已有本机AppServer stdio Python client；`create_session_projects.py` 是项目创建/绑定脚本，不是常驻控制面板。只读源码，未运行其写方法。`w`、`mei`目标目录未观察到新的面板产品源码；没有读取pane文本或私人对话全文。

工具限制与已见失败：首次rg索引包含大量vendor/venv，输出截断，之后改为精确目录/关键词并重读关键源码；不存在的Workbench scripts路径和空匹配使个别rg命令exit1，无权据此推断产品失败；CLAUDE要求graph优先，但本会话`ALL_TOOLS`未提供graph工具，记录后使用精确文件读取。HTTP拒绝原样记录，不宣称已打通实时监控。

## F. 已阅读文档清单

- 本功能README与clarifications。
- `E:/ai-agent/AGENTS.md`、`codex/AGENTS.md`、`codex/apps/agent-studio/README.md`、package与Vite配置。
- `E:/ai-contro/123/AGENTS.md`、`CLAUDE.md`、`docs/interview-assistant/architecture-flow-panel.md`，架构源码与package。
- `D:/terminal-workbench/README.txt`、当前usability README/installation、Monitor/startup调研文档相关段落；Control三产品文件与布局/配置/启动器。
- `wo-x/work/inventory_data.json`的目标项目记录与notes；`n/work/project_rpc.py`与项目绑定脚本相关段落。

## G. 不确定点清单

- **U1 当前Zellij/WezTerm实时面板归属**：通用CLI mux与活动GUI可能不同。确认方法是只读定位精确mux或Zellij会话元数据，不读取屏幕/不操作现用会话。
- **U2 Desktop存量聊天实时采集范围**：既有Nova和Python client证明有AppServer使用经验，未证明所有Desktop现用线程都能无副作用跨client订阅。需版本一致的独立只读接口探针；相关用户范围见clarifications。
- **U3 监控源与可用端口**：本机bottom/YASB是UI，Workbench8765未运行确认，远端Uptime Kuma仅历史任务记录。需要明确服务清单/采样来源后只读验证。
- **U4 Jev具体仓库与执行能力**：用户指GitHub决策模型，官方核对在research_jev.md；本机范围未见集成。不能从“决策模型”推断它能自动管理项目。
- **U5 C4D版本/渲染器/许可证/资产流程**：当前产品没有对应源码。用户安装信息未确认；不得承诺已有可自动化建模/渲染链。
- **U6 首批范围与验收指标**：开发效率主目标已定，项目数量、首批监控/脑图/3D/实验的精确范围未定，必须由后续讨论在clarifications形成完整基线。
- **U7 既有产品运行与发布状态**：源码、开发文档、已安装文件不等于正在运行/正式包能力。需未来明确目标版本并单独验收；本轮不重启其它工作。

## H. Readiness最小可核查证据

- 既有控制台入口：`D:/terminal-workbench/README.txt:1`；真实窗口数据源`apps/control-center/control_center.py:91`；网页读取`dashboard.html:126`；TUI刷新`control_tui.py:111`；Monitor布局与bottom配置。
- 既有Codex资产：`E:/ai-agent/codex/apps/agent-studio/README.md:1`、`server/appServerClient.mjs:23`、`server/index.mjs:259`；模拟工作流证据`src/App.tsx:285`与`src/adapters/mockRuntime.ts:44`；有副作用的GET证据`server/index.mjs:275`。
- 已有架构轨迹资产：`E:/ai-contro/123/src/components/architecture/ArchitectureFlowPanel.tsx:1`、`FlowCanvas.tsx:21`、`electron/intelligence/ArchitectureObservation.ts:37`、`electron/preload.ts:1089`；人工图声明和协议限制如上。
- 时间口径：`wo-x/work/inventory_data.json`的snapshot/notes是历史快照；本轮CLI/HTTP核验是当前只读观察，各自不能互换。
- **事实**：上述源码/配置/接口存在、mock路径存在、HTTP拒绝、CLI结果。
- **推断**：既有模块可能减少未来重复开发；未验证的运行覆盖和复用成本不能当事实。
- U1–U7仍未全部关闭。本文可以支持方向与布局讨论，不给“已足够直接进入实施”的readiness PASS；用户决策缺口已在clarifications，精确实现基线尚不存在。

---

## 跨功能事实（待确认）

### 架构与约束

- [2026-10-03] Terminal Workbench实际资产根为D:/terminal-workbench；GlazeWM工作区不是项目目录/Windows原生虚拟桌面，Control与资源监控具有不同数据来源。
- [2026-10-03] Nova Agent Studio已有真实Codex AppServer Gateway和XYFlow UI，但工作流执行仍为mock；其线程详情GET先resume，不宜直接视为无副作用监控读取。
- [2026-10-03] 同一个通用WezTerm CLI可连到与当前工作台不同的mux；pane列表必须保留连接范围与采样时点，避免把历史/局部结果当全局实时状态。
