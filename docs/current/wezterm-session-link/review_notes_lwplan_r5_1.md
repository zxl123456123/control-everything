# R5 定位补丁独立 Review(LW)

review_target: lwplan  
review_round: r5  
review_seq: 1  
review_date: 2026-10-05（Asia/Shanghai）  
reviewer: codex_index_impl_review（本轮定位方案与代码未参与作者）  
评审结论: PASS  
评审对象: 唯一 `lwplan.md` 新增 §8，SHA-256 `898EE858ECAE67CF6808E488FEB134E3182C2DE38F5BA5F4D6375D3FC98ECC2E`

本结论仅证明 R5 精确定位补丁方案可进入 root 的独立放行复核，不是实施或运行验收。之前 Codex 身份索引审查没有替代本次 Review(LW)。没有执行产品测试、实际数据库/HTTP、终端 CLI 动作、GUI、SSH、D: 写入、服务操作或 Git，也没有递归委派。

## 输入与独立证据

完整读取当前 plan-review；按其 canonical 指向读取 implementation-planning 的 Required Set、工作包、片段与原地修订合同；结论前完整读取 verification-before-completion。完整读取 clarifications（含 §12）、resume_context_r5_live_testing、feature README、冻结旧 LW 前缀、r3.1/r4 继承定位合同和旧 r4 Review(Impl)。当前 terminal/workbench/test_focus 全文、final §8、准确 patch、作者 Gate-1 红绿全部 verdict 与 checker 均已读。官方 v0.45.1 raw 只读核对相关 CLI Action/client-id、route、FocusPaneWithId、FocusNextPane/macro、pane_info 和 tiled 遍历分支；没有声称全文阅读大型 Rust 文件。

| 输入或范围证据 | 独立核验 |
| --- | --- |
| 当前权威澄清与测试恢复材料 | clarifications SHA `B50ADF008C1869E8B73F2FAF980CC2FB0EA4140F8A0142B2A3470607637B0096`；resume SHA `343660865326414429D781392D925611F006EB5B5A813A3160F8AE82D96E3DD2` |
| 原已实施支撑正文 | 54636 bytes，SHA `405FDE8E546B5D516D507802832A64D23AC8854AA5D11A2EC64EC33766E7C9E0`；当前全部逐字前缀保留，没有删除或重排 |
| 当前新增差异 | 只追加 §8 / 18966 bytes；独立从 before/current 重新生成的完整 unified patch 与 `work/wezterm-focus-lw-r5.patch` 精确一致；patch SHA `8675495123CB8C0B9F14951EB77FF2357380C5FE26F18D174422DCB64B6012D0` |
| 已实施继承合同 | r3.1 SHA `AEB72C017FF60D4E370E00BA420DF250D3774A4C72E5627060A9025A8DAB8EFF`；r4 SHA `A4010327E6BC25D15DADAF395FDFB3D3006D42086853E54E0CEF9445A8ECCF1E`；r4 实施审查 SHA `577AD89100028B73EC0D9C1350CEEAC58729E0072CA01D6163B9D943D95500B7` 均保持 |
| 当前实现状态 | before 清单的29个产品/测试来源全部 SHA 不变，当前 AST 有效；并未先实施再补 Gate |
| 作者 Gate-1 | `work/wezterm-focus-lw-r5-gate-retry1.json`，164项全部 true、0失败、exit0，final LW 与 patch hash 相同；只证明文档自证 |
| reviewer 独立核验 | 新脚本 `work/wezterm-focus-lw-r5-review-verify1.py`；首轮 `work/wezterm-focus-lw-r5-review-evidence1.json` 实际102项/0失败/exit0，完整输出已读；报告生成后含正式字段的最终复核另存 `work/wezterm-focus-lw-r5-review-final1.json` |

实际 `work/live-session-capabilities-r5-1.json` 全文已读：23项/6失败/exit1，三个 exact-ID 动作都 exit0，但独立唯一真实 client1 仍 terminal_8。numeric ID 和“先切 tab 再按 ID”证据均未达到 terminal_3。`work/live-session-focus-next-r5.json` 仅证明一次真实 client1/terminal_2 → terminal_3 的正例，不能替代产品完整遍历或跨 tab 重复验收。

