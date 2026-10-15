# Readiness 检查记录（第 1 轮）

**review_target**：readiness  
**评审时间**：2026-10-04（Asia/Shanghai）  
**评审对象**：本批 README、两份 research 与 clarifications 完整实现基线  
**评审结论**：PASS

本结论只允许进入 LW。它不证明 GUI 已连接、当前 UUID 已成功定位、原子实例钉住或精确 client-PID 握手，也不关闭旧机器人批和父 Q6。作者未实施本批产品，未运行 GUI、attach、watch、focus、HTTP 网关或 SSH。

## 输入文件

完整读取 plan-review、development-workflow、verification-before-completion 技能；以下本批文件完整读取，末轮基线补证后再次完整读取。

| 文件 | 本次评审读取的 SHA-256 |
| --- | --- |
| README.md | C02D7A393B2B5F79E871E0772A99BCF983C9316AFF3610D68881FFDC934E0312 |
| clarifications.md | 5466F7FAA60665430DB9C0FBB2809F38DC0B1DCCA4AA42D4C7D268C5D1B2E93A |
| research_code.md | 277CB3ABAF943323188B13F471E5DD2A2219618B76EFB5C0070F6AD2BC8BDD93 |
| research_attach.md | F4EC50D8645F75B1AFA4771C1B35047B84701DA4FDBD405683746C62D8DF501C |

独立完整读取真实 terminal.py、source.py、gateway.py、service.py、web/app.js 与 D: 工作台 WezTerm/Zellij 配置。固定官方 commit `efd8fd5a89a20c07a111d248ad7fce53848d2c18` 的关键源码定向阅读，不把整库未读部分当已核验：

