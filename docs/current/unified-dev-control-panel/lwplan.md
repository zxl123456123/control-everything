# 会话关联首批低层方案

日期：2026-10-03。规划路径；任务分型 **T3**（身份观察、消息 reader、HTTP/页面、stdio MCP 与终端动作跨层）。当前仅产出方案，尚无产品代码。readiness PASS 只放行本方案；手动编排，下一阶段为 Review(LW)，其通过后仍须由 coordinator 向用户呈递具体实施范围和环境动作，不能直接进入 Impl。

本轮为普通 LW REVISE：用户 Q4=A 仅授权吸收首轮报告 R1/R2 并复审；目标与实施授权不变。首轮 Gate-2=FAIL 保留，当前文本待第二轮独立 Review(LW)，不是已实施后的 PLAN_DEFECT 恢复。

## 1. 范围与对齐

权威输入为本 feature 的 README、clarifications 的完整实现基线 1–10、续传原文、两份 session research、readiness 第 1 轮及 work 中研究 helper/快照。原始大面板 research 保留历史范围；其中“完整基线尚不存在”不适用于已收敛的会话关联首批。没有 hlplan，本方案细化规划路径，不改变基线。

目标锁编号用于下文追溯：

- **G1**：用真实 session UUID 区分同 cwd 的不同对话；历史、当前进程、终端位置分别给证据。
- **G2**：页面与 Codex 查询同一索引；列表、按 ID 状态/消息、来源与最后观察时间可读；缺源、错误、断连、陈旧明确 unknown。
- **G3**：保留现用 Claude/SSH/Zellij；已有对话无须重启或 resume 即可补绑；只有 fresh 唯一映射才能定位原终端。

反目标：**N1** 不做 3D/Jev/C4D/资源总监控/多 Agent 调度；**N2** 不发送消息、不注入输入、不代审批、不恢复或终止 Claude；**N3** 不用 cwd、标题、mtime、静态布局、演示或源码存在冒充实时身份/完成。完整消息仅由选中 UUID 的明确请求触发，不自动汇总全体对话或发送外部模型。

不影响项：不改 `D:/terminal-workbench`、Nova 和其它项目，不改现有 Claude CLI/PATH/设置，不装 Hooks，不建数据库、Redis、WebSocket、调度器或自动启动服务。现有研究 `work/verify-session-binding.py` 及 JSON 保留原样，不能当产品模块或持续 collector。当前目录非 Git；不初始化仓库、不 commit/push。

首批实现选择：当前工作区内一个 Python 小网关，仅监听 **127.0.0.1:8766**，原生静态 HTML/JS 页面；独立 stdio MCP 薄客户端转发同一网关查询。远端观察/helper 经已有 SSH stdin 执行，不部署常驻 agent；官方 reader 在固定远端用户/config 的隔离环境运行，避免复制 transcript 到本机。固定来源 `ubuntu@175.24.135.125`、`/home/ubuntu/.claude`、Claude Code **2.1.278**、Zellij **0.45.1 / workbench-v4 / Work-for-Linux**；首期不提供新增主机配置入口。

采用原生 registry+/proc 是因为已有三槽位已形成身份链，部署 Hooks 并非补绑前置；采用官方 SDK reader 是因为其处理父链与可见消息语义；采用本地 stdio 是为了复用用户本地 SSH 和网关，不增加 MCP HTTP 服务。`agents --json` 作为覆盖差异证据，不作为全量采集或 active 判定入口。Hooks、Remote Control/Channels、SDK query/resume 均留到独立批次。

## 2. 核心链路总览

现状主链为 Workbench 启动器 → WezTerm attach `workbench-v4` → Zellij 三个 SSH pane → 远端 pane.sh 导出 `TWB_CWD_FILE` → Claude 原生 PID registry → UUID transcript。研究 helper 只核对一次三槽位；没有产品查询服务，通用 WezTerm CLI 仅见外层 pane，不能定位三个内层会话。

本轮主链：

```text
页面轮询 / MCP list/status
  → 同一个 127.0.0.1 网关 SessionService（单份内存元数据索引）
  → SSH observe：固定来源 registry + /proc + UUID transcript 元数据
    与本机 Zellij list-panes 合并 → 独立身份/存活/定位证据

选中 UUID → 同网关 messages → SSH 固定环境官方 SDK reader → 单页消息
点击“定位终端” → 同网关 focus → fresh 双侧复核 → focus-pane-id
stdio MCP → 本地 HTTP 薄客户端 → 同一个 SessionService；不另建索引
```

不改的层是现用终端启动器、远端 shell/Claude 配置、Claude 正文格式与其进程生命周期。这样已有会话通过下一次观察补绑，SSH 失败时丢失的是观察能力，现用对话继续运行。页面与 MCP 不得分别运行 registry 采集器、持久化历史库或不同身份算法。

### research 事实映射表

