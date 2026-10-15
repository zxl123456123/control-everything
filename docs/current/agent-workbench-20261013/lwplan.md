# 多 Agent 工作台实施计划

日期：2026-10-13（Asia/Shanghai）  
类型：T3，跨 HTTP、存储、外部只读数据和界面的增量。受众：实施者、reviewer 与维护者。  
输入 Gate：[review_notes_readiness_1.md](review_notes_readiness_1.md) 已为 **PASS / allow_enter_lwplan: yes**，规划者已读取该终态后开始正式产出。  
本文件是本轮唯一实施计划；Gate-1 自检见末节，**独立 Gate-2 通过且 coordinator 复核前不得实施**。

## 1. 范围、目标与分工

消费 [clarifications.md](clarifications.md) G1–G3 与 [hlplan.md](hlplan.md) M0–M2：交付固定 **`/workspace`** 工作台，整合真实项目、现有待办和会话入口；可新增任务、分配 Provider、按项目筛选、手动改状态和关联当前可核验的 Codex 会话；显示五种 Provider 的实际发现与能力；区分自动额度、未接入和人工记录；展示真实 AI RSS；提供桌面应用窗口与 360/390px 预览。

反目标编号供工作包引用：N1 不伪造进度/活动/额度；N2 不派发推理、不自动审批/取消、不改凭证/CLI/全局配置；N3 不迁移旧数据、不重写全栈、不清理无关代码；N4 不公网监听、不把应用窗口或响应式预览宣称为原生安装包/手机远程连通。未实现的 M3–M4 保留架构路线，本轮不建空执行引擎。

不影响项：原 `/`、`/progress`、`/api/workbench`、garden 根域/收据、Claude 消息读取和终端定位、原启动器固定动作、原项目和待办 JSON。旧页面只加新入口链接。新页面只读原进度/待办；编辑旧数据仍通过原 `/progress`，避免扩大已有 JSON 并发范围。

| 执行组 | 独占文件 | 工作包 |
|---|---|---|
| backend | `session_panel/workspace.py`、`workspace_store.py`、`workspace_sources.py`、`gateway.py`；`tests/test_workspace.py`、`test_workspace_sources.py`；本组报告 | S1–S3；**只有 backend 编辑 gateway.py** |
| UI | `web/workspace.html/js/css`、`web/progress.html`、`web/index.html` 的入口链接；`scripts/open-workspace.ps1`；`tests/verify_workspace.cjs`；本组报告 | S4–S5；先读实际旧根页面路径，若并非 index.html，只改网关现有根静态映射对应 HTML 并报告 |
| coordinator | 根 README、本 feature 状态、真实启动/浏览器/外部证据、最终差异与复核 | S6；不与实施者同时改其文件 |

Gateway 新静态映射仅含 `/workspace`、`/workspace.js`、`/workspace.css`。无新依赖、前端构建器或 CDN。新模块名有明确职责，不引入通用插件框架。

## 2. 核心链路总览

现状：浏览器 → bootstrap → Python 网关 → progress/desk 或会话/garden；原项目/待办写 JSON，garden 写独立 SQLite。

改后主链：`/workspace` → bootstrap → `/api/workspace` 的廉价本地快照 → 分区绘制；任务/人工记录 POST → 同源校验 → 严格字段校验 → 新 SQLite 事务 → 成功后更新界面。额度 GET 只读缓存，用户显式刷新才 POST 到短生命周期 Codex probe；资讯独立 GET 读取固定 RSS 与缓存，慢来源不阻塞项目/任务。

明确不改：原数据格式和写路径、旧会话消息边界、小院根域、生产绑定地址与旧启动动作。将新任务事实放新库，是为了事务和范围隔离；独立来源接口，是为了主页面可先用、失败可定位。

### research 事实映射

| 已核实事实 | 实现锚点 | 验证锚点、主体与结论限制 |
|---|---|---|
| 原生 JS/CSS + stdlib 网关；Host/Origin/CSRF 已存在 | gateway 新分支复用 `allowed`/`garden_body`；S4 外置脚本 | backend HTTP fixture：坏 Host/Origin/CSRF 拒绝；不以新增接口放宽旧保护 |
| 原 board 未保存默认 0%，records 可 None | `WorkspaceService.snapshot` 新投影附 `manual_recorded`，records 归一化 | backend 缺失/损坏人工数据、缺 docs fixture；UI 显示未记录，不把默认当真实 0% |
| Codex 索引是身份元数据，活动/完成 unknown | sessions 保留索引原信封；task 独立手工状态 | backend 原字段/覆盖范围测试；root 真实元数据检查，不读取正文 |
| 原项目/todo JSON 并发薄弱，小院属于独立事务域 | 新 `WorkspaceStore`；旧进度/todo 在新页面只读 | 新库事务/重开测试；旧文件哈希对照由 root 承接，不能宣称修好了旧并发 |
| Codex 0.118.0 有 rateLimits/read，无 usage/read；真实 -32603 | `CodexQuotaSource.refresh` 的三方法只读序列 | backend fixture 协议白名单/失败回收；root 真实只读输出，不能由 fixture 宣称账号额度可用 |
| Codex/Claude/Grok/OpenCode 在 PATH 发现，DSH 未发现 | `discover_providers` 每次真实 `shutil.which`，不硬编码实测结果 | backend 替换 which 测试；root `cli-discovery.json` 比对；发现≠运行/接入 |
| 三 RSS HTTP 200，最大 784414 bytes；OpenAI 有 CDATA | `NewsSource` 固定清单、1 MiB 完整响应上限、文本节点 | backend XML/大小/失败 fixture；root 实际抓取清洗结果 |
| 当前只有 loopback，无远程认证/原生壳 | 原 make_server 限制不变；Edge 窗口和响应式 UI | root 实际窗口/360/390px；远程仍未实现 |

