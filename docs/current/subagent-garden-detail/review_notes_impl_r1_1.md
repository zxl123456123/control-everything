# R13 Review(Impl) 独立审查 r1

`review_target=impl`  
`reviewed_impl=impl_report_r1.md`  
`reviewed_plan_sha256=5bdd2f2dcc8175b9d52d9b41c74c91353d67fd494af5d63c83d8425c68ec7ca4`  
`reviewed_product_manifest=work/r13-manifest-final-r2.json`  
`protocol_verdict=REVISE`  
`business_verdict=IMPL_DEFECT`

## 结论与范围

按当前冻结字节，R13 的根域只读发言、首屏角色/任务/阶段名牌、收据时间线和小院自主巡游总体沿着 G13.1–G13.3、N13.1–N13.3 实施。正式放行仍需修复首屏名牌的键盘焦点回退：该缺陷局部、低风险、无需新产品决定，符合 `IMPL_DEFECT`。本结论不是对 R12 账本或旧远端服务的重审；本轮 `garden.py` SHA 未变，旧账本收据链保留。审查未读取或记录真实发言正文。

## F1 — 首屏名牌选中后丢失键盘焦点（需修，IMPL_DEFECT）

`web/garden.js:144–147` 只从当前焦点元素的 `dataset.gardenFocus` 保存恢复键，然后重建整个 `#garden-scene-roster`。`web/garden.js:166–170` 创建 `.garden-roster-card` 时仅赋 `dataset.actorId` 和 `aria-pressed`，未赋 `dataset.gardenFocus`；`web/garden.js` 末尾的恢复查找又只搜索 `[data-garden-focus]`。因此键盘 Tab 到首屏名牌，按 Enter 或 Space 触发 `selectActor → render` 时，被激活的按钮从 DOM 删除而没有对应的新按钮恢复焦点；轮询刷新同样会替换一个正在聚焦的名牌。coordinator 在未修补产品上新增聚焦断言复现：`work/garden-browser-2026-10-05T18-37-39-335Z.json` 为 16 checks / 1 failure / exit 1，失败是 Enter 后 `document.activeElement` 不在名牌。这个红证据直接落在 `lwplan.md` S2 的“键盘 Tab/Enter/Space 和焦点保留”验收句上。按钮仍能执行选择，故不是任务数据或根域泄漏问题。最小修复是为名牌赋稳定的 actor 焦点键，并在相关受控浏览器用例中断言 Enter/Space 之后 `document.activeElement` 仍是该名牌、下一次刷新后亦然；`>4` 的“查看全部工位”按钮如会随刷新替换，也应保持焦点或显式转移到目标工位。

## F2 — 时间线没有短收据 ID（需补齐计划落点，IMPL_DEFECT）

`lwplan.md` S2“时间线协议”明定每节点含操作、时间、执行者、版本与“收据 ID（短显，完整可展开）”。`web/garden.js:230–236` 当前节点仅追加操作名与“执行者 · 时间 · 版本”，短 ID 缺失；完整收据虽然在下方 `details > pre` 可展开，但用户无法从节点直接定位哪条收据。补一段短 ID 文本即可，不改变账本或设计；对应 fixture 应检查短 ID 与完整记录对应。此缺口次于 F1，但在当前计划的明确验收内。

## 已核正项与证据

- 源门：`garden_public.py` 先从同根 `GardenService.snapshot()` 查已登记非根 actor，再用原生父链核身份，原生 SQLite `id=?` 只读查精确 rollout；固定 sessions 根、UUID 文件名及 4 MiB / 256 KiB / 6 条 × 1200 字预算；仅 `response_item.message` 的 assistant `commentary/final_answer` 和 `output_text` 入响应。错误统一不可用，不回退目录扫描。`gateway.py` 的固定 GET 延用 Host/Origin/client 头，外部 root/path 无入口。真实 `work/r13-public-live.json` 只记四位同根 child 的 4/6/5/6 条和异根 404；未见发言正文输出。
- 页面：`garden.js` 以验证快照的收据/状态投影首屏角色、任务、阶段；`>4` 时最多四个首屏名牌，并留“还有 N 位”入口与下方完整工位。显式点选才 GET 公开发言；`textContent` 渲染、root/actor/代次/隐藏页门可阻止迟到回复重填。失效产物撤销成功文案，时间线区分当前状态与历史。`style.css` 中动作按钮仅 garden 隐藏，3D/像素/文字模式保留。
- 场景：`cockpit.js` 仅在 garden 主题进入时恢复自由巡游并保存观察面原状态；退出恢复观察状态，轮询不反复重置。`web/robot3d.js` 未改。真实 IAB 三宽记录 `work/r13-ui-live.json` 为四名牌、无横溢、原 3D 舞台可见 228/313/381 px；`work/r13-live-main-final.jpg` 360 宽截图可直接读出角色/任务阶段并看见庭院，长任务标题在名牌省略、在下方详情保留。
- 独立重跑 `.venv\\Scripts\\python.exe -X utf8 -B -m unittest tests.test_garden_public tests.test_garden_gateway -v`：7 tests、exit 0；`C:\\nvm4w\\nodejs\\node.exe tests/verify_garden.cjs`：16 checks、0 failures、exit 0，生成 `work/garden-browser-2026-10-05T18-36-24-059Z.json`。作者保存的 `work/r13-python-full.log` 是 196 tests/OK；旧观察受控 harness `work/robot-cockpit-fixture-r1-2026-10-05T18-25-11-601Z.json` 为 1403/0，未把这些当作 F1 的覆盖证据。

## 证据缺口与非阻断建议

- 48 角色性能样本 `work/robot-cockpit-fixture-r1-2026-10-05T18-21-50-820Z.json` 记录 `web/style.css` SHA 为 `75525955…`，本次冻结 manifest/当前文件为 `990d48bd…`，即性能执行在最后一次首屏 `>4` CSS 修订之前。该样本的 59,997 ms、48 角色、164.99 FPS、p95 6.4 ms、慢帧 0、draw 83 只证明旧 CSS 组合，不能写成最终字节的同质量性能。CSS 修订只在 garden 作用域，不能据此推断性能退化；应按 LW S3 在 r2 最终字节补跑并核 hash。
- `tests/test_garden_public.py` 覆盖跨根、未登记、父链漂移、扩展路径、路径逃逸、坏格式与预算，但 LW S1 列出的 UNC、软链、未知 content、并发写入等负例未逐项落成受控测试。当前源码作保守拒绝，审查未找到可用路径逃逸；这些是验证覆盖缺口，不写成已复现泄漏。
- UI fixture 的名牌键盘焦点新断言已落地且呈红，见 F1。短收据 ID、空/错误公开发言的可见文案仍缺受控断言；r2 补丁后针对实际改动补相应断言即可，无需以扩大重构解决。

## 业务分类与回传

未发现需要重定义用户目标的 `PROBLEM_DEFECT`，也未发现“实现已与计划一致但作者体验显著下降/计划目标形态错误”的 `PLAN_DEFECT`。F1/F2 都是明确计划内的局部遗漏，修复不引入新状态、配置或信任边界，因此本轮协议 `REVISE`、业务 `IMPL_DEFECT`。r2 补实施后保留本红件，更新实现报告与最终哈希，在新字节上重跑相关验证和 fresh Review(Impl)。本报告不把受控 Edge 性能等同于真实 IAB 前台帧率，也不承诺原生 rollout 格式跨版本稳定。
