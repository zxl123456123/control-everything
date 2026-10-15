# 机器人视角与流畅度：独立实施审查

- review_target: impl
- impl_round: r1 + 最短角补修 r2
- review_seq: 1
- review_date: 2026-10-04
- reviewer: `/root/workbench_motion_review_impl`；未参与产品作者或规划，未写产品、运行浏览器/HTTP/GUI/SSH/终端动作/Git。
- impl_report: [r1 实施报告](E:/project-funny/mianban-develop/docs/current/robot-motion-impl.md)；[r2 补实施报告](E:/project-funny/mianban-develop/docs/current/robot-motion-impl-r2.md)
- protocol_decision: PASS
- business_decision: PASS
- goal_lock_alignment: aligned
- anti_goals_touched: none
- authoring_ergonomics_check: pass
- declaration_readability_check: pass
- plan_defect_checkpoint_recommended: no
- plan_defect_checkpoint_reason: 本增量的长角重置缺陷是局部实现问题，已按原合同最小修复；没有需要新增架构或用户决定的展示边界。
- impl_safe_validation_check: pass
- coordinator_handoff_check: pass

本结论仅覆盖用户新增的真实 3D 动画、环绕交互与流畅度有界增量。WezTerm 原生采集、真实连接/定位仍待另行实施和运行时验收；旧 `session-robot-cockpit` 的 BLOCKED、父 Q6 的未验状态均不由本文关闭。PASS 不承诺所有硬件或用户 IAB 的固定 FPS。

## 审查范围与冻结输入

本轮已读取 coordinator、safe-code-changes、verification-before-completion、review-dispatch、有界合同及相关 plan-review 报告要求。采用持续“自动实施”授权，没有新增阶段确认。实际独立检查包括两产品完整源码、baseline before/作者完整差异、当前 harness 的实际渲染观察和控制入口、实施报告、root 完整执行输出及 JSON 内全部检查，而非只采信作者结论。

| 输入 | SHA-256 |
| --- | --- |
| robot-motion-bounded.md | `9DF0FDEC90F24318F343B1078DF9B7C0D78649A405D1080256419A5C1C2D1B8F` |
| robot-motion-impl.md | `61C0EC2BC841BDB82573FE25CCD24E6EC7C5DE0C2610EE7A79783E02F5637EE8` |
| robot-motion-impl-r2.md | `7EC08DB0736242EA7F20E85766DB89B24C9316C06ED42A38FEDDA0190C43963F` |
| 最终 web/robot3d.js | `DF4EC428FF0898B770E8A73711B92E37C567A1864EA2764D0BC19DCCF44BBD33` |
| 最终 web/cockpit.js | `FA0D438D34FDE6BACE2B9745C5CFBC321B51710EB2F3655CF2D10C6C56149B8A` |
| 最终 tests/verify_robot_cockpit.cjs | `F48C8E5D7483C03BFC94B2609AEB1022245432C4AAA61706018551F2174CA454` |
| r1 作者完整差异 | `96BBE0D88DC23F92BFC197608AFCAE451F8C11072E189BAC92C934CB5A32D676` |
| r2 单行差异 | `2A7DCCCD507A4A519B7758B9F748047C87A25FF6CB3AA77EC22A3AFB525ACCA9` |

两文件由 robot_motion_impl 单写。第一次再次委派因线程限额被拒绝，root 提议自己补修但未写产品；槽位释放后原作者接回并实际作 r2。harness 先由 Wez UI 作者单写，交回后 root 单一接管追加长角用例。没有双写同一产品路径。`web/app.js/index.html/style.css` 的并行 Wez 改动属于独立合同，完整 fixture 核验了当前字节，但不归入本展示作者的变更。

## 目标及禁止内容复核

基线与澄清一致性复核结果：PASS。用户明确选择“3D 机器人主视图＋像素/文字回退”，随后明确要求自动实施，最新反馈要求动态 3D 和更流畅的交互；本有界增量只修展示。原 Wez G/N 与旧冻结文档未被展示作者改写。没有未回答的本展示范围问题。

