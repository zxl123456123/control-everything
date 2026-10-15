# R12 子agent协作小院实施报告

**范围与版本**：唯一低层计划 `lwplan.md` SHA-256 `e20c7af4a1980e3de086664d5432e13a8e57b328196b94b5757619ada1da4f98`；Readiness PASS、fresh ReviewLW PASS、root Gate2 当次 51/0/exit 0 后开始产品改动。本报告按当前 `work/r12-garden-manifest.json` 的实际文件哈希绑定。当前目录无 Git，因此没有提交、推送或 PR。本报告由唯一产品作者/root 写；子agent只做研究、计划、独立复核或自己的真实业务交付。

## 结果与需求映射

| 基线 | 实际行为与锚点 | 核验证据 |
|---|---|---|
| G12.1 舒适星露谷感觉 | `web/garden.js`、`web/style.css`、`web/index.html` 提供奶油/草木/木色、正常中文字、像素伙伴、阶段云朵、可展开身份/收据；本域小院先显示已验收角色与摘要，再显示保留原质量的 3D 庭院。旧观察页仍能显式切回。 | `work/r12-garden-iab.json/.png`，574×866 页面高 2133、无横向溢出；360/1024 实测，合成浏览器 11/0。原 574 页面高约 4130。 |
| G12.2 真能力与交接 | `session_panel/garden_native.py` 核原生父子 Thread UUID；`garden.py` 按主会话独立 SQLite 事务登记、分派、提交、复核请求、接收、结果、验收；`garden_mcp.py` 真正注册 8 个 MCP 工具；`garden_invoke.py` 以当前进程身份调用。`gateway.py` 仅给本根网页绑定只读状态及主会话两个受控写入口。已验收当前版本且 SHA、review evidence 有效才出现完成云朵；其它阶段有明确阶段词。 | `work/r12-garden-live.json`、各真实 caller 收据、`work/r12-garden-service.json`；后端 192/0。 |
| G12.3 主会话隔离 | root 由 `CODEX_THREAD_ID` 与本机 readonly 原生 parent/source 链判定，账本以 root UUID 命名；工具参数、URL、请求体无 root/actor 覆盖。网页切到其它主身份清空本域卡片；返回须显式点本域小院。 | `tests/test_garden.py`、`test_garden_mcp.py`、`test_garden_gateway.py`、`verify_garden.cjs` 的双根/伪身份/迟到响应；真实 IAB 观察页选其它 Codex 身份后小院卡片为 0。 |
| N12 旧防护及画质 | 原 3D 的几何、光强、抗锯齿、DPR、粒子、巡游、拾取未改；只在 garden 主题改材质色。原焦点/连接路径不改；无上下文的旧 fixture 不加载新小院。 | 旧浏览器 1403/0（最终复跑进行中），48只连续60秒 8/0、FPS 164.99/p95 6.5ms/慢帧0/draw83；原 Python 全回归。 |

完成摘要属于真实 `garden_accept_artifact` 收据；复核者的独立云朵基于实际 `review.outcome=pass`，短文案由任务标题与结果生成，完整 review summary 留在详情。已登记但未分任务的两位伙伴只显示“已注册，等待任务”，没有完成云朵。状态 `review_pending` 只表示请求已记录；另有原生派发、reviewer 自己的 claim 与 record 收据才算接收和复核。原生 Codex 回合结束事件没有被解释为业务完成。

## 改动范围、接口与迁移

冻结的旧产品基线在 `work/r12-before/`。`work/r12-garden-manifest.json` 记录 29 个旧文件：7 个有意修改（`README.md`、`session_panel/gateway.py`、`web/app.js`、`web/cockpit.js`、`web/index.html`、`web/robot3d.js`、`web/style.css`），22 个原样，另加 9 个产品/测试文件。旧 `tests/verify_robot_cockpit.cjs` 与 vendor Three.js 原样。根 README 新节说明八工具、固定调用、真实权限、桌面自动发现的边界；未修改用户全局 MCP 配置、CLI、远端或 WezTerm。

