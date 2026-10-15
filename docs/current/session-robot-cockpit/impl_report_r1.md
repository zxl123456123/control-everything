# 会话机器人控制台实施报告 r1

feature_name: session-robot-cockpit  
impl_round: 1  
date: 2026-10-04（Asia/Shanghai）  
lwplan_version: SHA256 `5C50E2FA4D2AD02F797BF98EAD4E01C3E38AFD916F2C8933E36497D81C83771C`  
baseline_version: SHA256 `C6B82AFB523786A1E3C1C6F16928CEB635828727A1676465E50C299B56F2FF1C`  
status: **FINAL_READY_FOR_REVIEW（实施已编写；成功真实 focus 未验证，未宣称整体验收 PASS）**

用户原话“a继续，怎么还有方案冲突，自动实施代码即可现在”已满足 Q9=A 实施入口。按已评审方案实施，不重开入口问题，不修改冻结基线/方案。Gate-2 的 PASS 仅覆盖规划；本报告的本地自证也不代表整体验收。父 Q6 继续由 human/父原 reviewer 独立承接。

本轮先保全 21 个明确产品路径及 6 个新增文件缺席项，root 独立核验快照 53 项/0失败/exit0 后放行三个独占实施范围。核心作者 `robot_impl_core_r1` 承担 S1/S2/网关和 HTML/CSS；图形作者 `robot_impl_render_r1` 承担两个 renderer 与三 vendor 文件；harness 作者承担 fixture 测试。所有浏览器/HTTP 集成与 8766 正常加载由 root 承接；实施作者未启动真实服务、未读真实对话、未 focus、未安装、未执行 Git。

## 变更事实与任务映射

| path | change_type | change_purpose / key_changes | related_tasks |
|---|---|---|---|
| session_panel/service.py | modify | 当前原因仅由本次有效来源候选初始化并去重；增加 present/missing/unknown registration_state；last_evidence 有限增加 slot/reason/reason_codes/registration_state，不复制递归历史；陈旧副本撤注册资格；原拒配顺序保持 | S1 / C1 / G1,G3 |
| tests/test_observation.py | modify | 真实 merge 三阶段 F1 红绿；旧混时数组、重复缺失、回归、来源/终端失败、去重、输入不变及 stale 副本回归 | S1,S4 |
| web/app.js | modify | 一处 recordView 推导四分类，旧服务只按新鲜 observed/provenance 推注册；逐行原因/采样/年龄、保留槽位和当前未观察标签；当前/上次证据分区；同 UUID/no-op/成员检查；保留 epoch/page/focus 链，eligible额外要求confirmed分类；非法 API status/list 拒绝；旧消息页明确元数据未确认；renderer create/update 异常隔离；1秒timer独立更新覆盖陈旧标示，含空索引 | S2 / C2,C3 / G1–G3 |
| web/index.html | modify | classic cockpit 在 app 前独立加载；原生模式/旋转按钮外置，stage/status 接线；原 DOM ID 和消息/定位操作保留；上次证据及消息元数据提示 | S2,S3 / C4 |
| web/style.css | modify | 四类分组可读性；stage 宽度自适应、320px 最小高、440px 最大高、纵向滚动；canvas/mode/focus 样式，文字模式保留原生列表 | S2,S3 |
| session_panel/gateway.py | modify | 五条精确同源静态映射及 JS/plain MIME；缺文件返回明确 404 route_not_found；原 Host/Origin/CSRF/CSP/nosniff 不变 | S3 / C5 |
| tests/test_gateway.py | modify | 五静态文件真实 bytes/MIME/安全头、缺文件 404、query/prefix/encoded 越界拒绝；无列表/消息/focus 调用 | S3,S4 |
| web/cockpit.js | create | 无 API 句柄 classic 外壳；独立 Canvas 像素与文字、动态 3D import、generation 和手动模式回退；最新浅 view/UUID 选择；资源清理 | S3 / C4 / G2,G3 |
| web/robot3d.js | create | 固定同源 Three ESM；原创基础几何机器人、UUID Group/Raycaster、动态网格与正交相机、整体 yaw；dirty RAF；off-stage 首绘及 null/throw/init/first-draw/lost/runtime 失效边界 | S3 / G2,G3 |
| web/vendor/three-0.186.0/three.module.js | create | 固定 npm gitHead 对应原字节，662772 B；同目录 core import/re-export | S3 |
| web/vendor/three-0.186.0/three.core.js | create | 同固定版本原字节，1458113 B，无额外静态依赖 | S3 |
| web/vendor/three-0.186.0/LICENSE | create | 原 MIT/版权通知，1081 B；未把 integrity/hash 核验说成 npm 签名核验 | S3 |
| tests/verify_robot_cockpit.cjs | create | 默认仅 fixture 的临时 loopback fake service/terminal 和浏览器网络守卫；覆盖旧 UI 行为、UUID/分页/epoch/分类/故障/拾取/布局/上下文与真实请求记录，实际执行责任归 root | S4 |

