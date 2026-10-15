# 方案评审记录：lwplan（第 2 轮）

**评审对象**：[lwplan.md](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/lwplan.md)，345 行，SHA256 `38E3F991AA0BBF3434F2A9B7A2562EA0DBFE7520095C894003B4934018AB3074`。
**评审时间**：2026-10-03
**review_target**：lwplan
**评审结论**：PASS
**前一轮评审**：[review_notes_lwplan_1.md](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/review_notes_lwplan_1.md)，REVISE / Gate-2 FAIL；该历史结论保留。

本轮是未实施方案的普通 LW REVISE。R1/R2 已在计划、跨层契约及验证任务中闭合，Gate-2=PASS 只表示这版计划具备实施前呈递条件；当前没有产品代码、SDK 安装、真实消息读取、页面/MCP 接入或真实 focus 验收。Q4=A 没有授权实施或开启 auto_mode；返回后必须 **STOP_BEFORE_IMPL -> ManualMode**，由 coordinator 呈递具体实施范围与环境动作并等待用户确认。

## 输入与独立证据

reviewer 未参与作者修订。在 FINAL_ARTIFACT_READY 前只读稳定输入；READY 后完整独立读取唯一当前 lwplan 第 1–345 行及实际 UTF-8 补丁，不以作者 Gate-1、root 摘要或首轮 PASS 子项替代判断。现状根目录仅有 docs/work；未创建平行计划或产品代码。

完整读取 plan-review、implementation-planning、coordinator、development-workflow、verification-before-completion；Required Set 与 P2/P4/P5/P6/P8/P9 使用 implementation-planning canonical，停机采用 coordinator 核心条款。稳定输入为完整基线 1–10、Q1–Q4、README、首轮 LW/readiness 报告、三份 session research 和原计划证据快照。work 中现有 JSON 仅定向读身份/时点/探针退出/失败/safety 元数据，没有读取私人消息。

| 输入 | 本轮读取版本 SHA256 |
|---|---|
| lwplan.md | `38E3F991AA0BBF3434F2A9B7A2562EA0DBFE7520095C894003B4934018AB3074` |
| clarifications.md | `A96FA1290DC106B3E82CE99FAAD811FD5CFB24DB558B2C79D01A8987DF591584` |
| README.md（第二轮 Review(LW) 状态） | `87244007EA3995384EB275F922F8D1A3D1346AF5852068FF6862316E8D721494` |
| review_notes_lwplan_1.md | `0DA2F9C85882AEB05FF0581F45DDB3E0C994C07D4F7718742A4183294CDAD2DD` |
| review_notes_readiness_1.md | `B2B09CE112FFB8F8E1DE0D614C50F73C56071218104137E354B59D368B3EE47A` |
| research_session_binding.md | `13BA22F8E07ED07DD25C18C894B1F0FDD382805B95795E5BA5955524122C240E` |
| research_session_interfaces.md | `13609324326548DC89F20323F8BB24B59714600A486438050D6614EEFB9C9787` |
| research_session_dependency_versions.md | `E09A9A214AC8978BD19583322C2DF76AB1FE89A3D384BE7F7E6A8186FB211877` |
| work/lwplan-before-revision-r2.txt（原计划证据快照） | `BAD9DAA1CA5BB25F8B92DEF73C11064B2E156592862C6DB66040F189BA68D4DD` |
| work/lwplan-revision-r2.patch（实际完整补丁） | `9C01153A1C46CD50DBFE124ED3BF474ABB58B5D106789316C1A45E4E841156CE` |

reviewer 本轮定向重新核对固定官方提交 `68db221ebe29c1d82b0001ae80fa71e10d57d80a` 的 raw 源码，PowerShell 读取命令 exit0：sessions.py raw 第 122–183、836–894、1039–1110 行和 types.py 第 1779–1809 行。网页抽取会压缩空行，报告使用 raw 文件行号。[固定官方 reader](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/_internal/sessions.py)、[固定官方类型](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/types.py)

## 可行性分析

