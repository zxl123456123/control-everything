# R13 清晰主界面与角色详情：实施报告 r2

`feature_name=subagent-garden-detail`  
`impl_round=2`  
`date=2026-10-06（Asia/Shanghai）`  
`lwplan_version=5bdd2f2dcc8175b9d52d9b41c74c91353d67fd494af5d63c83d8425c68ec7ca4`  
`input_review=review_notes_impl_r1_1.md / REVISE / IMPL_DEFECT / SHA ce0bd80cb258857fb31160427bdf464c062e1662e4b84fae3b0c9e674a5ff222`  

第 1 轮的完整文件清单、源边界、实页证据、失败记录见 [实施报告 r1](impl_report_r1.md)。本轮只修 ReviewImpl 的 F1/F2，没有改原生只读入口、网关、R12 账本或 Three.js。最终 R13 旧文件范围与哈希见 `work/r13-manifest-impl-r2.json`：冻结 8 文件中 7 个有意改变、`garden.py` 原样；目录仍无 Git。

## 逐文件变更事实

| path | change_type | change_purpose | key_changes | related_tasks |
|---|---|---|---|---|
| `web/garden.js` | modify | F1 名牌选中与轮询后的键盘焦点保留 | 每张首屏名牌写稳定 `data-garden-focus=roster:<actor>`，超出四位的入口写 `roster:more`，沿用现有 `render()` 焦点恢复，不另建焦点系统 | S2 / F1 |
| `web/garden.js` | modify | F2 从时间线定位完整收据 | 每个实际收据节点显示 UUID 尾八位短号；完整 UUID 仍在下方现有收据展开区 | S2 / F2 |
| `tests/verify_garden.cjs` | modify | 将审查缺口变成可复现回归 | Enter/Space/轮询/更多入口焦点、时间线短号对应完整展开收据 | S2 / F1/F2 |
| `docs/current/subagent-garden-detail/impl_report_r2.md` | add | 明确补实施、红绿与验证责任 | 保留 r1 红件、列新证据和回滚 | S2 / 审查闭环 |

## 目标锁、反目标与作者体验

`goal_lock_check=aligned pending independent review`：G13.1 的首屏名牌可通过键盘选中并继续从原名牌操作；节点短号可对应完整收据。F1/F2 的实质缺口已由受控红→绿证据覆盖。G13.2/G13.3 的同根公开摘录、自主巡游路径未改。`anti_goal_touch_check=clear pending independent review`：没有新增发言类型、跨根读取、实时进度猜测或动作控制；`GardenService` 原样。`authoring_ergonomics_notes=pass`：复用一套现有焦点键与原收据详情，无新配置/组件或抽象；短号并不替代完整 UUID。

## impl-safe 验证

| 实际步骤 | evidence | owner | 结果 | conclusion_if_missing |
|---|---|---|---|---|
| `node --check web/garden.js` 与 `node --check tests/verify_garden.cjs` | 本轮两个独立命令输出 | root 产品作者 | 两项 stdout/stderr 空、exit 均 0 | JS 语法未验，不能交页面复审 |
| 冻结清单逐文件 SHA-256 比对 | `work/r13-manifest-impl-r2.json` | root 产品作者 | 旧 8 文件中 7 意图变化、账本原样、无 Git | 补实施范围不明 |

## coordinator_handoff_verifications

| 非 impl-safe 项 | owner / 承接 | evidence_expected / 当前状态 | conclusion_if_missing |
|---|---|---|---|
| 受控 Edge 键盘和收据红→绿 | root coordinator 执行浏览器 fixture | 红 `work/garden-browser-2026-10-05T18-37-39-335Z.json`：新增 F1 断言 1 fail/exit1；绿 `work/garden-browser-2026-10-05T18-39-27-320Z.json`：17 checks/0/exit0，含 F2 | 焦点和短号不能称修复 |
| 最终同质量持续性能 | root coordinator 运行 `--perf48` 60 秒，并核 JSON 的最终 CSS/HTML SHA | `work/robot-cockpit-fixture-r1-2026-10-05T18-39-40-426Z.json`：60,002ms、48 角色、164.99 FPS、p95 6.6ms、慢帧0、draw83、8/0/exit0；CSS SHA `990d48bd…` 与最终文件相同 | 只能称旧 CSS 样本，不能称最终性能 |
| 真实 IAB 最新页面 | root coordinator 重载用户现有 tab，核首屏、键盘与短号，保留可见截图 | `work/r13-ui-live-r2.json`、`work/r13-live-main-r2.jpg`：4 角色、Enter 后名牌焦点保留、六个实际短收据号与六个节点；r1 三宽几何另见 `r13-ui-live.json` | 真实页面仍未核最终字节 |
| 旧观察完整浏览器回归 | root coordinator 使用不改的旧 harness | `work/robot-cockpit-fixture-r1-2026-10-05T18-34-12-903Z.json`：1403/0/exit0，是 R13 r1 后而 F1/F2 前样本；本补丁仅 `garden.js` | 无最终旧观察兼容证据 |
| fresh 独立 ReviewImpl | root coordinator 委派未参与产品写入的审查者，承接 r1 F1/F2 与最终字节 | 待执行 `review_notes_impl_r2_1.md` | 最终技术门不放行 |

## contract_drift_reports、失败、风险和回滚

`contract_drift_reports=none in product/shared contracts`：第 1 轮 ReviewImpl 指出的两处是实现未覆盖既定 LW，属于 IMPL_DEFECT；报告没有改 LW 或用户目标。审查还指出 48 角色旧性能样本的 CSS SHA 漂移，本轮在产品冻结后重测，不以旧样本代替。r2 闭环检查发现本报告最初引用 r1 审查尚未补入红证据时的 SHA；已对当前 r1 审查文件复算并更正 `input_review` 为 `ce0bd80c…`，仅修可追溯元数据。前轮 Readiness/LW 红件和 R13 实施早期测试失败均继续保存在 r1，不从历史中删除。焦点红例是 16 checks/1 failure/exit1；该失败是此轮明确追踪的原始症状，不省略。

`rollback=需人工介入`：可从 `work/r13-manifest-final-r2.json` 对照本轮前 `garden.js`/测试字节，局部撤销 F1/F2；整体 R13 回退仍按 r1 的 `work/r13-before/` 与真账本保留边界执行，不自动删除任何产物或重启服务。

**英文提交建议**：`fix(garden): preserve roster focus and link timeline receipts`。无 Git，不执行提交或推送。
