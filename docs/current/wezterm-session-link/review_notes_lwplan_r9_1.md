# R9 独立 Review(LW)（第 1 次）

评审对象：唯一 `lwplan.md` §12；日期：2026-10-05 Asia/Shanghai；协议结论：**PASS**。这仅是方案 Gate2 主检结论，不是实施、实机收益或整套稳定通过，也不自行释放作者实施。

## 输入与本轮独立证据

本 reviewer 未参与 R9 方案编写或实施，仅做本地文件/AST审查；未运行产品、真实CLI/helper/Win32/HTTP/SSH/GUI/服务/Git，未递归委派。完整加载 plan-review、verification；完整读§12、clarifications§16及原G/N、当前feature README、R9恢复/两份调研、R8实施审查、Gate1源码与完整stdout/空stderr；两源码全文和两tests准确before全文已读。

唯一LW：132628字节，SHA `F9F023CFD52066B9AEADE38D2E562A7173AA0DB93F387D9474301D670A831312`；manifest：8264字节，SHA `84E24A017B78FE286ECACE7D376E0CA827473A17285F0F096EAEFFD03D6EC6B2`。123002字节R8前缀与准确before逐字相同，四before/29当前产品/18输入均匹配，计划patch独立重生成一致。产品尚为R8；原focus32＋observation20方法保留。

本轮实际命令 `.venv/Scripts/python.exe -X utf8 -B work/wezterm-focus-lw-r9-review-verify1.py`，工具 **7554ce，exit0，10项全true、failures=[]**；完整输出已读，证据：[review-evidence1.json](E:/project-funny/mianban-develop/work/wezterm-focus-lw-r9-review-evidence1.json)。它核字节/AST/保存Gate1流，不执行产品、不把字面检查替代下述技术判断。作者Gate1保存实际0fccce/exit0/34true，完整stdout及current SHA对应本次输入；其`allow_enter_impl`仍false。

## Required Set 复核结果

**PASS**。T1.1–13可定位：§12开头G/N与范围；S1/S2各自首落点、步骤/依赖、输入输出、验收/回滚、G-N与分层三元组；12.1主链及事实映射；12.2风险、双Gate、事件对齐/批量模板。T2沿用明确签名/pair及public dict/cache、异常/边界回归；T3定义无迁移、只改四路径、unknown/unsafe-stop。不是以任务或检查数量充质量门。

## 目标锁 / 反目标复核结果

**PASS**。改动服务G3精确定位并维持G1诚实unknown；G2连接规则不变。成功仍要求最早远端年龄、原动作窗口、实例/slot/完整候选/真实client/关联及fullfinal齐全。没有凭空扩展用户范围。

| 禁止内容 | §12可核查锚点 | 判断 |
| --- | --- | --- |
| N1创建/复活/键盘/D配置/其它用户进程 | L779、L838仅原四路径和只读worker，作者无实际动作 | 未触及 |
| N2扩来源/API/schema/图形/CSRF/时间合同 | L819–820、L834–836、L848；public/cache串行、两原时钟与全部判定保留 | 未触及 |
| N3常驻pool/SSH、跨请求库存、清latch/通用框架 | L779、L834–836、L854；局部with及主线程merge、旧latch/pins保持 | 未触及 |
| 模型代实机/省样本字段/fullfinal | L785、L791–792、L836–848；完整采样与真实责任明确 | 未触及 |

## 关键实现锚点复核结果

**PASS**。S1首落点是`SessionService.refresh_observation`原started后/merge前的private force分支，以及`Terminal._focus_session`最后动作后的post/after赋值。S2直接使用真实Service/Terminal配Mock采集器/Workbench/runner；其余25产品不动。现有`list_panes`不重取动作锁或回调Service；Workbench精确probe白名单已接受version/fullpanes/clients，不须修改native/Workbench。

## 代码片段充分性复核结果

**PASS**。L800–820、L823–832足够判断两个实际形态：remote在单worker/main读取inventory；final inventory在单worker/main做完整observe。两处均取全结果、with退出后原merge/判定；池只在原锁内存活。L834–836覆盖public分支、异常、原except及原字段判定，片段形成producer→caller→fullfinal闭环，未写成整份最终实现。

## 作者体验门复核结果

**PASS**。直接局部标准库with替换两处等待，职责仍为采集器只读、调用方merge/判定；没有新接口/调度框架/配置。沿用fakes与52个旧方法，新增Event症状只证明重叠和回收。原顺序模型仅维持行为与预算，不让共享fake clock加和冒充耗时收益，声明可读性未回退。