- 原生 registry+/proc 和当前 Zellij 清单承担身份/实例/位置；官方 reader 承担选中 UUID 历史；HTTP 与 stdio 共用单一 Service。选择有实际研究与固定官方源码支撑，没有 Hooks、resume 或自制消息链前置。
- 远端标准 Python 缺 SDK/mcp，隔离 runtime、来源/config/版本、合成 SDK 对照、真实选中分页仍是 coordinator 外部前置。计划给出失败和部分成果口径，不把发布包存在当安装成功。
- S1→S2→S3→S4、接口矩阵、串行与大小/时间/响应预算、版本拒配、停止网关及新增文件撤销明确。未提供工期承诺，不凭空追加时间判断。

## 首轮缺陷闭合与剩余风险

| 首轮问题 | 本轮实际修订与独立判断 | 结论 |
|---|---|---|
| R1：SDK [] 不能证明读取成功；被 stat 的候选与 SDK 查找范围未对应 | 第 54、88、134–161、163、167 行：先 realpath+NFC；仅 ASCII、长度≤200 的 canonical 目录，按固定 sanitize 规则要求直接项目目录与候选 parent 对应；固定 projects 根同 UUID 元数据前后唯一。范围不能证明时为 available=false/reader_scope_unverified；私有方法、prefix/hash 猜配、全库 reader 回退及第二个正文 parser 被禁止。[] 一律 available=false/reader_empty_unverified，total_visible/next_offset=null；显式异常 reader_failed。第 188/217 行传播到 UI/MCP。非空可见序列上的空分页被明确区分。 | 闭合；这些范围规则与官方 exact-directory 优先、短路径无 prefix 回退的实现相符。候选 stat 不再被用来覆盖 [] 失败。 |
| R2：不存在顶层 timestamp | 第 55、83、136、155–161、163、188、217 行：只序列化 type/uuid/session_id/message/parent_tool_use_id/parent_agent_id，message 块原样；两个 parent 字段为 null；省略单条时间，read_at 只标本页读取时间。HTTP/UI/MCP 使用严格六属性 fixture。 | 闭合；实际 dataclass 与转换函数支持这六字段，没有凭空补时间或引入 raw 正文解析。 |

补丁只调整上述 reader/消息传播、事实映射、风险与 Gate/失败留痕；S1 身份链、S3 focus、S4 工具白名单、既有反目标和撤销边界均保留。317→345 行不是整文重写；没有已实施支撑文本，因此不套用 PLAN_DEFECT 修订标签/回收任务要求。

剩余限制是确定且保守的：有效零可见历史也显示未验证；长路径/非 ASCII 或无法证明目录对应时消息不可用。它们不改变首批已知短 ASCII 来源及按 ID 目标，也不被当作成功。内部 registry 生命周期、后台冲突原因、真实 config、持续状态、SDK 运行/兼容和终端动作仍须外部证据。无新增用户未答决策，无需 DELEGATE_QUESTION；本轮资料足以收敛，无需 DELEGATE_ACTION。

## Gate-2

### Required Set 复核结果：PASS

主要工作包按 canonical 识别为 S1–S4；T3 继承 T1 全集及 T2/T3 增量。以下为独立存在性及内容核对，作者自检不是证据替代。

