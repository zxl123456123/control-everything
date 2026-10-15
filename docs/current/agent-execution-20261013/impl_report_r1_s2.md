# Impl r1：S2 所属进程与 Codex 协议

受众：共享。S2 已按已审计划实现，并完成本文列明的 impl-safe 验证。最终 Windows、HTTP 假服务器和真实 Codex 验收由 coordinator 承接；本报告不把单元测试或 fixture 视为真实推理证据。

## 基本信息

- feature_name：`agent-execution-20261013`
- impl_round：`r1 / S2`
- date：`2026-10-13`
- lwplan_version：SHA-256 `469d9a78473f6ce5f73fd2d3fb30ac2a5464e5cb87c27ce2f1c01843a9b6fe53`
- owner：`execution_runtime_impl`
- 权威输入：clarifications.md、lwplan.md 第 4–6 节、research.md、research_execution_policy.md、review_notes_lwplan_2.md。
- 实施规则：已全文读取 safe-code-changes、clear-expression、verification-before-completion；共同接口记录在 impl_contract_r1.md。

## 变更事实

| path | change_type | change_purpose | key_changes | related_tasks |
|---|---|---|---|---|
| `session_panel/owned_process.py` | added | 当前实例排他 owner 与当前运行的进程树所有权 | Win32 64 位签名；非继承 owner/Job/父 pipe；子端 handle list；suspended→assign→resume；UTF-8 JSONL 上限、单 reader/writer；写入不重试；ActiveProcesses=0 与线程结束后才 verified；历史 Job 只查询 | S2 / lwplan §4 |
| `session_panel/codex_execution.py` | added | 单线程、单 turn 的 Codex 原生执行通道 | 固定 argv、config/read 清洗核对、ThreadStartResponse 核对、每次 turn 显式覆盖；持久发送标志先于写入；ID 类型/方向隔离；一次审批 claim、取消竞争、未知状态；白名单事件和 token 快照 | S2 / lwplan §5–6 |
| `tests/test_owned_process.py` | added | 不创建进程的 Win32/pipe 边界验证 | mock API 与 ctypes kernel 边界，调用顺序、启动失败回收、句柄列表、64 位值、部分写、坏 UTF-8/JSON/超长行/队列溢出、owner/query-only | S2 / lwplan §4 验证 |
| `tests/test_codex_execution.py` | added | 协议与真实临时 SQLite 接线验证 | in-memory transport + temporary SQLite，单次发送、早通知、策略拒绝、审批竞争、取消先后、未知结果、token 和截断 | S2 / lwplan §5–6 验证 |
| `tests/fixtures/fake_app_server.py` | added | coordinator 专用真实 JSONL 子进程 fixture | 必须显式 `--fixture --isolated`；目录限制在本 feature work 子目录；command/file/wait/early/故障场景；只记录 method/id/type/decision 与 turn 次数 | S2 / lwplan §4/6 root 集成 |

文件行数与冻结 SHA 见 `work/agent-execution-20261013/impl-s2-file-evidence-r1.json`。两个产品模块分别 429/573 行；Win32 资源所有权与 Codex 协议职责分别位于两个文件，没有 Provider 框架。S1/S3 独占文件未修改；没有改旧 JSON、凭证或全局配置，没有创建 Git 仓库或提交。

## 目标对齐

- goal_lock_check：G1 由新 thread/turn、不可变 run 身份、原生终态和本次 token 落地；G2 由排他 owner、独立 Job/stdio、一次发送、一次审批、取消和回收事实落地；S2 向 G3 提供固定公共事件与审批细节，UI 由 S3 负责。
- anti_goal_touch_check：未恢复旧会话、未自动下一 turn、未实现任意 RPC/exec/cwd HTTP 入口、未发送 acceptForSession 或 policy amendment、未读取/返回完整配置与认证文件、未把 turn 完成写入任务人工状态。
- authoring_ergonomics_notes：Win32 常量和资源生命周期具名；固定策略在入口构造与核验函数中集中；只有一个 CodexRun，无通用适配器。fixture 必须显式启用，不被 unittest discovery 自动运行。生产继承 MCP 的说明和 UI 显示由 S1/S3 保留；本模块不声称进程参数证明所有外部能力隔离。

## impl-safe 验证

