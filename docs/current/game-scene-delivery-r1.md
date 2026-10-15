# 机器人空间与 Codex 身份索引：本轮交付证据

2026-10-04 实施，2026-10-05 Asia/Shanghai 收尾。用户持续授权自动实施；根协调者独立运行验证，当前产品已加载至 http://127.0.0.1:8766/ 。结论范围为游戏展示和本机身份索引，双端实时对话监控尚未验收。

## 当前结果与用途

✅ 已实现：有深度的房间与工位、稳定 UUID 座位、自由巡游/回到工位、delta 步态、192 个批量光粒子、环绕/缩放/暂停、像素和文字回退。刷新记录不重建相同角色或重置座位；选中角色稳定，其余继续活动。远端五节点动态流程显示来源→索引→身份→按需历史→终端位置证据，节点失效明确显示等待；没有任务步骤事件就不显示执行进度。

✅ 已实现并实机对照：Codex 固定 SQLite 只读六列身份索引，12 条分页，独立 codex:UUID 命名空间，保留完整 UUID/cwd，活动与完成 unknown。实际 GET 10 页共 113 条筛选身份，与随后只读库采样逐 ID 对照；updated_at 允许第二次采样增长，不声称跨请求原子快照。选中当前聊天 `01a10013-6a9b-71f0-9878-89ce70e5a495`，仅元数据，无正文/实时忙闲。

⛔ 未实现/未验收：Codex 正文与实时状态订阅；全服务器 Claude 监控；真实 WezTerm 关联/focus/owned 回收。实机 workbench-v4 server_state=exited、association=unknown；远端 terminal_unavailable、索引 0。0 表示当前缺证，不能当成服务器没有会话。本轮只重载精确归属的网关，没有恢复 EXITED 布局、启动远端命令或清除 latch。旧 WezTerm Review(Impl) BLOCKED 保留。

## 采用的已有技术

