# 远端 Claude Code 会话关联调研

日期：2026-10-03。范围：已保存的 ubuntu@175.24.135.125，只读核验现有会话；未部署采集器、修改设置、恢复或终止进程。

## A. 系统边界与现有能力

**观察**：SSH 在 BatchMode=yes、ConnectTimeout=10、ServerAliveInterval=10、StrictHostKeyChecking=yes 下成功，退出码 0。远端 /usr/local/bin/claude 指向 /usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe；版本 2.1.278，版本命令退出码 0。

**观察**：已安装版本原生维护 ~/.claude/sessions/<PID>.json，抽样时有 6 条记录，包含 pid/sessionId/cwd/startedAt；/proc 中有 11 个 Claude 相关进程。不能把 11 个进程当成 11 段对话。transcript 根目录有 374 个 JSONL，其中 UUID 文件名的主会话记录 168 个。

## B. 入口与真实身份链

**观察**：三槽位均满足「PID 注册文件 → 活进程 → 同 UUID transcript」的核对，cwd 一致，transcript 顶层 sessionId 与文件名一致。进程继承的 TWB_CWD_FILE 分别指向 main/dev/files.cwd，识别依据没有使用“最近文件”。

| 槽位 | 活 PID / 远端 TTY | 注册 sessionId | cwd |
|---|---|---|---|
| main | 2059992 / pts/3 | b7ed3430-9064-4153-894d-d295a388a572 | /srv/projects/n8n_test |
| dev | 2033737 / pts/2 | 125d23ce-04a0-4f6f-a56a-cfb1dcba7260 | /srv/projects/workflow-for-coding |
| files | 2023927 / pts/1 | 6ee281b5-e4f7-43ce-b1b7-92da287e5809 | /srv/projects/n8n_test |

三条注册 startedAt 比对应 /proc 进程启动晚约 1.51、1.54、4.16 秒。main 与 files 在相同目录中，身份仍由不同的 sessionId 明确区分；该目录共有 37 个历史 UUID 候选，cwd+mtime 不唯一。

**协调者独立证据，非本调研 agent 复跑**：协调者报告 work/verify-session-binding.py 于 2026-10-03T07:31:01UTC 退出码 0，仍核对相同三条会话，并关联 Zellij main→terminal_2、dev→terminal_3、files→terminal_4；comm 均为 claude，cwd 匹配，每条 transcript_count=1。最初远端 evidence 的 outer_mux 字段为空，保留原始快照，不将后续外层核验伪装为当时已观察到的事实。

## C. 关键来源与职责

- 本地 work-for-linux.kdl：保存主机和 main/dev/files 启动入口；静态布局本身不证明当前 pane。
- 远端 pane.sh / rc.sh：导出 TWB_CWD_FILE 并记录槽位 cwd。两文件 SHA256 与本地 D:/terminal-workbench/remote 对应文件完全一致。
- ~/.claude/sessions/<PID>.json：本版本已存在的进程与会话注册元数据。
- /proc/<PID>：核验活进程、父进程、TTY、cwd、进程启动和四个允许的环境变量。
- ~/.claude/projects/*/<UUID>.jsonl：只提取顶层 cwd/sessionId 与文件 mtime/大小，不返回对话正文。

**观察**：用户设置和已检查项目设置中无 Hook 事件、未设 statusLine；检查的 /etc/claude-code/managed-settings.json 不存在。不据此宣称所有运行时配置来源均已审计。已采样进程没有可读取的 transcript FD，也没有包含 UUID 的 ~/.claude 文件描述符。祖先 bash 继承同一 TWB_CWD_FILE，远端允许环境变量中未发现 ZELLIJ_PANE_ID 或 WEZTERM_PANE。

## D. 原生 CLI 的实际覆盖

**本 agent 后续观察**：claude agents --help 退出码 0，已安装 2.1.278 的帮助说明 --json 会输出 active sessions，包含 interactive 和 background。只有确认该选项存在后，才执行 agents --json；后者退出码 0，返回 5 条安全过滤记录，包含 main/dev 和另外 3 条，遗漏仍存活的 files PID 2023927。仅保留 sessionId/pid/cwd/status 与字段名，未返回 name/title/messages。

**未知**：遗漏 files 的筛选原因。不能将 CLI 列表缺失解释成会话退出，不能因其他版本官方描述不同而覆盖本机帮助和实测结果。这两次后续 CLI 结果记录于本报告；主 evidence 保存的是此前四次 SSH 元数据探针快照。

## G. 推断与不确定点

**推断**：三槽位现有元数据在观察时间形成一致的身份链，已有会话具备不重启、不 resume 的补绑事实基础。这不等于持续监控、消息查询或终端跳转产品已实现。

- U1：内部 sessions 注册格式及更新生命周期的跨版本稳定性；需官方接口资料或后续兼容验证。
- U2：PID 2904558 的启动参数 --session-id 为 be09bcc4-50d5-422b-851a-7de48d5517e4，而注册与 transcript 为 6557194c-f278-4d14-a5b5-82fe10a5020e。冲突原因未知，不能以启动参数替代当前注册身份。
- U3：PID 3524213 的注册 startedAt 比进程启动晚约 7.54 天。可能存在进程复用（推断）；不能将所有注册 startedAt 当作进程出生时间。
- U4：agents --json 不完整覆盖现有目标槽位；缺失原因和状态语义仍需查证。
- U5：对话真实任务进展、完成状态和按 ID 读取完整消息均未验收；busy/waiting 只属于 CLI 状态快照。
- U6：远端快照后的进程变化与所有有效配置来源仍未知；快照不能冒充实时接入。

## H. 最小可核查证据与失败

主证据：../../../work/live-remote-session-evidence.json（仓库根 work 目录；该相对显示仅用于说明，准确路径为 E:/project-funny/mianban-develop/work/live-remote-session-evidence.json）。

JSON 锚点：probes[].id/exit_code/output、bindings、local_sources.remote_files_match_local、failed_or_partial_checks、safety。四次 SSH 探针全部退出码 0；6 条注册记录均再核对活 PID、cwd 和一份对应 transcript。复读本地 JSON 的命令退出码 0。

**保留失败**：git status 在目标目录报 “not a git repository”，显式复核退出码 128；首次外围 PowerShell 的后续命令曾将整体退出码显示成 0，已在证据中单独说明，不当作成功。若干 root 所属祖先进程的 exe/cwd/environment 返回 PermissionError；未提权。

调研只写主 evidence 和本文。没有读取私钥、凭据或返回完整环境、任意命令行及消息正文；没有输入注入、审批代答、进程终止、resume、升级或产品配置修改。readiness 仍需独立评审，未知项不能被当作已验收能力。

## 跨功能事实（待确认）

- [2026-10-03] 远端已安装 Claude Code 2.1.278 维护 PID 会话注册；同 cwd 可存在多个会话，CLI 列表、启动参数和注册记录可能覆盖不同。此事实具有版本边界，尚不能当作跨版本合同。

