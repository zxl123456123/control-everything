# Codex 会话来源只读调研

日期：2026-10-04；范围：现有代码、CLI 帮助、SQLite 只读元数据、官方 OpenAI 文档。未实施接入。

结论：本机具备真实 Codex 线程索引，可支持“这个机器人对应哪条聊天、哪个项目”。现有面板尚未接入它，也没有证据证明能读取桌面 Codex 的实时工作状态。不能宣称 Codex 与 WezTerm 的真实会话已经同时验收。

## 现有实现

- `session_panel/source.py` 只有固定远端 Claude 来源 `ubuntu@175.24.135.125:/home/ubuntu/.claude`。
- `SessionService` 只有远端注册/进程采样与 Zellij pane 合并；消息也由远端 reader 读取。
- `gateway.py` 的 `/api/sessions` 与 UUID 路由调用该单一服务，没有 Codex reader 或线程聚合。
- README 中 `remote_claude_sessions` MCP 的方向是 **Codex 读取面板中的远端 Claude 会话**，不代表面板读取 Codex 对话。
- 所以现有 Python/浏览器测试不能证明 Codex 机器人接入；此前真实终端定位未验收也不能由 fixture 覆盖。

## 本机实证

本机 CLI：`C:/Users/ZXL/AppData/Local/OpenAI/Codex/bin/8aaf1547b825b104/codex.exe`，`--version` 为 `codex-cli 0.160.0`。
SHA256：`37762753B554982EEF1C109303D1BE652B6397F1479E844794353A85650199C6`。

SQLite 均以 URI `mode=ro` 打开，并设置 `PRAGMA query_only=ON`；未读取正文、标题、preview、first_user_message、item_json、auth 或配置值。

| 实际来源 | 本轮结果 | 能支持什么 |
| --- | --- | --- |
| `C:/Users/ZXL/.codex/state_5.sqlite` 的 `threads` | 14:33 UTC 采样 369 行：365 未归档、4 归档；此前采样 368 行 | ID、cwd、创建/更新时间、归档状态、来源类型 |
| 同表 `source` | CLI 19、exec 3、vscode 94、subagent 253 | 区分交互聊天与子 agent；不能把全库都当用户当前任务 |
| `thread_history_1.sqlite` | 存在 `thread_turns.status/started_at/completed_at` 与条目正文表 | 版本相关的历史投影；正文不需要用于最小机器人接入 |
| `thread_turns` | 42 条 `inProgress`；17 条开始时间超过 24 小时 | 状态会残留，不能直接解释为 42 个活跃任务 |
| 当前根线程 `01a10013-6a9b-71f0-9878-89ce70e5a495` | state 更新时间为本轮，history 最新投影仍为 2026-10-03 18:18:40 UTC 的 `interrupted` | 历史投影可明显落后于正在进行的真实聊天 |

项目 cwd 实际含 Windows `\\?\` 前缀。未来匹配需要明确处理该前缀与路径大小写；不能凭标题、文件夹名或“最近修改”猜绑定。

证据：

- [线程 schema/计数与项目 ID](E:/project-funny/mianban-develop/work/codex-conversation-source-metadata-r1.json)
- [投影状态与当前根线程对照](E:/project-funny/mianban-develop/work/codex-conversation-source-projection-r1.json)
- [控制 socket 只读探测](E:/project-funny/mianban-develop/work/codex-conversation-source-control-probe-r1.json)

## 官方接口与当前连接边界

官方 App Server 支持 `thread/list`、不 resume 的 `thread/read`、运行状态与状态事件；`includeTurns:false` 可省略 turns，`useStateDbOnly:true` 避免默认日志扫描修复。状态属于所连接的 app-server；不能另开进程后推断原桌面会话不活跃。来源过滤、归档过滤与分页均有现成接口。[官方 App Server 文档](https://learn.chatgpt.com/docs/app-server)

本机帮助存在 `app-server proxy --sock`，用于连接已运行的控制 socket；另有只读 `app-server daemon version`。本轮后者单独捕获的退出码为 **1**：默认 `C:/Users/ZXL/.codex/app-server-control/app-server-control.sock` 连接失败，`os error 10050`。没有启动、重启、bootstrap、resume 或配置修改。该失败不等于桌面 Codex 没运行，证明本轮没有建立可用于网关的既有 RPC 通道。

当前 agent 可调用的 `list_threads/read_thread/wait_threads` 是 Codex app 工具；本轮未调用它们读取聊天内容。工具可用不等于普通 Python 网关自动获得同样的权限或调用入口。现有代码没有这个桥接。

官方明确 `thread/read` 不订阅；状态事件对应 loaded thread，不能只调用历史读取便声称持续实时监控。[官方状态与读取说明](https://learn.chatgpt.com/docs/app-server)

## 最小接入候选与未决事实

1. **可立即规划的本机只读 metadata reader**：固定数据库、显式列清单、小页查询、归档过滤、交互来源过滤；用 `codex-local:<UUID>` 与远端 Claude 来源区分。只提供历史/已索引身份，`activity_state=unknown`，明确采样时间和失败状态；不读正文也能安排位置与装饰性行走。
2. **实时状态优先选既有官方 app-server 通道**：下一步先确认本机桌面实际控制 endpoint 与连接范围，再使用官方只读方法；本轮控制 socket 失败，不能先承诺实时支持。不要为监控启动第二个 server、resume 老聊天或让观察者持有审批/发送能力。
3. **不采用全量 rollout 扫描作为默认接入**：路径/SQLite 版本/投影迁移都是内部实现；正文包含私密内容且成本高。官方接口优先，SQLite metadata 只作为明示限制的本机候选。只看文件更新时间无法证明活动。

`archived=0` 只是未归档；`updated_at` 是存储更新；过去某轮 `completed` 只是那轮结束，均不等于项目完成。自由移动、呼吸、光粒子必须标为装饰，不能冒充工作状态。

真实 Codex ID 点击不能传入现有远端 Claude 消息或 pane focus 路由。未来需独立来源分派；消息正文可在用户明确选择该线程时有界读取，最小身份监控不需要扩大正文读取范围。

验收应使用至少一条实际桌面 Codex ID 与一条实际远端 Claude UUID，分别核对身份、来源、归档、断连/过期；有实时通道后再核对 idle/active/等待状态。当前没有这组真实端到端证据。

本轮调查中错误的 `D:/Enviroment/Nodejs/codex.cmd` 路径调用失败，后改用上述实际 CLI 路径；宽 schema 输出曾截断，随后精简查询并保存完整允许字段的证据。控制 socket 失败保留，未为消除失败更改环境。