| 事实与证据 | 实现锚点 | 验证锚点、主体与口径 |
| --- | --- | --- |
| main/files 同 `/srv/projects/n8n_test`，UUID 不同；37 个目录历史候选 | S1 `observe_source` / `merge_observation`；主键 source+UUID | impl 同 cwd 两 UUID fixture；coordinator 真实两条 ID，禁止按目录合并 |
| 2.1.278 内部 registry 无稳定 schema；早期6注册/11进程不同，新快照注册已为7 | S1 `read_registration`；逐条异常记录，计数分开且不固定数量 | impl 坏 schema/缺文件/存活丢失；coordinator 固定版本检查；版本变更 unknown |
| helper 只记录 startticks；startedAt 可比进程出生晚 7.54 天 | S1 `instance_key`；注册时间不等实例出生时间 | impl PID 复用、前后 startticks 变化、时间异常；coordinator 外部实例证据；不能宣称 helper 已验证这些 |
| 另一个后台 argv UUID 与 registry 冲突，原因未知 | S1 `identity_conflicts`，保留两候选且 unknown | impl 冲突 fixture；真实记录外部核对，只展示不自动选胜者 |
| agents JSON 漏 Files；help/官方文档/运行覆盖不一致 | S1 来源说明、覆盖 warning | 页面/MCP 同列该限制；不把缺席判退出，不冒充全量 |
| SDK 父链/meta/sidechain/compact 语义；分页仍读完整文件 | S2 `read_messages`，只用公开 reader | impl 合成链 fixture 对照 SDK；coordinator 选中真实 ID 兼容；文件/时间/输出预算 |
| R1：公开reader自行按canonical目录/短路径编码或长路径prefix/worktree回退找文件；吞OSError后可能返回[] | S2 `read_messages` 的范围前置与 `reader_empty_unverified` 分支；固定源码sessions.py:61,104–180,836–894,1059–1110 | impl目录不对应/读失败但stat不变/有效空历史fixture；coordinator同runtime合成对照；stat不变不是读取成功证据 |
| R2：SessionMessage实际仅有type/uuid/session_id/message/parent_tool_use_id/parent_agent_id，无顶层timestamp | §3消息项、S2最小序列化、S3/S4透传；固定types.py:1779–1809与sessions.py:1039–1056 | impl严格六字段mock和UI/HTTP/MCP对照；coordinator固定SDK合成fixture；read_at只表示读取时点 |
| 固定 PyPI SDK 0.2.163 已发布，仅 Linux 等 wheel；远端标准python3未安装，未扫描其它venv | S2 reader 前置；requirements-reader.txt | coordinator 隔离环境准备与版本/API 实证；不可用则消息验收失败，整体未满足首批 |
| 本机 MCP 固定 1.26.0，FastMCP.tool / run(stdio) 已核验 | S4 `mcp_stdio.py`；requirements.txt | impl MCP initialize/tools/list/tools/call；coordinator Codex 真实加载，不用 GitHub 最新 API |
| 当前唯一三槽位 terminal_2/3/4；terminal_15 command=null | S1 `parse_slot_command` / S3 `focus_session` | impl 重建/重复/null/plugin ID fixture；coordinator 点击前 live inventory；不硬编码 pane ID |
| get-pane/focus-pane exit2，focus-pane-id help exit0；未真实 focus | S3 `focus_session` | impl mock 精确 argv；coordinator 真定位动作与 focused pane 核对；help 不等动作成功 |
| 当前 filtered_environment 只显示 TWB_CWD_FILE，未核对 CLAUDE_CONFIG_DIR | S1 source/config 校验；只补读允许字段 | coordinator 固定 source/config 实证；发现其它 config 为 source_mismatch，不能扩大查询 |
| 当前无产品服务/消息读取/MCP；本机 8765 曾拒绝连接 | S3 独立 8766 / S4 启动说明 | coordinator 8766 端口占用/启动检查；研究快照不计为产品验收 |

