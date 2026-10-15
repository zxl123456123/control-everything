# 本机 Codex 身份索引：低层实施计划

2026-10-04；T3 跨模块；规划路径，无 hlplan。唯一权威基线为 clarifications.md。
Readiness 已独立 PASS，root 也已复核；这仅允许规划，不代表实现或实时监控通过。

## 输入、范围与作者交接

已完整读取 README、research、clarifications、readiness_r1、来源调研，以及实际 gateway/service/app/cockpit/index/style 与测试主链。
clarifications SHA256 `EB967E4E8CC8374452501C9B5648634DA7D5DDB02D262E697C637206335276BF`；readiness SHA256 `FC077D77B06BC4C4AB826F99D49C925E6B75D385625150BA319AD8343E9A4991`。

- G1：固定本机数据库只读六列；真实身份和采样时间；失败 unavailable，不能留下当前证据。
- G2：独立 Codex 元数据与来源分派；真实 key 为 `codex:<UUID>`；活动、完成未知。
- G3：未归档 cli/exec/vscode 全集合可分页，明确排除数；当前页最多 12 个 Codex 角色。
- N1–N3：不推断实时活动，不读正文/标题/preview/auth，不写库/扫描 rollout/启动 server/resume/发送/复活终端，不改原 SOURCE/MCP/远端消息与 focus 合同、不造生产记录。

范围仅 `session_panel/codex_index.py`（新增）、`session_panel/gateway.py`、`web/app.js/index.html/style.css`、`tests/test_codex_index.py`（新增）及 `tests/test_gateway.py`。root 独占 `tests/verify_robot_cockpit.cjs` 的 fixture 与浏览器验证；实施作者不得改该文件。
不改 `SessionService`、`source.py`、remote reader、terminal/workbench/native、MCP、依赖、Codex 配置或 D: 工作台。renderer/cockpit 游戏展示由独立有界工作负责，本计划不写这两个文件。

root 有界 UI 已发布并冻结：app SHA `CAA6897E03D03AFAC8B80FFF724CE986218DDD079141E86844378AB380F4D84A`，index `E36E558BCA97BACA5465EF83D9C15060494DAC0B18CB03CCD40C4056402BE28B`，style `41564804E0A781670EB0FCE74E4DA7CCC23EFBE0AD5A571FD52BA73BCB3BC793`。Gate-2 后由 root 明确交接唯一实施作者；开始前保存完整 before、生成独立 patch/哈希，不能覆盖他人变更。根目录无 Git，不 init/commit/push。

## 核心链路总览

现状：固定远端注册/进程 → SessionService → `/api/sessions` → 远端 `state.records/selected` → UUID 消息与显式 pane focus。
新增：固定本机 SQLite 只读六列 → plain `list_threads` → 独立 `/api/codex/threads` → `codexState`、卡片与元数据详情 → `codex:<UUID>` 视图角色 → 只读选择。
两条来源只在 `renderCockpit()` 合并视图；旧远端 API 和身份资格不合并。选中 Codex 清空远端 selected/page 并递增旧 epoch，防止旧消息晚到；选中远端清空 Codex selected。列表同时可用。

| research 事实 | 实现锚点 | 验证锚点与口径 |
| --- | --- | --- |
| state_5.sqlite 有真实 ID/cwd/time/archive/source | S1 固定路径、六列 SELECT | 临时 DB 单测；root 实际 GET 与同一筛选对照 |
| 历史投影滞后，42 inProgress 中 17 条超过一天 | S1 不读 history；S2 固定 unknown 文案 | 响应与 DOM 无活跃/完成推断 |
| cli/exec/vscode 与 subagent 混存，归档独立 | S1 whitelist/count/page；S2 coverage | 0/12/13/25 条、多来源与归档 fixture |
| 既有默认控制 socket exit1/os10050 | 不使用 app-server；S2 明示身份索引 | root 不启动/重启/连接新 server |
| 旧 selected 自动触发 Claude messages | S2 `selectRobot/selectCodexThread/selectSession` | root 卡片/像素/3D 点选、晚到消息与请求日志 |
| cockpit 使用完整字符串 membership/map key | S2 view.sessionId=`codex:<UUID>` | 远端与 Codex 共用同一 UUID 仍独立；fallback 选择核对 |
| 旧 WezTerm 实机 BLOCKED | S3 分离结论 | fixture、身份索引 PASS 不能关闭旧真实定位缺口 |

