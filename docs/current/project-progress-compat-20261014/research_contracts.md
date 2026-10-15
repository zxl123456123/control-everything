# 管理数据、HTTP 与启动入口：补充合同事实

日期：2026-10-15（Asia/Shanghai）；角色：repo_researcher；受众：共享。

本文补充当前源码的列、校验与调用合同，供唯一 LW 冻结导入及接口使用。只读取源码和指定 feature 文档；未读真实数据库、私人正文、网络来源或已有服务，未改产品、旧 Orca/M3 或 Git。以下路径均相对仓库根目录；行号以本轮源码为准。

## A. 系统边界与模块

| 模块 | 已观察职责 |
|---|---|
| `session_panel/workspace_store.py` | 管理 SQLite 的 tasks/manual_records；业务枚举不由 SQL 校验 |
| `session_panel/workspace.py` | 工作台输入、数值与会话绑定校验；调用上表存储 |
| `session_panel/progress.py` | 旧 registry/manual/todos JSON 的读取、过滤和重写 |
| `session_panel/gateway.py` | exact HTTP 路由、安全入口、错误映射、生产服务装配 |
| `scripts/open-workspace.ps1` | 检查已有 URL，再打开 Edge 应用窗口 |

## B. SQLite 全列与存储入口

证据：`workspace_store.py:31–41`。两表均无外键、CHECK、状态枚举或 schema version；`id` 的声明是 `TEXT PRIMARY KEY`，没有额外显式 `NOT NULL`。其他列的显式空值约束如下。

| 表 | 列（按 schema 顺序；`!` 表示显式 NOT NULL） |
|---|---|
| tasks | `id TEXT PRIMARY KEY`；`title TEXT !`；`project_id TEXT !`；`provider_id TEXT`；`state TEXT !`；`session_key TEXT`；`source TEXT !`；`created_at TEXT !`；`updated_at TEXT !` |
| manual_records | `id TEXT PRIMARY KEY`；`provider_id TEXT !`；`product TEXT !`；`day TEXT !`；`metric TEXT !`；`value NUMERIC !`；`currency TEXT`；`window_label TEXT`；`note TEXT !`；`source TEXT !`；`created_at TEXT !`；`updated_at TEXT !` |

| 签名/锚点 | 当前行为 |
|---|---|
| `WorkspaceStore(db_path)`；`:16–19` | 保存路径和进程内 schema lock；构造本身不连接 DB |
| `connection()`；`:21–50` | `sqlite3.connect(timeout=3)`、`busy_timeout=3000`；首次连接 `CREATE TABLE IF NOT EXISTS`；yield 位于 `with connection` 事务；sqlite/OSError/OverflowError → `WorkspaceError("storage_unavailable")`；finally关闭连接 |
| `list_tasks()`；`:52–57` | 显式BEGIN，同事务count及 `SELECT * ... ORDER BY updated_at DESC,id LIMIT 500`；返回 `(rows,total)` |
| `get_task(task_id)`；`:59–64` | 按ID查询；无行 → `task_not_found` |
| `save_task(fields, task_id=None)`；`:66–84` | 新增生成uuid4和UTC ISO时间，source固定`manual`；更新只改title/project_id/provider_id/state/session_key/updated_at，保留source/created_at；无行→`task_not_found` |
| `list_records()`；`:86–91` | 同事务count及 `SELECT * ... ORDER BY updated_at DESC,id LIMIT 100`；返回 `(rows,total)` |
| `save_record(fields)`；`:93–111` | `fields.id is None`新增uuid4；更新按id，保留source/created_at；新增source=`manual`；UTC ISO时间；无行→`record_not_found` |

列表上限是展示查询限制，schema不限制总行数；列表不是完整导入数据。存储层不校验UUID、title长度、枚举、日期、数值范围或project关联（校验在下节服务层）。

## C. 工作台输入合同

`WorkspaceService(db_path=DEFAULT_DB, *, registry_path=progress.REGISTRY, manual_path=progress.MANUAL, todos_path=progress.TODOS, session_reader=None, quota_source=None, news_source=None)`（`workspace.py:82–89`）。默认DB是源码根目录 `workspace-state.sqlite3`（`:15`）。

共同字典：`PROVIDERS=("codex","claude","grok","dsh","opencode")`；`TASK_STATES=("todo","doing","blocked","review","done")`（`:17–22`）。`canonical_uuid(value)`要求字符串且 `str(UUID(value)) == value`（`source.py:33–36`），接受UUID模块可解析的规范小写连字符形式，不限定UUID版本；输入不规范抛ValueError。`finite_number`仅允许精确类型int/float、有限值；bool和超出math.isfinite转换能力的大整数拒绝（`workspace.py:29–33`）。

