# P1-A 离线预检补实施报告（第 2 轮）

本轮修复独立审查 R1 的 Windows 保留设备段漏判。新增回归先真实失败（16 项、10 个失败子项，退出 1），修改后完整 16 项通过，退出 0；py_compile 退出 0。当前为 Impl 本地自证，仍待协调者独立核验与 fresh Review(Impl)，不代表 Orca 运行准入。

## 基本信息

- feature_name: orca-runtime-adoption-20261014 / P1-A
- impl_round: 2
- date: 2026-10-14（Asia/Shanghai）
- audience: shared
- lwplan_version: SHA256 `00176EE73C925634FD783C06DF943FD8656C3348558B2981A8896CAC916FC452`，未改动
- defect_source: [review_notes_impl_r1_1.md](review_notes_impl_r1_1.md)，REVISE / IMPL_DEFECT，R1
- implementation_status: local_fixture_verified; coordinator_verification_and_fresh_review_pending
- runtime_admission: blocked
- authorization: 最新 clarifications 编码授权及协调者按正式 IMPL_DEFECT 合同交付补实施；局部低风险、无新目标/风险/回滚决策。

## 变更事实

| path | change_type | change_purpose | key_changes | related_tasks |
|---|---|---|---|---|
| `scripts/orca_preflight.py` | modify | 拒绝设备基名与扩展名之间含空格的 Windows 保留段 | `_windows_parts` 逐段调用 Python 3.12 `PureWindowsPath(segment).is_reserved()`，替换原手写设备名正则；保留其余原始段/词法/关系规则 | S2，Review(Impl) R1 |
| `tests/test_orca_preflight.py` | modify | 覆盖审查复现与正常含空格对照 | 新增 `test_reserved_device_space_variants`：CON/COM1/LPT1 的大写、小写、混合大小写，保留段位于父段的对照；四个普通内部空格名称 matched | S3 的 S2 回归，R1 |
| `work/orca-p1-implementation/unit-tests-r2-red.txt` | add | 保留修复前完整失败 | 完整 16 项 unittest 输出，10 个新增子项 FAIL，退出 1；命令见验证表 | S3 证据 |
| `work/orca-p1-implementation/unit-tests-r2-green.txt` | add | 保留修复后完整输出 | 相同完整命令，16 项 OK，退出 0 | S3 证据 |
| 本报告 | add | 保留新一轮事实与交接 | 来源、成熟规则取舍、红绿证据、哈希、风险与责任分层 | S3 交接 |

源码最终 SHA256：

- scripts/orca_preflight.py: `0D671C1F44001DFBE4B271C8729CB8A7EE4BE56D72E252E0B4A8E7721C0E2897`
- tests/test_orca_preflight.py: `83EF5B6966F5B273FCF7F1D40C32D4541758D0C2FC79B1DCB48DCB01EEE77C4D`

原 impl_report_r1.md SHA256 `A8D80F53F433770B80B28B3CBC236A28659F216C890ED3C6CD7815AFED4D6B53` 与独立审查记录相同。没有覆盖 r1 报告、unit-tests.txt、历史审查或协调者红测证据。仅调整设备段判定和新回归；未改 UI、README、clarifications 或其他权威状态文件。

## 目标、反目标与作者体验

- goal_lock_check: R1 对应冻结计划 §3.3 原有“拒绝 Windows 保留设备段”；没有增加输入字段、读取文件、报告字段、退出码或运行范围。S1 材料和 S3 报告链保留。
- anti_goal_touch_check: PureWindowsPath 是纯词法对象，is_reserved 的实际实现只分割名称并查固定集合；没有对合成路径调用 exists/resolve/mkdir/open。未新增依赖、宿主环境/账号/正文访问、网络、子进程、Orca 安装/启动、产品接线、启动开关或命令导出。runtime/U1–U5/provenance/launch_admission 的固定阻断仍由完整回归覆盖。
- authoring_ergonomics_notes: 采用已提供的标准库设备规则，删除重复正则而不是再增加一套基名修剪规则。逐段调用避免整个路径的 is_reserved 仅检查末段时漏掉保留父段；正常内部空格名称仍保留。没有新抽象或配置项。

## 实际调研、验证与失败

复用上一轮完整读取且未截断的 safe-code-changes、verification-before-completion、clear-expression 规则。完整读取本轮审查、r1 报告和协调者 red 文件；本次首次合并文档输出发生截断，随后 lwplan 和最新 clarifications 分别全文补读，没有据截断内容实施。

先实际读取本机 Python 3.12 `PureWindowsPath.is_reserved` 的公开方法源码：对最后段 `partition('.')[0].partition(':')[0].rstrip(' ')`，转大写后查保留名称。纯词法对照观察 `CON .txt`、`COM1 .log`、`LPT1 .log`、`cOn .TXT` 为 True，`ordinary name.txt` 为 False，而 `CON .txt/child` 整体为 False；因此在既有原始段循环逐段使用该方法。选择成熟标准库规则，避免修补另一套设备名正则；不据这些词法结果宣称真实 Windows 创建/访问行为已验。

