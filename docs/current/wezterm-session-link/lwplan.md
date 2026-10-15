# WezTerm 会话联动：低层实施方案 r2（固定外部 mux 窄 delta）

日期：2026-10-04（Asia/Shanghai）。类型 **T3**：本机进程生命周期、终端动作与网页/API 跨层联动。唯一规划作者；只写本文件，未修改产品、启动 GUI、attach/watch/focus、访问本机 HTTP/SSH 或执行 Git。用户“继续”接受前轮三项具体范围；此前“自动实施代码即可现在”持续有效，不再请求相同阶段许可。

## 1. 范围与输入

权威输入为 `clarifications.md` 的完整实现基线：G1 后台/GUI进程/交互客户端/年龄分别展示；G2 显式连接唯一当前工作台、已连接不重复创建；G3 UUID focus 前后核验客户端、server 与 pane。N1 禁复活、新建远端 session、重放/输入/补 tab、旧 launcher 与 D: 文件更改；N2 不改来源/reader/MCP/图形/CSP/既有5秒与30秒合同，不收浏览器 argv；N3 不造 IPC/守护器/通用配置、不动其它进程、不关闭旧缺证。

输入冻结点：两 research SHA 分别 `277CB3ABAF943323188B13F471E5DD2A2219618B76EFB5C0070F6AD2BC8BDD93`、`F4EC50D8645F75B1AFA4771C1B35047B84701DA4FDBD405683746C62D8DF501C`；readiness r1 SHA `A9AD9E9FF9DDFA5063FF71F61BB971B4A33B995862BBB74D7492B85AD0425C03`。r1冻结，最新基线SHA **`4973A2AB297774E74E8C28D213526BB74C862CAE4F46F0057261881D88F1172C`**；readiness r2 SHA **`8B0BE7927DA75C3DE7A92142576F0B06E369DAA5E8FFE9E4DE670D77CC596B8A`**，仅核补事实delta，已由root实际56 checks/0fail/exit0（265339）独立核验后放行本LW。当前feature README SHA `DD520F3CDCC50BBE871E4AFB423D64B935552DBDB1064586AA8674D6341AA15C`，只作此刻阶段记录，后续root状态更新不能改权威基线。作者已完整读取r2和当前基线。

#### 本轮修订说明

[修订: DELTA-R2.1] 上段是r1的历史冻结输入；当前唯一权威基线已补§11，SHA **`CBABB6F7527B7DFBBA37DEEB086841AACBDD164AE857FE5D81D1EED7535A9830`**。root证据 `work/wezterm-session-link-root-mux-delta.json`（SHA `577DE412EB40495C149DDF95868CBFA34BC5C76B95CADD8A4EF9B2905D3FE36B`）说明固定外部纯mux可观察但历史归属未证。readiness r3最终SHA **`06166F1925723827DCE29F5FB73EA30C26053EE20597A71837AC8DB730D72FFC`**，作者完整读当前正式报告，root本轮51 checks/0fail/exit0独立核验并回传允许LW；不以r1的93项PASS或旧readiness hash放行新输入。本轮不改变G/N、启动argv、清理权限或UI配置，仅修正固定只读进程profile/字段/比较、锁边界措辞与对应验证；本轮Gate-1仍需尾后当前实际重自证。

产品 before：`work/wezterm-session-link-baseline-r1/manifest.json`，SHA `6359AABC11C8369336B62222D92B69D859E073AC8295B71847BA4944582A8BA1`，27路径。旧 robot 与 parent 的冻结基线、方案和正式报告不改。原机器人成功真实 focus 缺证、父 Q6 原生三工具加载缺证各自保留。

采用匹配官方 0.45.1 的无名 `attach` 首次入口：恰一个 active 才附着，无 active/多 active 退出，不进入 New/Resurrect。名字 attach 即使无 create 也会复活；index 忽略名字；watch 只读。因此不采用这三条替代交互连接。本机 CLI 不支持 expected-instance 原子 pin，首连失败无限 retry；本方案只给有限请求、前后同一实例与唯一关联观察，**不宣称瞬时绝无错连或 client-PID 握手**。用户之后自行操作终端的 SwitchSession 不由此功能改写。

## 2. 核心链路总览

现状：UUID选择 → 远端注册/实例证据＋严格 SSH slot/pane → 显式 `/focus` → Zellij action → 动作后 client/pane。顶栏绿点是来源采样，不是 GUI 连接。

目标主链：独立 `/api/workbench` → 固定 active/marker/server＋相关进程普查＋交互 client 清单 → 状态区；用户显式 connect → 同一终端动作锁 → 新 GUI 的固定无名 attach → 有限后验或 owned 回收；用户显式 UUID focus → 同锁 → 原 UUID 复核 → 动作前 fresh 唯一关联观察 → 原 pane action → 同实例/client/GUI/pane后验。图形仍只回传 UUID；消息只由原选择/刷新/翻页读取。

新增 `Workbench` 放在一个本机模块并挂在 `Terminal`，不混入远端 observation snapshot，不重置其年龄。新 GET/POST 复用原 gateway 边界。服务、probe、reader、MCP、cockpit、robot3d、Three及其依赖保持原字节。相关声明只有固定常量、两条实际 argv profile、简单状态 dict 和一把动作锁，避免通用进程发现或策略框架。

### research 事实映射表

| 已读事实 /来源 | 实现锚点 | 验证锚点 / 主体 / 口径 |
| --- | --- | --- |
| code B2：focus 先动作后clients；bad清单与零混合 | `terminal.parse_clients`、`Terminal.focus_session` | mock bad header/row、零/多/未知进程必须动作前0 calls；root真实 focus |
| code D1/D2：UUID、内层pane、GUI是不同身份域；source绿点不是GUI | `Workbench.observe/public`、`app.renderWorkbench/eligible` | 独立状态/年龄，不改变record分类；root合成API/UI与真实窗口进程观察 |
| attach B/D2：无名唯一active；named复活；无原子pin/无限retry | `parse_sessions`、`Workbench.connect`固定argv/8秒后验 | mock零/多/异主/同名替换/超时；root当前原server before/after；不证明原子能力 |
| attach D1：官方EXE字节相等，WezTerm版本字符串未知 | connect/focus前固定EXE/config SHA核验 | 作者mock mismatch；root执行前fresh哈希与实际GUI行为 |
| root固定源码补证：三列仅交互clients、含web但无类型，watchers另存；CLIENT_ID u16非PID | `parse_clients`、`Workbench`字段 `interactive_only`/`watcher_count=null` | mock可见watch/外来client/坏字段拒绝；不可观察覆盖明确未验证，不写零 |
| code U3/U5：年龄从最早采集算；HTTP并发 | `observe`共享deadline、`Terminal.action_lock`非阻塞 | mock慢采样、POST并发/焦点与连接争锁；root迟到与UI退资格 |
| 基线决策7：不能扫杀后代或复用PID | `_cleanup_owned`原GUI句柄、客户端原生句柄＋创建时间 | mock分类/权限/超时/PID复用；root自有无害进程验证Windows句柄原语；未触发真实GUI失败分支如实列限 |
| code U7：外部D工作台另有工作 | 只读固定文件/hash，不运行launcher/EnsureTabs | root执行前核hash/归属；静态禁止项与最终diff；不回退外部文件 |
| [修订: DELTA-R2.1] root全量CIM：固定外部mux完整argv只有exe，无可见GUI/attach；内部client/历史所有权未证 | S1 exact只读 `UNMANAGED_MUX` profile、public计数、前后fingerprint | 作者mock exact/extraargs/foreign/字段未知/identity变化；root真实全量普查与独立新GUI，绝不采用/连接/清理mux |

### 跨模块接口矩阵

| 调用方 → 被调用方 | 接口 / 内容 | 权限与兼容 |
| --- | --- | --- |
| app → gateway → `terminal.workbench.public_status()` | GET `/api/workbench`，无query | 原Host/Origin/client header；不读消息、不创建进程（固定元数据CLI/隐藏PowerShell采样除外） |
| app → gateway → `terminal.connect_workbench()` | POST `/api/workbench/connect`，body严格 `{}` | 同源Origin、CSRF、空body和原4096预算；stdio没有新工具 |
| gateway → Terminal → Workbench | focus原完整UUID；connect不收参数 | 一个非阻塞动作锁；繁忙返回409，不排队到未知将来 |
| Workbench → Windows/Zellij | 固定exe、argv、marker、CIM/句柄 | shell=False；不取标题/cwd/首个窗口，不WezTerm cli auto mux |

公共状态固定：`session=workbench-v4`；`status=observed|unknown`；`server_state=running|exited|missing|unknown`；`gui_state=absent|observed|multiple|unknown`；`gui_count` 与 `interactive_client_count` 为非负整数或 `null`；`client_scope=interactive_only`、`watcher_count=null`、`gui_visibility=unverified`；`association_state=disconnected|unique_observed|ambiguous|unknown`；`observed_at`、`age_ms`、`can_connect`、`can_focus`、`reason`、`actions_blocked`。内部保存 server `(marker绝对路径, marker PID, CIM PID, created_utc)`、GUI/attach `(PID,父PID,created_utc,profile)`、client `(client_id,pane_id)`用于比较，公共输出不泄露 CommandLine、argv、正文、CSRF或 traceback。`unique_observed` 仅表示这组可观察证据唯一关联；不是协议归属确认。

`connect`返回 `{connected, launched, status, reason, workbench, cleanup}`；`connected=true/status=unique_observed`只在后验成立，已连 `launched=false/cleanup=not_needed`。异常/超时 `connected=false`；清理只可 `verified|unverified|not_needed`。未知回收优先 `reason=cleanup_unverified`，保存初始失败码供内部证据，但不落私人命令。focus成功仍保留旧 `focused=true,status=confirmed,pane_id,exit_code`，文案只称“Zellij pane已选中”；新增客户端条件失败 `focused=false` 且动作前不发送。

#### 本轮修订说明

[修订: DELTA-R2.1] 公共状态追加 `unmanaged_mux_count`（完整有效普查时非负整数，unknown/null字段或无效普查时 `null`，不能缺字段折成0）。这是独立外部mux进程数，不计入GUI或Zellij交互client，不提供它的内部client数量。内部fingerprint追加每个mux的 `(PID,ParentPID,CreatedUtc,Name,normalized_exe,parsed_argv)` 集合，与server/GUI/attach一起做采样前后及focus/connect关联比较；即使名称/计数不变，PID、时间、父PID或字段/argv变化也未知并拒绝/回收本次owned GUI。原 r1 公共字段与成功/unknown结论保留。

## 3. 主要工作包与实施顺序

### S1：固定工作台观察、有限连接与 owned 清理

**目标/消费**：G1/G2、N1/N2/N3。先新增 `session_panel/workbench.py` 与 `tests/test_workbench.py`；依赖输入基线和固定工具能力，不依赖远端/图形。关键函数/模块：`parse_sessions`、Windows `command_line_argv`、`Workbench.observe/public_status/connect/_cleanup_owned`。reviewer先看这些位置即可判断状态与外部动作的边界；目标形态为一个独立本机对象，固定两profile、一次有限请求、明确unknown出口。

**严格观察**：

- `list-sessions --no-formatting` exit0才解析。非空每行 fullmatch `NAME [Created AGE ago]`，或同形追加 `(EXITED - attach to resurrect)`；名字限定当前Zellij合法非空无空白/control、≤128字符，AGE仅数字与 `s/m/h/days`单位及空格，重复名字、额外前后文、ANSI、坏行全部unknown。实际样本 `workbench-v4 [Created 9days 10h 52m 43s ago] `；对strip后的输出匹配。**空stdout不折算missing**：无法区分无列表与异常时unknown。parsed目标EXITED标exited；其他known列表但目标不在标missing；两者均不查询客户端或连接。active必须恰1且exact名称workbench-v4，否则动作拒绝，不按前缀/index选。
- marker使用当前Windows临时目录的 `zellij/contract_version_1/workbench-v4`，固定构造、非浏览器路径；正文必须decimal PID。CIM server必须固定ZELLIJ ExecutablePath，解析后argv严格 `[ZELLIJ,"--server",marker]`，PID匹配marker，UTC创建时间非空；进程未知/退出/marker不一致返回unknown。
- 固定 `C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -NonInteractive -Command <固定script>`（不走PATH、不插值用户输入）。script `$ErrorActionPreference='Stop'`，stdout UTF8，`Get-CimInstance Win32_Process`一次取得全量 `zellij.exe/wezterm.exe/wezterm-gui.exe/wezterm-mux-server.exe` 名字相关行，不预按exe或substring过滤；字段 `ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,CreatedUtc`，CreatedUtc由CreationDate转UTC ISO。捕获输出不向API转发；捕获非0/超时/坏JSON/字段null/重复PID均unknown，不能把无权限漏字段当零。`CREATE_NO_WINDOW`仅给采样helper，GUI按用户明确连接显示。
- Windows `CommandLineToArgvW`解析后配 `LocalFree`，不使用shlex或contains。exe与固定路径参数只做Windows绝对路径标准化/大小写归一后比较，flag/会话字串精确，额外参数拒绝。GUI→客户端要求**直接父子**：本批显式PROG无wrapper；任何间接或不完整链unknown，不建通用祖先算法。server不得落入清理客户端集合。
- 允许两条真实现存profile：新GUI完整argv见下；旧GUI完整argv从Startcmd实读、没有no-auto-connect，子命令严格 `ZELLIJ attach workbench-v4 --create --force-run-commands`。旧profile只读取现存事实，绝不执行。旧/new子client必须分别完整 `[ZELLIJ,"attach",…]`，父PID精确对应唯一合法GUI、创建时间≥GUI；任何其他GUI、attach/watch、额外server、固定exe之外同名、未知参数/权限或多client均禁动作。元数据探针只豁免完整固定exe+精确既有 `--version`、`list-sessions --no-formatting`、`--session workbench-v4 action list-panes --all --json`、`… list-clients`，不得把未知zellij过程统统忽略。
- `list-clients`只允许正确三列表头；bad row/header/duplicate client ID/非u16范围/非法pane ID/非0退出/空输出返回unknown；有效表头无行才是交互client=0。此解析在S2统一，不重复第二份。唯一交互client＋唯一合法GUI/client父子＋前后原server/进程identity一致才 `unique_observed`；无GUI/attach且有效0交互client才 `disconnected`。可见额外web/watch或计数差异unknown/ambiguous；不可见watcher覆盖未验证，绝不写全客户端数量/类型0。
- 采样整体5秒deadline，clock/runner/provider可注入mock；version/session、marker＋CIM-before、client、marker＋CIM-after所有调用timeout≤剩余，最早 `observed_at/started`，双方server和GUI/attachidentity集合一致，采样耗时计入age。没有5秒缓存：GET fresh采样；所有query与动作走同锁，锁繁忙返回unknown/action_busy的廉价状态，不并发普查。30秒陈旧撤销当前显示，5秒撤销动作；新增状态从来不重置远端snapshot年龄。

#### 本轮修订说明

[修订: DELTA-R2.1] 上述“固定exe之外同名拒绝”只有一条窄只读例外：`UNMANAGED_MUX = D:/软件/wezterm/WezTerm/wezterm-mux-server.exe`。该行Name必须精确为wezterm-mux-server.exe（Windows大小写归一），ExecutablePath须完整规范化后等于此固定绝对路径，`CommandLineToArgvW`所得argv**恰一个**相同固定exe，PID/ParentPID/CreatedUtc字段完整合法且创建时间非空。只按实际profile只读分类，不按name断言没有内部clients。完整有效全量census时每个此profile记入unmanaged_mux_count及identity集合，不计GUI/attach，也不使有效0 GUI/0 Zellij交互client的当前工作台连接前检误被阻断。其它mux路径、额外flag、字段/权限未知、foreign GUI或多余Zellij继续拒绝；无法解析不能计零。此profile不被采用、连接、启动、发送命令、关闭、加入owned清理或当root所有，parent已消失也不追认历史归属。

[修订: DELTA-R2.1] 例外依据是已读固定Lua没有mux domains/default_domain/connect_automatically，加上原NEW_GUI always-new-process/no-auto-connect、固定PROG及清继承socket，不使用PATH或WezTerm cli。采样前后mux完整identity集合必须稳定；focus的initial/pre/post和connect before/after也纳入同一association comparisons，不允许只比较数量或在例外分支跳过全量普查。cleanup只排除这个已知非owned profile，不将它折成GUI客户端；未知进程仍保守cleanup_unverified，绝不为了清理而杀该mux。

```python
# workbench.py: additional observation-only profile, never a launch/cleanup target.
if exact_cim_name_exe_argv_created(row, UNMANAGED_MUX, [UNMANAGED_MUX]):
    unmanaged_mux.append(full_process_identity(row))
elif unknown_or_unaccepted_related_process(row):
    return observation_unknown(unmanaged_mux_count=None)
# Fingerprints must include the full stable unmanaged_mux identity set.
# Existing NEW_GUI / owned Zellij-client cleanup remain unchanged.
```

[修订: DELTA-R2.2] “所有query与动作同锁”仅指Workbench公开状态、connect及Terminal.focus_session；内部observe/wait/cleanup不重复取锁。原 `Terminal.list_panes` 被远端refresh调用，**保持不取共享action_lock**，可接受optional deadline；focus已持action_lock后refresh→list_panes不能再次取它，以免自锁或引入observation_lock/action_lock逆序。元数据探针的精确只读profile已允许普查识别，不能因这条明确锁边界而忽略未知进程。

**固定 launch 与完整性**：新启动参数只有以下一条；`Popen(shell=False)`，stdout/stderr不记录私人输出，GUI自身可见，保留Popen原句柄；当前workspace为 `D:/workspace-for-everything`。

```python
# workbench.py: fixed launch profile, never reuse the legacy launcher.
NEW_GUI = [WEZTERM_GUI, "--config-file", WEZTERM_LUA, "start",
           "--always-new-process", "--no-auto-connect", "--cwd", WORKDIR,
           "--", ZELLIJ, "attach"]
LEGACY_GUI = [WEZTERM_GUI, "--config-file", WEZTERM_LUA, "start",
              "--always-new-process", "--cwd", WORKDIR, "--", ZELLIJ,
              "attach", ZELLIJ_SESSION, "--create", "--force-run-commands"]
# LEGACY_GUI is an observation profile only, never a launch branch.
```

固定路径 `D:/terminal-workbench/apps/wezterm/wezterm-gui.exe`、已有Lua、Zellijconfig目录；connect及focus外部动作前hash核验固定ZELLIJ=`7C34F38921E6884873A9922BFDD4907F4D68FD0A2DD930CE357E4C7CB23F6F42`、GUI=`4D3B70097031209C7C19792197DEFEC6BC84E7B996B155A2A4478266562FE9FC`、Lua=`5F90382893F27C75A250B91249EE87CC383BEBA4C63B297A1644A8CBB456A74C`、Zellijconfig=`E93805981FD949779F481E6682A7AC152213B4741287ECE1719BAE2C47FE0981`。mismatch/readfail拒绝；不更新pin或改外部文件。环境从当前复制，仅固定 `WEZTERM_CONFIG_FILE/ZELLIJ_CONFIG_DIR`，清除继承的 `WEZTERM_UNIX_SOCKET/WEZTERM_PANE/ZELLIJ/ZELLIJ_SESSION_NAME/ZELLIJ_SOCKET_DIR`；TEMP维持与marker采集一致。不加create/name/index/初始命令，不改PATH。

**连接顺序与状态机**：`Workbench`持唯一action_lock；其公开`connect/public_status`非阻塞取锁，内部`observe/_wait_connected/_cleanup_owned`不重复取锁。Terminal的focus取同一锁后调用内部observe，connect_workbench只delegates一次、不再取锁。cleanup latch置位时直接拒绝。fresh前检唯一active原server、完整性、0 GUI/attach、有效0交互clients，才Popen。先记录原server identity与launch monotonic/UTC及GUI原handle创建时间；8秒有限后验由`_wait_connected`执行（≤250ms间隔、每次外部调用受剩余deadline约束，不能请求后又另起8秒完整采样）。GUI退出、原server变化/异主/新增active立即失败回收；启动暂态缺child/client可等待，未知权限/错argv不可伪作成功。仅同server、ownedGUI identity、唯一合法owned子client与交互client唯一且≤5秒新鲜时 connected。超时/异常→cleanup，不让IPC无限等待客户端留到将来server。最后释放锁。

```python
# Workbench.connect: target shape and priority of exits.
if cleanup_latch: return failure("cleanup_unverified")
before = observe(deadline=clock() + 5)
if before.unique_observed: return already_connected(launched=False)
if not before.disconnected_to_current_workbench: return failure(before.reason)
owned_gui = popen(NEW_GUI, shell=False, env=fixed_env())
try:
    after = _wait_connected(clock() + 8, expected_server=before.server,
                            expected_gui=owned_gui.pid)
    if after.unique_observed: return connected(after, launched=True)
finally_on_failure:
    cleanup = cleanup_owned(owned_gui, deadline=clock() + 3)
    if not cleanup.verified: cleanup_latch = True
# No background task, startup retry, restore, reconnect, or automatic unlock.
```

