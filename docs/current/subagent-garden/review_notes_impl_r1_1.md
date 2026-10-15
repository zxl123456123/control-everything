# R12 子agent协作小院：第 1 轮实施后独立审查

`review_target=impl`；`impl_round=1`；`review_seq=1`；`review_date=2026-10-05`。输入为 `impl_report_r1.md` SHA-256 `536290da14c7d6f51412e9f535f309e35ef38fb81d639ab43f1e12c3280a23a3`、完整基线 SHA `28fd4301a0f8cdd32b70ae593186beae473d4e0248e4fe7355654a027a6b4781`、唯一 LW SHA `e20c7af4a1980e3de086664d5432e13a8e57b328196b94b5757619ada1da4f98`、已通过 ReviewLW SHA `d96933c61c98cce385a2945c4403297b8e9286978b86f6a8dcac5861cb8f335f`。当前产品/旧新差异绑定 `work/r12-garden-manifest.json` SHA `aa4da3950dc3322b0c20d14dc0cefef5c4c0c9743312bf8ea2796ac8fef1e0ad`。审查者未参与计划、产品实施或业务产物复核；本报告只审这些当前输入，产品未修改。

**协议结论：REVISE；业务结论：IMPL_DEFECT。** `allow_archive_or_delivery=no`。当前真实产物链存在且同主会话绑定，但失效后仍能在复核者云朵展示“独立复核通过”；页面首屏也未露出计划要求的真实庭院。实施报告缺正式最小字段。修补后须以新轮次实施报告和当前代码重新做 fresh ReviewImpl；本次红证据保留。

## 阻断项与最小补实施

1. **过期复核仍显示成功。** `web/garden.js` 中 `actorPhase`、`reviewed` 云朵和详情的条件仅看 `actor.role === 'reviewer' && task.review?.outcome === 'pass'`。服务端 `session_panel/garden.py:snapshot()` 在产物或复核证据 hash 改变时派生 `state='artifact_changed'`、`current_valid=false`，却保留历史 `review`。因此旧 pass 会被页面当作当前通过。审查者复制原受控浏览器 fixture 到 `work/r12-review-impl-ui.cjs`（只在 `work/` 增加一个失效态断言，不改旧 fixture/产品），用真实 `web/garden.js` 在 Edge 中运行；得到 **11 checks / 1 failure / exit 1**，失败文本为 `stale reviewer success cloud: 独立复核通过\n能力调研，独立复核通过。`。完整输出 `work/garden-browser-2026-10-05T16-19-08-641Z.json` SHA `98de0193913d3c73a3da9ac81b5ed40af64bbd917443f49672ac1b6d73733ffd`，repro 脚本 SHA `9cb1bf29aae943a14b0e7d03c2b9e540c6b3de93729e07e7c7f0d9df1597f0e3`，当前 `web/garden.js` SHA `765f09f97cbc581ceb8b478ca76e37728ce31777506bfe1e7b8afd6be9c979b7`。最小修复：统一由 `current_valid` 且状态为 `reviewed_pass` 或 `accepted` 判定当前复核通过，卡片、云朵、详情三处一致；`artifact_changed` 只显示失效/重交，历史 pass 留在展开收据；把这一反例加入正式新 UI fixture，再重跑。此项直接违反 G12.2 与 N12.1 的“当前有效结果才有完成云朵”。
2. **574×866 首屏没有真实庭院。** 当前 `web/style.css` 将 `.garden-panel` 放在 grid row 1、`.robot-panel` 放在 row 2；`work/r12-garden-iab.png` SHA `3066957ba447dde5c0a7ae87366098768e2cc4608214d1b51cabd6a61d2ea324` 的真实 574×866 截图首屏为标题、伙伴卡片及云朵，3D 舞台未进入首屏。`work/r12-garden-iab.json` 报页面高 2133（相对旧约 4130 有改善）、宽 559 无横向溢出，但未覆盖 LW §S4“首屏可见领域、任务摘要和庭院”这一显式验收形态。最小修复限 garden 布局和必要标记，让真实庭院与当前摘要同在首屏，保留角色工位、可读字号和原 3D 品质；补 574 实页截图/可见性证据，并保持 360/1024 布局。
3. **实施报告缺正式最小字段。** `safe-code-changes/SKILL.md` 要求 `feature_name`、`impl_round`、`date`、`lwplan_version`；逐文件 `path/change_type/change_purpose/key_changes/related_tasks`；`goal_lock_check`、`anti_goal_touch_check`、`authoring_ergonomics_notes`；每项 impl-safe 验证的 `evidence/owner/conclusion_if_missing`；`coordinator_handoff_verifications` 每项 `evidence_expected/owner/conclusion_if_missing`、`contract_drift_reports`、未完成/风险与明确回滚口径。当前 `impl_report_r1.md` 有大量实际叙述与命令记录，但没有这些显式字段和逐项缺证据结论，不能把自然段直接等同完整输出契约。最小补丁为保留旧失败原文并追加字段化附录；已由 root 真正承接的实机/浏览器/性能证据须归到 coordinator 层，不能改写成 impl-safe。

