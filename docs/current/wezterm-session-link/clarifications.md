# WezTerm 会话联动：实施基线

## 未回答

无用户范围问题。技术候选仍须 readiness 独立核验；不得把已知 CLI 竞态写成不存在。

## 已回答与授权

- 目标：日常开发效率优先；3D 用于理解与选择真实会话。
- 展示：用户选择“3D 机器人主视图＋像素/文字回退”。本批不改图形层。
- 新批：前轮已呈递“连接现有工作台、显式 UUID 定位、终端连接状态”，用户本轮答“继续”。
- 执行偏好：用户此前明确“自动实施代码即可现在”。在该范围内由 agent 选择技术细节、实施、验证；不重复请求已有目标或阶段入口授权。

## 头脑风暴决策

1. 连接与远端身份分开观察。来源采样成功不能表示 GUI 已连接；无附着客户端也不能把真实 UUID 标成未映射。
2. 复用原 UUID 选择、消息分页、严格 SSH slot/pane 判定、focus 端点及同源 CSRF 边界。新增固定工作台状态和显式连接入口，不新增 MCP 工具。
3. 不运行原 launcher。它有 create/force-run-commands/EnsureTabs 副作用。官方发布 EXE 与本机 SHA 完全相同；命名 attach 在无 create 时也可能复活。
4. 仅考虑官方**不带名称、不带 create 的 attach**：源码只在恰好一个 active session 时附着，零或多个时失败，不进入 New/Resurrect。实施前、连接后都核对唯一 active 名称是 workbench-v4，以及 server PID、创建时间和 marker 一致。新 GUI 使用固定 exe/config、always-new-process、no-auto-connect，不传初始命令。
5. 该 CLI 无原子 expected-instance 参数，检查至附着存在竞态。不能承诺瞬时绝无错连。产品合同为保守前检、有限等待、原实例后验确认；不匹配或超时必须终止**本请求创建且身份仍可核验的 GUI/客户端树**，返回未确认，不保留等待将来同名 server 的客户端。不得停止既有 server、SSH、GUI 或用户进程。若 readiness 认为这一可逆且后验验证的合同仍不能满足固定工作台范围，保留阻塞，不自造 IPC/更换依赖。
6. 既有客户端必须重新观察。组合证据包括全量相关 Zellij/WezTerm 进程普查、固定 exe/解析后的 argv、ParentProcessId/CreationTime、唯一 active 原 server、唯一合法交互 attach 子进程的 GUI 祖先，以及有效 list-clients 中恰一个交互 client。未知 argv/权限、可观察的额外交互/web/watch client、异主/多 GUI 或计数不一致均禁 focus；不猜首个窗口。CLIENT_ID 是 server 分配的小整数，不是 Windows PID，组合证据只称“唯一关联观察”，不称精确 client-PID 握手；连接结果和文案明确这一口径。三列含交互web客户端但不含watcher且无类型字段，不伪造web/watch数量为零，不声称已排除不可观察客户端。既有GUI允许严格匹配实际旧launcher profile（参数是只读历史事实）和本批新无名profile；不运行旧profile。新增终端动作锁避免并发 connect/focus；查询不发输入。
7. 失败回收限定新 GUI 的 Popen 进程句柄及该 GUI 下、仍能以 exe/固定 attach argv/创建时间核验的 Zellij **客户端**；不使用 taskkill /T、不扫杀所有后代，尤其不回收 server/SSH。无法确认/回收该客户端时返回 cleanup_unverified、锁住后续连接和定位、如实列为验收缺证，不写“清理完成”。LW 必须明确有限等待与这一失败口径。

用户已确认的目标与三项功能范围保持不变；上述是可逆本机联动的技术选择和诚实成功口径，不授权复活/创建远端进程。readiness 负责独立检查其是否可落地。

## 完整实现基线

### 1. 目标锁

