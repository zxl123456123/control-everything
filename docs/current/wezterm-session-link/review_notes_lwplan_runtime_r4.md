# 方案评审记录：既有命名工作台连接只读识别 r4

**review_target**：lwplan  
**评审时间**：2026-10-04（Asia/Shanghai）  
**协议结论**：PASS  
**评审对象**：`lwplan_runtime_delta_r4.md`，SHA-256 `A4010327E6BC25D15DADAF395FDFB3D3006D42086853E54E0CEF9445A8ECCF1E`。

本报告由新建的 fresh Review(LW) 独立执行，不冒充此前 reviewer。只评第三种已有 GUI/attach 的严格只读识别、已研究 Lua 的唯一 pin，以及对应行为测试；原 r2/r3.1 的启动、归属、锁、预算、native/helper 与 owned 回收保持。未发现 PROBLEM_DEFECT，不另输出业务结论。Gate-2 的 PASS 是方案可实施性结论，不能作为连接、UUID focus、真实 owned 回收或整个项目完成的证明。

root 已回传本轮独立 Gate-1 GO。本 reviewer 只写本报告，未改产品、冻结旧文档或 D: 配置；未执行 HTTP、SSH、GUI、attach/focus、进程终止、安装、Git 或递归委派。

## 输入、实际阅读与当前运行事实

| 输入 | 本轮独立核对的 SHA-256 |
| --- | --- |
| r4 方案 | A4010327E6BC25D15DADAF395FDFB3D3006D42086853E54E0CEF9445A8ECCF1E |
| clarifications.md | CBABB6F7527B7DFBBA37DEEB086841AACBDD164AE857FE5D81D1EED7535A9830 |
| lwplan.md r2 | 405FDE8E546B5D516D507802832A64D23AC8854AA5D11A2EC64EC33766E7C9E0 |
| lwplan_runtime_delta_r3.md r3.1 | AEB72C017FF60D4E370E00BA420DF250D3774A4C72E5627060A9025A8DAB8EFF |
| review_notes_lwplan_runtime_r3.md | A8C272C89BC2478482ED52D6C7F3333CECA3EBEEFD641D98071CE8B44C4F0531 |
| research_attach.md | F4EC50D8645F75B1AFA4771C1B35047B84701DA4FDBD405683746C62D8DF501C |
| impl_native_r31.md | 3A7976D003ACC7B3A8F07A44AA7DF7D621A5ABBF2D487A8514A96B86864D9E50 |
| root-native-runtime-r31.json | 784184EABA3C866F1D10188D0219AE4DBDE0EFA5B6465FD0EA239F86DB68A171 |
| root-existing-gui-r4.json | 7FF2EEA0AFE59FB12C8A68EED5080131252827A0CE75ADABA4467667D4DF5577 |
| root-lua-current-r4.json | 158EC33D759F8FC03FF9AC3F0BE8475F2E7EBF944D46945B454E5E7D2740A732 |
| root-native-helper-r33.json | 1B395366CD417994FE994C75403272A2B65A18D348F822D4465D7F1BF8294D1E |
| root-gate1-r4.json | AA70EE390D0CDF9E78D372B1A25E1E3D2C3E3B307849A42FA0C22CF6A839C2EA |
| root-current-runtime-r4.json | F6495F4BEDC04A04356134AC6BB313A8E108251B62FE1BADC5672EEEE5E7855F |

前七项文档位于本 feature 目录；后六项工作证据全名均为 `work/wezterm-session-link-` 加表中名称。本轮全文读恢复上下文、r4、冻结基线、r2/r3.1、旧 r3.1 review、research_attach、当前 430 行 workbench 及完整 Workbench tests。全文读 Lua 两侧文本/metadata/diff JSON、r33、本轮 root Gate-1 和 current-runtime JSON。r2 首次输出中段截断，随后按实际行范围补读 S1/S2/S3/S4 缺段；不把首次截断当全文成功。完整读 plan-review、development-workflow、verification-before-completion；定界读 implementation-planning 的 Required Set/片段/双 Gate canonical 规则，不冒充该 skill 全文重读。历史证据 r31/existing 核精确 SHA 并以 r4 及恢复原文解释，不声称本 reviewer 重新执行了这些实机命令或全文检查全部历史测试日志。

