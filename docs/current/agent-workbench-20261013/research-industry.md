# 开源工作台与官方接口调研

查询日期：2026-10-13（Asia/Shanghai）  
受众：共享。范围：外部事实与候选取舍依据；不替代本项目架构决策和实施验证。

## A. 系统边界与主要结论

用户所写 `ocra` 与需求最匹配的候选是 **[stablyai/orca](https://github.com/stablyai/orca)**（推断，名称尚未由用户确认）。它当前已有 Windows、macOS、Linux 桌面版和手机连接能力，不能沿用早期资料中的 macOS-only 结论。读取的源码快照为 `aceebea0a4453f63d759af9134503220ce0b4753`；以下 Orca 代码链接固定到该提交。

可核实的共同点是：成熟工作台把 Agent 运行环境保留在拥有项目文件的主机上，再让桌面、浏览器和手机连接该主机；适配层区分每个 Agent 的能力。**“发现了 CLI”“能打开终端”“能观察历史”“能结构化发起/恢复/取消会话”“能查额度”是不同能力，不能合并显示成一个“已接入”。** 后一句是基于下述源码的归纳，不代表本项目已经实现这些能力。

本轮最直接的官方只读数据入口是 Codex `account/rateLimits/read`。本机 `codex-cli 0.118.0` 的 schema 探测由 root 执行，报告存在该方法、未出现 `account/usage/read` 与 `dailyUsageBuckets`。随后 root 的真实只读 probe 初始化成功，但额度查询返回 `-32603`，状态为 unavailable；我已独立读取清洗后的 `work/agent-workbench-20261013/codex-quota-probe.json` 核对。**协议存在，本机当前额度查询没有成功。** 不把新版文档的方法视作旧版 CLI 已支持。

## B. Orca 入口与实际主流程

### 桌面、网页、手机

- [package.json](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/package.json) 包含 Electron、React、node-pty、ws，分别构建 desktop、web、mobile-web。它是完整开发环境，包含终端、Git/worktree、远程环境、Agent 会话和用量模块，并非一个轻量仪表盘模板。
- [cloud/README.md](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/cloud/README.md) 说明手机和桌面分别向 relay 建立出站 WebSocket，由 relay 配对转发；director/cell、推送服务和生产数据库属于额外基础设施。该文档还明确部分 API/auth 服务位于私有仓库，因此不能承诺复制公开仓库即可复现全部托管服务。
- [LICENSE](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/LICENSE) 为 MIT。若复制实质代码，须保留版权和许可声明；目前仅研究，没有复制源码进入业务文件。

### Agent 能力分层

| 层级 | 已读取的实现事实 | 对选型的含义（归纳） |
|---|---|---|
| 终端 Agent | [tui-agent-config.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/shared/tui-agent-config.ts) 为不同 CLI 配置检测命令、启动命令、参数提示和终端就绪信号 | 支持任意 CLI 不等于每个 CLI 都有结构化会话 API |
| 结构化 Agent | [structured-agent-registry.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/native-chat/agent-session-wire/structured-agent-registry.ts) 按注册定义与 adapter 组合；声明 rewind/compact/threadGoal 时核验对应方法确实存在 | 能力应由实现约束，不能只靠 UI 配置项宣称 |
| 能力对外发布 | [agent-session-registered-agents.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/shared/agent-session-registered-agents.ts) 提供 `agentSession.agents`；缺失布尔能力默认 false，未知枚举降级 | 新旧主机/客户端不能假定同步升级 |
| Codex / Claude | [Codex 定义](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/codex/codex-structured-agent-definition.ts)、[Claude 定义](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/claude/claude-structured-agent-definition.ts) 分别有自己的 transport/account home；能力并不相同 | 保留 provider 的专用协议与账号归属 |
| Grok / OpenCode / OMP | [acp-launch-specs.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/acp/acp-launch-specs.ts) 中 `ACP_LAUNCH_SPECS` 当前列出三者；Grok 用 `grok agent stdio`，OpenCode 用 `opencode acp`，OMP 用 `omp acp` | 可以借鉴 ACP 路线，但各自仍有 dialect、版本与 capability 差异 |
| DSH | 同一 TUI 配置的 `dsh` 检测 `dsh-tui` 或 `dst`，同时要求 `dsh`，启动 `dsh-tui .`；它不在上述 ACP 列表内 | Orca 中的 DSH 支持应表述为终端接入，不能据此宣传结构化控制等价 |

[acp-structured-agent-definitions.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/acp/acp-structured-agent-definitions.ts) 将 ACP 的 rewind/threadGoal 声明为 false，steering 为 queue；审批表示 Orca 回答 Agent 提出的请求，并不代表替 Agent 实现了完整沙箱。

Windows 的明确局部限制：Orca 的 `claude-agent-teams` 原生 pane/tmux wrapper 在 `win32`、`wsl` 检测为不支持，使用 Claude 自身的进程内 fallback；这不表示整个 Orca 不支持 Windows。终端配置还包含 Codex/OpenCode 的 Windows 输入与启动就绪处理，说明直接模拟键盘具有额外兼容成本。未对 Orca 二进制执行 Windows 安装验证。

## C. 其他可借鉴候选

| 候选与一手来源 | 已观察到的事实 | 可采用的参考点 / 不直接采用的理由 |
|---|---|---|
| [T3 Code](https://github.com/pingdotgg/t3code)、[内部架构](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md) | 正确上游为 `pingdotgg/t3code`，MIT。README 列出 Codex、Claude、Cursor、Grok Build、OpenCode、Antigravity；Electron/web/mobile 控制主机。架构把 provider 进程、终端、Git、文件放服务端，客户端经认证 RPC 访问；事件、投影、outbox 一次事务提交，副作用稍后执行 | 采用“主机拥有执行与凭证、客户端共享协议、操作意图与实际完成分开”的事实参照。完整事件溯源、relay 与多运行环境管理会扩大当前 Python 面板改动，是否采用应由 hlplan 结合项目现状决策 |
| [T3 远程连接说明](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md) | 手机/其他浏览器可配对主机；配对链接是一次性设备授权；连接路线和权限分开管理 | 可参考设备配对与撤销，不把“响应式页面”误称为已实现远程安全接入 |
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban/blob/main/README.md) | Apache-2.0；Rust 后端与 Web UI；issue 看板、workspace、terminal、dev server、diff/PR、10+ Agent。**当前 README 明示项目正在 sunsetting**；GitHub API `archived=false`，两者不矛盾 | 参考项目/任务/执行 workspace 分离与看板交互；不将它作为仍在持续投入的默认底座。未依赖 fork 宣传替上游作结论 |
| [ACP 官方概览](https://agentclientprotocol.com/protocol/v1/overview) | JSON-RPC 2.0；initialize 协商版本/能力，session/new、prompt、update、cancel；session/load 可选，工具审批由 session/request_permission 表达 | 适合作为支持 ACP 的 Agent 的统一接入协议；它不替代工作台任务库、账号额度服务或进度真实性判断 |
| [DeepSeek Harness README](https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md)、[Python SDK](https://github.com/deepseek-ai/deepseek-harness/blob/master/python/sdk/README.md)、[使用指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/python-sdk.md) | MIT、developer preview，明确会有破坏性变更。Python SDK 通过 stdio JSON-RPC 管理匹配版本的 dsh 子进程；必须显式指定 dsh_home/DSH_HOME；官方指南列出 Windows x64、Linux x64/arm64、macOS 14+ arm64。web profile 与 SDK profile 是不同入口 | 对已有 Python 后端是后续真实结构化 DSH 接口候选；不能沿用“仅 Linux/WSL”说法。需按安装版本验证；本轮没有安装 SDK、启动 agent 或发送任务 |

## D. 额度、每日 Token 与费用的事实边界

### Codex

官方 [App Server 文档](https://learn.chatgpt.com/docs/app-server) 明确提供 `account/rateLimits/read`、`account/rateLimits/updated`，窗口字段为 `usedPercent`、`windowDurationMins`、`resetsAt`（Unix 秒），新版可有 `rateLimitsByLimitId` 多桶；缺值不等于 0。stdio 为 JSONL；初始化完成后才发读取请求。

[Orca 的 RPC probe](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/rate-limits/codex-rpc-rate-limit-probe.ts) 实际执行 `initialize → initialized → account/rateLimits/read`，不需要 thread/start 或 turn/start，结束后回收该 probe 子进程。因此可查询而不启动模型推理、不消费 reset credit；不能声称 CLI 启动绝无任何运行文件或认证刷新副作用。本轮研究没有操作用户认证。

新版官方文档另有 `account/usage/read` 每日 token 桶，但本机 0.118.0 的 schema 没有它（root 当轮探测），不能列为本轮可用能力。`account/rateLimitResetCredit/consume` 等是写操作，与只读查询分开。

本地日志可辅助统计当天开发消耗，但属于本机可见日志统计，不是账户全部设备账单。[Orca 解析器](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/codex-usage/codex-usage-record-parser.ts) 读取 `event_msg.payload.type=token_count`；`info=null` 可仅代表额度更新。[增量与去重实现](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/codex-usage/codex-usage-token-delta.ts) 说明 `total_token_usage` 为累计快照，不能逐条相加；fork/resume 可复制记录并更换 session id；cached input 属于 input、reasoning output 属于 output，不能重复加总。日志格式兼容、日期时区、截断/删除记录和扫描覆盖率仍需本地验证。订阅消耗百分比不能由 Token 数或 API 单价反推。

### Claude

官方 [成本说明](https://code.claude.com/docs/en/costs) 区分订阅 plan usage 与 session API token/cost，Pro/Max 会话成本数字不代表应付账单。[Monitoring](https://code.claude.com/docs/en/monitoring-usage) 提供 OpenTelemetry `claude_code.token.usage` 和 `claude_code.cost.usage`；成本为估算，正式账单以 provider 为准。启用遥测涉及配置和接收端，不能把“有官方遥测能力”写成“现有历史已完整接入”。未确认个人订阅额度的公开稳定第三方查询契约；控制台入口、手工记录和受支持的本地数据必须区分来源。

### Grok / xAI

[官方 Grok FAQ](https://docs.x.ai/grok/faq) 当前说明付费账户有共享周使用池，网页/手机 Settings → Usage 展示消耗百分比和重置日期；[The X Subscription 使用限制](https://docs.x.ai/x-subscription/usage-limits) 也描述符合条件的第一方使用共享周池。套餐正在演进，不能硬编码成固定每日次数，也不能假定所有用户同一 billing 模型。

[Management API billing](https://docs.x.ai/developers/rest-api-reference/management/billing) 有团队历史 API usage 查询；[Management API 概览](https://docs.x.ai/developers/rest-api-reference/management) 需要独立 management key。**团队 API 账单、订阅周池、预付余额、月度消费上限是不同数据，不能互相冒充。** 共享池可能包含多产品使用，也不能只凭“API/Build”标签推断所有账号的归属。

[Orca grok-fetcher.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/rate-limits/grok-fetcher.ts) 读取 Grok CLI OAuth session，GET `https://cli-chat-proxy.grok.com/v1/billing?format=credits`；可能另读 `/billing`，按响应区分 weekly/monthly，无法计算则 unknown/unavailable。它不运行 grok login，过期交由 CLI 刷新。这是已存在的开源实现，但本轮未找到该 CLI billing endpoint 的官方稳定外部 API 合同；未检查或读取用户 Grok token，不保证它能读取本用户网页订阅额度。

## E. 候选采用范围（交给架构阶段）

以下是调研归纳，不是实施承诺：

1. 可采用 Orca/T3 已有的 capability 分层、主机执行/客户端展示边界，以及项目—任务—会话关联思路。注册表应如实展示发现、观察、控制和额度各项能力。
2. 当前可优先验证 Codex 官方只读 RPC；日志 Token 统计是另一数据源。额度卡片应注明更新时间、来源、范围和不可用原因。
3. ACP/DSH SDK 是结构化控制的实际协议候选；没有实现并测通会话生命周期时，不用静态卡片宣称统一管理完成。
4. 不直接搬入整套 Orca/T3，也不把 Vibe Kanban 当作当前优先长期依赖。原因是现有功能集、运行栈、远程服务成本及上游状态与本面板不同。
5. 手机能显示响应式 UI 与手机能安全访问主机是两项验收。桌面 shell 不应迫使手机承担文件扫描和 CLI 凭证职责。

## F. 调研动作与失败记录

- 阅读了以上原始 README、官方网页和精确源码；通过 GitHub tree API 定位 Orca 路径，没有 clone 整仓或安装应用。
- 初始猜测的 `t3-oss/t3code` README 与 GitHub API 返回 404；后续确认正确仓库为 `pingdotgg/t3code`。猜测的 `docs/architecture.md` 亦 404，改读 README 指向的 `docs/internals/overview.md`。
- 部分广泛搜索/源码批量输出被工具截断；核心结论均通过后续精确文件或官方页面重新读取，不以截断搜索片段作为证据。
- root 的 Codex 真实额度 probe 返回 `-32603`，不能声称额度已可用；该失败未解释其具体原因，当前应显示不可用。清洗结果确认仅 initialize、initialized、account/rateLimits/read，己方进程已停止。
- 未验证任何第三方桌面安装包、账户连接或收费操作；未读取或外传本地凭证、项目正文、私人会话。

## G. 不确定点

- U1：用户 `ocra` 是否确指 stablyai/orca，`dsh` 是否确指 DeepSeek Harness。当前候选与描述吻合，可推进可逆架构工作，不能删除此语义不确定性。
- U2：本机 Codex rateLimits/read 已实测 unavailable / `-32603`；失败具体原因尚未确认。不能由该错误推断未登录或自动替用户重新登录。
- U3：用户 Grok 的产品、套餐与 CLI 安装/登录状态。官方网页存在额度 UI 不等于有稳定外部查询 API；初期不可伪造百分比。
- U4：DSH/Grok/Claude 的本机版本、发现结果、会话恢复与进度状态能否取得。需本地 adapters 的能力探测和契约验证。
- U5：手机远程访问的网络、设备认证和常驻主机边界。响应式预览能独立交付；实际远程接入需另有运行证据。
- U6：本地日志对账号总消耗的覆盖率不可保证。数据应标明本机/已扫描日志，不能称跨设备完整账单。

## H. Readiness 最小核查证据

- Orca 核心：固定 SHA 的 `tui-agent-config.ts`、`acp-launch-specs.ts`、`structured-agent-registry.ts`，可验证能力分层和 DSH/Grok 差异。
- Codex：官方 App Server 文档 + root 的本机 0.118.0 schema 探测；两者版本范围必须同时保留。
- 用量：Orca Codex parser/delta 与 Grok fetcher；Claude 官方 costs/monitoring；xAI billing/FAQ。
- 跨端：T3 内部架构和 remote-access、Orca cloud README，明确主机与客户端边界。
- 仍未关闭：U1–U6；U2 已有不可用事实而原因未定，U4 可继续通过本机只读事实收集，U3/U5 不妨碍本地工作台与真实未知态实现。

## 跨功能事实（待确认）

- [2026-10-13] Agent 的发现、历史观察、结构化控制、额度读取是不同能力；缺失能力默认不支持。
- [2026-10-13] 订阅额度、API 账单、本地日志 Token、估算费用需要分别标注数据来源与覆盖范围。
