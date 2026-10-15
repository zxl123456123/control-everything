# P1-A 实施后独立审查：第 1 轮实施、第 1 次审查

当前结论为 **REVISE / IMPL_DEFECT**。固定材料读取、候选错误继续检查、运行阻断与失败证据符合本批准入边界；但环境路径检查漏拒绝 `CON .txt` 等保留设备段。该缺陷可在既有函数和对应测试内修补，无需改写冻结计划。固定 help 文本的实现方式偏差接受，理由见下文；不以这项技术选择要求用户重复批准。

## 基本信息与对象绑定

- review_target: impl
- impl_round: 1
- review_seq: 1
- review_date: 2026-10-14（Asia/Shanghai）
- role: fresh review_plan；audience: shared；未参与实施，没有递归委派。
- implementation_report: [impl_report_r1.md](impl_report_r1.md)
- 协议结论: REVISE
- 业务结论: IMPL_DEFECT
- 合法组合核验: PASS（REVISE → IMPL_DEFECT）。
- goal_lock_alignment: aligned
- anti_goals_touched: none
- authoring_ergonomics_check: pass
- declaration_readability_check: pass
- plan_defect_checkpoint_recommended: no
- plan_defect_checkpoint_reason: 已发现缺陷属于原环境词法拒绝合同内的一处遗漏；不改变目标、输入结构、验收或回滚。help 库选择不属于目标形态或新增风险决策。
- impl_safe_validation_check: pass
- coordinator_handoff_check: pass

| 评审对象 | 本轮实际 SHA256 |
|---|---|
| lwplan.md | 00176EE73C925634FD783C06DF943FD8656C3348558B2981A8896CAC916FC452 |
| scripts/orca_preflight.py | 4A47789AC079EB9CE763CE4E8FB533B8D4B682F65B45D7302BA4ADC3A0FE3A33 |
| tests/test_orca_preflight.py | ACEC00A721F9350C5A3CD94FA41DD4FBA845910EED3B60C812C415D6F7CFE67B |
| architecture-final.md | 704CFA6BD29087F54FD60525E440999B48510786147A427BDB084190F7C6071A |
| impl_report_r1.md | A8D80F53F433770B80B28B3CBC236A28659F216C890ED3C6CD7815AFED4D6B53 |

完整读取 README、clarifications、architecture-final、research_p1_implementation、lwplan、review_notes_lwplan_2、impl_report_r1，以及 unit-tests.txt、coordinator-unit-tests.txt、coordinator-check.md。分段完整读取最终两源码；独立核对 node-runtime-pin.ts 本地研究副本。不继承作者或协调者的 PASS。技能读取输出曾截断，已定向补读双结论/判定顺序段；文档批量输出截断后独立重读研究与计划后半段，不据截断输出形成结论。

## 逐包核对与实际验证

