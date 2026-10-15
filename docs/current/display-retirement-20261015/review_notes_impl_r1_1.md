# 展示退役实施审查 r1 / 第 1 次

**协议结论：PASS。业务结论：PASS。** 当前工作树符合本轮退役计划，允许协调者进入本批提交与推送；本报告不证明尚未发生的 Git 交付或服务部署。

- review_target: impl
- impl_round: 1
- review_seq: 1
- review_date: 2026-10-15
- 引用：本目录 `lwplan.md`、`clarifications.md`、`impl_report_r1.md`。
- 实施报告冻结 SHA256：`881489795ad4de78367b6d57e5b7800313f8c57c153b17c38d664de853561652`，已独立核对。
- 比较基线：`4d32f6e`；排除并行 `project-progress-compat-20261014` 文件，未修改产品。

## 结论依据

实际 diff 表明 app/garden 只移除图形连接、展示术语和装饰节点；recordView/current/eligible、选择、分页、CSRF、根域、代际隔离、公开发言与收据逻辑保留。gateway 仅删五个专用静态路由。两个渲染模块和 Three 三文件在磁盘上不存在；对五个产品文件的活引用断言通过。摘要及角色列表移入 garden-panel，证据区和工作台入口保留。

对旧/新 harness 的 14 个保留业务函数逐函数比较，check 调用数量分别保持一致；差异是图形观测改读 DOM、按完整键匹配类别、补空选择的 aria-pressed 检查及使用原生点击。消息、资格、失败、晚响应断言没有被删除求绿。时间/visibility/interval 探针继续存在。garden 原有 17 个场景保留业务语义，第 18 个场景真实加载 index/app/garden，验证合法 bootstrap root、按需公开发言和两视图。

根 README 已换当前测试入口及身份用语，新增进度入口和首次检出示例说明；开发进度明确保留历史未验收状态、固定环境限制及不部署边界。没有通过本次退役覆盖旧批次 BLOCKED。

## 必备核验字段

| 字段 | 结果 / 说明 |
| --- | --- |
| goal_lock_alignment | aligned；G1 进度与清理前基线可恢复，G2 整链退役，G3 业务语义与回归保留；最终清理提交由协调者承接 |
| anti_goals_touched | none |
| authoring_ergonomics_check | pass；删除失效图形接线，沿用业务 DOM |
| declaration_readability_check | pass；无新抽象，当前入口与历史记录区分明确 |
| plan_defect_checkpoint_recommended | no |
| plan_defect_checkpoint_reason | 无需调整目标、验收或回滚 |
| impl_safe_validation_check | pass；语法、单元、静态引用及差异检查归属实施者 |
| coordinator_handoff_check | pass；浏览器/截图及独立单元有协调者证据，Git/部署边界明确 |
| 基线与澄清一致性复核结果 | PASS；未回答为空，目标未漂移，已回答决策未违反 |
| 设计味道扫描结果 | PASS；整链删除，没有新增框架、开关、重复状态或测试用产品适配器 |

| 禁止内容 | 独立核查依据 | 结论 |
| --- | --- | --- |
| 隐藏替代删除、新图形框架/开关 | 文件缺失断言、产品活引用搜索、index/app/garden diff | 未命中 |
| 改身份、权限、数据及未点名业务 | gateway 五行删除；app/garden 最小差异；root 本地输入保全证据 | 未命中 |
| 覆盖历史或冒称真实环境验收 | 根说明、进度、实施报告的显式限制 | 未命中 |
| 夹带并行开发 | 本报告范围排除并行文件；最终需协调者逐路径暂存 | 当前本批未命中，禁止全量暂存并行改动 |

## 验证证据与责任

实施者证据：已读完整 `work/display-retirement-unit.log`，320 项/41.270s/OK；语法与 24 项执行 UI 契约结果记于实施报告，未据此代称浏览器验证。协调者另独立运行 320 项/40.897s/退出码0，完整日志 `work/display-retirement-root-unit.log` 已读。

协调者浏览器证据由 reviewer 独立解析并执行断言核验：

- `work/session-panel-fixture-2026-10-15T05-35-47-384Z.json`：17 场景/440 检查，全部 passed，failures 与 blocked_requests 为空；各场景无意外页面/控制台错误，浏览器关闭且 fixture code 0。4 个产品 SHA256 与当前文件逐个匹配。
- `work/garden-browser-2026-10-15T05-35-47-352Z.json`：18 场景、failures 空、exit_code 0。协调者查看全部 4 张截图；reviewer 另目检 garden 360 与 observations 1280，信息可见、无人物/空场景。
- `work/agent-execution-20261013/ui-fixture-2026-10-15T05-23-03-810Z.json` 与 `ui-execution-fixture-2026-10-15T05-31-49-084Z.json`：reviewer 独立解析，exit_code 0 且无 failures；属于未改工作台与执行 UI 的合成回归。
- `work/display-retirement-root-verification.json`：记录 root 独立单元退出码、3 份本机输入不变、删除文件与截图核验。数据文件不纳入此次清理。

reviewer 本轮实际运行证据审计命令（JSON 全检查、源码哈希、五资产缺失、产品活引用、旁路回归产物），退出码 0；本批 `git diff --check` 独立执行，退出码 0。以上是独立核验，不把作者自述作为唯一依据；没有再次重复完整浏览器运行。

## 失败、限制与后续

保留已观察失败：初始非 Git 仓库、gh CLI 未登录、模板提取截短；规划读取错误路径、宽输出截断；中间删除脚本漏一条 robot-canvas CSS 后修正；root 首次 JSON 审计使用 GBK 导致 UnicodeDecodeError/exit1，随后 UTF-8 审计通过。reviewer 宽 diff 输出也曾截断，随后按函数/文件定向补读。现有 Pydantic lifespan 警告及 LF/CRLF 提示保留，未顺手修复。

contract drift / stale / mirror mismatch：未发现本轮新冲突；历史图形与无 Git 描述已经在当前说明标记其历史语义，不改写旧验收结果。

证据限于本地合成环境；真实远端、终端可见性、模型运行及运行服务加载未在本轮验收。`work/` 原始证据仅在开发机留存，不随 Git 克隆；报告记录结果与路径。协调者仍须逐路径核对暂存清单、查看 `origin/main..HEAD`、提交推送并验证远端 HEAD；不要暂存并行兼容 feature。无须新增用户决策，无跨功能事实。