清单当前为 27 文件：7 modify、6 create、14 unchanged、0 removed、0 未知产品新增。无删除旧产品函数链。`source.py / remote_probe.py / terminal.py / mcp_stdio.py / .codex/config / requirements` 及父三份冻结报告保持原 hash。每行产品改动均映到 S1–S4；未顺手改依赖警告、身份冲突或缺 pane。

完整 before: `work/robot-cockpit-baseline-r1/before/`，manifest: `work/robot-cockpit-baseline-r1/manifest.json`，SHA256 `F764D7F72C6A85DB870BAF3C665B15B56DE8A91423FE3E7E6DDC3ECE6ED2B50F`。final 副本为同目录 `final/`；最终清单 `work/robot-cockpit-product-manifest-r1.json` SHA256 `EE3FEDD4C95F65867F95E2803D3080464FB241C7C6925D81F1ABD055D8698489`；可读差异 `work/robot-cockpit-product-diff-r1.patch` SHA256 `80E06E2C2F8145F0FAA105E6F77FFD3EEB1136E26A6F5A2F2D09ACB49E9768FB`。自有代码完整 unified diff；三 vendor 以 new-file、精确 size/hash、import/LICENSE 锚点及 final 原文字节路径列明，没有以“第三方忽略”隐藏。最终29场景fixture与生产静态字节均对应此版；只读独立核清单，不再次生成时间戳或改变产品。

## 目标与作者体验

goal_lock_check: G1 当前注册/身份/进程/位置及原因/采样可读，G2 DOM/像素/3D 共用 app 的完整 UUID selected/epoch/page，G3 当前与上次原因分开且图形/来源失效保持文字/unknown。代码、本地单元及受控fixture935项支持这些实现；真实pointer/分页/旋转/模式已由root验证。成功真实focus与真实缺注册保留样本缺口分别保留，不能由fixture或拒绝响应判成全部目标验收。

anti_goal_touch_check: 未新增发送、审批、resume、终止、Hooks、全机采集、Jev/C4D、CDN、图片/纹理/外部模型、猜配或持久化历史。活动/完成仍 unknown；没有循环工作动画。renderer 只得到 `{records:[{sessionId,label,category}],selected}` 与 onSelect，没有正文/query/focus/CSRF。定位仍仅显式按钮及服务端 fresh 重核验。

authoring_ergonomics_notes: 保留 service 原 if/elif、app 原函数/DOM ID/分页与资格链；分类/中文原因集中 app，两个小图形职责文件各自清理资源。没有框架/store/配置系统/事件日志。测试直接表达 F1、45 条页界和 UUID 用户行为；before/final/diff 在无 Git 环境下使审查可追溯。新增 manifest 为本轮证据格式，不能替代实际函数与浏览器验证。

## 本轮实际 impl-safe 证据

每条完整命令、开始/结束时间、退出码、原 stdout/stderr 合并输出保存于 `work/robot-cockpit-impl-r1-verification.json`。没有用管道 tail 替换退出码。以下实际 owner 均为核心实施作者，缺记录时该项只能 unverified。