事实原文见 research 三份报告、[source_materials/delegate_action_gateway_contract.md](source_materials/delegate_action_gateway_contract.md)，及 `work/agent-workbench-20261013/` 的 quota/feed/CLI probe。初次 git status 的非仓库失败、Pydantic 警告与 quota 业务失败仍须进入最终证据。

## 3. UI/backend 共用 HTTP 合同

### 3.1 请求、错误与服务注入

- 所有 API 请求：`X-Session-Client: panel`。POST 另带 `Content-Type: application/json`、bootstrap 返回的 `X-Session-CSRF`，浏览器同源 Origin 必须由网关精确验证。不得自造另套鉴权或允许跨域。
- 新 POST 复用现有 `garden_body()` 的 4096 bytes、有限读时、dict-only、拒绝非有限 JSON 常量；业务再拒绝未定义字段、bool 冒充数字、无效 ID/日期/枚举。用户文本仅作数据。
- 错误沿用网关 `{status:"unknown",reason,source,observed_at}`。HTTP 400 为输入错误；403 为原有边界拒绝；404 `task_not_found`/`record_not_found`；409 `session_not_in_sample`/`session_project_mismatch`；503 `workspace_unavailable`/`storage_unavailable`。UI 根据 reason 映射中文，未知 reason 显示一般失败，不显示 traceback。
- 外部源失败不是整页 HTTP 500：quota/news 的读取返回 HTTP 200 和各自 `status/reason`。限流、超时、未发现工具均保留真实原因。
- `make_server(service, address=(HOST,PORT), garden=None, workspace=None)` 增加末尾可选参数；只挂载传入对象，不在默认测试构造中创建真实库或联网。未注入 workspace 的新 API 返回 503；既有 API 不变。生产 `serve()` 显式创建 `WorkspaceService` 并注入；root 独立预览也显式注入。绑定仍只许 `127.0.0.1`。

### 3.2 路由和成功响应

| 方法、路径 | 输入 | HTTP 200 成功形态 |
|---|---|---|
| GET `/api/workspace` | 无 | §3.3 总览；无 quota 子进程、RSS、远端 SSH或消息正文读取 |
| POST `/api/workspace/tasks` | `{title,project_id,provider_id,state,session_key}` | `{status:"ok",task:Task}` |
| POST `/api/workspace/tasks/update` | 上述全量字段 + `id` | `{status:"ok",task:Task}`；不存在不新增 |
| GET `/api/workspace/usage` | 无 | `{status:"ok",codex:Quota,manual_records:Record[],manual_status,manual_reason,manual_total,manual_limit:100}`；仅本地缓存/库 |
| POST `/api/workspace/usage/refresh` | `{}` | 与 usage GET 同形；仅刷新官方 Codex source |
| POST `/api/workspace/records` | §3.5 Record 的用户字段；`id:null` 新增、非空更新 | `{status:"ok",record:Record}`；不存在的非空 id 返回404 |
| GET `/api/workspace/news` | 无 | `{status:"available"|"stale"|"unavailable",sampled_at,items:NewsItem[],sources:NewsSource[]}` |

所有时间戳为带时区 ISO 字符串；未采样为 null。日期按固定 `Asia/Shanghai` 的日历日，后端可用标准库固定 UTC+8（该业务范围无 DST），不增加 tzdata 依赖。前端显示北京时间，并使用总览 `today` 初始化人工记录日期。

### 3.3 总览与 Provider

```text
Snapshot = {
  status: "ok", sampled_at: ISO, today: "YYYY-MM-DD",
  projects: {status, reason, items: Project[]},
  todos: {status, reason, items: {id,text,project_id,done}[]},
  tasks: {status, reason, items: Task[], total: integer, limit: 500},
  providers: Provider[], sessions: 原 Codex 索引信封,
  entrypoints: [{id,label,href}]
}
Project = {id,name,state,note,percent,manual_recorded,manual_reason,
           records: [],records_available:boolean,sessions:原项目会话提示[]}
Provider = {id,name,discovery:{status:"found"|"not_found"|"unknown",commands:[],reason},
  capabilities:{observe_sessions:boolean,open_existing_ui:boolean,
                dispatch:false,cancel:false,approve:false,read_quota:boolean},
  observation_note:string, entrypoints:[{label,href}]}
```

