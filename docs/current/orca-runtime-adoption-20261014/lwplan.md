# P1-A 独立离线预检低层计划

日期：2026-10-14；角色：lwplan；受众：共享。类型 T2，另显式覆盖 T3 的接口、兼容与停机项。
当前阶段：低层计划及 Gate-1 自检；Gate-2 由独立 reviewer 判定。本轮终态为 **STOP_BEFORE_IMPL**，本文不是执行授权。

## 1. 范围与对齐

只新增一个 Python 3.12 标准库脚本与一个 unittest 文件，用来发现提供材料中的版本混用、Node 文件不匹配、关键入口缺失、宽监听候选及环境计划错误。检查器始终输出运行未验证，且报告明确检查了什么。其实际价值是给以后 P1-B 补证提供可重复的材料摘要和拒绝原因；静态结果不能代替运行准入。

权威输入是完整 [clarifications.md](clarifications.md) 最后 P1-G1–G3/P1-A1–A3，及 [architecture-final.md](architecture-final.md) 第 4–6 节。已完整读取 [research_p1_implementation.md](research_p1_implementation.md)、[research.md](research.md)、[research_stability.md](research_stability.md)、[review_notes_readiness_1.md](review_notes_readiness_1.md)、[review-b92c4e.md](review-b92c4e.md)。hlplan 为已读历史输入，不覆盖最终架构。Readiness PASS 只允许规划 P1-A。

| 目标锁 | 本计划落点 |
|---|---|
| P1-G1 固定材料有界读取/hash/版本、参数与合成环境 | S1 文件边界和固定小切片；S2 数据检查 |
| P1-G2 精确状态、上限、退出码、函数与测试 | 第 3 节输出合同及 S1–S3 |
| P1-G3 独立、零接线、分层验证 | 主链、全部工作包与第 6 节 |
| P1-A1 无执行/下载/监听/配对/命令导出/绕过开关 | S1 不执行材料；S2 不组装命令；S3 不产生启动状态 |
| P1-A2 无产品改动与通用框架 | 两个新增文件，无插件、manifest 引擎、Provider 或调度层 |
| P1-A3 hash 非信任/ABI/隔离/清理证据 | 独立 integrity/provenance/运行结论及固定未覆盖项 |

不影响 OwnedProcess、ExecutionService、CodexRun、旧 M3、管理 HTTP、数据库、前端、小院、账号、旧数据与旧验收记录。不新增依赖，不改依赖清单、服务入口或 CI。第一批仅覆盖 **win32-x64** 声明，不通过检测当前机器架构选择目标；arm64 和其他平台明确未覆盖。

## 2. 核心链路总览与事实映射

现状主链是工作台页面 → Python 管理/执行服务 → OwnedProcess → Codex JSONL。Orca 不在其中。本轮新链是操作者显式选择材料目录 → `scripts/orca_preflight.py::main` → 有界读取固定文件/计划 JSON → 纯数据检查 → stdout JSON 与进程退出码。新链与产品主链没有调用关系。唯一副作用是输出检查报告；测试只写自己的临时 fixture。

采用上游 `orcad-artifacts.ts` 的既有文件名、marker 和 Node 布局，以及 `node-runtime-pin.ts` 的 x64 pin；不执行 TS，不重建完整上游清单。采用 `orcad-command-arguments.ts` 已有四种参数的小子集；不复制完整 parser 或扩展启动协议。实际核对了上述公开副本，以及本地 `WindowsAPI.spawn`、`OwnedProcess.start/close`、`tests/test_owned_process.py::FakeAPI` 和 `tests/fixtures/fake_app_server.py::main`。旧 fixture 会写 marker/可 spawn 子进程，本轮不复用它。

