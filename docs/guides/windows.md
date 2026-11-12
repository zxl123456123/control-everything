# Windows 安装与维护

[返回项目首页](../../README.md) · [使用指南](usage.md) · [可选接入](integrations.md) · [开发工作流](../../.github/CONTRIBUTING.md#开发与出包从这里开始)

本文命令均从仓库根目录执行；安装版的专用命令另行注明。

## Windows 标准安装

当前提供 [0.1.0a18 Windows x64 早期测试版](https://github.com/zxl123456123/control-everything/releases/tag/v0.1.0a18)：[安装器](https://github.com/zxl123456123/control-everything/releases/download/v0.1.0a18/session-panel-0.1.0a18-windows-x64.exe) · [依赖对应源码](https://github.com/zxl123456123/control-everything/releases/download/v0.1.0a18/session-panel-0.1.0a18-sources.zip)。安装器尚未签名；实际验证范围和未覆盖项目见该版本说明。开发者也可按[源码启动指南](usage.md#多-agent-工作台)运行。

`0.1.0a18` 是完整版本号，其中 `a` 表示 alpha（早期测试），`18` 是该阶段的版本序号；含义遵循 [Python 版本规范](https://packaging.python.org/en/latest/specifications/version-specifiers/#pre-releases)。版本序号用于识别安装包，具体功能、测试结果与限制由版本说明分别列出。

此安装包的受测源码为 `f3439da7`。`main` 和 `develop` 的后续源码与文档更新不会改动已发布的安装包；新 EXE 须单独构建、验收并发布。安装版按上述版本说明判断功能与已知限制，源码开发按贡献指南构建和预览。

普通用户下载 `session-panel-0.1.0a18-windows-x64.exe`，先用 `Get-FileHash -Algorithm SHA256` 与该次发布的 `SHA256SUMS.txt` 核对，再运行安装器。标准产品自带 CPython 3.13.16、固定 Python 依赖、前端资源和 release Rust 原生观察后台，无需另外安装 Python、Node、npm 或 Rust 编译器。依赖源码附件用于对应源码分发，不能代替完整安装器或 GitHub 的项目源码快照。

安装目录支持中文和空格；当前产品按普通 Windows 路径工作，每个完整交付文件路径须少于260个UTF-16字符。安装器在写入目标前检查整个固定文件清单，超限时提示选择更短目录，不修改系统的长路径策略。

安装按当前用户运行，无需管理员权限，默认位置为 `%LOCALAPPDATA%/Programs/SessionPanel`。安装后从开始菜单 **Session Panel** 打开独立工作台窗口，安装时可选创建桌面快捷方式。窗口使用 Microsoft Edge WebView2 Runtime，关闭窗口后关闭本次桌面服务。已公开的 0.1.0a10 等较早安装包仍沿用控制台与浏览器入口。端口被占用时明确退出，可从 PowerShell 指定自己的端口和 profile：

```powershell
$panel = Join-Path $env:LOCALAPPDATA 'Programs/SessionPanel/session-panel.cmd'
& $panel --data-dir 'C:/example/SessionPanel/main' --port 14401
```

关闭独立窗口即可停止本次桌面服务；手动运行网关时，在所属控制台按 Ctrl+C 正常停止。关闭页面或网关不会终止独立原生观察后台，更不会终止外部 Agent。维护前先停止自己运行的全部网关；安装器会核对本安装登记的全部版本及 profile，并通过每个后台原来的 EXE 正常停止自有观察进程。未知身份、仍运行的 HTTP 或无法证实退出的进程会阻止维护，保留现有入口，不按程序名强杀，不接管其他安装或 profile。

常规更新无需先卸载：关闭程序后运行新版安装器，选择原安装目录原位升级。升级保留旧版本目录，安装文件核验和登记完成后才切换 `session-panel.cmd`。重新运行可信的原版本安装器可选择该版本的完整闭包；同版本可重新安装。回退前保留 profile 备份，并确认旧程序支持当前配置和管理库格式；安装器不会隐式迁移、降级或搬迁数据。卸载使用 Windows“已安装的应用”中的 **Session Panel**，只处理安装日志和严格核验的自有管理文件；profile、备份和未知用户文件保留。卸载不会替你关闭网关，遇到阻塞先正常退出自己运行的实例，再重试。

目标平台为 Windows 10/11 x64；技术预发布的安装器与原生程序目前未签名，上游组件的数字签名不代表组合产品已签名。每次发布说明列出实际验收范围；开发机或托管 Windows runner 的受控 PATH 验收不能替代两种系统的完整干净机器验证。项目源码采用 [MIT 许可证](../../LICENSE)；随产品附带项目许可证及实际依赖的第三方声明与摘要，第三方依赖遵循各自的许可证。

新安装先从项目总览点击“进入工作台”，再用“添加项目”添加已有目录、创建目录或克隆仓库；工具来源导入保留在 `/workspace-admin` 兼容管理页，确认来源后只加入自己选择的项目。程序登记和项目来源读取分别确认，不会因发现工具而自动启动 Agent。普通用户使用产品内运行时和原生组件，无需安装 Node、Rust 或配置作者的个人环境。账号与手机远程访问条件、数据备份和兼容管理入口见[使用指南](usage.md)。界面开发先提供 develop 真实预览，确认后合入 main；源码检查不能替代实际安装与浏览器验收。

## 构建与技术预发布

日常开发从 [贡献指南](../../.github/CONTRIBUTING.md#开发与出包从这里开始)进入。Windows 候选统一用 `tools/packaging/build_windows_release.py` 构建，实际安装验收和公开发布分开执行。

这里的“构建”是把源码编译、组装成可安装的软件：先核对源码、工具版本及依赖，再生成 Python 程序包、Windows 窗口、进程观察后台和内置网页，最后核对文件及许可材料并生成 EXE 安装器。构建记录中的步骤还包括读取代码提交号、检查工具版本等准备动作；步骤数量会随脚本变化。交付说明应分别报告生成安装包、自动化测试、真实安装和界面操作的结果，不能用“若干步通过”代替产品验收。

```text
确认开发验收 → 冻结版本/SHA → 核验并准备固定输入
  → 本机统一命令：Python 包 → Rust release observer → 内置工作台
  → 当前产物许可绑定 → 严格 payload → Inno EXE → 候选待验收
  → 专用环境安装验收 + 真实页面验收 → 校验公开附件 → 发布
```

安装准备和卸载使用由完整产品清单派生的封闭维护子集，只临时准备解释器、本项目 Python 代码和原生协议组件。完整应用仍按全部文件清单入包和核验。维护子集有独立的校验入口，不能作为完整桌面产品或 HTTP 文件服务根；每次启动维护子进程前仍校验其文件，保留原有身份、互斥和写入前检查。

旧 `.github/workflows/release.yml` 云端出包配方已经退役，历史保留在 Git；不再维护一套与本机构建不同的配方。`ci.yml` 自动检查 main/develop 的推送与 PR，手动运行另含完整跟踪树检查，范围见[贡献指南](../../.github/CONTRIBUTING.md#自动源码检查与发布)。以下源码合同通过不等于某个新版本已实际构建、安装或发布；以该版本的收据为准。

### 1. 冻结版本与准备环境

界面改动先完成 develop 真实预览和项目主导者确认，再进入 main 发布流程。develop 的明确提交可以构建开发候选，必须与已发布版本区分。产品版本只改 `pyproject.toml`，wheel、产品清单与安装器消费同一值；版本变更单独提交。已发布版本不换包、不移动 tag，新交付使用新版本。

按 [工作树生命周期](development-files.md#工作树的开始依赖和结束)建立独立、干净的检出，固定完整 40 位 SHA。每个 checkout 独立安装依赖；工具、下载与已审核材料可以按合同复用，依赖根不得链接到其他工作树。本机任务 README 记录版本、SHA、负责人和验收范围，旧材料先核来源和 hash，不能裸运行历史 driver。

首次准备 Python editable 环境与固定构建依赖见贡献指南；统一入口不安装或升级环境。使用 Windows x64、Node 24、pnpm 12.14.0 原生 EXE、[固定 Rust/MSVC 环境](../../.github/CONTRIBUTING.md#windows-原生观察开发)。包内 Node 与开发 Node 分别核 pin，Python 运行轮子使用 `tools/packaging/windows-cp313.lock`。

`tools/packaging/downloads.json` 是 CPython 和 Inno Setup 下载 URL、SHA256、发布者的唯一配置。下载后核 SHA256；对 CPython 解包后的 `python.exe`、Inno 下载器及所选编译器核 Authenticode 状态和发布者，保留证据，不能把组合产品说成已签名。准备 Inno 工具目录中的 `ISCC.exe` 和 `license.txt`；准备工具不等于安装本产品。

Python wheel 的许可由 `notices.py` 收集实际原文。少数已审查但未携许可的官方 wheel 由 `wheel-notices.json` 精确绑定文件名、版本、官方 SHA256 和逐份原文 SHA256；原文保存在 `wheel-notices/` 并逐文件登记归属及内容检查。补充表不接受改过的 wheel，不会跳过缺失、空白或哈希变化的许可；升级这些依赖必须重新核上游构建组件与许可。SentencePiece 0.2.2 的声明还覆盖嵌入的 Abseil、protobuf-lite、darts、esaxx、pybind11 和 Unicode 数据；上游未锁定 pybind11 patch，清单明确保留该限制，使用已核字节相同的 3.0.0～3.0.4 共同原文。

本地翻译的 CTranslate2 4.8.3 使用未修改的官方 wheel。补充声明保留其实际构建配方中的开源库以及 CUDA、cuDNN、Intel OpenMP/oneMKL 完整条款和嵌套声明；cuDNN/OpenMP DLL 已与对应官方发行材料逐字节对照。Intel 再分发清单来自具有有效 Intel 签名的 oneAPI 2025.3.0.372 安装器中的 `credist.txt`，明确列出该 OpenMP DLL；清单引言的旧 EULA 年份与同包 EULA 原文均保留，不自行改写。UTF-8 转码、RTF 纯文本呈现及完整源许可注释的提取均登记来源与转换前后哈希。模型另按其实际 CC-BY-4.0 条款保留署名，不能用这两份 wheel 的许可覆盖模型。

### 2. 一份本机输入清单

将 `inputs.json` 放在 ignored `work/windows-release/inputs/`，十项路径均使用自己的绝对路径。下例是结构说明，替换全部占位后才能执行；真实清单不提交：

```json
{
  "schema": 1,
  "node": "C:/example/tools/node24/node.exe",
  "pnpm": "C:/example/tools/pnpm/pnpm.exe",
  "engine_materials": "C:/example/checkout/work/windows-release/inputs/engine-materials",
  "wheelhouse": "C:/example/checkout/work/windows-release/inputs/wheelhouse",
  "runtime_zip": "C:/example/checkout/work/windows-release/inputs/python-3.13.16-embed-amd64.zip",
  "portable_git": "C:/example/checkout/work/windows-release/inputs/portable-git",
  "git_receipt": "C:/example/checkout/work/windows-release/inputs/portable-git-receipt.json",
  "endpoints": "C:/example/checkout/work/windows-release/inputs/endpoints.json",
  "inno_dir": "C:/example/checkout/work/windows-release/inputs/inno",
  "webview2_sdk": "C:/example/checkout/work/windows-release/inputs/webview2-1.0.4314.35.nupkg"
}
```

固定轮子的准备命令（在已激活的本检出环境）：

```powershell
python -m pip --isolated download --only-binary=:all: --platform win_amd64 --python-version 313 --implementation cp --abi cp313 --no-deps --require-hashes -r tools/packaging/windows-cp313.lock --dest work/windows-release/inputs/wheelhouse
if ($LASTEXITCODE -ne 0) { throw 'Locked wheels failed' }
```

`endpoints.json` 严格仅有 `issuer`、`hub_origin`。纯本地候选两者均为空字符串；自建服务接入时均为有效 HTTPS 地址，不含凭据，不回退官方服务。

**引擎材料只准备来源，不手填本轮输出 hash。** `engine_materials` 包含：

- `external-components.json`：`{"schema":1,"components":[...]}`。每组件登记 name、version、完整 notices、固定 `source_inputs`（path/sha256）以及明确的 bindings；可声明外部 specifiers。五类最低组件为 pinned-node、windows-security、windows-cli-launcher、node-pty-conpty、ripgrep，实际输出涉及的其他组件也必须覆盖。
- 每条 binding 用 `output/provider` 指定引擎内的精确输出与提供者；来自压缩包时用 `output/archive/archive_sha256/member` 指定固定归档的精确成员。路径相对引擎根；源码 pin 不得指向生成目录，提供者不得拿交付输出自身作证明。
- `package-license-inputs.json`：沿既有 `workbench_distribution.py` 的补充包许可数组，包含实际版本、元数据/归档证明和完整 notice；没有补充项时是空数组。

`workbench_materials.py` 在编译前核材料结构及每份源码 pin，编译后再次核对，并检查提供者与产物字节一致，从实际构建图及来源清单关联资源。生成本轮 external/package notice 与 `materials-receipt.json`，最后仍由原 collector 检查完整闭包。新增依赖、来源或换行合同改变需重新审阅材料；不能直接沿用旧版本清单，也不能自动重算摘要给未知输入背书。

**Portable Git 使用已审核的完整收据。** 初次从官方固定归档准备运行目录时，须留存解包来源及审核后的 `reviewed-git-receipt.json`，其中包含固定 archive_sha256/version、全部 files 的大小/hash、components 的归属/notice/源码履约材料。后续复用或迁移材料时执行：

```powershell
python tools/packaging/desktop_payload.py prepare-git --archive C:/example/checkout/work/windows-release/inputs/PortableGit.7z.exe --portable-git C:/example/checkout/work/windows-release/inputs/portable-git --reviewed-receipt C:/example/checkout/work/windows-release/inputs/reviewed-git-receipt.json --output C:/example/checkout/work/windows-release/inputs/portable-git-receipt.json
if ($LASTEXITCODE -ne 0) { throw 'Portable Git preparation failed' }
```

命令核 `desktop_payload.py` 固定的官方归档 SHA256，再以已审 files 逐项核当前目录，复用产品组装的组件覆盖、许可和对应源码校验；同名文件改动也会拒绝，不能重算 hash 给它重新背书。新输出与已审收据必须同父目录，使 `source_materials` 相对路径有效；输出不能在运行目录内，也不能覆盖旧收据。工具不执行解包器、不创造初始信任依据；缺少已审收据时停在材料准备，不把当前目录扫描当成官方来源证明。

独立窗口使用 [Microsoft WebView2 SDK 1.0.4314.35](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4314.35)。从官方 NuGet 源准备 SDK 原包，统一构建核 SHA-256 并保留 SDK 许可与通知。目标机器使用已有的 [Evergreen WebView2 Runtime](https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution)。运行时缺失时窗口会提示，不会改用浏览器。

### 3. 每次只运行一个构建入口

确认工作树干净、输入审核妥当、固定环境已准备。先使用本检出的 Python 环境做预检，避免在编译后才发现缺包、材料过期或配置错误：

```powershell
python tools/packaging/build_windows_release.py --inputs C:/example/checkout/work/windows-release/inputs/inputs.json --run-name preflight-01 --check-only
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed; inspect the exact input or environment error' }
```

预检复用正式入口，检查 Windows 原生路径预算、固定工具和 Python 环境、依赖 wheel 的锁定版本/ABI/RECORD/hash、端点结构、WebView2 SDK/MSVC、Portable Git 及其许可材料、源码和来源清单。`preflight-verified` 只表示这些检查通过，不生成安装包；正式构建仍重新核对。路径及材料初检失败时不创建候选目录；进入工具和载荷检查后的失败会保留收据与日志，已有输出不会被自动清除。

构建从同一检出根执行，使用另一个新 run-name：

```powershell
python tools/packaging/build_windows_release.py --inputs C:/example/checkout/work/windows-release/inputs/inputs.json --run-name candidate-01
if ($LASTEXITCODE -ne 0) { throw 'Candidate build failed; inspect the retained receipt and logs' }
```

入口逐阶段调用已有工具，不启动产品或个人 Agent：

| 阶段 | 实际入口 / 门禁 |
| --- | --- |
| 输入与环境 | 与上述预检相同，先完成输入、工具和源码检查再编译 |
| Python 包 | `python -m build`，sdist → wheel，要求各一个 |
| 原生观察 | 固定 `build_observer.py` 的 fmt/test/clippy/release，静态 CRT；同一工具链用 `--filter-platform x86_64-pc-windows-msvc` 生成 Cargo 元数据，从 resolve 图选择观察后台根及传递 normal/build 依赖，逐包保留完整许可校验 |
| 内置工作台 | `workbench_engine.py build --materials ...`，源码检查、锁定依赖、生产 Web 类型检查、编译、产物探针、材料绑定、完整许可闭包 |
| Windows 独立窗口 | `build_desktop_window.py` 从固定 Microsoft WebView2 SDK 与 x64 MSVC 构建，产物及许可随清单入包 |
| 产品组装 | `build_windows.py --release`，逐项验证 Windows 窗口、源码与轮子、工作台、观察后台、Git 及源码附件 |
| 安装器 | `inno_include.py` → `ISCC.exe`，精确文件清单与 hash；编译器退出码非0即停止 |

首次编译使用新的 run-name 和干净检出，不覆盖已有 release 输出、engine 的 `out/.build` 或 release observer。失败保留完整 stdout/stderr 与阶段退出码。

下载缓存默认复用本检出 `work/windows-release/pnpm-store`。需要跨工作树复用时显式传 `--store-dir <已有缓存绝对路径>`；路径不能是链接、普通文件或盘根。只共享 pnpm 下载缓存，各树独立安装 `node_modules`，始终使用 frozen lockfile、禁用隐式安装脚本并优先读取缓存，缺包再下载。不要依赖当前 PATH 的默认 pnpm 版本。

如果原候选已经完成全部编译及许可闭包，随后产品组装或安装器失败，可在同一工作树、同一源码与输入上重新组装：

```powershell
python tools/packaging/build_windows_release.py --inputs C:/example/checkout/work/windows-release/inputs/inputs.json --reuse-build candidate-01 --run-name candidate-02
if ($LASTEXITCODE -ne 0) { throw 'Reassembly failed; retain both attempts' }
```

恢复只接受带 `compilation` 检查点的原始失败收据，重新核对完整提交、检出路径、工具/输入/材料身份及编译文件集合、大小和摘要。新的产品与日志写入新 run，原编译收据保持不变；装配仍执行来源、产物和许可校验。旧版无检查点、编译未完成、已有成功候选或任何输入/产物变化都拒绝复用。恢复再次失败时，保留该次证据，继续引用原始编译 run 新建尝试。不能通过改收据、跳过步骤或自动删目录来强行恢复。

| 本检出路径 | 用途 |
| --- | --- |
| `work/windows-release/<run>/build-receipt.json` | 每步命令、日志、退出码，最终源码/版本/闭包与安装器、源码附件 hash |
| `work/windows-release/<run>/dist/` | sdist 与 wheel |
| `work/windows-release/<run>/payload/` | 完整运行闭包、product.json、BUILD-INPUTS.json、SOURCE-AVAILABILITY.json |
| `work/windows-release/<run>/installer/session-panel-<version>-windows-x64.exe` | 安装候选 |
| `work/windows-release/<run>/session-panel-<version>-sources.zip` | 必须伴随安装器交付的依赖对应源码 |
| `work/workbench-engine-build/<run>/` | engine 编译日志、来源/产物/许可证明；首次装配使用 `assembly/` 副本，最终可用证据路径以总收据 `engine_run` 为准 |
| `work/native-observer/release-install/` | 固定 release 观察后台与构建身份证明 |

最终状态 `candidate-built-awaiting-acceptance` 只表示候选生成。单独开发 engine 时仍可使用底层 build（现在必须传 `--materials`）；复核已有产物用 `check-output --run-dir ...`，需要首次绑定材料时加 `--materials`。已有不同材料拒绝覆盖，不能先制造失败再手工改 hash。

这些改动参考 [VS Code 的工具预检](https://github.com/microsoft/vscode/blob/85fa073afb01d5708bfc6cda89fd54faf09b5d35/build/npm/preinstall.ts)、[pnpm store 缓存](https://github.com/microsoft/vscode/blob/85fa073afb01d5708bfc6cda89fd54faf09b5d35/build/azure-pipelines/common/restore-pnpm-store.yml)以及 [RustDesk 在重编译前检查架构和引擎输入](https://github.com/rustdesk/rustdesk/blob/2fe026917dbdc0f715a8ce299da5eaf4e016587e/.github/workflows/flutter-build.yml#L238)的做法；编译与组装分开也与 [Tauri build/bundle](https://v2.tauri.app/reference/cli/#bundle)一致。本项目采用前移检查、下载缓存和同身份产物复验，沿用本机工具与手动发布，不引入云端多任务系统或任意步骤跳过。短暂网络重试交给包管理器；源码、类型、hash和许可失败需修正原因。

### 4. 安装与真实页面验收

`tests/e2e/verify_installed_product.py` 根据已安装清单区分新 desktop 与旧 gateway。新产品使用实际 Desktop 装配和生命周期，核 runtime ready、Studio、完整已登记 Web 资源与 desktop 页面。它会真实安装、运行和卸载，只在没有同 AppId/开始菜单入口的专用 Windows 用户或测试机执行：

```powershell
python tests/e2e/verify_installed_product.py --payload C:/example/checkout/work/windows-release/candidate-01/payload --installer C:/example/checkout/work/windows-release/candidate-01/installer/session-panel-0.1.0a2-windows-x64.exe --evidence C:/example/checkout/work/windows-release/candidate-01/installed-evidence
if ($LASTEXITCODE -ne 0) { throw 'Installed acceptance failed; retain the installation and evidence' }
```

示例文件名替换为实际版本。两个真实不同版本的升级/回退需再传 `--second-payload`、`--second-installer`，不能用同版重装冒充。测试保留已有安装拒绝、维护阻塞、profile/备份保留及失败不强杀规则；不得清除真实安装登记来强行执行。

另外人工核开始菜单/cmd 实际启动、真实浏览器交互、数据重启保留及适用的资讯、终端、Git、桌面返回、远端账号/设备和 SSH。源码合同、内部 Desktop 装配不证明 cmd wrapper 已运行。Win10/11 矩阵、手机现场、Android APK、未配置服务等分别标明实际覆盖，不能以一次本机成功代替。

自建远程接入还需核对 Hub 配置的 `static_paths` 与本次实际运行版本。先验证载荷中的 `workbench-build/web-assets.json` 及对应文件尺寸、SHA，再将非 HTML 条目加 `/workbench/` 前缀与服务端清单比对；同时核对 `http.gateway.WEB_ASSETS`、`http.workbench.STUDIO_RESOURCES`、`http.news_reader.ASSETS` 中非 HTML 的平台资源。只补内置引擎会漏掉宠物、新闻等随后加载的脚本。按精确路径追加缺项，保留仍受支持版本的条目，不改成目录通配；服务器私有配置在服务器上备份，不加入发布附件。

更新后重新加载 Hub，并在登录后的手机浏览器实际进入 `/studio`、打开自己的项目与终端。设备显示“在线”只证明连接和健康检查，不能证明页面脚本已获放行；空白页、资源加载失败、登录回调失败均应记录为未通过。安装器上传前须保存这次远程访问的实际结果。

### 5. 验收后发布

1. 公开发布前确认受测提交已在 main（界面已经项目主导者确认），版本与 tag 未占用，并按下节生成本轮放行复核记录。需要远端检查时手动执行 `ci.yml` 并核同一 SHA；push 不会自动触发它。
2. 使用下文 `release_bundle.py prepare` 在本轮 `public/` 准备固定十一份附件：安装器、同版本依赖对应源码 ZIP、七份元数据与许可文件、版本说明和校验和。工具拒绝额外附件；本机输入与验收日志不上传。
3. 核 version、commit、dirty=false、闭包及对应源码附件大小/hash；生成覆盖全部附件的 `SHA256SUMS.txt`（不含自身）并重核。`git archive` 项目快照不能替代依赖对应源码附件。
4. 建指向受测 SHA 的 `v<版本>` draft，上传并核附件后再公开 prerelease；不移动已有 tag、不覆盖已发布附件。说明写实际验收范围、所有已知失败/限制、签名状态和回退条件。参考 [GitHub 发布流程](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。
5. 核 Release URL、`isDraft=false`、`isPrerelease=true` 和实际下载附件；更新首页版本/下载链接，并按文件管理指南归档本轮证据。源码推送、候选生成与公开发布分别记录。

采用 [Python subprocess](https://docs.python.org/3/library/subprocess.html) 的固定 argv 与退出码记录、[Inno 官方命令行编译](https://jrsoftware.org/ishelp/topic_compilercmdline.htm) 和 GitHub draft 发布方式。保留项目现有构建器及许可校验，不新增另一套通用编排框架。

#### 本机放行复核记录

`tools/packaging/release_readiness.py` 只记录和核对证据，不执行安装、GitHub 上传或飞书通知。它复用已有完整 payload 校验器，比较候选、源码检查、安装报告与人工验收材料，输出 `ready-for-publication-review` 或 `blocked`。这份本机记录不是密码学来源证明，也不会让人工发布步骤自动获得强制保护。

冻结候选源码后，先在任务 README 明确本轮要运行的检查及范围，然后在干净检出中逐项执行 `record-check`。使用本检出已激活的 Python 环境；下例的测试列表须按贡献指南及本轮改动选择，不能照抄一条测试就称为完整发布验证：

```powershell
$releaseRepo = (Get-Location).Path
python tools/packaging/release_readiness.py record-check --output "$releaseRepo/work/windows-release-checks/candidate-01/backend" -- python -m unittest -v tests.backend.test_windows_release tests.backend.test_installed_product_acceptance
if ($LASTEXITCODE -ne 0) { throw 'Source check failed; retain its receipt and logs' }
```

命令实际执行所给 argv，保留 `receipt.json`、`stdout.log`、`stderr.log`，核对运行前后完整 SHA 和工作树干净状态。非零退出、启动失败或源码变化不记为成功；失败证据保留，复验使用新输出目录。执行者须阅读完整输出；此入口记录测试命令事实，不自动判断用例覆盖是否充分。它不运行 shell，不对调用者自己传入的 shell/脚本提供沙箱。

构建并完成专用环境安装及真实页面验收后，在本轮 ignored 目录准备 `review.json`。所有 `path` 使用实际绝对路径，`sha256` 使用 `Get-FileHash -Algorithm SHA256` 的真实结果并转小写。例子中的占位必须替换，不把真实验收记录加入 Git：

```json
{
  "schema": 1,
  "decision": "accepted",
  "reviewer": "本轮验收负责人",
  "commit": "候选完整40位提交号",
  "installer_sha256": "实际安装器sha256",
  "checks": [{"path": "E:/example/checkout/work/windows-release-checks/candidate-01/backend/receipt.json", "sha256": "实际检查收据sha256"}],
  "manual_evidence": {"path": "E:/example/checkout/work/windows-release/candidate-01/manual-acceptance.md", "sha256": "实际人工验收记录sha256"},
  "accepted_not_covered": ["逐项保留安装报告not_covered原文"]
}
```

`checks` 必须列齐预先明确的检查；当前版本拒绝任何失败检查，不提供忽略失败开关。人工记录说明具体操作、结果、失败和发布限制，不能只写“已验收”；`accepted_not_covered` 必须与安装报告完整一致，表示负责人已审阅这些限制，并不把未覆盖项目改成通过。记录缺失、哈希不符或 `decision` 未接受时不能放行。

```powershell
python tools/packaging/release_readiness.py verify --candidate "$releaseRepo/work/windows-release/candidate-01" --acceptance "$releaseRepo/work/windows-release/candidate-01/installed-evidence/report.json" --review "$releaseRepo/work/windows-release/candidate-01/review.json" --output "$releaseRepo/work/windows-release/candidate-01/readiness.json"
if ($LASTEXITCODE -ne 0) { throw 'Release evidence is blocked; inspect readiness.json or the command error' }
```

使用上述安装验收命令时，候选必须是首个 `--payload/--installer`；第二产品用于另一真实版本的往返验证。安装报告须包含 `product`、`second_product` 身份，旧报告缺字段时重新验收，不手工补字段伪装新证据。顶层通过且 `errors=[]` 才有效；验收工具中的预期非零退出仍保留。没有第二产品时，记录只能声明实际报告覆盖的范围：专门验证过的单向原位升级可以单独表述，但不能宣称两版本往返、回退或其他未执行步骤已通过。

`verify` 重核 EXE、依赖对应源码、完整 payload、源码检查日志及收据、人工材料 hash，并在记录中保留覆盖范围和证据引用。重跑不覆盖既有输出，输出不得放入 payload 内；证据修正后另用新文件名。校验只证明本次读取时的一致性，正式上传前仍须复核这些文件未变。所有原始证据和放行记录留本机，不默认加入公开附件。

#### 准备附件、创建草稿和公开

下面命令在本检出环境运行，所有路径改为本次实际绝对路径。先完成上节的 `readiness.json`，再准备审核后的 UTF-8 中文版本说明。`prepare` 只操作本地，复跑放行核验后复制同一份候选，不重新编译：

```powershell
python tools/packaging/release_bundle.py prepare --readiness "$releaseRepo/work/windows-release/candidate-01/readiness.json" --notes "$releaseRepo/work/windows-release/candidate-01/release-notes.md" --output "$releaseRepo/work/windows-release/candidate-01/publication" --repository example-owner/example-repository
if ($LASTEXITCODE -ne 0) { throw 'Public bundle preparation failed' }
```

输出中只有 `public/` 是计划上传内容：同版本 EXE、依赖 `sources.zip`、SOURCE-AVAILABILITY、product、BUILD-INPUTS、LICENSE、两份 THIRD-PARTY-NOTICES、DESKTOP-NOTICES、release-notes.md 与 SHA256SUMS.txt，共11份。校验和覆盖其余10份，不包括自身。`publication.json` 和复验记录留本机，状态 `prepared-awaiting-content-review` 表示尚待内容审核；不能把整个输出目录上传。

审核这11份文件的公开范围、许可、秘密扫描、隐私命中及归档内材料，把实际命令、退出码、命中分类和未覆盖范围写进本轮 `content-review.md`。工具验证文件一致性，不替代内容审核；不要因为文件名在白名单里就跳过扫描或审阅。另写私有 `publication-review.json`，绑定实际计划和审核文件哈希：

```json
{"schema":1,"decision":"accepted","reviewer":"本轮发布负责人","plan_sha256":"实际publication.json的sha256","evidence":{"path":"E:/example/checkout/work/windows-release/candidate-01/content-review.md","sha256":"实际审核记录sha256"}}
```

GitHub 命令使用已安装的 `gh`。优先使用进程环境中的 `GH_TOKEN`/`GITHUB_TOKEN`；否则只在内存中调用现有 Git 凭据助手，并传给该次子进程，不写 token 文件或输出原始认证错误。目标仓库由已审核的计划固定，示例仓库名必须替换。`draft` 会实际创建缺失的 tag 和草稿、上传附件，因此只对已经确认要发版的候选执行：

```powershell
python tools/packaging/release_github.py draft --plan "$releaseRepo/work/windows-release/candidate-01/publication/publication.json" --review "$releaseRepo/work/windows-release/candidate-01/publication-review.json" --run-dir "$releaseRepo/work/windows-release/candidate-01/draft-01"
if ($LASTEXITCODE -ne 0) { throw 'Draft preparation failed; inspect result.json before resuming' }
python tools/packaging/release_github.py publish --plan "$releaseRepo/work/windows-release/candidate-01/publication/publication.json" --review "$releaseRepo/work/windows-release/candidate-01/publication-review.json" --run-dir "$releaseRepo/work/windows-release/candidate-01/publish-01"
if ($LASTEXITCODE -ne 0) { throw 'Publication is incomplete; inspect result.json before notifying' }
```

工具先核候选提交已包含于远端 main，独立解引用 tag 并核 SHA，再处理 Release；已有 tag 不移动。草稿恢复只上传缺失附件，已存在附件须内容一致；遇到同名不同内容或额外附件停止，不调用覆盖/删除。每次操作用新 `run-dir`，保留失败及下载副本。发布前和公开后都下载核对大小及 SHA256，收据保存最终公开 URL；下载次数等统计变化不当成附件变更。已公开版本重跑只复核，不换包，也不自动设为 latest。

`result.json` 的 `draft-verified` 表示草稿附件已核验；`published-verified` 才能进入群通知。中断后保留同一计划和审核文件，用新目录重新执行对应命令；不得改已有失败收据。已公开但后续回核失败时，先核远端实际状态，仍不通知。完整构建和多次下载会占用多份文件空间，应在开始前核对剩余容量，不为重试清掉验收证据。

如果只有下载传输失败，可显式复用同级原始失败 run 中已经完成的下载；例如原命令是 `publish`：

```powershell
python tools/packaging/release_github.py publish --plan "$releaseRepo/work/windows-release/candidate-01/publication/publication.json" --review "$releaseRepo/work/windows-release/candidate-01/publication-review.json" --reuse-downloads-from "$releaseRepo/work/windows-release/candidate-01/publish-01" --run-dir "$releaseRepo/work/windows-release/candidate-01/publish-02"
if ($LASTEXITCODE -ne 0) { throw 'Download recovery failed; retain both runs' }
```

复用要求同一操作、仓库、tag、提交、Release ID、发布计划和审核引用，按旧下载操作顺序区分公开前后两阶段。旧成功项须仍有相同大小和 SHA256，且当前远端资产明确给出相同 digest；缺失或变化即停止。未完成项重新下载，不用同名存在、旧阶段文件或安装候选原件代替。新 run 复制并重新核验可复用文件，明确记录 `reuse-download` 与原收据 pin；原失败收据、部分文件和来源文件不改，远端/tag/附件前后检查仍执行。仅接受原始下载失败 run，不串接恢复链；再次失败可继续引用原始 run。恢复完成前保留其引用文件，之后再清理重复副本。这采用 [GitHub 资产摘要](https://docs.github.com/en/rest/releases/assets)作额外绑定，不使用 [gh 的 `--skip-existing` 或 `--clobber`](https://cli.github.com/manual/gh_release_download)冒充内容验证。

每个阶段验证结束后，及时按[开发文件管理](development-files.md#结项与保留)核对并清理本轮已无引用、可重建的临时依赖、缓存及校验成功的重复下载副本。先留存路径、大小、恢复依据和实际校验记录，再核对进程及链接，删除后检查保留文件和磁盘余量。最终安装器、对应源码包、发布计划及其引用材料、实际失败证据继续保留；未验证的文件不能按“旧产物”批量清理。

### 6. 持续迭代的固定交付约定

以下约定将上面的操作连成一次交付；自动化尚未实现的部分在下文明确标注。功能提交、候选构建、安装验收、公开发布、群通知是五种不同结果。源码进入 main 不代表用户已经收到新版 EXE；群通知也不替代安装验收。

1. **功能迭代时积累说明。** 在当前任务 README 记录用户能感知的新增、修复、兼容性变化和已知限制，附提交与验收依据。发布前从上一已发布 tag 到候选完整 SHA 核对实际范围，汇总成这一候选唯一的中文版本说明；未合入的功能不列入。
2. **冻结一次候选。** 版本仍取 `pyproject.toml`，沿用 PEP 440 的 alpha/beta/rc 表达；明确候选 SHA、目标 Windows 架构、固定输入和测试范围。运行贡献指南中相称的源码验证，再调用本页唯一构建入口。开发 Node、包内 Node、测试 Python 和包内 CPython 分别记录，不能互相充当运行验证。
3. **验收最终文件。** 将构建收据、EXE SHA256、产品闭包、安装验收报告与真实页面验收关联。检查失败、跳过及 `not_covered`，不能只读取顶层 `passed`。声明跨版本升级/回退时，还须核对两个产品的实际版本号不同。未来引入签名时，先签名，再计算最终 hash 和验收，不能签名后沿用未签名文件的验收身份。
4. **发布同一份候选。** 从已验收目录准备公开附件，使用 draft 上传、核验、公开、下载回核的顺序；发布阶段不重新编译。任何改源码、依赖、签名或包内容的操作都产生新候选，重做受影响验收；已公开的版本不得换包。
5. **最后通知。** 只有公开 Release、附件清单和下载核验一致后，才向约定群发送该版本的公告。失败候选、draft、仅源码提交均不发“已发布”。通知失败单独记为“软件已发布，群通知失败/结果未知”，保留 Release，不能重建或覆盖附件来重试通知。

版本说明采用固定内容：完整版本与早期测试/稳定标识、主要新增、修复、更新操作与数据兼容、实际验证范围、已知失败/未覆盖项、下载与校验入口。飞书公告消费这份说明的简短摘要，并链接到完整 Release；不能另让模型根据移动分支猜测功能。GitHub 标题和说明仍可能被编辑，发送时留存说明摘要 hash，避免事后无法解释群里发的是哪一版。

参考 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 的面向用户分类，先在既有任务记录和 Release 中维护，不为当前规模额外引入 changelog 框架。[GitHub 自动版本说明](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes)主要汇总 PR 和贡献者，可以辅助核对；本项目允许直接提交，不能只依赖 PR 标签生成完整公告。

### 7. 发布后复用远端 OpenClaw 飞书机器人

接入方向为已有远端 OpenClaw 的飞书应用机器人，不新增群 Webhook 或第二个监听器。机器人部署、实际账号/群、凭据与收发证据由其私有部署记录维护，不写入本仓库、安装包或公开发布附件。仓库提供 `tools/packaging/release_notify.py`，服务器是否已部署及首次真实收发以本轮任务收据为准，源码测试不能代替部署验收。

- **明确触发来源。** 本机构建/发布器确认下载回核后，将固定仓库的 Release ID、tag、受测 SHA、附件摘要和审核后的公告交给服务器通知入口。服务器重新核公开 Release 与目标仓库，不能只信任传入的“成功”字符串。传输复用受控 SSH 或既有经过认证的运维入口，不为通知把 OpenClaw 管理端口暴露公网。
- **复用固定发送身份。** 按已有项目机器人分工选择负责项目播报的账号，目标群来自服务器受控配置；事件不能任意指定账号、群、命令或 URL 主机。凭据留在服务器，继续由现有 OpenClaw 管理。无需为发送一条公告迁移认证协议、重启长连接或给群 Agent 开放任意 shell/消息工具。
- **优先确定性发送。** 调用安装版 OpenClaw 已支持的发送能力，显式指定 `channel=feishu`、account 和 target，传入已审核正文并读取真实消息回执。使用结构化参数/固定 argv，正文不得拼成 shell 命令。模型可协助起草，不能决定是否验收通过；正式公告发送不依赖模型和电脑端模型隧道在线。
- **先预览再联调。** 参考 [OpenClaw message CLI](https://docs.openclaw.ai/cli/message) 与 [飞书通道](https://docs.openclaw.ai/channels/feishu)，先核安装版本的 `message send --help`、账号路由和 `--dry-run`。帮助中有参数不证明权限、群路由或真实收发成功，dry-run 不算送达；最终还须核对指定群的真实 message ID。不能把旧版机器人正常聊天当作新版发布通知已验收。
- **持久记录与补发。** 以仓库、Release ID 和固定目标群组成投递身份；服务器在发送前记录 attempt，成功后保存 message ID、正文 hash 和时间，已成功的身份再次执行时跳过。按同一身份串行，重启后仍可查账。发送超时但可能已送达时标为未知，先核对回执/群历史，不盲目重发；普通 CLI 重跑不等于平台永久去重。Release notes 编辑不自动群发；需要勘误时另行审核内容和发送范围，不改写既有送达收据。
- **通知与发布分别恢复。** 限流、过期凭证、群权限或网络错误按服务端实际返回处理；通知错误不改变公开版本。初期只通知明确发布的版本，预发布清楚标注“早期测试版”，不自动 @ 全员、不上传安装器大文件到群。服务器不可达时在发布收据留下待通知状态，由同一入口恢复。

服务器私有配置提供 `repository`、`account`、`target`（固定群 ID）、`sender_app_id`（用于对账）、`openclaw_command`（固定 argv 数组）和 `state_dir`。从已有 OpenClaw profile 派生账号/群，不能由事件携带任意目标。通知工具只用 Python 标准库，复用本机 OpenClaw CLI，不启动模型；GitHub 只读查询可使用进程内 `GH_TOKEN`，凭据仍留服务器。

通过受控传输把公开发布收据与审核后的公告文本送至服务器，再依次执行以下命令；路径都是说明性占位。公告不超过2000字符，须含该 Release 的正式链接：

```sh
python3 release_notify.py preview --config /example/private/notify.json --event /example/private/published-result.json --message /example/private/announcement.txt
python3 release_notify.py send --config /example/private/notify.json --event /example/private/published-result.json --message /example/private/announcement.txt
```

`preview` 实际读取 GitHub 的公开状态、tag 和附件摘要，但不创建投递状态或发消息。核对预览后才调用 `send`；它先向 SQLite 提交投递领取，再调用固定账号发送。成功回执重跑跳过；同一版本/群更换正文或资产会拒绝。只有明确的 CLI 未启动错误可在修复环境后重新领取；非零退出、超时、坏回执等记 `unknown`，不得盲目补发。进程意外退出留下的 `attempt` 也不自动重发。

结果未知时，从实际群或原始回执取得 message ID，运行 `reconcile`（其余参数不变，增加 `--message-id`）。工具通过 OpenClaw 原生 `message read` 核对消息 ID、群、发送应用和正文；全部一致才记已送达。正文优先精确比较（仅统一 CRLF）；`post` 富文本另允许一种从审核正文推导的表示：删除真正空行，将整行裸 HTTPS URL 转为标签转义、目标完全相同的 Markdown 链接，其余文字和非空行原样比较。这对应 [OpenClaw 的富文本回读实现](https://github.com/openclaw/openclaw/blob/v2026.11.2/extensions/feishu/src/post.ts)，不通用剥离 Markdown 或忽略空白，也不接受不同链接目标。发布公告采用普通文字、分行和单独一行的下载链接，复杂格式仍须单独核对。

没有消息 ID、权限不足、正文变化或超出上述转换范围时继续保留未知状态，不把人工填写的“已发送”当成回执，也不提供强制重发开关。已经取得明确成功发送回执的版本保持已发送状态；后续回读失败需查证，不能因此再发一次。SQLite 和私有配置按服务器既有备份规则保留。

后续将发布放到 Actions 时，保留同一构建入口和以上合同。人工网页/本地授权身份发布可用 `release: published` 接通知；从 draft 公开预发布也应使用 `published`。如果发布使用 Actions 的 `GITHUB_TOKEN`，它产生的 release 事件不会启动另一普通 Release workflow，应在发布及回核成功后直接调用通知 job/复用 workflow，或显式 dispatch。参考 [GitHub 触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)；不要为绕过事件行为盲目扩大长期令牌权限。事件触发后仍须核验实际 Release 和附件。

### 8. 自动化建设顺序与验收边界

2026-11-11 基线审计发现验收与发布之间缺少机器衔接；当前已提供放行复核、11附件准备、GitHub 草稿/公开发布和 OpenClaw 通知工具。`build_windows_release.py` 仍结束于 `candidate-built-awaiting-acceptance`；`ci.yml` 已配置自动源码检查和手动完整检查。各阶段有明确命令和收据，不等于远端自动强制规则；真实候选发布与服务器通知验收分别记录。

后续按独立改动实施，每项先验证再推进下一项：

1. **本机放行记录已有入口。** 使用上节的 `record-check` / `verify` 关联证据；代码合同覆盖错提交、错包、缺材料、日志变动及同版本不同闭包拒绝。真实候选仍按本页构建和验收，不能用这些合成合同测试替代安装结果。
2. **附件和发布已有入口。** `release_bundle.py` 本地准备，内容审核后再执行 `release_github.py draft/publish`。代码合同覆盖中断恢复、错包拒绝和公开后只复核；正式首次运行仍须保存实际远端收据。
3. **通知工具按已有部署接入。** `release_notify.py preview/send/reconcile` 固定账号/群并持久记录投递；合成 CLI/API 测试覆盖并发、进程中断和未知结果。首次真实群发送、对账与防重复另记验收，不用测试消息冒充新版本发布。
4. **最后迁移可重复的构建环境。** 先把新机器如何准备固定工具、审核材料和依赖缓存跑通，再让 Windows runner 调用同一构建器。源码检查现由 push/PR 自动触发，完整 EXE 仍由明确的发布动作触发；是否将检查设为合并必需条件，另按实际协作规则配置。当前不改变 develop 预览确认、main 发布或非强制 PR/远端 CI 规则。

Windows 安装验收使用隔离标准账号和合成 profile，执行本页的正式验收器并保留安装、重装、卸载与数据保留证据；已有日常安装的账号不作为破坏性测试对象。[GitHub 托管 Windows runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)默认提供管理员权限且关闭 UAC，其结果不能替代标准用户或 Windows 10/11 干净机验收。候选、验收器和源码 CI 各自记录提交与 hash；用新验收器测试旧候选时，不能把新提交的 CI 收据算作旧候选的源码验证。

签名服务、Windows 10/11 干净机矩阵、客户端发现/下载更新及数据格式回退需要各自验收；安装器原位升级能力不等于客户端自动更新。优先保证整包更新和数据兼容，再按需要评估差分更新。SHA256 证明文件一致，发布者签名证明身份，来源证明绑定构建来源；没有独立两次构建逐字节对比，不称为[可复现构建](https://reproducible-builds.org/docs/definition/)。

远端可考虑启用 [GitHub 不可变 Release](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)：draft 集齐附件后公开，锁定附件与 tag；标题/说明及预发布标记仍可修改。这是服务端设置，不是写进文档就生效；本次未核实该仓库的启用状态或分支保护，不作已启用声明。

上述取舍参考实际开源实现：[ShareX build.yml](https://github.com/ShareX/ShareX/blob/master/.github/workflows/build.yml) 的构建产物转交、签名和正式 tag 草稿；[OBS push.yaml](https://github.com/obsproject/obs-studio/blob/master/.github/workflows/push.yaml) 的 build/sign 后生成 draft；[uv release.yml](https://github.com/astral-sh/uv/blob/main/.github/workflows/release.yml) 的手动触发、dry-run、版本冲突检查和附件清单。采用阶段衔接与同一产物发布，不复制其多平台、商店、PyPI/Crates 发布体系，也不引入第二套构建框架。