| command / step | result | evidence | owner | conclusion_if_missing |
|---|---|---|---|---|
| 读取协调者修前 red 输出 | candidate.environment=matched，预期 mismatch 的断言失败；退出 1 由协调者原工具记录及审查承接 | [coordinator-reserved-path-red.txt](../../../work/orca-p1-implementation/coordinator-reserved-path-red.txt)、review_notes_impl_r1_1.md | coordinator（Impl 读取） | 不声称协调者复现已取得 |
| `python -c`，inspect.getsource(PureWindowsPath.is_reserved) 与上述六个纯词法名称对照 | 退出 0，源码及 True/False 输出完整已读；这是选取规则依据，不是实现合规结论 | 本轮工具执行记录及上段精确观察 | Impl | 不声称已读实际成熟实现 |
| `python -m unittest discover -s tests -p test_orca_preflight.py -v`（加回归、修改实现前） | 退出 1；16 项，10 个新增子项 FAIL；普通含空格对照通过，完整失败栈保留 | [unit-tests-r2-red.txt](../../../work/orca-p1-implementation/unit-tests-r2-red.txt) | Impl | 无红测证据不能声称回归有效捕获 R1 |
| 同一完整 unittest 命令（替换设备规则后） | 退出 0；16 项 OK，完整输出已读 | [unit-tests-r2-green.txt](../../../work/orca-p1-implementation/unit-tests-r2-green.txt) | Impl | 无当轮输出不能声称本地修复/全矩阵通过 |
| `python -m py_compile scripts/orca_preflight.py tests/test_orca_preflight.py` | 退出 0，无输出 | 本轮工具执行记录 | Impl | 不称语法检查通过 |
| Get-FileHash 两源码、lwplan、impl_report_r1.md | 退出 0，完整输出已读；当前源码如上，计划和 r1 报告与既定快照同 hash | 本轮工具执行记录及上述 SHA256 | Impl | 不称冻结对象/历史报告未变 |

r1 argparse 环境哨兵 FAIL/退出 1、报告模板 SyntaxError、独立 reviewer 读取私有 pathlib 名称失败/退出 1，以及此前研究/LW 的网络、截断、路径、非 Git 失败，继续由 r1 报告、审查与原始证据保留。本轮新增 red 的 10 个失败子项已保存；不以绿色输出覆盖或省略失败。

## contract_drift_reports

- 无本轮新 contract drift。R1 是既有谓词遗漏，独立审查明确 IMPL_DEFECT，可局部修补，无需回 LW。
- 固定 help 相对计划 argparse 字样的方式偏差已由 review_notes_impl_r1_1.md 独立接受；原失败和差异仍保留。本轮没有变更 help 或假称使用 argparse。
- README stale 由协调者承接；不在本轮偷偷改权威状态。平台镜像未检查，不声明一致。

## coordinator_handoff_verifications

| verification | 移交原因与建议方式 | evidence_expected | owner | conclusion_if_missing |
|---|---|---|---|---|
| R1 独立红绿复核、最终 16 项/py_compile 与范围核对 | 实施者自证不替代协调者；重新实际读取最终两源码并独立复跑 | coordinator r2 检查记录、完整输出/退出码、最终对象 SHA256 | coordinator | 只能称 Impl 本地自证 |
| fresh Review(Impl) r2 | 本次修改需由未参与实施的新 reviewer 判定；看 R1 闭环、纯词法与原边界 | 新独立 review_notes_impl_r2_*.md，绑定最终 hash | coordinator 调度 fresh reviewer | 不宣称正式实施审查通过 |
| 真实 Windows 文件系统、Node 实物、P1-B U1–U5 | 非 impl-safe/不属当前准入，仍需要后续事实和独立 Readiness/LW/Gate | 后续有界实际证据或明确未验证 | coordinator | 保持真实行为 unverified、runtime blocked |

## 未完成、风险与回滚

当前补实施源码与本地红绿验证已具备；协调者独立验证和新实施审查未由 Impl 执行。保留 Python 3.12 标准库设备名词法依赖；未来 Python 版本迁移需复核规则，当前不加适配框架。真实 Windows 保留设备文件行为、reparse/硬链接/权限、Node/native/Web/daemon/环境隔离均未验。合成环境不是沙箱，静态匹配不证明来源或运行安全；固定 launch_admission=blocked 不变。

rollback: 可直接回滚本轮设备判定替换和新增回归；保留 r1/r2 报告、日志及用户材料。目录无 Git 按协调者既有证据承接，不初始化、提交或推送。英文提交消息建议：`fix: reject reserved Windows device path variants in Orca preflight`。

无新增跨功能事实。
