# WezTerm 会话联动

**原始需求**：用户询问“下一步呢 关于wezterm”。呈递的下一批范围为：连接现有工作台；点机器人查看对话后，以现有显式定位入口切到对应 SSH pane；显示终端连接状态，区分后台存活但窗口未连接、多客户端和过期映射。用户原文答复“继续”，授权推进这一批。

**创建时间**：2026-10-04（Asia/Shanghai）
**当前阶段**：R11场景与选中来源有限验收已交付（§14）；其余旧开放事项保持
**R10交付时状态（历史原文）**：当前固定自有新Codex／WezTerm关联Claude样本的检测、机器人点选、历史隔离与定位已实际核验，fresh ReviewImpl PASS／PASS、RELEASED；175回归、69拒绝响应、15定位、native22、API3／IAB3均有原始证据。当前运行H1 gateway launcher26552／listener14488。旧R9仍REVISE；235ms未知根因、48角色性能未达、Codex正文／实时活动、真实合作及旧独立BLOCKED继续开放；只更新当前交付状态，不称全部能力或无限时长稳定。
**最后更新时间**：2026-10-05（Asia/Shanghai）

**下一轮已授权**：用户要求新建 Codex 会话继续场景与功能映射，由原会话协调。恢复输入见 [R11跨会话交接](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/source_materials/resume_context_r11_scene_mapping.md)；本条仅记录新任务，不改变 R10 已交付范围或旧审查结论。

**R11 当前阶段**：有限交付；fresh ReviewImpl PASS/PASS，独立113/0与报告绑定12/0、root最终124/0均exit0，当前28产品manifest0323295e…c6777。第三完整fixture44场景1403/0、核心84/0、新增42/0、Python175tests/OK/exit0，两既有warnings与前两全套1392/1fail、1397/2fail及CSRF36/1、窄屏42/1均保留。48原画质正常播放/轮询60秒本机样本157.9204FPS/p958.3ms/慢帧0.0105541%/83calls（before1025），本窗口参考线均达；之前短窗p9551.2ms/slow10.5333%与旧35.11/60秒before失败不覆盖，不称任意时间或硬件稳定。当前新开发UUID `01a109a3-2890-7531-805b-6ed67edb5d5d` 的真实API/DOM/WebGL实例、五部件独立工位、正常三刷新同slot/home、native点选与来源历史隔离已实测；真实probe整体23/1fail/exit1为首workbench_timeout，随后3次unique不证明持续正关联。最终真实IAB629px单列与8资源当前磁盘SHA一致，原动作门/后台/轮询不变。范围见clarifications§18；[本轮证据与限制](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/delivery_scene_mapping_r11.md)、[独立审查](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/review_notes_impl_r11_1.md)、`impl_report_r11.md`保存全部红绿，旧后台缺证保持。审查输入文档副本在work/r11-reviewed-inputs；仅此处与交付报告按正式状态维护合同更新终态。

本批是 session-robot-cockpit 之后的新授权增量。原机器人批保留 impl_reviewing/BLOCKED、成功真实定位缺证；父 unified-dev-control-panel 的 Q6 原生 Codex 三工具加载/调用独立待验。旧技术基线、方案和正式报告保持冻结，不把它们的原反目标静默改成此次授权。

[R10交付与全部红绿证据](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/delivery_live_r10.md) · [R10独立实施审查](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/review_notes_impl_r10_1.md)。下文各轮段落保留为当时记录，不将旧运行PID、失败或待验状态视为当前运行事实。

## 已确认范围与执行授权

前一轮已呈递的目标是“从面板找到会话，并可靠地跳到对应终端继续开发”，用户“继续”确认该目标和三项范围；沿用此前“自动实施代码即可现在”的协作偏好，不重复询问已有目标、范围或实施入口。产品范围仅固定工作台的显式连接及状态，不复活退出会话、重放旧命令、自动补建标签或扩大采集来源。用户R5新增“新起一个codex对话…wezterm新起一个…直到能力稳定”明确授权root自己的测试GUI/dev SSH/安全Claude与生命周期测试，详见clarifications§12–14；该测试授权不改变产品N1，不恢复其它held命令。

连接本身是有状态动作。原 Start-TerminalWorkbench.cmd 含 --create、--force-run-commands 和 EnsureTabs；plain attach 也可能复活 EXITED session。先查是否存在能保证只连当前运行实例的官方入口和本机实现，关键事实未明时不先写一个看似安全的启动包装。真实环境、GUI连接与原 UUID focus 由 root 承接，作者仅本地自证。

## 里程碑

- [x] 实际代码与官方机制调研
- [x] 已授权范围的完整实现基线与 readiness
- [x] 唯一低层方案与独立审查
- [x] 实施及独立本地验证
- [x] 当前固定自有实例的连接、真实 UUID 定位与 fresh 实施审查（R10有限范围）

