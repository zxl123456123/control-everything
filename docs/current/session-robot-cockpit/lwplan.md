# 会话机器人控制台低层方案

本方案是 `session-robot-cockpit` 新批唯一规划路径，任务分型 **T3**。上游权威为本批 `clarifications.md` 的完整实现基线；其 SHA-256 为 `C6B82AFB523786A1E3C1C6F16928CEB635828727A1676465E50C299B56F2FF1C`。Readiness 报告 SHA-256 为 `20707EE15381CDF9D0AA8680254FD89189CA778A59B3D28B5719E6E49D68D1FE`，结论只放行规划。本文不授权实施；正式 Review(LW)/Gate-2 后仍执行 `STOP_BEFORE_IMPL -> ManualMode`，由 coordinator 呈递具体方案后处理实施入口。

父批 `unified-dev-control-panel` 保持 `impl_reviewing / USER_CONFIRMATION_NEEDED`；Q6 客户端可见性与实际三工具调用由 human 及原 reviewer 承接。父批冻结 `lwplan.md`、r2 实施报告和 r2 审查记录不覆盖本批最终代码，也不由本方案关闭。

## 1. 核心链路总览

### 现状主链与改动落点

```text
固定远端 registry / 同 UID proc / UUID 身份元数据   本机严格 Zellij 清单
                         \                     /
                       merge_observation(remote, inventory, previous)
                                      |
              当前 UUID 与旧 UUID 联集；身份/进程/位置独立，活动/完成 unknown
                                      |
                        SessionService 单一内存快照
                                      |
             /api/sessions 与三个只读 MCP 查询（保持既有接口）
                                      |
                   app.js 唯一 records / selected / epoch / page
                          /                         \
              DOM 原生 UUID 按钮                   cockpit.update(view)
                          \                        /           \
                           selectSession(UUID)        Canvas 像素    隔离 3D 模块
                                  |                   回退          同源 Three 闭包
                      既有按需 messages / 翻页
                                  |
                      显式 focus 按钮 -> POST UUID
                                  |
                Terminal.focus_session 重新观察 / 实例与 pane / 唯一客户端复核
```

本轮先在 `service.py` 修正“旧原因成为当前原因”的 F1，再在 `app.js` 将当前位置确认、当前待关联、保留记录、当前未观察分开。最后添加只消费视图和发出 UUID 选择回调的 renderer。Canvas/DOM 不依赖 Three 模块成功加载；帧、旋转和拾取都不获得查询或定位接口。

不改 `source.py` 的固定主机/config、`remote_probe.py` 的身份和 reader 判断、`terminal.py` 的严格命令/定位复核、MCP 三工具名称/协议、认证/信任/config、分页六字段与预算。这样分层的原因：F1 是索引合并缺陷；列表分类是证据表达；Three 只解决几何和拾取，不能证明真实活动、UUID 或 pane。

### reviewer 顺读入口

先读 `service.py:123–157` 的候选/旧行及判定顺序，再读 `app.js:35–99` 的有效性与选择，最后看 `gateway.py:90–99` 的白名单与本文 C4 的独立加载。工作包 S1→S2→S3 对应此主链，S4 将本地与真实环境证据接回同一 UUID，不要求 reviewer 跨包猜接线。

## 2. research 事实映射表

本轮已完整读取 service/gateway/source/terminal/remote_probe/MCP、web 三文件及五组 Python 测试；旧 UI fixture 与浏览器 harness 只用于核对现有验证形态，不能直接运行含旧硬编码 UUID 的真实读取/定位脚本。

| 事实输入 | 实现锚点 / 本轮处理 | 测试或验证锚点 | 验证口径与责任 |
|---|---|---|---|
| 映射研究 F1：没有当前候选时 `raw=old`，`reason_codes` 复制旧数组；恢复后仍有 `source_unavailable` | `service.py:123–141`；S1 只从本次可用来源的当前候选初始化当前原因，旧数组进入上次证据 | `tests/test_observation.py` 新增真实 merge 红绿测试；C1 | impl 只用 fixture，必须实际看到未改代码断言失败及改后通过；root 独立复跑；缺红记录不声称回归有效 |
| F2：旧 slot 当当前标题，所有 null slot 都叫未映射；卡片不显示原因 | `app.js:39–74`；S2 单一分类/标题/原因，旧槽位加“上次” | DOM 与受控 HTTP 浏览器分类用例；C2 | impl 比较多种证据组合和所选 UUID；root 审真实新鲜元数据，不能据画面判退出 |
| 00:06:53 北京时间 root 样本为 2注册/2进程/7索引/2位置确认、5保留；F1 未修 | `work/session-mapping-feedback-r3-root-verification-20261004T000653.json`；只作输入证据，S2 不固化数量/ID | 0/1/2/4/7/13 行 fixture、动态新增/消失/回归 | 真实数量由 root 每次重新采样；22:51 提案、23:08 与此样本不能拼接 |
| registry/proc/索引/位置确认不同口径；冲突655与无位置a98不能猜配 | 保持 `remote_probe.read_registration`、`terminal.parse_slot_command`、`merge_observation` 原判定优先级 | 现有重复 UUID/slot/pane、实例变化及 focus 拒绝测试 | impl 保守拒配回归；root 当次真实缺证据只报未验证，不保证三槽常绿 |
| 当前/上次证据、5秒定位/30秒陈旧；动画不能推 busy/done | `service.mark_unknown/_view`、`app.age/current/eligible` 保持资格；S2/S3 只映射位置证据色 | 时钟 fixture、API unknown/拒绝/非 JSON；C2/C3/C4 | impl 验到期和失败撤销；root 刷新后独立核验；活动/完成始终 unknown |
| 消息仅选择/刷新/翻页读取；45条边界已修，epoch 防迟到回写 | `app.selectSession/readMessages/updatePaging/focusSession`、`remote_probe.read_messages` 保持 | 45条 `25..44→5..24→0..4→5..24`、旧响应、revision/empty/scope 回归 | impl 只合成正文；root 只为验证选当次真实 UUID，并仅留分页/计数，不保存正文 |
| 原作者机器人使用基础几何；React/PTY/Hooks及 unknown→idle 不适配 | S3 原创 Box/Cylinder/Sphere 机器人；无上游控制链和素材 | renderer 源码边界、状态色/unknown 标签、网络记录 | 采用几何构成思路；不采 React 控制框架、推算活动与未核许可资产 |
| 原生 Three 同源 vendor 与 Canvas 2D 有参考；Canvas 没有自动可访问语义 | S3 独立模块＋像素；S2 DOM 原生按钮始终保留 | 真浏览器键盘、画布拾取与 DOM 同 UUID、窄屏 | 不引 Phaser/Pixi/React；纯 DOM 是最后能力，不能以截图代判交互 |
| 固定 three@0.186.0 gitHead `148ef33ecb6d2502ff796d4554abd1549c95d519`；module→同目录core；MIT；JS 2,120,885B | S3 复制明确两文件＋LICENSE，白名单精确同源路径，C5 | 文件 size/hash/import、临时网关 HTTP MIME/CSP 与实际浏览器 module 请求 | impl 与 root 分别重算；r186 tag=0.186.1 不替代；不称 npm 签名已核 |
| 当前仅三静态路径，候选 vendor 路由404/JSON/nosniff，CSP self/img none | `gateway.PanelHandler.do_GET/reply`，只增五条精确静态映射 | `tests/test_gateway.py` 白名单/越界/query/MIME；浏览器 CSP | impl 临时 loopback；root 最终产品同源加载，不能照搬提案CDN或放宽CSP |
| 能力检测不等于成功初始化；context lost 是运行期事件 | S3 import、WebGL2 context、初始化/首次绘制、lost 四入口分开；C4 | module/core404、null/throw、实际 WEBGL_lose_context 事件、2d null | impl 受控浏览器；root 最终浏览器复核。extension 缺失或浏览器不足时保留未验证 |
| 提案 DF4C… 固定22:51样本；root预览118检查不含生产API | 本轮不移植快照/包装/CDN/演示计数 | S4 产品 fixture 与 root 真实两类证据 | 预览只为讨论参考，118 全绿不算产品验收，也不抹掉旧失败 |