| research 事实 | 实现锚点 | 验证锚点与口径 |
|---|---|---|
| Node 24.21.0，x64 有固定大小/hash | S1 `inspect_materials` 的固定 Node 记录 | `test_node_pin` 验实际字节摘要算法；真实 Node 实物由 coordinator 后续另核，不能由 mock 关闭 U1 |
| launcher、server、daemon 分立；Node slot 禁 `.build-target` | S1 固定 3 JS/2 marker/禁止 marker | `test_slot_slice` 验缺失/错 marker/空文件；仅存在性，不称完整安装 |
| `.version`、安装完成标识、package version、源码 SHA 不是同一个标识 | S1 package JSON 三字段；输出 `provenance=unverified` | `test_package_fields` 不把版本匹配升级为构建来源 |
| CLI serve 固定宽监听；直接 entry 支持显式 bind | S2 `check_candidate` | 重复 bind、缺值、额外 token、0.0.0.0、localhost 均拒绝；实际监听仍 U3 |
| ORCA_USER_DATA 不覆盖 home/temp；OwnedProcess 的 lpEnvironment=None | S2 合成环境 schema；无 OwnedProcess import | 检测 inherit、未知变量、路径越界；不得声称实际子进程环境生效，U5 开放 |
| daemon stop 只 disconnect，主进程退出不等于整套退出 | S3 固定 `runtime_checks` | 所有静态匹配也有 U4 unverified，输入不能覆盖 |
| Web 输出与 orcad artifacts 分离，正式 HTTP 路由未知 | S3 `not_covered` | Web/native/其余 bundle 明确未覆盖；不打开浏览器或猜 URL |
| Node SecretStore 无 Electron 加密，自动发现链未追完 | S3 固定 U2；S2 不读取账号或宿主环境 | fixture 证明无外部调用；隔离与凭证结论仍未验证 |

片段闭环：第 3 节给出唯一输入/输出骨架，S1 给出读取顺序，S2 给出候选检查顺序，S3 给出报告和退出码归并。顺读可看到“材料 → 静态事实 → 不授予运行结论”的完整链，无需 reviewer 自行拼接产品层。它们是目标伪代码，不是已写工具。

## 3. 输入、读取与报告合同

### 3.1 唯一 CLI 与材料布局

CLI 只有 `--materials <absolute-directory>`，另有标准 `--help`。不接收 env 文件路径、任意 artifact 列表、expected hash、URL、启动开关或输出文件参数。`--materials` 不允许缺省为 cwd/home；重复/未知 CLI 参数属于输入错误。未来测试在进程内调用 `main(argv, stdout, stderr)`，不 spawn Python。

材料目录由操作者另外准备，本脚本不创建、不取得、不解包、不执行它。固定读取列表如下；不存在逐项报告 missing，不自动寻找其他目录。

| 相对材料根的路径 | 限制/用途 | 匹配证明的内容 |
|---|---|---|
| `candidate.json` | 16 KiB，严格 UTF-8 JSON | 仅候选计划结构和字面规则 |
| `source/package.json` | 128 KiB，严格 JSON；name=`orca`、version=`1.4.214`、engines.node=`24` | 三字段静态匹配；记录 SHA256，不认证源码 commit |
| `slot/.server-target` | 128 bytes ASCII；仅末尾一个 LF 或 CRLF 可去除 | 内容严格 `win32-x64` |
| `slot/.runtime-node` | 128 bytes ASCII；同上换行规则 | 内容严格等于下述 Node hash，小写 |
| `slot/orcad.js` | 1 byte–64 MiB | 普通非空文件存在及观测 SHA256；integrity 未验证 |
| `slot/orcad-server.js` | 1 byte–64 MiB | 同上，不解析 JS |
| `slot/daemon-entry.js` | 1 byte–64 MiB | 同上，不表示已管理 daemon |
| `runtimes/node-ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32/node.exe` | 精确 93580104 bytes，上限 96 MiB；流式 SHA256 | 与固定上游 Node 声明匹配，不运行 `--version` |
| `slot/.build-target` | 只 lstat，禁止存在，包括链接/目录/空文件 | 缺省不存在为 matched，存在为 mismatch |

固定 Node SHA256：`ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32`，声明版本 `24.21.0`。来源为上游固定 SHA `aceebea0a4453f63d759af9134503220ce0b4753` 的 `src/shared/node-runtime-pin.ts::NODE_RUNTIME_ASSETS['win32-x64']`。大小/hash 直接内置在脚本窄常量中，注释标来源；不允许输入改 pin。package version 检查与 Node pin 检查相互独立，不能据此宣称 bundle 来源可验证。

不读取 `.version`、`.install-complete`、完整 native/PTY、CLI、ripgrep、watcher/SQLite/profile/scanner workers、licenses 或 Web。报告按这些组列 not_covered，包含 arm64/其他平台、源码 commit 认证、JS integrity、bundle 完整性、构建可复现性。检查器不构造上游全文件清单，后续扩大覆盖必须另审，不能把未覆盖改成可选通过。

### 3.2 文件边界