- G1：一个状态区区分 workbench-v4 后台、WezTerm 窗口、Zellij 附着客户端及证据年龄；失效/错误清单返回 unknown，不能冒充零。
- G2：显式连接固定现有工作台。只有唯一、当前存活原 server、零客户端和零相关 GUI 的前检成立才可新增 GUI；成功仅在同一实例与上述唯一关联观察可确认后返回，明确不是 client-PID 握手。已连接时不重复创建。
- G3：现有 UUID focus 在发送前、发送后核查唯一客户端及当前实例/目标 pane；无客户端、多客户端或未知归属动作前拒绝。正文分页与机器人选择继续工作。

### 2. 反目标

- N1：不复活 EXITED、创建缺失 session、运行命令/补建 tab/创建 SSH或Claude 会话，不执行旧启动器、不改 D: 工作台配置与文件。
- N2：不改源范围、远端 reader、MCP 三查询、图形层/CSP/采样5秒和陈旧30秒的既有合同，不扩大 CLI 输入到浏览器。
- N3：不新增常驻守护器、自制 IPC、编译/替换工具、通用配置/插件系统；不触碰其它用户进程，不关闭旧批缺证。

### 3. 风险边界

仅 Windows 固定当前工作台。backend 固定参数且 shell=False；connect 沿用空 JSON、loopback、同源 Origin、CSRF。状态不能暴露命令行/消息正文。GUI 进程仅是存在证据，list-clients 仅是客户端证据，必须说明归属证据组合与未证场景。允许范围内新 GUI 失败清理由 root 与 reviewer 独立核查，只能回收本请求创建的身份匹配进程。瞬时竞态不宣称已消除。

### 4. 验证责任

- 作者：本地 mock 单测、静态检查；本地临时网关/合成浏览器由 root 执行。作者禁真实 GUI/attach/focus/HTTP8766/SSH。
- root：本轮独立完整输出和 exit；合成 API/UI 正负例；真实运行实例、连接前后 server/SSH/pane 不变、客户端唯一、UUID focus、已连接不重复创建；只重载自己原来创建且归属可确认的网关。
- fresh reviewer：只读最终 diff、全部验证与失误/失败；缺真实证据不能 PASS。实际输出存 work/wezterm-session-link-*，正式报告存本目录；正文与 CSRF 不落盘。

### 5. 文档职责

README 记录授权与阶段；research_code/attach 只载事实；本基线唯一最终需求输入；lwplan 是唯一落地方案；review/report 载具体证据与结论。旧机器人及父批冻结报告不改写。

### 6. 基线生成规则

原文需求＋本轮“继续”＋已确认三项范围＋实际代码/固定版本源码生成 r1。未确认/未证技术事实不默认成功，readiness 可要求补证或修订合同。

### 7. 基线内容边界

本批是现有 panel 的终端联动增量；不实现巨型面板其它模块。预计新增一个本机 workbench 模块、原 terminal/gateway/app/index/style 和直接对应 tests；不要重构其它链路。

### 8. 下游消费规则

正式 readiness → 唯一 LW/Gate1 → fresh Gate2 → 实施 → root 验证 → fresh Review(Impl)。G/N 必须落到工作包与测试，关键 API/状态/cleanup 口径不唯一则受控回传 root，禁止递归委派。

### 9. 状态与兼容性规则

当前 ReadinessCheck，未写产品代码、未启动 GUI。robot 保持 impl_reviewing/BLOCKED（成功真实 focus 缺证）；父 Q6 保持独立待验。新 API 失败撤销 UI 动作资格；旧合成 fixture 无 workbench 数据时按未知处理，需要同步 fixture 合同，不给旧响应隐式成功默认值。

### 10. 补充需求与事件对齐

出现新目标/权限/外部动作先回写本基线。代码研究 U3/U4/U5 由 LW 写年龄、严格解析和锁的可测口径；U1/U2 由本基线第4—6决策＋readiness处理；U6 root live、U7执行前复核外部归属。阶段转换、发现风险和 reviewer 修订记录 README/本节，不重新询问用户已明确授权的相同范围。

