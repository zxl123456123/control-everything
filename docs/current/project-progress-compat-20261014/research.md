# 通用项目与进度兼容：定向事实调研

日期：2026-10-14（Asia/Shanghai）；角色：repo_researcher；受众：共享。
对象：本 feature README、完整 clarifications、initial_request 与当前实际源码。只调研，不决定架构，不修改产品源码；未读取真实用户库、私人正文、运行 Agent 或已有服务。

项目登记规则本身不限定六个项目，但当前默认数据、元数据路径、来源装配和文档解析均带有个人环境假设。仅把 JSON 路径换到另一目录不能独立解决空工作台、目录重绑、多目录归属及进度来源兼容。

## A. 系统边界与现有能力

- 当前是 Python 标准库 ThreadingHTTPServer、SQLite、原生 HTML/CSS/JS，loopback 地址固定。项目登记/人工进度/旧待办属于根目录 JSON；工作台 tasks/manual_records 属于 workspace-state.sqlite3。
- 工作台可以人工新增/修改任务、分配工具、关联当前 Codex 元数据样本、人工记额度。项目登记没有 HTTP 写接口，也没有页面添加、归档、重绑目录或来源配置操作。
- 工作台任务状态不会由运行结束或文档 PASS 自动更新。现有工作流文档只提供线索；源码过滤规则却把 PASS 当作收口词，可能丢掉尚未实施的线索。
- 原会话页远端 Claude/终端、garden 和旧执行服务有独立合同。新项目管理不能据此宣称所有工具或执行已接入。Orca 仍是旧条件采用路线，未作为本轮实机操作对象。

## B. 入口与主流程

1. `gateway.serve()` 构造 SessionService、可选根线程 GardenService、默认 WorkspaceService，监听后构造 ExecutionService；没有配置加载层或命令行 profile 选择（gateway.py:521–540）。
2. `/api/workspace` → WorkspaceService.snapshot → sessions、JSON 项目/人工记录/旧待办、SQLite tasks、只读命令发现。仅 sessions 有注入点；projects 又直接调用 progress.codex_cwds/grok_cwds，绕过 session_reader（workspace.py:82–159）。
3. `/api/progress` 和 `/api/progress/set` 直接使用 gateway 导入的 REGISTRY/MANUAL 和 progress.board/set_progress；`/api/desk`、todos、launch 也直接用模块函数/常量。`/api/codex/threads` 直接调用 list_codex_threads；它们没有消费 WorkspaceService 实例的路径/reader（gateway.py:191–209、262–301）。
4. 创建/改任务 → registry 查 project_id → 如新增会话绑定，要求当前样本和 cwd 在唯一 root 之内 → SQLite 写 task。保留原关联时允许修改状态，即使会话已离开当前样本；返回关联未知而不删任务（workspace.py:162–190）。
5. 执行准备摘要/校验从 registered_projects 查同一 project_id 的 root；解析真实目录 cwd/dev/ino，context_hash 绑定任务 updated_at、项目 ID、provider、目录身份和 policy。目录变更导致 context_changed；CodexRun 在启动、创建线程和发 turn 前重复验证（execution.py:96–126；codex_execution.py:149–192）。

### 启动副作用事实

- SessionService/RemoteClient/Terminal 构造时只保存对象；请求会话观察时才执行 SSH 和 terminal inventory。默认来源依然是固定个人服务器（service.py:26–79、173–224；source.py:5–24）。
- actor_from_environment 在生产启动阶段通过 CODEX_THREAD_ID 查询默认本地库；GardenService 是根线程域账本，不是项目库（garden_native.py:68；garden.py:56–69）。
- ExecutionService 构造阶段会尝试获取 OS execution owner，调用 store.recover、定位 Codex executable。recover 会写入历史 active/unverified 运行的状态与 cleanup 结果，虽然不会重发 turn。启动并非只读操作（execution.py:43–76；execution_store.py:303–320）。
- 工作台 JS 启动会获取 bootstrap、workspace、usage 缓存、news；renderProviders 调用 execution.refresh。额度刷新才启动只读 app-server；公开 RSS 在新闻 get 时联网。不能用未注入替身的正常首页作为纯 fixture（workspace.js:197–242、438–446；workspace_sources.py:96–130、269–313）。