projects/todos/tasks 的 status 为 `available|unavailable`，可用空数组就是空结果。各段异常独立返回 unavailable 与固定 reason，不把异常静默改为空数据。tasks 返回最近更新 500 条、准确 total，超出时 UI 注明显示范围，不宣称完整看板。todos 完全沿用既有有界读取。

项目原进度仍来自旧数据；新投影在有效手工记录存在时 `manual_recorded:true`、percent 保留 0–100，否则为 false、percent=null，manual_reason 区分 `not_recorded|invalid_record|source_unavailable`。有效记录定义为保存项为 dict，state 属于旧 STATES 且 percent 为有限 0–100 数值（非 bool）。不改原 `/api/progress` 合同。records 原值为 list 时保持，否则置 [] 且 records_available=false。原 `sessions` 的 tool/place/href 只是目录提示，不转换成原生会话 ID。

sessions 保留原 `available/reason/source/sampled_at/items/offset/limit/total_visible/next_offset/coverage`；本轮总览只采第一页面（现有 limit=12），UI 标注该范围，并链接旧会话页查看更完整索引。只有其中 Codex `session_key` 可用于本轮关联；活动和完成字段继续 unknown。

Provider ID 固定 `codex|claude|grok|dsh|opencode`。只用 PATH 查找命令，DSH 候选为 dsh/dsh-tui/dst；不运行 `--version`、login 或 agent。Codex observe_sessions/read_quota 为 true；Claude observe_sessions 为 true，注明“原会话页远端观察，当前连接需在那里核验”；其余结构化观察为 false。open_existing_ui 仅在提供真实入口时为 true。命令发现与能力展示分开；Provider 未发现仍可作为任务计划负责人。

固定入口包括 `/`（会话与小院）、`/progress`（旧进度/待办/启动器）、`https://grok.com/`（Grok原服务）。其他外部入口只使用已在 industry 研究中的官方文档/GitHub源，并明确“文档”，不当作控制台。不要将会话 cwd 拼为 file URL 或 shell 参数。

### 3.4 Task

```text
Task = {id,title,project_id,provider_id,state,session_key,
        source:"manual",created_at,updated_at,
        session_link_state:"none"|"verified"|"not_in_current_sample"|"project_mismatch"}
state = "todo" | "doing" | "blocked" | "review" | "done"
```

title 去首尾空格后 1–160 字符；project_id 必须在当前有效注册表；provider_id 为五种 ID 或 null；session_key 为 null 或当前采样 Codex key，非 null 时 provider_id 必须 codex。ID 由后端生成 UUID，修改只能用已存在 ID；创建不接受 id/source/时间等服务器字段。状态可任意人工修正，默认由 UI 传 todo，所有状态均标明手工。

新建或改变关联时，必须在当前采样找到 key，且会话 cwd 在已登记项目根目录之内（使用 Windows 大小写归一化后的路径包含判断，不能字符串前缀比较）。失败 409，不自动改项目。更新时如果 project/provider/session 三者均未变，可修改标题/状态，即使旧 key 已掉出最近采样。读取时据当前采样计算 link_state，原关联不因未知/缺样本丢失。

### 3.5 人工记录与官方额度

```text
Record 用户字段 = {id:null|UUID,provider_id,product,day:"YYYY-MM-DD",
  metric:"quota_used_percent"|"daily_tokens"|"daily_cost",value:number,
  currency:null|"CNY"|"USD",window_label:null|string,note:string}
Record 返回额外字段 = {source:"manual",created_at,updated_at}
Quota = {status:"not_checked"|"available"|"unavailable"|"stale",
  source:"codex_app_server",sampled_at:null|ISO,last_success_at:null|ISO,
  reason:null|string,error_code:null|number|string,buckets:Bucket[]}
Bucket = {id:string,primary:null|Window,secondary:null|Window}
Window = {used_percent:null|number,window_minutes:null|integer,resets_at:null|ISO}
```

产品合法组合：Codex/Claude 的 product=`subscription`；Grok 为 `subscription|cli|api`；DSH/OpenCode 为 `local`。所有 metric 都是人工观察，页面不称官方账单。day 是有效且不晚于北京时间今天的日期；value 为非负有限值，quota 最大100、tokens 必须整数。quota 的 window_label 为 1–24字符（如“本周”），其余为 null；cost 的 currency 必须 CNY/USD，其余 null；note 0–120字符。记录新增/编辑不触发任何外部 API。列表返回最近100条、准确 total；多个观察不自动求和，不反推订阅消耗或费用。