| 工作包 | 实现与计划的核对 | 本轮结论与证据 |
|---|---|---|
| S1 固定材料读取 | validate_root 逐祖先 lstat；inspect_file 逐组件拒绝链接/reparse、非普通文件、多硬链接与超限；打开后前后 fstat 核对 dev/ino/size/mtime_ns；固定八文件、禁止 marker 只 lstat；总预算、单文件上限、chunk 和摘要均为窄常量 | 计划范围内对齐。脚本 57–137、159–226；test_bounded_hash/test_path_rejection/test_slot_slice/test_total_budget_across_materials。本轮测试退出 0；真实 OS 特性仍未验证 |
| S1 固定声明与 Node pin | package 三字段严格值匹配；marker 仅去一个末尾 LF/CRLF；JS 仅非空与摘要；Node size/hash 独立固定，输入不能改 pin | 对齐。脚本 17–24、180–209；test_package_fields/test_node_pin。真实小文件核对 SHA；pin matched 为 mock 分支，不是实际 Node 证据 |
| S2 严格候选 | JSON 重复 key/NaN/Infinity/异常拒绝；schema key、类型与尺寸限制；只接受固定参数子集、ASCII 规范端口、精确 loopback，未拼接或执行命令 | 对齐。脚本 140–156、229–277；test_candidate_invalid_continues_materials/test_args_policy |
| S2 合成环境 | 不读宿主环境；PureWindowsPath 只作词法核对；root 严格子路径、HOME/USERPROFILE 与 TEMP/TMP 相等、五组互不嵌套；未知 key/source/inherit 拒绝 | 部分缺陷。脚本 280–318 的保留设备名判定遗漏扩展名前空格变体；R1 有独立复现。其他计划规则有表驱动测试与源码证据 |
| S3 错误与继续行为 | CLI/root 错误早停；合法 root 的 candidate 格式/schema/超限错误继续检查其他材料且退出 2；candidate 缺失继续按 3→1→4 归并；单文件 OSError 转固定 read_failed 并继续列表 | 对齐。脚本 100–137、159–226、328–420；三类输入测试保留实际 package/marker 结果，符合最终 Gate-2 R1 修订 |
| S3 固定报告与输出失败 | 12 个固定 id；文件项 size/sha256/integrity，candidate 不回显值/摘要；2→3→1→4→0；固定 provenance/runtime unverified/U1–U5 与 blocked；确定性 JSON、上限、write/短写/flush 失败固定错误 | 对齐。脚本 328–420；test_reporting_never_admits_runtime/test_no_side_effects_or_secrets/test_cli_output_failure。exit 0 仍 blocked 的测试只是合成 fixture |

独立 reviewer 在本轮执行 `python -m unittest discover -s tests -p test_orca_preflight.py -v`：15 项 OK，退出 0，读取完整输出；执行 `python -m py_compile scripts/orca_preflight.py tests/test_orca_preflight.py`：退出 0，无输出。另运行纯词法正反对照脚本，观察到 R1；观察脚本退出 0 只说明执行结束，不代表所打印行为合规。[本轮完整检查证据](../../../work/orca-p1-implementation/reviewer-r1-1-check.md)保存命令、输出、退出码和失败。

责任分层明确：Impl 的 Run 1/2/3 在 unit-tests.txt，最后 15 项退出 0；coordinator 自己重跑 15 项退出 0 和 py_compile 退出 0，记录于 coordinator-check.md；reviewer 本轮另行重跑并补词法检查。三者均为本地 fixture，不将外部依赖验证下沉给 Impl。报告移交了真实文件系统/Node 材料与 P1-B 准入，未将其写成已完成。

## 缺陷 R1：保留设备名的扩展名前空格漏拒绝

- 优先级：P2；位置：`scripts/orca_preflight.py:290`，对应 `tests/test_orca_preflight.py::test_environment_policy`。
- 计划要求：lwplan §3.3 明确“拒绝……Windows 保留设备段”。
- 触发：把合法合成 candidate 的 ORCA_USER_DATA 设成 `C:\orca-p1-fixture\CON .txt`，同样适用于 `COM1 .log`、`LPT1 .log`。
- 实际结果：parse_candidate 接受结构；check_candidate 返回 candidate.environment=matched。对照 `CON.txt` 返回 mismatch。
- 本地词法依据：同一字符串的 PureWindowsPath.is_reserved() 为 True；已读当前标准库实现，其设备基名在分割扩展名后 rstrip(' ')。此为词法依据，不宣称实际 Windows 文件创建测试。
- 原因：当前正则要求设备名后直接接 `.` 或结束，遗漏设备基名与扩展名之间的空格；全段只检查尾空格/尾点不能覆盖该变体。
- 影响：环境数据可通过不满足既定拒绝规则的路径。固定 launch_admission=blocked 仍在，因此本轮没有运行授权或真实环境访问；但材料预检的静态谓词错误，不能以固定阻断字段免除修补。
- coordinator 另行独立复现：`candidate.environment=matched`，预期 mismatch 的断言失败，退出 1；本 reviewer 已读 [完整 red 输出](../../../work/orca-p1-implementation/coordinator-reserved-path-red.txt)。该退出码按协调者工具执行记录承接，reviewer 自身的正反对照输出独立保留。

IMPL_DEFECT 三条件逐项成立：