`validate_root` 仅接受本地绝对磁盘路径（Windows 如 `E:\\p1-materials`，非 Windows fixture 允许本地绝对路径）；拒绝 UNC、设备路径、drive-relative、NUL。root 及从磁盘根到它的已有祖先逐段 lstat，拒绝 symlink、Windows reparse point；不能 resolve 后忽略原始链接。root 必须是目录。只访问表列路径，逐段 lstat 并拒绝链接/reparse、非目录父项、非普通文件；拒绝多硬链接文件 `st_nlink != 1`。不递归枚举、不做 glob、不跟随任何材料中的路径。

单次最多读取上表 8 个文件；总字节预算 300 MiB，chunk 1 MiB。先以 lstat 尺寸拒绝超过单文件上限者，再打开 rb；fstat 必须与预检 dev/ino/size/mtime_ns 相同且 regular/nlink=1。每次最多读取 min(chunk, remaining+1)，多 1 字节用于发现增长；最终再 fstat，变化归 `changed_during_read`，不得输出匹配。所有流关闭；无重试。小 JSON/marker 才保留完整 bytes，大 JS/Node 只保留摘要。不可读是 error，不混写 missing；只有 FileNotFoundError 为 missing。超限/非普通文件/链接为 mismatch，不读取内容。

这是对操作者提供的静止本地材料的有界核查，不是对恶意并发替换文件系统的沙箱。TOCTOU 的完整抵抗未覆盖，不增加 Win32 文件系统框架。根路径违规/不可读直接生成输入级报告并终止其他读取；单个文件失败则继续固定列表以给出全部缺口。不得在异常输出原始文件内容、系统错误长文本或宿主路径。

### 3.3 candidate.json 的固定形状

```json
{
  "target": "win32-x64",
  "route": "direct-node-entry",
  "argv": ["--bind", "127.0.0.1", "--port", "0", "--json", "--no-pairing"],
  "environment": {
    "source": "synthetic",
    "inherit": false,
    "root": "C:\\orca-p1-fixture",
    "values": {
      "ORCA_USER_DATA": "C:\\orca-p1-fixture\\profile",
      "USERPROFILE": "C:\\orca-p1-fixture\\home",
      "HOME": "C:\\orca-p1-fixture\\home",
      "APPDATA": "C:\\orca-p1-fixture\\appdata",
      "LOCALAPPDATA": "C:\\orca-p1-fixture\\localappdata",
      "TEMP": "C:\\orca-p1-fixture\\tmp",
      "TMP": "C:\\orca-p1-fixture\\tmp"
    }
  }
}
```

这是本地检查器的窄输入数据，不是 Orca env 合同，也不是可运行环境；示例不拼接 exe/entry/工作目录，不输出启动命令。所有字段必填、不允许未知字段、重复 JSON key、NaN/Infinity、非对象顶层或 bool 充当数字。解析 RecursionError/UnicodeDecodeError/ValueError 转固定 input_invalid；整体有 16 KiB 上限。argv 最多 8 token、每 token 64 字符、均为字符串。environment 限上述 7 个大写 key，每值及 root 最大 240 字符；未知 key 即拒绝且不回显名称和值。错误只指字段路径或固定 key，不打印输入片段。

合成环境只允许 Windows 盘符绝对路径；以 PureWindowsPath 做词法核对，不向这些路径发起 exists、resolve、mkdir 或读取。拒绝 UNC/device、`.`/`..` 原始路径段、冒号附加流、尾空格/点、NUL、控制字符、`%`/`$` 展开符和 Windows 保留设备段；不做变量展开。统一斜线后以 casefold 比较路径段，不用字符串 startswith。root 不能是盘符根目录；所有值必须是 root 严格子路径。HOME=USERPROFILE，TEMP=TMP；profile/home/appdata/localappdata/tmp 五组彼此不能相等或互为祖先，均不得等于 root。没有 PATH、SystemRoot、token 或 Provider env 接口，且不判断此环境可启动 Node；这些属于 U2/U5。

`source=synthetic` 是输入声明，不认证来源。即使用户把真实路径填进来，本工具只作字符串核对且不回显、不访问。报告通过 not_covered 中 synthetic_origin 与固定 provenance=unverified 明示来源未验证；不能将这一声明解释为“没有秘密”。禁止读取 os.environ、expanduser、注册表、PATH、账号文件、WSL 或 private session。

### 3.4 输出与退出码

