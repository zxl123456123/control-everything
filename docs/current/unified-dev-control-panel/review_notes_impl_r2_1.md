# 会话关联首批实施后复审（Impl r2，第 1 次）

- review_target：impl
- impl_round：2
- review_seq：1
- review_date：2026-10-03
- reviewer：session_impl_review_r2；全新独立 reviewer，未参与实施，不递归委派。
- 实施报告：[impl_report_r2.md](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/impl_report_r2.md)，SHA256 19AE65E0A53697CAA7875DD4D35E620874463A5D265ACF8DCA118A4C13FE1661。
- **协议结论：USER_CONFIRMATION_NEEDED**
- **业务结论：**

r1 的读前 revision 竞态已按既有 S2 要求修补。reviewer 独立第三次 stat 复现取得 available=false、revision_mismatch、reader_calls=0；全量 48 项本地测试与编译 exit0。旧实现的内存红控仍有一项失败，证明新回归能抓住原缺陷。本轮没有发现新的必修代码问题，也没有目标、预算、reader 路线或回滚设计变化。

整体首批仍未验收：当前聊天实际可用的三项 MCP 工具为空，客户端未加载，项目的信任来源未确认。仅对“正常重载或重开当前项目后，三个工具是否可观察到，或出现什么现成提示”请求低风险观察；本结论不授权设置项目可信或修改权限。业务结论留空、阶段保持 impl_reviewing；不能进入 Archive/PR，也不能把本报告当成最终业务分流。

## 独立输入、版本与实际差异

准备阶段完整读取全局 AGENTS.md、coordinator、development-workflow、safe-code-changes（职责边界）、plan-review 与 verification-before-completion。批读被外层截断处，以及 lwplan/r1 报告中被工具省略的小段，均已定向完整补读。正式 READY 后完整读取 r2 报告、21 个实际最终产品文件、精确 diff、manifest、作者和 root 的完整输出及过滤后的外部证据；不以摘要或作者自评替代判断。本轮只运行本地合成验证、编译与 hash 检查，没有执行真实 SSH、真实正文读取、focus、进程管理、客户端动作、Git 或产品修改。

| 输入 / 证据 | reviewer 本轮核对 SHA256 |
|---|---|
| lwplan.md（唯一计划） | 38E3F991AA0BBF3434F2A9B7A2562EA0DBFE7520095C894003B4934018AB3074 |
| clarifications.md（Q1–Q5、完整基线 1–10） | EB92133A3A26D70340EAEF7F5A0A954DC3ED1F78F4FACBA4EDA01FB7B84F5109 |
| review_notes_lwplan_2.md | 8FC0D0166D4EDC6B7A059953ABEFFDB8A880396EEBBDE5D56FCAC761E2C7A08D |
| impl_report_r1.md | 030400B5E17A44649EDEE6D9DCE6561364BDDB1FCB0CE67341E45B525366EB51 |
| review_notes_impl_r1_1.md（历史 REVISE / IMPL_DEFECT） | 9584CEBD5430B06ED2A85F2BCEF88E4AA9FCE6D9C47D1C51E134057652C99FD8 |
| impl_report_r2.md | 19AE65E0A53697CAA7875DD4D35E620874463A5D265ACF8DCA118A4C13FE1661 |
| work/session-product-manifest-r2.json | E64751F2A7EC27ED395A0F849453A578E5B5565B0DB2B5E8CCB71F5B136880AF |
| work/session-product-diff-r2.patch | A92F490E68167DA04D9C9D07EEC74AD9609CC72FF49A8FF9B194F518A48D9567 |
| work/impl-core-remediation-r2.txt | 436522CB641EAD4BEE5C98330E29BC49D3870D6BBAE1BEEED2C098DA2FDFB867 |
| work/impl-safe-r2-root.json | 646C709EEEAB64C3482AF74B61347629C5BBDCFC5F0C0A94C6C27D34E5400049 |
| work/impl-safe-r2-root.txt | 41340BAE7DD0D2F4EE9E9CA2DE27DF7CE4761F550A3E30C6D101D0D3ECEEDD3C |
| work/session-revision-race-r1-red.json | A8AAE72973EFDCCC3628486AF7D03F47522143746D8A19D1493C51D5950564E8 |
| work/session-revision-race-r1-green.json | 6059A8BFA90DC217F59F94F0601E3952605DDED19DEED30D873F22E4C27C093A |
| work/session-sdk-synthetic-r2.json | 00BE3641910D4588C6FCFDFFEB1BFA0D7A82284067A29D97FCE1A13DF4F608C6 |
| work/session-mcp-protocol-r2.json | AEB1CA97DFE58CDFF3A13579D9B2F99BF39C44B3997D16F1A94CF67554E4B0BB |
| work/session-mcp-protocol-r2.stderr.txt | 139AEB80221CB7B7D0EBCE334248617451F823FD52B5183B2F60E3534E38E768 |
| work/session-panel-external-r2.json | 7F4313E2D1CFADB55E0A17A3C56F84D845E83CFC66478618F63DF854E66BC8C1 |
| work/session-impl-r2-ready-verification.json | 1C52BCB862BC33C4EB35D432B6420AF8EF8012F9EAAFAD3BE91EF8B6B7621C75 |
| work/session-project-trust-observation-r2.json | 79BE08B3F3BDD5D9827CD62C86451DC7B8030608F1BBA73157225471D2C4A991 |

