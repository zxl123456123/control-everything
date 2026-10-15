# 子 agent 协作小院：唯一低层实施计划

日期：2026-10-05。任务分型：**T3，跨模块的新写入链与 UI**。输入路径为规划路径，没有 hlplan；本文件是唯一 LW，不创建平行计划。当前只允许 Review(LW)，Gate-2 前不改产品。

## 1. 范围与权威输入

上游权威是本目录 clarifications.md 的完整实现基线 1–10 节；source_materials/feedback_r12_cozy_subagents.md 保留原话及两个选择；review_notes_readiness_1.md 当前协议/业务 PASS、allow_enter_lwplan=yes，只放行规划。三份 work/r12-*research.md、r12-ui-comfort-facts.md、r12-current-child-bindings.json、r12-child-source-probe.json 是事实输入，旧 R11 交付报告是兼容和失败历史输入。

目标锁：**G12.1** 温暖草木、木色的小院，普通中文可读，完整身份不截断，窄屏/键盘可用，保留原 3D、像素和文字回退；**G12.2** 真子 agent 通过注册操作提交产物、接收复核和返回结果，明确收据及最终验收驱动云朵；**G12.3** 主 Thread UUID 分域，读写、任务、事件、选择和迟到响应均隔离。

反目标：**N12.1** 回合结束、native completed、入队、动画不变成成功；**N12.2** 不跨主聊天，不接受参数冒充 caller/root，不新增任意命令或全局配置修改；**N12.3** 不改旧 unknown/终端/网络守卫，不降低原几何、AA、DPR、粒子、速度或人数，不覆盖旧红，不初始化 Git。

不影响项：旧 remote-claude-sessions 三只读 MCP、Codex 主身份 API 与六字段读取、远端正文按需读取及原 focus/connect 空 body 路径。远端 Claude 团队关系仍未接入。CODEX_THREAD_ID 是受信本地调用进程的上下文，并非抵御同 OS 用户恶意改 env/DB 的凭据。

采用成熟机制：现有 FastMCP 1.26.0 的专用函数/schema 和真实 stdio initialize/list/call；SQLite 单文档事务；Fluent 2 的间距/列表详情与 Carbon 的渐进展开。官方事件研究已说明 Stop/notify 非业务成功，MCP Events 宿主受限、app-server 动态工具实验性；本轮不采用这三者作为自动完成源或桌面热加载路径。风格以田园氛围为参考，不复制游戏资产。

## 2. 核心链路总览

现状：固定来源观察 → 原 UUID/前缀身份 → cockpit 角色/工位 → 选择与只读详情；旧 Codex 查询明确排除 child，活动/完成为 unknown，既有三只读工具不能交接。

新增主链：**本次进程 CODEX_THREAD_ID → 只读 id/source 显式父链 → 固定 root/actor → 同 root 注册角色与分配任务 → 原作者实际 submit(path/hash/version) → root request_review → root 原生 collaboration 派发 → assigned reviewer 实际 claim → reviewer 明确 pass/changes_requested → root 检查当前 hash 与复核证据后 accept → 对应版本的完成云朵**。

新增账本不推导终端/旧活动状态；网页启动时绑定一个真实 root，仅呈现此域。网页“请求复核”产生 pending 收据，原生派发由当前同域 coordinator 承接并记录实际工具证据，网页不运行 agent。账本不增加一个自称自动派发的状态；claim 才代表接收。不能给当前桌面已自动加载的结论，项目入口可真实 stdio 调用与桌面自动发现分开记录。

分层原因：本地父链解决主体归属；专用事务模块解决角色/状态/version；MCP 解决实际操作注册和 actor 独立调用；HTTP 只提供 root 视图及两项 root 操作；UI 只消费收据。这样不建立通用 agent 调度平台。

### research 事实映射表

| 已读事实 | 实现锚点 | 验证锚点与口径 |
|---|---|---|
| 旧 codex_index 过滤 child，activity/completion=unknown | 新 garden_native.resolve_actor；旧文件不改 | 本地临时 DB 父链负例；真实原 child caller/root。旧 API 字段全回归 |
| 精确四 UUID 的 source 中有 thread_spawn.parent_thread_id；一个 child env 与其 UUID 相同 | garden_native 的固定内部适配，逐 id/source 查询 | 缺 env/行/父、错 schema、环、同 cwd/path/runtime 不合域；真实 caller 不由 root 代填 |
| 旧 MCP 恰好三只读；配置并非加载证据 | 新 garden_mcp.build_mcp 与 garden_invoke | 当前 tools/list + tools/call 原始结果；原三工具保持；桌面加载单列未验 |
| Stop、SubagentStop、native completed 非成功；收件 ack 非验收 | garden 任务状态、版本收据、UI deriveSummary | 请求≠接收；失败不推进；accept 前无完成；hash 改动撤销当前完成 |
| gateway 有精确 Host/Origin/client/CSRF、4096 body 与旧空 body | 新专用 GET/POST 分支、原 allowed/reject 保留 | 新入口坏头/重复头/query/body/actor/root/越权/失败均拒绝，旧全部负例再跑 |
| 574×866 实页约 4130px，11–13px 及多层展开 | 独立 garden.js 与仅 garden 模式 CSS；详情渐进展开 | 同视口 after DOM/截图、360/574/1024、完整 key、长中文、键盘，无横向 clip |
| 原机器人实例/工位/步态、48 同质量 60 秒已有有限证据 | cockpit 仅保留 theme 字段，robot3d 只改可选背景/材质色 | 旧完整 fixture、原 --perf48；新 garden theme 宽窄取景/拾取与 DOM 验证 |
| 原生 dispatch 与 caller 可用，但共享 root MCP env 不能辨别 child | 每次真实 caller 独立启动 stdio；root 原生续传 | 原 child submit + fresh 同 root reviewer claim/review + root accept；保存角色不同及工具/产物 SHA |

