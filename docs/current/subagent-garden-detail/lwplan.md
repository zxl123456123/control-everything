# R13 清晰主界面与角色详情：唯一低层实施计划

日期：2026-10-06（Asia/Shanghai）。任务分型 **T3**（原生只读源 → root HTTP → 页面详情与场景）。权威输入：本目录 `source_materials/feedback_r13.md`、`clarifications.md` 完整实现基线 1–10、`research.md`、Readiness 第 1 轮 REVISE 与第 2 轮 PASS。`../subagent-garden/lwplan.md` 与 `review_notes_impl_r2_1.md` 只作 R12 兼容输入。本计划不修改 R12 业务账本与旧审查历史；无 Git，不初始化。

## 1. 范围、目标锁与不影响项

**G13.1** 主屏在 360/574/1024 宽显示同根伙伴数、角色、负责事项、已发生的任务阶段和待关注结果；显式点选后展示职责/能力、任务、可核验收据节点及时间、产物和有限公开发言，键盘与长中文可用。**G13.2** 发言仅取当前 root 已登记子agent的本机原生公开 assistant `commentary`/`final_answer`，按需、只读、有界、同根，不称完整聊天。**G13.3** 小院自主巡游，用户选角色或 3D/像素/文字模式即可，不需操纵动作；场景运动仍是装饰。

**N13.1** 不用动画、`updated_at`、最近发言或回合结束推断实时工作、百分比、完成。**N13.2** 不接收外部 caller/root/path，不扫描目录、不跨主会话、不送整份 rollout，不读 developer/system/user/tool/reasoning/未知形状。**N13.3** 不改 `GardenService` 账本事务、R12 收据语义、旧远端观察/终端控制；不削减原 3D 几何、AA、DPR、粒子、角色量和巡游速度。不改 `codex_index.py` 对非子agent的索引语义，不把本机只读格式当公开稳定 API。当前 OS 账户与 loopback root 网关是既定信任边界，不承诺抵御同账户恶意改原生 DB/环境。

主界面“进度”只表示**已发生**的业务节点，任务为 `assigned → delivered → review_pending → reviewing → reviewed_pass/changes_requested → accepted`，当前 SHA 无效时 `artifact_changed` 优先；不展示虚构百分比。R12 完成摘要云朵、同根不同 actor 的交接复核与主会话隔离原样保留。主屏的少量信息与详情的长内容渐进呈现，公开发言绝不进入 `/api/garden` 快照或默认轮询。

## 2. 核心链路总览与接口矩阵

**现状主链**：`CODEX_THREAD_ID → garden_native.resolve_actor → GardenService.snapshot` 逐个验证 actor 与 root → `gateway.garden_reply` → `garden.js.refresh/render` → 卡片/云朵/3D。用户点角色只切换账本详情；`garden.js.getView` 给全部角色 `category:'unknown'`，3D 内没有 worker/reviewer 角色说明。`cockpit.js` 默认 `roamingEnabled=true`，但露出巡游、动画、相机按钮。旧 `/api/sessions/<id>/messages` 来自远端，不能代表本机 Codex 子agent。

**本轮主链**：快照仍是唯一任务/收据事实 → 主屏从 actor/task/receipt 投影简短角色、职责、当前业务节点与待关注数 → 明确点选 actor 时，先用已核验快照呈现身份/任务时间线，同时单独 GET 固定 actor URL → 网关重新核对当前 root 的已登记成员和原生父链 → 只读原生索引精确 `id` 得 `rollout_path` → 路径与 JSONL 类型白名单 → 返回有界公开发言 → 前端再次比对 root/actor/选择代次后纯文本渲染。切域、切视图、换角色、请求过期均撤销晚到结果。页面初载/10 秒轮询只取旧 `/api/garden`；公开发言没有自动预取、自动轮询或隐藏页读取。

**不改层及原因**：`garden.py` 的 `apply/mutate/validity` 不参与发言读取，以免原生日志变化污染历史收据；旧远端消息路由不复用，以免混淆来源；`robot3d.js` 的质量/运动/拾取机制不改，角色标识采用与视图相邻的 DOM 名牌及卡片，让语义可读且不额外增加绘制成本。仅在 `cockpit.js.update` 的小院主题切入点恢复默认巡游，沿用 `prefers-reduced-motion`。

