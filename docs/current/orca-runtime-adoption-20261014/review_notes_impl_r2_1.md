# P1-A 实施后独立审查：第 2 轮实施、第 1 次审查

结论为 **PASS / PASS，仅限 P1-A 离线预检工具**。R1 保留设备段遗漏已由局部词法替换和有效红绿回归关闭。本 reviewer 独立重跑完整 16 项 fixture、语法与静态差异核查，均退出 0；未发现新增阻断缺陷。真实 Orca、P1-B U1–U5、完整架构与 UI 不在本审查放行范围。

## 基本信息与对象绑定

- review_target: impl
- impl_round: 2
- review_seq: 1
- review_date: 2026-10-14（Asia/Shanghai）
- role: fresh independent review_plan；audience: shared；未参与两轮实施或前轮审查；未递归委派。
- implementation_report: [impl_report_r2.md](impl_report_r2.md)
- previous_review: [review_notes_impl_r1_1.md](review_notes_impl_r1_1.md)
- 协议结论: PASS
- 业务结论: PASS
- 合法双结论核验: PASS（PASS → PASS）
- goal_lock_alignment: aligned
- anti_goals_touched: none
- authoring_ergonomics_check: pass
- declaration_readability_check: pass
- plan_defect_checkpoint_recommended: no
- plan_defect_checkpoint_reason: R1 修补属于既有设备段拒绝合同；只替换一个词法判定并新增一个测试方法，无目标、接口、验收、风险或回滚决策变更。
- impl_safe_validation_check: pass
- coordinator_handoff_check: pass

| 对象 | 本轮独立核验 SHA256 |
|---|---|
| lwplan.md | 00176EE73C925634FD783C06DF943FD8656C3348558B2981A8896CAC916FC452 |
| scripts/orca_preflight.py | 0D671C1F44001DFBE4B271C8729CB8A7EE4BE56D72E252E0B4A8E7721C0E2897 |
| tests/test_orca_preflight.py | 83EF5B6966F5B273FCF7F1D40C32D4541758D0C2FC79B1DCB48DCB01EEE77C4D |
| impl_report_r2.md | A82B2DF3639E46C61FDF6D7E553B208ADF4327A7929024B7BDD3826C1C29223E |

完整读取 README、clarifications、architecture-final、research_p1_implementation、lwplan、r1 审查、r1/r2 报告，分段完整读取最终脚本与测试；读取本轮交接要求列出的全部 coordinator/Impl r2 证据、r1 unit-tests.txt 及固定 Node pin 研究副本。首次 skill 批量结果有截断，已补读相应双结论与分流段；未据截断输出形成结论。

## 逐包实现复核与 R1 闭环

| 工作包 | 本轮独立复核证据 | 结论 |
|---|---|---|
| S1 材料与读取边界 | 脚本 57–137、159–226：root 及祖先/固定组件 lstat，链接/reparse/普通单硬链接/单文件与累计预算，前后 fstat、流式摘要和关闭；固定 8 文件与只 lstat 的禁止 marker。完整 fixture 覆盖 absence/hash/slot/pin/package/path/total budget | 与计划对齐；真实 OS 特性和 Node 实物仍未验证 |
| S2 JSON/参数 | 140–156、229–277：重复 key/非有限数/格式异常拒绝，严格 schema 与 token 上限，精确 loopback、规范 ASCII 端口、四种参数各一次；没有命令组装执行 | 与计划对齐；候选不等于可启动合同 |
| S2 合成环境及 R1 | 280–317：原始段先检查，逐段 PureWindowsPath.is_reserved，casefold 的段关系、严格子路径、home/temp 相等与五组不嵌套。测试 430–442 的 10 个拒绝子项及 4 个普通内部空格对照 | R1 关闭；纯词法、无路径访问，未增加环境变量或能力 |
| S3 报告/错误 | 327–419：12 固定 id、2→3→1→4→0 归并，CLI/root 早停，candidate 缺失/无效继续其他材料，固定 provenance/runtime/U1–U5/blocked，64 KiB 限额，秘密不回显、write/short write/flush 固定错误 | 与最终冻结计划对齐；完整静态 matched 退出 0 仍 blocked |

独立差异核查读取 authenticated-r1 文本并重新计算摘要，分别等于 r1 审查固定脚本与测试 hash。它们是协调者从 r2 逆向复原后摘要认证的文本，**不是开始时原始备份**。直接 diff 只显示旧设备正则替换为标准库词法方法、测试新增一个方法；既有材料/报告链无其他变更。本轮另核 70 文件基线，仅 workspace.css/js 改变，属于独立授权 UI，P1-A 没有产品接线。

R1 的闭环证据分层：

1. Impl `unit-tests-r2-red.txt` 显示修复前 16 方法中 10 个新增子项 FAIL；退出 1 由实施执行记录/报告承接。green 同命令 16 项 OK、退出 0。没有以绿日志覆盖红日志。
2. coordinator 独立 CON .txt 原断言，修前 matched/退出 1，修后 mismatch/退出 0，完整 red/green 保留；另独立 16 项和 py_compile 退出 0，见 coordinator-check-r2.md。
3. reviewer 本轮独立完整 16 项 OK/退出 0、py_compile 退出 0；追加只读差异/基线/词法核查退出 0。CON/COM1/LPT1 空格扩展名、大小写、保留父段、NUL 与上标 COM¹ 均拒绝，普通内部空格对照接受。本机 Python 3.12.10 的公开 is_reserved 源码只分割末段设备基名并查集合，因此逐段调用合理；没有 OS 创建或访问验证。

