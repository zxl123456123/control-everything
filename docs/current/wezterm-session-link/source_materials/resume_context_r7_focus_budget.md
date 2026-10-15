# R7 精确定位：真实超龄失败的最小收敛

source_type: resume_context
created_at: 2026-10-05
created_from: 用户真实会话稳定性测试授权与root的R6后真实phase
related_stage: LWPlan R7
supersedes: 无；补充R5/R6材料，保留原文
status: 当前R7输入；不是第二份权威方案

2026-10-05，root 记录。继续用户“新起一个codex对话…wezterm新起一个…直到能力稳定”及“自动实施代码即可现在”的授权。本轮新范围是稳定精确定位和自己的测试会话生命周期；无需重问同一阶段许可。

R6 native 两文件的完整重采样修复已经实现，root 当前本地144项、100份完整主入口采样、100份真实客户端响应、15份原并发关联和原生Edge22项为绿，退出码均0。这是当前窗口的证据；不等于全部功能或永久稳定。准确文件：`work/live-session-root-tests-r6-1.json`、`work/live-session-native-main-stress-r6-after-1.json`、`work/live-session-native-main-stress-r6-audit-1.json`、`work/live-session-workbench-census-r6-concurrent-1.json`、`work/live-session-robot-browser-r5-2026-10-04T19-38-41-882Z.json`。root独立R6准确差异/范围校验 `work/wezterm-census-root-scope-r6-result.json` 全40项成立。

R6后真实定位 `work/live-session-focus-timing-r6-after-1.json` exit1：请求6407ms，完整initial/pre约641ms，中间post657ms、final719ms，force1594ms。exact-ID exit0未改变真实client；已有tab-ID1确实选到terminal_3。最终唯一真实client与完整关联/slot/topology成立，但同份远端证据累计age5766ms>5000，产品诚实返回focus_sent_unverified。动作窗口3766ms仍在原5000ms内。此样本没有执行next，所以新的实机测试必须另外从目标tab内非目标pane出发，强制覆盖next。

采用固定官方Zellij0.45.1已读源码的tab-ID/next路线。仅当前 `_focus_candidates` 完全接受的strict tiled目标直接复用 `_focus_next`，每步真实唯一client-ID/pane、完整pane候选fingerprint/version、共享deadline和累计age不变；一次完整最终Workbench.observe及fresh list_panes仍必需，严格验证全部原关联键与目标。未接受布局保留原exact-ID路线与完整最终核验，不遍历。删除已知no-op exact和重复中间完整post/inventory预计省本样本1125ms，但仅为模型，必须实测；不拿模型代正例。

产品范围严格仅 `session_panel/terminal.py` 与 `tests/test_focus.py`。不改Service/source/Workbench/native/UI/CSP、锁/latch、版本/完整性pins、动作5000ms、远端累计age5000ms或解释器参数。Python -S实机启动诊断未见可靠收益，拒绝并入。root加载修改后只重载当前有准确归属且无活动动作/cleanup latch的自有网关；记录内存索引变化，不借重启清失败状态。

作者只本地mock/static准确before、成本症状先red、必要旧轨迹调整和green；root独立当前源码回归及真实HTTP/UI跨tab/非目标pane重复定位、固定进程/client身份与精确UUID机器人/正文及仅自己的退出重建；fresh reviewer独立最终差异、全部红绿与缺证。只有完整终验所有预算成立计正式focus正例。出现busy/unknown/空响应/非0/late全部保留，继续最小必要修复，不伪造稳定。

正式唯一LW在完整90756字节R5/R6前缀后追加§10，先基线§14、Gate1、fresh Gate2/root明确放行再改产品。旧父Q6、真实owned失败回收、Codex正文/活动和48机器人低帧率仍独立待证；不因本次focus/采样窗口而关闭。历史采样红、loaded-first10/26、R5 no-op、R6后真实focus exit1、两Pydantic警告与12角色并行负载p95=20ms保全。