独立完整解析 `work/live-session-wez-dev-r5.json` 前后清单的相关字段：16行全量 panes；目标 tab_id=1 中存在非 selectable 的 plugin_2 和 terminal_2/3/4/5。plugin_2 与 terminal_2 的数字重叠，命名空间必须分开。after 的 dev/terminal_3 非 held，main/files 邻居仍 held；普通 shell/terminal_5 的 terminal_command=null。本方案允许非 selectable tabbar、将 shell5 纳入遍历、邻居只 focus，适配这份实际形状；这些 ID 是当次证据，不是实施常量。

## Gate-2

### Required Set 复核结果：PASS

本轮主要工作包是 S2-R5 与 S4-R5；仅分别修改 terminal.py 与 test_focus.py。旧 S1/S3 支撑继续继承，不作为本轮重复实施任务。

| Required 项 | 独立语义复核落点 / 结论 |
| --- | --- |
| T1.1 目标/反目标/不影响项 | §8.1及两包消费 G3、G1/G2、N1–N3；定位与其它链分开，PASS |
| T1.2 文件及首落点 | lines378/423：_focus_session 原 post 分支、FakeWorkbench/run_command，PASS |
| T1.3 任务闭环 | 两包均有步骤、原结果形态、验收、局部回滚、依赖；lines384–411/423–429，PASS |
| T1.4 每包G/N | 两包首段显式消费，并下沉到拒绝/零新动作，PASS |
| T1.5 三层证据责任 | lines413–417/427–429：作者 mock/static，root 实际环境，fresh 实施审查；缺证限制明确，PASS |
| T1.6 作者体验 | 两个小私有函数、原 parser/注入、直线守卫、短焦点序列，PASS |
| T1.7 主链总览 | lines360–372：现状、fallback落点、不改层与原因，PASS |
| T1.8 research事实映射 | lines364–370五行，失败、源码推断、实际字段、预算分别落到实现和验证，PASS |
| T1.9 片段闭环 | lines386–407与紧邻判据覆盖原 post→候选→有界动作→完整终验，PASS |
| T1.10 Gate-1显式项 | line457四必填及复杂链项目；当前164项证据独立核验，PASS |
| T1.11 双Gate与回退 | lines457–459：作者→root→fresh Gate2→root放行，失败原地重Gate，PASS |
| T1.12 澄清触发/模板 | line437 P0/P1/P2、批量模板、无新问题原因和受控补证，PASS |
| T1.13 风险/降级 | line435耗尽预算、特殊布局、关联波动、失败未确认与重Gate，PASS |
| T2补充 | 原输入/输出、候选拒绝条件、mock及全量回归边界均明确，PASS |
| T3补充 | line372私有接口矩阵，原公共协议/状态不变、无持久迁移、root受控重载/局部回滚，PASS |

### 目标锁 / 反目标复核结果：PASS

用户要求稳定地发现并定位真实会话；§12将成功锁定到 exact UUID/process instance/slot/pane 与真实唯一 client 最终焦点。本次只处理新 GUI 的 exact-ID no-op，持续自动实施授权覆盖普通修复；没有向用户重复索取同一范围许可。

| 禁止内容 | §8可核查依据 | 未踩中结论 |
| --- | --- | --- |
| 产品复活EXITED、named启动、旧launcher、创建SSH/Claude或held命令输入 | lines356/358/380/384/429；有限真实测试授权只属于root；代码范围只定位与测试 | PASS |
| 降低exact UUID/instance/slot/client-ID条件、以exit0/tab近似为成功 | lines362/380/384/386–409；只将pane未到拆成fallback触发，其它原后验先拒绝 | PASS |
| 放宽完整关联、fresh pins、年龄、5秒deadline、lock/latch | lines384/409；same_association仍全部identity；refresh_finished不更新；无新增预算 | PASS |
| 任意键盘/命令/循环恢复、静默改env、无限重试 | lines384/409/411：固定两种官方动作、真实焦点每步后验、数量/重复/耗尽立即停 | PASS |
| 重构native/workbench/HTTP/来源/reader/MCP/UI/图形、改D配置/工具 | lines356/372/378/382；只两文件，无list-tabs或新provider例外 | PASS |
| 杀一般进程树、清latch、回滚他人工作或关闭旧缺证 | lines411/427/429；root核归属后处理自建网关，旧owned回收/Q6/BLOCKED独立 | PASS |
| 将身份/消息历史/机器人动作混为实时活动、Codex正文或协作能力 | lines427/429/461与§12分层；本次仅定位方案结论 | PASS |