片段闭环：下列固定读库骨架、GET 插入骨架、选择分派骨架覆盖“库 → API → DOM/角色 → 选择 → 禁止远端动作”。既有分支/共享视图 key 被扩展，代码片段必填；没有大规模删除或整条函数链重构。

## 接口与状态契约

固定 GET `/api/codex/threads`；唯一可选参数 `offset`，缺省 0。`parse_qs(..., keep_blank_values=True, strict_parsing=True)` 后仅允许单一 offset；值匹配 `[0-9]{1,9}`，转为非负 int。空值、负数、浮点、重复、未知参数、客户端路径/SQL/source/limit 均 400，不调用 reader。路径后缀 404；POST 不支持。
固定 limit=12；SQL 顺序 `updated_at DESC, id ASC`，每次响应是一份新读取快照。跨页间有新更新时可能换序，界面给刷新入口，不承诺跨请求快照锁或实时活动。

成功 HTTP 200，固定响应形态：

```javascript
{
  available: true, reason: null, source: 'codex_local', sampled_at: '<UTC ISO>',
  items: [{ thread_id: '<canonical UUID>', session_key: 'codex:<UUID>',
    cwd: '<exact stored string>', created_at: '<UTC ISO>', updated_at: '<UTC ISO>',
    archived: false, source_kind: 'cli|exec|vscode', activity_state: 'unknown', task_completion: 'unknown' }],
  offset: 0, limit: 12, total_visible: 112, next_offset: 12,
  coverage: { total_count: 372, archived_count: 4, excluded_subagent_count: 256, excluded_other_source_count: 0 }
}
```

数字仅说明字段，不能硬编码研究计数。`total_visible` 为 `archived=0 AND source IN ('cli','exec','vscode')` 的全部数量。`coverage` 其余排除数均按本次 DB 快照计算；归档数覆盖全库，subagent/other 排除数只统计未归档。subagent 使用本机已观察的序列化前缀 `{"subagent":` 分类；不匹配该前缀的非白名单来源归入 other，也不展示。四类计数须满足全库分区等式。
`next_offset` 为本页非空且 `offset+items.length<total_visible` 时的 `offset+items.length`，否则 null；越界 offset 返回有效空页，total 不伪造为 0。

失败 HTTP 503：`available:false, reason:'codex_index_unavailable', source:'codex_local', sampled_at:null, items:[], offset:<requested>, limit:12, total_visible:null, next_offset:null`，coverage 四个计数均 null；不输出 SQL、路径错误详情、异常正文或旧结果。原远端 API 的 payload/status 不变。

前端 `codexState` 独立持有 items/offset/nextOffset/total/coverage/selected/available/received/sampledAt/refreshing/error。有效页最大 12，唯一规范 UUID、正确 namespace、允许 source_kind、false archived、unknown 状态、有效日期与非负整数计数须核验；错误响应等同 unavailable。
每页最多一个在途 GET，请求期间禁用该页翻页/刷新，响应 offset 必须等于请求 offset。翻到新页先清空 Codex 选择和旧角色；同页刷新可保留 30 秒内上一采样直到成功/失败，但必须展示采样时间。失败、超过 30 秒、schema/格式不符均清空 items/selected/当前角色和详情，明确不可用或过期；不得失败后自动恢复旧页为当前。
页面可见时沿用既有 10 秒 metadata 刷新与 1 秒过期检查，隐藏暂停；显示时重新采样。新索引不阻塞远端结果展示，两个失败互不覆盖。

#### 本轮修订说明

[修订: PLAN_DEFECT-R1.1] 30 秒新鲜度必须从该次 GET 开始的 `performance.now()` 计龄。响应回来后若 `performance.now()-started>30000`，即使 payload 格式正确、sampled_at 可解析，也必须走失败清空，不能发布 items/恢复角色或详情。成功接受时 `codexState.received=started`，不能设为收到响应时的 now；后续 codexFresh/1 秒过期检查继续用该开始时间。sampled_at 只显示数据库采样时间，不把“刚收到”解释为“刚采样”。不引入额外时钟抽象。

