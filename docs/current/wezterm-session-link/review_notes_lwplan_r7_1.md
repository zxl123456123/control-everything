# R7 Review(LW) 独立审查

review_target=lwplan；review_round=R7；review_seq=1；review_date=2026-10-05。协议结论：**PASS**。这是精确定位路线收敛的方案 Gate2，不是实现、实机定位或整个工作台稳定性的结论。

独立性：reviewer 未参与 R7 方案或 terminal/test_focus 实施；此前仅实施 R6 native 两文件，本报告不复审或替自己放行 R6。使用 plan-review、implementation-planning 与 verification-before-completion 的当前合同；只读取本地文件、解析既有证据并写自己的报告/校验产物，没有产品、HTTP、SSH、真实 CLI/helper、GUI、服务、D:、Git 或递归动作。

## 输入与本轮实际验证

已读当前最终 §10、clarifications §14/source、当前 README、预算研究、固定 0.45.1 官方源码研究记录、实际 terminal/test_focus、准确 before、原实际 phase 与 Gate1 全部输出。没有把旧 90756 字节全部再泛读；它们按准确字节保留并使用已读的原 §8/§9 合同。

| 冻结输入 | 当前 SHA256 |
| --- | --- |
| 唯一 lwplan，104467 字节 | 58983B88406DE957626683955EBCC8724B43C6B3F227AEA58841026B71552EFC |
| input-manifest | A93CD6FE363C6F7A65AAF308C1C881AEF41E0881899DF92804369893921C4908 |
| clarifications §14 所在文件 | ACC9D20B35D9982D1989CD1F366D2D0A3E26DC17D71E298FFE52EF19CBB3DDD4 |
| resume_context_r7_focus_budget | 115F02D31A118B3FC6DFFECE9869BBE6BC64E59CA89D0A9855737505E8F8E860 |
| feature README | 795DEFCCD11DE110ECD2C514D98E57E268264960D49E3A2D44785D14391D5538 |

本轮独立实际命令：`.venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-lw-r7-review-verify1.py`，tool chunk `8e3409`，**exit0，16 检查、0 失败**，完整输出已读；证据 [review-evidence1.json](/E:/project-funny/mianban-develop/work/wezterm-focus-lw-r7-review-evidence1.json)，命令源 [review-verify1.py](/E:/project-funny/mianban-develop/work/wezterm-focus-lw-r7-review-verify1.py)。检查准确 before+append、完整 patch 重生成、当前全部29产品/16输入、两产品 AST 和原字节、47事件/6清单全字段相等/4份完整关联、实际年龄与模型算术及 Gate1 红绿保留。不是字符串数量证明产品正确；以下语义判断由 reviewer 独立读原文和现有控制流作出。

## 1. Required Set 复核结果：PASS

主要工作包为 S1-R7 控制路线和 S2-R7 行为回归。按 T2 消费完整 T1，沿用原高风险 T3 合同；没有把它简化成仅文件清单。

| Required 项 | 独立复核依据与结论 |
| --- | --- |
| T1.1 目标/反目标；T1.2 文件与首落点 | §10.1 指向 G3，保持 G1/G2/N；S1 `_focus_session` try、S2 `FocusFallbackTests` 可以直接定位。PASS |
| T1.3 目标、步骤、验收、回滚、依赖与形态；T1.4 每包 G/N | S1/S2 各自交代正式 Gate 依赖、目标行为、失败含义、只撤本轮增量及同一 G3/N。PASS |
| T1.5 三层证据、owner、缺证约束；T1.6 作者体验 | S1 三元组、S2 本地命令与 root 真验、fresh ReviewImpl；复用原函数/fake/clock。PASS |
| T1.7 主链；T1.8 research 映射；T1.9 片段闭环 | §10.1 现状→目标顺序及事实映射；S1 骨架含 route→唯一完整 final→共同失败/成功。PASS |
| T1.10 Gate1 显式四项；T1.11 双 Gate 与回退 | §10.2 明列目标、验证分层、证据责任/不足、作者体验；Gate1 不自行放行产品，Gate2/root 必须承接。PASS |
| T1.12 澄清触发与模板；T1.13 风险/降级/复核 | §10.2 写明目前不触发的原因、P0/P1/P2 批量模板、事件留痕、超龄仍 unknown 与 reviewer 必检。PASS |
| T2 接口、边界、测试层次与回归 | §10.1 私有接口保留；S2 成本 red、多步/无 next/旧 exact 正例与原拒绝集合明确。PASS |
| 原 T3 兼容、接口、迁移、停机与回滚 | 原 §8/§9 支撑字节不变；无持久迁移、新开关或新停机；仅 root 按归属加载自己的网关，不清 latch、不撤 R6。PASS |