| 跨层边界 | 输入 → 输出与失败语义 | 实现位置 / 兼容 |
|---|---|---|
| 原生身份与索引 | 服务持有 root；所请求 actor UUID 先由同根已登记快照确认，原生 `resolve_actor` 再确认；精确 `threads.id=?` → 唯一 `rollout_path`，异常即发言不可用 | 新 `session_panel/garden_public.py` 只读 helper；`garden_native.py` 的父链行为不改 |
| 原生文件 → 摘录 | 仅固定 sessions 根内、文件名尾部 actor UUID 的 `.jsonl` 普通文件；限总读字节/单行/消息数/文本长；严格 `response_item.message` + assistant + phase + output_text；异常关闭 | `garden_public.py`；不回退扫描/其它事件类型 |
| HTTP | `GET /api/garden/actors/<canonical-uuid>/public-messages`，无 query/body；现有 Host/Origin/`X-Session-Client` 守卫；返回 `{available,root_thread_id,actor_id,coverage,messages:[{phase,text,created_at}]}` 或 `{available:false,reason,root_thread_id,actor_id}` | `gateway.py.do_GET` 在通用旧 `SESSION_ROUTE` 前处理；无 garden 为 503，同根外 actor 为 404/409，坏 URL/query 为 400/404；不可借外部参数改 root/path |
| 页面 | 初屏只用已验证 R12 快照；显式选中发起独立 GET；代次/根/actor/选择三重比较后显示；空或错误有明确文案 | `web/garden.js`、`index.html`、`style.css`；`app.js` 仍只在 bootstrap 有 `garden_root` 时 mount |
| 场景 | 小院主题恢复默认自主巡游，隐藏小院的 roam/motion/rotate 控件；保留模式/角色点选，旧观察主题行为不变 | `cockpit.js.update` 的主题切入与 scoped CSS，不改 Three.js 模型品质 |

### research 事实映射表

