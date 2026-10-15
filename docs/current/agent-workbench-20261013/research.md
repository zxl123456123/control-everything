# 代码库调研：多 Agent 工作台

调研日期：2026-10-13（Asia/Shanghai）  
角色：repo_researcher；受众：共享  
范围：当前磁盘上的实现和既有 feature 状态，只读调研；只新增本报告。

当前产品已经有两个可工作的网页入口：`/` 是会话与协作小院，`/progress` 是项目、新闻、待办和固定工具启动入口。后者今天已继续开发，不能依据根 README 或凌晨截图把它当成仅有六张进度卡片的页面。现有系统尚不是通用多 Agent 编排平台，也没有额度、token 或费用采集能力。

## A. 系统边界与现有能力

| 当前能力 | 真实行为及证据 |
|---|---|
| 项目概览 | 固定项目注册表；手工状态、短备注和百分比；从项目 `docs/current` 提取尚未收口的记录，最多五项。`session_panel/progress.py:24`、`:137`、`:169`。 |
| 今天的工作台 UI | `web/progress.html:19` 定义项目/新闻/待办/启动四区；`:17` 链接旧会话指挥室。`web/progress.js:176` 按“等我/阻塞、在做、未开始、完成”排序；`:359` 保存进度；`:383`、`:393` 写待办；`:403` 启动固定入口。 |
| 本机 Codex 索引 | 只读 `state_5.sqlite` 六字段；未归档 cli/exec/vscode、每页 12 项，另报覆盖数量；明确 `activity_state=unknown` 与 `task_completion=unknown`。`session_panel/codex_index.py:27`、`:40`、`:64`。 |
| 项目会话提示 | Codex 最近 40 条未归档会话的 cwd；Grok session 目录名按 URL 解码；按 cwd 归属项目，工具+目录名去重，最多 3 个提示。不是全部会话，也不是活动检测。`session_panel/progress.py:92`、`:109`、`:117`。 |
| Claude 远端观察 | 固定 SSH 来源、独立身份/进程/终端位置证据，按明确 UUID 才读取正文；列表不能证明工作完成。`session_panel/service.py:25`、`:88`、`:97`、`:237`、`:249`。本次未调用正文接口。 |
| 终端定位 | 现有 WezTerm/Zellij 显式连接和 focus，需要当前实例、客户端和 pane 证据，不是任意终端控制。`session_panel/terminal.py:123`、`:194`；`session_panel/gateway.py:280`。 |
| 同根子 Agent 协作 | 同一个主 Codex thread 下登记角色、分配产物、提交、请求和记录独立复核、主会话验收；按根线程 SQLite 分域，写入使用事务，非跨工具全局任务队列。`session_panel/garden.py:59`、`:126`、`:290`。 |
| 工具启动 | 七个固定 ID 对应已知 cmd、Python 文件、计划任务或 URL；没有用户输入 shell 命令入口。`session_panel/launchers.py:8`、`:58`。 |
| 新闻 | HN Algolia 首页 API，仅四条标题+URL；成功结果缓存在内存 15 分钟。不是 AI 定向信息源聚合。`session_panel/desk.py:57`。 |
| 活动计数 | 对 Grok/Codex/Claude 目录最多检查 600 个条目，统计最近 24 小时修改的文件数。该数字不是今日会话数、token、请求数、额度或成本。`session_panel/desk.py:11`、`:20`。当前 `progress.js` 未展示 `pulse`。 |

### 今天的改动事实

- 本次只读 `Get-Item` 显示 `progress.html/js/css` 修改时间为 2026-10-13 16:38–16:39；`progress.py`、`desk.py` 为 15:45，`launchers.py` 为 16:38。该时间只用于判断文件新旧，不用于推断作者或交付状态。
- `work/progress-ui-log.md` 记录的是 10 月 12 日 22:58 至 10 月 13 日 01:03 的六卡片视觉迭代。今天下午的真实代码已经超过该记录。
- 当前 CSS 在 980px 以下把四区排成一列，项目区在前；旧 `.studio`、`.rail`、`.side` 样式仍留存。`web/progress.css:85`、`:106`；HTML 已没有 `#progress-rail`、`#progress-side`，JS 仍保存对应空引用。`web/progress.js:2`、`:8`、`:231`。

## B. 入口与主流程

