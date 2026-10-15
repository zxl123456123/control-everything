# 方案评审记录：lwplan（第 1 轮）

**评审对象**：[lwplan.md](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/lwplan.md)，317 行，SHA256 `BAD9DAA1CA5BB25F8B92DEF73C11064B2E156592862C6DB66040F189BA68D4DD`。
**评审时间**：2026-10-03
**review_target**：lwplan
**评审结论**：REVISE（需修订）

本轮方案的范围、同源查询与验证责任分层成立，但 S2 对固定 SDK 的消息字段和空结果语义尚未收敛到可直接实施的契约。当前 **Gate-2=FAIL**；这是规划细节缺陷，不是问题方向错误。未使用 Review(Impl) 双结论模型，未批准安装、部署、MCP 启用或真实定位。

## 输入与独立证据

本 reviewer 实际读取了下列文件，不以作者的 90 项结构自检或 coordinator 摘要代替审查：

- [README.md](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/README.md)、[clarifications.md](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/clarifications.md) 全文；完整实现基线 1–10 为唯一权威输入。
- [续传原文](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/source_materials/resume_context_session_binding_20261003.md)、[readiness 第 1 轮](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/review_notes_readiness_1.md) 全文。
- [身份研究](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/research_session_binding.md)、[接口研究](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/research_session_interfaces.md)、[依赖补证](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/research_session_dependency_versions.md) 全文。
- [研究 helper](E:/project-funny/mianban-develop/work/verify-session-binding.py)、[新快照](E:/project-funny/mianban-develop/work/session-binding-verification.json)、[验证记录](E:/project-funny/mianban-develop/work/session-verification-notes.txt) 全文；[原始远端证据](E:/project-funny/mianban-develop/work/live-remote-session-evidence.json) 定向读取 probe ID/exit、注册与进程元数据、允许环境、失败、unknown 和 safety 字段，没有读取私人消息。
- Workbench 的实际启动器、Ensure-WorkbenchTabs.ps1、历史/当前 Linux 布局、remote/pane.sh 和 rc.sh。启动器确会激活窗口或创建 tab；本方案第 181 行明确不调用这些入口，符合既有任务兼容边界。
- 完整读取 plan-review、implementation-planning、development-workflow、coordinator；Required Set 与 P2/P4/P5/P6/P8/P9 按 implementation-planning canonical 核对。额外用 OpenAI Docs 核对 MCP 配置，用 verification-before-completion 约束本报告交付。

独立读取的 `2026-10-03T08:04:37.054806+00:00` 快照仍为 main/dev/files → terminal_2/3/4，各 UUID/PID/cwd/transcript_count 相符，注册数 7。它支持本批规划可行性，不能证明持续索引、消息、MCP 或 focus 产品能力。helper 仅记录一次 startticks，没有实施源版本、前后实例、transcript 顶层元数据或产品持续状态检查；本方案第 48、61、117 行正确保留此边界。

coordinator 新补证已在验证记录第 12 项实际读取：三个明确 UUID 各唯一文件，大小分别 10,116,639 / 4,647,174 / 6,204,693 bytes，均低于 16 MiB。该证据只支持大小前置，不证明 SDK 导入、可见链或分页。

reviewer 另外通过官方网页及 PowerShell `Invoke-WebRequest` 定向读取固定提交 `68db221ebe29c1d82b0001ae80fa71e10d57d80a` 的 sessions.py/types.py，后者命令 exit0。以下源码行号以直接 raw 读取为准，网页文本抽取压缩空行后的行号不用于文件定位。

## 可行性分析

- 技术路径总体可实现：原生 registry 与 /proc 支撑限定版本观察；官方 reader 支撑只读历史；本地 stdio 转发共用网关，避免两套索引。选择与已有证据相符，没有将 Hooks、resume 或外部模型当作前置。
- 资源条件明确：现存 SSH/Python/Zellij 与三槽位证据存在；远端标准 Python 的 SDK/mcp 缺失被写成独立 runtime 前置。发布包与 API 存在仅证明候选依赖可评估，安装和真实兼容仍归 coordinator。
- 执行顺序 S1→S2→S3→S4、串行预算、端口失败退出、停止网关降级与新增文件撤销范围清楚。未给未经证实的工期，故不另造时间承诺。
- 需要修正 S2 后才能认定技术完整：不能同时承诺“直接 SDK 输出”和 SDK 没有的字段，也不能遗漏 SDK 隐藏错误后的空列表收口。

