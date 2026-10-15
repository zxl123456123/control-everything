# 方案评审记录：lwplan（第 1 轮）

**评审对象**：唯一 `lwplan.md`，SHA-256 `51a8fe93f1aa6adc5ca492f6c4e45b1744642abdb550f9f345980f9e13d0e5e4`。  
**评审时间**：2026-10-13（Asia/Shanghai）  
**受众**：共享  
**review_target**：`lwplan`  
**协议结论**：**REVISE**  
**评审结论**：需局部修订；**Gate-2 FAIL，暂不进入实施**。

本轮完整读取 clarifications（含兼容解析、2 并发决定）、两份 research、Readiness 与 305 行计划，并对照实际网关、存储、前端 helper、schema 和清洗后的探测证据。问题方向和主体方案成立；仅 I1 阻断，修订无需新增用户决策，也不要求现在执行未来的运行验收。

## 可行性分析

- S1/S2/S3 是可识别的主要工作包。沿“HTTP 事务登记 → 单 worker → owned 进程 → 策略核验 → 单次 turn → 审批/取消 → 回收 → UI”可以顺读责任。没有复制完整 Orca 框架或引入队列、插件基类。
- 同源路由、旧 body 限额的兼容扩展、新表、不可变运行快照及 request_id 准入均有实际落点。当前 `WorkspaceStore.connection()` 和网关初始化结构能够承接该增量；不需要迁移旧表。
- Windows 设计明确 suspended 后先 Assign 再 Resume、受限句柄继承、单 writer、Job 全树查询、owner 排他文件句柄及重启 unknown。基础 probe 仅作为设计依据，最终管道和 Codex sandbox 的实测仍由 coordinator 承接，边界正确。
- 协议方向、原生 ID 类型、一次审批、取消与完成竞争、未知发送不重发均有状态与证据锚点。常规兼容解析是已记录的固定选择，非运行失败后偷偷降级。

## 风险点及唯一修订项

### I1 · P2：补齐 S3 使用现有 HTTP helper 的失败合同与关键接线片段

**证据**：计划 `lwplan.md:240` 要求 bootstrap 注入并复用 `api/post/showView/getSnapshot`；`:242` 要求 context 失效 409 时保留草稿并重新读取准备摘要、丢回包按 request_id 查询、重试保持相同 body/key。实际 `web/workspace.js:75` 是 `if (!response.ok) throw new Error(reason(result.reason));`，只保留翻译后的消息，未保留 HTTP status 或机器 reason。计划没有说明补充这个公共错误合同，或者不依赖错误类型而仍可确定恢复状态的算法。

S3 还会修改已有 `showView` 分支和 bootstrap 调用顺序，但第 7 节没有目标代码/伪代码片段，也没有“文字足够，无需片段”的判断；第 2 节声称第 7 节已覆盖 UI 消费闭环。按 implementation-planning 的已有分支修改触发条件，当前片段闭环缺少前端端点。

**影响**：UI 作者必须自行决定如何识别上下文失效、查询未登记与查询暂不可用，以及何时允许新 request_id。后端作者也不知道是否需要改公共错误投影/前端 helper。这里直接涉及一次提交的恢复语义，不能仅凭普通错误提示补脑实现。

**精确修订边界**：只补计划第 3 节必要的公共错误约定、第 7 节接线及恢复骨架，并同步第 2/9 节闭环说明；无需改目标、并发数、数据库方案、Windows 生命周期或新增框架。

1. 明确一种可执行合同：例如让现有 `api` 的 Error 保留稳定的 status/reason，同时保持旧调用依赖的 message；也可定义不依赖错误类型的保守恢复算法，但必须证明上下文刷新、404 未登记、503/网络结果未知不会被混同。不强制新增错误类。
2. 附最小目标片段，标明 `workspace.js` 的 bootstrap/showView/api 插入点和 `execution.js` 提交处理入口。覆盖初始化顺序、首次 POST 固定 body/key、结果未知时 GET request_id 回查、context_changed 的草稿保留/重新准备，以及旧请求结果仍未知时如何避免自动生成新 key。无需写最终实现全文。
3. 在 S3 的验证锚点明确这些分支及旧 api/post 调用兼容；原有“同 key 丢回包”fixture 继续保留。

