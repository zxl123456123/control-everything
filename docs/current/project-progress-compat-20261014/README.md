# 通用项目管理与开发进度兼容

日期：2026-10-14（Asia/Shanghai）；受众：共享。
当前阶段：LWPlan；状态：进行中。最后更新：2026-10-15。

## 需求与授权

用户先问：“下一步呢，另外还有这个用来识别项目的方式是不是硬编码的，如果其他人也用了我这个，工作流用的不是我的工作流，硬编码是不是无效，好好分析这个怎么解决”。

用户随后明确授权：“这种如何统一管理确实才是最难的，以及他后面的开发进度。这个你来想一个编码形式或者通过什么架构来完成这个兼容性，然后把方案改了开始实施完成”。

本次连续执行方案修订、Readiness、低层计划、独立评审、编码、验证和实施审查，不停在建议或计划。普通架构/编码选择由 agent 承接，不重复询问阶段授权；技术 Gate 与独立验证保留。

## 与既有工作的关系

- 沿用 Python、SQLite、原生 HTML/CSS/JS、单机 loopback 信任边界。本 feature 是项目与进度管理的独立增量，不夹带 FastAPI、React 或 Orca 实机接入。
- 旧 M0–M2、P1-A 与 UI 审查对象保留。既有架构中“项目仅聚合旧 JSON”只作为已交付旧阶段边界；本次新授权允许必要的项目存储与配置演进，须非破坏地保留旧记录及稳定关联。
- 新的项目/进度兼容方案以本目录 clarifications、hlplan、lwplan 为当前入口；旧冻结架构/计划不静默重写，原目录状态页会链接本增量。
- 无 Git，不初始化、不伪造提交/推送。74 文件原始快照在 work/project-progress-compat-20261014/before，清单 before-manifest.json；未知改动不恢复/覆盖。
- Orca U1–U5、旧 M3 费用暂停、像素延期继续有效。不得派发模型任务、配对账号、读私人会话正文或接管已有服务。

## 里程碑

- [x] 定向补充研究与真实现状
- [x] 修订架构和实现基线
- [x] Readiness
- [ ] 唯一低层计划 / Gate-1 / 独立 Gate-2
- [ ] 项目与进度兼容代码、可操作 UI
- [ ] 独立验证、浏览器证据和 fresh Review(Impl)

正式产物按阶段落盘：research.md、hlplan.md、review_notes_readiness_*.md、lwplan.md、review_notes_lwplan_*.md、impl_report_r*.md、review_notes_impl_r*_*.md。原始补充上下文见 source_materials/initial_request_20261014.md。

本轮读取 execplan 后发现其初始化要求 Git；本项目禁止初始化 Git，故不启用该技能，使用上述正式流程文档和文件快照持续记录状态。

研究已通过真实源码和临时 fixture 确认空登记拒绝、PASS 线索误过滤、人工孤立 ID 记录重写丢失、旧路由绕过来源注入及启动 acquire execution owner 的边界。研究期间 Windows rg 字面通配路径退出1与读取异常已记录在 research.md，未读取真实来源库或私人正文。官方参考与采用范围见 research-industry.md；上述问题仍待本轮方案/实施修复，不能把研究复现当修复验证。

Readiness 第1轮 PASS，仅放行 LW；root 已完整读取报告并独立复跑 readiness-check.py、报告哈希/放行字段检查，均退出0，74原文件未变化。补充页面研究 research_profile_ui.md 将旧进度未知值、空启动器/空编辑舞台和孤立任务表单的实际锚点交给 LW；当前没有产品、真实数据迁移或运行准入通过声明。

2026-10-15 恢复：live agent 仅 root，唯一 lwplan.md 尚未产生；保留既有状态，从 LW 恢复。用户新增模型分工原文见 source_materials/feedback_20261015_models.md：后续规划/方案评审用 gpt-6-astra high，代码实施/代码验证审查用 gpt-6.1-sol high，不追改历史模型记录。
