# R7 定位路线：独立实施后评审

review_target: impl  
impl_round: r7  
review_seq: 1  
review_date: 2026-10-05（Asia/Shanghai）  
reviewer: codex_index_impl_review（未参与 R7 terminal/test_focus 实施；非递归）  
author_report: [impl_report_r7.md](impl_report_r7.md)  
协议结论: **REVISE**  
业务结论: **PLAN_DEFECT**

局部实现符合§10，保守拒绝及原守卫成立；G3实机验收仍未满足。跨标签定位确认成功，但同一已接受布局从目标标签的错误pane出发，next在4→5→2后超龄停止，没有到目标3。§14与S2要求两种起点真实验证，不能用本地mock或cross正例覆盖next红。这个结论不否定独立R6的有限采样PASS，也不把诚实未确认当作错误确认。

## 冻结输入与范围

已完整加载 plan-review、verification-before-completion；预读正式§10/§14/source/ReviewLW/Gate2及准确before，随后完整读取最终两文件、patch、作者报告和red/green、root147项全文与cross38条/next39条实际事件。本轮reviewer只读取文件、独立本地Mock/FakeApi/direct-handler单测与纯候选/客户端解析，未操作真实CLI/helper/Win32、HTTP/数据库、SSH、GUI、服务、D:、Git或下级代理。未修改权威文档或产品。

| 当前冻结对象 | SHA256 |
| --- | --- |
| 唯一LW §10 / clarifications §14 | `58983B88406DE957626683955EBCC8724B43C6B3F227AEA58841026B71552EFC` / `ACC9D20B35D9982D1989CD1F366D2D0A3E26DC17D71E298FFE52EF19CBB3DDD4` |
| terminal before → current | `4448255D75B81D1E7BC4A18A28A0CED791E39A57C57ABD4E09DD9B354062BC39` → `B50D5C5F639B16FEB5616B18BF503D8851ADF7DF2293101CA04EF30545C534C3`；+19/-27行 |
| test_focus before → current | `5BDC13645241C46BD3E6D409C41566CF4FAFB2690A06AEB0F56B1507A7977A6B` → `9D7A2E50861302588FDDC31C2042A02D32F868297C78FEB691A80137EC8E45C0`；+75/-15行 |
| 准确patch / manifest | `34BF97C35238EC4505B5F43BB0940D089BC826A3FE2027E9AB5116B90787FEEA` / `349570D2326F06A9BDF137521503D7943F49F37B0C9F507791BD1BE8FD9ACD1F` |
| 作者impl_report_r7.md | `D8BAEDDAE51808D5A99F736770AC27B4035BC7749D376FFF199B4675712DC22F` |

准确before为 `work/wezterm-focus-lw-r7-before/terminal.py` 与 `test_focus.py`。reviewer独立重生成patch逐字相等，全部29来源current匹配manifest；其余27项及18份权威/已审输入均保持冻结。所有helpers、完整前检/deadline/pins/pre和原catch/导出包装字节相同，仅原try收敛路线及对应测试变化。root Gate2允许实施，作者没有提前或越界运行真实环境。root自身54项scope记录也已全文读取。

## 合同与实现检查

| 必填字段 | 结果及依据 |
| --- | --- |
| goal_lock_alignment | aligned：直接服务G3并保全G1/G2；实现与已审方案一致，但完整实机目标尚未达成 |
| anti_goals_touched | none：准确patch与27非scope不变；原身份/布局/期限守卫保留 |
| authoring_ergonomics_check | pass：原try内if/else与一份共同final，复用原helper/fake/clock，无策略或guard框架 |
| declaration_readability_check | pass：strict/nonstrict、非0返回、共同full association/真实pane/slot与strict fingerprint判定可直接顺读 |
| plan_defect_checkpoint_recommended | yes |
| plan_defect_checkpoint_reason | 新真实next样本在候选和关联保持、CLI全exit0时仍达不到目标；只删除前置重复成本不足以完成正常多步路径，需审查既定每步路线/预算成本与覆盖它的成本回归 |
| plan_defect_trigger_reason | §14和LW:633要求真实目标tab错误pane执行next并满足完整终验；当前next exit1、目标未到且无完整final，技术实现虽对齐但业务验收失败。修补不能仅改断言或原try，它涉及§10明确保持原字节的 `_focus_next` 路径/成本边界，需原地补方案、守卫与验证闭环 |
| impl_safe_validation_check | pass：作者成本症状先red后green，reviewer本轮独立86项；作者未冒充实机测试 |
| coordinator_handoff_check | pass：root提供当前全量、cross和next实际失败，责任及证据回传完整；此字段不表示实际next或生命周期验收通过 |
| 基线与澄清一致性复核结果 | PASS：本轮未回答Q&A为空，§14/§10目标与N1/N2/N3未被实施违反；不重复已有自动授权，不增加新需求 |
| 设计味道扫描结果 | PASS：无任务外抽象/配置/重构；产品净删8行。主要问题是正常多步路径预算不足，单独列为业务/方案缺陷 |

