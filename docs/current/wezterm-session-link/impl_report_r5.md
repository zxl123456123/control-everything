# R5 新 GUI 精确 pane 定位实施报告

feature_name: wezterm-session-link  
impl_round: r5  
date: 2026-10-05（Asia/Shanghai）  
lwplan_version: 唯一 lwplan.md §8 / SHA `898EE858ECAE67CF6808E488FEB134E3182C2DE38F5BA5F4D6375D3FC98ECC2E`  
author: wezterm_focus_lw_r5  
实施结论: 本地定位补丁与直接测试已验证；真实运行验收交 root，整批不判 PASS。

独立 Review(LW) `review_notes_lwplan_r5_1.md` 全文已读，root 明示其独立 Gate-2 为 `4ea5f8` / 116项0失败 / exit0 后放行实施。用户持续自动实施授权已记在§12，不重复请求相同阶段许可。作者未把 root 的 Gate 数字当自己独立执行记录，未自行放行。

## 变更事实与可追溯性

| path / change_type | change_purpose / key_changes | related_tasks / final SHA |
| --- | --- | --- |
| `session_panel/terminal.py` / modify | 原 exact-ID action 的其它 post guard 全部成立、真实客户端尚未到目标时，才进入固定 tab-ID＋有界 next；每步读取实际client与fresh pane清单，最后完整关联与target后验。普通tiled候选按完整字段校验，目标held拒绝，邻居held只focus；原成功分支不追加动作 | S2-R5；`87D0BD97FDA0C1176732C5CCDB3C865F2ABBE1C7BFE9B7E25EAD1CAD95BD037C`；+81/-1行 |
| `tests/test_focus.py` / modify | 独立实际字段形状和客户端移动序列；新GUI exact-ID no-op先red，再验证跨tab、遍历held邻居、插件命名空间、清单变化、客户端/完整关联变化、循环/no-op、非0与预算拒绝；原九项focus测试保持 | S4-R5；`B5E211C2433A0571025A5D6B28FF9A8EBA17D9E5F604B055D891F2E3ABDD8CC2`；+164/-0行 |

新增产品文件：无。新增私有函数只有 `_focus_candidates`、`Terminal._focus_next`；保留原函数集合与实现，只有 `_focus_session` 授权分支变化。`terminal_id/parse_slot_command/parse_clients`、Terminal init/run/list_panes/focus_session/connect_workbench、module focus wrapper 的 AST 全保持原值。29路径before集合中其余27项完整SHA一致，包括native/workbench/gateway/来源/正文/MCP/UI/图形/vendor；LW和Review(LW)也未改。

before：`work/wezterm-focus-impl-r5-before.json` 与 `work/wezterm-focus-impl-r5-before/` 两文件完整原字节。准确差异：`work/wezterm-focus-impl-r5.patch`，SHA `1DFF64D666ECD4B0FC66DF912C17DE73A658335C00CE896AD151E485AF358571`；final manifest：`work/wezterm-focus-impl-r5-manifest.json`。没有Git repo初始化、commit或push。

## 目标对齐

goal_lock_check: G3/§12以同一真实client最终选中exact pane为成功，不能以exit0或到tab代替。保留 requested/fresh UUID、process instance、slot、pane、remote age，initial/pre/post完整 server/GUI/directattach/mux/client-ID关联与fresh integrity；fallback成功后重新完整observe与清单终验。G1/G2状态/连接不改。

anti_goal_touch_check: N1/N2/N3保持。没有字符输入、write、创建/复活、named启动、旧launcher、任意参数endpoint、D盘配置或工具变更；不改5秒budget/age、不缓存unknown或重置refresh_finished；动作仍共享原lock/latch，list_panes不重拿锁，失败不自动恢复焦点。返回原focused/status/reason/pane_id/exit_code结构，非0动作和可取得exit的fallback清单失败保留非0，未知/异常保守focus_sent_unverified。

authoring_ergonomics_notes: 两个小私有函数、tuple/frozenset和原parser；固定tab动作及有限next循环顺读，少量重复原post guard保留可读性。未新增策略/状态/异常层级/配置框架。测试复用原小fixture，新增序列只描述外部行为，不创建Zellij模拟器；旧直接成功fixture没有新字段仍通过。

## 作者实际验证与全部本轮失败

所有命令仅 `impl-safe` mock/direct-handler或静态，不运行HTTP、浏览器、真实Zellij动作/GUI/SSH/安装/服务/D写/Git。读取并执行 verification-before-completion；所有工具输出全文、真实exit已读，没有管道截尾。