reviewer 独立 hash/重建命令 exit0：manifest_files=21、mismatches=[]，相对 r1 只改变以下两个文件；去掉精确新增片段后，两份原文 SHA 均匹配 r1 manifest。独立生成的 unified diff 与已交付 patch 逐字相同。其它 19 个产品文件保持 r1 hash；feature README 的阶段记账不属于产品差异。当前非 Git，不初始化或恢复仓库。

| 文件 | r2 SHA256 | 实际差异 |
|---|---|---|
| session_panel/remote_probe.py | 3D5C5E58960B270B16AEC5A0F6A8408ADB9C7B4004D6DA9C147FFDA9429A5B48 | 第 267–268 行，取得当前 before 后、reader 前增加显式锚点比较 |
| tests/test_messages.py | 65DC4575972868369D0E7EF559CB6FEFBCB0B20F24A0C9C0548896CB8ECF953F | 第 156 行的新真实临时文件竞态测试；初始不匹配测试补 reader 未调用断言 |

## Review(Impl) 必填判据

| 字段 | 结论 | 依据与限制 |
|---|---|---|
| goal_lock_alignment | aligned | G1 UUID/同 cwd 分离、G3 既有终端保持；G2 修复已定义分页一致性，客户端验收仍待补齐，无目标形态漂移 |
| anti_goals_touched | none | 实际 21 文件与精确 diff 的禁止项复核见下表 |
| authoring_ergonomics_check | pass | 直接在既有两次尝试循环比较，没有新抽象、主机配置或第二消息链 |
| declaration_readability_check | pass | requirements、项目 MCP 表、页面与根 README 未变且已全文读取；单 source/Service 和两种 runtime 顺读仍直接 |
| plan_defect_checkpoint_recommended | no | 当前 S2 明确要求版本不一致拒绝，无需问题重述或计划修订 |
| plan_defect_checkpoint_reason | 原局部实现偏差已按计划收敛 | 没有连续 PLAN_DEFECT、目标漂移或作者体验回退 |
| plan_defect_trigger_reason | N/A | 未命中 PLAN_DEFECT；业务结论暂留空 |
| impl_safe_validation_check | pass | 作者/root 本地完整输出已读；reviewer fresh48/compile/独立第三 stat 绿及旧版内存红控见附录 |
| coordinator_handoff_check | pass | r2 SDK/真实 stdio 由 root 承接；r1 外部时点与当前客户端缺口明确分开，有 owner/证据/缺证据约束；不表示客户端已验收 |
| 基线与澄清一致性复核结果 | PASS | 首批未回答列表为空；Q5 原话 a 有效授权既定范围；补修没有违反 Q1–Q5 或完整基线 |

## R1 修补复核与目标、反目标