依赖核验摘要由 coordinator 本轮回传，补证文档已完整读取：远端标准 Python **3.12.3/x86_64**，`claude-agent-sdk=null`、`mcp=null`，只读 importlib.metadata exit0，未扫描其它venv；SDK 0.2.163 要求 Python≥3.10，依赖 mcp≥1.23,<3；本地 MCP 1.26.0 要求 Python≥3.10，有通用 wheel。官方来源为 [SDK 发布页](https://pypi.org/project/claude-agent-sdk/0.2.163/)、[MCP 发布页](https://pypi.org/project/mcp/1.26.0/)、[固定 reader 源码](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/_internal/sessions.py)、[固定 MCP 源码](https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/v1.26.0/src/mcp/server/fastmcp/server.py)。安装/真实 transcript 兼容仍未验证；配套记录见 research_session_dependency_versions.md，其中保存直接wheel SHA256供安装比对，不把GitHub tag抓取失败或发布事实当运行证据。

本轮随后读到更新的研究快照 `2026-10-03T08:04:37.054806+00:00`：三槽位仍同UUID/PID/pane，remote_registration_count=7。它只取代研究快照的时点，不新增产品能力，也不把三槽位或注册数量固定成全量覆盖。

### 片段闭环充分性

下文骨架串起 source+UUID 输入、远端观察、同网关查询、选中 reader 的范围/空结果拒绝与六字段序列化、fresh focus 与 MCP 转发。它们只展示职责和关键判定顺序，不提供最终代码全文；状态字段与跨层契约触发了必填片段。reviewer 可按本节主链顺读 S1→S2→S3→S4，而不必自行拼接不同工作包。

## 3. 共享输入、输出与状态契约

产品新文件都在 `E:/project-funny/mianban-develop` 下。`session_panel/source.py` 保存本批固定来源与预算常量；不是通用主机管理系统。客户端只能输入 canonical UUID、整数 limit/offset 和 revision，不能传主机、用户、config 路径、transcript 路径或 shell 命令。

| 契约 | 内容和边界 |
| --- | --- |
| source | 固定 host/user/config/CLI version，SSH StrictHostKeyChecking=yes、BatchMode=yes、ConnectTimeout=10、ServerAliveInterval=10；保留既有 known_hosts，认证失败 unknown，不打印私钥/完整环境 |
| SessionRecord | source+session_id；cwd、pid、process_start_ticks、registered_started_at、slot；observed_at、last_success_at、age_ms；identity_state、process_state、terminal_binding；reason_codes、coverage_warnings、provenance |
| 维度语义 | identity=verified/unknown；process=observed_running/unknown；binding=confirmed/unknown；activity/task_completion 始终 unknown。活进程不等 busy，消息更新/响应结束不等项目完成 |
| 实例 | host/user/config+boot_id+PID+startticks 标识进程实例；registered_started_at 原样展示，不用于会话出生时间或 PID 复用等式。实例变化清除旧定位；历史 UUID 可继续选读，不继承旧 pane |
| 列表 | 按 UUID 分记录，不按 cwd 合并；可按 cwd 展示分组。其它注册可显示且定位未知，冲突候选/坏记录以 warning 保留；注册数、进程数、已确认定位数分别显示；不是全机器会话总数 |
| 时间 | 元数据缓存≤5秒；页面可见时每10秒查询，隐藏暂停；成功完成双侧观察才更新 last_success_at。年龄用最早关键采集起点的本机单调时钟计算，UTC仅供显示，不能用合并结束时间刷新旧证据。失败即当前 unknown；旧值显示“上次证据”。超过30秒全部派生状态 unknown；无后台 scheduler |
| 消息 | source+UUID唯一transcript，且S2证明公开reader解析范围对应候选；成功页的items仅序列化type/uuid/session_id/message/parent_tool_use_id/parent_agent_id，原样保持message块。返回revision/offset/limit/total_visible/next_offset、reader_version、read_at；read_at仅是读取时点，单条消息时间省略，不补顶层timestamp。默认最近20条，limit 1–50；offset省略表示尾页，显式offset≥0按可见序列分页 |
| 预算 | observe 单次SSH≤15秒、Zellij≤5秒，单次只运行一个观察；消息单次≤20秒、一次一个读取、选中文件≤16MiB、响应≤512KiB。超预算明确 unavailable/reason，不复制全部历史、增大预算或静默截断消息 |

默认列表只读 registry、proc、唯一 UUID 文件位置/stat 和严格限定顶层 `sessionId/cwd` 元数据；不返回标题或消息正文。每次只访问固定 config 下的普通文件，解析后的路径不得经symlink逃出固定projects根，不使用 transcript mtime 判身份。SSH/helper stderr 仅保留退出结果与过滤原因，产品日志不落消息正文；选中消息仅留请求内存，响应不缓存到磁盘、浏览器 localStorage 或研究 work 证据。

错误统一含 `status=unknown` 或消息 `available=false`、reason、来源与时间。未知 UUID 是 not_found，多个同 UUID 候选是 identity_conflict；API 禁止将任意错误转成空消息“读取成功”。reader解析范围无法证明时为reader_scope_unverified；SDK返回[]即reader_empty_unverified，不把有效空历史与查找/读取失败区分为不同成功结果，不返回已确认total_visible=0（该值与next_offset为null）。显式异常为reader_failed，stat不变不覆盖以上失败。HTTP / MCP 要保留同样的available/reason及时间字段。

## 4. 主要工作包与实施顺序

### S1 — 固定来源观察与已有会话补绑

**目标/映射**：消费 G1/G2/G3、N2/N3；无 Hooks、重启或 resume，观察下一次刷新就为现存三槽位建立来源明确的记录。N1 通过只读取会话身份而不做资源采集保护。

**关键文件/入口**：`session_panel/source.py`（固定来源/预算）、`session_panel/remote_probe.py::observe_source/read_registration`、`session_panel/service.py::merge_observation/refresh_observation`、`session_panel/terminal.py::list_panes/parse_slot_command`；`tests/test_observation.py`。reviewer 首先看 merge 的判定顺序；目标形态是一个保留失败候选的纯数据合并函数和可注入的 SSH/Zellij 读取边界。已有 helper 只作研究对照，不 import 或修改它。

**执行步骤/输入输出**：

1. 用 subprocess argv 调 SSH，将本地 remote_probe.py 经 stdin 喂 `python3 -`，不写远端文件。验证实际用户/UID/config/CLI版本；只允许读 `TWB_CWD_FILE`、`CLAUDE_CONFIG_DIR` 和必要 /proc 身份字段，不导出任意 env/argv。argv 只提取显式 `--session-id` UUID 用于冲突检测。
2. 逐条 registry 验 filename PID=data.pid、canonical UUID、同用户活 Claude comm/cwd、proc 读取前后 startticks 不变；固定 config 下同 UUID transcript 唯一且顶层元数据一致。坏条目不使其它行消失；同 UUID 多注册/多 transcript、argv 冲突、无法读取、版本不符均保留 unknown。已见后台时间异常显式 `registration_time_unexplained`，不能套用三槽位时间差断言它正常。
3. 精确解析 `TWB_CWD_FILE` 的允许绝对 main/dev/files 路径。读取当前 Zellij list-panes，筛选 session/tab/非plugin；以已读取布局的 SSH目标+`bash ~/.local/share/terminal-workbench/pane.sh <slot>` 命令语法匹配，必须整段参数符合允许模板，不用 substring/title/cwd。同 slot 恰好一个有效注册和一个 terminal pane才确认位置；缺失、重复、null、新 pane均 binding unknown。
4. 合并 immutable observation；失败即撤销当前定位资格，留下 last_success_at 和上次证据；重连后重新全链验证，不把旧pane当有效。其它注册仍可显示，未映射不提供定位。

来源 `session_panel/service.py::merge_observation` 的目标判定骨架（说明 early-exit/优先级，不是最终函数）：

```python
record = keep_candidate_and_provenance(raw_registration)
if source_invalid or registry_invalid or instance_changed or identity_conflict:
    return unknown(record, reasons)
record.identity_state = "verified"       # UUID + live instance + unique metadata agree
record.process_state = "observed_running"
record.terminal_binding = unique_fresh_slot_join(record, current_panes) or "unknown"
record.activity_state = "unknown"        # no task state inference from process/mtime
```

**验收/失败回退**：同 cwd main/files 两行、不同 UUID；新增重复 slot/同 UUID registry/坏json/缺proc/版本变更/PID复用不误配；terminal_15 不猜。断连、陈旧、SSH成功但Zellij失败都不能留下可点定位。撤销本工作包新增模块即可，原终端无须回滚；依赖只有已有 SSH/Python/Zellij，SDK缺失不阻塞观察。

**作者体验**：固定 source 与预算集中一处，原因使用短 enum 和中文解释；候选证据保留而不是吞异常。页面/MCP 用同字段，后续作者不需重读三套身份算法；不添加通用插件系统或主机配置表。

**验证责任与证据**：impl 仅用合成 registry/proc/pane fixture 和 mock subprocess，`python -m unittest tests.test_observation -v` 输出及退出码落 `work/impl-safe-r1.txt`、结论落 `impl_report_r1.md`；没有真实远端/focus。coordinator 承接固定来源实际观察、configdir与版本核验、同 cwd 两ID、其它候选冲突及一次断连/恢复，由产品接口产生过滤证据 `work/session-panel-external-r1.json`。非 impl-safe 不交给 impl；外部缺证据只能说“观察逻辑自证，真实补绑未验收”，不能把07:31研究快照算本包产品验收。

### S2 — 选中 UUID 的官方历史读取与进展展示

**目标/映射**：消费 G1/G2、N2/N3；进展由用户选中的最近可见消息与读取时间支持，首期不推断任务已完成。N1 通过不调用外部模型、不做脑图/语义汇总保护。

**前置条件**：remote 当前标准python3中SDK未安装，未扫描其它venv，真实消息读取不可验收。Review(LW)与实施前呈递之后，由 coordinator 承接在 **`/home/ubuntu/.local/share/session-panel-reader/.venv`** 创建 Python≥3.10 的独立 runtime、安装 `claude-agent-sdk==0.2.163` 与兼容的已核验 `mcp==1.26.0`，比对补证记录中的直接wheel SHA256并记录完整解析版本/API；路径已存在时先核对所有权和版本，不覆盖。现用 CLI/PATH/Claude设置保持不动，网关消息子进程只调用该环境的绝对 python。不能静默改为系统pip、不同版本、Windows SDK或本地 transcript 复制。环境准备失败则 sdk_unavailable，消息验收 FAIL，整体首批未满足；观察可以保留为部分成果。

**关键文件/入口**：`requirements-reader.txt`、`session_panel/remote_probe.py::read_messages/reader_capability`、`session_panel/service.py::get_session_messages`、`tests/test_messages.py`；reviewer 首先看UUID/path范围前置、[]拒绝和六字段序列化。目标形态是同一SSH helper中的只读消息分支、公开SDK结果的最小序列化分页，没有自制父链 flatten。

**执行步骤/接口**：

1. 接受 source固定、UUID、offset/limit/revision；先同来源验证 UUID唯一 transcript 与cwd，远端 config须与观察一致，设置仅该reader子进程的 `CLAUDE_CONFIG_DIR`。历史UUID可按明确ID解析，退出会话只影响进程/定位维度，不触发resume；不得通过目录最新历史替代ID。
2. 公开reader不接收文件路径，也不能关闭其worktree回退。首批只放行已核验0.2.163的短路径确定映射：cwd经远端标准库realpath+NFC取得canonical目录，长度≤200且ASCII；按固定源码规则 `re.sub(r"[^a-zA-Z0-9]", "-", canonical_cwd)` 得到目录名，其固定config/projects下的直接目录必须存在且等于已验证候选parent。全projects根按该UUID文件名的元数据枚举须唯一，并在读后再确认同一路径，所有路径不得经symlink出根；因此reader直接路径及其可能的worktree回退不存在另一个同UUID候选。目录对应/规范化/唯一性无法证明，含长路径hash或prefix回退，均在调用前返回reader_scope_unverified；不调用SDK私有方法、不省略directory改全库查找、不新增raw正文解析器。此处是固定版本元数据范围校验，不实现消息链。
3. stat文件大小与revision，满足16MiB限制才调用公开 `get_session_messages(session_id, directory=canonical_cwd, limit=None, offset=0)`。Python参数是 **directory**，不是TypeScript的dir。显式异常返回reader_failed；SDK返回[]则统一available=false/reason=reader_empty_unverified，即使候选stat前后不变。首批无法区分真正零可见消息与SDK内部查找/读失败，有效空历史也显示未验证。官方函数继续负责parentUuid链选择、meta/sidechain/team过滤、compact摘要，不使用query/continue/resume。
4. 非空可见序列经读后范围/唯一候选及stat复核后才切所请求页，首次默认尾页；以SDK实际六字段序列化，不补顶层timestamp，message字段中的官方块保持原样。输出total_visible、revision和分页锚点。非空序列上的超范围offset可给已确认total_visible及空页，它与reader返回[]不同。每次reader仍可能读完整选中文件；一次一个请求，50条/512KiB限制，超输出预算返回response_too_large并建议减小limit，不伪造完整页。
5. 文件变化重试一次，仍变化返回messages_changed；后续页revision不一致409，刷新尾页。revision的stat用于一致性，不是身份或读取成功证明。消息与观察缓存分离，只有当前用户明确请求才读正文，页内存随请求释放。

来源 `remote_probe.py::read_messages` 的目标骨架（闭合官方reader和预算）：

```python
path, cwd = resolve_exact_uuid_in_fixed_source(session_id)
before = require_bounded_transcript(path, max_bytes=16 * 1024 * 1024)
require_exact_sdk_version("0.2.163")
canonical_cwd = require_reader_scope_matches(path, cwd)  # own metadata-only guard
try:
    visible = get_session_messages(session_id, directory=canonical_cwd, limit=None, offset=0)
except Exception:
    return unavailable("reader_failed")
if not visible:
    return unavailable("reader_empty_unverified")  # also valid zero-visible history
require_reader_scope_matches(path, canonical_cwd)  # same unique candidate after read
require_unchanged_revision(path, before)  # one retry, then explicit unavailable
page = bounded_sdk_page(visible, offset=offset, limit=limit, revision=before)
page.items = [{"type": m.type, "uuid": m.uuid, "session_id": m.session_id,
               "message": m.message, "parent_tool_use_id": m.parent_tool_use_id,
               "parent_agent_id": m.parent_agent_id} for m in page.items]
return page  # read_at is page read time; no per-message timestamp promise
```

`require_reader_scope_matches`仅是本产品的上述范围检查锚点：不成立即返回available=false/reason=reader_scope_unverified，骨架中的调用不会继续到reader；不得将它实现为调用或monkeypatch SDK私有找文件/读文件方法。六字段使用实际属性，顶层公开reader的两个parent字段在此固定版本为None，JSON保留null，不自造父链字段。

**验收/回退/依赖**：合成JSONL需覆盖分叉父链、meta、sidechain、compact、坏行，输出与固定版官方reader一致；目录parent不对应/长路径无法证明fixture断言available=false/reader_scope_unverified且reader未调用；mock SDK读失败但前后stat不变且返回[]与真实零可见消息两种fixture均断言available=false/reader_empty_unverified；再覆盖显式异常reader_failed、非空序列的空分页。mock对象恰有实际六属性，不含顶层timestamp；HTTP/UI/MCP不得读不存在字段或把read_at补作单条时间。分页重叠/跳页、变化/大文件/大块/缺SDK/错SDK不能默默成功。不自动列/读取168份历史。撤销本包消息入口和requirements-reader文件；隔离远端runtime仅由coordinator按已记录的本批专属绝对目录撤销，先确认范围，不能删除`.claude`/项目/系统依赖。SDK依赖不通时保留明确错误而不改变实现路线。

**作者体验**：source/UUID/官方reader只有一个入口，展示数据保持官方结构；fixture是人工合成而非私人消息。错误直接告诉作者是依赖、身份、文件变化还是预算，不让作者读raw transcript来排错。

**验证责任与证据**：impl `python -m unittest tests.test_messages -v` 仅用临时fixture+mock reader，明确断言上述scope/[]/六字段分支；若本机没有可安装的SDK wheel，不能写“官方链兼容已通过”，用独立Linux临时fixture的真实SDK对照交coordinator。impl输出落impl-safe-r1.txt、报告明确stub范围。coordinator准备隔离runtime后，用同runtime合成正确短目录、错误目录、不可读文件与零可见链，直调公开reader对照[]/六字段；不可读合成文件stat前后不变也必须产出unavailable，不改真实transcript权限。只对用户已选中真实UUID核对范围、最近页与下一页，不增加私人历史读取；只保存ID、范围对应结论、available/reason、计数、版本、revision、退出码到session-panel-external-r1.json，不存正文。安装成功、范围对应、真实ID读取、链/[]/字段语义任一缺证据均是消息能力未验收；不得用源码版本事实补齐。

### S3 — 单网关、轻页面和精确定位动作

**目标/映射**：消费 G1/G2/G3 与 N1/N2/N3；页面呈现“哪段对话/最近说什么/当前可否回原终端”。不在页面放未经证实的busy/done标签或大面板背景能力。

**关键文件/入口**：`session_panel/gateway.py::PanelHandler/serve`、`session_panel/service.py::list_sessions/get_session_status/get_session_messages`、`session_panel/terminal.py::focus_session`、`web/index.html`、`web/app.js::refreshSessions/selectSession/focusSession`、`web/style.css`、`tests/test_gateway.py`、`tests/test_focus.py`。reviewer先看HTTP路由和focus前置；目标形态是stdlib HTTP server+同一Service、一个会话列表与选中详情，而不是另一个Workbench后端。

| 接口矩阵 | 输入/输出/跨层责任 |
| --- | --- |
| GET /health | 固定app标识与协议版本；不宣称远端健康 |
| GET /api/sessions | 同service元数据/coverage/age；不触发正文 |
| GET /api/sessions/{uuid} | 按ID状态与来源；未知/冲突不映射到最近目录会话 |
| GET /api/sessions/{uuid}/messages | S2页；用户选择触发，分页/预算错误保留 |
| POST /api/sessions/{uuid}/focus | 当前identity+instance+pane再验证；精确focus，不发送任何字符 |
| MCP三查询 | S4转发前三个会话查询；与HTTP响应同源，无focus工具 |

**执行步骤**：127.0.0.1固定端口启动；端口被占用失败退出，不自动换端口/接管其它服务。严格Host为127.0.0.1:8766、拒绝跨Origin与CORS；全部API GET要求自定义 `X-Session-Client: panel|stdio` 头，页面同源fetch和stdio转发均发送，出现Origin时须精确同源，跨源预检不放行。focus为POST且要求本进程随机CSRF token、精确Origin，页面初始化同源取得token，日志不打印token。body≤4096bytes，全部命令使用argv，不接受客户端pane/命令。页面把UUID短显示+完整可复制ID、cwd、来源、观察时间、独立状态/原因并排；同目录记录始终可辨认。选中详情用DOM textContent渲染消息/工具块，不执行消息HTML，不默认拉图片/附件。

列表轮询只更新元数据；选中后首次读最近页，显示“读取时间/历史消息”，用户点刷新或翻页才再次读取正文。错误保留当前选择和上一页但标“上次结果”；按钮未确认/过期即禁用，并给具体原因。移动窄屏允许UUID/路径换行，页面键盘选择与定位均可访问，不堆叠模拟监控卡片。

消息详情与tests.test_gateway/UI fixture消费S2的items六字段：type区分角色、message呈现官方块、uuid/session_id用于证据；parent字段原样保留。单条时间省略，read_at仅标“本页读取时间”。reader_empty_unverified/reader_scope_unverified显示消息未验证与原因，不能渲染为“暂无对话/读取成功”；严格六字段fixture不得虚构timestamp。

来源 `terminal.py::focus_session` 的目标骨架（重要检查顺序）：

```python
requested = service.get_session_status(session_id)
fresh = service.refresh_observation(force=True)  # SSH + current list-panes
binding = require_same_unique_instance_and_pane(requested, fresh, session_id)
run_argv([ZELLIJ, "--session", "workbench-v4", "action",
          "focus-pane-id", binding.pane_id])   # terminal_2 shape, never numeric guess
return verify_current_focused_pane(binding)     # focus sent is not verified success
```

focus必须在fresh≤5秒、当前唯一slot/pane/UUID/实例成立时执行；提交前本机再读pane清单确认命令仍匹配，无完整唯一链就409 binding_unknown。调用正确 `focus-pane-id terminal_N`，不使用get-pane/focus-pane。命令exit0后用 **`action list-clients`** 的文本列 `CLIENT_ID ZELLIJ_PANE_ID RUNNING_COMMAND` 按terminal/plugin类型核对；本机不支持该命令的--json（coordinator只读补验exit2，正确文本命令exit0，记录于work/session-verification-notes.txt第10项）。若多client或列解析失败无法唯一确认，报告focus_sent_unverified，不能显示成功。只操作现存mux，不执行Workbench启动器/Ensure-WorkbenchTabs（它们会创建tab/激活窗口），不恢复/新建终端。首批定位含义为Zellij选中原pane；桌面窗口前台激活未纳入首期，不额外调用AppActivate。双系统校验非原子：命令期间重建时报告变化/未确认，不宣称绝对原子保障。

**验收/回退/依赖**：HTTP与页面同一Service；断连/过期状态无需重载修复；三槽位对应可查但paneID不硬编码。focus stale/UUID冲突/重复slot/plugin重号/terminal_15空command拒绝；消息错误不导致选中别的会话。关闭网关即可停轮询/查询，撤销本包新增web/gateway模块不影响原对话；已执行focus只改变当前选中pane，用户可切回，不能用“回滚”恢复进程/配置。依赖S1；消息展示依赖S2可用，缺依赖明确局部不可用。

**作者体验**：HTTP handler只负责解析/状态码，身份/消息逻辑仍在Service；UI只消费契约，不重复判断UUID→pane。中文状态直接显示证据来源和unknown原因。产品不展示JSON大墙，详细证据折叠查看；不默认扩张日志或配置项。

**验证责任与证据**：impl用in-memory fake service、临时loopback测试HTTP/focus mock argv及CSRF/路径校验，`python -m unittest tests.test_gateway tests.test_focus -v`；静态页面mock数据检查同cwd/错误/窄屏，正文用合成消息，证据落impl-safe-r1.txt及work/ui-check-r1.json。coordinator真实启动8766、Edge页面、360px/桌面及两ID读消息；只有呈递过定位动作并具备fresh链才执行真实focus，保存点击目标UUID、前后pane与exit结果，不抓正文。真实focus未验不能把help/mock称成功；外部UI/消息/定位缺项分别标未验收。

### S4 — stdio MCP、运行入口与交接

**目标/映射**：消费 G2/G3、N1/N2/N3；Codex按真实ID读取同一份观察/消息，控制动作仍是独立页面按钮。本包不以“配置文件存在”宣称当前聊天已拥有工具。

**关键文件/入口**：`requirements.txt`（mcp==1.26.0）、`session_panel/mcp_stdio.py::build_mcp/call_gateway`、`session_panel/__init__.py`、根 `README.md` 的启动/外部前置/状态语义章节、`.codex/config.toml.example`、`tests/test_mcp.py`。reviewer先看工具白名单与转发；目标形态是几十行薄MCP入口加运行说明，无第二份collector/索引或额外MCP HTTP endpoint。

**执行步骤/接口**：固定官方FastMCP 1.26.0定义且仅定义 `list_sessions()`、`get_session_status(session_id)`、`get_session_messages(session_id, offset=None, limit=20, revision=None)`，均readOnly/idempotent，消息调用含明确“读取选中私人对话”的说明。instructions说明固定来源、unknown不是完成、消息按需/预算、不得发送/审批/resume；stdio stdout仅MCP协议，日志stderr。call_gateway只向固定127.0.0.1:8766发请求，网关不可用就服务不可用，不自动启动第二个网关或连别的端口。

消息工具原样转发S2页的items六字段和available/reason/read_at，不补timestamp或把不可用[]改成成功；tests.test_mcp与HTTP使用同一六字段mock及reader_scope_unverified/reader_empty_unverified失败fixture，确保页面与Codex看到相同的未验证结论。

来源 `mcp_stdio.py::build_mcp` 的骨架（闭合工具→同网关）：

```python
mcp = FastMCP("remote-claude-sessions", instructions=READ_ONLY_INSTRUCTIONS)
@mcp.tool()
def get_session_status(session_id: str):
    return call_gateway("GET", f"/api/sessions/{canonical_uuid(session_id)}")
# list_sessions and get_session_messages follow the same gateway routes.
mcp.run(transport="stdio")
```

首次运行在本工作区创建本地`.venv`，固定安装requirements.txt；网关不依赖远端SDK，stdio需要本机Python≥3.10/mcp1.26.0。启动使用绝对python路径和工作目录，默认手动前台运行，Ctrl+C停止；若coordinator需要后台测试，Start-Process须Hidden，仅结束自己启动且已核对身份的网关进程，不加自启/系统服务。

示例配置输出到`.codex/config.toml.example`供review，不在本轮写用户全局配置。实施后由coordinator在受信任项目`.codex/config.toml`中合并单一server表并记录原始文件（不覆盖既有server），运行路径如下：

```toml
[mcp_servers.remote_claude_sessions]
command = "E:/project-funny/mianban-develop/.venv/Scripts/python.exe"
args = ["-m", "session_panel.mcp_stdio"]
cwd = "E:/project-funny/mianban-develop"
enabled_tools = ["list_sessions", "get_session_status", "get_session_messages"]
```

本地stdio和Streamable HTTP均为Codex官方支持方式，此处只配置stdio；本地网关HTTP是内部查询API，不能把其URL直接当MCP URL。官方配置在config.toml；可信项目可用project scope。保存后按客户端官方重载/Restart步骤让新连接加载，重启当前app/聊天由用户控制，不静默全局重启或中断当前任务。当前chat不会因为面板或文件存在自动获工具，`codex mcp list`只证明配置；加载后的实际工具发现和按ID调用需单独验收。依据 [OpenAI 官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=app)。本批无OpenAI API模型推理或API key要求。

**验收/回退/依赖**：MCP tools/list恰为三工具，各工具结果与HTTP同观察revision/UUID；非法ID拒绝，断网网关不可用明确报错，不能吞成空列表。撤销example/stdio/本地requirements；外部启用回退仅移除本批server表或enabled=false，恢复记录的配置片段并让用户正常重载，保留其它MCP。停止网关，删除本批独立local `.venv`前确认其路径/归属。依赖S1/S3；消息完整验收依赖S2。

**作者体验**：一个本地启动命令，一个MCP表，安装说明明确“本机MCP/远端reader”两种runtime；失败提示带下一步和正确阶段，不要求作者猜哪个源/配置生效。根README可从前提→启动→网页→MCP启用→验证→撤销顺读，不复制研究全文。

**验证责任与证据**：impl固定版MCP initialize/tools/list/tools/call及fake HTTP网关对照，`python -m unittest tests.test_mcp -v`，工具无控制入口，结果落impl-safe-r1.txt；TOML示例语法解析。coordinator承接真实客户端配置、正常重载后的工具发现、真实两ID status/messages与页面一致，证据 `work/session-panel-codex-r1.json` 不含正文；当前chat无工具/客户端未重载时仅“stdio协议自证/配置待生效”，不可称Codex接入成功。涉及真实配置写入、客户端重载、远端runtime准备均非impl-safe，不交给impl私自执行。

## 5. 分层验证、兼容与发布/撤销

执行顺序 **S1 → S2 → S3 → S4**；S2远端依赖准备可由coordinator并行承接，impl用mock继续S3/S4但必须保留未验收。主要工作包共同消费共享契约，不变更其它项目接口；这是新产品，无旧数据库/旧配置迁移。native版本不同则整来源unknown，等补充研究/Review(LW)修订，不能自动适配未知schema。按标准启动路径新增pane时重新读inventory；无法映射的新pane显示未确认，无手动“强制绑定”后门。

impl全量自证命令为 `python -m unittest discover -s tests -v`；只包括本工作区合成fixture、mock SSH/Zellij、临时local服务和MCP协议。必要 `python -m compileall session_panel` 与TOML解析输出一并保存；不存在的SDK/runtime或跳过测试必须在报告明确，不能用“全部绿”覆盖skip。要求有效断言身份拒配、链分页、协议共源与动作前置，不写镜像实现或仅存在性测试。具体命令以批准后的实际python绝对路径执行，不用管道截断退出码。

coordinator另承接外部检查表：固定host/user/config/版本；真实两个同cwd UUID与已有会话补绑；断连/重连/30秒陈旧；SDK隔离环境+合成链与真实选中分页；页面与stdio查询一致；用户正常加载后的Codex工具；fresh唯一focus动作与focused pane结果。外部取证报告逐项列命令/时间/exit完整过滤输出及所有失败，不保存正文/凭据，不改变现用Claude输入或运行状态。fixture中注入异常即可覆盖PID复用/重复slot，不为验证故意重启Claude或重建现用mux。

真实环境前置失败不撤销现用终端：停止本地网关即可降级；保留研究与自证结果作为部分成果。整体首批“可用”必须同时有真实区分、进展读取、精确定位与Codex查询证据。任何一条缺失只报告相应已实现/已自证/待外部验收，整体未满足，不能用观察列表代替消息能力。

撤销文件范围明确为本批新增 `session_panel/`、`web/`、`tests/`、`requirements.txt`、`requirements-reader.txt`、根README、`.codex/config.toml.example`；运行环境为本批专属local `.venv` 和由coordinator单独记录的remote reader `.venv`。实施报告/本方案/研究与work取证保留。不递归删除整个工作区、不删远端`.claude`、不修改Workbench/其它项目；已有文件/目录若非本批创建不得直接删。示例之外的真实MCP配置由外部责任人只撤销本批server片段。

## 6. 风险、不确定点与事件留痕

| U点/风险 | 关闭方式与失败结论 |
| --- | --- |
| registry内部生命周期/版本 | S1严格版本+来源+前后实例+唯一证据；unknown是安全降级，升级需补研后修订，不承诺跨版本 |
| 后台UUID/注册时间冲突 | 保留候选/时间/原因，无自动覆盖；真实原因未明也不阻塞三槽位，但不能冒称全量完整覆盖 |
| SDK缺失、固定发布包或网络不可用 | 已发布事实已核验；远端安装与兼容仍由S2外部前置关闭，失败消息不可用且整批未满足；不换路线 |
| SDK每页扫描与异步落盘 | 16MiB/20秒/串行/输出预算，revision变化一次重试；无法一致读则messages_changed，禁止静默flatten |
| reader解析范围/[]无法证明成功、无消息顶层timestamp | S2短路径确定映射或reader_scope_unverified；SDK[]一律reader_empty_unverified，含有效空历史；六字段透传，read_at仅读取时点；fixture/外部合成对照，缺证据不放行消息能力 |
| 双侧映射不原子 | focus即时全链+命令前pane复查+事后focus证据；变化即未确认，不给长期绑定保证 |
| MCP客户端未加载 | S4区分协议、自证、配置、客户端工具；不自动重启当前chat，缺工具实证即待接入 |
| 本地API泄露/误动作 | loopback、Host/Origin、CSRF、消息GET同源约束、无CORS、无正文日志；无外网/模型出站 |

事件触发对齐留痕位置为本节，后续修订每次记录事件/判断/基线影响，必要回写clarifications：

- 2026-10-03 新事实：SDK0.2.163/MCP1.26.0已发布及API已核验；远端标准python3中SDK/mcp均未安装，未扫描其它venv。coordinator回传来源/exit0；S2纳入独立runtime外部前置与失败分支，不把发布事实当安装成功，不扩大用户目标。
- 2026-10-03 新鲜快照：08:04:37UTC三槽位同UUID/PID/pane，注册数从6变7；S1保留其它候选与动态计数，不扩大终端覆盖、不新增猜配。
- 2026-10-03 新风险：原始filtered_environment未核对CLAUDE_CONFIG_DIR；S1前置只读源校验，发现其它config拒绝跨源；无用户范围选择变化。
- 2026-10-03 阶段切换：LWPlan产出→Review(LW)；手动编排，Gate-2与实施前呈递仍未执行。方案作者通知coordinator承接，不自选auto_mode。
- 2026-10-03 本轮修订：首轮Review(LW)返回R1/R2、Gate-2=FAIL；Q4用户原话“a”选择修订与复审。定向核对固定sessions.py/types.py原文exit0，补入范围不对应/[]拒绝、有效空历史限制和实际六字段；只修改本方案，阶段LW REVISE→第二轮Review(LW)，未授权安装/实施/MCP/focus。

**批量提问未触发及原因**：已回答输入与readiness明确本轮无新增用户决策；依赖/兼容是有确定关闭方式和失败分支的技术前置，不构成新范围假设。若新证据导致范围、验收或回滚口径不唯一，按P0阻塞→P1高风险→P2优化一次性列真实问题，不按条数凑问；仅coordinator面向用户收口。模板：

```text
【DELEGATE_QUESTION】
需要用户确认：<范围/约束/验收/回滚的一句话决策>
优先级：P0 | P1 | P2；影响阶段：Review(LW) | Impl
- A) <推荐项及原因>
- B) <替代项及权衡>
请一次性回复：Q1=A, Q2=B ...
```

技术补研使用【DELEGATE_ACTION】由coordinator承接，不递归委派；此前SDK/MCP版本核验已按该协议回传，本轮定向官方源码核对未扩大调研。新事实只修改确定细节；若身份路线/控制范围改变，先回写基线、重算readiness，不静默漂移。当前基线无范围漂移；首轮review已上报development-workflow里程碑索引陈旧，本方案沿coordinator核心条款STOP_BEFORE_IMPL，不修改共享技能；未审计所有平台镜像，不作全局一致保证。

## 7. Gate-1 自检与 Gate-2 承接

Gate-1由lwplan作者本轮逐项自检；T3按T1全部项+T2+T3增量的存在性检查，任一缺项不得放行，不用任务数或问题数作为质量门槛。

| Required Set | 本方案落点 | Gate-1 |
| --- | --- | --- |
| T1-1 目标锁/反目标/不影响项 | §1及各S映射 | 齐备 |
| T1-2 受影响文件及首个审查锚点 | S1–S4关键文件/入口、§5撤销范围 | 齐备 |
| T1-3 独立包目标/变更/步骤/验收/回滚/依赖/形态 | S1–S4；S2修订scope/[]/六字段 | 齐备，待本轮自检/独立复审 |
| T1-4 每包消费目标/反目标 | 各S首段 | 齐备 |
| T1-5 impl/coordinator/非impl-safe、证据三元组 | 各S验证段及§5 | 齐备 |
| T1-6 作者体验/声明可读性 | 各S作者体验、S3状态展示 | 齐备 |
| T1-7 主链总览 | §2现状→改动→不改层/原因 | 齐备 |
| T1-8 research事实映射 | §2映射表含责任/口径及R1/R2 | 齐备，待本轮自检/独立复审 |
| T1-9 跨层片段闭环 | §2说明及各S骨架；S2补scope/[]/序列化 | 齐备，待本轮自检/独立复审 |
| T1-10 明确自检目标/责任/证据/体验/主链 | 本表及下段 | 齐备 |
| T1-11 双阶段时机/执行人/失败回退 | 本节Gate-1/Gate-2 | 齐备 |
| T1-12 澄清触发/批量模板 | §6未触发理由与模板 | 齐备 |
| T1-13 风险/降级/Gate-2复核 | §5–§7 | 齐备 |
| T2 输入输出/边界/函数/分层测试/回归 | §3、各S、§5；R1/R2分支fixture和六字段输出；回归仅新模块且不改现用终端 | 齐备，待本轮自检/独立复审 |
| T3 接口/状态/兼容/迁移/停机 | §3状态、S3矩阵、§5无旧数据迁移/版本拒配/停止网关 | 齐备 |

作者体验门证据是各包的目标结构和声明约束：single source、一个Service、SDK reader单入口、薄HTTP/stdio、明确unknown原因与运行顺序。reviewer可预判最终职责，尚需Gate-2独立判断是否更直观、没有过度抽象。**目标锁/反目标映射完成；验证责任分层已落盘；证据产物/责任归属/证据不足约束已落盘；作者体验门证据已提供；主链/事实映射/片段闭环已落盘。** Gate-1自检结果仅允许提交Review(LW)，不等于产品通过或可直接实施。

| P项 | 可核查留痕 |
| --- | --- |
| P1/P3 | 本节禁止任务数门槛，Required Set纯存在性判定 |
| P2 | T1-1–13/T2/T3全部存在，缺一FAIL |
| P4 | 本批T3及T1/T2增量明确 |
| P5 | §6关键决策不唯一时DELEGATE_QUESTION；当前未触发原因 |
| P6 | §6新事实/新风险/阶段切换事件留痕 |
| P7 | 不设澄清数量上下限；以真实阻塞驱动 |
| P8 | §6按P0/P1/P2批量模板及未触发理由 |
| P9 | Gate-1作者自检→Gate-2 review_plan主检+coordinator复核 |

Gate-2在Review(LW)通过前由review_plan主检、coordinator复核：按T3 Required Set复查目标/反目标、主要包文件函数/形态、骨架是否闭合整条主链、事实→验证映射、impl-safe/外部责任/证据不足约束、作者体验和声明可读性，不能只核对表格有字。逐项形成review_notes_lwplan_{n}.md；本轮特别核对R1范围/[]分支和R2六字段在S2→S3→S4闭合。缺项/矛盾回LWPlan→Review(LW)修订；口径不唯一先DELEGATE_QUESTION，重大路线漂移回基线/readiness。Gate-2 PASS后仍STOP_BEFORE_IMPL，由coordinator呈递本方案中的本地新文件、远端隔离SDK环境、项目MCP启用与真实focus验证边界，再承接批准后的实施；不跳过手动关卡。实施后coordinator独立验证并fresh reviewer审查实际代码/证据，不以impl自报替代。

## 8. 本轮规划核验与失败记录

本轮已实际读取基线/两份research/readiness/helper/快照、Workbench启动/布局/pane.sh/rc.sh，并核对当前工作区仅docs/work。首次误读根README（尚不存在）exit1；当前目录git status仍非Git exit1；批读输出截断后两份session研究单独完整重读；一次对原始JSON的错误字段processes索引产生PowerShell错误但后续语句掩盖退出码，随后启用ErrorActionPreference=Stop并按真实claude_processes/filtered_environment字段重读exit0。这些失败不构成产品失败，也不隐藏为“全部命令成功”。

Gate-1文档结构自检首跑90项exit1、failures=1：S3已有删除新增模块的回退句，但未使用检查锚词“撤销”；本轮统一该措辞后重跑，最终退出结果由coordinator交付时引用工具输出，不把结构检查当产品测试。

本轮REVISE完整读取首轮报告、当前README/clarifications/依赖补证与方案（整文输出截断处已分段补读）；定向读取固定官方源码与备份hash命令exit0，未运行SDK或产品测试。旧方案备份hash为BAD9DAA1CA5BB25F8B92DEF73C11064B2E156592862C6DB66040F189BA68D4DD，仅供补丁diff；本轮Gate-1仅核对原Required Set保留与R1/R2的范围、错误、字段、fixture/外部责任落点，结果随当前实际文本hash回传，不能代替第二轮Gate-2。

本轮Gate-1首跑34项exit1、failures=1：S4用scope/empty缩写指代失败fixture，未包含检查所需的reader_empty_unverified全名；已改为两条明确reason名，随后只重跑同一自检。此失败及最终命令退出结果随交付保留，不算产品运行证据。

研究记录的既往失败继续有效：错误Zellij子命令exit2、CLI漏Files/后台身份冲突、root祖先PermissionError、网页超限/限流/语法错误、8765拒绝连接、旧浏览器缺失等均见原始文档；不能在本方案删去失败或将恢复的局部研究验收扩大为产品能力。本轮没有连接新主机、安装依赖、修改产品/设置/远端、读取消息正文或执行focus。

英文提交消息建议（仅供将来已验证且成为Git项目时使用）：`feat: add read-only remote Claude session binding gateway`。当前方案不触发commit/push。