关闭 argparse 缺省错误回显；CLI 错误由 main 转固定 input_invalid 报告，不回显未知 token。stdout 恰一个 JSON object（UTF-8，末尾换行），最大 64 KiB；固定字段，固定顺序的 checks；无时间戳和绝对材料路径，方便 fixture 比较。每个检查最多一个 reason；reason 是固定枚举短码，不包含外部原文。unknown input 字段和异常消息不回显。不得生成可执行命令、env dump、HTML 或自动保存报告。

```json
{
  "schema_version": 1,
  "scope": "p1-a-offline-x64-slice",
  "reference": {"orca_commit": "aceebea0a4453f63d759af9134503220ce0b4753", "package_version": "1.4.214", "node_version": "24.21.0"},
  "static_result": "matched",
  "checks": [{"id": "slot.launcher", "status": "matched", "reason": "nonempty_file", "size": 12, "sha256": "<64 lowercase hex>", "integrity": "unverified"}],
  "not_covered": ["remaining_bundle_artifacts", "native_abi", "web_build_and_http", "other_targets", "js_integrity", "bundle_provenance", "concurrent_filesystem_adversary", "synthetic_origin"],
  "provenance": "unverified",
  "runtime_status": "unverified",
  "runtime_checks": [{"id": "P1-U1", "status": "unverified"}, {"id": "P1-U2", "status": "unverified"}, {"id": "P1-U3", "status": "unverified"}, {"id": "P1-U4", "status": "unverified"}, {"id": "P1-U5", "status": "unverified"}],
  "launch_admission": "blocked"
}
```

骨架 checks 只展示一项，不是实际报告的全部项。固定 id 顺序：`input`、`candidate.input`、`source.package`、`slot.target`、`slot.node_marker`、`slot.launcher`、`slot.server`、`slot.daemon`、`node.executable`、`slot.no_bun_marker`、`candidate.args`、`candidate.environment`。正常 input=matched；candidate.input 记录该文件缺失/读取/格式结果，且作为数据项不输出其 hash/原内容；候选格式错误在此项 status=error、reason=input_invalid；因输入级失败无法检查的其余项 status=`not_checked`、reason=`input_unavailable`。candidate 缺失/格式错误不阻止其他材料固定检查，但 args/environment 为 not_checked；对上游 package 缺失不能自动取消 Node 检查。

每项 status 取 `matched|missing|mismatch|error|not_checked`，文件项始终有 size/sha256/integrity（不可得则 null/unverified）；数据项不含原值。Node hash 真匹配 integrity=`pin_matched`；package/marker 是声明匹配而不是二进制认证，integrity=`unverified`。not_covered 与 runtime_checks 独立，不计入 static_result。matched 只表示该项明确的谓词成立。

退出码/归并顺序固定：输入格式/CLI/root 错误 **2**（static_result=`input_invalid`）；任何 I/O/内部异常 **3**（`error`）；任何 mismatch **1**（`mismatch`）；否则有 missing **4**（`missing`）；否则 **0**（`matched`）。结构合法但参数/环境规则不符是 mismatch=1；candidate JSON 无法解析或 schema 不符是 input_invalid=2；candidate 超限同为 input_invalid=2。source/package.json 内容无效属于材料 mismatch=1，不是调用输入错误。多种问题保留在 checks，优先级只决定汇总，不丢弃失败。`--help` 为 argparse 普通说明/0，显式标明不能启动；stdout 写失败时 stderr 仅 `report_write_failed`、退出 3，不能声称报告已产生。意外异常 stderr 固定 `internal_error`，不打印 traceback 或输入值；能形成报告时仍含固定运行阻断字段。

## 4. 详细设计与实施步骤

### S1 固定材料读取和指纹

**目标/反目标：**落实 P1-G1/G2/G3 与 A1/A2/A3。关键文件 `scripts/orca_preflight.py`，新增 `validate_root(root) -> Path`、`inspect_file(root, relative, max_bytes, capture=False) -> record`、`inspect_materials(root) -> list[record]`。不改或 import session_panel。review 首看 inspect_file 的先拒绝后读取和固定调用表；目标形态是几个普通函数和窄常量，不引入接口基类、依赖注入容器或独立 manifest。

步骤：先定义第 3 节固定常量和短异常类型；实现 root/文件边界；流式 hash；最后写固定材料检查调用。inspect_file 的 file record 含 status/reason/size/sha256 和内部 bytes（仅小文件，输出前丢弃）。包 JSON 仅检查三字段；其他内容不读取为业务数据、不执行。同一文件只读一次。路径错误固定 reason 为 path_rejected/not_regular/too_large/changed_during_read；内容失败为 content_mismatch/hash_mismatch/size_mismatch，缺失为 absent，权限/读取失败为 read_failed。

