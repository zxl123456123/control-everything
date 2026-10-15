# 实施后独立审查：既有命名工作台连接 r4

review_target: impl  
impl_round: existing-r4  
review_seq: 1  
review_date: 2026-10-04（Asia/Shanghai）  
reviewer: wezterm_r4_impl_review_fresh  
impl_report: [impl_existing_r4.md](impl_existing_r4.md)  
协议结论: BLOCKED  
业务结论:

本报告是新 reviewer 基于本轮 final handoff 作出的独立结论，不冒充此前 reviewer。r4 两文件实施、当前完整回归与实际离线拒绝都有证据；整批要求的运行中唯一连接、真实 UUID 定位和真实 owned 回收没有闭合，因此不能给整批 PASS。BLOCKED 的业务结论保持空白，不把环境缺证判成已经证实的产品缺陷。

## 评审字段与结论边界

| 必填字段 | 结果 | 依据 |
| --- | --- | --- |
| goal_lock_alignment | aligned | 第三组既有严格 profile 与单一已研究 Lua pin 服务 G1/G2/G3；没有替换目标或新增控制入口 |
| anti_goals_touched | none | 当前31来源只改变两个授权文件；实际离线 POST 零 launch/cleanup；禁止项逐条见下表 |
| authoring_ergonomics_check | pass | 两个固定 list、原 classifier 增量与明确三分支；没有 registry/config/parser 框架 |
| declaration_readability_check | pass | 完整 argv 明示，测试独立构造 named fixture，避免通过导入新 profile 使测试与产品同错 |
| plan_defect_checkpoint_recommended | no | 未见本增量需改写计划的产品缺陷；缺少的真实环境验证已经在 r2/r3.1/r4 明确交给 root |
| plan_defect_checkpoint_reason | 当前暂停是缺少合法存活环境与实机正例，不是用新实现目标替代原验收 |
| impl_safe_validation_check | pass | 作者红61/5→绿61/0；本 reviewer 新命令61/0；完整 bytes、exit 和保全差异已独立核验 |
| coordinator_handoff_check | missing | root 当前完整回归、API拒绝和IAB已执行，但运行中连接/UUID focus/真实GUI-client回收仍缺 |
| 基线与澄清一致性复核结果 | PASS | 以冻结 G/N 加经过本轮双 Gate 的 r4 限定例外消费；新增布局恢复问题没有被当作实施权限 |
| 设计味道扫描结果 | PASS | 产品16差异行、直接固定规则、行为测试；无过早抽象、通用控制能力或无关重构 |

BLOCKED 不要求用户替 agent 判断代码、安全性或复杂逻辑，不使用 USER_CONFIRMATION_NEEDED。当前“恢复已退出布局”的问题涉及新增操作范围，且即使获得该授权，也不能替代真实 UUID/source/owned 回收证据。保持原 N1，不默认按时间推定批准。

## 输入与实际独立阅读

本 reviewer 全文读恢复材料、r4、fresh Review(LW)、当前 feature README、clarifications、r3.1、r2，以及 plan-review 与 verification-before-completion 合同。r2 首读中段截断，随后精确补读 S2/S3；plan-review 首次聚合输出截断，随后单文件全文补读。当前 workbench/test_workbench、native_processes、terminal 主链全文已读，最终静态检查确认字节没有在阅读后变化。

全文读作者最终实施报告、完整两文件 patch、manifest/own-before 清单、author-static，以及作者 red/green 的完整解码 stdout/stderr/exit。原 bytes 的 base64 是相同内容的重复表示，独立验证解码后与全文一致，没有以截断日志代替完整测试结果。

全文读 root 本轮完整113测试 stdout/stderr/exit、scope、live、gateway-r42、UI、delivery、visual compact audit；查看当前真实截图。视觉原始报告按精确 SHA 与 root 完整 verdict audit 关联，本 reviewer 不声称重新运行浏览器 fixture 或逐字阅读全部帧轨迹。没有由 reviewer 执行实际 HTTP、GUI、SSH、attach、focus、cleanup、D: 写入、Git 或递归委派。