| 已核事实 / 不确定性 | 实现锚点 | 测试或验证锚点与口径 |
|---|---|---|
| R12 root 来自原生父链、账本每 root 单文件，快照重查注册成员 | S1 `GardenService.snapshot` 只读成员门、`garden_public.read_public_messages` | `tests/test_garden_public.py` 双根/未登记/父链漂移；不以同 cwd 代替同根 |
| `state_5.sqlite.threads` 本机含 `id,rollout_path,source`，但 schema 非公共 API | S1 精确 SQL `WHERE id=?`、只读连接 | 缺列/重复/空路径/锁/坏库→不可用；真实当前 child 只读抽查由 coordinator 承接 |
| Windows 普通盘符与 `\\?\` 扩展路径混用 | S1 统一规范化后根归属/文件名检查 | 普通/扩展正例；UNC/逃逸/大小写/软链/其它文件名负例；不 `rglob` |
| JSONL 同时有公开 message、developer/user、reasoning、tool、镜像 `event_msg.item_completed` | S1 单一 `response_item.message` 白名单 | 私有类型、未知 phase/content、镜像去重（因仅采一种源）、损坏/超预算均不泄漏 |
| coordinator 新补的四个同根 child 元数据样本为 0.83–1.77 MiB，最长行 98–135 KiB（不读正文） | S1 文件 4 MiB/单行 256 KiB 有界预算 | 四个真实样本可解析预算；256 KiB+1 行失败关闭；不因预算提高而放宽类型白名单 |
| R12 `receipts` 含 `operation,task_id,version,actor_id,created_at,result`，当前 SHA 失效有 `current_valid=false` | S2 从 receipt 派生节点而非时间/动画推断 | `verify_garden.cjs` assigned→accepted/changes_requested/失效、历史版本；当前失效撤销成功文案 |
| 当前 `taskFor` 取最后关联任务，3D `category=unknown`，无公开发言 UI | S2 主屏/详情投影、场景名牌 | 360/574/1024、长中文/键盘/文字回退/迟到回复；不误称所有任务只一项 |
| `cockpit.js` 默认巡游，但露出三个动作控件组；旧观察模式有用户习惯 | S3 小院主题恢复默认/仅 scoped 隐藏 | 切观察→停巡游→返小院恢复；旧观察控件与完整回归不变 |
| Edge 60 秒样本不能证明 IAB 前台帧率 | S3 实页/性能责任分层 | coordinator 同质量 48 角色持续样本与真实 IAB 前台分别报告；缺一不替代 |

**片段闭环充分性**：下文 S1 的“成员→精确索引→规范路径→白名单”伪码、S2 的“收据→阶段/详情→按需 GET→代次判定”伪码与 S3 的“主题切换→自主巡游/隐藏按钮”伪码，按顺序覆盖身份、数据、HTTP、呈现和旧场景兼容的最小闭环。它们命中旧分支与跨文件协议/优先级改动的必附代码片段条件；每段写明来源与拟插入位置，仅提供 reviewer 可预判的结构，不铺完整 after 文件。无整条函数链删除或 ≥50 行专用逻辑移除。

## 3. 详细设计与实施顺序

三个主要工作包按 S1 → S2 → S3；根作者实现，独立 reviewer 不参与产品编辑。S1 的本地只读功能闭环经 impl-safe 验证后才接 S2；S3 后由 coordinator 核真实环境和全回归，最后 fresh ReviewImpl 审最终字节。每包均以 R12 冻结旧字节为回滚起点，不丢用户已有账本/产物。

### S1：同根、按需且有界的原生公开发言读取

**目标/映射**：G13.2，并给 G13.1 详情提供真实材料；防 N13.1/N13.2/N13.3。**关键文件/函数/接口**：新增 `session_panel/garden_public.py` 的 `read_public_messages(garden, actor_id)` 与内部 `resolve_rollout_path/parse_public_line`；修改 `session_panel/gateway.py` 的 `do_GET` 固定路由及专用 `garden_public_reply`；新增 `tests/test_garden_public.py`、扩 `tests/test_garden_gateway.py`。Reviewer 先看该 helper 的前置根/成员检查，再看网关守卫在路由前执行：目标是小型只读适配器，而非 R12 账本方法或新通用消息服务。

**输入/输出/边界与协议**：输入只接受 URL 中 canonical actor UUID（`canonical_uuid` 后要求等于原字符串，含大小写策略与旧 API 一致），不收 caller/root/path、query/body；网关 garden 服务必须绑定主 root。`garden.snapshot()` 先做 root 本身与所有已注册 actor 原生复核，再要求 actor 在其 `actors` 且 actor≠root；二次 `garden.native(actor_id)` 必须等于登记的 root/parent 等当前可信字段。精确打开 `NATIVE_DB`（或 fixture 注入 `garden.native_db`）的 SQLite `mode=ro`、`PRAGMA query_only=ON`，`SELECT id,rollout_path FROM threads WHERE id=?` 只允许唯一行，字段必须是合理长度的字符串。不存在、schema 漂移、DB 错误均失败关闭。

`rollout_path` 先拒绝相对、UNC、驱动器不明、NUL/控制字符与词法 `..`；仅允许 Windows 普通盘符绝对路径和 `\\?\C:\...` 驱动器扩展形式，统一为普通盘符再与同样规范化的固定 `NATIVE_DB.parent / 'sessions'` 比较，之后 `resolve(strict=True)` 检查仍处于 sessions 根、是普通文件，文件名必须精确 `<actor UUID>.jsonl`。遇到符号链接/文件被换导致归属不明即拒绝。不得从 `CODEX_HOME`、URL、cwd、HTML 或目录扫描寻找替代路径；不开放 `\\?\UNC`。Windows 规范化/根包含判定在同一 helper 中，使用路径组件语义，不作字符串前缀比较。若平台非 Windows/格式不受支持，返回不可用；本轮不擅自宣称跨平台。

预算定为**文件大小 ≤4 MiB、实际顺序读取 ≤4 MiB、单 JSONL 行 ≤256 KiB、最多回传最近 6 条、每条文本 ≤1200 Unicode 字符、总响应文本 ≤7200 字符**。coordinator 对四个真实已登记 child 只测元数据：文件 0.83–1.77 MiB、最长行 98–135 KiB，故 64 KiB 会把多数真实记录错误判为不可用；256 KiB 覆盖当前样本并保留有限预算，实施验收需核四个样本都不过预算且 256 KiB+1 负例失败。文件超过预算、读取前后 size/mtime 改变、任何一行不完整/非法 JSON、白名单候选形状异常，都返回 `available:false`，不尝试从尾部猜记录、不泄露部分文本；正常但没有白名单候选返回 `available:true,messages:[],coverage:'无可展示的公开发言'`。选择候选时要求外层 `type='response_item'`、`payload.type='message'`、`payload.role='assistant'`、`payload.phase∈{'commentary','final_answer'}`、`payload.content` 为列表且每个采集项均为 `{type:'output_text',text:str}`；其它角色、`event_msg`、reasoning、tool、未知 phase 跳过，不转发原始 JSON、metadata、路径或私有字段。文本截断标记在响应字段/文案里，不伪称完整聊天；`created_at` 仅取外层有效 timestamp，缺失时显示“时间未提供”，不据此推断工作状态。`messages` 文件顺序中取最后 6 条，保留 phase 标签，使用 `coverage` 说明“本机当前记录内最近的有限公开发言”。

**目标伪码**（来源 `garden_native.py:resolve_actor`、`garden.py:snapshot`、`gateway.py:do_GET/garden_reply`，拟插入专用 helper 与旧 `SESSION_ROUTE` 之前；用途是显示判定顺序）：

```python
def read_public_messages(garden, actor_id):
    doc = garden.snapshot()  # fail closed on root/member native drift
    member = doc['actors'].get(actor_id)
    if actor_id == garden.context.root_thread_id or not member:
        raise GardenError('actor_not_in_domain')
    assert_same_native_member(garden.native(actor_id), member, garden.context.root_thread_id)
    rollout = exact_readonly_rollout_path(garden.native_db, actor_id)
    file = canonical_regular_file_beneath_fixed_sessions_root(rollout, actor_id)
    return bounded_response_item_assistant_text(file)

# do_GET: allowed(api=True) has already run; no query accepted.
if match := GARDEN_PUBLIC_ROUTE.fullmatch(path.path):
    return self.garden_public_reply(match['actor_id'])
