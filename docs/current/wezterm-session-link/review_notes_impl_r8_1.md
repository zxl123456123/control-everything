# R8 独立 Review(Impl)（第 1 次）

review_target: impl  
impl_round: r8  
review_seq: 1  
review_date: 2026-10-05 Asia/Shanghai  
实施记录：[impl_report_r8.md](impl_report_r8.md)  
协议结论：**REVISE**  
业务结论：**PLAN_DEFECT**

R8 实现与已审 §11 一致，原守卫和诚实拒绝保全，但指定五起点各三轮仅 **12/15 confirmed**。三次完整终验的累计证据年龄超过原5000ms；独立client已经到目标仍不能改判成功。当前计划在真实I/O波动下的性能余量不足，尚无需要立即修补的局部实现偏差；本报告不放行稳定能力交付或R8运行发布。

## 输入、范围与独立证据

完整读 plan-review、verification-before-completion，LW §11、§15/source、fresh ReviewLW、作者报告、四路径全文及完整patch。本 reviewer 未参与实施，未运行产品测试、真实native/CLI/helper/HTTP/SSH/GUI/服务/Git；仅新写本报告与自己的静态/保存事件证据。

唯一LW为123002字节，SHA FBF57196A188EFB73947D2AC1B0510FF9399984C2A72E820DA9A5F58B492E288；fresh ReviewLW SHA E8E755A6384B47E879F7AEE9B09733AFE89FF68EE62B1D5C3498DE1E4B9D4079；root Gate2 recheck1 76项全true/exit0/明确放行。作者manifest SHA F8294987DD095E902E244296CF5A9A4E3C649C97562E31128530E700C0680E2A；patch SHA BB68FC618416C931C026A28FE5FA94F62AABC56FA66D0AFA1742927968CBFDA6；作者报告 SHA D7F69D8138EF55AE5CFC89D83AA832B684F0869AD95111EC1EADBA5796BEFDBB。

四路径当前SHA：terminal 438060405B539FE2774B4820B7C826369966B637503A71D93420F9F2DDE91250；service 19570A2A11069E959FE6262EF8F77BAD8ECC80457C4F987447B15C913CF98AA2；test_focus 8BB5F145AEF1B7073372676B8A375912B30C1FB7240CB99171360F007E383EB4；test_observation 865877DFFD9893332CDF74BB2EF94DC6BE5381669020864FDD4125E52B13F20E。

本轮实际命令 .venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-impl-r8-review-verify1.py，工具2c4bb7，**exit0、234项全true、failures=[]**，完整输出已读。未导入产品或调用真实运行时；独核29产品/26输入/四before、重建patch、原pre/时钟/pins/关联与完整final字节，解析全部15轮所有阶段native六字段、SSH注册、完整pane清单及client输出。按事件索引复核同请求清单和每步client→version→inventory；15条完整事件顺序由039da2无截断补读。234绿包括“诚实拒绝三次超龄”的证据判断，**不是15轮业务通过**。证据：[review-verify1.json](../../../work/wezterm-focus-impl-r8-review-verify1.json)。

root scope的29产品/26输入/四before/重建patch/实测字节记录全文已读。其余25产品及R6 native未改；两源码+35/-11；38个原focus/observation方法保留，新增14个方法。

## 实现核对

Service默认public dict/cache不变，private forced pair只返回本次刚用于merge的完整inventory，不存attribute/snapshot/cache；非force私有误用立即ValueError，失败仍撤当前绑定，不补取旧成功。

Service started仍在采集前，Terminal refresh_finished紧跟force，原deadline仍库存/年龄验证后、pins前；action_lock、cleanup_latch、唯一slot与requested/fresh实例对齐不变。仅省force后重复清单、同tab无效goTab；真实pre singleton pane决定当前位置。四整数矩形字段进入指纹，全部selectable上邻居恰为目标才up；歧义原bounded next。未猜stack/hidden/active_at；up错误/no-op/client变化/几何变化立即停。

每动作原raw client-ID、version、fullinventory及两预算段保持字节，R7唯一完整final observe＋freshpanes保持字节。零动作先查时间仍做fullfinal；nonstrict exact失败语义保留。源码与§11有限锚点对齐，无新增框架或无关重构。

## 分层验证与真实失败

| 层 | 实际证据及边界 |
| --- | --- |
| impl-safe作者 | red-result：2方法、3成本子例FAIL＋接口TypeError、exit1，准确before/red源保留；同症状green和完整green-result 115/0/exit0。完整流已独立读，固定模型不替代实机。 |
| root当前全量 | root-tests-r8-1：161、1ERROR、exit1，GatewayTests.test_focus_requires_exact_origin_and_per_process_csrf在getresponse处Win10053。相同产品字节r8-2：161/0/exit0；两份完整流均读，第二次不抹第一红，两份仍各有两次Pydantic lifespan warning。 |
| root实际矩阵 | focus-stress-r8-1：15轮、12confirmed/3unknown、exit1，原始SHA 2905EB8D582441DE471454AAC60EF5DE9734139BA03B763B388DF412AEA4D83C。全部子命令exit0、关联/实例/候选稳定、每步与完整final保留，独立最终client均ID1/pane3。 |
| root audit | 首audit15条无重复库存误判false，因Windows inventory/refresh事件同tick；按事件索引recheck1仍exit1，仅整批15绿与三个result/三个age共7项false。本reviewer独立索引判断一致；原audit不覆盖。 |
| 运行集成 | **HTTP/reload/IAB R8验收 NOT RUN**。root因矩阵失败决定不发布，当前仍R5运行时；旧检测/浏览器正例不代替R8当前焦点集成。 |

cycle为原始0-based编号，单位ms：