| Required Set | 结果 | 当前 lwplan 可核查依据 |
|---|---|---|
| T1-1 目标锁/反目标/不影响项 | PASS | 第 13–23 行限定来源、UUID、同源索引、只读及现用层边界 |
| T1-2 文件/首个复核位置 | PASS | 第 96/129/173/213 行逐包文件、函数、首看与目标形态 |
| T1-3 目标/步骤/验收/回滚/依赖/形态 | PASS | S1 第 94–121、S2 第 125–167、S3 第 171–207、S4 第 211–248；S2 成功/范围/[]/异常/分页定义明确 |
| T1-4 每包消费 G/N | PASS | 第 94/125/171/211 行；消息包不承担定位，G3 由 S1/S3/S4 保持 |
| T1-5 验证分层与证据三元组 | PASS | 第 121/167/207/248 行分别给 impl-safe、coordinator、证据产物及缺证据约束；第 254–258 行汇总 |
| T1-6 作者体验/声明可读性 | PASS | 第 119/165/205/246 行；固定 source、一个 Service、reader 单入口、薄协议、中文错误与顺读说明 |
| T1-7 主链总览 | PASS | 第 25–42 行先给现状→改动→不改层/原因，再展开工作包 |
| T1-8 research 事实映射 | PASS | 第 46–61 行覆盖身份、内部格式、实例、冲突、CLI 覆盖、SDK、R1/R2、终端和缺源；逐项实现/验证/主体/口径 |
| T1-9 跨层片段闭环 | PASS | 第 67–69 行及 S1/S2/S3/S4 骨架；S2 范围→公开 reader→[]/异常→复核→六字段页已闭合 |
| T1-10 Gate-1 明确自检项 | PASS | 第 298–318 行包含目标/责任/证据/体验/主链；“待独立复审”保留真实阶段 |
| T1-11 双阶段与失败回退 | PASS | 第 298/329/331 行，作者 Gate-1、review_plan 主检/coordinator 复核，缺项回环与停机 |
| T1-12 澄清/批量模板 | PASS | 第 283–294 行：未触发原因、P0/P1/P2、模板、新事实/路线变更承接 |
| T1-13 风险/降级/Gate-2 复核 | PASS | 第 262–281/331 行及第 258–260 行降级撤销；R1/R2 明确收口 |
| T2 输入输出/边界/关键函数/分层测试/回归 | PASS | §3、各包接口与 fixture/命令；第 163/167/188/217 行覆盖修订分支，回归限新模块 |
| T3 接口矩阵/兼容/迁移/停机 | PASS | 第 175–182/252–260 行；固定版本拒配，新产品无旧数据迁移，停止网关，独立 runtime/项目 MCP 撤销责任 |

### 目标锁 / 反目标复核结果：PASS

| 目标锁 | 实际下沉位置 | 判断 |
|---|---|---|
| G1 真实 ID 区分同 cwd、三类证据分离 | S1+S2；第 48/78–81/100–117/133–137 行 | source+UUID 主键；历史不继承旧实例/pane，无 cwd/mtime 唯一身份捷径 |
| G2 页面与 Codex 同源、按 ID 状态/消息、时间/unknown | S1→S2→S3→S4；第 83/88/180/188/217 行 | scope/[]/六字段从 reader 到 UI/MCP 完整传播，缺证据不宣称可用 |
| G3 保留现用会话、补绑、fresh 唯一精确定位 | S1/S3/S4；第 100–121/193–207/244 行 | 观察补绑与现存 mux focus，不 restart/resume/input；真实动作独立验收 |

| 禁止内容 | 可核查依据 | 结论（确认 lwplan 未踩中） |
|---|---|---|
| 3D/Jev/C4D/全资源监控/多 Agent/多主机 | 第 17/19/21/94/125/211 行；工作包只围绕会话链 | 未纳入实施 |
| 消息发送、输入注入、审批代答、resume/重启/终止 Claude | 第 17/23/133/135/181/201/215 行 | 三个 MCP 查询无 focus/发送；页面仅选现存 pane |
| 目录/title/mtime/静态布局/研究快照冒充实时成功 | 第 27/65/79–82/86/101–117/258 行 | 主键与实例分离，快照边界和 unknown 明确 |
| 默认全体私人正文采集、模型外发、第二套正文 parser | 第 17/37/86/133–137/163/167/186/215 行 | 明确 ID 按需；只枚举选中 UUID 文件元数据；不自制消息链 |
| 修改 Workbench/Nova/CLI/PATH/Claude 设置/Hooks | 第 19/42/127/201/260 行 | 现用层不改；隔离环境由外部承接 |
| 提前安装、MCP 启用或真实定位 | 第 3/5/127/207/232/248/331 行及 Q4 | 本轮仅计划/复审，PASS 后停在 STOP_BEFORE_IMPL |