# Existing /api/garden and /api/sessions/<id>/messages branches retain semantics.
```

`assert_same_native_member` 用字段比较或现有 dataclass 值，不能靠 nickname/目录猜 actor。测试接口通过临时 SQLite/固定 `sessions` 根注入，不修改生产硬编码原生索引。HTTP 200 仅有界公开数据，unbound/native/ledger/format/path/预算失败 503 或明确 `available:false`（错误消息不含原生路径/文本）；异根/未登记 404/409 且无信息性枚举；非法 URL/query 400/404。旧 `allowed()` Host/Origin/客户端头、旧 POST CSRF、旧静态路由及无 garden fixture 行为原样保留。

**步骤/验收/回滚**：先只读 helper 与固定样本负例，后接 GET 及网关负例，再用有效同根 fixture 核输出确为至多 6 条纯公开文本；所有私有类型与跨根、路径逃逸、坏格式、并发变化都无泄漏。若实际本机路径或 schema 不符，页面如实“发言不可用”，不扩大白名单/放开路径。回滚移除专用 route/helper，保持旧 `/api/garden` 和本地原生索引不变；不删除 rollout 或 R12 DB。

**验证责任/证据三元组**：impl 作者仅跑 `tests/test_garden_public.py`、`test_garden_gateway.py` 及 Python 全回归，存完整 stdout/stderr/exit 和 fixture 路径负例清单于 `work/r13-public-local.json`；缺证据则只能称白名单/隔离未验证。coordinator 承接实际已登记同根 child 的只读摘录与 8766 GET、原生索引/路径形状核对、HTTP 头与资源 SHA，落 `work/r13-public-live.json`；此真实 OS/服务验证不由 impl-safe 合成测试冒充，缺则“真实接通未验证”。独立 reviewer 在最终字节复查白名单、源路径和两份证据，任何缺口不放行对应结论。

**作者体验门**：只有一个专用读取入口和固定 route，无可配置“任意文件/任意角色”参数；公开输出模型写明来源、覆盖和截断，方法名/拒绝原因与测试名能直接对应，便于维护者判断为何拒绝。

### S2：主屏信息层级、收据时间线与渐进发言详情

#### 本轮修订说明（ReviewLW r1 → r2）

第 1 轮 ReviewLW 的 F1 指出：原方案只把角色/负责事项/阶段放在 `garden-panel` 卡片，而当前 DOM 的 `robot-panel` 位于其前，不能保证 360/574 首屏看见具体伙伴信息。本修订在 `robot-panel` 的 `garden-peek` 与真实 `robot-stage` 之间新增紧凑 `#garden-scene-roster`，直接放每个已登记角色的可点选名牌；每个名牌固定显示姓名、`role` 对应的提交者/复核者、最新关联任务标题或“待任务”、当前经账本证实的阶段。角色多于首屏容量时显示总数和“查看更多伙伴”指向完整工位列表，不能以未展示角色代表全部。原 S1/S3 与已有 S2 收据/对话实施支撑文字不删；本轮只补 G13.1 的首屏落点和视口断言。

**目标/映射**：G13.1/G13.2；守 N13.1/N13.2/N13.3。**关键文件/函数/接口**：`web/garden.js` 的 `validSnapshot`, `taskFor`, `summary`, `selectActor`, `observeDomain`, `switchView`, `render`, `refresh`；`web/index.html` 的 `garden-peek`、`garden-actors`、`garden-detail` 及新角色名牌/发言容器；`web/style.css` 仅 scoped garden 规则；`tests/verify_garden.cjs`。Reviewer 先从 `validSnapshot`→当前任务投影→`render` 主屏/详情→按需 GET 的代次判断顺读。目标结构为概览一屏可读、点选后详情有事实时间线，云朵继续短摘要。

**主屏投影**：`garden-peek` 和 `garden-counts` 用当前 `state` + `current_valid` 统计伙伴数、已验收、待交接/待复核/待验收与需关注的 `changes_requested/artifact_changed`；不把失效 accepted 算作当前验收。`web/index.html` 在 `#garden-peek` 后、`#robot-stage` 前新增 `#garden-scene-roster`，由 `garden.js.render` 按已登记 actor 生成可点选的紧凑名牌。每个名牌首层是名字、显式 role badge（提交者/复核者）、实际负责的最新关联 `task.title`（无任务显示“已登记，待任务”）、当前业务阶段；选中后与场景和工位卡同步。`style.css` 小院作用域在宽屏为单行/多列、574/360 为两列紧凑卡，限制文字块高度但可在详情中读完整标题，长中文换行且无横溢。小院场景上方优先呈现这些具体角色信息，同时保留真实 3D 舞台在首屏至少部分可见；不能只显示域统计和无名机器人。下方完整工位卡同样保留名字、role、任务和阶段，摘要云朵仍用真实 `submit/review/accept` 收据短文案；详情展开后才给能力、完整身份、产物路径/哈希和历史收据。3D/像素/文字共用 `selected`，不把现有 `category:'unknown'` 偷换为虚假的远端位置证据；角色采用 `role` 字段而不是推断 agent_path。显示当前关联任务和“其它历史任务 N 项”明确分组，避免 `taskFor().at(-1)` 默默让用户以为只有一项；不实施分页或新账本查询。

