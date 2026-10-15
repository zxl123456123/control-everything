# P1-A 离线预检实施报告（第 1 轮）

P1-A 的独立脚本与 fixture 测试已落盘。最后一轮 15 项 unittest 全部通过，退出 0；新文件 py_compile 退出 0。此结论只覆盖本地合成输入和检查器行为；等待协调者独立复跑及 Review(Impl)，不代表 Orca 已接入或准入。首跑环境哨兵失败和帮助实现偏差均保留在下文。

## 基本信息

- feature_name: orca-runtime-adoption-20261014 / P1-A
- impl_round: 1
- date: 2026-10-14（Asia/Shanghai）
- audience: shared
- lwplan_version: SHA256 `00176EE73C925634FD783C06DF943FD8656C3348558B2981A8896CAC916FC452`
- authorization: clarifications.md 的“本次编码授权与独立 UI 范围”解除历史 STOP_BEFORE_IMPL；仅本报告对应 P1-A。
- implementation_status: local_fixture_verified; coordinator_verification_and_review_pending
- runtime_admission: blocked

## 变更事实

| path | change_type | change_purpose | key_changes | related_tasks |
|---|---|---|---|---|
| `scripts/orca_preflight.py` | add | 独立离线检查明确提供的 x64 材料和候选计划 | 固定八文件加禁止 marker；root/祖先/组件 lstat，普通单硬链接文件检查；大小与总预算、流式 hash、前后 fstat；严格 JSON/schema、参数与 Windows 词法关系；固定报告与退出码、始终 unverified/blocked | S1 → S2 → S3 |
| `tests/test_orca_preflight.py` | add | 人工临时 fixture 验证检查器边界 | 15 个测试方法，表驱动参数/环境/JSON；真实小字节摘要；预算、fstat/link/reparse mocks；candidate 局部错误继续材料；秘密/环境/外部调用哨兵；write/flush 故障 | S3（包含 S1/S2 验收） |
| `work/orca-p1-implementation/unit-tests.txt` | add | 保留每轮完整测试输出与退出码 | 首跑 14 项中 1 失败；修正后 14 项通过；补预算/链接分支后最终 15 项通过 | S1–S3 验证证据 |
| 本报告 | add | 共享实施事实与移交 | 目标、偏差、验证、失败、未验证、回滚与英文提交建议 | S3 交接 |

未改 OwnedProcess、旧 M3、HTTP/执行服务、存储、前端、像素模块、依赖清单或任何用户材料。没有启动旧 fixture 服务。实现顺序为固定材料读取，再候选纯数据检查，最后组合报告与测试。源码仅标准库 import；未 import 产品模块。

最终源码 SHA256：

- scripts/orca_preflight.py: `4A47789AC079EB9CE763CE4E8FB533B8D4B682F65B45D7302BA4ADC3A0FE3A33`
- tests/test_orca_preflight.py: `ACEC00A721F9350C5A3CD94FA41DD4FBA845910EED3B60C812C415D6F7CFE67B`

## 目标与反目标核对

- goal_lock_check: P1-G1 固定材料有界读取/摘要/三字段版本、候选参数/合成环境均落实；P1-G2 固定 checks 顺序、缺失/不匹配/错误/未检查与运行未验证分开，退出优先级 2 → 3 → 1 → 4 → 0；P1-G3 独立脚本零产品接线。
- anti_goal_touch_check: 未执行、安装、下载、import 材料；未启动进程、网络/监听、配对、浏览器、Agent；未访问 os.environ、账号、WSL、注册表或私人正文；不导出启动命令、不提供解锁开关。Node pin 只表示声明匹配，JS integrity 和全部 provenance 仍 unverified。
- authoring_ergonomics_notes: 固定小切片和几个普通函数；没有通用清单/插件/Provider 框架。一个 JSON candidate，未知字段拒绝且不回显。错误由固定 reason 表达，材料未获取时逐项 missing。所有静态 matched 的 fixture 仍输出 runtime_status=unverified、launch_admission=blocked。

## 实际验证与失败保留

| command / step | result | evidence | owner | conclusion_if_missing |
|---|---|---|---|---|
| `python -m unittest discover -s tests -p test_orca_preflight.py -v`（首跑） | 退出 1；14 项，1 FAIL。argparse 通过 gettext.find 读取宿主 os.environ，环境哨兵捕获；完整栈保留 | work/orca-p1-implementation/unit-tests.txt，Run 1 | Impl | 无原始失败记录则不得描述失败原因或闭环 |
| 同一命令（移除 argparse，固定 help 并加入 flush 后） | 退出 0；14 项 OK，原失败测试及 help 环境哨兵通过 | 同文件 Run 2 | Impl | 无本轮输出则不称修复通过 |
| 同一命令（补累计预算和禁止 marker 链接分支后） | 退出 0；15 项 OK，完整输出已读 | 同文件 Run 3 | Impl | 缺任一计划边界证据不得称本地验收通过 |
| `python -m py_compile scripts/orca_preflight.py tests/test_orca_preflight.py` | 退出 0，无输出 | 本轮工具执行记录；协调者应独立复跑写 coordinator-check.md | Impl | 不称语法检查通过 |
| 源码 import/禁用调用定向 rg 定位，并逐函数审查 | 退出 0；仅七个标准库 import 命中。脚本内无网络/执行/产品调用/宿主环境访问；关键词只是定位，不代替语义检查 | 本轮工具执行记录、实际源码 | Impl | 不称定向源码审查已做 |
| Get-FileHash 两源码与 lwplan；Test-Path .git | 退出 0，hash 如上，冻结计划不变，.git=False | 本轮工具执行记录、上述哈希 | Impl | 不声称与冻结计划同一版本或目录无 Git |

