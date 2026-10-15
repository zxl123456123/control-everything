# 方案评审记录：WezTerm 原生采集窄修订 r3.1

**review_target**：lwplan  
**评审时间**：2026-10-04（Asia/Shanghai）  
**协议结论**：PASS  
**评审对象**：`lwplan_runtime_delta_r3.md` r3.1，最终冻结 SHA-256 `AEB72C017FF60D4E370E00BA420DF250D3774A4C72E5627060A9025A8DAB8EFF`。

这是 fresh 独立 Review(LW) Gate-2，只放行 S1 私有采集器及 S4 对应验证的窄修订。root 已回传新版最终冻结与独立 Gate-1；旧 r2 PASS 和旧 A24 r3 自证不放行本修订。未发现 PROBLEM_DEFECT，不另输出业务结论。本报告不证明产品性能、helper 实际超时退出、GUI/UUID focus 或 owned cleanup 已验收，也不关闭旧机器人 BLOCKED 或父 Q6。

## 输入、实际阅读与当前状态

| 输入 | 独立核对的 SHA-256 |
| --- | --- |
| 本修订 r3.1 | AEB72C017FF60D4E370E00BA420DF250D3774A4C72E5627060A9025A8DAB8EFF |
| clarifications.md 含 §11 | CBABB6F7527B7DFBBA37DEEB086841AACBDD164AE857FE5D81D1EED7535A9830 |
| lwplan.md r2 | 405FDE8E546B5D516D507802832A64D23AC8854AA5D11A2EC64EC33766E7C9E0 |
| review_notes_lwplan_1.md（旧 r2） | C4B14141B3C4836FED73DB5ED2CF76094D4AC8B9447D0EED673A8DEDA27A9749 |
| lwplan_runtime_delta_r3_history_a24a4a6b.md | A24A4A6B23EB66993716B2C91DBCD69D6E80A2EA1E0CB31841BE33002D144F67 |
| process-census-native-research-r1.md | 8EE96DEABC337ED4CEE0626CA45F8BE89FA8B1D954B76B0957A81915B6498E8C |
| process-census-native-prototype.py | 300050D56B16F6166BB7175E91CAE3A8C8FF47EDCA7F5F15E8CADAB707330AE2 |
| root-interpreter-identity-r1.json | 4926097D7EBD8022C0C04767B9C4063B500383918EFA97CF3122FD9DBECFD775 |
| core-manifest-r1.json | 0D21973DAAC036519F2F782E851DE44C85A3574CCC64CBD44FE81DF3C741146A |
| root-gate1-native-r31.json | A053E35371B984B6ACB78299A436439F0408A577406E84A97EF34C7855D295AA |

上述 work 名称均在 `work/wezterm-session-link-` 下，process-census 三项在 `work/process-census-` 下；文档均在本 feature 目录。实际完整读当前 delta、旧 r2/review、native research/prototype/equivalence 脚本及其完整 rows、当前 420 行 workbench、terminal、gateway、Workbench/focus tests、impl_report/core manifest。定界读 gateway direct-handler 测试，以及 `__init__ → service → source` 的导入链；其初始化仅 stdlib 导入和定义，无第三方包或启动动作。完整读 root 的 WQL、pwsh、WMI、COM r1–r5、Get/按 PID 基准、native probe、解释器 identity 和当前 Gate-1 JSON；旧两 research/readiness 采用已完整审查的 r2 冻结引用，不冒充本轮再次逐字读全部历史。

当前源文件不是原 before：独立核对 root 的当前 29 文件快照、core 6 文件及原 before27 快照完整性。当前 robot3d 为已授权独立视觉增量的精确 `DF4EC428FF0898B770E8A73711B92E37C567A1864EA2764D0BC19DCCF44BBD33`；不将其归给本作者，不恢复他人文件。本修订 native 模块和新测试尚不存在。此 reviewer 只写本报告，没有产品修改、真实 helper/HTTP/SSH/GUI/focus/终止操作、安装、Git 或递归委派。

## 独立可行性判断

