# 原生进程采集窄修订：实施报告 r3.1

## 基本信息与范围

- feature_name：wezterm-session-link；impl_round：native_r3.1；date：2026-10-04（Asia/Shanghai）。
- lwplan_version：`lwplan_runtime_delta_r3.md` r3.1，SHA `AEB72C017FF60D4E370E00BA420DF250D3774A4C72E5627060A9025A8DAB8EFF`；fresh Gate-2报告SHA `A8C272C89BC2478482ED52D6C7F3333CECA3EBEEFD641D98071CE8B44C4F0531`。
- root正式GO后仅实施S1Δ/S4Δ三个独占文件。旧r2/旧实施报告/red证据不改；未访问真实HTTP/SSH/browser、运行真实census/GUI/attach/focus/目标进程动作、安装或Git。
- 当前只提供impl-safe局部证据，产品默认helper性能、真实生命周期、连接/focus和owned回收交root；不能以本报告关闭runtime缺证。

## 变更事实

| path | change_type | change_purpose / key_changes | related_tasks |
| --- | --- | --- | --- |
| session_panel/native_processes.py | add | 一次64-bit Windows Toolhelp全快照，完整四Name六字段；同只读handle的PID/parent/path/birth与前后liveness检查；Nt60一次bounded sizing/query，local pointer/MaximumLength/ReturnLength/UTF16/NUL检查；finally关闭，有限main错误，无partial rows | S1Δ |
| session_panel/workbench.py | modify | 删除慢CENSUS；`_native_interpreter`每次核sys._base_executable与GetModuleFileNameW(NULL)ownimage，完整绝对Windows路径匹配；fixed base/-Xutf8/-B/-m/cwd/shellFalse/剩余timeout，无venv/PATH fallback | S1Δ |
| tests/test_native_processes.py | add | fake DLL/local buffer、单行失败整次拒绝、snapshot/Next/Close失败、外层except、PIDparent/birth/退出、buffer边界、有限main、ownimage错误zero runner、父错误到公共unknown闭环 | S4Δ |

当前delta：产品172行native＋workbench16新增/6删除，共194产品差异行；新测试309行，合计497新增/6删除（503差异行）。低于约300产品差异门槛，不删安全出口。工作台原430行中只有采样入口/解释器声明修改；原5/8/3、`_rows/observe`、GUI/child cleanup、Terminal/gateway/旧tests/UI合同不改。

before：`work/wezterm-session-link-native-r31/before/session_panel/workbench.py`，SHA `92B8D6218D72793B3767D9A5E806D91FEEB0CA6B43219CF38CDBF8967D4939B2`；独立before-manifest保留，不覆盖旧core清单。final三文件清单 `work/wezterm-session-link-native-manifest-r31.json`，差异 `work/wezterm-session-link-native-r31.patch`。

## 目标与作者体验

goal_lock_check：G1/G2/G3只替换迟缓的私有采样路径，取得完整同等级字段；未知仍null、动作false。固定相关Name先全枚举再查询，不按认可路径隐去foreign进程。父直接启动已验证real base；venvredirector反例已处理。

anti_goal_touch_check：N1没有工作台创建/复活/远端输入或D文件更改；N2不改API/源/reader/MCP/图形/CSP/年龄或5/8/3；N3无新包、daemon/watchdog、PEB/ReadProcessMemory/VM_READ、增权、fallback或一般树回收。原helper进程隔离的实际超时退出仍由root验证，不以base字段相同推断没有残留。

authoring_ergonomics_notes：一个172行native模块，固定ABI与少量直线函数；与workbench少量ctypes声明允许重复，不跨模块重构或新增异常层级。失败kind是固定六种，stderr不含路径/命令/traceback。原同handle检查包括之前class0 PID/parent、creation/birth与前后Wait/GetProcessId；不宣称多次采样是原子快照。main只完整JSON或有限错误，不接受argv/stdin查询配置。

## 实际impl-safe验证与失败保留

evidence：`work/wezterm-session-link-native-r31-author-verification.json`存完整argv/UTC/stdout/stderr/exit；owner：native impl作者；conclusion_if_missing：缺完整输出/exit不能称本地通过，更不能称runtime完成。

