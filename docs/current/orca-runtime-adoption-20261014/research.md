# Orca 运行时、展示与小院的定向调研

日期：2026-10-14（Asia/Shanghai）；角色：repo_researcher；受众：共享。  
状态：源码调研输入；未安装、构建或启动 Orca，未执行真实 Agent，未进入 Readiness。  
上游固定快照：`aceebea0a4453f63d759af9134503220ce0b4753`，该快照 package 版本 `1.4.214`。以下上游链接均固定此 SHA。

## A. 系统边界与已观察能力

现有面板没有调用 Orca runtime；`ExecutionService` 与 `CodexRun` 是 Python 自研执行链。Orca 已有独立 Node 运行时、CLI、配对 RPC 和独立 Web client，因此“完整运行时＋完整客户端”的复用存在源码入口；这不证明本机兼容，也不等于稳定公开 SDK。

| 对象 | 本轮观察事实 | 不能据此宣称 |
|---|---|---|
| 个人面板 | Python 管项目、任务与人工记录；原生 JS 调同源 `/api/workspace` | 已复用 Orca 的执行或 React 组件 |
| 自研 M3 | Windows 所属进程、Codex app-server、审批与取消代码已写入 | 已做真实模型验收；旧交接明确未验收 |
| Orca runtime | Node entry 构造桌面同一个 `OrcaRuntimeService`，有 RPC/PTY | 所有桌面能力都可用；浏览器自动化有额外运行依赖 |
| Orca Web | 单独 Vite 构建，配对后加载完整 React App | 一个可直接复制到现有原生 JS 的独立聊天组件 |
| 像素小院 | 同主 Thread 的产物与独立复核账本 | Agent 执行调度器或 Orca 状态源 |

本轮不读取用户认证文件、私人会话正文或旧账本数据，不启动已有 CLI，也不改变监听、防火墙或全局配置。PATH 未发现 Orca、原 8766/8770 连接被拒绝是上一轮实测，不是本轮重复探测。

## B. 入口与主流程

### B1. 运行时入口及监听差异

- [官方 Remote Servers](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/docs/site/content/docs/remote-servers.mdx)说明 `orca serve` 前台运行、Ctrl-C 结束、默认选择 orcad、必要时 Electron fallback。`--pairing-address` 仅告诉客户端连接哪个地址。
- [serve-orcad-launch.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/cli/runtime/serve-orcad-launch.ts)实际将 CLI serve 转为 Node 子进程，并在 `orcadServeArgs` 固定加入 `--bind 0.0.0.0`；注释说明 Electron serve 同样默认网络暴露。
- **因此 `orca serve --pairing-address 127.0.0.1` 不能保证 loopback-only。** 默认 CLI serve 不属于未经验证即可启动的隔离入口。
- [orcad-entry.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/orcad/orcad-entry.ts)是实际 Node entry，安装 Node host adapters、构造共享 runtime、注册 headless PTY、服务 RPC；桌面通知与 renderer delivery 不安装。
- [orcad-command-arguments.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/orcad/orcad-command-arguments.ts)支持 `--bind`、`--port`、`--no-pairing` 等参数；[orcad-bind-address.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/orcad/orcad-bind-address.ts)缺省 `127.0.0.1`，显式支持 loopback，并拒绝任意 DNS 主机名。
- 直接 Node entry 是**后续隔离验证候选**；本轮没有验证发行物是否包含可直接启动的匹配 entry、Node 与原生依赖，不能写成已可用命令。
- [serve-service.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/cli/handlers/serve-service.ts)明确 Windows 尚不支持 `orca serve service`，建议自己的 service wrapper。这是自动服务安装限制，不能推导前台 runtime 不支持 Windows。

### B2. CLI、RPC 与真实 Agent 能力

