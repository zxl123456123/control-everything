# Codex 执行闭环低层计划

日期：2026-10-13；受众：共享；任务类型：T3。唯一实施计划；尚未实施。本文使用 implementation-planning 与 clear-expression 规则。Gate-1 自检见第 9 节；进入实现仍需要独立 Gate-2。

## 1. 范围与对齐

本轮把一个任务显式交给 Codex，展示实际运行、具体审批与取消结果。每个 run 创建一个新的原生 thread，并且只发送一个 turn；不恢复旧会话，不自动续发下一轮。人工任务状态、原会话关联和本次 run 是三种事实。模型完成后，用户仍自行验收产物和调整人工任务状态。

权威输入是本目录 README、clarifications 的完整实现基线、research、research_execution_policy、review_notes_readiness_1，以及上一 feature hlplan 第 8/9 节。Readiness 已 PASS；root 的 native-model-probe 只证明 initialize/model/list，Windows probe 只证明基础 suspended→Job→resume→关闭组回收。它们不代替下文最终实现验证。

- G1 落在 S1/S2：登记项目的任务、显式 prompt、原生身份、事件与结果；保存任务本身仍不派发。
- G2 落在 S1/S2：所属运行、进程树、幂等登记、一次审批、取消、失联与重启。
- G3 落在 S1/S3：现有 API 兼容，桌面与 360/390px 操作、来源和缺口可见。
- 反目标 N1：不把 turn 完成当项目完成，不以 fixture 代真实推理；N2：不做代理、沙箱绕过、全局审批、外部会话接管或公网服务；N3：不改旧 JSON、凭证、全局配置，不引入通用 Provider/IDE/调度平台。

并发采用 root 本轮收敛的固定边界：同一工作台实例最多 **2** 个运行；规范化后的项目根相同或互为祖先/子孙时互斥；无隐式排队。单数据库只有一个执行 owner，但它可持有两个独立 worker。此处不创建用户配置项。非 Windows 主机保留观察/手工管理，执行显示 `platform_unsupported`。

原 8766 不动；8770 已验收预览在新验收前保留。运行/审批数据只新增到 workspace SQLite，不迁移 tasks、manual_records 或旧文件。无 Git，不初始化或声称已提交。全局配置继承范围明确展示；cwd 与工具权限不是同一个安全边界。

## 2. 核心链路总览与事实映射

现状是 `workspace.js → gateway.workspace_reply → WorkspaceService → WorkspaceStore`，负责手工事实；quota 是独立短命只读 probe。本轮新增 `execution.js → gateway.execution_reply → ExecutionService/ExecutionStore → CodexRun → OwnedProcess`。HTTP 只登记动作并读本地结果，worker 持有长连接和进程；浏览器离开不会关闭运行。

```text
选任务 → GET context（已登记真实目录、准备摘要）
       → POST runs（固定 request_id，事务先登记）→ 202 本地主机已接收
       → suspended process → Job 归属成功 → resume → initialize
       → thread/start → 核对实际有效策略 → 持久化“准备发送” → turn/start（仅一次）
       → 通知/请求分流 → 本地事件/审批 → 浏览器按游标读取
       → 具体单次答复或 interrupt → 原生终态 / unknown → 回收 Job → 清理事实
```

复用原网关 Host/Origin/CSRF、固定静态资源、项目注册、SQLite 连接事务和 UI 样式。执行通道不复用 quota 的“忽略非目标消息”收包逻辑；也不改历史索引与 terminal/garden 的授权合同。分层只服务本次状态、协议、Windows 句柄与 UI 四个不同责任，不创建 Provider 基类或消息总线。

| 调研事实 / 来源锚点 | 实现锚点 | 验证与结论边界 |
|---|---|---|
| native_codex 实际解析 0.162 alpha；旧 shell 0.118 不是相同协议证据（research A） | S2 固定 resolver、记录 exe/version；本轮 schema 字段 | impl schema fixture；root 实际握手，不推断发生升级 |
| 旧 tasks 是手工状态，项目/provider 可改（workspace.py:162、workspace_store.py:73） | S1 immutable task/project/cwd 快照；不写 tasks.state/session_key | 临时 DB：运行后编辑任务仍不改变该 run 的身份 |
| 新 ThreadStart 请求 enum 与响应 SandboxPolicy 不同（research C1、policy E） | S2 请求构造、响应逐项核对、turn 显式覆盖 | mock 不匹配必须在 turn 前失败；root 真响应摘要 |
| server request 与 client RPC ID 是不同方向；id 类型须保留（research C3） | S2 分流器、原生 id JSON 与本地 approval UUID | 同号 int/string、同 item 多请求、双浏览器竞争 |
| interrupt 接受不代表 interrupted（research C2） | S2 cancel_requested 与原生终态分离 | 迟到 completed、interrupt error、EOF 均保留实际结果 |
| clientUserMessageId 无幂等保证（research F/U6） | S1 request_id 唯一登记；S2 不重发 turn/start | HTTP 丢回包/重试、写后断线、重启均不重复启动 |
| Job 要在执行前归属；root 基础 probe 可行（clarifications 当轮补证） | S2 CreateProcessW suspended/Assign/Resume；持有本次句柄 | root 最终 wrapper 的真实父/孙与组外对照，不能用 mock 代替 |
| inside_project 只有字符串归属（workspace.py:36） | S1 真路径/目录身份、父子根互斥、S2 启动前复核 | junction alias、父子目录、登记根变更、非目录 |
| 多实例共享 DB 不能各自接管（基线第 3 节） | S2 排他 owner 文件句柄；S1 非 owner 只读 | 两个实际 server/临时同库；关闭 owner 后显式重启新 owner |
| hooks/notify 可分别关闭；空 MCP table 不清继承（policy C/D/F） | S2 固定 argv 与策略摘要；S3 继承说明 | root 无 turn 有效策略清洗摘要；不输出配置正文或凭证 |
| token 是 run 通知累计值，不是账号日账单（research F） | S2 保存最新 total/last 与采样时间；S3 本次运行标签 | 重复/倒退/缺失/null；不相加快照、不推导费用 |
| 旧 browser fixture 精确拦截静态/API（verify_workspace.cjs:63） | S3 同步 execution.js 静态与新增只读 API fixture | root 重跑原浏览器用例和新增用例；不让真实 API 穿透 |

#### 本轮修订说明

[修订: Review-LW-R2.I1] 补齐评审唯一 I1 的前端端点：实际 `workspace.js:75` 当前只抛翻译后的 message，S1 的稳定 HTTP status/reason 需由 S3 的 api helper 保留，才能区分 context_changed、回查404与503/网络未知。对应第3.1节错误合同、第7节接线/提交/回查片段及 S3 验证锚点。片段闭环为 HTTP→本地登记（第3节）、进程→策略→发送（第5节）、回调→动作→终态（第6节）、bootstrap/api→固定body/key提交→结果回查→UI（第7节）；顺序、字段和失败语义是合同，片段不要求逐字实现。

