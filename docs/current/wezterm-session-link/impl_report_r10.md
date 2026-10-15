# R10 实施记录：当前版本的有限集成验收

feature_name: wezterm-session-link；impl_round: r10；owner: root；date: 2026-10-05 Asia/Shanghai。  
lwplan_version: §13，138789bytes，SHA E11B6A2624C3612E763259BD7A96CEC2C5280EFA76B31D875DE835354F6BC98F。  
当前状态：root 实际验证结束，fresh ReviewImpl 待独立判定；本报告不代替审查。

用户明确授权自动实施、新建自己的 Codex/WezTerm 测试会话及持续验证。唯一 §13/澄清 §17 绑定 R9 四路径和独立 H1 两路径的复合版本；R10 **产品增量为零**。29 产品当前字节见 [manifest](E:/project-funny/mianban-develop/work/wezterm-integration-r10-manifest.json)，SHA 18BF84ED0C319953D58162BC686E60602C44D3E55BC9E8B69EF617A807417702；没有改旧方案前缀或把 R9 的 REVISE 改成 PASS。

fresh ReviewLW SHA E511F84E233E3768423293FC7FA5A0CDBC15EE5FD65A1A2023C18F6B515D32FE 已完整读。root Gate2 actual12eae1/exit0/51项全true，随后 f53a26 明确准入，见 [Gate2](E:/project-funny/mianban-develop/work/wezterm-integration-r10-gate2.json)、[release](E:/project-funny/mianban-develop/work/wezterm-integration-r10-release.json)。实际加载与下列实机调用都发生在准入之后。

| path / change_type | change_purpose / key_changes | related_tasks |
| --- | --- | --- |
| 产品29路径 / 无修改 | 使用已独立审查的 R9+H1 当前字节，核验加载、真实会话、原时限、浏览器关系和操作结果 | S1-R10/S2-R10 |
| work/live-session-capabilities-r10.py / 验收采集器 | 至多3次只读 ready 查询；仅 busy 等250ms再GET；其它 unknown立即停止；每个连接、定位POST只发一次 | S2-R10 |
| work/live-session-robot-browser-r10.cjs / 验收采集器副本 | 与原R9仅输出名/标签不同，无接口行为修改；固定两个新会话 | S2-R10 |
| work/live-session-*-audit-r10*.py/json / 证据核对 | 读取原始退出码、身份、时钟、客户端与资源SHA；不重跑产品碰绿 | S1-R10/S2-R10 |

goal_lock_check: G1未知/拒绝语义、G2原有工作台连接、G3完整身份/位置及原两个5秒守卫保持。anti_goal_touch_check: N1–N3不变；无其它held命令重放、任意聊天正文、审批/发送/Hooks、latch清除或新队列预算。authoring_ergonomics_notes: 复用现有采集器、只写本批证据，不新增产品抽象或公共配置。

## root 实际执行与证据

| 实际命令 / 退出码 | evidence / owner / conclusion_if_missing |
| --- | --- |
| 本轮 root `python -B work/live-session-root-tests-r6.py work/live-session-root-tests-h1-1.json`，dbd886→3bb559 exit0，完整175/0输出；两Pydantic警告保留 | [175当前回归](E:/project-funny/mianban-develop/work/live-session-root-tests-h1-1.json)，root；缺则当前全套未证 |
| root原H1症状相同采集器 a67776 exit0；原69发送方式 ff01b8 exit0，69/69原403/noService/临时fixture关闭 | [3症状](E:/project-funny/mianban-develop/work/gateway-rejection-h1-symptom-green-root-1.json)、[69响应](E:/project-funny/mianban-develop/work/gateway-rejection-h1-after.json)，root；缺则拒绝体修复未证 |
| 精确自有gateway重载645514→626002 exit0，26552 launcher→14488 listener，exclusive127.0.0.1:8766/health200 | [实际加载](E:/project-funny/mianban-develop/work/live-session-gateway-reload-h1.json)，root；缺则运行版本未证 |
| `python -B work/live-session-capabilities-r10.py`，6eeb80→bd639e exit0，3轮/33项、22请求/6单次POST，connect均不launch、focus均confirmed、独立client1→3 | [API原始](E:/project-funny/mianban-develop/work/live-session-capabilities-r10-1.json)、[独立28项核对](E:/project-funny/mianban-develop/work/live-session-capabilities-audit-r10-recheck1.json)，root；缺则正常轮询下有限链路未证 |
| `python -B work/live-session-focus-stress-r9.py work/live-session-focus-stress-r10-1.json`，108727→42feb9 exit0，五起点各三次 | [15实际定位](E:/project-funny/mianban-develop/work/live-session-focus-stress-r10-1.json)，root；缺则当前有限路线未证 |
| `python -B work/live-session-focus-audit-r9.py …r10-1.json …audit-r10-1.json`，524bd1 exit0，212检查全true | [原时钟/原始子调用核对](E:/project-funny/mianban-develop/work/live-session-focus-audit-r10-1.json)，root；缺则不能从pane到达推出完整确认 |
| `C:/nvm4w/nodejs/node.exe work/live-session-robot-browser-r10.cjs`，e8bf94→28a801 exit0，22项/26GET/8资源/三刷新/真实WebGL射线选择，浏览器关闭 | [native记录](E:/project-funny/mianban-develop/work/live-session-robot-browser-r10-2026-10-04T23-33-35-988Z.json)，root；缺则机器人/正文隔离未证 |
| IAB三次准确UUID、refresh→enabled→单次click→confirmed；独立CLI05f3ce/827d7d/e75a61均exit0/client1terminal3 | [UI1](E:/project-funny/mianban-develop/work/live-session-ui-focus-r10-1.json)、[UI2](E:/project-funny/mianban-develop/work/live-session-ui-focus-r10-2.json)、[UI3](E:/project-funny/mianban-develop/work/live-session-ui-focus-r10-3.json)及同编号prepare/clients/png，root；缺则用户路径未证 |
| `python -B -m work.live-session-final-audit-r10`，143813 exit0，59项全true | [root最终字节与证据核对](E:/project-funny/mianban-develop/work/live-session-final-audit-r10-1.json)，root；缺则前面执行记录与当前产品未绑定 |

