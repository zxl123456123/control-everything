# Impl r1：S1 存储与 HTTP

S1 已落地事务准入、运行事实、一次动作登记与同源 HTTP 接线。本轮作者实际执行 27 项新增单测、16 项旧 WorkspaceTests 与 5 个文件语法检查，退出码均为 0。此结论只覆盖临时 SQLite、内存 handler、fake worker 与语法，不代表真实 HTTP、多实例 Windows 归属或 Codex 执行已验收。

## 基本信息

- feature_name：`agent-execution-20261013`
- impl_round：`1 / S1`
- date：`2026-10-13`
- lwplan_version：SHA-256 `469d9a78473f6ce5f73fd2d3fb30ac2a5464e5cb87c27ce2f1c01843a9b6fe53`，独立 Gate-2 PASS；此作者未修改计划。
- owner：`/root/execution_store_impl`
- 受众：共享。
- 权威输入：clarifications、lwplan、review_notes_lwplan_2、research，以及实际 workspace/store/gateway/source 实现。已读 safe-code-changes、clear-expression、verification-before-completion。

## 变更事实

| path | change_type | change_purpose | key_changes | related_tasks |
|---|---|---|---|---|
| `session_panel/execution_store.py` | 新增 | 分离人工任务与执行事实 | 三张新表、原连接合同、事务幂等准入、目录与容量占用、公共投影、审批 claim、取消与重启 unknown、事件保留/分页 | S1 / §3.1–3.3 |
| `session_panel/execution.py` | 新增 | 固定可调用的运行入口 | 注册目录真路径/身份/context_hash、严格 body、owner 后恢复、后台 worker、原请求回查、动作归属和关闭 | S1 / §3；S2 窄接线 |
| `session_panel/gateway.py` | 修改 | 同源 HTTP 与 server 生命周期接入 | 精确 execution GET/POST、固定错误矩阵、仅 runs 24KiB body、execution.js、成功绑定后生产初始化、close/bind失败清理 | S1 / §3.1；S3 静态邻接 |
| `tests/test_execution_store.py` | 新增 | 临时 SQLite 与 fake worker 验证 | 同请求竞争、2根/父子/alias、task编辑、审批/取消、重启、DB busy、事件缺口与关闭竞态 | S1 验收 |
| `tests/test_execution_http.py` | 新增 | 无 socket 的真实 handler 验证 | 精确 query/route、状态/reason、Host/Origin/CSRF、body上限、无副作用构造与close | S1 验收 |
| `docs/current/agent-execution-20261013/impl_contract_r1.md` | 新增 | 三包可消费接线合同 | 已与 S2 确认真实 Python 方法、内部/公共字段、owner 生命周期；S3 列表字段接线 | S1–S3 交接 |
| `work/agent-execution-20261013/impl-s1-run.py` | 新增 | 可重复、有历史的验证入口 | 按执行时间写独立 log/json，记录完整命令/输出/退出码，不覆盖旧证据 | S1 证据 |

## 目标对齐

- goal_lock_check：G1 的新 run 与 request_id 可回查，原生字段保留 null；G2 的先登记后启动、owner、根占用与一次动作已实现；G3 的旧 gateway 默认行为与 HTTP 错误合同保留。S2 的真实协议与 S3 的交互由对应作者负责。
- anti_goal_touch_check：未自动修改 tasks/manual_records、旧 JSON、凭证或全局配置；未接受 HTTP cwd/exe/RPC；未启动服务、Agent 或浏览器；未接管 8766/8770；无 Git 初始化、提交或推送。
- authoring_ergonomics_notes：公共 run/approval 投影集中在 store；旧 garden_body 默认 4096 不变；服务以 worker 字典和三个表表达本次生命周期，没有 Provider 基类或队列平台。内部 dropped_cursor 只记录实际删事件的末尾位置，避免全局 seq 的另一 run 间隙被误报为缺失。

## 当轮验证

统一重跑入口：`.venv/Scripts/python.exe -X utf8 work/agent-execution-20261013/impl-s1-run.py`。

| 实际验证 | 结果 | evidence | owner | conclusion_if_missing |
|---|---|---|---|---|
| `python -X utf8 -m unittest discover -s tests -p test_execution*.py -v` | 最新 27 tests，0 failures，exit 0 | `work/agent-execution-20261013/impl-s1-20261013T140927424048Z.log/json` | S1 作者 | 不能声称新增存储/内存HTTP合同通过 |
| 通过 `unittest.main(module='test_workspace', argv=['unittest','WorkspaceTests','-v'])` 只跑旧纯业务类 | 16 tests，0 failures，exit 0 | 同上，完整 Python 命令在日志 | S1 作者 | 不能声称旧纯 WorkspaceService/Store 回归通过；此命令未跑 socket 类 |
| `python -X utf8 -m py_compile session_panel/execution_store.py session_panel/execution.py session_panel/gateway.py tests/test_execution_store.py tests/test_execution_http.py` | exit 0，无输出 | 同上 | S1 作者 | 不能声称所列文件语法通过 |

