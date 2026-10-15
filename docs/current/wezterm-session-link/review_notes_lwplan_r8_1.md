# R8 独立 Review(LW)（第 1 轮）

评审时间：2026-10-05。评审对象：唯一 `lwplan.md` §11，123002 字节，SHA256 `FBF57196A188EFB73947D2AC1B0510FF9399984C2A72E820DA9A5F58B492E288`。结论：**PASS，仅方案 Gate-2 主检**；root 复核并明确放行后才能实施。本报告不宣布真实定位或整套工作台稳定。

评审者未参与 R8 方案或四路径产品实施；先前 R6 native 作者身份不用于审查 R6。完整读正式 §15/source/README、R7 ReviewImpl、当前 terminal/service/test_focus/test_observation、§11、冻结 manifest 和 Gate1 源码及完整 stdout/空 stderr；旧 LW 以精确 104467 字节前缀核对，未泛读替代当前合同。

本轮实际独立命令：`.venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-lw-r8-review-check1.py`，工具 `05d704`，恢复后重复 `84841f`，两次 **exit 0，14 项全部 true，failures=[]**，完整输出已读。证据 [review-evidence1.json](E:/project-funny/mianban-develop/work/wezterm-focus-lw-r8-review-evidence1.json)。该校验独立重建补丁，核 29 产品、23 输入、四份 before、作者实际 Gate1 29/0 和当前 AST/原时间位置、完整机制清单及关联；只本地文件/AST/JSON，没有产品执行或真实运行操作。manifest SHA `CC7C155A9EB028BF28B159CD83EDAADA7FF78898C3F2090936021A132E39BB19`。

## 1. Required Set 复核结果：PASS

按 T3 审查。T1.1–13 均存在有效内容：§11 起始给目标/反目标/不改层；11.1 给主链、事实映射和接口；S1/S2 各给文件与首落点、步骤/依赖/验收/回滚、G/N、作者体验和三层证据责任；11.2 给实际 Gate1、双 Gate、澄清模板、风险与失败出口。T2 输入输出/几何和时间边界/回归范围、T3 私有接口矩阵/公共兼容/无迁移/unsafe-stop 俱全。以内容存在及可执行性判定，未用任务数或探针绿代替门禁。

## 2. 目标锁 / 反目标复核结果：PASS

G3 下沉为 same-tab 省无效 goTab、唯一 up 候选、同 force 清单去重以及完整终验；G1 unknown 和 G2 连接规则不改。root 必须实测新实例五起点各三轮，包括跨 tab 保存错误 5、错误 2/4/5 与已在目标，两个原 5000ms 窗口都成立才确认。

| 禁止内容 | 可核查位置与判断 | 结果 |
| --- | --- | --- |
| N1 复活/创建/输入/改 D 或其它进程 | §11 范围、S1 三元组、11.2；作者只 local/mock，真实测试仅 root 既有授权 | 未命中 |
| N2 来源/reader/MCP/图形/CSP/时间合同扩大 | §11 两源码两测试、其余 25 不改；11.1 原始时间起点，S1 共同 final | 未命中 |
| N3 IPC/守护器/通用框架/关闭旧缺证 | S1 原 helper 和短列表，11.2 原拒绝/回滚及旧边界 | 未命中 |
| 跨请求库存缓存、旧成功充当前或省 final | 11.1 私有 forced pair、S2 A→B/失败与零动作后验 | 未命中 |

## 3. 关键实现锚点复核结果：PASS

首读 `SessionService.refresh_observation` 的 cache/末尾 return，`Terminal._focus_session` 的 force/重复 inventory/唯一 caller，`_focus_candidates` 的 geometry 指纹及 `_focus_next` 的当前位置/动作选择，再看两个测试类。私有签名、四字段类型与唯一坐标、pre 真实 singleton pane、失败返回和 full final 均明确。没有删除函数链或未经定义的产品落点。

## 4. 代码片段充分性复核结果：PASS

S1 两段骨架闭合 producer→caller→原库存前检/deadline/pins/pre→bounded route→每动作 client/version/full panes→共同 final；已解析骨架 AST。`original_*` 明确不是新增函数。Service started 仍在远端前，refresh_finished 紧跟返回，deadline 仍在库存/年龄检查后、pins 前；零动作也先检查时间并继续完整 final。必要顺序不需作者猜测。

## 5. 作者体验门复核结果：PASS

