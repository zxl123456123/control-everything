# 收尾交接

日期：2026-10-13。状态：用户要求暂停，原因是额度消耗较多。

## 现有成果

- M0–M2 基础工作台已有总览、项目任务、Agents、用量额度、AI 资讯及响应式页面；用户已确认 Edge 独立窗口正常显示。原阶段验收见 ../agent-workbench-20261013/completion-audit.md。
- 架构沿用 Python 本机服务、SQLite、同源 Web 与 Edge 应用窗口，参考用户确认的 stablyai/orca 任务和能力模型。架构方案见 ../agent-workbench-20261013/hlplan.md。
- M3 首个 Codex 执行模块已写入代码：运行记录、独占进程、审批、取消、请求幂等、重启恢复及执行页面。代码状态与验收状态分开；目前未宣布该模块可发布。
- 未扩展其他 Provider 执行、原生桌面安装包或手机远程访问。

## 本次收尾实际验证

- root 重新执行 protocol-http-integration.py --isolated：51 项检查全部通过，退出 0，stderr 为空。使用真实 HTTP / SQLite / Windows 所属进程，Provider 是固定模拟服务，不是实际模型。
- 原 r1 曾出现客户端断开后重复写 socket 的异常；修复后上述 r2 原场景通过。原失败日志保留。
- capture-user-data.py after-integration：退出 0，旧 JSON 与 tasks / manual_records 表摘要和实施前一致。
- capture-diff.py：退出 0，共 17 个新增或修改的源码/测试文件；work/agent-execution-20261013/changes.json 和 final.diff 已保存。
- 本次未重跑全部回归，未执行真实 Codex turn，未做独立 ReviewImpl。之前的 Windows 25 项与浏览器 76 项等证据保留于工作目录和分项报告，不当作本次新验证。
- 已知历史失败还包括队列故障优先级红测、首次浏览器 fixture 的不可信 origin / 焦点操作问题；原日志及修复记录保留于分项报告，不删改失败证据。

## 预览与恢复边界

- 保留旧基础预览 http://127.0.0.1:8770/workspace 。其进程加载的是旧后端路由，不能用来验收新增执行模块；静态文件来自当前目录。未重启或接管原 8766 服务。
- 基础页面真实截图：work/agent-workbench-20261013/workspace-desktop.jpg、workspace-mobile-390.jpg。它们记录 M0–M2，不代表新增执行能力已运行。
- 新执行页面的 ui-execution-fixture-* 图片来自模拟数据，需保持此标注。
- 目录无 .git，未初始化仓库、提交或推送。

## 恢复时只做剩余收口

1. 先读本文件、README、impl_report_r1.md、changes.json，核对源码摘要；不重新开展已完成的架构调研。
2. 执行最终回归及独立实施审查；按审查结果修必要问题。
3. 在隔离目录进行最小真实 Codex 完成 / 审批 / 取消验证，明确这一步会消耗模型额度。既有 real-smoke-intent.md 只是准备记录，尚未执行。
4. 新后端配合真实浏览器验收后，再更新预览入口并截图。不能用模拟服务和截图代替真实验收。

后续恢复须以用户新指令为准；不设置自动唤醒，不继续付费推理试跑。

待验证后的英文提交建议：`feat(workspace): add managed Codex execution and approval flow`。