## Gate-2

**Required Set 复核结果**：**FAIL**。按 T3 复核：目标/边界、三工作包、输入输出、跨模块接口、状态、兼容与停用、分层验证和回滚均存在；I1 使必需代码片段与跨层最小闭环不完整。作者 27 项 Gate-1 记录不能替代本次独立判断。

**目标锁 / 反目标复核结果**：**PASS**。G1/G2 落在 S1/S2，G3 落在 S1/S3；目标未漂移，I1 属于实现交接不足。

| 禁止内容 | 计划证据 | 结论（确认 lwplan 未踩中） |
|---|---|---|
| turn 结束冒充任务完成、fixture 冒充真实推理 | 第 1 节、第 3.3 节、第 8 节分别隔离人工状态、协议终态和证据层 | 未命中 |
| 任意 RPC/exe/cwd、沙箱绕过、永久/批量授权 | 第 3.1 节精确 HTTP 字段；第 5 节固定策略；第 6 节仅一次 decision | 未命中 |
| 旧会话接管、重启重发、按 PID/名称杀外部进程 | 第 1/4/6 节：新 thread 单 turn、旧 run unknown、只操作己方句柄 | 未命中 |
| 改凭证/全局配置、迁移旧 JSON、占用旧服务、初始化 Git | 第 1/5/8 节明确保留；只读 config 清洗，真实 smoke 有独立边界 | 未命中 |
| 多余通用框架、完整账号日账单、手机远程完成声明 | 第 1/2/7/8 节：单 Provider、两个 worker、仅运行通知、响应式不冒充远程 | 未命中 |

### Gate-2 关键复核

| 项目 | 结果 | 说明 |
|---|---|---|
| 关键实现锚点复核结果 | PASS | S1 定位 admit/submit/context/snapshot/act 和网关；S2 定位 Owner/OwnedProcess/CodexRun；S3 定位 WorkspaceExecution 与既有 showView/bootstrap。文件、首个复核落点和目标形态均存在。 |
| 代码片段充分性复核结果 | FAIL | 登记、Win32、原生发送、审批片段足够；第 7 节缺触发条件要求的 UI 接线/失败恢复片段，见 I1。 |
| 作者体验门复核结果 | PASS | 公共投影集中、状态命名稳定、协议/句柄职责分开、UI 窄脚本接线，无机械声明或复制框架；I1 的合同缺口另行阻断，不要求增加结构。 |
| 人工 review 对齐复核结果（总括项） | FAIL | 汇总下列三子项：顺读 PASS、research 映射 PASS、跨包脑补 FAIL。 |
| 核心链路顺读复核 | PASS | 第 2 节先给现状、改动、不改层与分层原因，后续工作包沿生命周期展开。 |
| research 事实映射复核 | PASS | 第 2 节逐项连接 native 版本、ID、权限、owner、根目录、token、旧 fixture 与实现/验证口径；第 5/8/9 节消费最新 policy 补证。 |
| 跨包脑补需求复核 | FAIL | S3 复用的 helper 与恢复行为之间缺稳定错误合同，需作者自行拼出端到端失败分支，见 I1。 |

**P1-P9 协议合规核验表**：**PASS**。协议结构存在不代表 Required Set 或技术内容已全部通过。