## C. 关键模块与职责

| 模块 | 已观察职责与相关改动边界 |
|---|---|
| progress.py | 严格 JSON 注册校验、人工进度写入、固定工作流文本解析、旧待办和目录线索 |
| workspace.py | 来源聚合、unknown 与真实 0 区分、任务/用量输入验证、会话目录关联 |
| workspace_store.py | tasks/manual_records 普通事务；每次独立 connection；无项目表、schema version 或导入功能 |
| codex_index.py | 只读元数据的分页/覆盖统计、固定六字段，不读取正文 |
| gateway.py | exact 路由、安全检查、服务装配；旧来源和工作台来源分别调用 |
| garden_native.py / garden.py | 原生 parent 元数据、根线程域权限与独立 garden 账本 |
| execution.py / execution_store.py / codex_execution.py | owner、真实目录身份、执行收据/事件/审批；与工作台 SQLite 共文件，不能将其当无副作用导入源 |
| service/source/terminal/workbench/launchers | 旧固定 SSH 和本机终端/启动器来源；没有通用个人配置注入 |
| workspace.html/js/css | 项目/任务汇总、任务与用量表单；可复用原生 editor、错误保留草稿和响应式样式；没有项目管理表单 |
| progress.html/js | 旧百分比滑块、文档线索、待办、个人启动分组；无项目登记表单 |

## D1. 数据与所有权

### 旧 JSON

- progress-registry.json：仅 `projects` 列表，item 必须恰好含 id/name/root。ID 为小写字母/数字/连字符 1–64，name 不超过80；root 只检查绝对路径，不要求存在。空列表被拒绝（progress.py:24–40）。现有六项目顺序写进 test_progress 的断言，属于个人默认基线，不能作为通用产品默认验收。
- progress-manual.json：按 project_id 索引 state/note/percent；load_manual 只验证顶层 dict。set_progress 的 known 过滤会丢弃当前 registry 中不存在的人工记录；不能直接复用这段实现无损归档（progress.py:158–166、250–276）。
- progress-todos.json：列表；project_id 可以为空。load_todos 过滤不合法项，add_todo 只保留最近30项。JSON 写入使用固定临时文件 + os.replace，没有进程间写锁，也没有备份/版本迁移（progress.py:194–247）。
- board 将未记录/无效 percent 默认0；WorkspaceService 已把 missing/invalid/source_unavailable 与有效0分开。因此旧页和新页同一事实呈现存在差异（progress.py:169–191；workspace.py:103–126）。

### SQLite

- workspace-state.sqlite3 有 tasks 和 manual_records；task 保存稳定 project_id、可选 session_key、manual source、创建/修改时间。它们没有关联 registry 的 SQL 外键。手动删登记不会删 task，但编辑原 task 会查注册项目而拒绝（workspace_store.py:31–42；workspace.py:177–180）。
- `list_tasks` 仅最近500行，`list_records` 仅最近100行；都返回总数。**不能拿页面列表作为完整导入输入。** 当前无导出/导入 API；schema 定义和 connection 支持普通 SELECT，不存在数据库层强制500/100截断；需要架构决定完整读取与校验合同（workspace_store.py:52–56、86–90）。
- 同一文件还含 execution_runs/events/approvals，含 owner、request ID、cwd/root identity、prompt 和事件详情。执行 listing 最近50行，event detail 分页；不可据它们搬迁完整历史，更不能为了复制管理记录主动调用 ExecutionService（execution_store.py:70–96、149–169）。
- garden 按 root_thread_id 保存至 `work/garden-state/<UUID>.sqlite`，document 保存根线程域任务/actors/receipts，不以项目 ID 分库。项目兼容无直接迁移需求依据（garden.py:56–79）。
- 当前没有查询真实数据来判断记录总量或 schema 特异性；所有保留要求来自定义、调用链和临时 fixture，不能称真实迁移已验收。

## D2. 配置与来源注入现状

