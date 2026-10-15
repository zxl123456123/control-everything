# R7 精确定位实施记录

feature_name: wezterm-session-link  
impl_round: R7  
date: 2026-10-05  
lwplan_version: 唯一 LW §10，SHA256 `58983B88406DE957626683955EBCC8724B43C6B3F227AEA58841026B71552EFC`

严格 tiled 目标直接复用已有 tab/next 路线，删去 exact-ID 动作及重复中间完整观察；两条路线共用一次完整最终观察。作者本地成本症状已先 red 后 green；真实 HTTP/GUI 定位、预算收益及生命周期仍由 root 承接，fresh ReviewImpl 待完成。本记录不宣称工作台或实机定位稳定。

## 当前事实与变更

本轮开始前完整读取 safe-code-changes、verification-before-completion、实际两产品、唯一 LW §10、基线§14/source与独立 ReviewLW。root Gate2 JSON 实际为63项，全部true、exit0、allow_enter_impl=true；ReviewLW SHA `6460CAB51C628736612DA141E7721B861C70D08A55641470F29142F4540CA979`。root 明确实施放行，用户持续自动授权已生效。准确 before 两文件与全部29产品/当前权威输入留存 [before-manifest](../../../work/wezterm-focus-impl-r7-before-manifest.json)。

| path | change_type | change_purpose / key_changes | related_tasks |
| --- | --- | --- | --- |
| `session_panel/terminal.py` | 局部控制流，+19/-27 | `_focus_session` 现有 try 内：strict直接`_focus_next`；nonstrict原exact；共同完整final验证真实目标pane、全部关联键、唯一slot/pane、原deadline/age，strict额外fingerprint与非0exit保全 | S1-R7 |
| `tests/test_focus.py` | 回归，+75/-15 | 新增可观察调用累计成本症状、完整final年龄/deadline/真实pane拒绝、nonstrict最终清单非0旧语义；旧strict轨迹/观察与库存计数按新路线调整，只重命名两个路线相关用例，原行为拒绝用例全部保留 | S2-R7 |

final SHA256：terminal `B50D5C5F639B16FEB5616B18BF503D8851ADF7DF2293101CA04EF30545C534C3`；test_focus `9D7A2E50861302588FDDC31C2042A02D32F868297C78FEB691A80137EC8E45C0`。准确 [patch](../../../work/wezterm-focus-impl-r7.patch) SHA `34BF97C35238EC4505B5F43BB0940D089BC826A3FE2027E9AB5116B90787FEEA`；[final manifest](../../../work/wezterm-focus-impl-r7-manifest.json)绑定全部29来源及前后差异。新增仅work证据/脚本与本实施报告，无新增产品文件。

goal_lock_check：消费G3；前检、每步真实client/topology与完整final仍必须成立才确认，G1 unknown与G2连接规则保全。anti_goal_touch_check：N1/N2/N3未触碰，27其它产品未改；所有helpers、前检/deadline/pins/pre和原catch/导出包装字节保持，原5秒累计age与动作窗口位置未变。未引入键盘发送、布局放宽、Service缓存/共享inventory、native/UI/-S、清latch或运行时操作。

authoring_ergonomics_notes：现有try内一个if/else选择动作，再一份共同完整final；复用原helpers/fake/clock，不增加策略、通用guard或Zellij模拟器。末端严格检查是少量直线条件，nonstrict保持原后验失败语义。

## 本轮实际本地验证

| 命令 / 记录 | 实际结果 | evidence / owner / conclusion_if_missing |
| --- | --- | --- |
| `.venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-impl-r7-run.py red` | b8dcf6，exit1，1用例1失败；旧产品返回focus_sent_unverified，目标虽移动但成本累计超龄 | [red-result](../../../work/wezterm-focus-impl-r7-red-result.json)，完整stdout/stderr及tested SHA；impl author；缺失则症状回归未证 |
| `.venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-impl-r7-run.py green`，实际子命令 `-m unittest tests.test_focus tests.test_workbench tests.test_native_processes tests.test_gateway.GatewayDispatchTests -v` | e89b4b，exit0，86测试0失败；同成本症状转绿，全部原拒绝和成功回归保留 | [green-result](../../../work/wezterm-focus-impl-r7-green-result.json)，完整stdout/stderr及final tested SHA；impl author；缺失则局部实现未验证 |
| `.venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-impl-r7-verify.py` | 0f5840，exit0，20项0失败：准确两文件范围、27其它来源与全部权威输入不变、AST、原helpers/前检/catch字节、共同final、原守卫、旧用例保留、red fixture精确重建 | [static-result](../../../work/wezterm-focus-impl-r7-static-result.json)与[static-checks](../../../work/wezterm-focus-impl-r7-static-checks.json)；impl author；缺失则scope与字节边界未验证 |