WQL 六字段本身正确但每次约 2.2 秒，两次普查已导致 public_status 5016ms/age5015ms、unknown/workbench_timeout；这是实际预算失败。窄替换默认 provider 保留 `_rows`/分类/关联/权限与两次采样，比延长预算或减少字段更贴合原目标。Toolhelp 全枚举后查询四个相关 Name，读取完整六字段；一行失败拒绝整次，合法空数组才表示没有相关进程。外部路径仍先进入完整 rows，再由既有分类拒绝，不能靠允许路径过滤隐去冲突。

r3.1 已修正一个真实 PLAN_DEFECT：venv sys.executable redirector 会另生 base Python，旧 r3 的父 timeout 不能据 launcher 退出推断采集退出。新版 `_native_interpreter` 每次取得 GetModuleFileNameW(NULL) 的真实 ownimage，核绝对、完整长度及 normalized(base)==normalized(image)，仅直接启动相同 base；缺字段、相对路径、API 失败/截断/不匹配均拒绝且零 runner，无 venv/PATH fallback。现有 package 导入链可在 base 中成立。实际单进程/超时退出及无残留仍交 root 证明，identity JSON 只直接证明三条解释器路径，不能单独充当生命周期证据。

原生查询的复杂度有必要的边界：same handle 前后零等待、PID/parent 与快照一致、路径 basename、创建时间和 snapshot birth guard；Nt class60 只一次有界 sizing 和一次 query，结构长度、MaximumLength、指针/有效返回边界、严格 UTF16/NUL 判据在解引用前成立。全部 handle finally 关闭，失败保留主错误并记录 close_failed，不输出部分 rows。无 PEB/VM_READ/增权/自动重试或其它采集 fallback。class0/60 为内部 ABI，当前 Win11 AMD64 实测及现代 System Informer 路线支持可行性，不构成跨版本稳定保证。

父固定 argv/cwd/shell=False/CREATE_NO_WINDOW、严格 UTF8/JSON 与 remaining(deadline) 保留可审查闭环；helper 内部 5 秒不能刷新父预算，晚返回继续由原 `_rows`/age 拒绝。OS 创建/终止等待无普遍毫秒保证，不能把 subprocess timeout 宣称为所有环境严格墙钟上界。5/8/3 是否在本机可用必须测默认产品路径，原型 31ms 不包含此路径的启动开销。

## Gate-2 十项复核

| 必填字段 | 结果 | 独立依据 |
| --- | --- | --- |
| Required Set 复核结果 | PASS | §5 T1 十三项及 T2/T3 追加齐备；S1Δ/S4Δ 均有目标、G/N、文件/首函数、输入输出、顺序、验收、回滚、依赖、作者体验和责任三元组；私有矩阵、状态不改、兼容和重载风险明确 |
| 目标锁 / 反目标复核结果 | PASS | 两包显式消费 G1/G2/G3 与 N1/N2/N3；只解决默认采样延迟，原连接/focus 权限与公开语义不变；禁止项逐条核如下 |
| 关键实现锚点复核结果 | PASS | `_native_interpreter/_processes`、已有 kernel32 的一条 API 声明、新 `census/query_row/main` 和单独测试文件可直接定位；当前 `_rows` 规范化与 owned 函数作为保留锚点 |
| 代码片段充分性复核结果 | PASS | ownimage → fixed runner → full native rows/有限失败 → 原 `_rows/observe` 闭环明确；ABI/顺序/指针/关闭规则补足 main 形态片段，错误转 unknown/counts null/两动作 false/latch 无跨包脑补 |
| 作者体验门复核结果 | PASS | 一模块、少量直线函数和固定 ABI；允许少量 Windows 声明重复，保持现有注入，不建立 provider 框架、通用 launcher、事件服务或跨模块重构 |
| 人工 review 对齐复核结果 | PASS | 核心链路顺读、research 映射、跨包脑补三项独立结果均为 PASS，详见下段 |
| P1-P9 协议合规核验表 | PASS | 九项逐条复核见下表，不以测例或任务数量代替协议内容 |
| 基线与澄清一致性复核结果 | PASS | 最新 CBABB 基线与 r2 原字节不变；每节 PLAN_DEFECT 修订说明保留已实施支撑并给出局部收敛任务；A24 完整历史另存，未借旧 PASS 升级绕过 Gate；无新权限/用户目标问题 |
| 设计味道扫描结果 | WARN | 内部 Nt ABI 和细致边界检查使预计 120–170 行可能偏紧；尚无过早通用抽象。实际超过约 300 产品差异行或接近 1000 迭代差异须回 root 收敛，不能删除安全出口凑行数；不阻断该窄方案 |
| Gate-2 | PASS | 当前 frozen r3.1 可交 root 独立核验后实施，全部 runtime 和完整功能验收保持待证 |

