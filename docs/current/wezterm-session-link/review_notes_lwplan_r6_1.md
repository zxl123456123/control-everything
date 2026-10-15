# R6 完整采样补丁独立 Review(LW)

review_target: lwplan  
review_round: r6  
review_seq: 1  
review_date: 2026-10-05（Asia/Shanghai）  
reviewer: codex_index_impl_review（未参与本轮方案或产品实施）  
评审结论: PASS  
评审对象: 唯一 lwplan.md 新增 §9，SHA-256 `960DA811086730F03E7E9C231B4CCAC58DE6C133C8F70CEA473A109DCE9D217F`

本结论只证明有限完整重采样方案可以交给 root 复核放行；不证明代码已实施、实际采样改善或 R5 定位稳定。未执行真实 CLI、Win32 采集、数据库、HTTP、GUI、SSH、D: 写入、服务操作、Git 或递归委派。只新增本报告与 reviewer 独立文件/AST 证据。用户持续自动实施授权保留，技术双 Gate 保留。

## 输入和独立证据

重新全文加载 plan-review，按 canonical 定向读取 implementation-planning 的 Required/T2/T3、主要工作包、片段和原地修订合同，结论前全文读取 verification-before-completion。已完整读当前 native_processes/test_native_processes、R6 §13/恢复原文/研究/主入口 stress harness、正式 §9/准确 patch/作者 checker；当前 Workbench 期限及前后观察关键函数另行复核。R5 当前冻结清单、本地76测试完整输出、原 §8 与 r3.1/r4 合同按继承资料核对，不把它们当本次运行验收。

| 输入 | 独立核验 |
| --- | --- |
| 权威澄清 §13 | SHA `28A4EC56BFB9A1590E22D0C2DA41FE054A9FE220F0B48C38CA3F4D08DE4B6E8A`；源记录 SHA `DF1B4B86047FBAE9FC2B628B6CDD83C6D0CBAEB7314FBD2CB536D76A0B5E455B` |
| 当前唯一方案 | 90756 bytes；保留原73602 bytes、SHA `898EE858ECAE67CF6808E488FEB134E3182C2DE38F5BA5F4D6375D3FC98ECC2E` 的整个前缀；仅追加空行与 §9，无删除/重排 |
| 准确差异 | 全文读取并从 before/current 独立重建 unified patch，逐字一致；`work/wezterm-census-lw-r6.patch` SHA `F6D7310EB41338F521FE12AFD8A37ED0AFD17A4F57FC82A280635A017B9DEEA6` |
| 当前未实施两文件 | native SHA `115D8969B29861CC663D4C2BE5EC194C57FCA75A0360944089DDD891DC9F1BF4`；test_native SHA `FD670F7D5E557694231FD4521E6FC1E28C12D34C4F340C23ED6751791BAF2197`；AST有效、main仍单次采集 |
| R5 最终局部冻结 | terminal SHA `4448255D75B81D1E7BC4A18A28A0CED791E39A57C57ABD4E09DD9B354062BC39`；test_focus SHA `5BDC13645241C46BD3E6D409C41566CF4FAFB2690A06AEB0F56B1507A7977A6B`；R6 before已绑定，旧版本只留历史 |
| 作者与 root Gate-1 | `work/wezterm-census-lw-r6-gate-result.json`、`work/wezterm-census-lw-r6-root-gate1.json` 均97项/0失败/exit0，完整 verdict已读；final plan/manifest/checker匹配，allow_enter_impl均false |
| reviewer 独立命令 | `work/wezterm-census-lw-r6-review-verify2.py` 实际48项/0失败/exit0，完整输出已读；证据 `work/wezterm-census-lw-r6-review-evidence2.json`；正式字段与报告字节的最终复核另存 `work/wezterm-census-lw-r6-review-final1.json` |

