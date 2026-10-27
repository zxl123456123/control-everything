# 参与开发

仓库协作约定见 [AGENTS.md](../AGENTS.md)。本指南约束共同交付结果，不要求成员使用同一助手、模型或个人技能。

公开指南放 `docs/guides/`，架构与契约放 `docs/architecture/`，接入示例放 `docs/examples/`，`docs` 根只保留 [README.md 索引](../docs/README.md)；开发脚本放 `tools/scripts/`。活跃任务记录放 ignored `docs/current/<feature>/`，以 README.md 记录目标、验收、负责人、文件归属、状态、阻塞及证据链接；历史记录放 ignored `docs/archive/<feature>/`。日志、截图、隔离数据与构建产物放 ignored `work/<feature>/`，旧材料放 `work/archive/<feature>/`；`current`、`archive` 根只放任务目录，`work` 根另保留 README.md 索引。本机记录不提交，整理时保留原文、失败证据和旧路径到新位置的清单。下文命令均从仓库根目录执行。

一次性脚本、临时 clone、缓存、构建输出、预览 profile 和需留证的 TEMP/TMP 必须在本检出 `work/<feature>/` 下，不能为了缩短路径在盘根创建 `ce-*` 副本，也不能改用户或系统临时目录。正式构建沿用已有 `work/ce-native`、`work/workbench-engine-build/<run>/`；普通自动清理的单测可使用系统 Temp。需要临时环境时只给该子进程传任务内的环境变量；用完清理可重建内容，报告与失败日志按任务留存。历史脚本的旧绝对路径保留为证据，恢复前须重新核对，不能直接重跑。`python tools/scripts/check_architecture.py layout` 同时检查本机文档和 work 根散件；显式 `--files` 只检查给定发布候选。

## 功能目录与新增代码归属

管理后端沿用 Python，Windows 进程观察由 Rust 组件负责；前端保留 HTML/CSS 和普通脚本，本机观察与每日资讯使用 TypeScript 源码及已生成 JS，工具只在开发和验证时使用。普通启动无需 Node/npm，其他模块继续手写 JS。后端按实际职责组织，新增代码优先放入下表对应功能包；不为每个功能预建空的通用分层。

| 后端目录 | 职责 |
|---|---|
| `src/control_everything/http` | HTTP 路由、静态白名单与服务装配 |
| `src/control_everything/sessions` | 会话观察、索引、终端与本机进程证据 |
| `src/control_everything/workspace` | 项目、进度、管理存储与来源观察 |
| `src/control_everything/execution` | 执行准入、执行记录与受控进程 |
| `src/control_everything/profiles` | 用户配置、导入备份与离线恢复 |
| `src/control_everything/integrations` | 外部接入、固定启动器与旧只读 MCP |
| `src/control_everything/installation` | Windows完整产品清单、所属登记与协作维护；不写业务库 |
| `src/control_everything/platform` | Windows Job、安装身份及句柄原语；不依赖上层功能包 |
| `native/observer` | Windows 只读进程观察、受限本机管道及核验后的窗口返回；不写管理库 |

生产 Python 包只放在 `src/control_everything`，不要在根目录建立影子包。`src/control_everything/paths.py` 分别定位检出目录、包内资源和用户数据；源码模式保留旧根数据合同，安装模式不会把程序目录当数据目录。包根的四个 CLI 文件只保留模块入口，内部引用指向功能包中的真实实现，不能依赖入口转发内部符号。

前端按 `web/sessions`、`web/progress`、`web/workspace`、`web/product` 分组；执行界面属于工作台，放在 `web/workspace/execution.js`。产品介绍页属于 `web/product`，通过 `/product`、`/product.css`、`/product.js` 独立提供，只展示产品信息，不读取或写入管理数据。新增页面资源放入所属功能目录，并在 HTTP 静态白名单中显式映射。物理路径与公开 URL 分开维护：搬文件不改变 `/workspace`、`/workspace.js` 等地址，也不改变普通脚本加载顺序。

测试按类型落位：Python 单元/合成接口测试在 `tests/backend`，纯 Node 源码与 DOM 合同在 `tests/frontend`，浏览器及协议 harness 在 `tests/e2e`，共享合成程序在 `tests/fixtures`。Python 发现入口仍是 `tests`；新增后端测试保持可递归发现。新增功能若横跨前后端，各自放入对应功能目录，并补充相应类型测试。

公开配置样例属于 `docs/examples/integrations`，受支持的旧记录格式样例属于 `docs/examples/legacy`；它们不是真实运行数据。新记录写入所选 profile，旧根 JSON/SQLite 的默认位置和显式导入合同保持。远端 reader 的独立依赖在 `tools/remote-reader/requirements.txt`，不要装进本机环境。根 `requirements.txt`、`rust-toolchain.toml` 和 `.cargo/config.toml` 保持现有工具入口。

账号与电脑接入的无秘密部署样例为 `docs/examples/integrations/workbench-identity.*`、`workbench-device-*` 和 `workbench-remote.Caddyfile.example`；精确归属在 `tools/scripts/check_architecture.py` 登记。远程账号页静态文件由中央站点的 `/remote` 提供，不依赖某台已绑定电脑。`http/desktop.py` 仅消费产品清单校验后的资源；`http/remote_context.py` 处理逐设备证明后的页面元数据。浏览器在任何存储读取之前冻结页面 context，显式分区 Storage 与聊天草稿 IndexedDB；远程环境的设备密钥仅保留在页面内存。真实部署、两个账号 HTTP/WS、安装与手机验收须分别留证，单元测试不代表新 EXE 或原生 iOS/Android 已交付。

## 环境和验证

### 内置项目工作台源码与构建

`web/workbench-engine` 保存固定上游的桌面、Web、移动端和运行时源码，保留内部相对目录及许可。来源清单位于 `tools/packaging/workbench-engine-source.json`，精确记录文件、资源与本地适配；新增文件须同时更新清单。它是独立 React/TypeScript/Node 构建单元，其他普通脚本页面仍遵守原目录与编译合同。

项目之外沿用 Studio；项目内部接入完整原工作台和配置。项目添加沿用原生目录浏览、新建和克隆控件，成功后由 `/api/workbench/adopt-repo` 根据当前受管运行时的真实 Repo 幂等登记，不让平台表单替换原流程；列表确认失败只重试登记或读取，不重放创建、克隆。账号与设备统一使用 Studio 全局页面，原生旧移动入口仅保留兼容转入。源码持有与构建不代表运行时、Android APK或自建账号服务已验收。旧独立 iframe 预览保留为历史开发工具，不是最终产品接入方案。普通 Python wheel 当前不包含此源码树、Node或原生产物，HTTP也不递归提供该目录。

项目名称和移除沿用原控件；集成模式的移除保存平台归档，保留事项、文件、终端和草稿，不调用原生清理。名称编辑复用原宿主更新队列，平台保存、原生回显和列表确认逐步完成；部分成功不得伪装成回滚。原生动作与 Studio 项目编辑通过既有保存接口的可选 `expected` 项目快照，在同库事务内核对名称、归档、目录和来源；旧页面冲突返回 `project_changed`，保留输入，不自动覆盖另一窗口。

构建使用显式 Node 24 和 pnpm 12.14.0 原生可执行文件；开发 Node 与随包运行时的 pin 分开核对。root/mobile/cloud 保持各自锁文件，依赖准备禁用未列出的安装脚本。入口不安装全局工具、不启动客户端、不运行个人 Agent：

```powershell
python tools/packaging/workbench_engine.py check-source
python tools/packaging/workbench_engine.py build --node C:/example/node24/node.exe --pnpm C:/example/pnpm/pnpm.exe --scratch-root C:/example/checkout/work/ce-native --run-dir C:/example/checkout/work/workbench-engine-build/local
python tools/packaging/workbench_engine.py check-output --run-dir C:/example/checkout/work/workbench-engine-build/local
```

替换为自己的绝对工具/检出路径。每次使用新的证据目录，Windows native scratch 路径应短；失败保留日志。构建固定执行 packages、移动资源生成、mobile web、原生依赖、Web和Windows运行时。来源SHA、宿主SHA和实际产物hash分别记录；`out/`、`.build/`、依赖缓存与证据不提交。完整桌面安装器、Android签名/推送身份和自建服务另行适配，不能用本机编译成功替代。

