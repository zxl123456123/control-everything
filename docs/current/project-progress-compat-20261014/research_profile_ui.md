# Profile 与页面兼容：补充源码事实

日期：2026-10-14；角色：repo_researcher；受众：共享。
完整消费当前 README、clarifications、hlplan、research；重新读取 clear-expression。本文只补当前源码事实，不修订 hlplan、不改变实施合同。不读取真实库、不运行浏览器或外部来源。

## 1. 两个页面的项目字段与百分比

| 页面 | 当前实际消费字段 | 当前语义 |
|---|---|---|
| workspace | id/name/state/note/percent/manual_recorded/manual_reason/records/records_available；records首项feature/label/text | 只有 manual_recorded 且 percent 是 number 才画百分比；有效0显示0%。其余显示未记录/记录无效/来源不可用（workspace.js:135–155）。note非空会代替首条文档摘要，当前没有同时展开人工说明和全部来源的项目详情 |
| progress | id/name/state/note/percent/records/sessions；records feature/label/text，sessions tool/place/href | 不检查 manual_recorded/manual_reason。卡片直接拼 percent+%，滑块和圆环直接消费 percent；上游旧 board 强制默认0，所以当前未记录显示0（progress.js:115–159、202、251；progress.py:169–191） |

旧 progress 直接接受新返回的 `percent=null` 会把圆环运算中的 null 转为0，但标签显示字符串 `null`，卡片显示 `null%`；这是源码表达式的推导，未作浏览器实测。不能仅改变 API 字段而认为旧页已处理未知。

旧 progress 的滑块 change、note change 和状态按钮都直接保存 `Number(slider.value)`；note-only编辑可能顺带保存当前滑块数值。新未知百分比如何保持未知必须由 LW 具体约束，当前不存在这种处理（progress.js:81–105）。

progress.records 要求数组并直接 `.length`/`.some`；workspace 更宽松地可选读取 records首项。字段形状调整需覆盖旧页，不应将服务的缺失状态直接丢给当前旧数组消费代码。

## 2. 旧 desk/启动器为空时的实际行为

- progress.load 获取 bootstrap → progress → ensureStage/paintRail/paintBoard/showProject → desk。项目为空时 showProject 提前返回，但 ensureStage 已创建带滑块/状态按钮的空编辑舞台，没有项目空态、禁用或导入提示（progress.js:145–148、419–435）。
- `/api/desk` 返回HTTP成功且 `{launchers:[]}` 时，paintSide 仍按固定四组构造“工作台/用Grok写/原油实验/网络”标题与个人描述；只有按钮为零。因此只在后端返回空启动器并不会移除个人展示（progress.js:265–354）。
- desk返回非2xx时 load不调用paintSide，news/todo/launch区域保留HTML空容器，没有“入口不可用”提示。refreshDesk亦只在ok时更新（progress.js:378–380、431–432）。
- paintSide中 todo表单与新闻/launch共用一次刷新；新增任务接口返回不包含desktop功能时不能假设页面自行知道其不可用。当前HTML区域是静态“启动”栏（progress.html:33–42）。
- 上述为源码事实与明确的推导；未用浏览器证明空页外观。

## 3. registry 缺失项目的已保存任务

- renderTasks 从tasks项过滤与显示，不要求project_id出现在projects。因此孤立任务在“全部项目”里可见；projectName失败时显示原project_id，无“未登记项目”标签（workspace.js:68、158–175）。
- 编辑按钮仅看csrf，孤立任务仍有编辑入口。openTask 的所属项目options仅取当前projects，随后fillOptions直接把select.value设为旧project_id，没有添加“保留原项目”option（workspace.js:70–75、173–175、252–258）。
- （源码推导）旧ID无option时select无法保持有效选择；必填select会阻止普通表单保存，用户选其它活动项目才可能提交。这与sessionOptions显式添加“保留原关联”option形成差异；当前没有孤立项目保留操作。
- 即使直接调用后端更新旧任务，save_task仍查registry项目，查不到就invalid_request；“关联未变允许编辑”的分支在它之后，不能救孤立项目编辑（workspace.py:175–188）。
- project-filter只有当前登记项目+全部，没有专门孤立/归档筛选；新建任务在空项目列表时禁用，但renderTasks中旧任务编辑不会随其一起禁用（workspace.js:235–237、175）。

## 4. 新UI可复用的当前插入锚点

这些是已有结构事实，不代替LW选择具体新页面布局。

