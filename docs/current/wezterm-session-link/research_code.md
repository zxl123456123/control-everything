# WezTerm 会话联动：实际代码调研

调研日期：2026-10-04（Asia/Shanghai）。本报告仅记录实际代码、配置与已有材料，供本批 readiness 和规划使用；未启动或连接 WezTerm/Zellij，未执行 HTTP、SSH、focus、发送、安装或 Git。本 agent 唯一写入文件为本报告。

任务入口为 [本批 README](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/README.md)。用户对已呈递的“连接现有工作台、显式 UUID 定位、连接状态显示”答复“继续”，范围已授权；未授权复活 EXITED session、重放命令、补建 tab、创建 SSH/Claude 对话或扩大来源。旧机器人批真实定位缺证与父 Q6 各自保留，不因新批调研关闭。

## A. 系统边界与现有能力

- 本仓库是固定远端 Claude 会话网关与网页，生产地址固定 `127.0.0.1:8766`。服务启动创建一个 `SessionService`；HTTP 与 stdio MCP 查询同一份网关索引。
- `SOURCE` 固定 Ubuntu 用户、服务器、`.claude` 根与 CLI 版本；Zellij 固定工作台 exe、`workbench-v4`、`Work-for-Linux`、`0.45.1`。这是当前实现约束，不是通用主机发现系统。
- 已有元数据观察、真实 UUID 消息 reader、单个显式 UUID focus。没有连接/启动/恢复工作台接口；产品源码没有 WezTerm CLI、CIM、GUI 实例/client 归属采集。
- `terminal_binding=confirmed` 证明当前注册的唯一 slot 与当前 Zellij SSH pane 匹配；它不证明存在 GUI client。顶部 `state.connected` 证明合并观察 `status=observed`，也不证明 WezTerm 可见或连接。
- Focus 只向已存在的 Zellij pane 发送 `focus-pane-id`；没有桌面窗口激活、输入、resume、停止、审批。当前服务端在动作之后才校验 client 唯一性，因此“动作后未确认”与“动作前拒绝”是不同语义。

事实锚点：[source.py](E:/project-funny/mianban-develop/session_panel/source.py:5)、[gateway.serve](E:/project-funny/mianban-develop/session_panel/gateway.py:184)、[merge_observation](E:/project-funny/mianban-develop/session_panel/service.py:96)、[Terminal.focus_session](E:/project-funny/mianban-develop/session_panel/terminal.py:79)、[前端状态](E:/project-funny/mianban-develop/web/app.js:3)。

## B. 入口与主流程

### B1. HTTP 与选择流程

1. `serve → make_server(SessionService())` 创建 loopback HTTP 服务；端口占用直接退出。Windows 使用 `SO_EXCLUSIVEADDRUSE`，不会接管原监听。
2. 页面首次启动只请求 `/api/bootstrap` 与 `/api/sessions`；bootstrap 返回本次 server 的 CSRF token。元数据可见时每 10 秒轮询，隐藏暂停；每秒更新年龄，超过 30 秒撤销当前显示。
3. `refreshSessions → SessionService.list_sessions → refresh_observation`：在 observation lock 内 SSH 观察，再读 Zellij pane 清单，合并并返回深拷贝。非强制请求在 5 秒内复用观察。年龄从采集开始计时，SSH/terminal 耗时不会被归零。
4. DOM、像素 hitbox、3D Raycaster 均传完整 UUID 到 `selectSession`。函数先核对 UUID 属于当前 records，同一 UUID 重选是 no-op；新选择清页、递增 epoch，只读取该 UUID。元数据刷新、模式切换、旋转均不读正文。
5. `readMessages` 把选中 UUID、offset、limit、revision 交给原 reader。迟到响应先检查 epoch；新选择不会被旧正文覆盖。失败保留旧页并撤销翻页。
6. 显式 `focusSession` 读取当前 selected UUID，使用空 JSON `{}`、CSRF 与既有 header POST `/api/sessions/{UUID}/focus`。不会把 pane ID 或命令从浏览器传给服务端；结果只在仍选同 UUID 时显示。

锚点：[GET](E:/project-funny/mianban-develop/session_panel/gateway.py:90)、[POST](E:/project-funny/mianban-develop/session_panel/gateway.py:135)、[观察](E:/project-funny/mianban-develop/session_panel/service.py:182)、[选择](E:/project-funny/mianban-develop/web/app.js:150)、[reader](E:/project-funny/mianban-develop/web/app.js:178)、[focus](E:/project-funny/mianban-develop/web/app.js:193)。

