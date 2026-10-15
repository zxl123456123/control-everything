# 多 Agent 工作台实施报告 r1

受众：用户、coordinator 与独立 reviewer。执行结果按来源区分，作者自证不替代 coordinator 的真实验收。

- `feature_name`: agent-workbench-20261013
- `impl_round`: 1
- `date`: 2026-10-13（Asia/Shanghai）
- `lwplan_version`: Gate-2 PASS，SHA256 `1bf61859f912954a72994727e3ff8ba6919353ee00de28f749b00172074e599b`
- `status`: 实施与可执行验收已落盘，等待独立 Review(Impl)；Edge 原生窗口外观未验收。

## 最终行为

新增 `/workspace` 五个视图：总览、项目任务、Agents、用量与额度、AI 资讯。保留 Python 网关与旧页面，新增独立 SQLite 任务/人工记录及三个有界来源模块，不迁移旧用户数据。

任务支持项目/Provider/可选 Codex 会话关联、筛选、新增、修改手工状态和持久化。Provider 指定只记录分工，不触发任务派发。五种工具分别显示命令发现、会话观察、额度和执行能力。Codex 订阅额度通过显式按钮读取官方 app-server；其他产品额度、每日 Token 和费用明确为未自动接入，可录入人工记录。固定三源 RSS 保留来源、时间、失败和缓存状态。

## 变更事实

| path | change_type | change_purpose | key_changes | related_tasks |
|---|---|---|---|---|
| `session_panel/workspace_store.py` | 新增 | 工作台自己的持久化事实 | SQLite 事务、独立连接、busy timeout、任务与人工记录 | S1 |
| `session_panel/workspace.py` | 新增 | 汇总与业务约束 | 本地项目/待办/Provider/Codex采样、输入验证、路径归属、记录保存 | S1–S2 |
| `session_panel/workspace_sources.py` | 新增 | 真实来源边界 | 只读额度 RPC、超时/回收、固定RSS与缓存/清洗 | S2 |
| `session_panel/gateway.py` | 修改 | 同源接入 | 精确静态/API路由、复用原有保护、可选服务注入 | S3 |
| `web/workspace.html` | 新增 | 统一工作台结构 | 五视图、语义表单、旧入口 | S4 |
| `web/workspace.js` | 新增 | 表单与数据交互 | 真实状态、保留失败草稿、严格响应、额度显式刷新、任务视图排序 | S4 |
| `web/workspace.css` | 新增 | 响应式视觉 | 桌面侧栏/分栏、手机单列、长文本约束 | S4 |
| `web/index.html`、`web/progress.html` | 修改 | 旧入口接新工作台 | 仅新增导航链接 | S4 |
| `scripts/open-workspace.ps1` | 新增 | 桌面入口 | 检查现有loopback服务并打开Edge app窗口 | S5 |
| `tests/test_workspace.py` | 新增 | 存储/业务/HTTP回归 | 持久化、错误、并发、数值/路径、来源与安全边界 | S1、S3 |
| `tests/test_workspace_sources.py` | 新增 | 外部源可重复验证 | mock RPC/HTTP、失败、限额、缓存与回收 | S2 |
| `tests/verify_workspace.cjs` | 新增 | 隔离浏览器证据 | 83项、三尺寸、草稿/关联/额度/RSS/数值边界 | S4–S6 |
| 根 `README.md` | 修改 | 使用与边界说明 | 入口、持久化、8766/8770区分、未完成能力 | S6 |
| 本 feature 方案、报告与 `work/agent-workbench-20261013/` 证据 | 新增/追加 | 可追溯交付 | 不覆盖旧feature；源码before快照、真实截图、完整日志 | S6 |

源码对照为 `work/agent-workbench-20261013/final.diff`、`changes.json`；目录无 Git，未初始化仓库、未提交或推送。报告不把不可用的 Git diff 伪称已执行。

## 目标与范围

- `goal_lock_check`: G1架构/备选/迁移路线有方案与来源；G2实际管理面、任务和来源闭环已实现；G3实际桌面浏览器及360/390布局和交互有图证，Edge应用窗口启动请求已验证、原生窗口外观尚无证据。
- `anti_goal_touch_check`: N1–N4未新增公网监听、任意命令输入、Agent推理/派发/审批/取消、凭证或全局配置写入；未把未知数据显示为0或把任务状态当自动事实。原8766服务未动。
- `authoring_ergonomics_notes`: 三个具名后端模块分别负责存储、业务、来源；网关仅接线，前端沿视图/表单组织。没有新框架、新依赖、插件DSL或替换旧JSON的迁移。声明式页面保留语义结构和标签。

## impl-safe 记录

