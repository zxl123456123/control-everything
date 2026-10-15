# R6 实施：同一期限内最多三次完整原生清单

feature_name: wezterm-session-link  
impl_round: r6  
date: 2026-10-05（Asia/Shanghai）  
lwplan_version: 唯一 lwplan.md §9 / SHA `960DA811086730F03E7E9C231B4CCAC58DE6C133C8F70CEA473A109DCE9D217F`  
author: game_scene_final_review（本轮 R6 实施角色；此前仅参与 R5 terminal/test_focus 审查，未实施 R5）  
实施结论: 当前两文件本地 mock 与字节范围验证成立；真实并发改善、面板观察和 fresh Review(Impl) 待 root 承接，整批不判 PASS。

root 因原实施作者已退出，将 R6 两文件交给本作者。完整读取 safe-code-changes、当前 native/test、唯一 §9、输入 manifest、§13/恢复材料与 fresh Review(LW)。收到正式技术 Gate2 放行前只读，没有提前改产品。root 放行依据为 `work/wezterm-census-lw-r6-root-gate2.json`（59项/0失败/exit0）；fresh Review(LW) SHA `EAB9A6F6F049A8A41D4CDD7F2C444C98E25E77142B8D78BCCCB4F29F8C5FB5F5`。用户持续自动实施授权覆盖阶段入口，技术 Gate 保留。R6 作者不得自审 R6；R5 与 R6 的实现和运行结论分别记录。

## 变更事实

| path / change_type | change_purpose / key_changes | related_tasks / 当前 SHA |
| --- | --- | --- |
| `session_panel/native_processes.py` / modify | 仅替换 main 的原单次 census 调用：一次生成原 5 秒 deadline，共最多3次完整 census；只对精确 ValueError(api_failed/invalid_identity) 重试，close_failed note、其它异常和第三错原样交回旧消毒出口。完整成功立即退出、输出一次 | S1-R6；`E48BB1D20DA9FE32D17B60457A94C6DCB9B44249EEA02FBC7105FA70870ABA4A`；+10/-1行，8173 bytes |
| `tests/test_native_processes.py` / modify | 新增七个行为测试及一个本地输出捕获辅助方法；验证首错恢复、两错后第三成功、部分清单丢弃与句柄关闭、三次上限、不可重试/关闭失败、原期限禁止第二个 snapshot、合法空清单。旧持续后续行失败仍拒绝，仅关闭轨迹2→6 | S2-R6；`1FA7DDEC92582F7D81BADAA22109418DFC06B590D4C42CBC73D4609F29C44C41`；+98/-1行，24567 bytes |

新增产品文件无。准确 before 保存在 `work/wezterm-census-impl-r6-before/`；总 before 清单为 `work/wezterm-census-impl-r6-before.json`。准确原字节 diff 为 `work/wezterm-census-impl-r6.patch`，SHA `41C8A556BCCCB8364383F819F90868061BBCA448E81CCB98305E6DA647B2E455`；最终 manifest 为 `work/wezterm-census-impl-r6-manifest.json`。

本轮独立快照含29产品/测试来源，其中其余27项保持原 SHA，包括 R5 最终 terminal `4448255D…BC39` 与 test_focus `5BDC1364…7A6B`。LW/clarifications/feature README/Review(LW) 当前四份权威文档未改。static 以原字节单块替换重建整个 native 文件，逐字相等；main 外的全部函数字节、API/ABI、六字段 rows、snapshot_ticks 取时位置、query_row 守卫、句柄关闭和 outer 消毒出口均未动。测试原函数 AST 保留，唯独明确的关闭次数2→6与已批准三次完整失败轨迹一致。

goal_lock_check: G1 的完整失效样本仍失败；只重取新的完整清单，不接受部分 rows。G2/G3 原关联/UUID/instance/slot/pane、fresh pins、年龄、预算、前后身份、lock/latch 与 R5 定位均不变。helper 新循环只减少有限瞬态采样失败，不证明真实关联或准确焦点稳定。

anti_goal_touch_check: N1/N2/N3 均不触及。不跳行、合并样本、缓存成功、移动出生时间门槛、增加期限，不创建/复活/输入/清理终端，不操作 D:、工具、解释器、HTTP、来源/reader、MCP、UI 或图形。失败继续 stdout 空、单一原消毒 stderr、exit1。

authoring_ergonomics_notes: 主入口一个短循环，使用已有 ValueError、deadline 与 outer except；没有策略、配置或异常框架。测试复用原 FakeApi/Mock/patch。恢复序列通过 mock 独立断言最早期限；部分清单丢弃测试走真实 census 代码但所有 API 均是假函数，没有启动 helper 或打开系统进程。

## 本轮实际验证与失败保全

完成判断前已全文读取 verification-before-completion；实际命令输出和退出码本轮均已读，没有管道截尾。

| 实际命令 / 结果 | evidence / owner / conclusion_if_missing |
| --- | --- |
| before 输入与原字节检查 `a3d589`，exit0：正式当前 manifest/plan/review 与两文件、R5冻结匹配后保存新快照 | `work/wezterm-census-impl-r6-before.json`；owner=impl；缺则不能证明实施起点和权限范围 |
| `.venv/Scripts/python.exe -X utf8 -B work/wezterm-census-impl-r6-run.py red`，`a0f395` / exit1；57 tests / 9 failures / 0 errors，0.204s；产品仍原115D字节 | `work/wezterm-census-impl-r6-red.json`，完整 argv/stdout/stderr/base64和当次两 source SHA；owner=impl；缺则不证明回归能发现旧单次实现 |
| 同 runner `green`，`215f9e` / exit0；同57 tests / 0 failures/errors，0.184s；测试字节与 red 完全相同 | `work/wezterm-census-impl-r6-green.json`；owner=impl；缺则当前局部行为未验证 |
| `.venv/Scripts/python.exe -X utf8 -B work/wezterm-census-impl-r6-static.py`，`ea9acc` / exit0；82项全 true、0失败 | `work/wezterm-census-impl-r6-manifest.json`，两 AST、准确 patch、29来源、4权威、全部原函数、red/green bytes/exit与tested hash；owner=impl；缺则范围与证据关联未证明 |