S1 原生解析只读查询 `state_5.sqlite` 的 `id, source`，沿 `thread_spawn.parent_thread_id` 明确向上到 root，坏 schema/环/不存在直接不可用。S2 每根一个 `work/garden-state/<UUID>.sqlite`；单文档与收据在同一 `BEGIN IMMEDIATE` 事务，失败回滚且不生成成功收据；保留旧版本，不静默截断。当前 artifact 与 review evidence 每次状态读取和关键操作重算哈希，文件变化立即撤销当前有效完成状态；同摘要/当前有效版本重试幂等，失效后即使原文件同 SHA 恢复也须新版本重新复核。S3 MCP 公开 schema 拒绝 extra、bool/string 混入整数及冒充身份；固定客户端真 SDK initialize/list/call，业务 actor 由各自进程上下文确定。网页仅 root 可请求复核/验收，child 能力仍由 child 自己调用。S4 旧 `app.js` 只在 bootstrap 包含合法 garden_root 时加载新模块，旧页与静态 IDs 留存。

此实现信任本机正常进程环境，不声称抵御同一 OS 账户主动篡改 `CODEX_THREAD_ID` 或原生 SQLite。当前桌面进程**自动发现/热加载**新 MCP 服务尚未证实；证实的是代码中八工具注册、真实独立 stdio 客户端发现和各 caller 调用。主会话请求后的原生派发由当前协调者操作，没有通用后台队列或自动消息代理。历史 WezTerm/远端正文/活动/全服务器覆盖限制由 R11 保持。

## 实际子agent交付链（不同 caller）

根 `01a109a3-2890-7531-805b-6ed67edb5d5d` 登记本主会话 3 名已有研究 child 为 worker、另 1 名新 reviewer。唯一任务 `d109b23b-8786-47a7-ad18-71e266af197a` 的提交者 `01a10a43-ada1-76f0-b278-1a9e3f7c7c85` 自己用真实 SDK stdio 提交 `work/r12-garden-capability-research.md`，SHA `d3191534acb125647cb86243fefc93d1ecdb098deb2200cb443d7945eea26fcb`，提交收据 `0461ab61-f288-46f5-af84-f4b3cfb4965e`。根请求复核收据 `47e4d57c-b747-4689-83c4-e9cbe1047872` 后经原生同域子agent消息派发；不同 reviewer `01a10a88-358b-7130-bbc0-cda25988c3d2` 自己 claim 收据 `34675db6-03d6-4920-8b9b-4888375836e8`，读产物并写独立报告 `work/r12-garden-business-review.md`，record 收据 `8daeede0-9480-46c3-8bcb-52b1c8bcbe42`。根独立复算两个 SHA 和权限/版本/hash 后验收收据 `c11e2eab-7773-47f9-8cec-15d5690a54f2`，当前账本 revision 10、accepted/current_valid=true。

逐段原始证据：`work/r12-garden-live-bindings.json`、`r12-garden-worker-calls.json`、`r12-garden-review-requested.json`、`r12-garden-native-dispatch.json`、`r12-garden-reviewer-calls.json`、`r12-garden-root-preaccept.json`、`r12-garden-artifact-accepted.json`、`r12-garden-live.json`。研究 reviewer 只审其研究产物和证据边界；它不是本次产品 ReviewImpl。

## 验证：本地作者层与 root 承接层

| 命令/观察 | 实际输出、退出码、证据 | 界限 |
|---|---|---|
| `.venv/Scripts/python.exe -X utf8 -B -m unittest discover -s tests -v` | **Ran 192 tests in 45.080s / OK / exit 0**，完整 stdout/stderr 在 `work/r12-garden-python-full.json`；含 3 条 FastMCP/Pydantic `IncompleteFieldDefinitionWarning(lifespan)`。 | 全旧新后端/负例；不代浏览器。 |
| 新协议局部 17 tests | **17/0/exit 0**，`work/r12-garden-protocol-local-final.json`。 | 合成 native/DB/HTTP/stdio。 |
| 五个 JavaScript parser 命令 | 每个 exit 0、stdout/stderr 空，`work/r12-garden-syntax.json`。 | HTML/CSS 靠浏览器。 |
| `node tests/verify_garden.cjs` | 受控 localhost Edge **11 checks/0/exit 0**，`work/r12-garden-browser-latepost.json` 与 `work/garden-browser-2026-10-05T15-58-03-784Z.json`。覆盖摘要/XSS、键盘、复播、异域迟到 GET/POST、明确返回、坏 hash、真实按钮路由、360/574/1024。 | 合成数据，不证明真实 child；真实链另见上节。 |
| `node tests/verify_robot_cockpit.cjs --fixture` | **1403/0/exit 0**，`work/r12-garden-legacy-browser.json`；最终代码复跑 **1403/0/exit 0**，`work/r12-garden-legacy-browser-final.json` 与 `work/robot-cockpit-fixture-r1-2026-10-05T16-07-55-279Z.json`。 | 原 harness 未改；无 garden bootstrap 的兼容链。 |
| `node tests/verify_robot_cockpit.cjs --fixture --perf48` | 连续可见 **59997ms、9900 帧、164.99 FPS、p95 6.5ms、>33.3ms 比例 0、draw83，8 checks/0/exit0**，`work/r12-garden-perf48-command.json`、完整采样 `work/robot-cockpit-fixture-r1-2026-10-05T15-47-36-461Z.json`。正常轮询、48角色与原AA/DPR/192粒子，零正文/动作请求。 | 本机受控 headless Edge，非任意设备承诺。 |
| 真实 owned 8766 / IAB | 旧 H1 归属复查发现该原自有进程已自行退出，**没有停止任何进程**；空端口启动 hidden 网关，核 launcher 8832/listener23612 的路径/argv/父子/birth、health/root bootstrap/revision10，`work/live-session-gateway-start-r12.json`。生产六资源现字节 SHA/CSP/nosniff、本域当前验收链 `work/r12-garden-service.json` exit0。真实 IAB 4伙伴、2不同摘要云朵、旧观察 tab、其它主身份清空、3D/像素/文字、暂停与键盘、可展开全 UUID；`work/r12-garden-iab.json/.png`。 | 真实 IAB 快照可证当前页面；不等于客户端新 MCP 自动加载。 |