LW补事实事件：root独立固定源码确认 list-clients 来自screen.connected_clients；watcher单独存储，输出无web/PID类型。决策6明确可观察范围与两个实际profile，G/N及权限未改。readiness作者受控核验这一delta，LW消费最新hash；不以旧hash报告冒充新输入已核验。

## 11. LW 阶段补充事实：独立的外部 WezTerm mux（2026-10-04）

root fresh 全量 CIM 发现在 D:/软件/wezterm/WezTerm/wezterm-mux-server.exe 的独立进程 PID44644，ParentPID57000（父已不在），CreatedUtc2026-10-03T15:10:36.0770010Z，完整 argv 仅该 EXE。历史归属未证，禁止称 root 所有或关闭。实际 list-clients 正确表头零交互、唯一 active workbench-v4、原 server5612未变，且无 GUI/attach。前次仅列固定exe的窄采样不能声称全量无 WezTerm 进程；这是事实口径修正。首次 rg work通配路径导致exit1，纠正rg --files；此次历史搜索无匹配exit1，不作进程来源证明。

决策：该完整可观察的独立 mux 不是 GUI，也不拥有本机可见 Zellij attach，不能直接折算工作台 GUI/客户端或阻断固定新实例启动。只为当前实测固定外部路径增加严格只读 profile `[D:/软件/wezterm/WezTerm/wezterm-mux-server.exe]`；CIM exe/name/argv/created必须完整一致，额外flag、其它路径、未知字段仍拒绝。记录 `unmanaged_mux_count`，不采用、不连接、不清理该mux，不宣称其内部客户端覆盖或root所有。其存在和 identity须在前后普查稳定；可见多余Zellij client依然阻断。

依据为 root 完整实读固定 Lua：无 mux domain/default_domain/connect_automatically 设置，默认本地 PROG；官方与本机 start help 证明 always-new-process独立GUI，no-auto-connect禁自动domain连接。已有launch明确这两flag、固定PROG与清继承socket，本批不使用PATH wezterm cli。该例外不支持任意mux/GUI归属，不改变 G/N 或客户端前后守卫。需 LW作者把例外、字段、mock正负例补入唯一方案并重自证，readiness窄delta＋fresh Gate2 后才实施；不增加用户范围问题。

## 12. R5 真实会话测试授权与完整实现基线补充（2026-10-05）

原话、失败证据与决策完整保留在 [resume_context_r5_live_testing.md](source_materials/resume_context_r5_live_testing.md)。用户要求“新起一个codex对话…wezterm新起一个…直到能力稳定”，持续“自动实施代码即可现在”覆盖本轮必要普通修复与测试，不重复阶段许可。

本轮目标锁补充：G3 必须以唯一真实交互客户端最终聚焦 exact UUID 的目标 pane 为成功标准，尤其覆盖新 GUI 未发键盘事件的场景；新 Codex/远端 Claude 真实 UUID 在原生 WebGL各出现一次，刷新与点选隔离可验。Codex 身份、远端消息与终端焦点分开判定。

反目标补充：不弱化 exit0 后验、instance/关联/年龄/完整性/lock/latch/预算；不发送虚假键盘字符来设置客户端；不把 tab 近似定位、偶然已有焦点或 mock 成功当实机成功。关联瞬时 unknown 原因待证，不能重置年龄或直接缓存为成功。

风险边界补充：原 N1 仅在 root 标记的真实测试中有限覆盖 plain attach、dev SSH和新安全 Claude，旧 held 命令不恢复。产品 N1/N2/N3保持，作者仍禁真实动作。原子 CLI 竞态、真实 owned 回收与其它旧缺证不因本轮正例自动关闭。

验证责任补充：作者本地 no-op focus/跨tab/有界遍历与拒绝例，root fresh 实机同 UUID重复定位、list-clients独立核验、生命期/机器人/正文证据，fresh reviewer读取最终 bytes 和全部失败。恢复正式 LW/Gate1/Gate2→Impl→fresh Review(Impl)，由最小原地补丁吸收真实 focus 缺陷，不另建平行产品方案。