usage 初次 GET 的 Codex 状态是 not_checked，不把研究 probe -32603 写成固定业务答案；用户刷新后存真实结果。有效数值才展示剩余 `100-used_percent`，缺字段保持 null；优先 `rateLimitsByLimitId`，缺失时包装 legacy `rateLimits`。不同桶、产品、Token、币种不相加。若刷新失败且已有成功缓存，status=stale 并保留旧桶与 last_success_at；否则 unavailable、buckets=[]。失败 reason 为固定 `cli_not_found|native_cli_not_found|probe_timeout|initialize_failed|rpc_error|invalid_response|process_failed`，仅保留必要错误码，不返回原始认证错误文本或 stderr。

### 3.6 RSS 合同

`NewsItem={id,source_id,source_name,title,url,published_at:null|ISO,fetched_at:ISO}`；`NewsSource={id,name,status:"available"|"stale"|"unavailable",reason,sampled_at,last_success_at,item_count}`。固定来源：google_ai=`https://blog.google/technology/ai/rss/`；openai=`https://openai.com/news/rss.xml`；huggingface=`https://huggingface.co/blog/feed.xml`。

每来源连接/读取超时10秒，响应读取上限 1 MiB + 1 byte，超限失败而非解析半份 XML；只读取 channel/item 的文本 title/link/pubDate，CDATA 当文本；条目只保留 HTTPS URL，无时间条目标为未知并排在有效时间后。去重 source_id+url，每源最多5条、合并最多15条；有效发布时间倒序。缓存15分钟，同一进程同来源刷新加锁或合并，最多并行3来源。某源失败保留其旧结果并标 stale；无旧结果 unavailable。整体有部分失败且仍有条目为 stale，全无可用源为 unavailable，全部来源正常（包括空 feed）为 available。无标题/无安全 URL 的条目跳过；不传全文 HTML。

## 4. 最小片段闭环与目标形态

以下为**目标伪代码**，不是完整实现代码。来源锚点：gateway `do_GET/do_POST/allowed/garden_body` → 新 WorkspaceService → 新 WorkspaceStore/只读 source → workspace.js 表单回执。它们连同 §3 字段合同构成一次创建与一次外部刷新从入口到可见结果的闭环；reviewer 无需自行猜拼装顺序。

```python
# gateway.py：在既有保护之后匹配精确新路径；旧分支保持
if new_workspace_api:
    if not self.allowed(api=True, focus=is_post): return
    service = self.server.workspace
    if service is None: return reject(503, "workspace_unavailable")
    body = self.garden_body() if is_post else None
    # whitelist route -> service method; typed input/lookup/storage errors -> fixed HTTP reason
    return reply(200, service_operation(body))

# workspace_store.py：每次操作独立连接与事务；不触碰旧数据
validated = validate_task(body, registered_projects, current_codex_sample)
with connection:
    create_or_update_existing_task(validated)  # update missing -> task_not_found
return read_committed_task(task_id)             # exceptions do not return success

# workspace_sources.py：唯一会启动子进程的显式只读额度操作
try:
    process = spawn_resolved_native_codex_hidden()
    request("initialize", clientInfo)
    require_success_before_notification("initialized")
    result = request("account/rateLimits/read")
    return normalize_or_mark_unavailable(result)
finally:
    stop_and_wait_only_owned_process()          # timeout/EOF/error path also executes
```

```javascript
// workspace.js：shared contract is §3; rendering never inserts provider text as HTML
await bootstrap();
const base = await api('/api/workspace');
renderLocalSections(base);
loadUsageCacheAndNewsIndependently();
// submit: disable same form while pending; keep draft until server reports success
const reply = await post('/api/workspace/tasks', validatedDraft);
if (reply.status === 'ok') { await reloadTaskSection(); clearDraft(); }
// failures retain values and visible error; explicit quota button alone calls usage/refresh
```

不改已有逻辑的工作包可用文字充分解释，但新增路由顺序、协议字段、状态回执和表单处理已触发片段要求，以上不可在实施时用“自行决定”替代。

## 5. 工作包与实施顺序

### S1 — SQLite 任务、人工记录与本地快照（backend）