## S1：固定只读 reader 与 GET

目标/映射：落实 G1、G3 与 N1–N3；只读有界身份数据，不建立新会话服务框架。
关键文件/函数：新 `codex_index.py:list_threads(offset=0, db_path=CODEX_DB)`；`gateway.py:PanelHandler.do_GET`、新 `codex_offset(query)`；Python 测试 reader 与 direct handler。`db_path` 仅为临时 fixture 注入，HTTP 不接受它。
改动理解锚点：先看现有 `do_GET` 的 `allowed(api=...)`，新增路由必须在其后，且不进入旧 SESSION_ROUTE。目标形态：一个 plain reader、一个参数 parser、一个 GET 分支，无 class/adapter/config/新依赖。

```python
# codex_index.py: fixed production path; this is design pseudocode.
CODEX_DB = Path('C:/Users/ZXL/.codex/state_5.sqlite')
if not db_path.is_file(): return unavailable(offset)
connection = sqlite3.connect(db_path.as_uri() + '?mode=ro', uri=True, timeout=0.25)
try:
    connection.execute('PRAGMA query_only=ON')
    connection.execute('BEGIN')  # Read snapshot for counts and the selected page.
    # Require six column names; read counts, then explicit six-column SELECT.
    # WHERE archived=0 AND source IN (...) ORDER BY updated_at DESC,id ASC LIMIT ? OFFSET ?
    # Validate each row before publishing any items; timestamps become UTC ISO.
finally:
    connection.close()

# gateway.py: do_GET, after allowed(api=True), before old remote session branches.
if path.path == '/api/codex/threads':
    result = list_codex_threads(codex_offset(path.query))
    return self.reply(200 if result['available'] else 503, result)
```

执行：①保存 before；②固定路径/limit/source whitelist；③只读 URI+query_only+显式 read transaction；④同一快照计数/取页；⑤验证规范 UUID、cwd 字符串、整数非负时间、archived=0、白名单 source，整页失效时不部分发布；⑥GET parser 与权限拒绝先行；⑦补单测。schema 只要求六列可查询；额外列不读值。缺库 race 也由 mode=ro 拒绝，不补建。busy timeout 0.25 秒是 SQLite 等锁预算，不宣称硬取消整个 OS 调用；连接每次关闭，无常驻线程或缓存。
验收：同 cwd 不同 ID 保留；空库/末页/越界可区分 unavailable；排序 tie 用 ID；记录与计数均满足当前筛选；锁/schema/不规范 ID/错误类型/坏时间/连接错误返回固定失败，无私密异常；read-only 测试确认不能执行写入且缺失路径未创建。
作者体验：短函数与固定 SQL，直读六列，命名指出只读索引；不引入通用 provider、迁移或版本探测。
依赖：readiness、Review(LW)+root Gate-2；S2 消费此固定 contract。
回滚：只撤本作者 reader/GET/parser/测试差异，移除新入口；保留原远端行为，不触碰真实 DB。
验证责任：impl 仅临时人工 fixture DB 和 Mock 的 unittest，输出完整 UTF-8 stdout/stderr/exit 与 before/patch/hash 至 `work/codex-index-impl-r1/`、报告至 `impl_report_r1.md`；缺自证则未放行。root 独立真实只读 DB 与实际 GET 对照，证据 `work/codex-index-root-live-r1.json`；无实际证据只算 fixture 验证，不能宣称本机接入。impl 禁止真实库/SSH/GUI/生产 HTTP/应用重启。

## S2：独立卡片、详情与角色选择

目标/映射：落实 G2、G3 与 N1–N3；让真实身份可点选、可翻页，保留远端列表与业务。
关键文件/函数：`app.js:codexState/refreshCodexThreads/renderCodexThreads/selectCodexThread/selectRobot/renderCockpit/selectSession/refreshObservations`；index 新 `codex-panel/codex-list/codex-detail/codex-previous/codex-next/refresh-codex`；style 仅新 panel/card/detail 响应布局。
改动理解锚点：现有 `selectSession` 会调用 `readMessages`，不能直接复用为 Codex 点击 handler。目标形态：独立 full-width Codex 面板，原远端列表/详情仍保留；只在 view 组合与 onSelect 分派交叉，无第二套 messages/focus。

