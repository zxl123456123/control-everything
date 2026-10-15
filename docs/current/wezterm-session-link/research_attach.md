# WezTerm / Zellij 运行实例连接机制调研

日期：2026-10-04（Asia/Shanghai）。角色：repo_researcher。范围：只读文件、版本/help、CIM 与官方文档/固定版本源码；未执行 GUI 启动、attach、watch、focus、HTTP 网关请求、SSH、输入发送、配置/安装或 Git 更改。本文是事实调研，不是低层方案或实施授权扩展。

## A. 系统边界与现有能力

用户最新原文“继续”确认上一轮提出的固定工作台连接、显式 UUID 定位及连接状态展示，保留原文偏好“自动实施代码即可现在”。必读本批 README 明确：仅连接当前 RUNNING 的 `workbench-v4`，不复活 EXITED、不创建缺失 session、不重放旧命令、不补建标签。机器人旧批与父批 Q6 的验收状态独立保留。

**本次没有找到同时满足“交互式、固定当前实例、实例退出立即失败、绝不复活/创建”四项条件的 Zellij 0.45.1 官方 CLI 入口。**这是对实际版本入口和已查源码的限制判断，不能扩大成所有未来版本/私有 API 都不存在。（推断）

已查到的现成机制各有边界：

| 入口 | 已核查事实 | 对本批边界的影响 |
| --- | --- | --- |
| `attach workbench-v4` | 命名入口先读 active 与 resurrection cache；无 `--create` 仍可能选择 Resurrect | 不能充当仅连接运行实例的入口 |
| `attach --index N` | 只按 active 列表选择；无 create 时空列表/越界 exit1；明确忽略 session_name | 可避开该入口的 resurrection 分支，但不是固定会话/实例选择 |
| 无名字 `attach` | 当前只有一个 active 时选择该名字；无 active 或多个时 exit1 | 不复活命名缓存，但其他 session 可改变选中目标 |
| `watch workbench-v4` | 只查 active 匹配，发送 AttachWatcherClient，不创建/复活 | 只读，不能替代继续开发所需的交互客户端；也不钉住实例 |
| `--session workbench-v4` 单独启动 | 帮助写新会话名字，源码走 New 并检查名称冲突 | 不是 attach-only |
| `options --session-name … --attach-to-session true` | config 名字入口传 create=true；目标不存在走 New | 不是 only-running；不应通过改配置绕过本批边界 |
| `--session … action …` / `subscribe` | 针对 active 会话发送 action 或订阅 pane 输出 | 原 focus 等 action 可继续沿用；不建立交互式 GUI 客户端。subscribe 会采正文，本批未运行 |
| WezTerm `start --domain … --attach` | WezTerm 自身 mux domain 的 attach 语义 | 不能把它当作 Zellij session 的 attach-only 参数 |
| 原工作台启动器 | 使用 create、force-run-commands，随后 EnsureTabs | 同时有新建、复活、命令运行和补标签行为，不符合本批入口 |