root 最新只读运行证据记录于 `root-current-runtime-r4.json`：固定 Zellij version 为 0.45.1，list-sessions exit0 且所有会话 EXITED，完整 native related rows 为 `[]`；workbench-v4 的 `server_state=exited`、`reason=workbench_not_running`，can_connect/can_focus 都 false。旧 8766 listener 与旧 root 网关 PID 已不存在。它是当前运行条件，与历史 GUI18696/attach260364 及 server5612 的正例不同，不能拿旧身份当当前存活证据。

该变化不否定历史严格 profile 来源或本次局部可实施性，但实际已连零新建、UUID focus、新自然 disconnected launch 和真实 owned 回收目前均待存活环境。旧 PID 不是配置；不得复活 EXITED、重新运行 launcher、创建会话、伪造 disconnected 或绕过前检来补齐验收。端口重新启动和真实操作仍由 root 按当次完整归属/状态核验，不能执行旧 PID 停止脚本或把重载当清除 latch 的办法。

## 可行性与关键边界

当前实际源码 `_classify` 仅接受 NEW_GUI/LEGACY_GUI 及对应 attach；`observe` 只按这两组选择 expected child。历史 named-only GUI 与直接 named-only attach 都是完整固定 EXE/config/cwd/session/argv，因此新增第三组精确只读规则能解决这一识别缺口。r4 给出两条完整常量及三分支 expected，首落点明确；不仅允许各自 argv，还要求 GUI/child 精确配对、直接 ParentPID、出生顺序、完整双采样 identity、原 server/marker/mux/client、最早年龄与 latch/锁共同成立。

现有 `_wait_connected`、connect 新启动后验和 `_cleanup_owned` 都明确要求 NEW_GUI 与无名 attach。r4 保持这些函数原字节，第三组只读事实不会成为新启动 argv、owned 标志或终止目标。已关联 connect 沿现有 can_focus 分支返回 connected=true/launched=false/cleanup=not_needed，零 Popen、零清理；对应 mock 会证明 `_owned_gui` 未变及重复调用无新增。未知 argv/字段、错配、间接 parent、早出生、多客户端、身份变化、迟到仍拒绝，不引进标题或一般祖先猜测。

Lua 旧备份精确匹配 5F903 pin，新文件精确匹配 8E045 pin。本 reviewer 全文读两侧 JSON 并独立比对实际旧备份/当前 D: 文件与嵌入文本，核其完整 SHA。diff 只涉及 line_height、字号调整时窗口尺寸、背景 opacity、padding、selection/tab colors；window_close_confirmation 起的操作性尾部完全相同，default_cwd/prog、Yazi key 和 title handler 均保留。允许把现有字典条目更新为这一个已研究完整 8E045 值；不接受任意新 hash，不豁免 fresh integrity，不改或恢复他人 D: 文件。实际动作前仍须核所有完整 EXE/KDL/Lua pin。

采用已有固定版本 Zellij/WezTerm 的完整 argv 做法。research_attach 的固定源码说明 named attach 可能复活，因而本次只读取已存在的 named-only 进程，不把它变成执行入口；NEW_GUI 仍无名。已有工具不提供原子 expected-instance/client-PID 握手，full identity/前后验只是保守关联观察。watcher_count=null、client_scope=interactive_only、gui_visibility=unverified 与未解决竞态继续诚实保留。

## Gate-2 十项复核