1. `.venv/Scripts/python.exe -m session_panel.gateway` 创建 `SessionService`；仅当环境中的 Codex 身份是可核验的主会话时绑定 `GardenService`。`session_panel/gateway.py:387`。
2. 网关同时服务固定静态文件和 JSON API；服务地址硬编码 `127.0.0.1:8766`，端口冲突返回失败，不另开生产端口。`session_panel/source.py:12`；`session_panel/gateway.py:373`、`:399`。
3. 工作台先获取 bootstrap CSRF，再加载项目并绘制，最后加载 desk。当前页面只在初次加载和写入后刷新相应数据，没有持续订阅或定时元数据刷新。`web/progress.js:419`、`:378`。
4. 项目保存只写项目内 `progress-manual.json`，不会回写各项目 README；待办写 `progress-todos.json`。`session_panel/progress.py:212`、`:250`。
5. 会话页保留独立的远端观察、明确点选正文、终端定位流程；小院产物验收使用真实收据，机器人动画不产生任务完成事实。

## C. 关键模块与职责

| 模块 | 职责/依赖 |
|---|---|
| `session_panel/gateway.py` | stdlib ThreadingHTTPServer；统一路由、同源限制、CSRF；调用下列业务模块。 |
| `session_panel/progress.py` | 项目注册、手工进度、待办、Markdown feature 摘要、cwd 会话匹配。 |
| `session_panel/desk.py` | 文件修改计数、外网新闻请求与内存缓存。 |
| `session_panel/launchers.py` | 固定启动清单、进程/HTTP 探测、显式启动。 |
| `session_panel/codex_index.py` | 本机 Codex 原生 SQLite 身份元数据读取。 |
| `session_panel/service.py`、`remote_probe.py` | SSH 观察/正文 reader、采样合并和过期处理。 |
| `session_panel/terminal.py`、`workbench.py`、`native_processes.py` | Windows 进程证据、固定 WezTerm/Zellij 生命周期与定位。 |
| `session_panel/garden.py`、`garden_native.py` | 根线程身份域、原生亲子关系、产物版本和复核收据。 |
| `garden_mcp.py`、`garden_invoke.py` | 当前会话身份下的固定工具接口；不是任意身份代理。 |
| `web/progress.*` | 原生 JS/CSS 工作台；无前端框架、构建器或 package.json。 |
| `web/app.js`、`garden.js`、`robot3d.js` | 原会话页面和小院；Three.js 同源固定依赖。 |

## D1. 可复用 API 和数据

| 接口 | 数据/动作 |
|---|---|
| `GET /api/bootstrap` | `csrf_token`、app ID，可选 garden 根 ID。 |
| `GET /api/progress` | `projects[]`：id/name/state/note/percent/records/sessions。 |
| `POST /api/progress/set` | 精确字段 project_id/state/note/percent；成功后返回项目列表。 |
| `GET /api/desk` | launchers/pulse/news/todos，单个聚合调用。 |
| `POST /api/todos` | text/project_id；新增，最多保存 30 条。 |
| `POST /api/todos/toggle` | id；切换 done。 |
| `POST /api/launch` | 固定启动器 id；返回 desk 数据。 |
| `GET /api/codex/threads?offset=…` | Codex 元数据分页、覆盖范围、sampled_at 和可用性。 |
| `GET /api/sessions`、`GET /api/sessions/{id}` | 远端 Claude 观察及状态。 |
| `GET /api/sessions/{id}/messages` | 明确 UUID 下有界正文读取，本研究未调用。 |
| `GET /api/workbench`、`POST /api/workbench/connect` | 固定工作台观察与显式连接。 |
| `POST /api/sessions/{id}/focus` | 已验证 UUID 的终端定位。 |
| `GET /api/garden` | 当前根域快照；无绑定返回 garden_unbound。 |
| `POST /api/garden/request-review`、`POST /api/garden/accept` | 当前主会话的复核请求及验收。 |

证据：`session_panel/gateway.py:176`、`:228`、`:250`、`:268`、`:280`、`:333`。注册表格式固定为 id/name/root，HTTP 不接收任意文件路径（`progress.py:24`）。现存 `progress-manual.json`、`progress-registry.json` 和可能产生的 todos、garden SQLite 是用户数据，不能当成可重建 fixture。

## D2. 配置、依赖与运行条件

