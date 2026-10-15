# 方案评审记录：lwplan（第 1 轮）

**review_target**：lwplan；**评审对象**：唯一 `lwplan.md`，SHA-256 `ecfc9370ae1faec6bc0d697e9c64125228015f776d65b7d3beec99abebe9a300`。  
**评审时间**：2026-10-06（Asia/Shanghai）。**协议结论**：`REVISE`；**业务结论**：计划层缺口，需原地修订 LW，无新增用户决策，未命中 `PROBLEM_DEFECT`。**评审结论**：⚠️ 需修订；本轮不得进入 Impl。

## 输入与独立证据

已逐项读取 R13 原话 `source_materials/feedback_r13.md`（`04b89f4b`）、十节权威基线 `clarifications.md`（`69946abf`）、`research.md`（`f8c43e8e`）、Readiness r1 REVISE（`5656311e`）与 r2 PASS（`5873f608`）、唯一 LW、`work/r13-garden-plan-gate1.json`（自身 `passed:true`，记录 LW SHA 与实读一致）。实代码只读核对 `garden_native.py`（`347911e8`）、`garden.py`（`d32725f1`）、`gateway.py`（`8daabbe2`）、`web/garden.js`（`6ccffa07`）、`cockpit.js`（`be605c61`）、`index.html`（`14fb3558`）、`style.css`（`45108d1c`），以及 `test_garden.py`（`1a253ea3`）、`test_garden_gateway.py`（`f15b1d58`）、`verify_garden.cjs`（`17efada5`）、`verify_robot_cockpit.cjs`（`21b56788`）；括号内为本轮 `Get-FileHash -Algorithm SHA256` 前缀，完整 LW SHA 如上。R12 PASS 报告仅作兼容，未替代 R13 审查。命令均以退出码 0 返回；本次是规划审查，未执行产品测试，也未改产品。

## 可行性分析与独立复核