## 3. 公共接口、持久状态与 S1：先固定可消费合同

**目标/依赖/边界**：消费 G1/G2/G3、N1/N2/N3。先实现新表、事务与窄 HTTP 接线，再让协议包填入 worker；不在旧 WorkspaceService 中混入执行状态机。关键文件为新增 `session_panel/execution_store.py`、`session_panel/execution.py`，以及 `gateway.py` 的 GET/POST 精确路由、`make_server` 和 `PanelServer.server_close`。测试为 `tests/test_execution_store.py`、`tests/test_execution_http.py`。reviewer 先看 `ExecutionService.submit/context/snapshot/act` 和 `ExecutionStore.admit`，可预见“一个有界运行表、一个 worker 字典”，而不是事件溯源平台。

`make_server(..., execution=None)` 保持旧调用无执行副作用；生产 serve 在成功绑定本机端口后创建一次 `ExecutionService(workspace)` 并挂到 server，初始化失败记录固定不可用原因且保留旧页面。PanelServer.server_close 幂等关闭该 service 后再关闭 listener；bind失败不得遗留owner。测试仅通过Python构造注入 fake process/clock/store；smoke的固定安全profile同样只由root测试构造传入，HTTP和环境变量均不能启用任意argv覆盖。

### 3.1 HTTP 矩阵

所有接口沿用 `X-Session-Client`；所有 POST 仍需要正确 Origin/CSRF。请求字段精确匹配，未知字段拒绝。HTTP 不接受 exe/cwd/native thread/native request id/任意 RPC。run、approval、request_id 使用本地主机生成或校验的 UUID；原生 ID 只由 Provider 回包提供。

| 方法/路径 | 请求 | 响应/边界 |
|---|---|---|
| GET `/api/workspace/execution` | 无 query | `capability`、最近 50 个 run 摘要、总数、全部 active（最多 2）、限制说明；不启动 Agent |
| GET 同路径 `?request_id=<uuid>` | 仅此 query | `{run}` 原提交摘要；未查到返回 404/request_not_found（R2.I1补明），供丢回包/重载查询 |
| GET `/api/workspace/execution/context?task_id=<uuid>` | 仅此 query | task/project 名称、真实 cwd、`context_hash`、固定策略与继承说明；不启动 Agent |
| POST `/api/workspace/execution/runs` | `{request_id,task_id,context_hash,prompt}` | 新登记 202 `{run,replayed:false}`；同内容重试 200 `{run,replayed:true}`；并发/过期/冲突 409 |
| GET `/api/workspace/execution/runs/<id>?after=<seq>` | 非负游标，默认 0 | 同一事务的 `{run,approvals,events,next_cursor,first_cursor,gap,has_more}`；每页最多 200 事件 |
| POST `/api/workspace/execution/runs/<id>/cancel` | `{}` | 202 已登记取消或 200 已有事实；不由 HTTP 假定已停止 |
| POST `/api/workspace/execution/runs/<id>/approvals/<approval_id>` | `{decision:"accept"|"decline"|"cancel"}` | 202 答复排入当前 worker；同一决策重试返回原回执，冲突/过期 409 |

公共投影固定使用 snake_case：`capability={implemented,available,reason,is_owner,max_active:2}`，available 只表示本机准备条件，不保证账号推理；context 为 `{task:{id,title},project:{id,name,cwd},context_hash,policy:{mode,approval_policy,approvals_reviewer,network_access,writable_roots,inheritance_note}}`。run 摘要含 id/request_id/task_id/task_title/project_id/project_name/cwd/mode/state/reason/thread_id/turn_id/model/cancel_requested/cleanup_state/token_usage/token_observed_at/created_at/updated_at/ended_at；可空原生字段保持 null，详情另含 prompt/effective_policy。审批投影为 `{id,kind,detail,detail_complete,status,decision,can_accept}`，不把 native_id_json 作为动作参数返回；事件为 `{seq,kind,payload,observed_at}`。approval.status 固定 `pending/queued/sending/sent/resolved/expired/unknown`；capability unavailable 时旧数据仍可读。

运行 prompt 为非空文本，最长 4,000 字符且 UTF-8 不超过 16 KiB。仅新 runs POST 使用 `garden_body(max_bytes=24576)`；该函数默认保持 4096 和现有 Content-Length/Content-Type/总读取时限规则。其他旧调用不改变限额。生产固定 `workspace-write`，HTTP 不接受 mode 覆盖。请求不支持 model/工具/配置任意覆盖；模型由当前 Codex 默认配置选择，实际结果留档。

固定错误至少覆盖 invalid_request(400)、task/run/approval_not_found(404)、idempotency_conflict/context_changed/project_busy/capacity_busy/approval_expired/decision_conflict/other_instance(409)、execution_unavailable/storage_unavailable(503)。源错误用固定 reason，不能直接把 stderr、配置或异常 repr 发前端。未登记失败与已登记 run 后续失败分开；后者可用原 request_id 查回。

#### 本轮修订说明

[修订: Review-LW-R2.I1] 错误继续使用现有 gateway.reject 的 JSON envelope 与 HTTP 状态，不新增错误类。前端 api 抛出的 Error 增加 `status:number|null`、`reason:string`，原 `message` 及旧调用读 error.message 的行为保持。HTTP错误保留响应状态与固定 reason；网络/超时为 status=null、reason=`network_error`/`timeout`；无效JSON为实际HTTP状态、reason=`invalid_response`；post 在本地发现无CSRF时标 `csrf_unavailable` 且未发HTTP。新映射补入 reason 文案，不让旧保存/额度/资讯调用改为依赖新字段。

[修订: Review-LW-R2.I1] runs POST 明确的准入拒绝组合仅为 400/invalid_request、404/task_not_found、409/context_changed|project_busy|capacity_busy|other_instance：返回时本次请求未登记；其中 context_changed 保留草稿并重新准备。409/idempotency_conflict 表示旧key可能已有不同内容，必须回查，不能当未登记。所有503、网络/超时、坏响应均保守为“提交结果未知”。GET request_id 的 404/request_not_found 只表示查询时尚未查到，不能排除原POST仍在途；可显式重试原body/key，但不能据此换key。回查503/网络等仍未知，仅允许继续查询。该合同不改变原事务准入和后端执行状态机。

### 3.2 新表及不变量

