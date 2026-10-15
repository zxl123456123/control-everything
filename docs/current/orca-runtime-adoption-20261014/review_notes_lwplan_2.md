# 方案评审记录：lwplan（第 2 轮）

**评审对象**：`lwplan.md`，SHA256 `00176EE73C925634FD783C06DF943FD8656C3348558B2981A8896CAC916FC452`。
**评审时间**：2026-10-14；角色 review_plan；受众共享；review_target=lwplan。
**评审结论**：PASS。仅 P1-A 独立离线工具具备按文档编码的条件；协调者仍须复核，本轮按用户要求 **STOP_BEFORE_IMPL**。
**前一轮评审**：[第 1 轮](review_notes_lwplan_1.md)，结论 REVISE，保留为历史事实。

## 输入、证据与可行性

本轮独立读取完整 clarifications、architecture-final、research_p1_implementation、review_notes_readiness_1、review_notes_lwplan_1、当前 lwplan 和 work/orca-p1-lw-gate1.json；读取 plan-review、implementation-planning、clear-expression 与 verification-before-completion。批量输出截断后已分别补读受影响的研究、readiness、计划前段与技能段落。直接核对公开副本 `work/orca-p1-research/src__shared__node-runtime-pin.ts`：x64 版本 24.21.0、93580104 bytes 与固定 SHA256 一致。未执行上游或产品源码。

当轮命令核验当前 plan hash 与 Gate-1 绑定一致、三个新测试锚点存在、旧矛盾测试行不存在，退出码 0；这些结构核验不替代以下语义评审。原评审的 PASS 字段和作者 Gate-1 只作为输入，未直接继承为本轮结论。

| 输入 | 本轮实读 SHA256 |
|---|---|
| clarifications.md | E2A4B888D5B4D31D3FF0A3F9A8860CB4437EFED807687EB099F30ECF5AE04F95 |
| architecture-final.md | 704CFA6BD29087F54FD60525E440999B48510786147A427BDB084190F7C6071A |
| research_p1_implementation.md | D9611D9490D1A8D59803C569325D29081CC8A56C1339CF544569C56A9B82B729 |
| review_notes_readiness_1.md | 7D7766DAACA6EDF52F014E1B968FD6AD255309A7EDFECA77E123D7163D32CFF5 |
| review_notes_lwplan_1.md | E5F75F34A5C3A2CC5BEBE9AF6EBE1A97DBE9144A42D40ED1D26CA5B126642BD9 |

标准库有界读取、摘要、严格小 JSON 和词法路径核对均不要求新运行依赖。S1→S2→S3 顺序及两个新文件的范围足够指导实现。资源可获得指 Python/临时 fixture，不指持有真实 Node/bundle。未估算工期；未声称运行兼容性或代码测试已通过。

## R1 闭环与新矛盾检查

| 场景 | 当前唯一行为 | 计划与测试证据 |
|---|---|---|
| CLI/root 无效 | input=error/input_invalid；其他项 not_checked/input_unavailable；材料读取前停止；退出 2 | §3.2、§3.4、S3 修订说明及 test_cli_root_boundary |
| 合法 root，candidate 超限/格式/schema 错误 | candidate.input=error/input_invalid；args/environment 未检查；继续固定材料，保留其结果；退出 2 | §3.4、test_candidate_invalid_continues_materials 明确以可读 package/marker 验继续行为 |
| 合法 root，candidate 缺失 | candidate.input=missing/absent；继续材料；其他匹配或缺失时 4，出现 mismatch 时 1，I/O error 时 3 | §3.4、test_candidate_missing_continues_materials |

原 R1 的“候选错误既要继续又不得打开材料”已消除。输入错误优先于 I/O/mismatch/missing 只决定汇总；各项保留失败，不发生静默忽略。S1 一般超限 mismatch 与 §3.4 candidate 超限 input_invalid 是通用文件规则与显式候选例外，可以确定性实现。source/package 内容错误仍为 mismatch，不误用候选 schema 的退出 2。CLI/root 的早停发生于 S3 伪代码的 validate_root；合法 root 的候选检查在固定材料检查后，不需新增架构选择。未发现修订引入新的阻断矛盾。