- [agent-launch.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/cli/handlers/agent-launch.ts)实现 `agent launch`；远端目标要求明确 worktree，不能用客户端 cwd 猜服务器目录。
- [agent-launch-request.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/cli/agent-launch-request.ts)先查询 `status.get` capability，再调用 `agent.launch` 或 `agent.launchReplay`；保留 operationId 和 launch receipt。结果是 `structured` 或 `terminal`，由主机与设置决定。
- [RuntimeClient](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/cli/runtime/client.ts)本地读取 runtime metadata，通过 transport 发请求；远端使用已配对 WebSocket 和 compatibility gate。修改操作含恢复信息，不鼓励超时后无条件重复 launch。
- [terminal Agent RPC](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/runtime/rpc/methods/agent-session.ts)提供 `terminal.ensureAgentSession` / `terminal.createAgentSession`，权限是 `workspace`。名称有 AgentSession 不代表结构化对话协议。

| 能力 | 固定源码观察入口 | 事实限制 |
|---|---|---|
| 声明可用 Agent | `agentSession.agents` | 返回注册 capability；注册不证明 CLI、账号或模型已就绪 |
| 检查结构化创建支持 | `agentSession.createSupport` | 客户端 capability、Agent audience 与主机设置参与准入 |
| 创建／接续／发送 | `agentSession.create`、`ensure`、`send` | 不等同 CLI terminal launch；参数、位置与 provider 能力需版本验证 |
| 会话历史／事件 | `agentSession.history`、`subscribe`、`unsubscribe` | 结构化 host 与客户端协商门槛；不代表全量跨 Provider 会话搜索 |
| 回答审批／问题 | `agentSession.respondToApproval`、`respondToQuestion` | 回答具体 host prompt，不能等同自己的沙箱或全局免审批 |
| 取消／关闭 | `agentSession.cancel`、`close` | 控制请求存在不证明 Windows 子进程清理和取消结果已实测 |
| 客户端 runtime 事件 | `runtime.clientEvents.subscribe` / `unsubscribe` | workspace 权限，连接归属的订阅清理；不是所有 Agent 状态都自动可见 |
| 原生历史观察 | `nativeChat.readSession` / `subscribe` | 有分页/窗口与 transcript 来源；会读取正文，本轮没有调用 |

上述结构化方法已核对 [structured-agent-session.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/runtime/rpc/methods/structured-agent-session.ts)、[prompt-response](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/runtime/rpc/methods/structured-agent-session-prompt-response.ts)、[agents](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/runtime/rpc/methods/structured-agent-session-agents.ts)。不追完备 RPC 清单，不承诺所有方法对应公开 CLI 命令。

[structured gate](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/runtime/rpc/methods/structured-agent-session-gate.ts)要求远端客户端声明 `agent-session.structured.v1`；Agent audience、host 安装与 host 设置仍影响可用性。清理路径有单独 gate。各方法标记 `workspace` 权限，不能把配对 token 当只读访问。

[client-events.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/runtime/rpc/methods/client-events.ts)绑定 connection 清理并 listener-first snapshot；[native-chat.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/runtime/rpc/methods/native-chat.ts)提供有界 transcript 读取与更新，展示接入会扩大当前元数据观察范围。

Provider 差异继承已读旧调研：Codex/Claude 有专用结构化适配；Grok/OpenCode/OMP 在 ACP launch specs；DSH 仅核实 TUI 配置，不在该 ACP 列表。当前源码事实不能替代各 Provider 的本机版本、账号、审批与取消实测。

### B3. 展示是否可独立加载

- [package.json](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/package.json)有 `build:web`、`build:web-from-renderer` 和 `dev:web`；Node engine 24，pnpm 12.8.1，含 React、Electron、node-pty、ws 与 workspace 包。
- [vite.web.config.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/vite.web.config.ts)以 `src/renderer/web-index.html` 为入口，构建到 `out/web`，资源 `base: './'` 支持反向代理路径前缀。这是完整 Web 应用构建入口。
- [web-index.html](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/renderer/web-index.html)加载 `/src/web/main.tsx`；[Web main](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/renderer/src/web/main.tsx)处理 pairing offer、浏览器设备密钥与已保存 runtime environment，安装 Web preload API，再 lazy-load 同一个 `App`。
- [electron.vite.config.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/electron.vite.config.ts)也将 Web 页面列为 renderer entry；独立 Web 构建路线与桌面 renderer 共享大量实现。
- **独立构建不等于无后端独立运行。** 配对、Web API shim、runtime transport 和 capability 是展示前置条件；没有源码或实测证据支持把 iframe / 单组件复制当作现成嵌入合同。
- 本轮未验证 Web HTTP 服务入口、跨源/frame 策略、CSP、设备密钥保存、同源代理或工作台任务深链。这些不能从 `base: './'` 推导为支持。

