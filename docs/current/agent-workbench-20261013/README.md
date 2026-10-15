# 多 Agent 工作台架构与交付

创建时间：2026-10-13（Asia/Shanghai）
当前阶段：M0–M2 已验收
状态：用户已确认 Orca 参考项目和 Edge 独立窗口；原独立 reviewer 最终协议 PASS / 业务 PASS。本结论仅覆盖本机管理面，M3 执行闭环与 M4 跨设备能力仍按后续里程碑推进。

## 原始需求

可以看看我目前开发面板的进度：E:\project-funny\mianban-develop，我的目的是：我现在其实是想开发一个工作面板，因为现在的痛点就是，我要用的工具太多了，有grok、codex、claudecode、以及开发的项目也比较多，就比如现在文件夹下挺多正在同时开发的，还有一些待办事项，还有一些项目进度预览，以及我每天的开发额度损耗，还有目前的codex和grok额度，以及我每天还要看一些ai的实时新闻之类的，知道ai的前沿消息。所以我现在就打算做一个工作面板，先把我现在的一些繁琐的都整合到一起来，我现在是用wezterm来统一了一部分的内容进来，后面肯定还是以工作面板的形式展现最好，最好是桌面app的形式吧，以及浏览器、手机端都能看目前的进度兼容，所以这需要考虑非常多的东西。你先看看目前的我这个需求，github上是否有能够借鉴的模板和好用的架构使用。然后分析一下。

突然觉得架构上需要优化，需要 管理多个agent，至于agent的管理手段，需要你去学习ocra开源项目的形式，接入现在多种的coding agent dsh 、很多之类的。然后统一管理我现在的开发进度。
你目前就负责架构的选定和开发，目前页面和部分管理开发了一部分了，如果你觉得有问题可以提出来重构。然后你现在做个长程任务，负责想好设计开发。很重要。自动化做即可。最终给我你的方案设计，以及页面预览图最终的工作台。 也可以参考其他人的工作台github

## 执行授权与既有边界

- 用户明确授权架构选择、开发及自动推进；按该授权执行调研、规划、独立审查和实施，不重复请求常规阶段确认。技术 Gate 与事实验证保留。
- 既有 subagent-garden / subagent-garden-detail 已有独立交付；新工作不改写其历史结论。新增工作台作为本轮独立增量，不降级旧 feature。
- 目录没有 Git；继承既有不初始化 Git 的边界。用文件快照与证据记录当前改动，不虚构 commit/push。
- 现有手工进度、项目注册、会话元数据和工具设置必须保留。未验证来源显示未知；不将动画、进程存活或最近消息解释成任务完成。
- 不自动发送 agent 任务、审批、终止会话、修改 CLI/凭证/全局配置或暴露公网；若实现此类能力，先交付可审阅的具体动作和边界。

## 里程碑

- [x] 现有系统与 GitHub/官方方案调研
- [x] 架构与完整实现基线
- [x] Readiness 与低层方案及独立 Gate-2
- [x] 工作台开发
- [x] 实际运行、桌面/手机宽度预览与独立审查

## 证据入口

- research.md：代码事实
- research-industry.md：开源与官方接口事实
- clarifications.md：完整实现基线
- hlplan.md：架构方案
- lwplan.md：本轮可验证实施计划
- impl_report_r1.md：实施范围、验证结果、失败和未完成项
- impl_report_r2.md：项目具体阶段显示修复与101项最新UI回归
- review_notes_impl_r2_2.md：用户确认后的最终独立评审（M0–M2 PASS / PASS）
- user-confirmation-20261013.md：Orca 名称和 Edge 窗口的用户原文确认
- ../../../work/agent-workbench-20261013/real-workspace-check.md：实际页面与来源验收（项目根 work 目录）

首次环境探测：git status 返回 fatal: not a git repository，rg 文件发现正常；该失败只说明目录没有 Git，不说明产品状态。

2026-10-13 进展：root 独立基线 `.venv/Scripts/python.exe -m unittest discover -s tests -v`，202项，退出0；保留既有 Pydantic IncompleteFieldDefinitionWarning。已有源码快照位于 `work/agent-workbench-20261013/before`，哈希清单位于同目录 before-manifest.json。`codex-cli 0.118.0` 本地协议 schema 已生成，支持 account/rateLimits/read，未发现 account/usage/read。真实8766/progress已观察，手机/完整交互尚未验收。

Readiness 已独立 PASS，进入唯一 LW Plan。架构、基线、三份调研与最低接口原文已落盘，详见 `review_notes_readiness_1.md`、`hlplan.md`、`source_materials/delegate_action_gateway_contract.md`。root真实Codex额度探测为 unavailable / -32603（命令退出0），三个公共RSS均HTTP200；业务失败不视为可用额度。

2026-10-13 17:23：唯一 lwplan.md 已落盘，root 已全文读取；进入独立 Review(LW)，技术 Gate-2 未通过前不进入实施。root 提出的窄口径复核：浏览器 fixture 由 coordinator 运行、UI 只编写及语法检查；最终截图使用实际 JPEG 格式。

2026-10-13 实施放行：Review(LW) 第1轮因浏览器验证归属、正式报告路径、截图格式返回 REVISE；作者窄修后第2轮 PASS。root 已独立读取最终报告、逐项检查十字段并核对被审计划 SHA256（1bf61859f912954a72994727e3ff8ba6919353ee00de28f749b00172074e599b），命令退出0。依用户自动化授权放行 backend S1–S3 / UI S4–S5 并行实施；root承接真实验收并汇总正式轮次报告。

2026-10-13 17:46 实测：root的独立8770预览读取6项目、12条Codex元数据、4工具发现（DSH未发现）；真实RSS三源共15条；Codex显式官方额度查询本次成功（7天窗口已用36%），己方app-server进程已回收。早期-32603保留为历史失败；页面/交互尚待验收。8770使用默认工作台库供真实预览，8771将使用隔离库做写入测试；不改原8766服务。

2026-10-13 验收进展：root独立237项单测、83项新工作台浏览器检查、1403项旧会话与17项小院检查均退出0。实际隔离任务已验证真实会话关联/状态更新/刷新持久化，人工用量已保存并重读；正式库保持空任务。四张最终JPEG和真实来源JSON已保存；18:08额度采样更新为七天窗口已用42%。旧用户数据哈希不变，隔离8771已停止，8770预览保留。Edge入口启动请求退出0，原生窗口外观未验收。完整失败记录见实施报告和work证据。

2026-10-13 r2复审：独立review发现项目摘要漏显具体阶段，局部修复后root与reviewer分别取得同一复现命令红→绿证据。新UI完整fixture101项通过；真实三尺寸复验与修订图已保存。review_notes_impl_r2_1结论USER_CONFIRMATION_NEEDED、业务结论留空；仅需确认8770的Edge窗口已显示工作台且无普通地址栏。用户答复后记录原文与观察方法，恢复原impl_review完成最终双结论；不能将沉默当成通过。本阶段不归档、不虚构Git提交，自动任务保留待验收状态。