**时间线协议**：从 `snapshot.receipts.filter(r.task_id===task.task_id)` 按现有账本顺序，展示固定操作映射 `assign/submit/request_review/claim_review/record_review/accept`，每节点有 `created_at`、执行者角色/名字、`version`、收据 ID（短显，完整可展开）；阶段跳转取真实 receipt 及当前 task state，`review_pending` 明示“请求已记录，待复核者实际接收”，`reviewing` 明示“已接收，待结果”，`artifact_changed` 明示旧节点是历史、当前结果已失效。不要根据时间差计算进度率，不靠发言推断任务。当前任务缺失则显示已注册能力和无关联任务；旧版本收据仍在完整历史，但不得让旧 pass/accept 继续显示当前成功。未新增账本字段或状态迁移，页面只作投影。

**发言加载时序**：初始自动选择首个角色只显示账本详情，不发 GET；用户显式点击卡片/3D/像素/文字角色，或点“查看最近公开发言”时，对当时 root+actor 启动一次 GET。详情先显示“读取公开发言…”；成功仅显示服务端白名单的 `phase`、文本、可用时间和有限覆盖说明。页面只用 `textContent`/文本节点，永不 `innerHTML`；发言列不会生成对话气泡假冒 user/assistant 双方聊天。空数组显示“当前记录没有可展示的公开发言”，失败显示“公开发言暂不可用”，不拿 R12 云朵或原远端消息填补。切角色/切域/切观察/隐藏页或新一次点选都使 token 失效，迟到响应不得重填；后续 `/api/garden` 快照刷新不自动重取发言。手动重试可再请求同一 actor。发言结果与任务快照是独立读模型；只有 root/actor 匹配且当前选中仍为该 actor 才显示。

**目标伪码**（来源 `web/garden.js:mount/selectActor/observeDomain/switchView/refresh/render`，拟在已有 `generation` 与 selected 周围插入；用途是固定按需/失效顺序）：

```html
<!-- web/index.html, robot-panel: the compact roster precedes the real stage. -->
<div id="garden-peek">...</div>
<div id="garden-scene-roster" aria-label="本会话伙伴角色与当前事项"></div>
<div id="robot-stage">...</div>
```

```js
// garden.js render, from verified actor/task snapshot only.
for (const actor of visibleActors) {
  const task = taskFor(actor);
  roster.append(roleButton(actor.nickname, roleNames[actor.role],
    task?.title ?? '待任务', task ? phases[task.state] : '已登记'));
}
// CSS: four names within the 360/574 first-screen roster, stage still visible >=120px.
function selectActor(key, explicit = true) {
  if (!owns(key)) return;
  selected = key.slice(6);
  dialogue = { state: 'idle', actorId: selected };
  render(); onView();
  if (explicit) loadPublic(selected); // not called by default-selection inside render
}
async function loadPublic(actorId) {
  if (!active || domain !== root || document.hidden || !owns(`codex:${actorId}`)) return;
  const token = ++dialogueGeneration, viewGeneration = generation;
  dialogue = { state: 'loading', actorId }; render();
  try {
    const result = await query(`/api/garden/actors/${actorId}/public-messages`);
    if (token !== dialogueGeneration || viewGeneration !== generation ||
        !active || domain !== root || selected !== actorId ||
        result.root_thread_id !== root || result.actor_id !== actorId) return;
    dialogue = validateBoundedPublicResponse(result) ? { state: 'ready', actorId, result } : { state: 'unavailable', actorId };
  } catch { if (token === dialogueGeneration && selected === actorId) dialogue = { state: 'unavailable', actorId }; }
  render();
}
// receipts: actual operation + task/version, current_valid gates current-success wording.
```

`validateBoundedPublicResponse` 在前端还验 `available=true`、字段/条数/总长度/phase 白名单，不把服务端失误原样注入；前端预算是第二道 UI 约束，服务端是权限边界。网络请求沿用 `app.js` 的 `query()` 自动 `X-Session-Client`。旧 root bootstrap 挂载与每 10 秒 metadata 刷新不改。默认详情的公开发言区清楚标“仅最近公开 assistant 发言，非完整对话”。`details`/button 用 WAI Disclosure 的原生 Enter/Space、`aria-expanded` 与可见焦点；卡片本身按钮保留选中状态。

**步骤/验收/回滚**：先加 `garden-scene-roster` 的角色/任务/阶段投影与当前任务/历史收据详情，再插入按需发言模型、最后 scoped CSS/响应式；固定 accepted、review_pending、changes_requested、artifact_changed、无任务、长中文/超长 ID、空发言、错误与迟到响应。受控浏览器和真实 IAB 分别在 360×866、574×866、1024×866 读取 DOM bounding rect：首屏 `garden-peek`、至少一个显示具体名字+role+任务+阶段的名牌完整位于视口内，四个已登记 actor 的名牌可直接在该主屏区域内找到，且真实 `robot-stage` 顶边小于 866、可见高度至少 120px；对更多 actor 的折叠说明/完整列表不能缺失。三个宽度均无水平溢出；切域时名牌/详情清空，角色名牌点击与 3D 点选一致，详情可见任务/角色/节点/发言，键盘 Tab/Enter/Space 和焦点保留。真实 IAB 截图由 coordinator 亲看，不能只用 fixture 代替。回滚恢复 `garden.js`、HTML/CSS 的 R12 字节；新 GET 可暂存但不由页面调用，R12 卡片/云朵/收据不迁移。

