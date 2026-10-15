# WezTerm 会话联动：进程采集运行时窄修订 r3.1

日期：2026-10-04；路径：规划路径；任务分型：T3。本文是 `lwplan.md` r2 的限定补丁权威，仅覆盖 S1 的私有进程采集实现和 S4 对应验证；其余已实施支撑文本继续由冻结 r2 承载，不重写、不删除。旧r3作者Gate-1 PASS仅为历史；本r3.1作者 Gate-1 PASS（§6本次重新实际自证）、Gate-2 PENDING，不能凭作者自检开始实施。root 独立 Gate-1 核验、fresh Review(LW) Gate-2 和 root 放行后，已有“自动实施＋继续”授权持续有效，无须再次询问用户。

## 1. 本轮修订说明与冻结输入

[修订: PLAN_DEFECT-R3.1] 实际症状：当前 WQL/CIM 单次 2187–2250ms，完整观察 5016ms、age5015ms，返回 unknown/workbench_timeout，两动作 false。3 秒回收中的多次 CIM 也无可用余量。这是运行时性能失败，不能以延长预算、删除前后采样、改年龄、跳过坏字段或改成功口径收口。

[修订: PLAN_DEFECT-R3.1.1] Gate-2前 root 实读发现 venv `sys.executable` 是 redirector launcher，会另生 base Python；仅终止launcher不能证明真实采集退出。因此不采用旧r3的sys.executable启动分支。旧r3完整字节已另存 `lwplan_runtime_delta_r3_history_a24a4a6b.md`，SHA `A24A4A6B23EB66993716B2C91DBCD69D6E80A2EA1E0CB31841BE33002D144F67`；旧r2未改。本校正只改解释器选择/对应测试与风险，不变5/8/3、归属或动作权限，不增加用户问题。

| 输入 | 冻结 SHA-256 / 角色 |
| --- | --- |
| clarifications.md（含 §11） | CBABB6F7527B7DFBBA37DEEB086841AACBDD164AE857FE5D81D1EED7535A9830；G/N 权威不变 |
| lwplan.md r2 | 405FDE8E546B5D516D507802832A64D23AC8854AA5D11A2EC64EC33766E7C9E0；完整历史字节原址保留 |
| review_notes_lwplan_1.md | C4B14141B3C4836FED73DB5ED2CF76094D4AC8B9447D0EED673A8DEDA27A9749；仅旧 r2 的 Gate-2，不放行本修订 |
| work/process-census-native-research-r1.md | 8EE96DEABC337ED4CEE0626CA45F8BE89FA8B1D954B76B0957A81915B6498E8C；正式只读调研 |
| work/process-census-native-prototype.py | 300050D56B16F6166BB7175E91CAE3A8C8FF47EDCA7F5F15E8CADAB707330AE2；131 行原型，不直接当产品 |
| impl_report_r1.md / core-manifest-r1.json | 当前已实施锚点及失败记录；Workbench 420 行，非“尚未新增”的旧 before 状态 |
| work/wezterm-session-link-root-native-probe-r1.json | root 独立真实采集与原生 owned 原语证据；不是新 GUI/focus/cleanup 全链验收 |
| work/wezterm-session-link-root-interpreter-identity-r1.json | 4926097D7EBD8022C0C04767B9C4063B500383918EFA97CF3122FD9DBECFD775；root实际63c3b2/exit0：venvlauncher与base/当前realimage区别 |

旧两 research、三 readiness、before27 清单及各次 Gate red/green 均按 r2 的冻结引用保留。作者本轮只写本文；对现有 27 路径＋新增 workbench/test_workbench 共 29 文件先取当前字节快照，Gate-1 再核当前字节，见下述唯一并行授权例外；不把当前产品误断言为原始 before。native 产品模块和新测试此时均不存在。

root 明确确认独立 robot-motion 作者的单行 atan2 reset 最短路径修复：`web/robot3d.js` 从本轮快照 `7D9E458676C9B10B15FC177FB32C058C9CAF68097B3DCE832F44D2D250BDCE5C` 到冻结 `DF4EC428FF0898B770E8A73711B92E37C567A1864EA2764D0BC19DCCF44BBD33`。这是唯一已授权并行产品变化；本作者未写/未恢复。Gate 对该路径核精确 final hash，其余28路径严格 unchanged，不做任意放宽；不以 root 的图形fixture结论充当 native验收。

