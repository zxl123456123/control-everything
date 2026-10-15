# M3 调研：Codex 单 Provider 执行闭环

日期：2026-10-13（Asia/Shanghai）；角色：repo_researcher；受众：共享。  
性质：调研初版，提供已核实协议和约束，不是实施放行。未启动 app-server 服务、未发送 turn、未读取凭证或私人会话正文、未修改产品代码。

## A. 当前系统边界与关键结论

现有工作台可保留为底座。M0–M2 的 `WorkspaceService` 管理手工任务、Provider 发现、原会话索引、用量观察和资讯；没有执行通道。M3 的关键新增事实是“由工作台自己创建并持有的运行”，不能把已关联的历史 `session_key` 当作执行所有权，也不能将现有手工 `done` 改成模型 turn 的结束状态。

**本轮发现必须更新协议基线的版本差异。** 当前产品 `native_codex()` 实际解析到 `C:/Users/ZXL/AppData/Local/OpenAI/Codex/bin/2e5e00daee91c61d/codex.exe`。本轮直接执行该文件 `--version`，退出码 0，结果为 **`codex-cli 0.162.0-alpha.17.2`**。旧 M0–M2 文档记载的 shell CLI 为 `0.118.0`；这是本次观察到的 PATH/可执行文件解析差异，不能推断用户升级过 CLI。

本轮使用这个实际可执行文件重新生成 schema，输出在 `work/agent-execution-20261013/research-schema/`，命令退出码 0，共 317 个 JSON 文件。M3 应核对实际启动的可执行文件与该 schema，而不是沿用旧 `work/agent-workbench-20261013/codex-schema/`。生成 schema 不启动模型 turn。

### 可控范围的事实依据

本机协议具备创建线程、开始文本 turn、通知流、具体命令/文件审批、取消 turn 和结束状态。最小闭环不依赖终端输入模拟、工作流引擎、完整 IDE、跨设备连接、所有 Provider 适配或私人历史扫描。`thread/resume` 存在，但协议存在本身不能证明旧进程中的活动 turn 和待审批 callback 可被新进程接管。

## B. 实际入口、数据和 UI

| 事实 | 本地证据 |
|---|---|
| API 已有精确字段、同源/CSRF 验证和错误映射 | `session_panel/gateway.py:129`、`:237`、`:324`；所有新执行 POST 应保留此边界。 |
| 任务仅记录人工管理事实 | `workspace_store.py:31` 的 tasks 字段为 id/title/project_id/provider_id/state/session_key/source/created_at/updated_at；`:73` 固定 source=manual。 |
| 状态是 todo/doing/blocked/review/done | `session_panel/workspace.py:17`；这是任务状态，不是进程/turn 状态。 |
| Provider 能力目前显式关闭执行 | `session_panel/workspace.py:72`：dispatch/cancel/approve 均 false；命令被发现不等于执行可用。 |
| 会话关联仅查当前样本与目录归属 | `workspace.py:128`、`:162`；历史 Codex UUID 关联不会建立当前 app-server 客户端所有权。 |
| 任务可随时修改项目和 provider | `workspace_store.py:77`。执行中的 run 因而不能只读“此刻 task 字段”来决定原运行的 cwd/provider；需要保存真实启动事实。（推断） |
| SQLite 已有事务和单连接上下文 | `workspace_store.py:22`；每次操作单连接，busy_timeout=3000；当前没有运行、事件游标、具体审批或幂等提交记录。 |
| Web 当前表单保存任务而不发送 | `web/workspace.js:239`，`:254` 明确提示手工状态；UI 没有 prompt、run 时间线、具体审批或取消回执。 |
| 只读 quota probe 已会启动短命 stdio 子进程 | `workspace_sources.py:132`；初始化后只发 account/rateLimits/read，18 秒总期限，finally 关闭 stdin/等待/kill 当前子进程。 |
| quota probe 不是执行适配器 | `workspace_sources.py:179` 只等指定整数响应 id，其他消息被略过；运行时必须处理 server requests 和通知，不能复用此收包语义。 |

现有 HTTP 服务是 ThreadingHTTPServer，网页重载和网络请求生命周期与 Provider 子进程生命周期分离。即使同一机器多个浏览器都可提交，仍需由主机控制同一 run 的并发命令；前端 disabled 按钮不能单独提供幂等性。（推断）

## C. 原生协议：本机 schema 优先