### 片段闭环充分性说明

下列 S1 父链、S2 事务/状态、S3 工具/HTTP、S4 UI epoch/scene 片段覆盖从身份到操作到收据再到云朵的完整最小链。改变已有 bootstrap、POST 分派、cockpit view 清洗与状态优先级，命中必附片段规则；均给出目标伪代码及插入锚点，不要求接近最终全部实现。没有删除既有函数链或 ≥50 行专用逻辑。

## 3. 详细设计与实施顺序

只做两个风险迭代：**功能迭代 S1→S2→S3，局部验证及真实 stdio/child 闭环；界面迭代 S4，完整回归、实页/同质量验证，再 fresh ReviewImpl**。S1–S4 是 Required Set 的主要工作包；root 是唯一产品作者，各包的 impl 与 coordinator 证据分开记录。

### S1：显式原生父链和调用上下文

**目标/映射**：G12.2/G12.3、N12.1/N12.2/N12.3。新增 session_panel/garden_native.py；关键函数 `resolve_actor(thread_id)`、`actor_from_environment()`。Reviewer 先看此处，确认域从原生父链来，而非 HTTP/MCP 参数或 cwd。目标结构为小型元数据适配器，不复用/改变旧 codex_index 的可见列表。

**输入/输出/边界**：实际入口只读取 CODEX_THREAD_ID，规范 UUID；固定 Codex DB，mode=ro/query_only，逐个 `SELECT id,source WHERE id=?`，不读正文/cwd/标题/其它环境。沿当前本机 `subagent.thread_spawn.parent_thread_id` 追溯，最终 source 必须属于 cli/exec/vscode；返回 actor_id/root_thread_id/显式 parent/path/昵称。重复 id、缺行、坏 JSON/shape、坏 UUID、缺父、环、链超 16、内部 schema 不符或 DB 不可用，返回明确 unavailable，禁止写入。最多 16 是失败预算，不代表支持任意 provider。path/昵称只是显示文本。

来源文件：garden_native.py `resolve_actor`，用途为主链第一段；目标伪代码：

```python
caller = canonical_uuid(os.environ.get("CODEX_THREAD_ID", ""))
seen = set()
current = caller
with readonly_codex_db() as db:
    for _ in range(16):
        if current in seen: raise GardenError("parent_cycle")
        seen.add(current)
        row = exact_id_source(db, current)
        if row.source in ("cli", "exec", "vscode"):
            return Actor(caller, current, explicit_chain)
        parent = parse_current_thread_spawn(row.source)  # No cwd/runtime fallback.
        current = canonical_uuid(parent.parent_thread_id)
    raise GardenError("parent_chain_unavailable")
```

**步骤/依赖/验收**：Gate-2 后新增适配器 → 用临时 SQLite 元数据自证上述负例 → root 复验精确当前 child native 关系。新 MCP 每次进程按实际 caller 启动，不能用 root 启动的共享服务器替 child 署名。Gateway 生产启动只允许 caller==root；make_server 的 garden 注入仅给受控测试，旧默认无 garden。任何工具参数均无 caller/root 覆盖口；root 登记的 target child 是受权操作对象，必须再次解析并验证相同 root，不是调用人覆盖。

**作者体验**：直接函数/清楚 reason，无通用 provider 抽象、权限配置或第二套 UUID。定位 source 解析只有一处，内部格式失败明确提示未接入。

**验证责任/证据不足**：impl-safe owner root 作者，tests/test_garden.py 的临时 DB 用例与完整 command output 存 work/r12-garden-local-command.json；缺则父链本地未验。coordinator owner root，真实 child 环境/stdio caller/原生 parent 精确记录存 work/r12-garden-live.json；此类 DB/真实 agent 调用非 impl-safe，只由承接者执行，缺则真实身份链未验。回滚为撤掉新入口，保留旧观察；不改/回写用户 Codex DB。

### S2：一条任务/产物/复核事务链

#### 本轮修订说明

[修订: PLAN_DEFECT-R2.1] 仅补齐同 digest 在产物或复核证据失效后的重交规则；状态/角色/收据范围不变，旧收据保留历史。snapshot 仍只读派生失效，不写 store。

**目标/映射**：G12.2/G12.3、N12.1/N12.2/N12.3。新增 session_panel/garden.py，关键 `GardenService`、`snapshot`、八项业务方法和 `artifact_digest`。Reviewer 先看角色/状态与 transaction，预见每 root 一份文档、操作明确，不出现通用 queue/pool。