`ExecutionStore` 复用 `WorkspaceStore.connection()` 的有界连接和异常合同，新增表使用独立一次建表锁，不改旧表定义。所有准入/动作决策采用 `BEGIN IMMEDIATE`；参数化 SQL。无已有运行迁移，旧表可在新旧代码间继续打开。

| 表 | 最小字段 |
|---|---|
| `execution_runs` | id、request_id UNIQUE、request_hash、owner_id、task_id、task_title、project_id/project_name、cwd、root_identity、mode、prompt、state、reason、thread_id、turn_id、model、effective_policy_json、turn_send_started、cancel_requested、job_name、cleanup_state、token_json、token_observed_at、created_at/updated_at/ended_at |
| `execution_events` | seq INTEGER PRIMARY KEY AUTOINCREMENT、run_id、kind、payload_json、observed_at；索引(run_id,seq) |
| `execution_approvals` | id、run_id、owner_id、native_id_json、method、thread_id/turn_id/item_id、detail_json、detail_complete、status、decision、created_at/updated_at；UNIQUE(run_id,native_id_json) |

owner_id 是每个执行 owner 启动时生成的 UUID，不是持久 PID。request_hash 是规范 JSON 请求字段的 SHA-256；同一个 request_id 先查已登记内容，再检查现在的 task/context。相同请求总是回同一 run；不同内容 409，绝不复用 ID 创建新任务。

context_hash 来自 task 的 id/updated_at/project/provider、登记根经 `Path.resolve(strict=True)` 得到的规范绝对路径及 `stat` 目录身份（设备/文件标识）与本轮策略版本。只允许已登记、存在的本地目录；拒绝 UNC、非目录、盘根和无法确认身份的路径。task 的 provider 必须为 codex；不自动改负责人。提交和 thread/turn 发送前都复核根身份；不接受前端给的路径。它保护目录选择和冲突判断，不声称阻止同用户恶意更换任意文件系统对象。

准入在一个事务内检查现有 active/cleanup 未确认的 run：数量小于 2，且 `commonpath` 判断无相同/祖先/子孙根；重解析 junction 后再比较，不能以字符串前缀代替。两个独立根可同时运行；如果用户随后编辑任务，run 继续引用它自己的不可变启动快照。

```python
# execution.py: submit; execution_store.py: admit — 关键顺序
validate_exact_request(body)
with store.immediate() as tx:
    previous = tx.find_request(body["request_id"])
    if previous:
        return same_hash_or_conflict(previous, hash_request(body))
    require_execution_owner()
    context = resolve_registered_task(body["task_id"])
    require_current_hash(context, body["context_hash"])
    require_capacity_and_disjoint_roots(tx, context.cwd, limit=2)
    run = tx.insert_run(context, body, state="starting", owner_id=self.owner_id)
# commit before any executable starts; one worker per newly admitted run only
self.start_worker(run.id)
return accepted(run)
```

### 3.3 状态与浏览器事实

run.state 为 `starting/running/waiting_approval/cancel_requested/cancelled_before_send/completed/interrupted/failed/unknown`。只有匹配原生 turn/completed 的 status 可以产生 completed/interrupted/failed；本地启动前拒绝也可 failed，但必须附 `reason` 和 `turn_send_started=false`。发送前取消使用本地终态 cancelled_before_send，显示“发送前已取消”。已开始写 turn/start 后 EOF、超时或异常退出，没有匹配终态则 unknown。不可把空 items、进程退出或 HTTP 202 当作 completed。

`cleanup_state` 独立为 `pending/verified/unverified`。completed 但仍未证明回收时保留清理提示和目录占用；unknown 且回收 verified 仍不是失败前未执行。终态重复通知幂等，冲突终态标协议异常且不覆写已见事实。取消与正常完成竞争时最终可 completed，UI 说明“结束先于取消生效”。

每个 run 只持久化白名单事件：phase、agent_message、command、file_change、approval、error、token_usage、turn_finished、cleanup。忽略推理内容和不相关会话；不把原始 JSON/配置/凭证/环境变量全量落库。消息与命令输出按每条 4 KiB、最终消息 32 KiB 截断并标记；每 run 保存最新 2,000 事件，删旧事件后返回 first_cursor/gap，run 摘要与 pending approval 不随事件删除。完整审批细节上限 64 KiB；超过时只可拒绝/取消，禁止让用户批准不完整内容。

**S1 实施顺序与验收**：先新表/准入/重启转换，再 service 方法与精确路由，最后 server 关闭接线；先用 fake worker 工厂证明“只登记一次”。impl 只运行临时 SQLite 与内存 HTTP handler/本地 fixture 单测，证据 `work/.../impl-s1.log`；覆盖精确字段、原边界、Unicode 上限、并发准入、同请求竞争、两根互不串流、父子/junction、任务编辑、DB busy、游标缺口。root 承接真实双实例 HTTP 与隔离 DB 证据 `integration-owner.log/json`，缺它不能声明多实例归属已验证。S1 回滚移除新增路由/执行初始化，保留新表和记录，不删用户 DB。作者体验：公共字段在本节一处定义，旧 API 默认参数不变，错误文案集中映射；不扩散同义状态名。

## 4. S2：Windows owner、进程树与 Codex 生命周期

**目标/依赖/边界**：消费 G2、N2/N3，依赖 S1 的 owner/run/job_name 字段；关键文件新增 `session_panel/owned_process.py`、`tests/test_owned_process.py` 和 root 专用 `tests/fixtures/fake_app_server.py`。reviewer 首读 `ExecutionOwner.acquire/close`、`OwnedProcess.start/read/write/close`；目标形态是一层明确持有和释放的 Win32 句柄，不是任意命令运行器。HTTP 永远不能调用这个内部入口传 argv。

执行 owner 以规范 DB 路径旁 `.execution.lock` 文件的 `CreateFileW(OPEN_ALWAYS, share=0)` 非继承句柄持有排他权；不删除锁文件。不能获取则执行为 `other_instance`，现有页面和新运行记录可读，但该实例不能创建/审批/取消，也不能把别人的 active 行改 unknown。owner 生命周期由 server 显式 close；只在全体 worker 收尾后释放。第二实例需要显式重启以竞争 owner，不做隐式抢占/lease。SQLite 的事务准入仍是第二层防并发，测试使用规范路径；SQLite 硬链接数据库不作为支持部署形式。