**回收精确边界**：3秒总budget。只识别本次GUI下、创建时间在GUI原handle的生命周期内、fixed ZELLIJ完整**新**attach argv的直接client，不含server/SSH/conhost/一般后代。对每个client `OpenProcess(PROCESS_TERMINATE|PROCESS_QUERY_LIMITED_INFORMATION|SYNCHRONIZE)`，取原生handle `GetProcessTimes` 创建时刻与fresh CIM同一UTC微秒一致，再核exe/argv/ParentPID并确认仍为本GUI，之后 `TerminateProcess(handle)`、`WaitForSingleObject`及退出码证明已退出，`CloseHandle`。PID已复用而创建时间不同时不杀。GUI只用本请求Popen持有的原handle terminate/wait，禁止PID扫杀/taskkill /T。先client后GUI，GUI关闭后再次fresh普查；若新child在第一次普查后、GUI退出前才spawn，仍只按同样exact profile＋GUI原handle创建/退出时间区间＋父PID核验其owned身份和handle后回收，不能因GUI已退出假定client不存在，也不能杀GUI PID复用后新生的child。最终全部已核验owned clients退出且无未知遗留attach才verified；身份/权限/超时或无法核验的owned候选一律cleanup_unverified。缺child且普查不完整不能叫已回收。

cleanup_unverified为当前网关生命周期内latch，connect/focus都锁住，GET继续给故障状态，无解锁端点/自动重启。root人工交接必须核实际遗留；网关重启丢索引/留存且清latch不能当恢复动作，不能通过重启绕过缺证。

**验收与责任三元组**：作者仅mock；`tests/test_workbench.py`覆盖两profile/foreign/权限/坏清单/零与多active/原实例替换/迟到/PIDreuse/cleanup失败、已有连接0Popen、锁竞态；报告 `impl_report_r1.md`＋完整命令/exit `work/wezterm-session-link-impl-r1-verification.json`，缺项不得自称runtime通过。root承担实际hash、CIM/list、固定GUI connect before/after和原Windows句柄原语验证，产物 `work/wezterm-session-link-root-*.json`；未触发真实GUI失败路径写明未实测，不能由mock冒充。fresh reviewer独立核最终diff与这些证据，无法证明owned退出时只能缺证/BLOCKED。

[修订: DELTA-R2.1] 直接mock追加：strict external mux＋有效0GUI/0client可connect、合法GUI关联仍focus；mux不是GUI/client且API计数独立；extra flag/其它路径/缺ExecutablePath/CommandLine/CreatedUtc/ParentPID/Name/坏解析/重复PID不得计零或获得动作；前后count相同但PID/parent/created变化拒绝；可见foreign GUI/额外Zellij/watch仍拒绝；cleanup calls中从不出现external mux。证据仍是作者仅mock/静态与root真实全量采样，各自产物/缺证约束不变，不以这个例外宣称内部client已覆盖。

作者体验：provider/runner/clock/popen仅四个外部依赖注入，不引进插件注册、通用进程图或dataclass状态框架；测试用小字典明确PID/时间与argv，两profile明摆可读。此包验收以上行为与证据，不以行数/任务数量放行。预计模块约250–330实现行；若明显复杂化或总diff>约1000，回root拆迭代、同步方案，不删目标偷渡。

回滚：只撤S1新增文件及本批调用，不删除D配置/缓存/marker或kill现存工作台；本次成功GUI留给用户，取消其连接只能由用户或root按明确owned身份处理，不能产品回滚自动清现存GUI。依赖/执行：S1先建立mock稳定观察/清理，再给S2接动作锁。

### S2：UUID focus 动作前后核验和固定 API

**目标/消费**：G1/G2/G3、N1/N2/N3。改 `session_panel/terminal.py`、`gateway.py`，直接 `tests/test_focus.py/test_gateway.py`；service/source不改。关键锚点 `Terminal.__init__/focus_session/connect_workbench`、`parse_clients`、`PanelHandler.do_GET/do_POST/result_status`。reviewer先看 action 之前的early-exit；目标形态保留原UUID→slot/pane复核，把新条件置于动作前并保留动作后结论限制。

Terminal在`__init__`内lazy引入 `Workbench(runner=…,clock=…)`，注入workbench用于本地mock，复用其唯一 `threading.Lock`。`connect_workbench`仅delegate到已取锁的Workbench.connect，`focus_session`自己 try-acquire同锁；busy立即409/reason `terminal_action_busy`。GET采样同锁，内部observe不取第二次锁，避免deadlock。parse_clients改valid表头无rows→`[]`，任何invalid→`None`，唯一消费者和新模块显式处理，不能 `if clients else []`重新混合未知；workbench调用时lazy引用terminal parser，不形成模块初始化cycle。

focus顺序：锁/latch→廉价fresh workbench检查（断连/歧义早拒绝）→保留原requested与force远端fresh/instance/slot/pane/≤5秒→原pane inventory→**重新**fresh workbench（避免SSH等待把先前GUI证据变旧）→确认server/GUI/client identity未变、远端age加本段耗时仍≤5秒→原focus action。后验同时检查同server/GUI/attach/clientID、唯一interactive client的pane等于目标、严格slot/pane仍唯一，transaction/远端证据超5秒不称success。错误发生在调用action前不发出；调用action开始后任何异常保守 `focus_sent_unverified`，非0保留focus_failed/exit。内部before.pane_id保留给root核对，不对任何猜测目标自动恢复。

```python
# terminal.py: after existing UUID/pane verification, before current _run(focus).
pre = workbench.observe(deadline=min(action_deadline, clock() + 5))
if not pre.unique_observed or not same_association(initial, pre):
    return not_sent(pre.reason or "workbench_association_unknown")
if fresh["age_ms"] + (clock() - refresh_finished) * 1000 > 5000:
    return not_sent("binding_unknown")
action = _run(["--session", ZELLIJ_SESSION, "action", "focus-pane-id", fresh["pane_id"]], remaining)
post = workbench.observe(deadline=action_deadline)
after_panes = list_panes_with_remaining_budget()
if not same_association(pre, post) or not post.unique_observed or post.client_pane != fresh["pane_id"]:
    return sent_unverified()
# Keep the original strict after-slot/pane and freshness checks before focused=True.
```

focus动作阶段从final precheck最早采样起共5秒（hash、freshworkbench、action、afterworkbench/panes共用deadline）；远端refresh的原15/5秒上限不变且仍由原最早age约束。重用 `_run(timeout=remaining)`；可给list_panes增加可选deadline，默认行为不变，不为此重构其它service调用。若预算不足动作前拒绝，动作后未验，不延长CACHE合同。

GET `/api/workbench`拒query，回公共状态200（status unknown依然unknown）；POST只多精确 `/api/workbench/connect`路径，先原 allowed(api=True,focus=True)，再同一空JSON校验，dispatch，无浏览器路径/命令/pane。focus原UUID校验保留。新增业务动作拒绝409：`terminal_action_busy/cleanup_unverified/workbench_*`；launch/命令异常503，原focus_sent_unverified仍结构化非成功，原reason HTTP行为保留。未知字段/enum由UI撤资格。异常响应不泄漏rawcmd/privateerror。

作者自证只mock handler直接路径/固定解析，不启动HTTP：badOrigin/CSRF/body/duplicateheader/transferencoding/unknownroute/query触发后业务call=0；有效connect body={}只call无参一次。已有 `GatewayTests`临时HTTP执行由root整套承接，作者不可因为测试在tests目录就自行运行它。作者可运行明确无HTTP的focus/workbench单元subset＋静态语法，证据与缺证约束同S1。root负责新端点完整临时HTTP、原55 tests回归、mock并发和实际UUIDfocus；产物root-json，fresh reviewer独立核，不用exit0替代真实切pane。需修旧focus tests对invalid/多client的原“动作后”期望为“动作前0call”；另独立动作后变化案例保留sent_unverified，避免镜像实现测试。

作者体验：两个端点不是通用command接口，原emptybody校验只共享已有小块，不改全部路由/命名。回滚只撤新endpoint与本轮前后检查，恢复before快照（由root只针对本批核验后操作，不覆盖他人）；锁/UI兼容随S3同时回滚。依赖S1可靠observe；API契约定型后S3消费。

**验收**：坏Origin/CSRF/body或unknown客户端归属时业务action=0；有效API精确空body和固定调用；真实focus须root证明原server/GUI/client同一且目标pane被唯一选中，动作后缺证仍未确认。

[修订: DELTA-R2.2] 锁负例须证明focus持action_lock时其service.refresh_observation→Terminal.list_panes不会再取同锁；公开workbench状态/connect并发仍busy、不排队。不新增service锁或包一层全局锁；原list_panes的只读行为/默认budget保持。

### S3：独立终端状态区与显式连接入口

**目标/消费**：G1/G2/G3、N1/N2/N3。改 `web/app.js/index.html/style.css`与root README“网页状态/定位”段；不动图形文件。关键锚点 `state/query/renderSelection/refreshSessions/focusSession`，新增 `refreshWorkbench/renderWorkbench/connectWorkbench`；DOM `workbench-state/workbench-facts/refresh-workbench/connect-workbench/workbench-notice`。reviewer由状态渲染→canFocus→显式POST顺读；目标形态为主图上方或其下横跨网格的一个紧凑终端区，无新巨型3D/主题重排。

前端独立 `workbench/receivedAt/refreshingWorkbench/connecting`。API缺失、坏shape、未知enum、年龄null或非finite、失败立即unknown且禁动作；保留上次值须标上次证据。`workbenchAge = payload.age_ms + performance.now()-workbenchReceived`，用请求真正完成时刻记录，不能等远端metadata迟到后归零。5秒资格/30秒陈旧单独计时；top绿点仍标“来源观察”，不名为终端已连接。

```javascript
// app.js: independent action eligibility; renderer continues to receive UUID only.
function terminalReady() {
  return state.workbench?.association_state === 'unique_observed'
    && state.workbench.can_focus === true && workbenchAge() <= 5000
    && !state.connecting && !state.focusing;
}
// renderSelection retains every existing identity/registration/pane requirement.
const canFocus = record && eligible(record) && terminalReady() && state.csrf;
// Connect is an explicit DOM event, no polling/selection/graphics implicit action.
await query('/api/workbench/connect', {method:'POST',
  headers:{'Content-Type':'application/json','X-Session-CSRF':state.csrf},body:'{}'});
```

状态区显示固定会话后台存活/退出/不存在/未知、WezTerm GUI进程数量（“可见性未核验”）、交互客户端数量（“含web，watcher覆盖未验证”）、本次/上次年龄、唯一关联观察/歧义/未连。无GUI＋有效0clients＋can_connect才按钮“连接现有工作台”enabled；已unique显示“已关联”且不重复启动；若实际POSTrace已有连接，后端launched=false同样明确。focus提示区分“先连接工作台”“客户端/归属未确认”“证据需刷新”；成功只“已确认Zellij选中pane”，不写桌面已切换或握手。

初始与可见10秒原节拍同时发独立workbench GET（可parallel）；隐藏暂停。刷新观察会同时请求workbench，但两种status/received各自更新、不互相变绿；新刷新终端按钮只读本机状态。每秒更新动作disabled和年龄。connect/focus期间两个动作均disabled，按钮DOM事件再检查，不依赖disabled唯一防线；结果再刷新两份元数据，不读取消息/改变selectedUUID/page/epoch。两GET竞争动作锁返回busy的unknown，不据旧响应恢复操作资格；有cleanup_unverified后页面禁动作并直说“终端回收未确认；请核查”，不展示自动重启/重试按钮。

作者自证 `node --check web/app.js`和DOM静态ID/中文文案/固定payload检查，产物author verification；无HTTP/browser。root承接实际API/UI迟到/未知/陈旧/断连/并发/重复按钮及360px，产物root-fixture-json＋截图；原UUID选读、分页revision、3D/pixel/text/键盘保持。真实连接状态root-live独立；缺真实证据仅“合成通过”。作者体验保留现有render函数风格和短状态映射，使用textContent，不引入react/state框架/新存储/图形依赖；根README只同步新增用法与真实成功口径，不添加新MCP。

回滚S3本批状态区/函数/README段，保持独立原UI；S1/S2 endpoint需一起回滚以避免dead按钮，移除源码不关已有GUI/server/SSH。依赖S2公共字段，S4更新合成fixture时显式提供新状态，不给旧API默认成功。

**验收**：来源绿点与终端状态独立、fresh disconnected仅显式connect、unknown/歧义/cleanup/陈旧撤销两个动作、合法unique_observed仍须原UUID资格才focus；原选择和分页不受终端刷新/动作结果影响。root合成UI与真实联动分层，不称桌面已激活。

[修订: DELTA-R2.1] 新计数在既有终端事实区简短显示“独立外部mux进程 N；归属与内部客户端未核验”，unknown显示未知、不写0。不增加配置或控制该mux的按钮；两action资格继续消费完整status/can_*，不自行用这个数字推导绑定或忽略unknown。

### S4：分层验收、证据收口与交付

**目标/消费**：G1/G2/G3全链、N1/N2/N3全链；不新增产品能力。关键文件 `tests/test_workbench.py/test_focus.py/test_gateway.py/verify_robot_cockpit.cjs`，作者报告与root验证工作目录；锚点old harness `FakeTerminal/snapshot/basicBehavior/API failure`。目标形态旧图形/reader合成case继续实跑，新终端case是实际DOM/API positive＋negative闭环，fixture永不访问8766/真实SSH/GUI。

更新原fixture明确FakeTerminal public状态/connect和工作台控制数据，默认提供合法新状态让旧focus正例仍成立；独立case删除该数据/返回404/unknown/futureenum验证禁connect/focus，不能给legacy响应隐式绿。记录requests匹配新增GET/connect，令CSRF/空body断言同时覆盖两action，不将预期409/503计为无故失败。增加断连/0GUI0interactive可连接、已有0新增、multiple/foreign/watch/unknown fields、5/30秒年龄、连接pending原UUID/正文不变、late workbench响应、connect/focus互锁和cleanup_unverified的实际nativeDOM点击无POST。图形case保留原29类行为，不靠新增fake数据证明真实连接。

作者：仅静态/明确mock subset，完整保存命令、全部stdout/stderr/exit及此前采集异常，不运行HTTP/browser/live。root：下面 Required runtime set，独立完整读输出/hash，fresh Review(Impl)不可缺证PASS。回滚验证：只核差异而非执行破坏性restore；root审批核本批文件与before一致范围，保留所有报告。

| 验证 / 必需证据 | 主体 / 产物 | 缺证结论 |
| --- | --- | --- |
| S1/S2 mock正负例、锁、PIDreuse、严格argv/解析、hashmismatch、owned cleanup failure | impl无外部动作；author完整输出/exit＋report | 仅local，不给runtime PASS |
| `python -X utf8 -B -m unittest discover -s tests -v`完整套、静态JS/Python；原55＋新增有意义用例 | root；bytes采集stdout/stderr/exit，不管道收尾 | 有失败如实列；collector异常不能冒充test failure已解释 |
| 更新fixture actual HTTP/UI/CSRF/空body/未知拒绝/360px/原图形与reader | root；`tests/verify_robot_cockpit.cjs --fixture`报告 | 不等于GUI连接/native Codex验收 |
| 当前D exe/config哈希＋Zellij唯一active/原server/SSH creation tuples/panes/tabs/client before | root；fresh live-json，只metadata | 未证不可调用connect；不重用旧PID/pane常量 |
| 真实固定GUI连接后同一server、原SSH/pane/tab集合不变、唯一合法GUI-child与交互client；重复connect launched=false且GUI/client无增加 | root；live-json＋窗口进程观察 | 未闭合只unknown/BLOCKED；不称可见/握手/原子pin |
| fresh真实UUID选择读页/翻页，再显式focus，post同一关联/client选中targetpane；保留originalpane给用户核对 | root；live-json，不存正文/CSRF | 原机器人成功focus缺证只能另立fresh证据，不能修改旧冻结review结论 |
| Windows owned原语GetProcessTimes/原handle/PIDreuse拒绝/TerminateProcess/Wait实际能力 | root仅自有无害fixture子进程；原语报告＋mock业务分类 | primitive通过仅证明Windows原语；发生cleanup_unverified必须BLOCKED，绝不杀server逼测试 |
| 受控post-launch观察故障注入＋真实owned GUI/client回收 | root独立owned测试进程/Workbench对象，沿用产品connect与真实preflight/Popen/CIM/handles；只在`_wait_connected`原方法已观察真实owned关联后将其返回值改为unknown，触发同一产品cleanup；cleanup内部CIM/handle不被mock；独立CIM/句柄证明退出、原server/SSH/pane不变，后再自然成功连接留GUI | 明确合成的是业务观察失败，真实的是进程/回收，不称自然平台故障；不改prodgateway latches、不新建Zellij session、不停server/SSH、无新生产参数/endpoint。预检或工具无法支持时列未实测，不冒充通过 |
| 最终diff允许范围、27before＋新文件manifest、G/N追溯、all failures、fresh实施review | root＋fresh reviewer；formal report＋root独立核 | 无真正runtime成功或failure未处理不得PASS/归档 |

**证据记录规则**：每个命令保存原argv/时间/exit和完整输出，正文/CSRF不入artifact。root-before55成功证据为 `work/wezterm-session-link-baseline-tests-bytes.json`；前次UTF8 text collector有UnicodeDecodeError、child exit1、stderr丢失无法诊断，必须继续列入author/最终report，不把重跑成功删除失败。宽读截断、readiness旧SHA不匹配/GBK编码失败、root字面标题断言失败及retry分别保留；root源码首次PS不区分大小写 CLIENT_ID搜索截断，后-case定向补读，同样写采集异常，不说首次穷尽。新轮测试失败/修订需red/green归档。

[修订: DELTA-R2.1] S4合成fixture显式补unmanaged_mux_count与unknown/null正负例，确认其不改变GUI/client数量、unknown撤销操作，原UUID/message/图形不变。root fresh live须保留external mux完整identity前后并未关闭/采用它，固定新GUI与原server/SSH/pane仍独立核验；字段计数和实际局部CIM归属不能证明其内部client覆盖。root纯mux首次窄样本不能称全量无WezTerm；rg work通配路径exit1和历史搜索无匹配exit1只作采集异常，不能证明该进程历史来源。

[修订: DELTA-R2.1] Windows无害owned子进程原语验收由root直接运行同一原生API即可；若产品terminate方法严格绑定Zellij/profile，不为测试新增生产参数或通用helper。mock业务分类、root实际GUI失败回收与原语能力分别记录，不互相替代。

依赖/执行：S1 → S2 → S3；fixture作者可在S2 API固定后与S3并行写其独占测试，但所有author受root委派，不递归派发。root整合及验收最后，fresh实施review后才能交付状态，不自动commit（当前无Git仓库），英文提交建议 `feat: connect the session panel to the existing WezTerm workbench`。

## 4. 风险、不确定点与事件对齐

- 没有CLI原子pin：保留瞬时错连可能的明确限制，有限后验拒绝＋owned回收；不引进私有IPC。原实例变化、unknown权限/归属必须停止动作，不能“基本只有一个”绕过。
- 可观察client覆盖：list-clients不含watcher，无web/PID类型；全量本机相关进程只补可见线索。永远 `watcher_count=null` 和关联观察口径，不以不可见排除为前提，不把一个GUI＋client直接当握手。可见未知或额外角色则拒绝。
- 5秒budget可能在真实CIM/SSH耗时后不足：保守unknown/refuse，root实际测量；不能调大既有年龄或标现在新鲜来通过。若真实环境常无法满足，回root方案缺陷处理，不顺手优化远端reader。
- DirectGUI-child形态若实测不同：这是实施断言而非平台普遍保证；返回unknown，root受控补事实，更新plan再freshreview；不悄悄新增任意祖先匹配。
- cleanup未知：锁两action，没有自动重启/解除；root交接遗留身份与索引丢失边界，缺证不能green。不能以杀SSH/server/所有后代恢复可连接。
- 外部exe/config变动：pin不符拒绝，报root读新事实，不覆盖他人文件或默默接受新binary；原N1保持。
- 体量风险：主要新增只有一个workbench对象及原handler/UI小增量，预计约450实现＋250–350直接测试。总变更明显>1000或需要常驻监管/新依赖，先回root拆迭代，不做一块大补丁。

#### 本轮修订说明

[修订: DELTA-R2.1] 独立外部mux历史owner与内部clients未证：只严格观察fixed profile和稳定identity，不连接/采用/清理，不把它当工作台client，也不声称“它没有clients”。unknown字段/变动仍拒绝，fullcensus不可漏。例外原因是现成独立新GUI能力，不扩大任意foreign程序信任；新发现不同路径/flags返回root补事实而非追加通用allowlist。该风险对应S1/S3/S4的计数/稳定性/拒绝与真实证据。

[修订: DELTA-R2.2] action锁边界不覆盖原refresh内部list_panes，不改service锁序；锁合同被作者误包时Gate-2/impl-review拒绝并回S2，不以超时重试掩盖deadlock。

**事件触发对齐留痕位置**：本节与clarifications第10节/README阶段。已触发：readiness→LW；root明确watcher与两现存profile delta→基线hash更新/readiness r2。后续新假设、风险、Gate切换立即回root，不设固定次数。

[修订: DELTA-R2.1/R2.2] 新事件：root fresh 全量普查发现固定外部puremux→clarifications§11、readiness r3、本次同路径小delta；fresh reviewer要求明确原list_panes不取action锁→S1/S2锁措辞补强。未出现新用户权限/目标，不重问实施入口。

**批量提问模板与优先级组织方式**：当前无新增用户范围问题，已有“继续/自动实施”不重问；技术 supplemental 由 `【DELEGATE_ACTION】`交root，不递归。在范围/验收/回滚出现真正不唯一或新外部权限时先停依赖任务，按P0阻塞、P1高风险、P2优化一次批量 `【DELEGATE_QUESTION】`，每题2–4个选项、推荐理由和影响阶段；不设问题数量上下限。模板：`需要确认：[真实新边界]；优先级：[P0/P1/P2]；阶段：[LW/Impl]；A[推荐+理由]/B[权衡]；请一次性回复Q1=A…`。根基线不足才受控回退，不由author补默认假设。

