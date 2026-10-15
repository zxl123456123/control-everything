# 方案评审记录：lwplan（第 2 轮）

**review_target**：`lwplan`；**评审对象**：唯一 `lwplan.md`，SHA-256 `5bdd2f2dcc8175b9d52d9b41c74c91353d67fd494af5d63c83d8425c68ec7ca4`。  
**评审时间**：2026-10-06（Asia/Shanghai）。**协议结论**：`PASS`；**业务结论**：`PASS`，未见 `PROBLEM_DEFECT`。**评审结论**：✅ 通过；允许 coordinator 复核输入 SHA 与 Gate-2 后进入 Impl。本结论只放行方案，不声称 R13 产品或真实页面已经通过。  
**前一轮评审**：`review_notes_lwplan_1.md` 为 `REVISE`，F1 是窄屏首屏没有具体伙伴角色、负责事项、阶段的可执行落点。

## 输入与独立检查

| 输入 | SHA-256 |
|---|---|
| R13 原话 `source_materials/feedback_r13.md` | `04b89f4b7f827bffb3e551618391ac788bd85cfa8de47d6d8b583559506a0d7f` |
| 十节基线 `clarifications.md` | `69946abf8633c19bd79153f8a3efbda98cd8688952c8b01be6dc3b65badd78b2` |
| `research.md` | `f8c43e8eaaf82487fc925cb5c33b883b87c7855db99a303ab91969b83f600fb0` |
| Readiness r1 / r2 | `5656311edc3cd200fc7542f515f49f75891ce8d167338e9b73c3c5f80edc3047` / `5873f608d1c836103464bfbdf127a7942c5ae28938e095f1afbcdb97eaa2abb` |
| ReviewLW r1 红件 | `e94810e048133f5e7ebd5ab0001cff5d10e56fb5cead58f2453d314d6b9ae984` |
| Gate1 r2 `work/r13-garden-plan-gate1-r2.json` | `1de1c050ace3aa7334356207a033c7c3b7bc76cd96ec3cbdbf8ee9f2a060234` |

独立复算 LW SHA 与 Gate1 JSON 的 `sha256` 完全相同；Gate1 记录 15 项存在性检查均为 `true`、`failures=[]`、`exit_code=0`。我逐节读了唯一 LW、原话、基线、研究、两轮 Readiness、首轮红件及 Gate1；又读实际 `web/index.html`、`style.css`、`garden.js`、`cockpit.js`、`session_panel/garden_native.py`、`garden.py`、`gateway.py` 与现有 `tests/verify_garden.cjs`、`verify_robot_cockpit.cjs`。当前关键产品 SHA：`index.html` `14fb3558`、`style.css` `45108d1c`、`garden.js` `6ccffa07`、`cockpit.js` `be605c61`、`garden_native.py` `347911e8`、`garden.py` `d32725f1`、`gateway.py` `8daabbe2`。这是方案审查，没有改产品或运行产品测试。

## 可行性分析与 F1 修订复核

**F1 已在规划层收口。** `lwplan.md:88-94,102-116` 明确把 `#garden-scene-roster` 插入 `robot-panel` 里 `#garden-peek` 与真实 `#robot-stage` 之间；每个紧凑可点选名牌来自已登记 actor 和真实 task，首层固定姓名、注册 `role` 的提交者/复核者标签、最新关联任务标题或待任务文案、账本证实的当前业务阶段。`style.css` 的作用域目标为宽屏单行/多列、574/360 两列，长中文折行且不横溢，完整任务文字留详情。超过首屏容量时说明总数并引向完整列表，不把省略的角色说成已全显。当前实际 DOM 为 `index.html:26-35` 的 robot panel → peek → stage，`garden-panel:60-65` 在后；当前 CSS `:5,104-108,134-135` 让 robot panel 在小院首行，360 宽单列主布局。因此该插入点直接修复首轮“卡片排在 3D 后”的信息层级缺口，不需重排 `GardenService` 或缩减场景质量。

`lwplan.md:142-144` 的验收不是只测无横溢：受控浏览器与 coordinator 真实 IAB 都在 360×866、574×866、1024×866 读取矩形；摘要及至少一张含姓名/角色/任务/阶段的名牌完整落在视口内，四个已登记 actor 名牌可在主屏区域找到，真实 stage 顶边 `<866`、可见高度 `≥120px`，并检长中文、无任务、失效态、键盘、切域、详情与截图。R12 真实基线 `work/r12-garden-iab-r2.json` 已记录旧 stage 顶边 360 宽为 612、574 宽为 484、1024 宽为 451；新增名牌会占据余量，目标能否实际达到由上述矩形门实测决定，不能由这份方案报告代判为已达成。

