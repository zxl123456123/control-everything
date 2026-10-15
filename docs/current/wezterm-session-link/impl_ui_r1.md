# WezTerm 会话联动：前端与 fixture 实施 r1

feature_name：wezterm-session-link；impl_round：1；date：2026-10-04（Asia/Shanghai）。lwplan_version：r2，SHA `405FDE8E546B5D516D507802832A64D23AC8854AA5D11A2EC64EC33766E7C9E0`。root 回传 Gate2 正式报告 SHA `C4B14141B3C4836FED73DB5ED2CF76094D4AC8B9447D0EED673A8DEDA27A9749`，root 实际 61 checks / 0 failures / exit0 后放行；用户自动实施与“继续”已授权。本作者不代替 root Gate 或 runtime 验收。

## 变更事实

| path / change_type | change_purpose / key_changes | related_tasks |
| --- | --- | --- |
| web/app.js / 修改 | 工作台字段严格校验、独立接收时刻与5/30秒年龄；显式空body/CSRF connect；GET与两动作资格互锁；cleanup故障锁；有效unknown/exited/missing是本次事实，网络/shape失败保留上次。原UUID选择、消息页与来源分类保持原链路。 | S3，G1/G2/G3 |
| web/index.html / 修改 | 紧凑状态区五个DOM锚点、连接/只读刷新按钮、GUI可见性和watcher范围说明；顶栏明确来源观察。 | S3，G1/G2 |
| web/style.css / 修改 | 状态区横跨现有网格，沿用原facts/窄屏布局。 | S3，G1 |
| README.md / 修改 | 同步现有工作台连接、独立证据、终端定位与回收故障用法。 | S3，G1/G2/G3 |
| tests/verify_robot_cockpit.cjs / 修改 | 默认提供明确合法Workbench fixture；三新场景覆盖连接/重复race、坏字段/enum/未知mux/多client/EXITED/missing/5与30秒/404、pending互锁/迟到年龄/cleanup latch；保留原29场景。 | S4，全G/N |

同一 harness 另消费 root 新授权的“3D动图与视角丝滑”有界增量，仅测试兼容：真实 Perspective 捕获、实际动画暂停按钮后逐个投影当前mesh、一个真实帧/拖动/缩放/hidden/text/reduced-motion生命周期场景。记录本机 median/p95 帧间隔，不保证FPS。本作者不修改 robot3d.js、cockpit.js 或 vendor；这部分产品代码归独立 motion 作者，WezTerm N2 仍保持。

## 对齐与作者体验

goal_lock_check：G1分开来源与终端状态；G2仅显式固定路径POST、后端已连race明确未重复创建；G3原UUID资格再加唯一终端关联与年龄，动作结果不读正文。anti_goal_touch_check：不添加命令/路径/pane输入、MCP、来源、reader、CSP、存储或图形产品修改，无GUI/HTTP/SSH操作。authoring_ergonomics_notes：沿用原render/textContent函数、少量状态字段与短映射，不加框架；`unmanaged_mux_count=null`显示未知，不折成0。root指正有效unknown展示口径后直接修实现与对应fixture，不改权威基线。

## 本轮自证与失败留痕

已读 safe-code-changes 和 verification-before-completion。全部自证是 impl-safe，责任 owner=wezterm_link_ui_impl；缺输出时只能“未验证”，不能称业务通过。

- `C:/nvm4w/nodejs/node.exe --check web/app.js` 与 `--check tests/verify_robot_cockpit.cjs`：028cf4，exit0，完整stdout/stderr为空。
- Python bytes collector执行同两命令＋15项静态DOM/固定API/时钟/枚举/零值/待验边界检查：a3031c，exit0，0 failures，完整输出已读并保存 `work/wezterm-session-link-ui-author-verification.json`，SHA `E65E2ABA7ED221B270378DF1B936ACE37A45DBAC6B1708721FB6FB779E89B1E5`。
- 自读后调整两个fixture断言：用真实scene人口而非view→view数量；迟到年龄取DOM实际数值而非固定字符串。harness syntax 5bf38d exit0。随后独立final bytes collector 09e9a6重跑两项syntax，exit0/空输出，保存 `work/wezterm-session-link-ui-author-verification-retry1.json`，保留首记录不覆盖；最终5文件hash见此JSON。最终harness SHA `13A744DA20628854D9769780B76E060CBABF5D4697D9658DF71F909D75C4CF8E`。

本作者无失败的syntax命令。初次聚合预读工具外层输出截断，已用有界分段完整补读；不把截断当完整证据。已知 root 早期UTF8 text collector出现UnicodeDecodeError、child exit1与stderr丢失，根因未诊断；后续bytes基线55项成功不擦去该失败。其他root历史失误/正式Gate报告沿其原产物保留，不在本报告重新下结论。contract_drift_reports：无新增漂移；仅上述root授权口径修正与独立motion测试消费已回传root。

## coordinator_handoff_verifications

| 待验 / 移交原因 | evidence_expected / owner | conclusion_if_missing |
| --- | --- | --- |
| 完整Python套、临时loopback HTTP与实际Edge fixture：超过作者静态/mock边界 | root实跑 `tests/verify_robot_cockpit.cjs --fixture`，全输出/exit、33个场景与网络/清理证据 | 仅语法/静态通过，不称API/UI验收 |
| 真实固定GUI连接、重复连接、原server/SSH/pane不变、UUIDfocus、controlled故障owned清理 | root live JSON，metadata-only与Windows句柄退出证据 | 不称工作台已真正连接或定位成功 |
| motion实际画面、默认帧、暂停、俯仰/横向/缩放、hidden/text/reduced-motion与360px | root真实fixture/截图及本机帧间隔数据；motion作者提供独立静态输入 | 不以代码存在或帧参数声称丝滑/连续渲染 |
| 最终允许范围diff/hash、fresh ReviewImpl | root与fresh reviewer正式报告 | 不关闭旧机器人BLOCKED或父Q6 |

未完成与风险：上述runtime与fresh ReviewImpl均待root承接；fixture合成成功也不能证明真实GUI可见性、client-PID握手或CLI原子绑定。浏览器捕获仅合成正文，不能保存真实正文或CSRF。回滚信息：可直接回滚本作者5文件的本批差异，由root核对before与并行motion/harness归属后执行；不会关闭已连接GUI/server/SSH。无Git仓库，不执行commit/push。

英文提交建议：`feat: add explicit WezTerm connection and evidence status to the session panel`。

无新增跨功能事实。