本 reviewer 的命令、完整输出与退出码保存在 [独立检查证据](../../../work/orca-p1-implementation/reviewer-r2-1-check.md)，辅助脚本是自己的纯本地静态证据。上述三层均为 impl-safe 范围，不能从 mock 推导真实隔离或 runtime 准入。

## 基线与澄清一致性复核结果

**PASS。**“未回答”无当前 P1-A 阻塞用户问题；P1-U1–U5 是排除在本批准入外的技术缺口，不要求用户替验证确认。P1-G1/G2/G3 固定切片、纯数据、精确状态与零接线均有实现证据；头脑风暴的 Python/原生页面、条件 Orca、独立生命周期及分段迁移未被改变。

最新原话已解除历史 STOP_BEFORE_IMPL；冻结计划停机字段与旧 Gate 保留作历史，当前 README/clarifications 显式授权编码。UI 是另一个授权范围，本 reviewer 不继承或替代其独立审查结论。

| 禁止内容 | 可核查证据 | 结论 |
|---|---|---|
| 材料执行/import、下载、安装、进程/监听/配对/浏览器/模型 | 脚本 8–14 仅 7 项标准库 imports；57–226 只 lstat/rb/hash；362–423 只报告/退出；测试 481–486 外部调用哨兵。本轮 AST/禁用调用定位加逐函数阅读 | 未踩中 |
| 宿主 os.environ、注册表/PATH/WSL、账号和私人正文访问 | 280–317 纯字符串/PureWindowsPath；固定 HELP 43–45、367–379；测试 476–494 环境哨兵与固定材料访问集合 | 未踩中 |
| 命令导出、绕过开关、静态成功解锁 | 234–253 固定输入 keys；351–358 固定 unverified/blocked；测试 444–463 含完整 matched/0 仍 blocked、额外 runtime_safe 拒绝 | 未踩中 |
| OwnedProcess/M3/HTTP/FastAPI/数据库/像素/前端接线 | 实际 imports/函数链无产品调用；70 文件独立基线仅另行授权 UI CSS/JS 变化；r2 与摘要认证 r1 差异仅设备判定/回归 | P1-A 未踩中 |
| 通用清单、签名、Provider、调度框架 | 固定九路径、窄常量与普通函数，无插件/调度层或清单引擎 | 未踩中 |
| 宽监听 fallback、hash 等同可信来源/ABI/隔离/清理、mock 关闭 U 点 | bind 精确 127.0.0.1；NOT_COVERED、runtime_checks 与 blocked 固定；tests 79–89 明示 branch-only Node，91–97 与完整 matched 用例 | 未踩中 |

## 方式偏差、contract drift / stale / mirror mismatch

固定 help 相对 lwplan“argparse 普通说明/0”的字样存在实现方式差异。本 reviewer 独立接受：r1 完整失败栈证明 argparse→gettext→os.environ；固定 help 保留接口/退出 0/不能启动/输出失败语义，并通过本轮环境哨兵。直接避免隐式环境读取比全局 monkeypatch 简单；没有改变目标、验收、回滚或新增决策。不能假称使用 argparse，也无需重复批准该普通实现选择。显式 flush/短写同属既有输出失败合同。

前审 README“尚未创建”导航已改为“已创建”，历史停止点已标历史，当前 remediate 状态与本次审查前实际状态一致；无新增本范围 contract drift。impl_report_r2 的 pending 是作者交接快照，由本报告及协调者当前状态承载后续结果。平台镜像未检查，不声明 mirror 一致。

**设计味道扫描结果：WARN: 固定版本 pin 和 Python 3.12 设备名词法规则需在未来版本变更时重新核验。** 本轮已删除重复手写正则、复用标准库且逐段调用，未新增抽象/配置/依赖或声明可读性回退。此维护成本不阻断当前固定 x64 切片，不扩大成兼容框架。

## 失败、风险与未验证边界

失败保持可追溯：r1 首跑 14 项中 1 FAIL/退出 1（argparse 环境哨兵）、Impl 报告模板 SyntaxError；r1 reviewer 读取私有 pathlib 名称失败/退出 1；root 原 CON .txt 断言退出 1；r2 红测 10 子项 FAIL/退出 1；coordinator diff 首次 GBK 编码 UnicodeEncodeError/退出 1，随后 UTF-8 重跑退出 0。研究/LW 的网络/rate-limit/EOF/超时、缺文件、路径/无匹配、读取截断和非 Git 检查失败仍保留原文件。本 reviewer 本轮完整测试、语法及静态检查均退出 0，没有新增验证失败。

真实 Windows reparse/硬链接/权限/并发替换/保留设备行为、Node 实物/ABI/完整 bundle、Orca 启动发现与外部副作用、实际监听/Web/权限、daemon/PTY 整套清理和真实 env block/home/temp 均未验。对抗性 TOCTOU、synthetic 来源、JS integrity、构建来源亦未验；合成路径不是沙箱。coordinator 承接这些事项须先走 P1-B 的独立准入，不能以本报告放行。

## 后续动作

允许 P1-A 进入 Archive/交付；若未来纳入 Git，可进入相应 PR 流程。目录无 Git 按协调者证据承接，不初始化、不假装提交/推送。coordinator 需更新当前状态并独立核验本报告结构和最终 hash；整项用户请求还须消费独立 UI 交付证据。P1-B U1–U5 保持 unverified、launch_admission=blocked；旧 M3 费用暂停、像素延期、HTTP/P2/P3 等后续范围保持原边界。

英文提交消息建议：`fix: reject reserved Windows device path variants in Orca preflight`。

无新增跨功能事实。