```javascript
// app.js design skeleton; old remote eligibility and routes stay intact.
function selectRobot(key) {
  if (typeof key === 'string' && key.startsWith('codex:')) return selectCodexThread(key);
  return selectSession(key);
}
function selectCodexThread(key) {
  if (!codexFresh() || !codexState.items.some(item => item.session_key === key)) return;
  codexState.selected = key;
  state.epoch++; state.selected = null; state.page = null; state.pageOld = false; state.reading = false;
  // Clear remote displayed messages/notices, disable focus, updatePaging/renderSelection.
  // Render only allowed Codex metadata; never readMessages/focus/connect here.
}
// renderCockpit: remote recordView unchanged; Codex maps to category:'unknown'.
cockpit.update({ records: [...state.records.map(recordView), ...currentCodexViews],
  selected: codexState.selected || state.selected });
// existing cockpit.create(...): onSelect becomes selectRobot.
```

#### 本轮修订说明

[修订: PLAN_DEFECT-R1.2] `refreshCodexThreads` 在调用 query 之前捕获请求开始时间；接受任何页之前先核对请求年龄，超过 30 秒抛入既有失败清空路径。即使同页上一采样已经由过期检查清空，迟到的 GET 也不得恢复该页。

```javascript
// refreshCodexThreads design skeleton; no new clock or polling framework.
const started = performance.now();
const result = await query(`/api/codex/threads?offset=${offset}`);
if (performance.now() - started > 30000) throw new Error('Codex sampling expired');
// Validate this response's shape and offset before publishing it.
codexState.received = started;
```

执行：①独立 state/验证/刷新；②静态 Codex panel、明确计数及固定范围说明；③每卡真实 UUID、exact cwd、source_kind、时间、活动未知，所有动态文本用 textContent；④prev/next 使用本响应 offset/next_offset；⑤Codex 选择清空旧远端 epoch/page/可操作详情，保留旧在途 focus 的真实 pending 标志，不能假装取消已发送动作；⑥远端有效 selectSession 清空 Codex selected，再执行原逻辑；⑦合并角色 key 与刷新/过期；⑧同步描述“Codex 仅身份，远端按需历史”。
现有 cockpit/3D 用字符串 membership/map，不要求 UUID 正则，能原样承载 `codex:<UUID>`；元数据 view label 为 `Codex · <UUID前8位>`，完整 key 保留。像素标签去 namespace 只属于独立 renderer 作者的显示小修；本作者不改 cockpit。颜色 unknown 不能借用 confirmed 冒充绑定或活动。
验收：Codex 与远端相同 UUID 仍两角色；Codex 鼠标/键盘/像素/3D 选中都只有元数据，不新增 Claude messages/POST；旧读响应在 epoch 后被忽略；回选远端仍按旧 reader 读取；翻页/失败/超时/空页不保留 Codex 当前角色；refresh 不隐藏旧远端列表，data unavailable 不破坏旧 reader。
作者体验：独立小 state、直观函数和原生 DOM；复用 element/query/timeText 与普通 button，不抽象通用来源详情、不改旧资格算法。布局保留 root 的 420px 主场景与远端 evidence flow，新增 Codex 来源说明不能使远端 flow 对 Codex 显示已核验。
依赖：S1 固定 response、root 发布的三文件冻结基线、renderer 完整 key 接口；root 交接三文件后作者独占写入。
回滚：移除本作者 Codex panel/state/GET 调用/selection wrapper，恢复传 selectSession 与远端-only view；从对应 before 差异撤回，不覆盖 root 场景/flow 或 renderer 工作。
验证责任：impl 自证 node syntax 与静态/Mock 行为；完整输出/patch/hash 同 S1，缺证不能写完整 UI 验收。root 承接 Edge 受控 fixture 及当前 IAB、选中真实 ID 对照/窄屏/帧时记录；证据 `work/codex-index-root-browser-r1.json` 与当前截图。截图只证明画面，帧率另有时间采样；无真实点选证据只算合成链可用。impl 不运行生产 HTTP/浏览器注入、私密正文读取或终端动作。

## S3：验证闭环与交付