## 保留的失败、修复与限制

不能用最终绿抹去中途失败：Readiness 首版缺完整基线第 6–10 条及原话目录，后补；LW 首版独立复核 **REVISE** 两处，分别是证据变更同 SHA 时恢复链不清、FastMCP 原始 extra/bool 参数会被吞并或转换，已在唯一计划中修订并 fresh ReviewLW PASS。原计划作者后续两次 capacity error，独立修订代理最小补文档；审查者首次自写 checker 有 unmatched `)` SyntaxError/exit1，修正 checker 后 32/0；root Gate2 51/0。`review_notes_readiness_1.md`、`review_notes_lwplan_1.md` 和 work Gate 证据保留原红。

实现起步 11 个单测有 **1 fail + 11 errors / exit1**：Windows SQLite handle 未关闭、合成 UUID 全数字导致 uppercase 负例无效；`work/r12-garden-local-red.json`，显式 closing/commit 与 a1 前缀后 11/0，再扩到 17/0。首个 coordinator 实调脚本缺项目 sys.path 得 `ModuleNotFoundError:session_panel / exit1`，`work/r12-garden-coordinator-registered.json`，修正后 `...registered-retry.json` exit0。业务 reviewer 曾猜错两个文件名导致两次读取 exit1，修正为实际文件；其 reviewer 报告保留。新浏览器 fixture 首次 **9 成功/1 失败/exit1**：foreign 后 `owns()` 返回 null 而非 false，`work/r12-garden-browser-command.json`；改为明确 Boolean 后 10/0，再补迟到 POST 得 11/0。另一次误用 Node 执行 Python evidence wrapper 得 `ERR_UNKNOWN_FILE_EXTENSION .py / exit1`，随即用正确 Python wrapper复跑。旧 H1 重载尝试 **exit1: Process identity unavailable**，`work/live-session-gateway-reload-r12.json`；再查原 launcher/listener/端口均无，未 kill 任何进程，空端口起新 owned 服务。IAB 一次 fullPage screenshot 调用失败，改为可见 viewport PNG；一次 CUA AX 点击复制按钮失败，改 Playwright 定位后页面报告“已复制”，但浏览器剪贴板读回为空，因此只证实页面反馈，不把复制结果作独立验证。测试工具页偶发标签消失，重新打开受控本地页；不影响数据库/服务。实际完成截图使用可见 viewport。

历史 R11 失败在旧报告仍保留：旧 full fixture 1392/1 与 1397/2、CSRF 36/1、窄屏 42/1；旧持续60秒 p95 30.2ms/慢帧3.8069%、旧短窗 p95 51.2ms/慢帧10.5333%、更早35.1098FPS/60.9ms/19.658%；真实 workbench 23/1 timeout、remote/body/activity/Wez关联/端到端 focus 限制。R12 无权将这些旧真实环境限制判为消失。

本轮当前仍待：fresh 独立 ReviewImpl 和 root 最终 Gate。没有这些证据前，本报告不宣称产品最终验收。

**英文提交建议**（此目录无 Git，不执行）：`feat(garden): register scoped artifact handoff and review tools`；`feat(garden): add cozy subagent spaces and verified result bubbles`。