## C. 关键模块与本地衔接事实

| 实际文件 | 职责与已读锚点 |
|---|---|
| `session_panel/execution.py:42` | 自研 `ExecutionService`；Windows 所有权、任务/项目上下文、幂等提交、审批与取消；并发上限 2 |
| `session_panel/codex_execution.py:153` | 所属进程启动 Codex；initialize、config/read、thread/start、turn/start；自行处理协议事件 |
| `web/workspace.js:197` | Provider 卡分发现/观察/额度；Codex 交给 `WorkspaceExecution`；其余派发/审批/取消显示未接入 |
| `session_panel/garden.py:1` | 明确 `No agent execution or terminal control`，每个根线程单独 SQLite ledger |
| `session_panel/garden.py:88` | 校验产物与复核文件 hash；变化使当前成功状态失效 |
| `session_panel/garden.py:215` | request → claim → review → root accept，作者与 reviewer 必须不同 |
| `session_panel/garden_mcp.py:34` | per-caller MCP，以 CODEX_THREAD_ID 绑定角色；明确“不派发agent，不操作终端” |
| `web/garden.js:152` | 像素工位、完成摘要和时间线来自 ledger 收据；accepted 必须当前有效 |

本轮针对上述文件搜索 `garden` / `orca` / `ExecutionService` 并读实际实现，未看到小院与工作台执行链或 Orca 的绑定。此结论范围是已读模块，不是全仓所有未来代码的绝对证明。

小院现成业务作用是防止把“分配了任务／请求了复核／Agent turn 结束”冒充“当前产物已被独立复核且验收”；它依赖实际调用 ledger 工具及真实证据文件。像素动画仅展示这些事实，不提供执行、额度或跨 Provider 会话管理能力。未读取现有用户账本，**没有证据证明目前实际工作持续使用了这条闭环**；不能为保留动画虚构用途。

## D. 凭证、数据与停止边界

- 官方 Remote Servers 说明运行主机拥有项目、Agent CLI、PATH/home 与账号；每个 paired client 有独立可撤销 token，撤销断开活跃客户端。服务端可配对能力不是面板已经接入认证。
- [launch-user-data-path.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/cli/runtime/launch-user-data-path.ts)支持 `ORCA_USER_DATA_PATH`；dev 分支有 `ORCA_DEV_USER_DATA_PATH`；CLI pin profile，并给 serve 增加期望路径校验。
- `serveWithOrcad` 将选定 profile 传给子进程 `ORCA_USER_DATA`；有同 profile instance lock，官方要求 desktop sharing 与 serve 不同时运行同一 setup。
- **独立 Orca profile 不证明 provider 账号/home 与项目文件被隔离。** 后续必须先核实 Node/Provider 子进程继承边界；本轮没有导入或复制账号。
- `orcad-entry.ts` 的 Node SecretStore 明确 `isEncryptionAvailable: false`，加解密方法抛 `orcad_secret_sealing_unavailable`，并暴露 protection gap；不能宣称沿用 Electron 系统加密，也不能把“profile 独立”当作凭证安全结论。
- Node entry 提供 `startOrcad` handle 的 `stop(): Promise<void>`，使用 shutdown signals / managed stop 相关模块；官方 CLI 生命周期为 Ctrl-C。本轮没有验证 Windows shutdown 清理、不遗留 PTY/provider 子进程与数据 flush。
- 官方 CLI service uninstall 仅清服务定义，Windows 不适用；本轮没有迁移，所以无产品数据回滚动作。停进程、撤销设备与删除 profile 是不同动作，不得以回退名义删除旧库、账本或账号。
- 许可：旧一手调研核实 MIT；若后续复制实质源码，应保留对应版权与许可。本轮只写研究文档，没有复制业务代码。

## E. 本轮动作、失败与证据等级

