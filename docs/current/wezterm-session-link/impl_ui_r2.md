# WezTerm 会话联动：fixture 时序修订 r2

feature_name：wezterm-session-link；impl_round：2；date：2026-10-04（Asia/Shanghai）；lwplan_version：r2，SHA `405FDE8E546B5D516D507802832A64D23AC8854AA5D11A2EC64EC33766E7C9E0`。root 明确委派调查本轮真实 fixture red，并允许原五文件内最小修订；本轮只改 harness，不覆盖 r1 报告或原证据。

## 变更事实与原因

path：`tests/verify_robot_cockpit.cjs`；change_type：修改；change_purpose：准确测量独立工作台年龄；related_tasks：S4/G1/G3；key_changes：fixture performance clock跃迁6秒时执行产品注册的实际1000ms显示回调，再释放被hold的来源响应；保持“禁focus、年龄≥6秒”原断言，增加释放前/后DOM年龄与期间Workbench GET=0的证据。无产品代码变更。

root 首跑真实 HTTP/Edge fixture `work/robot-cockpit-fixture-r1-2026-10-04T03-45-15-399Z.json`（SHA `6B3F1F8178CA7F6C5E160B51A9996843F52E1B198476E004F18921FC00079ED3`）是 **1249 checks / 1 failure / exit1**，失败名 `late remote response does not reset earlier workbench evidence age`。原失败未记录“focus是否disabled”和“DOM年龄”的两个分量，不能凭它单独断言哪一项失败；完整紧凑请求trace显示迟到子页只有initial和manual两个Workbench GET，没有10秒poll覆盖。

本作者用实际app函数、mock DOM/mock fetch的纯本地VM复现该测量机制：acceptWorkbench后clock加6000ms，真实refreshSessions完成时focus_disabled=true、workbenchAge=6000ms，但工作台年龄DOM仍为原0.0；执行renderWorkbench才是6.0。原fixture仅钟跃迁＋120ms settle，不保证真实1秒显示tick已经执行。r2补调用原已注册1秒tick和分量证据，不减小阈值、不删断言、不改工作台接收时刻。

goal_lock_check：独立年龄和5秒撤资格保持；anti_goal_touch_check：只改合成测量，不改来源/reader/API/图形/进程权限。authoring_ergonomics_notes：用既有fixture intervalCallbacks入口与短details对象，不加生产测试接口。contract_drift_reports：无，本地复现与修订已回传root。

## 实际自证与失败留痕

owner=wezterm_link_ui_impl。已读verification skill；以下是impl-safe，缺证时只能未验证。

- 初次red宽trace读取607de9输出截断；63cb94定向紧凑读完整相关case/API trace与exit1，未凭截断作结论。
- VM实测32d421 exit0，完整输出已读，证明上述显示tick与动作资格分量。
- 最小修订后harness `node --check` cb643f exit0/空输出。
- final collector 3838cf执行app/harness两syntax和完整VM复现，三命令均exit0；所有argv、完整stdout/stderr、red SHA及五文件hash存 `work/wezterm-session-link-ui-author-r2-verification.json`。最终harness SHA `7C926FB2C907BD9BC2E88DD5427D7B0933F1133BA99749D20B99D3DAAFD0C326`；app仍 `CCC7F4DC5DE473190E2A1BA59A6F79FCA5694741108C864964C46224D5A7587B`，其余四产品文件与r1相同。

原red、r1报告和两份r1自证保留。此前root UTF8 collector失误与旧批限制仍见r1/既有正式报告，不由本轮绿syntax抹去。

coordinator_handoff_verifications：root实际重新执行完整HTTP/browser fixture，期望原断言与新增分量/无中途GET证据一起绿、全输出/exit保留；缺它不能声称浏览器red-green闭合。motion生命周期判定、真实GUI/UUIDfocus/owned清理与fresh ReviewImpl继续由root承接，作者没有执行HTTP/SSH/GUI/browser或真实动作。

未完成与风险：原浏览器失败分量无法回溯，只能以修订后新增证据确认；本地VM不能替代实际Edge时序。回滚信息：可直接回滚本轮harness约10行增量，由root只核本轮diff，保留并行motion及r1代码，不触其它进程。

英文提交建议：`test: render elapsed workbench evidence before checking delayed responses`。无新增跨功能事实。
