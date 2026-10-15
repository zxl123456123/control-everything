# 方案评审记录：lwplan（第 1 轮）

**review_target**：lwplan
**评审时间**：2026-10-05（Asia/Shanghai）
**协议结论**：PASS（仅方案 Gate-2 主检；仍需 root 独立复核）
**评审对象**：唯一 lwplan.md 当前 SHA256 `e20c7af4a1980e3de086664d5432e13a8e57b328196b94b5757619ada1da4f98`；首读 SHA256 `fb3a5aee27add8528436c7ae7ce83e01711e35a4ca36537a1e178779b9a0d530` 保留。
**当前边界**：产品仍未改动；本记录审方案可实施性，不声明注册、真实调用、隔离、视觉或业务完成已经实现。

## 输入与独立读取

全文读取 plan-review、development-workflow、implementation-planning、verification-before-completion；本 feature README、clarifications 的 1–10 节、原文、Readiness、三份 research、before manifest、当前 child bindings/id-source probe 和只读脚本。实读现有 mcp_stdio、codex_index、gateway、app/cockpit/robot3d、index/CSS、MCP/gateway 测试及 R11 有限交付报告。SDK 公开 list_tools/call_tool 与 ArgModelBase 也独立实读。

基线 SHA `28fd4301a0f8cdd32b70ae593186beae473d4e0248e4fe7355654a027a6b4781`；原文 SHA `01ea4cf362e9c9b9769a3d757a35e681be45458ffdd50c76f690f72d0fe7448b`。不依赖 coordinator 私有上下文补脑，不改产品/方案/他人报告，没有递归委派、服务调用、进程操作或聊天正文访问。

## 可行性与首读发现

现有 FastMCP、只读 SQLite 元数据与单文档事务可承载这条有界链；同 root 原生 child 数据已经提供精确 UUID/parent，所选入口没有新增通用执行器或跨主聊天调度。但首读尚有两个可由 agent 修补的 how 缺口，无需新增用户偏好或审批：

1. **复核证据失效后无恢复路径**：S2 同 path/hash submit 必须复用原收据，record_review 不允许同版本的矛盾 intent；同时 review evidence 变化使 accept/snapshot 失效。产物未变而复核文件改变时，作者再提交仍不能重启复核。恢复应明确：当前复核/验收证据失效后，assignee 可对同 artifact digest 重交生成新 version、清空旧 request/claim/review/accept；只有仍完整有效的同 intent 重试幂等。快照仅在实际记录过复核证据的状态重验该证据，不能要求未复核任务具有不存在的文件。
2. **默认 SDK 不等于严格原始参数校验**：本机 FastMCP server.py:305 将底层 call_tool 注册为 validate_input=False；ArgModelBase 没有 extra=forbid，且经过 pre_parse_json/model_validate。S3 不能仅靠 @mcp.tool 和函数签名承诺拒绝额外 actor/root 或 bool/string version。需给出局部公开 list_tools/call_tool 的原始 schema 检查锚点、additionalProperties:false、严格检查后再 super，以及拒绝输入不调用业务函数/不产生收据的负例；不改 SDK 或旧 MCP。

首读因此给出协议 REVISE / Gate-2 FAIL，而未放行产品。两项直接回传规划者并通知 root；root 回传原 planner 两次模型 capacity、未实际作补丁，由 garden_plan_repair 按同阶段接管原地小修。capacity 是编排失败，不能冒充业务失败，也不授权 root 替写方案。before-repair 副本与首版 Gate-1 保留。

当前已全文复读新版：S2 的 `[修订: PLAN_DEFECT-R2.1]` 明确先在事务内验当前链，再判断幂等；只重验已存在的 evidence，失效时同 digest 递增 version、清旧复核/验收，并有“不改 artifact，只改 evidence”的拒绝→重交→完整新复核及并发用例。S3 的 R2.2 提供公开 GardenMCP.list_tools/call_tool 片段，公布和校验同一 additionalProperties:false schema，原始 arguments 的 jsonschema.validate 先于 super.call_tool；拒绝不进入业务写入，原 SDK/旧 MCP 不改。两处缺口已由具体规则和验证锚点消除，未删除其它主链或扩大范围。当前修补只有 S2/S3，S1 与 S4 后全文和前部均逐字一致；标签仅留修补痕迹，不表示产品已实施。

## Gate-2

### Required Set 复核结果

**PASS**。主要工作包明确为 S1–S4，任务类型 T3；T1.1–T1.13、T2 输入/输出/实体/测试、T3 状态/接口/兼容/停机的结构存在且可定位。S2 当前失效恢复、S3 原始输入严格检查已给出可直接实施的规则。独立复核当前 Gate-1-r2 的完整 stdout、空 stderr、exit0、25 项/0fail 与新 SHA；不以作者自检或字段数量替代本人的语义判断。