目标/映射：消费 G1–G3、N1–N3；用独立证据验证身份索引，分清活动/旧终端未验收。
关键文件/锚点：新增 `tests/test_codex_index.py` 的临时 DB 场景；`tests/test_gateway.py:GatewayDispatchTests` 新 GET Mock 用例；root 独占 `verify_robot_cockpit.cjs:startFixture/openPage` 和新增 Codex case，已有 renderer/远端案例保留。
目标形态：reader 纯 fixture → handler Mock → root 全 Python/Edge →实际 DB/API/当前 IAB → fresh Review(Impl)，无“测试通过所以所有真实对话可监控”的跳跃。
root 的 fixture Python 在启动 server 前 patch `session_panel.gateway.list_codex_threads` 为纯 Fake 函数。旧 33 类场景默认给有效空 Codex 页，新场景给最多 12/末页/失败响应；不得让 fixture 请求落到实际 `.codex`。请求日志仍记录全部 API/POST，新增 Codex API 分类但保留原安全检查与 45 条消息边界。
关键片段：`with patch('session_panel.gateway.list_codex_threads', return_value=fixture_page): handler.do_GET()`；browser fixture 用同一个导入名 Fake，真实 root 环境不 patch。
执行/验收：①impl 单测缺库、不写库、schema、分页/计数、类型/UUID、坏查询/Host/Origin/client；②root 新读 before/patch/hash；③全 Python，记录 Win10053 等所有失败，不循环刷绿或放松权限；④root 全 `--fixture`，Codex 13/25 多页、同 UUID 双来源、晚到旧读、格式/503/过期/恢复、降级/窄屏；⑤root 实际 GET 翻到本线程 `01a10013-6a9b-71f0-9878-89ce70e5a495`，核对允许 DB 字段和全筛选数量；⑥当前 IAB 点选该真实身份，无 Claude 消息/POST；⑦fresh 最终差异 review。
命令：impl `.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_codex_index tests.test_gateway.GatewayDispatchTests -v` 与 `C:/nvm4w/nodejs/node.exe --check web/app.js`；root `.venv/Scripts/python.exe -X utf8 -B -m unittest discover -s tests -v`、`C:/nvm4w/nodejs/node.exe tests/verify_robot_cockpit.cjs --fixture`。本计划阶段未运行这些未来命令、不先写 PASS。
作者体验：测试核验边界与外部行为，不复制实现；真实计数允许变动，不固定 112/372。只统计/对照六列，不读 title/preview/item/body/auth。
依赖：S1/S2 最终差异；root GO 后才进入 Impl，fresh Review(Impl) 输入最终报告和 root 新证据。回滚只按 owner 的 patch/snapshot 撤本 feature，root 保留失败证据；无 Git 不使用 restore/reset/clean，不改库。
验证责任：impl 交自己的 fixture 命令完整输出；root 独立全部本轮验证，真实 HTTP/DB/IAB/Edge/网关自有进程重载均只由 root 负责；reviewer 只读审查。缺真实库/当前 UI/网络隔离证据→身份接入未验证；缺实时 app-server→活动仍 unknown；旧 WezTerm 真实关联仍 BLOCKED，不被本 feature 放行。

#### 本轮修订说明

[修订: PLAN_DEFECT-R1.3] root S3 必加有界迟到响应场景：拦住 Codex GET，推进已有 fixture monotonic clock 超过 30 秒，再释放结构有效的响应；核对 unavailable/过期说明、items/选择/当前机器人均为空，且没有 Claude messages 或 POST。同时核对短延迟接受后的证据年龄包含等待时间，不能从零重算；这些是 root 浏览器 fixture 证据，不由 planner 声称已通过。

## 兼容、迁移、风险与降级