S1 的同根成员→精确只读原生索引→固定 sessions 根与 UUID 文件名→4 MiB/256 KiB/6 条预算→单一公开 `response_item.message` 白名单仍在 `:49-84`；S2 的真实收据时间线、`artifact_changed` 撤销当前成功及显式点选后独立 GET/迟到隔离仍在 `:92-146`；S3 的小院自主巡游、隐藏动作按钮但保留模式/角色点选和观察模式原控制仍在 `:148-180`。R12 摘要云朵及 per-root 收据账本未被计划重写。`garden.js` 现有 `taskFor`、`render`、`generation` 和 `getView` 是对应插入点；`cockpit.js:update` 的 theme 是 S3 小分支落点。界面名牌是角色语义，未把 `getView.category='unknown'` 偷换成位置证据。

## 风险点与遗漏

- 原生 `rollout_path`/JSONL 是本机实现细节。S1 在缺列、格式漂移、路径逃逸、超预算或并发改变时关闭展示；同 OS 账户恶意篡改与公开 assistant 自述内容的内容级脱敏不在承诺内。只有实际同根 child 与 8766 读通的 coordinator 证据能证明本机接通。
- 四张名牌加上长中文可能使 360 宽 stage 的首屏可见高度不够。方案规定了三宽矩形硬验收和 scoped CSS 的修补范围，不能为了通过验收降 3D 人口或质量；这是实施与真实 UI 门，非当前 Gate-2 的事实通过声明。
- `README.md` 当前仍称阶段为 LW，符合本轮审查前状态；Gate2 后需由 coordinator 同步里程碑。未见 shared/runtime、入口或镜像副本的新增 drift；Readiness r1 1–10 节缺口由 r2 PASS 修复，旧红件保留。

## Gate-2

**Required Set 复核结果**：`PASS`。主要工作包为 S1（只读源/HTTP）、S2（主屏/详情/发言时序）、S3（自主场景/旧兼容）。T3 继承 T1/T2：各包的目标/反目标映射、输入输出、关键路径/函数、步骤、验收、回滚、impl-safe 与 coordinator 证据三元组、作者体验均可定位；§2 有跨层接口矩阵、核心链路及 research 事实映射，§4 有停机/降级，§5 有 Gate1/2。Gate1 JSON 的存在性结果与独立阅读相符，但不替代以下质量判断。

**目标锁 / 反目标复核结果**：`PASS`。G13.1 的具体角色/负责事项/已发生阶段在主屏、详情和三宽首屏验收均有落点；G13.2 的同根公开发言/按需/有界及 G13.3 的自主巡游和回退都有落点。未回答 Q&A 为空。

| 反目标禁止内容 | LW 可核查位置与判断 | 结论 |
|---|---|---|
| 动画、`updated_at`、最近发言冒充实时工作/完成/百分比 | `:9-11,94-98,137,191` 用账本 state/current_valid/receipt，发言只作独立摘录 | 未踩中 N13.1 |
| 外来 caller/root/path、扫描、跨根、整份日志、私有消息或工具结果 | `:23-26,53-78,98,124-140` 固定 root、精确 SQL/文件和类型白名单 | 未踩中 N13.2 |
| 改 R12 账本/旧观察终端或降低 3D 质量人口 | `:9,19,47,148-180,184` 明列不改层、回归和同质量性能门 | 未踩中 N13.3 |

### Gate-2 关键复核