| 执行与结果 | evidence | owner | conclusion_if_missing |
|---|---|---|---|
| backend 模块语法退出0；最终全量237项0失败、退出0 | `backend-unit-r1.log`、`impl_backend.md` | workspace_backend | 作者自证仅支持fixture，不支持真实来源 |
| UI脚本/harness语法退出0；PowerShell AST无错误；HTML引用和旧页面边界检查退出0 | `ui-static-r1.log`、`impl_ui.md` | workspace_ui | 不可仅凭源码称浏览器/原生窗口验收 |
| root独立全量 `.venv/Scripts/python.exe -m unittest discover -s tests -v`，237项、0失败、26.565秒、退出0；完整输出已读 | `root-unit-r1.log`、`root-unit-r1.json` | coordinator | 不能仅采信子agent的通过声明 |

证据文件均位于 `work/agent-workbench-20261013/`。已有 Pydantic `IncompleteFieldDefinitionWarning` 仍出现，不隐瞒且不顺手改第三方依赖。

## coordinator_handoff_verifications

以下由 root 承接并实际执行，不能写成 impl 作者自证。

| 验证与结果 | evidence_expected / 实际证据 | owner | conclusion_if_missing |
|---|---|---|---|
| 新UI最终83项通过，退出0 | `ui-fixture-r2.log`、`ui-fixture-r2.json`、时间戳JSON | coordinator | 不能称表单、失败草稿和三尺寸交互通过 |
| 旧会话fixture1403项通过，退出0 | `old-cockpit-fixture-r1.log`、`.json` | coordinator | 不能称原浏览器回归通过 |
| 旧小院fixture17项通过，退出0 | `old-garden-fixture-r1.log`、`.json` | coordinator | 不能称小院浏览器回归通过 |
| 真实项目、工具、Codex身份元数据 | `real-workspace-final.json` | coordinator | 不能用合成数据充当用户当前状态 |
| 官方额度、己方probe回收 | `real-quota.json`、`real-quota-final.json` | coordinator | 不能称当前真实额度可用或进程已回收 |
| 真实三RSS | `real-news.json`、`real-news-final.json` | coordinator | 不能称外网来源已接通 |
| 隔离DB中UI新增/关联/修改状态、人工记录、刷新重读 | `real-interaction.json`、`real-workspace-check.md` | coordinator | 不能称持久化端到端通过 |
| 1440、390、360实际截图及DOM溢出检查 | 四张 `workspace-*.jpg`、图片格式/像素核验 | coordinator | 不能称实际视觉验收；不证明手机联网 |
| Edge入口启动 | PowerShell退出0、“已请求打开Edge应用窗口”；原生UI不可用，外观未核验 | coordinator | **不能称原生桌面窗口已经验收或原生安装包已交付** |
| 原数据保持、仅己方服务清理 | `user-data-after.json`、`preview-8770-final-ownership.json` | coordinator | 不可宣称用户原状态未变化 |

## contract_drift_reports

1. 早期 LW 把浏览器验证误列 impl-safe，Gate-2 r1 REVISE；在实施前修订责任并通过 r2，原报告保留。
2. Codex历史 `-32603` 与后续可用采样不同；方案顶部追加实测更新，未删除旧失败记录。
3. 标准Windows extended-length路径与注册表普通路径是同一路径别名；原校验拒绝，新增回归先红后绿。未修改旧progress路径算法，兄弟目录仍拒绝。
4. 数字存储边界已由root明确补入clarifications：后端daily_tokens为非负signed-64整数，超界400；UI因JS Number要求safe integer，超限保留原输入且不发请求。金额按有限float和币种保存，没有引入新的大整数编码或迁移。
5. 实机发现手机tasks主操作被全部项目挡在后面，按S4修正现有DOM顺序并扩展fixture；无接口/产品范围变化。

## 已见失败与限制

- 基线 `git status` 退出128：目录不是Git仓库。文件查找无匹配、准备期错误路径/通配符及参考源404均记录在 `coordinator-checklist.md`；随后依据实际路径读取。若工具输出截断，则补读权威章节，不当作完整证据。
- 初额度探测 `-32603`、Windows路径回归红灯、手机顺序遗漏、CUA截图/locator异常、最后API导出漏client头的403，及各自后续处理见 `real-workspace-check.md` 与 backend 报告；没有用最终通过掩盖失败。
- 自动Agent执行、Grok/Claude自动额度、每日自动Token/成本、跨设备认证与手机远程、原生安装包均未实现，仍属M3/M4。DSH本机未发现命令；没有擅自安装。
- 原生Edge窗口外观没有可用自动验收通道；仅启动入口验证。当前整体交付边界是本机管理面与响应式Web，不宣称完全实现用户长期愿景。
- RSS缓存和额度缓存仅在当前服务进程内；重启后重新采集，失败显式展示。UI最多显示500任务/100人工记录，准确总数仍显示；全量更新采用最后成功写入，无多人冲突合并。

## 回滚与交付

`rollback`: 可直接回滚代码增量，但必须逐文件对照before快照和当前修改，不能整目录覆盖或删除他人工作。保留新SQLite用户记录、报告和验证证据；不需要迁移或还原旧JSON。原8766仍运行；最终8770预览保留，隔离8771已按PID/命令归属停止。

英文提交消息建议：`feat(workspace): add unified agent workbench with tasks and usage sources`

无新增跨功能事实。独立 Review(Impl) 结论另存，不由实施者代写。