| 真实命令/步骤 | evidence / 实际结果 | owner / conclusion_if_missing |
|---|---|---|
| `.venv/Scripts/python.exe -B -m unittest tests.test_observation.ObservationTests.test_recovered_source_missing_registration_has_current_reason_only -v`（未改 service） | **exit1，1 test FAIL**；实际旧数组 `[source_unavailable,registration_missing]` 与预期 `[registration_missing]` 不同；失败源于 F1 断言，非环境 | core / 无红证据不得称回归有效 |
| 同一命令（修后） | exit0，1 test OK；当前仅 registration_missing，上次采样保留失败原因，不递归、无 pane/活动资格 | core / 无绿证据不得称修复自证 |
| `.venv/Scripts/python.exe -B -m unittest tests.test_observation -v` | exit0，15 tests OK | core / 观察边界未验证 |
| `C:/nvm4w/nodejs/node.exe --check web/app.js` | exit0，stdout/stderr 空 | core / JS 语法未验证 |
| `.venv/Scripts/python.exe -B -m unittest discover -s tests -v`（PYTHONDONTWRITEBYTECODE=1） | exit0，**55 tests in 10.450s，OK**；包含本地 fake/mock 网关/MCP/消息/定位回归，未触生产 8766 | core / 完整本地回归未验证 |
| `.venv/Scripts/python.exe -B work/robot-cockpit-impl-r1-static-check.py` | exit0，52 checks / 0失败；before、14 untouched、父冻结、vendor size/hash/import/MIT；Python compile 不写 pycache；app/cockpit/robot3d 语法；图形无 API 句柄静态核查 | core / 对应完整性或语法未验证，不代替 GPU/HTTP |
| `.venv/Scripts/python.exe -B work/robot-cockpit-manifest-r1.py` | exit0，27文件/7修改/6新增/14保留/0未知；完整自有 diff 与 final副本；含最新空列表 timer 与 harness 补正 | core / 无可读diff不得移交审查 |
| `node --check tests/verify_robot_cockpit.cjs`（409/N=0补正 harness） | exit0，完整输出为空；当时 SHA256 D49F1A662D3BBBDD1EAB98A204A786DF843099CD2BAEC58D4D8BC090AE525481 | core / CJS语法未验证，不代表浏览器执行 |
| `node --check tests/verify_robot_cockpit.cjs`（S2未确认定位补正 harness） | exit0，完整输出为空；当前 SHA256 763F99104DC6D6D973DFF0446E58AB99A25E34F3D284FDD0626A936DACA7B92D | core / 新CJS语法未验证，不代表浏览器执行 |

图形作者另存 `work/robot-cockpit-render-r1-verification.json`：两语法命令 exit0、固定字节/静态边界逐项记录，真实 browser/WebGL 未执行；本核心作者完整读回其报告和两源码并独立运行上述语法/hash，不借作者自报作验收。harness 作者最终报告 `work/robot-cockpit-harness-r1-implementation.md` 与 `work/robot-cockpit-harness-r1-verification.json` 已完整读回，两个后续revision增量也已补读：保留初版823DE...、409/N=0补正D49F...与S2资格763F...的真实语法命令、空输出、exit0，以及root首轮907/exit1/1failure、第二轮914绿灯的覆盖限制。补正仅精确关联预期409的URL/status/reason及console位置/真实响应、空列表pending超30秒断言和三种注册未知的真实DOM禁用/无POST；实际浏览器运行由root负责。

root 另已独立用 before 快照真实函数运行同一 F1 新断言：红 exit1/1 FAIL，当前函数绿 exit0/1 OK，见 `work/robot-cockpit-root-r1-F1-red-green.json`；本核心作者完整读回，不把 root 执行伪装为 impl-safe 自己执行。root 的入口 24/0、before 53/0 仅支持入口/保全。

## coordinator_handoff_verifications

