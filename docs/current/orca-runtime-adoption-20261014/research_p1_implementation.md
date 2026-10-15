# P1 实施前补充事实

日期：2026-10-14；角色：repo_researcher；受众：共享。固定上游 `stablyai/orca@aceebea0a4453f63d759af9134503220ce0b4753`，package 版本 1.4.214。本轮仅公开源码读取与本地代码核查；未安装、构建、启动 Orca，未读取凭据或私人正文，未调用模型。

## A. 结论与系统边界

第一批可以规划独立的**离线 P1 证据预检工具**：核对明确提供的固定源码/构建证据、计算哈希、校验合成环境映射与候选参数、输出仍缺的证据。它与产品执行链无连接，也不启动任何进程、打开监听或生成账号。其价值是拒绝版本混用、宽监听候选、继承宿主环境及把主进程退出误报为全树退出；它不能出具 runtime 可运行或安全隔离结论。具体函数/输入/输出由 lwplan 定义，不由本研究替代设计。

真正运行仍有阻断：上游直接 Node entry 启动多个后台服务，且 terminal daemon **设计为在 runtime 停止后存活**。现有本地 OwnedProcess 会继承环境并要求 JSONL，不能原样作为该入口的无账号启动器。高层架构仍成立为条件采用与验收目标；这个发现细化 P1 的实际验收责任，不等于推翻架构。

## B. 构建、入口与版本证据

以下链接均是本轮实际取回的固定 SHA 一手文件。副本在 `work/orca-p1-research/`，路径中的 `/` 转成 `__`；副本仅研究材料，不是发行物。

| 一手来源 / 锚点 | 实际事实 | 可编码预检的边界 |
|---|---|---|
| [package.json](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/package.json) 的 scripts / engines / packageManager | `build:orcad` 先 build:packages 再运行 `config/scripts/build-orcad-node.mjs`；Node engine 24，pnpm 12.8.1；有 postinstall / native rebuild | 不能把 npm 包名、版本号或 `pnpm install` 当成无副作用的取得步骤；未证明公开 release asset 与此 SHA 一一对应 |
| [build-orcad-node.mjs](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/config/scripts/build-orcad-node.mjs) 的 main / ensurePrebuildSlot / placeRuntime | 支持 `--target`、`--out-dir`；默认 `out/orcad`。缺本机 node-pty slot 时会运行 prebuild 脚本；会下载/放置 pinned Node 并执行 `--version`，再调用 build-orcad.mjs | 源码构建路径已确认，但不是本轮可执行动作，也不是已成功构建 |
| [node-runtime-pin.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/shared/node-runtime-pin.ts) 的 NODE_RUNTIME_PIN / NODE_RUNTIME_ASSETS | Node **24.21.0**，Electron 对齐 43.7.5；支持 win32-x64 / win32-arm64。x64 node.exe SHA256 为 `ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32`，大小 93580104；arm64 hash `dff59da18b6ffe1bf1ca99e1d2af4906080c481740619f5b5098c0fca28bd9b7` | 可以对操作人员另行提供的文件离线校验；这里的 hash 是上游声明，不是本机已经持有该文件的证明 |
| [orcad-artifacts.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/shared/orcad-artifacts.ts) 的 orcadArtifactFilenames / orcadNodeRuntimeRelativePath | 已有上游清单：`orcad.js` 是 launcher，`orcad-server.js` 是 server entry；还有 `daemon-entry.js`、watcher/SQLite/profile worker、CLI、node-pty、ripgrep 等。Node slot 标记 `.server-target`、`.runtime-node`，不能携带 Bun `.build-target`；Node 位于 slot 的 `../runtimes/node-<executableSha256>/node.exe` | 不能只验证一个 orcad.js 就声称 bundle 完整；不需要自创通用签名/清单系统。`.version` 内容生成、安装 `.install-complete` 和源码 SHA 之间不是同一个标识 |
| 同文件的 orcadNodePtySlotFiles | Windows 包含 `conpty.node`、`conpty_console_list.node`、`conpty/conpty.dll`、`conpty/OpenConsole.exe`，位于 `node_modules/node-pty/build/Release/`；另有 `windows-process-tree.node`、`bin/orca.exe` | 文件存在与 hash 一致仍不证明 Windows ABI/ConPTY 可用 |
| [build-orcad.mjs](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/config/scripts/build-orcad.mjs) 的 OUT_FILE / SERVER_OUT_FILE / ORCAD_BUILD_TARGET | 分别打包 launcher/server，固定使用 artifacts 常量；脚本含子进程 smoke 和动态 import 验证 | 不应为读取 manifest 而 import/执行 build 脚本；本轮只读取文本，未运行其验证 |