### 任务 `save_task(body, *, update=False)`

证据：`workspace.py:162–190`。顶层必须dict且**恰好**含新增五字段；更新必须另含id，无多余/缺失字段。

| 字段 | 服务层合法值 |
|---|---|
| title | str；`1 <= len(title.strip()) <= 160`；保存strip后的值 |
| project_id | str；必须匹配当前registry的项目id，未登记→ValueError |
| provider_id | 上述PROVIDERS之一，或None |
| state | 上述TASK_STATES之一 |
| session_key | None；或`codex:<canonical UUID>`，此时provider_id必须为codex |
| id（仅更新） | canonical UUID；先get_task验证存在，再读registry |

有session_key且更新时project_id/provider_id/session_key三个值未变，可保留离开当前样本的关联。否则会话必须出现在当前可用样本，且cwd在project.root内；分别失败→`session_not_in_sample`、`session_project_mismatch`。**未登记project先拒绝，早于“关联未变”分支**（`:175–188`）。成功返回 `{status:"ok",task:{...全部存储列,session_link_state}}`，link state为`none/not_in_current_sample/verified/project_mismatch`（`:128–135,190`）。

最小引用：

```python
# workspace.py:182–188
unchanged = existing and all(existing[name] == body[name] for name in ("project_id", "provider_id", "session_key"))
if key is not None and not unchanged:
    session = next((row for row in sessions["items"] if row["session_key"] == key), None)
    if session is None or not sessions["available"]:
        raise WorkspaceError("session_not_in_sample")
    if not inside_project(session["cwd"], project["root"]):
        raise WorkspaceError("session_project_mismatch")
```

### 用量 `save_record(body)`

证据：`workspace.py:192–224`。顶层dict且恰好含 `id,provider_id,product,day,metric,value,currency,window_label,note`；新增也必须显式给 `id=None`。

| 字段 | 服务层合法值/规范化 |
|---|---|
| id | None新增；否则canonical UUID；存储不存在→record_not_found |
| provider_id/product | codex→subscription；claude→subscription；grok→subscription/cli/api；dsh→local；opencode→local |
| day | str，正则`\d{4}-\d{2}-\d{2}`，`date.fromisoformat`合法且不晚于北京时间today；无额外历史下限 |
| metric/value | 见下表；共同要求finite_number且≥0 |
| note | str，原始长度≤120；无strip/空白折叠 |

| metric | value | currency | window_label |
|---|---|---|---|
| quota_used_percent | 0..100；可小数；不强制转换为int | 必须None | str，strip后1..24字符，保存strip结果 |
| daily_tokens | `value == int(value)`且≤9223372036854775807；允许数值上为整数的float；保存int | 必须None | 必须None |
| daily_cost | 非负finite；无额外业务上限；保存float | 必须CNY或USD | 必须None |

校验失败抛ValueError（某些类型问题可抛TypeError）；HTTP统一400 invalid_request。成功返回 `{status:"ok",record:{...全部存储列}}`。这些是当前写接口合同，不能证明历史SQL行天然满足合同。

## D. 旧 JSON 字段、过滤与重写

| 对象/锚点 | 精确行为 |
|---|---|
| registry；`progress.py:24–40` | 顶层dict含非空projects列表（顶层额外键未拒绝）；item必须恰好id/name/root。id匹配`[a-z0-9][a-z0-9-]{0,63}\Z`且唯一；name原始长度≤80、strip非空、无ord<32字符，保存strip；root必须str且Path.is_absolute，无存在性检查。失败invalid_registry |
| manual读取；`:159–166` | 文件缺失→{}；JSON顶层必须dict，否则invalid_manual；键名、条目值、额外字段不在此层验证/过滤 |
| manual展示；`:169–191` | 只遍历登记项目；条目非dict视{}；state不在`未开始/在做/等我/完成`→未开始；note非str→空，str仅strip；percent非bool数值且0..100才用，否则0；最终int(percent)。board还会读取真实来源，本文未调用 |
| manual写入；`:250–271` | `set_progress(project_id,state,note,percent,registry_path=REGISTRY,manual_path=MANUAL)`；project_id/state/note必须str；state为上述四值；percent非bool且int/float、0..100，保存int；note空白折叠后≤24字符；未登记project返回False、不写。目标条目替换成state/note/percent三字段；**写回只保留当前registry已知键，丢弃孤立ID** |
| todos读取；`:194–209` | 缺文件→[]；顶层非list→invalid_todos。跳过非dict；仅保留text=str且strip非空、id=str、done=bool的项；project_id非str规范成空串；每项只输出id/text/project_id/done，丢额外字段；id可空/重复/非UUID，text不检查40字符上限，不检查project存在 |
| todos新增；`:219–232` | `add_todo(text,project_id="",path=TODOS,registry_path=REGISTRY)`；text/project_id必须str；text空白折叠后1..40字符；非空project必须在registry，否则None；生成`os.urandom(4).hex()`（8位hex），done=False，头插；写前30项但返回完整items（可能超过30） |
| todos切换；`:235–247` | `toggle_todo(todo_id,path=TODOS)`仅要求str；对所有同ID项反转done；未找到→None；写回经过load过滤后的全部项 |
| JSON写入；`:212–216,267–270` | 固定`.json.tmp`文件，UTF-8/ensure_ascii=False/indent=2/末尾换行，再os.replace；上述逻辑无进程间锁/备份 |