**数据与接口**：workspace 为此项目解析后的绝对根；存储 `work/garden-state/<root UUID>.sqlite`，一张单行 `document(payload TEXT)` 表。payload 包含 protocol_version=1、root_thread_id、revision、actors、tasks、receipts；SQLite BEGIN IMMEDIATE 串行读验写，成功状态和 receipt 同事务，失败回滚。读取 DB 的 root 仍必须与绑定上下文一致。首读不存在是空域，损坏/锁超时是 unavailable，不能清空重建伪造历史。

root 自带 coordinator；root 可登记同域 child 为 worker/reviewer 两种固定角色。登记相同身份/角色幂等，不将昵称、native completed 当能力注册。固定能力由真实函数定义：worker 提交本人已分任务，reviewer 接收和复核已指派任务，root 登记/分配/请求/验收。actor 与 role 每次在 server 端检查；reviewer 必须与提交者不同，root 不得代 submit/claim/review。

任务字段：task_id（root 生成 canonical UUID）、title、assignee_id、预定 artifact_path、version、artifact_sha256、state、reviewer_id、review_request_id、claim_receipt_id、review_outcome/summary/evidence_path/evidence_sha256、accept_receipt_id。receipt 字段：id、root_thread_id、actor_id、operation、source（固定 mcp_stdio 或 panel_web）、created_at、task_id、version、artifact_sha256、result/summary；server 生成 id/time，不能由用户提供成功收据。root/page 操作无需终端权限。

[修订: PLAN_DEFECT-R2.1] 路径限 root 分配的 workspace 相对文件；拒绝绝对路径、空路径、`..`、解析后逃离 workspace、目录和大于 2MiB 的文件；file hash 前后 stat 一致，文件改变则明确拒绝。submit 返回当前 version/SHA；仅当前 artifact 及已存在 review evidence 均有效、且同 path/hash/summary 的同 intent 重试返回既有提交收据。新 hash，或当前 artifact/evidence 链失效后的重交（即使 artifact digest 与已存值相同），均递增 version，创建新提交收据并清除旧 reviewer/request/claim/review/accept 字段，再由 root 请求新版本复核；不能因同 digest 永远复用失效链。审查证据路径同限制且存当前 hash。子 agent 只提交 task 已指定的路径，不能把任意 workspace 文件伪作此任务产物。

**状态机与幂等**：

| 调用/授权人 | 前态与核验 | 后态/语义 |
|---|---|---|
| assign/root | 同域已注册 worker；task_id 新，完全相同 intent 重试复用 | assigned；任务登记，不证明正在执行 |
| submit/assignee worker | [修订: PLAN_DEFECT-R2.1] 本人任务，指定路径可验；仅当前有效链同 intent 幂等，失效链允许 same digest 重交新 version | delivered；清旧 review/accept，再请求复核；已交付待复核，不是完成 |
| request_review/root | 当前 version/hash；不同 author 的已注册 reviewer | review_pending；只记录请求，重复当前请求复用 |
| 原生 collaboration/root | coordinator 使用同 root 已确认 reviewer；工具证据独立保存 | 不由账本虚构派发/接收；工具失败保持 pending |
| claim/assigned reviewer | review_pending；精确当前 request/version/hash，hash 重验 | reviewing；收到接收收据才表示接受，重复本人 claim 复用 |
| record_review/同 reviewer | 已 claim；current version/hash 和复核证据可验；结果仅 pass/changes_requested | reviewed_pass 或 changes_requested；结果明确，尚无最终完成 |
| accept/root | reviewed_pass、作者≠reviewer、claim存在，产物和 review evidence 当前 hash 均相同 | accepted；复核通过，完成交付，重复同验收复用 |
| 任一 current hash 不匹配 | claim/review/accept/snapshot 重验；保留旧收据历史 | artifact_changed，当前完成/权限失效；需作者重交，旧结果标为旧版本；snapshot 只计算失效视图，不写账本 |

来源文件 garden.py 的事务/accept/snapshot，用途为成功边界：

```python
with store.transaction(bound_root) as doc:
    actor = require_registered_actor(context, doc)
    task = require_task_in_this_document(task_id)
    require_operation_role(actor, operation, task)
    require_exact_version_and_hash(task, requested_version, requested_hash)
    require_current_artifact(task)
    if operation == "accept":
        require(task.state == "reviewed_pass" and task.claim_receipt_id)
        require(task.assignee_id != task.reviewer_id)
        require_current_review_evidence(task)
        task.state = "accepted"
    receipt = apply_or_reuse_exact_operation(doc, actor, task, operation)
    save_document_and_receipt(doc, receipt)
# snapshot is read-only: derive artifact_changed and suppress an invalid accepted receipt.
```

