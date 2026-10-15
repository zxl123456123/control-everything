# R11 低层方案评审记录（第 1 轮）

**评审对象**：唯一 `lwplan.md` §14，SHA `6595b98915f5cfcba0a9e178617d97d2b17ed567e88d9dac0332b04325ddb294`，169778 bytes；原 §1–13 的138789 bytes保留。  
**评审时间**：2026-10-05，Asia/Shanghai。  
**协议结论**：PASS；本轮仅ReviewLW技术主检，root仍需独立Gate2复核并留明确准入记录。

## 输入、独立性与实际静态证据

本 reviewer 未参与研究、计划或产品，无递归委派；完整加载 plan-review、verification-before-completion，并读取 coordinator/implementation-planning 的适用合同。完整阅读§14、clarifications§18、R11交接/两份研究、实际robot3d/app/index、R10§13/交付/独立审查；另查本地固定r186的Raycaster/InstancedMesh/WebGLObjects与后端来源合并/reader。只执行本地文件/哈希/语法/AST检查与已有输出复算，无浏览器、HTTP、终端程序、数据库或Git操作。

Readiness 独立报告为 `review_notes_readiness_r11_1.md`，PASS仅进入LW；author Gate1 `work/r11-plan-gate1.json` 61项/0fail/exit0、allow_enter_impl=false。本 reviewer 独立核其当前plan SHA、8输入、25条当前manifest和保存prefix，并从4308个真实60秒间隔复算FPS/p95/慢帧。实际 `.venv/Scripts/python.exe -X utf8 -B work/r11-lw-review-checks.py` 输出39checks/0fail/exit0；报告落盘后的全量静态结果另由同命令 `--final` 保存在 `work/r11-lw-review-checks.json`，以其中最终记录为准。Node仅parse robot3d/app/fixture，Python仅AST，不执行产品或浏览器。

Before产品仍全部相同。原fixture在plan前由root追加测量/症状，manifest单独记录，未把它归为作者产品修改。原10秒报告没有raw，只核其摘要/画质/17+21N；60秒有raw才能独立复算。评审不把候选计划、语法绿或旧R10 PASS当实现成功。

## 可行性分析与关键源码核对

1. 现状真实瓶颈为原`robot3d.js:285–317`每角色15部件、`:345–352`五工位块和一边框，48角色1025 calls。共享几何/材质已经存在；实例减少绘制提交是可执行的局部路径。保留48边框与独立selection盘，不加入新引擎或材质系统，原画质与空间不变。
2. §14 S1的批次直接取代理matrixWorld，batch挂scene并单位变换；draw前`world.updateMatrixWorld(true)`先更新真实robot/limb，随后上传/needsUpdate/重新计算boundingSphere，再原renderer.render。世界变换不重复乘parent；正常renderer更新不关闭；静态stations只在拓扑/材质重建时上传。骨架明确保留原moveRobot/patrol/子步/归位/短角转身，未将性能目标转换为减动画工作量。
3. 本地r186 `three.core.js:56748–56770` 的Raycaster检查layers、递归，**不检查visible**；原pointer仅`robots.values()`且回溯完整sessionId。计划`:956–957,985–986`明确camera0、proxy Mesh1、raycaster保留0并enable1、robot roots候选，Group/pivot不改exclusive layer。原不可见selection pad仍参与旧raycast语义；工位、粒子、实例batch不会变成来源候选。实际point与选中盘测试仍由root承接，静态检查不能替它。
4. 本地r186 `three.core.js:25771` 的InstancedMesh.dispose走对象dispose，`three.module.js:4629–4647,4677–4687`监听事件并释放binding state/instanceMatrix。计划重建先remove+dispose旧实例，最终dispose先清两类batch，原geometry/material仍final各一次。不存在把共享geometry/material按每批反复释放的计划。必须通过最终实施与资源实测确认代码遵守此顺序。
5. 映射当前真实缺口在`app.js:227–238`：flow仅远端，Codex选中清空state.selected后仍等待远端UUID。§14 S2一处来源分支保持原Codex完整session_key与远端裸session_id，source.id单列；原`current/eligible/workbenchFresh/terminalReady`及focus/connect/readMessages只作为既有权威。5–30秒可展示位置不能赋予5秒动作资格；历史reader状态独立。API、来源、epoch、轮询和安全动作路线未变。

## Gate-2

**Required Set 复核结果**：PASS。主要工作包可识别为S1-R11渲染、S2-R11映射、S3-R11分层验证；T3包含T1/T2，§14.3逐项定位T1.1–13及T2/T3。各包具文件/首落点、输入输出、目标形态、步骤/依赖、G/N、验收、回退、作者体验和三层证据。不依赖任务数或篇幅门槛，无整条函数链删除，原实现支撑保留。