## 风险点与具体缺陷

### R1（P1）：官方 reader 的空列表不足以证明读取成功

**原文与证据**：方案第 84 行要求“API 禁止将任意错误转成空消息‘读取成功’”，第 129–142 行却是先定位/stat 一个文件，再按 `directory=cwd` 调公开 reader，随后复查原文件 stat 并直接分页。固定 SDK 的 `_try_read_session_file`（raw 第 836–841 行）吞掉 OSError；`_read_session_file`（第 844–894 行）独立按 canonical directory 和 worktree 回退找文件；`get_session_messages`（第 1059–1110 行）在未找到/未读到内容时返回 `[]`，与零可见消息共用结果。[固定官方 reader](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/_internal/sessions.py)

**影响**：已验证 `path` 的 stat 不等于证明 SDK 实际查找并读到了该文件。目录解析不一致、SDK 内部读失败等情况下，原文件仍可保持同一 stat，现有骨架可落到 `available=true / total_visible=0`。这违反本方案自己的错误契约，也使 G2 的按 ID 读取结果失真。第 145、149 行的坏行/变化/SDK 对照测试没有明确覆盖这种“SDK 返回 []、前后 stat 未变”的情形。

**恢复动作**：在 S2 明确公开 reader 解析范围与已验证唯一候选的对应规则；无法证明对应时返回明确 unavailable，不能靠目录 latest 或自制消息链兜底。给空列表单独定义保守结果：至少不得仅凭 `[]` 标“读取成功”；若首期不区分有效空历史，可统一返回 `reader_empty_unverified` 并说明该限制。把这一分支加入骨架和 fixture，覆盖目录解析不匹配、读失败但 stat 不变、无可见消息的结果；外部 SDK 对照使用合成文件，不为补证读取更多私人历史。

这是当前计划可以补齐的确定技术边界，无需新增用户范围决定。不能把它全部留到“真实 transcript 兼容未验证”一项后再由 impl 自行选择成功语义。

### R2（P2）：固定 SDK 不提供方案承诺的消息顶层 timestamp

**原文与证据**：方案第 131 行要求保留“message UUID/type/timestamp/content 块及 SDK 定义的字段”，同时第 125、147 行要求直接 SDK 输出、保持官方结构。固定 `SessionMessage`（types.py raw 第 1779–1809 行）和 `_to_session_message`（sessions.py 第 1039–1056 行）没有顶层 `timestamp`；其正文位于 `message`。读取时间 `read_at` 是网关证据时间，不能补作单条消息时间。[固定官方类型](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/types.py)

**影响**：impl 要么访问不存在的属性，要么自行读取 raw transcript 补时间，要么静默丢字段；三种结果都不能直接满足当前计划的确定输出。共享消息契约、页面与 MCP 验证还会失去一致的目标形态。

**恢复动作**：删除对 SDK 顶层 timestamp 的保证，明确实际透传字段 `type/uuid/session_id/message/parent_tool_use_id/parent_agent_id`；需要 UI 字段时给出最小序列化形态。单条消息时间缺失应显式省略或 null，`read_at` 只标读取时间；不为了补 timestamp 引入第二个正文解析器。用与该 dataclass 字段一致的 mock 和固定 SDK 合成 fixture 核验 UI/HTTP/MCP 字段，不用带有虚构 timestamp 的 fixture 掩盖缺口。

## 遗漏或需补充

R1、R2 是放行前必修项。其它未执行的外部条件已经有责任人、证据落点与失败口径，保留为实施后的验收前置，不能为了当前 Gate-2 提前安装或执行 focus。无新增用户未答决策，不输出 `DELEGATE_QUESTION`；现有文件与官方源码足以作本轮结论，无需 `DELEGATE_ACTION`。

## Gate-2

### Required Set 复核结果：FAIL

主要工作包按 canonical 识别为显式 S1–S4；任务分型 T3，须包含 T1 全集及 T2/T3 增量。下表是 reviewer 的独立判断，不复述作者“齐备”作为证明。