最小引用（`progress.py:264–266`）：

```python
saved = load_manual(manual_path)
saved[project_id] = {"state": state, "note": note, "percent": percent}
kept = {key: saved[key] for key in known if key in saved}
```

工作台项目展示另用`finite_number`识别有效manual，缺失/非法/读失败分别给`not_recorded/invalid_record/source_unavailable`和percent=None（`workspace.py:103–125`）；不能将旧board的默认0当成真实人工0。

## E. HTTP 安全、现有 POST 与错误映射

共同入口：`gateway.py:133–147,238–242`。全部POST先要求唯一精确Host、Origin等于server.origin、X-Session-Client为panel或stdio、唯一正确X-Session-CSRF。分别403 `host_rejected/origin_rejected/client_header_required/csrf_rejected`。无跨域OPTIONS许可（`:149–150`）。

`garden_body(max_bytes=4096)`（`:420–447`）要求：无Transfer-Encoding；Content-Length恰好一个、1..10位十进制，值1..max_bytes；Content-Type恰好一个且等于application/json；累计0.25秒读取预算，提前EOF失败；json.loads拒绝NaN/Infinity/-Infinity字面常量，顶层必须dict。其JSON解码没有显式拒绝重复对象键（json.loads默认行为）。普通管理路由超4096与格式/读取错误均映射400 invalid_request，**不返回413**。`1e999`形式的溢出数值不由parse_constant拦截；用量finite_number仍会拒绝（源码推导，未执行输入）。

| POST路径（均拒绝query） | body/调用 | 成功与特有错误 | 锚点 |
|---|---|---|---|
| /api/workspace/tasks | C节新增五字段→save_task | 200 status/task | `:251–261,338–366` |
| /api/workspace/tasks/update | 新增五字段+id→save_task(update=True) | 同上 | 同上 |
| /api/workspace/records | C节九字段→save_record | 200 status/record | 同上 |
| /api/workspace/usage/refresh | 必须{}→usage(refresh=True) | 200 usage投影 | `:349–352` |
| /api/progress/set | 恰好project_id/state/note/percent→set_progress | 200 `{projects:board(...)}`；未登记404 project_not_found；ValueError/UnicodeDecodeError/OSError→400 | `:262–273` |
| /api/todos | 恰好text/project_id→add_todo | 200 `{todos:items}`；返回None→404 todo_not_found | `:284–301` |
| /api/todos/toggle | 恰好id→toggle_todo | 同上 | 同上 |
| /api/launch | 恰好id且str→start(id) | 200 `{launchers:catalog()}`；start假值等→400 | `:274–283` |
| /api/garden/request-review | 恰好task_id/version/artifact_sha256/reviewer_id | garden_reply；未绑定503 garden_unbound | `:31–34,302–312,449–465` |
| /api/garden/accept | 恰好task_id/version/artifact_sha256/summary | 同上 | 同上 |
| /api/workspace/execution/runs | garden_body的唯一24576 bytes特例→execution.submit | 新增202，replayed为200；旧执行合同保持 | `:243–250,386–409` |
| /api/workspace/execution/runs/<UUID>/cancel | garden_body默认4096→execution.act | 同上 | 同上 |
| /api/workspace/execution/runs/<UUID>/approvals/<UUID> | 同上，附approval_id | 同上 | 同上 |
| /api/sessions/<UUID>/focus；/api/workbench/connect | 旧独立读取分支，JSON必须{} | length>4096返回413 request_too_large；其它格式400；focus/connect异常503 focus_failed/workbench_launch_failed | `:313–336` |

