# WezTerm 会话联动：状态说明补齐 r3

feature_name：wezterm-session-link；impl_round：3；date：2026-10-04；lwplan_version：r2，SHA `405FDE8E546B5D516D507802832A64D23AC8854AA5D11A2EC64EC33766E7C9E0`。root 审读指出 S3 固定外部 mux 限制未在页面明写，明确授权最小文案补齐。

变更事实：path=`web/index.html`；change_type=修改；change_purpose=补可观察边界；key_changes=既有工作台说明增加“外部独立 mux 的归属与内部客户端未核验。”；related_tasks=S3/G1/N3。app、API、harness状态与其它文件不变。

goal_lock_check：固定外部mux只计数，不声称归属或内部客户端已证。anti_goal_touch_check：纯说明，不扩大动作或平台范围。authoring_ergonomics_notes：补一短句，沿用既有段落和样式，无新控件。contract_drift_reports：无，消费既有LW/S3约束。

本轮 actual impl-safe：owner=wezterm_link_ui_impl；6474c8使用`.venv/Scripts/python.exe -X utf8 -B -c`执行HTMLParser解析index、核五个DOM锚点唯一和新增句子为可见文本，2 checks/0 failure/exit0，完整输出已读。证据=`work/wezterm-session-link-ui-author-r3-verification.json`，记录时点、步骤和当前hash；缺输出时不称文案自证通过。最终index SHA `5CB76DDB32F5EFED7A59EBA890939CCB96232BB6F153E2C77D215D48CC3516C1`。r1/r2报告SHA与既有失败证据均原值，未覆盖。

coordinator_handoff_verifications：root的fixture-r2已在运行，启动时可能采集旧index SHA `0199611F58909146777E0A7B6867FFF853732530A4BFFDC75E7206444CB5E907`；本次纯说明造成采样版本差异，已回传root。owner=root，evidence_expected=最终r3 index的适当可见文案smoke与当前hash，不无故重跑整套；缺它只称HTML静态检查，不称最终页实测。原r2浏览器red-green、真实终端与fresh ReviewImpl仍由root承接。

未完成与风险：没有代验HTTP/browser；原首轮1249/1fail与根UTF8 collector异常按r2/r1保留。回滚信息：可直接回滚本轮单句，由root核确单句差异，不触并行增量或进程。

英文提交建议：`docs: clarify the observation limits of external WezTerm mux processes`。无新增跨功能事实。