| Required Set | 结果 | 独立落点与判断 |
|---|---|---|
| T1-1 目标锁/反目标/不影响项 | PASS | 第 11–19 行，具体到固定来源、独立 UUID、同网关、只读/定位边界 |
| T1-2 文件与首个复核位置 | PASS | 各包第 92/125/155/193 行定位文件、函数和首看位置 |
| T1-3 每包目标/步骤/验收/回滚/依赖/形态 | FAIL | S1/S3/S4 可直接对应；S2 的目标输出含不存在字段，SDK [] 分支没有收口（R1/R2） |
| T1-4 每包消费目标/反目标 | PASS | 第 90/121/153/191 行逐包列 G/N，并解释未消费 G3 的消息包边界 |
| T1-5 分层验证与证据三元组 | PASS | 第 117/149/187/226 行及第 232–236 行；非 impl-safe 未下沉给 impl |
| T1-6 作者体验/声明可读性 | PASS | 第 115/147/185/224 行有具体单入口、薄转发、中文原因、顺读运行说明 |
| T1-7 主链总览 | PASS | 第 23–40 行先给现状、改动与不改层，再展开包 |
| T1-8 research 事实映射 | FAIL | 第 44–57 行覆盖已有研究，但 SDK 的实际错误/结果模型未映射到实现和测试口径；R1/R2 为本轮补证发现 |
| T1-9 跨层片段闭环 | FAIL | 各包骨架存在，S2 缺失必须区分的空结果收口；读到分页闭环仍需 reviewer/impl 补脑 |
| T1-10 Gate-1 明确自检项 | PASS | 第 274–294 行明确目标、责任、证据、体验、主链自检；自检结论不能覆盖以上 FAIL |
| T1-11 双阶段与失败回退 | PASS | 第 307 行明确作者 Gate-1、review_plan 主检/coordinator 复核、修订回环与停机 |
| T1-12 澄清触发与批量模板 | PASS | 第 259–270 行未触发原因、P0/P1/P2、模板和基线重算路径存在 |
| T1-13 风险/降级/Gate-2 复核 | PASS | 第 240–250/307 行有明确失败与重研/停机；需按 R1/R2 补 reader 分支 |
| T2 输入输出/边界/函数/分层测试 | FAIL | S2 输出与真实 SDK 不符，空结果验收不确定；其它包的接口/边界/回归范围明确 |
| T3 接口矩阵/兼容/迁移/停机增量 | PASS | 第 71–84/157–164/230–238 行；无旧产品迁移、版本拒配、停止网关；继承项 FAIL 故整体不放行 |

### 目标锁 / 反目标复核结果：PASS

本项判断范围和硬输入是否被消费；G2 的实现细节缺陷由 R1/R2 和 Required Set 阻断，不以本项 PASS 证明能力已实现。

| 目标锁 | 主要落点 | 判断 |
|---|---|---|
| G1 真实 UUID 区分同 cwd，历史/实例/位置独立证据 | S1+S2；第 74–79 行维度与实例；第 46 行同 cwd fixture | 保留目标，无 cwd/mtime 身份捷径 |
| G2 页面/Codex 共源，按 ID 读状态/消息，来源/时间/unknown | S1 Service→S2 reader→S3 HTTP→S4 stdio；第 84/236 行缺证据限制 | 范围对齐；读取输出/空结果仍须修订 |
| G3 保留现用会话，补绑及唯一 fresh 后精确定位 | S1 观察补绑；S3 第 173–181 行 fresh 与定位复核；第 238 行撤销边界 | 没有重启/resume/输入路径 |

| 禁止内容 | 可核查证据 | 结论（确认 lwplan 未踩中） |
|---|---|---|
| 3D/Jev/C4D/全资源监控/多 Agent/多主机 | 第 15/17/19/90/121/191 行；S1–S4 的实施入口仅限定会话链 | 未纳入实施；首期无新增来源配置 |
| 发送消息、resume、重启 Claude、输入注入、代审批、终止进程 | 第 15/21/90/130/163/181/195 行；MCP 恰为三查询，focus 只选现存 pane | 禁止项只作为限制出现，没有执行任务或控制工具 |
| cwd/title/mtime/历史布局/研究快照冒充实时成功 | 第 15/25/76–78/98/113/181/236 行 | 主键 UUID；实例/唯一命令/fresh 门禁，明确快照边界 |
| 默认全体私人正文采集或外发模型 | 第 15/35/79/82/129–132/168/195 行 | 仅明确 ID 请求；列表不读正文，无外部模型路线 |
| 修改现用 Workbench/Nova/CLI/PATH/设置/Hooks | 第 17/40/123/181/238 行；S4 真实配置仅 coordinator 后续承接 | 现用层明确不改，独立 venv/MCP 表尚未授权执行 |
| 提前安装/部署/注册 MCP/真实 focus | 第 3/123/187/210/220/307 行 | 本轮仅规划；Review(LW) 后仍 STOP_BEFORE_IMPL |

