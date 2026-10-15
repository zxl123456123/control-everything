# 会话关联局部补实施报告（r2）

- feature_name：unified-dev-control-panel；impl_round：2；date：2026-10-03；owner：session_impl_core。
- lwplan_version：SHA256 `38E3F991AA0BBF3434F2A9B7A2562EA0DBFE7520095C894003B4934018AB3074`，本轮未改。
- 输入：[r1 实施报告](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/impl_report_r1.md)（SHA `030400B5E17A44649EDEE6D9DCE6561364BDDB1FCB0CE67341E45B525366EB51`）和 [正式 Review(Impl) r1.1](E:/project-funny/mianban-develop/docs/current/unified-dev-control-panel/review_notes_impl_r1_1.md)（SHA `9584CEBD5430B06ED2A85F2BCEF88E4AA9FCE6D9C47D1C51E134057652C99FD8`）。正式双结论为 REVISE / IMPL_DEFECT；沿 Q5 既有授权补修 S2，不新增用户决策。
- **状态：FINAL_ARTIFACT_READY，可交 fresh Review(Impl)。** 两个产品文件和本报告冻结。本 owner 完整读取本轮日志、root独立复跑完整stdout/stderr、新Linux SDK/真实stdio结果与stderr、r2 manifest/diff/master。该状态只表示产物可审查，不自评 Review PASS；当前客户端仍未验收，整体首批未满足。

## 本轮差异与目标

请求携带旧 revision，文件通过初次 metadata 检查后、reader 前变化时，r1 会返回新 revision 的可用页。本轮在每次尝试取得 `before` 后再次与显式请求锚点比较，不匹配立即 `available=false/reason=revision_mismatch`，在 reader 调用前结束。既有 HTTP 409 映射无需调整。

| path | change_type | change_purpose | key_changes | related_tasks |
|---|---|---|---|---|
| session_panel/remote_probe.py | modify | 拒绝翻页锚点已变化的文件 | read_messages 循环中增加两行比较与 ProbeError；不改变 revision=None 的一次重试 | S2；Review R1 |
| tests/test_messages.py | modify | 覆盖缺失的 reader 前变化时点 | 新增一个 TemporaryDirectory 回归；真实初次 metadata/stat，返回后追加合成字节；断言 unavailable、revision_mismatch、reader 未调用 | S2；Review R1 |
| docs/current/unified-dev-control-panel/impl_report_r2.md | add | 本轮报告与外部交接 | 继承历史而不覆盖 r1，区分本地/外部/客户端 | S2；补实施合同 |
| work/impl-core-remediation-r2.txt | add | 可追溯红绿、全量、diff | 完整 stdout/stderr、每条退出码、两文件 diff 与固定输入 hash | S2；补实施合同 |

| 产品文件 | r1 SHA256 | r2 SHA256 |
|---|---|---|
| remote_probe.py | `7AD5CF1F95114D5F6FDF5A1488F3733EB58C8256885C8CB6D56A932558CD0565` | `3D5C5E58960B270B16AEC5A0F6A8408ADB9C7B4004D6DA9C147FFDA9429A5B48` |
| test_messages.py | `D9886EBF72655B3ADE5E65D54708C667AE726A32CF435910F56DC738F9DEAFBB` | `65DC4575972868369D0E7EF559CB6FEFBCB0B20F24A0C9C0548896CB8ECF953F` |

goal_lock_check：G2 消息分页一致性按现有要求修补；G1 身份与 G3 终端行为未变。anti_goal_touch_check：只改上述两个产品文件，不改 Service/gateway/web/MCP/来源/预算/runtime/设置/默认尾页重试，无真实 SSH、私有正文、focus 或新控制。authoring_ergonomics_notes：N/A（本轮不涉及声明式配置）；沿已有循环直接比较，没有新抽象或消息链解析器。

实际与不可变 r1 的 21 文件 manifest 比较，只有上述两个产品文件 hash 改变。移除本轮精确新增片段得到的两份原文 hash 均匹配 r1；完整 diff 与输入 hash 实跑记录保存在本轮日志，root另独立重建并落 [r2产品manifest](E:/project-funny/mianban-develop/work/session-product-manifest-r2.json) 和 [精确diff](E:/project-funny/mianban-develop/work/session-product-diff-r2.patch)。r1 文档、manifest/red 均未覆盖。

## impl-safe 实跑

以下使用绝对 `E:/project-funny/mianban-develop/.venv/Scripts/python.exe`，通过本地 subprocess 捕获完整 stdout/stderr 并保留实际子退出。无末尾 tail 管道。evidence 均为 [完整 r2 日志](E:/project-funny/mianban-develop/work/impl-core-remediation-r2.txt)，owner 均为 session_impl_core。

| 命令 / 步骤 | 实际退出与结果 | conclusion_if_missing |
|---|---|---|
| `-m unittest tests.test_messages.MessageTests.test_revision_change_after_metadata_stops_before_reader -v`，修改产品前 | **exit1，1 test / 1 failure**；available 仍 true，失败保留 | 无法证明新增回归能抓住旧缺陷 |
| 同一定向命令，修补后 | exit0，1 test / 0 failures / 0 skips；三个行为断言均成立 | 当前竞态未自证修复 |
| `-m unittest discover -s tests -v` | exit0，48 tests / 0 failures / 0 skips；8.775 秒 | 本地整合未自证，不能替代外部 SDK/客户端 |
| `-m compileall session_panel` | exit0，完整输出 `Listing 'session_panel'...` | Python 编译未验证 |
| 两文件 diff / 21 文件 hash / plan+r1报告+review hash 核对 | exit0 / 0 failures；仅两文件变动，恢复原文 hash 与 r1 相符 | 不能确认本轮范围与所测版本 |