以下 schema 路径均以 `work/agent-execution-20261013/research-schema/` 为根；`#/properties/...` 是 JSON Pointer 核验锚点。官方说明已打开：[Codex App Server](https://learn.chatgpt.com/docs/app-server)。文档用于协议背景；具体可发字段以本机生成文件为准。

### C1. 建立与发送

| 操作 | 本机已证实契约 |
|---|---|
| 启动传输 | 已有代码固定原生 exe `app-server --listen stdio://`；JSON 每行一个消息，无 JSON-RPC version 字段；stdout 必须持续读取。`workspace_sources.py:135`；schema `JSONRPCRequest.json`、`JSONRPCResponse.json`。 |
| 初始化 | `initialize` request 得到有效响应后发 `initialized` notification；`v1/InitializeParams.json` 必须有 clientInfo。experimentalApi 默认 false，不应把“可出现在最新网页”视为已经协商成功。 |
| 创建线程 | `thread/start` 对应 `v2/ThreadStartParams.json`，可传 cwd、model、approvalPolicy、approvalsReviewer、sandbox、ephemeral。成功返回 thread 和有效策略：`v2/ThreadStartResponse.json#/required`。 |
| 发文本 | `turn/start` 必需 threadId/input，文本 input 为 type=text、text 字符串。`v2/TurnStartParams.json`、其 UserInput definition；成功返回 turn。 |
| 取消 | `turn/interrupt` 必需 threadId 与 turnId；响应为空 object。`v2/TurnInterruptParams.json`、`TurnInterruptResponse.json`。接受取消和 turn 真正结束须分开记录。 |
| 读/恢复 | `thread/read`、`thread/resume` 存在；前者 includeTurns 会读取历史，后者可继续原生线程。它们不等于重建上一次 stdio 的请求 id 或恢复上一次审批 callback。 |

新 schema 的 `ThreadStartParams` 使用 sandbox 值 **`read-only` / `workspace-write` / `danger-full-access`**；返回的 `SandboxPolicy` 则是 type=`readOnly` / `workspaceWrite` 等对象。不要把请求 enum 和响应对象的命名混用。approvalPolicy 支持 `untrusted` / `on-request` / `never` 或 granular 对象；本机新 schema 已无旧 `on-failure`。审批 reviewer 支持 `user` / `auto_review` / 兼容 `guardian_subagent`；具体人工审批闭环应核对实际返回 `user`，不能由默认值推断。

`TurnStartParams` 新增 `clientUserMessageId`，但该字段没有说明去重、持久化幂等或重复请求处理保证。它只能视为已知字段，不能作为“断网后重发不会执行两次”的证据。旧 schema 没有此字段。

### C2. 运行事件和终态

| 通知 | 最小身份与事实 |
|---|---|
| `turn/started` / `turn/completed` | threadId + turn.id；状态为 inProgress/completed/interrupted/failed。仅同一个 run/thread/turn 的事件可推进该运行。 |
| `item/started` / `item/completed` | threadId + turnId + item.id/type，包含消息、命令或文件变更等具体 item。 |
| `item/agentMessage/delta` | threadId/turnId/itemId + delta；属于增量，不能当成完整消息重复附加。 |
| `item/commandExecution/outputDelta` | 同样按 turn/item 关联；输出有界、明确截断，不能由最后一段输出推断成功。 |
| `thread/status/changed` | 线程级 notLoaded/idle/systemError/active；不能替代某一个 turn 的结束。 |
| `error` | threadId/turnId/error/willRetry；willRetry=true 的事件不能立即被当成最终失败。 |
| `serverRequest/resolved` | threadId + requestId；表示 pending request 已回答或清除，不证明对应工具执行成功。 |
| `thread/tokenUsage/updated` | threadId + turnId + tokenUsage（last/total/context window）。可只采集本工作台自己新开的运行，无需扫描私人历史。 |

证据分别为 `v2/*Notification.json` 与 `ServerNotification.json`。本机新 Turn 还可有 startedAt、completedAt、durationMs、rootTurnId、itemsView；这些可空，不能构造不存在的时长或结束时间。旧版 Turn 文档里“非 resume 时 items 永远空”的说明已改变，客户端不能依此拒绝新的实际 item 数组。

（推断）最小可解释运行集合需要区分：尚未提交、提交待确认、已运行、等待具体审批、取消已请求、协议 completed/failed/interrupted、连接丢失/效果未知。命名由低层计划决定；任务验收状态继续独立。写入 stdin 成功、客户端超时、Provider 进程退出均不足以证明任务未执行或业务完成。

### C3. 一次性具体审批

审批是**服务器发给客户端的 request**，带自身 request id，不是通知。请求 id 可为字符串或整数（`RequestId.json`）。回包必须保持原值与类型；client RPC id 与 server request id 是两个方向，不可用一个字典把同号消息混为响应。

| 类别 | 本机字段与一次回应 |
|---|---|
| 命令 | `CommandExecutionRequestApprovalParams.json` 必需 itemId/threadId/turnId/startedAtMs；可有 command/cwd/reason/kind/environmentId/networkApprovalContext/approvalId。响应 decision 的一次值有 accept、decline、cancel。 |
| 文件改动 | `FileChangeRequestApprovalParams.json` 必需 itemId/threadId/turnId/startedAtMs；请求本身没有 patch 列表，具体 changes 来自相同 item 的 `item/started`。响应也支持 accept/decline/cancel。 |
| 权限集合 | `PermissionsRequestApprovalParams.json` 是另一种协议：带 cwd/permissions；响应是 permissions + scope，不是 decision。不能套用普通“允许”按钮。 |
| 用户输入/MCP/动态工具 | ServerRequest 还有 item/tool/requestUserInput、mcpServer/elicitation/request、item/tool/call、认证刷新、attestation 以及 legacy requests；最小执行闭环不能静默略过这些请求或自动授权。 |

`acceptForSession`、execpolicy/network policy amendment 是持续或扩展授权；不属于一次审批。文件 grantRoot 标注 UNSTABLE，且 schema 明说是否被执行尚不明确；不能把它展示成可靠的范围限制。command 的 approvalId 可用于同一 item 多次 callback，不能仅以 itemId 去重。网络审批应展示网络目标而不伪装成普通 shell 命令。

（推断）具体审批资格至少依赖工作台 owned run、当前 app-server generation、thread/turn/item、server request id、尚未 resolved 且未回答。两个浏览器同时回答、断线后点击旧卡片、取消和回答竞争，都必须只有一个有效动作。stdio 写入成功仅能称“答复已发送”；后续 resolved/item/completed 才提供 Provider 侧事实。未知审批类型需要可见“暂不支持此请求”及停止/取消路径，不能让用户点一个没有语义的统一允许。

## D. Orca 固定源码的可复用事实

固定提交继续使用 `aceebea0a4453f63d759af9134503220ce0b4753`，此次实际从 raw 源读取以下文件，不依赖 README 宣称：

- [structured-agent-registry.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/native-chat/agent-session-wire/structured-agent-registry.ts#L19)：能力声明须有对应 adapter 方法，重复注册拒绝；运行时可收窄能力，不能扩大。
- [structured-agent-session-adapter.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/native-chat/agent-session-wire/structured-agent-session-adapter.ts#L175)：dispatch 区分 accepted/admitted/rejected/unknown；unknown 不代用户重新发送。文件 `:113` 还区分 acquisitionGeneration；`:394` 用活 callback claim + journal commit 处理审批竞争；`:433` 说明无可证明边界的 history window 时未决发送保持 unknown。
- [structured-agent-session-adapter-stop.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/native-chat/agent-session-wire/structured-agent-session-adapter-stop.ts#L11)：stop 返回可拒绝、turnNotRunning/turnMayOpen 等事实；关闭 Provider 子进程是独立策略，不把按钮点击等于已停。
- [agent-session-capabilities.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/shared/agent-session-capabilities.ts#L22)：Orca 回答权限请求不构成 Agent 沙箱；真正何时提问仍取决于 Provider。

这些是可参考的合同原则，不要求复制其 lease/journal/fence 全套框架，更不要求为单 Provider 引入插件系统。尚未穷尽 Orca Codex adapter 全部实现；本报告不声称已验证其 Windows 执行可靠性。

## E. Windows 进程归属、回收和权限边界

现有 quota probe 使用 CREATE_NO_WINDOW、直接原生 exe、无 shell；这减少包装进程，但当前 finally 只 `process.kill()/wait()` **直接子进程**（`workspace_sources.py:135`、`:209`）。它用于只读短 probe，不能自动作为可执行 shell/MCP 子孙树的回收证明。

微软官方 [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) 说明 Job 可管理进程组，默认新 CreateProcess 子进程继承 Job；最后句柄关闭且设置 KILL_ON_JOB_CLOSE 时结束所属进程。breakaway 和不同创建机制有例外。[AssignProcessToJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject) 明确分配可能失败及权限/嵌套 Job 条件；它不是永远成功的调用。

据此需要下阶段关闭的具体证据：

1. owned exe 在开始执行或派生工作前已进入可控制的 Job；先运行再绑定存在时间窗。（推断）受控 suspended 创建、绑定、恢复是一种可核验途径，实际 ctypes/句柄方案尚未实施。
2. 持有的 Job/process 句柄明确属于本次创建；不得扫描同名 codex.exe 并全局杀进程，也不能仅凭重启后持久化 PID 杀进程。
3. 正常退出先请求 turn interrupt 并读取终态；强制结束只表示本次 owned 进程被结束，不能伪造协议 interrupted 或产物验收。
4. 进程树退出须独立核验；reader 线程、stdin/stdout 句柄、Job 句柄都要有收尾证据。无法证明回收时保留 cleanup_unverified/unknown，不宣称“取消成功”。
5. 嵌套 Job、Codex Windows sandbox、MCP/hook 子进程可能交互；本轮只查文档，尚未本机运行测试。官方 [Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox) 不证明此机器已配置可用；不能自动运行 setup、管理员安装或改全局配置。

cwd 限制、审批策略、OS sandbox 是不同机制。当前 `inside_project()` 是路径字符串归属检查，不验证 junction/reparse 后的真实目录（`workspace.py:36`）；M3 若把它当可写范围授权，需要补实际解析/对象边界核验。ThreadStart 返回的有效策略必须与请求对照，不能只凭请求参数宣称隔离。

## F. 未知、重启、幂等和 token 事实

- **发送不明不能自动重发。** 本机 schema 未给 turn/start 的 exactly-once 保证；HTTP 请求重试和 Provider RPC 重试必须分开。相同用户提交是否已登记/已发送是主机事实，不能只由前端处理。（推断）
- **重启不续命。** SQLite 可保存原生 thread/turn ID，但 stdio 连接和 pending server requests 属于已结束进程。启动时未决记录应先失联/未知，不自动 resume/start/approve。明确恢复是后续独立动作，不需要为首批实现完整会话历史恢复。
- **只管理自己创建的运行。** 从 `/api/codex/threads` 读取的既有会话 ID 不能被自动纳入 approve/cancel；本机原生 ID 的格式也不宜复用旧索引 canonical UUID 校验作为唯一协议判断，因为官方字段类型为 string。
- **token 通知可收集，不是账单。** 新 schema `ThreadTokenUsageUpdatedNotification.json` 明确有 threadId/turnId 与 last/total；TokenUsageBreakdown 有 inputTokens/cachedInputTokens/outputTokens/reasoningOutputTokens/totalTokens，另有可选默认 0 的 cacheWriteInputTokens。不能把累计 total 每次相加，也不能把 cached/reasoning 分项再加到 totalTokens。
- **日用量需覆盖标注。** 若只收本工作台新运行，必须显示该范围；本机通知只给观测时刻，跨北京时间午夜、重复通知、累计回退和断线窗口需要测试。可保留原始数值和采样时间而先不宣称完整每日账单；没有事件是未知，不是实际 0。schema 未详细定义 last 是否等于完整一轮，不应未经实测把 last 当 turn 总用量。
- **权限来源未验证。** app-server 可能继承现有用户配置、MCP、hooks；隔离 cwd 不等于关闭这些副作用。此研究未读取配置内容/凭证，具体隔离启动参数及账号是否可推理仍是未知项。

## G. 不确定点与下阶段补证

| 编号 | 未知 | 如何关闭 |
|---|---|---|
| U1 | 当前原生 0.162 alpha 的实际握手/模型/账号可用性 | 在固定 exe 上做无 turn 的有界初始化与只读 model/list；本文未启动服务器。旧 0.118 quota 失败不能外推当前所有方法失败。 |
| U2 | Windows Job 与当前 Codex sandbox 的真实兼容/子孙回收 | 先 fake app-server 创建无害子孙进程测试，再在显式授权的隔离 smoke 核验；不以 mock kill 被调用代证据。 |
| U3 | 真实一次审批是否由选定 sandbox/policy 触发，以及响应后的行为 | 在隔离目录请求无害具体写 marker 的操作，看到真实 request 后由用户/已授权验收者决定；不能仅靠 prompt 保证会触发。 |
| U4 | 是否已授权消耗本机 Codex 额度的两次隔离 smoke | root 按现有原文授权判断；本次委派明确仅提出、不执行。若未授权，可先交付实现和 fixture，同时准确保留真实执行未验收。 |
| U5 | 持久 run/审批/提交幂等字段与旧任务状态关系 | LW 必须明确，不从旧 tasks 表或 schema 推断已有实现。 |
| U6 | 新版本 clientUserMessageId 的去重语义 | 当前 schema 无描述，不为首批依赖。若要用其提供自动重试保证，需额外官方源码/真实重复投递证据。 |

## H. 最小验证锚点与真实 smoke 区分

### 无模型、无付费推理的受控验证

真正的 fake app-server **子进程**通过 stdin/stdout 模拟协议（不只是 Mock Popen），可以证明：初始化顺序、响应/通知/server request 分流、分片行、乱序响应、超长行、EOF、重复事件、错误、迟到完成、具体审批一次响应、取消竞争、客户端断线、重启未知和幂等登记。Windows 无害孙进程可证明 owned Job 的真实退出/不影响外部进程。Web fixture 可证明审批内容、按钮、未知状态和移动窄屏交互。上述证据仍不能证明账号能推理、真实审批会出现或 Codex 本机 sandbox 可工作。

现有 `tests/test_workspace_sources.py:71`/`:94`/`:110` 只是 quota 的 Mock process；`tests/test_workspace.py:262`/`:273` 覆盖现有 HTTP 边界。M3 需要新增真实进程 fixture，但无需重造完整 IDE。

### 最小真实验证动作（只提出，未执行）

在准备好隔离、可审阅目录、固定命令和停止手段后，最少两次受控真实 turn 可分别覆盖完成与中断：

1. **完成/具体审批 smoke：** 新建工作台 owned thread，仅要求在隔离测试目录写一个固定内容的 marker，或运行一个固定无害命令；使用已核验的只读/人工审批配置，使实际 Provider 提出具体请求。卡片显示精确 command/cwd 或 file diff，由显式审批后才继续。记录原生 thread/turn/item/request id、有效策略、真实 item/turn completed、token 通知、marker 内容和 owned 树收尾。若没有审批请求，该次只算执行 smoke，审批保持未验收；不得虚构请求。
2. **取消 smoke：** 同一 owned thread 的新 turn，目标为可识别且有时间取消的固定无害操作（例如短暂等待后返回 marker）。运行期对已知 turnId 发 interrupt，观察 accepted 与最终 interrupted 的先后；再证明进程/子孙收尾。若先完成，诚实记取消竞争结果，不能当中断通过。

这两次会消耗真实模型额度；没有可从 schema 推导的固定费用。它们不能作用于用户正在开发的项目、既有 agent 会话或未登记工作区，不读取其他对话，也不自动批准任何意外工具/网络/路径扩展。出现登录/配置/沙箱安装需求即记录实际限制，不能为了得到绿色测试自动升级或换安全级别。

### 本轮调研验证与失败

- 已执行实际原生 exe `--version`，exit 0，`0.162.0-alpha.17.2`；schema 生成 exit 0，317 JSON；未启动 app-server listener 或 turn。
- 新 `ThreadStartParams.json` SHA-256：`e9c6d3cc18d049bfbc0249add3808fb8e5a27e1a0b5a423767aafbc3859a9428`；`TurnStartParams.json`：`583aff13e7a2da43fbb0150e0edc3c73171f374f0aa745dddba256166988a005`。
- 新 `CommandExecutionRequestApprovalParams.json` SHA-256：`16a71816c2d66e319c2c4aa83dd636dfdc43c61e72b6d5475e421ce08d8e6558`；`ServerRequest.json`：`f339be472737a0003efa25fba2e6e6c9237e621cd065b6d6995c51256e9dc1fb`。
- GitHub tree API 返回 HTTP 403 rate limit；使用固定 raw 源读取上述已知文件。猜测的 Codex adapter 文件路径返回 404，未作为已证实源码。官方 `/docs/windows` 入口查找无匹配，后成功打开 `/docs/windows/windows-sandbox`。
- 一次 `rg tests/test_workspace*` 在 Windows 通配路径解析失败 exit 1；后改为 `rg tests -g 'test_workspace*.py'`。数次批量输出被截断，关键协议字段/源码片段随后定向读回。不将这些研究工具失败记为产品失败。

---

## 跨功能事实（待确认）

- [2026-10-13] 同机 shell 命令与产品 native_codex resolver 可能选择不同 CLI；协议 schema 必须绑定最终启动的实际 exe 和版本。
- [2026-10-13] 任务人工状态、Provider 接受发送、turn 结束和产物验收属于独立事实；未知发送不得自动重放。
- [2026-10-13] Windows 直接子进程退出不是子孙树回收证据；执行能力需要明确本次 owned 生命周期边界。
