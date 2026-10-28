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

这里维护每次出新 EXE 的唯一流程；日常开发从 [贡献指南](../../.github/CONTRIBUTING.md#开发与出包从这里开始)进入。是否已经交付，以该版本的实际验收记录与 Release 为准。

```text
确认开发验收 → 冻结版本与提交 → 准备固定输入
  → Python sdist / wheel + Rust release observer + 内置工作台
  → 核验依赖许可与对应源码 → 组装 payload → Inno 编译 EXE
  → 安装与真实页面验收 → 附件和 SHA256 → 发布同一提交的版本
```

### 0. 当前自动化边界

2026-10-28 核对源码发现以下断点；它们是待补齐的实现工作，不能用文档步骤代替。

| 现有入口 | 当前状态与处理 |
| --- | --- |
| `tools/packaging/workbench_engine.py build` | 编译后自动核许可闭包，但没有生成外部许可输入的步骤；全新 run 缺少材料时仍会失败，按第 3 步补齐并复核 |
| `tools/packaging/build_windows.py` | 已要求完整桌面输入；第 4 步给出全部参数 |
| `.github/workflows/release.yml` | 仍缺五个必需参数及其准备步骤：`engine-root`、`engine-run`、`portable-git`、`git-receipt`、`endpoints`；目前不能用于完整桌面产品的一键发布 |
| `tests/e2e/verify_installed_product.py` | 仍断言旧 gateway 启动器；当前桌面入口已是 `control_everything.http.desktop --product-root`，旧脚本会先安装再因启动器断言失败，不能直接作为新产品验收入口 |

当前可按本地分阶段流程构建候选，安装验收由专用环境人工完成并留证。未来自动化优先补齐这几个已有入口，复用同一链路，不再增加第二套打包系统。

### 1. 冻结本次版本和源码

- 界面改动先完成 develop 真实预览与项目主导者确认，再进入 main 发布流程。开发候选可来自明确的 develop 提交，必须标为候选；它不等于已发布版本。
- 产品版本唯一来源是 `pyproject.toml`，wheel 元数据、产品清单与安装器消费同一值，Inno 数值版本由固定映射生成；版本变更作为独立提交。核对目标 tag/Release 是否已存在，已发布版本不换包、不移动 tag，新交付使用新版本。
- 在独立、干净的源码检出固定完整 40 位 SHA，核对 `git rev-parse HEAD` 与 `git status --short --branch`。不要直接拿有他人修改的共享工作树出包，也不要为出包还原其内容。
- 引擎来源清单核对实际字节；Windows 检出须注意 LF/CRLF，使用保留源码字节的独立检出。先跑 `check-source`，不要修改清单来掩盖换行漂移。
- 在本检出 `docs/current/<feature>/README.md` 登记版本、SHA、负责人、输入和输出；每轮新建 `work/<feature>/<run>/`。保留失败目录，重试另用新目录。正式 engine、observer 输出继续使用下面的固定目录合同。

以下 PowerShell 示例从该干净检出根目录执行。替换工具绝对路径与本轮名称；`python` 使用已激活、已核验的开发环境。示例按阶段执行，不是复制后即可无人值守出包的脚本：

```powershell
$repo = (Get-Location).Path
$run = 'candidate-01'
$releaseRoot = Join-Path $repo "work/windows-release/$run"
$engineRoot = Join-Path $repo 'web/workbench-engine'
$engineRun = Join-Path $repo "work/workbench-engine-build/$run"
$buildNode = 'C:/example/node24/node.exe'
$buildPnpm = 'C:/example/pnpm/pnpm.exe'
if (Test-Path $releaseRoot) { throw 'Use a new release directory' }
New-Item -ItemType Directory -Path $releaseRoot | Out-Null
```

### 2. 准备固定输入

工具首次准备和每次发版分开：可复用已核验工具与下载缓存，但每次仍核 pin、hash、输入来源和实际文件。所有运行材料留在 ignored work；不要提交二进制或真实配置。

| 输入 | 权威来源与要求 |
| --- | --- |
| Python / 构建依赖 | 开发环境见贡献指南；包内 CPython 3.13.16 及 Inno Setup 7.1.0 的 URL、SHA256、发布者在 `tools/packaging/downloads.json`；构建依赖在 `tools/packaging/requirements.txt` |
| Python 运行轮子 | `tools/packaging/windows-cp313.lock` 固定 Windows x64 / CPython 3.13 轮子及 hash；不能使用宿主 `pip freeze` 替代 |
| Rust / MSVC | `rust-toolchain.toml` 的 Rust 1.97.1 x64 MSVC，及 Visual Studio C++ Build Tools；[首次准备步骤](../../.github/CONTRIBUTING.md#windows-原生观察开发) |
| 内置工作台 | 显式 Node 24 与 pnpm 12.14.0 原生 EXE；`workbench-engine-source.json` 和各锁文件，开发 Node 与包内 Node 的 pin 分开核对 |
| Portable Git | `desktop_payload.py` 固定 2.56.0.windows.3 和官方归档 hash；完整文件收据、逐组件许可、对应源码材料，不能直接打包开发机 Git |
| 自建服务端点 | 本轮 `endpoints.json` 严格仅有 `issuer`、`hub_origin`；纯本地候选均为空字符串，接入自建服务时两者均为有效 HTTPS 地址，不含凭据，不回退官方服务 |

按 `downloads.json` 下载并核 SHA256；核 CPython 解包后 `python.exe`、Inno 下载器的 Authenticode 发布者。参考 [现有 workflow 的下载与验签步骤](../../.github/workflows/release.yml)，准备本轮 `prepared/python-3.13.16-embed-amd64.zip`、`prepared/inno/ISCC.exe` 和 `prepared/inno/license.txt`；该参考不表示整个 workflow 已适配。

Portable Git 暂无正式 receipt 生成命令。准备负责人须核官方归档 hash、完整解包文件的大小/hash、组件归属、完整 notice 与对应源码文件；receipt 的 `source_materials` 相对 receipt 所在目录解析。缺项必须停在准备阶段，不能手填“已验证”或套用合成测试数据。具体消费合同见 [desktop_payload.py](../../tools/packaging/desktop_payload.py)。

### 3. 分别构建三部分

**Python 包。** 默认先构建 sdist，再从 sdist 生成 wheel；新目录中应各有一个包。固定下载轮子，不让安装器在用户机器临时安装依赖。

```powershell
python -m pip install -r tools/packaging/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Build dependencies failed' }
python -m pip install -e .
if ($LASTEXITCODE -ne 0) { throw 'Project environment failed' }
python -m pip check
if ($LASTEXITCODE -ne 0) { throw 'Dependency check failed' }
python -m build --outdir "$releaseRoot/dist"
if ($LASTEXITCODE -ne 0) { throw 'Python package build failed' }
python -m pip --isolated download --only-binary=:all: --platform win_amd64 --python-version 313 --implementation cp --abi cp313 --no-deps --require-hashes -r tools/packaging/windows-cp313.lock --dest "$releaseRoot/wheelhouse"
if ($LASTEXITCODE -ne 0) { throw 'Locked wheels failed' }
```

**Rust 观察后台。** 在已准备的 VS Native Tools 与固定 Rust 环境执行：

```powershell
foreach ($command in @('fmt', 'test', 'clippy')) {
    python tools/scripts/build_observer.py $command
    if ($LASTEXITCODE -ne 0) { throw "Observer check failed: $command" }
}
python tools/scripts/build_observer.py build --release
if ($LASTEXITCODE -ne 0) { throw 'Release observer failed' }
```

产物在 `work/native-observer/release-install/`：EXE、`manifest.json`、`build-info.json`。普通 `install/` 是开发产物，不用于发布；release 构建固定静态 CRT。按首次准备的同一组 `RUSTUP_HOME/CARGO_HOME/CARGO_TARGET_DIR`，运行固定工具链的 `cargo metadata --manifest-path native/observer/Cargo.toml --locked --format-version 1`，检查退出码，再将结果的 `packages` 数组保存为本轮 `cargo-packages.json`。许可收集会读取其中 manifest 所在 crate 的材料，不能复用路径已经失效的旧 JSON。

**内置工作台。** `scratch-root` 固定为本检出 `work/ce-native`；`run-dir` 必须全新，源码中的 `out/`、`.build/` 也不能已有产物。它按序安装锁定依赖、构建 packages、移动 Web 资源、原生组件、Web 和 Windows runtime。

```powershell
python tools/packaging/workbench_engine.py check-source
if ($LASTEXITCODE -ne 0) { throw 'Engine source check failed' }
python tools/packaging/workbench_engine.py build --node $buildNode --pnpm $buildPnpm --scratch-root "$repo/work/ce-native" --run-dir $engineRun
if ($LASTEXITCODE -ne 0) { throw 'Engine build or distribution check failed; inspect this run' }
```

**这里存在人工断点。** 按当前源码，fresh build 最后会调用 `check-output`，而它消费的 `external-dependency-notices.json` 没有自动生成步骤；缺材料会在编译后报 `distribution_notices_incomplete`。保留失败及 `steps.json`、各步日志，先确认实际失败阶段。准备负责人依据本次实际产物，在该 engine run 中补齐五类外部组件（pinned-node、windows-security、windows-cli-launcher、node-pty-conpty、ripgrep）的完整来源、notice、hash 和输出映射；实际依赖缺许可时还需 `package-license-inputs.json`。合同见 [workbench_distribution.py](../../tools/packaging/workbench_distribution.py)，目前没有正式材料准备 CLI。

只在编译产物完整、材料准备妥当后运行以下复核，不在同一目录重新执行 build：

```powershell
python tools/packaging/workbench_engine.py check-output --run-dir $engineRun
if ($LASTEXITCODE -ne 0) { throw 'Engine distribution remains unverified' }
```

进入下一步前核 `build-provenance.json` 中 `status=build_only_verified`、`distribution=closure_verified`，并核 `hostCommit` 与本轮 SHA、源码 hash 和 `output-manifest.json` 对应。不得改写 provenance 制造成功，也不能拿旧 engine 输出配新界面源码。

### 4. 组装产品并编译 EXE

先准备上述真实材料，再填写全部参数；路径都必须为绝对路径。`payload` 与同级同版本 `sources.zip` 必须不存在，`--release` 要求已提交且干净的源码。

```powershell
$wheels = @(Get-ChildItem -LiteralPath "$releaseRoot/dist" -Filter '*.whl')
if ($wheels.Count -ne 1) { throw 'Expected exactly one project wheel' }
python tools/packaging/build_windows.py --release --wheel $wheels[0].FullName --wheelhouse "$releaseRoot/wheelhouse" --runtime-zip "$releaseRoot/prepared/python-3.13.16-embed-amd64.zip" --observer-release "$repo/work/native-observer/release-install" --output "$releaseRoot/payload" --cargo-packages "$releaseRoot/cargo-packages.json" --inno-license "$releaseRoot/prepared/inno/license.txt" --engine-root $engineRoot --engine-run $engineRun --portable-git "$releaseRoot/prepared/portable-git" --git-receipt "$releaseRoot/prepared/portable-git-receipt.json" --endpoints "$releaseRoot/prepared/endpoints.json"
if ($LASTEXITCODE -ne 0) { throw 'Product assembly failed' }
python tools/packaging/inno_include.py --payload "$releaseRoot/payload" --output "$releaseRoot/inno-includes"
if ($LASTEXITCODE -ne 0) { throw 'Installer includes failed' }
& "$releaseRoot/prepared/inno/ISCC.exe" "/DPayloadIncludeDir=$releaseRoot/inno-includes" "/DInstallerOutputDir=$releaseRoot/installer" tools/packaging/session-panel.iss
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed' }
```

`product.json` 记录版本、源码 SHA、文件 hash 与闭包；`BUILD-INPUTS.json` 记录构建输入。产品内包含固定 Python、Node/工作台、Git/SSH、观察后台和界面资源。Inno 的退出码 0 才是编译成功，1/2 分别表示参数/致命错误或编译失败，见 [官方编译器说明](https://jrsoftware.org/ishelp/topic_compilercmdline.htm)。

主要产物：

| 路径（相对本轮 releaseRoot） | 用途 |
| --- | --- |
| `dist/*.tar.gz`、`dist/*.whl` | Python 源分发与 wheel，不等于完整桌面产品 |
| `payload/` | 已核验的完整运行闭包 |
| `installer/session-panel-<version>-windows-x64.exe` | 本次安装器 |
| `session-panel-<version>-sources.zip` | 依赖对应源码附件，必须随安装器发布 |
| `payload/SOURCE-AVAILABILITY.json` | 上述附件的文件名、大小、SHA256、成员索引 |
| `inno-includes/include-receipt.json` | 安装清单与产品闭包的绑定证据 |

### 5. 安装与界面验收

当前没有适配完整桌面入口的正式安装验收 harness；旧 `verify_installed_product.py` 的缺口见第 0 步。不要清除真实安装登记去强行运行它。选择专用 Windows 用户或干净测试机，使用合成 profile 和新证据目录，人工记录：

- 首次安装、开始菜单实际启动、`/studio` 及内置工作台能打开；核产品版本、源码 SHA 和安装器 SHA256。
- 受控 PATH 不依赖开发机 Python/Node/Rust；终端、Git、观察后台、业务读写与数据重启保留分别核验。
- 同版本重装、运行中维护阻塞、正常停止、卸载后 profile/备份保留。
- 使用两个真实不同版本验证升级与回退；一个版本的重装不能替代。不要默认旧程序兼容新数据格式。
- 两种系统、真实资讯、桌面返回、远端账号/设备和 SSH 按实际覆盖逐项记证据；未配置服务、未测平台及 Android APK 均明确标注未验证。

源码预览、浏览器 harness 和单元测试只证明各自范围。验收中任何失败保留原日志与安装状态，再决定修复或清理，不自动强杀进程。EXE 编译成功但未通过上述验收时，状态是“候选待验收”。

### 6. 发布同一批受测附件

1. 在本轮 `public/` 按明确清单准备：安装器、`session-panel-<version>-sources.zip`、`SOURCE-AVAILABILITY.json`、`product.json`、`BUILD-INPUTS.json`、项目 LICENSE、完整第三方声明、版本说明，以及计划提供的 wheel/sdist/项目源码快照。不要把整个 work 或验收目录上传。
2. 对照产品清单核 version、commit、dirty=false、闭包；核源码附件大小/hash 与 SOURCE-AVAILABILITY 一致。`git archive` 的项目源码快照不能替代依赖的 `sources.zip`。
3. 生成覆盖所有公开附件的 `SHA256SUMS.txt`（不含它自身），重新核 hash。发布说明写变更、准确 SHA、已测范围、全部已知失败/限制、签名状态和回退条件。
4. GitHub Release 的 tag 指向本次受测提交，技术预发布使用 `v<版本>`。手动发布时先建 draft、上传并核对附件，再公开 prerelease；已有 tag 不移动、已发布附件不覆盖。参考 [GitHub 发布流程](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。
5. 发布后核 Release URL、`isDraft=false`、`isPrerelease=true` 与下载附件；更新首页/使用指南的版本和下载链接。在任务 README 留存最终证据，按文件管理规则归档。上传 Actions artifact、push 源码、创建 tag 都不单独代表发布完成。

`release.yml` 现有设计要求完整 SHA 已在 main，且同一 SHA 的 `windows-tests`、`architecture-boundaries`、`new-content-checks` 均成功；随后只给发布 job 写权限。保留这些既有约束。待第 0 步的准备和验收缺口修复并实际验证后，才恢复用它自动发布；当前不提供会失败的 dispatch 命令作为推荐入口。