运行使用标准库 ctypes：创建非继承 Job 句柄，设置 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`，不启用 breakaway；使用 `STARTUPINFOEXW` 和 `PROC_THREAD_ATTRIBUTE_HANDLE_LIST` 限定仅继承 stdin/stdout/stderr 子端。父端、Job、owner 锁句柄均不继承。`CreateProcessW` 给定 resolver 的绝对 exe 与 `subprocess.list2cmdline(argv)`，flags 含 CREATE_SUSPENDED、CREATE_NO_WINDOW、EXTENDED_STARTUPINFO_PRESENT；先 AssignProcessToJobObject 成功，再 ResumeThread。assign/resume 失败时先结束尚未运行的己方 process，再释放所有句柄，不降级为普通 Popen。

stdout 使用单 reader，按 UTF-8 JSONL 组帧；单行上限 1 MiB、接收队列 128 条，超限按协议故障停己方 run。stderr 接 NUL，不收原配置或认证错误正文。stdin 单 writer 串行，每次写入等待最多 5 秒；写入阻塞/部分写即按未知发送处理并回收。reader 使用 PeekNamedPipe/ReadFile 的有界读取与 stop event，避免在持有 Python file 锁时跨线程 close 阻塞；writer 只服务本 run，Job 回收后管道断开并有界 join。所有 Win32 函数设置 argtypes/restype，防 64 位句柄截断；每个 handle 明确唯一关闭责任。

正常 turn 结束后关 stdin，最多等 2 秒；仍有进程则 TerminateJobObject，只针对己方 Job。查询 Job 的 ActiveProcesses 为 0，reader/writer 均已退出后记 cleanup verified；超时/查询失败则 unverified 并继续阻止该根新任务。仅 process.wait 成功不够。网关 close 对两个 run 分别请求取消，在总有界宽限后回收所有己方 Job；不能扫描 codex.exe 或对旧持久 PID taskkill。

每个 Job 使用带 owner_id/run_id 的随机唯一名称，并在 spawn 前保存。重启取得 owner 后，所有旧未决 run 改 unknown、审批 expired，不做 resume/replay。旧 Job 只用 `OpenJobObjectW(JOB_OBJECT_QUERY, inherit=False)` 短暂查询：不存在或 ActiveProcesses=0 才释放其目录占用；仍活/拒绝访问则保持 cleanup unverified，不依据 PID 杀进程。查询句柄立即关闭，避免阻止 kill-on-last-close；不重新持有或接管旧任务。微软说明 Job 在最后句柄关闭且关联进程终止后销毁，因此“找不到同名对象”与“无法查询”必须分开处理；重启后协议效果仍 unknown。[Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)、[OpenJobObjectW](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-openjobobjectw)。此恢复检查必须有 root 崩溃集成证据，不以文档代实测。

```python
# owned_process.py: start/close — 生命周期骨架
job = create_named_job(run.job_name, kill_on_close=True, inheritable=False)
process, primary_thread = create_suspended_with_pipe_handle_list(exe, argv, cwd)
try:
    assign_job(job, process)  # must precede any agent execution
    resume_thread(primary_thread)
finally:
    close_handle(primary_thread)
# ... during cleanup, use owned handles; never rediscover by executable name
terminate_if_needed(job)
verified = wait_active_processes_zero(job) and join_pipe_threads()
record_cleanup(verified)
close_owned_handles()
```

**S2 验证/回滚/作者体验**：impl 只用 fake Win32 函数测试调用顺序、每个失败点句柄释放、无 breakaway/继承泄漏、非 Windows 降级；日志 `impl-s2.log`。root 必须用最终 wrapper 跑真实无模型父/孙、组外对照、两组取消隔离、stderr/pipe EOF、写阻塞、owner 崩溃与重启未知，记录 `owned-process-integration.log/json`；旧 probe 只能作设计依据。缺证据只报 Windows wrapper 未验收。回滚禁用执行 capability，保留数据库，不改旧 quota probe。作者体验以具名 Win32 常量、短资源所有权注释和一个 close 路径保护可读性；不复制 probe 脚本作为产品 API。

## 5. S2 续：固定 Codex 协议与有效策略

**目标/依赖/边界**：消费 G1/G2、N1/N2/N3，依赖 S1 与第4节owned生命周期；关键文件新增 `session_panel/codex_execution.py`、`tests/test_codex_execution.py`，以及 `execution.py` 的 worker 工厂。reviewer 先看 `CodexRun.run/handle_message/answer/interrupt/finalize`；一个 worker 只持有一个 stdio、新 thread、单 turn。没有通用 Provider 注册层、历史恢复或任意 RPC 暴露。

### 5.1 固定启动与受约束策略

使用实际 `native_codex()`，无 shell，不升级、不安装、不登录。进程 argv 固定为本机已证实支持的入口，TOML 字符串作为单独 argv：

```text
app-server --listen stdio://
--disable hooks --disable plugins --disable apps --disable multi_agent --disable goals
-c notify=[] -c web_search="disabled"
-c sandbox_workspace_write.writable_roots=[]
-c sandbox_workspace_write.network_access=false
-c sandbox_workspace_write.exclude_tmpdir_env_var=true
-c sandbox_workspace_write.exclude_slash_tmp=true
```

这些关闭已知额外能力，未证明禁用所有独立 MCP 或系统 managed 配置。生产准备区固定说明：“本次使用本机 Codex 账号与设置；内建命令采用所示沙箱。独立 MCP 等外部服务可能继承本机设置，其副作用不由项目目录限制覆盖。”不把继承说明藏进审批详情。config/read 只在 worker 内作允许字段判定，includeLayers=false；不能落盘/返回完整配置。缺失字段不默认视作关闭；关键显式覆盖被拒绝或实际策略不匹配时停止。固定采用普通兼容解析，不带 strict-config，也不做失败后宽松重试：root 实测现有 disable_response_storage 旧字段使严格解析退出1，原配置保持不变。

initialize → initialized 后先发 config/read（cwd=本次根，includeLayers=false），逐项确认上述 features=false、notify=[]、web_search=disabled、sandbox_workspace_write 四项覆盖；只保留匹配布尔摘要，不记录完整响应。核对失败不创建thread。随后 thread/start 传服务器确定的 cwd、sandbox=`workspace-write`、approvalPolicy=`on-request`、approvalsReviewer=`user`、ephemeral=true；workspace-write 的 config 重申额外写根空、网络 false、排除额外 temp 根。未设置自定义系统 prompt、任意 model 或客户端 tools。当前本地 schema 支持 ephemeral，但本轮 SQLite 仍保存返回的 thread id；不承诺 Codex 历史可恢复。

核对 ThreadStartResponse 的 cwd 真路径、approvalPolicy、approvalsReviewer、sandbox 与请求一致；workspaceWrite 需 networkAccess=false、两个 exclude=true、额外 writableRoots 为空或仅规范 cwd（不得包含其他根）；readOnly 需 networkAccess=false。出现 dangerFullAccess/externalSandbox、未知类型或权限 profile 与 sandbox 无法确认时，在 turn/start 前 failed。原生 model/modelProvider 记录为实际值，不把 model/list 默认候选当成最终已执行模型。

turn/start 同时传 cwd、approvalPolicy、approvalsReviewer 和完整 workspaceWrite sandboxPolicy，防继承差异。收到原生错误时失败/未知按发送阶段区分；TurnStartResponse 不回显全部策略，因此只能声称“线程返回已核对，本 turn 显式覆盖被接收”，不能声称 OS 隔离已由 JSON 证明。真实沙箱验收见第 8 节。

```python
# codex_execution.py: run — 审查关键发送顺序
initialize_then_notify_initialized()
require_config_overrides(rpc("config/read", {"cwd": run.cwd, "includeLayers": False}))
created = rpc("thread/start", make_thread_params(run))
require_effective_policy(created, run)
store.bind_thread_and_policy(run.id, created)
require_same_registered_root_identity(run)
if cancel_latched():
    finish_without_turn("cancelled_before_send")
