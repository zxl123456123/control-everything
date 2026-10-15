# Codex 执行闭环实施报告（r1）

本轮三个实施包已落地：显式提交与运行存储、所属 Windows 进程与 Codex 协议、运行/审批/取消界面。按用户要求立即停止扩展工作并暂停收尾；作者单测和协调者的部分隔离集成已有证据，真实 Codex 试跑、真实新页面验收与独立 Review(Impl) 尚未执行。**M3 不可称完整验收。** root 仅对断连修复做必要的本地复核，本文不安排继续模型试跑或新增测试。

## 基本信息与责任

- feature_name：`agent-execution-20261013`
- impl_round：`r1`
- date：`2026-10-13`
- lwplan_version：SHA-256 `469d9a78473f6ce5f73fd2d3fb30ac2a5464e5cb87c27ce2f1c01843a9b6fe53`；唯一已审 Gate-2 PASS 计划，未被作者修改。
- 汇总 owner：`/root/execution_store_impl`；S1 作者兼汇总，不代替 root/reviewer 独立核验。
- 分包责任：S1 `/root/execution_store_impl`；S2 `/root/execution_runtime_impl`；S3 `/root/execution_ui_impl`；真实进程/HTTP/浏览器/模型验收由 `/root` 执行。
- 受众：共享。已消费 clarifications、lwplan、review_notes_lwplan_2、research、真实源码与共同接线合同；作者遵循 safe-code-changes、clear-expression 和 verification-before-completion。

三个分包报告完整保留，本文不覆盖其历史快照：

- [S1 存储与 HTTP](impl_report_r1_s1.md)
- [S2 所属进程与协议](impl_report_r1_s2.md)
- [S3 页面与浏览器 fixture](impl_report_r1_s3.md)
- [共同 Python/HTTP 接线合同](impl_contract_r1.md)

## 变更事实

| path | change_type | change_purpose | key_changes | related_tasks / owner |
|---|---|---|---|---|
| `session_panel/execution_store.py` | 新增 | 持久运行事实 | 三表、事务准入、幂等、2根互斥、审批/取消/重启、公共投影与事件保留 | S1 |
| `session_panel/execution.py` | 新增 | 注册项目执行入口 | 真路径与目录身份、context_hash、后台worker、owner、回查、动作和close | S1 |
| `session_panel/gateway.py` | 修改 | 同源窄HTTP接线 | 精确execution路由、原Origin/CSRF、runs独立body上限、执行资源、server生命周期、断开后不二次写回 | S1；S3静态邻接 |
| `session_panel/owned_process.py` | 新增 | 本次owned资源生命周期 | 排他owner、suspended→Job→resume、受限句柄继承、JSONL/pipe上限、只回收己方树、历史Job只查询 | S2 |
| `session_panel/codex_execution.py` | 新增 | 单thread/单turn协议 | 固定进程策略、config/read与线程策略核对、一次发送、ID分流、审批/取消/未知、白名单事件/token | S2 |
| `web/execution.js` | 新增 | 显式运行与恢复界面 | 冻结body/key、未知回查、原key重试、具体单次审批、取消、列表/详情、稳定焦点和纯文本 | S3 |
| `web/workspace.html` | 修改 | 页面入口与容器 | 运行导航、准备与详情、execution先于workspace加载 | S3 |
| `web/workspace.js` | 修改 | 保留旧页面的窄接线 | 旧message兼容，新增status/reason；Codex任务准备按钮；bootstrap/showView/provider能力 | S3 |
| `web/workspace.css` | 修改 | 窄屏与长文本 | execution限定样式、360/390单列、局部代码滚动、按钮/路径换行 | S3 |
| `tests/test_execution_store.py` | 新增 | 存储与服务单测 | 临时SQLite、fake worker、并发、快照、unknown、cleanup与close | S1 |
| `tests/test_execution_http.py` | 新增 | 内存HTTP单测 | 精确路由/字段/错误/安全边界、大小、bind/close、客户端断开 | S1 |
| `tests/test_owned_process.py` | 新增 | Win32 mock单测 | 64位句柄、handle list、失败释放、部分写、UTF8/JSON/队列上限 | S2 |
| `tests/test_codex_execution.py` | 新增 | 内存协议单测 | 真实临时store接线、顺序/ID/策略/审批/取消/终态/token | S2 |
| `tests/fixtures/fake_app_server.py` | 新增 | root真实子进程fixture | 显式隔离标记、受限目录、JSONL场景与发送次数审计 | S2；仅root执行 |
| `tests/test_execution_ui.cjs` | 新增 | 纯Node合同单测 | fetch/DOM stub、错误保真、冻结key、回查、焦点与中文纯文本 | S3 |
| `tests/verify_execution.cjs` | 新增 | root浏览器入口 | 全请求拦截、loopback安全上下文、桌面/窄屏与具体动作 | S3；仅root执行 |
| `tests/verify_workspace.cjs` | 修改 | 旧页面浏览器回归 | 新静态/只读API拦截与本feature独立证据路径 | S3；仅root执行 |
| `docs/current/agent-execution-20261013/impl_contract_r1.md` | 新增 | 消除跨包猜测 | 方法、字段、owner和公开投影集中定义 | S1–S3 |
| `work/agent-execution-20261013/impl-s1-run.py` 与分包日志/JSON | 新增 | 本轮可追溯证据 | 完整命令、输出、退出码、责任与历史保留 | S1–S3 验证 |