实际新 Codex 为 `01a10809-706b-78e3-b279-c3611cf75be0`；远端新 Claude 为 `0990a0a5-a375-4bef-85ef-0ae23ee5ad74`/PID3886044/ticks1341437828/boot8039e11b-c803-45d1-b909-973722f040c4。两条测试历史的user/assistant UUID均准确，marker为PANEL_LIVE_WEZ_R8_READY。范围固定已授权来源ubuntu@175.24.135.125:/home/ubuntu/.claude；原GUI51008、attach53116、server14740、client1完整向量保持，所有动作只对本次自己的测试客户端。

15轮最早累计远端年龄2187–4077ms、原动作预算时间1250–3313ms，均小于原5000ms。API第三轮focus请求wall为6516ms，不拿总请求延迟当原两个时钟，不宣称请求总耗时必小于5秒。HTTP ready首查询busy仍为负样本，250ms后只GET补读一次；未retry任何POST。只读预检与后续POST不原子，仍可能忙而拒绝。

native两个mesh为d4c6805a-2e79-4222-8170-b9a0c0ccbf2d及35e82930-70aa-4860-ae6d-aad566ebd92d，各home(-5.1,0)/(-5.1,-7.6)，同页三次数据刷新保持；不证明跨浏览器重载的工位持久化。native暂停仅用于重复射线取点；IAB三次均visible、paused=false、free=true，正常10秒轮询未停。最终[可见工作台](E:/project-funny/mianban-develop/work/live-session-cockpit-delivery-r10.png)已保存并保持打开。

coordinator_handoff_verifications: 上表root承接并完整读各实际命令退出码；API/native宽输出曾截断，root分别145b80/2eae64/c06ab7定向完整读所有checks、requests、observations、两身份/工位/选择和资源，再独立读取原始15 child调用/69响应核对。fresh reviewer独立复核当前产品/上游/Gates/报告和所有红绿；conclusion_if_missing: 无fresh结论不能把本报告当最终通过。

## 失败保留、未解决项与回滚

contract_drift_reports: 当前29与冻结manifest相同；R9原方案/审查与H1独立差异均保留，未发现新增产品漂移。H1准确31行代码与8回归方法在[独立PASS审查](E:/project-funny/mianban-develop/work/gateway-rejection-h1-review.md)；只负责可靠成帧1–4096字节早期拒绝、总250ms有限消耗，不负责大/慢/chunked请求或一般网络稳定性。

本轮API核对首a4927b exit1：root把lowercase记录hash与uppercase当前字符串比较；9d9571证明14当前字节全相同，只修checker大小写后95bead/28项全true，首红[保留](E:/project-funny/mianban-develop/work/live-session-capabilities-audit-r10-1.json)，没有重跑API。IAB首误依据AX checkbox映射选择，no_matches timeout、未click；读实际DOM后改button精确UUID，才执行上表三次有效路径。H1root audit首8a20bd误要求原69发送器owner=root，实际旧独立诊断owner=game_scene_final_review；仅纠正checker后146680/44项true，首红保留。root98a365提前读尚不存在R10草稿exit1，随后完整读实际文件；其它旧路径错误、读取截断定向补读、两次agent容量拒绝均未当作产品验证。80df05字段聚合误含base64截断，a10576补读准确175退出、18hash、全部两警告；原175完整输出此前3bb559已经读取。

旧R9整批167/1ERROR、235ms unknown原因未证、第三轮409busy；R8 12/15三个late、首161 HTTP失败及同字节后绿；原HTTP69中11次Win10053、H1两份3ERROR；R7/R6诊断失败、Git128、两Pydantic警告均保留在[历史账本](E:/project-funny/mianban-develop/work/live-session-stability-delivery-r10-draft.md)及其原始链接，不改成通过。R10当前有限绿不能证明旧unknown根因已修复或所有旧BLOCKED闭合。

未解决与风险：Codex仅身份metadata，无正文/实时活动；activity/task_completion未知；装饰巡游/粒子/关系链不是实际任务协作。48角色连续性能35.11FPS/p9560.9ms目标未达；当前13角色IAB近期163–165FPS/p956.1–6.5ms只是可见requestAnimationFrame窗口。旧owned失败回收、父Q6三工具原生加载/调用仍缺证。回滚：R10无产品增量；若回滚H1或R9必须按各独立before/patch保留其它用户工作与全部失败，不恢复held命令或清latch。工作目录不是Git checkout，未初始化/提交/推送。

提交建议：`fix(gateway): preserve early rejection responses for bounded request bodies`；`perf(terminal): overlap fresh sampling within the original focus budget`。