Zellij 官方[Session Resurrection](https://zellij.dev/documentation/session-resurrection)明确说明 attach 可复活退出会话；force-run-commands 是跳过命令暂停屏的控制，去掉它并不能禁止复活。[Commands](https://zellij.dev/documentation/commands)仅给常规连接说明，必须结合实际版本源码判定失败路径。

## B. 入口与主流程

官方 release `v0.45.1` 指向固定 commit **`efd8fd5a89a20c07a111d248ad7fce53848d2c18`**，2026-08-28 发布。证据：[发布页](https://github.com/zellij-org/zellij/releases/tag/v0.45.1)、[固定提交](https://github.com/zellij-org/zellij/commit/efd8fd5a89a20c07a111d248ad7fce53848d2c18)。官方 0.44 已引入原生 Windows 支持，不能因为 Windows 就假定本机来自 fork。root 按受控请求实际取得官方 EXE SHA 文本，和本 agent 独立计算的本机 SHA 完全相符；U1 的 release 字节匹配已关闭，不声称本机存在可复现构建源码。[官方 Releases](https://github.com/zellij-org/zellij/releases)

匹配版本的源码主流程（以下行号为 one-based）：

- `src/main.rs:17-20` 在解析 CLI 前调用缓存目录初始化；`237-238` 分派 watch，其余常规入口最终进入 start_client。
- `src/commands.rs:351-368,502-519` index 分支读 active 列表，无 create 时不选择 New；**`503` 明确注释 index 忽略 session_name**。
- `src/commands.rs:713-757` index 与命名入口分叉；命名入口 `720-750` 的 Resurrect 条件只要求 active 不存在且有 resurrection layout，不要求 create=true。
- 命名 active 匹配支持 exact 与 unique prefix（`commands.rs:534-537`，`sessions.rs:396-415`）。如果精确工作台在检查后消失，而出现 `workbench-v4-other`，普通命名 attach/watch 可改为唯一前缀结果。（推断）
- `commands.rs:921-989` watch 只创建 Watch 客户端；没有 Resurrect/New 分支。
- `zellij-client/src/lib.rs:954-1017` Attach/Watch 建立 IPC、发送 AttachClient/AttachWatcherClient；`1019-1111` 的 Resurrect/New 才 spawn_server。
- **`zellij-client/src/os_input_output.rs:284-300` 连接失败时每 50 ms 重试，未设置退出上限**。这是共享实现，Windows 分支只替换 setup_ipc 等辅助函数。目标在 resolve 后退出，会进入等待；若同名 socket 后续重新出现，可连接不同实例。（推断）

固定源码：[commands.rs](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/src/commands.rs)、[sessions.rs](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/zellij-utils/src/sessions.rs)、[client/lib.rs](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/zellij-client/src/lib.rs)、[client/os_input_output.rs](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/zellij-client/src/os_input_output.rs)。

因此 preflight 命名/PID 检查不能把普通 attach 变成无竞态的只连当前实例；检查与 Zellij 自己选择/连接之间没有原子约束。超时/后验状态可缩短等待、发现错误，却不能撤销已经误连或已经复活的副作用。（推断）

## C. 关键模块与职责划分

| 证据模块 | 职责/观察 |
| --- | --- |
| `zellij-utils/src/cli.rs:58-100,304-365` | CLI schema。Attach 无 only-running、expected-pid、expected-instance、socket-path 参数；Watch 仅 session_name。隐藏 server 参数用来启动服务器，不是客户端定位 |
| `zellij-utils/src/sessions.rs:117-199` | active index 按 marker mtime 排序；Windows active probe 只读 PID 并 OpenProcess 查询存活，失败还会清理 marker。不是 server 实例身份握手 |
| `zellij-utils/src/consts.rs:230-249,348-367` | Windows IPC 名称来自完整 socket path；marker 内容是 server PID；ZELLIJ_SOCKET_DIR 是目录＋contract_version 子目录，不是 PID/token pin |
| `zellij-client/src/lib.rs:400-434` | 根据 socket 目录＋session_name 形成路径，没有 expected-instance 条件 |
| `zellij-utils/src/ipc.rs:171-180,248` | AttachClient/AttachWatcherClient 字段没有期望 server PID/启动时间；Connected 回应也不携带此约束。文件中另有 Session.id 类型不等于 CLI 可用 pin 参数 |
| `D:/terminal-workbench/Start-TerminalWorkbench.cmd` | 命中已有 GUI 则激活且 EnsureTabs；无 GUI 则启动现有配置并执行 attach create/force，再 EnsureTabs |
| WezTerm `start` | 可以把指定 PROG 放进 GUI；no-auto-connect 限制自动 domain 连接，always-new-process 避免复用别的 GUI，两者都不能更改 Zellij 的目标解析/复活语义 |

证据：[cli.rs](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/zellij-utils/src/cli.rs)、[consts.rs](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/zellij-utils/src/consts.rs)、[ipc.rs](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/zellij-utils/src/ipc.rs)、[WezTerm start](https://wezterm.org/cli/start.html)。

## D1. 本机版本与当前采样

以下是本 agent 本轮读取的状态，不能作实施时的固定 PID：

- Zellij 路径 `D:/terminal-workbench/apps/zellij/zellij.exe`，**50,513,920 B**，`--version` 实际 `zellij 0.45.1` / exit0，SHA256 **`7C34F38921E6884873A9922BFDD4907F4D68FD0A2DD930CE357E4C7CB23F6F42`**；Authenticode 为 NotSigned。
- CIM server PID **5612**，父 PID **100412**，ExecutablePath 上述二进制，CommandLine 为 `"D:\terminal-workbench\apps\zellij\zellij.exe" --server C:\Users\ZXL\AppData\Local\Temp\zellij\contract_version_1\workbench-v4`；CreationDate 输出 **2026/9/27 1:03:50**（本机展示格式，不把它冒充 UTC）。
- marker `C:/Users/ZXL/AppData/Local/Temp/zellij/contract_version_1/workbench-v4` **4 B**，正文 **5612**，SHA256 **`90FE2C25CC8B9530BD60A2B198CE85C53B06521848C81BA9ECB2A7F57E3C06D8`**。该目录当前仅此文件；这是观察，不保证选择时仍只有一个。
- `apps/zellij` 当前只含 zellij.exe；`build` 当前仅 `cnmplayer-target`，没有观察到 Zellij 源码。定向本机 docs/data 调用未找到安装来源/hash manifest。
- WezTerm `D:/terminal-workbench/apps/wezterm/wezterm-gui.exe` **71,696,384 B**，SHA256 **`4D3B70097031209C7C19792197DEFEC6BC84E7B996B155A2A4478266562FE9FC`**；`--version` 输出 **`wezterm-gui someone forgot to call assign_version_info`** / exit0，因此可靠版本/提交未知，不能据最新版假定本机功能。
- 未运行 list-sessions/list-clients/list-panes。root 的既有观察仅见本批 README，不冒充本 agent 的独立命令结果。

## D2. 参数/配置边界与最小已有替代

已查现成入口仍不足以承诺强约束。普通命名 attach 配上 preflight 会保留复活竞态；index 配上当前名称会忽略名称并保留索引变化风险；更换缓存环境不能解决前缀/同名替换及无限 retry。修改全局 serialization、删除缓存/marker、迁移 socket、替换/编译 fork 或移植 IPC 均不属于已授权的最小集成。

为了不把已知限制混成“完全没有可用候选”，严格分成三个结论：

**A. 无复活/无创建**：在首次入口没有 create/create-background、没有初始命令且不走随后 SwitchSession 路径的前提下，`attach --index N` 可由源码严格证明只构造 Attach，空列表/越界 exit1，不查 resurrection、不 spawn 新 server。**无名字的普通 `attach` 也是成熟候选**：`commands.rs:720-733` 的 session_name=None 使 active名查找与 resurrection_layout 均为空；`740-750` 不匹配 Resurrect；`752-755` 调用 attach_with_session_name(None,…,false)，`563-574` 仅一个 active 时 Attach，零或多个 active 均 exit1，完全不构造 New。它比 index 增加了多 active 时直接失败的既有语义，不能将此事实误写成命名 attach 的无复活保证。此保证与 B 不等价。用户连接后可主动使用 session-manager 切换其他 session，源码 reconnect 会改为 create=true；本文不把连接入口保证扩大为限制用户整段终端交互。

**B. 当前工作台原实例选择**：本轮 marker 目录仅 workbench-v4，当前 `index 0` 或无名字 attach 的目标与工作台一致，不能说二者必然不匹配。风险在快照到 GUI 子进程实际选择之间：active 顺序/集合可能变动，index忽略name；无名字 attach 遇多个active会失败，但如果原工作台消失而另一个session成为唯一active，仍可选择另一名字。选中名称到 IPC 连接之间，同名实例也可能替换。现有 API 不提供名称＋instance pin 的原子约束。（推断）

**C. 连接后身份确认**：marker PID、CIM ExecutablePath/CommandLine/CreationDate、实际 client census 及其 window/process 关联可以后验佐证仍为原工作台，不能证明瞬间没有误连，也不能通过后验把已发生副作用撤回。（推断）本 agent 未调用 census，因此没有声称 C 已通过。空 stdout、坏 header、无法解析的输出不能自动折算为“零客户端”；普通 WezTerm `cli list` 可能涉及 mux 自动启动行为，本批研究未运行它，root 需独立核验其只读调用边界。

**Windows marker 与 pipe 的关系**：`consts.rs:230-249` 的 connect/bind 都使用完整 socket path 的字符串作为 named pipe 名，PID 仅另外写到 marker；`sessions.rs:165-198` 的 active probe 用 marker PID 做 OpenProcess 存活判断，不核 PID 创建时间/EXE/命令行。因此 marker 的 PID 不是连接参数，也不决定 pipe 实例。`ZELLIJ_SOCKET_DIR` 在 `consts.rs:356-365` 只覆盖目录并附 contract 子目录，client 仍再附名字；改 client 目录不会改变当前 server 已经绑定的 pipe 名。这不是用临时 marker/目录模拟 pin 的许可。

**最小已有能力**：已有且已连接、身份能重新核验的 WezTerm 窗口可以显式激活，再沿用现有 UUID focus；无窗口时状态展示、拒绝连接并保留清楚原因能够遵守边界。它仅覆盖已有客户端情况，不能宣称达成“当前后台有会话、无 GUI 时新增交互连接”。（推断）watch 的只读观察也须如实标只读，不能代替用户继续输入。

**结论边界**：当前 strong only-running 连接能力缺口是真实平台机制限制，需要 readiness/协调者保留；不能用一次当前环境 attach 成功或 mock 测试证明竞态下绝无复活/错连。需要放宽强约束或引入具备精确实例 API 的外部能力时，必须另行明确范围，本文不做该业务选择。

## F. 已阅读文档与来源清单

- 本批 `README.md`，完整阅读；`codebase-research/SKILL.md` 与 `verification-before-completion/SKILL.md`，完整阅读。
- `D:/terminal-workbench/README.txt` 与 `Start-TerminalWorkbench.cmd`，完整阅读；工作台 docs/data 仅定向检索版本和安装来源，没有读取私人对话正文。
- 官方 Commands、Session Resurrection、CLI Configuration、Controlling through CLI、Web Client、CLI Recipes，及固定版本上述源码。Web Client 的 session URL 自身支持缺失时创建、退出时复活，也不是 only-running；本次未访问实际 web server/创建 token。[官方 Web Client](https://zellij.dev/documentation/web-client.html)
- 官方 WezTerm start/general。`--skip-config` 只是跳过 Lua，不是 Zellij 无复活控制。[官方 CLI Reference](https://wezterm.org/cli/general.html)
- 官方 release expanded-assets 存在普通与 no-web Windows ZIP/MSI；页面 SHA 是各资产自己的 SHA，不能误把 SHA256SUM 文本的 SHA 或 ZIP 的 SHA 当本机 EXE SHA。[资产列表](https://github.com/zellij-org/zellij/releases/expanded_assets/v0.45.1)

## G. 不确定点清单

- **U1（已关闭到 release 字节匹配）**：本机 EXE 是否与官方 0.45.1 发布字节完全一致。版本/help 匹配，未找到本机来源记录；web 打开 93 B 官方 SHA256SUM 文本失败后，root 执行受控 `Invoke-WebRequest` 读取 release SHA 文本，并以 UTF8.GetString 解码 byte[]，实际 exit0、工具 chunk `b878f5`，正文为 `7c34f38921e6884873a9922bfdd4907f4d68fd0a2dd930ce357e4c7cb23f6f42  target/release/zellij.exe`。与本 agent 本轮独立 Get-FileHash 完全匹配。root 完整命令/输出以 root 原工具记录为准，不把 root 请求冒充 agent 自己执行；这不是源码构建可复现性或数字签名证明。
- **U2（机制缺口，未关闭）**：实际可用的精确当前实例、无复活/创建、实例退出 fail 的交互连接入口。已查 schema 与实现未提供该约束；以源码反证普通候选不足，不能用运行原 launcher/试错 attach 关闭。由 readiness 保留，不需要再问用户已有“继续”的含义。
- **U3（未实测）**：合法范围内的真实 GUI 激活与 UUID focus 成功。只读研究不允许执行；root 在获完整实施基线和验证流程后承接。此项不能由本报告、mock、旧客户端采样或 watch 冒充。
- **U4（未关闭）**：本机 WezTerm GUI 源 commit/可靠 version。本机版本字符串无版本信息；使用未来需要的参数应保留本机 help 实际证据，并由 root 验证实际启动行为，不据当前官方文档当已实测。

## H. 给 readiness reviewer 的最小可核查证据

1. 实际 binary hash/version/help：下面完整 CLI 输出及本节 D1。官方固定 commit 见 B；官方 release EXE SHA 由 root 实取、与本 agent 的本机 SHA 相符，U1 关闭到该明确范围。
2. 名字无 create 仍会复活：`commands.rs:720-750` 的条件。active index 忽略名：`commands.rs:503`；按 marker mtime：`sessions.rs:117-135`。
3. 退出不立即 fail：`os_input_output.rs:284-300` 无限 retry，Windows共用该方法；socket 由目录＋名字形成、协议没有 expected-instance。preflight 非原子是据这些事实的明确推断。
4. watch 不复活但只读：`commands.rs:921-989` 与 `client/lib.rs:1006-1017`；不得拿 watch 覆盖交互目标。
5. 原 launcher 有 create/force/EnsureTabs，真实 GUI 无客户端的当前采样由 root 另外提供。不得把强连接能力缺口悄悄写成 Gate PASS。

## 本轮命令、完整输出与失败记录

所有 shell 均在 PowerShell，cwd `E:/project-funny/mianban-develop`。以下帮助命令只有 help/version，未连接 session；源码 main 在解析前存在 cache 初始化/空目录清理，故不夸大“运行 help 完全没有文件系统辅助行为”。只读查询没有主动修改现有配置或 session。

### Zellij CLI / exit0

命令：`& 'D:/terminal-workbench/apps/zellij/zellij.exe' --version`

```text
zellij 0.45.1
```

命令：`& 'D:/terminal-workbench/apps/zellij/zellij.exe' attach --help`

```text
Attach to a session

Usage: zellij.exe attach [OPTIONS] [SESSION_NAME] [-- <INITIAL_COMMAND>...] [COMMAND]

Commands:
  options  Change the behaviour of zellij
  help     Print this message or the help of the given subcommand(s)

Arguments:
  [SESSION_NAME]        Name of the session to attach to
  [INITIAL_COMMAND]...  Command to run in the first pane of the session, if it is created

Options:
  -c, --create              Create a session if one does not exist
  -b, --create-background   Create a detached session in the background if one does not exist
      --index <INDEX>       Number of the session index in the active sessions ordered creation date
  -f, --force-run-commands  If resurrecting a dead session, immediately run all its commands on
                            startup
  -t, --token <TOKEN>       Authentication token for remote sessions
  -r, --remember            Save session for automatic re-authentication (4 weeks)
      --forget              Delete saved session before connecting
      --ca-cert <FILE>      Path to a custom CA certificate (PEM format) for verifying the remote
                            server
      --insecure            Skip TLS certificate validation (DANGEROUS — development only)
      --close-on-exit       Close the initial command's pane immediately when it exits
      --start-suspended     Start the initial command suspended, only running it after you first
                            press ENTER
  -h, --help                Print help
```

命令：`& 'D:/terminal-workbench/apps/zellij/zellij.exe' watch --help`

```text
Watch a session (read-only)

Usage: zellij.exe watch [SESSION_NAME]

Arguments:
  [SESSION_NAME]  Name of the session to watch

Options:
  -h, --help  Print help
```

命令：`& 'D:/terminal-workbench/apps/zellij/zellij.exe' list-sessions --help`

```text
List active sessions

Usage: zellij.exe list-sessions [OPTIONS]

Options:
  -n, --no-formatting  Do not add colors and formatting to the list (useful for parsing)
  -s, --short          Print just the session name
  -r, --reverse        List the sessions in reverse order (default is ascending order)
  -h, --help           Print help
```

### WezTerm CLI / exit0

命令：`& 'D:/terminal-workbench/apps/wezterm/wezterm-gui.exe' --version`

```text
wezterm-gui someone forgot to call assign_version_info
```

命令：`& 'D:/terminal-workbench/apps/wezterm/wezterm-gui.exe' start --help`

```text
Start the GUI, optionally running an alternative program [aliases: -e]

Usage: wezterm-gui.exe start [OPTIONS] [PROG]...

Arguments:
  [PROG]...
          Instead of executing your shell, run PROG. For example: `wezterm start -- bash -l` will spawn bash as if it were a login shell. [aliases: -e]

Options:
      --no-auto-connect
          If true, do not connect to domains marked as connect_automatically in your wezterm configuration file

      --always-new-process
          If enabled, don't try to ask an existing wezterm GUI instance to start the command.  Instead, always start the GUI in this invocation of wezterm so that you can wait for the command to complete by waiting for this wezterm process to finish

      --new-tab
          When spawning into an existing GUI instance, spawn a new tab into the active window rather than spawn a new window

      --cwd <CWD>
          Specify the current working directory for the initially spawned program

      --class <CLASS>
          Override the default windowing system class. The default is "org.wezfurlong.wezterm". Under X11 and Windows this changes the window class. Under Wayland this changes the app_id. This changes the class for all windows spawned by this instance of wezterm, including error, update and ssh authentication dialogs

      --workspace <WORKSPACE>
          Override the default workspace with the provided name. The default is "default"

      --position <POSITION>
          Override the position for the initial window launched by this process.
          
          --position 10,20          to set x=10, y=20 in screen coordinates
          --position screen:10,20   to set x=10, y=20 in screen coordinates
          --position main:10,20     to set x=10, y=20 relative to the main monitor
          --position active:10,20   to set x=10, y=20 relative to the active monitor
          --position HDMI-1:10,20   to set x=10, y=20 relative to the monitor named HDMI-1
          
          Note that Wayland does not allow applications to control window positioning.

      --domain <DOMAIN>
          Name of the multiplexer domain section from the configuration to which you'd like to connect. If omitted, the default domain will be used

      --attach
          When used with --domain, if the domain already has running panes, wezterm will simply attach and will NOT spawn the specified PROG. If you omit --attach when using --domain, wezterm will attach AND then spawn PROG

  -h, --help
          Print help (see a summary with '-h')
```

### 只读证据命令与全部异常

- `Get-Content -LiteralPath '…/README.md' -Raw` / exit0：本批 README 完整读取，工具 chunk `d30f96`。
- `rg --files 'D:/terminal-workbench/apps' -g '*Cargo*' -g '*README*' -g '*.json' -g '*.md' -g '*.rs' -g '*LICENSE*' -g '*version*' -g '*source*' -g '*manifest*'` / exit0：输出 579 行、12,173 tokens 被工具截断（chunk `aa0e9d`），不据截断内容声称穷尽源码；后续 `Get-ChildItem …/apps/zellij` 与 `…/build` 定向补查。
- `Get-ChildItem -LiteralPath 'D:/terminal-workbench/apps/zellij' -Force | Select-Object Name,Length,LastWriteTime; Get-ChildItem -LiteralPath 'D:/terminal-workbench' -File -Force | Select-Object Name,Length; Get-Command zellij -ErrorAction SilentlyContinue | Select-Object Source` / exit0：zellij目录单一 EXE 50,513,920 B，LastWriteTime 2026/8/28 9:20:12；Get-Command 未输出 Source（不假定 PATH 可用）。chunk `858020`。
- `Get-Content …/README.txt -Raw; Get-Content …/Start-TerminalWorkbench.cmd -Raw; Get-FileHash …/zellij.exe -Algorithm SHA256 | Format-List` / exit0：完整文件及 SHA 见 D1、工具 `e9e7cb`，没有执行文件。
- `rg --files 'D:/terminal-workbench' -g '*zellij*' -g '*install*' -g '*setup*' -g '*.ps1' -g '*.cmd' -g '*download*' -g '!apps/**' -g '!downloads/**' -g '!logs/**' -g '!work/**' -g '!cache/**'` / exit0：仍出现 apps 中无关文件，排除 glob 并未实现根目录穷尽排除；保留工具 `8eff7b`，不用该结果作不存在源码证明。
- `rg -n '0\.45\.1|zellij-org|KudoLayton|zellij.*(download|release|sha|source)|Windows.*zellij' 'D:/terminal-workbench/docs' 'D:/terminal-workbench/data' -g '*.md' -g '*.txt' -g '*.log' -g '*.json' -g '!*session*' -g '!*snapshot*'` / exit0：四条本机文档匹配版本、known WezTerm version 缺陷，未找到 binary来源；输出全部已读，工具 `f13e37`。
- `Get-Item …/zellij.exe -Stream Zone.Identifier -ErrorAction SilentlyContinue; Get-Content …/zellij.exe -Stream Zone.Identifier -ErrorAction SilentlyContinue; Get-ChildItem 'D:/terminal-workbench/downloads' -File -ErrorAction SilentlyContinue …` / **exit1、输出空**：未获取 ADS/下载来源，不能把它记作成功确认；工具 `240615`。
- `Get-ChildItem 'D:/terminal-workbench' -Directory -Force; Get-ChildItem 'C:/Users/ZXL/AppData/Local/Temp/zellij' -Force …; Get-CimInstance Win32_Process -Filter "Name='zellij.exe'" …; Get-AuthenticodeSignature …/zellij.exe …` / exit0：完整输出在 `21c380`，CIM 和签名结果见 D1；root目录与 tmp目录共用 Name列，初次把 tmp的 bootstrap 误当root目录，下一条失败保留。
- `Get-ChildItem 'D:/terminal-workbench/build' -Force …; Get-ChildItem 'D:/terminal-workbench/bootstrap' -Force …; rg -n 'zellij|0\.45\.1|github.com' 'D:/terminal-workbench/build' 'D:/terminal-workbench/bootstrap' -g '*.ps1' -g '*.md' -g '*.json' -g '*.txt' -g '*.cmd' -g '*.toml' -g '!target/**' -g '!node_modules/**'; Get-ChildItem 'C:/Users/ZXL/AppData/Local/Temp/zellij/contract_version_1' -Force …; Get-Content …/workbench-v4 -Raw` / **combined exit0，但 Get-ChildItem 与 rg 均报告 bootstrap 不存在（os error 2）**：后面成功读取 marker 掩盖了该局部失败，明确不按最终 exit0抹去；完整输出 `ded2dd` 已读。
- `Get-ChildItem 'D:/terminal-workbench/apps/wezterm' -File -Force …; Get-ChildItem 'D:/terminal-workbench/data' -File -Force …; Get-Content …/workbench-v4 -Raw; Get-FileHash …/workbench-v4 -Algorithm SHA256 | Format-List` / exit0：apps EXE列表与 marker正文/hash，工具 `4a1fd7` 全部已读。
- WezTerm version/start-help/hash 组合命令 exit0、完整输出 `c05e6b`；本文保留实际帮助内容，不把 `start --help` 视作启动 GUI。
- 最终校对再次执行 `& 'D:/terminal-workbench/apps/wezterm/wezterm-gui.exe' start --help` / exit0，`53f82f` 完整633-token输出已读；校正本文手动誊录 position screen 的措辞为实际 `in screen coordinates`，不改变 CLI 事实。
- web 打开 GitHub API tag-ref、tree/v0.45.1、普通与 no-web Windows SHA256SUM assets，返回 **Internal Error / 不可访问**；不把这些当已取得源码/官方 EXE hash。改由官方发布页 click commit 得到固定 commit，raw固定源码实际阅读。源链接全部正文/所用局部已读，web不是 live GUI/gateway验证。
- root 回传官方 SHA 文本只读命令 exit0、`b878f5`，正文已见 U1；root 首次直接 `[string]` 转换 byte[] 只打印数字，exit0 但不是正确正文，之后 UTF8 解码才得到正确内容。原失败/错误取证保留，agent 未自行发起 HTTP。root 曾指出 web 合并源码输出截断，不能替代完整阅读；本报告的锚点以本 agent 的定向源码读取为准。

### 报告自证（本 agent 本轮实际）

已读取 verification-before-completion。通过 `.venv/Scripts/python.exe -B -c $attachResearchCode` 执行下面代码，`6c7254` / **exit0，9 checks / 0 failures**。六个 version/help 实际重新执行、每个 exit0/stderr空，并逐个精确比对本文六段完整 stdout；另外验证段数、当前 EXE 官方 SHA、A/B/C/G/H 与 U 状态。未执行任何连接命令。输出中的报告 SHA `727a9723cc3faefeadbe1ba9e009caa0337e76d5c840f3e298903152612df99c` 是追加本自证段前的内容；最终文件 SHA 由尾后 fresh Get-FileHash 得出，不用循环自嵌。

```python
from pathlib import Path
import re, subprocess, hashlib, json
p=Path('docs/current/wezterm-session-link/research_attach.md')
s=p.read_text(encoding='utf-8')
blocks=re.findall(r'```text\n(.*?)\n```',s,re.S)
commands=[['D:/terminal-workbench/apps/zellij/zellij.exe','--version'],['D:/terminal-workbench/apps/zellij/zellij.exe','attach','--help'],['D:/terminal-workbench/apps/zellij/zellij.exe','watch','--help'],['D:/terminal-workbench/apps/zellij/zellij.exe','list-sessions','--help'],['D:/terminal-workbench/apps/wezterm/wezterm-gui.exe','--version'],['D:/terminal-workbench/apps/wezterm/wezterm-gui.exe','start','--help']]
checks=[]
for block,args in zip(blocks,commands):
 r=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',timeout=10)
 ok=r.returncode==0 and block.rstrip()==r.stdout.replace('\r\n','\n').rstrip() and not r.stderr
 checks.append(ok)
 print(json.dumps({'argv':args,'exit_code':r.returncode,'report_matches_complete_stdout':ok,'stdout':r.stdout,'stderr':r.stderr},ensure_ascii=False))
checks.extend([len(blocks)==len(commands),hashlib.sha256(Path(commands[0][0]).read_bytes()).hexdigest()=='7c34f38921e6884873a9922bfdd4907f4d68fd0a2dd930ce357e4c7cb23f6f42',all(x in s for x in ['## A.','## B.','## C.','## G.','## H.','**A. 无复活/无创建**','**B. 当前工作台原实例选择**','**C. 连接后身份确认**','U1（已关闭','U2（机制缺口，未关闭）','U3（未实测）','U4（未关闭）'])])
print(json.dumps({'checks':len(checks),'failures':sum(not c for c in checks),'report_sha256':hashlib.sha256(p.read_bytes()).hexdigest()},ensure_ascii=False))
raise SystemExit(0 if all(checks) else 1)
```

## 跨功能事实（待确认）

### 架构与约束

- [2026-10-04] 本机 Zellij 0.45.1 支持官方原生 Windows，但命名 attach 含 resurrection，index 忽略名称且 IPC 初始连接无限 retry；“检查后执行”无法承诺原子实例连接。

### 经验与教训

- [2026-10-04] 发布资产列表中的 SHA256SUM 文本 SHA/ZIP SHA不等于解压后 EXE SHA；版本字符串与命令帮助也不足以证明编译来源。