接口矩阵：S1 六列→独立 metadata response；GET→S2 codexState；S2→cockpit 完整 string key；旧 SessionService→旧 response→远端 state 原样；无共享 DB schema 或来源枚举迁移。
发布顺序：S1/S2 本地自证 → root 新证据 → root 仅自有 gateway reload →实际 GET/UI → fresh Review(Impl)。数据库、Codex、远端、D: 工具不迁移；不增加配置开关，失效只清空 Codex 当前页并保留远端功能。停止策略为 root 停止其自有网关或按 owner patch 回滚；不停止 Codex/WezTerm/SSH。
主要风险：内部 schema/序列化变动→明确 unavailable 或计入 other，不探测正文；SQLite busy→短等待失败，不无限重试；每页排序变化→新快照/刷新第一页，不能推断活动；旧响应晚到→远端 epoch；混同来源→namespace 与独立详情；图形丢失→独立文字卡片。
事件触发对齐留痕在本节：已接收 root 三文件冻结和选择时清空旧远端的执行细化；已接收 root 独占 harness。实现发现新的基线/schema/接口假设、所有权变动或阶段切换时立即报告 root，不自行扩大。当前无阻塞 U 点；低层 offset、busy timeout、隔离详情均在既定 G1–G3 内。
批量提问未触发：范围/验收/回滚已唯一。若需正文/实时 server/复活/新增来源，按 P0 阻塞、P1 风险、P2 优化一次上报：`【DELEGATE_QUESTION】需要确认…；优先级…；影响阶段…；A 推荐与权衡/B 权衡`，由 root 承接用户答复与基线重算，实施不能猜许可。shared contract 或 mirror mismatch 同样留痕并回退。

## Required Set / Gate-1 自检

| 必备项 | 存在位置与判断 |
| --- | --- |
| T1-1 目标/反目标/不影响项 | 输入与范围，G1–G3/N1–N3，PASS |
| T1-2 文件与 reviewer 首落点 | S1–S3 关键文件/函数，PASS |
| T1-3 工作包目标/步骤/验收/回滚/依赖/目标形态 | S1–S3 分别齐备，PASS |
| T1-4 工作包目标锁/反目标映射 | 各包目标/映射，PASS |
| T1-5 impl-safe/root/不可执行与证据不足 | 各包验证责任，PASS |
| T1-6 作者体验/声明可读性 | 各包作者体验，PASS |
| T1-7 核心链路总览 | 工作包前双来源链路，PASS |
| T1-8 research 事实映射 | 工作包前事实表，PASS |
| T1-9 强触发片段闭环 | 库→GET→选择/view→fixture 骨架，PASS |
| T1-10 目标/分层/证据三元组/作者门自检 | 本表与各包责任/产物/缺口约束，PASS |
| T1-11 双阶段执行人/失败回退 | 下段 Gates，PASS |
| T1-12 委托提问/事件对齐/批量模板 | 风险与降级，PASS |
| T1-13 风险/降级/Gate-2 复核 | 风险与下段，PASS |
| T2 输入输出边界/函数/测试分层回归 | 接口契约、S1–S3，PASS |
| T3 接口矩阵/兼容迁移/停止策略 | 兼容段、独立分派/失效清空，PASS |

Gate-1 由 planner 按存在性与实际文本新读自检，证据 `work/codex-index-lwplan-gate1-r2-recheck.json`；不是产品验收。Gate-2 由 fresh Review(LW) 主检、root 再读最终方案/Required Set/锚点/片段闭环/证据分层/作者门复核；两者未 PASS 禁止 Impl。失败回退 LW 修订→Review(LW)，口径不唯一先澄清；不能把作者自称 PASS 当 root 证据。Review(Impl) 必须最后独立执行，失败记录不省略。

#### 本轮修订说明

[修订: PLAN_DEFECT-R1.4] 保留 R1 Gate-1 与 `work/codex-index-lwplan-r1-before.md` 原文字节；当前新 Gate-1 额外核对请求开始计龄、迟到响应拒绝、成功时不重置年龄与 root 迟到场景责任。本次只补未实施计划，未删已实施支撑文字，未修改产品或用户范围。
首轮 r2 自检 exit1：原文保留检查仅归一化证据文件名，漏掉 Gate 段新增的“当前”二字；实际 diff 已核对。现在保持原 Gate 文案仅更新证据路径，失败 r2 文件不覆盖，重新检查另存 r2-recheck。

发现但不改动：当前源码调查曾误读不存在的 `tools/browser-panel-check.mjs`/tools 目录，命令 exit1；已转向实际 `tests/verify_robot_cockpit.cjs`。宽聚合读取曾截断，已按文件/区间补读实际锚点。这些不是产品测试结论。历史控制 socket、WezTerm 与 Win10053 失败原证据保留。