可固定的是上述**源码与声明的构建布局**，不是已经核实的 Windows release 下载地址或可复现二进制。直接执行 `src/main/orcad/orcad-entry.ts`、系统任意 Node 或默认 `orca serve` 都不是已经证明的可用部署命令。候选 Node 参数只能记录为计划数据，不能被预检输出包装成可执行指南。

## C. 运行前后的自动读取和服务

| 一手来源 / 函数 | 已观察事实 | 隔离意义 |
|---|---|---|
| [orcad-app-paths.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/orcad/orcad-app-paths.ts) resolveUserDataPath / resolveOrcadPath | profile 优先 `ORCA_USER_DATA`，否则 `XDG_DATA_HOME/Orca`，否则 `homedir()/.orca`；home 直接 homedir，temp 为 tmpdir，Windows appData 优先 APPDATA | `ORCA_USER_DATA_PATH` 是旧研究的 CLI 路线参数，不可混写为直接 entry 的环境合同；独立 profile 不覆盖 home/temp/appData |
| [orcad-entry.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/orcad/orcad-entry.ts) startOrcad → startOrcadWithHost → startOrcadRuntime | 安装 Node adapters，清 runtime-source env；profile/instance lock；启动 observability、event-loop probe、CLI launcher 准备、profile store、agent hook server、daemon、session search、规则更新、PTY 注册、恢复对账、RPC、automations、push | `--no-pairing` 只取消启动 pairing offer；没有看到 CLI `--disable-all-discovery` 或“无副作用模式” |
| [orcad-profile-state-startup.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/orcad/orcad-profile-state-startup.ts) createOrcadProfileStateStartup | initOrcaProfilePaths / ensureActiveOrcaProfile；创建 SQLite runtime authority；初始化 SSH host-key store/fence-token file | 新空 profile 比复用 profile 范围小，但 profile index 实际根与迁移规则还需追踪；不能拿老 profile 试验 |
| [orcad-session-search.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/orcad/orcad-session-search.ts) installOrcadSessionSearchService；[ai-vault-search-settings.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/shared/ai-vault-search-settings.ts) resolveAiVaultSearchSettings | 安装 in-process search service；默认 `aiVaultSearch.enabled:false`，只接受严格 true 开启；源码合同说明开启前不构建索引器/读 transcript | 不能误写为默认启动立即读取全部正文。底层 service 的实际开关路径本轮未取回，默认值不能证明所有其他发现都关闭 |
| [cached-session-list.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/ai-vault/cached-session-list.ts) localAiVaultScanRoots / getAiVaultWslHomeDirs / listAiVaultSessions | 发现根包括 additional Codex home、Claude profile projects、运行中的 WSL home、OpenCode WSL readers；listAiVaultSessions 会调用后台扫描 | 这是可调用扫描链，不能声称它一定在启动执行；同样不能仅改 USERPROFILE 就声称排除 WSL/多账号路径 |
| [orcad-automations.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/orcad/orcad-automations.ts) startOrcadAutomations | 无参数开关，创建 headless runtime automation service 并 start；退出注册 stop；读取 profile automation/run | 必须核对空 profile 和迁移行为；`--no-pairing` 不关 scheduler |
| entry 的 registerHeadlessPtyRuntime 调用与 createNodeSecretStore | Codex-home/Claude-auth preparation 参数留空，注释称属于桌面账号流；Node secret sealing 不可用 | 只表示这两条准备流未装，不证明 Provider、MCP、PATH 自动发现或凭证继承关闭 |

本轮未完整追踪 `OrcaRuntimeService` 构造、PTY 注册、MCP discovery、Provider launcher、browser startup、rules/push 的外部访问默认值。它们是有具体入口的缺口，不可通过操作者勾选“无账号”消除。环境计划可以用调用者提供的合成映射测试，不能读取/打印当前宿主完整环境，也不能把 home 重定向称为权限沙箱。

## D. 监听、Web 与停止归属

