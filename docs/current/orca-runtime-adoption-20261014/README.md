# Orca 运行时复用与工作台接入方案

创建时间：2026-10-14（Asia/Shanghai）  
当前阶段：P1-A 已交付并通过独立实施审查；P1-B 未准入  
状态：最终高层架构独立复核 PASS，当前唯一设计入口为 [最终技术架构](architecture-final.md)（含架构图）。初审 REVISE 的 R1–R4 已修订并经复核关闭；原方案与技术补充保留为历史输入。P1-A Readiness、低层计划和 Gate-2 已通过；放行范围仅离线预检工具。实际隔离运行、产品集成和模型试跑未执行。

## 原始需求与最新范围

2026-10-14 用户：

> 在看看目前开发面板的进度，把ocra的那套技术嵌入进来了没，我觉得底层技术管理和展示用ocra的源码技术可以尝试，这样不需要自己造轮子了，你分析看看

2026-10-14 用户补充：

> 下一步呢，方案目前做好了吗，另外我之前做的那个像素小人管理我感觉没有用到真实作用，暂时可以先不用管他的嵌入了，除非你找得到它有什么用

既有原始目标、架构选定与自动推进授权见 [工作台需求](../agent-workbench-20261013/README.md)；Orca 名称确认见 [用户确认](../agent-workbench-20261013/user-confirmation-20261013.md)。本轮接受最新范围：暂不推进像素场景嵌入，核对其业务作用后再决定是否有未来复用价值；不把该表述解释为删除旧代码或账本。

## 与旧阶段的关系

2026-10-14 用户进一步澄清：

> 我想说的架构其实是说你底层用的什么技术搭建的，是否稳定，未来是否可靠，是否可以扩展，还有一些设计原理

> 对整个架构多思考一下怎么更好设计，看看还有没有更好或者我漏掉的地方，另外为了性能好，是否需要用rust来实现，后期如果嵌入多了，或者并行的多了，如何保证稳定性。此外orca里面也可以嵌入piagent、hermes？各种流行的agent

据此补充底层技术、并发可靠性、Rust 取舍和 Agent 兼容性分析。先前“职责已明确”不等于完整技术架构已定稿；本次仍只分析和规划。

用户随后授权：

> 可以评审一下，最后确认最终架构方案进行设计

本轮执行独立架构评审、必要修订和最终架构设计收敛；不将该授权解释为恢复真实模型任务或产品实施。

- M0–M2 的历史验收不由本方案改写。
- [旧 M3 收尾交接](../agent-execution-20261013/handoff-paused.md)仍有效：实现未完成真实 Codex 验收与独立实施审查，不恢复付费试跑。
- 本轮建立新的架构决策输入，不创建平行旧 M3 低层计划，不宣称已替换自研执行链。
- 上一轮分析已发现 `orca serve` / `orcad` 候选路线；本轮补充协议、展示和 Windows 适用边界，避免重复全面扫描。

## 里程碑

- [x] 定向补充调研（运行时、展示与像素小院业务作用）
- [x] 最新范围与规划基线
- [x] 高层接入方案
- [x] 独立高层方案审查
- [x] 最终技术架构、初审修订与独立复核
- [x] P1-A Readiness
- [x] P1-A 低层计划与 Gate-2（初审 REVISE，修订后 PASS）
- [x] P1-A 离线工具实施、独立验证与实施审查（r1 REVISE，r2 PASS）
- [ ] 实际隔离运行和产品实施（本轮不执行）

## 文档职责

- `research.md`：实际代码、一手上游证据及未验证点。
- `clarifications.md`：用户最新范围、既有授权和规划基线。
- [architecture-final.md](architecture-final.md)：当前唯一技术架构设计入口，含选型、架构图、责任边界与分阶段验证。
- [review-7e31a9.md](review-7e31a9.md)：技术架构初审 REVISE，四项修订意见。
- [review-b92c4e.md](review-b92c4e.md)：最终架构独立复核 PASS，仅高层架构范围。
- `hlplan.md`：历史接入方案，保留原评审对象。
- `review_notes_hlplan_1.md`：独立高层评审；不替代 Readiness / Gate-2。
- `research_stability.md`：现有并发保护、稳定性缺口与 Python／Rust／数据库的一手依据。
- `research_agent_compatibility.md`：Orca 固定快照对 Pi／Hermes 等 Agent 的终端与结构化能力证据。
- `architecture-technical-supplement.md`：新增技术架构建议，区分现状、推荐、容量验证条件；原高层审查不涵盖此文件。

