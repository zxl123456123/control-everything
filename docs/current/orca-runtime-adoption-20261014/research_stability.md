# 面板技术、并发与可靠性补充调研

日期：2026-10-14；角色：repo_researcher；受众：共享；范围：源码及官方资料，只做调研。
本文件不决定 Rust／FastAPI／数据库迁移，不授予实施或真实模型验收 Gate。

## A. 系统边界与现有能力

现有面板是 Python 管理服务、原生 JS 页面和外部 Codex 子进程。Orca 尚未接入；此前“Python 管理面＋外置 Orca＋完整 Web client”高层方向，不等同服务框架、容量和部署技术已定稿。
本次未启动服务／Agent，未读取账号或会话正文，未测性能。源码中的并发上限是准入规则，不能推导机器稳定承载容量。

## B. 入口、主流程及关键模块

以下路径相对于仓库根目录 `E:/project-funny/mianban-develop`，行号为本轮直接读取的锚点。

| 模块与锚点 | 已观察事实 | 边界 |
|---|---|---|
| `session_panel/gateway.py:480`、`:498` | `PanelServer(ThreadingHTTPServer)`；loopback 检查；Windows 独占端口；请求线程 daemon | 本类未配置请求线程总量上限；不是已采用 ASGI／FastAPI |
| `gateway.py:84`、`:156` | HTTP 路径日志主动关闭，避免暴露私密会话；`/health` 返回 app 和协议版本 | 不检测 DB、队列、Provider 或运行恢复，不能当依赖健康检查 |
| `gateway.py:430` | body 读取有 0.25 秒总预算 | 不能据此宣称所有 socket 阶段均有完整资源预算 |
| `session_panel/workspace_store.py:21` | 每次操作新建 sqlite3 连接；3 秒 busy timeout；事务、参数化 SQL | 表通过 `CREATE TABLE IF NOT EXISTS` 初始化；已查模块未见 schema 版本迁移／备份恢复 |
| `session_panel/execution.py:42`、`:68` | 独占执行 owner；启动时恢复旧记录；每次运行有后台线程 | 单 Provider Codex；旧 M3 未真实验收 |
| `session_panel/execution_store.py:123` | 同一写事务内 request_id 幂等、内容冲突检查、重叠目录互斥、最多 2 个繁忙运行 | 繁忙包含 cleanup 未验证；无任务排队，超额拒绝 |
| `execution_store.py:303` | 重启将旧活跃记录标 unknown、审批过期，核查旧 Job 清理；不自动重发 | 不代表运行恢复继续执行；unknown 不能显示成完成 |
| `session_panel/owned_process.py:284` | 先挂起创建进程，加入自有 Job 后恢复；限制继承的句柄；reader/writer 各自线程 | 生命周期管理与权限隔离不同 |
| `owned_process.py:124` | Job 目前只设置 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` | 虽声明内存字段，但实际未设置 CPU／内存／进程数限制 |
| `owned_process.py:24`、`:276`、`:312` | JSONL 单行上限 1 MiB；事件队列 128、写队列 1；满队列固定错误退出 | 是有界失败，未实现全局公平调度或过载时的优先级服务 |
| `session_panel/codex_execution.py:245`、`:538` | 初始化 RPC 有 20 秒 deadline；发出取消后 5 秒等待原生结束 | 不能当所有 Agent 全生命周期统一超时／SLA |
| `execution_store.py:157`、`:194` | 事件分页 200；每个 run 保留最新 2000 条；丢失游标可识别；字符串截断 | 字符串上限不是整条嵌套 payload 字节总上限；运行记录本身未见全局保留策略 |
| `web/execution.js:292` | 单页防重叠刷新；只在运行视图且可见时约每秒轮询；保留旧事实 | 多标签页各自轮询，未见跨标签共享订阅或全局广播 |
| `session_panel/workspace_sources.py:96`、`:271` | 额度并发 refresh 合并；RSS 每来源锁、900 秒缓存、1 MiB 响应上限、10 秒请求超时；源读取最多 3 worker | 来源保护不等于整个系统资源预算 |
| `scripts/open-workspace.ps1` | 现有桌面入口为 Edge app 窗口 | 已查 scripts 仅此文件，未见产品服务托管、升级／回滚、自动恢复脚本 |

已具备保护并非可以直接继承到 Orca：自研执行的 owner、2 并发和目录互斥只覆盖其自身派发路径。若存在第二执行入口，其实际跨入口协调能力尚未知。

## C. 官方技术事实及其含义

1. [Python HTTP server](https://docs.python.org/3.12/library/http.server.html)说明 `ThreadingHTTPServer` 用线程处理请求，并明确 `http.server` 不推荐生产使用。现有应用增加了自己的 loopback／Host／Origin／CSRF 防护，这不改变底层服务器的官方定位。
2. [FastAPI 异步文档](https://fastapi.tiangolo.com/async/)区分等待 I/O 的并发与 CPU 计算的并行；普通 `def` 路由在外部线程池执行，但直接调用的普通辅助函数不会自动进入线程池。换框架或把函数改成 `async def`，不能自动消除现有 sqlite3、文件、阻塞进程调用。
3. [Python asyncio 开发说明](https://docs.python.org/3.12/library/asyncio-dev.html)明确 CPU 工作直接运行在事件循环会阻塞其他任务；可用线程或进程 executor 隔离阻塞工作。异步接口和实际工作位置须分别核实。
4. [SQLite 适用场景](https://www.sqlite.org/whentouse.html)说明每个数据库文件同一时刻只有一个 writer；短事务可轮流写，本机低写并发适用；必须同时写且不能排队时才涉及 client/server 引擎选择。浏览器远程访问 API 与把 SQLite 文件直接放网络盘是不同部署。
5. [Rust 并发](https://doc.rust-lang.org/book/ch16-00-concurrency.html)说明 ownership/type checking 可将许多并发错误提前到编译阶段；[共享状态章节](https://doc.rust-lang.org/book/ch16-03-shared-state.html)仍明确存在 mutex 死锁等逻辑错误。Rust 的编译期保护不能证明任务幂等、Provider 限额、跨进程取消或磁盘持久化正确。
6. [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)支持进程组管理、资源限制和 accounting；安全限制须按关联进程单独设置。普通 CreateProcess 子进程默认关联 Job，但官方明确存在不关联的创建方式；因此 Job 不能被表述为“拦住所有外部副作用的沙箱”。
7. [VS Code Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)使用扩展宿主避免扩展阻塞 UI，并惰性加载扩展；[Tauri Process Model](https://tauri.app/concept/process-model/)采用 Core 与 WebView 多进程。它们是进程边界的一手先例，不代表本面板已经或必须选 Tauri／Rust。

以上不包含可直接套用到本机的吞吐或内存数字。外部 Agent 的资源、模型服务等待、CLI 子进程和网页渲染，与面板语言本身是不同消耗来源；本项目尚无分项测量，不能判定 Python 已成为瓶颈，也不能承诺 Rust 重写会增加稳定容量。

## D. 已观察的缺口与证据范围

- 搜索 `session_panel` 与 `scripts` 的 logging／metrics／backup／migration／user_version／journal_mode／watchdog 等，并定向读关键模块，未见系统级性能指标、版本化 DB migration、备份恢复流程或运行托管。该结论限定在此次搜索和文件范围，不声称全仓绝不存在任何相关测试／历史文档。
- 源码有事件上限、短超时和若干缓存，但未见统一的 CPU／内存／磁盘／Agent 数／Provider 频率预算；不能把 `max_active=2` 当成这些预算的替代证明。
- 运行事件每条立即事务写入且每次执行保留裁剪查询；高事件速率成本未知。没有锁等待、写延迟、UI 延迟或长时间内存曲线。
- 已有历史模拟／单元测试与 M0–M2 验收；本轮没有重跑，旧 M3 仍缺真实模型验收。原有失败和门禁由本目录 `research.md`／旧 handoff 保留，本文件不覆盖它们。

## G. 未关闭的不确定点

| 编号 | 未知 | 可核查方式 |
|---|---|---|
| S-U1 | 单机资源瓶颈在哪里，以及期望并发数 | 先固定硬件、项目大小、Agent／浏览器数量、事件速率，再分项观察 CPU/RSS/IO、API 延迟、UI 帧耗时、DB 锁等待 |
| S-U2 | 同时运行多 Provider 时取消与失败是否隔离 | 隔离 fixture／无模型协议测试覆盖卡住、输出洪峰、异常退出、断连和重启；真实生命周期另受 Gate 约束 |
| S-U3 | 本地持久化故障后的真实恢复能力 | 临时数据验证断电等价中断、磁盘满、写锁、备份还原和版本升级；本轮不碰用户库 |
| S-U4 | Orca 与其他入口是否共享目录冲突／资源准入 | 核对 runtime 原生准入范围及操作归属；不能假定面板的局部锁管到独立 CLI |
| S-U5 | API、来源和 UI 压力的相互影响 | 固定多标签、多运行、多来源负载，核查队列有界、主动拒绝、关键操作延迟和恢复 |
| S-U6 | Rust 是否有可测收益 | 先取得热点 profile／资源曲线；语言选择与所需功能、维护人力、构建发布兼容性一起评估，当前无证据支持必须重写 |

## H. 最小可核查证据与本轮动作

- 现有保护：`execution_store.py:123`、`:194`、`:303`；`owned_process.py:124`、`:276`；`web/execution.js:292`。
- 关键缺口：`gateway.py:156`、`:480`；`workspace_store.py:21`；`scripts/open-workspace.ps1`；上述官方资料。
- 已读本目录 `research.md`、相关真实源码及官方资料。两次宽输出被截断，随后对队列、Job、事件裁剪、恢复、HTTP 与缓存用带行号片段补读；截断尾部不作为证据。
- 未执行产品测试／容量压测；未修改产品源文件。本文是补充研究输入，不是技术方案验收或性能保证。

## 跨功能事实（待确认）

- [2026-10-14] 幂等／目录互斥／并发预算的覆盖范围取决于实际入口与唯一所有者，局部入口保护不能自动约束独立 CLI 或其他运行时。
- [2026-10-14] Windows Job 的进程生命周期控制、资源限制和权限沙箱属于不同能力，是否设置需看实际 flags 和进程策略。