**失败与并发**：事务冲突/超时返回 busy，不创建 receipt；非法顺序/角色/异域 task 是拒绝，不显示后续状态；并发相同 submit/request/claim/accept 仅一个实际状态跃迁，重试复用；不同 intent 或 reviewer 重复不能覆盖已接收结果。record_review 完全相同结果重试复用，矛盾结果拒绝，需要作者重交新版本后再请求，不增加同版本复核覆盖入口。snapshot 计算 current artifact/evidence validity，仅返回派生 artifact_changed/当前完成失效；它和 HTTP GET 不写入，原始 accepted 收据留存为历史。每域最多 64 actors/128 tasks/1024 receipts，快照预算 512KiB；到限明确拒绝新记录，不能静默裁切身份或成功证据。固定预算用于本轮有界来源，不创建配置体系。

[修订: PLAN_DEFECT-R2.1] submit 幂等判断必须在事务内重新计算当前 artifact/evidence validity 后执行，不能只比较已存 digest。验收用例保持 artifact 字节不变，仅修改 review evidence：snapshot 派生 artifact_changed 且 store 字节/修订号不变，accept 拒绝且无新成功收据；作者以同 digest 重交产生 version+1 并清除旧 review/accept，随后 request→claim→record_review→accept 可重新闭环。并发同 intent 重交仅一次递增，后一调用复用已恢复有效的新版本提交收据。

**作者体验**：方法名即行为，状态表唯一、固定角色、单文档事务；不建迁移框架/通用 event bus。向 caller 返回可读拒绝原因及实际 receipt，不用注解代服务端检查。

**步骤/依赖/验收**：依 S1 → 新 store 与业务方法 → 本地状态、路径、角色、并发、两 synthetic roots 和 digest 变化负例 → S3 注册实调用。impl-safe root 作者，tests/test_garden.py 与 work/r12-garden-local-command.json；缺则本地状态链未验。coordinator root，原 child 交其已有真实研究报告、fresh reviewer 出真实审查文件、root accept，work/r12-garden-live.json（每步返回、caller/parent、工具证据、路径/SHA、版本与 actor 不同）；非 impl-safe 不由作者以合成数据代替，缺则实际闭环未验。回滚只关闭新入口并备份其新 DB，旧 API 无迁移；不删除用户文件/账本。

### S3：专用 MCP/本地调用与 root 网页边界

#### 本轮修订说明

[修订: PLAN_DEFECT-R2.2] 已核对本机 mcp 1.26.0：ArgModelBase 默认 extra ignore 且允许类型转换，FastMCP 底层 call_tool 注册关闭原始 input 验证。既定未知字段拒绝必须在原始 arguments、SDK 解析前落实；仅新 garden MCP 使用公开 FastMCP 子类，不改 SDK 或旧 MCP。

**目标/映射**：G12.2/G12.3、N12.1/N12.2/N12.3。新增 session_panel/garden_mcp.py `build_mcp`、session_panel/garden_invoke.py `main/invoke`；改 gateway.py `serve/make_server/do_GET/do_POST` 的专用分支。关键锚点是各入口绑定上下文和旧 POST 分派之前的新分支。目标为真实、可调用八项能力，加独立 root HTTP，不扩原三只读 MCP。

注册工具固定：`garden_context()`、`garden_register_actor(target_thread_id, role)`、`garden_assign_task(task_id, assignee_id, title, artifact_path)`、`garden_submit_artifact(task_id, summary)`、`garden_request_review(task_id, version, artifact_sha256, reviewer_id)`、`garden_claim_review(task_id, version, artifact_sha256, request_receipt_id)`、`garden_record_review(task_id, version, artifact_sha256, outcome, summary, evidence_path)`、`garden_accept_artifact(task_id, version, artifact_sha256, summary)`。context 只读提示；其余如实写入提示，结果统一结构化 payload。字段在 FastMCP schema 和业务方法均检查，未知多余字段拒绝；annotations 不代权限。工具不提供 actor/root/command/message/HTTP target/DB path 参数。

[修订: PLAN_DEFECT-R2.2] garden_mcp.py 内使用专用 FastMCP 子类，仅覆写公开 `list_tools`/`call_tool`：`list_tools` 从 `super().list_tools()` 的返回工具复制 inputSchema，设顶层 `additionalProperties: false` 后输出；`call_tool` 从同一公开列表按固定工具名取得同一 schema，先 `jsonschema.validate(instance=arguments, schema=...)` 检查未解析的原始对象，成功后才 `await super().call_tool(name, arguments)`。不调用 SDK 私有 manager、不 monkeypatch ArgModelBase，不只在业务函数检查已被 SDK 丢弃的未知字段；未知工具或验证失败明确拒绝，业务方法仍承担角色/域/状态校验。静态 schema 与实际 stdio tools/call 负例须覆盖 caller/root 未知字段、version=true 和 version="1"，三类均拒绝且不进入业务写入、不新增收据。root 已实跑 jsonschema 的这三类负例 exit0 全拒绝，属于规划可行性证据，实施后仍须验证真实工具入口。

独立 MCP name `subagent-garden`，每次 caller 自己的 shell 启动 `python -m session_panel.garden_invoke --list` 或 `--tool <fixed-name> --arguments-file <workspace-relative-json>`；helper 仅用固定解释器/模块、继承当前 CODEX_THREAD_ID，真实 ClientSession initialize→list→call，打印结构化 receipt，不提供 env/actor 覆盖、不执行任意命令。它是实际工具客户端，不能称当前桌面原生自动加载。模板不修改旧 .codex/config.toml.example 或实际全局配置；根 README 新增调用说明可在最后交付同步。

