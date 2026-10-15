# 子agent协作小院

**原始需求**：星露谷感觉的舒适工作空间；每个机器人真正注册可操作能力，干完活后出现完成摘要云朵；第一条协作为同主session子agent的产物交接与复核，各主session默认隔离。

**创建时间**：2026-10-05（Asia/Shanghai）
**当前阶段**：ReviewImpl r2 已 PASS；root 最终核验/交付。
**状态**：Gate1-r2 25/0、fresh ReviewLW PASS、root Gate2 51/0、第二轮独立 ReviewImpl 协议 PASS / 业务 PASS。192 项 Python、1403 项旧浏览器、12 项新浏览器及 48 角色同画质连续 60 秒受控样本均已验证；真实子agent交接/复核/验收与 8766 页面已留证。首次 Readiness/LW/ReviewImpl 的红项保留在对应报告。

这是新写入能力与UI增量的独立正式feature，沿用现有coordinator合同；不改R11已交付的方案、审查、产物与历史失败。当前目录无Git，保留此前不初始化Git的范围；不采用要求git init的可选ExecPlan技能，持久恢复由本目录的README、clarifications、lwplan和阶段证据承担。

## 里程碑

- [x] 当前UI与源码事实调研
- [x] 官方事件/工具资料核查
- [x] 用户确认完成摘要、产物交接/复核与session隔离
- [x] 原生父子Thread UUID、单个子agent环境身份与只读source字段核查
- [x] Readiness与唯一低层规划
- [x] ReviewLW / root Gate2
- [x] 真实能力入口、状态记录与隔离
- [x] 舒适小院布局、完成摘要云朵与能力操作
- [x] 同主session真实子agent交接/复核闭环与fresh ReviewImpl

## 恢复输入

- [原话与确认](E:/project-funny/mianban-develop/docs/current/subagent-garden/source_materials/feedback_r12_cozy_subagents.md)
- [完整实现基线](E:/project-funny/mianban-develop/docs/current/subagent-garden/clarifications.md)
- work/r12-ui-comfort-facts.md：当前窄屏约4130px、重复说明/滚动/字号事实。
- work/r12-garden-capability-research.md：已有三只读MCP，缺新事件/注册操作，source/parent缺口。
- work/r12-garden-event-research.md：已打开官方文档、回合与任务完成区别、MCP与hooks边界。
- work/r12-current-child-bindings.json、work/r12-child-source-probe.json：当前父子元数据，不保存对话正文。
- [R11历史有限交付](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/delivery_scene_mapping_r11.md)：旧性能/注册/终端/body/活动限制保持。

## 角色与执行

当前root为唯一产品作者和coordinator承接者，分开记录本地自证与实机/浏览器/MCP/原生子agent验收。研究/规划/审查独立委派，不递归，最终审查者不参与实现。用户既有普通自动实施偏好保持，技术Gate不豁免；涉及跨主聊天或新命令执行的扩展不在本轮。

无新增跨功能事实。普通布局草稿未发布；本轮新风格与真实协作由当前验证和独立审查放行。

本轮交付证据见 [实施报告 r2](E:/project-funny/mianban-develop/docs/current/subagent-garden/impl_report_r2.md) 与 [独立实施审查 r2](E:/project-funny/mianban-develop/docs/current/subagent-garden/review_notes_impl_r2_1.md)。当前桌面自动发现/热加载新 MCP、IAB 前台帧率及剪贴板读回尚未证实；已验证的是本机固定工具的实际 stdio 调用、真实不同子agent的收据链、会话根域与当前页面展示。