contract drift：shared skill STOP_BEFORE_IMPL默认与本次developer持续授权/用户自动实施存在差异，沿用已记录授权但保留 Gate-1/Gate-2与fresh实施review，不改shared skills。research强原子限制与当前有限关联合同不同，原“未关闭”不删除。readiness r1冻结不冒充delta；r2 root实核与当前基线SHA已落§1。clarifications第9节“ReadinessCheck”是r1的阶段文字留存，当前README为LWPlan；不改冻结输入，实际阶段以本批README和本方案为准。

## 5. Gate-1 与双阶段门禁

**Gate-1当前结论：PASS（r2当前输入与delta存在性109项重自证）**；**allow_enter_impl: no**，只允许fresh Review(LW)。r1的PASS是历史冻结版本结论，不放行当前delta；Gate-2与root独立核验仍必需，用户既有自动实施授权不替代技术Gate。

### T3 Required Set 存在性自检

| 必备项 | 本方案位置 / 自检 |
| --- | --- |
| 1 目标锁/反目标/不影响项 | §1、各S1–S4的G/N消费；图形/reader/MCP/旧冻结不改 |
| 2 文件及首个review落点 | 每S列具体文件、函数/DOM/fixture锚点；before manifest |
| 3 分阶段目标/步骤/验收/回滚/依赖/目标形态 | S1→S2→S3→S4逐块；不需要reviewer另做架构决策 |
| 4 各主要包目标/反目标消费 | 各S“目标/消费”及具体禁止分支 |
| 5 验证责任分层＋非impl-safe说明 | 每S作者mock/静态、root HTTP/browser/live、fresh reviewer；S4 runtime set |
| 6 作者体验/声明可读性 | 每S固定dict/两profile/旧render风格/无递归与框架；片段样本 |
| 7 核心链路总览 | §2现状→目标→不改层及分层理由 |
| 8 research事实映射 | §2表逐条事实→实现→测试/责任/口径 |
| 9 必填片段闭环 | S1固定argv/connect优先级→S2前后focus→S3状态资格/POST；后验/unknown与API矩阵闭合 |
| 10 Gate1显式目标映射/分层/三元组/作者体验及复杂链 | 本表＋下方显式项；§6历史自证与§7当前delta实际核验区分 |
| 11 Gate1/Gate2执行者/时机/回退 | 本节双阶段协议 |
| 12 澄清强触发/批量优先级 | §4具体模板、当前未触发用户问题原因 |
| 13 风险/降级/Gate2复核要求 | §4 unknown/refuse/cleanup_latch、下方Gate2要求 |
| T2补充输入输出/边界/关键functions/分层回归 | §2公共字段/API矩阵＋各S函数和Required runtime set |
| T3补充跨模块接口/状态机/协议/兼容迁移/停机 | §2矩阵、S1状态/cleanup、S2HTTP、S3legacyunknown、各S联合回滚；root owned网关reload不动工作台 |

显式自检：**目标锁/反目标映射完成**；**验证责任分层已落盘**；**证据产物/责任归属/证据不足约束已落盘**（每S和runtime set）；**作者体验门证据已提供**（固定声明与关键目标骨架）；**核心链路总览/research事实映射/片段闭环充分性已落盘**。r1历史93项exit0在§6保留，r2仅由§7当前109项支持Gate-1；不证明未来实现正确或真实联动已通过。

### P1–P9 三组与门禁规则

| 项 | 本轮存在性规则 / 锚点 |
| --- | --- |
| P1 | 不以“至少X任务”作质量门槛；工作包数只反映职责 |
| P2 | 必备项缺任一不放行，不用测例数量替代存在性 |
| P3 | Gate采用纯存在性硬门禁，任一Required项失败退回 |
| P4 | 本轮T3，含T1十三项＋T2/T3追加完整项，上表逐条 |
| P5 | 真正关键范围/验收/回滚不唯一先DELEGATE_QUESTION；技术补证DELEGATE_ACTION，不自补权限 |
| P6 | §4事件留痕：新风险/假设/阶段立即对齐，无固定次数 |
| P7 | 问题数不设上下限，按实际阻塞组织 |
| P8 | §4批量模板与P0/P1/P2；当前无新用户问题原因明确 |
| P9 | 作者Gate1→fresh review_plan Gate2＋root复核；两者未通过禁impl |

Gate-1由唯一LW author在正式产出后运行实际只读结构/输入hash/产品unchanged核验，全量输出/exit读完并回root；任何缺输入/片段/三元组不能建议进入impl。Gate-2由fresh review_plan主检＋root独立核：Required Set、G/N、关键实现锚点、目标形态、必要片段闭环、分层证据、作者体验与主链顺读、P1–P9、基线一致性、设计味道逐项显式结果；未PASS禁止impl。失败 `LWPlan→Review(LW)`修订，不唯一口径受控回基线；本轮非PLAN_DEFECT，无已实施支撑可删。下游author不再派subagent，root分独占文件和验证职责。

实施/迁移：无持久schema迁移、新依赖或外部安装。root在before/current/owner一致后只重载自己原建网关；旧内存index/last_evidence会丢失，需明确记录，不重启Codex/SSH/server。若监听归属未知则不接管；端口仍8766不改fallback。临时fixture改用明确新state，生产缺新endpoint默认unknown，不绕过资格。

无新增跨功能事实：本机身份域/readonly关联边界为本批已有事实，不提交全局规则候选。

## 6. 作者本轮实际 Gate-1 验证与失败记录

[修订: DELTA-R2.1] 本节保留r1历史验证与算法，不用于当前输入放行；r1最终plan SHA **`C1F488C0D24E552143B1D109B399749D2DDDDBB5988C00816BC75C416B5A769A`**，作者末轮31d08c 93/0/exit0；root独立f8b786复跑93/0/exit0。r2必须消费§1当前CBAB基线、readiness r3最终SHA及新例外/锁负例重自证，见尾后当前记录；原初验失败和旧hash不删除。

先完整读 `verification-before-completion`。本轮唯一写入本文件；实际只读命令以PowerShell here-string定义Python后执行 `.venv/Scripts/python.exe -X utf8 -B -c $lwGateVerify`，末尾 `exit $LASTEXITCODE`，无管道收尾。实际check包括五冻结输入SHA与文内引用、before manifest及27产品字节、七章节、四主要包必备内容、T1十三项、P1–P9、25关键边界marker、主链四目标片段与未启动实施共93项。最终核验仅扫第1—5节实际方案正文，不把第6节验证代码中的字串当方案内容证据。

初验 `b75b5a` / **exit1，93 checks、2 failures**：结构检查要求每包明写“验收”词，S2/S3已有具体行为/证据，但没有这个显式标签；已补两段紧凑验收，把结果口径摆在读者首落点，未修改产品或权威输入。完整输出已读，不能省略这次失败。随后同一完整命令 `ef5f03` / **exit0，93 checks / 0 failures**，全部逐条true；该次SHA `2F63162E588888075155E406E4B89B8A46D65C9FABF2E89F709ACFB83F2B724A`是追加本证据段前的plan，不作最终SHA。最终全文写完后重跑同一命令，最终SHA以尾后工具输出为准，不循环自嵌。没有运行HTTP/browser/GUI/Zellij动作/SSH或产品test，不能把文档自证叫业务验收。

验证算法全文（PowerShell wrapper如上，UTF8 stdout）；root可独立运行或按自己更完整的语义检查复核，不信作者自称替代Gate-2：

```python
from pathlib import Path
import hashlib,json,re
base=Path('docs/current/wezterm-session-link')
full_s=(base/'lwplan.md').read_text(encoding='utf-8')
s=full_s.split('\n## 6. 作者本轮实际 Gate-1 验证与失败记录',1)[0]
checks=[]
def check(name,ok):
 checks.append(bool(ok)); print(json.dumps({'check':name,'ok':bool(ok)},ensure_ascii=False))
expected={'clarifications.md':'4973A2AB297774E74E8C28D213526BB74C862CAE4F46F0057261881D88F1172C','research_code.md':'277CB3ABAF943323188B13F471E5DD2A2219618B76EFB5C0070F6AD2BC8BDD93','research_attach.md':'F4EC50D8645F75B1AFA4771C1B35047B84701DA4FDBD405683746C62D8DF501C','review_notes_readiness_1.md':'A9AD9E9FF9DDFA5063FF71F61BB971B4A33B995862BBB74D7492B85AD0425C03','review_notes_readiness_2.md':'8B0BE7927DA75C3DE7A92142576F0B06E369DAA5E8FFE9E4DE670D77CC596B8A'}
for name,wanted in expected.items():
 actual=hashlib.sha256((base/name).read_bytes()).hexdigest().upper(); check('input:'+name,actual==wanted and wanted in s)
manifest=Path('work/wezterm-session-link-baseline-r1/manifest.json'); check('before-manifest',hashlib.sha256(manifest.read_bytes()).hexdigest().upper()=='6359AABC11C8369336B62222D92B69D859E073AC8295B71847BA4944582A8BA1')
for row in json.loads(manifest.read_text(encoding='utf-8'))['files']:
 check('product-before:'+row['path'],hashlib.sha256(Path(row['path']).read_bytes()).hexdigest().upper()==row['sha256'])
for sec in ['范围与输入','核心链路总览','research 事实映射表','跨模块接口矩阵','主要工作包与实施顺序','风险、不确定点与事件对齐','Gate-1 与双阶段门禁']:
 check('section:'+sec,sec in s)
for n in range(1,5):
 m=re.search(r'^### S'+str(n)+r'.*?(?=^### S|^## 4\.)',s,re.M|re.S)
 text=m.group(0) if m else ''
 check('work-package:S'+str(n),bool(m) and all(x in text for x in ['目标/消费','关键','验收','作者','root','回滚','依赖']))
for n in range(1,14): check('T1 Required:'+str(n),bool(re.search(r'^\| '+str(n)+r' ',s,re.M)))
for n in range(1,10): check('P'+str(n),bool(re.search(r'^\| P'+str(n)+r' \|',s,re.M)))
for marker in ['目标锁/反目标映射完成','验证责任分层已落盘','证据产物/责任归属/证据不足约束已落盘','作者体验门证据已提供','片段闭环充分性已落盘','T2补充','T3补充','CLIENT_ID','watcher_count=null','gui_visibility=unverified','unique_observed','CommandLineToArgvW','GetProcessTimes','TerminateProcess(handle)','cleanup_unverified','_wait_connected','shared','不再派subagent','Gate-2','【DELEGATE_QUESTION】','【DELEGATE_ACTION】','UnicodeDecodeError','child exit1','不宣称瞬时绝无错连','无新增跨功能事实']:
 check('marker:'+marker,marker in s)
check('main-chain-code-shape',all(x in s for x in ['NEW_GUI =','LEGACY_GUI =','before = observe(','action = _run(','post = workbench.observe(','function terminalReady()','/api/workbench/connect']))
check('implementation-not-started',not Path('session_panel/workbench.py').exists() and not Path('tests/test_workbench.py').exists())
print(json.dumps({'checks':len(checks),'failures':sum(not x for x in checks),'lwplan_sha256':hashlib.sha256((base/'lwplan.md').read_bytes()).hexdigest().upper(),'bytes':(base/'lwplan.md').stat().st_size,'lines':len(full_s.splitlines())},ensure_ascii=False))
raise SystemExit(0 if all(checks) else 1)
```

## 7. r2当前 delta Gate-1 实际证据

本轮仍仅写lwplan。消费§1当前CBAB基线、readiness r3 `06166F…72FFC` 和root mux evidence `577DE4…FE36B`；产品27路径与before保持一致，两个新实现文件仍不存在。执行 `.venv/Scripts/python.exe -X utf8 -B -c $deltaLwGate`、`exit $LASTEXITCODE`（无管道）；脚本提取§6历史算法，替换权威基线expected为当前CBAB、追加r3 SHA，复核root mux artifact SHA及14项delta（fixed单argv/字段、unknown不计零、完整identity/action比较、负例、不可采用清理、UI无mux控制、list_panes锁边界和r1历史）。方案正文检查仍仅§1–5，历史hash只核全文件；不拿验证代码里的marker冒充方案内容。

初验 `a9f254` / **109 checks、1 failure、exit1**：检查器把r1历史C1F hash也限定在§1–5，但它按要求保留于§6。修正该历史项检查全文件，不改产品或功能方案；`93ff0d` / **109 checks、0 failures、exit0**，完整逐条输出已读。此时plan SHA `DA525153B7F9B791990F414B72D938C5051356ADD42F6B8844C76B538F6A95A5`是尾证据追加前，不作最终SHA；本段后同一全量脚本再次执行，最终SHA看尾后工具结果，不自嵌。

其它本轮异常保留：首次组合读预算截断，相关S1实现锚点按范围补读，并实际核原C1F字节；一次apply_patch不完整锚点失败、未写任何文件，正确exact锚点重试；一次旧turn store不存在的代码取回失败发生在文档patch之后，不影响patch，当前验证脚本重新构造并实跑。r1所有失败、root rg/CIM采集范围纠正与正式reader/MCP缺证继续保留。没有产品测试、HTTP/browser/GUI/attach/focus/SSH/外部进程动作，不称业务已验。

## 8. R5 真实客户端定位补丁（唯一 LW 原地恢复）

#### 本轮修订说明

[修订: PLAN_DEFECT-R5.1] 日期2026-10-05，T3；只在本唯一方案末尾覆盖 S2 的定位执行支路与 S4 直接验证，原54636字节已实施支撑正文完整保留。旧§5/§7 Gate-1 PASS、旧“未实施”和阶段文字仅为当时记录，不能放行R5。当前产品未改；本补丁不重写r3.1原生采集、r4严格只读第三profile/单一Lua pin及其禁止named启动/owned清理权限。G1/G2、连接、HTTP安全、来源/正文/机器人图形合同均不变。

[修订: PLAN_DEFECT-R5.1] 权威输入是最新 `clarifications.md` §12（SHA `B50ADF008C1869E8B73F2FAF980CC2FB0EA4140F8A0142B2A3470607637B0096`）与 `source_materials/resume_context_r5_live_testing.md`（`343660865326414429D781392D925611F006EB5B5A813A3160F8AE82D96E3DD2`）。原LW前缀仍为 `405FDE8E546B5D516D507802832A64D23AC8854AA5D11A2EC64EC33766E7C9E0`；r3.1 `AEB72C017FF60D4E370E00BA420DF250D3774A4C72E5627060A9025A8DAB8EFF`、r4 `A4010327E6BC25D15DADAF395FDFB3D3006D42086853E54E0CEF9445A8ECCF1E`、旧实施review `577AD89100028B73EC0D9C1350CEEAC58729E0072CA01D6163B9D943D95500B7` 均不改。root新建标记测试会话的有限授权不进入产品自动复活、输入或创建能力；用户持续“自动实施”免重复阶段许可，不替代双Gate。

### 核心链路总览、事实映射与接口

[修订: PLAN_DEFECT-R5.2] 现状是 UUID/process instance/strict slot-panes → fresh integrity与唯一关联 → `focus-pane-id` → 完整关联及真实client/pane后验。真实新GUI未发生键盘事件时，按ID动作exit0仍可只改变临时CLI client。改动只在完整后验其它条件成立、真实client尚未到target时，使用官方 `go-to-tab-by-id` 后有界 `focus-next-pane`；每个动作后都读取真实 `list-clients`，终验仍必须exact target、原完整关联、严格slot和原预算。选择/正文/API输出不改，避免扩大控制入口。

| research / 实际事实 | 实现锚点 | 验证锚点与口径 |
| --- | --- | --- |
| root三轮focus exit0但client仍terminal_8；23项6失败 | `Terminal._focus_session` 原post判定拆出“其它守卫有效但pane未到” | 作者no-op mock必须先红；root同真实UUID跨tab重放，exit0不能成功 |
| root先切tab能到terminal_2，再focus-pane-id仍不动 | 同函数 fallback `go-to-tab-by-id` 后检查实际client | “仅加tab”负例；未到target不确认 |
| 官方0.45.1 CLI不传真实client_id；FocusNextPane有connected-client fallback，last_active_client由Key更新（源码推断） | 小私有遍历函数，固定官方动作而不发键盘/修改env | `research-r2.md` 完整读；root一次next从2到3真实确认，不称所有布局已验 |
| 实际JSON是 `tab_id/is_selectable/is_plugin/is_held/is_floating/is_suppressed/is_fullscreen/exited`；plugin与terminal数字可相同 | 私有候选提取，使用 `terminal_id` 命名空间 | 本地真实字段形状＋非选择tabbar正例、可选择plugin/坏字段/held target拒绝 |
| 默认native/r4严格关联和原动作预算仍有拒绝价值 | 原 `same_association/integrity/action_lock` 保留；fallback与原动作共deadline | 原路径/替换/迟到/lock/latch全部回归；root超龄或unknown只记未确认 |

[修订: PLAN_DEFECT-R5.2] 私有接口矩阵：`_focus_session` → 候选提取（原list-panes dict → immutable tab-ID/candidate身份集合或拒绝）→ 有界遍历（原deadline/client-ID/target → bool未确认或准确到达）→ 原完整终验。`Workbench.observe/same_association`、native helper、gateway/source/service/UI 无新增字段/调用权限或部署依赖；候选内部数据不向HTTP返回。无需持久迁移；旧按ID成功分支无需新字段，兼容现有直接成功fixture。

### S2-R5：精确定位失败后的有限官方遍历

#### 本轮修订说明

[修订: PLAN_DEFECT-R5.3] 目标/消费：G3与§12新GUI无键盘场景；G1/G2、N1/N2/N3不变。仅 `session_panel/terminal.py`，首review落点 `Terminal._focus_session` 的原 action/post 后验分支；允许一个小候选函数和一个私有遍历函数，不引入通用动作/状态框架，产品新增优先≤100行。输入仍requested/fresh UUID、process instance、strict pane/slot及同一deadline，输出仍原 `focused/status/reason/pane_id/exit_code`。作者先读原分支即可预判新增fallback的位置和全部early exit；本包需要以下闭环骨架，不能只用叙述代替判定顺序。

[修订: PLAN_DEFECT-R5.3] 候选只为fallback校验，不使原exact-ID成功路径依赖新字段。由当前有效全量pane inventory确定：target按原strict slot命令唯一且terminal ID精确，`tab_id` 必须是非bool整数≥0；所有同 `ZELLIJ_TAB` 行均具有这一个tab_id，同tab_id不能对应其它tab_name。每行 `id` 非bool非负int、`is_plugin` 明确bool，命名空间身份无重复；`is_selectable/is_floating/is_suppressed/is_fullscreen/exited/is_held` 每项为真实bool，缺/null/数字等拒绝fallback。只支持该tab的普通tiled终端：可选择plugin、任何floating/fullscreen、可选择suppressed或exited行均拒绝；非选择普通tabbar plugin可以存在。候选包含全部 `is_selectable is True`、`is_plugin is False` 的可见tiled终端，不能只筛main/dev/files，也包含普通shell。target必须在集合、非held；其它held候选允许纯focus，绝不执行其命令。集合非空且ID唯一；遍历上限由集合长度得出，不硬编码tab/pane位置或总数。

[修订: PLAN_DEFECT-R5.3] 冻结候选fingerprint包含tab-ID及所有同tab pane的命名空间ID、tab_name、selectable/plugin/floating/suppressed/fullscreen/exited/held和terminal_command；顺序变化不影响集合，不包含 `is_focused` 或标题。进入fallback前，原inventory与exact action后的inventory均须提取成功且fingerprint完全一致；每个fallback动作后的fresh inventory重新核target strict slot/pane及fingerprint，任何增删/重建/状态/命令变化立即未确认。读清单仍用现有 `list_panes(deadline)`，不追加list-tabs probe或改workbench分类。

[修订: PLAN_DEFECT-R5.3] 执行顺序：保留锁/latch、requested→fresh process instance/slot/pane/age、inventory、fresh pins、initial/pre完整same_association、5秒deadline和remote age；原exact action非0仍 `focus_failed`，不fallback。exit0后原完整post关联、strict slot/pane、deadline/age任一失败立即 `focus_sent_unverified`；若真实post client已经target，仍原成功，无新增动作。只有其余守卫均好且pane不同才进入fallback，候选/实例异常不尝试“修复”。用固定 `_run([...,'go-to-tab-by-id',str(tab_id)], remaining)` 一次；之后有效 `list-clients` 必须恰一个、`client_id` 等于pre唯一client ID、其pane在冻结候选集合且清单/年龄/剩余预算仍有效，否则停止。每次next前都验证刚读的真实焦点；最多 `len(candidates)` 次 `focus-next-pane`，每次固定argv/剩余timeout，并在动作后真实list-clients＋fresh inventory核验。到exact target即退出；焦点重复（含完全no-op）、走出集合、client消失/新增/替换、解析/非0/异常/预算或age耗尽立刻停止，不sleep、不无限重试、不发键盘、不自动恢复原位置。纯焦点可能已改变，失败继续如实未确认。

```python
# terminal.py: target branch after exact focus action; helpers stay private.
post = workbench.observe(deadline)
after = list_panes(deadline)
if not original_non_pane_post_guards(pre, post, after, fresh, deadline):
    return sent_unverified()
if post['_clients'][0]['pane_id'] != fresh['pane_id']:
    candidates = strict_stable_candidates(inventory, after, fresh)
    if candidates is None:
        return sent_unverified()
    # tab-ID once; then at most len(candidates) next actions. Never write input.
    # After every action: list-clients exact singleton/client-ID and fresh
    # inventory fingerprint/slot/target; before every action: remaining + age.
    if not focus_next_to_exact_target(candidates, pre['_client_ids'][0], fresh, deadline):
        return sent_unverified()
    post = workbench.observe(deadline)
    after = list_panes(deadline)
    # Final full process association, candidate fingerprint and original guards.
if not original_all_post_guards(pre, post, after, fresh, deadline):
    return sent_unverified()
return original_confirmed_result()
```