各文件更细的 key_changes 与回滚见对应分包表；没有 related_tasks=N/A 的产品改动。没有修改人工任务表定义、旧JSON、凭证或全局配置，没有创建Git仓库或提交。

## 目标与作者体验

- goal_lock_check：G1的显式准备/准入、原生身份与结果有完整实施链；G2通过owner、两个独立Job/stdio、事务claim、一次发送与unknown区分落实；G3有桌面/360/390界面和旧页面回归入口。真实原生可用性仍待root验收，不能由结构或模拟结果推出。
- anti_goal_touch_check：不改人工任务状态、不恢复历史会话、不发第二turn、不提供任意exe/cwd/RPC或永久许可、不终止外部进程、不读认证正文、不改全局设置。fixture和真实模型证据分开。
- authoring_ergonomics_notes：责任分为存储/服务、Windows句柄、Codex协议、单页闭包；公共字段与固定策略集中，未引入Provider框架、消息平台或用户配置面。旧body默认4096和Error.message保持；界面使用中文标签和原始命令/diff纯文本。审批卡按ID更新，轮询不替换未变卡片。

## 作者实际验证与证据

本汇总已读回下列日志/JSON与分包报告。S1命令由汇总作者亲自执行；S2/S3命令由对应作者执行；root仍须以最终文件独立全量核验，不能把分包自述替代最终审查。

| 验证 | 当前结果 | evidence | owner | conclusion_if_missing |
|---|---|---|---|---|
| S1 新增单测、旧纯WorkspaceTests、语法 | 27+16 tests，0 failures；3命令exit0 | `impl-s1-20261013T140927424048Z.log/json` | S1 | 不能称存储/内存HTTP通过 |
| S2 mock Win32+内存协议/临时SQLite | 39 tests，0 failures；syntax exit0 | `impl-s2-protocol-r1-verified.log`、`impl-s2-syntax-r1-final.log`、`impl-s2-file-evidence-r1.json` | S2 | 只能保留代码，不能称协议/资源单测通过 |
| S3 pure Node stub与语法 | 最新24项，全部exit0；此前22项保留 | `impl-ui-verification-r1-fix1.json`、`impl-ui-verification-r1.json` | S3 | 不能称恢复/焦点合同在stub中成立；不外推浏览器 |

以上证据均在 `work/agent-execution-20261013/`；精确命令、退出码与完整输出在原文件，统一重跑S1入口是 `.venv/Scripts/python.exe -X utf8 work/agent-execution-20261013/impl-s1-run.py`。全量Python测试原计划归root；用户要求立即收尾，本轮不继续安排。

## 必须保留的失败与修正

1. **S2队列溢出红测**：`impl-s2-fault-priority-red.log` exit1、1 failure，`ProcessError not raised`。`OwnedProcess.read`曾在非EOF故障后先返回旧队列消息；修复为故障优先，EOF仍先交付已收终态。最终39项绿测保留，root重跑最终wrapper。
2. **S3首轮浏览器**：`ui-execution-r1.json` exit1；`ui-execution-fixture-2026-10-13T13-58-21-046Z.json` 包含28条失败记录及3个尺寸的焦点断言失败。fixture的非安全域使crypto.randomUUID不可用，焦点用例自身点击刷新改变焦点。后改为全拦截loopback安全上下文、实际轮询断言，并保留未变审批卡节点；没有给生产UUID增加不安全随机后备。root第二轮exit0，但首轮不删除。
3. **S1真实丢回包**：`protocol-http-integration-r1.log`虽然exit0且51业务检查通过，stderr有两次`ConnectionAbortedError [WinError 10053]`。已登记响应断开被错误转成503并二次写socket。S1只修新execution_reply的发送边界，并新增单测；最新27项绿测支持内存边界。root随后重跑同一真实场景，`protocol-http-integration-r2.log/json` exit0、51/51、failures=[]、probe_host_stderr及STDERR均空；r1缺陷日志保留。
4. 历史Gate-2第1轮FAIL，以及strict-config旧字段、MCP dotted key、GBK、路径误猜、输出截断等研究/工具失败按原记录保留。本文未把研究失败当成产品成功，也未以通过数字抹去stderr。

