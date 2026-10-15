# 既有工作台联动恢复上下文

source_type: resume_context
created_at: 2026-10-04
created_from: 用户“继续优化完整”与本轮实际恢复采样
related_stage: Impl / fresh Review(LW)
supersedes: null
status: active

2026-10-04；最新用户原文“继续优化完整”。继续既有授权“自动实施代码即可现在”及“继续”；不重复询问当前固定范围的实施许可。

本批 WezTerm 仍在 Impl；现行冻结基线 CBABB 与 LW r2/r3.1 原字节保留。当前 `lwplan_runtime_delta_r4.md` 已含作者 Gate1 PASS/121项/0失败的历史自证，fresh Gate2 PENDING。旧协作 agents 已不在运行，不冒充原 reviewer；root 本轮完整读 r4（a613ad），将独立重新核 Gate1，再让 fresh reviewer 审 r4 后实施。

唯一 r4 变更：workbench.py 精确识别已存在的 named-only GUI/attach 组合（固定 exe/config/cwd/session，每一 argv、直接 parent、birth、前后 server/mux/client 身份都保持守卫）；更新已完整比对的新 Lua 唯一 pin 8E045225A327BC658A59791609CCF2086A7CC5BDEA3B366C4DBB65F9966E7CC4；test_workbench.py 的行为正负例。不改 native/helper/terminal/gateway/UI/reader/MCP/NEW_GUI/owned 清理函数。不执行该 named argv；NEW_GUI 启动仍固定 unnamed；已有 GUI 无本请求所有权，不能关闭它来凑验收。

root Lua 两侧完整 diff 原证据 work/wezterm-session-link-root-lua-current-r4.json SHA158EC33D759F8FC03FF9AC3F0BE8475F2E7EBF944D46945B454E5E7D2740A732，old backup exact5F903，current exact8E045，只字体/背景/色彩外观。两个独立 reviewer 前轮完整读比较也一致，不能代本轮 fresh LW。D 配置不改。native 当前 SHA115D8969B29861CC663D4C2BE5EC1944089DDD891DC9F1BF4；workbench 当前 SHA B37BC902F2CBF3DEC72C7BA1C60E8A52127E428C4A20409F73CB64FC85C5441D。

历史 root 实际 native 单次109–125ms，旧 profile 导致未知；r31运行 exit1；r32验证受控 helper时因 OS conhost 使“no any child”断言 exit1；r33仅受控实际 base/shellFalse/CREATE_NO_WINDOW/sleep20/timeout6，6031ms 原句柄退出、精确晚生 System32 conhost 自动消失/afterCIM[]，7项/0失败/exit0。r33路径 work/wezterm-session-link-root-native-helper-r33.json SHA1B395366CD417994FE994C75403272A2B65A18D348F822D4465D7F1BF8294D1E。不能代真实 GUI 回收或自然采集卡住，不允许杀 conhost/一般树。

旧全量104 tests两次 exit1，各一例 Windows Win10053：CSRF无效请求、4097字节拒绝413；定向CSRF单例 exit0不能抵消全量失败。完整 reports work/wezterm-session-link-root-tests-r31.json / -retry1.json 保留。不顺手改HTTP来隐藏失败；本轮 r4 产品变更后 root 新完整验证，报告实际结果。

新增纯展示交付已独立 PASS/PASS，见 robot-motion-delivery.md / robot-motion-review.md；当前 perspective42度、连续装饰动效、拖动/滚轮/阻尼/最近等价角reset、暂停/hidden/reduced motion。前轮当前字节完整1256 checks/33 cases/0fail，真实 IAB/实景；web/robot3d.js SHA DF4EC428FF0898B770E8A73711B92E37C567A1864EA2764D0BC19DCCF44BBD33，cockpit SHA FA0D438D34FDE6BACE2B9745C5CFBC321B51710EB2F3655CF2D10C6C56149B8A。旧 robot feature BLOCKED/父Q6独立待验不关闭。

本轮 fresh runtime a80d36/exit1：8766 无 listener，旧 root gateway PID19568/231744 均无 CIM 行，health拒绝连接；此前身份/运行事实已过期，不执行旧reload_r2.ps1杀任何PID。当前 Lua 与3D/source SHA仍如上。root将实际重新采样Zellij/GUI/server/SSH；本轮产品验证后仅在端口确实free时隐藏启动新root-owned gateway，记录完整新PID/parent/image/argv/ctime与health。没有他人终止归属的推断，没有root停止本次gateway的动作。

实现者仅两产品文件/本地mock测试/独立patch+manifest+report；真实 HTTP/SSH/GUI/focus 由 root；reviewer只读不递归委派不执行真动作。若已有窗口继续存在，真实新自然disconnected launch及post-launch未知的原handle清理仍不能无损触发；保留缺证、formal Review(Impl)可BLOCKED且业务留空，分开报告已经实际验证的链路，不伪造断连、不关闭用户窗口或重写旧冻结文件。

当前目录没有 Git repository；不 init/commit/push。root 持续中文进度沟通，完成前读取验证技能并本轮实跑命令、完整读退出码和失败。原 evidence不可覆盖；新证据用新路径。最终需要实际页面截图及英文提交建议，不宣称全部原大目标已经验收。