**验证责任/证据三元组**：impl 作者仅做受控 `verify_garden.cjs`、JS parser、HTML/CSS 静态 scoped 检查、前端纯文本/迟到负例，且明确记录 360/574/1024 的名牌/舞台 bounding rect，完整 stdout/stderr/exit 到 `work/r13-ui-local.json`；缺则交互与首屏目标未验证。coordinator 承接实际 8766 三宽 IAB/真页面 DOM+截图、首屏名牌和真实舞台同现、实际同根 child 点选/公开发言（不把正文写进验证报告）、键盘与图形回退，`work/r13-ui-live.json` 和截图；这些不是 impl-safe，缺则真实界面/可读性未验证。reviewer 在最终产品字节上复现当前失效撤销和迟到隔离；缺则不能声称主屏正确。

**作者体验门**：角色、职责、当前节点、历史证据各有稳定的小函数/DOM 段落，中文文案直接区分“已发生节点”“当前状态”“仅公开摘录”；保持文字优先，不通过增加象征性徽章、仪表盘百分比或多余过滤配置制造负担。云朵仍只放短摘要，详细收据不挤入主屏。

### S3：自主巡游视图、旧观察兼容与整链交付

**目标/映射**：G13.3 并保护 G13.1/G13.2；守 N13.1/N13.2/N13.3。**关键文件/函数/接口**：`web/cockpit.js:create/update/setMode` 的 `roamingEnabled`、`animationPaused`、动态 `robot-motion-toggle`/`robot-roam-*`；`web/style.css` 中 `body[data-garden-view=garden]` 的 `.robot-controls` 和这些动态按钮选择器；`web/index.html` 的场景提示；旧 `tests/verify_robot_cockpit.cjs` 与新 `verify_garden.cjs`。Reviewer 先看主题切换时 `cockpit.update` 的唯一小分支，再核 CSS 只作用 garden，目标是小院系统自己安排既有自由巡游而观察模式用户控制语义不变。

**状态/兼容**：garden 主题进入时将 `roamingEnabled=true` 并调用 `scene?.setRoaming(true)`；动画沿用用户系统 `prefers-reduced-motion`，允许系统减少运动，不提供小院专用动作按钮。为了避免从旧观察模式暂停动画后进入小院仍停着，garden 主题切入时仅在不偏好减动且页面可见时恢复 `animationPaused=false` / `scene?.setAnimation(true)`；离开 garden 不自动清除旧观察模式已存在按钮或事件监听，观察主题按原模式继续可操作。若保留观察模式先前的用户手动暂停语义与小院自动恢复冲突，最小策略是在进入 garden 保存一次观察模式 motion/roam 值，在离开时恢复；不增加持久设置或新的 provider 状态。页面 `hidden` 时原 rAF 暂停；模式 3D↔像素↔文字时默认自由安排不丢，但像素/文字并不声称有真实巡游。小院只隐藏 roam/motion/rotate 三组按钮（CSS scoped `display:none` 或 `hidden` 并校验 Tab 不可达）；3D/像素/文字模式按钮、角色点选、触摸/鼠标拾取仍保留。若相机手势属于“用户操控动作”的口径，按基线它是查看视角而非机器人路径，可留鼠标观察；按钮因主屏噪声隐藏。场景附近文案“角色可点选；巡游仅为装饰，阶段以收据为准”，角色名牌来自 S2。

**目标伪码**（来源 `cockpit.js:create/update` 与 `style.css` garden scoped 段，拟插入主题变更分支；用途是确保不在每次 10 秒快照重复重置场景）：

```js
// cockpit.update: only on theme transition, not every refresh.
if (view.theme !== nextView.theme && nextView.theme === 'garden') {
  savedObservationMotion = { roamingEnabled, animationPaused };
  roamingEnabled = true;
  animationPaused = motionPreference.matches || document.hidden;
  scene?.setRoaming(true);
  scene?.setAnimation(!animationPaused);
} else if (view.theme === 'garden' && nextView.theme !== 'garden') {
  restoreObservationMotionIfSaved();
}
// existing scene.update(view), mode fallback and 3D picking remain.

/* style.css: garden only; observation selectors unchanged */
body[data-garden-view=garden] .robot-controls,
body[data-garden-view=garden] #robot-motion-toggle,
body[data-garden-view=garden] #robot-roam-free,
body[data-garden-view=garden] #robot-roam-home { display:none; }
```

**步骤/验收/回滚**：先主题进入/退出状态复核（包括用户从旧观察已停巡游、系统偏好减动、隐藏页和模式回退），后 scoped 控件隐藏/文案；不修改 `robot3d.js` 模型、速度、批处理或 Three.js vendor。运行旧完整浏览器回归、受控同质量 48 角色可见 60 秒（原几何/AA/DPR/粒子/速度、正常轮询、zero body/action、FPS≥60/p95≤20ms、>33.3ms<1%、draw≤128），真实 8766 三宽且真实 IAB 前台单独观察；二者不能相互替代。部署前核 owned 8766 进程/监听身份；若无法安全确认现有服务归属，不停用户进程，只报真实服务未验。旧观察面板所有控制仍原样，或回滚 S3 CSS/主题小分支至 R12 字节，保留 S1/S2 功能但声明自主场景未验。