| 验证项 | 移交原因 / 建议承接 | evidence_expected | owner / conclusion_if_missing |
|---|---|---|---|
| 完整 controlled browser fixture（UUID、旧 API、45条/epoch、故障、键盘、拾取、宽度/DPR/尺度、上下文） | 浏览器/HTTP 集成不属于 safe-code-changes impl-safe；root 实际执行新 harness，不运行旧 live 脚本 | 已执行：最终935断言/29cases/0fail/exit0，720请求/0blocked，真实lost/restored1/1，完整artifact见下；历史907失败与914覆盖限制均保留 | root / 缺对应证据则fixture行为未验证 |
| 8766 正常加载与最终静态同源 bytes/MIME/CSP/module/core/WebGL | root 核服务归属并受控正常加载；不得直接接管未知进程 | 已执行：reloadretry1exit0；最终8静态bytes/MIME/CSP/nosniff、D628app、实际生产3D及100范围检查均支持 | root / 缺对应证据则上线与生产3D未验证 |
| 真实当次元数据与分类/F1保留分支 | 实际状态持续变化；不能将旧快照注入生产；root 新采样 | 已执行：2注册/2进程/2confirmed/2索引present；没有真实retained样本，**真实缺注册保留分支未验证** | root / 无真实缺失样本不得称该分支实环境已验 |
| **真实消息读取/分页** | 沿 Q5 选当次身份/位置核验 UUID；只为验证读取，正文不落盘 | 已执行：真实UUID、reader0.2.163、total316、20条/offset296→276→296，同revision与read_at；最终artifact见下 | root / 缺真实读页证据则未验，fixture不能代判 |
| **真实 focus** | 会切原 pane，需现有 UUID 接口重核验和唯一客户端确认 | 已执行guardedPOST，HTTP409/focusedfalse/statusunknown/reasonbinding_unknown；独立clients_exit0/clients空；**成功真实定位仍unverified**，不制造客户端或猜配恢复 | root / 真实成功定位缺口保留；拒绝与focus_sent_unverified均不是成功 |
| **父 Q6 Codex 客户端三工具加载/调用** | 父批独立 human/原 reviewer 验收，不由本批接管 | 用户观察及原 reviewer 后续证据 | human/父原 reviewer / 独立待验，不关闭父批 |

root 第一轮实际新代码 fixture 已执行并返回 **exit1，907 checks / 1 failure**（见下）；修正测试错误分类与空索引计时后，第二轮 root 重跑为 **exit0，914 checks / 0 failure**。冻结前独立审查再发现unknown定位资格遗漏，已同S2补正，最终全量fixture为 **935 checks / 29cases / 0fail / exit0**，生产最终子集25checks/exit0且成功真实focus未验。不得把 before 元数据、118项提案或库 Node 导入当新代码产品验收。root 在 02:27:26 北京时间的 before 样本（`work/robot-cockpit-root-r1-before-metadata.json`）是 2注册/2进程/7索引/2位置确认/5保留，旧原因仍混杂；只读取了过滤元数据。服务归属见 `work/robot-cockpit-owned-gateway-before.json`，它不是已执行重启证据。

第一 fixture 原证据 `work/robot-cockpit-fixture-r1-2026-10-03T18-51-48-820Z.json` SHA256 `5B4E09F77D887EEFC29F7337BADE759196BAEDC3E18E192B977B07514D0B81EA`，实际 owner=root。核心作者完整解析 JSON 并逐 case 读回全部失败/console/pageerror/限制/清理/hash；1 failure 是 basic 场景主动注入 revision_mismatch/binding_changed 的两条 HTTP409 console 被误归 unexpected，原输出保留，harness 作者窄修分类，不能将 exit1 写成通过。该轮 26场景、680请求、0外部/生产请求逃逸、0 pageerror；实际 WEBGL_lose_context 支持，lost_events=1/restored_events=1，limitations=[]。它覆盖当时版本，不能替代修后最终版本重跑。

静态顺读另发现 N=0 且元数据请求长期 pending 时原1秒timer没有独立更新顶部覆盖年龄。root 待首 fixture 结束后放行同 S2 范围增加每秒 renderCoverage；不产生查询、不改分类。修后独立静态/语法命令 52项/0失败、exit0；最终 harness 已补受控空列表超30秒 pending 行为断言，实际执行仍归 root。