**目标锁 / 反目标复核结果**：PASS。G11.1→S1/S3同画质48降draw与独立60秒目标；G11.2→S2完整来源键/能力/年龄/原因/现有入口；G11.3→S3真实完整UUID/API/DOM/mesh/工位/三刷新/截图。N11约束在各包明确消费。

### 反目标禁止项清单表格

| 禁止内容 | 本轮方案具体锚点与源码复核 | 结论（lwplan未踩中） |
| --- | --- | --- |
| N11.1暂停/减人口/减画质/隐藏负样本取绿 | §14.1:899/902，S1:990，S3:1057–1065；原AA/DPR/192points/moveRobot保留；calls与FPS尾延迟分判 | 未触及 |
| N11.2动画/updated_at/cwd推忙闲、完成、协作、绑定 | §14.1:903；S2:1011/1032、S3:1067；Codex unknown与后端不猜身份原源码 | 未触及 |
| N11.3后台/API/来源/身份/锁/年龄/预算/CSP/CSRF变化 | §14.1:904/919；S2:1019/1029/1034；backend/cockpit/vendor/Python tests显式不改 | 未触及 |
| POST重试、自动历史/连接/定位、用户进程或未授权正文 | S2:1012/1021/1029/1034/1038，S3:1067；锚点纯href、复制纯clipboard，只有授权自有两marker必要观察 | 未触及 |
| 更多用户聊天、Git初始化、引擎/physics/shader/通用配置 | §14.1:904；S1:951/990；S3:1044/1067–1069；不递归条款§14.3:1105/1107 | 未触及 |
| 静态/功能/旧R10绿代连续或本轮真实图形证据 | §14.2:928，S1:994、S2:1038、S3:1057–1067；独立target原exit1保留 | 未触及 |

### Gate-2 关键复核

| 必填字段 | 结果 | 独立判断依据 |
| --- | --- | --- |
| **关键实现锚点复核结果** | PASS | S1:951的makeRobot/part、update/draw/dispose/pointerup；S2:1000的renderEvidenceFlow/既有render与selection/三个web；S3:1044的观察器、性能/空间/点选/Codex故障方法；首落点可直接核对。 |
| **代码片段充分性复核结果** | PASS | S1:955–988从代理到dirty/rebuild/dispose、同帧matrixWorld上传再render再原raycast；S2:1004–1030从source选择到key/年龄/历史/终端理由/原入口；S3:1050–1063给出输入→实际画面/动作门→连续/真实层闭环。未要求最终实现全文。 |
| **作者体验门复核结果** | PASS | 原part/colored/limbs/key与moveRobot可直读，局部两batch数组/dirty；S2沿element/facts/reasons/原门，一处来源分支；S3沿原check/scenario/requests。未新增管理器、状态机或多文件渲染抽象。 |
| **人工 review 对齐复核结果** | PASS | 以下核心链路顺读、research事实映射、跨包脑补三子项均PASS；本项只汇总，不替代各子项。 |
| 核心链路顺读复核 | PASS | §14.1现状API→原view→robot变换/点选→来源选择/原动作，R11仅上传与展示；明确不改层；随后§14.2事实、S1–S3执行/证据可顺读。 |
| research 事实映射复核 | PASS | §14.2逐行把1025/旧低帧/60秒原红、r186layers/矩阵/释放、原slot/home、Codex原key与unknown、5/30秒与独立历史、可见禁用理由映射到实现及验证口径。 |
| 跨包脑补需求复核 | PASS | 矩阵与身份闭环各自有完整骨架/接口矩阵；S3明确功能/连续/真实层互不代替；无需另造来源或动作资格来填断链。 |

### P1-P9 协议合规核验表

**P1-P9 协议合规核验表**：PASS。

| 协议项 | 结果 | 独立存在性复核 |
| --- | --- | --- |
| P1 | PASS | §14.3:1073/1105明确无任务条数质量门。三刷新/60秒是本批样本范围，不是通用Required数量门。 |
| P2 | PASS | §14.3:1073–1091 Required内容存在性，任一缺失不得放行。 |
| P3 | PASS | :1105/1109双Gate纯必备存在性，不给综合分数兜底。 |
| P4 | PASS | :895本轮T3；:1077–1091承载T1.1–13及T2/T3补充。 |
| P5 | PASS | :1105/1107新关键假设、范围/验收/回退不唯一触发DELEGATE_QUESTION；低风险补证另DELEGATE_ACTION。 |
| P6 | PASS | :1105显式事件触发留痕14.3/README，新风险/假设/阶段切换即时对齐，无固定次数。 |
| P7 | PASS | :1105明确澄清数量不设上下限。 |
| P8 | PASS | :1105/1107 P0安全权限/P1能力预算/P2展示批量模板，未触发原因明确为§18/owner唯一约束。 |
| P9 | PASS | :1109作者Gate1→fresh ReviewLW主检/root独立Gate2→明确准入；失败回LWPlan→ReviewLW，只修本章、不删已实施支撑。当前Gate1确实执行。 |