[remote_probe.py:267](E:/project-funny/mianban-develop/session_panel/remote_probe.py:267) 的比较在每次 reader 尝试取得 before 后执行。显式 revision 不匹配就抛 ProbeError，统一为 available=false/reason=revision_mismatch；第 272 行 reader 不会进入。HTTP 的既有 result_status 映射仍为 409。初次 metadata 检查后变化、before 后读取期间变化都有拒绝路径，不会把新 before 作为旧请求锚点的成功页。

revision=None 不进入新比较；原循环仍最多两次读取，一次变化重试，重复变化 messages_changed。[test_messages.py:134](E:/project-funny/mianban-develop/tests/test_messages.py:134) 的既有真实临时文件测试断言两次 reader 调用，两种结果均在 reviewer fresh48 中通过。16MiB 文件、20 秒 SSH、512KiB 响应、每页 1–50、串行读取、范围前后唯一性、SDK [] 保守 unavailable 和严格六字段均保持；预算、scope、空结果、字段/分页测试通过。六字段 mock 不证明真实 SDK，外部 SDK 对照另列。

| 目标锁 | 实际源码 / 已读证据 | 判断 |
|---|---|---|
| G1：真实 UUID，同 cwd 分开，三类证据独立 | service.merge_observation 按 UUID；source+boot/PID/startticks；r1 observation 同 cwd Main/Files 分开；r2 stdio 两个明确 UUID | aligned，固定来源覆盖限制仍在；不扩大为全机器完整索引 |
| G2：页面与 Codex 同一索引，按 ID 消息与 unknown | 一个 SessionService；HTTP/stdio 薄转发；新锚点 guard；r2 SDK15/stdio 同 HTTP；当前工具=[] | 源码和已测路径 aligned；当前客户端未验收，整体未满足 |
| G3：保留既有终端，fresh 唯一定位 | terminal 完整命令匹配、实例/age/提交前/事后复核；r1 focus 原时点证据 | aligned，r2 未重测真实 focus，不称本轮新定位成功 |

| 禁止内容 | 可核查证据 | 结论（本轮 impl 未踩中） |
|---|---|---|
| 3D/Jev/C4D/资源总监控/多 Agent/新增主机系统 | 21 产品文件全文、固定 source.py、精确两文件 diff；产品入口只有观察/消息/已有 focus | 确认未引入；README 中相关词为范围禁止说明 |
| 发送消息、输入注入、代审批、resume/重启/终止 Claude | remote_probe 仅版本与公开 reader；terminal 仅清单/focus；MCP 恰三查询；r2 不改这些入口 | 确认未引入；stdio 正文读取保持按已选 UUID |
| cwd/title/mtime/旧布局或演示冒充 UUID/完成 | Service UUID 与实例分开；activity/task_completion=unknown；mtime 只用于消息 revision | 确认未引入；本修补没有身份捷径 |
| 默认采集全部私人正文、外发模型或第二消息链 parser | 列表只元数据；明确 UUID 才进公开 get_session_messages；无模型出站；范围 guard 只元数据 | 确认未引入 |
| 正文持久化、HTML/图片/附件加载 | Service 不存正文；gateway 不记请求/no-store/CSP；web.textContent、无浏览器存储；证据仅过滤字段 | 确认未引入；本地 fixture 为合成文本 |
| 改 Workbench/Nova/CLI/PATH/Claude/Hooks/global 配置或自启 | 精确 diff 与 21 hash 仅两文件；r2 承接报告没有此类动作，reviewer 没有外部操作 | 本批未引入；不宣称审计了整台机器 |
| 配置/独立 stdio 成功冒称当前 Codex 已接入 | 根 README 加载限制；r2 总账、当前实际 exact-name 工具扫描=[]、client_loaded=false | 确认没有冒称；当前未验收 |

**基线与澄清一致性复核结果：PASS。** 首批未回答列表为空；Q2 开发效率、Q3 会话关联、Q5 既有授权均保持，后续大面板内容未扩入。r1 缺陷没有要求改变验收或回滚。信任或权限新决定不能从 Q5 或本次观察请求推导。