| 权威或final输入 | 独立核验 SHA-256 |
| --- | --- |
| clarifications.md | CBABB6F7527B7DFBBA37DEEB086841AACBDD164AE857FE5D81D1EED7535A9830 |
| lwplan.md r2 | 405FDE8E546B5D516D507802832A64D23AC8854AA5D11A2EC64EC33766E7C9E0 |
| lwplan_runtime_delta_r3.md r3.1 | AEB72C017FF60D4E370E00BA420DF250D3774A4C72E5627060A9025A8DAB8EFF |
| lwplan_runtime_delta_r4.md | A4010327E6BC25D15DADAF395FDFB3D3006D42086853E54E0CEF9445A8ECCF1E |
| review_notes_lwplan_runtime_r4.md | 2E6DE892B3DE3BFF5CCE791DB84368ADA0CD9AB19F06CB1E93376E56FDB4F71D |
| workbench.py final | 10F6445617C25432132100C6BD1F60EABE989000D55AC4BF085FB2E5621E7E89 |
| test_workbench.py final | C877DF03EA825690FE9F9C689CBA1568B963A3945A64148B4B37D74019BCBCB4 |
| existing-r4.patch | 87153D798E0E6F4CA6F9754D557DD8284402073F49B7448DAB065B109899F571 |
| existing-r4-manifest.json | 5D76E6C576A04DEC4FBFD549A82711FB6B903ED12129C5CF9DEDCE85AD65D45C |

patch/manifest 的完整路径为 `work/wezterm-session-link-` 加表中名称。before 位于 `work/wezterm-session-link-existing-r4-before/before/`；before manifest 独立完整核验为 `78EF20F48FD5A091AF57CF6BB97B97E93EFD5E2E45CACDC07B9D0D9C5A28A17D`。

## 实现、测试与禁止项核验

`OBSERVED_GUI` 与 `OBSERVED_ATTACH` 只用于严格既有分类。完整固定 EXE/config/cwd/session/每一 argv 与 Name 仍需匹配；`observe` 将三种 GUI 分别映射到对应 child，直接 ParentPID、birth、完整前后 server/GUI/attach/mux identity、唯一合法 interactive client、原 marker、预算与 latch 保持。错配、未知、变化、迟到都不获得动作资格。

已经唯一关联时，原 connect 分支返回 connected=true/launched=false/cleanup=not_needed；新增正例独立验证重复两次均零 Popen/零 cleanup，且 `_owned_gui` 原对象不变。NEW_GUI/LEGACY_GUI 原声明、全部函数集合及除 `_classify`/`observe` 外的每个函数源码片段完全不变；尤其 `_native_interpreter/_processes/_rows/integrity/_wait_connected/_terminate_client/_cleanup_owned/connect/same_association` 未被改写。第三组不能成为 NEW 启动或 owned 授权。

Lua pin 只更新到本次研究的完整8E045值。其它三个 pin 不变，真实 integrity 仍每次执行，逐个 mismatch 的行为测试拒绝；没有根据 GUI profile 跳过完整性、接纳任意 hash 或操作外部文件。

| 禁止内容 | 可核查证据 | 结论（未踩中） |
| --- | --- | --- |
| 复活EXITED、创建会话、运行旧launcher/EnsureTabs/命令或建立SSH/Claude | complete patch没有动作入口；connect源码未改、仅Popen NEW_GUI；root live实际409且前后EXITED/native[] | PASS |
| 任意named/GUI/标题或目录猜测、间接祖先配对 | constants/_classify/observe三分支；新增foreign/extra/config/cwd/session/cross-pair/directparent/birth负例 | PASS |
| 将已有named窗口追认为请求owned、为验收关闭用户窗口 | 重复connect零Popen/cleanup/owned不变；named用户pair保留与named child不得被owned回收两行为组 | PASS |
| 改预算、删双采样、重置年龄、弱化lock/latch | remaining/_rows/connect/owned函数完全相同；新增named budget/lock/latch与完整fingerprint/client ID负例 | PASS |
| 任意pin自动接受、绕过fresh integrity或更改D: | 唯一Lua字典值变化；integrity源码相同；逐项mismatch拒绝、真实四pins通过仅属root当前有限证据 | PASS |
| 清理server/SSH/mux/conhost/一般树、按未知PID终止 | owned三方法未改；新增named pair不被清理；root两次重载仅针对已证自有gateway，conhost仅观察 | PASS |
| 改reader/source/MCP/UUID/图形/CSP/HTTP安全边界 | 29其它来源完整SHA相同，包括native/terminal/gateway/reader/MCP/UI与vendor；本轮113完整回归 | PASS |
| 声称client-PID握手、完整watcher覆盖、GUI可见性或桌面激活 | public仍watcher_count=null/client_scope=interactive_only/gui_visibility=unverified；正文保留观察限制 | PASS |
| 用mock/历史PID/受控helper替代真实运行、回收或旧缺证 | 作者、root交付均明确当前EXITED和实机缺证；本报告整批BLOCKED，不关闭旧机器人或Q6 | PASS |