### 关键实现锚点复核结果：PASS

terminal.py 的 _focus_session 当前完整 post guard 是首落点；只排除其中“真实 client 尚未到目标”这一触发条件，其它关联/slot/pane/deadline/age条件仍先判定。候选、遍历与原完整终验的私有接口明确。测试首落点与真实形状、red症状、原成功及拒绝语义均可直接定位。

### 代码片段充分性复核结果：PASS

方案改变 early-exit 与动作顺序，命中必需片段。lines386–407给出了插入位置和主链骨架，lines380–384/409完整定义辅助函数判据、数量上界、非0/异常出口与共享预算；不是要求作者照抄不存在的 placeholder 函数。终验须再核候选 fingerprint 和原全部 guard，不能只把遍历函数的 bool 当最终成功。未要求完整最终实现或删除任何原函数链。

### 作者体验门复核结果：PASS

固定普通 tiled 布局的短数据检查与有界焦点遍历足以实施，不需要新动作抽象、配置、异常层次或Zellij模拟器。允许少量重复守卫；“优先≤100行”是简单性指导而非用行数替代完整性。真实字段/slot/客户端焦点序列作为独立测试输入，保留没有新字段的原成功fixture，能防止测试与实现同错。不要为压缩行数删除安全出口，也不要为潜在布局建立通用系统。

### 人工 review 对齐复核结果：PASS

| 子项 | 结果 | 独立依据 |
| --- | --- | --- |
| 核心链路顺读复核 | PASS | 可由lines362现状顺读到S2候选/固定tab/next/终验，再到S4症状和实机责任，无需先拼其它包 |
| research 事实映射复核 | PASS | 五行表把CLI临时client机制与一次真实next区分，实际字段形状、no-op、预算约束均有实现与验证锚点 |
| 跨包脑补需求复核 | PASS | S2私有输入/输出、原成功兼容、S4 red/green与root运行证据衔接明确；不用reviewer自行设计接口或新增决策 |

总项明确汇总以上三个 PASS，不吸收独立作者体验门。

### P1-P9 协议合规核验表：PASS

| 项 | 结果 | 当前存在性证据 |
| --- | --- | --- |
| P1 | PASS | line459不以任务数量门禁；两个工作包仅表示职责 |
| P2 | PASS | lines439–457 T3 Required与缺任一不放行 |
| P3 | PASS | 同处纯存在性硬门禁，red保全，不用测试数代替 |
| P4 | PASS | T1十三项＋T2/T3追加，当前定位高风险按T3 |
| P5 | PASS | line437真正目标/权限/验收/回滚不唯一才受控提问，技术补证回root |
| P6 | PASS | line435新假设/风险/阶段即记本节与恢复记录，无固定次数 |
| P7 | PASS | line459无问题数量门槛 |
| P8 | PASS | line437批量P0/P1/P2、推荐/代价/阶段模板及本轮未触发原因 |
| P9 | PASS | lines457–459当前Gate1→root→fresh Gate2→root放行，失败原地重Gate；不递归 |

### 基线与澄清一致性复核结果：PASS

未回答列表无本范围用户问题。§12与恢复原文映射到 exact真实焦点、新GUI/no键盘、scope隔离与root真实测试；原 G1/G2/N1–N3继续成立。有限root测试覆盖旧N1不能被转成产品能力。§8没有违反已回答3D偏好或日常效率目标，也没有将此轮定位作为Codex正文/活动验收。CLI竞态和中间步完整普查非原子仍明确存在，未包装成原子握手。

### 设计味道扫描结果：PASS

未见已知反模式：只在原no-op后追加固定官方动作，候选集合按实际字段和所有普通终端建立，不限定main/dev/files或硬编码四个pane；集合数量有界、重复立即停；没有provider注册、全局缓存、守护器、配置系统或无关重构。特殊布局保守拒绝只限制fallback，原成功路径保持。以下预算问题属于待实测运行风险，不以此推断必须引入另一套架构。