- 本机 `requirements.txt` 仅固定 `mcp==1.26.0`；远端 reader 的 `requirements-reader.txt` 固定 `claude-agent-sdk==0.2.163` 和 MCP。同主项目 `.venv` 已存在。本次没有安装或升级依赖。
- 代码直接使用 Python 标准库 HTTP、SQLite、subprocess、urllib；没有现成桌面打包器、PWA manifest、service worker、WebSocket/SSE 通道或跨设备身份认证。
- 多个本机路径、远端来源、端口与启动器写在 Python 模块常量中；项目目录来自注册 JSON。MCP 示例位于 `.codex/config.toml.example`。本次未读凭证、CLI 私人会话正文或全局配置。
- 浏览器测试已有 Playwright + Edge harness：`tests/verify_robot_cockpit.cjs:1`、`tests/verify_garden.cjs:1`；依赖路径固定到本机 bundled runtime，fixture 使用临时 loopback，不访问 8766。真实运行和旧 fixture 检查是不同证据。
- 根 README 的运行命令可继续用于当前 Python 服务：`.venv/Scripts/python.exe -m session_panel.gateway`。旧浏览器回归命令是 `node tests/verify_robot_cockpit.cjs --fixture`、`node tests/verify_garden.cjs`。本研究不启动/停止生产服务或工具。

## E. 真实安全边界与已观察缺口

### 当前保护

- 所有页面/API 要求精确 Host；有 Origin 时必须匹配；API 要求 panel/stdio 固定头；所有 POST 再要求精确 Origin + 每进程 CSRF token。预检拒绝。`session_panel/gateway.py:129`。
- 服务只能绑定 loopback；Windows 使用排他 socket；所有返回 no-store、nosniff、no-referrer、CSP；CSP 当前 `img-src 'none'`。`gateway.py:85`、`:364`、`:373`。
- 请求路径不落 HTTP 日志，异常对外用固定 reason。Garden 的根身份来自进程环境和原生元数据，不由 HTTP 参数选根。`gateway.py:81`、`:220`、`:333`。
- 这些是本机受信任用户的边界，没有多用户登录、手机配对、远程 ACL 或公网访问安全机制。浏览器跨设备“能渲染”与手机“能连接当前服务”是不同事项。

### 与本轮架构直接相关的缺口

1. 缺通用 Agent adapter、运行实例/任务分离的统一数据层、任务派发和跨 provider 管理协议。现有小院仅同根 Codex 子 Agent；Claude 远端、Codex 元数据、Grok 目录、固定启动器各自独立。
2. 无额度或成本采集。不得把文件修改数量、未归档会话数量或运行进程数量标注成使用额度。代码搜索 usage/quota/cost/额度 等仅命中 CSRF token、局部变量或系统结构字段。
3. 新闻仅 HN 首页四项，失败返回空数组；没有来源、采样时间、过期/错误原因等可用性信封。`desk.py:57`。
4. 项目会话 cwd 辅助读取失败返回 `[]`，Grok 目录枚举失败同样返回 `[]`；当前项目概览不能区分“没有匹配会话”和“来源不可用”。主 Codex 索引本身有明确 available/reason，二者语义不同。`progress.py:92`；`codex_index.py:15`。
5. 项目“未收口”来自 Markdown 关键字和文件 mtime 推断，不是显式工作流状态机；闭合关键字有例外过滤。它适合展示原文证据，不能证明任务完成。`progress.py:14`、`:43`、`:137`。
6. 启动器返回 True 只证明尝试发起了已知启动命令，没有等待子进程成功退出或服务就绪。`launchers.py:58`。
7. 今天的项目和待办写入是 JSON 读改写，固定 `.json.tmp` + `os.replace`，没有锁或版本冲突检查；HTTP 是多线程。（推断）多个浏览器/手机同时写入可发生覆盖或临时文件冲突。`progress.py:212`、`:235`、`:250`；`gateway.py:364`。Garden 与此不同，使用 SQLite `BEGIN IMMEDIATE`（`garden.py:136`）。
8. `latest_focus()` 在 docs/current 不可读时返回 None，而前端 `fillRecords()`、`priority()` 直接访问 `.length`、`.some`。（推断）注册项目缺文档目录时可能使整页加载报错；当前六个项目实机是否触发不由静态分析断言。`progress.py:137`；`web/progress.js:120`、`:176`。

这些均为调研发现，未修改业务代码。与本次具体实施无关的清理项（如重复 headers() 和遗留 CSS）只报告，不顺手重构。

## F. 已有 feature 的权威状态

