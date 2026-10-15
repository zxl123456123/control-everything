# Review(LW)：本机 Codex 只读身份索引 r2

review_target: lwplan  
review_date: 2026-10-04  
reviewer: codex_index_readiness_review（未参与规划写作或产品实施）  
协议结论: PASS  
业务结论: PASS（限定只读身份索引计划；不是实现或全会话实时监控验收）

## 当前输入与本轮验证

独立完整读当前 201 行唯一 `lwplan.md`、完整基线、readiness 与原研究证据；实际读 gateway、app 的观察／选择／消息／focus 主链、index/style 与 gateway dispatch tests。聚合源码读取曾截断，已按范围补读，不以截断输出代替完整主链证据。

当前方案 SHA-256：`3FEF4B9F10B1F5A222610C5151628E29668F16EA09E7A436F89F83878974AE94`。对应 Gate-1 是 `work/codex-index-lwplan-gate1-r2-recheck.json`，47 项／0 失败；这里只核对作者文档检查，不把它当产品测试。

本 reviewer 本轮运行 `.venv/Scripts/python.exe -B work/codex-index-lw-review-r1.py work/codex-index-lwplan-gate1-r2-recheck.json work/codex-index-lw-review-r2.json`，exit 0，完整输出已读：41 项／0 失败。重新核验最终方案、9 个主输入哈希、Required Set 文本与实际 `do_GET` guard 首落点；不是仅采信作者 PASS。所有主／支持输入的完整哈希映射保存在该 JSON。

另运行本轮 `python -X utf8 -B -c` 的 R1→当前 unified diff 与原 R1 字节哈希核验，exit 0，完整 diff 已读。只追加四处带修订标签的段落／骨架与失败说明、替换 Gate-1 证据路径；原支撑正文保留，无删除整条链或新并行计划。首个 diff 命令缺 `-X utf8` 导致中文输出乱码，未据此下语义结论，随后用上述 UTF-8 命令补读。

| 主输入 | 独立核验 SHA-256 |
| --- | --- |
| clarifications.md | EB967E4E8CC8374452501C9B5648634DA7D5DDB02D262E697C637206335276BF |
| review_notes_readiness_r1.md | FC077D77B06BC4C4AB826F99D49C925E6B75D385625150BA319AD8343E9A4991 |
| README.md | 0994F3231B19E6FBBC995EB7CE9C788EA559B63A10C429C236FF709767CAC026 |
| research.md | FA68B3910C3C7F525288F481178A06330DB9BE63E9F6540827B1F02162222A82 |
| web/app.js | CAA6897E03D03AFAC8B80FFF724CE986218DDD079141E86844378AB380F4D84A |
| web/index.html | E36E558BCA97BACA5465EF83D9C15060494DAC0B18CB03CCD40C4056402BE28B |
| web/style.css | 41564804E0A781670EB0FCE74E4DA7CCC23EFBE0AD5A571FD52BA73BCB3BC793 |
| session_panel/gateway.py | 2A09B367F19F7DF0349B1DEC9D2325A06DB6AC58AA55F4835068C49ED3173646 |
| tests/test_gateway.py | 0F0F5AC83D8D78D12728C26C207A43B217938355A1329EEEB028181C7A047ADF |
| Gate-1 r2-recheck | D3F1D50E36AFE34258905C92D92893CEDAF7FFECE38E188DC4536A690F91E408 |

其余支持输入：来源 research 为 `53E5960F106D758C0AF92708DC10126E73FB764B106F2C26AA869DE895188230`；metadata、projection、control-probe 和独立 readiness 数据的完整哈希见 `supporting_input_hashes`，没有读取对话正文或新启动服务。

## 1. Required Set 复核结果：PASS

分型是 T3：reader→gateway→app→既有 renderer 的跨模块接口增量。主要工作包清晰可识别为 S1、S2、S3。