| 工作包 | Reviewer 首落点 | 依赖、验收、回滚与责任 |
|---|---|---|
| S1 | garden_native.resolve_actor / actor_from_environment | 精确 id/source 父链 → synthetic DB 负例 → root 真 child caller；失败 unavailable，旧索引不改 |
| S2 | GardenService transaction / submit / snapshot / accept | 同域角色、版本与文件 hash → 原作者/独立 reviewer/验收；本地与真实闭环分层，新 DB 保全 |
| S3 | garden_mcp、garden_invoke、gateway 专用分支 | 每 caller 独立 stdio → 真实 list/call → 固定 root HTTP；owned 8766 承接，旧空 body 不改 |
| S4 | bootstrap → garden.mount/getView → cockpit/theme → 当前收据 | domain/generation、键盘/窄屏/长 key、真实截图及旧全量/60 秒；关闭新入口可恢复原观察 |

每包目标/反目标、步骤、验收、回滚、依赖、作者体验及 impl-safe/coordinator 的 owner/产物/缺证据口径已存在。复杂链先主链、research 映射、片段闭环再包，结构无需重写。

### 目标锁 / 反目标复核结果

**PASS**。G12.1–G12.3 均映射到 S1–S4；研究报告的 native completed、Stop 和旧 unknown 未被改成业务完成。两处 how 修补不改变用户选择，当前权限、成功边界及失效恢复已可顺读。

| 禁止内容 | 独立定位依据 | 结论 |
|---|---|---|
| Stop、入队、native completed/动画冒充完成 | §1 N12.1、§2 主链、S2 状态表、S4 当前 accepted 摘要 | 未踩中；最终须 current digest/evidence + root accept |
| 参数自称 actor/root、跨 root、任意执行/全局配置 | S1 env/显式父链、S3 固定工具签名、raw schema 和 bound HTTP、§4 第二 root 用 synthetic | 未踩中；raw extra 拒绝与域/角色校验均有具体锚点 |
| 拿共享 root MCP env 给 child 署名或宣称 OS 认证 | S1 actual caller 独立进程、§1/5 本地信任边界 | 明确禁止；角色/域检查与 OS 恶意用户隔离分开 |
| 旧 API/网络/终端守卫、旧失败或画质缩水 | §1 不影响项、S3 旧空 body/精确头/CSP、S4 颜色-only、§4 原质量/失败保全 | 未计划修改；28 当前产品 SHA 仍等于 before |

### 关键实现锚点复核结果

**PASS**。S1 父链、S2 事务/失效幂等与业务方法、S3 独立 stdio/公开 GardenMCP raw 校验/新 root HTTP、S4 UI/renderer 桥接均有路径、函数及职责首落点。固定真实 caller、同域 target、root 网页上下文不能由 query/body 改写；无需实现者再选择架构或默认猜 SDK 行为。

### 代码片段充分性复核结果

**PASS**。父链、transaction/accept、S2 当前链验完再幂等/失效同 digest 重交的规则及状态表、S3 GardenMCP raw validate→super/工具→固定 root HTTP、S4 bootstrap→generation/root→当前摘要/scene 已组成判断主链所需的最小闭环。片段用途和插入位置明确；没有大规模删除，不要求计划提交接近最终实现全文。

### 作者体验门复核结果

**PASS**。角色及方法名直接表达行为；一个本机适配器、一个有界账本和一个 UI module，未设计 provider 抽象、queue/pool、通用 event bus 或权限配置语言。固定工具与 JSON 参数文件易读。普通中文、16px 正文、至少 13px 次要文字与渐进展开保护用户读写；这只是目标形态判断，实际舒服与否仍待 UI/键盘/截图证据。

### 人工 review 对齐复核结果

**PASS**，以下三个子项均 PASS。

| 子项 | 结果 | 独立判断 |
|---|---|---|
| 核心链路顺读复核 | PASS | §2→S1 环境/原生 parent→S2 版本/角色→S3 调用及 HTTP→S4 root/generation/当前收据→§4 真实闭环，可直接顺读 |
| research 事实映射复核 | PASS | 三份研究与 native 样本均映射到实现/测试/owner；新增 SDK 默认解析行为落实到 GardenMCP raw schema 和 stdio 负例，evidence 变化恢复有同 digest 新版本闭环锚点 |
| 跨包脑补需求复核 | PASS | 各职责、明确不改层和验证 owner 可以直接定位；上述缺口是明确局部规则，不需 reviewer 自建主链 |