PLAN_DEFECT 原地修订复核：S3 有“本轮修订说明”，新增说明及三条测试带 PLAN_DEFECT-R1.1；对齐任务就是拆分三类测试，保留原包验收/责任/回滚。当前无已实施支撑需要迁移或回收，未发现删除或大规模重排的升级情形。R1 在文档层关闭，不代表相关测试已实现或执行。

## Gate-2

**Required Set 复核结果**：PASS。

| 必备内容 | 独立核对落点与结果 |
|---|---|
| T1 1–4：范围、文件、工作包完整内容与目标映射 | §1、§4 S1/S2/S3；两个文件、函数/类、顺序/依赖/验收/回滚均明确，各包显式消费 G/A |
| T1 5–6：责任三元组与作者体验 | 各包分别给 impl unit-tests.txt、coordinator-check.md 与缺证据不能通过；各有可读性约束 |
| T1 7–9：复杂链主链、事实表、片段闭环 | §2 在工作包前给出链路、八项事实映射及片段关系；§3/S1–S3 展示实现骨架 |
| T1 10–13：自检、双门禁、问题、风险 | §5–6 明确 Gate-1 必备项、独立 Gate-2、失败回退、问题模板、风险与 review 入口 |
| T2 输入输出/边界/函数/分层测试 | §3 定义 CLI、文件/预算/schema/报告/退出码；S1–S3 定义函数及 fixture 与实际 Windows 分责；R1 已统一 |
| T3 补充项 | §5 接口矩阵、无持久状态、无迁移/产品兼容影响、停止调用即停机；无隐含产品调用链 |

**目标锁 / 反目标复核结果**：PASS。G1 对应 S1 固定材料及 S2 数据核对，G2 对应 §3 和 S3，G3 对应零接线及分层验证。禁止项逐项如下。

| 禁止内容 | 验证依据 | 结论（仅指计划任务） |
|---|---|---|
| 执行材料/TS import、下载、安装、监听、配对或浏览器 | §1，S1 只 rb/hash，S2 纯数据，S3 外部调用哨兵 | 未包含 |
| 宿主环境、账号、私人正文访问 | §3.3 禁 os.environ/注册表/WSL，路径仅 PureWindowsPath 词法核对 | 未包含 |
| 命令导出、绕过开关、静态成功授予启动 | §3.4 固定 unverified/blocked，S3 完整 matched 仍 blocked 测试 | 未包含 |
| OwnedProcess/M3/FastAPI/前端/数据库/像素改动 | §1 与 §4 仅新增脚本及新测试文件 | 未包含 |
| 通用清单/签名/Provider/调度框架 | §1、S1 固定九路径普通函数，§5 不扩张 | 未包含 |
| 宽监听 fallback、profile 等同沙箱 | S2 精确 bind；§5 合成路径非沙箱 | 未包含 |
| 当前实现、P1-B 或全架构放行 | §5 U1–U5 开放，§6 STOP_BEFORE_IMPL | 未包含 |

### Gate-2 关键复核

| 项目 | 结果 | 独立依据 |
|---|---|---|
| 关键实现锚点复核结果 | PASS | S1 validate_root/inspect_file/inspect_materials，S2 parse_candidate/check_candidate，S3 build_report/main/测试类均标路径、首读点及目标职责 |
| 代码片段充分性复核结果 | PASS | §3 schema 与固定输出，S1 先拒绝再读取/fstat，S2 参数/env 独立纯检查，S3 合成报告/退出闭环；无需最终完整源码 |
| 作者体验门复核结果 | PASS | 单个输入样例、固定 id 和原因、无额外依赖/manifest，三个工作包可顺读；测试名称指明失败范围 |
| 人工 review 对齐复核结果（总括项） | PASS | 以下核心链路顺读、research 事实映射、跨包脑补需求三子项均 PASS |
| 核心链路顺读复核 | PASS | §2 现状产品链→独立材料入口→S1/S2→S3 fixture/报告→运行仍阻断；不改层及原因明确，R1 异常分支闭环一致 |
| research 事实映射复核 | PASS | §2 将 pin/artifact/版本标识/bind/env/daemon/Web/SecretStore 逐条映射实现函数与测试/验证口径；与本轮所读 P1 研究 B–G 一致 |
| 跨包脑补需求复核 | PASS | §3 集中定义合同，S1–S3 顺序承接；修订后无需自行裁决候选错误时是否读取材料，也无需拼出任何产品接线 |