| 必备项 | 独立复核落点 |
| --- | --- |
| T1-1／2 | 范围给 G1–G3、N1–N3、7 文件 scope、不改层；S1–S3 各自给路径与首落点 |
| T1-3／4 | 每包目标／步骤／验收／回滚／依赖／形态与目标锁、反目标映射齐备 |
| T1-5／6 | 每包明确 impl-safe、root 承接、证据落点／不足约束、作者体验 |
| T1-7／8／9 | 工作包前先双来源主链、事实映射表、库→GET→选择→禁止远端动作的片段闭环 |
| T1-10／11 | 文档 Gate-1 自检与 Gate-2 reviewer 主检／root 复核，失败回退路径明示 |
| T1-12／13 | 事件留痕、批量提问未触发原因及模板、风险／降级策略齐备 |
| T2 | 固定 response、offset／12 页界、schema 与失效、测试分层和原远端回归范围 |
| T3 | 接口矩阵、双 state 选择迁移、失败清空、兼容发布顺序与只撤 own diff 的停止策略 |

逐包存在性与可执行性均核对，未用任务数量作为门槛。Impl 不运行真实库、生产 HTTP、GUI／SSH／浏览器；root 独占 harness、实机数据与自有网关重载。

## 2. 目标锁 / 反目标复核结果：PASS

G1 固定六列读库／明确失败；G2 独立来源身份、unknown 活动与 namespace；G3 全部筛选集合分页、显示排除数及页界 12，都在 S1–S3 验收与验证责任中下沉。

| 禁止项 | 可核查规划依据 | 结论 |
| --- | --- | --- |
| N1：状态推断或动画冒充进度 | 接口固定 activity_state/task_completion unknown；S1 不读 history；S2 unknown 色／说明 | 没有规划为活跃或完成判定 |
| N2：写 DB、正文／标题／preview／auth、第二 server、resume／发送／新 SSH／退出终端恢复 | S1 只读 URI/query_only/六列与 fixture 注入边界；范围不改终端；S3 主体限制 | 没有这些实施动作 |
| N3：改原 SOURCE/MCP/消息/focus 权限、假生产角色、隐藏覆盖 | 核心链仅合并 view；GET guard 后独立分支；S2 独立选择与 coverage；S3 fixture 明示 | 原合同保留，假数据只在隔离测试 |

本表检查方案；实现是否踩中必须由最终差异与新证据另审。

## 3. 关键实现锚点复核结果：PASS

- S1：`codex_index.py:list_threads`、`gateway.py:codex_offset/PanelHandler.do_GET`，短 reader、严格分页 parser、guard 后独立 GET。现有 `allowed` 在任何 API dispatch 前，`make_server` 固定 loopback；无需新权限入口。
- S2：`codexState/refreshCodexThreads/selectCodexThread/selectRobot/renderCockpit/selectSession` 与 panel DOM。首看旧 selectSession 自动 readMessages，之后新分派清旧 epoch、独立详情、完整 key，能直接预判改动顺序。
- S3：临时数据库、Mock handler、root fixture 的 `list_codex_threads` 导入名与请求日志；可定位已有 GatewayDispatchTests 和 harness 起点。作者不碰 harness／renderer，所有权清楚。

## 4. 代码片段充分性复核结果：PASS

修改 GET 分支、视图 key 与选择状态，命中强制片段条件。已给固定 path／mode=ro/query_only/read transaction、guard 后路由、namespace selector／epoch、view 合并、Mock 插入；新增迟到请求的 started 捕获／接受前拒绝／received=started 骨架完整。

这些片段让 reviewer 顺读库→API→视图→选择→清原消息链，不需要自行拼接主链。schema/count/page 的详细 SQL 可留实现完成，既定 whitelist、排序、参数绑定与 snapshot 责任已经明确，不需要新架构决策。

## 5. 作者体验门复核结果：PASS

每包有独立作者体验声明且与目标形态一致：固定 plain 函数／SQL、单一 GET、独立小 state、原生按钮与 textContent；复用现有 query/element/timeText。没有 provider 框架、时钟抽象、第二套消息／focus 或配置体系。固定数据库是本机已研究的范围，内部格式失效明示 unavailable，避免作者维护不必要迁移。

## 6. 人工 review 对齐复核结果：PASS

| 子项 | 结果 | 依据 |
| --- | --- | --- |
| 核心链路顺读复核 | PASS | 先现有远端链、后固定本机链、明确仅 view 合并和不改层，再 S1–S3 与证据闭环 |
| research 事实映射复核 | PASS | ID/schema／历史投影／来源分类／控制通道失败／旧选择／namespace／旧实机缺口逐条落到实现和验证锚点 |
| 跨包脑补需求复核 | PASS | 固定 response 和状态契约先行；源选择与动作 pending、请求开始计龄及迟到拒绝均明示 |

