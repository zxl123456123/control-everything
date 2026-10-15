# 既有命名工作台连接：实施报告 r4

feature_name: wezterm-session-link  
impl_round: existing-r4  
date: 2026-10-04（Asia/Shanghai）  
lwplan_version: lwplan_runtime_delta_r4.md / A4010327E6BC25D15DADAF395FDFB3D3006D42086853E54E0CEF9445A8ECCF1E  
owner: wezterm_r4_core_impl_fresh  
status: FINAL_READY；仅本地实施自证，等待 root 实机验证及 fresh Review(Impl)。

root 明确 Gate2 GO 后才修改产品。fresh Review(LW) 为 `review_notes_lwplan_runtime_r4.md`，SHA `2E6DE892B3DE3BFF5CCE791DB84368ADA0CD9AB19F06CB1E93376E56FDB4F71D`；root 本轮独立 Gate2 8e150b/exit0 后放行。本作者完整读取该报告，不以旧 r3.1 PASS 代替本次 Gate。

## 变更事实与需求追溯

| path | change_type | change_purpose / key_changes | related_tasks |
| --- | --- | --- | --- |
| session_panel/workbench.py | modified | 新增完整固定 OBSERVED_GUI / OBSERVED_ATTACH；classifier 只增加此精确 profile；observe 三分支严格选对应 child。Lua PINS 条目只更新到完整已研究 8E045 值，fresh integrity 不豁免 | r4 S1Δ；G1/G2/G3 |
| tests/test_workbench.py | modified | 原 fixture 旁增加 named-only fixture 和 9 组关联/权限行为测试：正例及重复连接零新建、四种 cross-pair、未知 EXE/config/cwd/session/flags/字段、direct parent/birth、完整前后 fingerprint/client ID、零/多/坏 clients、budget/lock/latch、全部 pins 的完整匹配与逐项 mismatch、owned 清理不采用 named 用户 pair | r4 S4Δ；G1/G2/G3；N1/N2/N3 |

产品差异 12 行新增、4 行删除，共 16 行；测试只增加 153 行。没有重构或新依赖。新建仅本报告及 work 内本轮独立 before、patch、manifest、证据；没有新增产品模块。

第三 pair 永不传给 Popen。连接已存在时返回 connected=true、launched=false、cleanup=not_needed，保持 `_owned_gui` 原对象；NEW_GUI 仍为原无名 attach。完整 identity、server/marker/mux、direct parent、birth、年龄、锁和 latch 沿原实现。new/legacy/named 三者不得错配，未知字段不折零。

goal_lock_check：G1 的完整观察与 G2 已连接零新建有本地行为证据；G3 消费原唯一关联资格，原 focus 9 个安全行为的 mock 保留。当前实机已 EXITED，不能称 G2/G3 运行时验收完成。

anti_goal_touch_check：N1/N2/N3 未触碰。29 个其它当前来源完整 SHA 与 Gate1 时快照相等；native/helper、terminal/gateway、reader/source/service/MCP、UI/3D/CSP、D: 配置都未写。静态逐字核 NEW_GUI、LEGACY_GUI、`_native_interpreter/_processes/_rows/integrity/_wait_connected/_terminate_client/_cleanup_owned/connect/same_association` 与 own-before 的 source segment 完全相同。

authoring_ergonomics_notes：单一固定 pin、两个直接 list、三分支 expected，沿既有函数和 Mock fixture；没有 registry、通用 profile/parser/config 或为了测试增加生产参数。测试按行为分组；完整 argv 在 named fixture 和拒绝输入中明示，避免通过导入新常量让测试与生产同错。

## 本轮实际 impl-safe 验证

本轮完整读 safe-code-changes 与 verification-before-completion，真实运行以下完整命令，没有管道收尾：

```text
.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_native_processes tests.test_workbench tests.test_focus tests.test_gateway.GatewayDispatchTests -v
```

| evidence / 实际结果 | owner | conclusion_if_missing |
| --- | --- | --- |
| work/wezterm-session-link-existing-r4-author-red.json；b7585c exit1，61 tests、5 failures。先新增行为 tests，再运行未改的 r3.1 workbench，实际返回 unknown、旧 pin 和拒绝整个 named census，与新正例不符 | 本作者；完整 stdout/stderr/exit 及原 bytes 的 base64 已保存和完整读 | 不能证明回归测试能发现旧缺口 |
| work/wezterm-session-link-existing-r4-author-green.json；df7c59 exit0，61 tests、0 failures，0.096s；完整逐项输出已读 | 本作者；全部为本地 mock / direct handler，不启动 HTTP 或真实目标操作 | 当前局部实施未验证；不能用它代替实机 |
| work/wezterm-session-link-existing-r4-author-static.json；4e62f9 exit0，44 项均 true；两文件 AST、29 其它来源 SHA、11 处不改 source segment、产品体量和唯一 Lua pin 变化 | 本作者；完整输出/exit 已读 | 无法声称范围和不影响层已核 |
| work/wezterm-session-link-existing-r4.patch；本轮两文件完整 unified diff，4e62f9 输出完整已读 | 本作者 | final diff 不可审查 |
| work/wezterm-session-link-existing-r4-manifest.json；完整 before/after 与保护来源 SHA、上述 evidence SHA | 本作者 | 不可将当前字节与本轮验证/方案关联 |