- **目标/映射**：G2、G3；N1/N3。为管理事实建立事务，同时保留旧用户数据。依赖 §3 合同；可先于外部源实现。
- **关键文件/锚点**：新 `workspace_store.py` 的 `WorkspaceStore`（初始化、list/create/update task、list/save record）；新 `workspace.py` 的 `WorkspaceService.snapshot`、`discover_providers`、项目新投影。reviewer 先看这里判断哪些事实由工作台拥有，再看 sources。
- **目标形态**：根目录新增 `workspace-state.sqlite3`，仅含 tasks 与 manual_records。构造允许注入 db/registry/manual/todos 路径与索引读取器给 fixture；生产使用现有路径常量，不新增通用配置系统。SQLite 每操作独立连接，busy_timeout=3000ms，常规事务；不覆盖/重建损坏库，不跨库迁移，存储失败可独立降级。
- **步骤**：先严格验证器和临时库测试；再 CRUD；再组装 projects/todos/tasks/provider/sessions 各区。源读取失败保留段级原因。链接只有已知相对入口和固定 HTTPS，不将命令路径暴露成可执行动作。
- **验收/失败**：新增后重开库仍存在；更新未知ID不新增；非法字段/日期/非有限数值不写入；同一进程并发操作不共享连接；不可读旧源不会伪造0%，缺文档不抛全页错误。数据库繁忙/损坏返回明确不可用，用户输入不丢。
- **回退**：停止使用新服务即可恢复原路由；保留新库及用户记录，不以删除库回退。旧文件不写。无大规模删除。
- **作者体验门**：命名 Task/Record/Provider 与 §3 一致；SQL、验证、投影各在自身模块，不给已有 progress 增加新职责。片段使用 §4 的事务段与 §3 数据定义，结构足以理解。
- **impl 自证**：只用临时路径与合成元数据的 `tests/test_workspace.py`；证据 `work/agent-workbench-20261013/backend-unit-rN.log` 与本 feature `impl_backend.md`。缺重开/错误证据不得声称数据可靠。
- **coordinator 承接**：真实注册、CLI发现、旧文件哈希与隔离预览库交互；证据 `real-workspace-check.md`。不由 impl 扫私人正文、修改真实任务/旧数据。无真实记录证据仅可称 fixture 正确。

### S2 — Codex 只读额度与固定 RSS（backend）

- **目标/映射**：G2，消费 G1 已选协议；N1/N2/N4。依赖 S1 的来源形状；关键文件新 `workspace_sources.py` 的 `CodexQuotaSource.get_cached/refresh`、`NewsSource.get`，测试 `test_workspace_sources.py`。reviewer 先看准许方法、进程回收和缓存失败分支。
- **目标形态/步骤**：新 source 对象只保存自己的内存缓存和锁。Quota GET不启动进程；刷新串行并发合并，18秒全操作截止，2秒正常退出等待后仅 kill 自己的子进程并等待回收。隐藏进程窗口、stderr不返回前端。不创建线程/turn、不登录、不消费reset credit。
- **native发现**：优先 PATH 直接命中的 codex.exe；npm shim 情况仅从该shim目录解析本机已验证的 `node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/codex/codex.exe`，存在才启动；不存在返回 native_cli_not_found，不退回 cmd/shell/wrapper。该策略支持本轮 Windows x64 环境，不宣称覆盖其他安装布局；产品不依赖 research probe 脚本或硬编码其 D: 路径。
- **协议**：全操作共享 deadline，按 request id 匹配响应；初始化失败不继续读额度；忽略无关通知，EOF/非有效结果给固定错误；stdout单条JSON上限256KiB、有限缓冲，防止异常输出无限累积。最后必回收己方进程。规范化 fields 见 §3.5，首次结果可能成功也可能 -32603，不能硬编码。
- **RSS**：按 §3.6 实现，固定 User-Agent、不带本地凭证或项目数据；XML/日期问题局部处理；不接受客户端自定义URL。保留各来源错误（timeout/http_error/oversize/invalid_feed）和更新时间。
- **验收/回退**：fixture证明只发送三种方法、成功/错误/超时/EOF都清理进程；multi-bucket/legacy/null字段正确；RSS大小、CDATA、部分失败和旧缓存正确。禁用新入口即可停止新source请求，原 desk新闻不变。
- **作者体验门**：Quota与RSS是两个明确适配器，不引入共享插件基类；错误字面值与UI映射集中，不记录原始认证报错。§4协议片段及§3归一化足够覆盖调用/状态/回收闭环。
- **impl 自证**：mock进程/时钟/HTTP，不访问真实外部服务；证据 backend-unit-rN.log、impl_backend.md。fixture成功不能写“账号额度已接入”。
- **coordinator 承接**：显式真实只读quota刷新一次、公共RSS读取与结果/采样时间、己方进程清理核验；证据 `real-quota.json`、`real-news.json` 与 real-workspace-check.md。发现凭证/计费/登录需求即降级未知，禁止“为了测通”改设置。

### S3 — 网关接线与同源兼容（backend）