| 目标或禁止内容 | 实际源码/证据 | 结论 |
| --- | --- | --- |
| 可辨认的 3D 深度与持续装饰运动 | PerspectiveCamera、站台/GridHelper；真实连续帧、相机与模型变换，最终现场截图 | PASS |
| 平滑水平/垂直环绕、缩放、箭头/重置 | delta 与指数缓动，角度/缩放范围；真实鼠标及 DOM 控制；长角重置闭环 | PASS |
| 暂停、减少动画偏好、隐藏/模式/销毁停止 | 实际 aria-pressed 与连续帧计数；隐藏恢复首帧、文字模式及 reduced-motion 场景 | PASS |
| 不把装饰运动说成任务活跃或完成 | 明确“动画仅装饰；活动 / 完成未知”，运动不消费 activity 证据 | PASS |
| 不以环绕/缩放发起消息或终端操作 | robot3d 只有当前完整 UUID onSelect；拖动不点选；fixture 请求计数及未选中状态 | PASS |
| 不新增来源、公开 API、权限、依赖或改 vendor | 两文件差异及八资源哈希；Raycaster 仅对当前机器人，不对地面选取 | PASS |
| 原失败回退、手动重试及消息选择继续可用 | 模块/MIME/CSP/WebGL/Canvas2D 失败、真实 context loss/restored、UUID/分页回归 | PASS |

设计味道扫描结果：PASS。沿现有小型场景生命周期增加相机状态和调度，没有完整 Controls 框架、动画状态推断、通用抽象或配置。r1 两文件约 130 行新增、22 行删除，r2 仅一行替换。几何/材质复用，尺寸真实变化才 setSize/更新投影；隐藏和 dispose 取消帧及监听。声明和作者入口可顺读。实际采样仍可能受设备、模型数量和浏览器影响，未用少量测试许诺普遍性能。

## 独立发现与修复核验

本 reviewer 在 r1 源码发现重置把累积 targetYaw 直接设为 `-0.28`。自动环绕约一整圈后，阻尼会经过整圈而快速扫转；三个整圈时首个 60Hz 步可能为约 -224.76°。独立纯静态原症状数值检查 `6d6007` exit0，完整输出已读；root 接受，未提前冻结旧源 PASS。

这是 IMPL_DEFECT 的三条件成立：当前控制函数的局部目标角问题；替换最近等价角对既有缓动/点选/预算低风险；无新架构、权限或用户决定。原作者补为相对当前 yaw 的 atan2 最短角，保持 elevation/zoom reset、箭头相对目标、8 秒交互暂停及 schedule。独立差异确认为仅这一行变更，当前角不被瞬移。

作者实际原方法 VM 回归对修前副本：13 案例、7 失败、exit1；修后相同 13 案例、0 失败、exit0。旧源 SHA `7D9E458676C9B10B15FC177FB32C058C9CAF68097B3DCE832F44D2D250BDCE5C` 与当前 DF4E 源各自核对。VM 只证明局部方法；最终 root 用 23 次真实 DOM 向右按钮累计 6.90 rad，再实际点击 reset，106 个实际渲染帧的累计回正为 0.627310935 rad，小于 π，落到默认朝向，且无消息/终端动作。该实际渲染证据关闭原症状。

r2 作者报告最后提议受控 RAF timestamp；root 最终采用的是实际 DOM 控制和真实时间帧，**没有合成 RAF/时钟**，以当前 harness 与 root-live-r2 的记录为准。该方法差异未降低验收语义，不能把未采用的提议描述为已执行事实。

## 验证责任、实际输出与证据

| 验证层/实际命令或读取 | 责任/实测结果 | 本 reviewer 的独立复核 |
| --- | --- | --- |
| 作者 `node work/verify-robot-motion-author.cjs` | 两语法检查 exit0、空 stdout/stderr；只支持语法 | 读实现/差异，不用静态代替实际 WebGL |
| 作者 `node work/verify-robot-motion-r2.cjs --red/--green` | 实际方法提取，13 案例，红 7/exit1、绿 0/exit0 | 完整读方法、JSON 与单行实际差异，未执行会覆写证据的作者脚本 |
| root `node tests/verify_robot_cockpit.cjs --fixture` | 2026-10-04T04:11:11.671203Z–04:13:09.920160Z，exit0，完整 stdout 为 1256 检查/0 失败，stderr 空，33 场景 | 遍历全部 1256 passed、33 case、四语法、故障分类、cleanup 和八资源当前 SHA；motion 20 检查均 true |
| root 最终实际 IAB reload/DOM/静态 HTTP 字节/截图 | root-live-r2 exit0；3d/canvas true、aria-pressed false，当前两源码 served SHA 匹配；截图有站台与两机器人 | 完整读记录、逐资源现文件字节/hash 核验，view_image 只读实际本地截图 |
| reviewer 本轮纯文件与语法 Gate | `fa39cf`、`8dd182` 均 exit0；四实际 Node 命令每项 0、完整 stdout/stderr 空 | 当前源/报告/fixture/现场哈希一致，红绿原件保留，重新计算帧采样统计；未执行外部运行时动作 |