[修订: PLAN_DEFECT-R5.3] 前后完整 `same_association` 包括原server、GUI/direct attach、mux和client-ID，不改变为计数；fallback初始post及最终post均为真实完整observe。每个中间步的list-clients证明当步真实client/候选焦点，不能证明期间完整进程普查原子连续；最终关联变化拒绝，原非原子竞态限制保留，不宣称已消除。lock覆盖整次请求，list_panes仍不重取lock，GET busy和cleanup_latch语义不变。所有动作、清单、完整观察共原deadline；每步发送前/读取后核 remote age累计≤5000及remaining>0，不能因循环更新refresh_finished、reset age、延长budget或缓存unknown为成功。fallback任一命令非0以 `focus_failed` 并保留该非0exit；异常/后验缺证为 `focus_sent_unverified`，成功仍 `focused=true/status=confirmed/exit_code=0` 且只称Zellij准确pane已选中。

[修订: PLAN_DEFECT-R5.3] 执行与验收：先私有候选提取→原post非pane守卫拆分→固定tab/有界next→原完整终验→S4-R5 mock回归；依赖§12/官方源码与本R5双Gate。原成功分支零fallback、失败守卫禁止追加动作；实际no-op必须转到准确目标才有真实PASS。回滚仅root保全后撤本定位增量与新测试回到原诚实未确认；不覆盖其它文件、D配置或历史证据，不回收终端/SSH/server，也不重启绕过latch。作者体验用小字典/集合和现有parse_clients/terminal_id，允许直线守卫重复，不新策略/配置枚举。

| 验证层 | evidence / owner / conclusion_if_missing |
| --- | --- |
| impl-safe | red/green mock stdout-stderr-exit、AST、两文件准确diff和before/final manifest；impl作者；缺则局部未验证，不能报PASS |
| coordinator | root独立全套Python/fixture及同真实UUID跨tab与重复定位，独立list-clients和server/GUI/attach/mux/SSH前后身份；root；缺则只有mock，不称真实定位稳定 |
| 非impl-safe | GUI/HTTP8766/SSH/测试prompt与新Codex/Claude生命周期、实际机器人/正文；只root；作者禁这些动作，缺则对应能力待证 |

### S4-R5：行为测试、真实症状回放与收口

#### 本轮修订说明

[修订: PLAN_DEFECT-R5.4] 目标/消费：G3/§12定位准确、G1/G2与N1/N2/N3不弱化。仅改 `tests/test_focus.py`，首落点原 `FakeWorkbench/run_command` 和成功用例；增加独立真实字段形状的panes、tab/next动作与实际client焦点序列，不让fake默认已到target掩盖no-op。输入mock CLI/clock/association/panes，输出原结果与动作轨迹；步骤先将真实症状写成当前产品失败的red，再实现并green、原回归、root真实交接。保留原exact-ID成功与全部拒绝测试语义，不凭加入fallback删旧错误例；测试按用户行为分组，避免镜像所有内部条件。

[修订: PLAN_DEFECT-R5.4] 有效正例：初始真实client在别tab，exact-ID exit0但no-op，tab切换到候选A，再next到target，准确成功；tab切换已到target时不next；target需要多步且邻居held，纯focus不write/CR/restore；原exact-ID成功无tab/next。负例：tab切换no-op/焦点不在集合、next no-op/重复环或到插件/另tab、singleton client-ID变化/多client/消失/坏header、tab-ID缺坏冲突、target不selectable/held/floating/fullscreen/suppressed/exited、可选择plugin、候选增删或command/held等状态变化、strict slot重建、post完整server/GUI/attach/mux变化、循环中age/5秒耗尽/timeout/非0、lock/latch/integrity失败。每个拒绝断言剩余动作数量不增加；非0exit保留；原fresh refresh→list_panes不重取action_lock仍可证明。

[修订: PLAN_DEFECT-R5.4] 作者仅本地：`.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_focus tests.test_workbench tests.test_native_processes tests.test_gateway.GatewayDispatchTests -v`；AST parse两文件，完整bytes/stdout/stderr/exit，无pipe截尾，before→diff→manifest，报告交root。root先独立复跑，再新归属确认重载自己gateway；重载内存index/last_evidence丢失明确记录，不能清未知cleanup latch。root实机至少覆盖新GUI未键盘的Music→Linux→exact dev UUID、其它候选起点和重复请求，每次独立list-clients exact target、重复connect零新GUI、保持其它held旧命令；原red全部保全。新Codex/Claude机器人各一次、原生点选/刷新身份隔离和测试消息分别验证，不以定位成功宣称Codex正文/活动或session协作已接通。

[修订: PLAN_DEFECT-R5.4] 验收与分层三元组：impl证据落 `work/wezterm-focus-impl-r5-*`（owner=impl，缺则局部未验）；root命令/前后metadata/独立client/真实browser证据落 `work/live-session-*-r5*.json/png`（owner=root，缺则具体运行能力未验）；fresh reviewer读取当前exact bytes、red/green与root全部失败，写新正式Review(Impl)（owner=fresh reviewer，缺则不交付整批PASS）。真实owned GUI失败回收、父Q6及其它旧BLOCKED仍独立，不能被本轮正例关闭。回滚仅新测试/定位增量，依赖S2-R5；作者体验保留原fake注入，小序列表示客户端变化，不造Zellij模拟器。

### 风险、门禁与作者自证

#### 本轮修订说明

[修订: PLAN_DEFECT-R5.5] 风险：多次CLI与fresh清单可能耗尽5秒，保守未确认，不调预算；只支持严格普通tiled候选，floating/fullscreen/可选plugin拒绝fallback，原exact-ID成功不受影响；用户同时改变布局/客户端或instance时停止，失败不自动恢复焦点。关联瞬时unknown原因未证，另项取证，不在本补丁编造修复、略字段或缓存成功；若实际共同预算长期无法达标，回本唯一LW修订并重Gate。所有新假设/风险/阶段切换立即在本节与root恢复记录对齐，不能仅消息口头改合同。

[修订: PLAN_DEFECT-R5.5] 无新增用户范围问题：采用已有§12技术决策和持续自动实施授权。真实目标/权限/验收/回滚不唯一才按P0安全、P1能力/预算、P2展示批量 `【DELEGATE_QUESTION】`，模板为 `已取事实/影响阶段/范围=...；A推荐+理由/B代价；请一次回复Q1=A…`；技术事实受阻用 `【DELEGATE_ACTION】supplemental-research` 回root，不递归。默认技能阶段许可与持续用户授权差异已在旧正文留痕，本轮保留技术Gate。

| Required Set | 本R5存在性承载 |
| --- | --- |
| T1.1 目标/反目标/不影响项 | §8输入与两包目标/消费，r3.1/r4和不改层 |
| T1.2 文件/首落点 | S2-R5 terminal._focus_session/候选/遍历；S4-R5 FakeWorkbench/run_command |
| T1.3 目标/步骤/验收/回滚/依赖/形态 | 两包正文及闭环骨架 |
| T1.4 每包G/N | 两包首段显式G3、G1/G2、N1/N2/N3 |
| T1.5 分层三元组/非impl-safe | S2三层表、S4证据owner/缺证约束 |
| T1.6 作者体验/可读性 | 小函数/现有parser/短行为序列，无框架 |
| T1.7 核心链路总览 | 现状→fallback落点→不改层及分层理由 |
| T1.8 research事实映射 | §8五行真实/源码事实→实现→验证 |
| T1.9 片段闭环充分性 | 原完整post→候选→tab/有限next每步真实client→完整终验，不能近似成功 |
| T1.10 Gate1显式项 | 下段四字段及复杂链项目；本轮实际自证产物 |
| T1.11 双Gate/回退 | 下段作者Gate1→root→fresh Gate2→root；失败修本节重Gate |
| T1.12 澄清/批量模板 | 本节P0/P1/P2，未触发及技术受控回传 |
| T1.13 风险/降级/Gate2复核 | 本节预算/特殊布局/unknown风险，保守未确认；下段复核 |
| T2 输入输出/边界/分层回归 | S2原结果/private候选/client边界、S4正负例与原suite |
| T3 接口/状态/兼容迁移/停机 | 私有矩阵、原HTTP不变、原成功兼容、无持久迁移、仅root归属确认reload/回滚 |

[修订: PLAN_DEFECT-R5.5] Gate-1自检显式要求：目标锁/反目标映射完成、验证责任分层已落盘、证据产物/责任归属/证据不足约束已落盘、作者体验门证据已提供，及核心链路总览/research映射/片段闭环充分性存在；T3 Required任一缺失不放行，不以任务数或测试数代门槛。作者用 `work/wezterm-focus-lw-r5-gate.py` 本轮运行输出、exit和SHA自证，仅结构/输入/unchanged，不证明产品修复。Gate-2 PENDING、allow_enter_impl:no；fresh reviewer＋root逐条Required、G/N、实现锚点、片段充分性、作者体验、人工review顺读、P1–P9、基线一致性、设计味道、当前SHA复核后才放行。失败 `LWPlan→Review(LW)` 本节最小修订重Gate；语义不唯一先受控回基线；已实施前缀必须完整，不允许以同路径为整文重写许可。

[修订: PLAN_DEFECT-R5.5] P1不以任务数门槛；P2/P3缺必备项硬失败并保留red；P4本T3含T1十三项与T2/T3；P5关键不唯一受控提问；P6事件即时对齐；P7无问题数量门槛；P8按优先级批量含推荐/代价/阶段；P9作者Gate1→root独立核→freshGate2→root实施放行。Gate-1只核本R5正文，不拿检查脚本里的字符串替代方案。

[修订: PLAN_DEFECT-R5.5] 失败保全：真实capabilities三次定位共6项失败/exit1、tab已切但按ID仍no-op和numeric同样无效；root next一次正例不覆盖前述red。当前关联波动未关闭；r4旧BLOCKED、真实owned回收/父Q6缺证与全部旧失败不改。作者本轮首次聚合长读多次截断，已单文件或精确范围补读定位合同、README、review与产品；官方字段宽rg截断后只按完整实际JSON及定界focus_next函数消费，不称穷尽全文。作者未执行产品测试、GUI/HTTP/SSH/focus/install/D写/Git；仅本唯一LW追加与work自证。建议英文提交信息：`fix(terminal): confirm exact pane focus for newly attached clients`。无新增跨功能事实。

[修订: PLAN_DEFECT-R5.5] 作者Gate-1首检 da0215：164项/3失败/exit1，完整输出已读并保存 gate-result.json；均为检查器过窄字面匹配（“步骤”对正文“执行顺序”、“共享”对原lock保持合同、“真实 owned”对“真实owned GUI”），未缺行为合同。修正检查器语义等价，不为字串重写方案，首红保留；产品/输入/前缀全部未变。当前最终自证命令与SHA见 retry1证据，不把Gate-1当产品验收。


## 9. R6 原生完整采样有限重试（唯一 LW 原地追加）

#### 本轮修订说明

[修订: PLAN_DEFECT-R6.1] root 已接纳完整基线 §13 并明确放行本节追加；唯一权威是本 `lwplan.md`，work 中的追加文本仅为准确差异产物，尚未放行产品实施。前置条件仅为 R5 局部代码冻结、root 已读准确 diff 并完成独立本地验证；不要求 R5 实机定位、独立 Review(Impl)或整批 PASS 先完成。R5 定位与 R6 采样的实机/审查可在 R6 后分别补证，避免互为稳定前提，旧 BLOCKED 不关闭。原 R5-before 全部73602字节保存在 `work/wezterm-census-lw-r6-before.md`，本节追加保留其完整前缀、§8、r3.1/r4 与全部旧失败。R5 版本码小修的最终冻结 bytes 必须同步进入 manifest 并核验后才运行正式 Gate-1。当前增量按 T2 单模块实现编写，仍消费原 feature 的完整 T3 安全合同。仅产品 `session_panel/native_processes.py` 与直接测试 `tests/test_native_processes.py` 可变。

[修订: PLAN_DEFECT-R6.1] 权威输入为 `clarifications.md` §13（SHA `28A4EC56BFB9A1590E22D0C2DA41FE054A9FE220F0B48C38CA3F4D08DE4B6E8A`）及 `source_materials/resume_context_r6_census_testing.md`：main 对明确的 api_failed/invalid_identity 至多**共3次**完整 census，沿用入口最早5秒 deadline，其它错误或任何 close_failed note 立即失败。本次数上限覆盖研究报告中“可评估2次”的早期建议；不改原报告。最终输入 hash 以当前 manifest 和实际 Gate-1 核验，fresh Gate-2 才能放行。用户持续“自动实施”授权保留，无重复阶段确认；技术 Gate 不省略。

### 9.1 目标、主链与事实映射

[修订: PLAN_DEFECT-R6.2] G1 是本轮直接目标：减少并发短命 CLI 引起的一次不完整采样，但失效样本仍 unknown、计数 null。G2/G3 消费的完整身份、唯一关联、实例及后验保持原义。N1/N2/N3 与不影响项：不创建/复活/输入/清理终端，不改 source/service/workbench/terminal/gateway/UI/CSP、D: 配置、二进制/解释器、5/8/3秒及30秒合同；不跳行、合并样本、缓存旧成功、改变 timestamp 位置或削弱任何 guard。产品变化只是一处有界完整采样调度，不新增配置、字段、重试策略框架或采集来源。

[修订: PLAN_DEFECT-R6.2] 主链是并行 GET → Workbench 原同预算观察 → 固定 base Python helper → **main 本轮改动落点** → 原完整 census/query_row/close → 单记录 stdout 或原消毒 stderr → 上层原解析/分类/双样本关联。不改下层单次 census 的 fail-closed 语义，也不改上层 unknown/timeout：只在 main 获得新的完整清单。这样避免把不可读行当作已退出，并保留旧身份和资源关闭校验。对应接口仍为无用户参数的模块入口、原六字段 rows JSON、exit0；失败 stdout 空，单一 `process_census_unknown/kind[/close_failed]` stderr、exit1。无持久数据迁移；调用方、action_lock、latch、生命周期与 R5 focus 逻辑不变。

[修订: PLAN_DEFECT-R6.2] 已读事实的最小映射如下；准确输入 bytes/hash 在 `work/wezterm-census-lw-r6-input-manifest.json`，不是修复后证据。

| 事实 | 实现/测试锚点 | 验证口径 |
| --- | --- | --- |
| 串行15/15；并发15次5个 helper exit1 | main 有界重新完整采样；原 _processes/observe 不变 | root 原并发面板观察，unknown 不能伪装0 |
| direct census 两组100次分别11、15失败；第二组7次 ticks>snapshot_ticks、6次OpenProcess、1次QueryImage、1次wait | census/query_row 原样；main 才重试 | 作者保留所有 guard；direct census 仍能拒绝，不以其继续失败判 main 修复无效 |
| actual-main stress 30次7失败，indices 0/8/10/14/27/28/29；exit1 | `native.main` 是唯一修复入口 | root 使用 `live-session-native-main-stress-r6.py` 调真实模块，不能只调用 census 作绿验收 |
| helper 原错误消毒、关闭失败 note，parent 更短 remaining timeout | 原 outer except、close_handle、Workbench._processes 不变 | 作者拒绝非retryable/close/deadline；root 面板仍受原总预算 |
| Toolhelp 快照和逐行实际 handle 生命周期不同 | 每次重新完整 census，不放宽 birth guard | 采用完整新清单，拒绝官方显示示例跳过行；module ERROR_BAD_LENGTH 不是本轮官方重试依据 |

### S1-R6：main 的三次上限与原输出契约

#### 本轮修订说明

[修订: PLAN_DEFECT-R6.3] 本包消费 G1、保全 G2/G3 与 N1/N2/N3。关键文件 `session_panel/native_processes.py`，首 review 落点 main 原单次 `rows = census(time.monotonic() + 5)`。输入是原 argv 与本机原生 API；输出仍上述单记录接口。argc 拒绝不采样；合法 argv 只计算一次 deadline。最多3次，每次直接调用原 `census(deadline)`，其头尾原检查确保不开始/接受逾期完整样本。仅捕获 **ValueError 且 str(error) 精确等于 api_failed 或 invalid_identity** 可继续；不得通过 outer 消毒后 kind 推定可重试，OSError/RuntimeError 等即使文本是 api_failed 也立即失败。任何 close_failed note 优先拒绝，第三次错误原样重新抛给既有 outer except。完整成功（含合法空列表）立即退出循环、打印一次并 exit0；失败尝试不打印、不保存 rows、不 sleep/backoff。其它原函数/枚举/API读取/资源关闭和 `snapshot_ticks` 创建前位置字节不改。

[修订: PLAN_DEFECT-R6.3] 目标形态为 main 中一段短循环，原 outer error serialization 保留；无需策略类、新私有协议或新配置。分支/优先级变化触发必需片段，下列目标骨架覆盖入口、retry eligibility、期限传递、完整成功输出与错误回流，足以顺读主链；不是在下层 query_row 加逐行重试。

```python
# native_processes.py: replace only main's single census invocation.
require(len(sys.argv) == 1, "unsupported")
deadline = time.monotonic() + 5
for attempt in range(3):
    try:
        rows = census(deadline)
        break
    except ValueError as error:
        if (str(error) not in {"api_failed", "invalid_identity"}
                or "close_failed" in getattr(error, "__notes__", [])
                or attempt == 2):
            raise
print(json.dumps(rows, ensure_ascii=True))
return 0
# Existing outer except remains responsible for one sanitized stderr + exit 1.
```

[修订: PLAN_DEFECT-R6.3] 执行顺序：依赖 R5 局部冻结与 root 准确 diff/独立本地验证、R6 完整基线、fresh 双 Gate；作者先保存两文件准确 before，再 S2 写回归 red，随后仅 main 局部替换、green 和 scope 核验。R5 实机定位和独立实施审查继续单独待证，不阻塞本采样修复。验收是一次或二次可恢复错误后只输出完整最终 rows、连续三错仍失败、不可恢复错误/关闭失败/期限耗尽不再采样。作者体验：直接循环与现有异常、deadline 名称；不重构其它函数，不为本轮引入辅助抽象。回滚由 root 先保全当前差异，只撤本 main 增量及对应测试，恢复旧单次诚实 unknown；不覆盖 R5 terminal/test_focus 或未知用户改动，不重启/回收系统进程绕过失败。

[修订: PLAN_DEFECT-R6.3] 分层责任三元组：impl 只本地 mock 单测、AST 与准确 before→diff/final manifest，证据 `work/wezterm-census-impl-r6-*`，缺则局部未验证；coordinator=root 独立复跑、actual helper 并发及原面板 browser，证据 `work/live-session-*-r6*.json/png`，缺则真实改善未证；fresh reviewer 独立 current bytes/diff/全部红绿及运行失败，正式报告在当前 feature，缺则整批不交付 PASS。真实 Win32 API/helper、HTTP8766、GUI、SSH、重载及工具调用属于非 impl-safe，仅 root 按既有授权承接，作者禁止这些动作。

### S2-R6：行为回归、真实主入口回放与证据收口

#### 本轮修订说明

[修订: PLAN_DEFECT-R6.4] 本包消费相同 G1/G2/G3、N1/N2/N3，依赖 S1 的局部实现及相同 R6 双 Gate。仅 `tests/test_native_processes.py`，首落点 `NativeCensusTests` 中 main 输出/后续行失败测试，复用 FakeApi/Mock/patch 和现有 clock。输入为本地假 API/异常/时间，输出为真实 main 结果、stdout/stderr、调用期限/次数及关闭轨迹，不启动 native helper 或任何系统进程。作者先加能使旧 main 明确红的“先失败后恢复”与“第二次失败第三次恢复”，保留完整 red，不能只改断言得到 green。

[修订: PLAN_DEFECT-R6.4] 最小行为覆盖：

- api_failed→完整成功、invalid_identity→完整成功、混合两次失败→第三次成功；断言每次同一个最早 deadline、无失败 stderr 或额外 stdout。合法空列表首成功只采一次。
- 前一完整尝试中首行通过、后续相关行失败，第二份清单内容不同；用 FakeApi 真实 census→main 验证只输出第二份、第一份部分行不合并、旧资源确已关闭。
- 三次连续 retryable 错误→stdout空/单一原消毒 stderr/exit1；准备第四个成功候选但必须不调用。旧 `test_later_related_failure_or_bad_next_never_outputs_partial_rows` 的持续失败仍拒绝，关闭计数由一次的2变为三份完整失败的6；不能删拒绝语义。
- unsupported/invalid_buffer/deadline/close_failed、未知 ValueError，以及 OSError/RuntimeError（含文本 api_failed）立即失败；retryable 后遇不可恢复错误也立即停止；任一 retryable 加 close_failed note 同样立即失败且 payload 保留 note。
- 第一份失败后到达同5秒边界，不创建第二份 snapshot；原迟到 return、PID/parent/birth/image、缓冲、枚举、关闭与上层非零→unknown 测试全保留。只因 main 上限变化更新对应轨迹，不放宽任何原 guard。

[修订: PLAN_DEFECT-R6.4] 作者执行：新测试 red→S1 最小实现→green；`.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_native_processes tests.test_workbench -v`，AST parse 两文件、精确 diff 和 before/final SHA，无管道截尾；全文 stdout/stderr/退出码及所有失败落 `work/wezterm-census-impl-r6-*`。测试只承载 main 有界行为与原 guard，不建 Windows 进程模拟器。缺 red/green 或完整输出不得称作者验证成立。