- workspace.html:35 `projects-section` 已有section-heading、projects-status、projects-list；当前唯一管理链接到/progress，没有登记表单。task-form:37和record-form:50提供现有editor/fieldset/feedback样式及保存草稿模式。
- workspace.js:40–75 已有纯textContent构造、empty/message/fillOptions；api/post:76–98已封装客户端header、CSRF、40秒超时与固定错误文字。
- showView:100–120 由viewCopy驱动，但会手工切换work-grid/overview-aside/stats和四个view ID；新视图不能只加导航button而不接此逻辑。
- loadBase:226–242负责snapshot更新、项目filter、新任务禁用与render；刷新目前不主动重填task表单，保存失败保留用户草稿（saveTask:262–280）。profile设置与项目表单不存在，配置返回字段亦未消费。
- workspace.css 已有 .editor/.form-grid/.field/.feedback/.empty-state、700px单列表单、480px统计单列；可复用现有响应式基础，但它不证明新增多路径/来源/导入表单在320px可操作。
- bootstrap:438–446会初始化execution、同时loadBase/loadUsage/loadNews；renderProviders:216额外refresh执行。portable profile的能力和来源禁用须有实际页面消费与请求证据，不能仅使执行POST失败。

## 5. serve 分支与路由可隔离的实际调用链

| 位置 | 当前入口 → 来源/副作用 |
|---|---|
| gateway.serve:521–537 | actor_from_environment→默认Codex parent库；SessionService→默认RemoteClient/Terminal对象；WorkspaceService→默认JSON/元数据；ExecutionService→owner.acquire/recover |
| /api/sessions 与会话status/messages/focus | server.service方法→SessionService remote/terminal；serve只换WorkspaceService不能隔离它们 |
| /api/workbench 与connect | server.service.terminal.workbench/public_status/connect_workbench→个人Workbench；也不经WorkspaceService |
| /api/desk、/api/launch | catalog/start→固定CATALOG和个人路径/探测；/api/desk还pulse/headlines/load_todos(TODOS) |
| /api/garden与public-messages | server.garden；None时已有garden_unbound响应，bootstrap不返回garden_root |
| /api/workspace/execution* | server.execution；None时已有execution_unavailable响应；不构造ExecutionService即可避免启动owner/recovery，但现有UI仍需正确展示禁用 |
| /api/progress、/api/todos、/api/codex/threads | 直接模块函数/常量，不经server.workspace；需正式profile分支消费一致来源，旧fixture handler可留旧合同 |

该表只明确哪里有分支落点；没有建议重构全部terminal。新profile不构造旧个人对象、旧路由明确不可用属于当前hlplan选择；旧账本与执行内层保持冻结边界。

## 6. 证据范围与未验证

本次只执行文件读取/rg，均退出0，未产生新的失败；没有读取截断。先前主research中的读取异常/通配路径失败仍保留，不被本补充覆盖。

本报告未实测DOM选择值、null百分比外观、空desk渲染和真实浏览器交互；对应源码推导已明确标识，需LW冻结验收并由root隔离浏览器验证。没有新增用户阻塞问题，也没有新增产品范围或跨功能事实。

## 7. 现有回归的来源隔离事实

- 本次 `rg --files tests -g 'test_*.py'` 返回20个Python测试模块；这只证明文件清单，不证明全套discover隔离。test_progress.py已完整重读，本补充没有运行它或全discover。
- `test_registered_names_stay_in_registry_order`（test_progress.py:76）直接 `board(REGISTRY)`，读真实源码旁登记、默认MANUAL、登记root的latest_focus和默认codex/grok。六个个人项目名称断言不是新用户产品契约。
- `files()`（:15–22）虽把registry/manual写进临时目录，但两个project.root仍是 `E:/project-funny/biji`、`E:/project-funny/n8n-for-me`；`test_default_board...`（:25）多次board，`test_page_sets_progress...`（:83）POST成功后gateway.board，都会沿这些真实root读取latest_focus；其patch仅gateway.REGISTRY/MANUAL，未隔离codex/grok。
- `test_focus_is_the_newest_open_record`（:42）注册root及README都在TemporaryDirectory，文档源已隔离，但board仍调用默认codex_cwds/grok_cwds。`test_todo_can_be_added_and_toggled`使用临时文件并不调用board；`test_unknown_launcher_is_refused`使用不存在ID且传spawn替身，不能据此推广所有启动器测试无副作用。
- 可供LW选择的隔离锚点是files()登记root、个人名称测试的REGISTRY/MANUAL参数、gateway.REGISTRY/MANUAL替身、`session_panel.progress.codex_cwds/grok_cwds`两个读取点以及临时docs/current fixture；修改哪些测试和采用何种profile替身由LW冻结。只patch工作台的session_reader不会隔离旧board。

本节文件读取、清单搜索均退出0；未查询真实来源，没有新增失败。本节补充不覆盖第6节和主research已有失败证据。