只在原 Service 函数加私有可选 pair，保留默认 dict/cache；原 helper 使用指纹末项组成小几何表，沿用 runner/clock/fakes。没有策略层、返回类型框架、通用寻路或新模拟器。S2 明确 legacy fixture 不补几何、仅 strict fixture 补官方字段，修改路径直观。

## 6. 人工 review 对齐复核结果：PASS

核心链路顺读 **PASS**：11.1 在工作包前串起旧链、去重和路线改动、原终验。research 事实映射 **PASS**：官方直接边界/严格重叠/active_at、隐藏与 stack 不可证、真实循环和成本、重复 force 清单各映射代码/测试/验证口径。跨包脑补需求 **PASS**：S1 与 S2 的依赖和共享三层责任显式，未要求 reviewer 自行恢复接口或 guard。总括由上述三项成立。

## 7. P1–P9 协议合规核验表：PASS

| 项 | 结果与依据 |
| --- | --- |
| P1 | PASS；没有最低任务数质量门；三轮是特定实机验收而非通用门 |
| P2 | PASS；11.2 与本报告按必备内容存在性核验 |
| P3 | PASS；任一 Required/Gate 缺失不放行 |
| P4 | PASS；显式 T3，含 T1/T2 及私有跨模块接口/兼容/unsafe-stop |
| P5 | PASS；口径不唯一强制回上游 DELEGATE_QUESTION |
| P6 | PASS；11.2/source 为新路线、复用和阶段切换留痕位置 |
| P7 | PASS；无澄清数量限制 |
| P8 | PASS；P0/P1/P2 批量模板齐备，当前无未回答项 |
| P9 | PASS；作者实际 Gate1→fresh ReviewLW/root Gate2→另行实施放行，失败回环 |

没有指挥递归派发；作者和本 reviewer 的真实 CLI/helper/HTTP/SSH/GUI/Win32/服务/D/Git 禁止边界保留。

## 8. 基线与澄清一致性复核结果：PASS

§15/source/README 与 §11 的同 tab skip、unique-up、同次 force pair、四文件范围一致；未回答项为空，无新用户决策或目标漂移。唯一 up 只是动作候选：空 group 不能证明非 stack，实际 no-op/错误 pane/几何变化必须立即停，不能后续随机 next；仅事前方向歧义才原 next。pair 必须 force 且本次刚用于 merge，不存 cache/attribute/public schema；失败仍 unknown，不追加查询绕过。四个实际 before 与上一轮 tested bytes 一致，整份原实施前缀和五个修订标签段均保留。

## 9. 设计味道扫描结果：PASS

未发现当前计划要求无关重构或过度抽象。选择 unique-up 而非同时引入 previous/通用寻路，与实际 5 两步成本超龄相符。同请求清单复用是当前路径去重，不承诺调度波动下必达预算。public stack/hidden 信息不全和非原子观察是已声明限制，由每动作实际核验与完整 final 收口，不允许缩减守卫。

## 10. Gate-2：PASS（仅本 reviewer 主检）

没有当前方案阻断。交 root 独立复核并明确实施放行；作者先同成本症状 red→green、完整拒绝回归及精确四路径 diff，root 再当前全量和 15 轮实际五起点矩阵、HTTP/IAB/UUID/正文隔离，fresh ReviewImpl 最后复核。当前 4/5→3 probe 的 1156/859ms 只证明机制，不是 R8 产品预算成功；R7 147/0 与 cross 正例也不能覆盖 R7 next 超龄红。

失败保全：R7 next 在 4→5→2 后 age5218ms 拒绝、成本 red 和 ReviewImpl REVISE/PLAN_DEFECT 保留；R8 cycle 前两次 creation-time/tuple-list 诊断错误发生在动作前，第三次环路正例不抹去它们；新启动 premature-marker 匹配到 user 文本的 exit1/一条正文保留，后来同 UUID/PID 得到两条正文，不是重启第二次。作者 manifest 误读 dict/list KeyError 和 up 长输出截断补读保留。本 reviewer 预读聚合截断及一次默认 stdout 编码不可读已定向 UTF8 补读，未当完整证据；本次 14 项正式校验无失败。此前 R5/R6、Gate1 和旧运行失败及 owned 失败回收/父 Q6/Codex 正文活动/48角色性能/真实自动合作缺证沿用 R7 正式记录，不在本次关闭。

英文提交建议：`fix(terminal): reuse fresh pane evidence and focus the unique upper target`。