**设计味道扫描结果：PASS。** r1 检查与使用分离的遗漏已在实际 reader 前补齐；没有为两行 guard 增加抽象、配置、重试框架、双索引或自制 SDK 消息链。作者体验和声明可读性没有显著回退。当前客户端证据缺口单独处理，不用它虚构产品设计失败或整体通过。

## 证据责任与边界

| 验证 | reviewer 实际读/执行结果 | owner / 证据 | 缺证据时约束 |
|---|---|---|---|
| 本地全量、编译、第三 stat race、红控、hash/diff | 本轮 fresh48/0skip/0failures exit0；compile0；race reader0/0failures；旧版内存红控1failure | reviewer；完整输出附录；root 输出另在 impl-safe-r2-root.json/.txt | 不能宣称本轮代码自证或回归有效 |
| 作者红→绿 | 旧版1test/1failure exit1；新版定向0、full48/compile0 | impl；impl-core-remediation-r2.txt 已全文读取 | 作者摘要不能证明回归有效或最终 hash |
| 实际 Linux 公开 SDK | 新版临时合成文件15checks/0failures、SSHexit0，stderr空；前13项语义和新增读前竞态/实际 reader0 | coordinator；session-sdk-synthetic-r2.json 完整 stdout 已读 | 本地六字段 mock 不能证明 SDK 兼容；合成 Linux 也不是真实历史 |
| 真实 stdio 到当前网关 | 10:49:15UTC，恰3readonly；Main286/Files272各尾2条，六字段/reader0.2.163/items与revision同HTTP；两个旧锚点均拒绝；root记录exit0 | coordinator；session-mcp-protocol-r2.json + 完整 stderr；root r2 总账 | 此文件过滤结果没有独立 exit 字段，exit0按 root 承接记录引用；不伪称 reviewer 复跑或当前 Codex 已调用 |
| frozen r2 与 health | 11:00:47UTC root hash均匹配、local/SDK/stdio证据一致、health200；当前 tools=[] | coordinator；session-impl-r2-ready-verification.json | health只证明本地网关，不能证明客户端接入 |
| r1 外部继承 | observation、recovery/stale、真实 UI、浏览器合成分页、focus、port 的过滤原文件均已完整读取；相应产品代码 r2 未变 | coordinator；session-panel-external-r1.json 与其原产物，完整 r1 报告/审查 | 仅覆盖原时点；r2 没有重新执行。recovery的255仅预期注入值，UI合成route不是真实历史，focus非原子 |
| 当前客户端加载 | 当前 reviewer 实际工具 exact-name 扫描=[]；root现时扫描亦[]；r1 client记录chat_loaded=false/trust未核 | coordinator / 用户正常客户端观察；session-panel-codex-r1.json 与 r2 ready/trust观察 | 依然未验收；项目表、TOML、旧CLI或独立stdio均不能补齐 |

r2 trust 观察仅返回精确项目 matching_entries=[]、explicit_trusted_entry_observed=false、file_changed=false；未观察到精确 trusted 项不等于项目被判 untrusted，也不能推断父项或 app 其它信任来源。reviewer 只读该过滤证据，没有读取或改写 global config。

## confirmation_items 与恢复规则

协议选择 USER_CONFIRMATION_NEEDED：当前没有已确认的代码必修项；可以先通过现有客户端的纯观察，确认正常重载/重开项目后是否显示三工具或出现现成提示。该观察不要求专业验收，不修改数据/信任/权限，不要求用户判代码正确性或消息内容是否安全。若观察揭示仍需新权限/信任决定，则不能继续使用低风险确认替代授权。

- confirmation_items：由用户控制客户端正常重载或重开 E:/project-funny/mianban-develop 后，观察 list_sessions、get_session_status、get_session_messages 是否可见；若不可见，报告现有报错、信任或权限提示。
- allowed_observation_methods：查看该项目现有 MCP 连接/工具列表或当前聊天可用工具；正常重载/项目重开由用户自行控制。只报告已出现的提示文字；不点击接受新信任/权限、不修改 global/project 设置、不读取更多私人会话、不执行 focus。无需提供正文或凭据。
- expected_user_reply_format：A，已显示三工具；B，未显示（三项中缺哪些或现成报错）；C，出现信任/权限提示（仅给提示文字，未改变状态）。
- fallback_if_unconfirmed：用户无法观察、反馈不明确或仍无工具时，恢复 reviewer 判 BLOCKED 并写明缺口；若出现新信任/权限要求，由 coordinator 保持 impl_reviewing、受控澄清该新决定，未获明确授权不改变状态。实际工具调用结果异常则依据证据判 BLOCKED 或常规 REVISE，不能自动 PASS。

