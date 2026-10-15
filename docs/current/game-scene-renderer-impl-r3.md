# 游戏空间镜头 fit 修补 r3

2026-10-04；feature_name=game-scene；impl_round=3；lwplan_version=N/A（root 实际 IAB 反馈推动的有界展示窄修）。root 观察空房仅占 1150px 宽画布约 350px、420px 高画布约 135px；过大的球体半径和未利用宽画幅使空间过小。作者只改 `web/robot3d.js` 的 framing 计算，未改其它产品。

变更事实：移除全场景 `Math.hypot(roomWidth, roomDepth)` 球体半径，draw 使用缓存 aspect 和 yaw/elevation，将房间 x/z 与 y=-0.2..2.6 的八个角点投到相机 right/up/depth 基，求满足横纵 frustum 的最小距离，再加 8% margin 与原 zoom。每帧仅 8 组标量运算，无 DOM、数组、资源构建；保留镜头目标 y=1.05、拖动阻尼、最短角 reset=-0.28/elev=.55、zoom 0.75..1.8、所有拾取和降级。zoom=1 是全场景 fit，用户主动拉近仍可超出边缘。

goal_lock_check=提高游戏空间画面占比；anti_goal_touch_check=身份/消息/来源/focus/图形生命周期无改动；related_tasks=有界展示镜头 fit；authoring_ergonomics_notes=N/A。contract_drift_reports=无；root 后续另要求普通 hover 不永久冻结，因本轮 patch/verification 已保存，作为 r4 继续保留本 r3，不覆盖历史。

本地实际验证：`.venv/Scripts/python.exe -X utf8 -B work/game-scene-renderer-r3-before.py`（chunk `963c58` exit 0）保全 r1 before；`.venv/Scripts/python.exe -X utf8 -B work/verify-game-scene-renderer-r3.py`（chunk `5a4b54` exit 0），完整 stdout 已读，3 检查、0 失败。Node --check exit 0/stdout stderr 空；由实际 draw 标量段提取的距离函数接受本地投影属性校验：54 种 360/1150px、0/12/48 布局尺寸、yaw/elevation 情况共 432 角点全部处于 frustum，exit 0，完整 stdout/stderr 在 verification JSON。owner=renderer 作者；evidence=`work/game-scene-renderer-r3.verification.json`；conclusion_if_missing=不称语法或局部边界数学通过。

完整 diff=`work/game-scene-renderer-r3.patch`；before=`work/game-scene-renderer-r3-robot3d-before.js`；此轮 renderer SHA `33C2066B9FDD67B5A67149FE82C634226115132E773E3569285C06E1320C3751`。未覆盖 r1/r2。没有已运行失败检查；没有浏览器、网络、服务、GUI、SSH 操作。

coordinator_handoff_verifications：root 实际 IAB 重新截图检视占比、Edge 完整 click/raycast/360px/48长房布局及生命周期；evidence_expected=真实截图与浏览器每条 check/完整退出码；owner=root；conclusion_if_missing=不能称实际画面更好、拾取/流畅度验收通过。回滚信息=可直接恢复本轮唯一 renderer before；不覆盖 root 其它文件。建议提交消息：`fix(cockpit): fit robot rooms to the viewport frustum`。

无跨功能事实。