[修订: PLAN_DEFECT-R6.4] root 承接：先独立同组测试及全套必要回归；同当前固定 base image 调 `work/live-session-native-main-stress-r6.py`，复跑真实 main 在并发 list-clients 负载中的至少同形30轮，并用新文件保存100轮窗口结果，不覆写 before。期望每个已接受 helper 输出完整有效当前 rows且exit0；三次耗尽/期限/错误依然如实退出1，任何失败都列出，不以平均延迟或一次成功代替稳定窗口。harness 的6秒 subprocess envelope 只覆盖启动/诊断开销，不增加 helper 内5秒或 Workbench 总5秒。root 单独记录 probe 返回码及解析缺口：before 的 probe 7/9/10 exit0但stdout空，`probe_failed=[]` 只代表返回码，不能称30份 client 内容有效。

[修订: PLAN_DEFECT-R6.4] root 随后回放原 IAB `Promise.all` 刷新/可见轮询，读取 `/api/workbench` 与 sessions 当前结果和原唯一关联身份；保留 unknown/timeout、有效 client/pane、证据年龄及 browser 输出，区别 helper采样成功、关联成功与 R5准确focus。只归属明确时重载自己的gateway，旧cleanup_latch不清除，内存index/last_evidence重置如实报告；作者不操作。现场窗口仍有正常采样失败则未达用户“稳定”目标，回唯一 LW 最小修订及 fresh Gate，不能增加预算或忽略错误来收口。fresh reviewer 读最终两文件、before/final diff、全套红绿、两组100低层红、7/30主入口红、所有修复后数据和其它timeout，独立 Review(Impl)；缺任何层则仅报告已验局部，旧 owned 回收/父Q6/其它BLOCKED不自动关闭。

[修订: PLAN_DEFECT-R6.4] 验收/回滚/作者体验：本地断言体现用户看到的完整/unknown 和有界等待；root 报告实际窗口与局限，不能声称永不竞态。回滚仅本测试增量与 S1 main，保全 evidence；真实 GUI/server/SSH 维持原归属处理。证据三元组与 S1 共用，owner 分别 impl/root/fresh reviewer；任何层缺失按局部未验证、真实改善待证或整批未交付处理，不把子agent自称PASS当证据。

### 9.2 风险、门禁与事件对齐

#### 本轮修订说明

[修订: PLAN_DEFECT-R6.5] 仍有风险：连续创建/退出可使3次都失败；重采样会消费相同5秒的更多剩余时间、parent整体观察可能更早timeout；完整快照也非原子握手。有限恢复只针对 main 的样本失败，不保证修复系统过载、远端/CLI/IPC超时、空list-clients、freshness耗尽或新布局。R6 source记录 IAB 的 workbench_timeout/terminal_unavailable，保留为独立未解事实。研究 U1 数字缺证已由第二100次报告关闭（7次），退出因果 U2 未完整证明，不妨碍采用不略行的完整新清单；重采样收益 U3 必须由实际 main/browser关闭，R5定位独立 U4不混证。

[修订: PLAN_DEFECT-R6.5] 事件触发对齐留痕位置为本节及 root 恢复 source：本次新“实际 main 7/30红”与 probe空stdout、研究2次建议→root决策3次、draft→正式追加，以及取消 R5整批PASS 前置依赖均明确记录。R5 版本非0码吞失的局部修正由原作者完成，旧 terminal/test_focus hash 留存历史，正式 R6 before 必须重新读取最终冻结 bytes，不能借此修改 R5 逻辑。基线/范围/验收/回滚现无新增用户问题；不重复已有auto授权。若新风险使口径不唯一，按P0安全/P1能力与预算/P2展示批量 `【DELEGATE_QUESTION】`，模板：`事实/影响阶段/需要选择的范围；A推荐+理由/B代价；请一次回复Q1=A…`；技术补证 `【DELEGATE_ACTION】supplemental-research` 回root，不递归。baseline或共享合同漂移先报告root，不能静默改其他文件。

[修订: PLAN_DEFECT-R6.5] Required Set 存在性自检承载如下；缺任一项即不放行，不设任务数/问题数质量门槛。

| Required | 本R6承载 |
| --- | --- |
| T1.1 G/N/不影响项；T1.2 文件与首落点 | §9.1；两包 main/NativeCensusTests |
| T1.3 目标/步骤/验收/回滚/依赖/目标形态；T1.4 每包G/N | S1/S2首段、执行与回滚 |
| T1.5 三层验证/证据owner/缺证约束；T1.6 作者体验 | 两包分层段、短循环和现有FakeApi |
| T1.7 主链；T1.8 research映射；T1.9 片段闭环 | §9.1及S1目标骨架→原错误出口→S2真实main验收 |
| T1.10 Gate1四显式项；T1.11 双Gate/回退 | 下段Gate规定 |
| T1.12 澄清与批量模板；T1.13 风险/降级/Gate2复核 | 本节事件、模板、风险及下段 |
| T2 输入输出/边界、测试分层与回归 | §9.1接口；S1eligibility/deadline；S2分层矩阵 |
| 原T3接口/兼容/迁移/停机合同 | 不改调用方/API状态/生命周期，无持久迁移；仅root归属确认reload与局部回滚 |

[修订: PLAN_DEFECT-R6.5] Gate-1由作者在**正式追加后**实际自检：目标锁/反目标映射完成、验证责任分层已落盘、证据产物/owner/证据不足约束已落盘、作者体验门证据已提供，及核心链路/research映射/片段闭环/完整Required存在；输入 currentSHA、已实施前缀保全与准确before一并核验。作者只读检查器为 `work/wezterm-census-lw-r6-gate.py`，本轮实际全文输出/退出码、checks 和 SHA 存 `work/wezterm-census-lw-r6-gate-result.json`；该证据只支持计划/输入/不变项自证，不能证明产品修复。Gate-2 PENDING、allow_enter_impl:no。root 独立核验后 fresh review_plan 主检Gate-2、root复核实现锚点/目标形态/片段触发与充分性、作者体验、G/N、P1-P9、输入基线和职责分层，才可放行唯一impl。失败回环 `LWPlan→Review(LW)` 本§9最小修订；语义不唯一先回基线，绝不删除已实施前缀。

[修订: PLAN_DEFECT-R6.5] P1/P2/P3 不以数量替代必备项、保留失败；P4 T2含T1十三项且沿用原T3；P5关键不唯一受控回传；P6事件即时对齐；P7不设问题数；P8优先级批量推荐/代价；P9作者Gate1→root独核→freshGate2→root实施。实施后另需本轮真实主入口/browser与fresh Review(Impl)，不能用旧PASS进入R6。

[修订: PLAN_DEFECT-R6.5] 失败保全：旧真实focus/no-op、串行与并发15样本、低层100次11/15失败、actual-main30次7失败及诊断首次import失败（root f2ee25，已修仅work脚本sys.path）全部保留；probe空stdout及其它timeout不隐去。作者长读输出截断已分区与结构化补读；本次仅修改唯一LW追加及work文档/自证文件，未运行产品测试或真实动作、未改产品/clarifications/README。英文提交建议：`fix(workbench): retry complete native process census within one deadline`。无新增跨功能事实。
## 10. R7 严格 tiled 目标直接定位（唯一 LW 原地收敛）

#### 本轮修订说明

[修订: PLAN_DEFECT-R7.1] 2026-10-05，T2 局部收敛，沿用原 feature T3 安全合同。本节由已审 work 草稿收敛；root 已写好 `clarifications.md` §14 并明确放行方案追加，原字节保留唯一 LW 全部 R5/R6 前缀后追加本§10，未放行产品。正式 Gate-1/2 未通过前产品未放行；用户持续自动实施授权免重复阶段许可。原§8严格候选/每步真实client/完整终验与§9 native三次完整采样保留；只覆盖§8“严格 tiled 必须先 exact＋整套中间post”的执行顺序，不关闭旧 BLOCKED、owned回收、父Q6或其它缺证。

[修订: PLAN_DEFECT-R7.1] 输入为当前 §14 完整基线与 root R6 后真实产品 phase `work/live-session-focus-timing-r6-after-1.json`。作者已读其47事件及最终state：initial/pre完整关联各约641ms，中间post657ms、final719ms；强制刷新1594ms（返回row取整1593）。exact-ID exit0后真实client仍terminal8；tab-ID1即到terminal3，未执行next；final完整关联、候选清单、真实client均好，但远端累计age约5766ms（按实际返回row1593计算约5765ms，1ms取整差异），动作窗口约3766ms仍未超5秒，结果诚实未确认/exit1。删 exact＋中间post/inventory 的本样本成本1125ms；同耗时模型age约4641ms（row口径约4640ms）仅是推算，不能先称实机成功。R6采样/关联窗口与精确focus各自验收。

### 10.1 核心链路、接口与事实映射

#### 本轮修订说明

[修订: PLAN_DEFECT-R7.2] G3 是直接目标；G1失效unknown与G2连接规则保持。N1/N2/N3不变：不发送键盘/字符、创建/复活/清理终端，不改D:、source/service/workbench/native/gateway/MCP/reader/UI/CSP、依赖/解释器/-S、采样与动作5秒、远端累计age5秒/陈旧30秒。现状“initial→requested/force→inventory→pins/pre→exact→中间完整post/inventory→tab/next→完整final/inventory”改为：同一前检原样；严格候选成立则直接已有tab/next；候选不成立仍原exact支路；两者只做一次完整最终post/inventory。只改 `terminal.py` 与 `test_focus.py`，优先产品≤100新增行，无新策略框架。

| research事实 | 实现锚点 / 验证锚点 | 验证口径 |
| --- | --- | --- |
| 新GUI exact-ID可能落临时client，官方tab-ID/next有connected fallback；实际tab1到target | `_focus_session` pre后以现有 `_focus_candidates` 选路线；本地跨tab、tab即target/多步 | 每步raw clients精确唯一client-ID＋pane，不能凭exit0/空stdout |
| 最新phase因age而非动作deadline拒绝；中间1125ms可省 | strict支路不发exact、不做中间完整post；带成本fake-clock先red | 年龄/最早deadline仍原值；root重新测，不套用旧性能模型 |
| 当前候选fingerprint及最终完整关联仍必需 | `_focus_next`原样；共用final加strict fingerprint/target判定 | 每步增删/held/command/client变化停止，final所有关联键仍逐项拒绝 |

[修订: PLAN_DEFECT-R7.2] 私有接口仍是 `_focus_session(service, UUID, initial, result)`、`_focus_candidates(panes, fresh)`、`_focus_next(candidates, client_id, fresh, refresh_finished, deadline)`；输入/输出字段与HTTP status/reason语义不变。strict只有候选成功时适用；普通旧fixture或其它未接受布局仍exact-ID并原完整后验，不给不支持布局tab/next。无持久迁移/新配置/开关；纯控制流收敛不需新增服务停机，只有root在验证后按归属确认重载自己gateway并记录内存索引变化，不清latch。

### S1-R7：只收敛定位路线及最终判定

#### 本轮修订说明

[修订: PLAN_DEFECT-R7.3] 本包消费G3、保全G1/G2与N1/N2/N3。关键文件 `session_panel/terminal.py`；首review落点 `_focus_session` 中现有remaining检查后的try块。原函数全保留，不删函数链；保留 `terminal_id/parse_slot_command/parse_clients/_focus_candidates/_focus_next/list_panes` 实际字节与r3.1/r4/native逻辑。目标形态为一个小if/else选择已存在动作，再一份共用完整final，不提取通用guard/调度器。作者先保存两产品准确before及全29来源SHA，S2先写有效red，再局部变更、green、准确diff和scope；依赖正式§14、正式追加与双Gate/root实施放行。

[修订: PLAN_DEFECT-R7.3] 执行顺序：锁/latch、initial、requested/force实例与slot/pane比较、额外inventory唯一匹配、原最早refresh_finished/累计age、原deadline创建位置、fresh pins、pre及initial/pre完整same_association全不改。剩余/age有效后从这份inventory提取strict candidates；成立时直接 `_focus_next`，None→原sent_unverified、非0→focus_failed且保留exit，0→唯一最终完整observe/list_panes；不成立时原exact-ID，非0仍原focus_failed、exit0→原完整最终observe/list_panes，真实pane不同未确认且不tab/next。strict每步已有version/client/inventory/topology/预算检查不变；strict最终fresh inventory非0仍focus_failed且保留exit，版本文本不符仍未确认；nonstrict保持原exact支路后验失败语义。最终两支路均需can_focus、same_association(pre,post)全server/GUI/directattach/mux/client-ID、strict唯一slot/pane、真实client exacttarget及deadline/累计age；strict再需fingerprint完全等于冻结candidates。任何final缺证均原未确认；异常沿原catch，不新增重试/恢复。

```python
# terminal.py, _focus_session: replace only the existing action/post branch.
# All original prechecks, deadline creation, pins and pre observe remain above.
candidates = _focus_candidates(inventory['panes'], fresh)
if candidates is not None:
    code = self._focus_next(candidates, pre['_clients'][0]['client_id'],
                            fresh, refresh_finished, deadline)
    if code is None: return original_sent_unverified()
    if code: return original_focus_failed(code)
else:
    action = original_exact_id_with_remaining_timeout()
    if action.returncode: return original_focus_failed(action.returncode)
post = self.workbench.observe(deadline)
after = self.list_panes(deadline)
# Strict branch preserves any final inventory nonzero exit.
# Both: full association + unique strict slot/pane + real exact client pane
#       + original cumulative remote age + original shared deadline.
# Strict: additionally require after candidate fingerprint == candidates.
if not all_original_final_guards_and_strict_fingerprint(...):
    return original_sent_unverified()
return original_confirmed_result()
```

[修订: PLAN_DEFECT-R7.3] 片段闭环充分性：骨架展示原前检边界→route→每步已有私有函数→一次完整最终关联/清单→原成功或失败，final客户端判定不得埋在只有strict才执行的分支。验收为strict不再发exact且准确到target、nonstrict exact成功/失败仍旧语义；新样本预算收益待root验证。回滚由root保全后只撤本try增量与S2对应测试，恢复R5.2诚实未确认，保留R6与所有非本轮修改，不重启清latch或回收进程。作者体验：沿用原函数/短直线判定，少量重复守卫可接受，不为减行造协议抽象。

[修订: PLAN_DEFECT-R7.3] 本包三元组：impl仅本地mock/AST/准确before→patch→final manifest，落 `work/wezterm-focus-impl-r7-*`，缺则局部未验证；coordinator=root独立复跑并同UUID真实phase/跨tab/非目标pane与客户端/进程前后身份，落 `work/live-session-*-r7*.json/png`，缺则真实定位/收益待证；fresh reviewer独立当前bytes/diff/全部红绿与root失败写正式Review(Impl)，缺则整批不交付PASS。GUI/HTTP8766/SSH/真实CLI/helper/服务/D写/Git均非impl-safe只root，作者禁这些动作和递归。

### S2-R7：保留拒绝语义并重放超龄症状

#### 本轮修订说明

[修订: PLAN_DEFECT-R7.4] 本包消费同G3、保全G1/G2与N1/N2/N3，依赖S1和同双Gate；仅 `tests/test_focus.py`，首落点 `FocusFallbackTests` 的动作轨迹/clock/最终观察注入。先新增成本回归red：fresh约1.6秒、每份完整observe/清单约0.65/0.42秒及pins/action/client读成本，tab到真实target；旧exact＋中间post使age>5秒而未确认，新路线同5秒内完整final确认。成本由fake可观察调用累计，不因所测分支手工reset age/deadline。额外正例：strict从其它tab直接tab＋next、多步/held邻居、tab已到target无需next、nonstrict原exact成功零tab/next。

[修订: PLAN_DEFECT-R7.4] 保留全部行为拒绝例，只有已批准路线变化才调整旧expectations：strict轨迹删除exact，原“中间post拒绝”改验证唯一final完整关联拒绝；final observation由第4变第3，库存从initial→中间→tab→next→final变initial→tab→next→final，版本非0/文本不符按实际步锚定新counts（含final），不能删旧version吞码回归。每步client替换/多/消失/坏或空header、焦点越界/no-op/重复、候选增删或slot/command/held重建、final所有server/GUI/attach/mux/client-ID变化、deadline/remote-age/timeout/非0exit、lock/latch/pins/instance等仍拒绝，并断言后续动作不再增加。unsupported候选仍不得tab/next；原精确成功fixture不人为补齐strict字段。新增final迟到/真实pane被改走仍未确认，不能仅减少观察次数换绿。

[修订: PLAN_DEFECT-R7.4] impl-safe命令 `.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_focus tests.test_workbench tests.test_native_processes tests.test_gateway.GatewayDispatchTests -v`，red/green完整stdout/stderr/exit及tested SHA落同 `work/wezterm-focus-impl-r7-*`；AST与全29来源scope/diff核验。作者体验复用原fake/clock与短序列，不建Zellij模拟器。root独立上述及必要全套回归，之后只重载自己的gateway，真实新GUI未键盘，分别从其它tab（如Music）及目标tab内非目标pane出发重复同UUID定位；后者必须真实执行next，不能只靠goTab记住dev，每次独立list-clients exacttarget、完整关联/slot/topology与earliest远端age/共享deadline均有效才计正例；记录任何busy/unknown/non0/empty/late，不以currentalreadydev一次成功收口。root证据同 `work/live-session-*-r7*`，缺则实机收益未证；fresh reviewer正式报告缺则整批未交付。回滚同S1且保留全部red。旧真实owned回收/Q6/Codex正文活动/图形性能独立待证，不能拿此次focus绿关闭。

### 10.2 风险、Required Set 与双Gate

#### 本轮修订说明

[修订: PLAN_DEFECT-R7.5] 风险/降级：远端/CLI或多步布局仍可耗尽原5秒，保持unknown/未确认；去掉中间完整observe后，过程中的进程变化只在完整final拒绝，原非原子限制不变，每步client/topology照旧。优化预计1125ms仅对应已读样本，root真实phase可推翻。事件触发对齐留痕位置本节及root§14/source：R6后关联恢复、新超龄失败、strict路线改变、draft→正式LW均记录，不复制长研究。基线/范围/验收/回滚目前未触发新用户问题，因root技术决策范围已明确；若漂移/口径不唯一，P0安全/P1能力预算/P2展示一次批量 `【DELEGATE_QUESTION】事实/阶段/范围；A推荐+理由/B代价；请Q1=A…`，补证仅 `【DELEGATE_ACTION】supplemental-research` 回root，不递归或静默扩大。

| Required Set | 本R7承载 |
| --- | --- |
| T1.1 G/N/不影响项；T1.2 文件/首落点 | §10.1；S1 try/S2 FocusFallbackTests |
| T1.3 目标/步骤/验收/回滚/依赖/目标形态；T1.4 每包G/N | S1/S2段落与骨架 |
| T1.5 三层验证/证据owner/缺证；T1.6 作者体验 | S1三元组、S2命令/真验/fresh review；原函数/fake |
| T1.7 主链；T1.8 research映射；T1.9 片段闭环 | §10.1；S1唯一最终判定骨架 |
| T1.10 Gate1显式项；T1.11 双Gate/回退 | 下段 |
| T1.12 澄清/批量模板；T1.13 风险/降级/Gate2复核 | 本节及下段 |
| T2 输入输出/边界/回归；原T3兼容/接口/迁移/停机 | §10.1私有矩阵、S1/S2；无持久迁移/仅root reload与回滚 |

[修订: PLAN_DEFECT-R7.5] 正式追加后作者Gate-1必须实际自检完整Required及四显式项：目标锁/反目标映射完成、验证责任分层已落盘、证据产物/责任归属/证据不足约束已落盘、作者体验门证据已提供；并核核心链路/research映射/片段闭环、§14/current inputs SHA、29产品完全未改和before全前缀保留。命令/完整输出/exit存 `work/wezterm-focus-lw-r7-gate-result.json`，只自证方案不证明产品。Gate-2 PENDING，allow_enter_impl:no；root独立核验后fresh review_plan主检、root复核Required、G/N、锚点/形态、片段充分性/顺读、三层证据与作者体验、基线/设计味道/P1-P9，全部满足才另行明确放行实施。失败回 `LWPlan→Review(LW)` 本§10最小修订；语义不唯一先回§14，不删除R5/R6前缀。P1/P2/P3/P7不设数量门槛、缺必备即失败；P4按T2含T1及原T3；P5/P6/P8按本节；P9双Gate及实施后fresh审查不省。

[修订: PLAN_DEFECT-R7.5] 失败保全：R5全部no-op、版本吞码red、loaded-first10/26、旧native窗口红、本次R6-after实际focus_sent_unverified/exit1和模型不等于成功均保留；长读聚合截断已分段补读，47事件与6份全字段pane清单等价核验完成。当前作者仅保留before并追加权威§10及work证据；产品未改，未运行产品或真实动作。英文提交建议：`fix(terminal): focus strict tiled panes without redundant exact-id probes`。无新增跨功能事实。


## 11. R8 精确定位路径与同请求证据收敛

#### 本轮修订说明

[修订: PLAN_DEFECT-R8.1] 以完整clarifications§15、R8 source、当前README及R7 ReviewImpl(REVISE/PLAN_DEFECT)为权威输入。T3同一控制证据链的局部收敛；完整保留唯一LW原104467字节前缀与§8–10，追加本§11覆盖下述有限锚点，再经Gate1、fresh ReviewLW/root Gate2与实施明确放行。产品仍为冻结R7；先前shortest previous与未含同请求复用的work草稿均保全，不实施previous。当前输入/29产品及四路径before见`work/wezterm-focus-lw-r8-input-manifest.json`，不另建权威LW。

