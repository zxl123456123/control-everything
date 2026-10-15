# 方案评审记录：lwplan（第 1 轮）

**评审对象**：P1-A 独立离线预检；lwplan.md SHA256 `CC4ADD754295592C46E9D9E3D8BB27C75A2DCBEF81ED9BA66E2835F20FC3F53C`
**评审时间**：2026-10-14
**评审结论**：REVISE
**受众**：共享；review_target=lwplan。

主要结构可以指导一个小型标准库工具，但候选输入错误的读取范围与验收测试相互矛盾，当前不能直接交给实施者。只需局部修订并重新 Gate-1/Gate-2，不需要改变架构或请用户重新决定范围。本报告只评 P1-A；P1-B 的 P1-U1–U5 不被此 Gate 关闭，终态仍为 STOP_BEFORE_IMPL。

## 输入与独立核查

全文阅读以下输入；hash 为本轮命令实际取得。初次合并输出截断后，implementation-planning 前 180 行和 lwplan 前 118 行分别补读，结合已显示尾部完成读取；没有把截断当完整证据。

| 输入 | SHA256 |
|---|---|
| lwplan.md | CC4ADD754295592C46E9D9E3D8BB27C75A2DCBEF81ED9BA66E2835F20FC3F53C |
| clarifications.md | E2A4B888D5B4D31D3FF0A3F9A8860CB4437EFED807687EB099F30ECF5AE04F95 |
| architecture-final.md | 704CFA6BD29087F54FD60525E440999B48510786147A427BDB084190F7C6071A |
| research_p1_implementation.md | D9611D9490D1A8D59803C569325D29081CC8A56C1339CF544569C56A9B82B729 |
| research.md | 571337FD98826A2DFFD36B092461061BD63B7B53D0507F7E9795C7937D36A6F3 |
| review_notes_readiness_1.md | 7D7766DAACA6EDF52F014E1B968FD6AD255309A7EDFECA77E123D7163D32CFF5 |
| work/orca-p1-lw-gate1.json | 822064B869A50504AA9642D64373F4EFE5C3D526917E9F51DA6CE69DD07F504C |

另读 plan-review、implementation-planning、clear-expression、verification-before-completion。独立全文核对公开副本 node-runtime-pin.ts、orcad-artifacts.ts：x64 Node 大小 93580104/hash 与计划一致，Node marker 和 slot 相邻 runtimes 布局一致，完整 artifacts 显著多于计划切片。没有执行或下载源码，没有把 Gate-1 自报 PASS 当成 Gate-2 结论。

## 可行性、风险与修订项

固定路径、流式摘要、小 JSON、纯数据候选检查与固定 JSON 报告不需要新依赖或 runtime 仿真器。三工作包职责及回退独立，技术资源足够；真正 Windows 特性和 Node 实物仍留给 coordinator。方案未作工期保证，本评审也不提供未经估算的期限。

### R1：统一 candidate 错误的读取范围（阻断）

- 具体冲突：lwplan.md:123 明确“candidate 缺失/格式错误不阻止其他材料固定检查”；lwplan.md:204 的 `test_input_boundary` 把“16 KiB+1、未知 JSON key、非对象、深嵌套错误”与 CLI/root 错误合并要求“退出 2；未打开其他文件”。
- 复现推演：合法 root 下放置 `candidate.json={"unexpected":true}` 和可读 package/marker。按第 3.4 节必须继续读取材料并保留材料缺口；按该测试行却必须不打开其他文件。不存在同时满足两者的执行序列。
- 影响：S3 测试会迫使实施者自行选择错误策略；若选择提前返回，将丢失第 3.4 节要求保留的独立材料结果。若选择继续，测试验收失败。这不是未实现本身的缺陷，而是可执行验收口径冲突。
- 最小修订：保留第 3.4 节的独立检查语义；拆分 CLI/root 错误早停测试与 candidate 局部失败测试。后者断言 candidate.input=input_invalid、args/environment=not_checked，同时其他固定材料继续检查，汇总退出 2。candidate 缺失则继续检查并依既定归并顺序决定退出码，不误套格式错误 2。
- 恢复：作者修正文档和 Gate-1 hash，再由独立 reviewer 复核新 hash。无需用户新决策，无需回退上游研究。

## Gate-2

**Required Set 复核结果**：FAIL。T1 的 13 类内容均可定位：范围§1、文件/工作包§4、目标映射§1及各包、责任与证据及作者体验各包、主链/事实表/片段闭环§2、Gate/批量提问/失败回退§5–6。T2 也有输入输出/边界/测试，但 R1 令边界与验收不自洽，不能视为可执行内容齐备。T3 补充接口矩阵、兼容/无迁移及停机策略在§5；不存在未披露的产品跨模块改动。

**目标锁 / 反目标复核结果**：PASS。P1-G1→S1/S2，G2→§3/S3，G3→全部工作包；R1 是 G2 内部细化冲突，不是新增产品范围。