- **目标/映射**：G2/G3、N2/N3/N4；依赖S1/S2，UI可并行消费已冻结§3。唯一修改 `session_panel/gateway.py` 的组是 backend；锚点 `PanelHandler.do_GET/do_POST`、`make_server`、`serve`，新服务测试仍归 `test_workspace.py`。
- **步骤/目标形态**：加入3个精确静态映射、§3路由、可选workspace注入；沿用原 allowed/reply/garden_body。新异常只映射新分支，不改旧错误或跨层兜底逻辑；source/storage异常不外泄。生产只增加对象构造，原端口与garden环境身份逻辑保持。
- **验收/失败**：临时loopback fixture验证所有新路由、非法正文/多余字段、缺CSRF/坏Origin、缺服务503；旧分支测试仍通过。API不可用时新页面区域报错，旧入口仍可访问；不根据失败自动换端口或停原服务。
- **回退**：基于快照只移除本轮新映射/注入，不能覆盖外来修改；保留库。无需旧数据迁移或重启不属于本轮的服务。
- **作者体验门**：路由薄、业务留新服务；精确路径便于读者跟踪，避免泛型RPC/任意operation字符串。修改现有分支的片段已在§4提供，review重点核对保护先于body/operation。
- **impl 自证**：临时HTTP服务与全量unittest，无外网/真实启动；证据为命令退出码与全输出，归 backend-unit-rN.log、impl_backend.md，缺权限负测不放行。
- **coordinator 承接**：明确独立127.0.0.1端口启动新版本，不接管8766；真实UI请求与来源状态证据归real-workspace-check.md。未验证默认服务切换就不得说8766已更新。

### S4 — 响应式工作台与任务/用量交互（UI）

- **目标/映射**：G2/G3、N1/N3/N4；依赖§3冻结合同，与S1–S3并行。独占新 `web/workspace.html/js/css` 与 `tests/verify_workspace.cjs`。锚点 `api/post`、`renderProjects/renderTasks/renderProviders/renderUsage/renderNews`、表单提交与分区导航。
- **目标形态**：中文安静界面，桌面侧导航“总览/项目任务/Agents/用量/资讯”，中央项目与任务，辅助列今日待办/额度/资讯；用清晰层级、少量青蓝强调色和状态标签。窄屏导航可换行或横向可见滚动，内容单列，表单宽度不溢出。不引入图片/CDN/画布假数据，符合既有CSP。
- **步骤**：HTML语义与静态布局 → fixture合同渲染 → bootstrap/API → 项目过滤和任务表单 →手工状态/Provider编辑/会话选择 → 额度显式刷新与人工记录新增/编辑 → 独立RSS → 空/失败/窄屏状态。所有来源字符串用textContent；外链HTTPS并加安全rel。
- **交互验收**：新建/编辑任务后来自服务器返回，分配工具注明“不发送任务”；已关联样本过期仍可改手工状态；手工进度未记录显示“未记录”，不画0%条；Provider显示能力而非假活跃；quota not_checked显示“未查询”，-32603显示不可用且可重试；人工记录显著标记；自动日Token/费用显示未接入，不显示默认0。
- **待办/旧入口**：新页只读原todo，可一跳进入 `/progress` 编辑；所有已有会话/小院通过 `/`；原tool launcher通过旧页，不在新UI重复实现控制。只在旧HTML加“工作台”链接，不改原JS/CSS和操作合同。
- **加载/失败**：base、usage、news 独立加载；显式刷新期间仅禁用对应按钮。提交失败保留完整草稿和错误；成功再清空。刷新任务列表不覆盖其他正在编辑内容；sources失败局部显示原因/时间。表单有label、键盘焦点、错误提示和可见保存状态。
- **回退/作者体验门**：新HTML/CSS/JS可整体停止入口，旧页面恢复仅删除新增链接；不碰用户数据。API字段只由§3定义，渲染/事件分开，避免巨型innerHTML字符串和隐藏副作用。§4 JS片段说明主链与回执顺序。
- **impl 自证**：编写 Playwright fixture harness 与合成数据，用例覆盖新增/编辑、失败保留输入、未知/部分失败、360/390/1440px无body横向溢出和控制台错误；仅执行 JS/HTML/CSS 可行的静态/语法检查，不运行浏览器。证据 `ui-static-rN.log` 与 `impl_ui.md`；静态检查不得用于宣称 UI 行为通过。
- **coordinator 承接**：运行新旧全部浏览器 fixture（即使使用合成数据也不属于 impl-safe），记录 `ui-fixture-rN.log` 与带fixture标识的实际格式截图，禁止fixture写真实API/触发source；另以真实独立服务、真实项目与source、隔离新DB执行表单，拍摄1440×1000、390×844、360×800截图，含至少一张Agent或用量页。最终CUA证据为JPEG `.jpg` 与real-workspace-check.md，核验文件内容和扩展名一致。缺浏览器证据不能宣称交互通过；窄屏仅证明渲染，不证明手机联网。

### S5 — 桌面窗口入口（UI）

