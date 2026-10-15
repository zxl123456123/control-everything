# 方案评审记录：WezTerm 会话联动 LW（第 1 轮）

**review_target**：lwplan  
**评审时间**：2026-10-04（Asia/Shanghai）  
**协议结论**：PASS  
**评审对象**：唯一 `lwplan.md` r2（固定外部 mux 窄 delta）；最终冻结 SHA-256 `405FDE8E546B5D516D507802832A64D23AC8854AA5D11A2EC64EC33766E7C9E0`。历史 r1 SHA `C1F488C0D24E552143B1D109B399749D2DDDDBB5988C00816BC75C416B5A769A` 不放行 r2。

本报告是 fresh 独立 Gate-2，经过固定外部 mux 事实 delta、readiness r3 与 r2 当前 Gate-1 重新冻结后交付。只允许 root 独立复核后在已授权范围内实施；不证明产品、真实 GUI 连接、回收或 UUID focus 已通过。旧机器人 BLOCKED 与父 Q6 各自保留。未发现 PROBLEM_DEFECT，按 Review(LW) 合同不另输出业务结论。

## 输入与实际阅读

| 输入 | 独立核对的 SHA-256 |
| --- | --- |
| clarifications.md（当前含 §11） | CBABB6F7527B7DFBBA37DEEB086841AACBDD164AE857FE5D81D1EED7535A9830 |
| research_code.md | 277CB3ABAF943323188B13F471E5DD2A2219618B76EFB5C0070F6AD2BC8BDD93 |
| research_attach.md | F4EC50D8645F75B1AFA4771C1B35047B84701DA4FDBD405683746C62D8DF501C |
| review_notes_readiness_1.md | A9AD9E9FF9DDFA5063FF71F61BB971B4A33B995862BBB74D7492B85AD0425C03 |
| review_notes_readiness_2.md | 8B0BE7927DA75C3DE7A92142576F0B06E369DAA5E8FFE9E4DE670D77CC596B8A |
| review_notes_readiness_3.md | 06166F1925723827DCE29F5FB73EA30C26053EE20597A71837AC8DB730D72FFC |
| work/wezterm-session-link-baseline-r1/manifest.json | 6359AABC11C8369336B62222D92B69D859E073AC8295B71847BA4944582A8BA1 |
| work/wezterm-session-link-root-gate1.json（历史 r1） | AE3D649614CBD5F07A75629B0441771B98C6CA941F5FFEB98395BEB9E4F0559C |
| work/wezterm-session-link-root-gate1-delta.json（当前 r2） | C82029FA1B4908A3EA9D77406E2194E771D6E5C83EC24A40626BA74A391636F5 |
| work/wezterm-session-link-root-mux-delta.json | 577DE412EB40495C149DDF95868CBFA34BC5C76B95CADD8A4EF9B2905D3FE36B |

实际完整读本批 README、基线 r1/最新 §11、两份 research、readiness r2/r3、原冻结 LW 全文和 r2 各 delta，以及现有 terminal.py、gateway.py、focus tests、app.js、index.html、style.css；定向读 gateway tests 的 handler/HTTP fixture 和原浏览器 harness 的 FakeTerminal/snapshot、请求记录/选择/focus/fixture 入口。r1 readiness SHA 已核，历史内容采用 r2/r3 明确的冻结引用，不冒充重新逐行读 r1。本次不修改产品，不运行 GUI/attach/watch/focus/本机 HTTP/SSH/install/Git，不递归委派。

`terminal.py` 的实际现状确为动作后才查 clients，且 invalid 解析与有效零混同；`app.js` 当前绿点是远端来源观察。这两个事实与研究、LW 改动落点一致。独立验证当前 before 的 27 个产品文件字节未变；正式审查在 root 回传最终 SHA 之后进行，没有按 PENDING 版本放行。

## 可行性与风险

方案可在现有 Python/网页结构中实施：一个固定 Workbench 模块、原 UUID 终端/API 小增量和一个状态区，不需要新框架、IPC、依赖或远端能力。无名 attach 的初次入口避免 New/Resurrect，前后实例/关联检查与有限回收覆盖当前授权的可逆本机连接；原子实例 pin 的机制缺口没有被消除，也没有被写成保证。