| 禁止内容 | 可核查证据 | 结论（计划任务中确认不存在） |
|---|---|---|
| 执行被检材料、下载、安装、TS import、监听、配对、浏览器 | §1、S1/S2 无执行链；S3 外部调用哨兵测试 | 未包含此类实施任务 |
| 读取宿主环境、账号、私人正文 | §3.3 只做词法检查，明确禁止 os.environ/注册表/账号/WSL | 未包含此类读取任务 |
| 启动开关、命令导出、静态成功升级运行准入 | §3.4/S3 固定 runtime_status=unverified、launch_admission=blocked | 未包含此类放行路径 |
| 修改 OwnedProcess/旧 M3/FastAPI/前端/库/像素 | §1 与 S1–S3 仅两个新增文件 | 未包含此类产品改动 |
| 通用清单、签名、Provider/调度框架 | §1、S1 固定小切片普通函数，§5 风险处理 | 未包含此类框架建设 |
| 宽监听 fallback、profile 作为沙箱 | S2 精确 bind，§5 明确合成路径非沙箱 | 未包含此类替代方案 |
| 当前进入实现或解锁 P1-B/P2/P3 | §5–6 STOP_BEFORE_IMPL 与 U 点开放 | 未包含此类授权扩大 |

### Gate-2 关键复核

| 项目 | 结果 | 说明 |
|---|---|---|
| 关键实现锚点复核结果 | PASS | S1 三函数、S2 parse/check、S3 report/main 与测试类均有文件、职责和首读位置 |
| 代码片段充分性复核结果 | PASS | §3 输入输出骨架和 S1→S2→S3 伪代码覆盖读取、纯检查和报告，不把伪代码当成已存在工具 |
| 作者体验门复核结果 | PASS | 单 JSON 样例、固定记录、标准库和两个文件降低维护负担；不需维护上游完整 manifest |
| 人工 review 对齐复核结果（总括项） | FAIL | 核心链路顺读 FAIL；research 事实映射 PASS；跨包脑补需求 FAIL。不能以局部片段齐全覆盖 R1 |
| 核心链路顺读复核 | FAIL | 现状→落点→不改层完整，但 candidate 异常到材料检查/测试的闭环有 R1 两种行为 |
| research 事实映射复核 | PASS | §2 逐项将 Node、artifact、bind、env、daemon、Web、SecretStore 映射实现/测试/口径；未将静态证据提升运行结论 |
| 跨包脑补需求复核 | FAIL | 读者必须自行裁决§3.4与S3测试谁优先，当前不能顺读得到唯一失败处理策略 |

**P1-P9 协议合规核验表**：PASS。此表判断各协议的实际承载，不替代上述技术完整性。

| 协议项 | 结果 | 说明 |
|---|---|---|
| P1 | PASS | §6 禁止任务数量硬门槛；三包按职责划分 |
| P2 | PASS | §6 明列必备项缺失不得放行 |
| P3 | PASS | §6 纯存在性硬门禁，无评分替代 |
| P4 | PASS | §1 T2，§3–5承载T2要求及T3补充，未偷换为仅T1 |
| P5 | PASS | §5–6关键不确定性委托问题；纯技术补证走ACTION |
| P6 | PASS | §5明确留痕位置及新假设/新风险/阶段切换事件，无次数门槛 |
| P7 | PASS | §5–6问题数不设上下限 |
| P8 | PASS | §5优先级与批量模板、未触发原因均有 |
| P9 | PASS | §6作者Gate-1→独立review与coordinator Gate-2，失败回LW；已有Gate-1 hash匹配 |

未发现指挥后续 agent 递归委派的任务；§5明确不递归委派。

**基线与澄清一致性复核结果**：PASS。

- 澄清未回答列表：没有当前 P1-A 阻塞问题；技术 U 点单独开放。
- 目标锁遵守：固定材料/候选数据/精确报告/零接线均保留；R1需在此目标内修订。
- 反目标未踩中：依据上表；没有绕过运行验证的任务。
- 头脑风暴决策未违反：最终架构的条件复用、独立生命周期、分段迁移不被这个静态工具改变；停止实施前与最新用户原话一致。

**设计味道扫描结果**：WARN: 固定 hash 与严格词法路径规则需要人工维护，存在规则漂移成本；但范围只有 x64 小切片、无插件框架且未覆盖项固定展示，当前不构成阻断。R1是验收合同冲突，已独立作为阻断处理。

### Gate-2 结论

**Gate-2**：FAIL。

- conclusion: REVISE
- scope: P1-A offline preflight only
- allow_enter_impl: no
- runtime_admission: blocked
- open_runtime_unknowns: P1-U1, P1-U2, P1-U3, P1-U4, P1-U5
- stop_boundary: STOP_BEFORE_IMPL

## contract drift、验证与后续行动

发现当前计划内部失败/测试合同不一致 R1；未发现需改变最终架构或最新基线的冲突。clarifications 的前部历史阶段由末节明确覆盖；Readiness 的 README stale 提示属其历史观察，本轮未独立验证 README 当前状态。未检查平台镜像，不能声明镜像一致。

本轮仅文档与公开副本文本检查，没有产品、Orca、模型或真实 Windows 行为测试。初次工具输出截断已补读关键受影响段落；历史浏览失败/404/rate-limit/EOF/超时/缺文件/非Git diff失败仍按research及Readiness保留，不改写为成功。本轮定位与hash命令退出0，但其关键词结果仅用来定位，R1由逐段语义核对得出。

作者按 R1 做局部修订；coordinator 收取新版 Gate-1 与独立 Gate-2 后才能描述实施条件。即便新版通过，也按用户要求停止在代码实施前。

无新增跨功能事实。