**验证责任/证据三元组**：impl 作者仅跑 parser、局部受控主题转换/角色拾取 fixture 与静态旧字节/场景质量差异清单，`work/r13-scene-local.json` 完整输出和 exit；缺则视图转换未验。coordinator 承接旧全浏览器回归、真实 8766 页面/资源 SHA、IAB 360/574/1024 与前台、48 角色同画质 60 秒受控样本，落 `work/r13-scene-live.json` 及原始 JSON/截图/命令输出；缺哪一项就只说该项未验证。fresh reviewer 在这些最终字节与原始证据上给协议和业务双结论；审后产品变更必须重新复核。

**作者体验门**：保留 `cockpit.js` 原控件与事件函数的可读语义，只加小院主题状态转换；CSS 明确 scoped，没有全局“禁用一切按钮”规则。运动状态/业务状态仍分离，测试断言区分两者，旧观察使用者不会失去按钮。

## 4. 测试分层、迁移/停机与风险降级

实施顺序：冻结 R12 相关文件的 SHA/字节与当前服务信息 → S1 小型只读 helper/HTTP 负例 → S2 局部 UI/对话时序 → S3 场景主题与完整回归 → coordinator 真实同根/真页面/持续性能 → fresh ReviewImpl。新增路由与页面均属于 root garden 可用时的附加能力；无 DB schema 迁移、无后台任务、无独立守护进程和全局 Codex 配置。旧部署/旧客户端不调用新 GET 时行为不变。失败降级可关闭新增 route 或从 UI 隐藏公开发言，仅保留 R12 小院与观察；根源/路径未知时不给“最近消息”假数据。

| 风险 | 最小处理 / 不能越过的结论 |
|---|---|
| 原生索引 schema、路径格式或 JSONL shape 漂移 | S1 返回不可用，独立报告具体 reason 类别但不输出路径/文本；真实读取缺证据则 G13.2 未验，不回退 `event_msg`/扫描目录 |
| 公开 assistant 文本自身复述敏感信息 | 仅能保证源记录类型白名单和有界纯文本；无法承诺内容级脱敏，详情明确“公开发言摘录” |
| 并发写入/超预算/截断 | 整次读失败关闭；无部分页面正文，无自动重试风暴；用户手动点选可重试 |
| R12 stale accept/历史任务误导主屏 | S2 当前 SHA/state 优先，历史收据带“旧/失效”文案；负例不绿则不得声称进度准确 |
| 角色卡与 3D 控件拥挤、窄屏溢出 | 主屏仅身份/角色/任务/当前节点；详情折叠；三宽真实页面核，失败只局部改 scoped CSS 并重验 |
| 小院自动恢复与观察模式暂停行为冲突 | 主题转换只执行一次并暂存观察模式值；旧全回归红则先恢复 R12 控件行为，不降低场景质量换绿 |
| owned 8766 无法识别或实际 IAB 前台性能未知 | 不终止非本轮进程，不把本地受控样本代替真实页；仅报告待 coordinator handoff |

**事件触发高频对齐**：新假设、新风险、S1→S2→S3/Review(LW) 阶段切换，写在本节风险表及后续 impl_report 的 `contract_drift_reports`；立即通知 coordinator。已记录本轮新事实：coordinator 四个真实 child 元数据最长行 98–135 KiB，S1 单行预算由草案 64 KiB 改为 256 KiB，保持消息类型白名单、文件/响应上限不变；这是计划内可用性修正，不改 G13/N13。ReviewLW r1 指出 S2 首屏目标缺具体伙伴可见性，是计划落点缺口；本轮仅在 S2 增加 `garden-scene-roster` 的 DOM/CSS/视口验收，未改变目标或旧 S1/S3 设计。已知第 1 轮 Readiness 1–5 节缺口由第 2 轮 PASS 修复；`README.md` 调研复选框曾落后于事实，属状态页同步，不改权威基线；R12 ReviewImpl PASS 只作兼容，不能替代本轮审查。当前未见 shared runtime mirror mismatch；若后续发现，显式留痕并交 coordinator，不能静默绕过。

**澄清触发/批量提问**：本轮未触发，因为用户明确把动作预定义交给产品、完整基线已经唯一确定公开发言范围/业务阶段/隔离/回滚。若需要读取 user/tool/reasoning、跨 root、实时在线百分比、任意路径或全局 Codex 配置，属于范围/信任边界变化，停止受影响包，按 P0 阻塞→P1 高风险→P2 优化一次批量给 coordinator：

```text
【DELEGATE_QUESTION】
需要用户确认：Q1 [具体范围/约束/验收/回滚问题]
优先级：P0|P1|P2；影响阶段：LWPlan|Review(LW)|Impl
A) [推荐及原因]；B) [替代及权衡]；C) [可选边界]
请一次性回复：Q1=A, Q2=B ...
```