- [commands.rs](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/src/commands.rs)：无名 attach 仅选择唯一 active；命名入口有 resurrection，index 忽略名称，reconnect 是另一条有 create 的用户交互路径。
- [client os_input_output.rs](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/zellij-client/src/os_input_output.rs)：连接失败循环等待，不能用前检冒充退出即 fail。
- [server lib.rs](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/zellij-server/src/lib.rs)：ClientId 为 u16；631—647 行由 session state 分配，906—918 行在接受连接后使用该 ID。不是 Windows PID；内部 clients/watchers 另含 web 标记。
- [route.rs](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/zellij-server/src/route.rs) 与 [screen.rs](https://raw.githubusercontent.com/zellij-org/zellij/efd8fd5a89a20c07a111d248ad7fce53848d2c18/zellij-server/src/screen.rs)：ListClients 走元数据输出链，当前产品三列解析没有进程归属证据。

本机发布 EXE 字节匹配依据为 research_attach U1 的本机独立 SHA 与 root 官方 release SHA 原始读取；本评审没有自行下载或构建 EXE。

## 澄清与基线核验

### A. 澄清问题完整性

- ① 未回答 Q&A 是否为空：是。`未回答`明确没有用户范围问题；技术限制列在 research，不被冒充为用户答复。
- ② coordinator 是否漏记澄清问题：未发现。本评审提出的 client ID 非 PID、关联观察与握手区别、失败回收不得杀任意后代，已回写决策 6、7 和 G2。
- ③ 头脑风暴决策是否完整落盘：是。目标、已有范围与自动实施偏好，以及本批技术选择均落盘。用户“继续”接受前轮三项具体范围，不重复要求阶段许可；新权限/范围仍须另行处理。

### B. 基线内部质量

- ④ 各必填章节 1—10 存在且非空：PASS。每章有本批事实、职责或可执行规则，非模板占位。
- ⑤ 目标锁具体可验证：PASS。G1 分离后台/窗口/client/年龄；G2 保守前检、原实例后验与明确关联观察；G3 动作前后 client、实例、UUID/pane 核验。
- ⑥ 反目标具体：PASS。禁止项检查如下。这里核验基线未指挥这些动作，不宣称未来实现已经遵守。

| 禁止内容 | 可核查依据 | 基线结论 |
| --- | --- | --- |
| 复活、缺失新建、重放命令、补 tab、创建 SSH/Claude | clarifications N1；决策 3、4 禁旧 launcher、named/create/initial command；commands.rs 唯一 active 分支 | 未作为目标或实现动作引入 |
| 更换来源/reader/MCP/图形/CSP、改变 5/30 秒合同、browser argv | N2；风险边界固定参数、空 JSON、CSRF；决策 2 复用原链 | 未引入 |
| 常驻监管器、自制 IPC、编译/替换工具、通用配置、触碰其它进程 | N3；决策 5、7 仅有限请求与 owned GUI/已核验客户端；禁 taskkill /T 和一般后代杀 | 未引入 |
| 把旧批缺证当已验、扩大清理到 server/SSH | 第 4、5、9 节；决策 7 明确 server/SSH 不回收 | 未引入 |

- ⑦ 风险边界责任明确：PASS。真实 GUI、允许的连接及失败清理由 root 承接；下游作者只有 mock/静态；未知归属不发 focus。
- ⑧ 验证责任有产物/主体/顺序：PASS。第 4、8 节给出作者→root→fresh reviewer，产物 `work/wezterm-session-link-*` 和本目录正式报告，缺证不可 PASS。

### C. 基线与澄清一致性

- ⑨ 基线与已回答 Q&A/决策无矛盾：PASS。

| Q&A / 已授权条目 | 对应基线字段 | 一致性 |
| --- | --- | --- |
| 日常效率优先、3D 辅助理解 | G3、N2、第 7 节；沿用 UUID 选择与正文分页 | 一致 |
| 3D 主视图＋像素/文字回退 | N2、第 7 节；图形层不变 | 一致 |
| 对“连接现有工作台、显式 UUID 定位、连接状态”答“继续” | G1/G2/G3、决策 1—7 | 一致 |
| “自动实施代码即可现在” | 已回答执行偏好、第 8/10 节；保持正式证据 Gate，不重复范围批准 | 一致 |

- ⑩ 基线可从 README 与澄清推导：PASS。

README“后台存活但窗口未连接、多客户端和过期映射”→ 已确认连接状态功能 → G1 独立来源/窗口/client/年龄。README“以现有显式定位入口切到对应 SSH pane”→ 已确认 UUID 定位 → G3 和决策 2 复用 UUID/slot/pane 证据。README“不复活、重放、自动补建、创建远端对话”→ 决策 3—5 排除旧 launcher 与命名 attach，选无名唯一 active 入口 → N1、G2。README“固定工作台”→ 决策 6、7 的进程归属和 owned 清理 → 风险边界、N3。README 旧批冻结 → 第 5、9 节保留旧缺证。

### D. 基线内部一致性

- ⑪ 目标锁与反目标不互斥：PASS。首次无名 attach 的不创建/不复活与连接现有 active 工作台可并存；未要求 CLI 不存在的原子实例 API。创建本机 GUI 已获新批连接授权，不能误解为创建远端 session。
- ⑫ 风险边界与验证责任不矛盾：PASS。有限等待后仅清理本请求 GUI 与身份仍可核验的 attach 客户端；决策 7 是决策 5“客户端树”的具体边界，不能按宽泛后代树执行。cleanup_unverified 保留缺证并锁后续动作，不能当成功。

### E. 与 research 对齐

- ⑬ 关键约束进入基线：PASS。已覆盖 named resurrection、无名唯一 active、无限 retry、非原子选择、无 client-PID 映射、零与解析失败分离、年龄与锁、外部所有权及真实验收责任。

### 澄清与基线核验结论

整体结论：PASS。无待用户决策，无 FAIL 项。初读时归属与回收描述不足，已由受控补证修正为末轮基线；本结论只针对表中最终 SHA。

## 技术可行性与剩余证据边界

无名 attach 的首次分支可证明不会选择 New/Resurrect；这是采用现成能力的依据。没有名称/实例原子 pin 的事实仍保留。原工作台消失、唯一 active 变成异主或同名实例替换时，后验检查必须拒绝并清理 owned 客户端；真实瞬时误连不可通过检查撤销，报告和 UI 不得承诺绝无此竞态。连接入口不主动发送输入或 SwitchSession，用户之后手动操作终端的语义不由本功能改写。

GUI 进程、唯一 client 数量和父子链是关联观察，不是协议握手。组合合同在当前可逆联动范围内可进入 LW：完整相关进程普查、精确参数/父进程/创建时间、前后同一原 server、严格清单、唯一 GUI 祖先同时成立才给“唯一关联观察”。单看一个 GUI＋一个 client 不足。可观察异主、额外 web/watch/交互客户端、字段缺失、权限失败或无法闭合时须 unknown 且禁 focus；源码内部 web 标记不在当前三列输出，不得假定产品已取得该字段，不能把尚无法区分的场景强行归类为本机 GUI。LW 必须写出实际可观测范围和这些拒绝分支，不能将本 readiness 当精确归属证据。

有限等待和 owned 回收可以让本请求不永久留下待未来 server 的客户端；但清理成功必须有本请求进程句柄/子客户端身份及退出复核，未能确认退出是 cleanup_unverified，不是“已清理”。只杀既有 server 或遍历所有后代的方案违反基线。没有必要以自制 IPC/守护器替换这组有限请求规则。

| 不确定点 | 本轮处理 | 后续责任 / 证据 |
| --- | --- | --- |
| attach research U1：本机版本来源 | 关闭到官方 release EXE 字节相等，非可复现构建证明 | root 执行前核对 hash；不替换 binary |
| attach U2、code U1：精确原子连接机制 | 明确不存在当前 CLI pin；以无创建/复活候选＋有限前后检合同进入 LW，不声称缺口消失 | LW timeout/实例变更/异主/失败清理负例；root fresh 实例；review 核验口径 |
| code U2：client/GUI 归属 | 明确 CLIENT_ID 非 PID，补唯一关联观察/未知拒绝合同；真实归属未验 | LW 精确普查与歧义案例；root 实际 GUI/client 同时观察；无法闭合不降低成功口径 |
| code U3/U4/U5：年龄、解析、并发 | 技术事实已足够规划，细节由 LW 显式定型 | 最早证据年龄、严格坏清单、backend 动作锁、迟到/竞态负例 |
| attach U3、code U6：真实 GUI/UUID focus | 未实测，保留验收缺证，不阻止写可验证方案 | root 承接；fresh Review(Impl) 缺证不得 PASS |
| attach U4：WezTerm 无可靠版本字符串 | 版本未知保留，本机 help 已证明拟用参数存在 | 固定 EXE/config hash与真实启动行为；不可按最新版推断额外接口 |
| code U7：外部 D: 归属 | 持续限制，历史 hash 不作执行时身份 | root 执行前复核，不改外部配置/旧 launcher |

## 缺失证据

本阶段不缺进入 LW 必需的用户边界或已读关键事实。仍缺本批运行时证据：真实连接、唯一关联观察、UUID focus 成功、原 server/SSH/pane 保持、重复连接不再创建、失败回收及错误路径。它们由第 4 节责任链承接，不能由本报告、mock 或一次真实成功替代所有负例。LW 还需提供具体 argv、Windows 普查字段/解析、状态年龄、总等待预算、锁/cleanup_unverified 状态以及正负例锚点。

## contract drift / stale / mirror mismatch

1. development-workflow / plan-review 的默认自动 LW 规则为 STOP_BEFORE_IMPL；本次 developer 要求持续使用既有授权，用户明确自动实施与本轮继续。按更高优先级和已记录范围推进，不因默认技能规则重复制造阶段批准冲突。保留正式 Gate 与新风险受控出口，不修改 shared skills。
2. 初读 README 的阶段为 Research，而 clarifications 第 9 节是 ReadinessCheck；root 在本报告收口期间已回写为 ReadinessCheck，调研里程碑也已勾选。再次完整阅读当前 README，目标/范围未变，增加了实际基线验证与失败记录；最终输入表已改为该版本 SHA。状态差异已收束，旧 feature 未重写。
3. research_attach 强原子约束缺口与当前基线有限关联观察合同不是同一个结论；后者没有把前者标成技术已关闭。research_code U1/U2 的“未关闭”保留为原调研事实，由本报告显式说明本轮处理，不能静默改旧事实或声称原子能力存在。

## 建议恢复动作

- 证据补强：LW 将剩余 runtime 合同和正负例写成可执行锚点；root 与 fresh reviewer 按责任顺序取证。若 argv/归属/清理仍不可唯一表达，受控补证或修订基线，不默认成功。
- 契约纠偏：本批 README 的状态已回写，后续继续按实际 Gate 更新；不改 skills，不改旧 feature 基线/报告；不再请求已经给出的相同实施许可。

## 放行判断

- allow_enter_lwplan: yes
- allow_enter_impl: no（仍须本批唯一 LW、Gate-1、fresh Gate-2）
- close_previous_robot_or_parent_Q6: no

## 本轮验证与异常记录

评审前已读取 verification-before-completion。最终报告结构与输入 SHA 的实际只读验证命令、完整输出和 exit 由尾后工具记录给出；本报告只写进入 LW 的判断，未声称产品测试通过。

首次把三个完整长读取结果并行输出，functions 外层总预算造成截断。随后每份单独重读并读取完整输出：development-workflow `6d50a9`、README/初基线 `339571`、research_code `f6747e`、research_attach `a1e371`；末轮完整基线 `cff198`。源码 web find 未找到若干搜索词只表示该模式没有匹配，不当作不存在能力的独立证明。没有执行被禁止的 live 动作。

报告初次验证 `e3231b` / exit1：README 并发状态更新造成旧 SHA 不匹配，随后 GBK stdout 编码遇到 circled 数字触发 UnicodeEncodeError，未跑完整检查。已完整补读当前 README（`2258f3`）、更新表中 SHA 与 drift 记录，并改用 UTF8 执行最终全量验证。root 回传最新 list-sessions/CIM（`adabce` / exit0）显示一个 active、六条 EXITED、仅原 server，无 GUI/交互 client；此处仅记录 root 当时只读样本，不冒充本 reviewer 独立 live 或未来成功证据。

本 reviewer 最终完整命令为 PowerShell here-string 保存下列 Python，执行 `.venv/Scripts/python.exe -X utf8 -B -c $readinessVerify` 并 `exit $LASTEXITCODE`（无管道收尾）。`f50ded` / **exit0，47 checks / 0 failures**：四输入 SHA、十个基线章节、七个报告章节、二十一个必需标记、五个已读产品 SHA 均输出 true；完整输出已读。这是正式产物与读取输入核验，不是 GUI/功能验收。该工具 SHA `114E5C97C055C4376CEB742DBFA098B1F9848EE6B6E29F0A7DA0F2583B8A0C53` 是追加此证据段前的报告；追加后再次执行同一全量命令，最终 SHA 以尾后工具结果为准。

```python
from pathlib import Path
import hashlib, re, json
base = Path('docs/current/wezterm-session-link')
expected = {
 'README.md':'C02D7A393B2B5F79E871E0772A99BCF983C9316AFF3610D68881FFDC934E0312',
 'clarifications.md':'5466F7FAA60665430DB9C0FBB2809F38DC0B1DCCA4AA42D4C7D268C5D1B2E93A',
 'research_code.md':'277CB3ABAF943323188B13F471E5DD2A2219618B76EFB5C0070F6AD2BC8BDD93',
 'research_attach.md':'F4EC50D8645F75B1AFA4771C1B35047B84701DA4FDBD405683746C62D8DF501C',
}
s = (base/'review_notes_readiness_1.md').read_text(encoding='utf-8')
checks = []
for name, wanted in expected.items():
 actual = hashlib.sha256((base/name).read_bytes()).hexdigest().upper()
 ok = actual == wanted and wanted in s
 checks.append(ok)
 print(json.dumps({'input':name,'sha256':actual,'matches_reviewed_input':ok},ensure_ascii=False))
baseline = (base/'clarifications.md').read_text(encoding='utf-8')
for n in range(1,11):
 ok = bool(re.search(r'^### '+str(n)+r'\. .+\n\n\S',baseline,re.M))
 checks.append(ok)
 print(json.dumps({'baseline_section':n,'present_nonempty':ok}))
for section in ['输入文件','澄清与基线核验','缺失证据','contract drift / stale / mirror mismatch','建议恢复动作','放行判断','本轮验证与异常记录']:
 ok = '## '+section in s
 checks.append(ok)
 print(json.dumps({'report_section':section,'present':ok},ensure_ascii=False))
for marker in ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','allow_enter_lwplan: yes','allow_enter_impl: no','close_previous_robot_or_parent_Q6: no','cleanup_unverified','CLIENT_ID','唯一关联观察','不证明 GUI 已连接','无新增跨功能事实']:
 ok = marker in s
 checks.append(ok)
 print(json.dumps({'required_marker':marker,'present':ok},ensure_ascii=False))
for path,wanted in {
 'session_panel/terminal.py':'A8EBD020C11AC635BFC09F3EA34EB1EA1A8344191193D2DF8F395B55AC287CA9',
 'session_panel/gateway.py':'9D3AC254B2904307023CE516B13F81C9FEBFA31AB9F1A8C708B1EDF204F64643',
 'session_panel/service.py':'B265068FE8F5D30731EC87536166B3B243B6CE51FC8DD49E55DEE1FE4C35E73E',
 'session_panel/source.py':'6F259C692A8E9B0373A584D664164DFC6773F2D05A5227BD2F21D2A336A0BCC2',
 'web/app.js':'D6282CFB0B3E63FB76E086CEDFFEE7DA4B5DB6AD1B2221F2FCAF2A63C2880CC0',
}.items():
 actual = hashlib.sha256(Path(path).read_bytes()).hexdigest().upper()
 ok = actual == wanted
 checks.append(ok)
 print(json.dumps({'product':path,'sha256':actual,'matches_read_source':ok},ensure_ascii=False))
print(json.dumps({'checks':len(checks),'failures':sum(not c for c in checks),'report_sha256':hashlib.sha256((base/'review_notes_readiness_1.md').read_bytes()).hexdigest().upper()},ensure_ascii=False))
raise SystemExit(0 if all(checks) else 1)
```

无新增跨功能事实：本轮 ClientId 和进程/客户端区分已进入本批技术边界，不新增全局规则候选。