成本测试按fresh1593ms、强制刷新1.594秒、observe0.650秒、version0.031秒、清单0.391秒、client0.188秒、动作0.046秒及pins0.170秒逐调用累加，不手工重置age/deadline；新路线完整final仍须原5000ms以内。它是独立fake成本行为证据，不是实际R7耗时承诺。新完整final负例即使逐步已到目标，年龄超5秒、deadline耗尽或最终真实pane移走均拒绝；nonstrict final清单非0仍旧sent_unverified/exit0，strict同类故障保留focus_failed/真实exit。

red精确测试源已保留 `work/wezterm-focus-impl-r7-red-test_focus.py`，其SHA匹配首次red记录；原terminal before也完整保存。green终端合并显示中stdout退出标记穿插到stderr一行，证据JSON分别存两流完整内容，86项及OK完整已读。未用管道截尾。除必要症状red外本轮本地测试/静态无其它失败。

## 真实验证移交与结论边界

coordinator_handoff_verifications：作者未运行真实CLI/helper/Win32、HTTP8766/SSH/GUI、服务、D写、Git或递归。

| 未由impl执行项 / 原因 | 建议承接与 evidence_expected | owner / conclusion_if_missing |
| --- | --- | --- |
| 真实路线、当前远端实例/进程/client及累积预算，依赖实际状态 | root独立当前源码回归后按归属加载自己的gateway；新GUI未键盘分别从其它tab和目标tab错误pane重复同UUID定位，后者实际执行next；完整final＋独立list-clients exacttarget、slot/fingerprint/实例、original age/deadline全成立才计正例。记录每个busy/unknown/非0/empty/late到`work/live-session-*-r7*.json/png` | root；缺失则实机定位与收益未验证 |
| 自己测试对话的退出重建与机器人/正文关联，属于真实生命周期 | root保全测试会话准确UUID/归属后执行并记录机器人、消息、退出/重建和进程前后证据；不得处理无归属工作或借重启清latch | root；缺失则生命周期能力未验证 |
| 实施后独立审查，作者不可替自己放行 | fresh reviewer独立最终两文件diff、原前检/guards/拒绝、全部红绿和root当前真实失败，落正式ReviewImpl | reviewer/root；缺失则整批未交付PASS |

contract_drift_reports：本轮未发现当前权威输入或产品假设漂移；静态全量哈希与准确before核验支持该结论。LW/输入manifest内Gate2 pending是当时冻结阶段记录，新的root Gate2及明确放行另存，不回写历史权威。若root实测仍超龄/unknown，继续受控调查，不延预算或追加越界优化。

未完成与风险：多步next或远端/本机抖动仍可能超原5秒；过程非原子，只由每步client/topology和完整final拒绝观察到的变化。实机省时/准确定位、真实owned失败回收、父Q6、Codex正文/活动和高负载图形丝滑度仍分别待证。不能拿本轮86项绿覆盖原实机失败或其它scope。

失败保全：成本red exit1；原R7 Gate1首次“六节”误计exit1；R5 exact no-op/版本吞码red、loaded-first26检查10失败/exit1；旧native窗口红与R6重采样red；R6-after真实focus_sent_unverified/exit1；研究错误路径/长读截断、两Pydantic警告和图形12角色p95=20ms等仍在原产物，不覆盖或删除。

回滚信息：需root按归属介入运行时；源码可只撤本轮准确patch并恢复两文件before，保留R6与所有非本轮改动，不执行Git restore或清理用户工作，不重启清latch。英文提交建议：`fix(terminal): focus strict tiled panes without redundant exact-id probes`。

无新增跨功能事实。
