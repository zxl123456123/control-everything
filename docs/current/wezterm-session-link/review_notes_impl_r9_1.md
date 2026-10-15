# R9 独立实施后审查（第 1 次）

review_target: impl；impl_round: r9；review_seq: 1；review_date: 2026-10-05 Asia/Shanghai。  
实施报告：[impl_report_r9.md](impl_report_r9.md)，SHA `9E179CA5252EA12B7E0063B0F97C2617F34977D13C9526C1B46849669AE9AC0F`。  
**协议结论：REVISE；业务结论：PLAN_DEFECT。** 两处采样重叠与有限定位验证成立，当前整批回归和正常轮询下集成验收未成立，禁止称工作台整体稳定或归档通过。

## 审查输入与独立性

本 reviewer 未参与 R9 方案/实现，只读实际最终 diff、权威输入和原始记录；不递归委派，不运行产品/HTTP/CLI/SSH/GUI/Win32，不改变四产品、旧报告或失败证据。完整加载 coordinator、development-workflow、plan-review、verification；初次聚合技能读取截断，已分别全文补读 `d42827/a0eace/2f2cf4`，没有凭截断内容放行。

唯一 LW §12 SHA `F9F023CFD52066B9AEADE38D2E562A7173AA0DB93F387D9474301D670A831312`；clarifications §16、原 G/N、R9 source、fresh ReviewLW `05C0A3D…EDAAB3`、root Gate2 `950852DB…3D8230` 已实际读取。R9准确 manifest `0F14EEDB9D46C2F06DAAC97B066FADD37EC5ACC91BFC2D9F269F481E9D58E997`、patch `E17D07CDDB32E99DB1FC705416750290500952ECDEE398BD102D2EA7E25BB5A2` 与四 before 已核。

本轮独立静态命令 `7496c2/exit0/14true`，证据 `work/wezterm-focus-impl-r9-review-static1.json`：重生成 patch 相同；29 产品/23 输入/四 before 保持冻结；旧 52 方法 AST 相同；六个新增行为方法；完整 final 谓词和 catch 字节相同；原 red 仍为两个 overlap=False。完整输出已读。

本轮独立最终命令 `.venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-impl-r9-review-final-verify.py` 为 `8edf8b/exit0/9true`，完整输出已读，证据 `work/wezterm-focus-impl-r9-review-final-evidence1.json`。只解析保存文件和当前字节，独立重算全部 15 个 raw 样本的两原预算、三次完整关联、完整 flags/geometry/commands 指纹、实例和真实 client，不执行或模拟产品。该核验绿表示证据一致，**不把已保存的 167/HTTP 红变为绿**。

## 必填结论

| 字段 | 结果与依据 |
| --- | --- |
| goal_lock_alignment | aligned：G3 原完整目标/实例/关联/年龄保持；G1 unknown 与 G2 连接规则保持。整批验收仍有缺口。 |
| anti_goals_touched | none：准确四路径增量，其余 25 产品不变，见下表。 |
| authoring_ergonomics_check | pass：两个局部 one-worker with，原主线程 merge/判定，无持久调度框架。 |
| declaration_readability_check | pass：public dict/cache/失败字典保持；没有新配置或 manifest 产品结构。 |
| plan_defect_checkpoint_recommended | no：前一 R9 ReviewLW PASS 重置计数，本次计数为 1；问题方向仍是真实能力稳定。 |
| plan_defect_checkpoint_reason | 核心实现符合现有计划，缺口是整体回归/集成收敛；未证明需要重新定义用户目标。 |
| plan_defect_trigger_reason | §12要求 root 当前全回归、HTTP 三轮及 IAB 实际定位闭环；167 项仍红、HTTP 两批失败。四路径不能自行解决 gateway 拒绝体、采样未知或跨请求锁竞争，需回上游补收敛责任与验收。 |
| impl_safe_validation_check | pass：作者本地 meaningful red→相同症状 green、121 项及 AST；未冒充实机已执行。 |
| coordinator_handoff_check | missing：真实15/原生22/IAB用户路径已有有限正例，当前全量与正常轮询 HTTP 三轮尚未形成完整绿闭环。 |

## 基线与澄清一致性复核结果

**PASS**：未回答为空，自动实施/真实测试授权已落盘；四产品符合 §16/§12。头脑风暴决策与 G/N 未被违反。当前失败不是擅改基线或削弱安全守卫；它阻断交付判断。

