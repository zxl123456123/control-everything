# 方案评审记录：lwplan（第 1 轮）

review_target: lwplan  
评审时间：2026-10-13（Asia/Shanghai）  
评审对象：`lwplan.md`，SHA256 `c1a1003c15c94bc2a4f54df2c3f8931d864bafdc6fbd24855554f502ac4a3485`  
协议结论：**REVISE**  
allow_enter_impl: no

方案的架构、范围和主要实现路径可用；需修正验证责任及证据文件合同后再进入实施。无需新增用户决定，不回退长期架构，不扩大本轮范围。

## 可执行修订项

### R1：浏览器 fixture 被错误归入 impl-safe（阻断）

- **证据**：`lwplan.md:227` 写“impl 自证：Playwright fixture”；`:249–259` 在“impl-safe 命令由各组执行”下列出三个浏览器 harness。S6 又规定真实运行由 coordinator 承接，不能消除前述冲突。
- **权威合同**：`C:/Users/ZXL/.codex/skills/safe-code-changes/SKILL.md` 的“impl-safe 验证边界”将“依赖外部服务/数据库/浏览器/远端 CI 的集成或端到端验证”列为黑名单；命中后 impl 不得自行运行。基线第 4 节也将浏览器交互交由 coordinator。fixture 使用合成数据仍需真实浏览器。
- **影响**：UI 实施者依计划执行会越过验证职责；同一证据会被同时当成 impl 自证和 coordinator 承接，不能给 Required Set 放行。
- **修复**：S4 的 impl 只编写 harness、执行 JS/HTML/CSS 可行的静态/语法检查和 PowerShell 解析检查；新旧浏览器 fixture 都由 coordinator 运行。第 6 节拆清两组命令、日志执行主体及缺证据时不能宣称 UI 行为通过。S4 可指定测试用例，但不能指派 impl 执行浏览器。

### R2：实施报告未落到正式轮次证据合同（阻断）

- **证据**：S1–S5 仅命名 `impl_backend.md` / `impl_ui.md`，`lwplan.md:241` 指向 `impl_report.md`；计划没有说明由谁汇总正式 `impl_report_r{n}.md`，也未约束必填字段。
- **权威合同**：safe-code-changes“强制产出实施报告”要求每轮 `impl_report_r{n}.md`，包含基本信息、变更事实、目标对齐、impl-safe 执行记录、coordinator 承接项、contract 漂移、风险和回滚；Review(Impl) 必须引用对应轮次报告。
- **影响**：实施者虽各自提供说明，下游仍缺唯一正式评审输入，尤其无法可靠区分两类验证记录。属于证据合同缺口，不是产品方向缺陷。
- **修复**：保留分组报告作为支撑，明确 coordinator 收敛生成 `impl_report_r1.md`，逐组保留执行主体；列出上述必填字段和证据三元组，后续轮次不覆盖历史。无需新增更多报告层次。

### R3：最终截图格式与已选工具输出不一致（随修订纠正）

- **证据**：`lwplan.md:228` 写最终 PNG，`:261` 固定四个 `.png` 文件。feature README 的 17:23 状态记录与 root 本次委派明确最终 CUA 截图为 JPEG。
- **修复**：将最终 CUA 产物命名为 `.jpg`，验证文件内容与扩展名一致；不能只将 JPEG 字节改名为 PNG。浏览器 fixture 可保留其真实 PNG 格式并带 fixture 标识。此项不改变 G3 的预览要求。

## Gate-2

**Required Set 复核结果**：FAIL。按 T3 复核 S1–S6；目标、接口矩阵、状态/错误、依赖、回退和实现锚点存在，但 R1 的验证分层不合法，R2 的正式证据承接缺失。不能以“写了验证章节”替代有效责任合同。

**目标锁 / 反目标复核结果**：PASS。G1–G3 与各工作包有明确映射；M0–M2 管理面、M3–M4 未实现边界保留。

| 禁止内容 | lwplan 核查证据 | 结论 |
|---|---|---|
| 假进度、活动、额度或账单 | §1 N1；§3.3 manual_recorded/unknown；§3.5 真实结果与人工来源；S4 | 未命中：未查询、不可用和人工记录分开 |
| 自动推理、审批、取消、凭证/CLI/全局变更 | §1 N2；§3.3 dispatch/cancel/approve=false；S2 三方法只读序列 | 未命中：任务指派不发送任务 |
| 迁移覆盖旧数据、重写全栈、无关清理 | §1 N3；S1 独立库；S3 新分支；S4 仅旧 HTML 入口；§6 | 未命中：保留旧 JSON、小院与新库 |
| 公网监听、假原生 App 或假手机连通 | §1 N4；§3.1 loopback；S5/S6；§7 | 未命中：Edge 应用窗口、响应式与远程分开 |