| Feature | README 当前结论；不得互相覆盖 |
|---|---|
| unified-dev-control-panel | impl_reviewing / USER_CONFIRMATION_NEEDED；原 Codex 客户端三个工具加载观察待证据，业务结论留空。`docs/current/unified-dev-control-panel/README.md:7`。 |
| session-robot-cockpit | 旧 ReviewImpl BLOCKED；真实成功定位当时缺唯一客户端证据。`docs/current/session-robot-cockpit/README.md:5`。 |
| codex-conversation-index | 只读身份范围独立 PASS/PASS；实时活动不在已交付范围，旧控制 socket 只读探测 exit1。`docs/current/codex-conversation-index/README.md:7`。 |
| wezterm-session-link | R11 场景/选中来源有限交付；其余旧开放事项保持。R10/R11 的正向样本不等于所有时间/全部会话稳定；旧失败和补验边界仍在。`docs/current/wezterm-session-link/README.md:6`、`:12`。 |
| subagent-garden | ReviewImpl r2 PASS/PASS；已记录真实不同子 Agent 的产物交接、复核、验收与 8766 展示，客户端自动发现/热加载 MCP 尚未证实。`docs/current/subagent-garden/README.md:6`、`:39`。 |
| subagent-garden-detail | ReviewImpl r2 PASS；改善角色职责、收据、公开发言详情，不重写小院收据业务。`docs/current/subagent-garden-detail/README.md:5`、`:18`。 |

已读：根 README、上述 feature README 的当前状态段、新 feature README、`work/progress-ui-log.md`、依赖清单，以及本报告锚定的真实源码与测试。旧 feature 的结论为其文档记录，不作为本轮重新验收结果。

## G. 不确定点清单

- **U1：所指 ocra/dsh 的确切项目。** 本代码库不能确认；由业界调研核对仓库名和协议，不阻塞当前代码事实整理。
- **U2：各 provider 可用的官方额度接口、登录范围及数据粒度。** 未读取任何凭证或私人消息。需官方文档/合法元数据来源验证；当前只能说未实现。
- **U3：桌面壳与手机远程访问的目标部署方式。** 当前只是 loopback 网页，现有代码没有可沿用的跨设备认证。架构阶段须明确；不应直接把监听地址改成 0.0.0.0。
- **U4：目前运行网关是否绑定当前 root garden，及真实终端正向状态。** 本研究未调用相关生产接口或启动器；旧 README 的 PID 和正向样本不代表今天状态。root 可做只读核验。
- **U5：现有今天下午工作台的独立浏览器验收范围。** Python 覆盖项目 API/CSRF，旧浏览器 harness 主要覆盖 cockpit/garden；没有发现 progress 专用受控浏览器 harness。root 已在真实 IAB 观察进度页，但多尺寸/错误态尚需本轮验证。

本研究没有新增需要用户批准的动作，也没有为常规实施增加澄清门；U 点交由 coordinator 在完整基线中处理。

## H. 最小可核查证据与验证记录

- 最小入口：`gateway.py:148`、`:223`、`:373`；最小项目数据：`progress.py:169`、`:250`；今日 UI：`web/progress.html:19`、`web/progress.js:419`；Agent 实体：`codex_index.py:64`、`garden.py:59`、`:136`。
- `tests/test_progress.py` 共六个测试，覆盖默认手工进度、最新开放记录、待办增/切换、未知启动器、注册顺序、HTTP 进度与 CSRF。没有真实启动已知工具。
- root 在本轮发来的独立事实：`.venv/Scripts/python.exe -m unittest discover -s tests -v` 退出码 0，202 tests in 19.429s，完整输出已读；存在 Pydantic `IncompleteFieldDefinitionWarning` 未修。本研究未重复全量测试，此处明确为 root 承接证据，不冒充研究 agent 自行运行。
- root 本轮 IAB 打开真实 `8766/progress` 正常加载项目；较窄侧栏下项目区较长。此事实来自 root，尚不能替代完整桌面/手机验收。
- 本研究命令失败：第一次 `rg ... docs/current/*/README.md` 在 Windows 返回路径语法错误，exit 1；随后改为 `rg ... docs/current -g README.md` 读取。数次过大的批量输出被工具截断；结论所需片段另行定向读取，不把截断当完整证据。
- 未读取用户会话正文、凭证或数据内容；未运行启动器、未改用户项目状态；没有初始化 Git。根 coordinator 首次探测记录本目录不是 Git 仓库。

---

## 跨功能事实（待确认）

### 架构与约束

- [2026-10-13] 当前面板是固定 loopback 的 Python 服务；精确 Host/Origin/CSRF 和同源静态资源属于已实现边界，不能因为移动端需求而视为已有远程身份认证。
- [2026-10-13] 当前 Agent 身份、进程存活、终端绑定、任务完成是独立事实；现存 Codex 索引的活动和任务完成明确为 unknown。
- [2026-10-13] 用户手工项目进度/待办与 garden 收据属于不同持久化和并发模型：前者 JSON，后者根线程域 SQLite 事务。