### B2. 当前服务端 focus 的准确顺序

`Terminal.focus_session` 先查询原记录，再强制刷新；要求 requested/fresh 的 `instance_key`、`pane_id`、`slot` 完全一致，fresh 身份已验证、绑定已确认、证据不超过 5 秒。随后重读当前 panes，只接受唯一 slot/pane，并把这一段清单耗时加回 freshness 判定。

通过上述条件后立即执行 `focus-pane-id`。exit 非零返回 `focus_failed`；exit 0 后执行 `list-clients`，要求解析结果恰好一个 client 且焦点是目标，再读一遍 panes 确认唯一目标仍相同，才返回 `focused=true`。缺 client、多 client、错误焦点、清单变化或动作后的异常返回 `focus_sent_unverified`。不存在动作前 GUI/client 归属检查，不采集原焦点，也不恢复焦点。

`parse_clients` 仅保留 `client_id` 和 `pane_id`，忽略第三列 command。空输出、错误表头、任何坏行全部返回 `[]`，当前消费者无法区分“确实零 client”与“清单无法解析”。同一个裸 client ID 不携带 Windows PID、WezTerm window/tab/pane ID 或创建时间。

锚点：[parse_clients](E:/project-funny/mianban-develop/session_panel/terminal.py:35)、[动作与动作后验证](E:/project-funny/mianban-develop/session_panel/terminal.py:100)。

### B3. 本机现有启动入口

- [Start-TerminalWorkbench.ps1](D:/terminal-workbench/Start-TerminalWorkbench.ps1:1) 仅调用 `.cmd`，没有独立连接语义。
- [.cmd](D:/terminal-workbench/Start-TerminalWorkbench.cmd:2) 以 GUI command line 子串 `*terminal-workbench*wezterm.lua*` 与 `*attach workbench-v4*` 选第一个进程；已有进程时通过 `AppActivate` 激活，再调用 EnsureTabs。这段不验证 client 归属、唯一性、进程创建时间或目标 session 当前 RUNNING。
- [.cmd 第 15 行](D:/terminal-workbench/Start-TerminalWorkbench.cmd:15) 启动固定工作台 `wezterm-gui.exe`、固定 lua、`--always-new-process`，子程序是固定 Zellij 的 `attach workbench-v4 --create --force-run-commands`；第 17 行再调用 EnsureTabs。
- [EnsureTabs](D:/terminal-workbench/Ensure-WorkbenchTabs.ps1:40) 反复读取 `list-tabs --state`，等待最多 20 轮；缺预期 tab 就 `new-tab --layout`，之后可能 `move-tab`，最终 `go-to-tab` 恢复原 tab。预期包括 Work-Windows、Work-for-Linux、Monitor、Music、Control。它确实改变工作台布局，不是连接探针。
- [wezterm.lua](D:/terminal-workbench/config/wezterm/wezterm.lua:56) 明确保留 Zellij 为主工作空间，另有原生 Yazi tab 快捷键；默认 shell 是 `cmd.exe`。`format-window-title` 固定返回 `Terminal Workbench`，因此标题不能证明某个 UUID 或内层 pane。
- [Zellij config](D:/terminal-workbench/config/zellij/config.kdl:3) 指定默认 `workbench` layout 和固定 layout_dir；未在这个文件中显式关闭 session serialization/resurrection。缺某设置不等于关闭该能力，实际默认与固定构建语义交给官方机制调研核实。

仅去掉 `--create` / `--force-run-commands` 不能证明不复活 EXITED session。前轮官方材料已确认 plain attach 也能复活退出的 session，相关原生入口及运行实例竞态仍是 U1。不能从这份启动器推导出一个已经安全的 attach-only 包装。

## C. 关键模块与最小可复用点