关键伪代码（目标 `inspect_file` 内，展示边界顺序）：

```python
# Fixed relative path comes from code, never JSON.
before = validate_components_and_lstat(root, relative)
reject_link_nonregular_or_oversize(before)
with open_fixed_file(root, relative) as stream:
    require_same_file(before, fstat(stream))
    size, digest, small_bytes = read_bounded(stream, max_bytes)
    require_unchanged(before, fstat(stream))
return observed_record(size, digest, small_bytes)
```

伪代码的辅助动作可内联到上述三个函数；无需逐个变成框架方法。须保持文件元数据比较、读取上限与关闭顺序。无自动 retry；修改中的材料要求操作者另行提供静止副本再运行。

**验收/证据/责任：**impl 用 S3 fixture 验存在、缺失、超限、变化和摘要，保存 unittest 完整输出至 `work/orca-p1-implementation/unit-tests.txt`；缺任一边界证据不能报本包通过。coordinator 独立读取代码和输出，核对 Node 常量与研究副本，记录 `work/orca-p1-implementation/coordinator-check.md`；真实 Windows reparse、权限和实际 Node 文件另作承接，未做时明确未验证。impl 不执行实际 Node、Win32 进程或下载验证。

**作者体验：**固定列表仅九个路径，注释解释来源和覆盖上限；不把上游全清单复制进 repo。报告不要求维护者为每个缺文件填理由。依赖：Readiness 和 Gate-2；S1 是 S2/S3 的读取基础。回滚：撤销本新增脚本对应改动，保留材料/证据；不删除任何用户目录或数据。失败降级为明确的 missing/mismatch/error，不切换默认 CLI 或系统 Node。

### S2 候选参数与合成环境的纯数据检查

**目标/反目标：**落实 P1-G1/G2，A1/A2/A3。同一脚本新增 `parse_candidate(raw: bytes) -> dict`、`check_candidate(candidate: dict) -> list[record]`，内部参数/env 可以短私有函数承载。关键锚点是严格结构 → 允许参数 → 路径关系的顺序，目标形态是纯输入输出函数；不引用 os.environ，不把字符串转成进程参数执行。

步骤：严格 JSON 解析（重复 key 拒绝）；第 3.3 节 schema；args 扫描并维护 seen 集；environment 词法验证。允许 --bind/--port 各一次、--json/--no-pairing 各一次，顺序可任意。bind 必须恰 `127.0.0.1`；port 仅 ASCII 十进制规范字符串 `0` 或不带前导零的 1–65535，不接受负号、空白、指数、布尔、65536。固定 route direct-node-entry 和 target win32-x64；任何缺 flag、重复 flag、额外 token、`--bind=...`、shell 字符串、help、pairing/recipe/grant flag、`orca serve` 路线都 mismatch。值 token 缺失不得吞掉下一个 flag 作正常值。

目标伪代码（`check_candidate`，展示判定，不输出命令）：

```python
args_result = check_exact_flag_subset(candidate["argv"])
env_result = check_synthetic_path_relationships(candidate["environment"])
return [args_result, env_result]  # Neither record contains argv/env values.
```

没有新的 runtime 协议：更严格的候选政策只用于发现明显不合规计划，不表示上游不支持其他参数。environment 的 `inherit=false` 必须是 JSON false，不接受字符串 false/0；禁止任何额外变量。`source=synthetic` 的局限在报告固定保留，不能由输入设置可信标记。

**验收/证据/责任：**impl 的 S3 参数/environment 表驱动用例和 sentinel 不回显测试写同一 unit-tests.txt；漏测重复参数、路径前缀绕过或秘密哨兵时本包不通过。coordinator 复核数据范围及文档措辞，记录 coordinator-check.md；将 Windows home/temp/Provider/WSL 实际行为留给 P1-B 的 U2/U5，不允许 impl 运行真实进程补证。此处所有 fixture 均为人工合成，不能声称无账号隔离已验收。

**作者体验：**一个可读 JSON 样例和固定字段，不让作者编写 manifest 或自填 expected hash；字段错误返回固定字段位置而非长 traceback。依赖 S1 小文件读取；回滚本包函数及相应 fixture，其他旧产品不受影响。失败只报告，不修写输入、不自动加变量、不 fallback 宽监听。

### S3 统一报告、fixture 回归与交接