## coordinator_handoff_verifications

| 验证与当前证据快照 | 移交原因/承接方式 | evidence_expected | owner | conclusion_if_missing |
|---|---|---|---|---|
| 最终Windows wrapper：root r2 exit0、25检查，作者读回 | 真实Windows进程，root自行运行 | `owned-process-integration-r2.log/json`与隔离result.json | root | 没有最终wrapper证据只能称mock通过 |
| HTTP+Job+fake provider：root r2 exit0、51/51、failures=[]、stderr空；r1缺陷保留 | root对S1最后窄修重跑原场景，本作者读回退出记录与日志结尾 | `protocol-http-integration-r2.log/json`、`protocol-integration-2979b25c-71b9-47ca-9c76-ff62b68b762c/result.json` | root | 缺此证据不能称断连修复的实机场景成立；fixture仍不能称真实模型已执行 |
| 旧页面fixture：root exit0、101检查；新fixture r2 exit0、76检查 | 实际浏览器，root执行并核对截图；S1读取JSON统计 | `ui-workspace-regression-r1.log/json`、`ui-execution-r2.log/json`、对应fixture JSON/PNG | root | 不得称浏览器/窄屏操作验收；fixture仍不证明真实API |
| 全量Python、最终差异与独立Review(Impl) | 三包集成冻结后由root与reviewer核查 | 完整discover日志、实际diff、审查报告 | root/reviewer | 不能签整项实现PASS |
| 新隔离端口/DB实际页面 | CSP、路由、真实投影必须实际加载；旧8770不替代 | `real-workspace-*.png`、资源/API/控制台证据 | root | 不把全拦截截图称实际服务页面 |
| 最终原生Codex策略/真实完成与审批/取消 | 真实平台/额度，root按既定隔离意图执行 | 固定prompt/目录/策略，thread/turn/请求/结果/token/marker/cleanup | root | 真实推理、原生审批、取消和sandbox保持未验收 |

当前浏览器统计来自真实读取：新r1为23项已执行检查/28条失败记录；新r2为76检查、failures=[]；旧为101检查、failures=[]，均fixture_only=true、real_api_used=false。实际截图视觉审阅与最终root判定不由统计替代。

## contract_drift_reports

没有需重新修改范围或权限的已知漂移。S1/S2共同合同将 sent-but-unresolved 在终态失效，但保留decision和发送事件；late worker未收尾时owner继续持有，最后写入后释放；关闭先持久化取消再interrupt。S3的旧资源guard只保持旧预览初始化，不豁免新服务必须提供execution.js。固定生产策略仍workspace-write/on-request/user；read-only/MCP关闭注入只用于Python构造的root隔离smoke。

## 未完成、风险与回滚

- 未完成：全量测试、实际新产品页面、真实Codex smoke与独立Review(Impl)的root证据尚缺。断连原场景已由root完成r2复核。用户已要求立即收尾，以上未执行项保持明确缺口，不在本轮继续安排。后续只有实际取得的结果才由root追加，不能把本文的阶段快照当最终承诺。
- 风险/审查重点：Job/pipe每个句柄唯一释放、owner与late writer、部分写不重试、取消与审批竞争、根身份复核、有效策略拒绝、HTTP未知结果不能换key、cleanup未核验继续占根。
- 实际限制：available仅本机准备条件；MCP等可能继承且不由cwd限制覆盖；Token只属本次运行通知；不承诺全账号日账单或手机远程连接。
- 回滚信息：**可直接回滚代码**到before快照，先正常关闭己方workers，断开执行入口和UI；保留SQLite新表与已登记运行，不删除用户数据库，不重发历史任务。回滚不授权对外部会话/进程操作。
- 英文提交消息建议：`feat(execution): add owned Codex runs with explicit approvals and recovery`

本目录无Git，未commit/push。无新增跨功能事实。