### 关键实现锚点复核结果：PASS

| 主要包 | 首个复核入口与目标形态 | 结果 |
|---|---|---|
| S1 | source.py、remote_probe.observe_source/read_registration、service.merge_observation、terminal.parse_slot_command；保留候选的纯合并+可注入读取 | PASS；能定位 identity/instance/slot 判定，helper 明确不作为产品模块 |
| S2 | requirements-reader、remote_probe.read_messages/reader_capability、service.get_session_messages；SDK 单入口及分页 | PASS；入口可定位，但形态内容受 R1/R2 阻断 |
| S3 | gateway.PanelHandler/serve、Service 查询、terminal.focus_session、web 三函数；单 Service 路由+列表/选中详情 | PASS；HTTP矩阵与定位动作边界足够明确 |
| S4 | mcp_stdio.build_mcp/call_gateway、requirements、根 README、TOML example；薄 stdio 转发及本地运行说明 | PASS；工具白名单、路径、真实配置承接可定位 |

没有大规模删除或旧调用链移除；撤销仅针对本批新增产物，不触发被删函数完整名单要求。

### 代码片段充分性复核结果：FAIL

状态判定、跨层共享契约、UUID→reader→页面/MCP、focus 的优先级都触发必须提供片段。第 101–111 行 S1 early-exit、第 134–143 行 S2 reader、第 170–179 行 S3 fresh focus、第 197–206 行 S4 stdio 均写明来源和用途，数量与格式没有问题。

实质缺口是 S2：骨架把官方 reader 调用直接接到 bounded page，而官方 [] 不是成功证据；对空结果/解析范围没有可核对的分支，且共享文字承诺 timestamp。因此片段集合不足以关闭主链消息读取的最小证据环；S1/S3/S4 局部骨架仍可保留，无须写成完整最终代码。

### 作者体验门复核结果：PASS

一个固定 source、一个 Service、官方 reader 单入口、薄 HTTP/MCP、中文原因以及运行顺序，对后续作者比多源采集/泛化插件更直接。第 115/147/185/224 行的约束下沉到各包，不只是开头口号；页面 UUID 可复制、错误保留选择、窄屏换行和正文 textContent 都有具体行为。S4 TOML 与官方支持的 command/args/cwd/enabled_tools 一致。[OpenAI 官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp)、[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference?translationFallback=zh-Hans)

R1/R2 会使实现作者目前仍需解决 SDK 输出细节，但不存在显著的结构/声明可读性回退；该问题分别归技术完整性、片段与事实映射 FAIL。修订应补最小分支/字段契约，不新增适配框架、通用主机配置或第二个正文 parser。

### 人工 review 对齐复核结果：FAIL

| 子项 | 结果 | 独立判断 |
|---|---|---|
| 核心链路顺读复核 | PASS | 第 23–65 行先读当前启动/registry→新 Service/reader/HTTP/MCP/focus→不改层与验证；可沿 S1→S4 顺读 |
| research 事实映射复核 | FAIL | 第 44–57 行已有主要事实都有实现/责任/口径，但官方 reader 的 [] 失败语义和实际字段未进入 S2/测试（R1/R2）；依赖发布事实不能补齐 |
| 跨包脑补需求复核 | FAIL | SDK 字段应怎样序列化给 S3/S4、[] 应怎样由 reader/Service 判 unavailable，仍需在第 84/131/137–142/162/195 行间补逻辑，缺失的是明确契约而非导航 |

总括项 FAIL 明确由 `research 事实映射复核=FAIL` 和 `跨包脑补需求复核=FAIL` 贡献；主链总览存在不能覆盖它们。

### P1-P9 协议合规核验表：PASS

本表判断协议是否在方案中得到体现；不把机制存在视为 Required Set 实质通过。

| 协议项 | 结果 | 可核查依据 |
|---|---|---|
| P1 | PASS | 第 274/298 行不设任务数质量门槛；S1–S4 的数量不是放行理由 |
| P2 | PASS | 第 274–294/307 行按所有必备内容缺一失败；本 reviewer 因 R1/R2 执行了失败判定 |
| P3 | PASS | Required Set 的存在性硬门禁明确，没有分数或多数票替代 |
| P4 | PASS | 第 3/274/278–292 行明确 T3=T1 全集+T2/T3 增量 |
| P5 | PASS | 第 259/270/307 行：范围/验收/回滚不唯一时强触发 DELEGATE_QUESTION；本轮确定缺陷直接修订 |
| P6 | PASS | 第 252–257 行给留痕位置与新事实/风险/阶段切换记录，不设次数 |
| P7 | PASS | 第 259/303 行以真实不确定性驱动，不设提问数量上下限 |
| P8 | PASS | 第 259–268 行有未触发理由、P0→P1→P2 的批量方式及模板 |
| P9 | PASS | 第 274/305/307 行写明产出后 Gate-1 与 Review(LW) 放行前 Gate-2、执行人和失败回环 |