字体、供应商图标、完整界面静态导入资源及Windows launcher编译图标仅按清单精确字节和完整notice放行；未知媒体、上游执行规则、私人fixture和任意嵌套docs仍拒绝。文本仍经隐私与Gitleaks扫描，changes模式按被检查commit自己的清单核验。对应用来源/构建规则的修改运行：

```powershell
python -m unittest -v tests.backend.test_workbench_engine_build tests.backend.test_architecture tests.backend.test_repository_checks tests.backend.test_packaging
node --test tests/frontend/test_workbench_engine_provenance.cjs
python tools/scripts/check_architecture.py layout
lint-imports --config tools/architecture/importlinter.ini --no-cache --no-logo
```

### Studio 与内置项目工作台开发预览

产品入口 `/studio` 在内置运行时已装配时使用同文档项目界面。项目外复用 `studio-preview.*` 的已选布局；项目内通过“开发、进展”切换，完整工作台实例保持挂载，开发工作台保留原有会话与终端。进展页固定展示全部未归档项目，旧待验收、待处理和业务进度路由继续兼容。原业务模块在 Shadow DOM 中隔离样式，仍访问同源真实 API，不使用 iframe。`/studio-shell` 只提供固定的 Studio 模板，脚本与样式由入口明确列出；未装配运行时的服务继续提供独立 Studio。

项目路径使用 `#project/<id>/workspace` 等片段，旧直接项目 URL 和旧事项入口保持兼容。原工作区侧栏切换已登记目录时同步项目身份；未关联开发目录仍可查看事项总览，会话等项目范围能力不能沿用旧项目。离开前先处理已打开的编辑窗口，草稿不因页面切换丢失。`orca-surface.js/css` 仅保留旧预览历史。

集成服务的旧 `/workspace` 入口回到 `/studio`，保留项目片段；未装配运行时的服务维持原入口。零项目总览的“进入工作台”打开 `#workbench`，以受保护的 runtime-only bootstrap 加载完整原生空工作台；旧 `#workspace`、`#project-setup` 映射到同一入口。内层 `add-repo`、侧栏及筛选菜单沿用原生添加、浏览宿主、新建 Git 项目和克隆流程，取消保留当前工作台。原生操作成功后由 `/api/workbench/adopt-repo` 按受管运行时中的真实 Repo 幂等登记，确认平台列表后继续原生流程；未确认时不重放创建或克隆。新建 Git 项目沿原生规则初始化和首次提交，需要该运行环境具备提交身份；添加已有 Git 目录按原生仓库根解析。普通目录沿用原添加目录流程。项目行加号只创建该项目下的工作区；来源许可与外部 Agent 配置保留在高级管理入口。

项目总览保留平台改名和归档表单，原生项目名称在 bootstrap 时同步；内层恢复原名称编辑、移除按钮和原确认控件。集成模式的移除保存平台归档，保留文件、事项、终端与草稿，不调用原生 repo.rm；恢复后重新显示。原生“项目设置”保留图标、Hooks、Git、MCP 等配置。顶部显示当前项目名称，切换项目使用原生侧栏。内层工作区创建绑定当前已登记项目及宿主，不能被旧筛选或旧创建草稿切到另一项目。PlatformProjectContext 的 undefined 表示独立工作台，null 表示平台尚无已验证项目，活动页在后者显示空范围而非全局数据。

项目内“进展”使用 `web/workspace/project-progress.js`、`project-progress-model.js` 与作用域样式 `project-progress.css`，只读展示目标、当前来源、实际交付与历史记录。普通入口固定展示全部未归档项目的待推进、进行中、待验收三栏，已完成事项保留在独立历史中；卡片用普通字号的语义色标签标明项目归属。没有范围选择、搜索、视角筛选、新建、事项管理或会话入口，刷新只显示图标并保留无障碍名称。详情不提供编辑、执行、反馈发送和验收写操作，查看记录不改变开发上下文。旧待验收、待处理链接保持精准范围，旧事项深链继续选中同一 ID；恢复普通入口时不接受旧导航快照中的范围、筛选或搜索条件。API、稳定 task ID 与兼容管理页沿用旧合同。

原生开发由后端持久启动意图、宿主唯一绑定与有界观察形成进展。原生输入通过受限 owner 方法和持久回执处理，浏览器不直接发送终端输入，也不以临时 tab/PTY 作为永久会话身份。后台只读观察已有目标和发送回执；刷新、查询与服务重启不会自动创建会话或重发消息。没有可信绑定或交付材料时显示来源缺口，Agent 正常结束只产生未独立验证的候选成果，不能自动确认完成。缺少结构化请求身份的提问或权限操作返回原会话处理。

原生交付与反馈 API 继续保留当前 delivery ID、版本和发送回执等原有合同，旧人工验收仍要求结论、理由和确认；本次只移除进展展示页的写操作。保存、输入已接受、观察到继续执行与完成仍是不同事实，历史回执按实际状态显示，送达未知不能自动重发。项目外工作台样式和开发区保持原职责；本模块继承宿主主题，真实 Shadow DOM、黑白主题与窄屏交互须另行验证。


先初始化独立测试 profile，注册合成 Git 项目，完成源码单元构建与运行隔离验证后，用开发入口启动。`--workspace-root` 只填写本次允许测试的目录，可重复传入；各路径必须使用本机实际绝对路径：

```powershell
python tools/scripts/preview_workbench.py --data-dir C:/example/checkout/work/preview/profile --build-run C:/example/checkout/work/workbench-engine-build/local --git C:/example/git/git.exe --workspace-root C:/example/checkout/work/preview/repo --port 8769
```

入口先绑定平台端口，再显式准备自有运行时，获得确切 WebSocket 地址后才提供页面。打开 `http://127.0.0.1:8769/studio`；GET 页面不会隐式启动进程，浏览器不持有owner凭据。退出时只回收本次管理的进程，失败保留证据。此入口用于合成数据开发验收，未代表个人项目、模型付费调用、Android或自建账号现场已通过。

`preview_studio.py` 仅供静态资源检查，不提供业务 API，页面会明确显示数据加载失败，不能将其作为融合验收。定向验证：

```powershell
node --test tests/frontend/test_orca_surface.cjs
python -m unittest tests.backend.test_studio_preview_server -v
```

### 独立游戏创作预览

游戏创作保留为独立源码检出预览，需显式启动后访问其实际本机地址。Studio 顶层导航、窄屏顶栏和设置页不再提供游戏入口或地址配置；下述独立预览命令及项目库边界继续适用。

此功能是源码检出预览。显式配置 Godot 引擎和已存在的本机项目库目录：

```powershell
python -m control_everything.http.creator --engine <ENGINE_EXE> --library <LIBRARY_DIR> --port 8770
```

库位于仓库内时，只允许根 `work/` 下的独立目录；也可选仓库外目录，但不能包含本仓库、引擎或安装资源。项目库以 UUID 分隔各工程的 `project/` 源码、`project.json` 元数据、`brief.md` 创作说明与 `runs/` 运行记录。不要将这些实际数据提交到源码库。

首次打开是真实空库。用户可创建独立 2D/3D 空白工程，或打开库内已有项目；首片不导入任意外部目录，也不预填具体游戏。同名项目仍有不同 UUID 和 `user://` 目录键，页面展示实际源码位置及该键；它不是对用户修改后游戏脚本的沙箱承诺。

项目页提供场景/脚本资源概览、创作说明保存、上下文复制，以及“在 Godot 中编辑”“独立试玩”“检查工程”。场景树、材质、参数和实际可视化编辑由独立 Godot 窗口承担。创建页面不是浏览器游戏编辑器；未保存说明在当前页面按项目保留，关闭或刷新页面前须点击“保存说明”。资源列表有界扫描，截断会明确显示。