else:
    store.mark_turn_send_started(run.id)  # durable before any turn bytes
    started = rpc_once("turn/start", make_turn_params(run))
    bind_or_confirm_turn(started["turn"]["id"])
```

初始化/建 thread/开始 turn 的每次 RPC 等待最多 20 秒，管道写最多 5 秒；过程中照常处理通知/server request。无响应不重发。turn 正常运行没有人为整轮时限，用户可取消；所有等待审批仍保持读流，不持有 HTTP 连接。

生产不提供权限模式选择。仅 root 的隔离验收构造可注入固定 read-only smoke 策略和已枚举 MCP 的禁用 ID，不能从HTTP设置；此策略经过相同 context_hash、config/read、ThreadStartResponse 校验和原生执行链，使用对应 readOnly 对象，不夹带 workspaceWrite 专有字段。

### 5.2 协议分流和状态推进

判断顺序：有 method+id 是 server request；有 method 无 id 是 notification；有 id/result 或 id/error 是 client RPC response。两个方向各自保存 ID；bool 不能当整数 id；字符串/整数保持 JSON 类型。未知 envelope、超长/坏 JSON、非 UTF-8、同 RPC 多个冲突结果视协议失败，停止己方 Job。

仅当前 worker 的 thread/turn 可入库。thread/start 回包前的相关消息放最多 32 条有界缓冲，绑定后逐条校验；turn/start 已写且 turnId 尚未返回时，可由同一新 thread 的 turn/started 首次绑定，之后 RPC response 必须一致。其他 thread 消息不归入任一 run；不因收到未知 ID 自动创建或接管运行。

item/started 与 completed 用 itemId 合并；agent delta 是增量，最终 agentMessage 内容替换该 item 的展示完整值，避免重复拼接。文件审批内容必须关联同 item 的 fileChange changes；请求本身的 grantRoot 不作为可靠权限边界。error.willRetry=true 记事件，不抢先终结；thread idle、serverRequest/resolved 都不能作为 run completed。

token 通知保存最新的 `total`、`last`、采样时间和 source=`codex_app_server`。同 run 累计 total 倒退时显示 `usage_inconsistent` 并保留原观察，不做跨快照加总；零必须来自有效原值，缺失显示未知。不在本轮生成全账号日 Token/金额，不自动写入人工用量表。

## 6. S2 续：一次审批、取消与错误闭环

支持具体 `item/commandExecution/requestApproval`、`item/fileChange/requestApproval`。每个请求生成本地 approval UUID，保存 owner/run/thread/turn/item、原生 request id 类型、完整可审阅字段。command 卡显示 command、cwd、reason、networkApprovalContext/目标（如有）；file 卡显示路径和完整 diff。没有具体 command 或关联 diff、细节超限或身份不匹配时，accept 禁用；仍能 decline/cancel。路径必须显示解析后的作用对象，无法解析时显示原文与“范围无法核验”，不称为项目内操作。

不发送 acceptForSession、永久 exec/network policy amendment；不把普通 decision 套到 permissions/requestApproval。对于权限集合、用户输入、MCP elicitation、dynamic tool、认证刷新、attestation 和 legacy 请求，本轮显示 `unsupported_request`，回固定 JSON-RPC unsupported 错误并对当前 turn 请求 interrupt；不自动答“同意”、不静默悬挂、不调用外部工具。这会使某些现有配置任务无法继续，属于明确兼容限制。

同一 worker 用一个短锁保护动作排队和 pending 状态；只由该 worker 写 stdio。HTTP 的答复先事务 claim 为 queued，再排入该 run 的有界 command queue。worker 在实际发送前复核 owner/turn/未取消/未 resolved；失效则 expired。发送前记 sending，写入后记 sent；写入失败/不明则 unknown，关闭该 run，不重发。相同 ID 相同内容重复 server request 复用 pending；相同 ID 变化内容视协议异常，不复用旧审批。相同 item 新 approvalId/request id 是新请求。

```python
# execution.py: approve; codex_execution.py: drain_actions — 一次答复骨架
with worker.lock:
    pending = store.claim_approval(run_id, approval_id, owner_id, decision)
    # same decision returns prior receipt; stale/conflicting action raises 409
    worker.enqueue_once(pending.id)
# worker is the sole writer and checks cancellation/resolution again
if still_pending_and_owned(pending) and not cancel_latched():
    mark_sending(pending)
    send_json({"id": pending.native_id, "result": {"decision": pending.decision}})
    mark_sent(pending)