[orcad-command-arguments.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/orcad/orcad-command-arguments.ts) `parseArgs` 支持 `--bind`、`--port`（0–65535，0 选空闲端口）、`--json`、`--no-pairing`。entry 将 resolveOrcadBindHost 结果作为 `pinnedBindHost` 交给 RPC；默认端口有 fallback，指定 port 设置 preferPinnedWsPort。候选参数可静态限定为显式 `--bind 127.0.0.1` 与预定端口策略，但参数合规不证明实际监听地址。

[serve-orcad-launch.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/cli/runtime/serve-orcad-launch.ts) `orcadServeArgs` 固定 `--bind 0.0.0.0`；`serveWithOrcad` spread baseEnv 后设置 ORCA_USER_DATA/ORCA_VERSION。默认 CLI serve 仍不得作 fallback。

Web 的明确源码路径是 [vite.web.config.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/vite.web.config.ts)：入口 `src/renderer/web-index.html`，输出 `out/web`，base `./`。package 的 `dev:web` 是 `vite --config vite.web.config.ts --host 127.0.0.1`；这证明开发 HTTP 服务命令存在，不能冒充生产发布 HTTP 服务。`orcad-artifacts.ts` 清单不含 `out/web`。本轮未证明 runtime 自带正式静态 Web HTTP 服务、配对 URL 路径、浏览器存储与 CSP；不得凭猜测补成 `<port>/web-index.html`。第一批预检只能验证显式提供的 Web 构建证据，不打开 Web 或配对。

[orcad-daemon-supervision.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/orcad/orcad-daemon-supervision.ts) `startOrcadDaemon` 调 `initDaemonPtyProvider`，Windows startupTimeoutMs=30000，有一次 warm retry；失败可退到进程内 terminal。`stopOrcadDaemon` 只调用 `disconnectDaemon()`，明确禁止 shutdown，以保留 PTY。entry 注册该 cleanup。因此 **runtime 主进程停止不能等同整套退出**，主进程退出码 0 也不能证明 daemon/PTY 已无残留。

