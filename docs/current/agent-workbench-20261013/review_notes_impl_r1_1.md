# 实施评审 r1 / 第 1 次

项目卡片遗漏具体文档阶段，需要局部补修。任务、存储、来源及响应式 Web 的现有证据可保留；Edge 应用窗口外观仍未验收，不能据启动退出码放行该项。

- `review_target`: impl
- `impl_round`: 1
- `review_seq`: 1
- `review_date`: 2026-10-13（Asia/Shanghai）
- `reviewer`: impl_review，独立评审，未修改产品代码、未递归委派
- `impl_report`: [impl_report_r1.md](impl_report_r1.md)
- 协议结论：**REVISE**
- 业务结论：**IMPL_DEFECT**
- `allow_archive_pr`: no

该组合合法。问题方向与计划不需要改变；目前既有可修复实现缺陷，不能仅以 `USER_CONFIRMATION_NEEDED` 代替修复。

## 输入与审查范围

完整读取本 feature README 原始需求、clarifications、hlplan、lwplan、review_notes_lwplan_2、正式实施报告和 impl_backend/impl_ui。直接读取三个新后端模块、网关实际保护与改动、新 HTML/JS/CSS、入口脚本、新测试及复用的 progress/codex_index 实现；对照 `work/agent-workbench-20261013/final.diff`、`changes.json` 和 before 快照。实际四张 JPEG 均已目检。

审查时 14 个改动文件 SHA256 与 changes.json 相符，完整 snapshot diff 可重建且逐字一致；被审 `web/workspace.js` SHA256 为 `95ff02c2ed723dcbb97632e98926f7316b830099d8dd39bdfe491cef7112689c`。目录无 `.git`，没有把快照差异冒充 Git diff。

## I1 — P2：项目摘要只显示标签，遗漏真实阶段

- 位置：`web/workspace.js:132`，`renderProjects`。
- 触发条件：项目没有手工备注，首条文档记录同时含 `label` 和 `text`。实际 `progress.latest_focus` 返回的 label 为“当前阶段”或“最近一条”，具体进度在 text。
- 当前表达式 `${record.label || record.text || '文档线索'}` 总是优先取非空标签。真实工作面板记录 `{feature:"agent-workbench-20261013",label:"当前阶段",text:"Impl"}` 被绘制为 `agent-workbench-20261013 · 当前阶段`；用户看不到阶段值。同一问题影响其他无备注项目，桌面截图可见该现象。
- 需求依据：README 要整合项目进度预览；hlplan §7 项目区域保留文档线索；lwplan S1 保留 records，S4 将项目内容呈现到工作台。这里只需显示已有字段，不增加新来源或推断完成状态。
- 当轮复现：`node work/agent-workbench-20261013/review-impl-r1-repro.cjs` 从**当前实际脚本提取 renderProjects**、读取已导出的真实项目记录，用内存 DOM 执行，断言渲染中包含原 text，退出 **1**。完整实际输出与 AssertionError 在 `review-impl-r1-repro.log`。未启动浏览器或连接服务。

### 可直接补实施的边界

1. 仅修正 `renderProjects` 的文档摘要：在现有手工备注优先策略下，无备注时显示 feature、可选 label 和具体 text；text 缺失时保持明确降级。仍使用 textContent，仍将文档线索与手工百分比分开，不能把文档文字自动映射为任务完成。
2. 在 `tests/verify_workspace.cjs` 加入 label/text 同时存在且不同的项目 fixture，断言桌面/窄屏实际可见 text；保留手工备注、无记录和无来源分支。较长阶段文字继续换行，无横向溢出。
3. UI 作者执行 JS 语法检查；coordinator 执行受影响的新浏览器 fixture，并检查真实项目摘要、更新相应截图。纯前端补修无需重复无关后端/旧页面全量测试。
4. 生成下一轮实施报告与新差异证据，保留本报告和红灯日志，再恢复本 reviewer 复审。若修改范围扩展到数据模型、任务结构或验收定义，应回到 coordinator 重新路由。