## 2. 目标锁 / 反目标复核结果：PASS

用户要从面板关联真实对话并可靠进入对应终端；当前失败是 target 已移动但证据超龄，减少 strict 重复路线可追溯 G3。G1 诚实 unknown、G2 连接规则保留。预算收益只是当前样本的模型，不能代替真实能力稳定。

| 禁止内容 | 当前方案可核查证据 | 结论 |
| --- | --- | --- |
| 键盘/字符发送、创建/复活/清理终端、D: 修改 | §10.1 N1/N2/N3；S1 仅现有 tab/next 或旧 exact | PASS |
| 扩大布局或跳过身份、实例、slot、唯一 client、pins、锁/latch | S1 前检原样、每步 `_focus_next` 不变、完整 final 全关联与实际 pane 必须同时成立 | PASS |
| 延长5秒、移动 deadline、重置 age、旧缓存当当前证据 | S1 原创建位置/refresh_finished 累计 age；S2 成本真实累加与迟到拒绝 | PASS |
| Service/source/Workbench/native/MCP/UI/reader/CSP、依赖/-S 或策略框架 | §10.1 两文件限制；S1 原 helpers 实际字节保留 | PASS |
| 用本轮局部绿关闭 owned 回收、Q6、Codex 正文/活动或图形性能 | §10 开头、S2 与 §10.2 明确保留这些未验收边界 | PASS |

## 3. 关键实现锚点复核结果：PASS

S1 首落点是 `session_panel/terminal.py::_focus_session` remaining 检查后的现有 try：`_focus_candidates` 成立时直用 `_focus_next`，否则原 exact；再共用一次完整 `Workbench.observe/list_panes`。`terminal_id/parse_slot_command/parse_clients/_focus_candidates/_focus_next/list_panes` 保持字节。S2 是 `tests/test_focus.py::FocusFallbackTests` 动作序列/clock/final 注入；only route expectations 可调整，版本非0、关联替换等拒绝例不删除。两文件当前与 before 完全相等、AST可解析，产品尚未实施。

## 4. 代码片段充分性复核结果：PASS

路线与共同终验变化触发骨架要求。S1 片段准确给出插入边界、strict/nonstrict 分流、原返回语义、完整 final 和最终判定。周围文字补齐 strict final inventory 非0保留 exit，nonstrict 旧后验语义，以及所有共同 final 守卫；无需让 reviewer 补脑，也没有要求作者照抄虚拟 `original_*` 为新抽象。没有删除整条函数链或显著专用逻辑，完整删除清单触发条件不成立。

## 5. 作者体验门复核结果：PASS

后续作者只在现有 try 收敛一个 if/else 和共同 final，原 helpers 无职责迁移。测试沿用 fake runner/clock、按真实可观察调用累计成本；没有 Zellij 模拟器、通用 guard 或调度器。原拒绝断言的调用锚点变化已明确，作者能直接判断哪些 expectations 应改、哪些行为必须保留。≤100行是范围偏好，不是放行数量硬门槛。

## 6. 人工 review 对齐复核结果：PASS

| 子项 | 独立判断 |
| --- | --- |
| 核心链路顺读复核 | PASS。§10.1 现状/改动/不改层→S1 route+final→S2 回归/真验→§10.2 owner/Gate 可顺读。 |
| research 事实映射复核 | PASS。官方固定版本 synthetic-client exact no-op 与 tab/next fallback、实际1125ms重复成本、完整 final 安全下限各有实现和验证锚点。Service freshness 去重、每步省version、-S 未并入。 |
| 跨包脑补需求复核 | PASS。S1 已闭合共同 final，S2 仅验证它；无需跨包补出未写的身份或预算判断。 |

## 7. P1-P9 协议合规核验表：PASS

| 协议项 | 结果与依据 |
| --- | --- |
| P1 | PASS。§10.2 不以任务数量作为质量门。 |
| P2 | PASS。Required 存在性与关键内容齐备为核心。 |
| P3 | PASS。缺锚点、片段、owner或必备内容即失败，非数量打分。 |
| P4 | PASS。T2 含 T1 并保全原 T3，分型明确。 |
| P5 | PASS。口径/基线/回滚不唯一必须受控提问，当前 §14 已明确，不虚设用户批准。 |
| P6 | PASS。R6恢复、超龄新失败、路线改变、阶段切换留痕在 §10.2/§14/source，无固定次数。 |
| P7 | PASS。未给澄清数量设置上下限。 |
| P8 | PASS。P0安全/P1预算/P2展示的批量 A推荐/B代价/Q1=A 模板明确。 |
| P9 | PASS。作者实际 Gate1→独立本 Gate2/root 明确实施放行→实施后 fresh review，不递归。 |