1. 读取本目录 README（两轮最新原话）与 clarifications、旧 hlplan/research-industry、旧 M3 handoff；定向读上述本地模块。
2. 本轮通过 GitHub tree API 定位，输出限制在相关路径；用 PowerShell HTTPS 读取固定 SHA 一手原始文件，不 clone、不安装、不构建。
3. `web.run` 首次连接失败，随后 GitHub 文档浏览超时；原始源码 HTTPS 读取成功。这里的链接指向实际已读一手源码，不把浏览工具失败写成来源不可用。
4. 猜测 `src/cli/handlers/serve.ts`、`src/renderer/src/web-api.ts`、`src/main/orcad/index.ts` 返回 404；已用实际 `serve-orcad-launch.ts`、`web/main.tsx`、`orcad-entry.ts`补证。
5. 第一次多文件 shell 输出截断，且 continue-on-error 使 404 后变量保留前一文件内容；该错误片段不作证据。关键方法、Web 入口、Node bind 与 secret store 均用后续精确读取核实；后续读取设置 Stop 并检查退出码。
6. 无本轮运行时/浏览器/模型测试。旧 303/24 测试与 M0–M2 验收不作为本轮验证；旧 M3 模拟集成成功和历史失败以原 handoff 为准，真实验收仍缺。

## G. 不确定点与后续停止条件

| 编号 | 尚未证实 | 确认方式及停止条件（交给后续准入） |
|---|---|---|
| U1 | 固定版本 Windows Node entry、Node 24/native PTY 与发行物匹配 | 隔离构建/发行物核对；无法固定可复现版本与依赖则停止 runtime 接入 |
| U2 | 实际仅 loopback 与可控停止 | 直接 entry 显式 bind、核查实际监听与自身进程清理；宽监听、非己方占用或清理未知则停止，不 fallback 默认 serve |
| U3 | profile、provider home、账号继承与 Node secret protection | 先核对源码/临时环境，不导入现有账号；若需读取凭证或风险扩大，停止无账号验证并报告 |
| U4 | Web client 配对、授权、存储与完整 App 在本机工作 | 先固定无私人数据环境验证完整官方客户端；配对/版本/capability 拒绝或需要未核实代理时停止展示接入 |
| U5 | 元数据清单/事件是否足够关联个人任务 | 核对来源、稳定 ID、权限和断连恢复；如果只能读正文或不能证明事件归属，停止相应观察接入 |
| U6 | 真实创建/发送/审批/取消及 Agent 能力差异 | 另行明确恢复真实模型范围后在隔离目标验证；额度/权限范围不明、重复发送或取消无回执则停止；本轮不试跑 |
| U7 | 小院已有真实使用覆盖 | 用户未来恢复优先级时以现有 ledger receipts 核查；当前不访问账本、不补造任务、不扩大像素用途 |

技术 U 点不能通过用户“同意方案”消除。高层方案可以指定候选与准入边界；本研究不授予 Readiness 或实施 Gate。

## H. Readiness 最小可核查证据

- 运行时：`orcad-entry.ts` / `orcad-command-arguments.ts` / `orcad-bind-address.ts` 与 `serve-orcad-launch.ts`必须一起核对，避免把两种启动路线混为 loopback。
- 控制：`agent-launch-request.ts` 的 structured/terminal outcome 与 `structured-agent-session*` 的 workspace 权限、capability gate、prompt response 对照。
- 展示：`vite.web.config.ts` → `web-index.html` → `web/main.tsx`，说明完整 App、配对和 preload API，不能只援引 React 依赖。
- 本地：`execution.py` / `codex_execution.py` 无 Orca 调用；garden 明确账本边界；旧 handoff 继续保留未真实验收与历史失败。
- 尚未关闭 U1–U7；无阻塞本轮调研/高层方案的用户问题，技术证据不足不能转写为已批准或已运行。

## 跨功能事实（待确认）

- [2026-10-14] 广告连接地址与实际 bind 地址属于不同配置；应以实际启动参数与监听结果判定暴露范围。
- [2026-10-14] 同一 runtime 的 Node 与 Electron 宿主可能采用不同 secret protection，不能仅凭共享业务代码推定凭证边界相同。
