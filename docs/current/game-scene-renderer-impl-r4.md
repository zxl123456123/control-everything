# 游戏空间指针稳定修补 r4

2026-10-04；feature_name=game-scene；impl_round=4；lwplan_version=N/A（root 实际体验推动的同范围有界修补）。只改 `web/robot3d.js`：普通 hover 不再停止巡游/光粒子；仅 pointer 按住/拖动期间暂停自动装饰，点击释放后保留 250ms 稳定拾取。保留巡游模式选中机器人单独冻结、拖动 4px 阈值、真实 UUID raycast、暂停/hidden/reduced/fallback/dispose。原 8 秒冷却缩短至 250ms；视角轮滚和按钮短暂使用同冷却，不再让鼠标静放场景就长期静态。

goal_lock_check=场景被观看时仍运动，按下与点选稳定；anti_goal_touch_check=不变更真实记录、服务 API、来源、消息/focus，cockpit 保留 r2 短 ID 修补，frustum 保留 r3；related_tasks=游戏感动态与交互；authoring_ergonomics_notes=N/A；contract_drift_reports=无（root 有界方案同步为“按下/选中稳定拾取”）。净变更是一变量、两 hover listeners 删除及冷却/事件条件，未引入每帧 raycast 或 DOM。

作者本轮实际执行 `.venv/Scripts/python.exe -X utf8 -B work/game-scene-renderer-r4-before.py`（chunk `93dced` exit 0），保存精确 r3 before；执行 `.venv/Scripts/python.exe -X utf8 -B work/verify-game-scene-renderer-r4.py`（chunk `897293` exit 0），完整 stdout 已读：5 检查、0 失败。Node --check exit 0、stdout/stderr 空；普通 hover 无暂停条件、250ms 释放冷却及选中 UUID 条件静态检查 true；r3 数学属性再跑 exit 0，54 情况/432 角点无 frustum 失败。owner=renderer 作者；evidence=`work/game-scene-renderer-r4.verification.json`；conclusion_if_missing=不称静态与局部数学通过。作者未运行浏览器、HTTP、GUI、SSH、服务。

完整 diff=`work/game-scene-renderer-r4.patch`；before=`work/game-scene-renderer-r4-robot3d-before.js`；最终 renderer SHA `22CBFAD2A8208D5B5D256F68DC68341F052D262EF5BC6176C2A40F352A47ED29`；当前 cockpit r2 SHA `87064535434C5A21058418A52BCD64C4A64A2238206D62EC94EC3660C124FD9F`。r1/r2/r3 patch/report/verification 全部保留，不覆盖；本轮没有已运行失败检查。

coordinator_handoff_verifications：root 实际普通 hover 时角色和粒子持续变化、按住冻结/释放后250ms恢复、drag无误选、选中角色冻结、frustum宽窄与长房间完整、完整旧 fixture/IAB截图/10秒性能采样。evidence_expected=实际 browser 各检查/完整 stdout stderr exit、截图；owner=root；conclusion_if_missing=不能称真实画面、拾取与性能验收通过。已知风险=作者本地数学不能证明真实 GPU/画布尺寸/可选对象遮挡；root 继续独立实际验证。

回滚信息=可直接恢复该轮单文件 before；不覆盖其它并行作者。建议提交消息：`fix(cockpit): keep decorative motion active during hover`。

无跨功能事实。