主要运行风险是直接 GUI-child 关系与 5 秒观察/定位预算是否能在本机成立。LW §4 已指定实测不符则 unknown、拒绝并回方案补事实；不能在实施时悄悄改成任意祖先或延长既有年龄。GUI 进程存在、唯一交互 client 和 client-PID 握手是不同口径，公共字段 `gui_visibility=unverified`、`watcher_count=null` 保留不可观察限制。当前计数不能证明排除所有隐藏 watcher。

Owned cleanup 对权限、PID 复用和迟生客户端有实际复杂度，但清理边界来自新增 GUI 的失败回收要求。只能用本请求 Popen 原句柄及严格新 attach 直接客户端的 Windows 句柄；不能回收 server/SSH/一般树。`cleanup_unverified` 锁住两动作，无解除端点或重启绕过。root 必须执行真实 post-launch 观察故障注入，产品清理内部 CIM/handle 不可 mock；业务失败是受控合成，进程退出和原工作台保持须独立真实证明。

r2 的外部 mux 例外只接受实测固定 `D:/软件/wezterm/WezTerm/wezterm-mux-server.exe` 路径、Name、单 argv 与完整 PID/父 PID/创建时间，新增只读 `unmanaged_mux_count`，内部 full identity 集合参加所有前后比较；坏字段为 null/unknown，同计数但替换身份仍拒绝。它不参与 GUI/交互 client 计数，不被启动、采用、连接或回收，不称 root 所有。固定 Lua 无自动 mux domain，NEW_GUI 保留 always-new-process/no-auto-connect、固定 PROG 和清继承 socket；这支持观察角色的窄分类，不能证明该 mux 内部客户端为零。r2 同时明确原 list_panes 不取 action_lock，消除 focus 持锁再刷新时的重拿锁歧义。

## Gate-2

**Required Set 复核结果**：PASS。T3 明确消费 T1 十三项和 T2/T3 补充；S1—S4 均有目标、G/N、关键文件/函数、顺序、验收、回滚、依赖和作者/root 责任三元组。§2 公共字段与接口矩阵、S1 状态/锁/预算、S2 HTTP 边界、S3 legacy unknown、§5 无持久迁移及 owned 网关重载覆盖跨模块兼容与停机边界。无大规模删除工作包。

**目标锁 / 反目标复核结果**：PASS。G1 → S1/S3 独立状态；G2 → S1/S2 显式固定连接；G3 → S2/S3 保留 UUID/slot/pane 并加动作前后核查。每个主要包显式消费 N1/N2/N3，S4 验证闭环覆盖全部目标。

| 禁止内容 | 可核查 LW 锚点 | 确认 LW 未踩中 |
| --- | --- | --- |
| 命名/create/force 新连接、复活、创建远端 session、重放/补 tab/旧 launcher | §1 候选区分；S1 NEW_GUI 仅无名 attach；LEGACY_GUI 明确只读 profile | 是 |
| 以旧 profile 当运行分支、修改 D: 配置或工具 | S1 两 profile 与固定 SHA mismatch 拒绝；§1 N1 | 是 |
| 把 client ID 当 Windows PID、声称精确握手或不可见 web/watch 数为零 | §2 `interactive_only`/`watcher_count=null`/`unique_observed`；S1 清单与计数边界 | 是 |
| 先发 focus 再检客户端、取首个窗口或猜 pane | S2 before/action/post；原严格 slot 与 UUID 链保留 | 是 |
| browser 输入 argv/path/pane、放宽同源/CSRF/body | §2 接口矩阵；S2 两精确路径、原 allowed 与空 JSON | 是 |
| 改源/reader/MCP/图形/CSP/5 秒与 30 秒合同 | §2 明确不改层；S2/S3 独立年龄；S4 原图形与 reader 回归 | 是 |
| 扫杀一般后代/server/SSH/其它 GUI、PID 复用后杀新进程 | S1 exact owned handle/创建与退出区间/最终普查 | 是 |
| cleanup unknown 后自动重试/解锁/重启、常驻监管/自制 IPC/通用框架 | S1 latch；§4 风险与 §5 无新依赖/自动解除 | 是 |
| 自动轮询或角色点选隐式 connect/focus、关闭旧批缺证 | S3 explicit DOM event 与不读正文；§1/§2 旧状态保留 | 是 |
| 采用/连接/清理外部 mux、一般 mux 放行、null 当零 | S1/S3/S4 `[修订: DELTA-R2.1]` fixed profile、full fingerprint、独立计数与坏字段/extra args/PID变化负例 | 是 |

### Gate-2 关键复核