真实 main-before JSON 已完整解析所有30 helper和30 probe：7个 helper失败（0/8/10/14/27/28/29）、exit1；23个已接受 helper 的 rows 均为原六字段。probe30个返回码都是0，但7/9/10输出为空，只27份有客户端内容，`probe_failed=[]`不能表示30次客户端解析成立。两组低层100样本保留11/15失败；第二组全部15 traceback/即时上下文已读，7次出生时间大于原 snapshot_ticks、6次 OpenProcess/immediate87、1次QueryImage/immediate5、1次wait拒绝。这些说明单次样本失效；Win87/5本身不证明进程已退出。串行15成功与并发15中5失败也已核对，不选择性只展示串行绿。

## Gate-2

### Required Set 复核结果：PASS

本轮主要工作包为 S1-R6（main调度）与 S2-R6（直接行为回归及证据收口）。增量为 T2，但继承原 feature T3，未通过类型降级绕过原高风险合同。

| Required 项 | 独立语义复核依据 |
| --- | --- |
| T1.1 目标/反目标/不影响项 | lines476–478及两包首段：G1直接目标，G2/G3/N1–N3保全，PASS |
| T1.2 文件/首落点 | lines494/524：native.main原调用、NativeCensusTests主入口输出与后续行失败，PASS |
| T1.3 工作包闭环 | lines494–518/524–540：目标、形态、执行顺序、依赖、验收、局部回滚齐备，PASS |
| T1.4 每包G/N消费 | lines494/524明确同一G/N，不允许因mock绿削弱guard，PASS |
| T1.5 三层证据责任 | lines518/534–540：impl本地、root实际环境、fresh reviewer；证据owner及缺证限制明确，PASS |
| T1.6 作者体验 | 短循环/原异常/现有FakeApi，不建策略框架或进程模拟器，PASS |
| T1.7 核心链路总览 | line478原GET→helper→完整采集→原解析/双样本；明确不改上下层，PASS |
| T1.8 research映射 | lines482–488：五类事实分别绑定实现、测试与运行证据口径，PASS |
| T1.9 片段闭环 | lines494–514骨架连入口、同deadline、eligibility、关闭优先、终态输出；原上下层接口明确，PASS |
| T1.10 Gate-1显式项 | line563四必填及主链/映射/片段/前缀/当前输入，实际97项可追溯，PASS |
| T1.11 双Gate/回退 | lines563–565：作者→root→fresh Gate2→root实施，失败唯一§9回环，PASS |
| T1.12 澄清/批量模板 | line548优先级、推荐/代价模板、无新用户问题原因、受控补证，PASS |
| T1.13 风险/降级/复核 | lines546/563完整期限、关闭失败、连续失效、诚实unknown与缺证限制，PASS |
| T2补充 | 原argv/六字段/exit/stderr输入输出、完整样本/空样本/异常/期限边界、mock及回归层明确，PASS |
| 原T3补充 | lines476–478/518/538/561原接口矩阵与状态不变、无持久迁移、归属确认reload/局部回滚；锁/latch/生命周期/focus隔离，PASS |

### 目标锁 / 反目标复核结果：PASS

用户要求真实会话能力稳定。§13把本轮缩到失败完整清单的有限恢复；不能把不可读行当已退出、计数零或上次成功。本轮收益仍需实际主入口与原刷新负载证明。

| 禁止内容 | 可核查依据 | 未踩中结论 |
| --- | --- | --- |
| 跳过不可读行、拼接样本、缓存旧成功、移动snapshot时间 | lines476/478/494/529/532：每次完整原census，新成功才输出，原ticks及guard不改 | PASS |
| 三次各开新5秒、延长父观察/年龄/30秒合同 | lines476/494/501–504/528/532/536：deadline一次，父remaining不改，6秒只诊断启动包络 | PASS |
| retry所有消毒api_failed、吞关闭失败、持续等待 | lines494/506–510/530–532：ValueError类别且精确字符串，close_failed note立即抛回，最多3次 | PASS |
| 更改Win32 ABI、缓冲、PID/parent/image/birth/handle校验 | lines494/529/532：仅main调用；原函数字节不动，资源轨迹与拒绝例保留 | PASS |
| 启动/复活/输入/清理终端、修改D工具/配置或R5 focus | lines476/516/518/524/538–540：仅两文件；非impl-safe由root按已有归属承接 | PASS |
| 清latch、一般进程树回收、伪装唯一关联/精确客户端握手 | lines478/538/546：原锁/latch/双样本/后验不变，不称原子握手 | PASS |
| 以这轮PASS关闭R5实机、旧owned回收、Q6/Codex正文或整套稳定 | lines470/518/538/546/565：各层缺证独立，不混用metadata/样本/关联/focus结论 | PASS |

