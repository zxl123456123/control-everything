# Claude 会话查询与终端定位接口核查

调研日期：2026-10-03。角色：repo_researcher。只读核查本地工作台和官方资料；本 agent 未连接远端、未改产品、未安装 SDK/Hooks、未执行 focus 或输入注入。范围以 [clarifications.md](clarifications.md) 的会话关联基线为准。

## A. 系统边界与现有能力

当前已有会话可以先读原生 PID 注册，不必先装 Hooks。这是协调者与远端研究的观察结论，证据为 [会话绑定验证](E:/project-funny/mianban-develop/work/session-binding-verification.json)；本 agent 不将该快照宣称为持续采集、面板查询或 MCP 已实现。

三类信息不能混同：真实 `sessionId` 标识对话；PID/注册记录支持当前实例关联；Zellij session/pane 标识用于终端定位。目录、标题和 JSONL 修改时间都不足以代替唯一对话身份。

## B. 入口与主流程

| 本地证据 | 已观察到的事实 |
| --- | --- |
| [Start-TerminalWorkbench.cmd](D:/terminal-workbench/Start-TerminalWorkbench.cmd:15) | WezTerm 启动 Zellij，attach `workbench-v4`；不是旧快照中的 `work-for-linux`。 |
| [Ensure-WorkbenchTabs.ps1](D:/terminal-workbench/Ensure-WorkbenchTabs.ps1:75) | `Work-for-Linux` 缺失时用 `work-linux-tab.kdl` 建 tab。 |
| [work-for-linux.kdl](D:/terminal-workbench/config/zellij/layouts/work-for-linux.kdl:1) | 文件明示历史快照；其 main/dev/files 三 SSH 命令只能作候选证据。 |
| [pane.sh](D:/terminal-workbench/remote/pane.sh:14) | 按 slot 恢复目录；第 21 行导出 `TWB_CWD_FILE`，第 22 行启动交互 Bash。没有 Claude session 注册代码。 |
| [rc.sh](D:/terminal-workbench/remote/rc.sh:5) | 每次 shell prompt 保存 cwd；不能据此证明某个 Claude 对话身份或运行状态。 |
| [wezterm.lua](D:/terminal-workbench/config/wezterm/wezterm.lua:56) | 配置保留 Zellij 为主工作空间。实际 WezTerm CLI 只返回一个外层 pane。 |

## C. 关键接口与证据边界

### 1. 已有 PID 注册与官方 CLI

协调者补充：远端 Claude Code **2.1.278** 有 `~/.claude/sessions/<PID>.json`，main/dev/files 三存活进程继承 `TWB_CWD_FILE`；其 PID、`sessionId`、cwd、`startedAt` 与 transcript 及本地 pane 在一次独立快照中闭合。详见 [远端研究](research_session_binding.md) 与验证 JSON。本 agent 未独立重跑远端探针。

