# 方案评审记录：lwplan（第 1 轮）

**评审对象**：本批唯一 lwplan.md，最终冻结 SHA-256 为 5C50E2FA4D2AD02F797BF98EAD4E01C3E38AFD916F2C8933E36497D81C83771C。
**评审时间**：2026-10-04（Asia/Shanghai）
**角色**：fresh independent review_plan；review_target=lwplan；未参与规划或实施；非递归。
**协议结论**：PASS
**评审结论**：通过本版方案的 Gate-2 主检
**产物状态**：READY

本结论只覆盖低层方案的可执行性与正式合同。现有 F1 仍能复现，新图形、分类与同源路由尚未实施；不能据本报告宣称产品已修复或已验收。coordinator 复核后仍执行 **STOP_BEFORE_IMPL -> ManualMode** 并呈递实施入口，不自动进入代码。父批保持 impl_reviewing / USER_CONFIRMATION_NEEDED；Q6 客户端观察及原 reviewer 的后续判断独立保留。

## 输入、独立性与版本

先完整加载全局 AGENTS、coordinator、development-workflow、implementation-planning、plan-review 与 verification-before-completion，再预读权威基线、研究及实际代码。收到 root 转发作者 FINAL READY/hash 前未读取生成中的方案；收到后完整读取最终版，首读中段截断已连续补读 :233–319。未与作者讨论实现或代写方案。

| 输入 | 本轮独立重算的 SHA-256 |
|---|---|
| clarifications.md（本批唯一权威） | C6B82AFB523786A1E3C1C6F16928CEB635828727A1676465E50C299B56F2FF1C |
| review_notes_readiness_1.md | 20707EE15381CDF9D0AA8680254FD89189CA778A59B3D28B5719E6E49D68D1FE |
| research_render_dependency.md | 66248BAD6C01FE8C3B056109A93C16071D7752D03186763C091641CE7CFE4ACE |
| 父 research_mapping_feedback_r3.md | 725374D57D0F2E5B6558BDFEED940AA9929671CCB9DFF495C6F2D35831B1A25B |
| 父 research_robot_github_r3.md | D8877C7771398F272BF3965EE72240508636C797ECBCB47AD4134854E68DFC06 |
| 父冻结 lwplan.md | 38E3F991AA0BBF3434F2A9B7A2562EA0DBFE7520095C894003B4934018AB3074 |
| 父冻结 impl_report_r2.md | 19AE65E0A53697CAA7875DD4D35E620874463A5D265ACF8DCA118A4C13FE1661 |
| 父冻结 review_notes_impl_r2_1.md | 00C46A9853384AD006383A215638ECE5815D1088CF1F94DCF12ECC538E37E5D7 |

本批 README 是阶段页；本轮版本核验时 hash 为 AABC4366D767B383D9626D26C3E05850EB700D6FBCC6832801FD95F2A3B40DAA，允许 root 仅更新 Review(LW) 状态，不把它当新增决策源。基线 hash 未变化。

实际完整读取 service.py、gateway.py、remote_probe.py、terminal.py、source.py、web/app.js、index.html、style.css、五组 Python 测试与旧 synthetic DOM harness。使用 r2 manifest 独立核对 21 产品路径，全部保持原 hash；三份父冻结文件也匹配。只读了过滤元数据、依赖和预览证据的必要字段；本轮未读取私人正文、调用真实 focus、修改外部/config、安装、重启或 Git。

## 可行性分析

方案把修复、证据表达和画面分开，仍由现有 SessionService 与 app 单一状态承担真实功能。新增 registration_state 与有界 last_evidence 是分类所需的小增量；renderer 只消费浅视图和 UUID 回调，不能取得 query、消息、CSRF 或定位接口。没有引入第二套 store、控制渠道或活动推断。