最新完整 fixture 报告 [robot-cockpit-fixture-r1-2026-10-04T04-11-12-094Z.json](E:/project-funny/mianban-develop/work/robot-cockpit-fixture-r1-2026-10-04T04-11-12-094Z.json)，SHA `D4CAE538A78DECE3A5F8870F4A2FE0828B26F639E09EA9BA39467BF9D33E150C`；执行 wrapper [robot-motion-root-fixture-r3.json](E:/project-funny/mianban-develop/work/robot-motion-root-fixture-r3.json)，SHA `DF24F12FBE2B81B6905639A7AB5DDC9196594DFB33BE08BD347C548AEA441FEA`。浏览器关闭 true，owned fixture exit0/signal null/stderr 空，无外部或生产请求逃逸。

当前现场 [robot-motion-root-live-r2.json](E:/project-funny/mianban-develop/work/robot-motion-root-live-r2.json)，SHA `50AEFEE9997BB620952E373A3C250F80D2503CBAC95DB9B1A2556884FE09555B`；[最终截图](E:/project-funny/mianban-develop/work/robot-motion-live-final-r2.png)，SHA `8EF32BF4F978A627BA493079236C3A4098630F037F78B96E9E8FD75120635C4B`。r1 现场暂停两张正确裁剪 SHA 相同、显式 replay 的记录保留；它属于 reset 修复前源，当前 r2 只改 reset 一行，最终现场源由 r2 记录另核。

独立 [最终验证记录](E:/project-funny/mianban-develop/work/robot-motion-review-final-verification.json) 保存本轮实际四语法完整输出、所有相关 SHA、1256 检查审计、现场匹配和采样重算。85 个实际 frame 覆盖约 509ms，median 6.1ms、p95 6.2ms，恢复首帧相机跳跃 0；**仅本机 headless Edge 控制页面采样，不是物理显示刷新率或 IAB FPS 保证**。4 个宽屏真实 3D UUID 点选与 13 个像素 UUID、多宽度/DPR 边界已有证据；未把它们扩大为所有数量/设备上的完整 3D 点选测试。

## 保留的失败与限制

1. 原长角 reset 是本轮实际缺陷，旧数值复现、VM 红 7/13 exit1 均保留，不以旧 fixture 的绿色掩盖；当前最短角绿与真实长角渲染闭环另列。
2. 第一次完整本批 fixture 1249 检查有 1 年龄显示断言失败、exit1；实际 focus 已 disabled，合成时钟推进遗漏既有 1 秒 DOM callback。只修测量，未放宽 age/focus 语义；随后完整 1251/0，再最终完整 1256/0。原报告 `2026-10-04T03-45-15-399Z` 与 wrapper 原址保留。
3. reviewer 泛打印 fixture 包含 static_responses，`c15bc8` 与 `9429fa` 输出截断；之后显式范围读取和遍历审计 `a74d7f/d8bf7e/fa39cf/8dd182` 完整输出。最初独立审计 `0b4f76` exit1 错把故意 409 当零 HTTP 要求，随后读取预期故障元数据，正确分类。已声明的 revision_mismatch/binding_changed/503/404/cleanup_unverified 不冒充自然产品故障，也不隐去实际事件。
4. 初期合并技能/源码读取有截断，相关技能与实现随后按范围补读；不拿截断输出自称完整证据。r1 作者合并源码读取也被截断，报告记录其完整补读。
5. root 猜错 reset 脚本名 MODULE_NOT_FOUND exit1；正确名重跑遇 EEXIST 保护作者证据，未覆盖。最终依独立实际浏览器 fixture 核验，不称这两个命令通过。r2 作者报告初稿差异 SHA 误填，已按实际生成输出改正、未依错误值验收。
6. root 首张暂停裁剪用了 viewport y，捕获控件而非机器人，原图保留后改 document 坐标；最终 DOM 首次猜不存在的 #robot-mode 导致 TypeError，按实际源码/AX 改 #robot-stage 后另验。当前现场记录保留这些采集失败。
7. 本报告不替换 WezTerm 运行时补修审查、不更新原机器人和父 Q6 冻结状态；它们各自的采集/功能/原生接入缺证继续保留。没有额外用户批准需求。

结论对应冻结两产品源与当前完整证据；这些字节或展示范围改变后需重新审查。root 仍须独立核验本报告与验证记录，reviewer 自称 PASS 不替代 coordinator 的 Gate。

建议英文提交信息：`feat(cockpit): add smooth perspective motion and shortest-path reset`。

无新增跨功能事实。