| 协议项 | 结果 | 证据 |
|---|---|---|
| P1 | PASS | 第 9 节按必备内容自检，没有最低任务数量门槛。 |
| P2 | PASS | 第 9 节列出目标、锚点、片段、责任、证据、作者体验等必备内容；缺项不放行。 |
| P3 | PASS | `lwplan.md:297` 明确任一必备项缺失不放行，无评分或数量替代。 |
| P4 | PASS | 首段明确 T3；Required Set 按 T1/T2/T3 canonical 的累进要求组织，包含跨模块矩阵、状态、兼容和停用。 |
| P5 | PASS | `:283/:297` 对新增权限/认证/范围/验收不唯一给出 DELEGATE_QUESTION；低风险补证另走 ACTION。 |
| P6 | PASS | `:281` 有配置未知、2 并发收敛、阶段切换的事件触发留痕，无固定次数。 |
| P7 | PASS | 未设置澄清数量上下限。 |
| P8 | PASS | `:283` 有 P0/P1/P2 优先级及批量提问模板，并解释当前未触发的原因。 |
| P9 | PASS | 第 9 节明确作者 Gate-1、独立 reviewer + root 的 Gate-2、失败回 LW；第 3 行仍要求独立放行。 |

计划未指挥后续 agent 递归派发下级；S3 可并行是 coordinator 的工作包安排。

**基线与澄清一致性复核结果**：**PASS**。

- 澄清“未回答”为空；本次未引入用户决策。
- 目标锁遵守：PASS。一个 Provider、两个不重叠根并行，手工任务状态不被原生终态改写。
- 反目标未踩中：PASS，依据上表。
- 头脑风暴决策未违反：PASS。固定兼容解析、进程覆盖与有效值核验、生产继承说明、root 限定 smoke 都能追溯到最新基线。

**设计味道扫描结果**：**PASS**。状态和持久记录对应真实异步风险，句柄层有 Windows 归属依据；未发现需要新增抽象或扩大范围的理由。I1 可用现有 helper 的小合同和短片段解决。

### Gate-2 结论

**Gate-2**：**FAIL**。协议结论 **REVISE**，仅 I1 阻断。未发现 PROBLEM_DEFECT；不输出实施审查专用的 IMPL_DEFECT/PLAN_DEFECT 业务结论。

## 验证与证据边界

已读取 verification-before-completion。本轮独立执行 `python -X utf8 work/agent-execution-20261013/review-lwplan-check.py`，退出 **0**，完整输出在 `work/agent-execution-20261013/review-lwplan-check.log`。核验计划 SHA、56 文件快照未变、Gate-1 绑定、实际 schema 请求字段、policy 双探测摘要，同时确认 S3 无代码片段及当前 api 错误分支。命令成功只证明这些静态事实，不改变上述 REVISE。

`impl-safe` 责任存在：临时 DB、mock Win32/transport、单元及 JS 静态验证。coordinator 承接责任存在：最终 wrapper 真实进程树、假服务器/HTTP、多实例、浏览器及固定真实 smoke。配置读取、基础 Job 或 mock 均不等于真实 turn/审批已验收；本轮未启动任何服务、Agent 或窗口。

失败没有省略：严格解析因旧 `disable_response_storage` 字段失败，初 probe timeout 后改 EOF 定位；带引号 MCP dotted key 失败后采用校验 ID 的原生 dotted key；GBK 输出失败及旧研究的限流/404/路径/compact 错误仍在原记录。评审本次合并读取发生输出截断，已独立重读完整 skill、Readiness，并分段读完计划；未把截断内容当作已读证据。

## contract drift / stale / mirror mismatch

research_execution_policy 的 strict-config 是历史候选；最新 clarifications 已明确兼容解析决定，计划也明确不带 strict-config、不失败后降级，未发现当前权威冲突。Readiness 的“基础 Job 未实测”是当时快照，后续补证被计划正确限定为基础机制。未修改共享 skills/平台合同或产品文件。

## 后续行动

原 LW 作者在唯一计划中补 I1，重跑 Gate-1 并交回修订 SHA；独立复审只需覆盖该合同、最小片段和相应验证锚点。无需重复无关调研、全量测试或提前运行真实 smoke。技术放行前不得进入实施。

无新增跨功能事实。