第二轮 fixture：`work/robot-cockpit-fixture-r1-2026-10-03T19-00-07-106Z.json` SHA256 `A91927A6298B17CF3A548154A12E2C23FF06840F9E995E6BAC6975CCAB4E60CA`，真实命令 `C:/nvm4w/nodejs/node.exe tests/verify_robot_cockpit.cjs --fixture`，owner=root，19:00:07.106Z–19:04:54.658Z，exit0。26场景/914断言全部true、690请求（687 GET/3 fake POST）、0blocked、0意外page/console；预期拒绝与故障注入原错误单列保留。WEBGL_lose_context 实际支持，lost/restored均1，limitations=[]；browser_closed=true，临时fixture正常code0、stderr空。空列表pending超30秒的counts陈旧/灯撤ok/不读消息不focus断言均true。本核心作者用只读有界解析逐case核全部断言状态、失败、意外/预期错误、请求元数据、实际context及清理，并独立核当时8个served文件bytes/hash，exit0；没有自行执行浏览器。root另独立当时最终范围检查100项/0失败/exit0，`work/robot-cockpit-root-r1-static-verification.json`，本作者完整读回。以上记录不得代替其后的S2资格补正版本验证。

冻结前独立审查发现S2局部缺陷：fresh observed的unknown注册值、未来enum或旧API缺注册provenance，若带verified身份/confirmed绑定旧字段，recordView虽为unknown，eligible仍为true。root以真实app helpers独立Node VM三case先红exit1/3失败；未修改方案，放行仅在eligible追加 `recordView(record).category === 'confirmed'`，原current、5秒年龄、verified、confirmed及服务端全部guard保持。root同一真实命令修后绿exit0/3项0失败，证据 `work/robot-cockpit-root-r1-unknown-focus-red-green.json` 原命令和完整输出已读回。root尝试取证副本发生在final刷新之后，复制的是D6282CF...修后app，已更名after-unknown-focus，不能作before证据；红结论只由原实际命令输出支持。修后作者语法exit0、52静态/0失败、27manifest无未知；harness作者补三种实际DOM按钮disabled及原生pointer不发POST，当前harness SHA256 `763F99104DC6D6D973DFF0446E58AB99A25E34F3D284FDD0626A936DACA7B92D`，核心独立语法exit0；这三个新场景在最终935断言中实际各7项全部true。真实成功focus缺口仍未被fixture拒绝路径替代。

root首次正常加载操作 `work/robot-cockpit-root-reload-r1.json` 在实际stop前exit1，失败为CreatedUtc归属严格比较；PowerShell7.6.5默认JSON日期转换改变类型，root诊断UTC值相同后另加retry脚本以-DateKind String保留字符串。原失败与脚本保留。retry证据 `work/robot-cockpit-root-reload-r1-retry1.json` 完整读回，19:06:52Z–19:07:13Z、exit0：先核原监听PID/父进程/可执行/参数/UTC及loopback，再仅停既有211580，新launcher32848/listener120684、health remote-claude-session-panel/protocol1。这是root实际正常加载证据；核心没有启动/停止任何服务。

真实环境首轮：`work/robot-cockpit-root-live-r1.json` SHA256 `9A2F94E56BD85097ED62FF59C1853E0E3B8511F52A851026C2D74664B52D497E`，owner=root，exit1。原全部失败保留：真实focus为focused=false/statusunknown/reasonbinding_unknown且当前clients空；root取证脚本在about:blank以null origin导入库产生module-specifier pageerror；原HTTP409误记consolefailure；收尾response.json晚于browser关闭产生metadata-capture错误。不得将此首轮exit1抹成通过，也不把root取证脚本错误归于产品库加载。

真实环境retry1：`work/robot-cockpit-root-live-r1-retry1.json` SHA256 `463051F3B4D8D56F9395B927EB9C070A1ED24F8116010F04DD045BDD31F8B33A`，owner=root，19:11:45Z–19:12:08Z，exit0/25项true，failures=[]，但两项limitations原样保留：无唯一attached client，成功真实focus仍unverified；原pane无唯一当前verified UUID，未猜配恢复。真实请求已执行，POST空body/有效clientheader/CSRF-present、HTTP409、focused=false/statusunknown/reasonbinding_unknown，不证明定位成功。独立list-clients前后exit0且clients=[]。root另只读CIM没有运行的wezterm/wezterm-gui，没有制造client或启动远端软件/修改配置。