接口矩阵与兼容：

| 入口 | context/数据流 | 兼容及约束 |
|---|---|---|
| garden_mcp/invoke | 当前进程真实 caller → S1 → S2 固定域 | child 各自启动，root 不能伪装；不走旧 gateway 署名 |
| gateway 生产 serve | root env → S1，caller==root → GardenService；无有效 env 时 garden unavailable | 旧 make_server 默认 garden=None；fixture 旧 bootstrap 不含上下文 |
| GET /api/bootstrap | 原 csrf/app，bound garden 时另 `garden_root` | 原字段/客户端仍接受，fixture 不触发新模块 |
| GET /api/garden（无 query） | 绑定 root 的 snapshot | 不接受选 root 参数；未绑定明确 unavailable |
| POST /api/garden/request-review | body 正好 task_id/version/artifact_sha256/reviewer_id | 固定 root 操作；只 pending，不自动派发 |
| POST /api/garden/accept | body 正好 task_id/version/artifact_sha256/summary | root 验收，服务端先验状态/hash；不能从 UI 代 child |
| static /garden.js | 固定新白名单；原 CSP self 仍适用 | 不松 CSP；无 garden bootstrap 不 import |

[修订: PLAN_DEFECT-R2.2] 来源 gateway.py 的 do_POST/bootstrap、garden_mcp.py 公开子类与工具闭包，用途是原始参数先验、对外域不能覆盖：

```python
class GardenMCP(FastMCP):
    async def list_tools(self):
        tools = await super().list_tools()
        return [tool.model_copy(update={"inputSchema": {
            **tool.inputSchema, "additionalProperties": False,
        }}) for tool in tools]

    async def call_tool(self, name, arguments):
        tool = require_known_tool(await self.list_tools(), name)
        jsonschema.validate(instance=arguments, schema=tool.inputSchema)
        return await super().call_tool(name, arguments)

context = actor_from_environment()  # Once per actual caller process, no tool override.
garden = GardenService(context)
@mcp.tool(annotations=writing_annotations)
def garden_submit_artifact(task_id: str, summary: str) -> dict:
    return garden.submit_artifact(task_id, summary, source="mcp_stdio")

# gateway: allowed(api=True, focus=True) and the existing bounded body checks run first.
if path.path in GARDEN_POST_ROUTES and not path.query:
    body = read_bounded_json_object(maximum=4096, cumulative_deadline=0.25)
    require_exact_fields(body, GARDEN_POST_ROUTES[path.path])
    return reply(garden_root_operation(path.path, body, source="panel_web"))
# Existing focus/connect keeps exactly {} and original UUID/pane/workbench guards.
```

新 body 读取也以 earliest deadline 累计 250ms，重复 Content-Length/Content-Type、Transfer-Encoding、非 JSON 对象、坏 UTF-8/非有限数字及 >4096、未知字段/query 均拒绝；复用旧 allowed/reject 的精确头检查及早拒绝 drain，不改变旧 focus/connect 读取语义。业务拒绝明确 409，unavailable/busy 503，非法输入 400；成功仅是相应操作记录。

**步骤/依赖/验收**：依 S1/S2 → 专用注册/调用 helper → gateway 小分支 → tools/list/call 与新 HTTP 负例 → root 核查 owned 8766。impl-safe root 作者，test_garden/test_garden_mcp/test_gateway 中新合成断言、语法，work/r12-garden-local-command.json；缺则注册/handler 未验。coordinator root，真实 stdin initialize/list/call 与每 actor 操作、实际 8766 bootstrap/root/snapshot/资源 SHA，work/r12-garden-live.json、work/r12-garden-service.json；非 impl-safe/实际服务不由合成端口替代，缺则实页接通未验。

**部署/回滚**：root 正式 reload 前再次对 work/live-session-gateway-reload-h1.json 核验 listener/launcher 的 PID、绝对路径、argv、直接父关系、birth 与 8766 归属，保留对应进程 handle 后才停止这一自有网关，Start-Process Hidden 重启并保存新 owned 记录。任一证据不符保留用户服务，明示未部署。绝不停止 WezTerm/Claude/其它用户进程。失败恢复保全的原 gateway 字节并只重启这一自有网关；新 DB 保留备份，不删除。作者体验用固定工具/JSON 文件示例，无新配置语言或多层代理；文档分清代码注册、本次实调用与桌面自动加载。

### S4：田园工作空间、真实 child 角色与云朵

**目标/映射**：G12.1/G12.2/G12.3、N12.1/N12.2/N12.3。新增 web/garden.js（局部导出 mount/refresh/selectActor/getView/dispose）；改 index.html 的小院入口、style.css 的 scoped garden 模式、app.js 的 bootstrap/选择/refresh/renderCockpit、cockpit.js 的 view theme 透传；robot3d.js `update` 仅可选 theme 材质色。Reviewer 先看 app bootstrap→garden view→cockpit→当前 accepted 摘要，预见新功能一个模块、原观察 tab 原 IDs 保留。