以下命令均由 S2 在本轮真实执行，读取完整输出与退出码。未启动真实或假 Agent 子进程、用户服务或浏览器；单测只使用 mock Win32、内存 transport 和新建临时 SQLite。

| 命令 / 核验 | 实际结果 | evidence | owner | conclusion_if_missing |
|---|---|---|---|---|
| `.venv/Scripts/python.exe -X utf8 -m unittest tests.test_owned_process -v` | exit 0，9 tests | `work/agent-execution-20261013/impl-s2-r1-first.log` | S2 | 不宣称 Win32 mock 边界有证据 |
| `.venv/Scripts/python.exe -X utf8 -m unittest tests.test_codex_execution -v` | exit 0，首轮 23 tests | `work/agent-execution-20261013/impl-protocol-r1-first.log` | S2 | 不宣称协议与 store 接线通过 |
| `.venv/Scripts/python.exe -X utf8 -m unittest tests.test_owned_process.OwnedProcessTests.test_queue_overflow_stops_reader_without_blocking_close -v` | **exit 1，1 failure（红测）** | `work/agent-execution-20261013/impl-s2-fault-priority-red.log` | S2 | 不得以没有红测代替缺陷复现 |
| `.venv/Scripts/python.exe -X utf8 -m unittest tests.test_owned_process tests.test_codex_execution -v` | 修复后 exit 0，39 tests，0 failures | `work/agent-execution-20261013/impl-s2-protocol-r1-green.log`、最终 `impl-s2-protocol-r1-verified.log` | S2 | 不宣称最终代码单测通过 |
| `.venv/Scripts/python.exe -X utf8 -m py_compile session_panel/owned_process.py session_panel/codex_execution.py tests/test_owned_process.py tests/test_codex_execution.py tests/fixtures/fake_app_server.py` | exit 0，无诊断输出 | `work/agent-execution-20261013/impl-s2-syntax-r1-final.log` | S2 | 不宣称五文件语法有效 |
| Python 读取五文件并计算行数/SHA，核对 lwplan SHA | exit 0，匹配已审计划 | `work/agent-execution-20261013/impl-s2-file-evidence-r1.json` | S2 | 不把后续修改文件冒充此轮冻结版本 |

还保留了 38 tests 的补测记录 `impl-s2-protocol-r1-final.log`；该文件名是当时快照，最终记录以后续 verified 文件为准。

### 已见失败及修复

1. 上述红测证明：接收队列已经溢出时，`read()` 仍先返回旧消息，测试报告 `AssertionError: ProcessError not raised`。修复为非 EOF 协议故障优先上报；EOF 仍先交付已接收的终态。绿测和最终 39 tests 均 exit 0。此变更已告知 root，要求重新绑定最终 wrapper 集成证据。
2. 初始读取误猜 `session_panel/native_codex.py`，PowerShell 报文件不存在；随后 `rg` 找到并读取实际 `workspace_sources.py:native_codex`。没有创建替代 resolver 文件。
3. 早期多文件读取产生截断；之后针对计划 4–6 节、clarifications、schema 根属性、审批字段和现有 resolver 补读。未以被截断部分作未读即已读声明。
4. 继承基线中的 strict-config 旧字段、MCP dotted key、GBK 输出等研究失败仍保留于原证据，本轮没有覆盖或重新分类为产品成功。

## coordinator_handoff_verifications

| 验证项 | 移交原因 / 承接方式 | evidence_expected | owner | conclusion_if_missing |
|---|---|---|---|---|
| 最终 OwnedProcess 真实父/孙、双组取消、组外对照、UTF-8/超长/阻塞写、reader/writer、owner 冲突与崩溃 | 真实 Windows 进程/跨层集成，超出 impl-safe；root 自行运行已有 `owned-process-integration.py` | 最终文件版本对应日志/JSON、exit code、进程/线程/锁事实 | coordinator | 只能称 mock 通过，不能称最终 Windows wrapper 验收 |
| 真实 HTTP + fake app-server：两项目、父子/junction、幂等与丢回包、审批、取消、EOF、重启 | 服务/子进程完整链，超出 impl-safe；root 使用新 fixture | method/id/type/turn 次数审计、隔离 DB、HTTP 状态、终态与 cleanup | coordinator | 不能称真实协议接线或多实例可用 |
| 原生 Codex 配置/线程返回、真实完成/审批与取消、token、沙箱兼容 | 真实账号与平台状态；root 决定安全 smoke 并运行 | 固定隔离 prompt/权限、清洗策略、原生身份/请求/终态、产物与回收 | coordinator | 不把 fixture 当真实推理；保持账号、审批、sandbox 未验收 |
| 浏览器实际审批与 mobile 操作 | S3 UI 与服务联动，由 root 使用全拦截 fixture/隔离服务验证 | 独立浏览器日志/截图和来源标识 | coordinator | S2 单测不能证明浏览器体验 |