`terminal.py:202` 只对当前 `_focus_candidates` 完全接受的strict候选直接使用原 `_focus_next`；不成立仍exact，无遍历。两者在`:213`后共用一次完整observe及fresh inventory，要求全部same_association、真实client exacttarget、唯一slot/pane、原累计age和deadline；strict另需fingerprint不变和final inventory非0保留原exit。前检、每步client/topology与异常出口未弱化；nonstrict最终清单故障保留原未确认语义。旧行为用例只因执行顺序调整计数/观察锚点，未删除拒绝集合。

| 禁止项 | 可核查依据 | 结论 |
| --- | --- | --- |
| 5秒延期、reset年龄/最早deadline、复用旧成功 | try之前完整字节相同；新增成本和最终迟到测试，源中原累计age表达式保留 | 确认不存在 |
| 放宽实例/唯一client/slot/候选拓扑/版本或省完整最终观察 | `_focus_candidates/_focus_next/list_panes`字节保留；共同final明确所有guard，错误布局仍exact | 确认不存在 |
| 键盘字符、创建/复活/清理、清latch、D:或UI/native/source/Service改动 | 27非scope current SHA全部等于before，准确两文件patch | 确认不存在 |
| mock或CLI exit0冒充正式确认 | 作者报告明确移交root；两个真实结果分别记账，next返回focused=false | 确认本轮未冒充 |

## 实际验证与失败记录

| evidence / 实际结果 | owner / 独立核验与限制 |
| --- | --- |
| `work/wezterm-focus-impl-r7-red-result.json`：1成本用例/1失败/exit1 | impl；完整输出已读，before terminal SHA正确，保留red测试源，其成本方法AST与green完全相同 |
| `…green-result.json`：86项/0失败/exit0；`…static-result.json`：20项/0失败/exit0 | impl；完整两流与静态输出已读，tested SHA绑定final，静态自称之外另做独立字节复核 |
| `work/wezterm-focus-impl-r7-review-local1.json`：reviewer实际86项/exit0，3812ab，完整输出未截断 | fresh reviewer；命令为 `-m unittest tests.test_focus tests.test_workbench tests.test_native_processes tests.test_gateway.GatewayDispatchTests -v`，只有本地假API/Mock/direct handlers，前后tested bytes相同 |
| `work/live-session-root-tests-r7-1.json`：147项/0失败/exit0 | root；reviewer 1cdeba全文读取，原raw base64、before/after/current hashes独核；两条Pydantic forward-reference警告仍存在，未隐去 |
| `work/wezterm-focus-impl-r7-review-verify1.json`：26项全真/exit0，004d5f全文 | fresh reviewer；独立重建准确patch、冻结范围与输入、红绿源、当前全量、两真实phase全部candidate fingerprint/完整关联键、每条CLI/单一client及年龄。这里“绿”包括如实确认next失败，不能等同业务PASS |
| `work/wezterm-focus-root-scope-r7.json`：54项全真/exit0 | root；全文读取，范围/当前回归/cross正例/next红均明确，不覆盖实际失败 |

| 真正定位模式 | 完整数据判断 |
| --- | --- |
| cross：`work/live-session-focus-timing-r7-cross-1.json` / SHA `6AD61C35…00CBA` | exit0/confirmed；起点client1/terminal8；product只有tab-ID1动作、没有next；3份完整关联与5份候选清单fingerprint保持，完整final与独立client均terminal3。最后远端累计age4375ms，动作窗口2703ms，符合原预算。总请求5094ms包含initial/强制刷新等，不能误作内部deadline超时 |
| next：`work/live-session-focus-timing-r7-next-1.json` / SHA `29365191…54459` | **exit1/unknown/focus_sent_unverified**；起点terminal4；product tab-ID1仍4，next到5、再next到2。候选集为2/3/4/5，全部6份strict fingerprint不变，2份完整前观察的全部关联键相同，真实client始终1且CLI全exit0；到最后库存检查累计age5218ms，原5秒已耗尽，未发第三次next、未到3、未执行成功终验。独立最后client仍terminal2。总请求6141ms，停止时动作窗口3562ms，不能混淆动作deadline与远端累计age |

