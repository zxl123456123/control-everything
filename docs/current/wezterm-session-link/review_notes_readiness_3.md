# Readiness 检查记录（第 3 轮：独立 mux 窄 delta）

**review_target**：readiness；**日期**：2026-10-04；**评审结论**：PASS，仅允许继续唯一 LW。沿用 [r1](review_notes_readiness_1.md)、[r2](review_notes_readiness_2.md) 的未变合同和已读源码，不改写冻结报告，不重复用户许可。

## 输入文件与独立证据

| 输入 | 当前 SHA-256 |
| --- | --- |
| clarifications（含 §11） | CBABB6F7527B7DFBBA37DEEB086841AACBDD164AE857FE5D81D1EED7535A9830 |
| README | DD520F3CDCC50BBE871E4AFB423D64B935552DBDB1064586AA8674D6341AA15C |
| readiness_1 | A9AD9E9FF9DDFA5063FF71F61BB971B4A33B995862BBB74D7492B85AD0425C03 |
| readiness_2 | 8B0BE7927DA75C3DE7A92142576F0B06E369DAA5E8FFE9E4DE670D77CC596B8A |
| 27产品before manifest | 6359AABC11C8369336B62222D92B69D859E073AC8295B71847BA4944582A8BA1 |
| 固定wezterm.lua | 5F90382893F27C75A250B91249EE87CC383BEBA4C63B297A1644A8CBB456A74C |

本轮完整读当前基线、固定Lua，实际核27当前产品/before副本/manifest一致：`62dbf6`，**27 checks / 0 failures / exit0**。只读CIM `66c935` / exit0再次看到原server5612和外部纯mux44644；该mux为固定外部EXE、argv仅EXE、父57000、CreatedUtc `2026-10-03T15:10:36.0770010Z`，与§11一致，无GUI/attach。另有瞬时Zellij258076、父120684、固定`action list-panes --all --json`元数据查询，不能计成交互attach或把全量清单写成仅server。未证mux历史所有者/内部客户端覆盖；未改产品或外部文件，未运行GUI/attach/watch/focus/本地HTTP/SSH。

## 澄清与基线核验

| 核验 | 本轮结论与锚点 |
| --- | --- |
| ①未回答Q&A | 空；技术分类delta没有新用户问题 |
| ②漏记澄清 | 无；§11保留采样覆盖修正、历史归属未知及搜索失败 |
| ③决策落盘 | 完整；只读固定profile、unmanaged_mux_count、前后身份稳定 |
| ④必填1—10章 | PASS，非空；§11补充同一基线 |
| ⑤目标锁 | PASS，G1/G2/G3不变；mux不冒充GUI/client |
| ⑥反目标 | PASS，见禁止项表 |
| ⑦风险责任 | PASS，不采用/连接/清理外部mux；未知仍拒绝 |
| ⑧验证责任 | PASS，沿用§4/8作者→root→fresh reviewer及work证据，未验不得成功 |
| ⑨Q&A一致 | PASS，见映射 |
| ⑩需求溯源 | PASS，见原文→决策→基线链 |
| ⑪目标/反目标 | PASS，分类例外不改变启动或归属权限 |
| ⑫风险/验证 | PASS，Lua无domains/default_domain/connect_automatically；已有固定PROG、always-new-process/no-auto-connect、清继承socket，实际独立启动仍root验 |
| ⑬research对齐 | PASS，非原子pin/无限retry/非握手/锁/owned清理均保留，不伪造已证所有权 |

**禁止项清单**：

| 禁止项 | 可核查锚点 | 确认未引入 |
| --- | --- | --- |
| 接管、连接、停止/清理外部mux、称root所有 | §11“不采用、不连接、不清理”及历史归属未证 | 是 |
| 一般mux例外或未知放行 | §11仅实测固定exe/name/单argv/完整created；额外flag/其它路径/坏字段仍拒绝 | 是 |
| mux充当GUI/client或伪造覆盖 | §11独立计数；决策6仍唯一关联观察非握手 | 是 |
| 旧launcher/create/force/EnsureTabs、复活/新建SSH/session、改reader/MCP/源/CSP/图形/5与30秒、browser argv、IPC/一般进程树清理 | N1/N2/N3、决策4/7；§11不使用PATH wezterm cli | 是 |

**Q&A→基线映射**：日常效率/既定3D回退→G3/N2/§7不变；三项WezTerm联动后“继续”→G1/G2/G3、§11仅补观察分类；“自动实施代码即可现在”→§8/10且不增加外部mux动作。均一致。

**README→决策→基线溯源链**：README“连接现有工作台、显示后台/窗口/client”→已确认G1/G2→§11区分独立纯mux，避免误标工作台GUI及长期误阻；README“固定工作台、不复活/扩大来源”→决策4固定新GUI/PROG→§11严格只读profile、N1/N2/N3不变。

## delta三元组与scope

| 具体原状/修正 | 对LW影响 | 恢复动作 |
| --- | --- | --- |
| 全相关outside-fixed-exe一律拒绝会长期拦无关纯mux | 仅此实测严格profile计unmanaged_mux_count，不参与GUI/Zellij关联 | LW补正例及flag/其它路径/坏字段负例，不一般支持mux |
| 父已不在、历史来源/内部client未证 | 不称所有、不采用/连接/清理 | 前后完整identity稳定，变化拒绝；保留不可观察覆盖说明 |
| 固定Lua及原生独立启动条件已具备 | 保持固定PROG/always-new-process/no-auto-connect/清socket | Gate-2核参数与负例；root真实验未接管mux |

## 缺失证据与恢复动作

该窄delta足够继续唯一LW；具体profile/计数/身份变化与拒绝测试需补入同一lwplan.md。真实连接、未接管mux、UUID focus、原server/SSH/pane保持及失败回收仍未验，责任沿用r1/r2，fresh Gate-2后才实施。

## contract drift / stale / mirror mismatch

§11修正“窄采样即全量无WezTerm”的错误口径；r1/r2冻结。基线§9阶段文字仍前轮留存，README实际LWPlan，后续状态维护同步即可；无第二套基线或新mux管理权限。

## 放行判断

- allow_enter_lwplan: yes（继续唯一lwplan.md）
- allow_enter_impl: no（仍须Gate-1与fresh Gate-2）
- close_previous_robot_or_parent_Q6: no

## 本轮验证与失败留痕

沿用已读verification-before-completion。当前基线/hash `b20e20`、manifest结构 `a1d74f`、CIM/Lua `66c935`、27产品before核查 `62dbf6`均实际exit0且完整读输出。没有本agent新失败。§11保留root初次rg通配路径exit1与历史无匹配不证明来源；root告知premature读尚不存在本报告exit1，仅是产物未落盘，不能省略或称产品故障；r1/r2与root其它失败留痕不删。

最终输入/冻结hash与报告字段自证由尾后实际命令输出/exit回传。它不证明联动已实现。无新增跨功能事实。