用户只确认工具可见性。A 回复后仍须 coordinator 在实际 Codex 客户端发现三工具并执行列表、按已选 Main b7ed3430-9064-4153-894d-d295a388a572 与 Files 6ee281b5-e4f7-43ce-b1b7-92da287e5809 的 status/messages 查询，按原预算只取必要页，与同网关 HTTP 核对 UUID/available/reason/计数/六字段/reader/revision和内存结果。取证禁止落正文；加载来源、当前工具发现及真实调用是独立证据，不能复用独立 stdio 文件。责任仍在 coordinator，不让用户代作安全或消息正确性判断。

恢复本 reviewer 的最小输入：本报告及 hash、用户原问题与原答复、有效 Q5/基线、当前客户端发现/实际调用的过滤证据、最新产品 manifest/hash；若发生代码修改，旧版本审查失效，重新验证并 fresh review。只有 reviewer 补写 user_confirmation_result 和 final_conclusion_after_confirmation 后，才允许最终双结论分流。当前没有该恢复结果。

## 所有已见失败、警告与 contract 漂移

- r1 正式审查独立 race exit1，root旧版红3failures/exit1保留；作者r2新增回归在旧实现1failure/exit1保留。本 reviewer 内存重建且 hash匹配 r1 的红控同样1failure/0errors；底层测试结果为exit1，验证红控预期的外层命令exit0，不能混成旧实现通过。
- 本轮 reviewer 新版 full48、compile、第三stat race和hash/diff检查均exit0；stdout/stderr完整保留于附录。MCP IncompleteFieldDefinitionWarning和协议处理stderr实际出现，未抑制，不承诺未来依赖兼容。
- 准备阶段批量合同读取有外层截断；lwplan/r1报告小段被工具省略；随后完整/定向补读。没有据截断推进或把未读内容当证据。
- r1 的surface fixture/TestCase.run与未隔离mock失败、UI45条重叠red、Windows重复bind/超时/编码失败、远端runtime首次420秒超时、Linux SDK首跑2个错误预期、旧CLI两次global ultra/default解析exit1、进程归属守卫时区/缺文件失败、路径/读取/输出截断失败均保留在不可变 [r1报告](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/impl_report_r1.md) 与 [r1正式审查](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/review_notes_impl_r1_1.md)。历史研究和首轮 Gate-2 FAIL 也保留；本轮绿不能覆盖这些失败或外部未知。
- 已知 shared development-workflow 的 Review(LW)里程碑索引与 coordinator STOP_BEFORE_IMPL条款冲突；r1计划/报告/审查已上报 root。实际Q5手动授权后才实施；本轮不改shared技能、不审计全部镜像。
- 计划和完整基线中的早期“尚未实施/Q4未授权/研究阶段”文字是历史状态；Q5与当前正式报告承接，不否认有效授权。r1 master原零断言/sole_remaining字段已经被r1新race更新，r2总账承接红绿；零断言不是整体可用结论。
- 当前信任来源及客户端加载保持未验证；报告中“正常重载/信任”的旧导航措辞不能授权新信任或权限决定。未发现本轮计划、来源、预算、六字段或同源协议的其它漂移；不作全局mirror一致保证。

## 本轮 reviewer 完整执行输出

以下输出从本轮实际工具结果逐字保留。所有命令在 E:/project-funny/mianban-develop，使用绝对 .venv/Scripts/python.exe；无 tail 管道。测试只合成 fixture/mock/自身临时 loopback/合成 stdio，无真实 SSH、focus 或私人正文。全量返回运行session时已续读到完成exit0，没有拿中间输出下结论。

### 全量本地测试