**关键实现锚点复核结果**：PASS。S1 的 WorkspaceStore/WorkspaceService、S2 的 CodexQuotaSource/NewsSource、S3 的 do_GET/do_POST/make_server/serve、S4 的 api/post/分区 render、S5 的固定 URL/Edge/Start-Process 和 S6 的交付文档均可定位；实际 gateway 保护和 garden_body 与计划相符。

**代码片段充分性复核结果**：PASS。§3 请求/响应合同与 §4 网关 → 验证/存储 → 只读 source → 前端回执片段覆盖新增跨层主链。现有函数不做整链删除，不需要补大段最终代码。

**作者体验门复核结果**：PASS。SQL、投影、source、UI 各自有职责，gateway 独占写入；有限 Provider 分支无需插件系统。共享 §3 减少双端猜字段；旧功能只增加入口，回退清楚。

**人工 review 对齐复核结果**：PASS，基于下列三个子项；验证责任缺陷由 Required Set 与基线一致性单独判定，未隐藏在总评中。

| 子项 | 结果 | 证据 |
|---|---|---|
| 核心链路顺读复核 | PASS | §2 现状/改后/不改层 → §3 接口 → §4 闭环 → S1–S6；无需拼主业务流程 |
| research 事实映射复核 | PASS | §2 显式映射旧存储、unknown、-32603、旧版无 usage/read、CLI、RSS、loopback，并指向测试与真实证据主体 |
| 跨包脑补需求复核 | PASS | UI/backend 使用同一 §3，来源失败与输入状态完整可读；R1/R2 已定位为明确合同修订，不要求实施者自猜 |

**P1-P9 协议合规核验表**：PASS。这里核验规则是否存在；不以此抵消 R1/R2 的具体执行合同缺陷。

| 协议项 | 结果 | 证据 |
|---|---|---|
| P1 | PASS | §8 明确不以任务数作质量门槛 |
| P2 | PASS | §8 以必备项存在性为门禁；本报告按 R1/R2 拒绝实际放行 |
| P3 | PASS | §8 任一缺项不放行，无加权评分替代 |
| P4 | PASS | 文件开头选 T3；§3 接口矩阵、S1–S6 锚点、§6 兼容/停机覆盖 T1/T2/T3 递进要求 |
| P5 | PASS | §7/§8 关键不确定性触发 DELEGATE_QUESTION；事实缺口走 DELEGATE_ACTION |
| P6 | PASS | §7 事件触发对齐，指定本节/impl 报告留痕，不设次数 |
| P7 | PASS | 未对澄清问题规定数量上下限；“一张截图”是产物要求，与问题数量无关 |
| P8 | PASS | §7 说明本轮未触发原因，提供按 P0/P1/P2 批量模板 |
| P9 | PASS | §8 分开作者 Gate-1 与独立 Gate-2，说明失败回退；无递归委派要求 |

**基线与澄清一致性复核结果**：FAIL，仅限 R1 的验证责任偏离和 README 已记录的 R3 格式未同步；无产品目标漂移。

- 未回答的阻塞 Q&A：空。ocra/dsh 名称假设继续标明，用户自主授权覆盖普通阶段，不重复确认。
- 目标锁：PASS；反目标：PASS，依据上表。
- 头脑风暴产品决策：未违反。任务手工来源、账户 -32603、日用量未知、手机远程未实现继续显式表达。
- 验证责任：FAIL；基线第 4 节与 safe-code-changes 必须在 S4/§6 保持一致，按 R1 修订。

**设计味道扫描结果**：PASS。未发现需要扩大架构或增加抽象的阻断异味；R1–R3 是可局部修正的执行/证据合同问题。

**Gate-2**：FAIL。

## 验证记录与 contract drift

- 已复读 plan-review、clear-expression、safe-code-changes 的权威边界，以及 implementation-planning 的 T1/T2/T3 Required Set。已读本轮 README、基线、hlplan、research 三份、Readiness、lwplan 与接口原文；并核查实际 gateway/progress/Codex 索引和浏览器 harness 入口。后者确实启动 Edge/Playwright，不能被 fixture 名称豁免。
- 只读断言命令 `.venv/Scripts/python.exe -c` 于本轮退出 0；已读完整输出，确认 S1–S6、输入文件、关键合同章节、R1–R3 原文和被评审文件哈希。此为文档审查证据，不是产品测试。
- 两次过大的批量读取输出出现截断；关键计划段、权威 impl-safe 定义、源码与修订锚点已定向重读。没有在此轮运行产品、浏览器或真实 Agent。
- 已观察的 drift：R1 的浏览器归属、R2 的正式轮次报告、R3 的截图格式。范围仅本 feature 计划；不需要修改 shared skill、基线产品需求或旧 feature 历史。

## 后续行动

原作者窄修订 R1–R3，保留现有主链、接口和目标；然后复核修订位置及 Gate-1/Gate-2。无需 DELEGATE_QUESTION，也不需要重复全量业界研究。Gate-2 未转为 PASS 前实施者仅可读取准备，不可开始业务改动。

无新增跨功能事实。