## 13. R6 完整采样稳定性基线（2026-10-05）

继续消费用户 §12 的真实测试与持续自动实施授权。完整恢复材料见 [resume_context_r6_census_testing.md](source_materials/resume_context_r6_census_testing.md)，新实际主入口证据为 `work/live-session-native-main-stress-r6-before.json`：30份真实 helper 清单有7份失败，30个并发只读探针返回码均0，但3份探针 stdout 为空；不称30份有效客户端内容。原11/100、15/100与5/15失败保留，退出严格因果仍有推断边界。

目标 G1 的本轮最小修复：只在 native.main 对精确 ValueError(api_failed/invalid_identity) 至多共3次重新取得完整当前清单，共享入口最早5秒deadline。每个失败清单整份丢弃；合法完整成功才输出。N1/N2/N3、完整字段/身份/出生时间/缓冲/句柄关闭守卫保持；其它错误、close_failed note、耗尽均立即诚实失败，不能略行、合并、缓存旧成功、移动 snapshot 时间或增加预算。

范围只 `session_panel/native_processes.py` 与 `tests/test_native_processes.py`，独立于R5定位两文件。R5局部实现冻结、root已读差异与本地独立验证后可以规划本轮；R5实机重复定位和最终独立实施审查在采样修复后补证，避免两轮相互依赖整批PASS。保留各轮准确before/差异与审查目标，不把新的采样代码算入旧R5定位差异。

作者只本地mock/静态red→green；root实际完整helper并发、原面板刷新、精确焦点与仅自己服务的受控加载；fresh reviewer独立核最终字节/全部红绿与实际窗口。正常使用仍有失败则继续最小修订，不称整套稳定。CLI空响应、系统/远端超时、过期年龄与旧owned回收/Q6缺证独立保留，不能拿这轮重采样宣布全部解决。正式唯一LW追加与双Gate仍先于产品实施，不重复用户阶段确认。

## 14. R7 精确定位完整实施基线（2026-10-05）

继续§12用户真实测试与自动实施授权。原文、当前源码及实际失败在 [resume_context_r7_focus_budget.md](source_materials/resume_context_r7_focus_budget.md)。R6两文件保持冻结；root独立144项、100份完整采样/100份真实客户端、15份并发关联与原生Edge22项均exit0，准确scope检查40项成立，R6独立审查单独落账。新的真实focus仍exit1：实际client到terminal_3，但累计age5766ms超原5000ms，动作窗口3766ms未超。不得把实际移动当完整成功。

目标锁G3：从其它tab及目标tab内错误pane开始，只有原完整最终关联、真实唯一client exacttarget、strict slot/pane/fingerprint、远端实例累计age及最早动作deadline都成立，才计确认。G1诚实unknown和G2连接规则保全。N1/N2/N3不变，不发送键盘字符、扩大布局、略字段、延预算、重置年龄或用旧成功缓存替当前核验。

技术决策：仅现有_focus_candidates完全接受的strict tiled目标直接复用官方tab-ID/next；每步原clients/version/完整inventory/fingerprint及预算检查不变；删除strict无效exact及重复中间post/inventory，保留一次完整最终Workbench.observe和fresh list_panes，全部原same_association/实例/真实pane守卫必须执行。nonstrict保留原exact路线与一次完整最终核验，不遍历。产品仅terminal.py/test_focus.py，不改Service/source/Workbench/native/UI、pins/锁/latch/5000ms合同。预计省1125ms仅模型；-S无可靠收益不采用。

风险/回退：多步或远端延迟仍可超龄，必须未确认；去掉中间整套普查后仍由每步client/topology及完整final拒绝变化，非原子观察限制不抹去。回退只撤本轮两文件增量，R6及其它现状保留。作者本地成本症状先red/准确before/green/scope，root独立当前回归和真实HTTP/UI重复跨tab、目标tab错误pane定位及自己的退出重建，fresh reviewer独立最终diff/红绿/所有失败。缺实机终验不能写稳定；旧owned回收、父Q6/Codex正文活动和图形高负载限制独立保留。