递归委派检查：第 270 行明确“不递归委派”；没有要求后续阶段 agent 再派下级。coordinator 承接验证/原有流程编排不等于 reviewer 递归委派。

### 基线与澄清一致性复核结果：PASS

- “未回答”为空：clarifications 第 105–107 行；后续 Jev/C4D/存量 Desktop 等问题不属当前首批。
- 目标锁被方案消费：上述 G1/G2/G3 映射成立；S2 缺陷属于实现路径细节，不是新增目标。
- 反目标未踩中：以上禁止项表给出实际规划落点，没有控制扩张或消息外发。
- 未违反头脑风暴决策：README 的日常开发效率目标→Q2/Q3→当前最小会话链可追溯；3D/Jev 等保持后续批次。原文“继续吧”没有被当作安装或整体面板实施批准。
- 风险与验证责任保持：真实环境/人工/依赖/coordinator 验证未交给 impl；Review(LW) 的停机确认没有被跳过。

### 设计味道扫描结果：WARN: SDK 适配边界目前过于乐观

没有发现提前抽象、双索引、自制父链 flatten、通用主机系统或任务状态猜测。已知异味是把“官方 reader”视为能直接提供所有目标字段及充分成功证据，导致 adapter 的关键边界被文字总则遮住。WARN 本身不另增加放行条件；其具体错误已由 R1/R2、Required Set/片段/事实映射 FAIL 阻断。最小修订可保留当前四包与主链。

### Gate-2 结论

**Gate-2**：FAIL

Required Set、代码片段充分性、人工 review 对齐未通过；当前不能放行实施。范围、关键文件、作者体验与 P1–P9 机制通过不抵消这些缺陷。无 PROBLEM_DEFECT，无须回到问题重定义；未发现需用户新增风险接受才能收敛的决策。

## 验证责任与未验证外部条件

| 能力/条件 | impl-safe 自证与证据 | coordinator 外部承接与证据 | 当前结论边界 |
|---|---|---|---|
| 身份观察/旧会话补绑 | 合成 registry/proc/pane、PID变化/冲突/断连 mock；impl-safe-r1.txt + impl_report_r1 | 固定 source/user/config/version、真实同 cwd 两ID、断连恢复；session-panel-external-r1.json | 三槽位仅研究快照；CLAUDE_CONFIG_DIR、持续状态、产品补绑未验收 |
| 官方消息读取 | 修订后的真实字段/[] 分支、预算/revision mock、合成链；明确 stub 范围 | 隔离 SDK 安装/API、合成链与选中真实 ID/分页；只记录计数/版本/revision/exit | 尚未安装/导入 SDK；文件大小通过前置也不证明消息兼容；S2 必须先修订 |
| 页面/HTTP/focus | fake Service、HTTP/CSRF/Origin、focus argv、合成 UI | 8766/Edge/360px 与桌面、fresh 唯一链、前后 focused pane/exit；不存正文 | UI 和 focus 均未验收；help/list-clients/mock 不能标定位成功 |
| stdio/Codex 共源 | MCP initialize/tools/list/call、TOML 示例、fake HTTP 一致 | 受信任项目配置、用户正常重载、实际工具发现/按ID status/messages；session-panel-codex-r1.json | 配置存在或 codex mcp list 不等当前 chat 可用；尚未接入 |

各包已有证据产物、责任归属及缺证据不得整体“可用”的约束（第 117/149/187/226/234–236 行），分层可保留。report 尚无产品测试结果；不以 reviewer 读取官方源码、研究 exit0 或报告结构校验替代这些验收。

## contract drift / stale / mirror mismatch