固定 Three 两文件闭包及 MIT 原文已能在本地重新核对；五条精确静态路由、动态 import 隔离和独立 Canvas 2D 有明确目标骨架。Three 官方文档确认 renderer 使用 WebGL2，模拟上下文丢失依赖 WEBGL_lose_context；方案据此把能力不足、初始化、首次绘制、实际 lost 与合成事件分开验核。[官方 WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) 运行模块仍须保持其依赖可解析；本方案采用已核同源闭包而保留当前 CSP。[官方安装说明](https://threejs.org/manual/pages/installation.html)

未发现需要用户再次拍板的业务范围问题。生产同源加载、真实 GPU/上下文及 API/UUID 联动是已有责任下的后续验证，不是当前已证实能力。

## 风险点与证据边界

- 旧数组可能跨时点累积。C1 明确只保存紧邻上次采样，不递归历史，并标“历史原因发生时间未核验”；原 observed_at 不能升级为每项故障发生时间。
- 启动或滚动混版本必须保持 DOM 可用。Three 静态 import 只存在于动态进入的可选 robot3d 模块，不成为 app 启动依赖；cockpit 自身失败也有文字路径。
- 实际 context lost 必须由真实 canvas 事件和扩展支持证据确认，不能只发 synthetic event 后写成真实丢失已测。MDN 明确该事件不冒泡，实施时应在实际 WebGL canvas 上观察。[MDN context lost](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event)
- 受控加载新 Python 服务会失去既有内存索引保留行。:373 明示由 coordinator 核归属并正常加载新版本，禁止把旧快照注回生产；因此真实保留分支缺新鲜实例时必须分别未验证。
- 真实消息和 focus 是两个独立承接结果。若任一必要产品证据未完成，fresh Review(Impl) 不能据 fixture 或画面整体放行；父 Q6 继续独立。

## Gate-2

### 1. Required Set 复核结果

**Required Set 复核结果**：PASS

主要工作包为 :251–339 的 S1–S4，边界可识别。任务确属 T3：service 证据字段、HTTP/MCP 透传、app、可选 renderer、同源静态链及验证职责相连。按 canonical T1 基础、T2 增量与 T3 增量逐项复核，未用任务数量评分。

| 必备内容 | 本版实质落点 | 独立结果 |
|---|---|---|
| 目标锁 / 反目标 / 不影响项 | :207–216；四包消费 G/N | PASS |
| 受影响文件及 reviewer 首个落点 | :41、:255/275/297/323；已对照实际文件和函数 | PASS |
| 每包目标、变更、步骤、验收、回滚、依赖及结构锚点 | S1–S4 的显式字段，:261/283/309/331 与各包回滚 | PASS |
| 目标锁/反目标下沉各包 | :253/273/295/321 | PASS |
| impl / coordinator / 非 impl-safe 责任与三元组 | :265/287/313/335；§6 两类 JSON、报告与承接次序 | PASS |
| 每包作者体验与声明可读性 | :267/289/315/337；见第 5 项独立复核 | PASS |
| 先主链再工作包 | §1 :7–41 在四包前，含现状、改动、不改层与理由 | PASS |
| research 事实映射 | §2 :47–60 逐项实现、测试、责任，不只散列引用 | PASS |
| 跨层片段闭环 | §3 C1–C5 从原因到分类/选择/API再到加载/路由 | PASS |
| Gate-1 明确自检关键内容 | :385–402 明示映射、分层、证据、体验、主链/事实/片段 | PASS |
| 双阶段门禁执行人、时机及失败回退 | :381–406；作者自检、fresh 主检/root 复核、修订回环、STOP | PASS |
| 澄清强触发与批量模板 | :410–425；新假设/风险/阶段，P0/P1/P2 和受控出口 | PASS |
| 风险、缓解、失败降级和 Gate-2 关键核查 | §4 状态表、§7/§9、:406 | PASS |
| T2 输入/输出/边界与测试分层、回归范围 | 四包边界、§4 接口、§6 完整 Python/浏览器/原分页和资格回归 | PASS |
| T3 跨模块接口、兼容/迁移、降级与停机 | :218–247、§7；additive 字段、旧 API 保守兼容、generation/手动回退、精确回滚 | PASS |

计划未删除旧函数链，故大规模删除附加名单不适用；S4 明示无删除旧产品函数链，并要求完整自有代码 diff，不可把未知删除隐藏在 manifest 中。

### 2. 目标锁 / 反目标复核结果

**目标锁 / 反目标复核结果**：PASS

G1 落到当前原因/注册证据与四组列表；G2 落到同一 selected/epoch/page、按需消息和显式 focus；G3 落到当前/上次原因分开与来源、陈旧、图形故障 unknown/回退。Q8 的 3D 主视图、像素/文字回退保留，不能退化为仅提案截图。

| 禁止内容 | 可核查方案依据 | 结论（确认方案未踩中） |
|---|---|---|
| 新发送、审批、resume/终止、Hooks | :212/216、C3 :131–146；renderer 只有 onSelect，focus 只显式按钮 | 未踩中 |
| 远端配置、信任/认证、MCP、其它项目与全主机采集 | :37/212/216、:373/377；固定 source/预算和三工具不改 | 未踩中 |
| Jev / Cinema 4D 与整套 React/PTY 控制链 | :55/212/295/315，说明采用几何、拒绝整套框架的原因 | 未踩中 |
| 动画/进程/消息更新冒充 busy/idle/审批/完成 | :213、:301–305；证据类别色、无持续活动动画、活动/完成 unknown | 未踩中 |
| cwd/tty/title/旧 slot/一次成功猜配 | :52/214/216、C2 :121、C3 :146；原身份/定位拒绝规则保持 | 未踩中 |
| demo、随机数或提案快照冒充实时 | :51/60/214/311/363/371；N 来自 records，不回注旧快照 | 未踩中 |
| 运行时 CDN、广放 CSP、默认 addon/贴图/外部模型 | C4/C5 :179/193–203、S3 :301/307；精确闭包与原 CSP | 未踩中 |
| 帧循环、模式/旋转/刷新元数据读取消息或外发状态 | :146/225–229/303/353–358；API handle 不传 renderer、请求日志验证 | 未踩中 |
| fixture/Node/118预览代判真实环境或父 Q6 | :60/313/335/360–367/437；证据分别未验证，父批独立 | 未踩中 |
| 自动进入实施、初始化 Git或覆盖他人工作 | :3/327–339/377/406/425；严格 STOP、清单 diff/归属 hash | 未踩中 |

### 3. 关键实现锚点复核结果

**关键实现锚点复核结果**：PASS

| 工作包 | reviewer 首个实际落点 → 可预见的目标结构 | 结果 |
|---|---|---|
| S1 | service.merge_observation 的 raw/candidates/reason 初始化 → 当前原因只由本次来源生成，registration_state 三态；prior 的有限字段留在 last_evidence；mark_unknown/_view 只撤资格，不引历史递归 | PASS |
| S2 | app.current/eligible、renderSessions/renderSelection、selectSession → 一个 recordView 派生四类，共享 UUID 选择；原 readMessages/updatePaging/focusSession 保持，旧 page/来源错误标清 | PASS |
| S3 | index classic 脚本、gateway.do_GET/reply → 无网络 classic cockpit 外壳＋动态可选 robot3d，固定两文件/许可精确路由；scene 的 update/rotate/dispose 与失效回调闭合 | PASS |
| S4 | 新 tests/verify_robot_cockpit.cjs --fixture、已有 Python 回归与 before/final 清单 → 受控 HTTP/浏览器边界，完整自有代码 diff、两类命令证据及 fresh Review(Impl) | PASS |

锚点包括跨层字段、onSelect、模块接口、状态表、MIME 路由、真实承接与回滚触点。S4 的测试模块入口足以定位证据职责，不以“详见上下文”代替具体文件。旧 live harness 被明确禁止运行；旧 synthetic 行为需迁入新入口，原 work 脚本不改。

### 4. 代码片段充分性复核结果

**代码片段充分性复核结果**：PASS

| 片段 | 命中的必填触发与闭环作用 | 结果 |
|---|---|---|
| C1 :72–95 | 修改分支输入和共享字段；before/after 显示旧数组粘连、当前来源门与有界上次证据，拒配顺序保留 | PASS |
| C2 :101–121 | 分类判定顺序变化；先有效性再注册/位置，旧 provenance 的保守兼容与上次 slot 语义明确 | PASS |
| C3 :127–146 | 三种选择入口共用 UUID、成员检查/同 ID no-op；原消息 epoch/分页和显式 focus 不迁进 renderer | PASS |
| C4 :152–184 | 加载顺序与错误边界变化；app 独立、动态模块、generation、off-stage 首绘、两 canvas/DOM，lost 不抢回 3D | PASS |
| C5 :190–203 | 静态契约变化；五个完整精确路径、JS/plain MIME、core 相对闭包及静态缺失 404 安全头 | PASS |

S1–S3 所有强制触发均有片段，且 C1→C2→C3→C4/C5 可直接串起主链。S4 解释“文字足够”的依据是证据/测试职责而非新产品分支，配合具体命令、manifest/diff 结构足以预见产物。片段是结构级骨架，没有要求作者逐字复制接近完整实现。

### 5. 作者体验门复核结果

**作者体验门复核结果**：PASS

这里分别判断后续实现者的编写负担、目标声明的可读性与方案顺读，不以漂亮图或字数减少替代。

| 维度 | 具体前后判断与保护点 | 结果 |
|---|---|---|
| S1 编写/维护 | 原显式 if/elif 不改成事件仓库或原因优先级配置；一处原因初始化＋上次证据字段即可定位 F1；三阶段 fixture 表达真实故障 | PASS |
| S2 声明/体验 | 分类及中文原因集中 app；浅视图四类枚举明确，三种视图不复制资格规则；原 DOM ID 与 selected/epoch/page 保留 | PASS |
| S3 外形/失败维护 | 外形在原创几何处，加载/模式在外壳，真实功能在 app；接口没有权限，dirty 绘制代替活动系统；无新框架/用户配置 | PASS |
| S4 测试/交接 | 用户行为、45 条边界和 F1 是用例目标；一个默认 fixture 入口、完整失败和 before/final diff 减少接手猜测，不镜像实现每行 | PASS |
| 方案可读性 | 主链、research 表与 C1–C5先于工作包；可以按 :7–247 判断目标代码责任，再到四包看执行/验核，不必跨包重建主链 | PASS |

新增 registration_state 和浅 view 字段均有用途，名称与职责关系可直读。未发现“更抽象但更机械”的回退。原生按钮保留 Enter/Space/Tab 与焦点；画布不另造键盘状态机，卡片直接显示原因也避免用户为理解未映射先读正文。

### 6. 人工 review 对齐复核结果

**人工 review 对齐复核结果**：PASS

总括项明确汇总以下三个子项：核心链路顺读复核=PASS、research 事实映射复核=PASS、跨包脑补需求复核=PASS；任一子项失败就不能得出本总项 PASS。

| 子项 | 结果 | 独立依据 |
|---|---|---|
| 核心链路顺读复核 | PASS | §1 现状 service→app→UUID/API；§3 原因/分类/选择/隔离加载/路由；§4 不改层、接口、状态；§6 fixture→root→fresh review，四段可以连续顺读 |
| research 事实映射复核 | PASS | §2 F1/F2、动态时点/不同 count、严格绑定/unknown、45条/epoch、参考取舍、固定包/白名单、context失效与提案边界均映到实现及责任；C1历史时间不冒充事件时间 |
| 跨包脑补需求复核 | PASS | S2 输出 view 与 onSelect、S3 只消费；app 保留唯一功能状态；S4 在编辑前保全、编辑后完整 diff与两层证据。无须从三包猜 renderer 是否有 API、谁执行真实focus、回滚是否覆盖父报告 |

实施顺序不是“先四包顺序写完才保全”：S1/S4 都明确开工快照先于编辑。跨包依赖、root 服务归属/版本、内存保留行边界及人工 Q6 责任均已显式，不需要 reviewer补架构决策。

### 7. P1-P9 协议合规核验表

**P1-P9 协议合规核验表**：PASS

| 协议项 | 结果 | 存在性判断与依据 |
|---|---|---|
| P1 | PASS | :383 禁止以任务数评分；本轮 rg“至少\|至多”无匹配，exit1为预期 no-match；四包数来自职责 |
| P2 | PASS | :383–406 必备内容存在且实质齐备，任一缺失/失败不放行；不是总分或印象门禁 |
| P3 | PASS | Required Set 和双 Gate 为纯存在性硬门禁；未以任务/提问数量、字数或自报绿灯换放行 |
| P4 | PASS | :3明确T3，Gate-1表含T1基项、T2边界/回归与T3接口/迁移/停机；本报告逐项复核 |
| P5 | PASS | :414–425 对范围/权限/绑定放宽、依赖字节与归属/恢复不唯一强触发受控问题；技术已分配未知不重复让用户拍板 |
| P6 | PASS | :412 指新假设/风险/阶段切换即时对齐，留痕§9/状态/审查；本轮 LW→Review 留痕及STOP明确，无固定次数 |
| P7 | PASS | :414 不按固定数量凑问题；没有澄清数量上下限 |
| P8 | PASS | :414–423 按 P0/P1/P2一次批量、选择和回复模板齐备；本轮未触发的原因明确 |
| P9 | PASS | :381–406 Gate-1作者交付前、Gate-2 fresh 主检＋coordinator 复核，失败回环/不唯一提问；PASS仍停止于实施前 |

:425 明示阶段 agent 不递归委派；:406 中另派 fresh reviewer 的主体为 root/coordinator，没有指挥下游 agent 创建下级代理。

### 8. 基线与澄清一致性复核结果

**基线与澄清一致性复核结果**：PASS

本批“未回答”为空；父 Q6 不属于本批新增范围决定。目标锁被遵守、反目标未踩中、已确认决策未违反。未发现 PROBLEM_DEFECT，也无需重新决定 Q8 或用技术缺口倒逼用户批准扩大权限。

| 权威输入 | 最终方案落点 | 一致性 |
|---|---|---|
| Q8：3D主视图＋像素/文字回退；共同修原因/分类并复用UUID功能 | S1–S3、C1–C5、§4图形状态表 | PASS |
| §1目标锁：事实更易判断、角色复用真功能、F1/unknown/文字 | G1–G3、四包消费与验收 | PASS |
| §2反目标：无新控制/推活动/猜配/假实时 | N1–N3与上表逐项检查 | PASS |
| §3固定来源、原生网页、同源固定闭包、默认元数据 | :37/216/307、C4/C5；保留source/remote/terminal边界 | PASS |
| §4不改配置/信任、真实缺口不猜、签名/GPU不代判 | :265/287/313/335、§7/§9 | PASS |
| §5时点持续变化与5保留样本、提案非实时验收 | :51/60/301/363；N动态、不固化4或三槽常绿 | PASS |
| §6责任三元组与承接次序、过滤真实正文、focus副作用 | :265/287/313/335、:360–367；两类JSON及fresh review | PASS |
| §7–10父冻结、唯一权威与补充输入规则 | :3/5/327–339/377/410–425/437 | PASS |

旧客户端忽略新增字段，新客户端配旧服务只从新鲜 observed/provenance 推注册；没有复用混时 reason_codes 做当前身份或故障证明。当前/API unknown 与陈旧优先覆盖分类和资格。更新 Python 服务可能丢失内存旧行被明确记录为限制，不能把历史基线数据灌回生产补数。

### 9. 设计味道扫描结果

**设计味道扫描结果**：PASS

未发现阻断或需保留 WARN 的设计异味。registration_state 为当前/旧记录分类所需，last_evidence 有界不递归；category 在 app 一处推导；renderer 接口无权限；3D yaw/dirty 绘制和独立2d替代额外controls、资源及持续活动系统。异常处理只覆盖已识别的模块、初始化、运行期、API及资格边界，没有新增配置框架、活动规则或跨项目重构。

2.02MiB固定vendor字节是已确认功能依赖，不因此要求引入压缩/LOD/构建系统；体积、实际负载与未核签名已明示。before/final快照与diff是无Git现实下审最终变更的必要证据，没有初始化版本库或覆盖其它工作。

### 10. Gate-2 结论

**Gate-2**：PASS

九个前置 canonical 字段均有显式值，P1–P9各项与人工对齐三个子项均通过。本版低层方案有足够锚点、结构片段、基线映射、责任与回滚，可由后续作者在已确认范围内实施，不需先作新的架构/权限决定。

放行仅是本版方案 Gate-2 主检。root需复核最终报告、方案与基线hash；任何需求/方案/相关文件变化使相应旧判断失效，须复核当前版本。下一状态固定 STOP_BEFORE_IMPL -> ManualMode；不自动派实施。

## 本轮实际验证与完整证据

完整命令文本、stdout/stderr合并原输出、退出码、92项逐条检查、F1字段和限制保存于 work/robot-lw-review-verification.json；不借作者 Gate-1自报代替本轮执行。

| 本轮实际命令/动作 | 完整输出结果 | 结论限度 |
|---|---|---|
| .venv/Scripts/python.exe -B -m unittest tests.test_observation tests.test_gateway tests.test_focus tests.test_messages -v | Ran 43 tests in 6.129s；OK；exit0 | 四组既有本地fixture回归。没有执行当前不存在的新增F1测试/harness，不称产品或客户端验收 |
| .venv Python -B 内联最终输入/21产品/3父冻结/三依赖hash与size/相对import/MIT/四包结构/F1实际merge核验 | 92检查、0失败；exit0；module/core/许可字节均匹配；基线/方案/研究/父冻结hash匹配 | 只核本地事实、结构与完整性；实质Gate判断在本报告，脚本存在项不替代人工 |
| 同一内联脚本的三阶段F1复现 | top=observed，row=registration_missing，reason_codes=[source_unavailable,registration_missing]，bug_still_present=true；unknown/pane/活动边界保持 | 确认现有F1仍存在；不是修复红绿，后续必须按方案新增真正红绿回归 |
| rg -n -- '至少\|至多' lwplan.md | 无输出，exit1；预期no-match | 只核无固定任务/问题数量硬门槛；不隐去非零退出码 |
| 写报告前产物存在性保护 | 两个输出路径均此前不存在；exit0 | 未覆盖别人的同名审查/证据 |

本轮没有跑现网HTTP、真实消息或focus，没有浏览器产品GPU/context/API故障验收。00:06:53固定样本只被读取并核口径；root的118提案结果只作讨论证据。后续完整实施验证必须包含MCP及新harness；不能用本轮43项替代§6的完整实施矩阵。

## contract drift / stale / mirror mismatch

仍存在已知 shared里程碑索引漂移：development-workflow 中“review_plan完成(lwplan)通过进入Impl”与 coordinator 的严格停止条款冲突。已向 root显式上报；最终方案:3/406/408、README/readiness及本报告均沿更严格 STOP_BEFORE_IMPL -> ManualMode，不自动推进，不对global技能/mirror全面一致作断言。本review不修技能，不把漂移折成后续可忽略事项。

本批基线/readiness/指定research与最终方案的UUID、来源、unknown、责任及停止口径未发现其它冲突；未进行全局镜像审计。父Q6状态不因本Gate改变。

## 已见失败与限制留痕

本reviewer首个技能批读超过外层输出预算，受影响的三份长技能已逐份完整重读。依赖研究E1表被省略后补读:66–76；最终plan中段被截后连续补读:233–319。公开官方文档组合输出和宽rg结果也超预算；已观察实际相关官方段落，方案全文先前完整读取，阈值用窄rg复核。被截部分不作为证据；这些工具显示限制不冒充测试失败或成功。

首次报告写入调用的 JavaScript 模板字符串与正文反引号冲突，工具在执行前返回 SyntaxError: Unexpected identifier 'lwplan'；没有写入文件，不存在可当成功的退出码。已去除模板冲突后重新写入，并按最终读回核验交付。该失败同时保留在独立work证据。

本轮43项既有测试和92项核验没有新增失败；窄rg exit1为预期无匹配并已明示。现有F1仍是已见产品缺陷。未运行旧会覆盖work证据的UI脚本或含真实UUID的live harness。

上游历史失败继续保留：提案悬空canvas/不完整回退、5倍裁切、小屏遮挡、stage高度、像素抢选、旧wrapper与屏外裸坐标点击失败、故障注入console及包装警告；依赖GBK ©失败、错误安装页404、候选路径404及未核ECDSA签名；父r1/r2竞态红控、runtime/CLI/fixture/UI/端口与正式审查失败。新产品并不存在，不能以本报告或预览最终118全绿冲掉这些记录。其详细原输出仍在原报告与work文件，没有被重写。

## 修订建议与后续行动

无阻断修订项。保持当前冻结方案；root复核后呈递具体实施入口并停止于手动模式。后续若获准实施，先完成S4 before保全，再按S1红绿、S2/S3受控功能与§6完整回归推进；root承担真实消息/focus/生产版本证据，fresh reviewer审最终diff。技术未知未验证不变成用户新范围问题；真正范围/权限/验收变化按受控出口回写权威基线。

无新增跨功能事实。英文提交消息建议：docs: review session robot cockpit implementation plan and evidence boundaries（本review不执行Git）。