命令：E:/project-funny/mianban-develop/.venv/Scripts/python.exe -m unittest discover -s tests -v。stdout空；stderr如下；实际退出码0。

~~~text
test_duplicate_null_plugin_or_rebuilt_pane_never_focus (test_focus.FocusTests.test_duplicate_null_plugin_or_rebuilt_pane_never_focus) ... ok
test_focus_exit_zero_is_not_success_without_unique_client (test_focus.FocusTests.test_focus_exit_zero_is_not_success_without_unique_client) ... ok
test_inventory_budget_can_expire_before_submission (test_focus.FocusTests.test_inventory_budget_can_expire_before_submission) ... ok
test_precise_argv_and_text_clients_confirm_existing_pane (test_focus.FocusTests.test_precise_argv_and_text_clients_confirm_existing_pane) ... ok
test_rebuild_after_action_is_unverified_and_failure_exit_preserved (test_focus.FocusTests.test_rebuild_after_action_is_unverified_and_failure_exit_preserved) ... ok
test_stale_instance_pane_and_unknown_identity_never_focus (test_focus.FocusTests.test_stale_instance_pane_and_unknown_identity_never_focus) ... ok
test_empty_and_scope_failures_remain_unavailable (test_gateway.GatewayTests.test_empty_and_scope_failures_remain_unavailable) ... ok
test_exception_does_not_leak_message_or_credentials (test_gateway.GatewayTests.test_exception_does_not_leak_message_or_credentials) ... ok
test_existing_listener_refuses_second_gateway_or_reuse_socket (test_gateway.GatewayTests.test_existing_listener_refuses_second_gateway_or_reuse_socket) ... ok
test_focus_rejects_pane_input_big_or_bad_body (test_gateway.GatewayTests.test_focus_rejects_pane_input_big_or_bad_body) ... ok
test_focus_requires_exact_origin_and_per_process_csrf (test_gateway.GatewayTests.test_focus_requires_exact_origin_and_per_process_csrf) ... ok
test_health_is_only_local_gateway_and_static_paths_are_fixed (test_gateway.GatewayTests.test_health_is_only_local_gateway_and_static_paths_are_fixed) ... ok
test_invalid_uuid_query_and_encoded_path_do_not_call_reader (test_gateway.GatewayTests.test_invalid_uuid_query_and_encoded_path_do_not_call_reader) ... ok
test_list_never_reads_messages_and_keeps_same_cwd_ids (test_gateway.GatewayTests.test_list_never_reads_messages_and_keeps_same_cwd_ids) ... ok
test_not_found_and_revision_conflict_status (test_gateway.GatewayTests.test_not_found_and_revision_conflict_status) ... ok
test_rejects_cross_origin_host_missing_client_and_preflight (test_gateway.GatewayTests.test_rejects_cross_origin_host_missing_client_and_preflight) ... ok
test_source_and_six_message_fields_are_unchanged (test_gateway.GatewayTests.test_source_and_six_message_fields_are_unchanged) ... ok
test_example_config_is_stdio_three_tools_and_correct_workspace (test_mcp.MCPTests.test_example_config_is_stdio_three_tools_and_correct_workspace) ... ok
test_gateway_connection_failure_is_not_empty_success (test_mcp.MCPTests.test_gateway_connection_failure_is_not_empty_success) ... ok
test_http_results_and_unavailable_reasons_are_shared (test_mcp.MCPTests.test_http_results_and_unavailable_reasons_are_shared) ... ok
test_initialize_list_and_calls_over_stdio_protocol (test_mcp.MCPTests.test_initialize_list_and_calls_over_stdio_protocol) ... E:\project-funny\mianban-develop\.venv\Lib\site-packages\pydantic_settings\sources\utils.py:47: IncompleteFieldDefinitionWarning: Field 'lifespan' has an incomplete definition: its annotation contains an unresolved forward reference, so settings sources may fail to correctly resolve its value. Call `model_rebuild()` on the model where the field is defined, once all the referenced types are defined.
  warnings.warn(
Processing request of type ListToolsRequest
Processing request of type CallToolRequest
Processing request of type CallToolRequest
Processing request of type CallToolRequest
Processing request of type CallToolRequest
ok
test_invalid_tool_input_is_rejected_before_gateway (test_mcp.MCPTests.test_invalid_tool_input_is_rejected_before_gateway) ... E:\project-funny\mianban-develop\.venv\Lib\site-packages\pydantic_settings\sources\utils.py:47: IncompleteFieldDefinitionWarning: Field 'lifespan' has an incomplete definition: its annotation contains an unresolved forward reference, so settings sources may fail to correctly resolve its value. Call `model_rebuild()` on the model where the field is defined, once all the referenced types are defined.
  warnings.warn(
ok
test_big_file_and_response_budget_refuse_without_truncation (test_messages.MessageTests.test_big_file_and_response_budget_refuse_without_truncation) ... ok
test_change_retries_once_and_repeated_change_fails (test_messages.MessageTests.test_change_retries_once_and_repeated_change_fails) ... ok
test_duplicate_uuid_missing_id_and_metadata_conflict (test_messages.MessageTests.test_duplicate_uuid_missing_id_and_metadata_conflict) ... ok
test_explicit_pages_and_nonempty_history_empty_page (test_messages.MessageTests.test_explicit_pages_and_nonempty_history_empty_page) ... ok
test_explicit_sdk_failure_never_becomes_empty_success (test_messages.MessageTests.test_explicit_sdk_failure_never_becomes_empty_success) ... ok
test_invalid_uuid_offset_limit_do_not_enter_reader (test_messages.MessageTests.test_invalid_uuid_offset_limit_do_not_enter_reader) ... ok
test_long_and_non_ascii_scope_stops_before_sdk (test_messages.MessageTests.test_long_and_non_ascii_scope_stops_before_sdk) ... ok
test_message_ssh_timeout_and_exact_runtime_filtered (test_messages.MessageTests.test_message_ssh_timeout_and_exact_runtime_filtered) ... ok
test_missing_or_wrong_sdk_is_not_claimed_as_compatibility (test_messages.MessageTests.test_missing_or_wrong_sdk_is_not_claimed_as_compatibility) ... ok
test_parent_scope_mismatch_stops_before_sdk (test_messages.MessageTests.test_parent_scope_mismatch_stops_before_sdk) ... ok
test_revision_change_after_metadata_stops_before_reader (test_messages.MessageTests.test_revision_change_after_metadata_stops_before_reader) ... ok
test_revision_mismatch_no_reader_call (test_messages.MessageTests.test_revision_mismatch_no_reader_call) ... ok
test_sdk_empty_unverified_even_when_stat_unchanged (test_messages.MessageTests.test_sdk_empty_unverified_even_when_stat_unchanged) ... ok
test_service_serializes_reads_and_does_not_observe_or_store_body (test_messages.MessageTests.test_service_serializes_reads_and_does_not_observe_or_store_body) ... ok
test_tail_page_six_actual_fields_no_message_time (test_messages.MessageTests.test_tail_page_six_actual_fields_no_message_time) ... ok
test_bad_registry_retained_without_removing_good_id (test_observation.ObservationTests.test_bad_registry_retained_without_removing_good_id) ... ok
test_cache_earliest_clock_stale_failure_and_reconnect (test_observation.ObservationTests.test_cache_earliest_clock_stale_failure_and_reconnect) ... ok
test_collection_duration_is_not_reset_when_merge_finishes (test_observation.ObservationTests.test_collection_duration_is_not_reset_when_merge_finishes) ... ok
test_duplicate_id_and_slot_are_not_guessable (test_observation.ObservationTests.test_duplicate_id_and_slot_are_not_guessable) ... ok
test_exact_command_only_null_plugin_and_extra_arguments_rejected (test_observation.ObservationTests.test_exact_command_only_null_plugin_and_extra_arguments_rejected) ... ok
test_missing_process_argv_conflict_and_time_warning_unknown (test_observation.ObservationTests.test_missing_process_argv_conflict_and_time_warning_unknown) ... ok
test_reused_pid_clears_old_binding_and_next_observation_revalidates (test_observation.ObservationTests.test_reused_pid_clears_old_binding_and_next_observation_revalidates) ... ok
test_same_cwd_separate_real_ids_and_counts (test_observation.ObservationTests.test_same_cwd_separate_real_ids_and_counts) ... ok
test_snapshot_does_not_mutate_inputs (test_observation.ObservationTests.test_snapshot_does_not_mutate_inputs) ... ok
test_source_or_terminal_failure_revokes_current_binding (test_observation.ObservationTests.test_source_or_terminal_failure_revokes_current_binding) ... ok
test_ssh_argv_bootstrap_and_filtered_failures (test_observation.ObservationTests.test_ssh_argv_bootstrap_and_filtered_failures) ... ok

----------------------------------------------------------------------
Ran 48 tests in 8.559s

OK
~~~

### 编译

命令：E:/project-funny/mianban-develop/.venv/Scripts/python.exe -m compileall session_panel。实际退出码0；stderr空；完整stdout：

~~~text
Listing 'session_panel'...
~~~

### reviewer 独立原时点 race

通过 stdin 运行本地 Python：使用现有 MessageTests 临时fixture，先取请求 revision，再 patch revision_of；第三次调用时向真实临时文件追加四字节，随后执行原 revision_of。读取 offset=0/limit=20/显式旧revision；断言 unavailable、revision_mismatch、reader0。没有调用会覆写冻结 green JSON 的 work/verify-session-revision-race-r1.py；未生成新work文件。实际退出码0；stderr空；完整stdout：

~~~json
{
  "scope": "reviewer independent third-stat change on temporary synthetic file; no external/private content",
  "available": false,
  "reason": "revision_mismatch",
  "requested_revision": "747671447555746353:3377699722553620:89:1791025323515572500",
  "returned_revision": null,
  "reader_calls": 0,
  "revision_probes": 3,
  "failures": 0
}
~~~

### reviewer 独立内存 r1 红控

通过 stdin 运行本地 Python：从最终 remote_probe.py 去掉精确两行 guard，先断言重建 SHA256 为 r1 的 7AD5CF1F95114D5F6FDF5A1488F3733EB58C8256885C8CB6D56A932558CD0565，再仅在该子进程模块内存 exec 原文，运行新 test_revision_change_after_metadata_stops_before_reader。外层断言必须恰1test/1failure/0errors，实际外层退出码0；旧产品测试结果exit1。完整stderr/stdout：

~~~text
test_revision_change_after_metadata_stops_before_reader (tests.test_messages.MessageTests.test_revision_change_after_metadata_stops_before_reader) ... FAIL

======================================================================
FAIL: test_revision_change_after_metadata_stops_before_reader (tests.test_messages.MessageTests.test_revision_change_after_metadata_stops_before_reader)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "E:\project-funny\mianban-develop\tests\test_messages.py", line 168, in test_revision_change_after_metadata_stops_before_reader
    self.assertFalse(result["available"])
AssertionError: True is not false

----------------------------------------------------------------------
Ran 1 test in 0.014s

FAILED (failures=1)
{
  "scope": "reviewer red control, r1 hash verified in memory only; disk product and frozen evidence unchanged",
  "tests": 1,
  "failures": 1,
  "errors": 0,
  "old_product_test_exit": 1,
  "regression_detects_old_defect": true
}
~~~

## 后续动作与交付 Gate

coordinator 按本报告发起仅观察的确认，并记录原问题/答复；继续保持 impl_reviewing。客户端发现和实际两 UUID 调用取证后恢复本 reviewer 补最终双结论；遇到新信任/权限决定先停在对应边界。当前不派下一轮 Impl、不重建 LW Gate、不进入 Archive/PR。

本报告交付前须本轮 fresh 读取全文，核对 Review(Impl)最小字段、空业务结论、确认字段/回退、版本/21文件、失败与完整本地输出；实际退出码与报告 SHA交回root。该文档结构验证不替代客户端验收。本报告是本 reviewer 唯一新增正式文件，冻结产品/r1/r2报告和work证据不改。

英文提交消息建议：fix: reject changed revisions before reading anchored session pages。当前非Git，不提交或推送。

跨功能事实：无新增。