| 项目 | 结果 | 独立判断与锚点 |
| --- | --- | --- |
| 关键实现锚点复核结果 | PASS | S1 workbench observe/connect/cleanup、S2 Terminal/parser/handler、S3 render/DOM、S4 FakeTerminal/request tests 均能定位首落点和目标形态 |
| 代码片段充分性复核结果 | PASS | 修改 early-exit/状态/API/跨层字段命中必填；S1 两 GUI profile、只读 mux profile 分支与 connect 优先级、S2 pre/action/post、S3 资格与显式空 body 组成最小闭环；cleanup 的句柄/顺序由紧邻精确文字补足 |
| 作者体验门复核结果 | PASS | 固定两 profile、少量 dict 和四个外部依赖注入可直接实现，旧 render/handler 风格保留；无插件注册/通用进程图/状态框架。安全流程长但职责集中在同一模块 |
| 人工 review 对齐复核结果 | PASS | 汇总以下核心链路、事实映射、跨包脑补三项 PASS；不是以总体印象代替子项 |
| 核心链路顺读复核 | PASS | §2 先现状→改动→不改层→分层，再 S1 观察/连接、S2 focus、S3 展示、S4 验证；不需自行还原主要顺序 |
| research 事实映射复核 | PASS | §2 原事实与新增 root mux 事实明确实现/验证锚点、主体与诚实口径；含命名复活、无原子 pin、无限 retry、client 类型/PID缺口、年龄/锁/归属与旧入口 |
| 跨包脑补需求复核 | PASS | API 矩阵/公共字段在工作包前共享；锁归属及不重复取锁、原 list_panes 不取锁、freshness、owned 清理和两 action 优先级均显式，未留下新的架构选择 |

**P1-P9 协议合规核验表**：PASS。

| 协议项 | 结果 | 独立依据 |
| --- | --- | --- |
| P1 | PASS | §5 不以任务数量作门槛；S1/S4 数量只描述预计体量/行为 |
| P2 | PASS | §5 明确 Required 项缺任一不得放行，不能用测例计数替代 |
| P3 | PASS | Gate-1/Gate-2 使用存在性硬门禁，失败回 LW 修订 |
| P4 | PASS | 明确 T3，T1 十三项逐项锚点及 T2/T3 追加项齐备 |
| P5 | PASS | §4 真正范围/验收/回滚不唯一或新权限先 DELEGATE_QUESTION，技术取证 DELEGATE_ACTION；未自补授权 |
| P6 | PASS | §4 明确事件留痕位置与已触发 delta/阶段；新风险/假设/阶段即时对齐，无固定次数 |
| P7 | PASS | §4/§5 不设问题数量上下限；当前无新问题理由明确 |
| P8 | PASS | §4 有 P0/P1/P2、批量模板、选项/推荐/影响阶段和当前未触发原因 |
| P9 | PASS | 作者 Gate-1→fresh Gate-2→root 复核，缺任一禁 impl；下游 author 不递归 |

**基线与澄清一致性复核结果**：PASS。未回答列表为空；LW r2 使用最新 `CBABB…` 基线及 readiness r3，遵守 G1/G2/G3、N1/N2/N3、七项技术决策和 §11 固定只读 mux 角色。无名首次 attach 与“唯一关联观察”没有扩大为原子保证，legacy profile 与 mux 仅观察；用户三项范围和自动实施授权未改。没有违反已回答的日常开发效率/3D 回退决策；本批不改图形。此项须与最终 plan SHA 一并冻结后才可消费。

**设计味道扫描结果**：WARN: owned cleanup 有多个原生句柄与二次普查步骤，实际体量可能高于 250—330 行模块估计；root 回传后端作者预估 500—650 行模块，实际尚未测量。这是固定边界下的生命周期处理，尚未发现过早通用抽象。实施应遵守 §4 体量/常驻监管升级条件；root 可按既有 S1/S2 后端与 S3/S4 前端两个有边界增量分别保全 diff 与本地证据，再全链 root 验证/fresh Review(Impl)，不削减验收或改接口。实际若仍超出可审查体量，须回 root 同步方案，不能为“短代码”删安全出口或变成通用进程框架。该警告不阻断当前固定方案。

**Gate-2**：PASS。

## 验证责任与后续行动