## 文档

- research_code.md：现有网关、终端、前端及工作台入口的事实。
- research_attach.md：官方与本机运行实例连接语义及限制。
- clarifications.md：当前授权、决策和完整实现基线（r1）。

## 当前证据与技术边界

本机 Zellij EXE SHA 与 root 实取官方 0.45.1 发布 SHA 相同。不带名称、不带 create 的原生 attach 初始入口仅接受一个 active、无 New/Resurrect；缺具体实例原子 pin、IPC 首连有无限 retry。基线选择前后核验及有限等待，不能宣称消除瞬时竞态。GUI/client 组合只称唯一关联观察，不把 CLIENT_ID 当 Windows PID；已按独立 reviewer 事实收紧全量进程观察、未知拒绝与仅本请求明确客户端清理。不能回收 server/SSH 或一般进程树。

root 已核当前产品 27 路径与旧冻结内容未变，并保存新 before 快照：work/wezterm-session-link-baseline-r1/manifest.json，SHA 6359AABC11C8369336B62222D92B69D859E073AC8295B71847BA4944582A8BA1。实际未改产品基线 55 tests、exit0；完整字节采集在 work/wezterm-session-link-baseline-tests-bytes.json，带既有 Pydantic warning，不是新增功能验收。首次组合 web/poll 输出截断；第二次 UTF8 text collector 报 UnicodeDecodeError、child exit1 且 stderr 丢失，无法判断该次子进程失败内容；没有抹去该失败，第三次 bytes collector 保存完整输出、exit0。官方源码网页行号与 raw物理行号不同，root 定向 raw读无名 attach 分支，不能机械照抄 research 网页行号到 raw 文件。

最新 root 只读样本：list-sessions 正常、一个 active workbench-v4、六条 EXITED；CIM仅固定 server PID5612、CreatedUtc 2026-09-26T17:03:50.1304540Z，无交互Zellij/WezTerm进程。仅代表采样当时；真实连接前必须再次采样。reviewer核查仍在进行，不声明联动已实现。

Readiness 第1轮最终报告 SHA A9AD9E9FF9DDFA5063FF71F61BB971B4A33B995862BBB74D7492B85AD0425C03，结论仅进入 LW。root 逐段读最终报告；当前独立首检53项中1项失败：root额外要求字面“溯源链”标题，实际合同要求的是内容，报告已含5条具体原文→决策→基线链。修正root检查口径、没有为断言改报告，retry1实际36项/0fail/exit0，四输入SHA与27产品未变；首失败保存在 work/wezterm-session-link-readiness-root-verification.json，复检在对应 retry1.json。readiness作者初次README状态并发变化/GBK失败与最终47项exit0均载报告，不用子agent自称替代root核验。

## 初始只读证据

前一轮 root 实际 list-clients exit0，仅表头、无客户端；当前 list-panes exit0，main/dev/files 对应 terminal_2/3/4。CIM 观察 Zellij server PID5612 及其三个 SSH 子进程，未观察到 WezTerm GUI。它们只代表当时采样，实施/连接前须再次核验，不能硬编码 pane 数字或拿旧采样代当前。前轮官方查询一个错误地址已保留，由研究者改读官方实际文档。此次入口宽读 root README/代码/外部文档搜索超预算；受影响内容由调研者定向完整补读，不将截断范围作完整事实。


## 当前实施入口与独立视觉增量

当前唯一LW SHA405FDE8E546B5D516D507802832A64D23AC8854AA5D11A2EC64EC33766E7C9E0；Gate2报告C4B14141B3C4836FED73DB5ED2CF76094D4AC8B9447D0EED673A8DEDA27A9749。root完整读后实际gate2 61checks/0fail/exit0，work/wezterm-session-link-root-gate2.json；current基线CBABB...9830，r3冻结06166F...72FFC。r2 root Gate1为103项，不与作者109项混用。纯mux补事实/严格只读例外及原list_panes锁边界已落同一基线/方案，r1/r2/r3readiness历史均保留。S1/S2后端和S3/S4前端分保全差异及证据，最后全链验收，未确认的GUI不能通过重启清latch。

用户最新明确反馈3D视角/流畅度。另立docs/current/robot-motion-bounded.md，独占robot3d/cockpit.js的纯展示增量，fresh验证与独立review；不把它混作Wez本批N2变更，不改旧冻结robot或parent报告。实际IAB显示pixel选中，切3D后为正交相机/按需重绘的WebGL，此为新视觉修正事实，不是Wez后台成功证据。

## 默认采集运行时补修 r3.1

默认 Windows PowerShell/CIM 两次采集实际导致5秒观察超时，不以延长预算或省略身份字段收口。唯一私有采集窄修订为 `lwplan_runtime_delta_r3.md` r3.1（AEB72C...B8EFF），root完整读后独立Gate1 `317e0f` exit0；fresh `review_notes_lwplan_runtime_r3.md`（A8C272...F0531）已完整读取并独立Gate2 `92b108`、45项0失败exit0。当前已放行唯一后端作者实施固定native helper及边界测试，实际默认采集、超时生命周期、GUI连接/定位/回收仍待root验收。

