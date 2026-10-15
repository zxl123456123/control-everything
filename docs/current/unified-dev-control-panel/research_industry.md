# 官方工具能力与接入边界调研

调研时间：2026-10-03。依据 [README.md](README.md) 中用户原话，及本轮澄清：**日常项目开发效率优先，3D 和 Jev 用来辅助理解与决策**。本文件记录已阅读的一手资料与未知项，不是正式架构方案，不表示本机已接入这些能力。

## A. 系统边界与现有能力

| 能力范围 | 官方资料可以证明的能力 | 不能据此承诺的能力 |
| --- | --- | --- |
| Codex | CLI/SDK 可运行任务；app-server 有线程、轮次、审批、事件接口 | 新面板能完整接管本机 Desktop 任意运行中聊天 |
| WezTerm | 列举所连接实例的窗口/标签/pane，读取文本，向目标 pane 发送输入 | pane 文本可准确代替 agent 内部状态；自动识别嵌套 Zellij pane |
| 浏览器 3D | 加载 glTF、环绕/缩放/平移、拾取模型 | 完整替代 Cinema 4D 建模；原样呈现 Redshift 最终成片 |
| Cinema 4D | 官方内置 MCP 文档、Python SDK、headless 脚本、命令行渲染 | 本机已安装版本有内置 MCP；GUI MCP 可直接承担 headless 渲染 |
| 对话脑图 | React Flow 支持节点、连线、交互、动态图 | 自动还原全部对话关系、证明节点语义正确、直接执行工作流 |
| 项目监控 | OpenTelemetry 支持 metrics/logs/traces 与上下文关联 | 零接入即可看到所有项目、所有主机、所有商业软件内部状态 |
| Jev | 专项报告已核实 TypeSafe Jev 官方能力；详见 [research_jev.md](research_jev.md) | 具体用户所指仓库仍待对应；专项能力和限制以专项报告为准 |

## B. 入口与主流程

### Codex：任务事件与现有桌面聊天是两个需要分别验证的入口