#### 本轮修订说明

[修订: PLAN_DEFECT-R1.1] 对应 [review_notes_lwplan_1.md](review_notes_lwplan_1.md) 的 R1：原 `test_input_boundary` 将 CLI/root 早停和 candidate 局部失败合并，导致测试与 §3.4 冲突。本次仅拆分下列验收项，保持 §3.4 的独立材料检查与归并顺序。CLI/root 错误在读取材料前停止；合法 root 下 candidate 超限/格式/schema 错误继续其他固定材料检查，candidate.input 为 status=error、reason=input_invalid，args/environment 为 not_checked，退出 2。candidate 缺失为 status=missing、reason=absent，同样继续检查，但按所有检查的既定优先级归并退出码，不自动归为 2。无已实施代码或支撑内容需要删除；原工作包、验证责任及回滚边界保留。Gate-1 重检本文与修订测试口径，独立 Gate-2 复核新 hash 后才可作准入结论。

**目标/反目标：**落实 P1-G2/G3、A1/A2/A3；关键文件 `scripts/orca_preflight.py::build_report/check exit/main` 和 `tests/test_orca_preflight.py::OrcaPreflightTests`。目标形态是单一运行报告与测试模块；review 首看退出码优先级和 runtime 固定字段，不能只看 happy path。

顺序：组合 S1/S2 记录；按第 3.4 节构建报告；一次 JSON 输出；实现 `main(argv=None, stdout=None, stderr=None) -> int` 与 `if __name__ == '__main__': raise SystemExit(main())`；最后 fixture 覆盖。源码中 import 仅 Python 标准库；测试通过 importlib 从显式脚本路径加载，禁止触发 CLI。无需新增 package、测试 fixture 服务、README 框架或 schema 文件。脚本 docstring/help 简述用法/不授予启动及报告退出码，代码注释英文。

关键伪代码（目标 `main/build_report`，给出主链闭环）：

```python
root = validate_root(parse_cli(argv))
checks = inspect_materials(root)
checks += candidate_checks_or_not_checked(checks)
report = build_report(checks)  # runtime_status=unverified, launch_admission=blocked always
write_one_json(report, stdout)
return exit_code_for(checks)
```

输入级异常仍由 main 按第 3.4 节生成固定形状报告；不存在 `if all_pass: launch()` 分支，也不存在运行验收输入字段。没有材料时不是空检查自动通过。原始路径/JSON 内容不进入输出；固定 ids/reasons 与有限文件摘要使输出远小于 64 KiB，仍在写出前检查大小。

**impl-safe 测试矩阵**（全部临时文件/纯数据，unittest 在当前 Python 进程执行）：

| 测试锚点 | 输入与可判定结果 |
|---|---|
| `test_material_absence_and_summary` | 空目录逐项 missing；固定 U1–U5/unverified/blocked；退出 4 |
| `test_bounded_hash` | 已知 b'abc' SHA256；恰上限/超一字节；短 chunk；合成 fstat 变化；不吞 read error |
| `test_slot_slice` | 正确/错误/空 marker；缺 JS；零 JS；禁止 Bun marker 包括目录；presence matched 仍 integrity unverified |
| `test_node_pin` | 常量等于本文 pin；大小错与 hash 错分别报；用 mock digest/metadata 走 pin matched 分支并标注仅分支测试，不伪装真实 Node；摘要算法另用真小文件验证 |
| `test_package_fields` | 正确三字段、旧 version/engine/name、重复 key、无效 UTF-8/JSON、缺字段；hash 只观测 |
| `test_cli_root_boundary` | [修订: PLAN_DEFECT-R1.1] missing root、相对/UNC/device 路径、重复 CLI；退出 2；input 为 error/input_invalid，其他检查 not_checked/input_unavailable；未打开任何材料文件 |
| `test_candidate_invalid_continues_materials` | [修订: PLAN_DEFECT-R1.1] 合法 root 下 candidate 为 16 KiB+1、未知 JSON key、非对象、深嵌套/JSON/UTF-8 错误；candidate.input 为 error/input_invalid，args/environment 为 not_checked/input_unavailable；用可读 package/marker 证明继续读取并产出它们的真实结果，其他缺口同样保留；汇总退出 2 |
| `test_candidate_missing_continues_materials` | [修订: PLAN_DEFECT-R1.1] 合法 root 下仅缺 candidate，candidate.input 为 missing/absent，args/environment 为 not_checked/input_unavailable；其他固定材料继续检查。其余匹配或仅缺失时退出 4，另有 mismatch 时退出 1，另有 I/O error 时退出 3；不得因 candidate 缺失退出 2 |
| `test_path_rejection` | 普通临时文件真实读；用 mock lstat/fstat 模拟 reparse/symlink/hardlink/非 regular/权限错误/替换；记录实际 OS 特性未实测，不依赖管理员创建 symlink |
| `test_args_policy` | 每项 flag 缺失/重复、多个 bind、宽地址/DNS、额外 token、合法乱序、port 0/1/65535/65536、01、空/非数字、带等号；精确 expected status |
| `test_environment_policy` | false 与 0/字符串区别；未知 TOKEN/PATH；case 变体 key；盘符大小写和中文/空格合法目录；UNC/ADS/相对/保留名/../尾点/前缀兄弟逃逸；home/temp 关系与五组嵌套 |
| `test_reporting_never_admits_runtime` | missing+mismatch+error+input_invalid 组合优先级；完整合成 matched 退出 0 仍 blocked；全部报告含未覆盖项；无任意 true 越过 |
| `test_no_side_effects_or_secrets` | patch subprocess/os.system/socket/webbrowser 的外部调用为抛错；用禁止访问的环境对象替换 os.environ；恶意输入含唯一 secret sentinel，stdout/stderr 不含它；访问路径集合只在固定材料内 |
| `test_cli_output_failure` | StringIO 进程内调用 main，解析唯一 JSON；重复执行确定性；模拟 stdout 异常，只返回 3 与固定 stderr，不泄漏 traceback |

