# 游戏空间显示修补 r2

2026-10-04；feature_name=game-scene；impl_round=2；lwplan_version=N/A（已授权同范围一行显示修补）。实际先读 `web/cockpit.js` 的 Canvas fillText：确实为 `sessionId.slice(0, 8)`，因此命名键 `codex:<UUID>` 会只显示 `codex:01` 等前缀。

变更事实：仅 `web/cockpit.js` 一行 Canvas 短 ID 表达式先去开头固定 `codex:`，再取 8 个 UUID 字符。Claude 原 UUID 原样短化。goal_lock_check=辨识不同 Codex 角色；anti_goal_touch_check=hitbox、完整 sessionId、选择回调、服务 API、robot3d、来源均未改变；related_tasks=本地短 ID 显示；authoring_ergonomics_notes=N/A。没有 source/network/browser/GUI/SSH 动作。

本轮作者执行 `.venv/Scripts/python.exe -X utf8 -B work/game-scene-renderer-r2-before.py`（chunk `4a163d` exit 0）保存 r1 原文件；再执行 `.venv/Scripts/python.exe -X utf8 -B work/verify-game-scene-renderer-r2.py`（chunk `71fb6f` exit 0），完整 stdout 已读：3 检查、0 失败，Node --check exit 0、stdout/stderr 空，当前全文严格等于 before 只替换一次指定表达式。owner=renderer 作者；evidence=`work/game-scene-renderer-r2.verification.json`；conclusion_if_missing=不能宣称语法/单行范围通过。

完整一行 diff：`work/game-scene-renderer-r2.patch`；before：`work/game-scene-renderer-r2-cockpit-before.js`，r1 SHA `A452132E4B3DE6E64D762709677A3011F6CEE97DA001EE3E0E67D0752FFEF38D`。最终 cockpit SHA `87064535434C5A21058418A52BCD64C4A64A2238206D62EC94EC3660C124FD9F`。未覆盖任何 r1 patch/verification/report，作者本轮没有已运行的失败检查。

coordinator_handoff_verifications：root 检查实际像素 Canvas 短 ID 及完整命名键点选回调；evidence_expected=实际 browser pixel label/selected-key 记录；owner=root；conclusion_if_missing=不称实际 Canvas 与选择行为通过。contract_drift_reports=无。未完成与风险=这里只修标签，真实来源/流程图/FPS 验收仍由 root 承接。回滚信息=可直接回滚唯一行，不覆盖其它作者产品。

建议提交消息：`fix(cockpit): show Codex UUID prefixes in pixel labels`。

无跨功能事实。
