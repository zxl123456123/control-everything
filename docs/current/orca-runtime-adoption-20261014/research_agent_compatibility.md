# Orca、Pi 与 Hermes 接入能力补充调研

日期：2026-10-14；角色：repo_researcher；受众：共享。状态：只读源码／官方文档调研，未安装、启动 runtime 或模型，未访问账号和私人会话。本文不授予实施或运行验收。

## A. 系统边界与直接结论

**Orca 固定快照已经有 Pi 和 Hermes 的终端启动配置；这不能当作二者已经具备完整的 Orca 结构化聊天接入。** Pi 自身提供 RPC／SDK，Hermes 自身提供 ACP，因此有结构化集成基础；是否被指定 Orca 版本适配，以及审批、恢复、取消的语义，仍须逐项核对。

Orca 证据固定到 `aceebea0a4453f63d759af9134503220ce0b4753`（原研究 package 版本 1.4.214）。本轮没有核实最新 main 是否变化。Pi 和 Hermes 文档读取的是 2026-10-14 的 main／官方站点动态内容，未固定其提交，不能把其最新协议套到上述 Orca 快照。Pi 原 `badlogic/pi-mono` 官方 GitHub 地址现重定向至 `earendil-works/pi`。

| Agent | Orca 固定快照已观察 | Agent 自身的接口事实 | 不能宣称 |
|---|---|---|---|
| Pi coding agent | `tui-agent-config.ts:136` 有 `pi`，argv 提示词、`ORCA_PI_PREFILL` 草稿和 Windows CSI-u 换行处理 | 官方有 `pi --mode rpc` 子进程 JSONL 协议及进程内 TypeScript SDK | Pi 在 Orca 已经有完整结构化 adapter；本轮未定位全部注册调用方 |
| Hermes | 同文件 `:286` 检测 `hermes`，启动 `hermes --tui`，使用 `hermes-query` 启动提示词合同 | 官方 `hermes acp`／`hermes-acp` 提供 ACP stdio，含工具活动、审批和流式输出 | 终端启动配置会自动选择 Hermes ACP |
| Grok／OpenCode／OMP | `ACP_LAUNCH_SPECS` 完整数组只列这三者；分别 `grok agent stdio`／`opencode acp`／`omp acp` | Orca 已有对应 dialect、账号绑定、发现与部分版本门槛 | OMP 等同 Pi；支持任意 ACP Agent 的纯配置热插拔已具备 |
| Codex／Claude | 既有调研已核实专用 structured definitions／adapter 路线 | 各自协议和账号目录专用 | 与所有终端 Agent 能力等价 |
| Gemini、Cursor、Copilot、Kimi、Goose、Aider、DSH 等 | TUI 配置表有各自 CLI 检测／启动条目；本轮定向读取看到这些条目 | 各自结构化接口未在本轮逐个调研 | 出现在菜单就代表统一审批、精确恢复、额度查询都可用 |

