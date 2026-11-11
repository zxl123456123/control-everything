# 使用指南

[返回项目首页](../../README.md) · [使用指南](usage.md) · [可选接入](integrations.md) · [Windows 安装与维护](windows.md)

本文命令均从仓库根目录执行；安装版的专用命令另行注明。

## 多 Agent 工作台

Windows 安装版已装配内置项目工作台，统一入口是 `/studio`，旧 `/workspace` 链接会回到同一页面。项目总览可搜索、排序，切换卡片或列表，以及筛选正常、已归档或全部项目。没有项目时，点击“进入工作台”，再从“添加项目”添加已有目录、创建目录或克隆仓库。进入项目后，在工作区中使用终端、Agent 会话、文件、Git 和项目设置。归档不删除目录、事项或终端，恢复后沿用原项目身份。未装配内置运行时的源码管理服务保留原 `/workspace` 入口。

个人工作台的界面约定：页面第一个可聚焦项是“跳到主要内容”，回车后焦点进入主区域；设置与账号与设备是侧栏中的独立页面；读取项目失败时显示原因和“重试”；项目运行组件未连接时说明原因与下一步，仍可查看项目总览；账号服务未启用不影响本机项目。窄屏新闻页的工具栏按空间分行，380px及以下为采集按钮保留独立一行，宠物栏保持单行，“采集新信息”按钮完整显示。

项目添加和配置在开发工作台内操作，总览不重复显示目录配置表单。“添加项目”沿用内置工作台的目录浏览、新建和克隆流程。项目行上的加号在该项目内创建工作区，不会再添加一个外层项目。项目名称与配置在项目设置中管理，总览可归档或恢复项目，开发区保留 Git、终端、文件和 Markdown 等功能。个人工作台侧栏保留账号与设备，主题在顶栏切换。Codex、Claude Code、OpenCode 来源导入保留在兼容管理页 `/workspace-admin`，不在内置“添加项目”弹窗中。原高级接入展示页已移除，旧链接不再恢复其管理控件。

本机账号页通过自建身份服务完成登录授权，登录后在工作台内显示本人信息。账号登录与电脑接入分别操作，退出账号不会撤销电脑连接。只有服务端识别的管理员会看到注册成员、角色、成员状态、电脑状态、注册时间和邀请操作；普通成员不能读取成员目录。账号令牌由本机服务保存在当前 profile 的 Windows 保护存储中，不下发网页；重开页面保留登录，身份失效或角色变化后清除成员展示。

当前公开服务已关闭公开注册，采用管理员发放的本人独立账号和密码；管理员预先创建普通用户并开通成员资格，用户无需邮箱或邀请码。邮件功能暂停，忘记密码请联系管理员。在“账号与设备”中点击“登录 / 注册账号”完成登录，再在自己的电脑上点击“连接这台电脑”，核对账号并点击“确认绑定这台电脑”。浏览器登录后只能访问本人绑定的电脑。已登录的账号可直接用于连接电脑，无需再次登录；确认前退出或重新登录，需重新连接并核对账号。独立电脑授权仍可使用，授权页面支持自动带入短码，软件仍显示短码供核对。浏览器账号页在可见时每隔约 5 秒检查电脑状态；超过 45 秒没有有效心跳会显示离线，连接恢复后自动更新。电脑需要保持联网、未休眠且软件运行。安装包是否预置服务地址由发行配置决定；未配置时需填写服务管理员提供的两个 HTTPS 地址并重新打开软件。