## 人工 review 对齐复核结果

**PASS**：核心链路顺读复核 **PASS**（L785前检→force两读/join→原动作/每步→final两读/join→原判定）；research事实映射复核 **PASS**（L787–792将三个late、官方pool语义、合法probe及31ms风险映射到实现/测试/root口径）；跨包脑补需求复核 **PASS**（两个包与两片段在同一增量连续呈现，无须从历史拼出新链路）。总项由这三子项形成。

## P1-P9 协议合规核验表

**PASS**；逐项存在性判断如下，不复用作者的总评。

| 协议项 | 结果 | 依据 |
| --- | --- | --- |
| P1 | PASS | L856–860按内容/Required放行，未设最低任务数。 |
| P2 | PASS | Required、责任、锚点/片段/风险等明确存在性；34是记录计数。 |
| P3 | PASS | L858双Gate与明确放行，不采用加权分数或数量替代。 |
| P4 | PASS | L856明确T1.1–13/T2/T3分型并在两包落实际内容。 |
| P5 | PASS | L858语义不唯先上游；L860受控QUESTION/ACTION承接新关键不确定性。 |
| P6 | PASS | L860新假设/风险/阶段切换即时回root，留本节/source，无固定对齐次数。 |
| P7 | PASS | 无未回答，技术风险分层验收；模板未设澄清问题配额。 |
| P8 | PASS | L860按P0安全/P1预算/P2展示批量事实/问题/选项/答复模板。 |
| P9 | PASS | 实际Gate1完整流/current字节＋fresh主检/root独核Gate2；作者尚未放行。 |

## 基线与澄清一致性复核结果

**PASS**。未回答为空；§16/README/R9 source仅允许四路径两组同请求独立读取重叠，与§12一致。PLAN_DEFECT-R9各修订节说明/标签齐全，§1–11支撑完整保留；R8实现作为准确before，回滚仅本轮增量，未要求删旧支撑或其它工作。未发现新增shared/runtime/mirror漂移；旧README运行事实按其历史段处理，不作当前部署证明。

## 设计味道扫描结果

**PASS**。两个局部一个worker无需持久pool、额外抽象或异步尾任务；main只在结果齐全/join后发布。std库本机Python3.12实际源码已读（536c80/exit0）：Executor.__exit__调用`shutdown(wait=True)`，ThreadPoolExecutor.shutdown逐线程join；运行中的任务不可靠cancel强停，因此原有子调用timeout必须保留，异常路径也不得提前放锁。

## Gate-2

**PASS**，无本次计划阻断。原started必须早于submit/两读，refresh_finished在force全完成后；action deadline仍在库存/年龄验证后、pins前。完整final两读在最后动作后同一旧deadline，join后原strict非0/exit、关联/client/geometry/late及完整谓词原字节保留；初始/pre/每动作/census内部顺序不动。创建/submit/读异常不得续发动作或留下线程；非原子限制仍诚实unknown。

实施前由root独立核本报告及当前冻结字节并明确放行。作者先对R8跑两处Event真实症状red，再相同症状green，异常/迟到/重复请求须证明worker先于merge/发布/锁释放回收；完整本地回归仍必需。root必须新全回归/scope、五起点各三轮完整raw/fullfinal/独立client及两原5秒，再当前加载/HTTP3轮/IAB actualfocus/两UUID隔离、fresh ReviewImpl。最慢旧SSH2672ms模型仅余31ms，**不是性能承诺**；真实持续超龄仍回正式方案。

## 失败与交付边界保全

R8真实12/15、三个age5328/5844/5187ms与已到target仍unknown；首161/Win10053/exit1、同字节次161绿、两Pydantic warnings、首audit同tick/首Gate2字面失败均保留。独立拒绝体诊断69次中11个Win10053/exit1（空体30/30、正常28/30、延迟0/9返回403），服务调用0，未修HTTP；不并入R9四路径。作者本轮旧checker路径/PowerShell解析/rg无匹配exit1及聚合截断补读，reviewer技能聚合截断后单独全文补读均不省略，未见产品变更。

旧owned失败回收/父Q6/Codex正文与活动、N48性能/自动合作仍独立缺证。此结论不关闭旧BLOCKED，不宣称稳定/交付。英文提交建议：`perf(terminal): overlap fresh sampling within the original focus budget`。无新增跨功能事实。