[orcad-lifecycle.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/orcad/orcad-lifecycle.ts) `installOrcadShutdownSignals` 处理 SIGINT/SIGTERM，按 deadline 等待 stop；`startOrcadWithHost` 获取 instance lock 的 pid/startedAtMs/nonce/lockPath，成功 cleanup 后释放锁。[orcad-stop-request-listener.ts](https://github.com/stablyai/orca/blob/aceebea0a4453f63d759af9134503220ce0b4753/src/main/orcad/orcad-stop-request-listener.ts) 支持 slot 旁 `.orcad-stop-request`（unlink 即消费）和绑定 instance 的 managed request；后者验证后才触发 shutdown，默认每秒轮询。Windows 无控制台父进程怎样可靠优雅停止、如何证明 daemon 归属并停止整套，仍未实测；不能把 Python terminate/Job 强杀等同上游 graceful stop。

## E. 本地复用边界

直接读取 `session_panel/owned_process.py`、`tests/test_owned_process.py`、`tests/fixtures/fake_app_server.py`：

- `WindowsAPI.spawn(exe, argv, cwd, child_handles)` 调 CreateProcessW：CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT，显式继承句柄表；**lpEnvironment=None，继承父进程环境**，接口没有 env 参数。
- `OwnedProcess.start` 创建独有 Job → suspended spawn → assign → resume；`create_job` 拒绝已有名称，设置 KILL_ON_JOB_CLOSE。可参考其正确时序，但第一批纯静态工具不需要导入或更改这些产品模块。
- `OwnedProcess._read_loop` 强制每行 JSON object，1 MiB 单行、128 事件队列；Orca stdout 的 readiness 与其他日志流兼容未证明。`close` 最多等待 grace=2 秒，再 TerminateJobObject，核查 active=0 与 reader/writer joined；这是己方 Job 清理证据，不是上游数据库 flush 证据。
- `query_old_job` 只查询，不接管/终止旧 Job。后续不得按进程名或未知 PID 批量终止。
- `tests/test_owned_process.py::FakeAPI` 可作为故障注入的测试风格参考；这些测试不 spawn，因此不能证明真实 Job/ConPTY/daemon 继承关系。本轮没重跑它们，也没声称通过。
- 旧 `fake_app_server.py` 实现 Codex JSONL fixture，硬编码 work/agent-execution-20261013 隔离目录，含可选 spawn-child 与写 marker；它不是 Orca fixture。无需为此次离线工具迁移、改写或执行它。

## F. 第一批事实输入与非目标

可测试的离线事实只有：显式输入目录内固定文件的存在/尺寸/hash、已知版本字段、参数字面值、合成环境计划的来源和路径关系、证据字段是否齐备且相互矛盾。缺少材料应显示缺失，版本/hash不符应显示不匹配；没有运行证据时必须显示未验证。工具不得从若干静态检查通过推导 `runtime_safe=true`，不得加入允许任意布尔值跳过上述缺口的启动开关。

不必在第一批编写 runtime 仿真器、自动安装器、上游 TS 执行器、生产进程管理器或通用 manifest 框架。现成 artifacts 清单与固定源码证据足以约束一个小规模预检；若 lwplan 选择只覆盖其中一个有界切片，应明确未覆盖项。源码 hash 只能证明与评审基线一致，不能证明无恶意代码或所有运行副作用已穷尽。

## G. 精确未知与后续补证位置

| 编号 | 未关闭事实 | 必须取得的证据；第一批影响 |
|---|---|---|
| P1-U1 | 可用 Windows bundle 与 SHA/Node/native 对应 | 读取 `config/scripts/orcad-entry-build.mjs`、`src/main/orcad/main.ts` 和 launcher 入口，取得构建来源/完整 artifact hash；之后另行受控构建/发行物验证。现在只能检查提供的材料，禁止执行候选入口 |
| P1-U2 | 所有启动发现和外部副作用隔离 | 继续追 `OrcaRuntimeService`、profile-index-store、register-headless-runtime、orcad-browser-startup、MCP/Provider launch；核实 profile migration、home/PATH/env、WSL、rules/push、索引默认关闭的实现。静态 env 计划不关闭此项 |
| P1-U3 | 实际监听与 Web HTTP 路由/权限 | 读取 runtime-rpc 的 Web/static handler 与 pairing URL 生成链；核对正式服务来源、完整 App、存储、权限。之后另行实际监听/浏览器验证；拒绝用 dev:web 代替生产服务证明 |
| P1-U4 | 整套 Windows 所属进程退出 | 继续读 daemon-provider-init/state、daemon spawn options、managed-stop-request/admission/completion；证明身份关联与终止范围，实测 graceful stop、超时、主进程崩溃、daemon/ConPTY 残留。Job 强杀与 graceful flush 分别报告 |
| P1-U5 | 环境构造在 Windows 实际生效 | 明确新启动边界如何传显式 env block，以及 Node os.homedir/tmpdir、Provider/WSL 实际读根；本地 OwnedProcess 当前没有该合同。第一批只校验合成 env，不增加真实 spawn |

这些未知限制的是实际运行准入，不阻塞“无副作用、输出未验证状态”的离线工具低层规划。Readiness 与 Gate-2 由独立 reviewer 决定，本研究不授予 Gate。

## H. 证据、读取范围与失败记录

已读 architecture-final、clarifications（含最新 P1 节）、research、research_stability、review-b92c4e；首次批量输出截断后，research 与 clarifications 尾节分别补读。当前方案/历史失败限制均保留。

公开原始文件通过 HTTPS 固定 SHA 取回；没有 clone、依赖安装或执行下载源码。GitHub tree API 返回 rate-limit（退出码 1）；第二批下载在 rules/runtime-rpc 前发生 unexpected EOF（退出码 1）；针对 runtime-rpc 的重试 15 秒超时（退出码 1），其后的 main/entry-build/search-service 未取得。一次批量本地读取显示上述缺文件，尽管末条 Get-Content 令 shell 总码为 0，缺失项仍未作为成功证据。后续单独 rg 缺文件退出码 1。报告未据这些失败声明存在已读 Web 服务或完整 discovery 开关。

最小复核入口：固定 `orcad-entry.ts` 的 startOrcadRuntime、`orcad-daemon-supervision.ts` 的 stopOrcadDaemon、`orcad-artifacts.ts` 清单、`node-runtime-pin.ts` Windows pins、本地 WindowsAPI.spawn 和 OwnedProcess.close。新增文档本身的存在/固定 SHA/未知编号/边界由交付前命令检查；这不是 Orca 测试。

无新增跨功能事实；daemon 生存合同是本次 Orca 专属事实。

交付核查补充：git diff --check 因当前目录不是 Git 仓库而失败（退出码 1）；改用文件全文读取、边界关键词与尾随空白核查，不报告 Git 检查通过。