| 项目 | 观察到的来源 | 注入现状 |
|---|---|---|
| 注册/人工/待办/工作台 DB | 源码根目录文件 | WorkspaceService 构造参数支持显式路径；旧 gateway 路由仍用模块常量 |
| Codex 身份元数据 | `C:/Users/ZXL/.codex/state_5.sqlite` | list_threads 的 db_path 参数目前注释限定 fixture；HTTP 只有 offset；默认参数在定义时绑定 |
| progress Codex cwd | 同一用户名路径，独立查询40行 | 没有路径参数，不能依赖 WorkspaceService.session_reader 替换 |
| Grok cwd | Path.home()/.grok/sessions，目录名反编码 | 没有显式配置/禁用，作为目录线索，不是已验证活动 |
| garden parent 元数据 | 同一用户名路径 | resolve_actor 有 database 参数；actor_from_environment 无路径参数；GardenService 可传 native_db |
| 远端 Claude | 固定 SSH host、reader、slot 路径 | SessionService 可传 remote/terminal，但默认对象读 source 常量 |
| 终端入口 | D:/terminal-workbench 程序/配置、个人 workdir 及固定校验哈希 | Workbench 有 runner/provider/popen 的测试注入；无用户配置入口 |
| 启动器 | 固定7项个人 C:/Users/ZXL/Desktop、D:/terminal-workbench、E:/LLMAEA 等 | 函数扫描固定 CATALOG；HTTP 只接受已知 ID，不是任意命令入口 |
| 额度/资讯 | CodexQuotaSource、固定3 RSS | WorkspaceService 可注入对象；构造无外部调用，新闻读取有联网 |

requirements.txt 仅固定 mcp，没有 platformdirs 等用户目录库。open-workspace.ps1 按标准 ProgramFiles 查 Edge，只打开已有 URL；不会启动/接管服务，保持可复用。

## E. HTTP 与读取安全合同

- make_server 只接受 HOST=127.0.0.1；Windows 独占监听。Host 必须精确匹配；Origin 存在时精确匹配；API 必须 X-Session-Client=panel/stdio；POST 必须同源 Origin+CSRF（gateway.py:133–147、490–518）。
- POST garden_body 要求唯一 Content-Length/JSON Content-Type、无 Transfer-Encoding、通常不超过4096 bytes、0.25s 累计读取预算、顶层对象、拒绝 NaN；新增项目路径/来源操作需沿用同一安全入口（gateway.py:410–445）。
- progress 文本 stat 限2MB、UTF-8 replace，OSError 折叠为空串；没有返回文件读取失败类别。latest_focus 不遍历符号链接子目录，但读取 README/progress 时没有规范化路径出界检查；文档枚举数量无显式上限（progress.py:56–65、137–155）。
- Windows inside_project 归一化路径、扩展盘符/UNC，使用 commonpath 而非字符串前缀；只包含一个 root。它是词法归属，不验证物理 symlink/junction。嵌套项目同一会话可能同时满足多个 root；当前没有唯一归属优先规则（workspace.py:36–54、128–135）。
- codex_index 明确 read-only/query_only、只查六字段，schema不匹配返回 unavailable。未来来源配置不能把“路径可配置”解读为正文读取授权（codex_index.py:27–74）。

## F. 已读文档与纯 fixture 观察

完整读当前 README/clarifications/source_materials；旧 agent-workbench clarifications 与 hlplan 原边界；旧 orca architecture-final 原边界。本报告不把旧“仅聚合JSON”冻结对象静默改为新授权方案。

当前安全研究 fixture：`.venv/Scripts/python.exe -c <临时目录和纯函数脚本>`，退出0，完整输出：

```json
{"empty_registry":"invalid_registry","english_stage":[],"review_pass_closed":true,"review_pass_focus":[],"sibling_worktree_match":false,"manual_keys_after_set":["example"]}
```

测试仅调用 load_registry、latest_focus、closed、inside_project、临时 set_progress，没有 board/真实 Codex/Grok/远端调用。证明空列表拒绝、英文解析缺失、评审PASS线索丢失、同级worktree归属失败、未登记人工记录重写丢失。

可复用 fixture：test_workspace 为全部源注入/patch、临时 SQLite 和 loopback HTTP；test_codex_index 临时线程表且不含正文；test_execution_http 是纯 handler Mock，不监听/执行；test_execution_store 和 test_codex_execution 有旧 owner/目录合同替身，需保持原测试约束。verify_workspace.cjs 强制 --fixture、拦截每个请求，适合 coordinator 浏览器增量；它不证明真实存储/HTTP。