本轮未需要额外调研；如出现必须核实的新原生结构事实，不能递归委派，按技能 `【DELEGATE_ACTION】 supplemental-research` 由 coordinator 承接。目标或反目标映射失效则发 `PROBLEM_MODEL_ALERT` 并退回基线；仅计划结构缺口在此唯一 `lwplan.md` 修订，保留已有实施支撑文本。

## 5. Gate-1 Required Set 自检与 Gate-2 责任

Required Set 为**存在性硬门**，没有最少工作包数或问题数门槛。Gate-1 由本 lwplan 作者在成文后逐项检索和核对，失败不得交付“可进入 impl”；Gate-2 由 fresh `review_plan` 主检、coordinator 复核输入 SHA 与完整链，协议 PASS 前不得进入 impl。若 Gate-2 找不到关键锚点、不能顺读身份→HTTP→页面→场景或 evidence owner/缺口约束不清，回本唯一方案原地修订后 fresh ReviewLW；若要求改变 G13/N13，先回 clarifications/Readiness。

| T1/T2/T3 Required Set | Gate-1 实际落点与判断 |
|---|---|
| T1.1 目标锁/反目标/不影响项 | §1 G13.1–3/N13.1–3、R12/旧路由/质量保护；已落盘 |
| T1.2 文件与首落点 | §2 接口矩阵、S1 `garden_public/gateway`、S2 `garden/index/style`、S3 `cockpit/style`；已落盘 |
| T1.3 分阶段目标/步骤/依赖/验收/回滚/形态 | §3 S1→S2→S3 各有，§4 发布/停机；已落盘 |
| T1.4 每包 G/N | S1/S2/S3 首段显式映射；已落盘 |
| T1.5 验证责任分层 | 每包 impl-safe 与 coordinator 非 impl-safe、fresh reviewer；各有证据/owner/缺时约束；已落盘 |
| T1.6 作者体验/声明可读性 | 每包独立“作者体验门”，方法/文案/作用域约束；已落盘 |
| T1.7 核心链路总览 | §2 现状→新增→不改层/原因；已落盘 |
| T1.8 research 事实映射 | §2 表逐事实→锚点/验证口径；已落盘 |
| T1.9 片段闭环充分性 | §2 说明与 S1 身份/HTTP、S2 时序、S3 主题片段；已落盘 |
| T1.10 必备 Gate 自检 | 本表及下段四项/复杂链结论；已落盘 |
| T1.11 双门/失败回退 | 本节 Gate1 作者、Gate2 fresh reviewer/coordinator、退回路径；已落盘 |
| T1.12 澄清触发/批量模板 | §4 P0/P1/P2 模板与“未触发”原因；已落盘 |
| T1.13 风险/降级/Gate2 关键复核 | §4 风险表、本节 Gate2 规则；已落盘 |
| PLAN_DEFECT 原地修订检查 | S2“本轮修订说明”标出首屏缺口及新名牌/视口断言；S1/S3 与原 S2 收据/发言支撑仍在；已落盘 |
| T2 输入/输出/边界、关键实体、测试分层/回归 | S1–S3 明列字段、函数、负例和分层；已落盘 |
| T3 接口矩阵、跨层依赖、状态/协议、兼容/迁移/停机 | §2 矩阵、§3 状态/协议、§4 无迁移与降级；已落盘 |

**Gate-1 实际结论**：目标锁/反目标映射完成；验证责任分层已落盘；三元组“证据产物 / 责任归属 / 证据不足约束”已在各包落盘；作者体验门证据为各包可读性与局部作用域说明，已提供；复杂方案所需核心链路总览、research 事实映射、片段闭环充分性均已落盘。此处是**方案内容自检**，不把字段存在当产品已实现。文档写入后的文件/标题/伪码/表格实际静态检查输出须随 Gate-1 交付；检查未执行前 `allow_enter_review_lw` 不得写 yes。

Gate-2 审查须逐包复核 `关键文件/函数/接口`、目标形态、代码片段触发与闭环、G13/N13、验证分层、作者体验、跨层顺读；并核原生路径/JSONL 严格白名单、前端 late response、旧观察控制与同质量质量门。Review(LW) 通过后 coordinator 才可独立给 Gate-2 放行；实施后的真实证据和 fresh ReviewImpl 是另一道门。

| P1–P9 | 本轮执行锚点 |
|---|---|
| P1/P2/P3/P4 | 不以任务数评分；本节存在性硬门，任一缺失 FAIL；T3 继承 T1/T2 |
| P5/P8 | §4 命中关键不唯一即 `DELEGATE_QUESTION`，同阶段按优先级批量；本轮未触发 |
| P6/P7 | §4 新假设/风险/阶段切换事件留痕；问题数由真实不确定性驱动 |
| P9 | 本节 Gate-1 作者自检与 Gate-2 fresh reviewer/coordinator 复核，失败回环 |

---

## 跨功能事实（待确认）

### 架构与约束

- [2026-10-06] Windows Codex 原生 `threads.rollout_path` 在同一索引可混用普通盘符和 `\\?\` 扩展路径；复用此字段的路径归属校验应先统一规范形式。这是当前本机观察，非公开稳定协议。