- **目标/映射**：G3、N2/N4；依赖S3/S4。文件 `scripts/open-workspace.ps1`；关键锚点固定loopback URL、Edge发现、可达性检查、Start-Process。结构无需完整脚本片段：以下顺序已足以预见目标行为。
- **步骤/目标形态**：可选整数Port参数默认8766、范围1024–65535；仅构造 `http://127.0.0.1:<Port>/workspace`，检查该路径可达；在标准ProgramFiles路径查Edge（root实测存在x86路径），失败明确退出；用Edge `--app=<URL>` 打开供用户使用的可见应用窗口。不写快捷方式、注册表/全局设置，不自动启动Python、不选择其他端口、不杀进程。服务未启动时说明先启动面板。
- **验收/回退**：参数与未启动服务/无Edge错误明确；窗口无普通浏览器地址栏并加载真实新页。删除本轮入口脚本可撤销，不改已有启动器。
- **作者体验门**：一份可直接读懂的小脚本，无后台守护或打包器；文案写“Edge应用窗口”，不称原生安装包。
- **impl 自证**：PowerShell解析器检查，不开真实窗口；证据ui-static-rN.log与impl_ui.md。缺真实窗口证据不能宣称桌面已验收。
- **coordinator 承接**：在自身新服务端口实际启动窗口并核验，仅关闭己方创建的窗口；证据real-workspace-check.md与桌面截图。不得借桌面测试接管原有8766或用户Edge进程。

### S6 — 真实验收、文档与交付（coordinator）

- **目标/映射**：G1–G3、N1–N4；依赖S1–S5、全部自证和独立实施审查。关键文件根README、本feature README、`impl_report_r1.md`、review报告；证据目录统一 `work/agent-workbench-20261013/`。
- **步骤**：核对快照差异与旧数据哈希 → 全量相关测试 → 独立端口真实运行 → 用临时新库进行任务/人工记录交互，读取真实项目但不写旧数据 → quota与RSS/CLI核验 →桌面/窄屏截图 → fresh reviewer读最终源码差异和证据 →修复则按受影响范围重验、复审 →更新入口和已交付/未交付边界。
- **成功/失败口径**：quota实际不可用是正确失败态的证据，不变成“真实额度已可读”；RSS或窗口失败如实记录并修复可修复部分，不能用fixture截图冒充。保留所有初次失败与重验结果。证据不足不声称G3满足。
- **验证责任**：impl只交付本组安全验证/报告；本工作包的真实运行、外部来源和窗口全部由coordinator承接，禁止转给impl秘密执行。独立reviewer不得只接受子agent自称通过；需自行核验最终文件与证据。
- **正式实施报告**：coordinator 汇总 `impl_backend.md`、`impl_ui.md` 支撑材料并生成本目录 `impl_report_r1.md`，逐组保留执行主体，不把coordinator浏览器/外部验证改写为impl自证。必填字段为：基本信息、变更事实、目标对齐、impl-safe执行记录、coordinator承接项、contract漂移、风险和回滚；每项验证含证据产物、责任归属、证据不足约束。Review(Impl)引用对应轮次正式报告；后续修订生成 `impl_report_r2.md` 等，不覆盖历史轮次，不新增报告层次。
- **回退/作者体验门**：原快照仅用于逐文件本轮差异的可追溯恢复，发现非本轮改动不覆盖；新增库保留。README说明一条生产启动命令、一个工作台URL和应用窗口入口，明确没有Git、没有原生安装包/手机远程/自动Agent执行。不把旧历史结论重写为本轮通过。文字结构足够，无业务代码片段。

## 6. 验证命令、证据与迁移

impl-safe 命令由各组执行并保存退出码与完整输出（不以管道截尾）；UI仅编写harness并静态检查，不运行浏览器：

```text
.venv/Scripts/python.exe -m unittest tests.test_workspace tests.test_workspace_sources -v
.venv/Scripts/python.exe -m unittest discover -s tests -v
<已发现的 Node runtime> --check web/workspace.js
<已发现的 Node runtime> --check tests/verify_workspace.cjs
```

全部浏览器fixture仅由coordinator运行，包括合成数据场景；日志执行主体记录coordinator，未运行时不得宣称UI行为通过：

```text
<已发现的 Node runtime> tests/verify_workspace.cjs --fixture
<已发现的 Node runtime> tests/verify_robot_cockpit.cjs --fixture
<已发现的 Node runtime> tests/verify_garden.cjs
```

先确认 tests 是否可按模块导入；若不是Python包，使用 `unittest discover -s tests -p test_workspace*.py -v`，日志保留原失败及正确命令。Node依赖沿现有harness发现/加载，不安装全局包。新旧浏览器fixture由coordinator在合并工作后运行，实施者不得运行。PowerShell解析器对新脚本读Token/AST并报告parse errors；不执行窗口动作。backend日志、UI静态日志与coordinator浏览器日志分别归档，正式轮次报告按S6汇总，不混淆执行主体。