完整 matched 报告使用人工 fixture+局部 mock Node pin 分支，不用 94MB 假文件模仿真实 Node；报告/证据明确它是合成测试。缺 source/package 不通过“只存在 JS”弥补。S1 总预算可用计数流/mock 验预算拒绝，无需巨大文件。

**验收/证据/责任：**impl 运行 `python -m unittest discover -s tests -p test_orca_preflight.py -v`，读取完整输出和退出码并保留 unit-tests.txt；只跑此新增测试范围，不执行旧 fake_app_server。再做源码定向审查确认无 product import/外部调用/环境读取；可用 `python -m py_compile scripts/orca_preflight.py tests/test_orca_preflight.py` 仅检查新文件。没有测试日志/失败未解释，不能报通过。coordinator 独立重跑同一 fixture 命令、读取代码与报告、核对文件范围，将验证写 coordinator-check.md；外部依赖和真实 runtime 测试不得混入此步骤。真实 Windows 材料/文件系统测试未做即未验证，不从 mock 推导。

**作者体验：**测试名表达被拒绝原因；样例与 fixed ids 同文可找；不要求运行者安装 Orca 才能测检查器。依赖 S1/S2；回滚新增脚本与新增测试的本批改动，保留证据。报告写出失败不重试/不改写其他输出文件。发布只交付独立脚本供未来显式调用，没有产品开关或配置迁移。

## 5. 接口、兼容、风险与澄清

接口矩阵：CLI→main 只传材料根；S1→S2 只传 candidate 小 bytes/错误状态；S1/S2→S3 只传固定 record；S3→调用者只 stdout JSON/退出码。产品模块、网络、子进程、数据库均无接口。无持久状态机；单次 `input → inspect → report → exit`，失败也只能到报告/退出，不能转启动。无数据库/配置迁移；旧产品调用合同完全不变。schema_version=1 是本工具输出版本，不是 Orca RPC 版本。未来扩大 target/覆盖时另审，不在 v1 做兼容插件。停机策略是停止调用独立脚本，报告/材料保留；本批不持有后台资源。

P1-U1–U5 按 research_p1 第 G 节保持开放：U1 固定完整 bundle/原生依赖，U2 自动发现和账号/网络副作用，U3 实际监听/Web/权限，U4 Windows daemon/PTY 整套清理，U5 实际 env block/home/temp 继承。须后续源码补证、另一次 P1-B Readiness/LW/Gate 和受控真实证据；本检查器任何退出码都不关闭这些 U 点。未知只是技术事实，不能通过用户勾选解除。完整架构、P2、HTTP 迁移、P3 和真实模型任务没有本批准入。

主要风险：固定 pin 老化时只能报不匹配并重新取证审定，不自动跟随 latest；JS 文件存在可能来自任意内容，因此 integrity/provenance 独立未验证；合成路径不构成沙箱；本地文件竞争只能发现常见变更，不提供对抗性文件系统保证；stdout 由调用者保存，脚本不保证调用者落盘。所有风险均通过窄范围和不升级结论处理，不补入安装器/签名系统/启动管理器。