[修订: PLAN_DEFECT-R8.1] 目标锁G3为准确目标和原完整终验；G1诚实unknown、G2连接规则保全。N1/N2/N3及原5秒累计age/最早动作deadline、版本/全部非0、pins/lock/latch不变。产品仅`session_panel/terminal.py`、`session_panel/service.py`、`tests/test_focus.py`、`tests/test_observation.py`四路径；其它25来源、Workbench/native/source/UI/CSP/MCP/解释器/-S/D不动，不加键盘、创建/复活/清理、旧缓存成功、新status接口或预算框架。两个源码合计≤100新增行优先，不做无关重构；真实收益不得先称稳定。

[修订: PLAN_DEFECT-R8.1] 实际缺口：R7跨tab一次exit0/confirmed，最终age4375ms；同tab错误pane4的产品goTab仍4，next5→2，累计age约5218ms便停止，没有到3或完整final，exit1/未确认。无效goTab及采样约844ms，force后又查一次version/panes约454/437ms(next/cross)。root真实循环成立；`live-session-focus-up-r8-1.json`对4/5各一次up到3，完整动作采样1156/859ms，几何与完整关联保持。它们只是候选机制证据；cross保存错误5仍需goTab再移动，必须去重复成本并由产品完整终验实测，不能将模型、探针或本地147/0当稳定。

### 11.1 主链、事实映射与私有数据

#### 本轮修订说明

[修订: PLAN_DEFECT-R8.2] 核心链路：原initial与requested→Service原force刷新(远端＋version/完整panes＋merge)私有返回view及该份inventory→Terminal省紧跟force的重复清单，原binding/唯一slot与累计age验证→原位置deadline/pins/完整pre→pre真实singleton pane已在候选集则省goTab，否则原goTab及全采样→唯一目标up，否则原next→每个实际动作rawclients/version/fullpanes→R7唯一完整final observe＋freshpanes。已exacttarget零动作/零附属采样，但完整final照做。分层只连接现有Service采集与Terminal控制，公共cache/API/UI不变；不加previous/通用寻路。

| 已读事实 | 实现/验证锚点 | 口径 |
| --- | --- | --- |
| 固定官方grid1086–1115：直接上方、严格x重叠的selectable邻居，再依active_at选；tab getter8096–8107与public全pane坐标同源 | `_focus_next`仅所有几何up邻居集合恰为target才用up；S2多个邻居回next | 不猜active_at、中心距离、ID顺序或is_focused |
| R7 next 39事件的无效goTab844ms和单向绕行；root真实环路；当前4/5上方唯一3 | pre真实pane传入helper；同tab省tab；root每个错误pane及跨tab矩阵 | 5两次旋转成本模型仍可能>5，故只候选one-hop up；不以模型或探针代产品正例 |
| grid new35–45排除内部panes_to_hide；tiled2007–2065与方向分支stack会展开；pane_info3071–3082未暴露stack/active_at；空group不是stack证明 | geometry纳入冻结fingerprint；实际up必须target，几何/原每步guard与完整final均有效 | 唯一几何集合只是动作候选，不能声称非stack/无隐藏或原子；偏离即停，不以exit0确认 |
| Service当前force已经完整取version/panes并用于merge，Terminal又立即重复；远端earliest age包含全部刷新成本 | `refresh_observation`私有forced pair→`_focus_session`复用同份清单；S2真实Service/Fake runner次数及age | 只同请求当前证据；不复用公共缓存或最后perstep清单，不省最终刷新、不移动任何时间起点 |

[修订: PLAN_DEFECT-R8.2] `_focus_candidates`保留原三元组及frozenset候选；fingerprint每行在原identity/tab/flags/command后追加一项`(pane_x,pane_y,pane_rows,pane_columns)`。目标tab所有行四字段必须非bool int，x/y≥0、rows/columns>0；selectable坐标(y,x)唯一。缺字段/非法/重复坐标令candidate为None，安全保留R7原nonstrict exact和完整后验，不发任何guided tab/next/up或猜顺序。原浮动/fullscreen/selectable插件/suppressed/exited/目标held/重复身份等拒绝不放宽；零/多个不同坐标up邻居是方向歧义，仍原next。

[修订: PLAN_DEFECT-R8.2] 私有接口矩阵：`SessionService.refresh_observation(self, force=False, *, _include_inventory=False)`默认仍返回原dict；仅force=True且该私有flag=True返回`(view, inventory)`，inventory是本次刚取并用于merge的完整原dict，含失败reason/exit。私有flag且force=False明确ValueError，不能拿cache返回假fresh。inventory只局部返回，不存attribute/snapshot/cache/公开schema，不修改它；view仍原deepcopy、revision/unknown/stale/缓存规则。远端/清单exception仍原失败字典，pair不复用旧成功；Terminal原binding拒绝优先，不能遇错再补查询绕过。普通public调用不变，无存量迁移或配置。

[修订: PLAN_DEFECT-R8.2] helper精确签名为`_focus_next(self, candidates, client_id, fresh, refresh_finished, deadline, current_pane_id)`，唯一调用者传pre真实client pane和原client-ID，不看inventory.is_focused。geometry由fingerprint末项组成小dict，不加结构类。时间原点：Service started仍在远端采集之前；Terminal `refresh_finished=self.clock()`仍紧跟force返回，年龄仍fresh.age_ms加elapsed；deadline仍在库存/年龄前检之后、pins之前同一代码位置，不reset/延期。HTTP输出/reason、锁/latch/关联/版本守卫不变；root按归属加载自有gateway，不清latch。S1片段覆盖force pair→前检→当前位置→动作→每步证据→共同final的闭环。

### S1-R8：同请求当前清单、当前位置与唯一up候选

#### 本轮修订说明

[修订: PLAN_DEFECT-R8.3] 消费G3、保全G1/G2/N1–N3。两源码首落点为`service.py:SessionService.refresh_observation`原cache分支/return，以及`terminal.py:_focus_session`force与重复inventory、`_focus_candidates`末项、`_focus_next`动作选择/唯一caller。这是§10“Service与helpers不改”的有限覆盖：只这些锚点，不删函数；除force pair调用和删一条重复inventory赋值之外，原前检/deadline/pins/pre保留，R7共同final保持字节。形态为一个私有可选返回分支＋原helper少量字段/up检查，不建策略/guard框架。步骤：先四路径before/29产品/current权威，S2成本及私有契约red；再Service pair及caller去重，几何/current/up，最后完整回归/scope。依赖正式双Gate及root实施放行。

```python
# service.py: refresh_observation; original lock, refresh, merge and cache intact.
def refresh_observation(self, force=False, *, _include_inventory=False):
    if _include_inventory and not force:
        raise ValueError('fresh inventory requires force')
    with self._observation_lock:
        # Original default cache branch still returns self._view().
        # Original started-before-remote, terminal.list_panes, merge,
        # snapshot/revision/_started assignments remain here unchanged.
        view = self._view()
        return (view, inventory) if _include_inventory else view
# terminal.py: _focus_session; replace forced call and remove extra list_panes.
requested = service.get_session_status(session_id)  # unchanged
refreshed, inventory = service.refresh_observation(force=True, _include_inventory=True)
refresh_finished = self.clock()  # same position, no age reset
# Original required fields, matching slot/pane, inventory.ok and cumulative age.
# Original deadline after inventory/age checks, then pins and complete pre.
# Strict helper receives pre['_clients'][0]['pane_id']; nonstrict exact unchanged.
```

```python
# terminal.py: _focus_session adds pre's real pane to its _focus_next call.
# _focus_next: retain original command, parser, version, inventory and budgets.
geometry = {entry[0]: entry[-1] for entry in candidates[2]}
current = current_pane_id if current_pane_id in candidates[1] else None
seen = {current} if current is not None else set()
for step in range(len(candidates[1]) + 1):
    if original_deadline_or_cumulative_age_expired(): return None
    if current == fresh['pane_id']: return 0  # caller still performs full final
    use_up = False
    if current is None:
        arguments = ['go-to-tab-by-id', str(candidates[0])]
    else:
        x, y, rows, columns = geometry[current]
        above = [identity for identity in candidates[1]
                 if geometry[identity][1] + geometry[identity][2] == y
                 and max(x, geometry[identity][0]) < min(x+columns, geometry[identity][0]+geometry[identity][3])]
        use_up = len(above) == 1 and above[0] == fresh['pane_id']
        arguments = ['move-focus', 'up'] if use_up else ['focus-next-pane']
    # Inline all original action/nonzero, real exact client-ID, version,
    # full inventory/fingerprint, age/deadline guards here; no new protocol.
    actual = original_verified_real_pane_after_action(arguments)
    if use_up and actual != fresh['pane_id']: return None
    # Original target/repeat/outside checks remain, after every original guard.
    if actual == fresh['pane_id']: return 0
    if actual not in candidates[1] or actual in seen: return None
    seen.add(actual)
    current = actual
return None
# _focus_session always retains the R7 complete final observe/inventory.
```

[修订: PLAN_DEFECT-R8.3] 骨架只表示原地改动，`original_*`不是待新增函数。共享deadline/age在零动作返回前仍检查；每个真正动作之后仍raw唯一真实client-ID、version/fullinventory及全fingerprint（现含geometry）和原预算，任何命令非0保留原focus_failed/exit；缺证/超龄/循环/越界为原未确认。up真实未到target或尺寸/位置变化立即停止，不“失败后随机next”；只有事前up候选歧义才选next。stack/hidden公共字段不足，不把空{}或矩形表宣称普通非stack证明，也不发move-focus-or-tab。真正到target仍须共同完整final全部关联/server/GUI/directattach/mux/client-ID、唯一slot/pane、冻结geometry、实例累计age/最早deadline和真实pane，不早返HTTP成功。

[修订: PLAN_DEFECT-R8.3] 验收：forced pair恰为本次merge库存、默认public schema/cache相同、坏证据不补取；same-tab 2→3 next1、4/5→3唯一up各1、已在3无动作但完整initial/pre/final；outside goTab后每次全采样。坏geometry安全保留nonstrict原exact，不扩guided布局。cross保存错误5仍可能超龄，root实测可否决收益，迟到诚实未确认。回滚仅撤本轮四路径准确增量到当前R7 before，保留R6/旧记录/其它用户工作，不清latch。作者体验沿用原服务函数、私有三元组/set/原循环与短列表，不加返回类型框架。

[修订: PLAN_DEFECT-R8.3] 三元组：impl仅本地Mock/AST、成本red→green、准确diff/scope，证据`work/wezterm-focus-impl-r8-*`，缺则局部未验证；coordinator=root独立当前回归/真实route预算与UUID/身份，证据`work/live-session-*-r8*.json/png`，缺则实机收益/稳定未证；fresh reviewer独立bytes/diff/所有红绿与root失败落正式ReviewImpl，缺则整批不交付。作者禁HTTP/SSH/GUI/真实CLI/helper/Win32/服务/D/Git/递归，实机只root。

### S2-R8：一跳成本与几何/方向拒绝回归

#### 本轮修订说明

[修订: PLAN_DEFECT-R8.4] 消费G3、保全G1/G2/N1–N3，依赖正式双Gate；两测试首落点`test_focus.py:FocusFallbackTests` runner/moves/clock与严格fixture、`test_observation.py`真实SessionService的Mock远端/terminal/clock。先red：实际Service force成本及同请求库存契约，目标tab错误4/5与跨tab保存错5的完整调用成本，R7goTab/next/重复清单导致同5秒超龄；R8同初始远端年龄/延迟、完整pre/final，通过one-hop及仅一次force清单收敛，不重置年龄/期限或只断言少调用。成本按R7/up实际事件固定，断言最终confirmed/exacttarget且两个累计窗口；保留red源/完整输出。新positive为2-next、4/5-up、target零动作、跨tab落target/错4或5、多个up邻居原next；乱ID/返回顺序且非硬编码目标。只有strict fixture补官方geometry，legacy/nonstrict成功fixture不补。

[修订: PLAN_DEFECT-R8.4] Service契约测试：默认force/no-force依旧dict及原5秒cache/30秒stale；私有pair强制重新取远端/version/fullinventory，merge与Terminal使用同份完整库存；false-force私有调用拒绝，remote/terminal失败pair仍unknown，不藏失败exit或复用上一份成功；先返回A再force B不能跨请求偷A，快照不增inventory key/attribute，view深拷贝，返回库存修改不能污染公共snapshot。clock推进覆盖force远端＋库存整个耗时均进入age，refresh_finished之后继续累积，去重前后deadline始终库存验证后/pins前。复用原fakes/Mock/clock，测试只局部行为，无新模拟器。

[修订: PLAN_DEFECT-R8.4] 新negative：四geometry字段缺失/None/bool/string/负坐标/零负尺寸、重复selectable坐标安全回原exact无guided动作；合法几何up零/多邻居不猜up；up non0/timeout、client多/换/消失/空header、noop/错误pane（即使在候选内）停止，不转next；动作后/final位置/尺寸变化、stack式展开拒绝。零动作final关联/client/pane/geometry改变或迟到/超龄也拒绝。原版本非0/文本不匹配、所有非0、候选增删/command/held、全部same_association、instance/pins/锁/latch/deadline/age/timeout与nonstrict成功/失败/清单非0语义完整保留，仅合法轨迹计数调整。测试注入/动作序列文字足够预判形态，无需新模拟器片段。

[修订: PLAN_DEFECT-R8.4] impl-safe命令`.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_focus tests.test_observation tests.test_workbench tests.test_native_processes tests.test_gateway.GatewayDispatchTests -v`，作者完整stdout/stderr/exit/testedSHA、准确patch/manifest与正式`impl_report_r8.md`，缺则局部未证。root独立当前全量/scope，并只在新UUID0990a0a5/PID3886044/ticks1341437828/sameboot/slotdev/pane3上实际5种起点各3轮：目标tab错2、错4、错5，other-tab且目标tab保存错5，以及已exacttarget。每轮完整final＋独立singleton exacttarget、完整关联/slot/instance/geometry、原两个5秒成立才计确认，所有busy/red/unknown留存；该3轮为本批指定验收，不是通用数量门。root真实HTTP/IAB刷新与点选，新远端与原Codex ID01a10809-706b-78e3-b279-c3611cf75be0各一mesh/UUID/正文隔离，旧c930 missing不混。生命周期已有退出/新实例证据仍需和当前产品对应，不扩为所有owned清理PASS。root/fresh reviewer证据与缺证约束同S1，回滚四路径同S1并留red。

### 11.2 风险、正式化与Required

#### 本轮修订说明

[修订: PLAN_DEFECT-R8.5] 状态/unsafe-stop：原busy/cleanup_latch/initial未知在动作前拒绝；requested与force身份/绑定/slot/库存失败原binding_unknown；pins/pre关联失败原reason；strict任一action/client/version/panes非0为focus_failed并保留exit，版本文本/解析空坏/client改变/越界/循环/up错误/几何变化/late为原未确认，零动作最终失败也不确认；nonstrict exact与其最终非0语义原样。唯一up不证明hidden/stack/active_at，官方nested-host bubble/empty exit0不作ACK；所有动作要实际证据及完整final。私有pair误用立即ValueError，不向public开放。持续实机失败/超龄不加预算，停用本批确认结论并回正式方案；如需回滚，root核归属撤准确增量/加载自有服务，禁止杀用户进程/清latch。无存量迁移、新开关或新停机框架。

[修订: PLAN_DEFECT-R8.5] 无未回答问题：root§15/source已落账并明确本章追加放行，用户持续自动授权无需再问；新路线/同请求复用/四文件范围已即时对齐。本节与source为事件触发留痕；出现新假设/风险/阶段切换立即回root。口径/范围/回滚不唯一按P0安全/P1能力预算/P2展示批量模板：`【DELEGATE_QUESTION】需要确认:事实＋问题；优先级:P0|P1|P2；影响阶段:LWPlan|Review|Impl；A(推荐＋理由)/B(代价)；请Q1=A…`；补证用`【DELEGATE_ACTION】操作类型:supplemental-research；主题/输出路径/期望回传`，不递归或自作实际动作。

[修订: PLAN_DEFECT-R8.5] Required承载：T1.1 G/N/不改层、7主链/8事实映射/9闭环在11.1与S1片段；2首落点、3每包步骤/验收/回滚/依赖/形态、4每包G/N、5三层owner/evidence/缺证、6作者体验在S1/S2；10作者Gate1实际四项“目标锁/反目标映射完成、验证责任分层已落盘、证据产物/责任归属/证据不足约束已落盘、作者体验门证据已提供”；11双Gate/回退、12批量模板、13风险与Gate2复核在本节。T2输入/输出/边界/测试范围、T3跨模块私有接口矩阵/兼容/无迁移及unsafe-stop已明确；S1/S2共用三元组，S2不得代root真实层。

[修订: PLAN_DEFECT-R8.5] 双Gate：作者完成本章后实际Gate1输出/exit与currentSHA/29未改/完整prefix、Required内容自证落`work/wezterm-focus-lw-r8-gate1*.json`；fresh ReviewLW主检＋root独立Gate2复核Required/G-N/关键私有签名/时间位置/形态/片段闭环/事实映射/三层证据/作者体验/当前基线与P1–P9，全部满足才另明确实施放行。本章不自授impl；allow_enter_impl:false，Gate2待root。失败回LWPlan→ReviewLW最小修订，语义不唯一先回上游，不设数量质量门或删已实施支撑。R7成本red/next超龄，root r8-1/r8-2无动作诊断红与新启动marker过早匹配红、先前shortest成本否决、旧R5/R6/Gate1红/长读截断补读、当前只读manifest字典误读KeyError及修正全保留；均不可被Gate1绿覆盖。只正式追加本章与work证据，产品/其它权威不改。无新增跨功能事实。英文建议：`fix(terminal): reuse fresh pane evidence and focus the unique upper target`。

## 12. R9 同请求独立采样重叠

#### 本轮修订说明

[修订: PLAN_DEFECT-R9.1] 消费完整§16/README/R9 source与R8 ReviewImpl(REVISE/PLAN_DEFECT)。T3等待成本修订，只覆盖§11 private force和final两处串行采样；§1–11原123002字节完整保留，产品仍R8。准确before/29产品/current输入见`work/wezterm-focus-lw-r9-input-manifest.json`。

[修订: PLAN_DEFECT-R9.1] G3精确目标、G1诚实unknown、G2连接规则与N1–N3不变。仅`session_panel/service.py`、`session_panel/terminal.py`、`tests/test_observation.py`、`tests/test_focus.py`。两源码≤100新增行优先；其它25产品/public接口不改，不延预算/移起点、省样本/字段/final、常驻pool/SSH、跨请求缓存、清latch、键盘或新路线。

### 12.1 主链与事实映射

#### 本轮修订说明

[修订: PLAN_DEFECT-R9.2] 核心链路：initial/requested→force〔remote与version/fullpanes重叠/join〕→原merge/pair→binding/age/deadline/pins/pre→原动作及每步rawclient/version/fullpanes→〔完整final observe与freshpanes重叠/join〕→原完整判定。Workbench内部两次census夹clients原样，不用perstep代final。

| research事实 | 实现/测试锚点 | 验证口径 |
| --- | --- | --- |
| R8实际15为12确认/3unknown，final age5328/5844/5187，实际client3、action窗口均<5秒 | 两采样锚点；S2原时钟late拒绝；root重新五起点各3轮 | 移动不替确认；原红/全量首Win10053保留 |
| Python3.12官方ThreadPoolExecutor可重叠I/O，context等待运行任务；取消不能停止运行线程 | 两处`max_workers=1`局部with、全部取回再判定；Event overlap/join正负例 | 子调用原timeout/同deadline，锁释放前退出；无取消后遗留任务 |
| `_classify`已允许精确version/list-panes/list-clients，仍拒未知argv/多客户端/身份变更 | Workbench原字节；完整final关联/geometry/client变化拒绝 | 并发不是原子快照，所有旧守卫仍执行 |
| 最慢样本理想减等待后仅31ms余量 | root原始事件与两个时钟；不承诺模型收益 | 本地Event只证重叠/回收，不证真实性能；真实失败回方案 |

### S1-R9：两处局部worker与原判定

#### 本轮修订说明

[修订: PLAN_DEFECT-R9.3] 消费全部G/N。首落点`service.py:SessionService.refresh_observation` started后/merge前，`terminal.py:Terminal._focus_session`最后动作后两采样赋值。形态/作者体验为各一个局部只读worker，原调用方取齐/join后继续；两片段组成主链闭环，无新抽象。依赖fresh双Gate/root放行；先before/输入和S2 red，再实现/回归。

```python
# service.py: exact private signature remains unchanged.
def refresh_observation(self, force=False, *, _include_inventory=False):
    # Original private-force guard, observation_lock and cache branch.
    started, observed_at = self.clock(), self.utc_now()  # original position
    if _include_inventory:
        with ThreadPoolExecutor(max_workers=1) as executor:
            remote_future = executor.submit(self.remote.observe_source)
            try:
                inventory = self.terminal.list_panes()  # original timeout
            except Exception:
                inventory = {'ok': False, 'reason': 'terminal_unavailable'}
            try:
                remote = remote_future.result()
            except Exception:
                remote = {'ok': False, 'reason': 'source_unavailable'}
    else:
        # Original public remote/inventory try/except sequence, unchanged.
        ...
    # Original merge/revision/snapshot/_started/view and optional pair return.
# Terminal caller and refresh_finished remain exactly after forced pair return.
```

```python
# terminal.py: replace ONLY post/after assignments, inside existing try.
# Both samples start after the last action, or the original zero-action check.
with ThreadPoolExecutor(max_workers=1) as executor:
    after_future = executor.submit(self.list_panes, deadline)
    post = self.workbench.observe(deadline)
    after = after_future.result()
# Original strict nonzero/exit preservation and all final predicates follow.
# Existing outer exception handler and action_lock finally remain unchanged.
```