### 关键实现锚点复核结果：PASS

唯一产品落点是 native.main 中现有单次 census调用；原错误消毒出口保留。当前census内部rows局部且失败不返回，finally关闭全部已取得handle并把close_failed附到原异常。重新调用完整census不会继承失败部分行，资源关闭note也不会因重试而丢失。当前WorkBench._processes仍受父remaining(deadline)限制，_rows尾校验和observe最早observed_at/age没有迁移。

### 代码片段充分性复核结果：PASS

异常捕获范围和early-exit改变，触发必需片段。lines498–514涵盖argc后一次deadline、range(3)、精确错误字串、close note拒绝、最后一次原抛、break及循环外一次输出；独立AST复核了这些关键结构。没有为不足证据虚构新接口，也没有要求最终实现全文。合法空列表第一次成功即退出；总失败不可能进入未赋值rows的打印，因为第三错原样抛出。

### 作者体验门复核结果：PASS

直接短循环是与现有代码相称的实现；不需要retry策略类、配置、缓存、provider、新的错误层次或分布式协调器。新测试复用现有FakeApi，直接主入口返回、单记录输出、次数、同deadline和关闭轨迹均可读；真正的“先有部分行、后失败、再换新完整清单”测试可防止只镜像实现的无意义覆盖。原后续行失败close计数2→6反映三个完整失败样本，拒绝语义仍必须保留。

### 人工 review 对齐复核结果：PASS

| 子项 | 结果 | 独立依据 |
| --- | --- | --- |
| 核心链路顺读复核 | PASS | §9.1先给现状/改动/不改层，S1顺读入口与错误优先级，S2连接red→green→实际main→browser；无需自行拼主链 |
| research 事实映射复核 | PASS | 明确低层census红不等同main修复红，研究2次建议由已记录3次决策覆盖；官方module错误重试不是本产品依据；实际收益/退出因果未过度声明 |
| 跨包脑补需求复核 | PASS | 原六字段/exit接口、行为测试矩阵、三层owner和缺证后果均明确，不要求reviewer补设计或新权限 |

总项明确汇总以上三个PASS，与作者体验门分别判断。

### P1-P9 协议合规核验表：PASS

| 项 | 结果 | 当前存在性证据 |
| --- | --- | --- |
| P1 | PASS | line550/565无任务数质量门槛；3次为操作上限、30/100为真实复现窗口 |
| P2 | PASS | lines550–563完整Required与缺任一不放行 |
| P3 | PASS | 同处纯存在性硬门禁，保留红，不用检查数量证明技术正确 |
| P4 | PASS | T1十三项/T2补充/原T3继承表明确 |
| P5 | PASS | line548基线/范围/验收/回滚不唯一才受控提问，不重复已答授权 |
| P6 | PASS | line548实际main红、空stdout、次数决策、阶段及R5依赖事件即时留痕 |
| P7 | PASS | line550/565无问题数上下限 |
| P8 | PASS | line548 P0/P1/P2批量推荐/代价模板及本轮不触发原因 |
| P9 | PASS | lines563–565当前作者Gate1/root独核/freshGate2/root放行；失败原地回环，无递归任务 |

### 基线与澄清一致性复核结果：PASS

