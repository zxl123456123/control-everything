# R5 真实会话验收恢复材料

source_type: user_request_and_live_evidence
created_at: 2026-10-05 Asia/Shanghai
created_from: 当前 Codex 主会话用户消息及 root 实际命令
related_stage: LWPlan / Review(LW) / Impl / Review(Impl)
supersedes: 无；仅覆盖本轮测试授权与真实定位缺陷
status: active

## 用户原话与持续授权

> 然后就是能力方面要稳定，你可以自己去测试，比如新起一个codex对话看看是否真的机器人出来了。然后wezterm新起一个，看看是不是也能监测到。直到能力稳定

此前用户已明确：

> a继续，怎么还有方案冲突，自动实施代码即可现在

本轮明确允许 root 新建标记测试 Codex 对话、单个 WezTerm GUI 与远端 Claude 测试会话、必要定位动作及测试会话退出；不重复询问普通实施授权。此许可只作为真实验收对旧 N1 的有限覆盖，不能成为产品自动恢复 EXITED、force-run-commands、旧 launcher、任意输入能力或关闭用户其它窗口的许可。原 r4 BLOCKED 不被本材料改成 PASS；旧缺少真实 owned 回收仍单独保留。

## 已执行真实事实

- 新 Codex `01a10809-706b-78e3-b279-c3611cf75be0` 已由应用创建，最终回复指定测试 marker。身份索引/API/UI/真实 WebGL mesh 均出现该 UUID。Codex 仍仅身份元数据，未有实时正文、活动/任务证据。
- root 单独 plain attach `workbench-v4` 创建一个 GUI，旧恢复命令保持 held；仅恢复 dev SSH，实际安全模式 Claude 新 UUID `c930de69-69d3-4177-9904-ae22596694ca`。只发送无工具、无文件、无委派测试 prompt；实际回复 marker，注册/PID/boot/startticks/cwd/dev 环境/transcript 确认，映射 `terminal_3`。
- 三次真实 `/focus` 命令返回 0，但后验 `list-clients` 仍 `terminal_8`，产品诚实返回 `focus_sent_unverified`。`work/live-session-capabilities-r5-1.json` 为 exit1 / 23项6失败，不能删或覆盖。
- `go-to-tab-by-id 1` 能将真实 client 从 Music/8 切到 Work-for-Linux/main/2；随后 `focus-pane-id terminal_3` 和 `focus-pane-id 3` 均 exit0 但真实 client 仍2。添加 tab 切换不能单独修好。
- 新实际 `focus-next-pane` exit0，从真实 client1 / terminal2 切到 terminal3，独立 fresh list-clients 确认，见 `work/live-session-focus-next-r5.json`。
- 官方 v0.45.1 源码：CLI client 默认无真实 client_id；未收真实键盘时 last_active_client=None，按 pane-ID 的动作会写临时 client 的焦点；FocusNextPane 路径按 active_tab fallback 到唯一连接的真实 client。研究资料位于 `work/zellij-focus-research-r5-20261005/`。公开 CLI 无显式 client-id 参数。
- live browser 前两轮各一次 workbench unknown，第三次严格采样 5/5 正关联；原因尚未确认，不以第三轮绿覆盖间歇失败。机器人两 UUID、同页位置、原生点选、测试正文成功；不是持续关联保证。

## 本轮实施决策与约束

先规划最小定位补丁：保留原 exact UUID/process instance/pane/slot、唯一关联、fresh integrity、共享动作锁、5秒预算与后验；`focus-pane-id` 未达到真实目标时，使用官方 tab-ID + 有界 focus-next-pane，每步实际 list-clients，只允许当前严格唯一目标 tab 可选择 pane 集合内的已知真实焦点，达到 exact pane-ID 才成功。不得把 exit0、切到目标 tab 或近似位置认作成功。校验具体 pane/tab/selectable 属性以实际安装版本清单为准；不放宽已坏/多客户端、关联变化、年龄、latch或预算。

author 只本地代码/测试；所有真实动作 root 执行。产品变更仅定位链与直接行为测试；关联波动先取证，原因确认后若需要产品变更必须在同一权威 LW 中补充并重新 Gate。不改 D: 配置、工具二进制或安全来源/正文/图形/HTTP合同，不借此重构。