**基线与澄清一致性复核结果**：PASS。未回答为空；完整G11/N11表、各包和风险均对应§18，无违反已答范围或头脑风暴决策。原N2/R10零增量为历史批次边界，§18显式授权新四web＋fixture，不是隐式扩大旧范围。计划明确自动实施授权持续、技术审查不可豁免，root唯一实现与承接层分别记录，不新增用户许可问题。

**设计味道扫描结果**：PASS。约83理论draw仅作估算，128验证预算容纳实际分类/选择差异，不追进一步复杂调度；保留模型事实为动画/点选，绘制批次只负责提交。映射没有第二套资格算法/状态源；只给可见解释/原入口。未发现阻断性过度抽象。若实施引入额外manager、跨帧cache/新事件推断或拆改步态，将不再符合此结论。

### 证据三元组与剩余风险

| 工作包 | 产物 / owner | 缺证约束与承接顺序 |
| --- | --- | --- |
| S1 | impl静态/局部计算→`work/r11-impl-local-*.json`/manifest/diff；root实例/资源/空间/拾取→完整fixture；fresh reviewer最终diff/全部输出→ReviewImpl | 静态不能证GPU/实际点选；矩阵/材质、类别/增删、dispose、原控制任何缺层均分别未验；双Gate后才改产品。 |
| S2 | impl语法/guard/id/CSS→local/diff；root合成/clipboard/锚点/真实IAB→mapping JSON/截图；fresh reviewer实际负例/隔离→ReviewImpl | 不能以截图或旧R10代本轮行为；新请求/串key/错误资格文案阻断；历史/终端门分别验。 |
| S3 | root/coordinator完整fixture、--game/--space/--perf48/175回归、真实API/WebGL/IAB→完整command/原raw/截图/final manifest；fresh reviewer终验 | 无60秒/原raw/画质条件则性能未验，参考线未达必须列未达；无真实mesh/point/三刷新则G11.3未验；旧owned/Q6/235ms/Codex活动/合作不关闭。 |

同帧矩阵正确不单独证明拾取正确，实际点选与连续性能分开验；资源dispose事件不单独证明无泄漏，重复分类/增删/模式切换和最终释放要由实际记录支撑。单个本机窗口无法证明所有硬件/无限时长，研究建议重复比较可加强因果；当前计划把结论限制到每个完整窗口，故不阻断本轮有限范围。减少draw calls事实与全部性能目标分别判定。

### Gate-2 结论

**Gate-2**：PASS（review_plan独立主检）。十个必填字段均明确，P1–P9、目标/反目标、source-code假设和三层验证闭环具备；未发现需修改方案的P1/P2阻断。root须绑定本报告与当前计划/基线/产品字节完成独立复核并记录准入，才开始产品实施。此前用户实施授权已有效，不需要重新提问；不得跳过技术复核。

## 已见失败、contract与后续行动

原48的35.11FPS/p9560.9ms、R11 60秒71.805FPS/p9530.2ms/3.8069%/1025calls与独立target exit1三失败均保留；--game旧exit0未检48目标、10秒摘要无raw的边界不掩盖。root新增--r11首红19checks/12fail，manualFrames刷新默认rAF polling超时为fixture缺陷，root只改helper为50ms后需实际重验；其它实例不存在/来源映射缺口为候选症状红，不把测试修改当产品完成。

本reviewer一次PowerShell读取语法exit1未执行后续动作、首次checker因10秒无raw的KeyError/exit1，已纠正真实输入口径并保存；几次输出截断已定向补读关键全文。完整失败/修正边界在`work/r11-lw-review-checks.json`，最终绿不删除它们。R10两Pydantic warning/旧R9/R8红/235ms未知及POST非原子/旧独立缺证仍按旧报告保持。

首次最终报告静态核验42项/1fail/exit1只因checker额外要求readiness字面标题“Q&A → 基线”；实际已含技能必需的Q&A→基线字段映射表。原JSON保存在`work/r11-lw-review-checks-first-final-red.json`；仅改checker按实际表格字段核对，没有为虚构标题规则改readiness或产品。root另独立重跑作者Gate1，`work/r11-gate1-root-command.json`61项/0fail/exit0；plan/input/product未变，Gate1 JSON仅时间更新不改变被审字节。

未发现本轮shared/platform/mirror contract drift。旧实施支撑prefix核字节保留，README历史运行PID不能当当前对象；方案不要求服务重启或进程回收。若产品、计划、输入/证据合同在审后变化，当前结论不自动迁移，root须按当前字节重新验证并fresh审查。

后续：root独立Gate2→明确记录技术准入→唯一root实施S1/S2→本轮全部分层验证与失败保全→未参与实施的fresh ReviewImpl。无产品修改建议需要扩大范围。

无跨功能事实。
