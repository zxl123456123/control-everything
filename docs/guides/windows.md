# Windows 安装与维护

[返回项目首页](../../README.md) · [使用指南](usage.md) · [可选接入](integrations.md) · [开发工作流](../../.github/CONTRIBUTING.md#开发与出包从这里开始)

本文命令均从仓库根目录执行；安装版的专用命令另行注明。

## Windows 标准安装

当前提供 [0.1.0a1 Windows x64 开发预览版](https://github.com/zxl123456123/control-everything/releases/tag/v0.1.0a1)。安装器尚未签名；实际验证范围和未覆盖项目见该版本说明。开发者也可按[源码启动指南](usage.md#多-agent-工作台)运行。

普通用户从 [GitHub Releases](https://github.com/zxl123456123/control-everything/releases) 下载 `session-panel-0.1.0a1-windows-x64.exe`，先用 `Get-FileHash -Algorithm SHA256` 与该次发布的 `SHA256SUMS.txt` 核对，再运行安装器。标准产品自带 CPython 3.13.16、固定 Python 依赖、前端资源和 release Rust 原生观察后台，无需另外安装 Python、Node、npm 或 Rust 编译器。源码归档供开发使用，不能代替完整安装器。

安装目录支持中文和空格；当前产品按普通 Windows 路径工作，每个完整交付文件路径须少于260个UTF-16字符。安装器在写入目标前检查整个固定文件清单，超限时提示选择更短目录，不修改系统的长路径策略。

安装按当前用户运行，无需管理员权限，默认位置为 `%LOCALAPPDATA%/Programs/SessionPanel`。从开始菜单的 **Session Panel** 打开网关控制台，再在浏览器访问 `http://127.0.0.1:8766/workspace`；安装不会自动启动网关或外部 Agent。端口被占用时明确退出，可从 PowerShell 指定自己的端口和 profile：

```powershell
$panel = Join-Path $env:LOCALAPPDATA 'Programs/SessionPanel/session-panel.cmd'
& $panel --data-dir 'C:/example/SessionPanel/main' --port 14401
```

在所属控制台按 Ctrl+C 正常停止网关。关闭页面或网关不会终止独立原生观察后台，更不会终止外部 Agent。维护前先停止自己运行的全部网关；安装器会核对本安装登记的全部版本及 profile，并通过每个后台原来的 EXE 正常停止自有观察进程。未知身份、仍运行的 HTTP 或无法证实退出的进程会阻止维护，保留现有入口，不按程序名强杀，不接管其他安装或 profile。

升级保留旧版本目录，安装文件核验和登记完成后才切换 `session-panel.cmd`。重新运行可信的原版本安装器可选择该版本的完整闭包；同版本可重新安装。回退前保留 profile 备份，并确认旧程序支持当前配置和管理库格式；安装器不会隐式迁移、降级或搬迁数据。卸载使用 Windows“已安装的应用”中的 **Session Panel**，只处理安装日志和严格核验的自有管理文件；profile、备份和未知用户文件保留。卸载不会替你关闭网关，遇到阻塞先正常退出自己运行的实例，再重试。

目标平台为 Windows 10/11 x64；技术预发布的安装器与原生程序目前未签名，上游组件的数字签名不代表组合产品已签名。每次发布说明列出实际验收范围；开发机或托管 Windows runner 的受控 PATH 验收不能替代两种系统的完整干净机器验证。项目源码采用 [MIT 许可证](../../LICENSE)；随产品附带项目许可证及实际依赖的第三方声明与摘要，第三方依赖遵循各自的许可证。

新安装从“添加项目”进入三个默认工具，程序登记与项目来源读取各自确认；只展示用户选择加入的项目。非标准安装可登记本机 EXE，并手工添加项目目录。普通用户使用产品内运行时和原生组件，不需要 Node、Rust 或作者的预注册配置。来源格式范围、许可、移出及 v4 备份恢复行为见[使用指南](usage.md)。界面开发先提供 develop 真实预览，确认后合入 main；源码检查不能替代实际安装与浏览器验收。

## 构建与技术预发布

日常开发从 [贡献指南](../../.github/CONTRIBUTING.md#开发与出包从这里开始)进入。Windows 候选统一用 `tools/packaging/build_windows_release.py` 构建，实际安装验收和公开发布分开执行。

```text
确认开发验收 → 冻结版本/SHA → 核验并准备固定输入
  → 本机统一命令：Python 包 → Rust release observer → 内置工作台
  → 当前产物许可绑定 → 严格 payload → Inno EXE → 候选待验收
  → 专用环境安装验收 + 真实页面验收 → 校验公开附件 → 发布
```

旧 `.github/workflows/release.yml` 云端出包配方已经退役，历史保留在 Git；不再维护一套与本机构建不同的配方。`ci.yml` 保留手动源码检查。以下源码合同通过不等于某个新版本已实际构建、安装或发布；以该版本的收据为准。

### 1. 冻结版本与准备环境

界面改动先完成 develop 真实预览和项目主导者确认，再进入 main 发布流程。develop 的明确提交可以构建开发候选，必须与已发布版本区分。产品版本只改 `pyproject.toml`，wheel、产品清单与安装器消费同一值；版本变更单独提交。已发布版本不换包、不移动 tag，新交付使用新版本。

按 [工作树生命周期](development-files.md#工作树的开始依赖和结束)建立独立、干净的检出，固定完整 40 位 SHA。每个 checkout 独立安装依赖；工具、下载与已审核材料可以按合同复用，依赖根不得链接到其他工作树。本机任务 README 记录版本、SHA、负责人和验收范围，旧材料先核来源和 hash，不能裸运行历史 driver。

首次准备 Python editable 环境与固定构建依赖见贡献指南；统一入口不安装或升级环境。使用 Windows x64、Node 24、pnpm 12.14.0 原生 EXE、[固定 Rust/MSVC 环境](../../.github/CONTRIBUTING.md#windows-原生观察开发)。包内 Node 与开发 Node 分别核 pin，Python 运行轮子使用 `tools/packaging/windows-cp313.lock`。

`tools/packaging/downloads.json` 是 CPython 和 Inno Setup 下载 URL、SHA256、发布者的唯一配置。下载后核 SHA256；对 CPython 解包后的 `python.exe`、Inno 下载器及所选编译器核 Authenticode 状态和发布者，保留证据，不能把组合产品说成已签名。准备 Inno 工具目录中的 `ISCC.exe` 和 `license.txt`；准备工具不等于安装本产品。

Python wheel 的许可由 `notices.py` 收集实际原文。少数已审查但未携许可的官方 wheel 由 `wheel-notices.json` 精确绑定文件名、版本、官方 SHA256 和逐份原文 SHA256；原文保存在 `wheel-notices/` 并逐文件登记归属及内容检查。补充表不接受改过的 wheel，不会跳过缺失、空白或哈希变化的许可；升级这些依赖必须重新核上游构建组件与许可。SentencePiece 0.2.2 的声明还覆盖嵌入的 Abseil、protobuf-lite、darts、esaxx、pybind11 和 Unicode 数据；上游未锁定 pybind11 patch，清单明确保留该限制，使用已核字节相同的 3.0.0～3.0.4 共同原文。

本地翻译的 CTranslate2 4.8.3 使用未修改的官方 wheel。补充声明保留其实际构建配方中的开源库以及 CUDA、cuDNN、Intel OpenMP/oneMKL 完整条款和嵌套声明；cuDNN/OpenMP DLL 已与对应官方发行材料逐字节对照。Intel 再分发清单来自具有有效 Intel 签名的 oneAPI 2025.3.0.372 安装器中的 `credist.txt`，明确列出该 OpenMP DLL；清单引言的旧 EULA 年份与同包 EULA 原文均保留，不自行改写。UTF-8 转码、RTF 纯文本呈现及完整源许可注释的提取均登记来源与转换前后哈希。模型另按其实际 CC-BY-4.0 条款保留署名，不能用这两份 wheel 的许可覆盖模型。

### 2. 一份本机输入清单

将 `inputs.json` 放在 ignored `work/windows-release/inputs/`，九项路径均使用自己的绝对路径。下例是结构说明，替换全部占位后才能执行；真实清单不提交：

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
  "inno_dir": "C:/example/checkout/work/windows-release/inputs/inno"
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

`workbench_materials.py` 在编译前核材料结构，编译后核源码 pin、提供者与产物字节一致，并从实际构建图及来源清单关联资源。生成本轮 external/package notice 与 `materials-receipt.json`，最后仍由原 collector 检查完整闭包。新增依赖或来源改变需重新审阅材料；不联网猜许可证、不改写旧成功收据、不中途跳过门禁。

**Portable Git 使用已审核的完整收据。** 初次从官方固定归档准备运行目录时，须留存解包来源及审核后的 `reviewed-git-receipt.json`，其中包含固定 archive_sha256/version、全部 files 的大小/hash、components 的归属/notice/源码履约材料。后续复用或迁移材料时执行：

```powershell
python tools/packaging/desktop_payload.py prepare-git --archive C:/example/checkout/work/windows-release/inputs/PortableGit.7z.exe --portable-git C:/example/checkout/work/windows-release/inputs/portable-git --reviewed-receipt C:/example/checkout/work/windows-release/inputs/reviewed-git-receipt.json --output C:/example/checkout/work/windows-release/inputs/portable-git-receipt.json
if ($LASTEXITCODE -ne 0) { throw 'Portable Git preparation failed' }
```

命令核 `desktop_payload.py` 固定的官方归档 SHA256，再以已审 files 逐项核当前目录，复用产品组装的组件覆盖、许可和对应源码校验；同名文件改动也会拒绝，不能重算 hash 给它重新背书。新输出与已审收据必须同父目录，使 `source_materials` 相对路径有效；输出不能在运行目录内，也不能覆盖旧收据。工具不执行解包器、不创造初始信任依据；缺少已审收据时停在材料准备，不把当前目录扫描当成官方来源证明。

### 3. 每次只运行一个构建入口

确认工作树干净、输入审核妥当、固定环境已准备，然后从本检出根执行：

```powershell
python tools/packaging/build_windows_release.py --inputs C:/example/checkout/work/windows-release/inputs/inputs.json --run-name candidate-01
if ($LASTEXITCODE -ne 0) { throw 'Candidate build failed; inspect the retained receipt and logs' }
```

入口逐阶段调用已有工具，不启动产品或个人 Agent：

| 阶段 | 实际入口 / 门禁 |
| --- | --- |
| 输入与环境 | 完整 SHA、干净检出、新输出目录、Node/pnpm、Python 固定构建依赖、CPython pin、材料结构 |
| Python 包 | `python -m build`，sdist → wheel，要求各一个 |
| 原生观察 | 固定 `build_observer.py` 的 fmt/test/clippy/release，静态 CRT；同一工具链用 `--filter-platform x86_64-pc-windows-msvc` 生成 Cargo 元数据，从 resolve 图选择观察后台根及传递 normal/build 依赖，逐包保留完整许可校验 |
| 内置工作台 | `workbench_engine.py build --materials ...`，源码检查、锁定依赖、编译、产物探针、材料绑定、完整许可闭包 |
| 产品组装 | `build_windows.py --release`，完整十二项输入，源码与轮子、engine、observer、Git及源码附件逐项验证 |
| 安装器 | `inno_include.py` → `ISCC.exe`，精确文件清单与 hash；编译器退出码非0即停止 |

每轮使用新的 run-name 和干净检出；不覆盖已有 release 输出、engine 的 `out/.build` 或已存在的 release observer。失败保留完整 stdout/stderr 与阶段退出码，修复后另建候选，不自动删目录重试。

| 本检出路径 | 用途 |
| --- | --- |
| `work/windows-release/<run>/build-receipt.json` | 每步命令、日志、退出码，最终源码/版本/闭包与安装器、源码附件 hash |
| `work/windows-release/<run>/dist/` | sdist 与 wheel |
| `work/windows-release/<run>/payload/` | 完整运行闭包、product.json、BUILD-INPUTS.json、SOURCE-AVAILABILITY.json |
| `work/windows-release/<run>/installer/session-panel-<version>-windows-x64.exe` | 安装候选 |
| `work/windows-release/<run>/session-panel-<version>-sources.zip` | 必须伴随安装器交付的依赖对应源码 |
| `work/workbench-engine-build/<run>/` | engine 各步日志、来源/产物/许可证明 |
| `work/native-observer/release-install/` | 固定 release 观察后台与构建身份证明 |

最终状态 `candidate-built-awaiting-acceptance` 只表示候选生成。单独开发 engine 时仍可使用底层 build（现在必须传 `--materials`）；复核已有产物用 `check-output --run-dir ...`，需要首次绑定材料时加 `--materials`。已有不同材料拒绝覆盖，不能先制造失败再手工改 hash。

### 4. 安装与真实页面验收

`tests/e2e/verify_installed_product.py` 根据已安装清单区分新 desktop 与旧 gateway。新产品使用实际 Desktop 装配和生命周期，核 runtime ready、Studio、完整已登记 Web 资源与 desktop 页面。它会真实安装、运行和卸载，只在没有同 AppId/开始菜单入口的专用 Windows 用户或测试机执行：

```powershell
python tests/e2e/verify_installed_product.py --payload C:/example/checkout/work/windows-release/candidate-01/payload --installer C:/example/checkout/work/windows-release/candidate-01/installer/session-panel-0.1.0a2-windows-x64.exe --evidence C:/example/checkout/work/windows-release/candidate-01/installed-evidence
if ($LASTEXITCODE -ne 0) { throw 'Installed acceptance failed; retain the installation and evidence' }
```

示例文件名替换为实际版本。两个真实不同版本的升级/回退需再传 `--second-payload`、`--second-installer`，不能用同版重装冒充。测试保留已有安装拒绝、维护阻塞、profile/备份保留及失败不强杀规则；不得清除真实安装登记来强行执行。

另外人工核开始菜单/cmd 实际启动、真实浏览器交互、数据重启保留及适用的资讯、终端、Git、桌面返回、远端账号/设备和 SSH。源码合同、内部 Desktop 装配不证明 cmd wrapper 已运行。Win10/11 矩阵、手机现场、Android APK、未配置服务等分别标明实际覆盖，不能以一次本机成功代替。

### 5. 验收后发布

1. 公开发布前确认受测提交已在 main（界面已经项目主导者确认），版本与 tag 未占用。需要远端检查时手动执行 `ci.yml` 并核同一 SHA；push 不会自动触发它。
2. 在本轮 `public/` 按明确清单准备安装器、同版本 `sources.zip`、SOURCE-AVAILABILITY、product、BUILD-INPUTS、LICENSE、完整第三方声明、版本说明，以及计划提供的 wheel/sdist/项目源码快照。只上传审核后的公开文件；本机输入与验收日志不上传。
3. 核 version、commit、dirty=false、闭包及对应源码附件大小/hash；生成覆盖全部附件的 `SHA256SUMS.txt`（不含自身）并重核。`git archive` 项目快照不能替代依赖对应源码附件。
4. 建指向受测 SHA 的 `v<版本>` draft，上传并核附件后再公开 prerelease；不移动已有 tag、不覆盖已发布附件。说明写实际验收范围、所有已知失败/限制、签名状态和回退条件。参考 [GitHub 发布流程](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。
5. 核 Release URL、`isDraft=false`、`isPrerelease=true` 和实际下载附件；更新首页版本/下载链接，并按文件管理指南归档本轮证据。源码推送、候选生成与公开发布分别记录。

采用 [Python subprocess](https://docs.python.org/3/library/subprocess.html) 的固定 argv 与退出码记录、[Inno 官方命令行编译](https://jrsoftware.org/ishelp/topic_compilercmdline.htm) 和 GitHub draft 发布方式。保留项目现有构建器及许可校验，不新增另一套通用编排框架。