S1 身份→原生索引→固定 sessions 根→JSONL 白名单→有界响应的主链可执行。根来自现有父链及绑定的 `GardenService`，GET 先经 `gateway.py:143-146` 的 Host/Origin/client 守卫，计划在旧 `SESSION_ROUTE` 前加固定路由，不接 caller/root/path。`lwplan.md:53-57,61-78` 给出成员复核、精确 SQL、Windows 普通盘符与 `\\?\` 形式统一、组件级根归属、精确 `<actor UUID>.jsonl` 普通文件、4 MiB 文件/读预算、256 KiB 单行、6 条及 1200/7200 字符上限；同时以本机四个实际 child 的 0.83–1.77 MiB 文件和 98–135 KiB 最长行校正旧 64 KiB 草案。这是本机适用性证据，不把内部格式当稳定 API。只采 `response_item.message` + `assistant` + `commentary/final_answer` + `output_text`；损坏/超限/漂移关闭展示，源类型白名单不能保证正文内容级脱敏，计划已如实说明。

S2 将 `garden.py` 真实 `task.state/current_valid/receipts` 投影成已发生节点，`review_pending`、`reviewing`、`artifact_changed` 文案分别有边界，不从动画、`updated_at` 或发言推断实时进度。公开发言是独立按需 GET，首次自动选角不预取；点选时以代次、root、actor、当前选择和可见性淘汰迟到响应，纯文本渲染。S3 只在 garden 主题切换时恢复自由巡游，隐藏小院动作按钮，保留观察模式控制和 3D/像素/文字、角色拾取；旧画质不降。S1–S3 均分列 impl-safe 与 coordinator 真实环境证据及缺证据时的结论限制。

**阻断缺口 F1（G13.1 主屏可见性）**：R13 原话要“主界面清晰直观”，基线 G13.1 要主界面直接看出各伙伴的角色、负责事项、实际任务节点和关注结果。LW S2 `:90` 把角色、任务标题、阶段只放在角色卡，而现有 `index.html:26-65` 的整块 `robot-panel`（标题/模式/提示/摘要/3D stage）位于 `garden-panel` 及角色卡之前，`style.css:68-76` 在 574/360 宽把小院卡片排成单列。LW 的首屏验收 `:124` 仅要求“域/人数/当前结果与真实 3D 庭院”，没有要求任何**具体伙伴的角色、负责事项、阶段**在首屏可见，也未指定重排/紧凑角色摘要的 DOM/CSS 目标骨架。于是实施者即使完全照计划做，仍可交出须滚过 3D 才见伙伴职责的页面；`无水平溢出` 测试也无法发现。这是目标形态和验收的计划缺口，不是实现后的局部 bug。

## Gate-2

**Required Set 复核结果**：`PASS`。T3 继承 T1/T2：范围及 G/N、S1–S3 输入输出/关键锚点/步骤/验收/回滚、跨层接口、风险降级、分层验证与三元组、Gate1/2 均存在；`work/r13-garden-plan-gate1.json` 的静态存在性全为 true，独立阅读也证实存在。存在性不等于主屏目标已经充分定义。

**目标锁 / 反目标复核结果**：`FAIL`。G13.2/G13.3 与 N13.1–3 的规划未见冲突；G13.1 的“一眼看出具体伙伴工作”未被 S2 首屏目标和验证口径锁住，详见 F1。

| 反目标禁止内容 | LW 中可核查位置 / 结果 | 结论 |
|---|---|---|
| 动画、时间戳、发言冒充实时状态或百分比 | `:9-11,90-94,134` 只用账本阶段与收据 | 未踩中 |
| 外部 caller/root/path、目录扫描、跨根、整份日志或私有记录 | `:23-26,53-57,61-78` 固定根/精确索引/公开白名单/预算 | 未踩中 |
| 改 R12 账本/旧观察终端或降低 3D 质量人口 | `:9,19,130-160,166` 不改层、旧回归及同质 48 角色 60 秒门 | 未踩中 |

### Gate-2 关键复核

| 项目 | 结果 | 说明 |
|---|---|---|
| 关键实现锚点复核 | PASS | S1 `garden_public.py/read_public_messages` 与 `gateway.do_GET`，S2 `garden.js`/DOM/CSS，S3 `cockpit.update`/scoped CSS 均可定位；但 S2 缺主屏首视口布局目标，另列 F1。 |
| 代码片段充分性复核 | FAIL | S1 身份/HTTP、S2 按需请求、S3 主题伪码够判定主链；S2 对核心“首屏同时可见具体伙伴角色/任务/阶段与 3D”没有结构片段或 before/after 落点，旧 DOM 顺序又与其目的冲突。 |
| 作者体验门复核 | FAIL | 专用 helper 和独立读模型省事，但主屏布局取舍交给作者临场猜：要挪角色卡、加概览条，还是缩场景，均会影响响应式与旧画质体验，后续作者无法依计划直观实现 G13.1。 |
| 人工 review 对齐复核（总括项） | FAIL | 核心链路顺读 PASS、research 事实映射 PASS、跨包脑补需求 FAIL；总项随子项 FAIL。 |
| 核心链路顺读复核 | PASS | `§2` 现状→新增→不改层，随后 S1→S2→S3→验证/回滚可顺读。 |
| research 事实映射复核 | PASS | `:29-41` 把父链、原生路径/JSONL、四 actor 预算、收据、旧控件与性能差异映到实现和测试。 |
| 跨包脑补需求复核 | FAIL | 要从实际 `index.html` 的 stage-before-cards 顺序、CSS 窄屏折叠和 G13.1 反推出新的首屏角色呈现，LW 没有给可核查落点。 |

**P1-P9 协议合规核验表**：`PASS`。

| 协议项 | 结果 | 依据 |
|---|---|---|
| P1 | PASS | `:192-196` 不以任务数作质量门。 |
| P2 | PASS | `:192-214` 必备内容存在性为门禁基础。 |
| P3 | PASS | `:192-194` 任一缺失失败，无打分替代。 |
| P4 | PASS | `:196-214` T1/T2/T3 分型，T3 继承前两类。 |
| P5 | PASS | `:180-190` 关键新边界触发委托问题。 |
| P6 | PASS | `:178` 新假设/新风险/阶段切换的对齐留痕位置。 |
| P7 | PASS | `:180-188` 问题数由真实不确定性驱动，无上下限。 |
| P8 | PASS | `:180-188` 本轮未触发原因及 P0/P1/P2 批量模板。 |
| P9 | PASS | `:192-214` Gate1 作者、Gate2 fresh reviewer/coordinator 双阶段。 |

**基线与澄清一致性复核结果**：`FAIL`。`clarifications.md` 的“未回答”为空，现有决策无需再问用户；G13.2/G13.3 与 R12 继承边界一致，反目标未踩中。但 G13.1 明确“主界面能直接看出各伙伴角色、负责事项、实际任务节点和需关注的结果”，LW S2 的首屏断言没有具体伙伴三项；这是计划对已回答需求的弱化，不需重新澄清。

**设计味道扫描结果**：`FAIL: 内容层级把完整 3D stage 放在角色卡之前，却只用聚合数和验收摘要承接首屏；“角色是谁、负责什么、到哪一步”仍被推到折叠后的下方，主视觉与用户要看的信息优先级倒置。`

### Gate-2 结论

**Gate-2**：`FAIL`。S1 安全/预算与 S3 自主巡游方案可继续保留；S2 的首屏信息架构及可见性验证必须原地修订后重新独立 Review(LW)。本结论不声称当前产品已经违反 G13.1；评的是计划交付后仍可能合法遗漏该目标。

## 修订建议与后续行动

1. 在 S2 写明可执行的首屏 DOM/CSS 目标骨架：具体伙伴的名字、注册角色、当前任务标题、已证实阶段或无任务文案，至少一组应与小院人数/关注结果及真实 3D 在 360/574/1024 的默认视口中可见；角色多于一屏时说明摘要/列表入口与滚动关系。可用紧凑角色条或调整 panel 内顺序，但不要缩减 3D 画质/角色量，也不要把完整收据挤进首屏。
2. 给 `verify_garden.cjs` 与 coordinator 真页面核验加入视口内可见断言（元素矩形相对 viewport），覆盖四个实际 actor、长中文、无任务、`artifact_changed`/待复核；保留既定无水平溢出、键盘和三宽。明确不因 3D 截图好看而让角色信息离开首屏。
3. 只修当前唯一 `lwplan.md` 的 S2 结构/验收和映射表/Gate 自检；保持 S1 白名单、预算、隔离和 S3 旧观察兼容文本。重跑 Gate1，fresh ReviewLW 再判 Gate2。无需修改十节基线或请用户新增决策。

## contract drift / stale / mirror mismatch

Readiness r1 的 6–10 节缺口已由 r2 PASS 基线修复；本次读到的 LW SHA 与 Gate1 JSON 相同。R13 README 调研复选框曾落后于事实，属于状态页同步项，不构成本次产品方案新的 shared/runtime mirror drift；coordinator 归档阶段应同步，旧 R12 PASS 不作为 R13 的通过凭据。

---

## 跨功能事实（待确认）

### 架构与约束

- [2026-10-06] 当 3D 场景先于任务卡片放置时，“无横向溢出”不足以验证窄屏主屏的角色/任务可见性；需要对默认视口内关键元素作位置断言。这是 UI 验收口径，不涉及改变 3D 绘制质量。