**核心链路顺读复核**：PASS。§2 给出现状、改动和不改层，S1 按 ownimage、父启动、全量 native 查询、完整 JSON/失败和原状态的顺序可读，S4 按 mock→默认 helper→真实业务交接，未要求作者自行拼出采样/回收关系。

**research 事实映射复核**：PASS。WQL 实际超时、研究与产品速度区分、UTC 第七位与微秒规范化、Nt 内部 ABI、不可抢占 syscall、venv 反例、PID 复用与 list-clients 覆盖分别映射到实现和验证主体。成熟查询路线采用范围与未采用的 psutil/残缺字段/CIM fallback/PEB 路线理由明确。

**跨包脑补需求复核**：PASS。六字段私有 JSON、monotonic deadline、fixed base/cwd、有限 stderr、父异常/late 语义、测试注入、root 真实超时及故障验收均写明；原 Terminal/gateway/UI 不新增合同。没有让实现者在 base/venv、inprocess/helper、丢行/完整拒绝或杀树/原句柄之间自行选择。

| 禁止内容 | r3.1 与保留 r2 锚点 | 未踩中 |
| --- | --- | --- |
| 延长 5/8/3、重开单调用预算、删前后采样或把晚结果改 fresh | §1 实际失败；S1Δ remaining、原 `_rows` 和最早 age | 是 |
| 只查认可 EXE/固定 PID、相关未知行丢弃后伪造零 | S1Δ 全四 Name 六字段、单行失败整次拒绝 | 是 |
| venv redirector/PATH fallback 或扩大进程树清理 | R3.1.3–.7 direct validated base、zero runner、root 无子残留验收 | 是 |
| PEB/ReadProcessMemory/VM_READ/提权、无限增容/重试 | S1Δ 第 1/5/6 判据，固定有限 stderr | 是 |
| 变更 NEW_GUI 为命名/create，采用现存 old profile 或外部 mux | S1Δ 保留固定无名新连接；legacy/mux 仅只读 full identity | 是 |
| client ID 当 PID、声称握手/web/watch 全量或 GUI 可见/桌面激活 | §2 interactive_only、watcher null、unique_observed、visibility unverified | 是 |
| browser argv/path/body 扩权、放宽 Host/Origin/CSRF 或新增 API | §2/§5 不改层；当前 handler 仅严格空 JSON，同源 CSRF | 是 |
| 改原 UUID/slot/pane/page/源/reader/MCP/图形/CSP | S1Δ 保留主链；§2/§5 范围与独立视觉增量分开 | 是 |
| 杀 server/SSH/conhost/一般树/非原 PID 身份，cleanup 未知自动解锁 | S1Δ 原 Popen GUI 与 exact direct attach 原句柄、latch；清理函数不改 | 是 |
| 常驻 daemon/watchdog/IPC/通用配置、新包、依研究结果关闭 runtime 缺证 | §3/§4/§5 无新增架构；验证三元组和缺证结论 | 是 |

| 协议 | 结果 | 独立核验 |
| --- | --- | --- |
| P1 | PASS | §5 不以任务数量设门槛，行数仅用于范围/可审查体量 |
| P2 | PASS | Required 缺任一失败，不拿检查数替代存在性 |
| P3 | PASS | 双 Gate 为硬门，失败保留、回作者修订，不消费历史 Gate |
| P4 | PASS | T3 消费 T1 十三项及 T2/T3 私有矩阵/边界/兼容追加 |
| P5 | PASS | 技术事实 DELEGATE_ACTION；真正目标、权限或回滚选择不唯一才 DELEGATE_QUESTION |
| P6 | PASS | 真实 WQL 失败、venv 反证、历史冻结与每节修订事件留痕；新风险/阶段即时对齐 |
| P7 | PASS | 不设澄清问题数量上下限，当前无新用户问题理由明确 |
| P8 | PASS | P0/P1/P2、同阶段批量及推荐/代价/影响阶段模板齐备 |
| P9 | PASS | 作者新版 Gate1 → root 独立核 → fresh Gate2 → root 放行；不由作者自放行或旧 report 替代 |