## 2. 核心链路总览与事实映射

[修订: PLAN_DEFECT-R3.1.2] 现状主链是 Workbench.observe → `_rows(deadline)` → 默认 `_processes(deadline)` → powershell/WQL 六字段 JSON；同一次 observe 保留两次普查，connect/focus/cleanup 共用这个 provider。改动只把私有采样子进程换成与当前实际进程image一致的 base Python 固定原生 helper，仍由父 `subprocess.run(timeout=remaining)` 可抢占。helper 一次全系统 Toolhelp 快照，四种 Name 完整读取六字段，成功一次 JSON 后退出；没有轮询服务或监管器。`_rows` 的现有 Windows argv/时间规范化、分类、前后身份、权限、公开状态和原句柄回收保持。

不改层：terminal/gateway 的接口和锁、service/source/reader/MCP、UI/3D/脑图/CSP、D: 配置、旧机器人/父 Q6 状态全部沿用 r2。分层理由是采样延迟是当前唯一已证缺口；不把新进程采集器变成 session 管理器。

| research / 实测事实 | 实现锚点 | 验证锚点与口径 |
| --- | --- | --- |
| WQL 5016ms 超 5s；pwsh、WMI/COM 仍慢 | S1Δ 删除 CENSUS 默认分支，固定 Python helper | S4Δ root 实际 helper 全观察，失败原 JSON 保留 |
| 原生 10 次 27.531–33.169ms；inprocess 完整观察 453.765–700.934ms | S1Δ Toolhelp/只读句柄；不以研究值承诺产品速度 | root 测包含 Python 启动的默认 provider；500ms 非门槛 |
| 六字段现有规范化相等，原始 UTC 第七位不同 | S1Δ 原生 UTC 七位输出，`created_ticks` 不改 | S4Δ 微秒规范化相等与真实 handle 精确区间原测试同时保留 |
| Nt class 60 来自 phnt/System Informer；MS 未给稳定 class60 枚举合同 | S1Δ 64-bit/runtime 动态加载，未知即拒绝 | unsupported/access denied/缺 DLL/坏结构 mock；当前 Win11 26200 实测不是跨平台保证 |
| 单个 native syscall 不可中途抢占 | S1Δ 固定有限 subprocess helper，父剩余 timeout | S4Δ parent TimeoutExpired/无剩余不启动/只回收该次 helper；不引入线程 watchdog |
| 本机venv launcher→base child；base与GetModuleFileNameW(NULL)当前image一致 | S1Δ `_native_interpreter`校验sys._base_executable并直接base启动 | S4Δ缺/坏/不符拒绝＋root实际长阻塞helper超时核单一process与无子残留 |
| PID 快照与查询之间可能复用，活进程 exit FILETIME 不可当存活判据 | S1Δ 同句柄前后零等待、PID/parent/path/time/birth guard | S4Δ 退出、复用、晚出生、未知相关行不能跳过变零 |
| list-clients 仅交互含 web、不含 watcher，无 PID/type | `_rows` 后主链不改 | `unique_observed`/watcher null/gui_visibility unverified；无精确握手新保证 |