本范围未回答列表为空。§13“仅main/共3次/最早5秒/完整样本/精确错误/close立即失败/仅两文件”直接映射S1/S2；§12的自动实施、稳定目标与真实focus/GUI测试仍由root承接。原G2/G3、N1–N3以及用户3D展示和日常开发目标没有被重新定义。R5局部冻结是输入前提；整批实机PASS不是前提，避免循环。根代理随后承担impl角色时仍应分开记录本地自证与其真实环境承接，fresh Review(Impl)保留独立核验；调度变化不扩大代码或动作授权。

### 设计味道扫描结果：PASS

没有发现阻断或非阻断的新增设计异味。有限完整重采样处于同一个已有主入口，失败丢弃整份、预算不变；没有围绕瞬态故障建设无需求的通用安全/重试框架。三次不保证收益，已作为真实窗口验收风险而非新防御抽象。勿在实施时顺手优化并行GET/锁/CLI解析/焦点遍历或其它guard。

### Gate-2：PASS

十个必填字段、Required、目标/反目标、锚点/片段/作者体验、人工三个子项、P1–P9、基线与设计味道均独立核验。仅交给root复核当前方案/报告/字节后放行限定两文件实施；本reviewer没有自行放行或启动实施。R6方案合规与R5实机未通过、整套稳定未证是分别成立的结论。

## 运行风险、旧状态和后续验证

三份重采样仍可能同时失效，父观察余量可能早于helper内部5秒耗尽；纯helper green也不保证前后关联或完整focus在同5秒可用。root须保存同形30轮及新100轮真实main全部样本/错误/时延，再回放原Promise.all刷新与可见轮询，独立计数空client内容、unknown、timeout、age、关联身份及focus后验。stress harness当前probe_failed只统计返回码，已在计划单列解析缺口；不得拿[]关闭CLI空响应。所有已接受main rows须验证完整字段、合法类型/身份与当次清单，不能只看json.loads成功。有限正常窗口改善也不能证明永不竞态。

root曾观测IAB workbench_timeout/terminal_unavailable，后来单次CLI/HTTP成功不足以关闭这些事实。R5真实非目标开始、跨tab及重复定位仍独立验收；旧owned GUI失败清理、父Q6、Codex正文/实时活动监测、旧BLOCKED均继续待证。

旧README的“当前”SHA及r4阶段描述尚未同步到R6，属于已冻结历史说明，不能作为当前实施Gate权威；本次authority为§13/§9及当前manifest，root在阶段推进后同步人类说明。旧§8及r3.1/r4全部原支撑保留，新增§9有总说明、两包/风险修订说明与R6标签，不需删除已实施正文或升级重排。研究2次早期建议与3次决定差异已经显式处理，没有镜像契约静默替换。用户自动授权覆盖重复阶段确认，技术双Gate依然存在。

## 已见失败及保全

- 原串行15绿、并发15中5红、低层100中11/15红、真实main30中7红及probe3空内容均保留，不被计划97绿替代。root首stress脚本import失败f2ee25仅修work sys.path；研究曾把7出生反例误计8，原记录保留并由实际上下文复核纠正。错误退出因果仍未证明。
- 作者/root本轮正式Gate1均97/0/exit0；作者长读截断已补读。旧R5 Gate1首164/3/exit1及后续字面断言修正、R5真实focus/no-op失败、r4 BLOCKED/Win10053/native未知等继承记录保留，未在本轮重新执行或声称修复。
- reviewer首文件/AST核验48项/1失败/exit1：`count(b"## 9.")`误把三级9.1/9.2标题一起计入。首脚本verify1及evidence1完整保留；只新建verify2按行锚定二级标题，48/0/exit0，产品/方案均未改变。
- reviewer聚合读取出现输出截断，随后native/tests/正式§9/patch/checker/所有主入口样本与失败trace按单文件或结构化补读；首猜`live-session-workbench-census-r5-serial.json`缺失只是条件读取present=false，后用rg找到真实`live-session-workbench-census-r5-1.json`并核全部15状态。没有拿外层exit0或被截断段落自证全文已读。

建议英文提交信息：`fix(workbench): retry complete native process census within one deadline`。

无新增跨功能事实。