代码和业界均在设计前调研。参考 [AI Agent Office Simulation](https://github.com/yakobusdamar/ai-agent-office-simulation) 的 speed×dt/通道与座位，参考 [Bruno Simon folio-2025](https://github.com/brunosimon/folio-2025) 的用途区域/渲染采样，参考 [Roost](https://github.com/sorryhumans/roost) 的稳定座位与回退。采用现有 Three r186 [Points](https://threejs.org/docs/pages/Points.html) 的单 buffer 粒子，共享几何材质、缓存尺寸、DPR 上限 1.5。

没有搬预设任务或时间窗口推忙闲，没有移植整个 React/物理/后处理体系，没有下载执行第三方代码、复制模型或增加依赖。当前需求是让真实身份可巡视、可选择，同时保持消息和终端核验可信；调研与边界见 game-scene-github-research.md。

## 根协调者本轮独立验证

| 验证 | 实际结果 | 证据 |
| --- | --- | --- |
| 全 Python unittest discover | 126 tests，exit0，0FAIL/0ERROR；既有 pydantic forward-reference warning 保留 | work/game-scene-root-python-r1.json |
| 完整本机 Edge fixture | 39 场景/1334 checks/0失败/0limitations/exit0，4语法检查0，browser与helper正常清理 | work/game-scene-root-browser-r2.json；work/robot-cockpit-fixture-r1-2026-10-04T15-47-37-077Z.json |
| 全结果/冻结/性能独立核验 | 全检查与27当前字节及8测试资产一致，12角色目标达到，exit0 | work/game-scene-root-audit-r2.json |
| 精确 owned 网关重载 | exit0，原40880身份/父进程/镜像/命令/出生时间与保留句柄核验，新28400→36168健康 | work/game-scene-root-reload-r1.json |
| 实际 GET 与固定只读库 | 128 checks/0失败/exit0，113真实身份全部恰好一次，无正文、POST或新SSH | work/codex-index-root-live-r1.json |
| 当前 IAB 页面 | 9检查/0失败/exit0，真实本聊天pressed，3D/归位/暂停/恢复巡游、未知活动、远端动作禁用 | work/codex-index-root-browser-r1.json |

完整 Edge 还验证：真实 3D raycast/像素拾取完整命名键、同 UUID 双来源隔离、25 条分页、Array UUID拒绝、30秒迟到响应拒绝、短等待计入年龄、旧远端消息 epoch 隔离；巡游/粒子 buffer 复用/选中冻结/普通 hover/拖动冻结/释放恢复/360px/隐藏与reduced motion/context loss/dispose；原消息45边界、focus/连接资格、网络与降级用例仍执行。

固定测试样本均为明确合成 fixture，没有写到生产索引。最终 Edge 1024×900/DPR1/可见真实 rAF 各约10秒：0角色165FPS/p956.3ms；12角色165FPS/p956.3ms；48角色161FPS/p957.8ms。12目标 p95≤20ms、>33.3ms比例<1%，本次为0。前一全量轮48角色67FPS/p9519.7ms，负载波动明显，两轮都保留；不保证任意设备或持续游戏帧率。

IAB 实际1280×720/DPR1.25：选择时55FPS/p9518.3ms；后续正常DOM窗口值165FPS/6.2ms和100FPS/18.0ms，恢复瞬间169FPS不是稳定基准。DOM是近期窗口读数，不能当作连续10秒benchmark或GPU实测。Cua选择实际卡片与控件；真实canvas指针拾取由隔离Edge验证，未冒称实机IAB鼠标拾取。

实际截图 `work/game-scene-iab-full-r1.png` SHA `C6CCA33309E13C641EDF74048B001D482C640E12BF199510C3B2F29B81BA79F5`；已视觉检查12真实身份机器人/房间/工位/身份详情/远端缺证。截图证明画面，不证明流畅度。

## 全部已见失败与限制

- 根 browser r1 1334检查/4失败/exit1，work/game-scene-root-browser-r1.json 与 15-42-17 fixture 原样保留。4条新断言错误用全 report 累计请求==0，实际三Codex场景只有显式远端选择的reads1/0/1、POST全0。修为各场景初始计数差值，并把beforePicks提前3D点选之前；只改测试，完整r2重测0失败。
- 作者临时库首轮9Win32清理ERROR+2MockFAIL/recheck2FAIL，另诊断sys.path导入失败；fixture连接close/Mock同名uri参数修正后15tests0失败。生产reader原有finally.close未放宽。详见 codex-conversation-index/impl_report_r1.md 全原记录。
- 独立Impl reviewer首轮检查器CRLF匹配失败exit1（15tests/Node本已0），构造修正版的引号SyntaxError exit1；新verify-r2为4/0/exit0，原记录保留。
- LW根Gate1 r2文本比较46/1失败与独立LW旧pin41/1失败保留，新根47/0、独立41/0及根Gate2 30/0放行；不是改权限消除失败。
- 本轮先期查LW文件未生成时exit1、研究CLI/旧路径错误和截断补读均已纠正；Codex控制socket version只读探测os10050 exit1仍未解决，未启新app-server。
- 历史根全Python Win10053两轮失败、旧harness路径MODULE_NOT_FOUND、旧reload DateTime/per-image命令守卫失败仍在 wezterm-session-link/delivery_existing_r4.md 与 work/原记录；本次绿色不解释那些根因已消失，不关闭旧实机BLOCKED。
- Git rev-parse exit1确认此目录无Git仓库；未初始化、commit或push。根README同步已保存before，本项目缺文档规范属于范围外发现，遵从用户范围纪律未额外初始化文档体系。

## 可追溯输入与审查

完整before：work/game-scene-before-r1/ 与 work/codex-index-impl-r1/before/；最终27字节快照、10文件组合diff：work/game-scene-root-final-r2/；manifest SHA `6A9C48561226E408531D3F0509BCC1CA3B54CDAFC71B0D3751F0441A0F98DC5C`。展示作者 r1–r4 与正式Codex作者报告均保留；没有覆盖失败文件。

独立展示审查 [最终报告](game-scene-review-final-r1.md) PASS，独立66项/0失败/exit0；正式Codex [Review(Impl)](codex-conversation-index/review_notes_impl_r1_1.md) 协议PASS/本身份索引范围业务PASS，独立15临时测试、30静态与34最终证据检查均为0失败。root已完整读两份最终报告及独立命令结果。该放行不覆盖Codex正文/实时状态或旧WezTerm BLOCKED；最终root字节/证据/文档门为 work/game-scene-root-delivery-r1.json。

下一项真正提高开发效率的工作：在当前已退出后台的状态边界内，先取得真实活跃 SSH/Claude→UUID→Zellij pane→WezTerm client 映射证据；Codex实时能力需连接受支持的订阅接口。没有上述证据，角色只表达身份，无法展示正在做/卡住/已完成。安排位置目前是按身份自动分配稳定工位与显式归位，未实现自由拖拽编辑地图。

建议提交消息：`feat(cockpit): add roaming robot workspace and local Codex identity index`。