runner 内完整原命令是 `.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_native_processes tests.test_workbench -v`。只有本地假 API/Mock；没有真实 Win32/census helper、CLI、HTTP、数据库、GUI、SSH、服务、Git 或递归委派。

red 的9处失败全部保留：原 main 未重试导致三种恢复子例失败；不同第二完整清单恢复失败；连续错误只有一次调用（两子例）；首错后未抵达第二个不可恢复错误；期限到达后尚报首个 api_failed；旧持续失败关闭轨迹仍2而新合同应6。没有修测试断言来换绿，产品10行增量后同一测试字节得到 green。不可恢复与 close_failed 的旧拒绝例在 red 已绿，实施后仍绿。

当前测试明确覆盖 ValueError 的精确字串与类别；OSError/RuntimeError 即使文本是 api_failed 也只调用一次，未知 ValueError 消毒但不重试。带 close_failed note 的两类可重试异常立即失败、payload 保留 note；第一份失败在共享5秒边界关闭后，第二次 census 在入口期限校验拒绝，只有一个 snapshot。合法空列表首成功不重试。

继承失败不关闭：输入的原并发15中5失败、低层100中11/15失败、实际 main30中7失败和探针7/9/10空 stdout均保全；它们由 root 真实证据记录，不是本作者执行的实机测试。旧 R5 三次 exit0/no-op、numeric/tab-ID no-op、loaded-first 的 binding_unknown/terminal_action_busy、其它 timeout/关联波动仍待运行复验。旧 r4 BLOCKED、Win10053、native 旧 unknown、Lua drift、redirector/collector/guard/路径和历史检查器失败仍按旧报告保留。本轮没有借57项绿宣布上述全部修复。现有1361前端 fixture零失败但12机器人p95约20ms未达16.7ms目标，属于 root 已报告的展示限制，R6不改图形或将其称稳定。

## coordinator_handoff_verifications

| 未执行 / 移交原因 | evidence_expected / owner / conclusion_if_missing |
| --- | --- |
| 当前 final 完整Python/临时HTTP/stdio和必要浏览器回归；超出本地 mock 权限 | 当前两文件SHA、完整 stdout/stderr/exit及所有失败，不能绑定旧R5.1全135绿；owner=root；缺则只有当前57项局部结论 |
| 真正主入口在并发 CLI 负载下的30轮与新100轮窗口；依赖实际系统 API | 原 fixed base image，`work/live-session-native-main-stress-r6.py` 对真正 main 的全部样本/时延/退出与完整六字段类型身份验证；另记每份探针返回码和解析缺口；owner=root；缺则真实重采样收益待证，direct census 继续拒绝不能替代 main 验收 |
| 原 IAB Promise.all 刷新/可见轮询与真实工作台前后关联；需要HTTP/GUI | 正常并发窗口的 unknown/timeout、client/pane、年龄、原 server/GUI/directattach/mux/SSH身份。保持helper清单、唯一关联与R5精确focus三层口径；owner=root；缺则不能宣称面板稳定 |
| 当前网关加载及 R5 同UUID跨tab/非目标起点/重复定位；需服务与终端动作 | 仅归属确认的新gateway image/argv/ctime/directparent/health与加载SHA；内存index/last_evidence变化明确、不清未知latch；每次独立list-clients exact target及总期限；owner=root；缺则不能称8766已加载或定位稳定 |
| fresh R6 Review(Impl)与旧独立缺证 | 新 reviewer读current bytes/准确 diff/red/green与root实际全部失败，正式 report；旧owned GUI失败回收、父Q6、Codex正文/实时活动仍单独验收；owner=root/fresh reviewer；缺则不交付整批PASS。本作者不自审R6 |

contract_drift_reports: 未发现需改写方案的新目标漂移。调度从旧作者转本作者已显式记录，不扩大权限。R5两文件冻结保持，R6只消费§9/§13；历史研究“可评估2次”由正式已记录共3次决策覆盖，不静默改研究。source 的 researched_not_planned 与 README 旧 r4 BLOCKED 字样为保留历史阶段，不作为当前Gate权威，由root后续同步。禁止作者改这些来源来制造阶段一致。

未完成与风险：真实主入口窗口、原面板并发、准确focus以及fresh实施审查待验。连续失效仍可三次耗尽，parent原5秒可能先timeout，CLI空响应/网络/系统过载/年龄仍可能拒绝；不能增预算、省guard或缓存成功。纯本地重试符合合同并不保证用户“直到稳定”的整套目标。

回滚信息：需人工介入。root先保全当前证据，按准确before/patch仅撤main增量与对应测试，恢复原单次诚实unknown；不得覆盖R5/用户工作、回收系统进程或重启清latch。本作者未执行 restore/revert 或 Git。

建议英文提交信息：`fix(workbench): retry complete native process census within one deadline`。

无新增跨功能事实。
