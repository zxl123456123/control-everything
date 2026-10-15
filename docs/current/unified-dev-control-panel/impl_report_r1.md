# 会话关联首批实施报告（r1）

- feature_name：unified-dev-control-panel（远端 Claude 会话关联首批）
- impl_round：1；date：2026-10-03；owner：session_impl_core（汇总 core/surface 分包）
- lwplan_version：SHA256 `38E3F991AA0BBF3434F2A9B7A2562EA0DBFE7520095C894003B4934018AB3074`
- 授权：clarifications Q5，用户原话 `a`，选择按已呈递范围开始实施；没有开启 auto_mode。
- **当前交付状态：FINAL_ARTIFACT_READY，可进入独立 Review(Impl)。** S1–S4 源码与本报告已冻结；本 owner 完整读取两份分包、root 外部总账、各实际验证记录及最新验证输出。该状态只表示产物可独立审查，不表示 Review(Impl) PASS 或整体首批已可用。当前 Codex chat 的匹配工具列表仍为 `[]`，项目信任尚未验证；用户正常重载/信任后实际调用是明确剩余项。
- 最终源码基线：`work/session-product-manifest-r1.json` 保存 21 个新增产品文件及 SHA256；外部总账为 `work/session-panel-external-r1.json`。最终 gateway SHA256 为 `F613D30C9BADC94003C7AF8ACBA85B7B9D46155A7A37A1A263871339BC9A8E9D`，app.js 为 `ACE9FF63F5A2A9CD2772B8AAF3C8B9BD84F6922B9B7DE20719997C3E76B68CAF`。历史候选版本的结果保留，不代替最终版本证据。

## 实际变更与目标链

本批在原来只有 docs/work 的当前工作区新增产品。默认启动为一个 Python stdlib 网关，固定 `127.0.0.1:8766`，页面和三个 stdio MCP 查询调用同一 SessionService 元数据索引。只读观察通过既有 SSH stdin 执行 helper；选中 UUID 才在固定远端隔离 runtime 使用公开 SDK reader。页面唯一控制是重新核验后切换现存 Zellij pane。

没有改 Workbench、Nova、现有 Claude CLI/PATH/设置/Hooks，没有发送/输入/代审批/resume/终止 Claude，没有数据库、调度、3D/Jev/C4D 或多主机配置；当前目录非 Git，不 init/commit/push。