外部采用依据：保留原作者调研的程序化几何与原生同源模块做法。官方 [安装说明](https://threejs.org/manual/pages/installation.html) 要求运行文件依赖可解析；固定两文件闭包已由研究核字节，因此本批不需要新增构建框架。[WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) 使用 WebGL2，[MDN context lost](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event) 提供独立事件入口，故预检查之外必须覆盖实际初始化与运行期回退。以上链接本轮重新打开；固定包事实仍以研究中的 npm gitHead 与 hash 为准。

## 3. 最小闭环片段

以下是结构级 before/after，函数名为新结构落点，不要求逐字实现。C1→C2→C3→C4/C5 足以顺读“新鲜原因/历史→同一UUID→已有功能→可失效的独立画面”，每段同时给出拒绝边界，避免只有局部片段。

### C1：当前原因重建与有界上次证据

来源：`session_panel/service.py:123–145`，用途：修 F1，保持原分支顺序和绑定资格。

```python
# Before: an absent registration copies the old row's accumulated reasons.
raw = candidates[0] if candidates else old[session_id]
record.update(reason_codes=list(raw.get("reason_codes", [])))
if prior:
    record["last_evidence"] = {key: copy.deepcopy(prior.get(key)) for key in (
        "observed_at", "identity_state", "process_state", "terminal_binding", "pane_id", "instance_key")}
if not source_ok:
    mark_unknown(record, remote.get("reason") or "source_unavailable")
elif not candidates:
    mark_unknown(record, "registration_missing")

# After: retained scalar fields do not make their reasons current.
record.update(
    reason_codes=list(raw.get("reason_codes", [])) if source_ok and candidates else [],
    registration_state=("present" if candidates else "missing") if source_ok else "unknown")
if prior:
    record["last_evidence"] = {key: copy.deepcopy(prior.get(key)) for key in (
        "observed_at", "identity_state", "process_state", "terminal_binding", "pane_id",
        "instance_key", "slot", "reason", "reason_codes", "registration_state")}
# Keep source failure -> missing -> duplicates -> process/instance -> terminal -> binding order.
```

`reason_codes` 只表达本次观察与本次有效性。`last_evidence` 只留紧邻上次快照的上述字段，不复制它的 `last_evidence`，不增加事件日志。旧数组可能早已跨时点积累；其 `observed_at` 只是数组被采样留存的时间，**不是每项历史故障发生时间**。UI 必须标注“上次采样留存原因；历史原因发生时间未核验”，不得回填精确失败事件。本例的成功标准是恢复后当前原因仅 `registration_missing`，上次留存证据仍可看到来源失败；不是让旧行恢复 confirmed。

### C2：先判有效性，再区分当前与保留

来源：`web/app.js:35–74`，用途：S2 单一视图推导；旧标题与当前 slot 分开。

```javascript
// Before
title.append(element('strong', record.slot || '未映射槽位'));
notice.textContent = !current(record) ? '当前证据未知' : record.reason_codes.map(reasonText).join('；');

// After: one app-owned view is shared by cards and both canvases.
function recordView(record) {
  const valid = current(record);
  const registration = record.registration_state ?? registrationFromCurrentProvenance(record);
  const category = !valid || !['present', 'missing'].includes(registration) ? 'unknown'
    : registration === 'missing' ? 'retained'
    : record.identity_state === 'verified' && record.terminal_binding === 'confirmed' ? 'confirmed'
    : 'pending';
  return { sessionId: record.session_id, category,
    label: category === 'retained' ? `保留记录 · ${record.slot ? '上次槽位 ' + record.slot : '上次槽位未知'}`
      : category === 'unknown' ? '当前未观察 · 上次证据'
      : `${record.slot || '槽位未知'} · ${category === 'confirmed' ? '位置已确认' : '待关联'}` };
}
```

兼容旧服务时，只在快照新鲜且来源完整 observed、有 `provenance.registrations` 数组时推导 present/missing；其它输入用 unknown。该兼容分支不从 slot/cwd/title/旧 pane 猜当前注册，不从旧混时数组判断当前故障。新服务下来源恢复且缺注册显示当前 `registration_missing`；上次原因放在证据展开区，列表不要求读取消息才能看到原因。来源/API失败或30秒过期统一覆盖当前资格，所有角色变“当前未观察”，不能把未看到注册说成已退出。

### C3：同一 UUID 选择接既有分页与定位

来源：`web/app.js:95–151`、`terminal.py:79–112`，用途：保持单一状态与既有操作边界。

```javascript
// Before: DOM button selects a real UUID, which alone triggers a tail read.
button.addEventListener('click', () => selectSession(record.session_id));

// After: DOM/pixel/3D all enter the same function; renderers have no API handle.
let cockpit = null;
// Install the existing DOM handlers/startup independently before this optional block.
try { cockpit = window.SessionCockpit?.create({ stage: $('robot-stage'), onSelect: selectSession }); }
catch { $('robot-status').textContent = '文字模式 · 图形不可用'; }
function selectSession(sessionId) {
  if (!state.records.some(row => row.session_id === sessionId) || state.selected === sessionId) return;
  // Keep existing epoch reset, page reset, rendering and readMessages() here.
}
try { cockpit?.update({ records: state.records.map(recordView), selected: state.selected }); }
catch { /* Disable graphics and preserve the already rendered DOM and app state. */ }
// Keep readMessages(offset, revision, limit), epoch guards and 45-item boundary unchanged.
// focusSession remains reachable only from the explicit DOM focus button.
```

S2 的新增成员检查使已消失/过期 renderer 目标不能偷偷选择未在当前索引内的 ID；仍允许索引中的保留/未知 UUID 按既有 reader 独立核验读取历史，读失败明确 unknown。选中、模式切换、元数据更新的语义分开：只新 UUID 选择、消息刷新/翻页读正文；同 UUID 重复点选、旋转、画布更新、模式切换和元数据轮询均不读消息。定位继续要求 `eligible`、5秒、CSRF、显式按钮，服务端 `force=True` 重核验；不把点机器人变成直接 focus。

### C4：DOM 启动与 Three 失效隔离

来源：`web/index.html:8`、新增 `web/cockpit.js` / `web/robot3d.js`，用途：库和渲染故障不能绑死文字功能。

```html
<!-- Before -->
<script src="/app.js" defer></script>
<!-- After: both remain classic external scripts under the current CSP. -->
<script src="/cockpit.js" defer></script>
<script src="/app.js" defer></script>
```

```javascript
// cockpit.js has no top-level Three import and no query/fetch/SDK calls.
// Pixel is available while the 3D Promise is pending; native DOM exists independently.
async function enable3d() {
  const attempt = ++generation;
  showPixelOrText('正在尝试 3D');
  try {
    const module = await import('/robot3d.js');
    if (attempt !== generation || requestedMode !== '3d') return;
    const scene = module.createRobotScene({ view: latestView, onSelect,
      onUnavailable: reason => { if (attempt === generation) fallBack(reason); } });
    // Scene creates its own WebGL canvas off-stage and completes the first draw of latestView.
    // Attach only after success. On any later failure, stop/dispose and keep latest UUID selection.
    attachReadyScene(scene, latestView);
  } catch (error) {
    if (attempt === generation) fallBack('3D 加载或初始化失败');
  }
}
// robot3d.js is the optional module boundary, not the app's startup dependency.
import * as THREE from '/vendor/three-0.186.0/three.module.js';
// getContext('webgl2') null/throw, renderer init/first draw and actual contextlost
// all report onUnavailable; pixel uses a separate 2D canvas.
```

实际代码须将模块拒绝与 renderer 初始化分阶段记录到状态提示/测试证据；伪代码合并 catch 只是展示隔离边界。`cockpit.js` 本身404/语法失败时 `app.js` 仍绑定 DOM，`window.SessionCockpit` 不存在时显示“文字模式 · 图形不可用”。回调异常不从 app 的刷新 finally 向外传播；renderer update/create 边界由 app 捕获，停止图形并保留文字。WebGL context 丢失后不自动抢回 3D：停止绘制、dispose，显示像素或文字，明确提示；恢复事件只记录能力变化，用户点“3D”才重新尝试，用 generation 丢弃旧 Promise/回调。

### C5：同源真实白名单与 MIME

来源：`gateway.py:96–99`，用途：使 module/core 相对 import 真正可获取；保持 Host/Origin、nosniff 与 CSP。

```python
# Before: static has only /, /app.js and /style.css.
# After: add exact entries, not a directory/prefix server.
static.update({
    "/cockpit.js": ("cockpit.js", "text/javascript; charset=utf-8"),
    "/robot3d.js": ("robot3d.js", "text/javascript; charset=utf-8"),
    "/vendor/three-0.186.0/three.module.js": ("vendor/three-0.186.0/three.module.js", "text/javascript; charset=utf-8"),
    "/vendor/three-0.186.0/three.core.js": ("vendor/three-0.186.0/three.core.js", "text/javascript; charset=utf-8"),
    "/vendor/three-0.186.0/LICENSE": ("vendor/three-0.186.0/LICENSE", "text/plain; charset=utf-8"),
})
# Exact path and empty query guard remain; no external CDN, import map, eval or image route.
```

五条新路径来自此方案的产品路由决定。原 `./three.core.js` 不改字节、不单独换版本；LICENSE 保留原文。静态缺文件时浏览器 import 拒绝由 C4 处理；不把404 JSON当 JS，也不通过开放任意目录来补路由。静态缺文件响应应由 `do_GET` 静态分支就地转成明确404 `route_not_found`，保持 `reply` 安全头，不能因为读文件抛异常直接断掉连接。

## 4. 范围、接口与状态合同

### 目标锁与反目标编号

- **G1**：真实 UUID 的当前注册、身份、进程、终端位置、原因与采样时间可判断，当前/待关联/保留分开。
- **G2**：角色选择真实会话，复用证据、按需消息分页和核验后的原 pane 定位；形式不改 ID、读取范围或资格。
- **G3**：修复历史 `source_unavailable` 混入当前原因；来源失败、陈旧、缺证据保持 unknown；图形失败文字功能可用。
- **N1**：不新增 Hooks、发送/审批/resume/终止、远端/config/信任变更、全机采集、Jev 或 C4D。
- **N2**：不把动画、进程、消息更新/停止当活动、审批或项目完成。
- **N3**：不按 cwd/tty/title/旧 slot/成功一次猜配；不用 demo、随机数或固定提案冒充实时。

不影响项：固定来源/版本与预算、SSH参数、三工具stdio、reader六字段/分页锚点、CSRF/Host/Origin、Zellij严格命令与唯一客户端、正文仅内存/不载入附件、隐藏页面停元数据轮询。任何需要改变这些项的事实都必须交 coordinator 重算基线，不在本次顺手修。

### 跨模块接口矩阵

| 生产者 → 消费者 | 输入/输出与必要增量 | 边界 / 兼容性 |
|---|---|---|
| remote/terminal → merge | 保持 registrations 与 panes 形状；新增行字段 `registration_state: present/missing/unknown` | source_ok 才可 present/missing；数量不等于进程数；source失败 unknown |
| merge → HTTP/MCP | 当前 `reason/reason_codes` 清除跨时点粘连；`last_evidence` 加 slot/reason/reason_codes/registration_state | 都是必要 additive 字段；旧身份/进程/位置字段和分支不改；保留值不取得资格；旧消费端可忽略新增字段 |
| `_view` → web/MCP | stale row 除既有 unknown，还令 `registration_state=unknown`；上次采样信息仍可展开 | 不修改 `_snapshot`；当前资格不因存在旧注册字段恢复；30秒规则不变 |
| app → DOM/cockpit | `{records:[{sessionId,label,category}], selected}`；category 四种，app 唯一推导 | 只带可视化必需字段；不传正文、query、focus、CSRF或API句柄；未知未来枚举落unknown |
| DOM/pixel/3D → app | `onSelect(canonical UUID)` | 来自当前 index 的完整 UUID；app 成员检查/同ID no-op；slot只是标签 |
| app → messages/focus | 保持 GET limit/offset/revision；POST `{}`＋现CSRF | 消息显式事件；focus显式按钮与服务端重新核验；renderer无调用权 |
| cockpit → robot3d | 动态 import；`createRobotScene({view,onSelect,onUnavailable}) -> {canvas,update,rotate,dispose}` | off-stage首次绘制成功才挂载；初始化失败抛错、运行失败回调；generation隔离迟到结果 |
| gateway → browser | 五条精确静态路径＋原三条；固定MIME/CSP/nosniff | 三文件固定hash；无prefix serving、runtime CDN/addon/model/texture |

`registration_state` 描述本次来源对注册的观察，不能推出会话退出；`category` 是网页视图而非共享 API 的新活动状态。整份来源或终端观察失败时，网页仍按现有 top status 撤销当前资格，即使某行候选存在，也归“当前未观察”，具体来源/终端原因由 notice 说明。网页与 MCP 都继续看到身份/进程/位置独立字段，不另开索引。

### 图形状态机与能力

| 事件 | 状态/动作 | 仍保有的能力 |
|---|---|---|
| 页面启动、Three加载待定 | pixel可用则先pixel；否则text，提示正在尝试3D | 元数据、DOM UUID、复制、所选消息与合格focus独立启动 |
| robot3d/module/core加载失败 | 3D标 unavailable，pixel/text，明示加载失败 | 当前选择不变；不造在线或合成角色 |
| WebGL2 null/throw | 3D标 unavailable，pixel/text，明示能力不足 | 同上，不能写成来源故障 |
| renderer初始化/首次绘制异常 | 清理部分资源，不挂失败canvas；pixel/text | DOM持续操作；新UUID按现有功能读取 |
| 实际 context lost / 绘制异常 | 终止绘制、dispose，pixel/text；使旧回调失效 | 同一UUID/消息页/资格由app控制；不自动抢回3D |
| context restored | 仅提示可重试；明确手动“3D”重建 | 不能把事件当恢复完成；重建前仍pixel/text |
| pixel `getContext('2d')` null/throw或绘制失败 | text，隐藏故障canvas，提示像素不可用 | 原生DOM列表、证据、消息、复制、focus |
| API失败/unknown/30秒过期 | app更新所有视图为unknown，禁用focus，保留上次证据 | 图形可画未知证据；渲染成功不改变来源/操作资格 |
| 显式选pixel/text | dispose3D/取消待定attempt；保持selected | 模式切换不触发消息、focus或元数据查询 |

不增加配置型开关。页面上“3D / 像素 / 文字”原生按钮就是运行时降级入口；文本列表始终存在。“3D”失败后可手动重试；没有后台自动重试/重新初始化风暴。

## 5. 并列主要工作包与实施步骤

### S1：当前原因与历史证据分离

**目标/反目标消费**：G1、G3；N2、N3。修 F1 并给分类可靠注册证据，保持未知与保守拒配，不优化为更高位置确认数。

**关键文件/函数/接口**：`session_panel/service.py` 的 `merge_observation`（:96，首看:123–157）、`mark_unknown`（:87）、`SessionService._view`（:203）；`tests/test_observation.py` 的 registration/pane/remote fixture 与 `ObservationTests`。跨模块触点为行 `registration_state` 与非递归 `last_evidence`；HTTP/MCP透传，不改reader或terminal。

**改动理解锚点**：F1 来自复制旧数组，并非 SSH 当前失败。**目标形态理解锚点**：旧标量继续兼容、当前原因本次生成、上次证据有独立标签/时间；原判定顺序保持。**代码片段判断**：修改分支输入与共享字段，必填 C1，包含数据旧/新与拒配闭环。

**输入/输出/边界**：输入 remote、inventory、previous、observed_at；输出既有 snapshot 与两项 additive 证据增量。source失败忽略注册原因作为当前证据，仅明确失败原因；无candidate当前只 `registration_missing`；重复candidate仍 `identity_conflict`；当前candidate自身多个原因保留去重，不从旧行累加。实例变更仍拒配一轮，下一次本来可重核验的行为保持。`_view` 陈旧只在副本撤资格与注册state，不抹快照，不递归历史。`last_evidence` 缺字段为null/空可展示未知，不创造旧时刻。

**执行步骤**：先按 S4 保全before；在实际merge上加入恢复后当前数组应仅 registration_missing 的测试，运行确认红；修改初始化及历史字段；同一命令确认绿；补 source失败/terminal失败/旧混时数组/重复missing/重新出现/instance/stale/不修改输入用例。无需删除函数链或重构 RemoteClient。

**验收**：恢复来源但UUID缺注册，当前不含 source_unavailable/binding_unknown/旧conflict；上次证据可留这些原因且标采样而非事件时间。来源仍失败时原因没有被错误清空。身份/进程/位置、pane、活动/完成与原用例一致；当前原因与上次证据不存在自递归增长。

**验证责任分层**：impl 只运行实际函数＋本地fixture，红/绿完整stdout/stderr与退出码、字段断言存 `work/robot-cockpit-impl-r{n}-verification.json` 的 S1 节及 `impl_report_r{n}.md`；红必须因F1预期断言失败，环境错误不算红。coordinator 独立复跑同fixture，并在Q5授权下取当次元数据，看实际service版本/当前原因与分类，存 `work/robot-cockpit-root-r{n}-verification.json` 的 S1 节。制造真实断连、读真实消息/focus不属impl-safe；S1不需要它们自证。缺新鲜真实保留行时仅真实该分支未验证，不能用旧00:06或fixture冒充现网修复。

**作者体验**：沿用一段显式初始化和原 if/elif 顺序，不加入事件仓库、迁移框架或理由优先级配置；fixture三阶段读起来可还原故障。新增字段英文枚举、UI中文说明，代码注释英文；旧原因保留文本必须告诉作者时间口径。

**依赖/回滚**：依赖S4开工快照；S2消费此增量。若F1或资格回归，停止下游，按before恢复仅本包service/tests；旧客户端不要求新字段。历史是现有进程内有界快照，不做磁盘回填；重启后的历史边界见§7。

### S2：真实 UUID 分类、选择与已有功能

**目标/反目标消费**：G1、G2、G3；N1、N2、N3。让每行原因可见，角色与文字使用唯一UUID和旧分页/定位；不修猜配缺口，不增控制操作。

**关键文件/函数/接口**：`web/app.js` 的 `state` (:3)、`age/current/eligible` (:35–37)、`renderSessions/renderSelection` (:39/:56)、`refreshSessions/selectSession` (:78/:95)、`readMessages/updatePaging/focusSession` (:123/:101/:138)；`web/index.html` 的 sessions、facts、notice、focus、paging ID；`web/style.css` 的原生按钮/焦点/800与440断点。新增 app局部 `recordView` 与 `registrationFromCurrentProvenance`；跨模块接口为§4的视图、`onSelect`和原messages/focus协议。

**改动理解锚点**：旧 main/files 与当前 main/files 可以同时存在，标题必须带证据类别。**目标形态理解锚点**：分类和原因先在DOM可判断，再输出同一份浅视图给画布，单一selected/epoch/page不复制到 renderer。**代码片段判断**：判定顺序与选择入口必填 C2/C3；消息与focus调用形态作为保留比对点。

**输入/输出/边界**：只消费当前API元数据/选择事件；输出分类原生按钮、详情及渲染视图。四组顺序为位置已确认、待关联、保留记录、当前未观察，组内保持UUID稳定排序，空组可省略。present但身份冲突/实例变化或binding_unknown都在待关联，卡片显示具体原因；“待关联”不表示系统将自动补绑。retained标题是保留记录/上次槽位；unknown即使旧slot存在也不是当前slot。顶部保持注册/进程/位置确认原计数，再单独标“索引 N（含保留/未知）”，不把分类数量替换注册count；失败/陈旧时留存数字也标“上次采样”，缺值显示未知。每行标本次采样/证据年龄；unknown标上次采样，不显示“已退出”。

只增加处理最终 renderer 所需的响应边界：`refreshSessions` 在提交新state前确认 sessions为数组、status是observed/unknown；reject/非JSON/不合法形状进入现有catch，保留原records、connected=false。旧服务缺registration_state按C2保守兼容；不能据混时reason数组恢复资格。消息保留现有 reader unknown/empty/scope/revision 与pageOld禁翻页；元数据断连不自动重读正文，当前已经显示的page保留并明确“元数据未确认；本页为上次读取”，分页仍按reader独立结果/原pageOld规则，focus立即禁用。详情evidence增加当前registration_state及last_evidence，当前与上次原因分区标明，不写消息到证据JSON。

**执行步骤**：实现视图helper和分组标题/逐行原因/采样；保留data-session-id与aria-pressed完整UUID；更新详情当前/上次证据；将三种选择来源接selectSession并加成员检查；render/cockpit边界捕获异常，DOMContent功能先挂好；补受控API和迟到响应回归，不抽出新的store或请求框架。

**验收**：same cwd、same slot不同UUID独立可选；未选默认0消息；三种入口选择只读该UUID一次，重复同ID/模式/旋转/元数据不追加读；45条边界无重叠/缺口且revision保持；旧selection响应不回写；选中ID在新snapshot缺行时详情not_found、禁focus，不悄悄切另一UUID或读另一对话。保留/冲突/unknown仍可显式请求历史，但不能focus；5秒超时与30秒stale、APIunknown/reject/非JSON都撤当前资格。只显式focus按钮发送现有空POST，不新增协议。

**验证责任分层**：impl 用DOMfixture和临时网关/全API拦截的浏览器，合成消息与mock terminal；网络记录按endpoint/UUID/offset/limit/revision断言，完整输出/失败存 impl JSON S2 与impl_report。coordinator 独立复跑本地后选择当次真实核验UUID，执行真实消息/分页与focus，过滤字段存 root JSON S2；不保存正文、CSRF或token。真实读取/切pane、客户端加载是非impl-safe，impl不得运行旧live脚本；消息/focus各自缺证据分别未验证，父Q6不得代判。

**作者体验**：保留现有函数和DOM ID；一个类别推导供全部视图消费，native buttons保留Enter/Space/Tab，不发明canvas键盘状态机。卡片就能看到原因，用户不用为理解未映射先读取私信。分类中文标签/原因字典集中app，renderer只接有限英文category。

**依赖/回滚**：依赖S1的正确定义；支持旧版本缺字段降级unknown，允许S3缺失仍DOM运行。回滚只恢复app/index/style的before与本包fixture；不得改reader/terminal/MCP/config，保留S1可单独成立的修复；root验核需要最终版本真实HTTP，不能由磁盘文件推上线。

### S3：同源程序化 3D、像素与文字能力

**目标/反目标消费**：G2、G3及G1证据类别表达；N1、N2、N3。3D主视图可旋转/拾取，失败回退像素/文字；不做工作动画、外部模型、天气/家具/办公室游戏、素材安装或性能配置体系。

**关键文件/函数/接口**：新增 `web/cockpit.js`（classic `SessionCockpit.create`、`update`、`enable3d`、`showPixelOrText`、`drawPixel`/hit-test、`dispose`）；新增 `web/robot3d.js`（可选ESM `createRobotScene`、程序化robot、Raycaster、`update/rotate/dispose`）；新增 `web/vendor/three-0.186.0/{three.module.js,three.core.js,LICENSE}`；`gateway.PanelHandler.do_GET/reply` (:90/:54)，`index.html` classic脚本与robot-stage/mode/status/旋转按钮，`style.css`图形容器。测试锚点 `tests/test_gateway.py` 与S4新增浏览器harness。跨模块入口和状态机见§4，C4/C5为强制片段。

**改动理解锚点**：同源路由、ESM依赖失败与renderer失败是不同层；Three不能成为app启动依赖。**目标形态理解锚点**：原生页面＋一个无网络cockpit外壳＋一个可失效3D模块；两canvas与DOM能力独立，视图/UUID回调与S2闭合。**代码片段判断**：加载/失败分支和静态契约变更必填，C4/C5与§4状态机已给完整结构。

**输入/输出/边界**：输入只有最新view与完整UUID callback；输出画布、mode/status与选择事件。3D几何用原创Box头/躯干/四肢、Cylinder天线或Sphere关节，复用少量geometry/material，不引入addon/纹理/模型/字体请求。UUID放每robot Group/userData，所有子mesh拾取沿父Group取完整ID；slot只当DOM标签，不作内部键。颜色仅四类位置证据与选择高亮，不表达busy/idle/完成。数量来自records.length，0显示无会话证据；1/2/4/7/13及实际变化都重新排布/相机框定；无写死四个角色或main/dev/files到UUID表。

采用简单网格布局、**OrthographicCamera＋整体yaw旋转**，少量ambient/directional light、无阴影/后处理。拖拽改变yaw、按钮左右旋转/重置供键盘用户；CSS像素移动超过4px算旋转，否则Raycaster点选，pointercancel不点选。坐标按当前canvas rect映射，不用屏外裸坐标；控件不覆盖可拾取区域。draw按数据/选择/旋转/resize的dirty事件经一次requestAnimationFrame合并，没有循环活动动画；隐藏时取消待绘制，显示时用最新view绘制但不查询。因无自动非必要运动，减少运动偏好无需另造动画系统；不得后来补入一直跳舞/自动旋转。

像素用独立2d canvas、整数矩形原创机器人与共享category色；关闭平滑，尺寸/列数由容器计算。画布内部height按真实行数计算，公共stage有稳定最小高度和纵向滚动；320px不横向溢出，不为塞满而裁切末行。点击坐标转换用canvas.width/rect.width及height比率，hitbox来自同一次布局且带UUID；不按角色序号猜slot。文本列表一直可操作，所以canvas不承担读屏语义；图形说明明确“位置证据；活动/完成未知”。舞台模式按钮原生、status polite，文字模式隐藏stage绘图但不隐藏列表。

固定依赖仅从已核 `work/robot-render-dependency-r1860/build` 两文件及其LICENSE逐文件复制到上述vendor路径，复制前后独立核size/hash与非link路径归属，不改库字节。固定值：module **662772B / 9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea**；core **1458113B / 9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6**；LICENSE **1081B / 8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc**。JS未压缩共2.02MiB，网关不增压缩功能；LICENSE原版权与MIT通知不删。无npm/npx/install/整包解压，不因文件丢失改用CDN。未核签名仍按基线声明。

**执行步骤**：先将DOM/像素外壳接S2；核/复制固定闭包并增精确路由与静态缺失404；再实现可选3D；初始化于off-stage新canvas，WebGL2取context null/throw、renderer创建与首次绘制均覆盖catch，成功才挂；失效、切模式、移除角色释放mesh/material/geometry与事件/RAF/resize资源。generation保护异步加载/重建和手动模式选择；两个独立canvas避免同一canvas获取过WebGL后尝试2d。每个模式都接受最新view，不缓存旧选择/资格。app的renderer错误边界完成后再验网络。

**验收**：实际同源module/core 200、JS MIME、原CSP/nosniff、无外部资源与eval；normal真实画面能旋转且图像有差异、拾取与DOM同UUID；加载失败、null/throw、初始化/首次绘制错误、context lost、2d失败均保留DOM功能；实际lost事件与context restored/手动retry不抢选。新快照角色增减与待加载时切模式不会留下孤立canvas/失效hitbox/多事件；模块渲染/旋转不发API。无源数据时没有demo；图形能力与来源状态分别显示。stage不横向溢出、末行可访问、视觉异常不能被state字段掩盖。

**验证责任分层**：impl 使用精确临时HTTP服务与mock API的真实浏览器，执行模块/core404、错误MIME/CSP、WebGL2null/throw、init/draw抛错、2dnull及上下文事件，记录实际请求、mode/DOM/UUID、截图差、pageerror/consoleerror与扩展支持。故障注入的预期consoleerror单列，不从总失败记录删掉；没有实际extension只能标真实丢失未验证，synthetic event另列。证据存impl JSON S3与impl_report。coordinator独立检查最终生产静态响应hash/HTTP安全头和实际浏览器normal/失效/interaction，存root JSON S3；WebGL/GPU性能、真实API联动不由Node/预览代判。任何本机能力缺口只能写未验证并维持回退，不保证3D在所有设备成功。

**作者体验**：只两个小职责文件，无React/Vite/store/plugin/配置框架；renderer接口少且不带权限，分类文本不在三处复制。作者修改机器人外形只改程序化构成，修改原因只改app；dispose集中在scene/外壳各一处。不全面改写页面或已有function链；若为了visual需要千行自有场景代码，先收窄几何/装饰并交coordinator，不扩大范围。

**依赖/回滚**：依赖S2 view/selection及固定work依赖仍存在/hash匹配；失败文件不可用时不安装替代。立即降级由模式按钮完成，不停查询；结构回滚恢复原index/app/style/gateway，移除本批两个新JS和三个vendor文件前逐个验证归属与当前hash，保留S1可独立修复。不递归删除vendor目录、不删其它工作文件；总体回滚见§7。

### S4：证据、完整回归与独立承接

**目标/反目标消费**：G1–G3、N1–N3全部。将每项功能结论绑定本轮实际输出和责任，保护真实读取/定位与父Q6边界；不以118预览或fixture代替产品。

**关键文件/函数/接口**：`tests/test_observation.py`/`test_gateway.py`及原 `test_messages.py/test_focus.py/test_mcp.py`；新增 `tests/verify_robot_cockpit.cjs`（受控DOM＋HTTP浏览器入口，明确默认全fixture）、必要fixture服务放该测试职责内，不另造产品配置。证据 `work/robot-cockpit-impl-r{n}-verification.json`、`work/robot-cockpit-root-r{n}-verification.json`、子目录 `impl_report_r{n}.md`；before/final manifest/diff见下。跨模块接口为命令→退出码/完整输出→需求证据→root实际承接→fresh reviewer，S1–S3全部主链顺读。

**改动理解锚点**：无Git仓库，旧manifest只能核hash，不能替最终可读diff。**目标形态理解锚点**：最终review可看before→after diff、红绿和两层验证，不依赖实施者摘要。**代码片段判断**：本文C1–C5已覆盖产品闭环；此包文字已足够，无需新增实现片段，因只定义证据/责任和测试入口，不更改产品分支。

**输入/输出/边界**：输入冻结基线、21产品文件manifest、三份冻结父报告及S1–S3最终代码；输出本轮证据。开工前只复制明确21文件到 `work/robot-cockpit-baseline-r{n}/before/` 并写 `work/robot-cockpit-baseline-r{n}/manifest.json`，存原路径/size/hash、新路径/size/hash、基线/方案hash及预期新增文件“此前不存在”。快照不复制`.venv`/私钥/远端`.claude`/消息/浏览器存储。父报告只hash冻结核对，不放入产品diff。若任何原文件已变，停相关编辑并上报coordinator，不覆盖他人改动。

完成后按同21路径＋本轮新增产品/测试文件生成final副本与 `work/robot-cockpit-product-manifest-r{n}.json`，保存可读 `work/robot-cockpit-product-diff-r{n}.patch`；用Python `difflib.unified_diff` 按清单生成等效no-index diff，不初始化Git、不调用Git。本轮/vendor两大文件diff可在主patch明确new-file、size/hash/import/LICENSE锚点，并附逐文件原文路径，不能只写“第三方文件忽略”。自有代码须完整diff；manifest包括untouched与removed（本计划无删除旧产品函数链），未知新增必须报告。

**执行步骤**：开工snapshot→S1红绿→S2/S3局部fixtures→§6完整回归→finaldiff与impl_report→coordinator独立本地/真实承接→未实施的fresh reviewer看最终diff。impl_report逐条需求映射、完整命令/退出码/失败/限制、两层责任状态；其中“真实消息”“真实focus”“父Q6”必须分别标执行/未验证/独立待human，不能一个总PASS覆盖。每次实施/补修后刷新最终hash与证据，再fresh审最终diff。

**验收**：21 before字节可重算、预期编辑范围可追溯、未涉及文件及父冻结报告不变；所有需求有case或明确外部证据缺口。测试失败保留原输出，不因重跑成功删掉历史；本地全量command实际exit0才说本地回归通过；root缺实际消息/focus时不能说产品功能验收通过。reviewer只审记录与实际diff，不操作真实focus。

**验证责任分层**：impl仅fixture/临时loopback/mock subprocess/浏览器全API拦截，JSON含命令/started/finished/exit/stdout/stderr/checks/failures/limitations/hash与场景scope，不执行旧live harness。coordinator按§6/Q5在impl报告后独立复跑并承接真实环境，root JSON分字段过滤正文，真实focus标副作用；human/父原reviewer承接客户端。证据不足约束逐项未验证；审查无能力读取完整证据时待handoff，不用截图替代。证据落盘失败必须停止结论与下一阶段。

**作者体验**：fixture围绕用户行为和历史bug，不镜像代码内部每行；已有稳定回归保持，新增harness一个清楚的fixture入口，实测不偷偷连8766。证据与报告集中子feature/work命名，不覆盖父历史；完整失败信息让下一位作者知道欠哪项，减少猜测。

**依赖/回滚**：快照步骤先于所有编辑；完整验核依赖S1–S3最终版本。任何红灯先局部修复并复跑受影响完整集合；新增范围/事实冲突回Gate，不自动补实现。回滚依before清单逐文件恢复，经hash确认新文件归本批才逐个撤回；unknown来源文件不动。snapshot与全部失败、diff、报告长期保留，不通过“回滚”删证据。

## 6. 完整验证矩阵与责任顺序

### impl-safe 自证（S1–S4 的共同完整回归）

实施阶段在本机 `.venv` 和已有 Node/Edge/Playwright 环境执行，缺依赖记录未验证，不安装/npm/npx或变更环境。本方案规划阶段不执行尚不存在的新测试或声称其通过。

| 层 | 必跑命令/场景 | 支持的结论与产物 |
|---|---|---|
| F1红绿 | 修改前/后同一 `.venv/Scripts/python.exe -B -m unittest tests.test_observation.ObservationTests.test_recovered_source_missing_registration_has_current_reason_only -v` | 红=F1断言失败exit1、绿exit0；三阶段调用真实merge，额外历史采样/非递归断言。用环境变量 `PYTHONDONTWRITEBYTECODE=1`保护子进程；红/绿原输出存impl JSON |
| 完整Python | `.venv/Scripts/python.exe -B -m unittest discover -s tests -v` | 所有观察/reader六字段/竞态revision/范围/预算/焦点CSRF/unique client/MCP三工具/端口fixture全量；不得管道tail。通过只说明fixture回归 |
| 语法/文件 | Node `--check web/app.js`、`--check web/cockpit.js`；harness用 `spawnSync(node, ['--input-type=module','--check'], {input: robot3d原文, encoding:'utf8'})` 核ESM语法；Python逐源码compile、不写pycache | 新文件语法与固定vendor hash/size/import闭包/许可；syntax不代替浏览器 |
| 网关 | 完整GatewayTests＋新增五静态200/MIME/bytes/hash、缺文件404、安全头、禁止目录/query/encoded越界 | 精确临时loopback、fake_service无真实远端；static不触发service/messages/focus |
| DOM/选择/分页 | `C:/nvm4w/nodejs/node.exe tests/verify_robot_cockpit.cjs --fixture` | 0/1/2/4/7/13、多cwd/slot、四category、单UUID/epoch/45条/revision/pageOld/复制/禁focus，受控HTTP请求记录 |
| API故障 | reject/503、非JSON、不合法list形状、HTTP200 unknown、source/terminal故障、age5001/30001；消息available=false/revision409；focus拒绝/unknown | 旧record/旧page有显式标注、所有canvas unknown、focus禁用、不模拟在线/空成功；消息失败分页禁用；正文/CSRF不落盘 |
| 图形闭环 | 最终HTML/JS/CSS经真正受控HTTP＋原CSP供浏览器，module/core成功及404/错误MIME/CSP拒绝；WebGLnull/throw/init/draw/context lost/restored/2d null | mode状态＋可见canvas＋DOM＋实际点击/键盘、image差、请求/错误/extension记录；0意外pageerror且预期注入console单列。真实context扩展不可用须未验证 |
| 边界/作者体验 | 320/360/1024/1440px，device scale1/2与像素内部整数尺度2/3/4/5受控设置，N变化/模式连切/selection/pending Promise/lost | 无水平溢出/末行裁切/控制遮挡；每模式选各UUID结果一致；native keyboard与focus保留；等候/旋转/resize/帧/模式切换无额外API |

像素尺度受控测试可直接注入harness的绘制尺寸，不为测试增加用户配置项；每个尺度用实际layout/hitbox边界和DOM断言。浏览器测试接产品HTTP路径与真实模块字节；fixture服务显式注入fake SessionService/mock terminal，不实例化真实RemoteClient/Terminal；浏览器网络守卫拒绝fixture origin以外请求，包括生产8766。不得用file://预览包装或简单VM mock替代ESM/CSP/WebGL结果。旧 `work/verify-ui-r1.cjs` 的测试行为迁入新增harness保留（默认0消息、45条、epoch、正文text、隐藏轮询等），旧work脚本原文不改；新fixture适应window/嵌套分组及注册字段，不能删除原行为检查。

### coordinator 真实环境承接（仅 root；沿用 Q5）

1. 读取impl_report及impl JSON完整输出/退出码，独立复跑本地fixture/最终hash；不能采信“agent通过”。确认运行服务的静态bytes/功能版本与final一致，实际产品浏览器使用同源模块，不用研究404或预览结果顶替。
2. 新取固定来源元数据，记录同一采样的observed_at/age/revision/覆盖四口径、逐UUID registration/identity/process/binding/pane/current原因和上次证据采样。00:06:53只做历史对照；不要求新counts仍2/2/7/2。缺保留/冲突例时对应真实分支未验证，fixture仍可自证。
3. 在当次身份与位置核验通过的UUID里选择，确切记录选择ID。仅为验证读取该真实消息、最近/翻页；仅保留UUID、endpoint、limit/offset/revision、available/reason、items计数/total/next_offset/read_at，不保存正文或截图正文。消息页过少无法覆盖完整45条时，真实边界未验证，保留fixture45条证据。
4. 真实focus会切换pane：按现有接口fresh重核验，记录HTTP与focused/status/reason/pane/exit及独立当前唯一客户端/清单；不直接用pane_id绕过UUID，不往pane输入。事先原pane若无唯一核验UUID，不承诺自动恢复；不猜配恢复。当前身份/位置/age不足则不调用并写具体未验证原因；focus_sent_unverified不是成功。
5. 最终生产浏览器验证3D同源normal、回退和UUID/消息/定位联动；性能只报告实际环境/行数/负载，不作全设备保证。故障注入优先fixture，若生产浏览器不能受控安全复现则该生产分支未验证，勿制造远端断连/重启来追测试绿灯。
6. 保存 `work/robot-cockpit-root-r{n}-verification.json`，真实消息与focus分别标executed/未验证。交给未参与实施fresh reviewer：本基线、最终方案hash、before/final完整diff与两类证据；fresh Review(Impl)审最终产品，父Q6human/原reviewer仍独立。缺任一必需产品证据，review不能给整体PASS。

## 7. 兼容、迁移、失败与回滚

本批没有数据库/远端registry回填；旧reason纠正发生在下一次merge，既有内存previous可带旧字段，C1将混时数组移到上次采样证据。新API增量旧客户端可以忽略；新客户端配旧API时C2保守降级，仍保留消息/资格原函数。任何滚动混版本状态都不保证3D：HTML/cockpit/robot3d/vendor/router一致前模块失败应回文字，不能宽放CSP救场。

网关当前按原手动前台生命周期运行，Python代码/路由更改需要coordinator核对实际服务归属及受控加载新版本。impl不接管8766/不杀已有进程；本轮规划不重启。后续实施入口获准后，coordinator处理已明确归属服务的正常停止/启动；不静默重启Codex/Claude/SSH/Zellij，不添加自启动或替代端口。服务重启会丢失既有**内存**索引的保留行（原行为）；before的过滤证据保留于work作历史，不将旧快照注入生产冒充当前，不新增持久化。重启后只能观察新的当前与运行期间的保留行，此限制必须写进impl_report/root证据。

轻故障优先页面选择文字/像素，DOM始终保留；库/renderer异常只影响图形。API故障保持unknown及旧页，不自动切换demo；采集身份/终端缺口原样保留。权限/读取/定位回归则暂停本批验收并回滚相关包，不以美观补偿。

完整回滚只针对S4明确清单：先核对当前file hash仍为本批final，再从before逐个恢复被改的service/gateway/app/index/style/tests，新增cockpit/robot3d/vendor三文件与新测试逐件核归属后撤回。若当前hash已出现他人修改，停止该文件回滚并交coordinator，不覆盖。只恢复本批授权文件，不动配置、环境、远端`.claude`、Workbench或父报告。新文件删除用已验证绝对路径的原生PowerShell LiteralPath，不递归移除目录。回滚服务加载仍由coordinator按实际归属承接；已切的pane由用户自行切回或另行核验授权UUID，不能把代码回滚说成撤销pane副作用。全部报告、红绿失败、before/finaldiff与hash留存。

## 8. Gate-1、Gate-2与受控出口

### Gate-1 自检清单（作者，交付前）

本轮以存在性硬门禁自检，不以任务数或问题数打分。下面每项必须在正文有实质内容，脚本只能核结构/版本，语义由作者逐条对照基线判断；不是独立评审。

| Required Set | 本文落点 | 本轮作者判断 |
|---|---|---|
| 目标锁/反目标映射完成，不影响项齐备 | §4 G1–G3/N1–N3；S1–S4消费字段 | 已落盘 |
| 受影响文件、函数/接口、改动/目标形态锚点 | §2/§4矩阵、S1–S4 | 已落盘 |
| 各包目标、步骤、验收、回滚、依赖 | S1–S4及§7 | 已落盘 |
| 验证责任分层已落盘 | S1–S4与§6 | 已落盘 |
| 证据产物/责任归属/证据不足约束已落盘 | 两类JSON、impl_report、每包缺证据约束/§6承接 | 已落盘 |
| 作者体验门证据已提供 | 每包作者体验＋保持单selected/nativeDOM/小接口/无新框架 | 已落盘 |
| 核心链路总览 | §1先于工作包 | 已落盘 |
| research事实映射 | §2每行实现/验证/责任 | 已落盘 |
| 片段闭环充分性 | §3 C1–C5含当前/历史、分类、UUID/API、独立回退和路由 | 已落盘 |
| T2输入/输出/边界、测试分层与完整回归 | §4接口、各包边界、§6 | 已落盘 |
| T3跨层接口/状态、兼容迁移、降级/停机/回滚 | §4/§7、S3失败state、STOP条款 | 已落盘 |
| 双Gate执行人/时机/失败回退与Gate2复核 | 本节下文 | 已落盘 |
| 澄清强触发、批量模板与P6留痕 | 本节下文与§9 | 已落盘 |
| 风险/不确定/证据限制 | §7/§9 | 已落盘 |

作者本轮实际验证结构、基线/readiness/研究hash、21产品与三父冻结hash、固定依赖文件hash/size、当前F1 fixture复现，并将命令/完整输出/退出码及失败/限制保存在 `work/robot-lwplan-gate1-verification.json`。没有实际执行本方案尚未实施的验收，也没有把本地复现现有F1当修复。本文件最终hash在Gate证据中记录，避免本文自身hash递归。

### Gate-2 与停止条款

由root另派fresh review_plan主检，coordinator独立复核。逐包检查Required Set、目标/反目标、关键实现/接口与目标结构、片段触发与闭环、验证责任三元组、作者体验、人工review对齐；尤其顺读C1→C2→C3→C4/C5是否还需要猜接线。核10个review输出字段/P1–P9、基线一致性及设计味道。任一缺失/实质失败不得进入impl；证据缺口不脑补通过。回退 `LWPlan -> Review(LW)`；口径不唯一先DELEGATE_QUESTION。PASS也只到 `STOP_BEFORE_IMPL -> ManualMode`，不指挥impl自动开始。

已知shared旧里程碑“Review(LW)通过进入Impl”与coordinator严格停机条款漂移在readiness报告留痕；本文沿严格STOP。当前不修改shared技能、不宣称mirror全面一致，该问题交root维护范围收口。

### 澄清/事件触发

新假设、新风险或阶段切换时即时对齐并留痕于本文§9及子feature状态/审查记录，由coordinator处理权威基线，不私自改clarifications。本轮“规划→待Review(LW)”是阶段切换，留痕为本节Gate1交付及STOP限制；没有新业务问题。

本轮未触发委托提问：范围、形式、来源与验证责任均已确定，生产GPU/真实API及父Q6是已分配的验证缺口，不需要重新决定业务。若实现发现真实身份/绑定必须放宽、来源/权限要扩大、固定依赖变字节、未知文件归属、失败恢复口径不唯一，则先查真实实现/证据，仍阻塞时按P0/P1/P2优先级**一次批量**输出，不按固定数量凑问题：

```text
【DELEGATE_QUESTION】
需要用户确认：Q1 [范围/约束/验收/回滚的一句话问题]
优先级：P0（阻塞） / P1（高风险） / P2（优化）
影响阶段：LWPlan / Review(LW) / Impl
选项：A) [推荐与原因]；B) [权衡]；C) [可选的具体替代]
请一次性回复：Q1=A, Q2=B ...
```

仅需补事实而不作业务决定时输出 `【DELEGATE_ACTION】`，给具体调研主题/输出路径/期望证据，交coordinator执行后resume原agent。此agent不递归委派；阻塞不得靠换来源/安装整套框架/读取私信或focus自解。

## 9. 风险、不确定点与已见失败

| 项目 | 缓解/关闭责任 | 当前结论边界 |
|---|---|---|
| 源数据/实例持续变化，655历史冲突/a98无pane与5保留会变化 | S1保守原判断、S2逐时采样、root最新观察；不改registry/猜terminal15 | 不保证固定角色/数量/三槽常绿 |
| 旧reason数组混时且缺真实故障事件时间 | 当前清理＋last_evidence采样留存；明确历史时间未核验 | 不回填“失败发生于observed_at”，不建设历史日志 |
| 最终同源依赖/CSP/MIME/WebGL/实际上下文/API故障 | S3/S4最终fixture及root实际产品浏览器两层证据 | 研究404/Node444exports/预览118不关闭U1–U3 |
| 2.02MiB未压缩库与真实GPU负载 | on-demand绘制、少量几何/无影/无资源，root实测当前环境 | 没有泛化性能保证；不加压缩/LOD/配置系统 |
| npm签名未核与素材许可 | 使用已核hash/integrity/gitHead三文件＋MIT；仅原创几何像素 | 不称完整供应链签名核验，不复制未核素材 |
| 无Git与现有服务的部署/内存历史 | S4 before/final/diff、coordinator核归属、§7精确回滚 | 不初始化Git；不静默接管/重启；重启保留行丢失是明示限制 |
| 父Q6未答、旧review不能覆盖新代码 | human及原reviewer继续父批；本批fresh审最终diff | 本方案不判客户端加载、不关闭父批 |
| shared里程碑与STOP漂移 | coordinator收口，本文显式遵STOP | 不宣称已修技能或全面镜像审计 |

本轮作者已见失败/限制必须保留：初次合并技能/研究/代码与JSON读取超过工具输出预算，随后按独立文件/有界字段补读，本方案不用被截部分作依据；额外探测 `docs/Docs.Maintenance.Conventions.md` 返回路径不存在，组合shell最后Test-Path使exit0，**该退出码不代表文件读取成功**，本轮不初始化文档规范。一次JSON投影猜测字段名得到null，随后读取真实keys及final_artifact_verification，不将null当缺依赖事实。旧浏览器harness头部组合输出也被截，仅补核当前测试与接口锚点，未宣称完整读过/执行过旧live脚本。

上游已见失败不省略：预览canvas/裁切/抢选/小屏/同高stage、旧wrapper与屏外裸坐标点击失败、初始化注入console与包装警告；依赖初次GBK ©输出失败、错误安装页404、候选模块404与未核签名；父r1/r2竞态红控、runtime/CLI/fixture/UI/端口及正式审查失败继续保存在原报告/work。后续impl报告需引用并保留相关旧失败及本轮新失败；最终绿灯不抹旧记录。

本轮没有产品改动、安装、真实消息读取、focus、重启或Git操作。**无新增跨功能事实**；固定来源、unknown、CSP和UUID边界已在原材料记录，不重复提候选规则。

英文提交消息建议：`docs: plan evidence-based session robot cockpit and fallbacks`。
