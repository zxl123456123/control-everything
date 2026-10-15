# R13 清晰主界面与角色详情：实施报告 r1

`feature_name=subagent-garden-detail`  
`impl_round=1`  
`date=2026-10-06（Asia/Shanghai）`  
`lwplan_version=5bdd2f2dcc8175b9d52d9b41c74c91353d67fd494af5d63c83d8425c68ec7ca4`  
`input_review=review_notes_lwplan_2.md / PASS`  

本轮根作者只改 R13 的公开发言只读入口、首屏信息、详情和小院运动呈现；R12 `GardenService` 账本未改。目录没有 `.git`，没有初始化、提交或推送。冻结前后逐文件哈希见 `work/r13-manifest-final-r2.json`（8 个基线文件中 7 个有意变化、`garden.py` 原样），原字节见 `work/r13-before/`。真实交付产物与收据仍由 R12 的根域账本持有，不自动删除。

## 逐文件变更事实

| path | change_type | change_purpose | key_changes | related_tasks |
|---|---|---|---|---|
| `session_panel/garden_public.py` | add | 已登记同根子agent的公开发言摘录 | 原生父链/登记双门、精确只读 SQLite ID、固定 sessions 根/UUID 文件、4 MiB/256 KiB/6×1200 预算、单一 assistant 公开 phase 白名单 | S1 |
| `session_panel/gateway.py` | modify | 固定 root HTTP 只读入口 | `GET /api/garden/actors/<id>/public-messages`，沿用 Host/Origin/client 守卫，无外部 root/path 参数，失败不泄露正文/路径 | S1 |
| `tests/test_garden_public.py` | add | 权限与私有数据边界验证 | 合成父链/原生路径、私有 role/type 排除、跨根/未登记、父链漂移、扩展路径、坏文件和预算 | S1 |
| `tests/test_garden_gateway.py` | modify | HTTP 接口保护 | root/unbound、query/UUID、异根和安全头负例 | S1 |
| `web/index.html` | modify | 首屏具体角色入口 | 完成摘要后、真 3D 舞台前加入 `garden-scene-roster`；场景提示改成自主巡游与收据口径 | S2/S3 |
| `web/garden.js` | modify | 事实投影和渐进详情 | 首屏最多四名牌、超出数与完整工位入口、负责事项与收据阶段、需关注数、职责/时间线/有限公开发言、明确点选按需 GET、切域/换角色/隐藏页代次隔离 | S2 |
| `web/style.css` | modify | 星露谷草木色下的信息层级 | 360/574 双列角色名牌、详情时间线/发言、仅 garden 隐藏机器人动作按钮，观察模式样式不改 | S2/S3 |
| `web/cockpit.js` | modify | 小院自主安排动作 | 进入 garden 恢复 free roam/非减动动画，离开时恢复旧观察值；只在主题变化而非轮询时触发 | S3 |
| `tests/verify_garden.cjs` | modify | 有意义的页面回归 | 四角色首屏几何/无横溢、第五角色折叠入口、真实节点与职责、公开文本转义/按需读、跨根与隐藏页迟到响应 | S2/S3 |
| `README.md`、`docs/current/subagent-garden-detail/README.md` | modify | 使用与状态说明 | 明确有限摘录、收据进度、自主巡游与主会话隔离 | S1–S3 |

## 目标锁与作者体验

`goal_lock_check=aligned pending independent review`：G13.1 的四名牌在真实 IAB 360/574/1024 首屏可见，分别显示 role、事项、收据阶段；详情有职责、能力、真实时间线和按需发言。G13.2 的真实四位已登记 child 返回 4/6/5/6 条有限公开发言，异根 404。G13.3 的小院隐藏 motion/roam/rotate 按钮，真庭院自由巡游；旧观察按钮仍可用且返回时保存其选择。所有“工作进度”只取 R12 已发生节点，未加百分比或运行中猜测。这里是作者事实陈述，最终判定待独立 ReviewImpl。

`anti_goal_touch_check=clear pending independent review`：没有改 `garden.py`、旧消息服务、远端观察/终端动作、Three.js 几何/画质/角色人口；没有传整份 JSONL 到网页、扫目录、暴露 developer/user/tool/reasoning。公开发言不是任务事实；录入路径、root 和 caller 均来自已绑定本机服务。`authoring_ergonomics_notes=pass`：只加一个固定只读 helper、一个固定 GET、一个紧凑首屏组件和详情区，没有新可配置动作、角色推断器或调度状态。角色和任务事实来源在名牌/详情一致；无关顺手重构未做。

## impl-safe 验证记录

| 实际命令 | evidence | owner | 结果 | conclusion_if_missing |
|---|---|---|---|---|
| `.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_garden_public tests.test_garden_gateway -v` | `work/r13-python-local.log` | root 产品作者 | 7 tests / OK / exit 0；只用临时 SQLite 和 handler mock | 新只读源与 route 的局部边界未验 |
| 冻结前后 SHA-256 比对 | `work/r13-manifest-final-r2.json` | root 产品作者 | 7 个有意改、1 个账本原样；没有 Git | 变更边界不可追溯 |