**目标界面**：默认仅 bound garden live 显示“协作小院 / 会话观察”切换。小院有主聊天完整 key 的可展开领域说明、任务计数、原 420px 3D 庭院和正常字体的 child 工位卡；桌面工位列表/选中详情两列，窄屏单列。奶油背景、柔草绿、木色边框、低饱和天色，CSS 小像素机器人轮廓/少量草木装饰，正文 16px/1.6、次要文字至少 13px、主控至少 40px 可点。原生详情展开完整 UUID/parent、注册能力/产物版本/SHA/收据，不把不可定位的 child 加 focus 按钮。任务多时渐进详情，避免永久五节点说明及多个大列表同时占屏。

`garden_context` 只输出此 root 已真实登记 actors/tasks/receipts；无登记不凭 native lifecycle 添完成角色。worker 显示“产物交付”，reviewer 显示“接收 / 复核”，root 操作区提供真实“请求复核”和“验收交付”；权限/版本/hash 不满足禁用并解释。worker/reviewer 操作由其 actual tool caller 执行，网页不提供冒充按钮。请求后清楚显示“已记录，待同会话协调者派发/接收”。完成摘要只取当前 hash 有效 accepted receipt；delivered/reviewing/changes_requested/reviewed_pass 各用明确阶段云朵。详记录点开，history 标旧版本。新 accepted id 出现时一次性 aria-live/柔和弹出，支持收起；不按轮询反复宣读，不用计时消失掩盖状态。

**域/迟到响应**：仅 bootstrap 明确 garden_root 后动态 import('/garden.js')，无上下文保持原 fixture/UI/网络。每次请求捕获 generation/root，接受必须 response.root_thread_id 等于绑定 root、generation 未变且本域仍被选择；切到异域 Codex 主身份或远端来源，清空 garden cards/details/bubbles 与 pending 文案、禁用写入，不请求或操作所选异域。重新回当前小院须显式选回固定 bound root，不按 cwd/root 名称恢复。切观察 tab 使用旧 cockpit view，切小院用真实 child `codex:<UUID>`；拾取分流优先 garden membership，禁止 child key 落到旧主身份列表/remote 消息。root 缺上下文或坏 snapshot 显示未接入，不合成角色。

来源 app.js bootstrap/renderCockpit/selectRobot 与 garden.js 的 refresh，用途为 UI 主链末端和迟到拒绝：

```javascript
query('/api/bootstrap').then(async value => {
  state.csrf = value.csrf_token; // Existing workbench/selection behavior remains.
  if (isCanonicalUuid(value.garden_root)) {
    const module = await import('/garden.js');
    garden = module.mount({ root: value.garden_root, query, csrf: () => state.csrf, onView: renderCockpit });
  }
});
async function refreshGarden() {
  const attempt = generation, expected = boundRoot;
  const next = await query('/api/garden');
  if (attempt !== generation || selectedDomain !== expected) return;
  if (!validSnapshot(next) || next.root_thread_id !== expected) return clearUnavailable();
  renderCurrentReceipts(next);
}
function renderCockpit() {
  cockpit?.update(garden?.getView() ?? originalObservationView());
}
function selectRobot(key) {
  if (garden?.owns(key)) return garden.selectActor(key);
  // Original Codex/remote routing and guard semantics remain.
}
// cockpit.update preserves only a validated optional theme; robot3d.update applies colors only.
```

**3D 与生动边界**：theme= garden 时仅 scene.background/floor/grid 等材质色偏草木，不改 geometry、lighting 强度、巡游参数、AA/DPR、粒子、实例、人数或 frustum fitting。category 保持旧位置语义，业务状态由 DOM 文案表达。原旋转/暂停/巡游/模式/拾取/降级不改；新 CSS bob/草叶是装饰，document.hidden/暂停/减少动态时停止，不冒充真实执行进度。3D 不可用仍有完整可键盘 child 工位列表。

**步骤/依赖/验收**：依 S3 功能真实闭环 → 新 garden module/局部 CSS → 既有场景桥接 → 两域与迟到/键盘/长文本 fixture → coordinator 真实 8766 DOM/截图 → old full fixture +48 同质量60秒 → fresh ReviewImpl。目标 after 574×866 默认小院（三个已登记研究 child、折叠详情）页面高度 <2600px，相对 before 4130px 明显减少；首屏可见领域、任务摘要和庭院，不靠隐藏关键结果达成。360/574/1024 下 document.scrollWidth≤innerWidth、完整 key 可展开/复制、控件不夹截、Tab/Enter/Space/焦点回到正确角色，普通字体/状态非纯颜色。指标不是所有硬件舒适度承诺。