| 起点 | 三轮确认 | 最终累计远端年龄 | 动作窗口 |
| --- | --- | --- | --- |
| same-2 | 3/3 | 4171 / 4172 / 4000 | 2891 / 2891 / 2797 |
| same-4 | 2/3 | 4282 / 4000 / **5844** | 2969 / 2687 / 2750 |
| same-5 | 3/3 | 3999 / 4140 / 3968 | 2688 / 2797 / 2687 |
| cross-saved-5 | 1/3 | 4750 / **5328** / **5187** | 3391 / 3390 / 3703 |
| already-target | 3/3 | 3015 / 3422 / 3063 | 1813 / 2203 / 1813 |

失败cycle1 cross fresh1938→final5328；cycle2 same4 SSH2672、fresh3094→final5844；cycle2 cross fresh1484→final5187。所有动作窗口<5秒，但远端最早年龄包含force刷新与后续完整核验。物理到达/exit0不替代当前完整确认；不延长预算、不重置年龄、不移动起点、不省字段/最终核验，也不能将总请求walltime当动作窗口。

## 必需字段与基线复核

| 字段 | 判断 |
| --- | --- |
| goal_lock_alignment | aligned；G3精确目标、G1诚实unknown、G2连接未漂移，稳定验收未达。 |
| anti_goals_touched | none；准确scope与下表支持。 |
| authoring_ergonomics_check | pass；原函数短private分支与几何筛选，沿用fakes/clock。 |
| declaration_readability_check | pass；producer→caller→前检→有界动作→共同final明确。 |
| plan_defect_checkpoint_recommended | yes |
| plan_defect_checkpoint_reason | 两次cross和一次慢SSH完整终验超龄，须回计划评估I/O成本与余量。 |
| plan_defect_trigger_reason | §15/§11 S2指定五起点各三轮原双5秒确认，实际12/15；源码按计划实现，收敛须改时序/成本设计与相应验证，超出局部实施偏差修补。 |
| impl_safe_validation_check | pass；有效红绿/115局部、root相同字节161第二次绿和独立静态234成立，首全量红保留；reviewer未运行产品测试。 |
| coordinator_handoff_check | missing；矩阵已承接但未通过，当前R8加载/HTTP/IAB未执行；无冒充完成或下放作者。 |
| 基线与澄清一致性复核结果 | PASS；§15/source/README、§11与当前四路径一致；未回答列表为空，已回答unique-up/同请求pair决策未违反。 |
| 设计味道扫描结果 | PASS；没有新增过度抽象/无关重构；该字段不关闭性能/实机失败。 |

| 禁止内容 | 可核查依据 | 本轮未踩中 |
| --- | --- | --- |
| N1创建/复活/键盘、改D或其它用户进程 | 四路径准确patch、无新动作种类；真实动作仅root已授权归属测试，作者/reviewer无实际运行 | 是 |
| N2扩来源/API/schema/reader/图形/时间版本合同 | 其余25SHA不变，原pre/每步/final字节、Service默认dict/cache不变 | 是 |
| N3缓存旧成功/通用框架/清lock-latch | 同请求局部pair及原lock/latch/pins保留 | 是 |
| 弱化fullfinal/late拒绝 | 完整final字节相同，15轮完整终验与3次诚实unknown | 是 |

没有新shared/runtime mirror漂移；§11明确覆盖§10有限Service/helper锚点，旧支撑保留。manifest pending是实施冻结时状态，不能解读为R8当前部署。HTTP未执行是明确未发布，不能说已验证。

## 分流与回退输入包

协议先判REVISE，再判业务。原始“真实UUID→机器人/正文→精确终端”目标可追溯，未命中PROBLEM_DEFECT；未见局部低风险、无新决策的源码偏差，需改唯一LW时序/性能设计，故PLAN_DEFECT。安全unknown正确执行不等于稳定PASS；R7 REVISE、R6仅自身scope PASS保留。

- 暂无新增用户决策；持续自动实施授权覆盖正常修正。拟改变预算/起点、减少守卫/字段或放宽成功定义须回上游，不自行改口径。
- 原地追加下一轮修订说明，保留§8–11、R6/R7/R8支撑、准确before/current和所有失败。说明实际refresh/每步/final成本与两窗口，论证独立I/O边界及可减少等待的路径；本报告不预先认可未审新方案。
- 将R8四路径作为下一轮准确before，保留same-request pair、same-tab skip、unique-up和完整拒绝。不要求无来源回滚；若撤回，root核归属仅撤四路径增量，不清latch/改其它用户工作。
- 用三份真实红成本补local红绿/异常/迟到测试；root当前全量、同实例五起点矩阵、独立client/两预算/fullfinal，然后受控HTTP/IAB隔离及fresh ReviewImpl。所有red/busy/unknown保留，不能挑绿替代整批验收。
- public stack/hidden不足与非原子观察仍诚实拒绝。若收敛必须删除旧支撑或扩大范围，应升级处理，不包装成简单补实施。

本批不允许稳定能力Archive/PR，返回LWPlan→fresh ReviewLW/Gates→明确实施放行。旧owned失败回收、父Q6、Codex正文/实时活动、48角色游戏性能、自动合作仍独立缺证。

失败保全：作者red三FAIL/一TypeError与green聚合截断补读、root首161 Win10053/两warning、15矩阵三unknown、首audit同tick误判、首Gate2两个字面错误均保留；R7 next/cost red、R8前两cycle诊断/过早marker、作者manifest KeyError与历史R5/R6/Gate/运行红沿用前轮。reviewer首材料聚合与首次大事件投影截断已定向完整补读/逐事件解析；两次构造文件工具调用JS SyntaxError均发生在写入前，未改文件；随后独立234/0核验成立，不省略这些失败。

英文提交建议：fix(terminal): reuse fresh pane evidence and focus the unique upper target。无新增跨功能事实。