[修订: PLAN_DEFECT-R9.3] 私有接口仍`refresh_observation(self, force=False, *, _include_inventory=False)`及`(view,inventory)`；public dict/cache/force串行不变，非force私有仍ValueError。remote/inventory异常仍各原失败字典，不用旧成功；started早于submit，age含等待，snapshot仅main merge/store。池创建/submit异常经原外层边界传播、不续发动作；已启动worker必须在原锁释放前退出。无迁移/开关；回滚仅R9四路径增量至R8 before，保留其它工作。

[修订: PLAN_DEFECT-R9.3] 只新增标准库import/局部调度。refresh_finished仍force全完成后；deadline仍库存/age验证后、pins前。initial/pre/pins、same_association、实例/slot、全部helper/每步client-ID/version/topology/geometry/预算保持字节。final两读在最后动作后、同一原deadline；join后strict非0/exit、完整final全部谓词及原except保持字节。原捕获异常仍未确认，其它异常传播前join；不能取消后放锁，子调用原timeout不变。非原子/迟到继续拒绝。

[修订: PLAN_DEFECT-R9.3] 验收为齐全/join后才merge/final，原时钟/拒绝不改。三层三元组：impl作者仅local Mock/AST红绿→`work/wezterm-focus-impl-r9-*`/`impl_report_r9.md`，缺则局部未证；root当前全量/scope/实际预算/HTTP/IAB→`work/live-session-*-r9*.json/png`，缺则实机未证；fresh reviewer独立diff/全红绿/失败→ReviewImpl，缺则不交付。作者禁实际CLI/helper/Win32/HTTP/SSH/GUI/服务/D/Git/递归。

### S2-R9：Event症状、回收与旧守卫回归

#### 本轮修订说明

[修订: PLAN_DEFECT-R9.4] 消费全部G/N；首落点`test_observation.py`真实Service/Mock采集器与`test_focus.py`真实Terminal/Mock Workbench/runner。依赖双Gate；先两个Event症状对R8 red：一个读等待另一个started，断言overlap，旧串行失败；bounded wait/finally回收测试线程。再S1实现，同方法green及完整回归；记录red源/完整输出/exit/SHA，禁止改症状绕绿。两阶段均验worker结束/join早于merge或结果发布/原锁释放。

[修订: PLAN_DEFECT-R9.4] 正负例：两phase overlap/join；private本次pair/public cache与旧38＋R8新增14方法保留；远端/库存失败撤绑定；final异常、parse/version/非0、关联/实例/client/真实pane/geometry改变不确认。受控clock完成点推进至原age>5000或deadline外，即使target/exit0也拒绝；共享fake clock加和不证明并发收益。重复请求无worker/库存残留；少量Event/Mock沿用fakes，旧顺序模型只保行为/原预算，不删方法。回滚S1增量及R9新增测试、保留red。

[修订: PLAN_DEFECT-R9.4] impl命令`.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_focus tests.test_observation tests.test_workbench tests.test_native_processes tests.test_gateway.GatewayDispatchTests -v`；完整流/exit/testedSHA、manifest/patch归作者。root独立全回归/29 scope，新UUID0990a0a5/PID3886044/ticks1341437828五起点错2/4/5、cross保存错5、已target各3轮，raw事件/fullfinal/独立singleton exacttarget/原关联指纹/两5秒全成立才确认；随后自有gateway加载、HTTP3cycle/IAB实际focus与两UUID隔离。三元组同S1，缺真实层不称稳定。

### 12.2 Required、风险与双Gate

#### 本轮修订说明

[修订: PLAN_DEFECT-R9.5] unsafe-stop继承§11.2：busy/latch/未知initial无动作；binding/pins/pre原reason；strict非0focus_failed保留exit；parse/关联/geometry/noop/late原未确认；nonstrict原语义。future完成/exit0不是确认，持续实机超龄回正式方案。HTTP拒绝体竞态、owned/Q6/Codex活动/48角色/合作独立缺证。

[修订: PLAN_DEFECT-R9.5] Required T1.1–13：12开头G/N/范围；S1/S2首落点/步骤/依赖/验收/回滚/每包G-N/三层证据/作者体验；12.1主链/research表/闭环；本节风险/双Gate/批量模板。T2输入输出/边界/回归、T3接口兼容/无迁移/unsafe-stop已明确。Gate1自证目标锁/反目标映射完成、验证责任分层已落盘、证据产物/责任归属/证据不足约束已落盘、作者体验门证据已提供及主链闭环。

[修订: PLAN_DEFECT-R9.5] Gate1作者实际命令/完整流/exit/currentSHA/29未改/prefix/Required落`work/wezterm-focus-lw-r9-gate1*.json`。fresh ReviewLW主检/root Gate2独核10字段：Required、G/N、签名锚点、形态/闭环、作者体验、声明可读性/人工review、P1–P9、基线澄清一致性、设计味道、Gate2放行，并核原时钟/final/分层。另明确实施放行前`allow_enter_impl:false`；失败LWPlan→ReviewLW最小修订，语义不唯先上游，不设数量门、不删支撑。

[修订: PLAN_DEFECT-R9.5] 无未回答问题；新假设/风险/阶段切换即时回root留本节/source。批量P0安全/P1预算/P2展示模板：`【DELEGATE_QUESTION】事实＋问题；优先级/阶段；A(推荐＋理由)/B(代价)；请Q1=A…`；补证`【DELEGATE_ACTION】supplemental-research；主题/输出/期望回传`。不重复用户授权。R8 red/15三unknown/161首Win10053与warnings/首audit及Gate2红、前轮红均保全。本轮聚合截断已补读；旧checker路径与PowerShell解析exit1均保留并更正。无跨功能事实。建议：`perf(terminal): overlap fresh sampling within the original focus budget`。


## 13. R10 集成验证收敛