| path | change_type | change_purpose | key_changes | related_tasks |
|---|---|---|---|---|
| session_panel/__init__.py | add | 包入口 | 导出单一 SessionService | S1/S4 |
| session_panel/source.py | add | 固定来源与预算 | host/user/config/版本/超时/大小集中，canonical UUID/消息参数校验 | S1/S2 |
| session_panel/remote_probe.py | add | 固定远端观察和官方历史 | registry/proc/UUID metadata；公开 reader 范围/空结果/六字段/分页预算 | S1/S2 |
| session_panel/service.py | add | 一份共享索引 | 可注入 SSH/Zellij，串行刷新和正文读取，cache/stale/失败撤销当前资格，保留上次证据 | S1/S2/S3 |
| session_panel/terminal.py | add | 当前位置与显式定位 | 完整允许命令匹配，实例/UUID/pane/age 复核，仅 focus-pane-id，list-clients 文本和事后清单确认 | S1/S3 |
| session_panel/gateway.py | add | HTTP 表层 | 固定loopback、单Service、Host/Origin/header/CSRF/body；Windows beforebind SO_EXCLUSIVEADDRUSE/关闭SO_REUSEADDR；错误过滤/no-store/不记录正文 | S3 |
| web/index.html | add | 中文会话入口 | UUID独立行、选择详情、身份/进程/位置、消息和定位按钮 | S3 |
| web/app.js | add | 按需交互 | 元数据轮询/隐藏暂停，选择与分页才读消息，textContent，不加载附件；过期定位禁用、竞态隔离 | S3 |
| web/style.css | add | 可读布局 | 360px/桌面、长UUID/路径换行、焦点可见与原生控件 | S3 |
| session_panel/mcp_stdio.py | add | 三只读工具 | 固定FastMCP1.26.0，list/status/messages薄HTTP转发，共源，无控制工具/第二索引/自动启动 | S4 |
| requirements.txt | add | 本机MCP runtime | mcp==1.26.0 | S4 |
| requirements-reader.txt | add | 隔离reader runtime | claude-agent-sdk==0.2.163 与mcp==1.26.0 | S2 |
| .codex/config.toml.example | add | 可审阅配置 | 一个server表，绝对python/cwd，恰三个enabled_tools；实际配置由root承接 | S4 |
| .codex/config.toml（root承接） | add | 项目MCP表 | 初始不存在，root仅添加本批单server；未改global信任/参数，不宣称当前chat生效 | S4 |
| 根 README.md | add | 运行与撤销说明 | 从两种runtime前提、启动、网页、MCP、验证到撤销顺读；配置不等已加载 | S4 |
| tests/__init__.py | add | 测试包 | 本机可运行测试入口 | S3/S4 |
| tests/test_observation.py | add | 身份观察回归 | 同cwd两UUID、注册/实例/slot/pane冲突、PID变化、失败/陈旧和SSH argv | S1 |
| tests/test_messages.py | add | reader契约回归 | 临时JSONL/stat与严格六属性mock；scope/[]/异常/分页/变化/预算/串行 | S2 |
| tests/test_gateway.py | add | HTTP回归 | 共源/六字段/错误、Origin/Host/header/CSRF、ID/参数/body；自身临时loopback监听拒第二gateway与reuseaddr socket | S3 |
| tests/test_focus.py | add | 定位拒配回归 | mock精确argv和clients文本，实例/过期/重复/null/plugin拒配及事后变化 | S3 |
| tests/test_mcp.py | add | MCP回归 | 合成HTTP页、stdio initialize/list/call、三个只读工具、非法输入、TOML | S4 |
| work/verify-ui-r1.cjs / ui-check-r1.json | add | UI行为自证 | 合成DOM/消息，15检查含45条分页边界，明确不是真实浏览器 | S3 |
| work/impl-core-r1.md / impl-surface-r1.md 与各自日志 | add | 分包证据 | 文件/目标/实跑/失败/外部边界可追溯 | S1–S4 |
| docs/current/unified-dev-control-panel/impl_report_r1.md | add | 本轮正式实施证据 | 统一事实、验证责任、限制与回滚 | S1–S4 |
| 本机.venv / 远端专属reader.venv（root承接） | create runtime | 两种隔离依赖 | 初始均不存在，固定版本/API与解析依赖清单记录work/runtime证据，未改系统CLI/PATH | S2/S4 |

## goal_lock_check / anti_goal_touch_check / authoring_ergonomics_notes

- G1：source+真实UUID为主键，同cwd main/files不合并；registry、proc实例与唯一transcriptmetadata分别给证据。固定版本/来源、坏条目/冲突/缺进程保持unknown；live进程数不是会话数。
- G2：页面、HTTP与MCP使用同一Service字段；正文不入索引、磁盘或浏览器持久存储。HTTP/MCP保留available/reason/read_at；断连或当前源失败撤销定位，显示上次证据。
- G3：现存会话下一次观察补绑，无重启/resume/Hook前置。只有fresh≤5秒、唯一相同实例/slot/pane才发送focus；exit0须事后唯一client/pane确认才显示成功。
- N1–N3：上述不影响项保持，activity/task_completion始终unknown；没有cwd/title/mtime/静态布局成功捷径、默认全体正文读取或模型外发。
- 作者体验：source集中、一个Service、一个公开reader入口、直接字典协议、薄HTTP/stdio；原生页面用中文原因/折叠证据，六字段不猜timestamp，没有泛化配置框架或第二消息链parser。

保守实现细节：registered_started_at原样保留，实例key使用source+boot_id+PID+startticks；与proc出生差<-1秒或>10秒标registration_time_unexplained并unknown，不拿注册时间当进程出生等式。元数据扫描最多512KiB至首组顶层sessionId/cwd并复核stat，不输出body/title。canonicalcwd仅ASCII、长度≤200且direct项目parent唯一确定；长路径/非ASCII/不对应为reader_scope_unverified。SDK[]包括真实零可见历史一律reader_empty_unverified且total_visible/next_offset=null；只使用实际六字段，不补单条timestamp。read_at只表示本页读取时点，文件revision是读一致性而非身份或成功依据。