上述旧focus/connect分支没有garden_body的0.25秒累计预算；这只是现状，不在本调研扩展修复范围。未知POST路径404 route_not_found。

workspace_reply的精确错误映射（`:358–366`）：

| 异常/原因 | HTTP |
|---|---|
| WorkspaceError task_not_found/record_not_found | 404，保留reason |
| WorkspaceError session_not_in_sample/session_project_mismatch | 409，保留reason |
| 其他WorkspaceError（如storage_unavailable/workspace_unavailable） | 503，保留reason |
| ValueError/TypeError | 400 invalid_request |
| 其他异常 | 503 workspace_unavailable |

普通reject响应是 `{status:"unknown",reason,source:SOURCE,observed_at:<UTC ISO>}`（`:101–104`），不是workspace的status=ok投影。reply统一no-store/nosniff/no-referrer及同源CSP（`:89–99`）。garden/execution另有专用异常映射，见上表锚点；不把它们替换为管理接口合同。

相关GET仍直接走旧模块：`/api/progress`→board(REGISTRY,MANUAL)、`/api/desk`→catalog/pulse/headlines/load_todos(TODOS)、`/api/codex/threads`→list_codex_threads(offset)（`:191–209`）；只替换server.workspace不会改变这些来源。

## F. 启动入口与参数

| 入口 | 当前签名/参数及行为 | 证据 |
|---|---|---|
| `python -m session_panel.gateway` | `if __name__ == "__main__": raise SystemExit(serve())`；没有main函数/argparse/CLI参数处理 | `gateway.py:550–551`，全文 |
| `serve()` | 无参数。actor_from_environment；根身份可构造GardenService；make_server(SessionService(),garden=...,workspace=WorkspaceService())；随后构造ExecutionService；监听失败OSError打印固定8766错误并return1；Ctrl+C关闭server，正常return0 | `:520–547` |
| `make_server(service,address=(HOST,PORT),*,garden=None,workspace=None,execution=None)` | address[0]必须127.0.0.1；地址注入注释限定临时fixture；Windows SO_EXCLUSIVEADDRUSE；生成当前端口Host/Origin和CSRF | `:490–517`；`source.py:12`固定PORT=8766 |
| `scripts/open-workspace.ps1 -Port <int>` | 唯一参数Port，默认8766，ValidateRange(1024,65535)。先GET `/workspace`，TimeoutSec5且必须200；从ProgramFiles(x86)/ProgramFiles找Edge；Start-Process `--app=<URL>`，WindowStyle Normal。失败exit1 | 脚本`:1–32` |

脚本只检查已有服务并开浏览器，不启动网关、不终止/接管已有监听。当前生产serve没有profile/数据目录/端口/来源开关；这些是尚需LW明确的新接口。构造ExecutionService的副作用细节已在主research记录，本补充没有运行serve。

## G. 不确定点与证据范围

- U1：真实历史行是否满足当前服务校验、真实管理数据总量与JSON异常形状未知；按边界未查询。确认应使用后续明确授权的导入校验结果，不能通过本报告推断。
- U2：新增profile/导入/项目HTTP接口尚未存在；字段、预算和错误类别由唯一LW冻结。本文仅记录旧合同，不作实现决定。
- 本轮必要文档已全文读取：README、clarifications、research、research_profile_ui、feedback_20261015_models，以及codebase-research/clear-expression/verification-before-completion规则。源码锚点均来自当轮读取。
- 保留读取异常：两次批量结果超过工具输出预算而截断，随后按文件/段补读research、workspace_store、workspace、progress关键段及gateway全文。一次末尾`rg --files -g AGENTS.md -g CLAUDE.md`无匹配，所在批命令exit1；其前文件读取有完整输出。未将无匹配当成文件读取失败或测试失败。
- 本报告没有执行产品测试、迁移、HTTP请求或服务启动，未宣称这些通过。交付核验只检查文档内容与源码锚点，不替代实施验证。

## H. 最小可核查证据

| 要核查的结论 | 最小证据 |
|---|---|
| 导入完整列及未做SQL域约束 | workspace_store.py:31–41、66–110 |
| 不能复用展示列表导入 | workspace_store.py:52–57、86–91 |
| 服务写入合法值及UUID | workspace.py:17–33、162–224；source.py:33–36 |
| 旧manual/todos过滤或丢失行为 | progress.py:159–166、194–247、250–271 |
| 管理HTTP4096限制与400映射 | gateway.py:251–261、338–366、420–447 |
| 生产入口与脚本参数 | gateway.py:498–551；scripts/open-workspace.ps1:1–32 |

事实与源码推导已在相应位置区分；无新增跨功能事实。
