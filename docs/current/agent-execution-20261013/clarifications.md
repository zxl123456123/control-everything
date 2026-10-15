# Agent 执行基线

受众：共享。状态：依据用户持续自动开发授权收敛；技术协议以本轮实际调研为准。

## 未回答

无当前阻塞问题。DSH 名称仍为候选，本轮不接入其执行。真实模型推理验收与用户项目操作分开；不得凭合成事件宣称已真实派发。

## 已回答

- 用户要求“负责架构的选定和开发”“自动化做即可”，授权本任务内的方案选择、实现和普通阶段推进。
- 2026-10-13：“就是 stablyai/orca，按它推进”。原问答见上一里程碑的 user-confirmation-20261013.md。
- 2026-10-13：“已看到，独立窗口正常显示”，已闭合 M0–M2 的独立审查。

## 头脑风暴决策

1. 核心问题仍是把分散工具和多项目开发进度统一管理。当前管理面只能记录负责人，不能代表真正派发；本轮将一个 Provider 的运行生命周期接到任务上。
2. 延续已选 Python / SQLite / 同源响应式 Web。参照 Orca 的专用适配器和能力区分；Codex 使用官方 app-server。暂不引入通用插件、完整 IDE、ACP 中间转译或消息队列。
3. 只操作工作台新建的 Codex 运行。原有 Codex / Claude 会话继续作为观察入口，不自动恢复、审批或终止它们。工作台运行结束不自动修改人工任务状态。
4. 显式提交任务提示词和已登记的工作目录；采用受约束的权限模式和具体请求审批。仅允许针对当前运行的单次决策，不提供永久全部许可、任意 RPC、任意可执行文件路径或全局设置改写。
5. 持久化最小运行记录和必要事件，支持取消请求、结果及未知状态；服务重启不自动重发任务。先解决 Windows 所属进程树回收，再宣布可用。不同项目最多同时运行 2 个 Codex，真实规范目录相同或存在祖先/子孙关系时互斥；超限显式拒绝，不加隐式队列或额外配置项。单 Provider 接入仍应能服务用户多个项目。
6. 运行中的官方 Token 通知可以作为“工作台本次运行”用量，不等于账号全部日用量、费用或订阅额度。不扫描私人历史正文。

执行配置补证后的收敛：生产运行采用已验证的进程级覆盖关闭 hooks、notify、plugins/apps、自动子 Agent 和 goal 延续、Web Search；使用 workspace-write / on-request / user，额外写根为空、工具沙箱网络关闭并取消额外临时目录放行。返回的有效策略必须核对。独立 MCP 和本机 managed 设置仍可能继承，提交页应直白说明这点，不声称全部外部工具都在 OS 沙箱内。具体参数与证据见 research_execution_policy.md。

严格解析的实机纠正：`--strict-config` 会因用户现有 `disable_response_storage` 字段未知而启动失败；只提取了字段名，未读取/输出其值。root 已告知采用常规兼容解析，保留原配置文件；不在失败后偷偷降级重试。LW 固定不带 strict-config，通过 config/read 的允许字段核验和 ThreadStartResponse 有效策略核验保证本次覆盖生效，核验不成立即拒绝发 turn。历史严格解析失败保留于 native-policy-probe*.log；研究中的 strict-config 是候选方案，不是已经运行成功的证据。

**用户确认**：原任务的持续自动授权覆盖上述实现取舍；不新请求重复阶段批准，不豁免技术证据。

## 完整实现基线

### 1. 目标锁

- G1：工作台可把一个已登记项目的任务显式提交给 Codex，持久化实际 thread / turn 标识并展示事件和结果。请求失败、失联与正常结束可分辨；人工任务完成独立保留。
- G2：具体审批与取消必须绑定本工作台拥有的运行和原生请求；重复提交、过期审批、进程退出、重启不得导致错误重发或误判完成。进程树由启动它的主机持有并可验证回收。
- G3：桌面和 360/390px 可完成运行的准备、提交、观察和具体动作；现有项目任务、额度、资讯及旧入口继续可用。界面与最终交付保留证据来源和未验证限制。

### 2. 反目标

- 不把任务卡片、进程存活或模型 turn 结束当作项目完成，不把模拟回执当真实 Agent 运行。
- 不做任意命令 / RPC 代理，不绕过 Agent 沙箱，不批量自动审批，不接管外部会话或打开公网监听。
- 不全栈迁移，不动旧 JSON / 凭证 / 全局配置，不为未来 Provider 创建大量空抽象。

### 3. 风险边界

仅工作台新建运行可被操作；项目根目录来自可信本机注册，调用方不能直接传任意 cwd 或程序路径。默认模式和每种权限效果由低层计划写明并展示，无法确认受约束运行时拒绝启动。支持多项目时不得并发写同一项目根；不同服务器实例对同一库的运行归属必须明确。

不在用户真实项目里自动发送验收任务。coordinator 可在自身隔离临时目录执行无业务副作用的协议 / 子进程验证；若需真实模型 turn，先给出确切测试意图、范围和结果记录，不把它混入产品任务。不得自动购买额度、登录或升级 CLI。平台缺证据时只报告缺口，不把支持接口等同本机成功。

U4 的 coordinator 授权判定：用户原有“负责开发、自动化做即可”包含本任务必要的固定集成 smoke；允许 coordinator 在自身隔离目录，以可审阅的固定提示词验证本次 owned run 的无害 marker 与中断。此为对既有开发授权的解释，不是新增用户原话。验收者不得接受意外工具网络、全局权限或用户项目操作；正常连接模型服务属于测试本身。具体动作在执行前写入证据并告知，若需要新登录、购买、安装或权限提升则保留缺口。