| 文件 / 函数 | 当前职责、可复用事实 | 本批影响面（事实对应需求，不决定实现） |
| --- | --- | --- |
| `session_panel/source.py` | 固定主机、Zellij 路径/session/tab/version、5 秒与 30 秒预算、规范 UUID | 连接的固定工作台身份必须与这些来源一致；目前没有 WezTerm 常量或 client 状态合同 |
| `terminal.py: terminal_id / parse_slot_command` | 排除 plugin/非法 ID；严格 fullmatch 现有三槽 SSH 命令，不用标题/cwd 猜绑定 | 可继续承担内层目标 pane 核验 |
| `terminal.py: Terminal._run / list_panes` | runner/clock 可注入；无 shell；固定 exe 与版本；version+inventory 共用 5 秒预算 | 终端状态/连接与动作资格直接涉及此文件；当前无 session inventory、GUI 实例、client 前置核验方法 |
| `terminal.py: focus_session` | 原记录/fresh 实例/pane/slot/freshness 及动作后唯一 client/pane 复核 | 本批“可靠地跳到对应终端”须审查当前只做动作后 client 核验的限制 |
| `service.py: refresh_observation / _view` | 单索引、5 秒缓存、最早采集时刻、30 秒陈旧与历史证据；metadata/body 两把 lock | 现有观察没有 terminal connection 维度；状态纳入哪层和独立 freshness 尚无既有合同 |
| `gateway.py: allowed / do_GET / do_POST` | 固定路径、loopback、Host/Origin/client header、逐 server CSRF、严格空 body | 当前只支持 focus POST；新连接和状态入口必须经过同级边界，不能把浏览器 argv当执行参数 |
| `web/app.js: state / refreshSessions / renderSelection / focusSession` | 真实 UUID 唯一选择、原消息页、显式动作、错误原因翻译、年龄撤销 | 顶部与动作提示是连接状态影响点；当前 `connected` 名称实际对应观察成功，不能直接复用语义为 GUI 连接 |
| `web/index.html / style.css` | 固定独立 DOM 详情/按钮/notice、原页面响应式布局 | 当前没有工作台连接按钮或独立 terminal 状态区域；新增显示涉及这两文件与 app.js |
| `web/cockpit.js / robot3d.js` | 展示仅收 `{sessionId,label,category}`、selected 与 onSelect；不接触 query/CSRF/message | 连接与 focus 属于 app/服务层，图形只需继续保证回调完整 UUID，现有渲染无需承接终端命令 |
| `mcp_stdio.py: build_mcp / call_gateway` | 恰好三个 readOnly 查询，禁 redirect/proxy，仅固定网关 GET | 当前新动作不在 MCP；父 Q6 不能通过扩充或 CLI 自证关闭 |
| `tests/test_focus.py` | Mock runner/service/clock，覆盖身份/slot/实例变化、恶意附加命令、动作后 client 与重建 | 现有 fixture 的调用顺序明确是 client 核验发生在 action 后；新状态/连接需要独立负例证据 |
| `tests/test_gateway.py` | 临时 loopback Mock 服务，覆盖来源/query/正文形状/CSRF/空 body/监听排他/固定资源 | 可核验新入口仍拒绝 browser 参数扩权、坏 body、cross origin；不等于真实 GUI 联动 |
| `tests/test_observation.py / test_messages.py / test_mcp.py` | 固定身份证据、历史原因隔离、缓存与陈旧、SDK 分页/版本/预算/隐私、三工具合同 | 本批不得用 GUI 状态破坏这些独立证据与正文约束 |
| `tests/verify_robot_cockpit.cjs` | 合成网关、Edge 浏览器、原 UUID/reader/3D/像素/错误/freshness/显式 fake focus | 只接受 `--fixture`，不连接 8766；真实连接/focus 仍由 root 承接 |

## D1. 身份、实例、连接与显示状态

四类证据现在的来源彼此不同：

1. 对话 ID：规范 UUID，以原生 registry、唯一 transcript 与显式 argv ID 交叉核验；目录与标题不替代 ID。
2. 远端实例：`SOURCE.id:boot_id:pid:process_start_ticks`。注册 PID/uid/comm/cwd/config、前后 start ticks 稳定、注册时间差与 transcript 元数据都参与核验。slot 仅从允许的 `TWB_CWD_FILE` 路径得出。
3. 内层终端绑定：Zellij 当前 `Work-for-Linux` terminal pane 的严格 SSH 命令 slot，与远端 slot 各自唯一才能确认；`terminal_2` 与 `plugin_2` 不是相同对象。
4. 外层可见连接：当前没有采集此证据。已有 `list-clients` 只在 focus 后读取；不能据此把 client 数量/进程标题直接当成 WezTerm GUI 归属。

`merge_observation` 对当前注册用 `registration_state=present/missing/unknown`，当前原因从本次候选重新生成、去重，`last_evidence` 单层保留上次采样；GUI 连接缺失不等于 registry 缺失。来源或 terminal inventory 失败现在会撤销身份/进程/绑定，消息 reader 则独立查询。