### Gate-2：PASS

十项必填复核均显式存在；Required、G/N、锚点、片段、作者体验、人工三子项、P1–P9、澄清与设计味道均符合当前方案证据。只允许交给 root 复核，**仅 root 独立 Gate-2 核当前方案/报告/产品字节后才能放行实施**；本 reviewer 不自行启动实施。

## 风险、验收限制与后续动作

完整 fallback尚无产品计时。原exact action后完整observe＋list_panes、每步clients＋list_panes、fallback后的完整observe＋list_panes共同消耗原5秒deadline；远端age仍累计≤5000，可能更早耗尽。当前实际工作台单次观察年龄约0.7–1.7秒的样本只能提示风险，不能推算完整路径已经达标。root须记录从非目标pane开始的跨tab、其它起点、多步及重复请求的分段耗时/总耗时与独立真实客户端后验；不拿目标本已选中或mock代替机理验收。

在没有完整实测前，不建议为省耗时删除原exact动作后的完整关联检查：当前方案明确只有其它post守卫成立才fallback。若实际共同预算长期无法使用，保持诚实未确认，按本唯一LW重Gate讨论复用最终只读清单或观察位置调整；不延长年龄/预算，不缓存unknown为成功，不把native修改混入R5。原已成功分支应直接返回，不再额外采样或发送tab/next。

作者只本地两文件red/green/static/diff/manifest，root承担独立完整Python/fixture、真实同UUID跨tab与重复定位、同一server/GUI/attach/mux/SSH、原生机器人/正文分层证据。失败返回保留非0命令exit或focus_sent_unverified，纯焦点可能已改变，不自动恢复旧位置。关联波动原因未证及真实ownedGUI失败回收、父Q6、旧BLOCKED仍分别待验。

## 原地修订与 contract drift

原54636字节完全保留，新增§8有统一R5标签、总修订说明及两主要包/风险的修订说明；核心链路小节位于这个新增章内部并有R5.2标签，没有覆盖旧章节。S2-R5明确收敛当前真实no-op缺陷并保留原成功/安全拒绝，S4-R5新增症状red及root验收；不需删除支撑文本、迁移持久数据或升级重排。

冻结旧Gate PASS/“尚未新增”/r3.1与r4“本轮terminal不改”描述只能按其历史轮次读取，当前§8已显式定义覆盖关系；不能用旧hash/旧产品事实放行R5。feature README旧r4 BLOCKED是尚未收口的整批状态，不等同本定位计划失败，root后续只同步当前阶段。默认技能STOP_BEFORE_IMPL与持续用户自动实施授权的差异继续留痕：免重复用户阶段许可，但技术双Gate保留。没有修改shared技能或静默将旧review改成PASS。

## 已见失败与保全

- 作者首Gate1为164项/3失败/exit1，保存在gate-result.json；“步骤/执行顺序”、“共享/lock覆盖”、“真实 owned/真实owned GUI”是过窄字面断言，当前正文实际存在对应合同。retry1仅修语义等价匹配并追加失败记录，final164/0不删除首红，也不是产品验收。
- root真实能力23项/6失败/exit1、numeric focus与先切tab后ID no-op均保留。单次next正例只提供机理入口，没有证明完整重复定位或预算。当前关联波动仍未关闭。
- 本 reviewer首次rg误列顶层不存在的source_materials返回exit1，后按feature真实路径读取；聚合读取和含长转义stdout的字段搜索出现截断，LW/代码按单文件或精确范围补读，实际候选由完整JSON解析补证。未把截断输出或外层exit0当缺段已读。
- 官方研究的HTML缺正文、猜测路径404、宽搜索截断由research-r2保留；只依赖固定raw定界函数和当次实际JSON。
- r4旧Review(Impl)仍BLOCKED；历史Win10053两次104测试失败、native旧unknown/timeout、Lua drift、redirector反证、collector/guard/读取失败不被本轮文档绿替代。本轮未重新执行这些历史实机验证或声称原因已修复。

建议英文提交信息：`fix(terminal): confirm exact pane focus for newly attached clients`。

无新增跨功能事实。