## impl-safe 验证记录

以下均为本地、低风险、可重复的fixture/mock/临时loopback/合成stdio，未由impl执行真实SSH、浏览器或focus。字段中的owner是执行者，不能把子agent自报当root独立验证。

| 命令或校验 | 实际结果 | evidence | owner | conclusion_if_missing |
|---|---|---|---|---|
| Python3.12 `-m unittest tests.test_observation tests.test_messages -v` | 25tests、exit0、0failures、0skips；最后code补充后重跑 | work/impl-core-tests-r1.txt | core | S1/S2仅源码，未自证；mock不证明SDK真实兼容 |
| `.venv/Scripts/python.exe -m unittest discover -s tests -v` | Windows端口补修后最终fresh47tests、exit0、0failures、0skips；此前候选46项历史保留 | work/impl-core-full-tests-r1.txt最新47 / 历史46见surface/root候选日志 | core | 全量本地整合未自证，外部不在此结论内 |
| 同全量命令 | 独占修复后47tests、exit0、0failures、0skips；旧46日志仍保留 | work/impl-safe-surface-exclusive-r1.txt / impl-safe-surface-r1.txt / impl-safe-surface-pagination-r1.txt | surface | 不替root独立核验 |
| 同全量命令root独立复跑 | 独占修复后最终fresh47tests、exit0、0failures、0skips；完整stdout/stderr已读，旧46项保留 | work/impl-safe-r1-root-exclusive.json / impl-safe-r1-root-exclusive.txt；历史work/impl-safe-r1-root.json / impl-safe-r1.txt | root | coordinator未核验，不能仅信分包结论 |
| `python -m compileall session_panel` | exit0 | 各分包日志/本轮实际工具完整输出 | core/surface | Python语法未验证 |
| `node --check web/app.js` 与 `node work/verify-ui-r1.cjs` | 分页修订后core独立fresh：JSsyntax exit0，Node15checks/0failures/exit0；历史14项仍留痕 | work/ui-check-r1.json / impl-safe-surface-r1.txt / 本轮core完整工具输出 | core/surface | DOM自证不证明真实Edge |
| `.codex/config.toml` 实际表和example TOML解析 | root最终actual+example解析均exit0；本地test_mcp通过 | work/impl-safe-r1-root-exclusive.json / 同全量日志 | surface/core/root | 配置语法未自证，更不等当前chat加载 |

core Windows本地fixture只shim外国cwd存在性，JSONL/stat/预算是真实临时文件；消息对象是恰六属性mock。Linux真实SDK对照列在外部承接，不能混写impl-safe。MCP的pydantic_settings `IncompleteFieldDefinitionWarning`（lifespan forward reference）及protocol stderr保留，stdio初始化/三工具调用断言通过；未抑制警告或修改第三方包。

## coordinator_handoff_verifications（非 impl-safe）

所有外部动作由root/coordinator执行，impl未越界。以下结论只覆盖对应实际时点；研究旧快照不算产品验收。root 的本轮外部总账、最终进程/端口、真实 stdio、Codex 状态及产品 manifest 已由本 owner 完整读取；表中成功是对应能力的外部证据，不能扩大为当前 Codex 已接入。用户正常客户端重载/信任尚未执行到可验收状态。