| 禁止内容 | 实际可核查依据 | 结论 |
| --- | --- | --- |
| N1 新建/复活产品会话、假键盘、D 配置、其它用户进程 | 最终 patch 仅 import/两处采样调度及对应本地 tests；29 产品差异为四路径 | 未触及 |
| N2 改来源/reader/MCP/图形/CSP/CSRF/两原 5 秒 | terminal 完整 final/catch 原字节；原 started/refresh_finished/deadline/pins/pre/每步不变；其它 25 字节相同 | 未触及 |
| N3 常驻 pool/SSH/IPC、跨请求库存、清 latch | service/terminal 各局部 max_workers=1 context；原锁/latch 原样，返回前 context join | 未触及 |
| 省样本/flags/geometry/commands/fullfinal 或旧成功冒充当前 | 15 raw 中 initial/pre/final 三完整关联、全部 child exit 和完整 inventory 指纹；原谓词精确保留 | 未触及 |

## 实现及 impl-safe 证据

`service.py`仅 private forced pair 使用 remote worker/main 完整库存；started 在 submit 前、snapshot 只由 main 在结果齐全和 join 后更新。public force/cache仍原串行分支，远端/库存异常仍各原失败字典，私有非 force 仍拒绝。

`terminal.py`仅 final 库存 worker/main 完整 Workbench.observe，同原 deadline。with退出后才进入原 strict 非0/exit、实例/slot/pane/client/关联/指纹/预算判定。初始/pre/每动作采样、Workbench 内部 census/clients、锁释放与原异常语义不变；未捕获异常也先 join 再传播。没有省 final 换取速度。准确源码 +26/-10，职责仍直接可读。

作者实际红 `03afd9/exit1/2FAIL`、同两症状绿 `b061ee/exit0/2`、完整局部绿 `ce67d8/exit0/121` 及静态 `ae321c/exit0/16true` 的独立 stdout/stderr 已全文读取 `fb9b53`。Event 验证重叠、pending 时锁/快照不提前发布、两侧异常/late拒绝和 worker 在 merge/解锁前退出；旧 52 方法没有改写。fake-clock 成本仍只作行为/预算用例，不证明真实耗时收益。

## coordinator 实际承接与有限正例

| 实际记录 | 已读结果及能证明的范围 |
| --- | --- |
| `work/live-session-focus-stress-r9-1.json`；root `188609/exit0` | 五起点各三轮，15/15 confirmed，独立 singleton client1→terminal_3；五模式实动作分别 next、up、up、tab+up、零动作。SHA `349AC81E…2163A`。 |
| `work/live-session-focus-audit-r9-1.json`；root `390749/exit0` | 全部 raw 检查 true；两 phase 实际时间重叠；最早累计 remote age 2077–3858ms，原 action 1296–2750ms。独立本轮重算同值，不以请求总耗时替这两个时钟。SHA `6376DED9…0982C`。 |
| `work/live-session-gateway-reload-r9.json`；root `ae9d51/exit0` | 原 root listener56388/launcher62440精确归属记录；新隐藏 launcher63420/child38108 与健康记录。未改终端或清 latch。 |
| `work/live-session-robot-browser-r9-2026-10-04T22-56-14-978Z.json/png` | 实际 native WebGL 22/22、26 GET、8资源与当前 disk相同，两个新身份各一次 mesh，三刷新保持 mesh UUID/home；Codex→0990两历史→Codex清空，错误数组为空、浏览器已关闭。无 POST，不能替 IAB focus 或三轮集成。SHA `7E4BFD07…4236A`。 |
| `work/live-session-ui-prepare-r9-{1,2,3}.json` 与 `work/live-session-ui-focus-r9-{1,2,3}.png` | 已读三次 exact owned 前检、非目标5/4/4；第2/3 DOM JSON已读确认terminal_3及0990。root实际用户路径为刷新→等按钮fresh→唯一click，正常轮询继续；root回传独立 CLI `c5d698/45228c/75ca8b` exit0/client1terminal3，有限3/3。第1次陈旧disabled按钮直接click超时无click执行，保留该失败；此用户路径正例不替原外部HTTP三轮失败。 |

新 own Claude UUID `0990a0a5-a375-4bef-85ef-0ae23ee5ad74`/PID3886044/ticks1341437828/boot8039e11b…，及 own Codex `01a10809-706b-78e3-b279-c3611cf75be0` 实際身份/正文隔离已有证据。Codex仍仅 metadata、activity/task unknown；不能据机器人动画推定实际工作状态或 session 合作。