**P1-P9 协议合规核验表**：PASS。

| 协议项 | 结果 | 当前计划中的实际承载 |
|---|---|---|
| P1 | PASS | §6 禁任务数量门槛；S1–S3 按读取/检查/报告职责组织 |
| P2 | PASS | §6 任一必备内容缺失不放行，未以分数替代 |
| P3 | PASS | §6 纯存在性硬门禁，R1 按合同冲突修订而非抵分 |
| P4 | PASS | §1 明确 T2，§3–5 实际提供 T1/T2 内容与 T3 接口/兼容/停机补充 |
| P5 | PASS | §5–6 关键范围/验收不唯一先 DELEGATE_QUESTION；技术补证走 ACTION |
| P6 | PASS | §5 指定该节留痕，新假设/新风险/阶段切换即时对齐，无次数限制 |
| P7 | PASS | §5–6 明确问题数不设上下限，无强制数量模板 |
| P8 | PASS | §5 P0/P1/P2 批量问题模板及本轮未触发原因明确 |
| P9 | PASS | §6 作者 Gate-1→独立 reviewer 与 coordinator Gate-2，失败回 LW；当轮 hash 与 Gate-1 相符 |

§5 明确不递归委派；工作包没有要求后续 agent 派发下级任务。

**基线与澄清一致性复核结果**：PASS。未回答列表没有当前 P1-A 阻塞问题。目标锁遵守为 PASS；反目标未踩中为 PASS（依据上表）；头脑风暴决策未违反为 PASS。最新基线只给离线切片准入，未推翻最终架构的条件复用、独立生命周期和分段迁移；旧 M3 暂停、像素延期及用户止于实施前的要求保持。技术 U 点继续开放，不通过用户勾选关闭。

**设计味道扫描结果**：WARN: 固定 pin、Windows 词法规则有维护成本，但只覆盖 x64 有界材料，报告明确未覆盖与非沙箱性质，不引入通用框架；该成本不阻断当前工具。严格规则只拒绝候选计划，不能解释为上游协议全貌。

### Gate-2 结论

**Gate-2**：PASS。

- conclusion: PASS
- scope: P1-A offline preflight only
- ready_for_code_implementation: true（计划条件，不是执行授权）
- allow_enter_impl: false（用户要求 STOP_BEFORE_IMPL；还需协调者独立复核收口）
- runtime_admission: blocked
- open_runtime_unknowns: P1-U1, P1-U2, P1-U3, P1-U4, P1-U5
- stop_boundary: STOP_BEFORE_IMPL

## contract drift、失败保留与后续行动

未发现当前计划与最新基线/最终架构冲突。clarifications 前文高层阶段限制由末节显式覆盖；Readiness 的 README stale 是历史观察，本轮未核查 README 当前状态，不声称已同步。未检查平台镜像，不声明 mirror 一致。

本轮无产品测试、真实 Windows 特性、Node 实物或 Orca 运行证据。文档读取发生过输出截断，已补读；不得把读取退出 0 当成运行验证。研究与历史评审记录中的浏览失败、404、rate-limit、EOF、超时、缺文件、非 Git diff 退出 1，以及作者 rg 路径错误/无匹配退出 1 均保留，不被本 PASS 覆盖。

协调者核对本报告、机器记录和当前 plan hash 后停止，不启动实现代理。今后真正实施按 S1→S2→S3，必须重新取得计划要求的测试证据，尤其保留三类输入错误、退出归并、秘密哨兵和静态 matched 仍 blocked。本报告只关闭文档 R1，不关闭 P1-B 的 U1–U5。

无新增跨功能事实。英文提交消息建议：`docs: record final review of offline Orca preflight plan`。