root 曾回传其 wrapper 第一轮集成 exit 0、25 检查；S2 没有独立执行该集成。本报告不以该消息替代最终证据。其后只修改过 `OwnedProcess.read` 的两行故障优先级，因此已明确请求 root 重跑；最终记录由 root 汇总。

报告交接时的 root 进展：S2 已全文读取 root 新执行的 `owned-process-integration-r2.log`（日志记载 exit 0，25 检查、failures=[]）与 `protocol-http-integration-r1.log`（日志记载 exit 0，51 检查、failures=[]）。前者绑定最终 read 修复；后者 stderr 保留刻意丢回包时网关向断开的 socket 二次写入所产生的 `ConnectionAbortedError [WinError 10053]`。该网关缺口由 root 交 S1 窄修，S2 未擅改。这里是读取 coordinator 证据，不是 S2 自行执行集成，也不抹去该 stderr 失败。

### fixture 的准确入口

由 root 在 `OwnedProcess` 的 Python `process_factory` 中固定构造；HTTP 不能提供这些参数：

```python
OwnedProcess(sys.executable, ["-X", "utf8", absolute_fixture_path,
    "--fixture", "--isolated", absolute_feature_work_child,
    "--scenario", scenario, "--audit", absolute_audit_jsonl], run_cwd, job_name)
```

`absolute_feature_work_child` 必须已存在、位于 `work/agent-execution-20261013` 下且不能是该根本身；run_cwd 与 audit 都必须在该隔离目录内。场景为 `complete/command/file/wait/early/unsupported/eof-after-turn/bad-policy/fragmented/token-regression`。可加 `--spawn-child`，其 PID 只写隔离目录的 `fixture-child.pid`，供 root 观察己方 Job 树。

command/file 返回原生请求 id 整数 1，与 initialize 的客户端 id 同号。accept 后 fixture 仅写自身 cwd 的 `fixture-marker.txt`，固定内容 `fixture-only\n`，然后 resolved/completed。wait 等待 interrupt；early 在 turn/start response 前发 turn/started 和 delta；eof-after-turn 记录接收计数后退出。审计只记录 method/id/type/decision/turn 次数等允许字段，不记录 prompt/config。它不调用 Codex，不证明模型行为。

## contract_drift_reports

未发现需回退 Gate-2 的范围或权限漂移。implementation contract 对 sent-but-unresolved 的审批保留 decision 和发送事件，在终态时将仍未决状态 expired；S1 已将早先“sent 保持”措辞更正，S2 单测使用最终 store。取消终态宽限从实际发送 interrupt 开始，turn/start 在途仍不重发，未知结果保持 unknown。

## 未完成、风险与审查重点

- S2 未执行 coordinator_handoff_verifications；真实推理、原生审批、Windows sandbox 与完整 UI 结果以 root 后续证据为准。
- 独立 reviewer 应重点核对 Win32 每个句柄唯一释放、cancel/approval 写入竞争、ThreadStartResponse 的保守拒绝、终态不覆盖和丢回包不重发。
- effective_policy_mismatch 会阻止 turn；现有账号或配置不兼容不会自动降级。生产独立 MCP 仍可能继承；read-only smoke 的 `_disabled_mcp_ids` 只来自 Python 内部构造并逐 ID 核验，HTTP 无入口。
- 清理失败不伪装 verified，重启只短暂查询旧 Job，不接管旧 RPC 或按旧 PID 终止进程。

## 回滚与提交建议

回滚信息：**可直接回滚** S2 新文件与 worker 接线；运行中的己方 worker 先由 service 有界收尾。保留新增运行记录，不删除用户数据库，不重发历史 turn。接线文件由 S1 统一处理。

英文 commit message 建议：`feat(execution): own Codex runs and serialize single-use approvals`

无新的跨功能事实。
