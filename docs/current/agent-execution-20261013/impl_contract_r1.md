# Impl r1 接线合同

受众：共享。此合同仅细化 SHA-256 `469d9a78473f6ce5f73fd2d3fb30ac2a5464e5cb87c27ce2f1c01843a9b6fe53` 已审计划的 Python 接线，不改变权限、行为、HTTP 字段或验证责任。

## 执行入口与归属

- `ExecutionService(workspace, *, store=None, worker_factory=None, owner_factory=None, resolver=None, job_query=None, policy=None, platform=None)`；注入只来自 Python 构造，HTTP 无覆盖入口。
- `ExecutionOwner(db_path, api=None).acquire() -> bool`，`.is_owner`，`.close()`；`query_old_job(job_name, api=None) -> bool`。owner 取得后才恢复旧行；初始化异常必须 close；全部 worker 收尾后才释放 owner。
- `CodexRun(store, run, owner_id, validate_root, policy=None, process_factory=None, resolver=None)`；`.run()` 由 service 的后台线程调用，`.lock` 为 RLock，`.interrupt()` 幂等登记内存取消动作，`.answer(approval_id, decision) -> (approval_row, replayed)`，`.close()` 有界回收。
- `OwnedProcess(exe, argv, cwd, job_name, api=None).start/read(timeout=.1)/write(message)/close(grace=2)`；read 无新消息返回 None，EOF/协议错误抛固定 ProcessError，close 返回回收是否已核验。
- `validate_root(run) -> bool` 核对该 run 快照的 project_id、规范根与目录身份，不读当前 task 决定运行身份。policy 使用第3.1节 snake_case 固定字段；仅 Python smoke 构造允许固定 read-only。

## 共享存储

`ExecutionStore(workspace.store)` 复用原连接异常合同，独立建表锁。内部行保持 SQLite 列名；`root_identity` 是规范 JSON 字符串 `{cwd,dev,ino}`，`effective_policy_json/token_json/detail_json/native_id_json` 为 JSON 字符串。公开投影只在 store 边界生成。

- `get_run(run_id)`、`find_request(request_id)` 返回内部行。
- `update_run(run_id, **fields)` 更新白名单与 updated_at；不覆盖已见终态，冲突终态为 protocol_error。
- `append_event(run_id, kind, payload)` 白名单与 UTF-8 文本截断、最新 2000 条保留。内部 `dropped_cursor` 保存真实删去的末尾游标，使两个 run 的全局 seq 间隙不被误报成缺失。
- `add_approval(run_id, owner_id, native_id_json, method, thread_id, turn_id, item_id, detail, detail_complete) -> row`。
- `get_approval(run_id, approval_id) -> row`；`claim_approval(run_id, approval_id, owner_id, decision) -> (row,replayed)`。由 worker.answer 在 worker.lock 内 claim 并一次排队。相同决策回原事实、不同决策冲突、失效返回 approval_expired。
- `update_approval(run_id, approval_id, **fields)`；`expire_approvals(run_id)` 处理尚未 resolved 的 pending/queued/sending/sent，decision 留存，未知继续保留 unknown。同决策重试仍回原事实，不重发。
- `request_cancel(run_id, owner_id) -> (row,replayed)`；service 在 worker.lock 内先持久化，再调用 worker.interrupt。审批 decision=cancel 同样触发取消。

## UI 与 HTTP

列表固定 `{capability,runs,active,total,limit:50,limits}`。run/context/详情字段逐字按计划3.1。审批 kind 为 `command/file_change`，detail 为可见字段字典；S2 与 S3 直接对齐内容键。事件为 `{seq,kind,payload,observed_at}`，白名单之外不保存；agent_message 的最终文本以 `final:true` 标识 32KiB 上限，其余每个文本字段 4KiB，并设置 truncated。

S1 独占 gateway 与两个新 store/service 文件；S2 独占 native/runtime；S3 独占 web/浏览器 fixture。S1 向 root 提供单测与实例构造入口；真实 socket/Windows/browser/模型验收由 root 承接。各作者保留单独 r1 报告，S1 汇总不替代 root 独立核验。