| 验证项 / 移交原因与承接方式 | 当前已读证据与结果 | evidence_expected | owner | conclusion_if_missing |
|---|---|---|---|---|
| 固定来源/config/版本及实际补绑；依赖真实SSH/mux | work/session-panel-observation-r1.json，09:33:43UTC产品观察，2.719秒，6注册/11进程/3confirmed，同cwd两个UUID；其它冲突/时间异常unknown | 本轮产品source/config/版本、UUID/pane/独立状态、退出码，不存正文 | coordinator | 仅本地身份逻辑，真实补绑未验收 |
| 本机MCP隔离runtime；真实环境准备 | work/session-local-runtime-r1.json，本批新建.venv，mcp1.26.0导入/API及install exit0，解析版本留存 | 专属路径/所有权、固定版本/API/安装退出结果 | coordinator | 本机stdio不可运行 |
| 远端独立reader runtime；真实SSH/安装 | work/session-runtime-setup-r1.json，attempt2 exit0，SDK0.2.163/mcp1.26.0导入、公开signature和解析版本真核验；首次失败保留 | 专属目录归属、两个直接wheelSHA256、安装/导入/公开API | coordinator | sdk_unavailable，消息未验收/整体首批未满足 |
| Linux合成官方SDK对照；外部runtime | work/session-sdk-synthetic-r1-rerun.json，exit0/13checks/0failures；分支/meta/sidechain/坏行/compact、scope/不可读stat不变/真实零可见、六字段与分页对应产品 | 合成文件、SDK/product一致、[]与不可读未确认、字段/版本、所有失败 | coordinator | 本机mock不能证明官方链兼容 |
| 真实选中main/files UUID最近页/下一页；私人历史 | work/session-panel-messages-r1.json，root exit0/0failures，两个已选ID尾页limit2及锚定前页available；strict六字段/session_id一致、revision相同、reader0.2.163 | 明确ID、范围对应、available/reason、计数/revision/version/exit；禁止保存正文 | coordinator | 消息能力未验收 |
| 断连/恢复/30秒陈旧；当前流程状态 | work/session-panel-recovery-r1.json，root exit0/0failures，独立产品Service受控新增SSH失败，立即unknown保留last_success；恢复3槽位；真实等待31秒age33233ms全unknown。不切断服务器或原SSH/Claude；文件只保存expected_injected_ssh_exit=255，不能当实际退出码证据 | 观察失败撤销资格、last_success/上次证据、恢复重验、年龄时点 | coordinator | 持续状态只自证，真实流程未验收 |
| 8766启动/端口占用；服务运行 | work/session-gateway-process-r1-exclusive.json记录本轮最终进程18288、创建时点/绝对命令/F613代码；work/session-gateway-port-r1.json，10:08:22UTC固定8766已占用时第二次启动按预期exit1、0.282秒，原网关health仍正常、root验收exit0/0failures。仅管理核验归属后的本轮进程 | 固定app健康、固定端口、占用拒绝、只管理自己进程 | coordinator | 实际网关未验收 |
| Edge桌面/360px/键盘/按需消息；真实浏览器 | work/session-panel-ui-real-r1.json，root exit0，1280/360px无横向溢出，同cwd main/files按UUID分开；原生键盘选择，默认limit20分别读20条、reader0.2.163；11秒轮询0额外正文读取，0pageerror。截图仅元数据。另work/session-panel-ui-pagination-r1.json exit0为真实Edge DOM+合成45条route：25→5→0(5条)→5页无重叠/遗漏，scope错误保留选择/旧消息并禁分页，HTML惰性文本/不加载附件，360px无溢出；该错误场景是合成fixture，不是更改真实transcript | 两UUID/窄屏/键盘/消息按需/安全渲染，不把私有正文落截图证据 | coordinator | DOM检查不代表真实页面验收 |
| fresh唯一真实focus；会切换当前pane | work/session-panel-focus-r1.json，10:01:48UTC root真实UI动作 exit0/0failures；main→terminal_2、files→terminal_4，分别focused=true/HTTP200/actionexit0，实际唯一client1焦点匹配；最终回到原Files pane | 目标UUID、fresh实例/pane、前后focused pane/退出/clients结果 | coordinator | mock/help不等真实定位成功 |
| HTTP与真实stdio共源；跨层真实网关 | work/session-mcp-protocol-r1-final.json，10:09:24UTC最终gateway真实stdio initialize/list/call恰3readonly tools，root exit0/0failures；same observation_revision；main/files页available、strict六字段、reader0.2.163，与HTTP逐项items/revision相同。仅保存计数/ID/revision/字段，历史protocol-r1.json保留 | 恰三个工具，两个UUID status/messages与HTTP同ID/revision/计数，不存body | coordinator | 协议fixture不代表真实链查询共源 |
| 项目MCP表合并与正常Codex加载；真实配置/用户重载 | work/session-panel-codex-r1.json：实际项目表原不存在，仅新增一个server，global未改；current_runtime_matching_tools=[]、current_codex_chat_loaded=false、project_trust_verified=false。CLI0.118.0因用户既有全局ultra/default配置两次parse exit1，未改global/升级CLI。实际表/TOML/真实stdio已验证；当前chat加载及两个UUID实调用明确未验收 | 原配置/仅本表合并、用户正常重载/信任后实际工具发现与按两个UUID调用 | coordinator / 用户正常客户端动作 | 仅stdio/配置待生效；整体首批未满足 |

