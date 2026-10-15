# R9 实施：同请求独立采样重叠

feature_name: wezterm-session-link；impl_round: r9；date: 2026-10-05 Asia/Shanghai。  
lwplan_version: §12，132628bytes，SHA F9F023CFD52066B9AEADE38D2E562A7173AA0DB93F387D9474301D670A831312。  
当前结论：仅作者本地实施/验证，真实收益、当前运行加载与整批稳定待 root/fresh ReviewImpl。

fresh ReviewLW 05C0A3D…EDAAB3 与 root Gate2 950852DB…3D8230 已全文读；root明确实施放行。实际before核验8a4178/exit0：29产品、23输入、4准确before一致，root Gate2实际67项全true。before与输入在 `work/wezterm-focus-impl-r9-before-manifest.json`，不改旧§11或R8报告。

| path | change_type / change_purpose / key_changes | related_tasks |
| --- | --- | --- |
| session_panel/service.py | 修改：只private forced pair使用临时one-worker remote，与main完整inventory重叠；取齐并join后原merge/store。公共采集顺序与失败字典保留。 | S1-R9 |
| session_panel/terminal.py | 修改：final fresh inventory在临时one-worker读取，main完整Workbench.observe；同原deadline，join后全部原判定/catch保持字节。 | S1-R9 |
| tests/test_observation.py | 修改：新增3个行为方法，Event overlap、pending锁/快照、异常/最早age/merge前worker退出；旧20方法AST一致。 | S2-R9 |
| tests/test_focus.py | 修改：新增3个行为方法，Event overlap、pending action_lock、两侧异常/late/unexpected异常传播前join；旧32方法AST一致。 | S2-R9 |

goal_lock_check: G3完整目标/关联/原两个5秒保持，G1失败unknown及G2连接原规则不改。anti_goal_touch_check: N1–N3未触及；其它25产品/current23输入不变，无真实动作/服务/HTTP/SSH/GUI/Win32/D/Git/递归。authoring_ergonomics_notes: 两个局部标准库with及原函数，未建新接口/框架；public原try/except只移入else，测试沿用fakes/Mock。源码准确+26/-10：Service+21/-8，Terminal+5/-2。

准确patch为 `work/wezterm-focus-impl-r9.patch` SHA E17D07CDDB32E99DB1FC705416750290500952ECDEE398BD102D2EA7E25BB5A2；final29及全部before/current输入见 `work/wezterm-focus-impl-r9-manifest.json` SHA 0F14EEDB9D46C2F06DAAC97B066FADD37EC5ACC91BFC2D9F269F481E9D58E997。

| impl-safe实际记录 | evidence / owner / conclusion_if_missing |
| --- | --- |
| `.venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-impl-r9-test.py red`，03afd9 exit1，2方法/2FAIL；两处Event均overlap=False。产品源码仍准确R8，红源保留。 | red-result.json/red-fixture，作者；缺则症状有效性未证。 |
| 同collector `symptom-green`，b061ee exit0，原两个方法2/0；红源方法与最终源exact。 | symptom-green-result.json，作者；缺则重叠未证。 |
| 同collector `green`，ce67d8 exit0，121/0，完整stdout/stderr保存；本地无warning。实际子命令：`.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_focus tests.test_observation tests.test_workbench tests.test_native_processes tests.test_gateway.GatewayDispatchTests -v`。 | green-result.json，作者；缺则局部回归未证。 |
| `.venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-impl-r9-finalize.py`，ae321c exit0，16项全true。独核scope/23输入/原完整final与catch exact/两源码仅规定替换/旧52方法AST/红源/121对应final29。 | static-result.json/manifest/patch，作者；缺则差异与测试字节未证。 |

所有stream及真实exit和testedSHA保存在 `work/wezterm-focus-impl-r9-*-result.json`；collector不是实机收益测试。新Event证明任务重叠、worker先于merge/锁释放退出，pending时不发布结果；捕获异常仍原未确认，未捕获异常join后原样传播，不构造成功。完成点clock late依原age/deadline拒绝。旧共享fake-clock成本模型方法完全保留，不拿其相加耗时宣称并行性能。

coordinator_handoff_verifications: 非impl-safe仅root：当前完整回归/29scope；新0990a0a5/PID3886044/ticks1341437828五起点各3轮、完整raw/独立client/fullfinal与两个原5秒；精确自有gateway加载、HTTP3cycle、IAB实际focus/client/机器人及正文隔离。evidence_expected: `work/live-session-*-r9*.json/png`；owner: root，随后fresh reviewer独立最终bytes/diff/全部红绿/真实失败落ReviewImpl；conclusion_if_missing: 实机收益/当前运行与整批稳定未证，不发布完成结论。

contract_drift_reports: 未发现新authority/shared/mirror漂移。原started早于submit，refresh_finished/原deadline/pins/pre/每实际动作采样不动；完整final谓词/except原字节，Workbench内部census/clients不动。资源创建/submit异常不补旧证据/续发动作；running任务不能cancel强停，原有子调用timeout保持，context退出前join。

未完成与风险：root实机/HTTP/IAB及fresh审查待承接。更早并行inventory仍由采集前started保守计龄；非原子样本及调度波动照旧拒绝。最慢旧样本模型仅31ms余量，121本地绿不承诺新15全绿。回滚信息：可直接回滚本轮准确四路径增量至R8 before；由root核归属操作，保留其它用户工作、R6/R8与全部失败，不清latch。

失败保全：本轮03afd9两个有效FAIL；test_focus宽读工具输出中段截断已按235–385补读，121流完整且两流输出交错另存原独立stdout/stderr。本轮新测试/实现没有其它执行失败。上一R9规划旧路径/PowerShell解析/rg无匹配及补读记录保留；R8实际12/15三late、首161 Win10053/两warnings、首audit/Gate2红及R5–R7所有红不被覆盖，HTTP拒绝体竞态另项冻结未改。旧owned/Q6/Codex正文活动/48角色/自动合作仍缺证。

英文提交建议：`perf(terminal): overlap fresh sampling within the original focus budget`。无新增跨功能事实。