## 验证责任、失败保留与交付边界

作者仅做新 boundary mock、原 35 后端回归、语法与三文件 diff/manifest。root 承接默认 validated-base helper 的真实六字段、包含启动的两次观察计时与短 remaining；长阻塞测试以 root 自己的 helper 和同一 base/timeout 原语证明实际退出、创建身份与无子残留，不能给产品新增故障参数或接口。完整 Python 临时 HTTP/UI、natural GUI/已连接零新建、真实 UUID 分页/focus 与 8 秒后验/5 秒 pre-action-post，仍按原合同独立验证。

root 还须仅在 post-launch 业务观察处受控注入 unknown；真实 owned GUI/client、采集/原句柄清理不 mock，核 3 秒回收与 server/SSH/panes/mux 未动。未知继续 cleanup_unverified latch；不得以重载清空 index/last_evidence/latch 当善后或解除。成功 GUI 留用户。全部最终 diff/hash 和 fresh Review(Impl) 之前不得称整个功能完成；旧图形 fixture PASS 与本文均不替代 native/业务 runtime。

本轮独立读到的失败完整保留：WQL public 5016ms 超时；pwsh 3671/2375/2329ms 与 WMI/COM r5 2328/2750ms 仍慢；COM r1–r4 实际各 exit1（日期/空属性读取失败）；按 PID/Get 路线不满足完整低延迟采样。equivalence harness exit1 是研究者自设 <500ms 条件失败，五次三次超过，不能记成全通过；不把该门槛塞进需求。native probe 中被终止的 harmless owned 子进程 exit1 为预设，不是 GUI cleanup 或自然平台故障证明。旧后端 33 项初验 1 failure、UTF8 collector child exit1/stderr 丢失、旧 Gate 字面断言/读取截断等由原报告承载且未抹除。

作者新文档首检 38efad 为 82/2/exit1（字面“只覆盖”断言与真实并行 robot 字节变化），218167/42c988 的旧 83/0 不能覆盖随后 venv 反证；A24 未取得正式 Gate2。本次作者 151942/ffac81 为新版 91/0/exit0，历史 patch 锚点匹配失败亦保留。作者输出不是此 reviewer 的独立证明。

此 reviewer 首次组合 delta/rg 读取有截断，随后有界补读缺段；最终全文 fa86ea/4e5d2d 两块无截断，root 最终回传 AEB 后才作正式判定。查找尚不存在的 runtime Gate artifact 时 rg 无匹配 exit1，只是当时 inventory 结果，未称验证成功。旧 r2 reviewer 字面检查 red/green 仍在旧报告，本报告不改历史。

已重新完整读 verification-before-completion（c6cdb6）。root Gate-1 JSON e4bc9a 完整读到 90 条全部 true、failures 空、exit_code0 与当前 SHA。随后本 reviewer 独立运行 UTF8 Python -B here-string/显式 exit wrapper，4e891c **148 checks / 0 failures / exit0**，逐项完整输出已读：10 frozen 输入、root 当前 Gate、29 当前文件、27 原快照、core6、Required/十 PENDING 输入/P1–P9、解释器/身份/缓冲/关闭/预算/真实交接锚点及 native 未实施。计数只核输入与存在性，Gate2 的语义结论来自上述独立顺读。

报告落盘后还必须实际自证十字段/九协议、历史/current/hash 和完整正文，结果与报告最终 SHA 由尾后工具回传 root；这不是产品测试。本轮只输出本报告，按 root 最新指定路径 `review_notes_lwplan_runtime_r3.md`，未另写先前建议的 delta_3 报告。

root 核本报告后可在持续“自动实施＋继续”的三项目标授权内执行窄修订；技能默认 STOP_BEFORE_IMPL 与既有授权差异沿用已记录优先级，保留技术 Gate，无须重复询问同一实施许可。新目标/权限风险或实际判据不成立时走受控出口。

建议英文提交信息：`fix: keep workbench process observations within the existing timeout`。

无新增跨功能事实。