## 所有已见失败与修复边界

- core首次批量读plan/review工具输出截断，已分段完整补读；没有据截断内容设计。surface批读也有截断且已补读，首次误读Workbench不存在的control_center.py exit1，rg找到实际apps/control-center/control_center.py后读取。
- surface第一轮15项HTTP/MCP自证exit0；加入focus首跑把mockhelper误名run覆盖TestCase.run，AttributeError/exit1，改测试名run_command。下一次21项仍exit1/1failure，两mock场景未reset计数/after_panes；修fixture隔离后21项和最终46项exit0。没有改产品拒配逻辑或放宽断言。
- 代码整合顺读发现UI首段分页重叠：45条尾页offset25→5→0，起始页仍limit20会重复5–19。已上报root并由surface按实际剩余更早条数请求起始短页；新增45条25..44→5..24→0..4→5..24针对性Node断言。surface在内存恢复旧表达式的红跑exit1（不改磁盘product），验证能抓原缺陷；修改后15项Node及完整46项fresh exit0。core独立复核app.js SHA256 `ACE9FF63F5A2A9CD2772B8AAF3C8B9BD84F6922B9B7DE20719997C3E76B68CAF`，重跑Node15/JSsyntax/compile/46项均exit0。属于S3已要求的分页行为修复，未改计划/范围。
- root环境准备首次误读openai-docs非.system路径exit1，读正确路径恢复；初始端口查询无监听exit1不是网关启动失败。完整记录work/session-implementation-notes-r1.md。
- 远端首次103MB直接下载超过420秒wrapper超时exit1，0wheel/venv尚未创建；仅核对并终止本批孤儿downloader PID/startticks，保留专属目录，未触碰Claude。改本机固定wheel下载+SHA/SCP，再远端hash复验隔离pip，attempt2 exit0。work/session-runtime-first-failure-r1.json与setup-r1.json均保留，不把失败删成一次安装成功。
- root LinuxSDK合成首跑exit1/2failures：fixture误以meta-only child下的selected为主leaf，固定SDK实际选择abandoned；产品透传同SDK。修正合成预期，并额外保留meta descendant行为对照后13项exit0；产品不增加自制链。work/session-sdk-synthetic-r1.json首跑未覆盖，rerun另存。
- MCP pydantic_settings lifespan forward-reference警告原样保留，当前初始化/查询自证通过；不宣称所有未来依赖环境无问题。
- root实际Codex CLI0.118.0配置inspect两次exit1：用户既有global config的model_reasoning_effort=ultra/service_tier=default不被该CLI接受，重试仍失败，完整session-codex-config-list-r1.json及-retry.json保留。未改global信任/模型参数或升级CLI以追求成功；不以真正stdio通过宣称当前Desktop chat加载。
- 报告owner收口读取曾猜错CLI retry后缀-env，文件不存在exit1；随后读取尚未生成的session-panel-codex-r1.json失败但后续config读取使外围exit0，明确不据其成功判断。rg取得实际-retry名称，以ErrorActionPreference=Stop完整重读exit0；读取错误不是产品测试失败，但保留不隐去。
- root后续真实Windows端口占用验收发现stdlib ThreadingHTTPServer默认SO_REUSEADDR可允许同端口重复bind，候选版本不满足S3“占用失败退出”。probe超过5秒、stderr GBK解码亦有失败，surface解除候选freeze，仅按S3最小修补。原失败保留在root工具记录、work/session-implementation-notes-r1.md、surface独占修复日志及外部总账；不能用此前46项/成功health覆盖此真实缺陷。
- surface核对Microsoft socket选项和Python socketserver官方定义后最小补修PanelServer：仅Windows在bind前设置SO_EXCLUSIVEADDRUSE并关闭SO_REUSEADDR，Unix保持super原行为。自身临时listener新增拒第二gateway/复用socket回归，旧版红exit1，修后绿0，full47/compile0，完整work/impl-safe-surface-exclusive-r1.txt；core完整读代码、复核gateway SHA，fresh47tests/Node15/JSsyntax/compile均exit0。root最终实际8766占用探针的子启动按预期exit1，验收脚本exit0/0failures且原health正常，见port-r1.json；该预期子退出与原缺陷失败分开记账。
- root刷新自身网关首个身份守卫因PowerShell DateTime经JSON再解析丢timezone exit1，未执行mutation；依赖该未产生的final记录读取又exit1。改raw UTC解析并核对本轮wrapper/child PID、argv/exe/创建时点后才停止旧自身进程并启动新版；work/session-gateway-process-r1-final.json保留两次失败与原进程证据，不触碰其它终端/Claude。独占补修后的最终归属另存process-r1-exclusive.json，后续health和真实stdio同版本验证均保留。
- root提前猜测surface独占最终日志名读取时文件尚未存在，读取exit1；rg/作者给出实际work/impl-safe-surface-exclusive-r1.txt后完整读取恢复，外部总账failure ledger保留。open_in_codex结果为queued，仅代表排队，不当作已打开页面证据。
- 最终外部总账work/session-panel-external-r1.json完整记录所有本轮失败、修复、引用、隐私边界和剩余client项；其failures_in_current_final_assertions为0表示总账断言满足，不表示客户端或整体首批PASS。前轮研究/方案/评审的失败仍留在原文；本轮没有Git提交/推送。