该retry实际生产3D绘制、8静态bytes/MIME/CSP/nosniff、真实pointer/Raycaster完整UUID选择、旋转图像变化、pixel/text保留选择及模式不重读均有true断言。真实消息UUID `125d23ce-04a0-4f6f-a56a-cfb1dcba7260` 当次reader0.2.163/availabletrue、total316，limit20/offset296→276→296，同revision `64770:1329110:6053991:1791053709066000000`，每页20项且all_items_same_uuid，分别read_at19:11:52.538777/19:11:54.553246/19:11:56.373958Z；正文/CSRF不落盘。重新加载后的样本2注册/2进程/2confirmed/2索引、注册present、reason_codes空，未观察到本轮真实缺注册保留分支；其代码红绿和fixture覆盖不等于真实该分支已验。这份live覆盖S2资格补正之前的app，以下最终记录另核当前D6282CF版本静态/资格与browser。核心仅解析全部断言、失败/限制和过滤元数据，未读正文或截图；原合并宽读输出截断后按有界全JSON解析完整补读。

最终 fixture：`work/robot-cockpit-fixture-r1-2026-10-03T19-20-28-995Z.json` SHA256 `25D43183F85020D58A57B4E2A2F1251F53A88CF4A1CFE5030C32233B06A158FD`，owner=root，原命令 `C:/nvm4w/nodejs/node.exe tests/verify_robot_cockpit.cjs --fixture`，19:20:28.995Z–19:24:21.111Z，exit0。29case/935checks全部true、720请求（717GET/3fakePOST）、0失败/0blocked/0意外pageconsole，limitations=[]，实际lost/restored1/1；browser正常关闭、fixturecode0且stderr空。经典脚本/模块/MIME/CSP/Canvas/WebGL故障注入的预期原错误仍单列。核心作者只读解析全部assertion/result/errors/limits/request metadata及8当前served文件hash，exit0且完整输出；最终scope证据 `work/robot-cockpit-root-r1-final-static-verification.json` SHA256 `6985FDA12F529DF11FA7F8A4A467AF6F171F7962BE5E9ADB2B6985168BEA94C3`，root100项/0fail/exit0，本作者完整读回。

最终生产：`work/robot-cockpit-root-live-r1-final.json` SHA256 `7A8DD0D710DE456C3A60A8F31C1BB03669E1E534D8B292907066C0879B792A74`，owner=root，实际命令 `C:/nvm4w/nodejs/node.exe work/verify-robot-cockpit-live-r1-final.cjs`，19:22:01.195Z–19:23:49.812Z，25项true/exit0，实际app19368B/SHA256D6282CF...与当前最终版相同。当前3D实际绘制、完整真实UUID pointer选择、旋转、三模式、8同源静态安全头及真实读取total316/20条/offset296→276→296同revision均核验；最终read_at19:22:10.834980/19:22:12.664933/19:22:14.397300Z。**成功真实focus仍unverified**：guardedUUIDPOST实际发送、HTTP409/reasonbinding_unknown/focusedfalse，前后独立list-clients出口0但0客户端；原两项limitations、未猜配恢复均保留。所有body/CSRF值未保存；核心仅读过滤元数据，不执行live。真实retained分支本次无现存样本。root实际查看最终截图并reload原IAB页，本作者未用截图代替动作证据。

root汇总 `work/robot-cockpit-root-r1-verification.json` SHA256 `B3BB0C91896F810524F3FF2EB5ED796F4F576D9420FD063CF4E52EF30C2E5AC7`、命令日志 `work/robot-cockpit-root-r1-command-log.json` SHA256 `E4CB5B4AF0E1919A7901F40C52686B68821978F7C0174F8975151992E3CD11CC` 均完整读回；状态仅IMPLEMENTED_AND_VERIFIED_SUBSETS，不是整体验收PASS。完整fixture/live生成命令及其原结果已落盘；部分只读诊断以日志描述和原tool transcript指向记录，没有补造argv。root独立55项run9.877s/exit0的首chunk只在原tool transcript，耐久副本只有末chunk；核心自己另一次55项10.450s的完整原输出在canonical JSON，明确两次owner与证据不互相替代。

## contract_drift_reports