本节为R7唯一完整上游输入。唯一LW原90756字节前缀必须完整保留后追加§10，Gate1→fresh Gate2/root明确放行→作者实施→root当前实机→fresh ReviewImpl。R6准确原authority冻结记录已落work/wezterm-census-root-scope-r6-result.json；本节是root后续新阶段追加，不回写R6作者产物。无未回答用户问题，不以流程再索取已授权实施许可。

## 15. R8 精确定位路径与同请求证据收敛（2026-10-05）

继续§12用户真实测试与自动实施授权；完整原文、全部当前实机与决策见 [resume_context_r8_focus_route.md](source_materials/resume_context_r8_focus_route.md)。独立R7 ReviewImpl为REVISE/PLAN_DEFECT，实际cross成功，next在4->5->2后累计age5218ms拒绝，未到目标/未进final。保留R7准确两个产品作为新的before，§8–10及所有已实施支撑只追加覆盖，不撤R6或静默改旧记录。当前目标仍G1/G2/G3，本次连续方案缺陷计数1，问题陈述未漂移，无新增用户问题。

G3成功标准：新真实UUID机器人/正文隔离与跨标签、目标标签错误2/4/5、准确已在目标的定位分别验收；只有当前完整final关联、真实singleton exactpane、唯一slot、原instance、四个矩形字段与原flags/commands指纹，以及原5000ms earliest age/action deadline全部成立才确认。N1/N2/N3保持；不输入假键、不延预算/重置龄、不省版本/字段/完整final、不跨请求缓存inventory或拿旧成功当当前，不修改其它来源/图形/锁/latch/CSRF。

技术收敛：pre唯一真实client已经在接受候选时省无效goTab；strict fingerprint纳入完整整数非负x/y与正rows/columns，只有全部可选up邻居恰为目标时用一次官方move-focus up，否则原next。方向预测不是stack/active_at证明，实际错误/未移动或几何变化拒绝，不能再随机遍历。Terminal复用同一次force刷新刚实读并用于merge的完整版本/inventory，原公共Service返回/缓存不变，禁止用perstep代final；精确私有forced返回口径由LW在service/terminal与对应test_observation/test_focus四路径内落实。原age包含force刷新，从refresh_finished继续；原deadline位置/pins/pre/每动作freshclient+version+全panes、最终complete observe+freshpanes保持。

选择理由：官方sort(y,x)及unique-up已由root实际onlyfocus证实；onlyshortest循环从5仍两步且模型超5秒，故不同时加previous/路径规划。去重force之后的重复清单为当前预算所需，复用的是同请求已取得当前清单，不是持久成功缓存。方向依赖rectangle，不能沿用不含geometry的旧指纹。风险为公共清单无stack、非原子观察及调度波动，任何实际不能验证仍unknown；成本模型不当实机承诺。

验证责任：作者仅local/mock，真实同预算wrong-pane成本red->green、方向歧义/坏几何/变化/no-op/非0/client/最终association/age/deadline拒绝保全；root全量当前独立与实际5种起点各3轮、HTTP/IAB/原生mesh，记录每个red/busy/unknown。root自己旧c930已退出并失去关联，新0990a0a5/PID3886044/ticks1341437828已取得2条精确测试正文与confirmed映射，后续实测使用新实例而不是旧PID。fresh ReviewLW/Gates先于改产品，fresh ReviewImpl先于完成结论；服务仅精确root原归属加载，不清latch。失败回收/父Q6/Codex正文活动/48角色与自动合作边界独立保留。

## 16. R9 同请求独立采集重叠（2026-10-05）

继续§12自动实施及真实测试授权。R8正式独立ReviewImpl `review_notes_impl_r8_1.md` 为REVISE/PLAN_DEFECT，root已全文读取并接受；R8原四路径与全部产品/输入冻结记录保留，随后root有意追加本节与当前状态，不回写旧报告。详细事实/取舍在 [resume_context_r9_sampling_overlap.md](source_materials/resume_context_r9_sampling_overlap.md) 及 `work/r9-focus-sampling-research.md`。主链上一ReviewLW PASS已重置计数，本次PLAN_DEFECT计数1；已复核用户问题仍为真实会话能力稳定，没有新问题、权限或成功定义。

