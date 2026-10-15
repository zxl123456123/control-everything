# 最终架构独立复核记录

- review_target: hlplan
- role: review_plan
- review_date: 2026-10-14
- conclusion: PASS
- architecture_finalization: PASS
- audience: 用户、协调者与后续设计者共享
- scope: 最终高层架构与初审 R1–R4 闭环；不是 Readiness、低层计划、Gate-2 或运行验收。
- 前一轮评审：[review-7e31a9.md](review-7e31a9.md)

最终稿可作为当前高层架构设计入口。四项初审问题已在正文形成明确决策，未发现新的阻断级矛盾或重大遗漏。此结论批准的是技术方向、职责与条件采用边界；不证明 Orca、Windows、完整 Web 或各 Agent 在本机可用，也不授予产品实施或真实模型测试权限。

## 实际输入版本

以下 SHA256 由本 reviewer 当轮读取文件并执行 Get-FileHash 获得；方案哈希与委派预期一致。除初审路径外，文件均位于 `docs/current/orca-runtime-adoption-20261014/`。

| 文件 | SHA256 |
|---|---|
| architecture-final.md | 704CFA6BD29087F54FD60525E440999B48510786147A427BDB084190F7C6071A |
| clarifications.md | B76DF088EF95CC2231AE4744DA44546DD6B09FAB10470B1E715E1B4A72E00559 |
| research.md | 571337FD98826A2DFFD36B092461061BD63B7B53D0507F7E9795C7937D36A6F3 |
| research_stability.md | 529F4F2D5FFC859D55194A04707EEC1183B32709BC5C38374FBB0CC4B936CAC8 |
| research_agent_compatibility.md | 509ECAA1FB7F1EC68712E0DDB236BF603C2DD13BCDA1A9F32CBD17086E008938 |
| work/review-7e31a9.md | 54EC707522E0115345BB77D1D34A84647328AC12C4AA7BA2B3DC0671A1B6926A |

已全文读取上述六份输入及 plan-review、clear-expression、verification-before-completion。另直接读取 `session_panel/gateway.py:133`、`:480`、`:498` 和 `session_panel/execution.py:244` 的完整相关代码块，确认现有安全与关闭合同。所有本轮读取命令退出码为 0，输出未截断。未以父代理的完成声明代替本轮读取与判断。

## R1–R4 闭环

| 旧问题 | 最终稿证据与独立判断 | 结论 |
|---|---|---|
| R1 唯一入口与 HTTP 迁移阶段 | 开头指定唯一技术设计入口并保留旧文档为历史；第 2 节 D1–D4 明确 Python/FastAPI/Uvicorn、原生 JS、SQLite、条件化 Orca 的选择；第 6 节先 P1 可行性、再独立 HTTP 迁移、再 P2，且 Orca 不可行不阻止管理服务独立演进，迁移失败退旧服务及匹配数据。不存在把框架迁移与接入绑定为一次变更的要求。 | CLOSED |
| R2 管理面信任边界 | 第 3 节明确本机监听、等价 Host/Origin、客户端规则、敏感操作 CSRF、Windows 独占监听，且禁止默认放宽 CORS 或转发凭证；第 6 节将其列入迁移验证。直接读取的 gateway.allowed、server_bind、make_server 与此相符。成熟框架未被用作这些合同的替代证据。 | CLOSED |
| R3 进程生命周期归属 | 第 5 节指定使用者显式启动/停止外置 Orca，管理 API 不拥有其生命周期；表格分别规定页面、管理服务、Orca 与整套退出，管理恢复只对账不重发，Orca 崩溃先 unknown 并核查残留。末段明确旧 M3 关闭合同保留，符合直接读取的 server_close → execution.close 链；清理实际有效性仍由 P1/P3 验证。 | CLOSED |
| R4 首期准入范围 | 第 5 节明确首期仅完整客户端入口与元数据观察、不启用面板受控派发、不宣称统一执行限额。后期受控模式必须证明专用 runtime 所有允许入口共同准入，未覆盖入口须实际限制或排除；不能做到则保持入口/观察，且不承诺控制整机独立 CLI。覆盖范围已作架构决策，无需下游自行选择。 | CLOSED |

