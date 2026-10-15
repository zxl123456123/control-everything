# R13 Review(Impl) r2 独立闭环审查

`review_target=impl`  
`reviewed_impl=impl_report_r2.md`  
`reviewed_impl_sha256=04243f21a8da8d44f4eba77a738ea3ee3891e5477a4c35a90baeafacc7afc0ab`  
`reviewed_product_manifest=work/r13-manifest-impl-r2.json`  
`reviewed_manifest_sha256=7cd6d67f1a5d143ac74ed85c829990a7b4f01ea9af9b104fe795ec5b11fae7ff`  
`protocol_verdict=PASS`  
`business_verdict=PASS`

## 结论

第 1 轮 Review(Impl) 的 F1（首屏名牌键盘选中后失焦）、F2（时间线缺短收据 ID）与最终 CSS 性能样本的 SHA 缺口已在当前字节闭合。r2 只在 `web/garden.js` 增加稳定焦点键与节点短号、在浏览器 fixture 增加相应断言；根域只读发言、R12 账本、旧远端消息/终端控制和 Three.js 场景源码未改。结合 r1 对全链的审查和本轮最终字节验证，G13.1–G13.3 的既定目标、N13.1–N13.3 反目标与作者体验门均有足够证据支持本轮 `PASS / PASS`。没有发现需退回方案或问题定义的新缺陷。

## r1 红件逐项闭合

| r1 项 | 当前源码与实际行为 | 证据 | 判断 |
|---|---|---|---|
| F1 首屏名牌失焦 | `web/garden.js:167` 为每个首屏名牌赋 `data-garden-focus=roster:<actor UUID>`；`:200` 为“还有 N 位伙伴”入口赋 `roster:more`，沿用既有 `render()` 在重建 DOM 后恢复焦点的逻辑。键盘 Enter/Space、轮询、超四人入口均有断言。 | 红 `work/garden-browser-2026-10-05T18-37-39-335Z.json` 为焦点用例 1 failure/exit1；绿 `work/garden-browser-2026-10-05T18-39-27-320Z.json` 为 17 checks/0/exit0。真实 IAB `work/r13-ui-live-r2.json` 记录 Enter 后仍在名牌。 | 已闭合 |
| F2 时间线短 ID | `web/garden.js:227–240` 的每个真实收据节点添 `收据 #<UUID 尾八位>`，上方提示它对应下方可展开的完整收据；不改业务阶段或完整 UUID。 | `tests/verify_garden.cjs:87–90` 验短号与完整收据 ID 对应；17/0 浏览器绿证据。真实 IAB r2 记录六个工作节点与六个可见短号。 | 已闭合 |
| 旧性能 CSS SHA 漂移 | 当前 `web/style.css` 为 `990d48bd…`，`web/index.html` 为 `0b0c477e…`，`web/cockpit.js` 为 `9b35fe8e…`；r2 性能 JSON 的三项 hash 全部相同。 | `work/robot-cockpit-fixture-r1-2026-10-05T18-39-40-426Z.json`：48 角色、60,002 ms、164.99 FPS、p95 6.6 ms、慢帧比例 0、draw 83、8/0/exit0。 | 当前字节的受控性能证据已闭合 |

## 独立验证与最终边界

审查者在当前源码上独立重跑 `node tests/verify_garden.cjs`：`work/garden-browser-2026-10-05T18-44-22-653Z.json`，17 checks / 0 failures / exit 0；`node --check web/garden.js` exit 0；`.venv\\Scripts\\python.exe -X utf8 -B -m unittest tests.test_garden_public tests.test_garden_gateway -v`：7 tests / OK / exit 0。为排除“旧观察回归只在 r2 前执行”的证据缺口，还独立重跑最终旧观察完整 fixture：`work/robot-cockpit-fixture-r1-2026-10-05T18-44-59-009Z.json`，1403 checks / 0 failures / 0 limitations / exit 0，记录的 HTML/CSS/cockpit SHA 均匹配当前文件。先前的红测试与 r1 实施早期失败已保留，未被绿结论抹去。

真实 IAB r2 保持四位同根伙伴、完成摘要云朵、角色/任务/阶段名牌和实际 3D 庭院；`work/r13-live-main-r2.jpg` 可核首屏层级，`work/r13-ui-live-r2.json` 记录名牌 Enter 焦点与节点短号。r1 三宽 `work/r13-ui-live.json` 记录 360/574/1024 均无横向溢出且舞台可见 228/313/381 px。当前 r2 未改变 HTML/CSS 或首屏名牌几何，只补焦点键与详情节点短号，因而该三宽几何仍是对应布局的证据；真实 IAB 的 r2 键盘与详情另有独立观察。公开发言仍须由用户点选才从已登记同根 actor 的本机原生记录读取，不把摘录称作完整对话或实时工作状态；实际四 actor 的只读接通与异根 404 见 `work/r13-public-live.json`，本报告不复制正文。

该 60 秒 FPS 是本机受控 headless Edge 的可见 rAF/WebGL 样本，不代表所有硬件或 Codex IAB 前台持续 FPS；真实 IAB 已做视觉与交互核验，而非帧率保证。原生 `rollout_path`/JSONL 格式仍是本机版本细节，升级后可返回“公开发言不可用”。r1 报告记载的 S1 某些边缘负例测试覆盖缺口（如软链/并发变化）没有被 r2 的焦点补丁扩大；当前代码的路径根、类型白名单和预算仍采取失败关闭，本轮未发现可复现的跨根或私有记录泄漏。

## 协议与业务分类

`impl_report_r2.md` 已指向 r1 红报告当前 SHA；变更事实、`impl-safe` 记录、coordinator 验证责任、风险与回滚均有落点。r2 源码没有引入配置、第二套焦点机制、虚构状态或额外用户动作；角色/任务/收据仍是清楚的事实投影。不存在 `IMPL_DEFECT`、`PLAN_DEFECT`、`PROBLEM_DEFECT` 的未闭合事实，故协议结论 `PASS`、业务结论 `PASS`。此审查通过只覆盖 R13 既定范围，不扩展为原生索引格式的跨版本承诺或旧 R12 已知 Wez/远端限制的修复声明。