#### 本轮修订说明
[修订: PLAN_DEFECT-R10.1] 消费root正式§17/当前README/H1 final复合manifest（已冻结）、R9 ReviewImpl；保留§1–12原132628字节，不改R9四产品。只覆盖§12未闭合的root整批/HTTP/IAB责任与执行阶段，不改任何原守卫、API、动作路线或成功定义。若需新代码，停止验收回对应范围/Gates，不能暗扩四路径。
[修订: PLAN_DEFECT-R10.1] R9四SHA必须仍为service E88EF72326168DA4B05C041119FB69B3CCD185DFB4369E566DBE9180956A2C36、terminal CFE36D7B4EAC8A04ED4A17C46A538EAF2158AB097A96AFE786F96B36F682A27F、test_observation 2816EEBBD0160F82622243ADA61EE1A71FAF89DA1E5C4E47D6C2DF7FB00E7490、test_focus 46F74EF89C8C0FACBFF51A7AD7476F5E3A4A84D4079BAC2E67A59DDB65077BBC；H1两个最终SHA/准确diff必须另绑定，禁止拿原R9 all29不变冒充复合基线。
### S1-R10：复合基线与整套回归
[修订: PLAN_DEFECT-R10.2] 消费全部G/N。首落点R9 manifest/四final、H1独立before/final/diff/report与root最终29manifest；先核仅六文件合法增量/R9四exact，再当前全回归、69同发送方式after、H1 fresh ReviewImpl与精确自有gateway加载。验收为当前testedSHA=final29、完整stdout/stderr/exit0及独立H1审查满足；warnings/首红均保存。形态只是复合证据表，无新框架，作者体验保原六文件各自归属与差异；依赖H1冻结、root正式§17与fresh LW双Gate。
[修订: PLAN_DEFECT-R10.2] 三元组：作者仅本地文件/AST自证prefix/Required/29manifest绑定，证据work/r10-*，缺则方案未证；root独立当前全回归/69after/归属加载，证据work/*r10*.json，缺则整批未证；H1 fresh reviewer独立审H1两文件/全部红绿，R10 fresh reviewer另审最终整体验收，缺则不交付。作者禁真实CLI/helper/Win32/HTTP/SSH/GUI/服务/D/Git/递归。R10无产品回滚；失败停交付回计划，H1若需撤回按其独立准确before由root核归属处理，不动R9/latch/用户工作。
### S2-R10：正常轮询下有限动作与可见闭环
[修订: PLAN_DEFECT-R10.3] 消费全部G/N，依赖S1当前基线/加载。首落点root `work/live-session-capabilities-r10.py:ready_workbench`（当前SHA53E4C8052C9D9957B73C3DFE56005FF0A9B77EBF91D078A0D122F9D6021E0E4A）、三轮及IAB/native验证；相对保留R9 trace仅新增ready helper/两调用与同实例/两消息断言，不改旧输出/产品。主链为精确owned前检→非目标起点→API身份/ready→connect一次→ready→focus一次→独立client/full证据→消息/native/IAB。UI正常可见轮询/3Dplaying持续，不暂停轮询制造绿；root记录请求/时点/每个样本与最终exit。
```text
每动作：最多3次GET workbench；仅terminal_action_busy时等250ms再GET（记录原busy）；其它unknown/非observed/非unique/不能focus立即停止无POST；ready成立才一次POST，不retry。
POST即使ready后仍busy/unknown/传输失败，也作为该轮失败保留；本次3轮不是无限候选池，不选绿覆盖失败。
```
[修订: PLAN_DEFECT-R10.3] busy只是负状态：前置GET busy可以被后续当前有效ready样本接替，原busy仍记录，不能计为positive；动作/终验任何未知仍failclosed。ready与POST非原子，有限3次也不保证可用；三轮未全部有效则明确未验证/回计划。235ms unknown仅后续独立有效样本，原因未证；不改按钮guard（现有workbenchFresh已含!refreshingWorkbench）或backend锁。
[修订: PLAN_DEFECT-R10.3] 每轮独立real singleton client1→terminal_3/原关联与两预算；已连接connect必须connected/unique_observed且launched=false/cleanup=not_needed。0990 UUID/PID3886044/ticks1341437828/原boot/slotdev同实例；当前harness已补total_visible=items_count=2、user＋assistant顺序、assistant marker精确，记录role/消息UUID，不凭user prompt字符串命中代“两消息”；旧marker不混另由root当前独核。新Codex01a10809…一次metadata、activity/task仍unknown；实际输出仍待root运行，不把新增断言当已验。
[修订: PLAN_DEFECT-R10.3] root当前native WebGL资源与final磁盘一致、两UUID各一次mesh、刷新home/身份持久、3Dplaying；IAB真实可点击路径与实际focus/client、消息切换隔离。仅存测试字段/角色/marker布尔，不落CSRF或其它正文。root证据work/live-session-*-r10*.json/png、fresh ReviewImpl独核；缺则运行未证，作者本地check不得替此层。步骤/回滚/三层owner同S1，作者体验为沿现有harness/断言，只有限ready调度不造测试框架。
### 13.1 Required、风险与放行
[修订: PLAN_DEFECT-R10.4] T1.1–13/T2/T3沿用§12，当前G/N/六文件复合范围、S1/S2首落点/依赖/步骤/验收/回退/三元组/作者体验、主链/研究事实（R9 Review三类失败→S1整套/H1、S2unknown/busy分层）及控制骨架闭环如上；public契约无迁移/新字段。10 Gate字段齐核：Required、G/N、锚点、片段闭环、作者体验、人工review、P1–P9、当前基线、设计味道、Gate2；前缀与当前manifest实际命令/完整输出/exit后才能交fresh ReviewLW，root独立Gate2后才执行本批整体验收，不自授放行。
[修订: PLAN_DEFECT-R10.4] 无新增用户问题；新假设/风险/阶段切换即时回root留本节/source，口径不唯一按继承P0安全/P1能力/P2展示DELEGATE_QUESTION模板批量回上游，补证DELEGATE_ACTION不递归。产品新路线/新锁或未知原因修复必须另正式范围；不延预算/清latch/跳字段/拿busy绿化。R9/R8所有红、有限正例范围及48robot/合作/Codex正文等未证保全，不能宣布无限压力下稳定。

当前复合产品冻结见 `work/wezterm-integration-r10-manifest.json`；H1 manifest SHA `8EB84B5F5797C2D41029786E5B3041EAB764ED34306A7681C1614841BD0D3A3C`。gateway=`9CA5C27ECBABC378E7CA6B2F9B70769C94483C1B1C4A81D2CB53C8C0DDDA1498`，test_gateway=`979A76E3BB43289991990F56EE9D6A191DD4B17693A4CD2A8AFCBB5EF0AB740D`；root当前175项、原3症状和69after均exit0且tested=current，不代独立H1审查或本批运行。


## 14. R11 场景性能与选中来源映射

#### 本轮修订说明

[修订: R11.1] 2026-10-05，消费完整 clarifications §18、R11 交接、§13 的有限 R10 结论与 `work/r11-scene-research.md`、`work/r11-mapping-research.md`。这是旧 feature 的新授权展示增量，非撤销或重判 R10；原 §1–13 字节前缀完整保留，准确 before/输入 SHA 在 `work/r11-plan-input-manifest.json`。本章是唯一落地方案，不另建平行计划。用户已明确自动实施，本开发 root 唯一改产品且承接浏览器/实机；fresh ReviewLW 和 root Gate2 仍先于产品代码，作者本章 Gate1 不自授实施。

### 14.1 范围、目标锁与核心链路总览

[修订: R11.2] 任务分型 T3：同一显示层跨 3D 与选中来源 DOM，并保留已有交互/动作接口；不引入新数据协议。目标与反目标完整下沉如下：

| 基线 | 本轮落实 | 不影响项 |
| --- | --- | --- |
| G11.1 | S1 将相同 geometry/material 的机器人部件与静态工位分别批量绘制；S3 同条件 48 角色 60 秒连续样本和 draw calls | 现有模型、材质、灯光、抗锯齿、DPR 上限 1.5、192 粒子、独立区域、步态/子步/归位、选择、环绕/缩放、像素/文字回退 |
| G11.2 | S2 让现有五节点跟随当前选中来源，公开完整原样角色键、采样/年龄、历史能力、绑定证据及不可用原因；下一步为既有入口锚点和复制键 | 原 current/eligible/terminalReady/canConnect、消息 epoch/分页/时机、轮询、来源与后台验证 |
| G11.3 | S3 以 `codex:01a109a3-2890-7531-805b-6ed67edb5d5d` 逐层对照真实 API/DOM/WebGL/工位，正常播放下三次刷新并截图 | 不按标题、目录、短 UUID 或位置匹配；API 索引成功不等于场景已验证 |
| N11.1 | S1/S3 不暂停、减人口/模型/画质/粒子或隐藏负样本；功能与连续性能各自判定 | 旧 35.11 FPS / p95 60.9 ms 与所有本轮失败原记录 |
| N11.2 | S2 明确颜色仅位置证据、Codex 仅身份、正文/终端未接入、活动/完成未知；不从 updated_at/动画/同目录推断 | 不造协作事件、忙闲、完成或终端关联，不引入关系图 |
| N11.3 | 四 web 文件和 fixture 内完成；无新后台、API、采集、身份、锁、年龄、预算、CSP/CSRF 或 POST 路线 | 不重试 POST、操作用户进程、读未授权正文、创建聊天/引擎/物理/shader/配置系统、初始化 Git |

核心链路总览（先主链，后工作包）：

```text
现状：既有 /api/sessions + /api/codex/threads → 原校验/年龄/recordView
      → renderCockpit({完整原样key,category,selected}) → cockpit → robot Group/limb/Mesh
      → 每帧 moveRobot/真实 transform → Mesh 单独 render；raycast robot roots → selectRobot
      → 原来源选择/epoch → 远端按需历史或 Codex 元数据；原资格门控制显式终端动作。
R11：仅 render 前把重复 Mesh 变换上传到同材质 InstancedMesh；保留原树供运动/拾取。
     仅 renderEvidenceFlow/邻近摘要按既有来源状态解释映射 → 锚点/复制；无新请求。
闭环：实例矩阵等于同帧代理matrixWorld + 真实点选完整key；DOM理由与原button.disabled一致；
     正常播放/轮询60秒原始帧数组与draw calls；真实新UUID三刷新/API/mesh/工位一致。
```

明确不改层：`session_panel/*`、所有 Python tests、`web/cockpit.js`、本地 Three r186、工作台/reader/身份/动作流程及其失败口径保持。分层原因：渲染提交可在 robot3d 内替换；映射说明只消费已有状态，不需改变采集或授予动作资格。

### 14.2 research 事实映射与接口矩阵

[修订: R11.3] 研究消费和验收落点如下；本文不把研究者或旧 harness 的 exit0 当性能达标。

| 已读事实/依据 | 实现锚点 | 验证锚点与口径 |
| --- | --- | --- |
| 48 角色 15部件＋5工位Mesh＋1边框/角色，基础17：17+21N=1025 calls/frame；旧35.1098FPS/p9560.9/slow19.6581% | S1 `makeRobot/part`、station blocks、draw | root S3 WebGL调用与相同人口/画质；draw≤128 为本轮降提交预算，不称其为GPU时间或全部卡顿因果 |
| 本轮10秒112.2967FPS/p9515.6；60秒4309帧/71.8050FPS/p9530.2/slow3.8069%/1025，典型参考线未达 | S3 `gamePerformance`/`--perf48` | 保留两原报告/原间隔；`work/r11-baseline-target.json` exit1的p95/slow/drawbudget三项失败不能被采样命令0覆盖 |
| [Three官方InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)、[r186动态示例](https://github.com/mrdoob/three.js/blob/r186/examples/webgl_instancing_dynamic.html) 要相同几何/材质、setMatrixAt后needsUpdate；[r186源码](https://github.com/mrdoob/three.js/blob/r186/src/objects/InstancedMesh.js) 有实例dispose/边界和raycast行为 | S1 动态/静态各一组批次，不变材料 | 动态同帧矩阵逐元素对照/类别切换/删除重建/资源回收；动态包围球当前，不靠旧边界 |
| [Object3D layers](https://threejs.org/docs/pages/Object3D.html) 影响相机和raycast；Raycaster不是按visible过滤 | S1 Mesh layer1，camera0；raycaster enable1且保留0，只候选robot roots | 实际点选眼/臂/腿/脚和选中圈；不候选工位/实例批次/粒子；保留原不可见选择盘拾取语义 |
| 原makeRobot重设limb父子；更新不重置已有slot/home/travel；步态每帧1–6子步 | S1 部件建完父子后保留动态Group，原moveRobot不改 | 空间完整包围盒/原始yaw/15-30-60Hz、归位再巡游/选中收腿/按住与释放；这些功能时钟不当FPS依据 |
| Codex只六列/完整codex:key，当前页12、30秒过期清空，activity/task unknown；category unknown表示位置未提供 | S2 `renderEvidenceFlow`、`renderCodexThreads`与新增摘要 | Codex选中来源/完整key/采样年龄，历史和终端未接入明确，0 Codex消息/定位请求；分页/异常仍清空 |
| 远端source.id+session_id、current≤30秒；eligible≤5秒且verified+confirmed；工作台年龄另算 | S2 record原因与workbench原因分行，复用`currentReasons/reasonText/eligible/terminalReady` | ≤5、5–30、>30、断连、保留/冲突/绑定未知；摘要不得扩大实际disabled资格 |
| 历史独立reader/按需，state.pageOld/read_at不等于当前活动；原flow固定远端导致Codex选择后仍等待UUID | S2 来源分支与旧历史状态隔离 | Codex→远端→Codex、旧epoch响应隔离、元数据未知但历史页可独立存在；不同来源同cwd不合并 |
| [GOV.UK summary list](https://design-system.service.gov.uk/components/summary-list/)、[Details](https://design-system.service.gov.uk/components/details/)、[Primer链接与按钮](https://primer.style/accessibility/design-guidance/links-and-buttons/)支持可见事实和邻近禁用解释 | S2 原dl/dt/dd、原生锚点/复制button、wrap | 360/1024px截图/键盘/focus可见/长键不溢出；不引入其框架或变更native disabled |

接口/兼容矩阵：

| 跨模块接口/状态 | 现有输入与输出 | R11变化与兼容边界 |
| --- | --- | --- |
| app→cockpit→createRobotScene.update | `{records:[{sessionId,label,category}],selected}` | 不改签名/枚举/key；category实际材料引用变化才触发batch重建，单纯选择或顺序刷新不重建 |
| robot内部树→批次 | 15个原部件的geometry/material/matrixWorld；5个station块 | 树保留，分别收集动态与静态Mesh；批次根在scene且单位变换，实例矩阵直接为世界矩阵，不乘两遍parent |
| raycast→app.selectRobot | robot根追溯`userData.sessionId`，完整key | Mesh代理1/选择盘0；raycaster0+1，仍仅robots集合递归；onSelect原样，不用instanceId造新身份模型 |
| 来源选择→DOM/原动作 | `codexState.selected`或`state.selected`，原fresh/age/record门/工作台门 | 只增加展示；Codex与远端互斥由既有select函数维持，复制读取当前key而非闭包旧key |
| 下一步→既有入口 | Codex panel、远端详情/历史/工作台当前控件 | 纯`href=#id`跳转；最多新增HTML id，无新fetch、自动click、connect/focus/history按钮或权限 |

片段闭环充分性：S1骨架覆盖建代理→拓扑/材料dirty→重建释放→每帧真实变换上传→原拾取；S2骨架覆盖来源选择→同key与年龄→历史/终端能力说明→原入口动作。S3检查这两条从输入到可见行为的闭环，reviewer无需从局部片段猜新的后台规则。已有逻辑分支与draw顺序会变化，必须附下列控制骨架；它们不是最终实现全文。没有整条函数链删除，`moveRobot`、`makeRobot`、`update`、`draw`、pointer与fail/dispose都保留；只转换Mesh绘制职责，资源由共享geometry/material原所有者继续释放。

### S1-R11：批量绘制且保留真实动作/拾取代理

[修订: R11.4] 目标/输入/输出：消费G11.1/G11.3、N11.1–3；接收原view，在同一camera与同帧transform下以批次画出原15部件和5工位块。选中盘/各工位LineLoop仍各自原Mesh/LineLoop；每个完整key仍有自己的原Group、limb、home、slot和ownerKey。关键文件仅`web/robot3d.js`；首落点`makeRobot:part`、`update`的新/删角色与材质更新、`draw`中render前、`dispose`、pointerup raycaster。改动理解锚点：原身份树是动画/拾取事实，改变提交单位即可少draw。目标形态：文件内小数组描述batch `{mesh,parts}`，动态机器人与静态station分开，无管理器/通用pool/容量配置或新引擎。

控制骨架（来源robot3d.js，展示插入位置、顺序与保留部分）：

```js
const proxyLayer = 1;                 // Camera remains on default layer 0.
raycaster.layers.enable(proxyLayer);  // Keep layer 0 for the original selection disk.
// part() records 15 rendered parts in robot.userData.parts and puts them on layer 1.
// selection pad is excluded; station blocks use a separate list on layer 1.
// Groups/pivots are never hidden or moved to an exclusive proxy layer.

function rebuildBatches(parts, dynamic) {
  // Remove old batches from scene; old InstancedMesh.dispose() only.
  // Group by actual geometry AND actual material object; exact current count.
  // New roots on scene, identity transform, layer 0; no shared asset dispose here.
  // Dynamic instanceMatrix.setUsage(THREE.DynamicDrawUsage).
  // Static stations: updateMatrixWorld once, setMatrixAt from each part.matrixWorld,
  // needsUpdate once per batch and current computeBoundingSphere().
}
function update(nextView) {
  // Original removal/new allocation/home/slot/material/selection/floor logic.
  // Mark dirty only for actual add/remove or material category change.
  // After all assignments: rebuild dynamic/static batches if dirty.
  // Same keys/order-only update or selected change does NOT rebuild batches.
  // Original particles and schedule remain.
}
function draw() {
  // Original resize/camera fit/lookAt.
  world.updateMatrixWorld(true);  // Real robot and limb transforms for this draw.
  // For each dynamic batch: setMatrixAt(i, parts[i].matrixWorld),
  // one instanceMatrix.needsUpdate=true and current computeBoundingSphere().
  renderer.render(scene, camera); // Keep normal scene matrixWorld update enabled.
  // Original context-lost guard.
}
// pointerup retains intersectObjects(Array.from(robots.values()), true),
// ancestor sessionId and latestView.records membership guard.
// dispose(): release both batch lists first; original shared assets dispose once.
```

步骤/依赖：fresh双Gate/root放行→冻结准确before→先采S3基线/症状→收集part与station块→加batch重建/释放→draw前上传→fixture对照。不冻结全局矩阵或改matrixAutoUpdate，不为每个part每帧new Matrix4，不改moveRobot/patrol/子步、canvas/WebGL属性、DPR、光照/材料、192粒子和相机。静态工位只在增删/分类导致重建时上传；普通刷新不重建。批次容量等于当前组数，删除中间或末尾不存在幽灵矩阵。理论约83draw（48边框+17基础+18实际非空batch），混合类别和选择会略变；实测≤128预算及真实矩阵正确才算本包降提交验收。

验收：各batch材料/geometry原对象引用不变，所有动态与静态实例逐元素对应真实代理；类别变更正确换组；刷新保留home/slot/travel；选择盘/边框唯一；删除/再增和切模式资源不增长、实例dispose确实调用；场景同几何三角形/粒子点/画质/灯光不变、48角色≤128draw；全量拾取、独立空间、归位/动作/回退回归。降低draw≠达FPS目标，尾延迟S3另判。作者体验/声明可读性：保留part/colored/limbs及完整key，局部dirty与两数组一眼可读，不增加跨文件渲染抽象或复制步态。新增代码用英文注释。

验证三元组与责任分层：impl仅本地语法/静态资源与函数差异/可隔离计算自证→`work/r11-impl-local-*.json`及最终manifest/diff→证据不足判局部未验证。浏览器、临时fixture服务、真实WebGL/HTTP8766/IAB/进程均非impl-safe，由root以coordinator承接身份执行→`work/r11-*-command.json`、fixture完整JSON/原间隔/截图→缺矩阵、资源、功能或连续层分别未验证，不拿静态检查代GPU/拾取。fresh reviewer只读最终diff/全部原失败/输出/截图→`review_notes_impl_r11_1.md`→缺当前字节/证据不PASS。root唯一实现时仍将自证层与承接层输出分开。

失败/回退：材料或矩阵一致性失败停止渲染交付，原fail/onUnavailable转像素/文字仍生效；不得以关动画/减画质恢复合格数字。root核准确before，只撤S1在robot3d的增量，保留S2与所有新旧红；如后续失败需结构改变，回本章/Gates而非热改绕审查。无常驻开关或停机服务，原显式像素/文字入口就是显示降级路径，不停止用户进程。

### S2-R11：选中来源的映射摘要与现有入口

[修订: R11.5] 目标/输入/输出：消费G11.2/G11.3、N11.1–3；读取现有互斥选择与既有fresh/age/records/page/workbench，输出同来源五节点＋可見事实/原因＋纯锚点/复制。无选择时保持等待选中，不能让两份来源数据混成一条链。关键文件`web/app.js`（首落点`renderEvidenceFlow`及其既有render触发、`renderCodexThreads`详情、`renderSelection`、select函数）、`web/index.html`（现evidence-flow、流程标题/摘要与既有面板id）、`web/style.css`（局部facts/键/链接wrap与360px布局）。改动理解锚点：选中Codex会清空远端选中，而旧flow仍只读远端，须按来源解释；目标形态为一处小型来源分支渲染说明，不把DOM描述提升为动作判定器。

控制骨架（app现有选择/门保持，新增展示不改它们）：

```js
function renderEvidenceFlow() {
  const codex = codexFresh() && codexState.items.find(row => row.session_key === codexState.selected);
  const record = state.records.find(row => row.session_id === state.selected);
  if (codex) {
    // Heading: 本机 Codex · 所选身份映射. Original exact session_key visible/copyable.
    // Index/key/robot relation uses codexState sampledAt + elapsed from received.
    // History: 正文未接入; terminal: 未提供绑定证据; activity/completion unknown.
    // Existing anchors #codex-panel / #refresh-codex; no history/focus request.
  } else if (record && state.selected) {
    // Heading: 远端 Claude · 所选会话映射. Key = record.session_id exactly.
    // Source separately shows record.source.id + sourceText, never synthetic matching key.
    // Metadata uses current(record), age(record), currentReasons(record), recordView.
    // History uses reading/page/pageOld/read_at independently of terminal evidence.
    // Terminal record reason and workbench reason displayed separately; original
    // eligible(record), terminalReady(), csrf determine existing action availability.
    // Current <=30s pane evidence may display, but >5s must say refresh before action.
    // Anchors target existing #selected/#messages/#workbench-heading/#refresh-sessions.
  } else {
    // Waiting for a selection; clear key/copy target and selected-only capability text.
    // Existing source coverage can remain, without claiming a selected identity.
  }
}
// Copy handler resolves CURRENT codexState.selected || state.selected at click time,
// only writes that original complete key; on failure shows manually selectable key.
// Keep focusSession/connectWorkbench/readMessages guards and calls unchanged.
```

具体文案/显示边界：Codex已索引身份应有文字“本机身份已索引，位置证据未提供”，不能把unknown颜色说成身份失败。复制为API原`session_key`，UUID/cwd/created/updated保留，采样时间与年龄用原received起点；updated不叫活动时间。远端原key是裸完整UUID，source.id单独可见；当前pane须current且绑定confirmed，slot→pane仅引用原字段，旧/retained位置明确“上次证据”；未知binding列currentReasons，客户端/过龄/忙/blocked列原workbench字段与原因，不因其中一条可用就把两者合格。历史是独立能力：已读页、上次页、正在读取或尚未读取分别表达；元数据未知不删除已有reader结果或宣称其新鲜身份。保留所有原始证据JSON/details，关键理由直接显示，不新增能力按钮。

步骤/依赖：S1可独立验证，S2依赖fresh双Gate而不依赖性能达标→追加摘要DOM及现有入口id→来源分支/现有渲染路径更新→完整key复制→局部CSS→S3合成案例。现有`renderSelection`每秒触发flow，Codex index更新也必须通过既有`renderCodexThreads`路径触发摘要，避免初选/清空/分页/异常卡住；不增加定时器或fetch。锚点可聚焦/滚到原控件，但不程序点击原动作。长键使用`textContent`/原element及wrap；原disabled保持、键盘原生行为不改。

验收：五节点标题/正文/原样key随Codex→远端→Codex切换；完整key与3D/列表一致；fresh、5–30、>30、missing/unknown/conflict和workbench不可用理由明确；可用/不可用描述与当前原button.disabled相符；历史独立reader与旧页标识正确；0新请求/0自动动作/0Codex消息或focus请求；分页/异常清空、晚到epoch隔离、两个同cwd不同key继续独立。360与1024px无溢出、锚点/复制键盘可用。作者体验：沿原element/facts/reasonText/currentReasons及现有控制门，不造泛化状态机/重复资格算法，读者一眼分辨元数据、历史与动作条件。

三层三元组：impl语法、静态guard/网络入口不变和HTML id/局部CSS自证→`work/r11-impl-local-*.json`/差异manifest→缺则本地未验证；root承接合成浏览器案例、剪贴板/锚点、实际IAB来源切换与授权自有远端历史→fixture完整JSON/`work/r11-mapping-*.json`/实际截图→缺则相应功能未验证；fresh reviewer最终四web/fixture diff、负例/旧epoch/全部失败→独立ReviewImpl→不凭截图或作者摘要PASS。无真实connect/focus新增验收要求，本轮不新增POST；原终端能力守卫由本地回归确认，运行存在的unknown诚实显示。

失败/回退：说明错误、key串源、过龄仍可定位文案或新网络触发均阻断S2交付；root只撤本包app/index/style增量至准确before（不整文件覆盖S1/其它工作），保留截图/红。无数据迁移/新配置/后台，原列表及详情仍可用；若需新增证据来源才能满足说明，停在DELEGATE_ACTION/上游范围，不猜绑定。

### S3-R11：功能、连续性能与新 UUID 分层证据

[修订: R11.6] 目标/范围：消费G11.1–3/N11.1–3；关键文件`tests/verify_robot_cockpit.cjs`，首落点`installObservation`、`gamePerformance`/`--perf48`、`gameSpace/personalSpaceMotion`、`graphicsNormal/pickEveryRobot`、`codexIdentity/codexFailures/codexLateResponses`与fixture控制状态。形态是原harness局部追加实例对照与映射案例/明确性能limitation，无测试框架、常驻产品诊断、真实8766入口或外部数据源。作者体验：沿check/scenario/原requests、原完整报告；保留既有方法与故障注入，原失败文字不删除，数量门只用于本批指定样本而非Required质量门。

步骤/依赖：先保全`work/r11-before`和全部本轮before（--perf48新增为root自有harness增量，在输入manifest单独记载，不冒充baseline fixture未变）→S1/S2最小代码和对应meaningful症状→root本地语法/scope→完整fixture→同条件after60秒→真实API/WebGL三刷新与可见IAB→最终fresh ReviewImpl。原功能harness每帧traverse等重观察保持以便历史比较；continuous记录同方法before/after的每帧间隔，不把不同观察开销样本相混。若加轻量rAF，单独命名双份报告，原样本仍是对照，不用轻量绿覆盖原红；无需为此增加产品常驻指标。

控制/验收骨架（fixture，测试数据与真实数据严格分开）：

```text
S1功能：各动态batch.getMatrixAt(i) == 对应part.matrixWorld（同帧，逐元素容差）;
station静态实例 == 原块world矩阵；原geometry/material对象与三角形/point数量匹配。
选中/排序刷新→batch身份不变；类别/增删→旧batch dispose且当前count精确无幽灵。
所有功能负例和实际pointer路径继续；每个来源完整key，按键/环绕/缩放/巡游/归位/刷新后拾取。
S2功能：Codex→remote→Codex、fresh/5-30/>30、缺注册/冲突/绑定未知、工作台unknown/忙/blocked；
消息页独立、旧epoch隔离、key复制/锚点不触发HTTP；实际资格门/请求日志不变。
性能：48角色，1024x900/DPR1、AA原值、同材料/灯光/几何/192粒子、动画播放且pointer不held;
       可见页面、原正常轮询连续60秒，保存完整raw_intervals与首尾movement/人口/请求证据。
       报FPS、p95、>33.3ms比例、calls/frame、画质/可见/动画/负载条件及typical_target_met。
       calls<=128单判；FPS>=60 && p95<=20 && slow<1%另判，不以harness exit0遮蔽未达。
真实：API codex:key → 当前DOM → 3D robot.userData.sessionId/station.ownerKey各一次 → 实际point选中;
       连续三次正常刷新，same key/home/slot，不合并同cwd，播放/轮询保持；存实际格式截图。
```

本批参考线来自§18：FPS≥60、p95≤20ms、慢帧<1%，draw≤128；预算128容纳非空分类/选择差异但显著低于1025，不追约83→78节省。before60秒p95/slow/draw已失败，后续每个窗口完整报告；画质/人口等条件不等即不可比较。after若尾延迟仍未达，结论“已降低绘制提交，60秒性能参考线未达”，不可“48稳定”。一次本机窗口即便全达也只说明本机时段，不保证其它硬件/任意时间；旧35.11红永久保留。正常轮询网络请求数至少首尾增长；不暂停/延长cache/偷偷换渲染或降低CPU观察负载制造对比。

责任/证据/不足约束：impl-safe仅本地Node syntax、静态guard/scope、manifest，root另以coordinator身份运行隔离Edge全部fixture与--game/--space/--perf48和175 Python回归（完整stdout/stderr/exit、warnings原样）、真正8766只读API/WebGL/IAB及截图。主执行root应记录调用角色层，作者不自行跑GUI/helper/SSH/真实focus/connect、启动/停止gateway或用户进程。证据落`work/r11-*-command.json`、原fixtureJSON、`work/r11-final-manifest.json`/准确patch、`docs/current/wezterm-session-link/impl_report_r11.md`和本轮交付；仅授权自有远端两marker必要观察，不保存其它正文或CSRF。真实UUID/API成功但无mesh/实际point/三刷新证据时G11.3未验证；无60秒/原间隔或画质条件时性能未验证；未达如实未达。fresh reviewer只读实际最终bytes与全部功能/性能/真实层证据和失败，不能采信作者自称。此范围不承诺旧owned回收/Q6/235ms原因/实时活动/合作已解决。

回退/降级：新fixture缺陷保存原输出后窄修fixture并重跑，不能删产品失败案例。功能代码缺陷回对应S1/S2准确增量，保留其它当前工作与所有证据；性能未达先报告约束/回正式最小方案，不改基线数字/预算或原渲染质量。模式fallback走旧显式pixel/text，所有无证真实动作fail-closed；不需要服务停机/迁移或新开关。

### 14.3 Required Set、作者体验、风险与双 Gate

[修订: R11.7] Required Set存在性自检定位（任一缺项即不放行，不按篇幅或任务条数）：

| 项 | 本章承载 |
| --- | --- |
| T1.1目标锁/反目标/不影响 | 14.1完整G11/N11表与不改层；S1/S2/S3各自消费 |
| T1.2关键受影响文件/首落点 | 三个主要工作包的关键文件/函数/DOM/harness锚点 |
| T1.3步骤/验收/回退/依赖/形态 | S1/S2/S3各自步骤、输入输出、目标形态和回退 |
| T1.4每包G/N | S1/S2/S3开头和对应验收；S2不以身份unknown制造动画 |
| T1.5验证责任/三元组 | 各包impl-safe、root/coordinator非impl-safe、fresh reviewer的产物/owner/缺证约束 |
| T1.6作者体验/声明可读性 | S1原树与局部两batch、S2原facts/门、S3原harness；不造新框架 |
| T1.7核心主链 | 14.1输入→render/拾取→来源→已有动作，明确不改层/分层理由 |
| T1.8研究事实映射 | 14.2逐条事实/锚点/验证口径，原低帧与60秒新未达并列 |
| T1.9片段闭环 | 14.2说明与S1/S2/S3三个骨架涵盖完整主链；原门保留 |
| T1.10Gate1硬项 | 本节+实际work/r11-plan-gate1.json；目标锁/反目标映射完成、验证责任分层已落盘、证据产物/责任归属/证据不足约束已落盘、作者体验门证据已提供 |
| T1.11双Gate/回环 | 下文Gate1作者→fresh ReviewLW/root Gate2→实施；失败回LWPlan→ReviewLW |
| T1.12提问/事件/批量模板 | 下文14.3事件与P5/P6/P8，当前无未回答用户问题 |
| T1.13风险/降级/Gate2复核 | 每包失败回退、下文风险表及10项Gate2入口 |
| T2 | 每包输入/输出/边界、函数、静态/合成/连续/真实测试分层与原回归范围 |
| T3 | 14.2跨模块接口矩阵、同key/签名兼容、无迁移/新后台、旧显示fallback及按包撤回 |

作者体验门证据：实施者看`part`仍可理解原几何/父子/颜色，读`moveRobot`仍是原步态；只在draw前见批量上传。S2一处来源分支解释既有事实，不让文案判断授予动作；safeguards函数继续唯一权威。测试局部扩展原check/requests，数据与真实主链分开。人工review顺读14.1→14.2→三个工作包即可预测“两类批次+原代理树”和“按来源摘要+原控件”；无需阅读最终实现全文或跨文档拼新规则。

| 风险/不确定性 | 处理与关闭证据 |
| --- | --- |
| 动态矩阵不同步、重复父变换、旧包围球 | 世界单位batch根、render前world.updateMatrixWorld、同帧实例/代理矩阵测试与当前boundingSphere；失败不交付 |
| 类别/分页/删除重建泄漏 | 只真实拓扑/材料dirty才重建；旧InstancedMesh.dispose、共享资产只final释放一次；实际重复切换资源/计数证据 |
| 分层使选中盘或limb漏拾取 | proxy Mesh1，raycaster0+1、robot roots候选，Group默认层不变；实际pointer各源/动作回归 |
| 1025减少未必解决60秒尾延迟/观察开销 | 每窗口条件与原间隔保留，draw与典型参考线独判；不称单因果或任意硬件稳定 |
| 30秒展示位置被误读为5秒动作资格 | 原eligible/terminalReady/disabled不改，两类年龄/理由可见；≤5/5–30/>30负例 |
| Codex灰色被误读成身份缺失、旧flow串源 | 原始key+已索引身份/位置未提供说明；完整key与实际来源选择/刷新/异常验证 |
| 原终端忙/unknown与历史限制 | 只解释、无新POST/重试；235ms根因/非原子ready继续开放，旧owned/Q6/活动/合作不关闭 |

P1–P9承载：P1无任务数质量门；P2必备内容存在性；P3任一必备缺失即不放行；P4本轮T3并含T1/T2；P5范围/验收/回退口径不唯一或关键新假设用DELEGATE_QUESTION；P6新假设/新风险/阶段切换即时对齐并落14.3/README事件；P7澄清数量不设上限下限；P8同阶段阻塞按P0安全/权限、P1能力/预算、P2展示批量；P9双阶段强校验。当前无未回答用户问题，已有授权覆盖本轮；“draw预算≤128”与root采样失败及代理层顺序已即时对齐，未引入新用户假设。LWPlan→ReviewLW是本轮阶段事件，提交本章当前SHA及Gate1给root留痕；不递归委派。

批量提问模板：`【DELEGATE_QUESTION】需要确认：事实+范围/验收/回退问题；优先级P0|P1|P2；阶段LWPlan|ReviewLW|Impl；A)推荐选项+理由/B)替代+代价（有真实需要再加C）；请一次回复Q1=A…`。当前未触发，原因是§18和root承接已唯一约束。仅需补充低风险调研时`【DELEGATE_ACTION】操作类型:supplemental-research；主题/输出路径/期望回传3–5行`，由root执行/委派后续传；不将缺真实性能/未知原因脑补为通过。

Gate-1作者实际本地命令读取完整输出/退出码后，证据`work/r11-plan-gate1.json`绑定当前计划SHA/输入SHA、before字节前缀、author期间25产品未改、已存在root fixture增量、T1.1–13/T2/T3/P1–P9及四硬项/主链/事实映射/闭环。纯文档Gate1不证明产品、真实环境或性能；`allow_enter_impl:false`直到fresh ReviewLW和root Gate2独立核验。Gate-2由fresh review_plan主检、root复核，须显式Required Set、目标锁/反目标、关键实现锚点、代码片段充分性、作者体验门、人工review对齐（子项）、P1–P9、当前基线与澄清一致性、设计味道扫描、Gate-2十项，核同材质/矩阵顺序/原动作门/分层证据及全部旧失败；缺项/缺证失败回LWPlan→ReviewLW，仅修本章，不删已实施支撑。人工自动实施授权已在§18，不重复询问；技术审查不可豁免。实施后重新验证并fresh ReviewImpl；任何审后修改使旧审查失效，需要当前字节重新核验。

原失败/警告保全：旧35.11FPS、当前60秒p9530.2/slow3.8069%和baseline目标exit1，采样exit0的范围差异；R10所有历史红/235ms未知、busy与POST竞态、旧owned/Q6/Codex活动正文/合作限制以及两Pydantic warning不因本章静态绿关闭。作者本次聚合读取出现容量截断，已分别全文补读clarifications/app/robot3d/两research/§13；读取截断不作完整阅读凭据。无新增跨功能事实。英文提交建议：`perf(scene): batch robot rendering and explain selected session mappings`。