1. 冻结 plan §6 的浏览器 fixture `impl-safe` 标签宽于 safe-code-changes 的权威黑名单。已显式上报 root，README 记录作者仅本地单元/静态/语法、root 实际承接所有浏览器/HTTP 集成。算法、场景清单、基线与冻结 plan 不变，不修 global skills、不伪造执行 owner。
2. shared 旧阶段索引“Review(LW)通过进入Impl”与 coordinator STOP 条款漂移继续留痕。此次用户 Q9=A 已满足严格入口，无需重复询问。未执行全局镜像审计，不能声称 drift 已修。

## 已见失败、未完成与风险

本轮真实 F1 红断言 exit1 及 root 独立红 exit1 均保留。核心最初宽批读及一次双长文件输出被截，已逐段补读；图形作者的初始宽读/集成读截断也保留于其报告。root 入口的错误 skill 根路径 exit1、宽批读截断与非 Git 的预期 fatal 在 `work/robot-cockpit-entry-r1-verification.json` 留痕。本地55项测试有既有 `pydantic_settings ... IncompleteFieldDefinitionWarning`，无失败；本轮未顺手修改该依赖警告。

核心追加完整证据时，过长内联 PowerShell 参数被 Windows CreateProcess 拒绝（os error 206，进程未启动，没有可当成功的退出码）；原命令保留于 `work/robot-cockpit-evidence-write-rejected-r1.txt`。随后改用 apply_patch 更新本代理自有 JSON，保留已跑的所有原输出及这个工具失败，不删旧证据。

root另见只读rg将research*.md作为路径的os123错误，后改明确目录配-g成功；原合并命令exit0不消除该rg失败，见root命令日志。unknown资格三case实际红exit1/3失败也已保留，不以最后935绿灯掩盖先前遗漏。

读取root最终fixture时，两次宽输出包含全部请求/像素trace而超过预算；这两次返回的截断文本完整留于 `work/robot-cockpit-root-result-wide-read-r1.json`，不支持完整输出结论。随后改为完整解析原JSON但仅输出每case的断言数/全部失败与错误、请求汇总及目标断言，完整输出4020 tokens、exit0，并核8份真实文件hash；统计绿灯以这次有界解析及原root证据为准。

相关上游失败仍在原报告/work：预览 canvas 悬空/裁切/抢选/小屏/同高 stage、旧 wrapper 与屏外坐标失败、故障注入 console/包装警告；依赖首个 GBK ©输出 exit1、错误安装页404、旧候选 module路由404、未核 ECDSA 签名；父 r1/r2 竞态红控、runtime/CLI/fixture/UI/端口及正式审查失败。新代码最终绿灯不得抹除这些历史。它们并非本轮新失败，也不能被本轮局部回归当作父整体验收。

最终fixture、生产app原证据及final清单/diff已核定，本报告以FINAL_READY_FOR_REVIEW交付。未完成仅独立审查的正式结论、成功真实focus（已发送请求但空attached clients、拒绝binding_unknown）、真实retained分支现存样本验证，以及父Q6独立human/原reviewer待验。真实消息读取/上一页/下一页已由root实际执行并留过滤元数据；不把拒绝定位或fixture代判真实成功，不用synthetic event/page截图替代未验项。

风险：重新加载 Python 网关会失去原有内存索引保留行（原行为），before 仅作历史证据，禁止回注生产。当前历史原因保留为上次采样，不证明每项故障发生时间。来源/实例持续变化，不保证三槽位常绿。固定库签名未验证，不保证所有设备 WebGL 可用。

回滚信息：**可直接回滚（限逐文件 hash 验证后恢复本批 before）**。仅恢复7个修改文件；6新增文件须逐个确认仍为本批 final hash 后撤回，不递归删目录、不覆盖未知改动。服务加载由 root 承接。代码回滚不能撤销真实 focus 的 pane 切换；不猜配自动恢复。全部 before/final/diff/红绿/失败证据保留。

英文 conventional commit 建议：`feat(session-panel): add evidence-based robot cockpit and fallbacks`。当前非 Git 仓库，不初始化、不 commit/push。无新增跨功能事实。