原生注册是该安装版本的内部文件，未找到稳定公开 schema 承诺。官方 [CHANGELOG 2.1.247](https://github.com/anthropics/claude-code/blob/1c229fcd1e1e4e452e29a8f116b45fe4cfe2c528/CHANGELOG.md#21247) 提到 registry 更新失败的修复，可佐证其存在，不能据此保证完整性或持久性。

官方 [CLI reference](https://code.claude.com/docs/en/cli-reference#cli-commands) 提供 `claude agents --json`；[Agent view](https://code.claude.com/docs/en/agent-view#read-session-state-from-a-script) 推荐它读取背景会话状态，但同页说明其他终端的交互会话需先移入背景才出现在列表。协调者回传的远端 help 描述 interactive + background，实测 JSON 却漏掉存活 Files。**文档、help 与运行覆盖有差异，不当作全量来源。**

### 2. Hooks 与 statusline

官方 [Hooks](https://code.claude.com/docs/en/hooks#common-input-fields) 的 stdin JSON 提供 `session_id`、`transcript_path`、cwd；SessionStart 覆盖启动/恢复，其他事件可在已有进程的下一次触发时补 ID。最新文档说明设置文件变更通常由 file watcher 接入，但远端 2.1.278 的热加载行为未在本 agent 处验证。[Hooks 配置变化](https://code.claude.com/docs/en/hooks#disable-or-remove-hooks)

transcript 异步落盘，hook 触发时可能尚无最新消息；Stop 的 `last_assistant_message` 可提供当轮最后回答。Stop 只表示响应结束，不能表示进程退出或项目完成。[Hooks 输入与 Stop](https://code.claude.com/docs/en/hooks#stop)

官方 [statusline](https://code.claude.com/docs/en/statusline#available-data) 连续提供真实 `session_id`、`transcript_path`、version 和目录数据。它在特定事件时刷新，空闲期可能不更新；最新文档有 `refreshInterval`。这是一条可补注册的官方途径，但本轮未改现有设置，未验证远端支持范围。[刷新规则](https://code.claude.com/docs/en/statusline#how-status-lines-work)

### 3. 按 ID 读取历史：复用官方 reader

官方 [Sessions](https://code.claude.com/docs/en/agent-sdk/sessions) 区分 continue（目录最新会话）与 resume（指定 ID）。本目标是读取已有会话，不调用两者去重新打开进程。

[TypeScript 官方参考](https://code.claude.com/docs/en/agent-sdk/typescript#listsessions) 提供 `listSessions({dir, limit, includeWorktrees})` 与 `getSessionMessages(sessionId, {dir, limit, offset})`。metadata 包括 ID、summary、lastModified、fileSize、cwd、分支和标题，没有 PID 或活跃绑定。网页抓取超限后，改读其官方 `.md` 版本确认接口。

Python 官方 GitHub 本轮固定源码：`68db221ebe29c1d82b0001ae80fa71e10d57d80a`，其中 `_version.py` 写 **0.2.163**；尚未核对同版本已发布包及远端是否安装。

- [sessions.py:122](https://github.com/anthropics/claude-agent-sdk-python/blob/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/_internal/sessions.py#L122)：读取尊重 `CLAUDE_CONFIG_DIR`，默认 `~/.claude/projects`；公开读取函数未提供独立 `configDir` 参数。
- [sessions.py:680](https://github.com/anthropics/claude-agent-sdk-python/blob/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/_internal/sessions.py#L680)：列表直接读文件 stat/head/tail，默认含 git worktrees。查询同一个目录需注意该范围；目录会话可以多条，返回排序不代表当前活跃实例。
- [types.py:1743](https://github.com/anthropics/claude-agent-sdk-python/blob/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/types.py#L1743)：metadata 是轻读字段，不能充当完整会话或存活信息。
- [sessions.py:1059](https://github.com/anthropics/claude-agent-sdk-python/blob/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/_internal/sessions.py#L1059)：历史读完整 JSONL，经 `parentUuid` 链选择和可见消息过滤后分页。会跳过坏行、meta/sidechain/team 消息，保留压缩摘要；不能简单 flatten 全部 user/assistant 行。分页不等于只读取文件的一小段。

**最小技术选择（供规划消费，非实施方案）：** 当前身份关联先只读原生 PID registry 并核验活进程；无需为此安装 SDK。需要按 ID 显示对话历史时优先复用官方 reader，并验证固定版本与实际 transcript 的兼容性。轻量 JSONL adapter 可读取严格限定的观察字段，但不能冒充完整对话 reader；本轮不自制消息链。Hooks 留作后续更丰富事件状态，SDK 不承担终端绑定。

### 4. 实际 Windows Zellij 与 WezTerm

本机 `D:/terminal-workbench/apps/zellij/zellij.exe --version` 返回 **zellij 0.45.1**。完整只读命令：

```powershell
& 'D:\terminal-workbench\apps\zellij\zellij.exe' --session workbench-v4 action list-panes --all --json
```

结果 exit 0。过滤 `tab_name == Work-for-Linux && !is_plugin` 后：

| Zellij session | tab ID | 规范 pane ID | title | `terminal_command` 中可识别的 slot |
| --- | --- | --- | --- | --- |
| workbench-v4 | 1 | terminal_2 | Remote Main | `ssh.exe -t 175.24.135.125 bash ~/.local/share/terminal-workbench/pane.sh main` |
| workbench-v4 | 1 | terminal_3 | Remote Dev | 同上，末尾 `dev` |
| workbench-v4 | 1 | terminal_4 | Remote Files | 同上，末尾 `files` |
| workbench-v4 | 1 | terminal_15 | ◑ pipeline-results-diagnosis | null，不能凭标题猜绑定 |

标准三槽位与本地 SSH 命令一致，是本轮快照候选依据。JSON 没有 PID、`pane_cwd` 或 `pane_command`；表格 cwd 全为 `-`。上游 [Zellij CLI 文档](https://zellij.dev/documentation/cli-actions.html#list-panes) 展示的额外字段不能假定此 Windows 构建也返回。

- `action focus-pane-id --help`：exit 0，接受 `terminal_1` / `plugin_2` / 数字；仅查询 help，未执行定位。上游能力：[focus-pane-id](https://zellij.dev/documentation/cli-actions.html#focus-pane-id)。
- `action get-pane --help` 与 `action focus-pane --help`：均 exit **2**，unrecognized subcommand。
- `action list-clients`：exit 0，提供 client 的 focused pane 和命令，不提供进程 PID；不覆盖全部 pane。
- 两个本机 WezTerm CLI 路径的 `cli list --format json` 均只给 window/tab/pane **0/0/0**，cwd 空、tty null。CIM 确认实际 GUI 来自工作台路径并运行 `attach workbench-v4`；不能用该外层 pane 区分内层三个 SSH 对话。

终端定位需以当前 Zellij 清单为依据并区分 `terminal_` / `plugin_` 类型；本轮数字 ID 有类型重叠。新增 pane、重建 session、重复 slot 或 null 命令要保留未确认状态。

## G. 不确定点清单

- U1：内部 registry 的更新/清理和 PID 复用行为不是公开合同；固定 CLI 版本、存活进程及 startedAt 校验不足时必须保持 unknown。
- U2：协调者提及一个 argv session ID 与 registry 冲突；本 agent 未核实原始记录。冲突不能回退 cwd/mtime 猜测。
- U3：`agents --json` 文档与安装版覆盖不一致；当前不作为三槽位完整来源。
- U4：terminal_15 无命令信息；不能将本机另一个含 `--resume` 的 SSH 进程与它自动等同。
- U5：SDK 发布包版本、远端安装及 transcript 兼容性尚未核对；当前源码不是安装成功证据。
- U6：Hooks/settings watcher/statusline 的远端热加载与各字段支持未验证；首期已有 registry 观察不依赖它们。
- U7：持续采集、断连/过期语义、面板和 Codex 共用查询接口尚未实现。

## H. 最小可核查证据与失败

可独立复核本地启动文件的行号、上面的 `list-panes` 命令和固定 SHA reader；远端结论依赖 [research_session_binding.md](research_session_binding.md)、[clarifications.md](clarifications.md) 与 `E:/project-funny/mianban-develop/work/session-binding-verification.json`。协调者报告该快照验证 exit 0，不等同本 agent 复跑。

本轮保留的失败：Zellij 两个错误子命令各 exit 2；GitHub REST API 查询被 rate limit 拒绝，随后用 `git ls-remote` 获取固定 SHA；TypeScript HTML 文档抓取超 4 MiB，随后官方 Markdown 读取成功；一次 PowerShell `-match --` 语法错误 exit 1，修正后读取成功；cwd 的 `git status` 报非 Git 仓库 exit 1。未执行任何安装、远端连接或终端输入动作。

跨功能事实：无新增待写入全局规则的事实。