目录无 Git；不初始化仓库。所有旧产品、数据库和历史证据保留。

## 原接入规划的协调者补证与状态

- 用户最新“继续，啥情况了目前”按继续当前方案收口和询问状态处理，不扩大为账号接入或真实模型试跑。
- 协调者独立读取调研与高层方案全文，补读固定上游 SHA 的 Node entry、CLI serve launcher、Vite Web config、loopback bind 定义。
- 浏览工具连接失败，Python HTTPS 读取超时退出 1；随后 PowerShell HTTPS 精确读取退出 0，证实宽监听参数、Node sealing unavailable、完整 Web 构建入口及 loopback 常量。失败不作为来源不可用或运行失败的结论。
- 尚无本轮 Orca 构建、启动、浏览器、模型或迁移证据；上述仅为源码补证。

## 高层审查后的下一步

最终技术架构已通过独立复核，按 architecture-final.md 第 6 节准备下述 P1 准入；先前审查仍仅对原接入方案有效。Pi／Hermes 的终端配置已取证，完整结构化适配尚未证实；没有 Orca 本机运行或容量结论。

独立审查见 [高层评审](review_notes_hlplan_1.md)，对象为 `hlplan.md` 的固定 SHA-256 `F7178567796836772A584BA47AF55BD661C83DB89508FBC6A1C119355575FC2F`。该方案保留候选版状态原文；本页和评审报告承载最新审查状态。

先准备 P1 的 Readiness 和低层计划，不直接运行未经核验的默认 CLI serve。必须消费两条非阻断建议：

1. S1：记录固定版本部署步骤、升级适配范围与需维护的自有代码；后续比较维护成本，不把能启动当作迁移依据。
2. S2：启动前核实 Provider home、自动发现及正文读取边界；边界不清时只补源码证据，不启动 runtime 或完整 App。

方案中的 P1 是无账号、无私人正文、无模型任务的有界隔离验证；P2 是项目任务与真实会话关联；P3 才是明确额度与范围后验收真实执行、审批与取消。像素场景仍延期，旧 M3 保持原交接状态。

原接入规划收口时，协调者核对 73 个产品/测试/配置及工作台数据文件哈希，没有变化。该历史检查不代替本次技术补充的验证。两轮均仅处理本目录规划文档，不初始化 Git、不提交或推送。

英文提交消息建议（未来纳入仓库时）：`docs(architecture): define Orca reuse plan and defer pixel scene integration`。

## 最终架构评审与协调者核验（2026-10-14）

- 初审结论 REVISE，要求收敛唯一入口与迁移顺序、继承 HTTP 信任边界、明确运行时生命周期、明确准入覆盖。最终稿已逐项落实；独立复核结论 PASS，仅覆盖高层架构。
- 复核对象 architecture-final.md SHA256：`704CFA6BD29087F54FD60525E440999B48510786147A427BDB084190F7C6071A`。协调者全文读取最终稿和两份评审，独立核对文件哈希及本地链接；当前 70 个产品/配置/测试文件与本轮基线相同。
- N1 非阻塞导航建议已应用于 clarifications 第 4、5 节；只更新产物职责，未改变已评审的决策 5–8、目标和风险。评审中的 clarifications 哈希代表更新前输入，报告保留原样。
- 作者在文件落盘并回报哈希后，结束消息遇到 `Selected model is at capacity`。协调者已独立读取实际文件、核验哈希并取得新 reviewer 的独立复核，不把作者消息当作完成证据。读取大篇幅 skill 曾出现输出截断，相关正式规则此前已分段读全；截断输出不作为新增证据。
- 本轮仅文档核验，未执行产品测试、容量实测、Orca 安装/启动或模型任务。历史失败和未验收事项不因架构 PASS 消失。
- 下一步：P1 静态隔离与最小无账号启动/停止验证的 Readiness、低层设计和对应评审；之后才执行验证。HTTP 迁移独立推进；P2 元数据关联和容量/恢复验证在后续阶段。真实模型 P3 仍需明确恢复范围与额度。

英文提交消息建议（未来纳入仓库时）：`docs(architecture): finalize reviewed workbench technology design`。

## 本轮继续至实施前（2026-10-14）

用户原话：

> 继续，直到可以实现代码那一步

沿用现有 feature 和已定稿架构，授权连续完成补充研究、P1 Readiness、低层规划与独立评审修订，停止在 STOP_BEFORE_IMPL；无需在同一已授权范围内逐阶段重复询问。当前不写产品代码、不安装或启动 Orca、不读取账号/私人正文、不恢复模型试跑。第一批聚焦 P1 独立隔离验证工具及其操作合同，HTTP 迁移、P2/P3 保持后续独立阶段。