实际15次仅12confirmed/3unknown，全部独立client到target3但三个final累计age5328/5844/5187ms，原action均<5000ms；原完整final诚实拒绝正常。root first161/1ERROR/exit1 Win10053与相同字节second161/0/exit0分别保留，两warning仍有；额外HTTP隔离诊断发现拒绝body竞态候选，业务调用全0，另行报告而不混进定位四路径。R8未加载/HTTP当前focus验收未执行，不能称交付稳定。

G1/G2/G3与N1/N2/N3不改：exact实例/slot/pane、完整flags/geometry/commands、singleton真实client、完整关联、原最早远端age和action5000ms齐全才能确认。没有省字段/样本、fake input、旧成功缓存、改预算/起点、清latch或改其它来源/图形/CSRF。

唯一技术收敛：仍四路径，只在private forced pair中让remote与fresh完整version/inventory重叠；让final完整Workbench.observe与fresh完整list_panes在原同一deadline内重叠。各处一个临时worker，原主线程拿齐结果才merge/判定，context join在observation/action锁释放前。worker只采读不修改snapshot或发动作，原已有子调用timeout和deadline仍约束；公共刷新/cache/返回/schema不改。原started早于两读取，refresh_finished在两完成后，原deadline/pins/pre/每动作逐次样本不动；最终采样两语句可改为并行调度，完整判定原字节保留，不用perstep或更早取样替final。更早库存仍受采集前started保守年龄约束。

选择理由：Python3.12官方临时ThreadPoolExecutor已提供I/O重叠与context等待；本机Workbench白名单允许精确只读probe，完整进程before/after不省略。拒绝private Workbench回传/全局pool/持久SSH/合并每动作及final，因为需扩大模块或改变exit/证据口径。理想模型最慢样本仅31ms余量，不能当收益承诺；调度、异常、超时、非原子观察都继续unknown，真实再验决定后续。

作者只local同步Event/受控runner meaningful red→green，证明两个阶段实际重叠且异常/迟到/完整guard拒绝、所有worker在锁释放前退出；保留原38及R8新增14方法。fake clock累加不作并行性能证明。root当前独立全回归/scope与新五起点各3轮，raw事件核两旧时钟与所有终验，然后精确自有gateway加载、HTTP3轮、IAB actualfocus/client、fresh ReviewImpl。所有red/unknown/busy原样保存；旧能力/性能缺证继续独立。唯一LW保留123002bytes前缀后追加§12，freshGate1/Gate2及root明确放行先于代码，不另建平行方案、不以流程重新索要用户许可。


## 17. R10 当前整体验收

继续既有自动实施/自有测试授权，G1/G2/G3、N1–N3及原两5秒不变，不重复询问许可。R9两处并行已由实际15/15及raw两预算确认；整批仍REVISE/PLAN_DEFECT：167首Win10053、HTTP未知/轮询busy不能被15/22/IAB有限正例覆盖，旧报告原样保留。
独立bounded H1仅gateway.py/test_gateway.py处理已复现小成帧早拒绝传输问题；其before/diff/红绿及fresh review由H1单独落账。H1两产品已冻结，root独立核当前29；本轮采用复合29产品（R9四文件exact＋H1两合法diff，其余23不变），再当前整套回归绿、同发送方式69次after及H1 fresh review；不回写R9为事后PASS。
本轮只收敛当前基线验收，无新产品实现。正常可见IAB轮询下API3轮，每动作前只读ready最多3样本、仅busy允许250ms后再GET并完整记录；unknown即停无POST，busy耗尽即停。每个connect/focus POST仅一次，409/未知/传输错误算负例，不重发或无限重跑。新有效样本只能证明后续窗口，235ms unknown原因未明保留，不称已修复。
成功要当前唯一GUI/client exacttarget3、幂等connect无launch、0990同PID/ticks/boot两条测试消息、新Codex一次metadata；当前native WebGL/两UUID mesh/跨刷新home/3Dplaying及IAB实际focus。缺任层不称整套稳定；48robot性能、实际合作、Codex正文/实时活动、owned失败回收/Q6仍独立未证。