## 阻断整批验收的实际记录

1. `work/live-session-root-tests-r9-1.json`：root `e356fd/exit1`，完整 167 项/1ERROR，`GatewayTests.test_workbench_connect_uses_same_csrf_and_strict_empty_body` L132 未授权 `{}` 请求在 getresponse 首状态行出现 Win10053；before/after 字节相同。完整 204 行 stderr 已读 `1a1fbf/877840`，两 Pydantic lifespan warnings 保留。局部 121绿不能覆盖该失败，也不建议不改代码反复赌绿。
2. `work/live-session-capabilities-r9-1.json`：`d0cf56/exit1`；cycle0 全接口/定位 exact3 成立，cycle1 动作前 direct Workbench.observe 为 unknown/`workbench_observation_unknown`/235ms，未再 setup/action。此记录没有原始 helper 错误，不能断言 GUI 变了或未知已修好。随后只读 `work/live-session-workbench-diagnostic-r9-1.json` 的30/30 positive只证明后续样本，不抹此前 unknown。
3. `work/live-session-capabilities-r9-trace-1.json`：exit1；前两 cycle confirmed3，第三 HTTP Workbench 为 terminal_action_busy、connect/focus均409，未启动/定位，独立 pane4保持；三个 direct own 样本均 positive，两条 test history marker 成立。正常可见页面轮询与动作共享 action_lock 是 root 当前推断/环境观察；该记录证明 busy，不能单独定位具体持锁请求。web `workbenchFresh()` L59 已含 `!refreshingWorkbench`，不能据此猜缺一个按钮检查或降低 backend 拒绝条件。
4. 已独立复现 `work/gateway-rejection-h1-symptom-red-1.json`：本地随机 loopback/Mock、三种延迟体均 Win10053/3ERROR/exit1，服务调用0、server/thread已回收；原R8拒绝体诊断69中11失败仍保留。它是 H1 修正输入，不是 R9 已解决证据。

IAB正常刷新后用户路径已补有限3/3正例，原生22、定位15与页面正例各有自己的验收边界；它们不能覆盖完整回归与外部HTTP失败。R9本轮核心样本改善得到证明，整体正常使用稳定性尚未得到证明。

## 设计味道扫描结果

**PASS**：两个局部 worker 保留采样职责与原判定，未新增抽象/配置/常驻资源；未见作者体验或声明结构回退。整批 REVISE 来自实证缺口，不来自这两处形态异味。

## 恢复输入与冻结释放

判定顺序：存在足够事实继续技术收敛，不需 BLOCKED/用户新决策；没有问题建模漂移，不是 PROBLEM_DEFECT。不能判 IMPL_DEFECT：四路径已按计划实现，整批 HTTP/采样/锁协作修补可能跨既有范围，原因/验收未齐，不同时满足局部低风险无新决策三条件。按正式默认路径为 PLAN_DEFECT。

root先补 clarifications 中三类失败的责任与收敛状态，唯一 `lwplan.md` 最小追加集成收敛/验证任务并 fresh ReviewLW；保留 §1–12 全部已实施支撑、R9四 before/final、manifest、patch、全部红绿，不删或重写旧报告。两处 R9 核心代码可以保留，无需凭集成红回滚已证形态。若新修正改变 R9 产品/计划，旧 review 不作新实现放行。

本报告发布即释放本 reviewer 的冻结租约；root可启动**独立 bounded H1**仅 gateway.py/test_gateway.py 的已复现拒绝体修正，另留新 before/diff/红绿/fresh review。这不解除 R9 集成回退或关闭未知采样/轮询 busy；H1后必须 root 当前全回归、正常轮询三轮与 IAB 实际 focus/client重新验收，报告不能回写为 R9 事后 PASS。

旧 R8 12/15三个late、首161 Win10053/相同字节次绿、首audit同tick与Gate2字面红、旧启动marker误判、R5–R7 red、owned失败回收/父Q6/Codex正文活动/48角色性能/自动合作缺证仍保留；本轮原生22和定位15不能关闭这些独立边界。未见新增 contract drift/stale/mirror mismatch；历史README事实不作当前部署结论。无新增跨功能事实。

英文提交建议：`perf(terminal): overlap fresh sampling within the original focus budget`。