- `codex exec --json` 在非交互运行时输出 JSONL，事件包含线程/轮次开始、成功或失败，以及消息、命令、文件变更、工具调用等 item。可采集该次任务执行证据；不能据此推断 Desktop 所有聊天都产生同一外部事件流。[Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- TypeScript SDK 面向服务端 Node.js，支持启动、继续、按线程 ID 恢复本地线程；Python SDK 控制本地 app-server。官方将 SDK 定位于自动化任务，将 app-server 定位于完整客户端集成。[Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)
- app-server 支持 JSON-RPC、stdio JSONL，以及标为实验性的 WebSocket 传输；有线程列表/读取、运行状态、轮次开始/引导/中断与增量消息接口。`thread/loaded/list` 是**所连接服务器内存中的线程**，存储历史不等于全部进程的实时状态。默认 `thread/list` 来源过滤也要检查。生成的 schema 与运行的 Codex 版本对应。[Codex App Server](https://learn.chatgpt.com/docs/app-server)
- 官网介绍 Desktop 能管理并行项目、聊天与文件，但本轮未从公开说明得到“任意外部网页可连接正在运行的 Desktop 并完全控制所有会话”的保证。此处应写为**待验证的本机能力边界**，而不是“完全不能”或“肯定能”。[ChatGPT desktop app](https://learn.chatgpt.com/docs/app)

### WezTerm 与 Zellij：两套独立对象标识

- `wezterm cli list --format json` 返回所管理 pane 的 window/tab/pane ID、workspace、尺寸、标题与 cwd。[WezTerm list](https://wezterm.org/cli/cli/list.html)
- CLI 连接运行中的 GUI 或 mux 实例，实例选择受 `--prefer-mux`、socket 环境变量、GUI class 影响；不指定 pane 时可能落到环境变量或最近交互的焦点 pane。因此 pane ID 和实例归属是实际执行证据的一部分。[WezTerm CLI](https://wezterm.org/cli/cli/index.html)
- `send-text --pane-id` 含义是向 pane 输入文本，默认按粘贴发送。它本身不证明 shell 已执行、命令退出或 agent 任务完成。[WezTerm send-text](https://wezterm.org/cli/cli/send-text.html)
- Zellij 有独立的 session、tab、`terminal_N`/`plugin_N` pane；当前官方文档提供 `list-panes --json`、`dump-screen`、`subscribe --format json`、定向输入与直接启动命令。订阅主要是**渲染后的终端视口变化**，不等于进程原始 stdout 或 Codex 语义事件。[Zellij Programmatic Control](https://zellij.dev/documentation/programmatic-control.html)
- 如果 Zellij 运行在一个 WezTerm pane 内，外层 pane ID 不等于内部 Zellij pane ID，单用 WezTerm list 无法证明全部内层任务已枚举。（推断，基于两套独立对象模型；须与本机终端拓扑核对。）

### 浏览器 3D：现成查看能力

- Three.js `GLTFLoader` 加载 glTF 2.0，结果包含 scene、cameras 与 animation clips；压缩/扩展的支持有明确配置边界。[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- `OrbitControls` 有环绕、缩放、平移、自动旋转与阻尼；这是用户所说“3D 环绕”的现成相机能力。[OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)
- `Raycaster` 是 3D 拾取入口，模型对象可被点选并关联其资料。[Raycaster](https://threejs.org/docs/pages/Raycaster.html)
- 这些文档证明查看和交互基础，不证明真实模型已制作、坐标/材料已适配或能获得 Cinema 4D 级渲染。让对象对应实际项目、任务或资产信息具有辅助定位的可能作用；价值仍需项目情境验证。（推断）

### Cinema 4D：官方 GUI MCP、SDK 与渲染入口

**值得先核对的现成入口：官方内置 MCP。** 当前官方帮助描述内置 MCP server，明确提到 OpenAI Codex 等支持 MCP 的客户端；可以读取和操作打开的文档，并按工具组开放能力。[Cinema 4D MCP](https://help.maxon.net/c4d/2026/en-us/Content/html/MCPADAPTERPREFS.html)

Toolset 页面列出 Rendering、Document、Transforms、Modeling、Animation、Node Graphs、MoGraph、Assets 等能力组；这些是控制面板关联建模操作的官方能力依据。[MCP Toolset](https://help.maxon.net/c4d/en-us/Content/html/MCPADAPTERPREFS-MCPADAPTERPREFS_GROUP_TOOLSET.html)

但 FAQ 明确：内置 MCP 只在完整 Cinema 4D GUI 应用运行，Commandline、Team Render、c4dpy、Cineware、Lite 不运行它。官方支持的是连接，模型的正确性由客户端与模型决定；会话不会自动获得全场景视觉，截图/渲染需调用相应能力。[MCP Server FAQ](https://help.maxon.net/c4d/en-us/Content/html/MCP_Server_FAQ.html)

**版本证据限制：** 上述主介绍 URL 含 `2026`，但正文末尾也出现“在 Cinema 4D 2027 场景中复现”的描述。因此它证明当前官方资料存在此功能，不能证明每个 2026 小版本或用户本机支持。应核对本机安装版本、该版本帮助、Preferences/MCP 和实际工具列表；本轮未启动 C4D、未更改客户端配置。

- 已实际打开 **Cinema 4D 2026.2.0 Python SDK**，其中有对象、文档、GUI、插件、渲染等模块；这是核实到的版本，不宣称为最新版本。[2026.2.0 SDK](https://developers.maxon.net/docs/py/2026_2_0/index.html)
- `c4dpy` 是随 C4D 提供的 headless 实例，可读写文件、构造场景、渲染及运行插件；不能执行依赖 GUI 的对话框/视口读取。第一次运行需要许可登录，Script Manager 的全局 `doc`/`op` 不能直接假定存在。[c4dpy Manual](https://developers.maxon.net/docs/py/2026_2_0/manuals/manual_py_c4dpy.html)
- Commandline 可按 `.c4d` 场景渲染，并覆盖 take、帧范围、输出位置/格式、分辨率和渲染器；`g_logfile` 提供进度日志。文档证明 headless 渲染入口，不证明队列、重试、断点恢复和产物验收已由它包办。[Cinema 4D and the Command Line](https://help.maxon.net/c4d/2026/en-us/Content/html/52193.html)
- Maxon 2026-04-30 支持页说明：已有 C4D/Maxon One seat 可涵盖工作站偶发命令行渲染；专用多节点 headless farm 的并发与许可另行配置，调度由 render farm manager 承担。[Command Line render license](https://support.maxon.net/hc/en-us/articles/15340240145180-When-do-I-need-and-how-do-I-purchase-a-Command-Line-render-license)
- Redshift GPU 按机器/节点授权；额外 Team Render/Commandline 节点需各自 GPU 许可，CPU 与 GPU 权益不同。当前账号、客户端、GPU 与并发权利未检查，不能承诺无人值守 GPU 渲染现成可用。[Redshift GPU & CPU licensing](https://support.maxon.net/hc/en-us/articles/23810462477852-Understanding-how-Redshift-GPU-CPU-licenses-work-with-your-personal-workstation-and-render-farm-nodes)

### C4D → 网页资产：GLB 与最终成片边界

官方导出支持几何、相机、纹理和动画；但材料概念不同会导致外观差异，Standard/Physical node materials 不支持，灯光不支持导入/导出，部分 joint/PLA 情况有限制。Redshift 仅映射文档列出的材料通道，官方再次明确视觉结果会不同。**“导出 GLB”不能作为“保留 C4D/Redshift 原始成片质量”的证据。**[glTF Export Settings](https://help.maxon.net/c4d/2026/en-us/Content/html/FGLTFEXPORTER.html)

因此模型交互预览与 C4D 实际渲染图/视频是不同产物；将二者关联同一个真实资产，可分别帮助检查结构和验收视觉效果。（推断；不是已落实的产物流程。）

### 对话脑图与动态图：React Flow

官方 Mind Map 教程已有编辑节点、拖拽新建、连线及 nodes/edges 状态模型；可作为对话关系图的 UI 基础，不必从零实现画布交互。[Mind Map App](https://reactflow.dev/learn/tutorials/mind-map-app-with-react-flow)

官方动态边示例支持 SVG 沿路径移动，以及 Web Animations API 对节点沿边路径动画。它证明动画表现能力，不证明某条边代表真实正在执行的工作。[Animating Edges](https://reactflow.dev/examples/edges/animating-edges)

对话内容如何变成“问题—决策—任务—证据”的关系仍需定义。动画跟随真实任务状态，脑图保留来源锚点，有辅助理解与回溯的可能价值；动画自动播放本身不能证明项目效率提升。（推断）

### 监控：OpenTelemetry 与执行关联

OpenTelemetry 将 traces 定义为请求路径、metrics 定义为运行时测量、logs 定义为事件记录；这三类数据回答的不是同一个问题。[Signals](https://opentelemetry.io/docs/concepts/signals/)

上下文传播以 trace/span 标识关联跨进程/服务执行，SDK 可向日志注入这些标识；可帮助从“耗时异常”回溯到执行跨度与相关日志。已有自动 instrumentation 能覆盖一部分调用，缺少支持时需显式传播。[Context propagation](https://opentelemetry.io/docs/concepts/context-propagation/)

Collector 的职责是接收、处理、导出遥测到观测后端；它不是可视化面板或作业调度器。官方也说明小规模开发环境可直接导出到后端，不一定必须引入 Collector。[Collector](https://opentelemetry.io/docs/collector/)

把一次构建/测试/AI/渲染任务的真实 ID、退出结果和产物关联到日志与耗时，可能帮助回答“哪个项目卡住、为什么、下一步该做什么”。现有 Codex、终端、C4D 是否提供足够字段仍待核对；OTel 不能凭空看见未接入的数据。（推断）

### 网页与本机执行边界

官方 Codex TypeScript SDK 要求服务端运行；本机进程调用是 Node.js 的 `node:child_process` 等宿主能力。把 Three.js/React Flow 放进浏览器，不能顺带赋予网页直接执行 shell 的能力；还须有明确宿主与授权执行入口。[Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)、[Node.js child_process](https://nodejs.org/api/child_process.html)

## C. 现成模块与职责对应（事实清单）

| 现成模块 | 文档中的职责 | 与用户目标对应的潜在用途（推断） |
| --- | --- | --- |
| Codex CLI JSONL / SDK / app-server | 执行任务、管理线程、提供事件 | 获取可核对的任务进度和结果 |
| WezTerm / Zellij CLI | 查询会话与 pane、读取终端、定向输入 | 减少定位运行任务和切换终端的时间 |
| Three.js loader / controls / picking | 载入、浏览、拾取 3D 资产 | 检查模型、关联项目实体与资料 |
| C4D GUI MCP / Python SDK / Commandline | 场景操作、脚本、最终渲染 | 场景批处理、参数校验、可追溯渲染 |
| React Flow | 节点连线、编辑与动画 | 追踪问题、决策、任务、证据关系 |
| OpenTelemetry | 采集与关联观测信号 | 从异常监控回溯到具体执行 |

这张表只登记可复用入口，不构成采用决定；实际选择需要代码库事实、本机版本和用户开发路径共同支撑。

## F. 阅读方式与抓取限制

上文均是官方页面直接链接，已实际打开相关页并读取正文。Maxon 页面带大量导航，部分 web 抓取超时或检索未定位正文，随后以 `Invoke-WebRequest` 获取同一官方 URL 并提取正文核对；其中 C4D glTF 限制、命令行参数与 MCP/headless 边界已读到原文。

OpenAI `.md` 页面抓取返回 unsupported content-type，改读对应 HTML 正文；React Flow 最初的短路径不可访问，改从官网导航进入正确教程。尝试读取 Maxon `2026_3_0` SDK 索引失败，因此只记录实际读取的 `2026_2_0`，不宣称已验证最新版本。没有以搜索摘要代替关键能力依据。

## G. 不确定点清单

- **U1 Jev 仓库对应**：用户已补充“jev就是github上目前比较火的，决策模型”。[research_jev.md](research_jev.md) 已核实最匹配候选 TypeSafe Jev 的官方能力；具体用户所指仓库仍待对应，不能仅由名称相似直接等同。能力、API、执行及数据边界引用专项报告，不在本文重复展开。
- **U2 Desktop 接入范围**：用户本机 Codex 版本、开放端点/认证、不同进程实时订阅和历史可见范围未验证。需要版本核对及只读查询；读取本地历史不能替代实时线程控制证明。
- **U3 终端拓扑/版本**：WezTerm pane 是否承载 Zellij、其版本是否具有当前文档描述的 JSON/订阅命令，需本机 `--version`/`--help` 及会话查询证据。
- **U4 C4D 可用性**：本机安装版本、内置 MCP 是否存在、可供工具组、SDK 匹配版本、许可与 GPU 均未知。只读核对优先，测试写场景应使用授权测试文档。
- **U5 实际 3D 资产**：已有 `.c4d`、GLB、贴图、渲染产物与网页效果需求未核实，无法确定导出适配成本。
- **U6 监控覆盖**：哪些项目/进程已产生 metrics/logs/traces、历史保留位置、执行 ID 与指标来源未知；“所有监控”需要变成可列举的覆盖清单。

以上需要用户拍板的信息由 coordinator 统一写入 `clarifications.md`；本文件不将未知项视为已关闭。

## H. 最小可核查证据与阶段结论

- Codex：核查 Non-interactive 页的 JSONL 事件、SDK 页的 server-side 要求、App Server 页的 thread/list 与 loaded/thread/status。
- 终端：核查 WezTerm list/send-text/CLI 的实例与 pane 语义，Zellij Programmatic Control 的独立 session/pane 与渲染视口订阅。
- 3D/C4D：核查 GLTFLoader/OrbitControls，以及 C4D glTF 限制、MCP FAQ 的 GUI 限制、Commandline 与许可页面。
- 脑图/观测：核查 React Flow 的节点/边示例与 OTel 的信号/上下文关联；图形变化与真实任务语义应分别证实。
- **已观察到**：上述官方入口和限制存在。**尚未观察到**：本机这些入口都已工作、桌面会话都可控制、完整控制面板带来效率收益。U1–U6 未全部关闭，不能仅凭行业调研判定可直接进入低层方案实施。

## 跨功能事实（待确认）

### 架构与约束

- [2026-10-03] 官方接入文档与实际安装版本需要分别核对；存在公开能力说明不代表本机端点、工具组或许可证已可用。
- [2026-10-03] 终端视口、agent 语义事件与进程退出结果是不同证据，不能相互替代。
- [2026-10-03] Web 交互模型与 C4D 最终渲染是不同产物；模型导出格式不保证离线渲染质量一致。