为收敛 smoke 继承范围，允许 coordinator 在不创建 thread / turn 的官方 config/read 查询中只检查有效 MCP 名称/启用布尔和上述策略值；不开 includeLayers，不输出或持久化原始配置、环境变量、header、命令参数或凭证字段，不读取 auth 文件。只保存允许字段的清洗结论。若不能核实逐项关闭独立 MCP 的效果，就保留真实 smoke 缺口，不复制认证到新 home、不静默降低权限。

### 4. 验证责任

impl 负责静态、临时 SQLite、mock 协议、纯本地测试；不得启动真实 Agent、用户服务或浏览器。独立 reviewer 读实际 diff 和全量证据。coordinator 承接隔离假 app-server 子进程、Windows 进程树、实际浏览器、实际 Codex 只读握手等集成验证，并记录退出码、失败和来源。真实模型 turn 若执行，只在自身隔离目录，prompt 与权限可审阅，另列真实证据；未执行则保持未验证，不能以 fixture 替代。

### 5. 文档职责

README 为范围与当前阶段；本基线为下游唯一权威；research 为实际源码和协议证据；lwplan 为唯一实施计划；impl_report 与 review_notes 记录实际验证和结论。work/agent-execution-20261013 保存独立源码快照、diff 和日志，原 M0–M2 证据不覆写。

### 6. 基线生成规则

本文件按上一里程碑 README 原始需求、确认记录和 hlplan 的 M3 路线生成。本轮实现单 Provider 闭环，不声称多 Provider 执行、自动全账号费用、原生安装包和手机远程全部交付。

### 7. 内容边界

复用现有网关 Host / Origin / CSRF；新增执行状态与任务人工状态分离。旧 8766 不重启，8770 已验收预览保留至新验收完成；测试写入隔离库。当前没有 Git，不初始化、不虚构 commit / push。

### 8. 下游消费规则

LW 与 reviewer 必须同时消费 G1–G3、反目标和验证责任。调研中的版本差异必须落实到当前可执行与字段选择；不使用上次 0.118 的 schema 冒充本次实际 native_codex 版本。协议字段由本轮 research 给出，不凭记忆推断。

### 9. 状态与兼容性

本轮独立增量；M0–M2 已审计划保持冻结。启动失败与不支持以显式状态呈现，不影响现有只读来源和人工记录。

### 10. 补充输入

新增范围 / 风险先回写本基线；需要用户提供账号、全局权限或有业务副作用的任务时才请求缺失信息，不能把普通技术实现选择转给用户。

### 当轮补证

coordinator 已在实际 resolver 对应的 0.162 原生 exe 上执行 initialize → initialized → model/list，只读握手返回 7 个模型，退出 0；该自有进程与 reader 已退出。证据为 work/agent-execution-20261013/native-model-probe.log 与 model-probe.json。未创建 thread / turn，账号推理与 sandbox 仍待后续实际验证。

coordinator 的 Windows 无模型 probe 退出 0：CreateProcessW 以 suspended 创建无害 Python 父进程，先加入 KILL_ON_JOB_CLOSE Job，再 ResumeThread；真实孙进程创建后关闭 Job，父/孙都退出，组外对照进程仍活且随后正常清理。证据为 work/agent-execution-20261013/windows-owned-job.log、owned-job-probe.json 和 probe-owned-job.py。该验证只证明本机基础机制，不替代最终产品实现、管道句柄和 Codex 沙箱兼容性验证。

配置实际补证退出 0：native-policy-probe-compatible-2.log / policy-probe-compatible-2.json 只保存允许字段摘要。常规读取下进程 overrides 的 hooks/plugins/apps/multi_agent/goals 均为 false，notify 空数组、Web Search 关闭、额外根空/网络关闭/temp 排除均匹配。第一个进程只读枚举到 3 个独立 MCP 配置元数据；第二进程逐 ID disabled 后均匹配。两次均未创建 thread/turn，进程与 reader 退出。该证据允许 smoke 使用同组 override 并重复核查有效值，不代表所有系统/managed 能力已完全隔离。

配置补证保留的失败：最初严格解析失败，初版 probe 等待到 timeout；改为 EOF 检测后定位旧字段，不修改用户配置。常规解析第一次成功，但第二进程的带引号 MCP dotted key 被本机 CLI 拒绝；对已观察 ID 作字母/数字/下划线/连字符校验并用原生 dotted key 后双 probe 成功。一个日志显示命令另因默认 GBK 输出抛 UnicodeEncodeError，日志与 metadata 已先保存，随后统一 -X utf8；未抹去首次输出。均为验证脚本/环境适配问题，产品仍未实施。

环境辅助读取失败记录：目标目录无 CLAUDE.md 和 Docs.Maintenance.Conventions.md；OpenAI Docs 首次使用错误技能路径失败，随后从 .system/openai-docs/SKILL.md 正确读取；猜测的旧 probe 文档不存在，后直接读取实际 probe 脚本。它们是调研工具失败，不是产品测试失败。

阶段工具历史：Readiness 报告尚在写入时，root 首次读回检查退出 1（报告尚不存在），待正式落盘后全文读回并校验退出 0。LW 作者在补证请求后遇到远程 compact 的网络连接错误，已恢复同一阶段；未把失败当成计划完成，也没有据此实施。