Gate2前真实发现venv redirector另起base Python，旧A24方案不得放行，完整旧字节另存历史。r3.1直接启动与GetModuleFileNameW(NULL)实际镜像一致的base解释器，缺或不匹配时拒绝；不采用进程树回收。原5/8/3预算、完整相关进程观察和原句柄回收不变，全部既有失败保留。

独立展示增量已完成，见 `docs/current/robot-motion-delivery.md`：实际完整fixture1256/0、真实IAB、独立PASS/PASS与root最终17/0 Gate。此展示结论不替代本批WezTerm运行时或旧Q6验收。

## 本轮恢复与当前终端事实

最新授权“继续优化完整”沿用自动实施；恢复原文与边界见 `source_materials/resume_context_r4_current.md`。r4 当前唯一方案 SHA A4010327E6BC25D15DADAF395FDFB3D3006D42086853E54E0CEF9445A8ECCF1E，root 完整读后独立 Gate1 `work/wezterm-session-link-root-gate1-r4.json` exit0；fresh Review(LW) pending，未改产品。

本轮实际 `work/wezterm-session-link-root-current-runtime-r4.json`：完整 native rows=[]，固定版本0.45.1与list-sessions均exit0，但workbench-v4及其余序列化会话均EXITED。当前两动作false、reason=workbench_not_running；旧8766 listener及旧root gateway PID均不存在，health拒绝连接。此前GUI/client/server证据仅历史，不继续标当前已连接。恢复面板服务只在端口确实free时启动并记录新归属；不执行旧reload去停止已失效PID，不复活退出工作台、重放旧命令或创建SSH来凑验收。

面板随后在free loopback端口恢复：`work/wezterm-session-link-root-start-r3.json`实际exit0，root新launcher34820/direct listener5588完整image/argv/ctime及health已记录，未停止任何旧PID或启动WezTerm。真实IAB显示3D canvas/播放状态、后台“已退出”、连接disabled及注册0/进程0/索引0；一次失效旧tab lookup与创建后的JS绑定错误已按真实已创建tab1恢复，没有创建第二张重复页。

Fresh r4 Review(LW)唯一报告 `review_notes_lwplan_runtime_r4.md` SHA2E6DE892B3DE3BFF5CCE791DB84368ADA0CD9AB19F06CB1E93376E56FDB4F71D；root全文读取后独立Gate2 `work/wezterm-session-link-root-gate2-r4.json`，8e150b exit0/全部checks true，已放行唯一两产品文件实施。现有用户自动实施授权持续，旧冻结文件及运行/回收缺证保留。关于“只恢复退出布局、旧命令保持暂停”的新增动作已向用户单独询问，未收到答复不执行；这不阻塞当前代码补修。

## 本轮最终实施与运行验证

当前结果详见 `delivery_existing_r4.md`。两文件完整diff/manifest及作者先红61/5后绿61/0见 `impl_existing_r4.md`。root独立scope核31来源、全量113 tests/exit0、浏览器33场景1256 checks/exit0，原fail/warnings保留。真正当前面板已加载r4；launcher41828/direct listener40880完整固定各自image/argv/ctime和health前后验证在 `work/wezterm-session-link-root-gateway-live-r42.json`。重载r4/r41两次guard拒绝均保留，不用全量绿覆盖旧Win10053。

当前实际 `work/wezterm-session-link-root-live-r4.json`四pins true，native两次140/93ms/rows=[]；带Origin/CSRF空连接请求实际409/workbench_not_running/零新建/无清理，前后仍EXITED。真实IAB播放/暂停/reset/3Dcanvas与当前source0记录和空场景截图在 `work/wezterm-session-link-root-ui-r4.json` / `work/robot-motion-live-final-r5.png`。只有局部代码/离线守卫与视觉当前回归已验证，fresh Review(Impl)及整个实机主链分别记录，不扩大N1或关闭旧父批。

Fresh实施审查已落 `review_notes_impl_r4_1.md`，SHA577AD89100028B73EC0D9C1350CEEAC58729E0072CA01D6163B9D943D95500B7：协议BLOCKED、业务留空，无本批产品缺陷，缺实际存活唯一连接/UUID定位/真实owned回收。root完整读取9ad5c5后独立最终Gate `work/wezterm-session-link-root-delivery-r4.json`，95131b/exit0，全部checks true；检查31当前tested bytes、当次完整回归/真实离线/IAB/截图、旧失败保全与冻结输入。仅交付已核局部，停止整批完成链；待合法运行事实/用户新增恢复范围后继续实机验收，不重复询问已授权代码实施。