### 关键实现锚点复核结果：PASS

| 主要包 | reviewer 首看与目标形态 | 结果 |
|---|---|---|
| S1 | source.py；remote_probe.observe_source/read_registration；service.merge_observation/refresh_observation；terminal.list_panes/parse_slot_command（第 96 行） | PASS：可注入读取、候选保留、实例/身份/slot 判定；helper 只作研究对照 |
| S2 | requirements-reader；remote_probe.read_messages/reader_capability；service.get_session_messages；tests.test_messages（第 129/134/161 行） | PASS：范围前置、公开 reader、失败收口、六字段分页；scope guard 是本产品元数据检查，无 SDK 私有接口 |
| S3 | gateway.PanelHandler/serve、Service 查询、terminal.focus_session、web 三函数（第 173 行） | PASS：HTTP 单 Service，列表/选中详情，fresh focus 与事后证据 |
| S4 | mcp_stdio.build_mcp/call_gateway、requirements、根 README、TOML example（第 213 行） | PASS：白名单三查询、薄转发、运行与环境交接，不建立第二索引 |

无整条函数链或显著专用逻辑删除，不触发大规模删除附加名单。撤销仅针对本批新增产物，真实配置与 runtime 由外部责任人核对归属。

### 代码片段充分性复核结果：PASS

状态判定、跨层共享字段、reader 和 focus 顺序触发必需片段。第 105–115 行的候选/early-exit，139–161 行的范围/reader/[]/复核/六字段，190–201 行的 fresh focus，219–228 行的 stdio 转发分别明确来源、用途和目标结构。§3 与 S3/S4 紧接契约的目标文字足以核对消息消费形态；不需要把 UI/HTTP 最终实现全文写进方案。片段集合覆盖主链最小闭环，R1 的成功分支不再由 reviewer 补脑。

### 作者体验门复核结果：PASS

固定来源、单 Service、公开 reader 单入口和薄 HTTP/stdio 保持直接。新增范围检查只有确定元数据规则和明确 unavailable 原因，没有抽象为插件/配置框架或第二消息解析器。实际六字段、保留 message 块、省略不可得时间，使实现作者不必猜字段或跨层补适配。各包第 119/165/205/246 行给具体约束；TOML/根 README 运行顺序、UI UUID 可复制、错误保留选择及窄屏/键盘行为可预见。没有显著可读性回退。

### 人工 review 对齐复核结果：PASS

| 子项 | 结果 | 独立依据 |
|---|---|---|
| 核心链路顺读复核 | PASS | 第 25–69 行可顺读现状→单 Service/观察/reader/HTTP/MCP/focus→明确不改层→实现/验证，再沿 S1–S4 阅读 |
| research 事实映射复核 | PASS | 第 46–61 行给关键事实→实现锚点→测试/外部主体/口径；R1/R2 现已进入第 134–167/188/217 行 |
| 跨包脑补需求复核 | PASS | 共享消息页/错误由第 83/88 行定义，S2 给生成分支，S3/S4 明确相同消费及 fixture；无需自行决定 []/timestamp 或重组另一套链 |

总括项 PASS 由三个子项均 PASS 得出，不以主链总览存在替代事实或契约审查。

### P1-P9 协议合规核验表：PASS

| 协议项 | 结果 | 可核查依据 |
|---|---|---|
| P1 | PASS | 第 298/322 行禁止任务数质量门槛，S1–S4 数量不是放行依据 |
| P2 | PASS | 第 298–318/323/331 行 Required Set 缺一不放行 |
| P3 | PASS | 第 298/322 行纯存在性门禁，无分数/多数票代替 |
| P4 | PASS | 第 3/298/302–316/324 行 T3 继承 T1/T2 增量 |
| P5 | PASS | 第 283/294/331 行范围/验收/回滚不唯一强触发 DELEGATE_QUESTION；确定 R1/R2 直接修订 |
| P6 | PASS | 第 275–281/326 行事件留痕位置，新事实/新风险/阶段切换及本轮修订，不设次数 |
| P7 | PASS | 第 283/327 行真实不确定性驱动，不设问题数量上下限 |
| P8 | PASS | 第 283–291/328 行未触发原因及 P0→P1→P2 批量模板 |
| P9 | PASS | 第 298/329/331 行产出后作者 Gate-1、放行前 review_plan Gate-2/coordinator 复核与失败回环 |