| 项目 | 结果 | 说明 |
|---|---|---|
| 关键实现锚点复核 | PASS | S1 `garden_public.read_public_messages`/`gateway.do_GET`，S2 `garden.js.render/selectActor` + `index.html` 新 roster + scoped CSS，S3 `cockpit.update`/scoped CSS；各有 reviewer 首读点。 |
| 代码片段充分性复核 | PASS | S1 `:61-76` 给成员/索引/route 顺序，S2 `:102-137` 给 peek→roster→stage 目标 HTML 与角色投影/按需 GET，S3 `:156-174` 给主题转换/按钮隐藏；能判断跨层最小闭环，不要求整份最终代码。 |
| 作者体验门复核 | PASS | 单一只读 helper/固定 route，名牌字段与详情分层、现有 selected/generation 复用，S3 只按主题转换；不引入可配置角色动作/路径或仪表百分比，读者可按 S1→S2→S3 实施。 |
| 人工 review 对齐复核（总括项） | PASS | 下列核心链路顺读、research 事实映射、跨包脑补需求三项均 PASS。 |
| 核心链路顺读复核 | PASS | §2 直接陈述现状→新链→不改层，再按 S1 源/HTTP→S2 呈现→S3 场景→§4 验证/回滚。 |
| research 事实映射复核 | PASS | `:29-41` 把父链、原生路径/JSONL 变体、真实文件预算、R12 收据、`category=unknown`、旧控件/性能差异连到实现与负例/真页门。 |
| 跨包脑补需求复核 | PASS | r1 缺的主屏角色位置现在有相邻 HTML 骨架、数据字段、响应式目标及矩形断言；无需从实际 DOM 倒推要把角色卡挪到哪里。 |

**P1-P9 协议合规核验表**：`PASS`。

| 协议项 | 结果 | 独立判断依据 |
|---|---|---|
| P1 | PASS | `:210-242` 无最低任务数作为质量门。 |
| P2 | PASS | `:210-235` 必备内容存在性是基础判断，另要求人工质量复核。 |
| P3 | PASS | `:212,233-235` 缺项回退，无打分抵消。 |
| P4 | PASS | `:214-231` T1/T2/T3 Required Set 分型及继承。 |
| P5 | PASS | `:198-208` 关键边界变化触发 `DELEGATE_QUESTION`。 |
| P6 | PASS | `:196` 新假设/新风险/阶段切换留痕在风险表与 impl_report。 |
| P7 | PASS | `:198-205,241` 问题数由真实不确定性决定，无固定上下限。 |
| P8 | PASS | `:198-205` 本轮未触发的理由与 P0/P1/P2 批量模板。 |
| P9 | PASS | `:210-235,242` LW 作者 Gate1 → fresh reviewer/coordinator Gate2 双门，失败回环。 |

**基线与澄清一致性复核结果**：`PASS`。未回答列表为空；G13.1/G13.2/G13.3 与决策 1–5 全部映射；上表三项反目标未踩中。用户让系统预定义的是机器人动作，方案保留点选角色和图形模式；R12 完成摘要/同根交付复核/跨主会话隔离仍是基础。不需要新用户决策。

**设计味道扫描结果**：`PASS`。新增的 roster 是现有 robot panel 上的简短可读事实投影，详情只在选中后加载；S1 是一个有界只读适配器而非通用日志服务，S3 只在主题转换时改变动画控制。未见以过多配置、伪状态或质量降级换取首屏效果。

### 原地修订来源检查

本次来源是 **Review(LW) r1 的 `REVISE`**，不是 Review(Impl) 输出 `PLAN_DEFECT` 后的回退；因此 `plan-review` 的“PLAN_DEFECT 原地修订复核”五项严格附加门并非本轮触发条件。仍独立检查其核心事实：S2 有 `本轮修订说明`（`:88-90`）；新 roster/三宽断言位于同一 S2 节，S1/S3 及 S2 收据/发言支撑未删除；没有已落地的 R13 产品需迁移/回收，也未见整段删除或大规模重排。若后续 Review(Impl) 真输出 `PLAN_DEFECT`，必须按该附加门对新版计划的每个改写段落逐段标注、列收敛任务后再审，不能援用本次放行。

### Gate-2 结论

**Gate-2**：`PASS`。F1 的结构与可核查首屏验收已补齐，三个主要工作包可顺读执行；coordinator 核对上述 LW/Gate1 SHA 后可进入 Impl。实施及真实 IAB 门须逐项产生证据，不得把本次方案结论当成产品验收。

## 后续行动

按 S1→S2→S3 实施；实现者先保存受控负例、三宽矩形和旧字节清单，coordinator 后核实际 child、8766 真页、IAB、旧全回归与同画质持续样本，最后由 fresh ReviewImpl 审最终产品字节。任何主屏首屏或原生读取失败均如实回退/降级，不扩大私有记录读取范围。

---

## 跨功能事实（待确认）

### 架构与约束

- [2026-10-06] 视觉场景置于任务卡片之前时，窄屏“无横向溢出”不能证明角色职责在首屏可见；应同时断言具体信息与真实场景的视口矩形。