| 必填字段 | 结果 | 独立依据 |
| --- | --- | --- |
| Required Set 复核结果 | PASS | r4 §5 T1.1–T1.13 全部齐备，T2 输入输出/边界/分层测试及 T3 私有矩阵、状态不变、依赖/兼容/停机和重载风险明确；S1Δ/S4Δ 有步骤、验收、回滚、依赖、目标形态与责任三元组 |
| 目标锁 / 反目标复核结果 | PASS | 两包消费 G1/G2/G3 与 N1/N2/N3；只收口已有 profile 和已研究完整 pin，原动作/所有权/新启动权限不变；禁止项逐条见下表 |
| 关键实现锚点复核结果 | PASS | workbench.py constants/PINS/_classify/observe::expected；test_workbench.py 的原 process()/attach fixture 旁独立 named fixture/行为组；首次 review 落点为三组精确配对与唯一 pin |
| 代码片段充分性复核结果 | PASS | 完整第三 GUI/attach list、三分支 expected 与原 unique/fresh/connect 零动作正文闭环；首个改动点、保留 owned 层、负例/实机分层齐备，不需要另作权限或架构选择 |
| 作者体验门复核结果 | PASS | 单一 pin、两个固定 list、三分支和原注入 fixture；无 registry、通用 parser/config 框架、跨模块重构或新依赖，≤100 产品行的范围约束用于可审查体量而非质量计数门槛 |
| 人工 review 对齐复核结果 | PASS | 核心链路顺读、research 事实映射、跨包脑补需求三项独立结果均 PASS，详见下段 |
| P1-P9 协议合规核验表 | PASS | 九项存在性逐条判断见下表，作者 121 项与 reviewer 118 项不替代语义复核 |
| 基线与澄清一致性复核结果 | PASS | G/N 与持续授权不变；冻结两-profile/旧 pin 文字按 r4 已研究、root 裁定的限定例外消费，不宣称旧文件本就支持第三组；当前 EXITED 是运行验收条件，不增加复活权限 |
| 设计味道扫描结果 | PASS | 小范围直线声明和既有分支增量，测试按关联/权限行为组织；未发现过早抽象或依赖复用重构。原 native ABI 风险由冻结 r3.1 承载，本轮不改其产品 |
| Gate-2 | PASS | 当前 r4 方案可交 root 独立复核后实施；当前实机成功/回收验收、完整 Python 回归和 fresh Review(Impl) 仍待证 |

**核心链路顺读复核**：PASS。r4 §2 先给 native 六字段→规范化→classifier/expected→原资格→connect 零新建/focus 的主链，再给 S1/S4；不改层和原因明确，不需要跨包重建所有权或接口关系。

**research 事实映射复核**：PASS。完整 named-only 事实、filtered census 不证明 GUI launcher 状态、named resurrection、list-clients 观察覆盖、109–125ms 不等于业务 actionable、Lua 外观差异分别映射到 S1 精确声明/配对/pin、S4 正负例及 root 当前实机边界；r32 conhost 反例和 r33 有限佐证不替代 GUI cleanup。

**跨包脑补需求复核**：PASS。两产品文件、expected 分支、完整 identity/fresh/锁/pin、零动作已连分支、NEW/owned 不改、mock 与 root 的动作分层均明示。实现者不必自行选择 named 启动、关闭既有窗口、信任任意 hash 或重开预算。

| 禁止内容 | 可核查 r4 锚点 / 当前源码 | 结论（方案未踩中） |
| --- | --- | --- |
| 复活 EXITED、创建 session、运行旧 launcher/命令/补 tabs/SSH/Claude | §1–3 OBSERVED_GUI 永不 Popen，NEW_GUI unnamed；原 connect 408 行仅 Popen NEW_GUI | PASS |
| 任意 GUI/named profile、substring/title/cwd 单字段、一般祖先配对 | §3 完整固定 argv + direct parent/birth；§4 错路径/flags/name/pair/parent 的负例 | PASS |
| 第三已有 GUI/child 被追认为本请求 owned 或关闭它凑 disconnected | §3 owned 三方法完全不改，零清理已连分支；§4 缺证限制 | PASS |
| client ID 当 PID、宣称握手、所有 watcher/web 已排除或桌面激活 | §2 观察口径及 §4 GUI visibility 未核验；watcher_count=null 保留 | PASS |
| 任意配置 hash 自动信任、跳过 integrity、改/restore D: 配置 | §1 完整两侧证据，§3 唯一 PINS 值/mismatch 拒绝；仅更新 Python 字典条目 | PASS |
| 延长 5/8/3、删双采样/字段、重置证据年龄、弱化锁/latch | §3 full fingerprints、最早 age、预算及 action_lock 保留；§4 迟到/lock/latch 负例 | PASS |
| 清理 server/SSH/mux/conhost/一般树或未知 PID | §3 original handle + exact NEW/unnamed owned 保留；§5 conhost 仅 root 只读并自动消失 | PASS |
| 放宽 Host/Origin/CSRF/browser 输入、改 UUID/reader/source/MCP/UI/3D/CSP | §2 不改层，§3 原 public/state/API；S1/S4 独占两个产品文件 | PASS |
| 自制 IPC、常驻监管、通用配置/插件、native 重构或新依赖 | §2/§3/§5 范围及作者体验；native/helper 当前 SHA 保持 | PASS |
| mock/旧身份/r33 冒充当前真实连接/focus/回收，全 suite 失败遗漏，关闭旧 feature/Q6 | §4 conclusion_if_missing 与 §6；本轮 current-runtime EXITED 单列 | PASS |