1. **局部**：修补仅 `_windows_parts` 的设备基名规则和既有 `test_environment_policy`；不改变 S1/S3 主链或阶段目标。
2. **低风险**：只增加原合同要求的拒绝分支与回归输入，不引入产品接线、OS API、外部调用或新的回滚口径。
3. **无新决策**：拒绝保留设备段已在冻结计划；无需澄清，不需改任务结构、验收或回滚。原计划仍可指导补实施。

可直接执行的补实施输入：按 Windows 设备基名规则处理扩展名前空格；保留逐段词法检查与不访问路径的边界。加入 `CON .txt`/`COM1 .log`/`LPT1 .log`（含大小写变体）的 mismatch 回归和普通含内部空格路径的 matched 对照；先保留本次复现，再重跑完整 15 项及新增回归、py_compile。不得新增依赖或真实路径/进程验证；冻结 lwplan 不变。新实施报告保留本轮发现和所有历史失败，并记录最终源码哈希，交协调者独立重跑和 fresh Review(Impl)。本 reviewer 不修改源文件。

## help 偏差的独立裁定

**裁定：可接受的局部实现方式偏差，不是 PLAN_DEFECT。** lwplan §3.4 写“--help 为 argparse 普通说明/0”，而 §3.3 明确禁止读取 os.environ。Impl 首跑完整栈证明当前 argparse 初始化经 gettext.find 读取 os.environ，环境哨兵导致 1 FAIL/退出 1。实现改用固定普通帮助文本，保留材料参数接口、`--help`/退出 0、不能启动的说明、无原值回显与输出失败合同；最终环境哨兵覆盖 help，reviewer 本轮同一完整测试也通过。

计划中的库名不是业务目标、验收或回滚形态；直接移除隐式环境读取比为 argparse 引入全局 locale/gettext monkeypatch 更简单。没有旧调用者或产品接线需要兼容，也没有新增输入/运行能力。无需改变计划目标、风险或授权，仅在报告保留冻结计划与实现的文字差异；不能静默声称严格使用了 argparse，也不能用协调者决定替代本独立裁定。

显式 flush 与短写检查同属既有 stdout 失败合同：固定 `report_write_failed`/退出 3，未新增范围，不是 PLAN_DEFECT。

## 基线与澄清一致性复核结果

**PASS（目标/范围一致性；不覆盖 R1 的实现正确性）。**

- 澄清“未回答”列表：无当前 P1-A 阻塞用户问题。P1-U1–U5 是仍开放的技术证据缺口，基线已排除真实运行，不要求用户替技术验证批准。
- 目标锁：G1/G2/G3 有对应固定读取、纯数据、精确报告、零产品接线；总体 aligned，R1 为一个既定谓词遗漏，未改目标。
- 反目标：none，逐项依据见下表。
- 头脑风暴决策：未违反 Python/原生页面、独立条件 runtime、仅入口/观察与分段迁移决定。当前 UI 为另一项新授权范围，不以 P1-A 的旧前端反目标否决 UI。
- 最新 README/clarifications 原话显式解除历史 STOP_BEFORE_IMPL；冻结计划和历史 Gate-2 的旧停机字段不误用为当前禁止编码。旧 M3 费用暂停、像素延期、P1-B 未准入继续有效。