`IMPL_DEFECT` 三条件：**局部**——只涉及已规划的项目渲染点和对应 fixture；**低风险**——不改 API、库、数据、来源或回滚路径；**无新决策**——展示已提供的进度文字直接来自既有需求，不需要修改 lwplan 目标、任务结构或验收定义。

## 目标、基线与设计复核

| 必填字段 | 结果与依据 |
|---|---|
| `goal_lock_alignment` | aligned；仍按 G1–G3/M0–M2 实施，I1 是目标内的显示遗漏，不是目标方向漂移；G3 的 Edge 外观未验收 |
| `anti_goals_touched` | none；本轮新实现未触碰下表禁止项 |
| `authoring_ergonomics_check` | pass；存储、业务、外部来源三个具名模块，网关薄接线，未引入插件 DSL |
| `declaration_readability_check` | pass；HTML 语义表单、固定接口与能力字段可直接核对 |
| `plan_defect_checkpoint_recommended` | no |
| `plan_defect_checkpoint_reason` | I1 满足局部、低风险、无新决策；不需要改写计划目标或回滚设计 |
| `plan_defect_trigger_reason` | n/a；未命中 PLAN_DEFECT |
| `impl_safe_validation_check` | pass；作者记录为静态、临时库和 mock；浏览器/真实外部来源由 coordinator 承接。此字段核验责任边界，不代表 I1 已修复 |
| `coordinator_handoff_check` | pass；接手主体、产物和未验证限制完整；Edge 观察仍待完成，不能解读为全部承接项已验收 |
| **基线与澄清一致性复核结果** | **PASS**；“未回答”无阻塞 Q&A；ocra/dsh 名称候选保持假设，未伪称用户确认；目标锁、反目标及头脑风暴决策未被改变 |
| **设计味道扫描结果** | **PASS**；未发现阻断性抽象/结构异味，I1 属于字段选择错误 |

### 禁止项证据表

| 禁止内容 | 可核查证据 | 结论 |
|---|---|---|
| 假进度、假活跃、未知额度写成 0/100 | workspace.py projects 对缺值保留 null；codex_index.py 仅身份字段且活动/完成 unknown；JS quota/manual 显示来源 | 未命中；I1 是漏显文字，未伪造数值 |
| 自动派发/审批/取消、任意命令执行 | workspace.py:74 三项能力 false；gateway.py:324 固定新路由；sources.py:132–224 唯一新子进程只发送 initialize、initialized、account/rateLimits/read | 未命中；31 项当轮 mock/存储测试含协议白名单与回收 |
| 凭证、CLI/全局配置修改或正文读取 | source 不读取凭证；discover_providers 仅 which；复用 codex_index 只读显式元数据列；无 turn/login/config 写调用 | 未命中 |
| 覆盖旧用户数据、旧交付或无关全栈重写 | 14 文件 snapshot diff；旧 HTML 仅加入口；旧 registry/manual 当前哈希等于 before，todos 仍不存在；新库独立 | 未命中 |
| 公网监听/接管旧服务、冒称原生安装或手机连通 | make_server:423 仍仅 HOST；入口脚本仅打开固定 loopback；真实记录保留原8766、8770预览、8771已关闭；README/报告明确后续能力 | 未命中；窄屏只证明布局，Edge外观未验收 |

## 证据、执行主体与限制

所有下列 work 文件均位于 `work/agent-workbench-20261013/`。