采用 [Microsoft Toolhelp 的进程快照](https://learn.microsoft.com/en-us/windows/win32/api/tlhelp32/nf-tlhelp32-createtoolhelp32snapshot)、[Process32NextW 结束判据](https://learn.microsoft.com/en-us/windows/win32/api/tlhelp32/nf-tlhelp32-process32nextw) 和 Kernel32 只读查询；不采用新 psutil 依赖、残缺 System.Diagnostics 字段或慢 CIM fallback。命令行采用固定 [phnt class60 定义](https://github.com/winsiderss/phnt/blob/53fbbdc5b5d2b08761db1c7b26bfa8c820924356/ntpsapi.h) 与 [System Informer PhGetProcessCommandLine](https://github.com/winsiderss/systeminformer/blob/b6c43624fc62b52e8012003a4183d097de1d41ac/phlib/nativeprocess.c) 的现代查询路线；不采用其旧 Windows PEB/VM_READ fallback。MS 明确 NtQueryInformationProcess 可变或缺失，需动态加载；class0 parent 可读也属于内部 ABI，不能包装为稳定 Win32 承诺。[Microsoft NtQueryInformationProcess](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntqueryinformationprocess)

## 3. S1Δ：固定有限原生采样 helper

#### 本轮修订说明

[修订: PLAN_DEFECT-R3.1.3] 目标：在原预算内取得完整相关进程身份。消费 G1/G2/G3；N1/N2/N3 全部保留。新增 `session_panel/native_processes.py`（约 120–170 行含 ABI/main），仅微改 `session_panel/workbench.py::_processes`、新增约15行 `_native_interpreter`、在既有kernel32声明加GetModuleFileNameW、删除 CENSUS、增加 sys import；不重构现有 kernel32/process_times、不产生循环 import 或通用 launcher/provider 框架。首次 review 落点是 `_native_interpreter/_processes` 固定 argv 与 native `census/query_row`，清理函数不改。

模块输入只有私有 `census(deadline)` 的 monotonic 绝对 deadline；main 不接受外部参数、stdin、路径、Name 或 query 配置，固定内部 5 秒。固定 Name 为 `zellij.exe/wezterm.exe/wezterm-gui.exe/wezterm-mux-server.exe`，先全枚举再按 Name 读取，不能先按已认可 EXE 过滤。输出成功为六字段 dict 的完整 list：ProcessId/ParentProcessId/Name/ExecutablePath/CommandLine/CreatedUtc；所有相关行成功才可输出，合法没有相关 Name 才是 []。单一相关行失败使整个 census unknown，不能跳过。

父 `_processes` 目标形态如下；后续 `_rows` 完整校验与 deadline 检查保持。repo cwd 由代码位置固定，防 gateway 从其它 cwd 启动时无法导入；不是 UI 配置。解释器先取 `getattr(sys,"_base_executable",None)`，必须绝对路径且与当前Windows真实image规范化完全相等，不fallback到venv/PATH/其它Python。helper与package初始化依赖仅stdlib（已定界读取__init__/service/source）；无需venv第三方包。

[Microsoft GetModuleFileNameW](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-getmodulefilenamew) 指定NULL取得当前可执行image；返回0为失败、返回等于capacity为截断。GetModuleFileNameW原型是(HMODULE,LPWSTR,DWORD)→DWORD，在已有kernel32声明中增加一条。每次调用前取得新鲜ownimage；只读取本进程，不创建或操纵其它进程。

```python
def _native_interpreter():
    base = getattr(sys, "_base_executable", None)
    if not isinstance(base, str) or not ntpath.isabs(base):
        raise ValueError("unknown native interpreter")
    image = ctypes.create_unicode_buffer(32768)
    length = kernel32().GetModuleFileNameW(None, image, len(image))
    if (not 0 < length < len(image) or len(image.value) != length
            or not ntpath.isabs(image.value)
            or normalized(base) != normalized(image.value)):
        raise ValueError("unknown native interpreter")
    return base

def _processes(self, deadline):
    result = self.runner(
        [_native_interpreter(), "-X", "utf8", "-B", "-m", "session_panel.native_processes"],
        cwd=str(Path(__file__).resolve().parent.parent), shell=False,
        capture_output=True, text=True, encoding="utf-8", errors="strict",
        timeout=self.remaining(deadline),
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if result.returncode:
        raise ValueError("process census failed")
    return json.loads(result.stdout)
```

顺序与结构判据必须直接实现：

1. 先检查 Windows / `sizeof(c_void_p)==8`；运行时动态获取 Kernel32/Ntdll 函数并声明 exact argtypes/restype，加载失败 unknown。PROCESSENTRY32W 含 pointer-sized heap、WCHAR[260]，dwSize 正确；PROCESS_BASIC_INFORMATION 的 LONG/pointer/size_t 布局与 UNICODE_STRING 的 USHORT/pointer 自然对齐。不解引用其 PEB 字段。
2. 在 CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS=2,0) 调用前记 `time.time_ns()` → FILETIME 上界；INVALID_HANDLE_VALUE 拒绝。First/Next 仅 ERROR_NO_MORE_FILES=18 是完整正常结束；其它错误拒绝，无无限 retry。枚举每步与行读取前后检查 monotonic deadline。
3. 每个相关 entry 用 OpenProcess(0x101000=QUERY_LIMITED_INFORMATION|SYNCHRONIZE, inherit=False)，同一原句柄读取。前后 WaitForSingleObject(handle,0) 必须 WAIT_TIMEOUT=258；WAIT_OBJECT_0/WAIT_FAILED/其它值拒绝。GetProcessId 与快照 PID、class0 的 PID/parent 与快照 PID/parent 必须相等，class0 返回长度等于本机结构大小。句柄不跟随 PID 重用；完整 row 仍须拒绝创建时间晚于快照开始的 birth guard。
4. QueryFullProcessImageNameW(flags0) 使用固定 32768 WCHAR buffer，成功返回字符长度必须非零且小于容量；basename 与快照 Name casefold 相等。GetProcessTimes 取非零创建 FILETIME，形成 UTC 七位小数。Name/PID/parent/EXE/command/time 全完整；原 parent 即便已退出仍保留数值，不推断所有者。
5. Nt class60 先 None/0 sizing，仅 STATUS_INFO_LENGTH_MISMATCH=0xC0000004 接受，`sizeof(UNICODE_STRING) < required <= 131072`；只再查询一次，不无限增容。第二次 NT_SUCCESS 且 ReturnLength 在 header 到 allocated 范围内。UNICODE_STRING 的 Length 非零偶数、MaximumLength 偶数、Length<=MaximumLength；Buffer 非零、2-byte aligned，指针在本进程本次 buffer 的 header 之后，Buffer+MaximumLength 与 Buffer+Length 均不得越过有效返回/分配边界。仅 `ctypes.string_at(local_pointer, Length)` 严格 UTF-16LE 解码；内嵌 NUL 拒绝。无 ReadProcessMemory、远端 PEB 读取或 VM_READ。
6. 查询/退出/ABI/权限/时间不稳任一失败拒绝整次。snapshot 和每个 OpenProcess handle 都由 finally CloseHandle 一次，关闭失败也拒绝；若已有失败，保留主错误并记录 close_failed，不能关闭异常冒充成功。捕获的错误只写有限结构化 stderr，不输出部分 rows；无访问拒绝后增权/SeDebugPrivilege/其它 provider fallback。