next原始pane JSON并非全字段逐份相等（焦点等显示字段变化）；本reviewer逐份调用原纯 `_focus_candidates`，确认合同实际使用的完整fingerprint一致，不把无关显示差异当作候选重建。没有拓扑、关联或客户端身份变化可解释此次拒绝；触发点是累计年龄超限。诚实停止是正确安全行为，仍未完成该实机能力。

本地成本症状 `test_focus.py:216` 的动作是tab直接到3；`:255`的多步正例没有相同真实CLI成本，因此它们不能证明本布局4→5→2→3在原期限内有能力完成。§10.2预先允许迟到时未确认，这约束错误处理，不能免除§14/S2的正常两类起点验收，也不构成每一次/任意延迟都必须成功的承诺。当前实际next已有明确反例，无须用户替agent确认或仅等待更多mock证据。

## 缺陷分流与原地修订输入

唯一阻断项为上述G3正常多步实机目标缺口。没有发现局部源代码偏离§10，不能按IMPL_DEFECT直接偷改原helper或放宽5秒；原始需求真实、方向正确，不是PROBLEM_DEFECT。恢复按 **PLAN_DEFECT → 当前唯一LW原地补收敛计划 → fresh Review(LW)** 执行：

1. **是否需要澄清：当前不需要。** 原严格布局、完整后验、预算与用户自动实施授权明确；技术路线补证由root承担。若新方案必须放宽范围/守卫/期限则再回基线，不从本报告推导批准。
2. **LW修订点：** 保留§10及全部R5/R6已实施前缀，追加带修订说明/tag的多步成本收敛章。以这份真实4→5→2后超龄样本为输入，明确原 `_focus_next:136–170` 哪些调度/成本决策确需改变、哪些每步client/topology/版本及完整final守卫必须保留；选择经过固定版本官方/现有机制核对的最小路线。不夹带R8未审草稿或把其候选研究当作本轮实机通过。
3. **已落地偏差摘要：** R7源码正确实现strict直路/nonstrict exact及共同final，解决当前cross路径；原向next逐个候选的成本仍无法在所测正常布局的累计age内到target。保留当前两文件作为下一轮准确before，不要求全撤R7或撤R6。
4. **补入收敛与验证任务：** 有真实多步成本的red→green，同时保留原cycle/no-op/held/真实client、候选重建、所有final关联/age/deadline/非0出口拒绝。root从目标标签错误pane真实执行足够移动到3并完成完整final、独立client与预算核对，另重复cross；所有late/unknown/busy/red不省略。自身生命周期证据缺失仍独立待验。
5. **必须保留的支撑文本：** §8每步候选/真实client/终验合同、§9三次完整采样、§10已实施路线/成本模型与全部红绿、§14/source、当前before/patch/manifests和本报告。原“保持 `_focus_next` 字节”若需覆盖，应在新修订明确范围和理由，不删支撑链；如不得不大规模删除/重排，标记“需升级处理”，不要当普通修订。

## contract drift / stale / mirror mismatch 与继承边界

未发现R7作者越界或shared/platform/mirror漂移；作者report和manifest的root/fresh pending是冻结时记录，真实证据后续另存，没有回写它来制造已验收。README阶段说明随后由root同步为cross成立/next待修，不能据单次cross称稳定。后续基线/LW追加应明确新阶段，不改当前R7产品/报告/manifest，也不覆盖本轮冻结hash。

本轮作者成本red、当前实际next red全部保留；本reviewer预读和正式验证没有失败/截断。parent曾误猜before-products目录，及时更正为真实before路径，本reviewer未运行错误路径。旧R7 Gate1六节误计、R5 no-op/版本吞码red与loaded-first26项10失败、R6低层/并发/main红、R6-after超龄以及历史检查器/路径/长读失败继续在各旧报告保全；本轮不重复修改它们。R6局部PASS仅属于其有限采样scope。旧r4 BLOCKED、真实owned失败回收/父Q6、Codex正文与实时活动、高负载图形p95约20ms未达16.7ms、自己的测试会话退出重建仍独立待证，不能用147项或cross关闭。

不允许本轮按G3已验收进入Archive/PR；先走上述方案回退。英文提交建议待后续验证：`fix(terminal): focus strict tiled panes without redundant exact-id probes`。

无新增跨功能事实。