## contract_drift_reports

Q5改变实施授权/阶段，固定已审lwplan未改；计划中的Q4和“未实施”是审查时点文字，不据它们否认新授权，也不改写历史评审。clarifications第9节研究阶段同属旧状态，root当前阶段记录承接，不由impl私改目标基线。

已知共享development-workflow里程碑索引与coordinator停机条款不一致，已在规划/评审上报root，继续采用coordinator的明确手动停机边界；未修改共享skill或审计全局镜像。UI分页和Windows独占监听均为S3已有要求的有界修复；没有路线、控制、reader接口、预算或目标漂移，没有新用户范围问题触发DELEGATE_QUESTION。

## 未完成、风险、审查重点与回滚

整体首批可用要求实际区分、消息进展、精确定位和Codex查询同时具备证据；任何缺项不能以列表或Review(Impl)结果替代。本批实施与外部证据已收口为可审查产物，实际身份/消息/页面/focus/stdio共源和最终端口占用拒绝均有对应时点证据。**整体首批未满足**：当前Codex聊天未加载工具、项目显式信任未验证；用户正常重载/信任后，须在该客户端实际发现恰三个工具，并按两个已选UUID调用查询，再由coordinator记录结果。不能用配置存在、CLI错误、协议握手或本地测试代替。

Review(Impl)由coordinator另行派发，本报告不自评PASS。产品源码冻结；审查修复若涉及代码，需形成明确新证据，不能复用本轮候选输出声称最终正确。报告只引用过滤后的计数/版本/ID/状态/revision和错误摘要，不保存私有消息正文或CSRF。

审查重点：身份early-exit与历史/进程/定位独立性；source+boot/PID/startticks、前后实例/唯一slot；最早单调采集时钟；SDK范围前置/[]拒绝/六字段/一次重试/预算；HTTP与MCP共源和只读；focus提交前/事后证据；各项未验收和所有失败不被PASS覆盖。内部registry版本边界、空历史保守未验证、长路径非ASCII不可读取、双侧focus非原子、客户端正常重载仍是明确限制。

回滚信息：本批新增源码/web/tests/requirements/README/example **可直接回滚**，先停止本批网关；专属local.venv、remote reader.venv及实际MCP表 **需人工介入**由root核对归属/绝对路径后仅撤本批范围，并由用户正常客户端重载。已经focus仅切换pane，用户可自行切回；不删除整个工作区、远端.claude、项目或Workbench，保留研究/方案/评审/本报告与work证据。

英文提交消息建议：`feat: add read-only remote Claude session binding gateway`。
跨功能事实：无新增；内部registry/mux版本限制是既有研究事实，不重复入库。