证据三元组：每条记录都含**证据产物、执行主体、缺证据时结论限制**；各S已逐项给出。fixture截图命名带fixture，可保留其实际PNG格式；最终CUA截图为JPEG，使用 `workspace-desktop.jpg`、`workspace-mobile-390.jpg`、`workspace-mobile-360.jpg`、`workspace-agents-or-usage.jpg`，核验文件内容与扩展名一致，不能把JPEG字节改名为PNG。最终报告链接真实文件，附能力范围，不能只交付概念设计图。

兼容/迁移：无旧数据迁移；新库首次由显式生产服务初始化。旧页面新增入口不改变默认路由。由root使用明确独立端口预览；旧8766服务保持原进程，不自动切换。开发失败的停机策略是停止本轮新服务，旧服务继续可用；不得自动换端口掩盖冲突。若以后替换生产进程，必须明确识别所属和得到对应授权，不能把本轮页面验收当作接管许可。

## 7. 风险、对齐和澄清机制

- 保留U1名称映射候选、Grok产品/额度契约未知、DSH缺安装、日用量未采集、原生分发/远程未实现。它们不阻塞管理面；全部通过明确状态和后续范围表达。
- 固定native解析不覆盖全部Codex安装形态，返回native_cli_not_found即可；不退回未经验证wrapper或升级安装。RSS1MiB可能未来不足，明确oversize并保留旧缓存，不自动无界下载。
- SQLite保留常规事务，但不承诺多人冲突合并；任务全量更新为最后成功提交生效。新UI不编辑旧JSON，因此不扩大其既有并发写风险。source状态刷新不能覆盖编辑草稿。
- **事件触发对齐留痕位置**：本节与各impl报告。新假设、新风险、阶段切换立即通知coordinator；先记录事实/影响/建议，再由coordinator更新权威基线或范围。本次记录：Readiness PASS后进入LW；外部源已补研究；root确定/workspace、GET缓存/POST显式quota刷新、backend独占gateway，均在既有授权和hlplan内。
- **contract drift**：根README旧描述滞后由S6更新当前入口；旧feature审查历史不动。若真实字段与§3矛盾，停止该接口实施并报告，不让UI/backend各自改合同。若牵动架构，回到hlplan/基线；普通字段纠错由LW修订并重审。
- **批量提问与优先级**：本轮未触发用户提问，因为Readiness无阻塞，当前路径在自主授权范围内。若范围/验收/回退不唯一或新增假设阻塞，按P0阻塞、P1高风险、P2优化一次性组织真实问题，使用以下模板；已有明确授权不重复问。

```text
【DELEGATE_QUESTION】
需要用户确认：Q1 [影响范围/验收/回退的具体问题]
优先级：P0 | P1 | P2
影响阶段：LWPlan | Review(LW) | Impl
- A) [推荐及理由]
- B) [权衡]
请一次性回复：Q1=A, Q2=B ...
```

若只缺源码/协议事实，使用 DELEGATE_ACTION 交coordinator补调研，不自行臆造或递归委派。不因常规真实只读验证反复请求已授权动作。

## 8. Gate-1 自检与 Gate-2 协议

| 必备项 | 本计划位置 | Gate-1 |
|---|---|---|
| 目标锁/反目标/不影响项，工作包逐项映射 | §1、S1–S6 | 存在 |
| 文件、关键函数/handler、理解锚点/目标形态 | §1分工、S1–S6 | 存在 |
| 执行顺序、依赖、验收、回退、失败降级 | §2、S1–S6、§6 | 存在 |
| 核心链路总览与research事实映射 | §2 | 存在 |
| 输入输出/枚举/错误/边界、接口矩阵与状态 | §3、§4 | 存在 |
| 片段触发判断与链路闭环充分性 | §4及各S | 存在 |
| 目标锁/反目标映射完成 | 各S显式消费G/N | 存在 |
| 验证责任分层已落盘 | 各S impl/coordinator分工 | 存在 |
| 证据产物/责任归属/证据不足约束已落盘 | 各S及§6 | 存在 |
| 作者体验门证据已提供 | 各S命名/职责/表单/文档保护点 | 存在 |
| 测试分层、回归、兼容/迁移、停机 | §6 | 存在 |
| 风险、事件触发对齐、批量问题模板 | §7 | 存在 |
| 双阶段Gate与失败回退 | 本节 | 存在 |

Gate-1 由LW作者检查以上存在性，不以任务数量作门槛。Gate-2 由fresh review_plan主检、coordinator复核：顺读§2→§3→§4→S1–S6，确认真实约束、关键实现锚点、目标形态、片段闭环、能力/来源语义、验证分层和作者体验均足以独立实施，且所有Required Set存在。任一缺项则不放行，返回LW修订；口径不唯一时先DELEGATE_QUESTION，架构冲突回hlplan/基线。Gate-2通过不替代实施后验证与独立review。

没有整条逻辑删除或≥50行移除计划，不存在未列出的删除调用链。无新增跨功能事实；不重复扩增research/hlplan已经记录的候选。