第 294 行明确不递归委派；计划没有要求阶段 agent 再创建下级 subagent/task。coordinator 外部承接与正常阶段编排不等于 reviewer 递归委派。

### 基线与澄清一致性复核结果：PASS

- “未回答”为空：当前 clarifications 明确本首批无待答用户决策；后续 C4D/Jev/Desktop 属其它批次。
- Q1 的 Jev 身份未定、Q2 的开发效率优先、Q3 的既有 SSH 对话绑定→G1/G2/G3、Q4 原话“a”→仅修订复审，均保持。README 原始开发效率诉求经这些决策收敛到会话链，没有新增控制或全局面板范围。
- 目标锁/反目标遵守依据见以上两表；风险与验证责任沿完整基线第 3/4/8/9/10 节，没有把外部真实环境分给 impl，也没有把研究快照升格验收。
- 新的 scope/[]/六字段限制是已有 R1/R2 技术细节收敛，无需重算目标基线。未发现 PROBLEM_DEFECT。

### 设计味道扫描结果：PASS

首轮“官方 reader 可直接提供所有字段及成功证据”的乐观适配已被具体范围前置、保守空结果与真实六字段替代。未发现双索引、泛化主机/插件系统、自制父链、任务状态猜测、正文日志或为 timestamp 另造 parser。保守不可用限制明确，未以抽象减少字符换取作者负担。

### Gate-2 结论

**Gate-2**：PASS

十字段均显式输出；Required Set、目标/反目标、关键锚点、片段、作者体验、人工 review 三子项、P1–P9、基线一致性和设计扫描均满足本轮计划放行标准。没有未回答决策、阻断缺项或需追求 PASS 而隐去的外部未知。此结论只覆盖所列当前 hash 计划；任何后续实质修改都使该版本结论失效，需要重新验证/独立 review。

## 验证责任与外部未验收条件

| 能力 | impl-safe 自证及产物 | coordinator 外部承接及产物 | 当前结论边界 |
|---|---|---|---|
| 身份/补绑/持续状态 | 合成 registry/proc/pane、冲突/PID变化/断连，impl-safe-r1.txt + impl_report_r1.md | 来源/config/版本、真实同 cwd 两 ID、断连恢复/陈旧，session-panel-external-r1.json | 仅有三槽位研究快照，未验收产品观察/补绑 |
| 官方消息读取 | scope/[]/异常/六字段/分页/预算 fixture+mock；报告明确 stub/skip | 独立 SDK runtime、合成正确/错误目录/不可读/零可见链、选中真实 ID 分页；仅过滤计数/版本/revision/退出码 | SDK 未安装/导入；范围、真实读取与链兼容未验收；16MiB stat 前置不证明消息可用 |
| HTTP/UI/focus | fake Service、临时 loopback、CSRF/Origin、argv/UI 合成检查；ui-check-r1.json | 8766/Edge/360px+桌面、fresh 唯一定位、前后 focused pane/exit；session-panel-external-r1.json | 产品页面与真实 focus 未验收；help/mock 不能标定位成功 |
| MCP/Codex 共源 | MCP initialize/tools/list/call、TOML、fake HTTP 一致 | 项目配置、用户正常重载、实际工具发现/按 ID 调用；session-panel-codex-r1.json | 未启用 MCP/加载当前聊天；配置或协议自证不能标 Codex 接入成功 |

第 258 行要求整体可用同时有真实区分、进展读取、精确定位和 Codex 查询证据；任一缺证据只报告对应阶段及部分成果。外部验证失败不能由当前 Gate-2 PASS 覆盖。

## contract drift / stale / mirror mismatch