## coordinator_handoff_verifications

下列真实环境与浏览器/性能验证不是 impl-safe，均由 root coordinator 承接；不以本地单测代替。

| 项目与原因 | owner / 承接方式 | evidence_expected / 当前实测 | conclusion_if_missing |
|---|---|---|---|
| 自有 8766 服务重载涉及真实进程 | root coordinator，按绝对映像/argv/父子/birth/端口和 action latch 核查后仅停自有进程 | `work/live-session-gateway-reload-r13.json`：旧 listener 23612 自有且已核实；新 listener 26788、健康 root；exit 0 | 当前网页接入不能宣称 |
| 全部 Python 回归含跨进程 MCP/临时 HTTP | root coordinator 跑全量 196 项并逐段读输出 | `work/r13-python-full.log`：196 tests/OK/exit0，保留 3 条既有 Pydantic `lifespan` warning | 旧服务防护兼容未验 |
| 受控浏览器页面回归涉及真实 Edge | root coordinator 跑新 UI fixture | `work/garden-browser-2026-10-05T18-32-17-046Z.json`：16 checks/0/exit0 | 首屏、对话隔离与失效态未验 |
| 真原生索引与四位已登记子agent的 HTTP 摘录 | root coordinator 只读本机实际数据，只输出 count/phase/长度 | `work/r13-public-live.json`：4/6/5/6 条、同 root、异根 404、exit 0 | 真对话功能和隔离未验 |
| 真实 IAB 首屏、交互与视觉 | root coordinator 亲看当前 tab，三宽 DOM 矩形、点击后只记条数、截图 | `work/r13-ui-live.json`、`work/r13-live-main-final.jpg`：4 角色，stage 可见 228/313/381px，无横溢，按钮不可见；点选六条发言、六个工作节点 | 舒适首屏/真实点选不能宣称 |
| 旧观察与真 3D 完整回归 | root coordinator 运行旧浏览器 harness，检查模式/观察控制/旧服务守卫 | `work/robot-cockpit-fixture-r1-2026-10-05T18-25-11-601Z.json`：1403/0/exit0 | 旧体验兼容未验 |
| 同质量 48 角色连续 60 秒 | root coordinator 原 `--perf48` harness，不降人口/画质 | `work/robot-cockpit-fixture-r1-2026-10-05T18-21-50-820Z.json`：59,997ms、48 角色、164.99 FPS、p95 6.4ms、慢帧0、draw83、8/0/exit0 | 性能仅能称未知 |
| 最新字节的独立 ReviewImpl | 与作者分离的审查者读计划、报告、代码和证据 | 待写 `review_notes_impl_r1_1.md` | 不给最终技术放行 |

上述性能是本机受控 headless Edge 的可见 rAF/WebGL 样本，不能替代所有设备或 Codex IAB 前台帧率保证。真 IAB 页面已经看见 3D 庭院，但后台采样可能节流。截图由实际 IAB 返回 JPEG 字节保存为 `.jpg`，未把发言正文写入本报告或验证元数据。

## contract_drift_reports、红色记录、风险与回滚

`contract_drift_reports=none after Gate2`：lwplan 的首屏名牌、只读源、隐藏按钮、观察兼容均有对应文件；新 helper 的单行预算按已核四个本机样本定为 256 KiB。Readiness r1 缺基线第 6–10 节、LW r1 首屏落点不足的 REVISE 均保留在原 review_notes，修订后的 r2 为 PASS。

本轮实施中确实出现且保留的失败：新 Python 测试首跑 3 errors/exit1，是 Windows 测试夹具未及时关闭 SQLite 连接导致临时目录清理失败，改 `closing` 后通过；新浏览器首跑 0 checks/exit1，是测试 HTML 字符串含 `</script>` 提前结束内联模块，换无闭合 script 的注入样本后继续；下一轮浏览器 13 checks/1 fail/exit1，是预期文案未随新增“1 项需关注”更新，改预期后为绿。R12 旧报告里的远端/Wez/焦点限制不在本轮修复范围，未伪称消失。

已知风险：原生 `rollout_path` 和 JSONL 形状不是公开稳定接口，平台升级会明确返回 unavailable；同 OS 账户本身是信任边界；当前只有 R12 已赋任务的两名伙伴有产物阶段，另两名如实显示待任务。公开 assistant 发言可包含其自行引用的内容，页面仅展示来源类型和有限长度，不承诺额外内容级脱敏。自动发现新 MCP 工具尚未验证，本轮没有动客户端全局配置。

`rollback=需人工介入`：S1 可删新 helper/固定路由并恢复 `gateway.py` 冻结字节；S2/S3 可按 `work/r13-before/` 逐文件恢复 R12 页面，但 `cockpit.js` 要按 ReviewLW r2 记录的旧 SHA 独立找回旧字节。不能自动删除真实 `work/garden-state` 账本或原生会话记录。任何再次重启 8766 须重查当前 PID/出生时间/端口/action latch，不沿用旧 PID。

**英文提交建议**：`feat(garden): show agent roles progress and public updates in the courtyard`。当前没有 Git，未执行提交。