测试使用真实临时文件验证已知 b'abc' 摘要、边界、读取与关闭；Node pin matched 用局部 inspect_file mock，仅验证分支，不持有或伪造 93580104 bytes Node。reparse、symlink、hardlink、替换、权限、元数据变化为 mock；当前 Windows 文件系统这些特性没有实测。累计预算用 5 bytes 测试同一调用表中拒绝剩余预算不足文件，同时继续后续固定文件；未创建巨大测试文件。

历史 Readiness、LW 的网络/截断/路径/非 Git 失败仍保留在原文，没有通过本地测试覆盖其结论。当前实施首跑失败是本报告新增事实；未遗漏或改写为成功。报告修订中一次 functions.exec 因模板字符串内 Markdown 反引号产生 SyntaxError: missing ) after argument list，未执行工具或改动文件；随后使用普通字符串重试，不作为产品失败或成功验证。

## contract_drift_reports

1. lwplan §3.4 提及“--help 为 argparse 普通说明/0”；实际 Python 3.12 argparse 初始化依赖 gettext，首跑栈证明其隐式读取 os.environ。这与 P1-G1/P1-A1 及 §3.3 的不读宿主环境边界冲突。已上报协调者；协调者决定采用固定普通 usage/help 文本、维持 --help/0 与同一材料参数接口，移除 argparse import。--help 自身也在 ForbiddenEnvironment 哨兵下通过。此为局部实现偏差，冻结 lwplan 不擅改；由 fresh Review(Impl) 判是否须回 LW，不把协调者决定写成独立审查结论。
2. stdout write 接受数据后，flush 可能才暴露 I/O 错误。协调者指出既有输出失败合同覆盖此场景；实现显式 flush，新增 BufferedFailure fixture，固定 stderr=report_write_failed，返回 3。此项未扩大输入/输出或运行范围。

未发现其他需要改变基线的漂移；不检查平台镜像，不声明镜像一致。

## coordinator_handoff_verifications

| verification | 移交原因与建议方式 | evidence_expected | owner | conclusion_if_missing |
|---|---|---|---|---|
| 独立源码、固定 pin 与范围核对；重跑本地 unittest/py_compile | 实施者自证不能替代协调者；由协调者实际读取并复跑，不依赖本报告结论 | work/orca-p1-implementation/coordinator-check.md，完整输出/退出码，当前源码哈希 | coordinator | 只能称 Impl 本地自证，不能称协调者已核验 |
| Review(Impl) | 未参与实施的 reviewer 审最终两文件/计划/本报告；重点固定 help 偏差、读取预算、未知状态和失败分支 | 独立 review_notes_impl_*.md 与当前对象 hash | coordinator 调度 reviewer | 不得声称正式实施审查已通过 |
| 实际 Windows reparse、硬链接、权限、Node 实物 | 当前只有普通临时文件与 mock；真实材料与操作系统特性由后续有界核验承接 | 实际操作步骤、对象/归属与输出；若未做明确未验证 | coordinator | 不将 mock 升级为真实 OS/ABI/Node 结论 |
| P1-B U1–U5：构建/native、发现/外部副作用、监听/Web、daemon 全套清理、真实 env block 生效 | 超出 impl-safe/本批准入；须先补事实，再另行 Readiness/LW/Gate。当前不执行 | 后续独立准入与真实证据；不是本工具退出 0 | coordinator | 保持五项 unverified，launch_admission=blocked |

## 未完成、风险与回滚

本批准入的源码和本地 fixture 已具备；协调者独立验证与实施审查尚未由 Impl 执行。P1-B、HTTP 迁移、P2/P3、旧 M3 真实验收与像素嵌入继续未准入/暂停/延期，UI 为另一个独立改动范围，本报告不替代它的交付。

固定 pin 和严格路径词法规则需要人工维护；静态材料可能来自任何来源；合成路径不是沙箱，source=synthetic 只是声明；TOCTOU 的完整对抗未覆盖。stdout 输出/flush 出错只给固定错误并返回 3，不承诺调用者已保存报告。工具没有后台资源和持久状态。

rollback: 可直接回滚本轮两个新增源文件；保留材料与验证/历史报告。目录无 Git，不初始化、不提交、不推送；未来纳入仓库时的英文提交建议：`feat: add offline Orca material and candidate preflight`。

无新增跨功能事实。