总项 PASS 由以上三个 PASS 支撑。真实身份/API/IAB、实际 renderer 性能和旧终端证据职责分开，截图不能代替 FPS 或实机 focus。

## 7. P1-P9 协议合规核验表：PASS

| 协议项 | 结果 | 独立依据 |
| --- | --- | --- |
| P1 | PASS | 未用至少多少任务数硬门槛 |
| P2 | PASS | Required Set 以存在性与实际可核查落点为门禁 |
| P3 | PASS | 任一必备项缺失不放行，没有评分平均或软通过 |
| P4 | PASS | T1 基础／T2 模块边界／T3 接口兼容扩展明确 |
| P5 | PASS | 范围/验收/回滚不唯一或正文/实时/復活新增需求先委托澄清，不猜授权 |
| P6 | PASS | 风险段记录冻结交接事件；新假设/风险/所有权/阶段切换即时上报，无固定次数 |
| P7 | PASS | 没有澄清条数上下限 |
| P8 | PASS | 批量未触发原因明确，并给 P0/P1/P2 模板和 root 承接 |
| P9 | PASS | planner Gate-1 后，fresh reviewer Gate-2 主检＋root 复核；失败修订再审 |

方案没有指挥实施作者递归派发下级 agent。正式实施只在 root 按既有明确自动实施授权、完成复核并交接唯一作者后推进；这不豁免 Gates 或最终独立 review。

## 8. 基线与澄清一致性复核结果：PASS

指定权威输入未回答问题为空；只读身份、开发效率、3D／文字回退选择、持续自动实施授权均有记录。G1–G3 未漂移；N1–N3 未被规划踩中；旧退出工作台恢复问题没有被当成本 feature 许可。新迟到页规则属于 G1 证据新鲜度与 G2 失败清当前角色的实现细化，不新增用户风险决策。

## 9. 设计味道扫描结果：PASS

未发现阻断的设计异味：7 文件增量服务一个来源接入；既有资格算法与控制层保留，source 分派直观，没有通用监控／游戏框架。内部 source 序列化变化计入 other 且明示覆盖，不能冒充支持新来源。

## 10. Gate-2：PASS

Required Set、目标/反目标、关键锚点、片段闭环、作者体验、人工 review 三子项、P1–P9、基线一致性和设计扫描均 PASS。root 仍须独立复核当前方案／证据与所有权，再给唯一作者 GO。放行只读 metadata 实施，不能据此宣称产品测试已通过。

## 修订、失败保全与状态留痕

首次审阅发现迟到 Codex GET 可能按收包时间重新计龄，已交 root；r2 新增请求开始计龄、接受前拒绝、失败清空与 root 迟到浏览器场景。已检查修订段均有说明/统一标签，原 R1 支撑文字保留，无需回收已实施代码，因为本 feature 尚未实施。

- `work/codex-index-lw-review-r1.json`：本 reviewer 首次 checker exit 1，41 项／1 失败，原因是 r1 Gate-1 仍钉旧 plan hash；其时迟到修订已出现。保留原输出，最终命令使用新证据路径，不覆盖失败。
- `work/codex-index-lwplan-gate1-r2.json`：作者自检 exit 1，46 项／1 失败，原文比较器对 Gate 段“当前”二字处理错误；完整失败证据已读，实际 diff 核对后 planner 保留原文，r2-recheck 另存。该失败不是产品测试失败。
- 首次聚合读取截断与首个 diff 输出编码问题均已补读；来源控制 socket exit 1／os10050 和旧 WezTerm BLOCKED 仍保留。此前 Win10053 等产品验证失败的原报告由 root 在最终交付中关联，本 reviewer没有重跑或声称消除它们。

contract drift / stale / mirror mismatch：没有阻断的业务／安全合同漂移；README 状态文字仍在 ReadinessCheck，root 应在接收当前结论后更新阶段与里程碑。此处显式报告状态滞后，当前正式放行以指定 readiness、唯一 lwplan 与本 Gate-2 证据为依据，不能悄悄将旧状态当新完成证据。

实时 Codex 活动通道、正文监控、真实 WezTerm 关联/focus/owned 清理仍未验证，均不是本只读身份 scope 的 PASS 目标。无跨功能事实。