补充研究已落盘：[P1 实施前事实](research_p1_implementation.md)。首批收敛为 P1-A 独立离线预检，依据是 runtime 自动发现边界未闭合、daemon 退出并非终止、旧 OwnedProcess 全环境继承。真实 P1-B 启动与 Web/清理验证仍未准入；本次 Readiness 仅判断首批离线工具低层规划依据是否充分。

### 最近低层规划运行结果

- 最近自动运行结果：stopped_before_impl；当前为 ManualMode，无活跃自动会话。
- 最近自动运行结束原因：STOP_BEFORE_IMPL，满足用户“继续，直到可以实现代码那一步”的阶段目标。
- 最近自动运行日志：[auto_run_p1a-20261014.md](run_logs/auto_run_p1a-20261014.md)。

## 当前实施入口与验证结果

- [低层实施计划](lwplan.md)：当前唯一 P1-A 计划；新增 scripts/orca_preflight.py 与 tests/test_orca_preflight.py，已创建；当前实施与审查见本页末节。范围为 Windows x64 固定材料切片、参数/合成环境计划检查及固定 JSON 报告；运行仍未验证。
- [Readiness](review_notes_readiness_1.md)：PASS，仅允许 P1-A 低层规划。
- [初次 Gate-2](review_notes_lwplan_1.md)：REVISE；候选输入错误是否继续材料检查的测试与正文矛盾。修订将 CLI/root 早停、candidate 格式错误、candidate 缺失分成三类。
- [最终 Gate-2](review_notes_lwplan_2.md)：PASS，R1 已在文档层闭环。固定 pin/词法规则的维护成本记为非阻断 WARN；不扩展通用框架。
- 最终 lwplan SHA256：`00176EE73C925634FD783C06DF943FD8656C3348558B2981A8896CAC916FC452`。Gate-1、最终独立评审与协调者核验绑定同一版本。
- 协调者全文读取方案和评审，核对13项报告字段、19条本地链接、最终架构冻结hash及70个产品/配置/测试文件，退出0，无漂移。证据见 [协调者核验](../../../work/orca-p1-planning-root-verification.json)。这些是本轮文档/范围证据，未运行未来工具或产品测试。
- 本轮失败保留：公开源码补证遇 GitHub rate-limit、EOF/超时、缺文件；Git diff 检查因无Git失败；读取输出截断已定向补读；作者 rg 路径/无匹配退出1。均未当作成功。未取回的启动/发现/Web证据继续归 P1-U1–U5，不影响已限定离线工具的可编码性。

上一轮收口时按用户要求停在实施前，不发起实施；这是历史结果。本次最新编码授权已解除该停止点，当前已按 lwplan 实施两个文件，测试和审查状态见末节。真实 P1-B 启动/停止、Web/配对、HTTP迁移、P2/P3仍分别走后续准入；旧M3费用暂停、像素延期均保持。

英文提交消息建议（本轮文档）：`docs: finalize implementation-ready Orca preflight plan`。目录无Git，不初始化、不提交或推送。

## 本次编码授权与独立 UI 范围（2026-10-14）

用户原话：“可以开始编码了，你可以新启动一个session，然后也归到这个侧边栏，然后来实施代码，对了还有ui界面的优化展示，这个也要做一下”。来源会话 01a138a3-4bd9-77c1-a284-37c9485fbe57；本会话承接编码。

此授权解除 P1-A 的历史 STOP_BEFORE_IMPL，本轮进入 Impl，沿用已评审 lwplan SHA256 00176EE73C925634FD783C06DF943FD8656C3348558B2981A8896CAC916FC452，不改写冻结计划与历史评审。P1-G1–G3/P1-A1–A3 继续约束离线工具；其中“不改前端”只约束 P1-A，不排除本次另行授权的 UI 改动。

UI 为独立有界改动：依据实际 workspace.html/css/js 改善布局、信息层级、状态和响应式，保留业务交互与来源语义；本轮授权必要规划、审查、编码和验证，无需再次确认普通实现选择。UI 不接入 Orca、不伪造实时能力、不迁移 FastAPI/React、不恢复像素嵌入。短方案与独立验收证据另存 docs/current/workspace-ui-20261014。