作者只做明确 mock 与静态，gateway 临时 HTTP、浏览器 fixture、真实连接/focus/句柄与 owned 回收由 root 承接。观察 5 秒、launch 后验 8 秒、cleanup 3 秒均是有限共享 deadline，未知/超时丢资格，不能单个调用重启完整预算。共享非阻塞动作锁不得被 HTTP/UI 本页 disabled 替代。root 收完整 stdout/stderr/exit 与最终 manifest/diff 后交 fresh Review(Impl)，缺真实联动或 owned cleanup 证据不得 PASS。

S3/S4 已要求迟到 workbench 响应、失败/陈旧/unknown、并发与两 action disabled 的实际 DOM/API 验证；实施不能仅写 happy path。刷新或动作结果不改 selected UUID、page、epoch，不读取消息。GUI 可见性与桌面激活仍未证明，成功只写 Zellij pane 被选中。

root 独立复核此报告后可继续实施；已有用户“继续”和“自动实施代码即可现在”授权有效，无须再次请求同一入口许可。真实新权限/风险或上述 runtime 断言不成立则受控回传；不能借此 PASS 改写旧机器人/父 Q6 冻结结论。

## contract drift / stale / mirror mismatch

技能默认 STOP_BEFORE_IMPL 与当前持续授权有差异，按用户/developer 优先级处理，保留全部技术 Gate，不修改 shared skill。基线第 9 节留存 ReadinessCheck，当前 README/LW 为 LWPlan；r2 已报告该阶段文字过期，不产生第二份功能权威，root 后续维护状态即可。r1 报告、两 research 与最新 r2 均使用独立 SHA，不用旧 hash 冒充新输入。

## 本轮独立验证与异常

先实际完整读 verification-before-completion。冻结后使用 PowerShell here-string＋`.venv/Scripts/python.exe -X utf8 -B -c $lwReviewVerify`＋`exit $LASTEXITCODE`，无管道收尾。输入/manifest/27 产品、root Gate-1 全部 93 条结果、S1—S4、P1—P9、主链/观察/cleanup/预算/API/故障验证与未实施共 **55 checks**。

首检 `c250d8` **exit1、55 checks/1 failure**：检查器要求中文“显式DOM”，方案实际代码注释是 `explicit DOM event`，正文已有显式操作要求。该字面断言错误不构成方案缺陷；修检查器，不改冻结方案。复检 `eef2a3` **exit0、55 checks/0 failures**；全部逐项 true，完整输出与退出码已读。root Gate-1 JSON `f66ff1` 完整读，有 93 checks/0 failure、stderr 空、exit0 与同一计划 SHA；这只证明输入/存在性，不替代本报告的独立语义判断。

初稿写后 root 回传全量普查的新外部 mux 事实，立即把草稿标 PENDING、不可实施，未交付或自证为正式结论；随后仅补当前报告，不改上游/产品。完整读 r3 `bb3f2f`、r2 正文/所有 delta/尾证据 `b71a4f/765df6/b1c28a/216aec` 与 root mux JSON `5c210b`。root 最终回传同一 r2 SHA 后完整读当前 Gate-1 delta JSON `a2335f`，实际 103 checks/0 failure、exit0、stderr空；作者 109 项记录仅作作者证据，不混成 root 数量。

本 agent 对当前 r2 重新独立执行 `$lwReviewFinalVerify`（同一 UTF8 Python -B/显式 exit wrapper），`4a8bcb` **61 checks/0 failures/exit0**：七当前/冻结输入、27 before 产品、manifest、当前 root Gate-1 全部 103 条及最终 plan SHA、原主链/预算/责任，加 fixed mux profile/null/full identity/非动作权限/不重拿锁和 mux artifact SHA；完整逐项 true 输出已读。新 delta 的 pre-read rg 超预算，之后以四段实际文件读取补齐，未拿截断部分作完整阅读。

首次组合技能读取、后一次组合读取超过输出预算；plan-review 缺段与 implementation-planning 全文已定向补读。harness rg 宽结果亦截断，只将后续实际精确读取的 FakeTerminal/snapshot 和可见匹配作为锚点，不声称全文穷尽。本批既有作者 Gate-1 93 项初验 2 fail→修验收标签后 green、基线 collector UnicodeDecodeError/child exit1/stderr 丢失、root 额外字面标题断言失败等仍在 LW/README 中，未以本报告 PASS 抹去。

报告最终落盘后再运行必需字段、10 Gate-2 字段、9 协议行、冻结输入与产品 unchanged 的全量只读自证，最终结果/SHA 以尾后工具为准。没有产品测试或真实外部动作结果，不把文档检查称业务验收。

无新增跨功能事实。