证据：[Orca TUI 配置](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/shared/tui-agent-config.ts)、[ACP launch specs](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/acp/acp-launch-specs.ts)、[Pi 官方仓库](https://github.com/earendil-works/pi)、[Hermes ACP](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/acp.md)。

## B. 入口、生命周期与差异

- Orca `StructuredAgentRegistry` 根据注册对象组合 definition 和 adapter；声明 compact／threadGoal／rewind 而 adapter 没有相应方法时拒绝注册。本轮读取的是 registry 实现，未遍历所有构造调用方，故不能用它证明 Pi 专用 adapter 一定不存在。[registry 源码](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/native-chat/agent-session-wire/structured-agent-registry.ts)
- Orca ACP definition 的 rewind／threadGoal 为 false，steering 为 queue；是否带图、是否 compact 取决于 spec。审批是回答 Agent 发来的请求；请求何时产生仍由 Agent 决定。[ACP definition](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/acp/acp-structured-agent-definitions.ts)
- Pi RPC 的命令响应与运行事件分开；prompt 成功只是接受／排队／处理。最新文档明确 `agent_end` 后还可能自动重试／压缩／继续，稳定终止观察 `agent_settled`。持续读取 stdout 并处理背压是协议要求；关闭 stdin 请求有序退出。这些是 Pi 当前协议事实，尚无匹配 Orca 适配验证。[Pi RPC](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)
- Hermes ACP 当前文档说明会话正文持久化到 Hermes 数据库，可跨 ACP server 重启 list／load／resume／fork；空会话探测不等于产生有效历史。审批 timeout／error 时 deny；实际是否展示给人类取决于 host，不能只因线上有 permission request 就认为有人审批。[Hermes ACP](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/acp.md)

## C. 关键模块、账号及 Windows 边界

- Orca ACP `AcpLaunchSpec` 包含 command/args/env、account pin、dialect、版本准入、modelDiscovery、sessionHistory。添加 Agent 不是只填显示名称；代码注释允许新增 spec，并为协议扩展补 dialect。OpenCode 支持源码规定的稳定版本线；OMP 起点为 17.0.5；不能由此承诺未来版本全部兼容。
- Hermes ACP 使用 Hermes 自身配置、凭证、memory、skills 和 state；全局配置的 MCP 默认可能在 ACP 初始化前启动，最新文档有专用 host marker 控制跳过全局 MCP 发现。独立 Orca profile 并不隔离这些外部状态。[Hermes ACP](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/acp.md)
- Hermes 当前官方文档明确支持原生 Windows 10／11，TUI 可用；不能沿用“只能 WSL”。MSIX 包另要求 Windows 11 22H2+，native 与 WSL 数据目录不同，部分可选依赖仍有平台限制。本轮没有安装验证。[Windows 官方指南](https://hermes-agent.nousresearch.com/docs/user-guide/windows-native)
- Orca 的 Node secret store、CLI serve 默认宽监听、Windows service 限制及本机尚未接入事实继承 [原研究](research.md)，本轮不重复实机测试。Agent 自有 browser、MCP、子代理等可产生额外子进程；“一会话一个进程”的资源估算不能覆盖全部后代（基于已读 Hermes toolset 的推断）。

## G. 不确定点清单

| 编号 | 未关闭问题 | 需要的证据 |
|---|---|---|
| AC1 | 固定 Orca 版本全部 structured registrations 中是否另有 Pi／Hermes 专用实现 | 完整追踪 registry 构造调用方和 host capability 响应；本轮只证明 ACP spec 表没有它们 |
| AC2 | 最新 Pi／Hermes 与固定 Orca 的兼容版本组合 | 固定双方版本，先无账号协议 fixture，再有授权范围的实际生命周期验收 |
| AC3 | Windows 终端输入、native dependency、取消后子进程清理 | 指定平台/安装方式验证启动、断连、取消、退出；不能由 Windows 文档直接关闭 |
| AC4 | Provider home、memory、MCP、凭证和自动发现的隔离范围 | 启动前代码及环境合同核对；不读取用户凭证补证 |
| AC5 | 历史恢复、费用、审批和取消是否同等级可用 | 按能力矩阵逐项记录 observed／unsupported／unknown，不以进程退出推定任务成功 |

## H. 最小可核查证据与本轮失败

最小锚点：Orca `tui-agent-config.ts:136/:286`；`acp-launch-specs.ts` 完整导出数组及 `AcpLaunchSpec`；`structured-agent-registry.ts` 的 capability validation；Pi RPC run lifecycle；Hermes ACP configuration／session／approval；Hermes Windows feature matrix。

工具情况：GitHub tree API 返回 rate-limit（shell exit 1）；GitHub tree 网页浏览 restricted URL；首次 TUI 广泛匹配导致输出截断，随后精确读回 Pi／Hermes 块（exit 0）；固定 raw 源码与官方 Pi／Hermes 文档读取成功。网页搜索命中不少 fork／镜像，事实未依赖这些二手结果。部分 GitHub 仓库页输出截断，关键结论另用专门文档取证。没有运行 runtime／模型测试，无产品源码改动。

无新增跨功能事实；账号隔离和能力分层已由原研究覆盖。
