# R5.2 定位补丁：保留 fallback 版本查询失败

feature_name: wezterm-session-link  
impl_round: r5.2（fresh reviewer P2 补实施）  
date: 2026-10-05（Asia/Shanghai）  
lwplan_version: 唯一 lwplan.md §8 / SHA `898EE858ECAE67CF6808E488FEB134E3182C2DE38F5BA5F4D6375D3FC98ECC2E`  
author: wezterm_focus_lw_r5  
实施结论: 当前两文件本地验证通过；root真实运行与fresh实施审查尚待，整批不判PASS。

本报告是当前final；[impl_report_r5.md](impl_report_r5.md)及原patch/manifest/74项green全部保留为前一稿历史，不覆盖旧结论或失败。root明确传递fresh reviewer P2并授权在相同R5合同、相同两文件内补修：fallback任一可取得的非0命令exit要保留，不能被version查询吞成exit0未确认。没有新增用户许可或技术目标。

## 变更事实

| path / change_type | change_purpose / key_changes | related_tasks / current SHA |
| --- | --- | --- |
| `session_panel/terminal.py` / modify | 累积原R5普通tiled候选、固定tab/有限next与完整终验；本轮只将 `list_panes` 的version非0返回附exit_code，exit0文本版本不匹配保持原reason/无exit；fallback中间与最终后验保留该非0为focus_failed，不追加定位动作 | S2-R5；`4448255D75B81D1E7BC4A18A28A0CED791E39A57C57ABD4E09DD9B354062BC39`；相对原before+86/-2行 |
| `tests/test_focus.py` / modify | 累积原R5九个行为组；新增中间/最终version非0先red再green，以及exit0文本版本不符继续未确认且不再focus；原exact成功与拒绝语义仍保留 | S4-R5；`5BDC13645241C46BD3E6D409C41566CF4FAFB2690A06AEB0F56B1507A7977A6B`；相对原before+188/-0行 |

新增产品文件无。当前准确原before→final patch为 `work/wezterm-focus-impl-r5-reviewfix1.patch`，SHA `243BEFE3BB9CFAC479C5A9A99A55E08887F9FF2335B223C31D203ADC34B496F0`；manifest为 `work/wezterm-focus-impl-r5-manifest-reviewfix1.json`。原before JSON/两原文件与前稿patch/manifest均不改。29路径中其余27项当前SHA一致，native/workbench/HTTP/来源/正文/UI/图形/vendor不变；唯一LW与Review(LW)不改。

goal_lock_check: G3/§12仍需同一真实客户端最终exact pane；原UUID/process instance/slot/pane、fresh pins、initial/pre/post全身份关联、候选fingerprint、age/5秒预算及lock/latch保持。新增非0保全只修输出口径，不以exit0或近似tab确认成功，G1/G2连接/状态不改。

anti_goal_touch_check: N1/N2/N3均不触及。无键盘字符/write、恢复命令、启动/清理权限、D配置、工具升级、通用命令endpoint或native变更；旧exact成功无新增动作，新fallback终验失败也不再focus、不自动恢复旧焦点。

authoring_ergonomics_notes: 版本非0和文本不符两条直线分支，没有异常/策略/配置抽象。static对原 `list_panes` 只允许这一明确版本guard增量，余下原函数仍AST一致；没有为守住行数删掉原完整post条件。测试按外部失败行为，不把实现内部状态机械镜像为测试。

## 本轮实际验证与失败保全

| 执行 / 实际结果 | evidence / owner / conclusion_if_missing |
| --- | --- |
| `be3d1c` / exit1，1 test/2 sub-fail：中间第3次和最终第5次version非0都被前稿吞成focus_sent_unverified | `work/wezterm-focus-impl-r5-red-version.json`，完整argv/stdout/stderr/base64；owner=impl；缺则不能证明测试发现P2原缺陷 |
| `d4149e` / exit0，76 tests/0 failure或error，1.761s | `work/wezterm-focus-impl-r5-green-reviewfix1.json`；owner=impl；缺则当前本地行为未验 |
| `a8156f` / exit0，55项全部true：当前27未改路径、冻结LW/review、两AST、原函数＋精确授权version delta、五份red/green原bytes/exit与准确patch | `work/wezterm-focus-impl-r5-manifest-reviewfix1.json`；owner=impl；缺则范围/字节/证据关联未证 |

实际mock命令仍 `.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_focus tests.test_workbench tests.test_native_processes tests.test_gateway.GatewayDispatchTests -v`，由固定本地runner保存原argv和全部bytes；red-version只运行新的失败用例。静态命令 `.venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-impl-r5-static.py reviewfix1`。均完整输出与真实exit已读，无管道截尾；没有真实HTTP、CLI、GUI、SSH、服务、安装、D写、Git或递归委派。

前稿 `5783da` 原症状red 1失败/exit1、`3d5cdd` 首green 72项1error/exit1（held邻居本已true却以true当变化）、`ca41bc` 74项green/exit0均保全。P2说明前稿74项本地绿没有覆盖version非0，不是全业务通过；新的76项绿也不证明实机定位/预算。root既有23项6失败、numeric与先tab后ID no-op、关联波动、所有旧r4失败仍保持原记录，不被本轮green覆盖。

## coordinator_handoff_verifications

| 未由作者执行 / 移交原因 | evidence_expected / owner / conclusion_if_missing |
| --- | --- |
| root独立当前完整Python/临时HTTP/stdio与浏览器fixture，超过本地mock权限 | 当前final bytes、完整stdout-stderr-exit/fixture verdict；owner=root；缺则只有本地76项，不给全套PASS；前稿root绿不得绑定新hash |
| 当前真实UUID从其它tab/非目标pane定位、其它候选和重复请求，需要真实环境 | 分段/总耗时、原remote age、独立真实list-clients exact target、同server/GUI/directattach/mux/SSH前后身份、held命令保持；owner=root；缺则定位稳定待证，已有目标焦点不能代替新GUIno-key场景 |
| 自建gateway加载当前两文件，需要服务归属 | 新launcher/listener完整image/argv/ctime/directparent、health和hash；明确内存index/last_evidence变化，不清未知latch逃避遗留；owner=root；缺则不能称8766已加载本稿 |
| 新Codex/Claude实际机器人、正文、生命期与独立fresh Review(Impl) | 各实际UUID一次、原生点选/刷新隔离、测试marker及退出、当前patch/manifest/全部red和root实际结果；owner=root/fresh reviewer；缺则对应运行能力或整批审查待证，不称Codex正文/活动/协作已实现 |

contract_drift_reports: 无需回退LW的新目标漂移；P2是§8既定非0合同的遗漏，经root明示按同范围修复。原 `list_panes` 字节保持的前稿陈述现在只有“精确授权version delta除外”，本报告与static明确这一例外，不默许其它方法变化。native关联race属另项R6，作者未改采集器或放宽pre/post。

未完成与风险：root真实共同5秒预算、重复定位、完整回归和fresh Review(Impl)。预算不足仍未确认；不得延长预算、删post或缓存unknown收口。真实owned GUI失败回收、父Q6及其它旧BLOCKED独立保留。

回滚信息：需人工介入；root按original before和当前准确patch仅撤本轮两文件增量，不覆盖其它工作/冻结报告，不改D配置、杀终端/SSH/server或重启清latch。本作者只保存原字节，未执行restore。

建议英文提交信息：`fix(terminal): confirm exact pane focus for newly attached clients`。无新增跨功能事实。
