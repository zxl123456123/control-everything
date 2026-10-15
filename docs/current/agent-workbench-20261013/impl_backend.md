# 后端实施支撑报告

受众：共享。执行主体：`workspace_backend`。本报告供 root 汇总正式 `impl_report_r1.md`，不代替独立 Review(Impl)。

- `feature_name`: agent-workbench-20261013
- `impl_round`: 1
- `date`: 2026-10-13（Asia/Shanghai）
- `lwplan_version`: Gate-2 PASS 对应 SHA256 `1bf61859f912954a72994727e3ff8ba6919353ee00de28f749b00172074e599b`；另消费 root 在实施中明确的 Windows 路径别名修复及 signed-64 数值边界。
- `status`: S1–S3 实施与 impl-safe 自证完成，交由 root 承接实机验收与独立 Review(Impl)。

## 变更事实

| path | change_type | change_purpose / key_changes | related_tasks |
|---|---|---|---|
| `session_panel/workspace_store.py` | 新增 | 独立 SQLite tasks/manual_records；每操作独立连接、事务、3000ms busy timeout、500/100条与准确总数；损坏库不重建，更新缺失ID不新增 | S1 |
| `session_panel/workspace.py` | 新增 | 严格任务/人工记录校验；项目手工记录与未知分开；本地来源独立降级；Provider发现与能力分开；Codex元数据原信封；项目与会话路径包含校验；GET额度缓存和显式刷新分开 | S1、S2 |
| `session_panel/workspace_sources.py` | 新增 | Codex固定native路径解析、三方法只读RPC、共享deadline、有界stdout、并发刷新合并与己方进程回收；三个固定RSS来源、1MiB上限、15分钟缓存、时间排序、过期结果和失败状态 | S2 |
| `session_panel/gateway.py` | 修改 | 新精确静态/API路由；复用Host/Origin/CSRF和garden_body；末尾可选workspace注入；默认测试不创建真实服务，生产serve显式注入 | S3 |
| `tests/test_workspace.py` | 新增 | 临时库持久化/并发/繁忙损坏、旧源不写入、输入/数值/路径/关联负测、临时loopback的全部新API与保护 | S1、S3 |
| `tests/test_workspace_sources.py` | 新增 | mock子进程与HTTP，验证白名单、错误清洗、超时/EOF/过大输出回收、多桶/null/旧缓存、RSS清洗与并发缓存 | S2 |

`WorkspaceService(db_path=DEFAULT_DB, *, registry_path=REGISTRY, manual_path=MANUAL, todos_path=TODOS, session_reader=None, quota_source=None, news_source=None)` 可供 root 在隔离库预览；`make_server(..., workspace=service)` 的默认值仍为 None。没有新增依赖、全局配置、Git仓库、启动器或外部写入。

## 目标对齐

- `goal_lock_check`: S1–S3 提供 G2 的本地任务、来源事实与数据接口，并支撑 G3 的后续页面验收；未用单测宣称 G3 已满足。
- `anti_goal_touch_check`: N1–N4 未越界。旧 JSON、原生Agent库和旧业务写路径未修改。任务分配只存人工事实；没有dispatch/cancel/approve、推理、登录、额度购买或公网监听。
- `authoring_ergonomics_notes`: SQL事务、业务验证、来源适配分处三个具名模块；网关仅负责固定路由和错误映射。没有通用Provider插件框架或新的配置DSL。

## 验证记录

完整命令、输出和退出码均追加到 `work/agent-workbench-20261013/backend-unit-r1.log`，保留红绿历史，不截尾或覆盖。

| 记录 | 命令与实际结果 | evidence / owner / conclusion_if_missing |
|---|---|---|
| 模块语法初查 | `.venv/Scripts/python.exe -m py_compile session_panel/workspace.py session_panel/workspace_store.py session_panel/workspace_sources.py session_panel/gateway.py`，退出0、空输出 | 当轮工具记录；backend；只证明当时可编译 |
| 新增测试首跑 | `.venv/Scripts/python.exe -m unittest tests.test_workspace tests.test_workspace_sources -v`，33项、0失败、退出0 | backend-unit-r1.log；backend；fixture不证明真实账号/外网接入 |
| 首次全量 | `.venv/Scripts/python.exe -m unittest discover -s tests -v`，235项、0失败、退出0；已有 `IncompleteFieldDefinitionWarning` 保留 | 同上；backend；不以旧版本回归代替后续修复复验 |
| Windows路径回归红灯 | `.venv/Scripts/python.exe -m unittest tests.test_workspace.WorkspaceTests.test_windows_extended_paths_match_drive_and_unc_aliases -v`，1项FAIL、退出1 | 同上；backend；证实修复前 `\\?\E:\...` 与普通盘符路径误判 |
| 路径修后绿灯 | 两个workspace测试模块，34项、0失败、退出0 | 同上；backend；覆盖驱动器/UNC别名、兄弟目录拒绝和实际业务关联路径 |
| 最终全量 | `.venv/Scripts/python.exe -m unittest discover -s tests -v`，237项、0失败、退出0，26.602秒；完整输出已读，已有Pydantic警告仍在 | 同上；backend；证明本轮代码的fixture/既有单测回归，不替代实机与独立审查 |