上述三项都限于计划既有 S4/UI 与实施报告：局部（页面状态谓词/布局/报告）、低风险（无需改账本、权限或回滚主链）、无新决策（基线和 LW 已规定当前失效、首屏和证据责任）。因此满足 `IMPL_DEFECT` 三条件；不需重写唯一 LW，不需用户重新决定目标。第 1 项和第 2 项未修前不应声称 G12 完整交付。

## 已独立核查及证据边界

- **文件集合**：独立校验 manifest 的 7 个修改文件、22 个未改文件、9 个新增文件，并将 29 个旧文件与 `work/r12-before/` 的 hash 比较；校正检查器字段后 **38 个当前文件与 29 个旧备份均匹配 / exit 0**。第一次检查器误把新增项的 `sha256` 当 `after_sha256`，报 9 个假 mismatch/exit 1；字段校正后全匹配，原失败不当作产品红。旧 read-only MCP、原 Codex 身份、vendor 和旧浏览器 harness 在 unchanged 集合中。
- **真实身份/账本**：审查者自己的子agent进程通过 `actor_from_environment()` 只读绑定到根 `01a109a3-2890-7531-805b-6ed67edb5d5d`，以 `GardenService.snapshot()` 读 revision 10；亲自重算当前产物和独立复核文件 SHA，与 task 记录相等，assignee 与 reviewer 不同，submit/request/claim/record/accept 收据的 actor 顺序正确，7 个断言 / exit 0。独立 GET `http://127.0.0.1:8766/api/garden`（只有固定 Host 和 client 头，未输出 CSRF）得到 HTTP 200、相同 root、5 actors、1 task、accepted/version1/current_valid=true，exit 0。此为当前受信本机状态事实，不代表桌面已自动热加载 MCP，也不证明对同 OS 用户恶意改 env/DB 的隔离。
- **权限与隔离实现**：`garden_native.py` 只查 id/source 并沿显式 `thread_spawn.parent_thread_id` 到 root；`garden.py` per-root SQLite、固定 role、不同作者/复核者、version/hash/当前文件再验；`garden_mcp.py` 八工具 raw schema 先拒绝 extra 和错误类型；`garden_invoke.py` 从进程继承 caller，无参数覆盖；`gateway.py` 只给绑定 root 的页面两项固定 POST。审查者本轮重跑 `.venv/Scripts/python.exe -X utf8 -B work/r12-run.py r12-review-impl-protocol .venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_garden tests.test_garden_mcp tests.test_garden_gateway -v`，**17 tests / 0 fail / exit 0**，完整 stdout/stderr 在 `work/r12-review-impl-protocol.json` SHA `0b76c3b412f4343b5a422d1118251f3eead6ac444bcac9179318ea7ab84a655e`；两条 FastMCP/Pydantic lifespan warning 保留。负例覆盖合成双根、伪 caller/root 字段、CSRF/body、旧摘要失效、事务锁；不是对另一真实用户主聊天执行操作。
- **既有验收输出复核**：读到 root 完整 Python 回归 `work/r12-garden-python-full.json` 的 **192 tests/0/exit0**（含 3 条 Pydantic warning）；旧 fixture 最终 `work/r12-garden-legacy-browser-final.json` **1403/0/exit0**；新 UI fixture `work/r12-garden-browser-latepost.json` **11/0/exit0** 但没有覆盖本次新增反例；`work/r12-garden-service.json` 的六个静态资源 SHA 与 manifest 相符。实际 IAB 截图显示两朵当前有效摘要、四个登记伙伴，详细 DOM/键盘/跨域切换另见 root `work/r12-garden-iab.json`，此审查者只独立读其证据与截图，未自行操作用户 IAB。`work/r12-garden-perf48-command.json` 及采样为 60 秒 9900 帧/164.99 FPS/p95 6.5ms/8 checks/exit0，但该采样记录的 `web/style.css` SHA `5ea449...` 不等于当前 `a24f6f...`；最终修补后应按原质量条件重跑 48 角色连续样本，不能将旧样本冒充修后最终版本。
- **历史失败保全**：作者报告列出 Readiness 首缺 6–10、LW 首轮 REVISE 两点、planner 两次 capacity、review checker SyntaxError、实施首单测 1 fail+11 errors、首真实调用导入失败、新 browser 9/1、误用 Node 执行 Python、owned 网关旧进程归属失败、IAB fullPage 截图与剪贴板读回限制；R11 原 1392/1、1397/2、CSRF36/1、窄屏42/1、性能红与真实 workbench23/1 未被抹去。本次新增 UI 11/1 和审查者 manifest 字段误读 9 mismatch/exit1 也应在后续报告保留。