| 验证 | 主体与证据 | 结论限制 |
|---|---|---|
| 当轮独立存储/业务/来源 fixture | reviewer；`review-impl-r1-unit.log`，31 项、4.130秒、退出0，完整输出已读 | mock外部源、临时库，无真实服务或正文读取；不替代实机 |
| 当轮独立静态/差异/证据校验 | reviewer；`review-impl-r1-static-final.log` 退出0，源码/before哈希、完整diff、AST、两份JS语法、旧数据哈希、JPEG签名核验 | 只支持静态与证据一致性；不能覆盖 I1 或窗口视觉 |
| 原全量单测 | coordinator；root-unit-r1.log/.json，237条测试记录、最终OK、退出0 | reviewer程序读取全日志核查；不是 reviewer 再跑237项 |
| 新/旧浏览器回归 | coordinator；ui-fixture-r2、old-cockpit-fixture-r1、old-garden-fixture-r1 的日志与其引用明细JSON相符：83/1403/17，失败列表空，退出0 | reviewer未重新启动浏览器；原83项无 I1 用例，因此不能排除该缺陷 |
| 真实管理面/关联/持久化 | coordinator；real-workspace-final、real-interaction、user-data-before/after | 六项目、12条元数据、四命令发现；隔离任务为review/verified，人工12345 Token为manual；不是生产任务或真实消耗 |
| 官方额度与RSS | coordinator；real-quota-final、real-news-final、real-quota 与实机记录 | 当前七天42%已用；历史-32603保留；三源15条仅证明该次采样，不证明持续可用 |
| 实际页面截图 | coordinator拍摄、reviewer四图目检；workspace-desktop/mobile-390/mobile-360/agents-or-usage.jpg，screenshots.json | 桌面/两窄屏内容可读，任务入口在前；DOM视口与截图位图尺寸不同，不互相冒充；I1在图中可见 |
| Edge入口 | coordinator；脚本退出0与real-workspace-check.md | 只证明启动请求；原生窗口无地址栏且加载工作台的外观尚无证据 |

### 已见失败与 contract drift / stale / mirror mismatch

- 本评审 I1 复现退出1，未修复；该失败不能被现有83项fixture覆盖。
- 本 reviewer 首次日志静态核验退出1：误以为237项均为单行 `... ok`；既有Pydantic警告穿插在3项测试中，实际有234条单行。改为读取237条测试记录、最终OK、失败标记与退出码后通过。保留 `review-impl-r1-static.log` 原失败、`-r2.log`（中间文字误写一项）和准确的 `-final.log`；没有业务源码修改。
- 大批量读取数次输出截断，已对权威方案和实际实现分段补读；首轮Python中文打印编码不匹配，I1正式复现改为UTF-8完整输出，不以乱码作结论。
- 既有失败包括无Git退出128、早期Codex -32603、Windows路径红灯、68项UI遗漏手机顺序、CUA截图/locator异常、漏client头403；正式报告及实机记录保留。Pydantic警告仍存在，未顺手修改依赖。
- 路径 extended-length 别名修复仍为原“同一项目包含关系”；数值边界已补入clarifications（后端signed-64/UI safe integer），当轮31项包含对应后端边界、原浏览器证据包含前端拒绝。不是静默接口扩展。手机DOM顺序为S4原范围修正。
- 历史hlplan额度失败与当前成功已显式区分；原报告不被改写。未发现需要回退PLAN的未解决合同漂移或镜像不一致。

## Edge 观察缺口与后续分流

I1 修复复验后，如果仅剩此项，应输出 `USER_CONFIRMATION_NEEDED`，业务结论留空；不能提前写PASS。该观察属于低风险、肉眼可确认事实，不要求用户判断代码正确性，不新增技术决策。

- `confirmation_items`: 已打开的8770 Edge应用窗口是否显示工作台，且没有普通浏览器地址栏。
- `allowed_observation_methods`: 目检已打开窗口；必要时用户自行运行现有 `scripts/open-workspace.ps1 -Port 8770` 后查看，不要求改设置/安装/启动Agent。
- `expected_user_reply_format`: “已看到独立工作台窗口且无地址栏” / “窗口没有出现或页面异常” / “现在无法确认”。
- `fallback_if_unconfirmed`: 无法观察或结果不明确时保留未验收并BLOCKED；有可重现入口缺陷则按局部性重新判REVISE；不能用用户沉默替代通过。
- coordinator 根据真实答复记录方法与结果，恢复原 reviewer，附本报告、I1修复diff/新实施报告、相关fixture/截图。用户普通自动推进授权不等于已观察到窗口。

未完成范围保持：Agent派发/审批/取消、Grok/Claude自动额度、自动日Token/成本、手机远程认证、原生安装包仍属M3/M4。无新增跨功能事实。