事件触发对齐留痕位置：本节。当前 LW 开始沿用父代理给定 P1-A 收敛基线；新增实现细节是固定 x64 小切片和严格数据规则，没有扩大运行范围。LW→Review(LW) 时 coordinator 核对 hash/范围。若发现新假设（例如要求使用完整 bundle）、新风险（例如需读全环境）或阶段切换，立刻记录到本节并交 coordinator；不得静默实现。当前无阻塞性澄清：函数/schema/上限属于已授权低层细化；真实运行未知已被基线排除。

批量提问模板与优先级：同阶段阻塞按 P0 范围/验收、P1 风险/回退、P2 优化一次汇总，不设数量门槛。模板为 `【DELEGATE_QUESTION】需要用户确认：…；优先级：P0/P1/P2；影响阶段：LWPlan/Review(LW)/Impl；A)…（推荐/原因），B)…（权衡）；请一次回复 Q1=A…`。若只是缺公开技术事实，用 `【DELEGATE_ACTION】 supplemental-research` 指明主题/输出/期望回传，不把未知让用户批准。本轮未触发，原因是 P1-A 基线允许本计划有界切片且全部运行 U 点继续阻断；不递归委派。

contract drift：未发现必须改变基线的新冲突。已知 clarifications 前文阶段为历史、末节覆盖；README 当前状态由 coordinator 维护；不擅改旧研究或高层评审。公开副本只作静态参考，不是镜像完整性保证；未核验平台镜像。本轮批量读取曾截断，已分别补读必需文档及测试；package 原始全文有截断，只采用单独重读的 name/version 与研究确认的 engine，并未据截断内容新增事实。本轮一次 rg 使用 Windows 路径中的通配符导致 os error 123/退出 1，改成目录加 -g 后无匹配/退出 1；两次均非文档成功证据。历史网络失败、404、rate-limit、EOF、超时、缺文件、非 Git diff 失败仍见研究/Readiness，不被本计划抹除。

## 6. Gate 与实施交接

Gate-1 由 lwplan 作者检查 Required Set 存在及内容；证据 `work/orca-p1-lw-gate1.json` 固定到本文件 SHA256，完整检查字段和可定位章节不能只写 total PASS。若缺目标映射、验证责任、证据三元组、作者体验、主链/事实表/片段闭环任一项，则不放行。

Gate-2 由独立 review_plan 主检、coordinator 独立复核，逐包沿第 2→3→S1→S2→S3 顺读：重点核对路径/大小边界、缺失与错误差别、hash 非来源证明、严格参数、env 不访问宿主、报告不泄漏、退出 0 不解锁、fixture 能证明的范围。检查每包关键文件/函数/目标形态、强制片段触发充分性、impl-safe 与承接责任、作者体验；以存在性硬门禁，不用任务数量替代质量。review 固定 plan hash；修改后旧 Gate-2 不覆盖新稿。

P1–P9 核对：P1 禁止以至少若干任务作为质量门槛；P2 存在性门禁；P3 放行只用必备内容存在性硬门禁；P4 T2 Required Set 并列明 T3 接口/兼容/停机；P5 关键不确定性委托；P6 事件触发留痕；P7 澄清问题数量不设上下限；P8 优先级批量问题模板；P9 Gate-1→Gate-2 双阶段。P1/P3/P7 对照 development-workflow 的兼容索引，其他项对照 implementation-planning canonical；不添加数量硬门槛。

失败回退：文档缺项回 LW 修订→重新 Gate-1→Review(LW)；口径不唯一先 DELEGATE_QUESTION；运行事实不足维持 P1-B blocked；不得以测试作者/工具自称通过替代独立证据。通过 Gate-2 后只可称“P1-A 低层方案具备代码实施条件”，仍按用户要求 STOP_BEFORE_IMPL；不得启动 impl agent、写产品或未来工具代码、安装或运行 Orca。

后续真正获准实施时顺序 S1→S2→S3，范围只两个新文件；本轮不创建它们。英文提交信息建议：`feat: add offline Orca material and candidate preflight`（仅未来实现使用；当前文档可用 `docs: define bounded Orca offline preflight plan`）。不将计划、测试 fixture 和真实运行验收合并成“Orca 已接入”。

无新增跨功能事实。