自行部署者如选择保留原有注册和邀请码流程，可向本服务管理员领取邀请码，在“小组邀请码”中填写并激活；邀请码只能使用一次，自生成起 24 小时内有效，过期或已使用需重新领取。此流程是自行部署的备选，不适用于当前公开服务的管理员预开通账号。管理员操作见[固定普通账号说明](../examples/integrations/workbench-identity.README.md#管理员发放固定普通账号)，实际验收范围见[版本说明](https://github.com/zxl123456123/control-everything/releases/tag/v0.1.0a18)。

项目登记目录和相关事项；事项记录要交付什么及如何验收；工作区保存开发现场；Agent 会话是一次对话或执行过程。事项属于项目，不等同于某个工作区或会话。

工作区有两种目录关系：普通文件夹项目的多个工作区共享项目目录，适合同一份文件上的连续工作；Git 项目的原工作区使用项目原目录，新工作区可从所选起点建立独立代码目录（Git worktree），适合需要分开改代码的并行工作。创建不会自动带入未提交文件，项目设置仍可能包含共享路径；依赖与本地配置也不一定齐备。工作区不是运行安全沙箱。开发区可展开工作区名称旁的说明，核对实际目录与分支。

Windows 安装版的本机终端继承启动工作台时的用户环境和 PATH，正常加载所选 shell 的启动配置，沿用本机 Claude、Codex、代理与 Git 配置。默认直接读取工具已有用户目录，不另复制凭据；选择其他受管账号时仍按该账号配置运行。页面选择模型只决定模型参数，接口和凭据仍由工具原有配置提供。修改系统或用户环境变量后，重新启动工作台和终端使其生效。源码开发预览使用独立 profile，默认仍继承本机工具环境；需要隔离测试时按贡献指南显式启用 `--isolated-environment`。

当前源码工作台顶部显示项目、工作区和分支，“工作区总览”打开工作区面板；侧栏的“显示活动工作区”定位当前工作区。Windows 默认 shell 标签显示为 CMD、PowerShell、WSL 或 Bash，悬停仍可查看完整标题，自定义标题保持原样。搜索结果同时说明项目、工作区或标签所属位置。空间不足时侧栏改为覆盖面板，关闭面板后可继续操作终端或编辑器。

开发工作台的外观设置提供“界面透明度”，包括终端所在面板；终端自身的背景不透明度会在此基础上叠加。两项都影响背景显示，文字仍使用终端主题颜色。源码更新不代表已下载的安装包同步更新，安装版行为以对应[版本说明](https://github.com/zxl123456123/control-everything/releases/tag/v0.1.0a18)为准。

旧“进展”展示页已移除；旧项目事项、进展板和验收链接回到同项目开发页。已有事项、交付、反馈与人工验收记录保留，不因展示页退役删除。工作区状态、Agent 会话状态与人工业务验收分别记录，终端退出或会话结束不会自动表示事项完成。

原有事项管理与外部执行器保留在兼容管理入口 `/workspace-admin`，下面的流程只适用于该入口。终端结束不会自动完成事项或通过验收，Agent 自述也不等于人工验收。

### 外部执行器最小流程（源码开发版）

1. 登记真实项目目录，配置并启用本机 Codex 或 DSH Agent。Codex 使用工作台专用运行目录及 file 登录，需要先完成该目录的登录与 Windows 原生沙箱准备；DSH 沿用已安装 CLI 的 headless 原生模型与凭据配置，包括已有 LiteLLM 通道。DSH 命令保持 `dsh`，工作台通过 `DSH_CLI` 或 PATH 定位启动器。
2. 新建待办，选择项目和 Agent，确认“创建后立即交给所选 Agent 执行”。自动执行需要明确项目目录；不选项目会提示，取消立即执行则仅保存全局待办。已有未启动事项可以打开详情，选择项目后点击“执行此待办”，不必重建。
3. 工具需要授权时，待办详情展示具体命令或文件改动，可选择“仅允许这一次”“拒绝这次操作”“取消当前运行”。工作台自动刷新发现新的待处理审批时会打开相应事项；已有编辑草稿时不覆盖。此入口目前验证的是 Codex 原生工具审批，不代表 DSH 的全部异常工具审批已经接通。
4. Agent 完成后进入待审核。人工可通过、拒绝或要求修改；填写理由并选择立即继续执行后，原 Agent 在同一项目开启新一轮，派发快照绑定最新审核理由，结果再次待审。Agent 自述不等于自动验收，不会自行把事项标为完成。

同一目录有运行或待审批事项时，后续任务会提示占用；当前不提供自动排队，处理完前一项后可明确点击执行重试。Codex 与 DSH 工具保持启用，权限取自登记配置；不以关闭工具或默认完全访问实现最小流程。

DSH 无需在工作台重复填写模型 key 或统一登录 DeepSeek；尚未配置时，先在原生工具准备模型通道。使用 LiteLLM 时，在原生配置中准备对应地址、客户端模型别名、匹配协议与凭据来源；工作台任务 token 仅授权事项协议，不是模型 API key。登记保存、发现工具不代表推理或文件开发成功。首次登记后若仍提示执行服务未就绪，重启工作台后复查；实际响应以本次运行为准。新运行详情标明原生配置来源，原生未返回实际模型时显示未知；旧运行记录保留原有策略，不改写为原生配置。启动前摘要不探测原生模型配置内容，不能保证确认后该配置不会变化。

执行结果未知、且所属进程清理已核验时，可在待办详情填写理由并确认“人工释放本次运行”。释放只关闭工作台的任务占用并使事项回到待办，原未知执行与派发记录保留；再次执行仍需单独确认，不会自动重发。运行中、等待审批、清理尚未核验或执行关联不一致时不能释放。

已知限制：Windows 原生 Codex 在受限文件写入尝试中仍可能弹出 `0xc0000142`，实际曾在明确的一次文件审批后重试写入成功，具体 DLL 初始化根因尚未修复。完整隔离矩阵、DSH 异常审批、其他 Windows 电脑兼容性及新版安装器未完成本轮验收；现有安装包不因此自动包含这些源码改动。

### 从源码启动

以下命令启动 Python 管理服务，使用 Windows 与 Python 3.12 及以上版本。先安装 editable 包，再使用模块 CLI；仅安装 requirements 不会安装 `src` 下的程序。已有 `.venv` 时核对归属与版本，不覆盖。此入口可使用兼容项目和事项管理，但不会自动构建、启动内置项目工作台；完整开发界面需按[贡献指南的源码与构建](../../.github/CONTRIBUTING.md#内置项目工作台源码与构建)准备运行时，再按[开发预览](../../.github/CONTRIBUTING.md#studio-与内置项目工作台开发预览)装配启动。

Python 包已统一为 `control_everything`，分发名为 `control-everything`。更新已有检出后重新运行 `python -m pip install -e .`，将自己的启动命令改为 `python -m control_everything.gateway`；旧包名命令不再作为源码入口。默认数据目录、`SESSION_PANEL_DATA_DIR` 和已有安装身份保留，源码改名不会迁移或清空数据；正在运行的旧源码实例需自行正常停止后用新命令启动。

```powershell
git clone https://github.com/zxl123456123/control-everything.git
cd control-everything
python -m venv .venv
& '.venv/Scripts/python.exe' -m pip install -e .
& '.venv/Scripts/python.exe' -m pip check
& '.venv/Scripts/python.exe' -m control_everything.profile init
& '.venv/Scripts/python.exe' -m control_everything.gateway
```

打开 `http://127.0.0.1:8766/workspace`。默认数据目录在 Windows 为 `%LOCALAPPDATA%/SessionPanel`（环境变量缺失时为当前用户 `AppData/Local/SessionPanel`）；目录内的 `profile.json` 保存来源设置，`workspace-state.sqlite3` 保存管理记录。路径优先级为 `--data-dir`、非空 `SESSION_PANEL_DATA_DIR`、当前用户默认目录；显式路径必须绝对。

标准 Python wheel 包含后端和管理页面资源，可以离开检出目录使用。它不包含内置项目工作台的源码树、Node 运行时或 Rust 原生程序；缺少原生观察程序时显示 `native_missing`，基础管理仍可启动。Windows 标准安装另行组合内置项目工作台、固定运行时和 release 原生程序，并核验完整产品文件。源码模式保留旧根数据位置；安装包的兼容旧记录默认目录为用户默认数据目录下的 `legacy`，不会写入 site-packages，也不会自动搬迁旧记录。

保留已有服务时明确选择另一个端口，例如：

```powershell
& '.venv/Scripts/python.exe' -m control_everything.gateway --data-dir 'C:/example/SessionPanel/main' --port 14401
& './tools/scripts/open-workspace.ps1' -Port 14401
```

随后访问 `http://127.0.0.1:14401/workspace` 或 `/progress`。网关只监听 `127.0.0.1`，端口范围为 1024–65535；占用即退出，不自动换端口、终止或接管旧服务。打开页面脚本只打开已经运行的服务。Ctrl+C停止Python网关；已构建的原生观察后台独立运行，显式停止方式见下节。

### 兼容项目管理与接口

以下项目管理、事项和 Agent 接口供兼容管理入口 `/workspace-admin` 使用；内置工作台的项目添加按上文“添加项目”流程操作。

兼容入口的“添加项目”提供“从已有项目选择”和“新建项目”两条入口。从已有项目选择时，选择 Codex、Claude Code 或 OpenCode，先确认项目来源，再点击、勾选或从本页候选拖入想管理的项目。发现候选不会自动加入，以后新发现的项目也需要选择。没有可识别项目、尚未确认来源或读取失败时，都可直接“新建项目”，填写名称与真实的主目录，无需读取工具来源；可添加最多七个附加目录。搬迁时编辑路径，项目 ID 和绑定 ID 保持。归档保留任务、人工记录及待办，随时可恢复。新增任务只能选择活动项目；已有归档或未登记项目的任务可以保留原项目继续编辑，兼容记录区也可按原 ID 恢复登记。任务列表提供分页，不以首批展示条数代表全集。

项目目录 API（浏览器必须使用正常 CSRF）：

```text
POST /api/workspace/directories/pick         {title?, initial_path?} -> selected/cancelled
POST /api/workspace/projects/inspect         {path} -> path/name/empty
POST /api/workspace/projects/register        {name, path} -> project（只登记，不改目录）
POST /api/workspace/projects/create-preview  {name, parent_path} -> path/exists/can_create
POST /api/workspace/projects/create          {name, parent_path, confirmed: true}
```

`directories/pick` 在服务进程所在桌面打开本机文件夹选择框；用户取消返回 `{"status":"cancelled"}`，同一时间只允许一个选择框（`409 picker_busy`），无桌面/Tk 不可用时返回 `503 picker_unavailable`。浏览器 File 对象不提供真实本机路径，不能把它当目录路径提交。`create-preview` 不写磁盘；`create` 只创建一个子目录并登记项目，目标已存在返回 `409 directory_exists`，不覆盖文件。目录创建成功但项目登记失败时返回 `200 {"status":"partial","directory_created":true,"path":...}`，保留目录并明确提示重试登记；不会删除用户目录。

事项说明与派发（M2）：

```text
GET  /api/workspace/tasks/<task_id>/brief
POST /api/workspace/tasks/<task_id>/brief
POST /api/workspace/tasks/<task_id>/dispatch-preview
POST /api/workspace/tasks/<task_id>/dispatch
GET  /api/workspace/tasks/<task_id>/dispatches
GET  /api/workspace/dispatches/<dispatch_id>
POST /api/workspace/dispatches/<dispatch_id>/sent
POST /api/workspace/dispatches/<dispatch_id>/cancel
```

brief 包含 `request_text`、`acceptance_text`、`constraints_text`、`references`、`execution_directory_id`，用 `expected_revision` 做版本冲突检查。`dispatch-preview` 只生成快照和完整交接文本，不写外发；`dispatch` 必须 `confirmed=true`，可带 `preview_sha256` 校验预览后内容未变（不一致返回 `409 dispatch_preview_changed`），保存 brief 哈希/快照，初始状态 `previewed`。手动交接采用 `delivery_mode=manual`：人工交接后调用 `sent`，`sent` 不等于 `delivered`，未知不自动重发。后台执行采用 `delivery_mode=auto`：再读取 `GET /api/workspace/dispatches/<dispatch_id>/execution-context`，核对后向同一路径的 `/execute` 提交 `context_hash` 和 `confirmed=true`，快照保存不等于已经启动。派发记录可取消；同一 Agent 领取时绑定 dispatch_id，旧 run 的 run_id 隔离仍有效。

事项会话元数据（M2-04）：

```text
GET  /api/workspace/tasks/<task_id>/sessions
POST /api/workspace/tasks/<task_id>/sessions
GET  /api/workspace/sessions?project_id=<project_id>
POST /api/workspace/sessions/<session_id>/unlink
```

会话只保存 `source`、`source_instance`、`external_id`、可选标题/URL/Agent/最近来源时间，不保存聊天正文；`(source,source_instance,external_id)` 组成唯一键，同厂商不同实例可用 `source_instance` 区分，避免 Codex/DSH 同 ID 碰撞。一条事项可关联多段会话，一条会话最多关联一个事项；旧 `session_key` 以 `legacy_session_key` 和 legacy 会话项返回，不丢弃。跨事项复用同一外部会话返回 `409 session_conflict`；没有正文或打开能力时 UI 只能显示“元数据”。

事项消息与等待人（M2-05）：

```text
GET  /api/workspace/tasks/<task_id>/messages
POST /api/workspace/tasks/<task_id>/messages
POST /api/workspace/messages/<message_id>/sent
POST /api/workspace/messages/<message_id>/cancel
```

消息只支持人工交接（`delivery_mode=manual`），类型 `supplement`/`return`/`user_input`/`note`，初始 `previewed`，人工复制后 `sent`；`sent` 不等于 `delivered`。`client_token` 用于刷新/重试幂等，同 token 返回 existing，不重复写。等待人信息来自 Agent 的 `waiting_user` 进度事件（`tool_authorization`/`user_input`/`external_approval`/`unknown`），不回退为失败，也不因超过 120 秒释放占用；授权未接通时仍由原 Agent 处理，工作台不提供伪批准按钮。

项目进度来源可选“未配置（人工管理）”、workflow-for-coding、普通文本或版本化 JSON。文本/JSON 使用选定目录内的相对路径；预设读取该目录的 `docs/current`，仅读有限直接子目录及 README/progress 文本。缺文件、空内容、出界或读取错误分别显示，不影响人工管理。JSON 示例：

```json
{"version":1,"state":"active","stage":"implementation","percent":0,"note":"等待测试","updated_at":"2026-10-15T08:00:00Z"}
```

除 version 外字段可选，但 state/stage/percent/note 至少一项有效。state 为 planned/active/blocked/completed；percent 为整数 0–100 或 NULL。单文件最多 256 KiB，预设每项目最多 64 个直接子目录、128 个候选文件；超预算明确报错，不把截断读取当作完整来源。

“设置与导入”可填写本机 Codex 数据库的绝对路径并启用。工作台只读所选库及相邻 `.codex-global-state.json` 的项目、目录、会话标题、时间和归属元数据，不读正文或登录凭据。桌面项目作为候选展示，显式加入后才出现在工作台，项目身份按来源和显式项目 ID 区分；即使两个项目共用目录也不会自动合并。迁移中的旧新项目 ID 与会话归属先合并，再按项目分页；未知归属与显式无项目分别展示，读取不完整或失败会明确标识。

Codex 项目由来源管理名称和目录。显式加入时，工作台先把项目、目录和来源保存到自己的管理库；后续事项继续在同库事务内校验；刷新页面不会自动创建事项。可从会话页显式打开事项填写，也可在原事项编辑器中更换所属项目，原事项 ID 保留。来源暂不可用时，已保存的项目与事项仍保留，原事项可继续修改状态，新关联需等来源恢复。禁用后不再访问来源，也不回退其他个人路径。

Claude Code 与 OpenCode 列出的是“识别到的项目目录”，不代表导入完整桌面配置。[Claude Code 桌面端与 CLI 共用配置文件](https://code.claude.com/docs/en/desktop#shared-configuration)；工作台只支持明确确认的全局 JSON 中 `projects` 对象的绝对目录键，成员内容与聊天正文不保存。[OpenCode 桌面端运行本机服务并保存项目数据](https://docs.opencode.ai/docs/troubleshooting/)；工作台支持已有 v1.2.27 证据的 `project` 表结构，只取项目目录，未知格式（包括未核实的 V2）可直接新建项目。Codex 候选保留来源中的项目名称和目录；来源位置参考当前 `CODEX_HOME` 和用户目录，OpenCode 参考 `XDG_DATA_HOME`。位置建议不代表读取许可，多个文件需明确选择。`CLAUDE_CONFIG_DIR` 只提示目录，请填写实际全局文件。禁用立即停止该来源读取。

“移出工作台”保留事项和历史，可在添加面板的“之前管理过”重新加入；移出与业务归档独立。来源丢失仍保留已存项目。Claude/OpenCode 导入后可改名、改目录或配置进度来源；Codex 名称与目录由原来源管理。多个来源的同目录项目保持独立；变更导入目录仍检查活动项目冲突。

程序登记位于“工具与接入 → 配置工具”；添加项目面板只处理项目和项目来源。Claude/OpenCode 原生 EXE 与其他工具的自定义 EXE 必须确认本机路径，校验的是文件身份，不保证发布者签名；不接受 node/python/cmd 等通用宿主。登记不会运行、安装或结束工具。普通工具页只展示存在/登记状态，进程资源在折叠诊断中查看。页面自动刷新，错误时提供局部重试；外部资源管理器目录拖入请改用新建项目的手工路径入口。

v4/v5 备份恢复保留项目、路径和移出意图，但停用三个工具的来源许可，需在新目录重新确认读取；原生登记沿用重新绑定规则。恢复不恢复进程或窗口许可，回退前应保全当前备份并在另一目录恢复升级前版本，不要手工删字段降版。

新 profile 的远端 SSH、终端、工作台和启动器均为未配置；登记方式见[可选接入](integrations.md)。这些接入配置不会代替 Agent 执行配置。官方额度仅在点击查询后读取，公开资讯独立加载。源码开发版的 Agent 执行与审批条件见上面的最小执行流程；实际模型运行会使用对应账户额度。

## 每日 AI 资讯

本节说明旧观察/进度页面保留的资讯缓存卡片；当前 Studio 的新闻入口、来源设置与定时更新见[新闻阅读室](#新闻阅读室)。两者共用部分来源，但不是同一套展示与设置。

首页仅展示浏览器本地今天、未标为未来的默认 AI 来源前两条；资讯页展示本次返回窗口内的今日、较早、未知和未来文章。默认来源仍是 Google AI、OpenAI News、Hugging Face Blog（简称 HF，含社区文章），每源最多20条，显示扫描/过滤/重复和截断限制；“未见今日内容”只针对本次返回窗口。Hacker News 可显式选择，旧 `/progress` 也消费同一来源缓存，标为非AI筛选，并将HN收录时间与文章出版时间区分。

卡片保留真实出版时间（缺失则未知）、来源更新、采样和上次成功时间；源有摘要才显示纯文本“来源摘要”或“来源摘要节选”。缓存15分钟，失败/过期保留旧日期并标旧；前端每分钟及恢复可见时重算，pending最多等待20秒，不表示后台被浏览器取消。资讯独立读取，不让待办或任务保存等待来源采集。公共源可能失败或变更格式，不能把缓存有效等同于来源有今日新闻。

这些兼容卡片不提供阅读器的来源编辑与计划设置，不代表整个项目缺少自定义订阅或调度。账号接入、公开浏览采集及新闻计划分别在各自入口配置，不从卡片的来源缓存状态推定连接或采集成功。

## Windows 本机观察与返回

Rust观察后台是完整本机观察的标准组件，按当前用户及profile隔离，Python网关绑定端口成功后才连接或启动固定产物。标准产品只使用所属版本下已核验的 `native/observer`，源码开发使用固定的本机构建目录；不会临时编译或从PATH执行同名后台。源码/wheel 缺少产物时明确显示观察不可用；标准产品的基础运行文件损坏会阻止该版本启动，原生程序或其摘要文件缺失、损坏时基础管理仍可启动、观察明确受限。保留资料并使用可信安装器维护，安装与切换版本仍须完整核验所有交付文件。源码构建步骤和固定工具链准备见[参与开发](../../.github/CONTRIBUTING.md#windows-原生观察开发)。

安装发现、已核验运行进程、历史会话、待处理及返回能力分别展示。Codex、Claude Code、OpenCode 提供默认程序入口，Hermes、Pi 保留原接入；不支持的安装形态、权限不足或缺少会话来源保持未知，不因发现工具读取默认账户库。CPU首样本未知，100%表示一个逻辑核；内存是进程工作集，不代表独占物理内存或Token/费用。进程发现约5秒、资源约1秒、安装缓存最多60秒，页面标明来源和时间。

“工具与环境登记”保留自动发现，支持确认内置Provider候选或手动填写本机非PATH入口，也可登记自定义EXE及终端GUI宿主。同一安装供多个项目使用；登记、安装核验、当前进程、会话来源与导航能力分别显示。自定义程序仅代表用户指定映像的进程/资源，不冒充官方Agent、会话或审批状态；通用解释器不按名字认领其所有脚本。登记和删除均不启动或结束工具。

“选择工具窗口”仅对当前已应用并核验的登记开放：显式列出合格可见窗口、有限显示标题，用户选择后只尝试切回该窗口，不建立Agent/pane关联。默认观察不采集标题；关闭/到期即丢弃选择，不读正文、不执行终端CLI或Lua、不新建窗口。Windows前台策略可能拒绝切换，页面显示实际结果。当前自动绑定和classic console返回保持受限、无动作许可；Windows Terminal/IDE/ConPTY不因此获得标签页定位，WezTerm可作为普通GUI宿主登记。

普通旧登记仍兼容 v3；首次保存项目来源、移出意图或新程序类型时先备份并升级 profile v4，旧四段集成仍使用原version2导入文件，Codex显式来源保持原语义。保存成功不等于后台已应用；待应用、失联或配置变化会撤销旧导航。备份含本机路径，恢复的新登记须重新确认定位，不恢复PID/窗口或动作许可。旧程序不读取新配置版本，回退前保全新增意图并恢复升级前配置。

关闭浏览器/Python只断开观察连接，不结束外部Agent。原生CLI只管理自身观察后台，不停止任何外部工具；使用与网关相同的绝对profile目录：

```powershell
$observerData = Join-Path (Get-Location) 'work/example-profile'
& './work/native-observer/install/session-panel-observer.exe' status --data-dir $observerData
& './work/native-observer/install/session-panel-observer.exe' start --data-dir $observerData
& './work/native-observer/install/session-panel-observer.exe' stop --data-dir $observerData
```

以上为源码开发产物路径；安装用户需使用该 profile 原来所属的 `versions/<版本>-<闭包前16位>/native/observer/session-panel-observer.exe`，不要从 PATH 或另一版本选择同名程序。目录须已通过profile初始化；示例不会自动选择或接管其他服务。观察和导航不授予发送、审批、取消、启动Agent或读取正文的权限，真实工具版本/可见窗口覆盖需分别验收。

## Agent 注册

在兼容管理页 `/workspace-admin` 的“来源与导入 → Agents”登记本机 coding agent。当前保存显示名、类型、命令/可执行文件路径、启用状态、项目范围和可选的 adapter/connection 字段；保存登记不会安装、启动、停止或向 Agent 发送任务。Codex 与 DeepSeek Harness 已有受控执行适配，配置启用后仍需在事项中明确执行；条件见[外部执行器最小流程](#外部执行器最小流程源码开发版)。它与内置终端中直接运行的 Agent 会话分别管理。

```text
GET  /api/workspace/agents
POST /api/workspace/agents
```

`POST` 请求体为 `{"expected_revision": 0, "items": [...]}`；每个条目包含 `id`（新条目不传或为 `null`）、`name`、`kind`（`codex`/`dsh`/`custom`）、`command`（可空）、`enabled`，可选 `project_ids`、`adapter`（小写适配器 ID，如 `claude-code`）和 `connection`（动态连接字段，最多 20 个键、8 KiB；不接受 `token`/`secret`/`password`/`api_key` 等敏感键）。注册表使用 profile 配置 v5；已有 v1–v4 配置首次保存时先备份，再升级并保留原有 Codex、观察和项目选择设置。注册表按 revision 做并发校验，旧 revision 返回 `409 config_conflict`。命令和 connection 只作为本机登记值，保存时不会执行。

```text
POST /api/workspace/agents/token      {"id": "..."}，返回一次性 token 与 prefix
POST /api/workspace/agents/heartbeat  Authorization: Bearer <token>，请求 {"id": "..."}
```

Token 只保存 SHA-256 哈希，界面只显示前缀；重新生成会使旧 token 失效。心跳只在本进程内记录，60 秒内有心跳显示“在线”，网关重启后需重新心跳。任何成功的 Agent API 请求也会刷新该 Agent 的在线时间；心跳接口只校验 Host/Origin 和 Bearer token，不使用浏览器的 CSRF 头。

事项可通过 `assigned_agent_id` 分配给已启用 Agent；分配不会启动 Agent。每个 Agent 可带 `project_ids`：空数组表示所有项目（兼容旧登记），非空时只允许读取/领取这些项目；没有项目归属的事项需要全项目范围。`GET /api/workspace/agent-adapters` 返回 Codex、Claude Code、Pi、Grok、DeepSeek Harness、自定义 MCP/CLI、手动登记的字段 schema 和能力说明；它只是声明式预设，不安装或启动任何程序。Agent 使用同一 Bearer token 调用：

```text
GET  /api/agent/tasks
GET  /api/agent/tasks/<task_id>
POST /api/agent/tasks/<task_id>/claim
POST /api/agent/tasks/<task_id>/progress
POST /api/agent/tasks/<task_id>/submit-review
GET  /api/agent/tasks/<task_id>/review
```

`claim` 需要 `expected_revision`，同一任务只允许一个 active run；`progress` 接受 `stage=analyzing|implementing|testing|blocked|waiting_user`、可选 `percent` 和 `message`；`waiting_user` 必须提供 `message`，可带 `wait_kind=tool_authorization|user_input|external_approval|unknown`、`request_id` 和 `agent_hint`，把任务显示为“等待你处理”。`progress` 和 `submit-review` 都必须带 claim 返回的 `run_id`，防止人工取消后旧执行写进新 run；旧 run 返回 409 `run_mismatch`。`submit-review` 接受 `summary` 和可选 `evidence`，只把任务推进到 `review`，不能直接完成。人在现有验收接口确认后才进入 `done`。Agent API 不读取浏览器 CSRF，只接受 Bearer token；跨 Agent/未分配任务返回 403/404，冲突返回 409。已处于 `waiting_review` 的 run 不允许重复提交审核材料；存在 active run 时也不能改派或解绑 Agent。

浏览器读取事项时，每条事项带 `assigned_agent_id`、`assignment_state`（`unassigned`/`assigned`/`running`/`waiting_user`/`waiting_review`/`done`/`blocked`/`failed`）、`connection_state`（`online`/`unknown`/`not_applicable`）和 `last_contact_at`。`GET /api/workspace/agent-tasks/<task_id>` 返回 `{item,run,events,reviews,messages,review_material,connection_state,last_contact_at}`，其中 run 为最近一次运行，events 为最近 100 条按时间正序的事件；`review_material` 提供本次派发请求快照、Agent 自述、证据文件是否存在、关联会话、测试缺失状态和 `verification=unverified`，不会把自述当系统验证；浏览器不需要也不会使用 Agent token。

`connection_state=unknown` 只表示没有新消息，不能据此判定失败、释放运行或把任务退回 `todo`。`claimed/running` 可以长时间保持占用；只有 Agent 明确提交失败，或人调用 `POST /api/workspace/agent-tasks/<task_id>/cancel`（需要 `expected_revision` 和 `reason`）才结束占用。人工取消会把 run 置为 `cancelled`、任务回到 `todo`，并保留 `human_cancelled` 事件；取消不等于终止外部工具，旧 run 之后的提交会被拒绝。

## 重点、优先级、决策与验收接口

以下说明兼容管理入口保留的 HTTP 接口。

兼容管理页 `/workspace-admin` 已提供事项人工验收表单；决策仍通过下列接口管理，没有单独的决策编辑页面。接口使用当前 profile 的管理库（当前新库为schema10），不是内置终端的工具审批入口。请求沿用 `X-Session-Client: panel`；写请求还须使用同源 `Origin`、`application/json` 和从 `/api/bootstrap` 获取的 `X-Session-CSRF`。不要将实际 token 写入公开文档或代码。

事项的 `POST /api/workspace/items` 和 `/api/workspace/items/update` 增加两个可选字段：`priority` 为 `0`（高）、`1`（普通）、`2`（低）或 `null`（未设置），`focus` 为整数 `0` 或 `1`，不接受布尔值。重点是持续人工标记，没有日期，也不会在午夜自动清除。旧客户端不传新字段时保持原行为。更新仍使用 `id`、`expected_revision` 和 `changes`，例如：

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "expected_revision": 1,
  "changes": {"focus": 1, "priority": 0}
}
```

`GET /api/workspace/items?focus=1&sort=priority` 返回重点事项，并按高、普通、低、未设置排列；同级保持原手工顺序。可组合原有项目、负责人、状态筛选，也可使用 `priority=0|1|2` 或 `focus=0|1`。默认 `sort=manual` 保留原顺序。后续分页继续携带第一页返回的 `list_revision`；事项变化时返回 `409 list_changed`，应重新读取第一页。

| 能力 | 路径 | 请求与返回 |
| --- | --- | --- |
| 查询决策 | `GET /api/workspace/decisions` | 可选 `project_id`、`status=open|accepted|superseded`、`offset`、`limit`；返回 `items/total/offset/limit` |
| 新建决策 | `POST /api/workspace/decisions` | 必填 `project_id/title/confirmed`，可选 `decision/rationale/alternatives/status/links`；返回 `decision` |
| 更新决策 | `POST /api/workspace/decisions/update` | 必填 `id/expected_updated_at/changes/confirmed`；返回 `decision` |
| 查询验收记录 | `GET /api/workspace/reviews` | 可选 `project_id/task_id/verdict/offset/limit`；返回 `items/total/offset/limit` |
| 人工验收 | `POST /api/workspace/reviews` | 必填 `task_id/expected_revision/verdict/reason/confirmed`，可选 `evidence/reviewer/run_id`；返回 `review` 和更新后的 `item` |

决策默认 `open`，正文 `decision`、理由 `rationale`、备选方案说明 `alternatives` 均为文本，`links` 为最多 20 条引用字符串。新建需要当前已选入工作台且未归档的项目。`confirmed` 必须是 JSON 布尔值 `true`，表达使用者明确提交。只有填写结论才能设为 `accepted`。草稿可修改正文及状态；已确认的正文不再覆盖，只能标为 `superseded`，另建替代决策；已取代记录不能重新打开。更新必须原样带回上次读取的 `updated_at` 作为 `expected_updated_at`；旧版本返回 `409 decision_changed`，不能静默重试覆盖。归档后的历史仍可查询。更新示例：

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "expected_updated_at": "2026-01-01T00:00:00+00:00",
  "changes": {"decision": "保留本机存储", "status": "accepted"},
  "confirmed": true
}
```

验收只接受当前为 `review` 的事项，且 `expected_revision` 必须匹配。`approved` 将事项设为 `done`，`changes_requested` 设为 `doing`，`rejected` 设为 `todo`。验收记录和事项状态在同一写事务内保存，失败时一起回滚；重复提交旧版本返回 `409 item_changed`。`reason` 必须有内容；`evidence` 为最多 20 条人工填写的证据或核验说明字符串。`reviewer` 只是人工标签，不代表认证身份。普通人工记录的 `run_id` 可作为外部引用；自动执行事项还会核对派发与运行绑定、已完成状态和清理结果，不匹配返回 `409 execution_review_conflict`。有活动原生托管运行的事项不能通过这个旧验收入口处理，返回 `409 native_managed_item`。工具输出、会话结束和进程退出均不会自动通过验收。示例：

```json
{
  "task_id": "11111111-1111-4111-8111-111111111111",
  "expected_revision": 2,
  "verdict": "approved",
  "reason": "已核对改动并在本机验证",
  "evidence": ["异常提示符合预期", "恢复路径已手工验证"],
  "reviewer": "我",
  "confirmed": true
}
```

验收记录只追加，不提供覆盖或删除接口。原有事项状态编辑保持兼容，普通状态编辑不会伪造验收记录。新接口单次写请求最大 256 KiB，分页每页 1–100 条；无效输入返回 `422`，不存在的事项或决策返回 `404`，状态或版本冲突返回 `409`。引用与证据仅按文本保存，不自动读取文件、访问链接或验证工具报告。

## 导入旧记录与恢复

当前新管理库使用schema10，配置仍独立兼容v1/v2/v3/v4/v5；备份manifest1至10分别对应schema1至10。新空profile直接初始化schema10，已有schema1至9不会随启动自动升级：先正常停止自己使用该profile的实例，再显式执行离线迁移。命令不会终止其他程序；锁忙、未知表/版本、校验失败或超预算会拒绝并保留原库及已生成备份，不截断历史值。

```powershell
& '.venv/Scripts/python.exe' -m control_everything.profile status --data-dir 'C:/example/SessionPanel/main'
& '.venv/Scripts/python.exe' -m control_everything.profile migrate-tasks --data-dir 'C:/example/SessionPanel/main'
```

迁移将旧tasks/todos收为一个可写模型，保留来源及原ID（包括空待办ID）、重复标题、原顺序、时间和NULL；旧接口通过适配读写同一模型。数据库中的tasks/todos是只读兼容视图，不能再用旧程序或直接SQL写入。新列表的顺序单独保存，不伪造两种来源的历史先后。schema3在保留旧视图的同时增加事项优先级、持续重点标记、审核记录和项目决策日志；schema4增加 assigned_agent_id、agent_runs 和 task_events，用于 Agent 领取、进度与审核证据；schema5增加 task_briefs、task_dispatches 和 agent_runs.dispatch_id，用于版本化事项说明与人工确认派发快照；schema6增加 task_sessions，用于事项与外部会话元数据关联（不保存聊天正文）；schema7为 task_sessions 增加 source_instance，同厂商多实例用独立命名空间；schema8增加 task_messages，用于人工补充要求/退回意见/等待人回答的手动交接记录；schema9增加 execution_runs、execution_events、execution_approvals，保存真实执行、事件及工具审批；schema10增加 task_native_runs、task_deliveries、task_native_message_delivery，保存原生运行绑定、版本化交付和输入回执，事项与验收记录同时增加交付及幂等关联字段。这些账本均纳入对应版本的备份恢复。

在空 profile 的“来源与导入”填写旧数据目录的绝对路径，例如 `C:/example/previous-panel`。固定读取 `progress-registry.json`，以及可选的 `progress-manual.json`、`progress-todos.json`、`workspace-state.sqlite3`。只导入全部合法项目、人工进度、待办、工作台任务和人工用量；保留原 ID、顺序、关联与已有时间。未登记项目的记录进入兼容区；没有原时间的导入快照显示“来源未提供时间”。

导入不改源目录、不读或复制 execution/审批/事件/私人正文，不导入个人来源设置。非法、重复、schema 不兼容或超预算的批次整批拒绝并给出字段定位；不会只取旧页面前 500/100 条。目的 profile 必须业务为空且未导入过，来源与目的目录不能重合或互相包含。已有记录应另选空 `--data-dir`，不能覆盖或合并导入。

提交前会在目的 `backups/<UTC>-<random>/` 生成管理库、配置快照和 manifest。成功页面显示完整 counts、备份路径及排除范围；备份失败不提交导入，失败的 `.pending-*` 目录可能留作诊断。恢复在离线命令中写到另一个不存在或真正空的目录，拒绝覆盖已有 profile：

```powershell
& '.venv/Scripts/python.exe' -m control_everything.profile restore --backup 'C:/example/SessionPanel/main/backups/<备份目录>' --data-dir 'C:/example/SessionPanel/restored'
# Only when restore reports schema1-9 / migration_required:
& '.venv/Scripts/python.exe' -m control_everything.profile migrate-tasks --data-dir 'C:/example/SessionPanel/restored'
& '.venv/Scripts/python.exe' -m control_everything.gateway --data-dir 'C:/example/SessionPanel/restored' --port 14401
```

恢复会校验 manifest、文件大小/哈希、schema 与 SQLite 完整性。停止自己的旧实例后另行启动恢复目录；不在线切换，不删除原 profile 或导入后的新记录。真实个人数据是否符合导入合同需实际校验，隔离 fixture 验证不能替代个人迁移结果。

恢复接受版本1至10的备份，先保留原schema结构，再由上述命令显式迁移旧库。需要退回旧程序时，先停新版实例并运行 `python -m control_everything.profile preserve-tasks --data-dir <绝对profile目录>`，验证包含升级后全部新增/变更的当前管理库私密备份，再把升级前旧备份恢复到另一个空目录。原管理库目录和保全件必须保留；保全不是把新语义自动反写旧库，单独回退代码不代表数据已无损降级。

新记录保存在所选 profile，源码旁旧 JSON/SQLite 与既有服务保留原位。任务负责人表示人工分配，不向 Agent 发送命令。资讯含来源与采样时间，不是推送流。

手机浏览器远程访问已有账号、电脑绑定和在线状态流程，使用条件见本文开头“账号与设备”说明；具体手机与浏览器的验证范围以对应版本说明为准。自动每日成本尚未提供。

## 公开内容与本机数据

实际 profile、导入文件、备份、数据库、凭据和日志只保留本机；配置备份可能包含私人服务器和路径，不提交到公开仓库或上传为公开附件。

新成员可按 [参与开发](../../.github/CONTRIBUTING.md) 从干净检出安装并执行 Python/Node 测试，再用独立数据目录完成初始化、项目登记和设置验证。仓库规则是开发要求；远端 CI、分支保护是否生效必须检查实际运行与 effective ruleset，不能仅凭规则文件宣称已启用。


## 新闻阅读室

从 Studio 的“新闻”在当前工作台内打开 `#news`，`/news` 保留独立入口。标题目录切换单篇，支持图文、看图、原文、中文和双语；读完点 × 标为已读并归档，可撤销，收藏独立保留。阅读记录保存在当前浏览器，远程访问按账号上下文隔离；换浏览器或端口不会自动转移这些记录。

### 来源与更新计划

在“来源与更新”中启停内置来源，添加公开 HTTPS 的 RSS/Atom 或 RSSHub 订阅地址，设置分组及包含、排除关键词。筛选只影响阅读视图，停用来源保留历史；已读、收藏和归档仍可找到。不会自动部署 RSSHub，也不连接私网、localhost、含凭据地址或自签名服务。

定时更新默认关闭。启用时选择15分钟至7天的间隔，或每日时刻及明确时区；计划读取已启用的来源。公开浏览采集须另行选择纳入计划、主题和关键词。关闭网页后服务仍执行，退出服务则停止；重启后错过多次只合并一次。保存设置不会立即采集，查看下次执行、上次结果和失败原因确认实际状态；繁忙时手动采集不会自动排队。

### 阅读与公开采集

“更新新闻”读取真实公开 RSS；“采集新信息”打开采集工作台，可按主题/关键词尝试公开检索，或粘贴 `https://x.com/作者/status/编号` 读取已知公开帖。步骤和来源卡回看真实浏览截图；来源、日期、引用、日志和图注按需展开。采集失败保留已有内容，较早文章不会因重新抓取变成今日新闻。

X 搜索可能受限。作者文章引用或直接链接可通过官方 Publish 页面读取；节选会显示“帖文节选”，不声称已获取完整讨论线程。视频展示预览图，链接卡图也会标明。采集使用隔离浏览器，不读取个人浏览器登录状态。

本地英译中需要先准备可选依赖与模型，步骤见贡献指南的“新闻阅读器”。机器翻译可能误译专有名词，可随时切换原文或双语。首次准备模型需要联网，之后翻译在本机执行。

蜘蛛默认不跟随鼠标。点标题会直接切换阅读，前足短暂探取信息目标；采集工作台里的蜘蛛随真实事件和来源回看移动。脚尖动效只是操作反馈，采集成功与否以数据和状态为准，不会等待动画才加载正文。两处共用暂停开关，并遵循系统减少动效设置。

### 宠物

在“设置 → 外观”开启宠物，选择蜘蛛、奶龙或狸花猫；默认关闭。阅读器的形象选择与工作台共用偏好，当前源码在项目、编辑器、终端、账号页及窄屏中也可显示。进入新闻时由阅读器接管，同一时刻最多显示一只；安装版行为以对应版本说明为准。

点击宠物打开共享的六槽转盘，可打开工作台、查看或搜索新闻、进入安静模式、宠物设置或隐藏宠物；当前页面不可用的动作保留位置并显示原因。Tab 聚焦转盘按钮后按 Enter 打开，方向键选择，Esc 关闭，打开后可用1至6执行。安静模式、系统减少动效和标签页隐藏时暂停动作与状态轮询。显示范围、偏好及交互详见[宠物使用与集成](PETS_INTEGRATION.md)，独立页面接入见[嵌入指南](EMBEDDING.md)。

探取目标文字会高亮，结束后恢复。采集画面是按步骤保存的截图，不是可操作的实时浏览器；工作台标明采集中或已结束、实际耗时和最近进展。结束后优先回看成功提取的正文截图，失败来源的画面仍可点选查看。公开搜索会读取已出现的结果节点，最多额外等待3秒，不再为每个页面固定停顿。

动画保留来自 [felixyu9722/WebCrawlerMY](https://github.com/felixyu9722/WebCrawlerMY) 的 Canvas/IK、步态与粒子实现，基于提交 `549ea978ba1bea7017bcc3625b354f1c2f2e5307` 适配采集、归档和信息目标互动。源码头保留作者、来源及固定版本；该版本 README 声明 MIT，但未包含独立 LICENSE 文件，此处不补造上游许可文本。页面不展示“原作”推广链接。