总项显式汇总上述三个 PASS；既有骨架与本轮局部补丁可以直接顺读，无需 reviewer 自建调用或状态语义。

### P1-P9 协议合规核验表

**PASS**。

| 项 | 结果 | 对应方案依据 |
|---|---|---|
| P1 | PASS | §3 按风险分 S1–S4，§6 明确不以任务数量作门槛 |
| P2 | PASS | §6 T1/T2/T3 必备内容存在性；任一缺失不放行 |
| P3 | PASS | §6 纯存在性，非评分放行 |
| P4 | PASS | T3 显式继承 T1/T2；状态/接口/兼容/停机齐列 |
| P5 | PASS | §5 范围/验收/回滚或新假设不唯一触发 DELEGATE_QUESTION |
| P6 | PASS | §5 新假设/风险/阶段切换触发，对齐位置与当前记录明确 |
| P7 | PASS | §5/6 问题数量无上下限 |
| P8 | PASS | §5 P0/P1/P2 批量模板及未触发原因 |
| P9 | PASS | §6 planner Gate-1→fresh 主检+root Gate-2；失败禁止实施 |

不存在指挥下游递归派发的计划；原生业务派发由同 root coordinator 承接，与 reviewer 禁止递归区分。

### 基线与澄清一致性复核结果

**PASS**。未回答为空；完成摘要、产物交接/复核、同主聊天子 agent 与主聊天隔离四项与基线一致。温暖布局为普通中文+现有角色场景，未加入农场经济。registered/list/call/当前桌面热加载分别表述；真实 child、fresh 业务 reviewer、最终 fresh ReviewImpl 分开，root 不代提交/claim/review。没有新增用户约束或接受未确认风险。

### 设计味道扫描结果

**PASS**。目前没有通用调度器或过早 provider/事件抽象；固定预算作为本轮有界来源，未新增用户配置。单文档事务的简化与现阶段链路匹配。首读的两处缺陷属于可修补规则，已单列阻断，不包装成设计通过即实现正确。

### Gate-2

**PASS**。**allow_enter_impl: yes（待 root 独立复核放行）**。当前唯一 LW、完整基线与 Gate-1-r2 SHA 绑定一致；两处首读缺口已在同轮消除。root 仍须独立复核此报告/当前输入和主链后实施，不能把本方案 Gate 当产品运行或最终业务验收。

## 验证、失败保全与后续边界

本轮已执行 `.venv/Scripts/python.exe -X utf8 -B work/r12-lw-review-preflight.py`，17 项/0fail/exit0，完整输出已读；work/r12-lw-review-preflight.json 绑定基线/原文/Readiness/父子样本/before SHA。最终方案独立检查命令 `.venv/Scripts/python.exe -X utf8 -B work/r12-lw-review-gate2.py` 为 29 项/0fail/exit0，完整输出/当前 SHA 在 work/r12-lw-review-plan-gate-repaired-command.json、work/r12-lw-review-plan-gate.json。包括本 reviewer 当前 jsonschema 实际运行对 bool version、string version 和 extra actor 三个负例全部拒绝；这只证明原始 schema how 的本机可行性，不冒充产品 MCP 实调用。全局原生/stdio/HTTP/UI/业务结果均未在本 review 运行。

独立 Gate 脚本首次有 unmatched ')' 的 SyntaxError/exit1，原命令留在 work/r12-lw-review-plan-gate-command.json；仅修 reviewer 自己脚本的一个多余括号，再跑全命令得到上述 29/0，不为 checker 修改计划或产品。首个聚合技能读取、app/rg 输出截断，随后按文件/缺行补读，不用截断资料放行。最终附 --report 验证十同名字段、子项、当前 SHA/结论/保留失败；证据落 work/r12-lw-review-final-gate.json、-command.json。

不省略 Readiness 首版章节与原文目录缺口、原 planner capacity 恢复或本轮两项首读缺陷。R11 首全 fixture 1392/1、第二 1397/2、CSRF36/1、窄屏42/1、历史性能红、真实23/1 workbench_timeout/exit1 和两条 Pydantic warning 保留，不能由未来本轮绿抹除。

通过方案之后仍须按 owner 实际验证：每个 actor 独立 stdio list/call、原作者真实报告→不同 reviewer claim/审查证据→root hash 复验/accept、current receipt 云朵、第二 synthetic root 读写/迟到响应隔离、实际 8766 root/资源/DOM、360/574/1024/键盘/完整 key、旧全量与48同质量60秒、最终 fresh ReviewImpl。当前这些尚未实现，测试端口、工具模板或短窗 FPS 都不能代替。

无新增跨功能事实。