上述正文与 clarifications 的头脑风暴决策 5–8 一致。初审要求的四类决策均已落实，未仅引用基线替代正文。

## 可行性、风险与重大遗漏检查

- 保留 Python 业务、SQLite 与现有页面，HTTP 外壳增量迁移，避免同时重写语言、页面和存储；研究未证明 Python 是瓶颈，最终稿也未作容量承诺。单管理进程、有界阻塞工作、短事务、版本迁移与数据匹配回退具有相容的高层边界。
- Orca 固定版本、直接 Node entry 显式 loopback、完整 Web 与认证边界、无账号验证及停止条件均继承研究约束。技术路线有条件采用成立；U1–U6、S-U1–S-U6、AC1–AC5 未关闭不会被本报告转成已运行。
- 元数据关联有稳定来源/会话/操作/回执标识要求；断连 unknown、超时先对账、重启不重发与唯一执行所有者相容。审批、取消、终止和人工验收分开，未以输出或进程存活替代业务事实。
- 关键事件预算与输出洪峰分离、耗尽拒绝新增操作、数据备份恢复、日志有界及分层健康均已给出目标约束。阈值和具体机制留给低层设计，当前材料没有把目标写成现成实现。
- Pi/Hermes 的终端入口、自有协议与 Orca 完整结构化适配分层准确；OMP 未被误写为 Pi。研究中动态上游文档不能保证固定 Orca 兼容的问题由版本组合固定与逐项验证承接。
- 旧 M3 暂停、数据与小院账本保留、像素嵌入延期、无真实模型试跑均与授权基线一致。P3 仍需明确范围、额度及允许操作。没有扩大成本或运行权限。

设计味道扫描结果：PASS。当前分层集中于一个管理进程和一个外置 runtime，未引入第二套调度框架或未经需求支持的通用 Provider 抽象；未来实现是否保持此边界须在后续评审核对。

## 新问题与 contract drift / stale / mirror mismatch

未发现新的阻断级架构问题。

N1（非阻塞，文档导航）：clarifications 第 5 节仍写“hlplan.md 是决策”，第 4 节还保留旧 hlplan/review 产物名；但文件末段已明确 architecture-final.md 经最终评审后作为当前入口，旧 hlplan 与技术补充为历史。后文的明确覆盖消除了本次架构歧义，故不要求重做架构评审。协调者更新当前状态时宜同步这两处导航，减少后续读者误用历史入口。本 reviewer 未改该文件。

README 的“评审进行中”由协调者在收取最终结论后更新，属于本轮交接暂态，不作为设计缺陷。未检查平台镜像，不对其一致性作保证。

## 验证边界与放行范围

本轮仅进行文档比对、文件哈希核验与指定本地源码读取；没有启动运行时、安装依赖、访问凭据或私人正文、调用模型、执行容量/恢复测试，也没有修改产品代码。上游事实以三份已读研究及其限定为依据，未重新获取全部上游源码，未把一手文档中的存在性升级为实际可用性。

研究记载的网页连接失败、超时、404、GitHub rate-limit/restricted URL、此前输出截断及补读情况均仍保留；本次 PASS 不覆盖这些历史工具失败或旧 M3 未真实验收。当前本轮读取没有命令失败。

- architecture_finalization: PASS
- runtime_readiness: 未评审、未验证
- allow_enter_lwplan: 本报告不授予；须另行 Readiness
- allow_product_implementation: 本报告不授予；须后续低层计划与对应 Gate
- allow_real_model_test: 本报告不授予；M3 费用暂停继续有效
- 下一步责任：协调者独立读取本报告、核对最终稿哈希并更新当前设计入口和评审状态；后续验证按最终稿第 6 节分别承接。

无新增跨功能事实。