上述命令的实际调用参数记录在各 JSON；stdout 为空，stderr 保留全部 unittest 名称、Traceback 与汇总，UTF8 strict 解码并保存原 bytes，未截尾或省略失败。before 位于 `work/wezterm-session-link-existing-r4-before/before/`；manifest SHA `78EF20F48FD5A091AF57CF6BB97B97E93EFD5E2E45CACDC07B9D0D9C5A28A17D`。

最终产品 SHA：workbench.py `10F6445617C25432132100C6BD1F60EABE989000D55AC4BF085FB2E5621E7E89`；test_workbench.py `C877DF03EA825690FE9F9C689CBA1568B963A3945A64148B4B37D74019BCBCB4`。最终 patch SHA `87153D798E0E6F4CA6F9754D557DD8284402073F49B7448DAB065B109899F571`；manifest SHA `5D76E6C576A04DEC4FBFD549A82711FB6B903ED12129C5CF9DEDCE85AD65D45C`。

## coordinator_handoff_verifications

| 未执行项 / 原因 / 建议承接 | evidence_expected | owner | conclusion_if_missing |
| --- | --- | --- | --- |
| 当前完整 Python / 临时 HTTP、实际页面回归；不在作者 impl-safe 范围 | root 全量命令原 stdout/stderr/exit、当次字段与页面截图 | root 自行执行；fresh reviewer 核验 | 本作者 61 tests 只证明 subset；不能称全量通过 |
| 当前完整 pins / native 默认双采样预算 / running 唯一关联；真实目标只由 root 观察 | 当次完整 EXE/argv/PID/parent/ctime/server/marker/mux/client，实际耗时和两侧事实 | root 自行执行 | 当前已有连接/性能未验收；历史 PID 不作为当前配置 |
| 两次 existing connect、UUID 消息分页与显式 focus；当前 EXITED 无可用存活环境 | 重复零新 GUI/零清理/同原关联；focus 前后 client pane、server/SSH/mux 和目标 pane 的当次完整证据 | root；条件成立后自行执行 | G2/G3 实机主链待证；不复活 EXITED、伪造 disconnected 或执行 observed named argv |
| natural disconnected 新启动、后验 8s 与真实 owned GUI/client 3s 回收；mock 不能替代真实原句柄退出 | 产品真实 preflight/NEW_GUI/original handle/native census、故障只注入业务观察返回、客户端及 GUI 实际退出与原 server/SSH/panes/mux 保持 | root；原范围实际可无损触发时执行 | 新启动及真实 owned 清理仍未验收，不关用户窗口凑证据；formal Review(Impl) 可 BLOCKED |
| 最终完整 diff/manifest 与 fresh Review(Impl) | 本轮 final hashes、全部失败和运行缺证，独立正式审查 | root＋fresh reviewer | 本作者 FINAL_READY 不等于整个 feature PASS，不关闭旧机器人或父 Q6 |

## contract_drift_reports 与未完成风险

已向 root 上报并沿 r4 权威收口：冻结 CBABB 决策6/§10 与旧 r2 只有两 profiles 和旧 5F903 pin；当前 r4 双 Gate 只允许第三严格只读 pair 与已研究唯一 8E045 pin，未改原冻结字节，不宣称旧合同已有 third。r3.1 的“模块无子进程代码”与 Windows OS conhost 分开，r33 仅受控 helper 的有限证据，本作者没有改 native 或添加 conhost 终止权限。

历史 GUI18696/attach260364 只是 profile 来源。root 本轮回传 all EXITED/native []，新面板网关已由 root 恢复；本作者没有读取 HTTP/真实目标或验证该运行事实。不得借旧 PID/ctime、mock 绿灯或历史 r33 称当前已连/已聚焦/真实清理已通过。无原子 instance pin、hidden watcher 覆盖与 GUI 可见性限制继续保留。

失败不省略：本作者先红 61/5/exit1 完整保存，之后产品改动才绿 61/0；没有覆盖原 red。首轮并行读取 lwplan/workbench 外层输出截断，逐文件或具体缺段已完整补读。预查不存在的 own-before 目录时 rg 报系统找不到文件（底层 exit2）；同 PowerShell 随后的 Get-FileHash exit0，不能把该外层 exit0 称 rg 成功；随后 exclusive mkdir 新建 before 且 31 来源 hash 实际核验，60c497/exit0。

root 历史 native r31 unknown、r32 OS conhost、Lua mismatch 的 exit1 与两次全量104 tests 的 Win10053 均由冻结 r4/旧报告和 work 原记录保留；单例或本作者 pure mock subset 不抵消全量失败。旧 collector/宽读/研究性能阈值/venv 反证/Gate/patch 的失败也继续由原报告承载，本作者不称这些历史命令本轮重跑或已修复。没有执行 HTTP、GUI、SSH、attach/focus、D: 写入、Git 或递归委派。

rollback：可直接回滚本次两文件新增内容和 Lua pin 字典更新；按 own-before 逐差异撤本次行，不覆盖其它来源或后来修改，不操作 D: 配置或停止现存窗口。恢复旧 pin 后会拒绝当前 Lua，是明确的功能降级。原 native 与本轮其它已交付功能保留。

建议英文提交信息：`fix: recognize the existing named workbench connection without relaunching it`。

无新增跨功能事实。