| 真实执行记录 | evidence / owner / conclusion_if_missing |
| --- | --- |
| `77ea5d` / exit0：写入前核29产品与冻结LW，保存两原文件 | before JSON与原字节；owner=impl；缺则范围与可回滚证据不成立 |
| `5783da` / exit1：`.venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-impl-r5-run.py red`，1 test/1 failure，旧实现不能确认新的no-op症状 | `work/wezterm-focus-impl-r5-red.json`，原argv、完整stdout/stderr及base64；owner=impl；缺则不能证明测试能发现原缺陷 |
| `3d5cdd` / exit1：同runner `green`，72 tests/1 error | `work/wezterm-focus-impl-r5-green.json`；owner=impl；失败必须保留，不能称首次green通过 |
| `ca41bc` / exit0：同runner `green-retry1`，74 tests/0 failure或error / 0.652s | `work/wezterm-focus-impl-r5-green-retry1.json`，完整stdout/stderr/bytes；owner=impl；缺则本地行为未验证 |
| `c55a50` / exit0：`.venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-impl-r5-static.py`，50项全部true | final manifest＋准确patch；owner=impl；缺则语法、字节范围、原保留函数及red/green关联未证 |

runner的实际unittest argv为 `.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_focus tests.test_workbench tests.test_native_processes tests.test_gateway.GatewayDispatchTests -v`；red只执行新的no-op正例，未改产品时先失败。stdout/stderr均从原bytes保存并由静态核验严格解码相等。

首次green失败原因是测试在原已held的main邻居上写 `is_held=True`，实际上未改变fingerprint，产品正常成功而测试索取reason导致KeyError。改该测试为False造成真实变化，保留原失败，没有改变产品拒绝边界。另补遍历途中和最终清单增删/command/held变化，以及原完整post各identity变化禁止fallback；因此最终74项与首轮72项不同，不能混报为同套重跑。过程中还补清单可取得的非0exit保全，与LW原非0口径一致。

LW阶段首检164/3字面匹配失败与聚合读取截断由§8原文保留；本轮未改其记录。root真实三轮23项6失败、numeric/先切tab后exact-ID no-op、一次next正例及r4全部历史失败保留，不被本地74项绿覆盖。root告知另项native实际main间歇失败，将独立R6处理；作者没有读取该报告冒充独立核验，也没有据此改native或削弱关联守卫。

## coordinator_handoff_verifications

| 尚未由作者执行 / 移交原因 | evidence_expected / owner / conclusion_if_missing |
| --- | --- |
| 独立完整Python含临时HTTP/stdio、原浏览器fixture回归；超过本作者mock边界 | fresh全量命令/完整stdout-stderr-exit、fixture verdict与final bytes；owner=root；缺则只有局部mock，不给全套PASS |
| 从其它tab/非目标pane开始的当前真实dev UUID定位、其它候选起点、重复定位；需要真实CLI/GUI/远端环境 | 原UUID/process instance/slot、5秒与remote age分段计时、独立list-clients exact target、完整server/GUI/directattach/mux/SSH身份前后、其它held命令保持；owner=root；缺则实际定位未验，目标本已选中不能代替新GUIno-key场景 |
| 自建gateway加载本次exact bytes；服务重载由root掌握归属 | 新listener/launcher完整image/argv/ctime/directparent、health与加载hash、内存index/last_evidence丢失说明，不能清未知latch逃避回收；owner=root；缺则现有8766不被视为已加载补丁 |
| 新Codex/Claude UUID机器人、原生点选/刷新、测试正文与生命周期；真实browser/来源范围 | 每个实际UUID准确一次、空间/刷新隔离、远端marker读取、退出/重建证据；owner=root；缺则对应能力待验，不声称Codex正文/活动或session协作 |
| fresh实施review及所有失败审阅 | 新Review(Impl)读取本次patch/manifest/全部red/green和root真实证据；owner=fresh reviewer与root；缺则不进入整批PASS/归档 |

真实owned GUI失败回收、父Q6和其它旧BLOCKED仍独立，不随本定位正例关闭。特殊floating/fullscreen/可选plugin布局仅fallback保守拒绝；原exact-ID成功不受新增字段要求影响。中间步list-clients并非原子连续完整进程握手，最终完整关联变化拒绝，原CLI竞态限制保留。

## contract_drift_reports、风险与回滚

contract_drift_reports: 无新增需要改基线的漂移。R5继承r3.1/r4只读识别与native合同，当前未改；root native间歇race/关联波动另项不合并。旧Gate/阶段/“terminal本轮不改”按旧轮次解释，§8已定义当前覆盖关系。

未完成：root真实预算和重复定位、全链回归、fresh Review(Impl)。多次完整observe与清单共同消耗原5秒；如实际耗尽，保持未确认，回唯一LW重Gate，不删post或延长预算。失败可能已经改变焦点，不自动恢复；不能把一次mock成功称能力稳定。

回滚信息：需人工介入；root以exact before/patch核仅这两文件后可撤本轮增量，不覆盖其它工作或冻结报告，不杀终端/server/SSH、修改D配置或重启绕过latch。本作者仅保存原字节，未执行restore。

建议英文提交信息：`fix(terminal): confirm exact pane focus for newly attached clients`。

无新增跨功能事实。
