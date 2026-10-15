# R8 定位路径与同请求证据：实施记录

feature_name: wezterm-session-link  
impl_round: r8  
date: 2026-10-05 Asia/Shanghai  
lwplan_version: 唯一 LW §11，SHA `FBF57196A188EFB73947D2AC1B0510FF9399984C2A72E820DA9A5F58B492E288`  
状态：作者本地实施已验证，root 当前实机与 fresh ReviewImpl 待承接；不宣布整套稳定。

消费当前 §15/source/README、R7 REVISE/PLAN_DEFECT和已审 §11。safe-code-changes/verification 本轮全文已读。fresh ReviewLW `E8E755A6384B47E879F7AEE9B09733AFE89FF68EE62B1D5C3498DE1E4B9D4079`全文已读；root Gate2 recheck1 全76项true/exit0/allow_enter_impl=true，root随后明确实施放行。before保存于`work/wezterm-focus-impl-r8-before/`，全29产品及26输入绑定`…before-manifest.json`，实际freeze `877570` exit0。没有提前改产品或执行真实动作。

| path | change_type | change_purpose / key_changes | related_tasks |
| --- | --- | --- | --- |
| session_panel/service.py | modify，+5/-2 | private keyword `_include_inventory`仅force返回本次刚用于merge的view/inventory；默认dict/cache不变，不保存库存；非force误用ValueError | S1-R8 |
| session_panel/terminal.py | modify，+30/-9 | 复用同force清单；原pre真实pane在候选时省goTab；四矩形字段纳入指纹；唯一目标up，歧义原next，up结果不对立即停 | S1-R8 |
| tests/test_focus.py | modify，+201/-12 | 真实Service同成本三个起点red→green；同tab/零动作/乱ID/歧义/错误client/几何变化/非0/预算与完整final拒绝；原fakes对齐私有pair和严格坐标 | S2-R8 |
| tests/test_observation.py | modify，+81/-0 | 5个私有契约测试：同份merge库存、公共缓存/快照隔离、强制要求、失败撤绑定/保留exit、原最早age | S2-R8 |

仅四产品路径改变，两源码合计+35/-11。准确patch为`work/wezterm-focus-impl-r8.patch`；全before/final SHA与证据为`work/wezterm-focus-impl-r8-manifest.json`。其余25产品、R6 native、26权威/已审输入不变。原38个focus/observation测试方法全部保留，新增14个；仅原轨迹fixture/私有调用调整，没有删除拒绝条件。无新增产品文件、依赖或配置。

goal_lock_check: G3按原exacttarget/fullfinal实现收敛，G1 honest unknown与G2连接规则保全；实机业务验收仍pending。  
anti_goal_touch_check: N1/N2/N3未触碰；无来源/图形/reader/API/schema变化，无创建/输入/复活/清latch/预算扩展/跨请求库存。  
authoring_ergonomics_notes: 原Service函数可选private pair、原helper短几何筛选，沿用runner/fakes/clock；无策略、guard、返回类型或寻路框架。代码注释英文，声明顺读明确。  
contract_drift_reports: 无新增漂移；§11明确覆盖§10原Service/helper字节保持的有限锚点，未静默绕过。首root Gate2两个字面格式假设失败由root修检查器后独立重验，不修改authority来绿化。

原时序：Service started仍在远端采集前；refresh_finished紧跟force返回，row age包含采集成本继续累计；deadline仍库存/age检查后、pins前。静态逐字证明：除force pair和删重复赋值之外整个pre/时间/pins/observe相同，原每动作rawclients/version/fullinventory与预算段相同，R7共同fullfinal、nonstrict exact失败分支、catch/其它函数均原字节。zero-action先查时间仍走完整final；up实际错误、几何变化/stack式展开、no-op/empty/late不得确认。公共stack/hidden/active_at不足仍为限制，不把候选视为证明。

| impl-safe实际验证 | evidence / owner / conclusion_if_missing |
| --- | --- |
| 先red：`.venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-impl-r8-run-tests.py red tests.test_focus.FocusFallbackTests.test_actual_service_wrong_panes_and_saved_wrong_tab_keep_original_budget tests.test_observation.ObservationTests.test_private_force_returns_exact_merge_inventory_and_keeps_public_cache` | `…red-result.json`；impl；`829d1b` exit1，2方法、3预算失败＋1接口缺失错误。两源码匹配准确before；两份red源完整保存。缺此不能称有效回归 |
| 同两症状green：同命令将stage改为symptom-green | `…symptom-green-result.json`；impl；`b2890d` exit0/2方法0失败；red方法正文与final逐字相同。缺则症状未证 |
| 完整本地：`.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_focus tests.test_observation tests.test_workbench tests.test_native_processes tests.test_gateway.GatewayDispatchTests -v`（由同collector捕获） | `…green-result.json`；impl；`6d9aa5` exit0/115项0失败；工具聚合输出截断已由`784070`完整补读stdout/全部stderr/exit/tested SHA。当前选择无warning；旧全量Pydantic warning仍保留，不称本轮消除。缺则局部未验证 |
| `.venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-impl-r8-static.py` | `…static-result.json`；impl；`51ae5e` exit0/20项全true；四路径/25不变/26输入、原完整final/时间/每步guard、红方法不变与green tested字节。完整准确patch `fa9666`已读。缺则范围/字节未证 |

coordinator_handoff_verifications：作者仅local Mock/AST/纯文件，下面均非impl-safe，不能执行或冒充完成。

| 待承接验证 | evidence_expected / owner / conclusion_if_missing |
| --- | --- |
| 当前独立完整回归/scope、准确四SHA对应gateway受控加载 | `work/live-session-root-tests-r8*.json`及root scope/loading完整输出/exit/前后身份；root自行执行；缺则当前运行未证 |
| 新0990a0a5/PID3886044/ticks1341437828的五起点各3轮：wrong2/4/5、cross保存wrong5、alreadytarget | `work/live-session-focus-stress-r8*.json`完整事件/每动作client+version+geometry/完整final与独立client，两个原5000ms成立才确认；root自行执行；所有busy/red/unknown保留，缺则真实收益/稳定未证 |
| HTTP/IAB刷新、新远端及原Codex独立mesh/UUID/正文/焦点，旧c930 missing与新instance不混 | root当前新UUID消息/原生mesh/HTTP同源与完整焦点输出；root自行执行；缺则主链隔离未验，不拿已有22项浏览器窗口代新focus成功 |
| fresh ReviewImpl核最终bytes/diff、全部红绿与root真实失败 | 本目录独立review_notes_impl_r8_1.md；fresh reviewer；缺则整批未审，不交付整套完成结论 |

失败保全：本轮有效red三失败/一TypeError与完整源保留；完整green聚合截断及完整补读如实分开。先前作者manifest字典误读KeyError、up巨量截断补读、root首Gate2字面假设两失败、R7实际next超龄/成本red和REVISE、R8周期前两诊断与过早marker、R5/R6/旧Gate/运行失败及warning均不覆盖。旧owned失败回收、父Q6、Codex正文实时活动、48角色与自动合作仍独立缺证；本轮不关闭。

未完成与风险：root实机/加载及fresh review pending；调度或远端波动仍可能超龄，必须诚实unknown。唯一up只是候选且非原子观察仍存在，审查重点为private same-force库存、每动作geometry/client与完整终验。  
回滚信息：**可直接回滚**准确四路径R8增量至冻结R7 before（root核工作来源后执行），保留R6及其它用户工作/历史失败；不得用服务重启清latch。作者未操作Git。  
英文提交建议：`fix(terminal): reuse fresh pane evidence and focus the unique upper target`。

无新增跨功能事实。