当前 r4 固定范围内没有未回答的目标问题，原冻结clarifications的“无用户范围问题”未被改写。root 新问的布局恢复是范围外动作，当前仍未回答。G1的当前离线状态可以验证，G2/G3正例仍待证，二者没有被混成“映射全部成功”。

## 分层证据与已核部分

| 证据 | 执行责任与实际结果 | 本 reviewer 可支持的结论 |
| --- | --- | --- |
| author-red/green/static 与 own-before/patch/manifest | 作者仅本地：61 tests/5fail/exit1→61/0/exit0，静态44项/0 | 测试能发现旧缺口，当前局部行为与允许范围一致；不是实机成功 |
| work/wezterm-session-link-review-impl-r4-static.json | 本 reviewer 本轮实际718c90：95项全部true、0失败、exit0 | 五权威hash、31当前来源、完整patch、保留函数/常量、原bytes、root证据关联和历史失败保全独立确认 |
| work/wezterm-session-link-review-impl-r4-local.json | 本 reviewer 本轮实际3a9c09：完整61 tests、0失败、exit0、0.098s | 当前本地mock/direct-handler命令独立复验；没有真实HTTP或终端动作 |
| root-tests-r4.json | root完整113 tests/0/exit0，11.724s；两条既有Pydantic warning | 当前完整Python回归含临时HTTP/stdio；不证明间歇Win10053原因已消除 |
| root-scope-r4.json | root完整检查全部true/exit0；本 reviewer又独立重算final diff与源hash | 当前产品只改变两授权文件，其余来源与未改函数保持 |
| root-live-r4.json | root实际四pins=true；默认native140/93ms均[]；全部7 sessions EXITED；正确认证POST空{}409/notrunning、zero launch/cleanup | 真实离线拒绝和当前资产字节成立；不是运行中的native双普查/GUI连接/回收验收 |
| root-gateway-live-r42.json | root只读核新launcher41828→listener40880各自固定完整image/argv/birth/directparent、独占loopback/health；exit0 | 当前root自建面板归属与加载可核；不是WezTerm进程所有权或latch恢复 |
| root-ui-r4.json与当前截图 | root实际IAB 3D canvas、pause true→play false、reset、source0、connect disabled；本 reviewer看真实截图且核SHA | 当前页面明确已退出、unknown/null和空会话；不展示历史/合成角色为当前事实 |
| robot-motion-root-audit-r4.json及exact actualreport | root本轮1256 checks/33场景/0/exit0；四syntax0、8资产hash一致、browser/fixture退出确认 | 展示与合成工作台/reader回归已独立承接；局部median6ms/p956.3ms不是全设备FPS保证 |

表中 root 证据的完整文件名前缀为 `work/wezterm-session-link-`。当前截图 `work/robot-motion-live-final-r5.png` SHA `70DD46B5C9B22CC575514C7B12F39AF0B161B1139B6DAC03B7F902EEA735A58F`；实际 visual report SHA `A6844A32A19FA8CBBFB735B8F925287B0552AC39A491D96545821422F8AB4746`。静态独立证据 SHA `62F9FFB8A1FDB66C6B3B93909B833300B7CE8875D93759D6F6D414D855F83322`，本地复验 SHA `D4BA920BAF8807E835AE228E6B26732D910D6DA725D36A6510E28BA9A116DED5`。

当前来源返回 sessions=[]、注册0/进程0/位置确认0，同时 status=unknown/reason=terminal_unavailable、last_success_at=null。这是该固定来源采样和终端清单不可用的当前事实，不是全服务器没有Claude会话、完整来源覆盖或“零=成功”。

## 缺证、解除条件与后续动作