最小 helper 闭环：

```python
def census(deadline):
    # Enumerate every process; query all four relevant names or reject the census.
    # One local snapshot and one read-only handle per relevant row, closed in finally.
    # query_row returns the six fields only after identity/buffer/liveness checks.
    return rows

if __name__ == "__main__":
    # Reject external argv; emit one complete JSON list after successful census.
    # On failure: no stdout rows, one bounded structured stderr record, exit 1.
    # Parent timeout terminates only this invocation's own Python helper.
    ...
```

main 成功 stdout `json.dumps(rows, ensure_ascii=True)` 一次、exit0；失败 stdout 空，stderr 一个 JSON，例如 `{"error":"process_census_unknown","kind":"invalid_buffer"}`，exit1。kind 固定于 unsupported/api_failed/invalid_identity/invalid_buffer/deadline/close_failed；可带 errno/NTSTATUS 数值，不能带完整命令行、路径或 traceback。无需新异常层级或日志框架。父非零/坏 JSON/UTF8/缺字段仍走既有 unknown；父 TimeoutExpired 仍为 workbench_timeout。所有未知 counts 为 null，can_connect/can_focus false，cleanup 内未知仍 latch，两动作无解除端点。

[修订: PLAN_DEFECT-R3.1.4] 父timeout只终止本次直接启动的real base Python只读helper，不经过venv redirector；模块无子进程代码。缺 `_base_executable`、非绝对、ownimage读取失败/截断/长度不符/不匹配均父unknown，零runner，不fallback。root真实超时退出/child清单未验前不能宣称无残留；不tree kill或为测试添加生产参数/endpoint。

保持完整语义：父 timeout 始终本次共享 `remaining(deadline)`，不因 helper 内部 5 秒重新开预算。观察 5 秒 / launch 后验 8 秒 / cleanup 3 秒，年龄从最早采样开始；focus pre/action/post 同一 5 秒与原 UUID 30 秒链不变。`Workbench.action_lock` 仍只覆盖公开 status/connect/focus；原 Terminal.list_panes 不拿该锁，内部观察和回收不重复 acquire。provider 测试注入保持；生产默认每次都运行固定 helper。

NEW_GUI 仅固定无名 attach；LEGACY_GUI 只读观察；fixed unmanaged mux 单 argv/完整身份前后稳定、未知不计零，无采用/连接/回收。server/GUI/attach/mux/client_ids 的现有 full identity 比较、strict argv、CLIENT_ID 非 PID、unique_observed 和 GUI visibility 未核验全不变。原 GUI Popen 句柄与 exact owned direct child 的 TerminateProcess/创建退出区间核验不改，不杀 server/SSH/conhost/一般树，不 taskkill/T。父 subprocess timeout 所回收仅自己本次只读 helper，该 helper 不产生子进程。