前端 `recordView` 四类为 confirmed/pending/retained/unknown；unknown 注册、未知 enum、旧 API 无 provenance、断连或 30 秒陈旧均不能获得 focus 资格。`eligible` 还要求 5 秒、身份 verified、绑定 confirmed。颜色表示证据，不表示 agent 工作、完成、退出。

当前 `SessionService` 只有 observation lock 与 message lock；HTTP 使用 `ThreadingHTTPServer`。前端 `state.focusing` 仅防本页重复，不等于多个浏览器/API 请求在服务端串行；新连接动作与 focus 是否会竞态需评审（U5）。

锚点：[read_registration](E:/project-funny/mianban-develop/session_panel/remote_probe.py:115)、[实例键](E:/project-funny/mianban-develop/session_panel/service.py:81)、[历史隔离](E:/project-funny/mianban-develop/session_panel/service.py:138)、[资格](E:/project-funny/mianban-develop/web/app.js:38)、[陈旧深拷贝](E:/project-funny/mianban-develop/session_panel/service.py:206)。

## D2. 运行配置与权限边界

- 项目源码固定 `SOURCE / HOST / PORT / ZELLIJ / SESSION / TAB / VERSION`；没有环境变量覆盖或多服务器配置。`Terminal._run` 继承进程环境，当前未显式设置 `ZELLIJ_CONFIG_DIR`；旧 launcher/EnsureTabs 则设置固定目录。是否影响连接同一 server 的实际方式属于 U2，不凭推断结论。
- 本地 `.venv` 固定 MCP `1.26.0`，远端 reader 固定 Claude Agent SDK `0.2.163` 与 MCP `1.26.0`。新 GUI 联动没有要求更换依赖或读消息实现。
- SSH 观察为固定 host、`-T`、BatchMode、StrictHostKeyChecking，探针经 stdin 运行，没有改远端文件；本批连接须不增加远端调用来源或创建 SSH。
- 网关拒绝错误 Host/Origin、重复 headers、错误 client header、跨域 OPTIONS。POST 还要求准确同源 Origin、每 server CSRF；body 仅 `{}`，最多 4096 bytes，不支持 browser 指定 pane/argv/path。
- 静态路径固定白名单；CSP 维持 self、禁 img/object/framing/base，响应 no-store/nosniff/no-referrer。没有 URL 日志；查询异常不返回 traceback/private error。
- 正文只在 read请求与前端内存中，使用 `textContent`；reader独立 message lock，不存入 metadata snapshot。`read_at` 不是单条消息时间。

## E. 外部归属与技术限制

本机 `.cmd` 的 GUI 检索是字符串启发式，并取 first；不能提供唯一实例归属的充分证据。产品代码尚无 GUI identity，`parse_clients` 没有 PID。外层 WezTerm window/tab/pane、Windows GUI PID、Zellij session/client/terminal pane、远端 boot/PID/UUID 是不同身份域，不能互换 ID。

前轮 [research_session_interfaces](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/research_session_interfaces.md:55) 已记录：当时两个 WezTerm CLI 路径均只见一个外层 pane；内层 Windows Zellij JSON 不含 PID/pane_cwd/pane_command，上游额外字段不能当本机构建既有事实。本 agent 仅阅读该历史材料，不重跑或复述为当前状态。

