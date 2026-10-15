# R6 采样稳定性事实与实施决策输入

source_type: root_live_evidence_and_implementation_decision
created_at: 2026-10-05 Asia/Shanghai
created_from: 用户“直到能力稳定”及 root 原生并发诊断
related_stage: R5 定位独立实施后，R6 LWPlan / Review(LW)
supersedes: 无；不修改 R5 冻结定位合同
status: researched_not_planned

## 用户原话

> 然后就是能力方面要稳定，你可以自己去测试，比如新起一个codex对话看看是否真的机器人出来了。然后wezterm新起一个，看看是不是也能监测到。直到能力稳定

## 实际失败及归因边界

root `work/live-session-workbench-census-r5-1.json` 串行15/15成功；`work/live-session-workbench-census-r5-concurrent.json` 并发15次有5次完整helper失败、exit1，上层显示unknown。原生短命查询重叠诊断 `work/live-session-native-race-r5-1.json` 100次有11次失败；改进即时错误取证的 `work/live-session-native-race-r5-2.json` 100次有15次失败、exit1。诊断只包装原代码，产品字节未变。

第二报告7次出生判据明确捕获 creation_ticks > snapshot_ticks，两侧完整数值已保存；6次OpenProcess空handle、即时Win错误87；1次QueryFullProcessImageNameW失败、即时错误5；1次存活等待判据失败，共15次。从错误码本身推定退出仍属于推断。原时间门槛在快照函数调用之前取时，捕捉到了窗内出生的短CLI；不放宽该门槛或PID/父/完整映像/argv/生命周期/缓冲/资源关闭要求。root初稿误把7次记8次，逐条计数后更正；失败原JSON不改。

独立研究为 `work/research_native_census_r5_20261005.md`，其§G U1两侧ticks缺证被第二报告补足，其余退出严格因果仍未完整证明。Microsoft Toolhelp 官方说明 snapshot 与逐行OpenProcess生命周期不同；module ERROR_BAD_LENGTH建议不作为process重采样的官方背书。采用重新获取完整当前清单的原则，拒绝官方展示示例跳过不可读行的做法。

IAB在02:28:31还见过 workbench_timeout 与 terminal_unavailable，后续单次CLI list-clients 561ms/exit0，HTTP正关联1139ms/exit0；有限重采样不应被宣称修复所有系统过载、网络或CLI超时。

## Root技术决策（只供正式方案吸收，未放行产品）

在R5定位独立变更后，规划第二个独立逻辑修复：native helper主入口对 api_failed / invalid_identity 至多共3次完整census，共享原入口最早5秒deadline，失败清单整份丢弃，每次全部检查重新执行；只输出最后完整成功清单。保留原snapshot时间门槛，不略行、不合并清单、不缓存旧成功、不变预算。其它错误以及任何 close_failed note立即失败；连续3次失败仍unknown、stdout空、单一原消毒stderr。

这不是猜测3次就能永远稳定。作者验证有界次数、同deadline、失败全丢、nonretryable/close/deadline拒绝和全部既有guard；root重跑原并发和原生helper实际场景，再以数据判断收益和仍失败条件。若持续正常面板采样仍失败，继续同一权威LW最小修订及fresh Gate，不为绿测试削弱检测。

候选产品只 `session_panel/native_processes.py` 与直接 `tests/test_native_processes.py`，不改Workbench/source/service/terminal/UI/CSP/D配置/二进制/解释器或清理协议。保持一轮一个独立逻辑修复、准确before/final diff与全部旧失败。作者仍仅本地mock/静态，真实动作root，fresh reviewer独立最终复核。