Agent 源码接入由项目工作区持续建设。可选 `--agent-client-url <WORKSPACE_URL>` 指向已配置的平台工作区普通 HTTP(S) 页面；默认空地址时显示“项目工作区接入待配置”，不显示可点入口，不要求安装外部官方客户端。当前只准备或复制上下文，没有自动发送、会话绑定或已连接承诺。复制失败会展开可手动选择的文本；内容包含实际工程路径、说明、所选资源和固定资源导入检查方法，不包含临时 CSRF 令牌。

资源导入检查使用固定的 `--headless --editor --import` 入口；只有退出码和有界日志判据同时满足才显示本次检查通过。它不代表所有未引用脚本、玩法、画质、性能或存档通过，源码改动后必须重新检查。每条操作记录保留项目 ID 和运行 ID，不把其他项目的结果当作当前工程状态。

同一项目同时只允许一个本服务原生操作，全服务每类动作最多一个；工程编辑期间可在原生编辑器中试玩。忙碌准入仅覆盖本服务实际拥有的进程，不能证明外部启动或服务重启遗留窗口不存在。保存与关闭由原生窗口负责，网页不提供强停或通用保存退出协议。关闭页面不会停止原生窗口；停服务前自行保存并关闭，服务也不接管旧 PID。

页面只由独立 loopback 服务提供，与 Studio 共享样式，不修改生产网关或加入生产资源包。定向纯 Node 检查：

```powershell
node --test tests/frontend/test_creator_ui.cjs tests/frontend/test_orca_surface.cjs
node --check web/workspace/creator.js
```

真实项目创建/重启、引擎窗口、好坏导入检查、页面宽窄屏/明暗/键盘及项目工作区返回由验收负责人另行运行并记录命令、退出码和失败；Node 合同不能代替这些证据。

### 模块边界与新增代码

新增代码先找所属功能包。`http` 负责权限、请求处理与装配；`profiles` 负责用户配置与恢复编排；`sessions` 负责会话和观察；`workspace` 负责管理业务及同库事务；`execution` 保留受控执行生命周期；`integrations` 负责外部适配。共享 Windows Job 原语放 `platform/windows_jobs.py`，共享输入错误与路径判据放 `input_validation.py`，不设没有消费者的通用目录。

| 来源 | 允许的项目内部依赖 |
|---|---|
| sessions | 基础模块 |
| workspace | sessions、基础模块 |
| integrations | workspace、sessions、基础模块 |
| execution | workspace、sessions、基础模块 |
| profiles | workspace、sessions、integrations、基础模块 |
| installation | sessions 的窄身份/管道协议、基础模块；不依赖业务、配置或 HTTP |
| http | 上述功能的装配与公开接口 |

同域内 `workspace.validation` 不依赖 store/service，store 不依赖 service。项目和事项的关联判断继续使用原写连接和事务，不拆库或在检查后另开连接写入。包内 CLI 与兼容重导出保留功能边界，新内部代码引用真实实现，不通过动态导入绕过边界。

安装模块只有 HTTP 装配层可以调用；sessions、workspace、profiles、execution、integrations 和基础模块不得反向依赖它。`installation.manifest` 只用标准库，构建器与运行时共用；registry 不依赖 maintenance。完整产品在绑定成功后核基础闭包、持安装互斥登记 HTTP 与 profile、启动观察后释放，退出只清自己的 HTTP 活动记录。源码检出及普通 wheel 不登记这套安装；原生缺失或 pin 不匹配仍可管理并显示受限，基础闭包损坏会阻止启动。

安装记录只提供所属线索，维护重新核 OS 创建时间、SID/session、规范映像与 fileID，再用实际旧原 EXE 正常 status/stop；HTTP 或未知安装进程仍运行时阻塞。Inno 自有 EXE/DAT/MSG 交其卸载日志处理，项目不夺锁；卸载仅清精确自有管理文件，业务数据与未知资料保留。临时 bootstrap 和直接 OS 父链用于防错归属与并发，不宣称认证安装脚本、证明父锁所有者或抵御同 SID 主动伪造整个未签名产品。安装现场与全新 Windows 兼容结论须单独留实际证据。

额度 DOM 展示在 `web/workspace/quota.js`，观察动作处理在 `http/observation_routes.py`；主脚本、网关只委派相应职责。前端仍使用普通 Window 模块，依赖注入、DOM 合同、脚本顺序及独立代码审查共同约束；Python 导入检查不覆盖 JavaScript 或 SQL 的业务含义。

沙箱准备请求由 `http/sandbox_routes.py` 处理，权限原语归 `platform/windows_acl.py`，准备状态和恢复证据归 `execution/sandbox_preparations.py`。准备确认绑定目录 ID、对象身份、当前权限摘要和代次；执行、准备与恢复共用跨进程目录租约，目录租约先于配置状态锁。仅为项目根补充当前用户所缺的准备权限，不向子项传播用户授权；恢复仅在对象及当前权限与记录完全匹配时恢复该根 DACL，不撤销 DSH 后续持久沙箱标签。缓存和恢复证据留在本机 profile，不进入提交。

开发环境先按下文安装 editable 包，再显式安装固定工具，从根执行：

```powershell
python -m pip --isolated install -r tools/architecture/requirements.txt
python tools/scripts/check_architecture.py layout
lint-imports --config tools/architecture/importlinter.ini --no-cache --no-logo
python tests/e2e/verify_architecture.py --output work/architecture-check-unique
```