| 禁止内容 | 可核查依据 | 结论 |
|---|---|---|
| 执行/下载/import 材料、安装、启动、监听、配对、浏览器、模型/Agent | 脚本 import 8–14 仅标准库；57–226 的文件链仅 lstat/rb/hash；363–424 只报告/退出；测试 467–478 外部调用哨兵与访问集合 | P1 两源文件未踩中 |
| 宿主环境/注册表/PATH/WSL/账号或私人正文访问 | 脚本 280–318 仅字符串与 PureWindowsPath；HELP 常量、367–380；测试 462–480 禁用 os.environ 的 main/help 哨兵；逐函数源码读取 | 未踩中 |
| 可执行命令导出、跳过开关、静态成功授权运行 | parse_candidate 234–253 固定 key；build_report 351–359 固定运行字段；测试 441–449 | 未踩中 |
| OwnedProcess/M3/HTTP/FastAPI/数据库/像素/前端接线 | P1 范围仅新增脚本/测试，脚本标准库 imports，无 session_panel 入口；coordinator-check.md 的范围比对。UI 为独立授权，不归本禁止项检查 | 未踩中；不声明本 reviewer 审过 UI |
| 通用清单、签名、Provider、调度框架 | 17–45 窄常量、168–176 固定调用表、普通函数，无插件/类层级/运行状态机 | 未踩中 |
| 宽监听 fallback、profile 等同沙箱或 Node hash 等同来源/ABI/隔离/整套清理 | 257–277 bind 精确值；37–42 未覆盖；351–359 provenance/runtime/U1–U5/blocked；研究和报告保留局限 | 未踩中 |
| 用 mock 关闭真实 P1-B 或全架构准入 | test synthetic_node 79–89 明示 branch only；报告交接与 coordinator 未验证边界 | 未踩中 |

## contract drift / stale / mirror mismatch 与设计味道

- **已裁定方式偏差**：argparse→固定 help，影响仅帮助实现与纯 CLI 解析；如上接受，冻结计划保持原样并保留差异证据。
- **当前导航 stale**：README“当前实施入口与验证结果”仍写两个源文件“尚未创建”，而页头与末节已更新到 impl_reviewing/授权编码，实际文件已存在。这是阶段导航残留，不改变真实授权或冻结计划。由 coordinator 更新 README 当前导航，明确旧 STOP_BEFORE_IMPL 为历史结果，保留历史原话、冻结计划/评审和失败记录；不得以当前导航残留否认已授权实施。impl_report 的 pending 为作者交接时快照，后续结果应由 README/本报告承载。
- 平台镜像未检查，不声明 mirror 一致；未发现本范围需要修订 shared runtime contract 的证据。
- **设计味道扫描结果：WARN**：固定 pin 与手写 Windows 词法规则需维护，R1 说明变体回归必要；范围仍为固定 x64 切片和普通函数，未扩通用框架。424 行脚本与 520 行表驱动测试用于既定边界，未发现需调整作者工作方式的抽象或声明可读性回退。R1 单独贡献 REVISE，不把 WARN 当作免责。

## 失败、风险与未验证边界

保留 Impl 首跑 14 项中 1 FAIL/退出 1（argparse→gettext→os.environ），修正后两轮退出 0，不用后轮成功覆盖首跑失败。保留其报告落盘模板 SyntaxError；本 reviewer 第一次读取 pathlib 私有内部名称失败/退出 1，随后通过公开方法取得本地源码，记录于 reviewer 检查证据。研究/LW 的网络、rate-limit、EOF/超时、缺文件、路径/无匹配、截断、非 Git 检查失败依原始材料继续保留，本轮不重新关闭它们。

真实 Windows reparse/硬链接/权限/并发替换、真实 Node 文件/ABI/完整 bundle、Orca 启动发现与副作用、实际监听/Web/权限、daemon/PTY 整套退出、真实 env block/home/temp 生效均未验。TOCTOU 的对抗性保证、synthetic 来源、JS integrity 与构建来源也未验。只有常规临时文件、mock 和词法证据；本报告不能扩展这些证据。

## 后续动作

协议为 REVISE，暂不进入 Archive/PR。按 R1 补实施输入执行局部修补，并同步 README 当前导航；无须新增用户决策或回 LW。协调者独立验证最终对象后，安排 fresh 实施审查，保留本报告及当前哈希快照。P1-B U1–U5 继续 unverified、runtime_admission=blocked；本审查不替代 UI 独立验收或整项请求交付。

报告落盘后的本轮结构核验：必备字段、合法双结论、禁止项表、偏差/失败/未验证章节均存在；重算最终两源文件与冻结 lwplan 哈希仍与表中相同，退出 0。此为报告/对象绑定核验，不覆盖 R1 行为缺陷。

目录无 Git 的状态按协调者证据承接，不初始化、不假装提交/推送。英文提交消息建议（未来纳入仓库）：`fix: reject reserved Windows device path variants in Orca preflight`。

无新增跨功能事实。