- `298c1a`：真实执行pure subset51项、0失败/0skip、exit0；3文件ast.parse无SyntaxError。全部输出已读。新native16项＋原35项。
- root独立只读首版指出close_handle使用sys.exception可能取得调用者已在except的无关异常，导致本次成功查询CloseHandle失败只add_note后返回rows。已最小修成query_row/census局部error=None，仅捕获本次主错，finally显式传递；成功关闭失败必raise，本次失败加close_failed note不覆盖主错。
- `d5e792`保留一个明确**in-memory旧body mock红控**：只将close_handle恢复旧sys.exception语义（未回写产品/未读取真实进程），运行outer-except负例，1项/1failure、模拟exit1，`ValueError not raised`。用于证明上述原缺陷；不是自然平台失败或当前产品suite失败。
- 同`d5e792`随后实际命令 `.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_native_processes tests.test_workbench tests.test_focus tests.test_gateway.GatewayDispatchTests -v`：52项、0失败/0skip、child exit0；原35保留，新native17项含有意义的subTest边界。完整输出已读；3文件AST同时通过。bytes collector不丢stderr，不管道截尾。
- 测试全部新进程查询/runner为fake，缓冲在本进程内；原Windows argv字符串解析纯单元继续沿用。未执行GatewayTests的临时HTTP或真实default helper。

首次组合读delta/report/workbench输出发生外层截断，之后独立读delta缺段、完整fresh report/native research与actual import链。没有将截断输出称全文。旧WQL5016ms timeout、pwsh/WMI/COM各失败、equivalence自定<500ms失败、r3venv反证、旧r1单测red、collector child exit1/stderr丢失与历史Gate/读取失败继续由冻结输入/r1报告保存，不因为本地绿删除或声称真实性能已修好。

## coordinator_handoff_verifications

| 待验收 / 非impl-safe原因 | evidence_expected | owner / 承接方式 | conclusion_if_missing |
| --- | --- | --- | --- |
| 默认fixed base helper与完整observe实际性能 | fresh ownimage/base一致、完整四Name六字段、两次真实采样含Python启动、最早age/5秒；server/mux身份原样 | root自行执行 | 原型inprocess速度不能代替产品，性能未验收 |
| 真实helper超时生命周期 | root-owned长阻塞helper，同realbase/parent timeout；实际单process创建、超时退出/无子残留，原server/SSH/mux不动；无生产故障参数 | root自行执行 | 不把venvlauncher或mock退出当采集退出 |
| naturalconnect/重复零启动、真实UUID分页与focus | 唯一direct ownedGUI/attach关联、same server/mux/client/pane/SSH，8秒连接后验和5秒focus pre/action/post | root自行执行 | GUI/focus主链仍缺证 |
| 受控post-launch观察失败与真实3秒回收 | 仅业务observer注入；真实default采集/native句柄cleanup不mock；owned退出及server/SSH/panes/mux不动，然后自然成功GUI留用户 | root独立Workbench对象自行执行 | cleanup未证则unverified+latch，不称自然平台失败 |
| 原全Python临时HTTP、fixture UI/aging/late/locks/图形reader、final diff和fresh review | 本批全final manifest/patch、全部输出/exit及formal Review(Impl) | root＋fresh reviewer | 此local报告不替代整套与业务验收 |

## contract_drift_reports、风险与回滚

root的CloseHandle外层except发现属于同“关闭失败必须unknown、保留本次主错误”合同的局部实施纠正，不扩大方案。Python3.12 ntpath.isabs会接受单斜杠root-relative形式，因此再要求splitdrive非空，确保“完整绝对Windows image”而非当前盘符推断；不是新配置或fallback。其余无contract drift；17新测试只落独占文件，旧测试语义未改。

未完成：root所有真实helper/业务验收待承接。仅64-bit Windows支持，Nt0/60内部ABI加载/权限/结构不符全unknown；单syscall不能中途抢占，父默认helper实际超时退出需证据，OS启动/终止开销无所有机器毫秒保证。墙钟变动/快照后出生保守拒绝，不提高年龄或忽略相关行。cleanup latch与网关重载丢索引边界完全保留，不能重启绕过遗留。

回滚标记：可直接回滚本delta源码，由root核before/hash后只撤native模块/tests与workbench采样改动；回到保守旧unknown，不恢复他人UI、D文件或终止工作台。旧r1/plan/history/report全部保留。

建议英文提交信息：`fix: keep workbench process observations within the existing timeout`。

无新增跨功能事实。