执行：先 native ABI/census/main，再替换 `_processes`；完成 S4Δ 自证后向 root 移交真实默认 helper 性能与生命周期。验收：完整字段/异常拒绝/句柄闭合/固定 argv/cwd/剩余 timeout 都有证据，原 profiles/state/API 回归不变；产品包含启动耗时的 5/8/3 是否可用由 root 实测，缺证不能称修复性能。回滚：只撤本 delta 新模块/tests 和 `_processes` 替换，回到冻结 r1 的保守 unknown；不恢复他人 UI、不杀工作台、不以回滚绕过 cleanup latch。依赖：正式 research 与本修订双 Gate；无新 Python 包。

作者体验：一模块、少量直线函数与 fixed ABI，main 与父约十行调用可顺读；与现有 Windows 句柄代码相似的声明允许重复，避免为复用引入跨模块重构。若实现明显超过约 300 产品差异行，或本窄迭代总差异逼近 1000，先回 root 收敛范围，不能删安全出口凑数。

| 验证层 | evidence / owner / conclusion_if_missing |
| --- | --- |
| impl-safe | 新 boundary unit tests＋原35后端 mock＋语法的完整 stdout/stderr/exit 和 diff/manifest；impl 作者；缺则 S1Δ 未验证，不能报实现 PASS |
| coordinator | root 独立默认 helper真实普查/超时回收自己的 helper/完整观察计时报告；root；缺则只有 mock 与 inprocess 研究，不能称产品性能达标 |
| 非 impl-safe | 原 server/mux 不变的真实 GUI/UUID/focus/受控观察失败 owned cleanup；root；作者禁止 GUI/HTTP/SSH，缺则运行时主链仍未验收 |

## 4. S4Δ：边界测试与 root 验收交接

#### 本轮修订说明

[修订: PLAN_DEFECT-R3.4] 目标：拒绝路径不变且延迟实际收口。消费 G1/G2/G3、N1/N2/N3。新增 `tests/test_native_processes.py`，首落点 native ABI/census/local command buffer；可在该文件添加默认 `_processes` runner contract tests，不改老测试的既有验收语义。复用现有 provider 注入和 unittest.mock，不为 fake API 新造生产架构。

输入是本进程 ctypes 结构/本地分配 buffer 与 fake dll；输出是完整 rows 或有限错误及零动作。步骤：先 mock 负例，再原 Workbench/focus/gateway direct-handler 回归，AST 语法，最后 root 全链。关键分组：

- 四个 Name 被完整读取、未知路径仍在 rows 供现有 `_classify` 拒绝；非相关 Name 不查询；合法无相关 Name 与枚举失败区分。
- snapshot失败/First-Next非18/缺函数/32-bit/权限失败/class0长度或PID/parent不符/path name不符/进程前后退出/快照后出生/creation零全部unknown，已打开 handle finally 闭合；CloseHandle 失败不能返回成功 rows。
- class60 不支持/不符 sizing status/size零或过限/返回长度超限/奇数长度/MaximumLength越限/空或错位或越界指针/UTF16坏字节/嵌入NUL：拒绝且无部分输出。使用本地 buffer 证明不能解引用范围外地址。
- [修订: PLAN_DEFECT-R3.1.5] main 额外 argv 拒绝，stderr有限/exit1；成功六字段 JSON/exit0。父 fixed `_native_interpreter()` 得到已核base/-Xutf8/-B/-m/cwd/shellFalse/CREATE_NO_WINDOW 及共享剩余timeout。缺/None/空/relative `_base_executable`、ownimage API失败/截断/length不符/relative/mismatch均unknown且zero runner；Windows规范化大小写/分隔符等价正例只接受完整同一绝对image。deadline耗尽 zero runner calls，TimeoutExpired/非零/坏JSON最终 counts null、两动作false，无venv/PATH fallback。
- 前后采样仍两次；保持当前微秒 created_ticks 规范化，不将 `.1304547Z` 与 CIM `.1304540Z` 误称100ns相等；原 owned handle exact creation/exit interval 测试保留，不因为换采集器放松权限。