当前复合产品冻结见 `work/wezterm-integration-r10-manifest.json`；H1 manifest SHA `8EB84B5F5797C2D41029786E5B3041EAB764ED34306A7681C1614841BD0D3A3C`。gateway=`9CA5C27ECBABC378E7CA6B2F9B70769C94483C1B1C4A81D2CB53C8C0DDDA1498`，test_gateway=`979A76E3BB43289991990F56EE9D6A191DD4B17693A4CD2A8AFCBB5EF0AB740D`；root当前175项、原3症状和69after均exit0且tested=current，不代独立H1审查或本批运行。

## 18. R11 场景性能与选中来源映射（2026-10-05）

用户已授权新聊天继续场景与功能映射、自动实施；完整原文与边界见 source_materials/resume_context_r11_scene_mapping.md。本开发聊天 UUID 为 `01a109a3-2890-7531-805b-6ed67edb5d5d`，协调端已只读 API 观察其完整 `codex:` key；这不能替代 WebGL 角色核验。不重复请求既有实施许可，独立技术审查仍强制。

本轮完整实现基线为以下三项目标锁：G11.1 降低实际48角色绘制提交量，保留同几何、材质、抗锯齿、DPR、192粒子、独立空间、平滑步态和所有拾取/回退行为；同条件60秒连续正常播放/轮询分别报告FPS、p95、慢帧比例与原始帧间隔。G11.2 选中身份的映射说明必须跟随来源，显示完整原样角色键、身份采样/年龄、历史能力、当前终端映射证据及不可用原因，下一步仅跳转现有入口或复制键。G11.3 新开发聊天在真实API与实际WebGL中按完整UUID出现，三次正常刷新保留其角色与工位，当前页面截图可核查。

反目标：N11.1 不暂停、降画质、改变场景人口或隐藏负样本来获得性能数字；旧35.11FPS/p9560.9ms和本轮全部失败保留。N11.2 不用动画、updated_at、目录相同或粒子推忙闲、完成、协作或终端绑定；Codex正文/实时活动/终端尚无来源。N11.3 不改后端API/采集/身份/锁/年龄/预算/CSP/CSRF、重试POST、启动或停止用户进程；不读取未经授权正文、不创建更多用户聊天、不初始化Git。

范围/技术取舍：仅web/robot3d.js、web/app.js、web/index.html、web/style.css与合成浏览器fixture。采用Three r186原生InstancedMesh按相同geometry/material批量绘制模型与静态工位；保留原逻辑Group/limb/完整UUID供动画、包围盒和原raycast，不批量化独立边框/选中圈。映射沿现有状态派生展示；原动作守卫仍是唯一资格。不上引擎、物理、shader、关系图框架或新猜测规则。实际研究见work/r11-scene-research.md与work/r11-mapping-research.md。

风险与验证责任：原48绘制1025的瓶颈明确，但本轮10秒112.3FPS/p9515.6ms未重现旧低帧；60秒前后样本只能证明本机窗口，不保证任意硬件。参考目标FPS≥60、p95≤20ms、>33.3ms帧<1%，未达必须列为未达，不影响降低draw calls的事实。root负责隔离Edge全fixture、同条件60秒比较、真实API/WebGL及可见IAB；reviewer只读最终diff和完整原始输出/截图作fresh ReviewImpl。缺实机或连续证据保持未验证。独立ReviewLW与root Gate2之后才改产品，最终修改后重新验证与fresh审查；本轮不触及旧owned失败回收、Q6和235ms根因。文档保存before、差异、各层证据与英文提交建议，旧章节及R10结论不变。