新回归使用既有 TemporaryDirectory、真实文件/stat 和严格六字段 mock。外国 cwd 存在性仍由 Windows fixture shim，不能宣称真实 Linux SDK 兼容。本轮 stderr 仍出现 MCP Pydantic `IncompleteFieldDefinitionWarning`（lifespan forward reference），原样保存，未抑制第三方警告。

## coordinator_handoff_verifications

外部总索引为 [r2总账](E:/project-funny/mianban-develop/work/session-panel-external-r2.json)，10:52:47UTC；完整读取后按以下责任归属引用，不当作本 agent 执行非 impl-safe。

| 验证 / 移交原因 | 本轮实际结果与证据 | evidence_expected / 承接方式 | owner | conclusion_if_missing |
|---|---|---|---|---|
| 新 remote_probe 的真实 Linux SDK 合成竞态及兼容；本机无该 SDK | work/session-sdk-synthetic-r2.json：SSHexit0，15checks/0failures；原13项SDK/product分支/范围/空结果/六字段/分页保持，新增Linux第三stat变化拒绝与实际publicreader0；仅临时合成文件 | coordinator用现有隔离runtime，保留完整过滤输出/退出及范围，不读真实history做竞态 | coordinator | 仅本机mock，不声明新版本外部兼容 |
| 新消息路径的选中 UUID 和实际 stdio 共源；真实环境/历史 | work/session-mcp-protocol-r2.json：10:49:15UTC root实际stdio exit0/0failures，恰3readonly、same observation_revision；Main286/Files272可见条数，各尾页2条available、strict六字段、reader0.2.163、与HTTP items/revision相同；两个旧锚点均 unavailable/revision_mismatch。完整stderr另存work/session-mcp-protocol-r2.stderr.txt | 仅已选两个UUID；保存ID/版本/状态/计数/revision比较，禁止落正文，不冒称当前Codex已调用 | coordinator | r1结果只属旧版本时点，不能覆盖r2消息路径 |
| 新版本独立本地复跑及r2 manifest/master | work/impl-safe-r2-root.json/.txt：10:49:25UTC exactrace exit0、available=false/revision_mismatch/reader0，full48/0skip/0failures exit0，compile0；旧red保留。root另独立核对21文件仅两项变化并重建r1原hash，diff/manifest已读；master当前断言0 | root独立命令、完整stdout/stderr/退出、新版本hash和失败台账 | coordinator | 不以作者自报替代独立验证和新版本取证 |
| 当前Codex正常加载与按两个UUID实调；真实客户端动作 | r2总账current_codex仍false，继承work/session-panel-codex-r1.json的tools=[]与信任未核；没有新客户端发现/调用证据 | 用户控制正常重载/信任，coordinator核对实际工具发现/两个ID调用及网页结果；不静默重启/改global，禁止落正文 | coordinator / 用户正常客户端动作 | 依然未验收；配置存在、独立stdio或mock均不表示接入成功 |

现有 RemoteClient 每次SSH stdin请求重新读取本机 source.py/remote_probe.py，root已核对新请求取得本轮实现；S2变更无需重启网关，本 agent未管理真实进程。r1 的来源/观察/恢复/陈旧、UI、focus、runtime、端口、安全边界及全部失败按 r1 报告和审查继承，各证据只覆盖原对应时点；这些代码未变，本轮没有新复跑，不能宣称重新验收。r1 总账“sole_remaining_client_check/零最终断言失败”被正式 Review R1 的新事实更新，r2新总账承接红绿及新版本事实；任何零断言字段仍非整体PASS。

## 失败、漂移、风险与撤销

本轮新增回归在旧产品上的 exit1 是预期红证据，不隐藏为一次通过。首次批读外围输出及整份计划输出有截断，已逐份/分段补读全文后才实施；没有据截断结果推进。r1 与正式审查所记所有历史失败继续保留，不复制整份历史或删成全绿。当前未见本轮其它产品测试失败；警告与客户端缺证据保留。

contract_drift_reports：计划、预算、来源、reader 路线和回滚未漂移；正式 REVISE 是已定义 S2 的局部 IMPL_DEFECT。r1 历史状态、Q4旧文字及 shared workflow 停机索引差异仍按已有报告上报 root，本轮不改 skill/基线；新的竞态事实与旧 master 的时点差异由 coordinator 更新。

未完成：本报告与本轮证据可交 fresh Review(Impl)，审查结论仍待独立给出；当前 Codex 工具/信任与实际调用仍未验收，整体首批未满足。审查重点是比较确实位于每次 reader 调用前、显式锚点不被新 revision 替换，以及默认 revision=None 的重试/预算/六字段保留。SDK[]、长路径/非ASCII、内部 registry 版本、双侧 focus 非原子等原限制继承。

回滚：上述两个本地文件的本轮差异 **可直接回滚**，但会重引入 R1，不能作为成功版本。运行中网关若需切换代码，由 coordinator 核验本轮进程归属后 **需人工介入**管理；不删除 runtime/真实 transcript/其它项目，也不覆盖 r1 历史产物。本工作区非 Git，不 init/commit/push。

英文提交消息建议：`fix: reject changed revisions before reading anchored session pages`。
跨功能事实：无新增。