impl 命令：`.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_native_processes tests.test_workbench tests.test_focus tests.test_gateway.GatewayDispatchTests -v`；完整 bytes collector 与真实 exit，无 pipe 截尾。Gate 自证不执行真实目标进程操作；tests.test_gateway.GatewayTests 的真实临时 HTTP仍由 root。

| 验收 / evidence_expected | owner | conclusion_if_missing |
| --- | --- | --- |
| 新单测＋保留原后端35项/语法/三文件 diff 与 manifest，stdout/stderr/exit | impl 作者 | 仅局部未验证，不给整套 PASS |
| 默认固定 helper 连续采样的六字段、两次完整 observe含启动开销/age/5s实际计时；CLI/server/mux原身份 | root | 不拿 inprocess 原型时间冒充产品性能，不能称修复已验收 |
| [修订: PLAN_DEFECT-R3.1.6] 实际默认base helper采样与短remaining；root-owned受控长阻塞helper用同一已核realbase/parent timeout primitive，CIM核仅一个actualprocess、创建身份、超时退出且无子残留，server/SSH/mux未动；原生只读handle closed | root | 不拿venvlauncher退出当base退出；无真实生命周期证据只mock fail closed；受控阻塞不称自然平台故障，不给生产参数/接口 |
| natural connect后验8s、already-connected零新GUI；合法directchild/profile；真实UUID分页与focus pre/action/post 5s；原server/SSH/panes/mux不变 | root | GUI/focus/交互唯一关联仍缺证，不能关闭功能 |
| root 独立Workbench对象：仅 post-launch业务观察注入 unknown，真实新 ownedGUI/client＋3s回收＋原handle/真实普查核退出；随后自然成功GUI留用户 | root | 不称自然平台故障；不 mock cleanup采集/句柄；失败为cleanup_unverified且两动作锁住 |
| 全Python临时HTTP与UIfixture/late/unknown/aging/锁/原reader图形回归，fresh Review(Impl)与最终hash | root＋fresh reviewer | 原整批仍未验收，不因为 provider 优化给完整交付 PASS |

回滚仅本 delta 产品/测试；不覆盖 r1 red 证据或回退用户原工作。依赖 S1Δ 与 root 外部验证承接，作者体验保护为独立小边界测试文件、按失败行为分组，避免给每个 ctypes 赋值写镜像测试。

## 5. 风险、兼容、事件与门禁

[修订: PLAN_DEFECT-R3.5] 接口矩阵：native helper → `_processes` 是原有六字段JSON私有边界；`_rows` → `_classify/observe/connect/cleanup`、Workbench → Terminal/gateway/UI 的 state/API/字段/锁全部不变。无需持久数据迁移、UI开关、用户配置或新部署依赖；同一代码迭代原生模块与调用同时落地。受控网关重载由 root 维护，重载丢内存index/last_evidence和latch不能当自动恢复或未验遗留清理。没有 kill switch 新权限。

仅当前 Win11 build26200 / Python3.12.10 AMD64 的读采集实测成立；模块只支持64-bit Windows，class0/60动态ABI、查询权限、保护进程或签名/结构变化失败全unknown，禁止fallback。helper进程隔离使单次native阻塞可由父超时结束；Windows进程创建/OS调度自身也无跨机器严格毫秒上界，父终止等待开销不伪装成“所有平台硬墙钟5秒”。晚返回经现有remaining/age拒绝，root必须验证本机默认helper与3s回收，不把研究低延迟视为保证。

[修订: PLAN_DEFECT-R3.1.7] 本机root样本：sys.executable是`E:/project-funny/mianban-develop/.venv/Scripts/python.exe`，`sys._base_executable`与GetModuleFileNameW实际ownimage同为`C:/Users/ZXL/AppData/Local/Programs/Python/Python312/python.exe`。该路径是当次运行事实，不新增硬编码部署配置；每次以ownimage验证所得base。缺/路径格式别名不匹配保守unknown，不装包、不扩大进程树回收。Python启动计时必须基于实际base helper，不借inprocess prototype时间承诺产品性能。r3基于venv可抢占的假设在Gate2前被反证，旧r3不得放行。

快照不原子，wall clock调节或快照后出生可能保守拒绝；两次 fresh＋full identity 不证明排除短暂进程/隐藏watcher或原子server pin。只读采集不新增终止能力，原owned失败回收仍使用请求原句柄。若字段/预算/native签名实际不符，停留unknown且回 root `【DELEGATE_ACTION】` 取证；必须换用户目标/权限/回滚选择等关键不唯一边界时 `【DELEGATE_QUESTION】`，不静默扩大 profile 或预算。