历史证据保留：`impl-s1-20261013T135523860119Z` 为首次 21 项通过，`impl-s1-20261013T135855033482Z` 为补关闭/启动失败等后的 25 项通过，`impl-s1-20261013T140008187166Z` 为加入旧纯业务与语法检查的通过证据；最新补网关关闭先持久化取消再interrupt，增加为26项。本包没有测试失败；前期合并文件读取出现输出截断，已分别补读关键计划与真实实现；这不被记作产品 PASS。计划前轮 FAIL 和调研历史失败未覆盖。

## coordinator_handoff_verifications

| 验证 | 移交原因与建议承接方式 | evidence_expected | owner | conclusion_if_missing |
|---|---|---|---|---|
| 两个真实 HTTP 实例共享隔离库，次实例只读，显式重启取得owner | socket/OS owner 集成；coordinator 在临时端口自行运行 | `integration-owner.log/json`，HTTP状态、owner实际句柄与旧行前后事实 | root | 不能声明真实多实例归属已验证 |
| 最终 CodexRun + fake app-server 子进程，双根/同key/审批/取消/重启unknown | 真实进程协议集成，超出本作者 impl-safe | `protocol-integration.log/json`，每run/turn/审批发送次数、清理与重启事实 | root | 不能声明已验证真实执行管道 |
| Windows junction alias 与登记根改变 | 单元只验证真路径函数和归一后alias冲突；需要真实reparse对象 | root的隔离目录身份/祖先/别名记录 | root | 不把mock alias当作实机junction证据 |
| S1/S2/S3 就绪后的全量旧测试/新测试 | 避免并行未完成包污染结果；root自行执行完整discover | root完整命令/输出/退出码 | root | 仅有本包27+旧纯16项通过 |
| 真实浏览器与Codex完成/审批/取消 | 不属于本作者权限/证据范围 | 计划§8页面与真实smoke清单 | root | 保留对应未验收限制 |

给 root 的直接构造入口：`ExecutionService(workspace, worker_factory=lambda **kw: CodexRun(**kw, process_factory=fixture_factory), resolver=lambda: python_exe)`；fixture_factory 使用固定 Python/fixture argv 构造最终 `OwnedProcess`；再 `make_server(session_service, ('127.0.0.1', 0), workspace=workspace, execution=execution)`。只允许 Python 构造注入，HTTP 无 argv/policy 覆盖。

root 已消息告知最终 Windows 无模型 wrapper 的 25 项集成 exit 0，证据 `owned-process-integration-r1.log/json`；那是 root 执行的 S2 范围，未在本报告冒充 S1 自证，service 重启与双实例 HTTP 当时仍待验收。

## contract_drift_reports

未发现需修改已审计划的范围/权限漂移。实现阶段细化两点并已通知 root/S2：关闭有界等待后若旧worker仍可能写库，暂持 owner，最后worker收尾时释放；`expire_approvals` 对尚未resolved的 sent 同样失效，decision留存、unknown仍未知，符合计划§6。合同文件早期“sent保留”的内部措辞已更正，没有变更公共协议。

## 未完成、风险与回滚

- 未完成：以上 root 集成、最终独立 Review(Impl)、S2/S3 汇总报告。此报告不签整项产品交付。
- 审查重点：服务关闭与 worker 数据库写入的先后；所有错误 503 均保持提交结果未知；任务修改后快照不被回写；cleanup unverified 继续占根。
- 已知限制：SQLite 硬链接部署不支持；目录选择身份验证不声称抵御同用户恶意替换任意文件；available 只是准备条件。
- 回滚信息：代码可直接回滚到 before 快照，断开execution初始化和新路由；保留新增表与已有运行数据，禁止删除用户数据库。运行中的 owned workers 须先正常关闭。
- 建议英文 commit message：`feat(execution): persist owned Codex runs and expose guarded actions`

无新增跨功能事实。

## r1 补实施：真实丢回包缺陷

root 的 `protocol-http-integration-r1.log/json` 命令退出0、51项业务检查通过，但 stderr 存在真实缺陷：刻意丢回包时 `reply` 的 `ConnectionAbortedError [WinError 10053]` 被 `execution_reply` 误判为服务异常，随即 `reject(503)` 再次写同一断开的 socket，产生第二个 traceback。作者已全文读回原始日志；此失败不能被51项检查或退出0掩盖。

修正仅限新 `execution_reply`：先计算结果/固定错误，再统一一次发送；发送阶段 `OSError` 直接结束，不改已提交回执、不二次回写。旧通用 reply/routes 未变。新增内存handler测试分别模拟成功202与错误503响应时断开，两种分支均只写一次。`impl-s1-20261013T140927424048Z.log/json` 为修正后27项单测、16项旧纯业务和语法检查的全量通过证据；实际断开场景交 root 重跑。先前所有日志保留。