**验证责任/作者体验/回滚**：impl-safe root 作者，Node module syntax、HTML/CSS 静态 scope/桥接差异与可控数据验证，work/r12-garden-ui-local.json；缺则 UI 本地未验。coordinator root 承接 browser fixture/真实 CUA、截图/DOM、旧 full与持续性能，work/r12-garden-browser-command.json、work/r12-garden-iab.json/.jpg、work/r12-garden-perf48-command.json；这些非 impl-safe 不由作者声明，缺则相应视觉/隔离/性能未验。局部方法即页面行为、原代码少量 hook，正常中文避免像素字体与无意义状态图标。回滚关闭新入口恢复 S4 before，仅保留已验证功能和新账本；原观察面板/IDs/动作完整，不隐藏 fixture 原控件以换回归。

## 4. 验证命令、真实闭环与交付门

本地起步命令：`.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_garden tests.test_garden_mcp -v`；静态 Node --check app.js/cockpit.js，新 garden.js/robot3d.js 以 module --input-type=module --check（脚本用 subprocess input 传入，不以管道尾更换退出码）。完整回归：`.venv/Scripts/python.exe -X utf8 -B -m unittest discover -s tests -v`；`C:/nvm4w/nodejs/node.exe tests/verify_robot_cockpit.cjs --fixture`；`... tests/verify_robot_cockpit.cjs --fixture --perf48`。新独立受控 browser fixture `tests/verify_garden.cjs` 注入明确 synthetic garden 上下文，不让旧无上下文 fixture 新增网络。新增测试验证真权限/状态/隔离，不为简单颜色或实现镜像写测试。

功能负例要覆盖：缺 actor/坏父/环/同 cwd/path/fork runtime、跨 root task/reviewer/receipt、伪 actor/root参数、未登记/错误role、作者自审、未 claim/未 pass 直接 accept、stale version/digest、审查证据改变、submit 后文件变化、重复及并发、路径逃离/大文件、DB坏/锁超时、失败无成功收据；gateway 新旧头/CSRF/body负例；UI domain 切换/迟到响应/重复播云朵/当前结果失效/图形回退。

真实闭环顺序：root 登记 `r12-current-child-bindings.json` 中原研究 child 为 worker、fresh 同 root reviewer 为 reviewer并分任务，root不代写 child；通过 followup_task 原 child 在自己进程 `garden_invoke --list`、submit 自己的已存真实报告。root request → 原生 collaboration 续传包含精确 task/version/hash/request receipt → reviewer 自己 claim，读真实 artifact并写审查文件，再 record_review；root 独立读证据/复算 SHA 并 accept。保存每个真实 caller/root/parent及8工具发现结果、actual tools/call receipt、原生派发工具证据与多步失败/重试，不保存聊天正文/凭据。fresh 实施审查者不兼任这一业务 reviewer或实现者。第二 root 边界使用合成 native metadata 两 root 文档与HTTP/UI负例，无授权去操作其它用户主聊天。

持续性能保持原验收条件：48 identities、每机器人15/工位5 parts、192粒子（size .075/opacity .6）、AA、原DPR/backing、巡游真实速度、normal polling、零 body/action请求、连续可见60秒；目标 fps≥60、p95≤20ms、>33.3ms 比例<1%、draw calls≤128。只声明本机受控 Edge 窗口；另核查实际小院主题真实取景和拾取，不用短窗 FPS 替代连续样本。

最终 impl_report_r1.md 和 fresh review_notes_impl_r1_1.md 绑定当前 patch/manifest、全 stdout/stderr/exit、所有红/修复后绿、责任分层及本次边界。若产品在审查后再变，旧 ReviewImpl 作废重验。历史 R11 红：首全fixture1392/1与1397/2、CSRF36/1、窄屏42/1、旧短窗/60秒性能、真实23/1 workbench_timeout/exit1、两条 Pydantic warning均保留，不能以本轮绿抹除。

## 5. 风险、对齐与澄清协议

| 不确定点/风险 | 关闭或降级 |
|---|---|
| 当前内部 source schema/version | S1 current shape/显式父链自证和实调用；坏则未接入，不猜 |
| shared MCP env 可能 root 署名 | 每 actor 独立 stdio helper，原 child 实际调用；失败则真实能力未验 |
| 桌面自动发现/热加载 | 不改全局配置；本轮只证明注册与实际 local stdio，自动加载保持未验 |
| hash/version 与并发失效 | S2事务、每关键步骤重验、snapshot撤销当前气泡；不能沿用旧验收 |
| pending 长期无人派发 | UI如实待协调者；coordinator承接native dispatch/claim。不新增通用消息broker |
| owned8766不再吻合 | S3再次完整归属核验；不杀用户进程，保留旧服务且部署未验 |
| 田园视觉与旧回归冲突 | S4 root绑定时启用、无上下文旧视图；不松测试/守卫/画质换绿 |
| 单文件文档/量级变大 | 固定有界预算拒绝新状态；若需要更多provider/调度功能回退范围，不临时抽象 |

**事件触发对齐留痕位置**：本节“对齐记录”及主要包对应 impl_report。新假设、新风险、LW→Review(LW)、Gate2→Impl、功能→界面均先告知 coordinator，记录输入/风险/承接者；不设固定次数。当前已记录：Readiness PASS后进入LW；选择可信本地上下文/独立stdio，满足基线不扩大OS认证；选择pending+真实claim，保留原生dispatch外部证据；新增局部UI而不改旧观察链。当前未发现仍未收口的 contract drift，Readiness首版1–5节和原文目录缺口保留在原review中。