| 阻塞项 | 必需解除证据 | 责任/边界 |
| --- | --- | --- |
| 当前没有合法存活的固定workbench与GUI/client正例 | 当次完整pins、唯一active/marker/server/GUI/directchild/mux/client双采样，重复connect两次零新进程/零cleanup/同关联 | root；不能使用旧PID，不能在当前N1下复活或杀用户窗口造状态 |
| 实际UUID消息分页与显式focus没有成功验收 | 当前真实UUID/instance/slot/pane与正文分页，显式动作前后same association、唯一client选中targetpane、原server/SSH/mux保持 | root；不存正文/CSRF，不称桌面激活或精确client-PID握手 |
| 自然disconnected启动及真实ownedGUI/client有限回收缺证 | 合法真实preflight、固定NEW_GUI/originalhandle、8s后验；受控业务观察故障后真实采集/原句柄3s退出与原server/SSH/panes保持 | root；只故障注入业务观察返回，不mock回收或扫杀server/SSH/conhost/一般树 |

先保持当前已核代码和离线面板可审查，阶段仍为 Impl/Review(Impl) blocked，不进入整批 Archive/PR。运行条件和合法范围具备后，由root重新建立当次完整身份并回传本表证据，恢复原reviewer追加新轮最终双结论。无需重复询问同一实施授权；新增恢复权限只按用户实际答复执行。布局恢复即使获准也不会自动满足另两项验收，不执行旧命令来凑证据。

## contract drift / stale / mirror mismatch

冻结CBABB决策6/§10与r2仅两profiles/旧5F903 pin仍是历史文字；r4经当次fresh双Gate成为严格第三既有只读profile和单一8E045的限定权威，原G/N、NEW与owned权限不改。原资料不被静默重写，旧历史“当前GUI18696/server5612”不能当本轮存活证据；本轮以allEXITED/native[]与fresh root live为准。

r3.1“模块无子进程代码”与Windows可创建OS conhost必须分开。历史r33只证明同base/flags受控helper的原句柄超时退出和精确OS child自动消失，不能扩成自然采集卡住/无任何子/实际GUI回收通过。root本轮重载的新base listener有自己的完整base命令行，不拿venv字符串强行套用；失败的两次身份guard记录保留，最后仅补只读身份没有再重启清latch。

文档定位问题已纠正：本 reviewer 指出 root 交付稿将N1引用为clarifications §10，N1原文实际在§2“反目标”（line36）。root独立读取确认后仅修正该引用，并在失败/边界条目保留指出和纠正；最终交付稿SHA `1BAB6C912163C68307613B4BA2BF5FE975EDE5B4423CE08C2D2DCCC7876167E3`。产品、冻结输入与作者报告未改；没有将已解决的定位问题记为待修产品缺陷，该问题不是BLOCKED原因。

## 已见失败及保全

- 作者本轮先红61/5/exit1完整保留，产品改后61/0；不得将红说成通过或覆盖原文件。
- root先前两轮104全量分别在无效CSRF与大请求拒绝413出现Win10053/exit1；当前113/0不证明其间歇原因修复，没有顺手改HTTP/削弱认证。定向单例和mock不抵消历史全量失败。
- root本轮reload-r4因UTC字符串被自动转DateTime使guard拒绝、stopped=[]/exit1；reload-r41确认原归属后停止自建listener并启动新gateway，但将venv命令套在base child的guard再次exit1。r42只读取各自正确完整身份/health，不再重启、停止conhost或用重启清latch。
- 本轮错用不存在harness的MODULE_NOT_FOUND/exit1保留；正确fixture1256/0不能删除原失败。帧轨迹提取输出截断后完整compact verdict audit补读，不把首次截断称完整验证。
- 原native r31业务unknown、Lua旧pin mismatch、r32因OS conhost使“无任何child”断言exit1与旧WQL慢/研究500ms自设阈值/venv redirector反证、UTF8 collector/stderr丢失、早期Gate/patch/读取异常由原报告和恢复材料保留；本 reviewer没有重跑所有历史实机或宣布全部修复。
- 本 reviewer首次聚合读输出截断已单文件/范围补读，没有以截断当全文。静态95与本地61本轮各exit0。root最后只读命令末尾git rev-parse报not repository/外层exit1，只说明没有Git，不误记为文档读取或113测试失败。

当前无Git repository，未init/commit/push。建议英文提交信息：`fix(workbench): recognize existing named connections without relaunching`。

无新增跨功能事实。