事件对齐位置：本文修订说明、impl_report后续r次、root evidence及README阶段记录；新风险/新假设/阶段切换即时对齐，无固定次数。P0权限/回收安全、P1运行时预算/接口、P2展示偏好，同阶段阻塞点批量；无问题数量上下限。模板：`【DELEGATE_QUESTION】priority=...; 原因/已取事实=...; 影响G/N/阶段=...; 选项(推荐)/代价=...; 待用户唯一边界=...`。本轮无新用户问题：更换私有 collector、不改已授权连接目标；root已明确固定helper/cwd技术取舍。默认技能 STOP_BEFORE_IMPL 与持续用户授权差异沿用旧记录，保留技术Gate，不修改技能。

Required Set 为存在性硬门禁，任一缺失失败，不以任务数或测试数替代：

| T1十三项 / T2/T3补充 | 本文与冻结r2锚点 |
| --- | --- |
| T1.1 目标/反目标/不影响项 | §2、S1Δ/S4Δ G1–G3/N1–N3，r2§1 |
| T1.2 文件和首落点 | S1Δ `_processes/census/query_row/main`；S4Δ新tests |
| T1.3 任务/步骤/验收/回滚/依赖/锚点/形态 | S1Δ/S4Δ完整闭环 |
| T1.4 每包G/N | S1Δ/S4Δ首段 |
| T1.5 分层验证和三元组 | S1Δ表＋S4Δ六条交接 |
| T1.6 作者体验 | 每包末段；少量ABI重复而不跨模块重构 |
| T1.7 主链总览 | §2：现状/落点/不改层/原因 |
| T1.8 research事实映射 | §2七行，含U2/内部ABI/精度 |
| T1.9 片段闭环 | §3父固定runner＋native顺序判据＋main＋§4错误出口 |
| T1.10 Gate1四必填与复杂项 | 下表十字段及本轮实际自证 |
| T1.11 双Gate | 本节Gate1作者→root核→freshGate2→root放行，失败只修本文回Gate1 |
| T1.12 澄清触发/模板/批量 | 本节P0/P1/P2与DELEGATE模板 |
| T1.13 风险/降级/Gate2复核 | 本节与十字段；缺证unknown，不自动解latch |
| T2 输入输出/边界/测试层 | §3六字段/结构/有限error与§4；原provider签名不变 |
| T3 接口/状态/兼容迁移/停机 | 本节私有矩阵/no持久迁移/重载风险，r2状态/API不改 |

供 fresh reviewer 填写的十个必填复核字段如下。作者只给 Gate-1 输入存在性/语义自检，不能代填 Gate-2 PASS；reviewer必须独立核当前hash、结构、判据与实际源码，检查核心链路顺读/research映射/跨包无脑补。

| Gate-2 必填字段 | 当前 / 复核对象 |
| --- | --- |
| Required Set复核结果 | PENDING；T3全项存在性 |
| 目标锁/反目标复核结果 | PENDING；G/N每包下沉，无API/预算/权限变化 |
| 关键实现锚点复核结果 | PENDING；父固定helper、query_row/main/closing/test |
| 代码片段充分性复核结果 | PENDING；父→local采集→完整JSON/拒绝→原_rows闭环 |
| 作者体验门复核结果 | PENDING；单模块/不新框架/不因复用重构 |
| 人工review对齐复核结果 | PENDING；主链顺读/事实映射/跨包接口不脑补 |
| P1-P9协议合规核验表 | PENDING；下表逐条 |
| 基线与澄清一致性复核结果 | PENDING；当前CBABB与r2完整历史，持续授权 |
| 设计味道扫描结果 | PENDING；无daemon/watchdog/PEB/通用采集框架 |
| Gate-2 | PENDING；只有fresh reviewer＋root当前核验可放行 |

| 协议 | 本轮落实 |
| --- | --- |
| P1 | 不以任务数量作门槛，体量只为范围审查 |
| P2 | Required任一缺失不放行 |
| P3 | Gate存在性硬门禁，red保留 |
| P4 | T3消费T1十三项及T2/T3追加 |
| P5 | 关键目标/权限不唯一才DELEGATE_QUESTION；技术事实DELEGATE_ACTION |
| P6 | 新风险/假设/阶段事件留痕并对齐 |
| P7 | 无澄清数量上下限 |
| P8 | 优先级/批量/推荐选项/代价/阶段模板 |
| P9 | 作者Gate1→root独立核→freshGate2→root放行，禁止作者自己放行impl |