禁止直接跑 test_progress 全套：board 调用真实本地来源，test_registered_names 用个人 REGISTRY；其它临时 registry 测试也未 patch codex/grok。应将必要新测试完全隔离，不能以 temporary registry 推断整条来源隔离。

研究期间保留的失败/异常：

1. 首次 Get-Content codex_index 因工具异常长时间无输出返回 session 20770；后续 write_stdin 读取完毕，最终 exit_code=0，源码亦通过 rg 复读；未访问来源库。
2. 多次批量读取超过输出预算而截断；补读关键剩余段（gateway安全/装配、execution context/schema、旧hlplan后半、workspace CSS/相关tests）。截断不当成完整证据。
3. 一次 rg 对 `start-panel*`、`scripts/*`，一次对 `session_panel/*.py` 的位置参数在 Windows 被当字面路径，exit_code=1，os error 123；改用 rg --files/-g 与明确文件。前面的成功读结果保留，不把失败静默升级为全目录搜索完成。

## G. 需要架构和低层计划明确的 U 点

本节是已知设计缺口，不表示必须向用户索要普通技术决定；当前无阻塞研究的用户问题。

- U1：新用户路径与默认 profile 如何装配，以及既有用户何时/如何明确导入；确认方式：hlplan/lwplan写出默认目录、配置优先级、导入触发、备份与冲突规则，fixture验证空列表、已有数据和重启。
- U2：projects/manual 以何种当前权威存储演进，旧 orphan ID/无效输入保留和错误路径；确认方式：明确事务/校验与原文件保留合同，测试归档不删记录、重绑不改ID、完整导入不经500/100列表。
- U3：多目录/嵌套目录/重复物理路径的关联准则，与旧 execution 的唯一 root 合同如何兼容；确认方式：明确观察归属与执行 root 分别职责，纯 fixture验证旧 context/validate_root 不被新增关联放宽。
- U4：有限通用 progress 来源的具体协议、状态形状、读取预算/路径边界、冲突时人工/任务/文档各自展示；确认方式：lwplan冻结字段与失败类别，文本/JSON/未配置/0/错误fixture，禁止PASS自动完成。
- U5：空 profile 如何避开个人 launcher/SSH/garden/旧 execution owner，以及显式旧 profile 能保留何种行为；确认方式：服务装配测试禁止构造/调用有副作用源，隔离预览不调用生产 serve 默认对象。
- U6：关键元数据配置入口是否同时覆盖 workspace、progress、codex分页、garden路径；确认方式：逐路由绑定到实际来源的测试。当前三个硬编码读链是独立函数，不能只改一个常量便宣称全链兼容。

## H. 给 readiness reviewer 的最小可核查证据

| 要核查的结论 | 最小锚点 |
|---|---|
| 当前授权与边界 | 当前 clarifications G1–G3、风险边界、验证责任；旧 orca architecture-final 第4/6节 |
| 空/固定项目、人工数据损失 | progress.py:24、169、250；本报告纯fixture完整输出 |
| 来源默认与装配不统一 | workspace.py:82–128；gateway.py:191–209、262–301、521–540；codex_index.py:9、27；garden_native.py:12、68 |
| 非破坏完整导入边界 | workspace_store.py:31–42、52–56、86–90；execution_store.py:70–96、303–320；garden.py:56–79 |
| 目录变更与执行安全 | workspace.py:45、128、177；execution.py:96–126；codex_execution.py:149–192 |
| 缺项目写入口与可用UI模式 | gateway.py:251–261、338–365；workspace.html:35–38；workspace.js:135–155、252–280 |
| 回归安全与真实/fixture分开 | test_workspace.py:25–48、233–297；test_codex_index.py:17–39；test_execution_http.py:1–58；verify_workspace.cjs:1–18 |

以上均为已观察事实；没有推断的迁移成功、真实来源可用或用户数据总量。U1–U6需要下游具体方案关闭，研究本身不授予Readiness/Gate通过。

## 跨功能事实（待确认）

### 架构与约束

- [2026-10-14] 当前 gateway 的生产启动会 acquire execution owner 并执行旧运行账本 recovery；“只启动网页查看项目”不能默认视为只读行为。
- [2026-10-14] 工作台列表的500/100条展示上限是查询上限，不能作为完整数据导入或备份的输入。