| 协议 | 结果 | 独立核验 |
| --- | --- | --- |
| P1 | PASS | §5 不以任务/检查数量设质量门槛，产品行数仅范围纪律 |
| P2 | PASS | Required 内容缺任一即失败，不能拿测试计数代替 |
| P3 | PASS | 当前双 Gate 硬门、失败回作者，只修本增量，不消费旧 PASS |
| P4 | PASS | T3 消费 T1 十三项和 T2/T3 边界/状态/兼容/停机追加 |
| P5 | PASS | 新目标/权限/验收不唯一触发 DELEGATE_QUESTION；技术事实交 DELEGATE_ACTION，不默认扩权 |
| P6 | PASS | 新 profile、Lua mismatch、r32 conhost 反例和阶段变化留本文/报告/README/root evidence；无固定对齐次数 |
| P7 | PASS | 问题数不设上下限，当前无新增用户目标/权限问题理由明确 |
| P8 | PASS | P0 权限/回收、P1 关联/预算、P2 展示，批量模板含已取事实、推荐选项、代价和影响阶段 |
| P9 | PASS | 作者本版 Gate1→root 本轮核验→fresh Gate2→root 放行，作者不能自放行，也不能消费 r3.1 旧 Gate2 |

## 基线、漂移与运行验收交接

澄清未回答列表没有用户范围问题。G1 独立状态/年龄、G2 唯一当前实例连接及已连零新增、G3 UUID 动作前后资格均由这次两个工作包消费，N1/N2/N3 的操作边界保持。原计划和报告支持文本完整保留，r4 只覆盖已取证缺口，撤该增量时保留 native/其它产品；回滚旧 pin 会对当前 Lua 拒绝动作，是明确降级，不恢复 D: 文件或关闭已有用户进程。

| contract drift / stale / mirror mismatch | 影响与本次收口 |
| --- | --- |
| CBABB 决策6/§10、r2 只有两 GUI profiles | r4 经当前双 Gate 成为限定第三只读 profile 权威；原字节保留，不宣称旧合同已有第三组，也不新增执行权限 |
| r2 完整 Lua pin 仍为 5F903 | root 两侧全文/hash 已取证，r4 明定单一 8E045；实际 fresh hash 不等仍拒绝，不兼容任意 hash |
| r3.1 “helper 无子”与 r32 OS conhost 实测 | 模块无子进程代码和 OS Console Host 分开；r33 只佐证同 base/flags 的受控原句柄退出及精确 OS child 自动消失。不得据此改采集器、预算或 conhost 终止权限 |
| r4 历史“当前已有 GUI”与本轮 all EXITED/native [] | 历史用于 profile 来源；当前运行事实以 root-current-runtime-r4.json 为准，实机正例与回收都待存活环境，不能复活或伪造前检 |
| 默认技能 STOP_BEFORE_IMPL 与既有自动实施授权 | 继续已明确固定 scope，保留技术 Gate/独立 Review(Impl)，不重复询问同一阶段许可，不改 skills |

实施作者只改 workbench.py 和 test_workbench.py，运行计划列出的纯 mock/AST/差异与 manifest，完整读 stdout/stderr/exit；不得自行执行真实目标操作。root 承接新字节的完整 Python/临时 HTTP 回归、实际页面/UI、当前源/pin/运行状态；当前不能实测的连接/focus/回收需明确保留未验证。未来运行条件成立时，按当次完整 EXE/argv/PID/ctime/server/mux/client/pane 重新建立身份，不能拿旧表中 PID 永久信任。