Gate-1 r3.1作者本次自证PASS：目标锁/反目标映射完成；验证责任分层已落盘；证据产物/责任归属/证据不足约束已落盘；作者体验门证据已提供；核心链路总览/research映射/片段闭环保持。新增解释器判据与历史完整字节/新事实当前hash已实际自证，作者语义检查没有扩大G/N或动作权限。产品测试、真实helper与业务验收全部待实施/root；fresh Gate-2仍独立复核，不能消费旧r2或旧r3 PASS。

## 6. 失败保留与本轮作者验证

[修订: PLAN_DEFECT-R3.6] 根症状证据 `work/wezterm-session-link-root-wql-benchmark-r1.json` 完整已读：CIM三次2250/2187/2203ms、CLI采样各exit0；整次观察5016ms为运行时失败。pwsh另测3671/2375/2329ms；WMI/COM r5 flags0/16为2328/2750ms，均未解决延迟；其余root基准原件保留，本文没有宣称重新逐字读全部。不能用查询exit0省略业务timeout。

research原型10采样exit0只证明采集；等价harness **exit1**，自定 all_real_observations_under_500ms=false（五次有三次超500ms），保留原证据，不称该命令通过。规范化六字段相等/currentpublic资格是各自观察，500ms不是需求；产品默认helper性能尚未验收。root原生owned primitive被Terminate的无害子进程exit1为预设，父验证exit0，不混成业务自然失败。

原r1后端33项初检1failure后修正、原r2 Gate1/Reviewer字面断言失败、UTF8 collector child exit1/stderr丢失、历史宽读截断和readiness补证继续由r2/impl报告承载不删除。本作者本轮组合读workbench＋报告输出截断，随后独立补读workbench330–末尾、完整impl_report与tests缺段；不把截断集合称完整。Web parser查SystemInformer函数NOT_FOUND后，用固定commit raw源码本次定界读取取得完整函数；未把未找到当源码证据。

本轮仅文档Gate-1自证，最新完整输出/exit与冻结SHA由尾后工具交付。没有执行产品测试、helper、GUI、HTTP、SSH、focus、安装或Git；不把文档存在性自证称修复或产品可交付。

作者首检 `38efad`：82 checks / 2 failed / exit1，完整输出已读并保留。一项检查器要求“只覆盖 S1”，正文准确写“仅覆盖 S1”，修字面断言不改范围；另一项是真实并行 robot3d 字节变化，已由 root 明确归属并按上面 exact finalhash 修检查，不恢复/不忽略。其它冻结输入/原生未实施与28产品项未失败。

历史r3复检 `218167`：83 checks / 0 failed / exit0，完整逐项true输出已读；最终`42c988`仍83/0/exit0、SHA A24A4A6B23EB66993716B2C91DBCD69D6E80A2EA1E0CB31841BE33002D144F67。核五个冻结输入/旧r2完整字节、当前28产品 unchanged＋唯一robot exact hash、native未实施、Required/十字段/P1-P9/两包与既有采样契约，只是当时作者文档Gate-1；解释器新反证出现后不得放行。旧完整字节已另存历史，不抹掉该局限。

r3.1复制历史`6ac529` exit0核原SHA一致，root interpreter JSON完整读`33f652` exit0；首次apply_patch末段锚点按独立行匹配失败，整patch未落任何更改，随后按实际段落有界补丁，不当成功记录。本次当前Gate1完整输出与退出码由尾后工具交付；不继承旧83项成功冒充新解释器验证。

r3.1本次 `151942`：91 checks / 0 failed / exit0，完整输出全部逐项true已读；包含r3历史exactSHA、新root解释器factSHA、28当前产品unchanged＋robot exacthash、native未实施、13Required/10freshPending/P1-P9/两包/三元组/原契约及validatedbase/无venvfallback/真实timeout移交/官方ownimageAPI。只为作者文档Gate-1；final文本尾后再执行同一全量自证并交最终SHA，root独立核与freshGate2未执行，不放行实施。

建议英文提交信息：`fix: keep workbench process observations within the existing timeout`。

无新增跨功能事实。