运行风险边界仍为禁止 Orca 安装/启动、账号配对、真实模型/Agent试跑、产品派发；P1-B U1–U5 开放、旧 M3 费用暂停。协调者可启动自己拥有的隔离 fixture 预览并做浏览器检查；不接管已有服务，不读私人正文。两项分别验证并由未参与实施的 reviewer 审最终改动。

本轮重新保存70文件基线 work/implementation-20261014-baseline.json 与 UI 原文件副本；无Git，不初始化、不提交/推送。历史失败证据保持不变。



## 当前实施与独立审查（2026-10-14）

P1-A r1 两源文件已落盘；Impl、coordinator、reviewer各自完整重跑15项及语法，退出0。但独立Review(Impl)发现保留设备段扩展名前空格的遗漏，正式 [r1审查](review_notes_impl_r1_1.md) 为 REVISE/IMPL_DEFECT。root独立红测CON .txt退出1，证据 work/orca-p1-implementation/coordinator-reserved-path-red.txt。只补现有词法函数/测试，进入r2；不改变冻结lwplan或运行边界。

固定help替代argparse的偏差已由独立review裁定接受，首跑环境哨兵失败与完整栈保留。UI为独立范围，已取得158项浏览器fixture、101原回归、24Node和fresh review PASS，见 ../workspace-ui-20261014/README.md；此结果不替代P1-A补实施/再次审查。

第1轮审查时不能宣称整项请求完成；后续终态见本页末节。P1-B、实际Orca和所有运行U点仍未准入。最后更新时间2026-10-14（Asia/Shanghai）。

### 第2轮当前状态

r1审查R1已按原计划局部修补：逐段使用Python3.12 PureWindowsPath.is_reserved，补保留名大小写/父段与普通内部空格对照。Impl修前16方法中10失败子项、修后16项OK原始日志保留；root独立16项与py_compile均exit0，原CON .txt断言也从exit1到exit0。记录见 [r2实施报告](impl_report_r2.md) 与 work/orca-p1-implementation/coordinator-check-r2.md。

root以旧SHA认证逆向复原r1对象并核对真实r2差异，只设备判定和一个新增测试方法变化。差异辅助输出的GBK编码失败/exit1已保留，UTF8重跑exit0。冻结lwplan未变，原70文件只有独立UI CSS/JS变化；证据work/implementation-20261014-verification.json。

第2轮交接时新的fresh review_plan正在审r2最终对象，当时尚未收到最终结论；最终结果见末节。UI独立PASS保留，P1-B/真实Orca保持未准入。

## 本次授权交付终态（2026-10-14）

P1-A与另行授权UI两项均已验证并通过独立审查。本段为当前状态，前部阶段记录与冻结计划/历史审查保留原证据语义。

- P1-A最终两新增源文件 scripts/orca_preflight.py、tests/test_orca_preflight.py，按冻结lwplan实施；[r2实施报告](impl_report_r2.md)、[r2独立审查](review_notes_impl_r2_1.md) PASS/PASS。root独立16项/py_compile及原R1断言绿测均exit0。源码SHA与最终审查绑定一致。
- UI只改workspace.css/js；HTML相同，项目/任务/Agent/额度资讯层级、文字、状态、操作和响应式已落实。[UI交付与独立审查](../workspace-ui-20261014/README.md)；最终158浏览器fixture、101原回归、24Node/语法全部exit0，48张前后截图与可切换preview.html保留。
- 最终root命令 `python work/verify-implementation-20261014.py` exit0，独立核对两审查字段与四源文件SHA、冻结计划、70原文件范围及48截图。机器证据 [implementation-20261014-verification.json](../../../work/implementation-20261014-verification.json)。原文件只有独立UI的CSS/JS变化，其他原源码保持；没有接线或迁移。
- r1环境访问失败、r1审查R1、root原红测、r2新增红测10失败子项、工具探查/编码/截断及所有历史失败均在各报告原日志保留。没有以最终PASS抹除失败。
- 真实Windows特性、Node实物/ABI、完整bundle、Orca实际监听/Web/发现/daemon整套清理/真实环境未验。P1-U1–U5持续unverified、runtime_status=unverified、launch_admission=blocked；旧M3费用暂停、像素延期、HTTP/P2/P3保持后续独立范围。不是“Orca已接入”。

最终交付源码未在审查后继续变更；本次只回写状态。不初始化Git，不提交或推送。当前feature继续保留P1-B等开放工作，不将整个架构归档成已完成。英文提交建议：feat: add offline Orca material and candidate preflight；style(workspace): improve dashboard readability and responsive layout。r2局部修复建议见实施报告。最后更新时间2026-10-14（Asia/Shanghai）。