- 当前目标/授权基线与修订计划无漂移。readiness 的 SDK 发布未核验是历史时点；依赖补证只关闭发布/API 存在性，未关闭运行兼容；第 63/127/167 行保持该区别。
- 已知共享索引陈旧点仍有效：development-workflow 里程碑映射写 Review(LW) PASS 后进入 Impl，而 coordinator 核心停机条款要求 STOP_BEFORE_IMPL -> ManualMode。计划第 5/294/331 行显式采用后者；上报 coordinator，状态落账不可照旧索引自动实施。reviewer 不修改共享技能。
- 本轮实际读取 canonical Required Set/P1–P9 与 review-local 没有实质冲突；未审计全部平台镜像，不能宣称全局 mirror 一致。

## 已见失败与证据限制

- 本 reviewer 首次批量读取四份技能，外围工具输出被截断；随后逐份完整重读。正式 plan/patch 分段与 UTF-8 读取没有截断。初次快照过滤选了不存在的通用字段，结果为 null；随后读实际键确认 observed_at/scope/bindings/remote_registration_count，不把 null 当失败消失或新验收。
- 本 reviewer 报告交付 fresh 核验首跑 exit1、failures=1：报告已解释范围前置，但漏写 reader_scope_unverified 完整 reason 字面量，检查报 Missing review anchor；当前 lwplan 第 88/134/161/188/217 行原已存在该契约。只补本报告 R1 行和本失败记录，再重跑全文/字段/输入版本核验；这是报告锚点遗漏，不是产品或当前计划运行失败。
- 作者当前方案第 337/341 行保留 Gate-1 首跑 90 项 exit1/1 失败（撤销措辞）及本轮 34 项 exit1/1 失败（S4 reason 全名锚点）；修正重跑不代替本审查。root 本轮首次 diff stdout 乱码/截断后以 UTF-8 完整恢复；本 reviewer 独立读完整实际补丁，不使用失败输出作判断。
- 第一轮报告所见失败全部继续有效：非 Git git status 的真实 exit128 曾被外围后续语句掩盖；root 祖先 PermissionError；agents JSON 漏 Files、后台 UUID/时间冲突；get-pane/focus-pane 和 list-clients --json exit2；GitHub 限流/tree Internal Error、HTML 超限、正则过长、PowerShell 语法 exit1；根 README 不存在读取、错误 JSON 字段及 apply_patch 失配；技能/vendor 输出截断、不存在路径/空 rg 与 graph 工具不可用；8765 拒绝连接、默认 Playwright 浏览器缺失 exit1、Maxon 抓取超时。具体恢复与准确退出记录在首轮报告和各研究文档；它们没有被重述为当前产品全部成功。
- snapshot 的 observed_at 为 2026-10-03T16:04:37.054806+08:00（08:04:37 UTC），三槽位 UUID/PID/pane 及注册数 7 仅是 observed_snapshot。四个已存远端主探针 exit0、transcript 大小前置均不是本轮产品测试。本 reviewer 没有再执行 SSH、安装、配置、focus、输入、resume 或读取正文。

## 修订建议与后续行动

无放行前必修项。coordinator 先独立读取本报告并做当前输入/报告版本核验，保持 STOP_BEFORE_IMPL；向用户呈递本地新增文件、远端专属 reader venv、项目 MCP 表及真实 focus 的具体范围与验证边界，获得实施授权后才进入正式 Impl。产品实施之后仍需独立外部验证与 fresh Review(Impl)，不可将当前 PASS 改写成产品验收成功。

本报告交付核验：本轮 fresh 命令读取实际报告全文，核对十字段/P1–P9/主要包/R1/R2/失败与外部边界及当前输入 hash；输出与退出码交回 coordinator。命令只证明报告与所审版本一致，技术判断仍依据完整文本和固定官方证据，不证明产品运行。

英文提交消息建议（仅供将来已验证且进入 Git 项目时）：`docs: review revised remote Claude session binding plan`。本轮不 commit/push。

跨功能事实：无新增；已知 registry/mux 版本边界与共享陈旧索引不重复入库。