```

取消以 runId 查当前 owner 的 worker，不从 task.session_key 找原生会话。持久化 cancel_requested 后不再接受新 approvals.accept；重复取消返回原事实且不重复发送 interrupt。若 turn 尚未写，停止创建链并回收，reason=`cancelled_before_send`，不伪造原生 interrupted；若 turn/start 在途，等待其实际 turnId 或 matching turn/started，再发送一次 interrupt。知道 turnId 后 interrupt 回包仅表示已接收；最多给 5 秒终态宽限，仍无终态则强制回收己方 Job，并将协议结果记 unknown。UI 可同时显示“己方进程已结束，原生结果未知”。

取消先 claim 则阻止尚未发送的 accept；accept 已实际发送后取消不能撤销已发生副作用，事件保留先后顺序。收到完成后所有未决审批 expired。任何关闭/重启均不把持久 request id 交给新 app-server。两 run 的 RPC ID 可同号，必须隔离到各自 worker 和 stdio。

**S2 验证/回滚/作者体验**：impl 只运行 in-memory transport/临时 DB，证据 `impl-protocol.log`；覆盖全部协议分支、策略拒绝、partial write、初始化期间请求、早到 turn 通知、双 run 相同 native id、双决策/取消竞争、未知请求、超限、重复/冲突终态和 token。root 承接真实 fake app-server 子进程集成 `protocol-integration.log/json`，再按第 8 节做真实 Codex 验收；前者不证明账号/原生审批。回滚断开 worker 工厂并使 capability 不可用，不删除 run 记录、不重试历史发送。作者体验：协议方法用具名常量和小处理函数，归一化只在边界做一次，持久状态与原生状态各有明确字段；不为每个未来请求建立空 handler。

## 7. S3：可操作的最小运行界面

**目标/依赖/边界**：消费 G1/G2/G3、N1/N2/N3，依赖 S1 公共接口（可先用 fixture，与 S2 并行）；关键文件新增 `web/execution.js`，修改 `workspace.html/css/js`、gateway 的精确静态资源、`tests/verify_workspace.cjs`，新增 `tests/verify_execution.cjs`。reviewer 先看 `WorkspaceExecution.init/openTask/loadRun/renderApproval`、`workspace.js.showView/renderTasks/bootstrap`；目标是原页面一个“运行”视图和任务按钮，保留旧手工表单。

`execution.js` 使用独立闭包，暴露窄 `window.WorkspaceExecution`（init/openTask/onView/refresh）；HTML 在 workspace.js 前 defer 加载它。workspace.js 的 bootstrap 传入 api/post/showView/getSnapshot；showView 加 runs 分支，task 卡增加“交给 Codex”按钮，只对 codex 任务启用并进入准备界面。不重写旧 UI 成框架，也不把保存任务按钮改成派发。

准备区显示任务、已登记项目、真实 cwd、固定权限模式、prompt、策略与继承说明；提交按钮“提交给 Codex”。context 失效 409 时保留草稿并要求重新读取准备摘要。request_id 在首次提交生成，错误重试保留同一 key/原 body。[修订: Review-LW-R2.I1] 只有收到原提交的明确准入拒绝或已找到其run后，才能把修改后的草稿显式作为另一提交生成新key；原结果未知或仅回查404时禁止新key。提交在途禁用内容编辑；网络丢回包先按 request_id 查询。sessionStorage 只保存最近 request_id/task_id，重载先查询回执，不存凭证或自动重发 prompt；若重载后无原body，保留查询入口，不拼造body重试。

#### 本轮修订说明

[修订: Review-LW-R2.I1] 下列目标骨架补现有分支修改所需片段。api 的原fetch/timeout/finally逻辑保留；先透传已有status/reason错误，再归类 AbortError/TypeError/SyntaxError，防止稳定错误被 catch 改写。bootstrap 完成原CSRF读取后 init 一次；init只注入依赖/绑定事件，旧 showView 的首次同步调用不发请求，onView在init前为空操作，加载后再应用当前视图。

```javascript
// workspace.js: api catch preserves tagged errors; old message remains usable.
const apiError = (message, status, reason) => Object.assign(new Error(message), { status, reason });
// After fetch: remember response.status before JSON parsing.
if (!response.ok) throw apiError(reason(result.reason), response.status, result.reason);
// In catch: if tagged, rethrow; otherwise map timeout/network/invalid_response per §3.1.
// post's local CSRF rejection uses apiError(existingMessage, null, 'csrf_unavailable').