已有连接的实机验收必须重复 connect 两次零新 GUI/零清理/同关联；自然新启动必须真实 current-running、0 GUI/attach、合法 0 interactive，不能关闭用户窗口或过滤它。受控 post-launch unknown 只允许在产品实际后验已见真实 owned 关联后改变业务返回，cleanup 的采集/原句柄不 mock；3 秒退出与 server/SSH/panes/mux 保持由 root 证明。当前 all EXITED 下不得执行任何 attach 来凑证据，formal Review(Impl) 可因环境缺证 BLOCKED 且业务结论留空。

## 独立验证、失败保留与后续动作

本 reviewer 已在本轮完整读 verification-before-completion。实际运行 `.venv/Scripts/python.exe -X utf8 -B -c` 的 UTF8 here-string 静态核验，PowerShell 末尾显式 `exit $LASTEXITCODE`，无管道收尾。工具 `83a189` **exit0：118 checks / 0 failures**，完整逐项输出已读：13 个当前/冻结输入、root 当前 Gate-1 的 exact authority/exit0/空 failures、31 当前源码完整 SHA、27 原 before 快照、Required Set/两包/十字段/P1–P9、配对/pin/不改层与实际源码锚点、Lua 两侧实际字节、r33 的有限声明和本轮 EXITED 拒绝条件。计数是输入与存在性核验记录，Gate-2 语义结论来自上述独立顺读。

当前 workbench SHA `B37BC902F2CBF3DEC72C7BA1C60E8A52127E428C4A20409F73CB64FC85C5441D`，test_workbench SHA `AECD159EDFE743B3EFA342A737EF46950302CA55CA9B18AE7D997DA1ABE98CAA`；native SHA `115D8969B29861CC663D4C2BE5EC194C57FCA75A0360944089DDD891DC9F1BF4`，test_native SHA `FD670F7D5E557694231FD4521E6FC1E28C12D34C4F340C23ED6751791BAF2197`。r4 尚未进入产品。机器人两个文件和 fixture SHA 与 root 当前快照一致，本 reviewer 未评价或替代它们已有独立展示验收。

历史失败保留：r31 业务 unknown 的 runtime exit1；r32 因 OS conhost 使无任何 child 断言 exit1；Lua 旧 pin 拒绝 mismatch 的 d9747f exit1；全量 104 测试两轮分别有临时 HTTP 无效 CSRF/4097 字节请求的 Win10053 错误，定向 CSRF 单例成功不能抵消两次全量 exit1；WQL 5016ms、研究自设500ms失败、venv redirector 反证与旧 Gate/collector/patch/读取失败由冻结方案/报告承载。本报告未重跑这些历史实机或全量测试，不声称它们已修复。作者 d0ddad 的 literal 首检 121/1/exit1 保留，后 121/0 仅作者 Gate1。root 本轮 a80d36 health 无 listener/旧 PID 不在的 exit1 是运行环境变化，后只读 version/list-sessions exit0 证明 EXITED，不是实机正例恢复。

此 reviewer 首次并行四文件聚合读取被外层预算截断，随后逐文件完整补读；r2 中段也按实际范围补读。只读取 hash 的 PowerShell 表格将路径截成省略号，完整 hash 未截断，最终 `83a189` 以 exact 路径/完整 SHA 逐项重新核验。没有把截断内容当全文或缺失文件当成功，没有修改输入来隐藏失败。

报告落盘后须实际复核十字段、九协议、当前 plan/root Gate1/31源码与旧冻结/快照完整性，输出完整 exit/失败与最终报告 SHA，交 root 独立核验；未据此先执行产品或动作。root 复核本 Gate2 后可在持续授权内实施两文件增量，随后 fresh Review(Impl) 独立检查最终差异和实际缺证，不能用本方案 PASS 提前关闭旧机器人 BLOCKED 或父 Q6。

建议英文提交信息：`fix: recognize the existing named workbench connection without relaunching it`。

无新增跨功能事实。