测试使用临时库、合成索引、mock进程/HTTP和临时loopback，不读取会话正文、不运行真实Agent或真实RSS。旧全量测试自身的既有临时stdio验证保留。

## 失败、修复与合同补充

1. root 真实读取发现 Codex cwd 使用标准 Windows extended-length 前缀。原 `inside_project` 只 normcase/normpath/commonpath，仍会因盘符别名判不匹配。新增回归先复现失败，再在本模块将标准 `\\?\C:\` 和 `\\?\UNC\server\share` 归一化；旧 `progress.py` 不改。
2. `daily_tokens` 为非负整数，SQLite signed-64 上限为 `9223372036854775807`。backend 已向 root 报告冻结原合同未写此上限；root 明确采用并负责补充 `clarifications.md`。上限值可保存，超限作为输入错误返回 HTTP400 `invalid_request`，没有大整数编码或库迁移。费用使用有限浮点数存储，币种独立保留。
3. 根基线中的 Codex `-32603` 是历史采样失败。本实现没有将它固定为当前状态；root 随后提供的 `real-quota.json` 已为 available，本组已读该证据，不能再写当前必然不可用。
4. 准备期批量读取两次因输出量过大截断；权威计划/研究已分别重读。仓库专属 `AGENTS.md`/`CLAUDE.md` 的 `rg --files` 查找无匹配、退出1；继承用户提供的全局规则。此查找失败不是业务失败。

`contract_drift_reports`: 路径别名属于S1原有同项目判断的实现缺陷，已按root指令修复；tokens存储上限为已向root显式上报并获决定的合同补充。没有静默扩展HTTP字段或修改旧合同。

## Coordinator 承接项

| 验证 | evidence_expected | owner / conclusion_if_missing |
|---|---|---|
| 真实项目/Provider/Codex身份元数据、旧数据哈希 | `real-workspace.json`、CLI发现及哈希清单 | root；本组单测不能证明当前真实来源完整或旧数据实际未变 |
| 真实官方额度读取与己方probe进程回收 | `real-quota.json`、刷新前后进程清单 | root；fixture不能称真实额度可读。本组已读root当前available采样及ownedAppServerRemaining=0，历史-32603仍保留 |
| 固定RSS实际抓取 | `real-news.json`、来源状态和采样时间 | root；本组已读root三源available、15条采样，但不冒充本组外网执行 |
| 新版本独立服务、页面任务/记录/关联交互及旧入口兼容 | 隔离新DB、`real-workspace-check.md`和浏览器日志 | root；修复后需重启己方preview，不能以此前服务版本宣称路径修复已实机生效 |
| 新旧浏览器fixture、桌面应用窗口与360/390px截图 | fixture日志、实际格式截图和检查记录 | root；本组未运行浏览器/桌面窗口，不宣称跨端验收完成 |

## 风险、回滚与审查重点

未完成的产品能力仍为计划中的后续范围：自动Agent执行、其他Provider自动额度、自动日Token/费用、远程手机认证、原生安装包。来源缓存仅在当前进程内；服务重启后额度回到not_checked，RSS按请求重新抓取。SQLite全量更新沿合同采用最后成功写入生效，不含多人冲突合并。

审查重点：Windows路径别名与包含校验、未记录/坏来源不伪造零值、外部失败HTTP200状态信封、RPC只读方法和回收、固定RSS边界、POST保护顺序与旧路由兼容。

`rollback`: 可直接回滚本轮代码与新入口；基于快照逐文件核对，不能覆盖他人修改。保留新SQLite库及用户记录，旧JSON无需迁移。未操作旧8766服务。

英文提交消息建议：`feat(workspace): add local task tracking and verified source adapters`

无新增跨功能事实。