// workspace.js: bootstrap, after the existing CSRF try/catch.
WorkspaceExecution.init({ api, post, showView, getSnapshot: () => app.snapshot });
await Promise.allSettled([loadBase(), loadUsage(), loadNews()]);
WorkspaceExecution.onView(app.view);
// showView: retain existing branches, add runs to viewCopy and this visibility loop.
for (const id of ['agents', 'usage', 'news', 'runs']) $(`${id}-view`).hidden = view !== id;
WorkspaceExecution.onView(view); // no-op before init; no duplicate polling after repeated calls
// renderTasks: explicit preparation only; never submit from render/bootstrap.
runButton.onclick = () => WorkspaceExecution.openTask(task.id);
```

[修订: Review-LW-R2.I1] execution.js 的 `attempt` 是当前浏览器提交回执跟踪，与后端 run.state 分开。`acceptReceipt` 验证回包request_id相同才标 admitted并展示run；异常回包继续unknown。`releaseRejectedAttempt` 仅消费第3.1节明确拒绝或本地csrf_unavailable，清回执锁而保留draft。刷新context失败保持draft且禁用新提交，读到新摘要后仍需用户再按提交。旧attempt为unknown/not_recorded时，普通提交按钮只能查回执；仅“用原请求重试”在not_recorded且原冻结body仍在内存时发送，绝不自动POST。简化骨架如下：

```javascript
// execution.js: initial explicit submit; prevent double-click before the first await.
async function submitDraft() {
  if (attempt?.state === 'sending') return;
  if (attempt && ['unknown', 'not_recorded'].includes(attempt.state)) return lookupAttempt();
  if (attempt?.state === 'admitted') return showKnownRun();
  if (!contextReady) return;
  attempt = { state: 'sending', body: Object.freeze({ request_id: crypto.randomUUID(),
    task_id: context.task.id, context_hash: context.context_hash, prompt: draft }) };
  rememberKey(attempt.body.request_id, attempt.body.task_id);
  return sendFixedBody();
}
async function sendFixedBody() { // initial send or explicit same-body retry only
  attempt.state = 'sending';
  try { acceptReceipt(await post('/api/workspace/execution/runs', attempt.body)); }
  catch (e) {
    if (e.status === 409 && e.reason === 'context_changed') {
      releaseRejectedAttempt(); contextReady = false;
      return refreshContextKeepingDraft(); // no automatic POST, new key only on next explicit submit
    }
    if (isDefinitiveAdmissionRejection(e) || e.reason === 'csrf_unavailable')
      return releaseRejectedAttempt(e); // exact combinations from §3.1; preserve draft
    attempt.state = 'unknown'; return lookupAttempt();
  }
}
async function lookupAttempt() {
  try { acceptReceipt(await api(`/api/workspace/execution?request_id=${rememberedKey()}`)); }
  catch (e) {
    attempt.state = e.status === 404 && e.reason === 'request_not_found' ? 'not_recorded' : 'unknown';
    showRecovery(attempt.state); // neither branch releases the old key or submits a new request
  }
}
// Explicit retry button only: if state===not_recorded && body exists, sendFixedBody().
// Recovered sessionStorage metadata has no body: lookup only; never reconstruct or auto-replay.
// A separate explicit "prepare another run" clears an admitted attempt; ordinary submit never does.
```

[修订: Review-LW-R2.I1] S3 的 impl-safe验证补：用fetch stub断言旧调用仍得到原message且新调用保留status/reason，所有确定拒绝组合与idempotency_conflict不混同；静态核对bootstrap/showView只有一处接线。root浏览器fixture补：首个POST前冻结body/key、双击只发一次；POST丢回包后GET200接回原run；GET404仅启用同body/key显式重试；GET503/网络仍锁key；409/context_changed保留draft、刷新失败不放行、成功后显式新提交；重载只有key不自动发送；旧保存/额度错误文案与视图切换不回归。证据继续落 `impl-ui.log` 与 `ui-execution-*.json/png`；缺对应分支证据不能声明恢复语义已验收。

运行视图显示两条 active 与最近历史、实际 model/thread/turn、启动目录、受约束策略、连接/运行状态、审批区、纯文本事件和本次 token。浏览器只在运行视图可见时每秒轮询 active/所选详情；页面隐藏暂停轮询，返回后从游标续读并显示 gap。每次请求完成后再调度下一次，防慢响应堆叠；过期响应按选择的 runId 丢弃。刷新不覆盖准备草稿，结束不自动切走待阅输出。

审批按钮分别为“仅允许这一次”“拒绝这次操作”“取消当前运行”；后者调用 cancel API，不误把两 run 一并结束。按钮发送后显示“答复已登记/已发送”，resolved 才清 pending，不显示“命令已成功”。unknown 面板只提供查看事实、回到任务和新建独立运行的入口，不提供伪 resume；有 cleanup unverified 时说明该根仍被占用。[修订: Review-LW-R2.I1] 此处 unknown 指已查回run记录的原生结果未知；尚未查回的HTTP提交未知不得由该入口解锁新key。task 卡原有手工状态不因这些事件变化。

手机采用单列准备/运行/审批；长路径/命令/diff 换行或局部代码区滚动，页面本身不得横向滚动，动作按钮在 360/390px 内可见。文本全部 textContent，不渲染 Agent HTML/Markdown 链接；不自动打开工具生成的 URL。请求、错误提示使用 aria-live，切换准备区聚焦标题/首输入，禁止轮询夺焦点。

Agents 能力说明对 Codex 区分“执行功能已接入/本机准备条件/本次启动结果”；native exe 存在不等于账号可推理。旧其他 Provider 仍显示执行未接入。用量区保持“自动每日 Token/费用未接入”，运行面板仅标“本工作台本次运行官方通知”，不改变现有额度/人工记录。详情展示命令来源与时间，提醒本机独立 MCP 的权限边界。

**S3 实施/验证/回滚**：按 HTML容器→窄脚本→task/nav 接线→响应式 CSS→fixture 顺序。impl 只运行 JS 语法检查和静态 fixture 合同校验，证据 `impl-ui.log`，不启动浏览器。root 运行旧 verify_workspace fixture 与新 fixture，覆盖准备、丢回包相同 key、双 run、完整/缺失审批、拒绝、取消竞争、unknown、owner只读、XSS文本、源失败、keyboard/焦点、桌面/360/390；产物 `ui-execution-*.json/png`，所有请求拦截，原 harness 新静态/API 必须注册，不能回退请求真实服务。再用临时服务/隔离DB观察真实产品页截图；fixture 截图与真实截图分开标注。缺浏览器证据不能称移动交互已验收。回滚去掉 execution script/nav/buttons 和新增资源路由，原任务表单仍可用。作者体验：运行专属代码在一个新脚本，CSS 限定 execution 类，原 api/post 复用；产品文案说明动作和事实，不向用户展示内部锁/JSON-RPC术语。

## 8. 实施顺序、验收与证据责任

顺序为 S1 合同/事务 → S2 owned 生命周期与协议/动作；S3 在 S1 接口固定后可独立写 fixture 和 UI。建议后端作者按 S1、S2 的两个可审阅增量交付，UI 作者只负责 S3 及其 fixture；gateway 接线由后端作者统一合并。每包只动列明文件，必要邻接修改先报告；禁止把大量重构混入执行能力。文件超出约 1,000 行或职责难以顺读时暂停拆分，不靠空抽象缩行。

每份证据必须包含命令、责任人、时间、退出码、完整输出、实际范围、失败/修复记录。impl 不得运行真实 Codex、用户服务或浏览器；coordinator 承接下表。集成脚本默认不被 unittest discover 启动，需明确 `--fixture` / `--isolated`，必须验证目录位于 `work/agent-execution-20261013/` 的本轮隔离目录。

| 验证层 | 执行人 / 证据 | 必须观察 / 未证实约束 |
|---|---|---|
| 静态与业务单元 | impl；`.venv/Scripts/python.exe -m unittest discover -s tests -v`、新 JS `node --check`；impl-s*.log | 全量原测试与新增mock/tempDB；任何失败记录，不能用旧 PASS 代替 |
| 最终 Windows wrapper | root；owned-process-integration.log/json | suspended前归属、子孙退出、双组互不干扰、组外对照、管道/reader/writer回收、崩溃后查询；旧probe不替代 |
| 假 app-server + HTTP | root；protocol-integration/owner.log/json | 两根并行、第三run busy、根重叠拒绝、双实例、lost response、once approval、取消/审批竞争、重启不重发；这是无模型证据 |
| 真实配置/握手 | root；native-policy-probe.log/json | 使用最终 argv；只记录允许字段清洗摘要，兼容解析、managed要求、实际策略；未启动turn仍不算推理 |
| 真实完成/审批 | root；real-smoke-intent.md、real-smoke-complete.log/json | 自有临时registry/DB/root，以内部固定read-only smoke策略发固定marker任务；实际 request/card/一次答复/item/turn/marker/清理，缺任何项据实保留 |
| 真实取消 | root；real-smoke-cancel.log/json | 新 owned run，在可识别活动turn发interrupt并得到interrupted；若先completed只算竞争，不能当中断通过 |
| 页面与回归 | root；ui-execution-*.json/png、real-workspace-*.png | 1440、360、390交互和来源标识，旧页面关键回归，截图来自实际页面；响应式不冒充手机远程连通 |
| 最终独立审查 | reviewer + root | 实际diff、原始输出、G1–G3、权限/线程/资源锚点；无证据不得签全项PASS |

固定真实 smoke 的最小意图：完成任务仅请求在隔离根创建 `panel-smoke.txt`，内容固定为 `workspace codex smoke\n`，不读其他文件、不访问工具网络、不调用 MCP、不改配置；允许处理的真实审批只能是该文件的完整单次变更。取消任务仅请求在隔离根运行有界等待 30 秒后回复固定字符串，root 在确认活动 turn 后中断；任何额外路径/工具/网络/权限请求拒绝并结束。prompt 不是权限隔离证据，实际请求仍逐项核验。每次测试前 root 写确切 prompt、目录、策略与允许动作，并向用户说明会消耗真实额度；沿用基线授权，不自动登录/购买/安装/提权。

真实 smoke 使用现有账号时可能继承独立 MCP。root 已完成两次无 turn config/read，native-policy-probe-compatible-2.log / policy-probe-compatible-2.json 退出0：第一进程枚举3个MCP元数据，第二进程逐ID关闭且所有允许策略匹配，两个进程/reader退出。最终smoke仍须在其实际cwd重复核验；仅允许ID匹配 [A-Za-z0-9_-]+ 后用独立argv `-c mcp_servers.<id>.enabled=false`，带引号dotted key已实测被本机拒绝。不得硬编码本次3个名称当永久全集。不能以空 `mcp_servers={}` 或 fresh home 认证假设替代；如果不能排除超出 smoke 范围的启动副作用，保留真实推理/审批缺口，不降低安全模式强行通过。生产可以接入用户现有受信配置并如实说明其边界；这与 smoke 的有限验收授权不同。

发布前 root 先在新隔离端口/DB验收，不占用8766/8770；随后才决定替换自己持有的8770预览，记录明确进程归属。关闭新增执行入口是降级方式；任何 cleanup unverified/策略不明都显示执行不可用，旧手工/观察继续。停止功能时保留新表和run事实。没有部署配置开关扩展需求，使用原服务构造的 `execution=None` 作为内部停用路径，浏览器显示未接入。

## 9. 风险、对齐记录与 Gate

#### 本轮修订说明

[修订: Review-LW-R2.I1] 第1轮独立评审为REVISE/Gate-2 FAIL，唯一I1为前端稳定错误合同和接线片段不足；原报告与旧Gate-1证据保留。本轮仅补第2/3/7/9节，未改目标、并发、Windows或协议生命周期。Gate-1须追加检查HTTP status/reason兼容、首次冻结body/key、回查200/404/503、context_changed保草稿、未知结果禁止新key、bootstrap/showView顺序与S3分层验证锚点，证据另存 `work/agent-execution-20261013/lwplan-gate1-r2.json`。片段现已覆盖前端到回执的端点；是否关闭I1仍由独立复审决定，作者自检不覆盖历史Gate-2失败。

U1 的握手/模型候选已有root证据，真实账号推理仍待第8节。U2 基础 Job 已证实，最终 pipe/嵌套 sandbox/崩溃恢复未证实。U3 真实审批是否出现依实际Provider，不靠prompt保证；未出现就保留审批验收缺口。U4 root已按原授权允许固定隔离smoke。U5 本文新表/状态机关闭设计缺口，实施验证未发生。U6 不依赖clientUserMessageId，禁止自动重发。补充policy U1的本机config/read覆盖匹配已有退出0证据；U2仍保留系统/managed并非完全隔离的限制，最终线程策略与smoke继续核验，不能由官方main代码推定本机alpha完全一致。

事件触发对齐留痕：本轮恢复时记录远程compact网络失败，未视为阶段完成；配置继承不明已通过DELEGATE_ACTION交root补证，本文消费research_execution_policy；root纠正并发为固定2且根重叠互斥，本文第1/3节采纳；进入Review(LW)时交本文件SHA与Gate-1给root。最终有效配置补证已读取，参数匹配不能替代thread/turn和OS隔离验证。

批量提问按P0范围/验收阻断、P1高风险、P2优化组织。当前没有需新增用户选择的问题；生产继承范围与smoke是否可执行由现有基线和root补证收敛。若实施发现必须放宽沙箱、变更认证/全局设置或无法遵守owned树，停止依赖步骤并提交：`【DELEGATE_QUESTION】需要确认：<范围/约束/验收/回滚>；优先级P0/P1/P2；阶段；A推荐及原因/B权衡；请回复Q1=A...`。只需实现细节补证则用DELEGATE_ACTION，不自行换架构或向用户重复申请普通开发授权。

### Gate-1 作者自检

- [x] 目标锁/反目标/不影响项与基线映射：第1节及S1–S3逐包。
- [x] 核心链路总览、research事实映射、片段闭环充分性：第2节与第3/5/6/7节。
- [x] 主要工作包可辨认，每包有目标/文件/函数/顺序/依赖/验收/回滚/失败边界；没有大规模删除旧链路。
- [x] 输入输出/精确字段/状态机/持久数据/跨层接口/兼容迁移与停用路径：第3–8节。
- [x] impl与coordinator验证责任分层、证据产物/归属/不足结论：各包末段与第8节，不把fixture当真实执行。
- [x] 作者体验门：S1单一合同、S2资源所有权与单worker协议、S3单脚本窄接线与产品语言。
- [x] 风险/U点/事件触发对齐/批量提问模板与双阶段规则均已落盘。

Gate-1结论范围：本文具备进入独立Review(LW)的必备内容；不表示实现或任何未来测试已通过。交付前以当轮文档结构/链接/协议锚点核对及SHA读回支持这个存在性结论。

Gate-2由review_plan主检、root复核：顺读HTTP登记→owned启动→有效策略→一次发送→事件/审批/取消→清理→UI，逐项核验关键实现锚点、片段闭环、责任/证据、作者体验和G1–G3。任一必备项缺失不放行；技术口径不足回LW修订，范围/验收不唯一先DELEGATE_QUESTION，不能以“实现时再决定”进入impl。后续计划缺陷按技能的PLAN_DEFECT原地修订规则处理，保留已实施支撑文本。

### 协议索引与交接

本机基线：`work/agent-execution-20261013/research-schema/`，实际resolver/版本见research A；审批params/response在schema根目录，不在v2。优先核验 `v1/InitializeParams.json`、`v2/ThreadStartParams.json`、`ThreadStartResponse.json`、`TurnStartParams.json`、`TurnStartResponse.json`、`TurnInterruptParams.json`、`TurnCompletedNotification.json`、`ThreadTokenUsageUpdatedNotification.json`，以及根目录的 `ServerRequest.json`、`ServerNotification.json`、`CommandExecutionRequestApprovalParams.json`、`FileChangeRequestApprovalParams.json` 及对应Response。本机文件的完整路径由research约定，不能把缩写误作根目录位置。

外部依据和固定Orca链接保持在research C/D/E与policy B–F；Microsoft Job恢复查询新增依据见第4节。本次没有复制外部实质代码。保留历史研究失败（GitHub限流/404、辅助文件路径错误、输出截断、compact网络错误），并保留本轮strict-config旧字段失败、带引号MCP key失败及一次GBK输出错误，这些不是产品测试成功或失败。本轮只改本计划，不执行真实Agent、服务器或用户数据写入。

无新的跨功能事实；已有三条候选沿用research，不重复扩充候选池。