- 当前方案与已确认基线无范围/授权漂移。readiness 中“SDK 发布包尚未核验”是当时事实，后续依赖补证关闭了发布/API 存在性，仍未关闭安装和真实兼容；方案第 59/123/149 行正确区分。原始大面板 research 的“基线尚不存在”只作历史背景，不能覆盖当前基线。
- 共享流程有一个状态表述陈旧点：development-workflow 的“状态跟踪/里程碑映射”写 Review(LW) 通过后阶段进入 Impl，而 coordinator 核心停机条款要求 `STOP_BEFORE_IMPL -> ManualMode` 并呈递用户。当前方案第 3/307 行采用后者，故该陈旧索引没有导致本方案越界；上报 coordinator，状态落账必须使用 STOP_BEFORE_IMPL，不能照旧索引自动实施。本 reviewer 不修改共享技能。
- 未审计所有平台镜像，不能宣称全局 mirror 一致；本轮读取的 Required Set/P1–P9 canonical 与 review-local 门禁没有实质冲突。

## 已见失败与证据限制

保留如下失败，不包装为“全部检查成功”：

- 本 reviewer 初次批量技能读取和整份 lwplan 输出被工具截断；随后分别完整重读受影响技能并补读 lwplan 第 119–188 行。另一次 web/find 与本地代码混合输出被截断，已改用精确原文读取；官方网页抽取行号与 raw 文件行号不同，采用 raw 重新定位。一次查不存在的 `_find_session_file` 名称没有匹配，随后确认实际 `_read_session_file`；不是产品运行失败。
- 输入记录中：非 Git 目录的 git status 失败曾被外围 PowerShell 后续语句掩盖，显式复查 exit128；其它记录为 exit1。保持非 Git，不 init/commit/push。
- 输入记录中：root 祖先字段 PermissionError；agents JSON 漏 Files；后台 argv UUID 冲突与注册时间异常。未以其它可读字段覆盖未知。
- 输入记录中：Zellij get-pane/focus-pane 各 exit2；list-clients --json exit2，正确文本查询 exit0；仅 help/查询，没有 focus。
- 输入记录中：GitHub API 限流、tree Internal Error、TypeScript HTML 超限、正则提取过长、PowerShell 语法错误 exit1；后续精准官方 raw/Markdown 读取恢复，只证明对应资料。
- 输入记录中：根 README 不存在读取 exit1；JSON 使用错误字段并被后续语句掩盖，随后 Stop 模式重读 exit0；apply_patch 匹配旧链接失败且无改动；技能/批读、vendor 索引截断、不存在路径/空 rg 匹配和 graph 工具不可用均有恢复记录。
- 输入记录中：90项 Gate-1 自检首跑 exit1、failures=1（S3“撤销”锚词），修改后重跑的结构结果不替代本审查；旧 8765 连接拒绝、默认 Playwright 浏览器缺失 exit1、Maxon 抓取超时亦不证明本批产品失效或成功。

本 reviewer 未执行 SSH、安装、远端/本机配置写入、focus、输入、resume 或正文读取。新报告之外没有修改其他文件；外部未验证条件继续有效。

## 修订建议与后续行动

1. lwplan 作者在同一 `lwplan.md` 内修订 R1：明确 SDK 解析范围/已验证候选关系，给 [] 保守不可用语义、骨架与测试分支；不新增读取全历史或替代父链实现。
2. 修订 R2：采用实际 `SessionMessage` 字段，删除必有 timestamp 的承诺，并对齐 S3/S4 的序列化、UI、MCP fixture 与验收。
3. 更新 research 事实映射、片段闭环说明与 Gate-1；保持目前工作包、反目标、回滚和外部责任。无需重算基线，除非修订引入新的读取/控制范围或路线。
4. 回到 `LWPlan -> Review(LW)` 第二轮。本轮 REVISE 禁止进入 Impl；未处于自动模式，不能自行开启回环。
5. 下一轮 PASS 后，coordinator 仍必须停在 **STOP_BEFORE_IMPL**，向用户呈递本地新文件、远端隔离 SDK 环境、项目 MCP 配置及真实 focus 的具体范围，再承接获准动作。产品实现后保留独立验证与 fresh Review(Impl)。

本报告交付核验使用本轮 fresh PowerShell 命令：读取实际报告全文、检查十个 Gate-2 字段/P1–P9/主要包与缺陷锚点、核对待审方案 SHA256 未变；失败列表与退出码由工具完整输出回传。此命令仅证明报告产物与输入版本，不证明产品能力。

英文提交消息建议（仅供将来已验证且进入 Git 项目时）：`docs: review remote Claude session binding plan`。本轮不提交或推送。

跨功能事实：无新增；已有 registry/mux 版本边界不重复入库。