最后一个命令要求新的证据目录，只复制 Git 候选中的 Python 源码，分别证明合法依赖可用、顶层/函数内/子模块/间接反向依赖会被拒绝。它不修改源树，不访问个人数据。工具不会自动安装或回退全局版本；Import Linter 固定 2.15，仅用于开发。规则采用官方 [forbidden 合同](https://import-linter.readthedocs.io/en/stable/contract_types/forbidden/)的后代及间接依赖检查，不靠宽泛 ignore 放过旧耦合。

文件归属检查只读候选路径；新增功能包、前端分组或构建单元须同时更新归属表与规则。秘密/媒体检查、业务测试和独立审查各有职责，不能用其中一项替代其余检查。

使用 Windows、Python 3.12 和 Node.js 24。Python 全套测试包含 Windows 原生接口；观察类型/构建合同另需下节固定项目编译器，没有根目录 npm 包或运行时 Node 桥接。以下创建命令仅适用于没有 `.venv` 的新检出；已有环境先确认归属和版本，不覆盖他人的环境，必要时选择独立工作树。再从仓库根目录执行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e .
.\.venv\Scripts\python.exe -m pip install -r tools/packaging/requirements.txt
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

基础测试使用合成配置、临时文件和 mock，不需要作者服务器或个人工具。首次完整测试涉及固定 Gitleaks 检查时，先按下文安装已核验工具；不能把缺工具跳过称为完整检查通过。本机 requirements 固定 MCP 1.30.0，远端新 reader 环境另用 tools/remote-reader/requirements.txt，不能把两套环境混为一次升级。

### Python 分发构建

发行闭包的依赖归属与许可校验归 `tools/packaging/workbench_distribution.py`；Windows payload 组装归 `tools/packaging/desktop_payload.py`，稳定启动与维护入口归 `installation/maintenance.py`。engine 的 `config/scripts/distribution-record.mjs` 收集实际构建输入、外部文件与输出关系，由现有 runtime、mobile、SDK、Vite 构建脚本调用；新增脚本也须通过来源清单的精确成员校验，不扩大 HTTP 文件服务根。`tests/backend/test_workbench_distribution.py`、`test_desktop_payload.py` 覆盖 Python 合同；`tests/frontend/test_distribution_record.cjs` 与 `test_distribution_cross_tool.cjs` 验证 JavaScript producer 及跨工具输入。`tests/e2e/remote_device_acceptance.py` 是显式目标的现场验收入口，其合成测试归 `tests/backend/test_remote_device_acceptance.py`；源码单测不能替代公网与物理设备验收。

Windows 构建同时生成运行 payload 和同级 `session-panel-<version>-sources.zip`。对应源码归档不安装到用户目录；安装包中的 `SOURCE-AVAILABILITY.json` 记录准确文件名、大小、SHA256和源码成员索引。发布时必须将源码附件与安装器、校验和在同一版本中一并提供等效下载，不得只发布 exe。Git/SSH/终端文件及逐组件许可仍完整保留；缺失或篡改对应材料会阻断构建。原始模块图、包元数据和许可证据保留在 ignored build run，安装包只交付按摘要去重的完整许可文本与组件对应表，不能以精简交付记录替代构建期的闭包验证。每轮输出使用新目录，已有源码附件拒绝覆盖。

`pyproject.toml` 是产品版本的唯一来源，运行依赖只从根 `requirements.txt` 读取。`tools/packaging` 负责分发构建，不放业务逻辑；其工具依赖单独固定，不加入运行 requirements。完整开发测试中的构建合同也需要这些固定工具：

```powershell
.\.venv\Scripts\python.exe -m pip install -r tools/packaging/requirements.txt
.\.venv\Scripts\python.exe -m build --outdir work/python-package/dist
```

默认先生成 sdist，再从 sdist 构建 wheel。`BuildPy` 只复制 HTTP 白名单中的 HTML/CSS/交付 JS；`web` 保持唯一手写源，editable 不往 src 复制一份资源。新增静态资源须同时更新 HTTP 白名单、`tools/packaging/build_assets.py`、`MANIFEST.in` 和合同测试。wheel 不包含开发工具、测试、原生 EXE 或个人数据。包内 `source.py`、`remote_probe.py` 和 news worker 的真实 `.py` 是运行所需文件，不能只发字节码。标准 wheel 缺少原生后台时明确降级；完整 Windows 产品另有固定运行闭包。

隔离构建、离开源树安装、四个 CLI 的各自合同及实际 HTTP 资源验收由负责人留证；根目录可 import 不能替代这些验证。不要设置根 PYTHONPATH 掩盖漏安装。`build/`、`dist/` 和 egg-info 都是 ignored 产物，不提交 EXE 或安装包。

### 观察前端 TypeScript 开发

观察输入仅 `web/workspace/observation.ts` 与 `observation.types.d.ts`，manifest固定唯一输出 `observation.js`。资讯另用 `news.ts/news.types.d.ts`、`tools/typescript/news.manifest.json`，固定唯一输出 `web/workspace/news.js`。两配置为 `tools/typescript/tsconfig.observation.json` 和 `tools/typescript/tsconfig.news.json`，其中路径相对配置所在目录解析。两入口在 `tools/scripts/frontend_compile.cjs` 复用同一小型编译流程，每个目标分别核完整输入/输出与窗口出口，不接任意路径或动态manifest参数。两配置开严格检查、禁止 map/inline源码及声明输出，保持普通 IIFE/Window API；不引入 React/Vite/模块加载器。任务中心等现有 JS 保留独立归属。

固定官方 `typescript@5.9.3`，真实 package-lock.json 一起提交。已有正确项目工具不重复准备；缺失时 build/check 明确非零，不联网、不找全局 tsc。首次或干净复现的准备是单独显式动作，仅作用于自己检出的 `tools/typescript/node_modules`；`npm ci` 会清该工具包依赖目录，先确认归属。下面在专用 PowerShell 会话从仓库根执行，两个通用示例路径须替换为已安装的 Node24 和 npm CLI，不能让宿主 npm.cmd 偷换 Node：

```powershell
$tsNode = 'C:/example/node24/node.exe'
$tsNpmCli = 'C:/example/npm/bin/npm-cli.js'
Get-ChildItem Env:NPM_CONFIG_* | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" }
Remove-Item -LiteralPath Env:NODE_OPTIONS, Env:NODE_PATH -ErrorAction SilentlyContinue
$tsPreparation = Join-Path (Get-Location) 'work/frontend-observation/npm-ci'
New-Item -ItemType Directory -Path $tsPreparation -Force | Out-Null
$env:NPM_CONFIG_CACHE = Join-Path $tsPreparation 'cache'
$env:NPM_CONFIG_USERCONFIG = Join-Path $tsPreparation 'user.npmrc'
$env:NPM_CONFIG_GLOBALCONFIG = Join-Path $tsPreparation 'global.npmrc'
[System.IO.File]::WriteAllText($env:NPM_CONFIG_USERCONFIG, '')
[System.IO.File]::WriteAllText($env:NPM_CONFIG_GLOBALCONFIG, '')
& $tsNode --version
& $tsNode $tsNpmCli --version
# Confirm Node v24 before the explicit dependency preparation.
& $tsNode $tsNpmCli ci --prefix tools/typescript --include=dev --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/
if ($LASTEXITCODE -ne 0) { throw 'Fixed TypeScript preparation failed' }
```

日常复用已准备工具，从根目录执行；`node`须是上面核过的Node24（可用 `& $tsNode` 替换）：

```powershell
node tools/scripts/build_observation.cjs typecheck
node tools/scripts/build_observation.cjs build
node tools/scripts/build_observation.cjs check
node tools/scripts/build_news.cjs typecheck
node tools/scripts/build_news.cjs build
node tools/scripts/build_news.cjs check
node --test tests/frontend/test_execution_ui.cjs tests/frontend/test_progress_ui.cjs tests/frontend/test_workspace_history_ui.cjs tests/frontend/test_observation_ui.cjs tests/frontend/test_task_center_ui.cjs tests/frontend/test_observation_build.cjs tests/frontend/test_news_ui.cjs tests/frontend/test_news_build.cjs tests/frontend/test_quota_ui.cjs
```

修改 TS 后先 build 并提交生成 JS；验证已有交付物时直接 check，不能先 build 洗掉手改字节。编译/emit/校验失败不会覆盖旧 JS；旧 JS 存在也不代表编译成功。check用fresh临时输出比较完整集合/字节，不修产物。源码、类型、配置、package/lock、manifest、builder及生成JS都须进入显式发布候选；缓存、node_modules、日志留ignored work，不能以子集扫描称整包通过。

仅维护者在新建工具包或经审版本更新时重新生成锁：沿用上述隔离配置，`Push-Location tools/typescript` 后执行 `& $tsNode $tsNpmCli install --package-lock-only --include=dev --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/`，检查退出码并在 `finally` 中 `Pop-Location`，随后核 package/lock diff。实际 npm10.9.8 的首次 install --prefix 曾出现路径错误及 file: 自依赖；已验证成功的首次锁生成形式是该专属cwd、**不传prefix**。不要把首次install与消费已有锁的 `npm ci --prefix` 混为一条已验命令；CI保留后一条命令，远端运行仍须另留证。

采用[TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)的完整Program诊断与受控emit，及[npm ci](https://docs.npmjs.com/cli/v10/commands/npm-ci)的锁一致性/不改锁语义；不使用仅转译、全局工具或隐式安装。CI只准备同一个工具包、先观察check及资讯typecheck/check、再运行上述全部Node合同，缺工具或字节漂移即失败，不先build洗脏输出；普通用户启动Python仍只读取已交付JS。已有固定工具不因新增资讯再安装，原锁和版本不变。

资讯 Node 合同使用合成DOM/时钟/来源投影，不能替代真实worker/HTTP/Edge验收。验收负责人可对自己已运行的合成profile执行 `node tests/e2e/verify_daily_news.cjs --base-url http://127.0.0.1:14401 --owned-fixture --output <本次绝对ignored证据目录>`；可选 `--legacy-base-url` 指向另一个自有legacy实例，`--synthetic-news` 只替新闻路由，以受控时间验证分组/摘要/过期与草稿。harness不建服务、不修改真实数据库；默认真实HTTP读取与合成新闻模式分别记证据，不把后者当真实公共源可用。真实待办写后隔离、失败采集清理与宽窄屏截图仍由验收负责人分别留证。

### Windows 原生观察开发

原生部分使用固定 Rust 1.97.1 x64 MSVC、rustfmt/clippy 和 Visual Studio C++ Build Tools。先在 VS Native Tools 环境进入项目。工具链首次准备是单独明确步骤，全部留在本检出 ignored `work/native-observer`，不修改宿主默认工具链或全局 PATH：

```powershell
$env:RUSTUP_HOME = Join-Path (Get-Location) 'work/native-observer/rustup-home'
$env:CARGO_HOME = Join-Path (Get-Location) 'work/native-observer/cargo-home'
$env:CARGO_TARGET_DIR = Join-Path (Get-Location) 'work/native-observer/target'
rustup set auto-self-update disable
rustup toolchain install 1.97.1-x86_64-pc-windows-msvc --profile minimal --component rustfmt --component clippy --no-self-update
```

已经准备好的检出不重复安装。普通构建入口只检查七个实际工具文件，缺失明确失败，不自动下载工具链、不回落宿主。各子进程继承固定项目 RUSTUP_HOME/CARGO_HOME/TARGET_DIR 与 RUSTUP_AUTO_INSTALL=0；项目 crate 可按 Cargo.lock 下载到项目缓存。不要手动用未隔离的 rustup/cargo 代替以下入口：

```powershell
.\.venv\Scripts\python.exe -B -X utf8 tools/scripts/build_observer.py fmt
.\.venv\Scripts\python.exe -B -X utf8 tools/scripts/build_observer.py test
.\.venv\Scripts\python.exe -B -X utf8 tools/scripts/build_observer.py clippy
.\.venv\Scripts\python.exe -B -X utf8 tools/scripts/build_observer.py build
node --test tests/frontend/test_observation_ui.cjs
```

应用 Cargo.lock 提交源码，EXE/PDB、安装 manifest、工具链和日志均不提交。产物固定在 `work/native-observer/install`；正在使用的后台应先通过其已核验 CLI 正常停止，再替换产物。HTTP 不搜索 PATH 中同名后台，不在请求中编译。`native/observer/protocol.json`记录跨语言字段与身份测试向量，`src/protocol.rs`为严格请求解析；修改协议必须同步 Python 消费与合同测试。消息协议为v2，profile身份哈希和管道命名空间仍为v1，避免同一profile并行两套采样者。升级须先用旧固定产物正常停止自有daemon再替换，身份/协议不匹配时明确失败。登记配置v3由Python唯一管理，原生只接收有界快照；原生schema变更由单一负责人维护后交Python消费。Rust 单元测试仅用纯输入和当前测试进程，不启动现场 Agent；真实管道/后台生命周期、可见窗口及浏览器验收另由验收负责人执行并留证。

从干净检出验收正常开发时，在上述安装和测试之后，用独立目录验证初始化与示例校验：

```powershell
$checkData = Join-Path (Get-Location) 'work/new-member-profile'
.\.venv\Scripts\python.exe -m control_everything.profile init --data-dir $checkData
.\.venv\Scripts\python.exe -m control_everything.profile validate-settings --file (Resolve-Path docs/examples/integrations/integration-settings.example.json).Path
.\.venv\Scripts\python.exe -m control_everything.profile import-settings --file (Resolve-Path docs/examples/integrations/integration-settings.example.json).Path --data-dir $checkData
.\.venv\Scripts\python.exe -m control_everything.profile status --data-dir $checkData
.\.venv\Scripts\python.exe -m control_everything.gateway --data-dir $checkData --port 14401
```

页面验收负责人打开本机 14401/workspace，登记自己创建的测试项目目录，确认任务/人工记录可保存、四项高级接入显示未配置；需要 Codex 时只登记自己的库或独立合成库。停止该实例再启动同目录，确认数据保留。启动服务和浏览器人工验收分别留证，不以单元测试替代。

浏览器 harness 另需已安装 Microsoft Edge，使用 Playwright Library。仅将 npm 依赖装入 ignored work/browser，根目录不增加 npm 构建层：

```powershell
npm install --prefix work/browser playwright
$env:NODE_PATH = (Resolve-Path work/browser/node_modules).Path
node -e "console.log(require.resolve('playwright'))"
node tests/e2e/verify_control_everything.cjs --fixture
node tests/e2e/verify_execution.cjs --fixture
node tests/e2e/verify_workspace.cjs --fixture
```

三个脚本均使用普通 require('playwright') 和 Edge 的 msedge channel，合成模式不会访问私人会话或真实执行 API。verify_profile.cjs 的 protocol/http 两种模式另需独立合成数据与临时 loopback 服务，由验收负责人按其参数配置。上述测试和 CI 不证明私人环境可用；失败、警告、跳过和缺环境都应保留。

采用 [Playwright Library](https://playwright.dev/docs/library) 的已有脚本入口；不为这次迁移另建测试框架。npm 的 [prefix 安装](https://docs.npmjs.com/cli/v11/commands/npm-install/) 将依赖留在工作目录，Node 的 [NODE_PATH 查找](https://nodejs.org/api/modules.html#loading-from-the-global-folders) 仅在当前验证进程环境中设置。

清理时先列明本轮新建的临时目录和进程；仅移除已确认归属的一次性产物，保留验证日志、迁移备份和用户数据。不得递归清空整个 work/、docs/ 或 videos/，也不得清理其他任务内容。

## 协作和交接

### 管理库schema2与离线迁移验证

管理schema、profile配置和backup manifest分别版本化；schema1只能显式通过 `python -m control_everything.profile migrate-tasks --data-dir <绝对目录>` 升级。新库直接schema2；restore兼容manifest1/schema1与manifest2/schema2，旧结构恢复发布后仍须显式迁移。不得在HTTP启动、Profile.open或配置保存中隐式升级，不删除未知表或执行账本以适配schema。

任务存储的唯一写表为task_items，tasks/todos仅为保留原ID的只读视图。所有管理连接严格核schema后注册无副作用writer版本函数，固定DML guards拒旧连接误写；这是版本兼容机制，不是对恶意DB编辑的安全认证。项目写入及事项写入要在同一事务失效列表revision，不能只修改项目归档状态而接受旧分页。

迁移的SQLite一致备份在写事务外取得，EXCLUSIVE内重核源事实后逐条DDL/复制/校验/更新版本并提交，不能用executescript隐式提交。失败回滚并保留备份；回退旧程序前先 `preserve-tasks` 保全最新schema2，再恢复旧备份到新目录，不覆盖新库。备份包含私密路径和管理数据，不提交。

实现者仅运行经代码核过的无listener合成合同；真实旧连接/多进程停写、CLI迁移恢复回退、HTTP/Edge以及全量discover由验收负责人承接并保存全部退出码、失败和清理收据。纯单测入口为 `tests.backend.test_task_store` 与 `tests.backend.test_task_migration`；它们只操作TemporaryDirectory，不是用户迁移验收。

1. 在本机任务记录中写明目标、范围和实际验证结果；开始和结束均核对 `git status`、diff，注明未验证项。
2. 当前快速开发不强制 PR、独立审查或等待远端 CI；界面变更先在 develop 提供真实预览，项目主导者确认后才合入并推送 main。需要并行隔离时再使用分支或 worktree；共用工作树先协调文件归属。
3. 执行与改动相称的本地验证；每次迭代独立提交，信息说明原因。代码、数据迁移和发布仍需各自实际验证，不能把未运行的检查称为通过。
4. 按任务授权提交和推送。使用显式文件清单暂存并检查 staged diff，推送前检查上游和完整 outgoing commit 区间。不要将别人的未提交改动混入自己的提交。

提交和推送遵循当前任务授权。产品宣传只使用项目主导者选定的成片，通过 GitHub 视频附件供首页播放；不将媒体制作资料加入源码提交，也不删除本机媒体草稿。项目源码与文档采用 [MIT 许可证](../LICENSE)，再分发时保留版权和许可声明；第三方依赖仍遵循各自的许可证。

## 内容和秘密检查

安装固定的官方 Gitleaks 8.30.1 Windows x64（下载资产 SHA-256 核验后才解压，不修改 PATH）：

```powershell
pwsh -File tools/scripts/install_gitleaks.ps1 -Destination work/tools/gitleaks-8.30.1
python tools/scripts/check_repository.py changes --base <base-commit> --head <head-commit> --report work/checks/changes.json
```

安装命令只运行一次，安装器拒绝覆盖已有目录。后续复用已校验工具；若选其他 ignored 工具目录，检查命令加 `--gitleaks <该目录/gitleaks.exe>`。升级须重新核实官方版本和资产校验值。

`changes` 检查 base..head 全部新增提交中逐提交新增行，个人路径或秘密先加入再删除也会阻断。普通提交对比父树；合并提交检查相对各父均新增的隐私命中，避免把同步 base 已有值当作新引入，侧支新值仍由其引入提交检查。Gitleaks 扫描同一完整区间，并显式使用 `--diff-merges=first-parent`，覆盖仅在合并解决冲突时加入的秘密。报告记录 base、head、merge_base 及每项隐私命中的 commit，兼容 PR 分支创建后 main 又前进的情况。未修改的旧个人值不阻断普通 PR；改名保持的旧内容不算新增。base/head 必须是真实提交；首次导入的全零 before、缺失 ref、无共同历史或空提交区间会失败，维护者须明确首次导入范围并运行完整候选检查，不能静默跳过。

`docs/` 只发布经过核对的架构、使用和开发文档及通用示例。新增公开文档时，同步更新 `.gitignore` 的放行清单、`check_architecture.py` 的归属清单及 `check_repository.py` 的 `PUBLIC_DOCS`；公开文档仍须执行隐私与密钥扫描。`docs/current/`、其他未放行文档和 `videos/` 制作资料只留本地，不能以项目文档名义提交开发过程记录。.gitignore 不会自动取消旧文件跟踪，发布负责人须核对最终跟踪清单且保留本机原件。`videos/` 下已有 `.md`、`.json`、`.mjs` 文本仅在 `changes` 模式的原路径修改中进入完整扫描，仍受嵌套目录、私人文件、二进制和隐私/秘密检查约束，新增、改名或复制到该目录的内容及媒体仍禁入。

未提交文件用严格的 `release` 模式，不虚构 changes 提交范围。手写一个 ignored JSON 清单，`files` 列出本次准备发布的全部相对文件路径，`excluded` 明确记录未纳入的路径（可为空）：

```json
{"files": ["AGENTS.md", ".github/CONTRIBUTING.md"], "excluded": []}
```

```powershell
python tools/scripts/check_repository.py release --manifest work/checks/candidates.json --report work/checks/release.json
```

该例只是两文件候选，不是完整产品。全树候选可由 `git ls-files -z` 的路径清单生成，再明确加入待发布的未跟踪文件；先筛选禁入路径，绝不宽扫 ignored 目录。报告须列出 included/excluded/blocked；有 excluded 时结果只能说明子集。发布前必须确认模块、资源和文档闭包完整并单独检查历史边界。

检查器拒绝禁入文件、媒体、二进制、空候选、越界或链接路径；Windows 路径组件尾点/空格会被拒绝，规范长路径还会再次检查禁入规则，8.3 短名不能绕过。它不会读取禁入文件内容，仅对候选复制出的文本运行 Gitleaks，不扫描工作区私人数据。隐私规则覆盖绝对 Windows 用户/工程路径、Unix 个人 home 和普通/转义外部 IPv4，允许 loopback、文档保留地址和明确占位。该有限检查加 Gitleaks 不能证明不存在所有敏感信息。报告仅含规则、相对位置和哈希，写入 ignored `work/`；不要将原始扫描日志或报告作为公开 artifact。工具缺失、版本不匹配、读取错误或扫描失败都使检查失败。

发现真实秘密先由持有人撤销或轮换，公开记录只留类别和位置。当前树清理、当前候选、待推送提交及既有历史是四种范围；改当前文件不等于清理历史。历史改写、强推和删除分支仍须明确授权。

## 可选 CI 与发布

当前快速开发阶段，`repository-checks` 只保留手动 `workflow_dispatch`，提交和推送不会自动触发，也不是 main 的合入门槛。需要完整检查时由维护者主动运行；本地未执行的全量检查不能记为通过。

手动检查保留 `windows-tests`、`architecture-boundaries`、`new-content-checks` 和 `release-readiness`。新增内容检查比较所选提交与其第一父提交，完整候选检查覆盖当前跟踪树；两者不能互相替代。权限仍为 `contents: read`，不上传扫描报告。

main 的远端规则仅保留防强推与防删分支，不要求 PR 或必需 CI。调整远端规则后必须读取实际生效结果；以后恢复多人协作门槛须由项目主导者另行决定，不能从旧说明自动重建。

安装器发布仍是单独的手动操作，实际产品构建与验收要求见[Windows 安装与维护](../docs/guides/windows.md)。日常快速提交不代表已发布安装器，也不替代发布验收。

## 源码与测试目录

后端生产源码在 `src/control_everything`，业务按 `http`、`sessions`、`workspace`、`execution`、`profiles`、`integrations` 组织，安装维护归 `installation`，Win32 适配归 `platform`。前端使用原生 HTML/CSS 和普通脚本，唯一资源源码放在 `web/sessions`、`web/progress`、`web/workspace`、`web/product`，构建 wheel 时按 HTTP 白名单收进包内；普通启动直接消费已交付 JS，无需 Node、npm 或现场编译。原有页面和资源 URL 保持不变，例如 `/workspace.js` 对应物理文件 `web/workspace/workspace.js`；独立产品介绍页 `/product` 对应 `web/product/index.html`。

本机观察与每日资讯分别以 `web/workspace/observation.ts`、`news.ts` 和邻近类型声明为手写源码，两个 JS 为同一固定 TypeScript 5.9.3 的生成物；其他模块继续手写 JS。修改对应 TS 后运行 `node tools/scripts/build_observation.cjs build` 或 `node tools/scripts/build_news.cjs build`，连同生成 JS 提交，再用对应 `check` 比较完整字节；不要手改生成物。Node24/项目内固定工具的显式准备、缺工具失败与全部验证命令见[观察前端 TypeScript 开发](CONTRIBUTING.md#观察前端-typescript-开发)。原 URL 和普通脚本相对顺序保留，新 `/news.js` 在页面主脚本前加载，不增加常驻 Node 服务。

测试按 `tests/backend`（Python）、`tests/frontend`（纯 Node 合同）、`tests/e2e`（浏览器/协议 harness）和 `tests/fixtures`（合成替身）归类。新增功能放入所属功能目录，测试按类型放置；详细职责与验证命令见 [参与开发](CONTRIBUTING.md)。源码 CLI 统一为 `python -m control_everything.gateway` 等新包名命令，内部代码直接导入功能包实现。

公开接入样例放在 `docs/examples/integrations`，旧格式导入样例放在 `docs/examples/legacy`；TypeScript、架构检查和远端 reader 的开发配置分别放在 `tools` 的对应目录。根目录保留项目入口说明、共同依赖及工具自动发现需要的配置；`src/control_everything` 是后端 Python 包名，功能继续按所属子包开发，产品显示名称不改变导入和 CLI 合同。实际 profile、数据库和日志不属于源码树，不随目录整理搬迁。

多人开发同时检查文件归属与 Python 依赖方向；新增构建单元须连同规则和指南审查。HTTP 网关和页面主脚本负责装配，完整业务处理及展示放入所属模块。检查命令、允许依赖和合并要求见[参与开发](CONTRIBUTING.md#模块边界与新增代码)。

| 组成 | 使用边界 |
|---|---|
| Python 管理后端与前端资源 | 基础管理必需，负责项目、事项、进度与管理数据 |
| Rust 原生观察后台 | Windows 标准安装必带；源码/wheel 缺少原生程序或运行故障时明确显示受限，基础管理仍可用 |
| Codex 元数据库、项目文档来源 | 用户按需登记；不配置也可人工管理，不自动读取私人来源 |
| SSH/远端 reader、终端、工作台、个人启动器 | 按需接入；终端依赖远端，工作台依赖终端，启动器可独立启用 |
| 公开资讯与官方额度 | 资讯按源容忍超时；额度仅显式查询，未配置账号不影响管理 |
| 固定 Node 运行时与内置工作台 | 标准桌面包内置，由平台构建和管理，不要求另装官方客户端 |
| TypeScript、Rust 编译器、浏览器测试工具 | 开发或验证工具，普通用户无需安装 |

项目开发复用内置工作台的宿主 Agent 探测和选择，启动取决于宿主已安装并配置的能力。平台持久记录任务与会话绑定，实际交付仍需人工验收；外部程序注册为可选接入。`web/workbench-engine` 是标准桌面包的运行组成，固定来源单独构建并验证分发闭包，不进入普通 Python wheel。仓库中的 `tools/scripts/orca_preflight.py` 及其测试保留为历史离线预检工具，不能替代当前构建和实际会话验收。

公开接入样例放在 `docs/examples/integrations`；`docs/examples/legacy` 的 [项目登记样例](../docs/examples/legacy/progress-registry.example.json) 和 [人工进度样例](../docs/examples/legacy/progress-manual.example.json) 说明仍受支持的旧记录格式，供显式导入时参考。正常使用的数据保存在所选 profile；整理样例不会移动源码旁已有的私人文件。固定 TypeScript 配置与编译器清单位于 `tools/typescript`，远端正文 reader 的依赖单独位于 `tools/remote-reader/requirements.txt`；本机依赖仍使用根 `requirements.txt`。

## 验证与撤销

基础开发验证使用 Windows、Python 3.12、Node.js 24；无需作者资源。先按[参与开发](CONTRIBUTING.md#观察前端-typescript-开发)准备共享固定编译器，再运行两模块 check 和全部 Node 合同。浏览器 harness 的 Playwright/Edge 安装与 fixture 执行见 [参与开发](CONTRIBUTING.md)。以下浏览器命令由验收负责人执行，结果与单元测试分别记录：

```powershell
& '.venv/Scripts/python.exe' -m unittest discover -s tests -v
node tools/scripts/build_observation.cjs check
node tools/scripts/build_news.cjs typecheck
node tools/scripts/build_news.cjs check
node --test tests/frontend/test_execution_ui.cjs tests/frontend/test_progress_ui.cjs tests/frontend/test_workspace_history_ui.cjs tests/frontend/test_observation_ui.cjs tests/frontend/test_task_center_ui.cjs tests/frontend/test_observation_build.cjs tests/frontend/test_news_ui.cjs tests/frontend/test_news_build.cjs tests/frontend/test_quota_ui.cjs
node tests/e2e/verify_workspace.cjs --fixture
node tests/e2e/verify_control_everything.cjs --fixture
```

真实 SSH 补绑、独立 SDK 合成链/空结果对照、选中真实 UUID 分页、Edge 桌面/360px、真实 focus 和 Codex 加载由协调者分别承接。fixture 自证不代表这些已验收；详细状态与所有失败保留在本地开发记录及 ignored `work/`，不提交仓库。

Ctrl+C 停网关即可停本批查询，原 Claude/SSH/Zellij 对话继续运行。代码回退需与对应 profile 版本配套，先保留备份，再在另一个空数据目录恢复并验证；真实 MCP 回退仅撤销本 server 表并由用户重载。删除本地 `.venv` 或远端 reader `.venv` 前确认绝对路径和本批归属。保留研究、方案和实施报告；不删除远端 `.claude`、项目或 Workbench。已经切换的 pane 由用户自行切回。

项目工作空间由 `web/workspace/project-space.js` 负责项目导航、全部事项、待处理和会话展示，任务编辑与分页继续复用 `task-center.js` 的同一份事项。`attention` 查询范围在数据库分页前筛选人工状态为阻塞或待验收的事项；进程运行和普通待办不属于该范围。`workspace.js` 负责装配。

项目“协作监控”由 `workspace/monitor.py` 提供同库只读、项目过滤后的分页快照；`web/workspace/project-monitor.js` 管理页面与请求生命周期，`monitor-model.js` 区分业务事项、最新认领、受控执行记录和外部会话元数据，`monitor-scene.js` 绘制，`monitor-art.js` 保留上游字符艺术及完整许可。最近活动窗口不承诺无损事件续传，执行结束不代表人工验收，外部会话活动未知；内部运行时未接通时明确显示，不另开 SDK 会话或读取私人日志。切页和后台停止绘制及轮询。合成合同运行 `python -m unittest tests.backend.test_project_monitor tests.backend.test_packaging`、`node --test tests/frontend/test_project_monitor.cjs tests/frontend/test_monitor_scene.cjs tests/frontend/test_project_space_ui.cjs`；真实页面和未来内部运行时来源分别验收，不用合成预览代替实际接通。

本机 Codex 项目适配器为 `sessions/codex_desktop.py`：只读显式来源及相邻桌面配置，先合并归属再分页，不按目录合并项目。旧 `codex_index.py` 与六字段、12 条接口保持兼容。内部完整快照不直接返回工作台首页；会话页通过 `/api/workspace/codex/sessions` 分页获取。外部项目使用来源实例与项目 ID 的稳定身份，只读刷新不写管理库；用户显式加入时先在同一事务内保存项目、目录及规范 `codex` 来源标记，后续事项仍在同库事务内校验保存。标记复用已有管理表与备份闭包，schema 和 manifest 版本保持；手工项目保存拒绝该来源，已有外部项目也不得通过伪造来源覆盖。来源陈旧、读取不完整或归属冲突不得授权新关联，原事项状态编辑须保留。


项目接入由 `sessions/project_sources.py` 提供固定三来源只读元数据，`workspace/project_selection.py` 负责显式加入和移出，`profiles/workbench_settings.py` 保存许可与移出意图，`http/onboarding_routes.py` 只装配请求。`/workspace-admin` 的高级来源及历史项目接入流程位于 `web/workspace/onboarding.js`，由对应管理页协调刷新，不接管内置工作台的原生 AddRepoDialog；资源必须同时纳入 HTTP、MANIFEST 和 build_assets 白名单。合成合同：`python -m unittest -v tests.backend.test_project_sources tests.backend.test_workbench_selection tests.backend.test_onboarding_routes` 与 `node --test tests/frontend/test_onboarding_ui.cjs`。真实产品启动和浏览器验收另由验收负责人留证。


### 新闻阅读器

正式同源入口为 `/news`，由 Studio 首页/手机顶部及旧 `/workspace#news` 进入。旧 `news.ts/news.js` 与固定 RSS API 保持兼容；新阅读展示在 `web/workspace/news-reader.*`，蜘蛛动画在 `news-spider.js`。`news-browser.js`、`news-public-embed.js` 是仅服务端执行的浏览 worker，按白名单入包，不作为 HTTP 静态文件提供；普通阅读和 RSS 无需 Node。

阅读列表默认按上海时区的当天发布日期筛选，发布说明缺发布日期时使用更新时间，HN 使用收录时间；抓取时间不会把旧文变成今日新闻。可从日期选择或空态“查看历史”切到全部，不删除历史或收藏；页面跨午夜自动更新。卡片取已有正文首个自然段作预览，只用“图文/文章”标识媒体类型；来源旁蓝点为未读，空心灰点为已读，阅读标记继续保存在账号/阅读器作用域内。未知正文先读取再打开，确认仅有失败摘要的条目按内容签名从列表隐藏，正文更新后可恢复；不会把错误/重试小字留在正文里。采集时间与来源告警不占阅读页底部，文章操作保留已读、收藏、归档。主标题与正文用颜色/字号分层；Trafilatura 适配保留多级标题、引用、代码及缩进，仍用纯文本 DOM 展示，旧缓存不强制迁移。新闻采集没有 AI 模型调用，正文预览也不是 AI 总结；中文切换仍使用本地翻译模型。

采集窗口将配置与状态分开：开始前设置关键词和主题，进行中仅展示 CSS/SVG 流光动效、一个当前状态和必要操作，结束后显示真实内容数量，可重新设置并采集。已知阶段总量时展示真实百分比，未知时不伪造百分比；保存阶段等待服务端合入结束。来源保留在文章卡片与原文信息，不在状态窗口展示来源列表、日志或回放入口；后台事件与调试截图接口保留，普通界面不请求截图。明暗与窄屏可用，关窗仍继续采集，但状态动效在关窗、切后台、终态和减少动态偏好下停止。蜘蛛默认隐藏，显示选择按阅读器与远程账号范围保存；隐藏不挂载或暂停动画，阅读与采集继续。

关键词采集的 AI Coding/Agent/模型主题优先匹配量子位、少数派 RSS，有匹配时不再请求海外来源；普通采集直接解析国内来源的静态正文，不加载页面脚本，需要步骤截图时才打开完整页面。每批最多 20 篇，所选 profile 已采集的正文/完整订阅内容先按 URL 排除，后续采集继续未收集文章；仅有摘要的文章仍可重试原文，固定 RSS 标题不算已采集正文。量子位订阅不足一批时最多读取四页，重复分页停止，不假定其他来源支持分页。无匹配时再读取 Peter Steinberger/Anthropic 或 DeepMind/OpenAI 对应订阅；Claude 使用官方 Atom，Tibo 保留作者原文入口，显式 X 链接沿用公开嵌入。英文常用主题词同时匹配对应中文词，不把作者预设当成本次全网搜索结果。每次原文访问使用独立 Page，避免残留导航干扰；同域订阅重定向有界处理，原文受限时保留带范围标签的来源内容/摘要。页面无发布日期时保留订阅发布日期，Atom 更新时间独立展示，无关键词匹配按正常空结果处理。固定 RSS API 与其既有来源保持兼容。

后端 `workspace/news_reader.py` 管理所选 profile 的 `news-reader/` 数据，`news_research.py` 管理单槽、有截止时间的独占浏览进程，`news_article.py` 提取固定来源正文。HTTP 装配在 `http/news_reader.py`，沿用 Host、Origin、client header 和 CSRF 校验。截图经带权限头的 fetch 转为 Blob 显示。研究数据、模型、截图和个人工具路径不提交。

普通安装包含固定版本的正文提取器；本地翻译额外依赖通过 `python -m pip install -e ".[news]"` 安装。RSS/Atom 内联内容按纯文本保留，原文受阻时回退到订阅源内容并说明是否截断；HN 只对服务端已收录的链接提取正文，仍校验公共 DNS、HTTPS 和同域跳转。页面显示具体失败原因，手动重新读取可绕过失败冷却，不丢失已有成功缓存。完整 Windows 产品的浏览采集复用包内固定 Node 与引擎锁定的 `playwright-core` 1.64.0，后者由 `config/scripts/orcad-playwright-core-package.mjs` 精确导出并纳入原分发所属与许可核验；HTTP 装配仅从已验证产品清单注入路径，不回退系统 Node 或全局 `NODE_PATH`。Windows 使用本机 Edge 的临时隔离 context。源码开发模式仍可通过 `CONTROL_EVERYTHING_NEWS_NODE` 指定 Node，并按标准 Node 模块解析加载开发 Playwright；其他平台的浏览器依赖按官方说明准备。依赖缺失时保留已有新闻并返回明确不可用状态。

`python tools/scripts/prepare_news_translation.py --data-dir <PROFILE_DIR>` 下载校验后的公开英译中模型；默认模型目录为默认 profile 的 `news-reader/translation-model/translate-en_zh-1_9`，使用其他 profile 时通过 `CONTROL_EVERYTHING_NEWS_MODEL` 指定已准备的模型目录。模型只在用户切换中文时载入，不自动下载或调用云翻译。

定向验证：

```powershell
python -m unittest -v tests.backend.test_news_reader tests.backend.test_news_article tests.backend.test_daily_news_http tests.backend.test_packaging
node tests/e2e/verify_news_reader.cjs
node tests/e2e/verify_news_sources.cjs
python tools/scripts/check_architecture.py layout
lint-imports --config tools/architecture/importlinter.ini --no-cache --no-logo
```

E2E 使用明确标记的合成页面，截图保存在 ignored `work/news-reader-tests/`；真实 RSS、X 官方嵌入和本地翻译另行记录实际结果。公开嵌入的节选和媒体失败不代表完整线程或稳定全量抓取。

### 账号与认证界面资源

账号与设备展示模块为 `web/workspace/account-device.js`，Studio、独立 `/remote` 与 `/desktop` 共用；本机精确提供 `/remote/account-device.js`、`/remote/remote-account.css`。中央站点的 `remote-ui` 目录只复制 `web/workspace/` 中 `remote-account.html`、`remote-account.js`、`remote-account.css`、`account-device.js`、`ui-theme.js` 五个源文件，保持同名。Caddy 仅以 `/remote`、`/remote/` 两个文档别名提供 HTML，并精确提供 `/remote/remote-account.js`、`/remote/remote-account.css`、`/remote/account-device.js`、`/remote/ui-theme.js`；不开放 `/remote/*` 或直接 HTML URL。既有设备代理与 hub 静态授权范围不因此扩大。该样例需要部署负责人在自建现场核验，源码检查不代表已重载 Caddy。

`web/workspace/identity-theme/control-everything/login/` 仅维护 `theme.properties`、`resources/css/studio.css`、`messages/messages_zh_Hans.properties` 三个身份服务部署资产。sdist 显式保留三文件，Python wheel 与 HTTP 资源不包含主题；不把主题目录当文件服务根。新增 properties 必须逐文件登记并经过内容/秘密检查，不能按目录豁免。

### 管理界面主题、字体与确认资源

普通页面共用 `web/workspace/ui-theme.js`，确认原语为 `ui-dialog.js`，Studio 导航壳为 `studio-shell.js`。网关精确提供 `/ui-theme.js`、`/ui-dialog.js`，Studio provider 提供 `/studio-shell.js`；三个文件同时列入 `build_assets.py` 和 `MANIFEST.in`。独立创作服务仅增加 `/ui-theme.js`；新闻 provider 保留原资源表，由网关提供共用脚本。静态 Studio 预览精确提供三脚本，仍无业务 API。

普通文档在 head 用外部同步 script 的 `data-ce-theme-key` 声明该页既有 key；`CEUITheme.pageTheme` 是早读生成的同一个只读 controller 引用，消费者复用它 mount，并在页面退役时 dispose。远程元数据与 context 必须先冻结，再读任何存储。BFCache 恢复时不复用已 dispose 的 controller；不新建主题 key、另一份 store 或跨账号广播。集成 React 页面沿自己的 authority 与 document-theme，不能再加载普通主题 helper。`ui-dialog.js` 应先于 onboarding、agents、project-space，`studio-shell.js` 先于 studio-preview；确认样式在已加载的 `workspace.css`，不注入 inline style 或新增 CSS URL。

管理正文使用 Geist 与系统中文 fallback；终端、代码、diff、技术标识保持自己的字体。唯一字体源为 `web/workbench-engine/src/renderer/src/assets/fonts/Geist-Variable.woff2`（69436 字节，SHA256 `e24cec106619c03f0b3519e31b9bc55e0d5e926b6a95b8d798cd8cef215b1505`），完整许可在 `web/workbench-engine/licenses/Geist-OFL-notice.md`。`tools/packaging/build_ui_font.py` 只替换两个既有资产的标记块，不手写另一份字体、不新增 HTTP 字体 URL。普通 helper 将标记块中的 base64 解码为原字体 bytes，以 `FontFace` 的 BufferSource 供给，适配现有禁止 inline script 与 data 字体 URL 的 CSP；不放宽策略。登录 CSS 继续使用同一字节生成块与父 `keycloak.v2` 主题，父 CSP 下的字体加载须现场验证。

从源码检出目录运行（使用显式 Python/Node 24）：

```powershell
python tools/packaging/build_ui_font.py build
python tools/packaging/build_ui_font.py check
python -m unittest -v tests.backend.test_ui_font_assets tests.backend.test_identity_theme tests.backend.test_packaging tests.backend.test_creator_http tests.backend.test_architecture
node --test tests/frontend/test_ui_theme.cjs tests/frontend/test_ui_dialog.cjs
```

`build` 后连同两资产的生成块检查 diff；`check` 不写文件并核完整原字节与 OFL。登录固定三资产、中央固定五文件、实际字体加载、两 Shadow 焦点和权限写入分别验收；纯单元不证明真实部署。`tests/e2e/verify_workbench_interactions.cjs` 属于隔离产品预览验收，新闻 harness `tests/e2e/verify_news_reader.cjs` 使用全部路由截获的合成数据及原新闻 CSP；两者由验收负责人运行并保留浏览器报告。