## 强制复核字段

`goal_lock_alignment=aligned`：S1–S3 与小院主要形态能追溯 G12.1–G12.3；S4 的失效呈现和首屏验收尚未达标，属于当前实施偏差。`anti_goals_touched=confirmed`：N12.1 的“旧结果不显示为当前成功”在失效态 reviewer 云朵被触及；LW 已明确约束，修复不需改目标。`authoring_ergonomics_check=pass`：固定八工具、角色方法和局部 UI 入口可读；报告字段缺口单列。`declaration_readability_check=pass`：工具 schema/HTTP 固定字段易核，未见配置语言膨胀。`plan_defect_checkpoint_recommended=no`；`plan_defect_checkpoint_reason=缺陷落在已定义的 S4 展示与证据格式，可直接局部补实施`；`plan_defect_trigger_reason=N/A`。`impl_safe_validation_check=pass`（当前后端局部和语法有真实命令；失效 UI 红要求修补）；`coordinator_handoff_check=missing`（实机、旧回归已留证，但首屏和最终哈希下 48 角色样本尚需修后重做）。`设计味道扫描结果=PASS`：未发现泛用调度/命令执行平台或身份覆写入口；该结论不抵消 UI 事实缺陷。

### 基线与澄清一致性复核结果：FAIL

澄清“未回答”为空；完成摘要、子agent之间协作与主会话隔离的目标没有产生新的用户待答问题。当前 UI 失效态违反 N12.1，且未满足 LW 首屏庭院验收；其余禁止项下表按已读源码/证据列边界。

| 禁止内容 | 独立定位 | 结论 |
|---|---|---|
| Stop/native completed/动画/历史收据冒充当前成功 | `web/garden.js` reviewer 条件与本轮 Edge 红证据；`garden.py:snapshot()` 派生失效 | **触及**：历史 pass 仍显示当前通过；阻断 |
| 参数自称 caller/root、跨主会话读写/派工 | `garden_native.py` 父链、`garden.py` per-root/role、`garden_mcp.py` raw schema；本轮 17/0、本轮受信实时快照 | 已检查入口未发现；真实另一主会话未操作，仅合成双根负例 |
| 任意命令、终端输入、全局配置改写 | `garden_invoke.py` 固定模块与工具名；manifest unchanged 项 | 未发现本轮新增入口 |
| 改旧 unknown/网络守卫、降 3D 人口/画质 | 旧文件 manifest、`gateway.py` 专用分支、`robot3d.js` garden 色彩分支、旧 fixture 1403/0、48 样本 | 当前源码未见，最终性能需修后精确重跑；R11 历史限制保留 |

本轮没有发现新的 shared skill/平台入口镜像 drift；产品与计划在“失效态”处有明确实现偏差，不是计划文字缺漏。后续由唯一产品作者补 UI 状态、布局和字段化报告；coordinator 复验真实 8766/IAB、全量旧回归及当前哈希 48 角色连续 60 秒；另一 fresh 实施审查者按最终代码和所有红/绿记录重新输出双结论。本报告的 `REVISE/IMPL_DEFECT` 不可作为放行或自动完成事件。