## 8. 基线与澄清一致性复核结果：PASS

§14 与恢复 source 的 strict 直接路线、nonstrict 原 exact、两文件、原5000ms及完整 final 均在 §10 对齐；README 正确标为 R7 规划和实机待证。§14 明确无未回答用户问题，没有漏记本批阻断性新决策。原90756字节前缀逐字保留，实际5个修订章节都有说明/tag；不存在普通修订删除已实施支撑文本或职责镜像漂移。

manifest 中 `formal_gate1=PENDING` 是自检前冻结元数据，后续实际 gate-result 已 exit0，root 当前28项检查全绿；`gate2=PENDING/allow_enter_impl=false` 则如实记录进入本审查前阶段，不篡改该冻结产物。这些阶段记录不构成第二权威方案。

## 9. 设计味道扫描结果：PASS

没有新策略抽象、配置、常驻进程、状态缓存或跨层改动。仍有每步多CLI启动及完整前后观察的成本，但属于原守卫合同；不为降耗静默搬预算或省字段。过程非原子、next多步可能继续超龄，已给诚实降级和 root 真验责任，不将风险包装成成功。

## 10. Gate-2：PASS

allow_enter_impl: **yes，限本报告冻结的 R7 两文件方案，仍须 root 独立复核并明确实施放行**。reviewer 不实施。无 P1/P2 阻断性方案缺陷，不需要新增用户决策。任何输入或语义漂移须重新核 Gate。

作者下一步必须先新增有效成本 red，再局部实现/green、准确 diff/manifest及原拒绝回归。root 必须真实从其它tab和目标tab错误pane出发，后者实际执行 next；每次独立实际client exacttarget、完整关联/slot/fingerprint、远端实例累计age及原动作 deadline 全成立才计确认。missing/late/busy/non0 都保留，不能用已在 dev 或旧性能模型收口。当前实际 phase 没有 next，不能继承它为 next 正例。

## 失败与证据不足保留

- 作者第一 Gate1 **28检查/1失败/exit1**，`work/wezterm-focus-lw-r7-gate-first-result.json` 完整输出已读：`revision-and-scope` 错要求“六个”章节，实际五个均有说明/tag。后续只改检查器为各实际章节存在性核验，同一 authority/manifest 得28/0/exit0，首红未覆盖。root 新28项也全绿，不代替本 reviewer 判断。
- 本 reviewer 读错猜测 source 路径 `resume_context_r7_focus_timing.md`，chunk `ede9b1` **exit1**；改读基线明确链接的 `resume_context_r7_focus_budget.md`，`56c304` exit0。本轮重复聚合技能、phase inventory introspection及宽 rg 输出发生截断（`f62932` 所在聚合、`d44db4`、`aaa9f7`）；技能已有完整原读，相关关键合同定向补读，phase全字段基于原完整读及本轮准确JSON解析/逐项相等/47条紧凑时序，未把截断输出算全文。独立正式校验没有失败或截断。
- 当前真实 R6-after phase **exit1/focus_sent_unverified**：所有CLI exit0、client最终到 terminal3，仍未确认。独立按实际返回row计算远端age **5765.000ms**，动作窗口3766ms；删重复成本1125ms只推出同耗时模型4640ms（方案约5766/4641为1ms取整差），不是实机 R7 正例。source/§14 的近似值不混成独立实测。
- 已读的历史 R5 exact no-op、版本吞码 red、loaded-first **26检查/10失败/exit1**，旧 native窗口红与 R6重采样 red→green 保留；本报告不把 R6 的局部独立 PASS 扩大为定位已稳。旧 r4 ReviewImpl BLOCKED、真实 owned 失败回收、父 Q6、Codex 正文/实时活动仍独立待证；旧图形12机器人 p95 20ms超过16.7ms目标也不由本次关闭。研究的错误路径/404、长读截断及早前测试失败由原研究/实施记录继续保全，没有拿本轮 plan PASS 覆盖。

本报告无新增跨功能事实。英文提交建议（后续实际实施验证后）：`fix(terminal): focus strict tiled panes without redundant exact-id probes`。