**批量提问模板与优先级组织方式**：本轮未触发，因为用户why/boundary已明确，how已由事实与保守边界收敛。若scope/验收/回滚不唯一，或需跨root/新provider/任意执行/全局配置假设，按P0阻塞→P1高风险→P2优化一次批量回传，不限问题数，停止受影响步骤：

```text
【DELEGATE_QUESTION】
需要用户确认：Q1 [具体范围/约束/验收/回滚问题]
优先级：P0 | P1 | P2；影响阶段：LWPlan | Review(LW) | Impl
A) [推荐路径与原因]；B) [替代路径与权衡]；C) [需具体补充的边界]
请一次性回复：Q1=A, Q2=B ...
```

若仅需外部/真实调研由 coordinator 承接，返回【DELEGATE_ACTION】，不递归委派或自行执行用户进程动作。主体/范围冲突回退Readiness/基线；计划不足原地修订唯一lwplan并fresh ReviewLW，不创建 lwplan_*。

## 6. Gate-1 Required Set 自检与 Gate-2 责任

Required Set 采用存在性门禁，任一必备项缺失不放行；没有“至少N任务”或固定澄清数。T3继承T1/T2全部要求。

| Required Set | 自检锚点 |
|---|---|
| T1.1 目标锁/反目标/不影响项 | §1完整G12/N12与旧边界 |
| T1.2 文件/首落点清单 | S1–S4关键路径/函数；无旧函数链删除 |
| T1.3 分阶段、目标/变更/步骤/验收/回滚/依赖/形态 | S1–S4各包与§3两个风险迭代 |
| T1.4 逐包目标/反目标映射 | 每包首段显式G12/N12 |
| T1.5 验证分层与三元组 | 每包impl-safe/coordinator、owner/产物/缺证据约束、非impl-safe |
| T1.6 作者体验与声明可读性 | 每包独立约束，固定方法/角色/局部hook，不以缩字符判成功 |
| T1.7 核心链路总览 | §2先当前链→新增链→不改层/分层理由 |
| T1.8 research事实映射 | §2表逐事实→锚点/验法/口径 |
| T1.9 片段闭环充分性 | §2说明+S1–S4顺读身份/事务/外部入口/UI完整链 |
| T1.10 四项显式自检及复杂链 | 本表及下段字段 |
| T1.11 双门与失败回退 | 本节Gate1/freshReviewLW/rootGate2→Impl禁入 |
| T1.12 澄清触发/批量模板 | §5关键假设、优先级和受控出口 |
| T1.13 风险/降级/Gate2复核 | §5风险表、本节字段 |
| T2输入/输出/边界/关键实体/测试分层与回归 | S1–S4、§4命令与负例 |
| T3跨模块接口/状态/兼容迁移/停机策略 | S2状态表、S3接口矩阵/owned恢复、S4无context兼容 |

Gate-1作者自检明确：**目标锁/反目标映射完成**；**验证责任分层已落盘**；**证据产物/责任归属/证据不足约束已落盘**；**作者体验门证据已提供**（各包可预见的目标结构与写法，并非UI实际体验已验）；**核心链路总览/research事实映射/片段闭环充分性已落盘**。执行静态 Gate 命令的输出/退出码落 work/r12-garden-plan-gate1-command.json、work/r12-garden-plan-gate1.json；未执行前不填PASS，字段存在不能代产品验证。

| P1–P9 | 承载与执行 |
|---|---|
| P1 | 不以任务数量作门槛，§3按风险划S1–S4 |
| P2 | 本节Required Set存在性硬门；planner自检 |
| P3 | 任一缺项即FAIL，不打分，fresh reviewer复核 |
| P4 | 本轮T3，继承T1/T2并补跨层状态/接口/兼容/停机 |
| P5 | §5关键不唯一回【DELEGATE_QUESTION】，不假定新范围 |
| P6 | §5事件触发对齐留痕，owner coordinator承接 |
| P7 | 问题数无上下限，按真实不确定性 |
| P8 | §5P0/P1/P2批量模板，本轮未触发及原因已写 |
| P9 | Gate1 planner；Gate2 fresh review主检+root复核，失败禁Impl |

Gate-2必须由未参与本计划的 reviewer 读本文件/完整基线/事实/现有代码，显式十字段 Required Set、目标反目标、关键锚点、片段充分性、作者体验、人工review对齐、P1–P9、基线一致、设计味道、Gate2；root 独立复核输入SHA和链路。协议PASS及全部字段放行才实施；WARN按plan-review既有口径收口。若 reviewer仍需跨包拼图、需新架构决定、证据责任不清或过度设计，退回此唯一文件修订。当前 **allow_enter_impl=no**，等待freshReviewLW/rootGate2。

本轮文档读取首个聚合结果截断，已按技能/研究/代码单文件补读，不用截断输出放行。无新增跨功能事实。英文提交建议仅供之后有Git时用：`feat(garden): register scoped artifact handoff and review tools`、`feat(garden): add cozy subagent spaces and verified result bubbles`；当前不执行Git。