已有官方资料作为输入：[Zellij attach](https://zellij.dev/documentation/commands#attach-session-name)、[resurrection](https://zellij.dev/documentation/session-resurrection.html)、[client/pane actions](https://zellij.dev/documentation/cli-actions.html#list-clients)、[WezTerm outer pane inventory](https://wezterm.org/cli/cli/list.html)。本批现成连接语义与本机构建可用性由并行 `research_attach.md` 核实；本报告不把官网当前能力等同本机已装版本。

## F. 已阅读材料与自证范围

完整读：本批 README、根 README/两 requirements；terminal.py、gateway.py、service.py、source.py、remote_probe.py、mcp_stdio.py；web/app.js、index.html、style.css、cockpit.js；五个 Python test 文件及 748 行 verify_robot_cockpit.cjs；本机 Start `.cmd/.ps1`、EnsureTabs、wezterm.lua、Zellij config.kdl。robot3d.js 定向读取实际 sessionId、Raycaster 与 pointer 选择链；未完整读 vendored Three，因为本批不改变图形实现。历史 research_session_interfaces 读取相关 Windows 终端段。

本次仅执行文件读取、定向 `rg`、行号和 SHA-256 采样。未运行 Python tests/browser fixture，因此不声称产品测试通过、GUI已连接或成功 focus。调研过程中宽目录枚举扫到外部 vendored测试产生输出截断，随后限制到精确产品文件并补读；一次假定 `session_panel/web` 的路径不存在，PowerShell报错但末尾仍 exit0，随后确认实际目录为 `web/`并完整补读。两次组合读取超返回预算，相关代码与 tests按范围补读；不把截断输出当完整阅读。

### F1. 本次文件 SHA-256 快照

下表来自当前读文件的实际 Get-FileHash，不保证外部 D: 工作台之后不变化。root 实施前须重新核对归属与变更；不覆盖其它工作。

| 路径 | SHA-256 |
| --- | --- |
| session_panel/terminal.py | A8EBD020C11AC635BFC09F3EA34EB1EA1A8344191193D2DF8F395B55AC287CA9 |
| session_panel/gateway.py | 9D3AC254B2904307023CE516B13F81C9FEBFA31AB9F1A8C708B1EDF204F64643 |
| session_panel/service.py | B265068FE8F5D30731EC87536166B3B243B6CE51FC8DD49E55DEE1FE4C35E73E |
| session_panel/source.py | 6F259C692A8E9B0373A584D664164DFC6773F2D05A5227BD2F21D2A336A0BCC2 |
| session_panel/remote_probe.py | 3D5C5E58960B270B16AEC5A0F6A8408ADB9C7B4004D6DA9C147FFDA9429A5B48 |
| session_panel/mcp_stdio.py | 3EAF891193858D895575F08D63FA96CED902079D9F6FB31B96F942DD9531EE50 |
| web/app.js | D6282CFB0B3E63FB76E086CEDFFEE7DA4B5DB6AD1B2221F2FCAF2A63C2880CC0 |
| web/index.html | 7A50C9C1FAEBA3EF78C7B5F8B2208E04862E0289CAADB915ECF5526E85BFAB85 |
| web/style.css | 0F31C0C164C26253D0FCB9D68B2E5711C17496A187B15E3CDD9F32B5B1FE6C1C |
| web/cockpit.js | 1A9DBE426A6A88BD2007E17B0888A7A2194F8B7BDD4BF582072A7FA6091748FB |
| web/robot3d.js | B94ECA1C11751F109F6905E24AE40EEA03B2EAE1FEF5AC3E6C41FACD51548058 |
| tests/test_focus.py | 3E52EE87EA9460394A0C29BD4F24A92FE61DBD3934A90AF7E83D9E10506B8C40 |
| tests/test_gateway.py | 9B75742F69193FB9F68004F542AE80250A2116D9441109F6F76529EEF9191897 |
| tests/test_observation.py | C686576DB46740824DF1DD9FCAC89F024B81DB24FA8FEB2F5C68272EB3ADB04F |
| tests/test_messages.py | 65DC4575972868369D0E7EF559CB6FEFBCB0B20F24A0C9C0548896CB8ECF953F |
| tests/test_mcp.py | 712C53105AD56406525D2B7C1A9040633698B0E0FFFA5E5226E353C085EEBE56 |
| tests/verify_robot_cockpit.cjs | 763F99104DC6D6D973DFF0446E58AB99A25E34F3D284FDD0626A936DACA7B92D |
| D:/terminal-workbench/Start-TerminalWorkbench.cmd | 06AE379C8085A3AE03ED0DD0FD5D79DB062F12DF07BF8215AB81B5811627CD7C |
| D:/terminal-workbench/Start-TerminalWorkbench.ps1 | 4B71E6AC188459068EEA257DF2655EBEEE8B338F8E1BDBB416E7173A9108B0A7 |
| D:/terminal-workbench/Ensure-WorkbenchTabs.ps1 | 775F03F5040A0AD1F3F473440EE11F08F458693F3A375AE9D0A16BF9BDCF942E |
| D:/terminal-workbench/config/wezterm/wezterm.lua | 5F90382893F27C75A250B91249EE87CC383BEBA4C63B297A1644A8CBB456A74C |
| D:/terminal-workbench/config/zellij/config.kdl | E93805981FD949779F481E6682A7AC152213B4741287ECE1719BAE2C47FE0981 |

## G. 不确定点清单

- **U1（连接核心、未关闭）**：本机固定 Windows Zellij 是否有原生机制，保证 attach 仅连接这一运行实例、session 在检查后退出/重建也不复活。plain attach 的 exited resurrection 已是已知风险，“先 check 再 attach”仍存在竞态。确认方式：官方固定版本/源码和本机 CLI help与受控本地负例；root承接真实动作，研究者不能先实现包装当结论。
- **U2（client/GUI归属、未关闭）**：现有 GUI command-line 子串、裸 Zellij client ID、外层 pane 信息，是否能形成唯一且 fresh 的工作台实例归属。产品无此采集，client清单不含 PID；ZELLIJ_CONFIG_DIR 在不同入口继承不同。确认方式：官方接口/实际构建能力、固定exe/config/Windows创建时间及真实 GUI/client 同时观察；缺闭合时保留 unknown，不能仅见一个 client就宣称是用户的 WezTerm。
- **U3（独立状态年龄、未关闭）**：连接状态是否与远端身份采样同一份快照、是否有足够的观察 budget。现有 SSH15秒+terminal5秒已可能超过focus5秒；service用最早时刻不能被“连接成功”重置。确认方式：规划明确状态来源与freshness，并用持续耗时/迟到数据负例核验；不调整既有5/30秒合同偷渡绿状态。
- **U4（零client与解析失败、未关闭）**：本机各种不可用/空表/坏文本场景怎样区分，哪些证据允许显示“窗口未连接”。现有parse_clients把多类情况压成[]。确认方式：固定构建响应与合成坏header/坏行/exit非零测试，不能据[]直接断言零真实client。
- **U5（动作竞态、未关闭）**：多个浏览器/并发POST连接、连接中点击focus、动作前后client变化或server退出如何处理。现有ThreadingHTTPServer与两把service锁不串行终端动作，前端focusing只管当前页面。确认方式：实际最小实现计划说明边界与预算，mock并发/重建负例；不得从本页disabled推导后端串行。
- **U6（实际验收、root后续）**：当前真实RUNNING实例、GUI/client清单、成功UUIDfocus/原焦点与连接后同一实例都未在此任务采样。本批README中的PID/pane与无GUI属于root当时事实。确认方式：root在授权范围内 fresh实际读与显式连接/定位验收，失败/限制如实保留。
- **U7（外部变更、持续约束）**：D:/terminal-workbench 是其它工作正在或已修改的系统；当前读取hash只是采样。确认方式：root执行前再核验身份/hash/实际归属，若有变化读新实现，不回退、覆盖或执行旧脚本。

这些 U 点主要需要技术证据与可验证合同，不是重复确认已授权范围的问题。未对用户发起新问题，未修改 clarifications；readiness 不能仅因已有UUID绑定与mock focus测试而直接PASS，U1/U2需结合官方机制调研关闭或明确受限合同。

## H. 给 readiness reviewer 的最小可核查证据

- 关键入口：本批README记录本次授权与禁止复活/重放；真实`.cmd`第15行和EnsureTabs第85行证明旧launcher有创建/恢复/补tab副作用，`.ps1`不提供替代路径。
- 身份与实例：remote_probe.read_registration第115行、service.instance_key第81行、merge_observation第96行、terminal.parse_slot_command第21行共同说明 UUID/远端实例/slot/内层pane独立校验。
- 客户端差距：terminal.py第100行先focus、第103行再list-clients；parse_clients第35行不含PID/GUI归属，也把bad header与zero混合。当前只证明动作后验证，不能冒充动作前拒绝。
- 显示差距：app.js第137行的state.connected来源是result.status，顶部index.html第14行共用此状态；eligible第38行没有外层GUI/client条件；目前没有连接按钮或连接API。
- 网络/权限：gateway.allowed第71行、do_POST第135行与make_server第171行的loopback/同源/client/CSRF/空body；mcp_stdio.build_mcp第50行恰好三查询，无新增终端动作。
- 回归下界：tests/test_focus.py第74行是动作后唯一client失败返回focus_sent_unverified；test_observation第105行隔离当前/历史原因；browserharness第487行覆盖unknown/future_enum/legacy注册禁focus，第428行覆盖迟到UUID正文，第338行覆盖45条分页及fake focus，第578行起为实际图形选择/fallback。
- 本报告只提供已读文件事实和实际hash；不提供真实GUI/PID/client绑定、atomic attach验证或本轮产品测试结果。U1/U2未关闭；U3/U4/U5仍需方案写成可验合同，U6由root实际补验。父Q6与机器人旧正式状态各自独立。

无新增跨功能事实：外层/内层身份域区分是旧调研已有事实，本报告不重复提交全局规则候选。
