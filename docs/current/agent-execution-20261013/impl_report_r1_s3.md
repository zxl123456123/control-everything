# S3 运行工作台实施报告（r1）

受众：共享。页面与测试脚本已落盘；作者执行静态、纯 Node stub 验证，coordinator 执行浏览器验证。新执行 fixture 第二轮 76 项、旧页面 fixture 第一轮 101 项均退出 0；首轮新执行 fixture 失败保留。真实服务页面、后端与原生执行验收仍不能由 fixture 替代。

## 基本信息

- feature_name：`agent-execution-20261013`
- impl_round：`r1 / S3`
- date：`2026-10-13`
- lwplan_version：唯一 `lwplan.md`，SHA-256 `469d9a78473f6ce5f73fd2d3fb30ac2a5464e5cb87c27ce2f1c01843a9b6fe53`；第 7 节及 Review-LW-R2.I1。
- owner：`/root/execution_ui_impl`；S1 汇总正式实施报告，root 承接浏览器验收与实际页面检查。
- 当前阶段：作者 impl-safe 自证已执行；root 首轮旧回归退出 0，新执行 fixture 首轮退出 1、修正后第二轮退出 0。新代码的真实服务页面与原生执行验收仍待 root；下文保留历史失败、修正与第二轮证据。

## 变更事实

| path | change_type | change_purpose | key_changes | related_tasks |
|---|---|---|---|---|
| `web/execution.js` | 新增 | 独立运行闭环页面 | `WorkspaceExecution.init/openTask/onView/refresh`；准备、固定请求、回执恢复、列表、游标事件、具体审批与取消、Token 来源；只用文本节点呈现运行内容 | S3，第 7 节，R2.I1 |
| `web/workspace.html` | 修改 | 页面容器与入口 | 先 defer 加载 execution；增加运行导航、准备表单、回执恢复、活动/历史列表与详情/审批区域；保留原手工任务表单 | S3 |
| `web/workspace.js` | 修改 | 窄接线及稳定错误合同 | api Error 保留旧 message，新增 status/reason；区分 HTTP/网络/超时/坏 JSON/本地 CSRF；只为 Codex 任务增加准备按钮；bootstrap/showView 与 provider 能力接线；缺 execution 脚本时保留旧页面初始化 | S3，R2.I1 |
| `web/workspace.css` | 修改 | 沿用暗色青绿视觉并支持窄屏 | execution 命名范围；单列窄屏、按钮换行、长路径换行、命令/diff 局部滚动；任务操作按钮成列 | S3 / G3 |
| `tests/test_execution_ui.cjs` | 新增 | impl-safe 合同验证 | 使用 VM、纯 DOM/fetch stub；22 项断言覆盖错误兼容、固定 body/key、明确拒绝、未知回查、上下文恢复、重载与无 HTML sink | S3，R2.I1 |
| `tests/verify_execution.cjs` | 新增 | root 专用浏览器验收入口 | 必须显式 `--fixture`；全请求拦截，无真实 API；记录请求、检查、错误与 fixture 标记截图；覆盖桌面/390/360、审批/取消/回执/焦点/双运行/源失败 | S3，第 8 节 |
| `tests/verify_workspace.cjs` | 修改 | 旧页面回归兼容新资源 | 拦截 `/execution.js` 与执行列表 GET；编辑按钮精确定位；新证据写本 feature 目录，不覆盖旧 M0–M2 证据 | S3 / G3 |

网关 `/execution.js` 白名单由 S1 作者负责，已明确交接；本作者未改 gateway 或后端。S1 已确认列表 `runs/active/total/limit` 与公共投影；S2 已确认事件和审批 detail 的允许字段。没有修改旧 JSON、认证、全局配置、8766/8770 进程或 Git。

## 目标对齐

- goal_lock_check：G1 的显式准备/提交和运行身份、事件、结果有页面入口；G2 的本地请求回执与原生运行状态严格分开；G3 的旧手工任务、来源、用量说明保留。实际使用结果仍依后续集成证据。
- anti_goal_touch_check：页面不会自动派发、恢复原会话、自动审批或更新人工任务状态；没有模型输出 HTML/Markdown 链接和自动打开 URL；没有向真实页面注入示例运行。其他 Provider 继续明确未接入执行。
- authoring_ergonomics_notes：运行职责在独立闭包；原 helper 和页面结构只做窄接线。错误 reason 集中映射；request_id/body 只在首次显式提交冻结。原结果未知时不能靠编辑草稿生成新 key；GET 404 只显式重试内存中的原 body；重载仅保存 request_id/task_id，不重造提示词。

## 已执行验证

已全文读取 `verification-before-completion` 并在本轮执行下列命令，完整输出及退出码见证据。初次与复跑均没有产品测试失败。

| 命令 / 范围 | 结果 | evidence | owner | conclusion_if_missing |
|---|---|---|---|---|
| `node --check web/execution.js`、`web/workspace.js` | 两项退出 0 | `work/agent-execution-20261013/impl-ui-verification-r1.json`，含命令、时间、输出和退出码 | S3 impl | 缺证据不能称脚本语法通过 |
| `node --check tests/verify_execution.cjs`、`tests/verify_workspace.cjs`、`tests/test_execution_ui.cjs` | 三项退出 0 | 同上 | S3 impl | 只证明语法，不证明浏览器交互 |
| `node tests/test_execution_ui.cjs` | 22 项断言、0 失败、退出 0 | 同上；早期独立输出 `impl-ui-contract-r1.json`、`impl-ui-contract-r2.json` 保留 | S3 impl | 缺证据不能称恢复合同在 stub 中成立；不能扩张为真实 HTTP/浏览器通过 |

验证覆盖稳定状态/reason、旧错误中文 message、网络/超时/无效 JSON/CSRF、所有确定拒绝组合、首个 await 前锁定和冻结、双击一次、已登记不重复发、GET404 原 body/key 重试、GET503/网络只查、idempotency_conflict 回查、context_changed 刷新成功/失败保草稿、重载无 body 禁止重发。

失败与限制：本轮合并读取较长 lwplan/workspace 输出曾被工具截断，已单独补读第 3/7 节、bootstrap、CSS 与旧 harness 入口；不是测试成功证据。本作者尚未执行浏览器、真实服务或真实 Agent；root 的执行结果不能未经独立读回即写作作者通过。

## coordinator_handoff_verifications

| 验证 | 移交原因 / 建议承接方式 | evidence_expected | owner | conclusion_if_missing |
|---|---|---|---|---|
| `node tests/verify_execution.cjs --fixture` | 浏览器超出 impl-safe；root 自行运行并阅读全量 JSON 与桌面/360/390 截图 | `ui-execution-fixture-*.json/png`；命令退出码、每项检查、所有失败；截图必须注明 fixture | root | 不能称移动交互、焦点、全拦截恢复或审批页面已验收 |
| `node tests/verify_workspace.cjs --fixture` | 旧页面浏览器回归；root 自行执行 | 本 feature 下新 `ui-fixture-*.json` 和 `workspace-fixture-*.png` | root | 不能称旧任务/用量/资讯交互无回归 |
| 新隔离端口/DB 的真实产品页 | 新资源、CSP、精确 HTTP 路由和后端投影必须实际联调；不得用旧 8770 缺静态资源的 guard 掩盖新服务失败 | `real-workspace-*.png` 与 HTTP/浏览器错误日志；必须实际加载 `/execution.js` | root + S1/S2 | 不能称实际服务已可用，也不能把 fixture 当实际派发 |
| 页面隐藏后暂停轮询与恢复、真实审批/取消 | fixture 可检验逻辑；浏览器前后台与原生通知仍需 root 实际观察 | 与第 8 节原生/集成证据对应；真实与合成来源分开 | root | 不能称真实通知、审批或取消生效 |

### 真实页面 DOM 操作入口

1. 进入 `/workspace#tasks`，已有 Codex 任务按钮 `[data-run-task="<task UUID>"]` 只打开准备。
2. 核对 `#execution-context`、`#execution-policy`、`#execution-inheritance`；填写 `#execution-prompt`，按 `#execution-submit`。
3. 回执恢复：`#execution-lookup`；只有同页 GET404 且原 body 在内存时显示 `#execution-retry`；已登记后 `#execution-another` 明确准备另一运行。
4. 列表 `[data-run-id="<run UUID>"]`；详情 `#execution-run-meta`、`#execution-events`、`#execution-token`；`#execution-gap` 显示截断历史。
5. 具体审批 `[data-approval-id="<approval UUID>"] [data-decision="accept|decline|cancel"]`；cancel 调运行取消 API。`#execution-cancel` 只取消当前所选运行。
6. 原生 unknown 的 `#execution-prepare-again` 是独立新运行入口，不能解锁尚未查回的 HTTP 提交未知。

## contract_drift_reports

没有发现需要修改权威计划的新冲突。root 补充旧 8770 的旧 gateway 尚不提供 `/execution.js`；按旧页面兼容范围增加可选资源 guard，明确资源未就绪，不改变新版服务必须加载新资源的验收要求。该信息已经回传 root 与 S1。

## 未完成、风险与审查重点

- root 新执行 fixture 第二轮和旧页面 fixture 第一轮已有原始通过证据；最终共享静态资源的旧页面回归仍由 root 再跑。真实服务页面的 Cua 操作、后端联调截图和移动端实际联网尚未验证，不能并称通过。
- 审查重点：固定请求锁、确定拒绝的精确 status/reason 配对、重复/过期审批、选择变更丢弃旧响应、取消与 completed 竞争、cleanup unverified 的目录占用说明。
- 事件与审批已改成中文标签和原始命令/路径/diff/正文纯文本；已知策略与 Token 字段同样提供中文名称，未知允许字段仍保留字段名以免丢失事实。
- 页面只能表示本次运行的官方 Token 通知；自动每日 Token、费用和账号推理可用性仍不可从此推导。

## 回滚与交接

回滚信息：**可直接回滚**。去掉 execution 资源、运行 nav/view、任务准备按钮与窄接线；S1 同步去掉静态路由。无新增用户数据或旧 JSON 改写需要恢复。新运行表由 S1 保留，不能为关闭 UI 删除已有事实。

英文提交消息建议：`feat(workspace): add explicit Codex run controls and receipt recovery`

本目录无 Git，本作者未执行 commit/push。无新增跨功能事实。

## r1 补实施：root 首轮浏览器反馈

本节是同轮实施修正，不覆盖此前证据；没有宣称首轮浏览器通过。

### 已读回的 root 证据

- `work/agent-execution-20261013/ui-workspace-regression-r1.log`：root 执行旧 harness，101 项检查，失败数组为空，退出 0；这是旧页面 fixture 回归，不是实际服务验收。
- `work/agent-execution-20261013/ui-execution-r1.log` 与 `ui-execution-fixture-2026-10-13T13-58-21-046Z.json`：root 执行新 harness，首轮退出 1。多数提交用例因 `crypto.randomUUID is not a function` 中止；三尺寸焦点断言失败。原日志和失败没有删除或覆写。

### 定位与修正

1. fixture 原域名 `http://execution.fixture` 不属于浏览器安全上下文，和产品 loopback 不一致。fixture 改为全拦截 `http://127.0.0.1:18769`；仍拦截所有请求并阻止任何未知请求穿透，不启动或连接实际服务。生产 UUID 逻辑未加不安全随机后备。
2. 首轮焦点断言先 `approve.focus()`，随后测试 helper 点击“刷新运行”，点击本身改变焦点。改为在空闲时聚焦后调用公开的同一轮询函数，完全不点击其他控件。额外增加另一审批更新时保持当前焦点的用例。
3. 同时收紧产品审批更新粒度：以 approval ID 和当前卡片签名更新，其他审批变化不再替换整块审批 DOM；未变化的卡片节点保持。
4. 审批、事件、有效策略、Token 从原始 JSON 展示改为中文标签的纯文本。命令、cwd、文件路径、diff、网络请求范围、截断/完整性、状态、退出码与通知值均保留；没有 HTML 解析、链接激活或自动打开 URL。

### 补实施自证

- 命令：`node --check web/execution.js`、`node --check tests/verify_execution.cjs`、`node --check tests/test_execution_ui.cjs`、`node tests/test_execution_ui.cjs`。
- 结果：全部退出 0；纯 Node 合同从 22 项增至 **24 项**，新增“另一审批变更时保留未变卡片节点”“中文标签保留原命令与 diff”。
- evidence：`work/agent-execution-20261013/impl-ui-verification-r1-fix1.json`，含命令、时间、责任人、完整输出、退出码。
- owner：S3 impl；浏览器复跑继续由 root 承接。
- conclusion_if_missing：没有 root 复跑原始结果，不能称 UUID fixture 或实际焦点交互已通过；本次作者证据仅支持语法与纯 DOM stub。

以上是第二轮浏览器回传之前的补实施快照；回传后的当前状态见下一节。真实服务、真实 Agent 和移动浏览器实际联网仍不在本作者已验证范围。

## coordinator 第二轮 fixture 证据回传

本节仅补报告，没有修改源码或测试脚本。作者读回 root 的完整运行日志，并以本地 Python 解析两份完整 fixture JSON，核对每项 `passed`、失败数组、退出码、全拦截标记、尺寸集合与截图文件存在性；该证据读回命令退出 0。作者没有重新启动浏览器，也不将 coordinator 的实际执行归为自己的 impl-safe 测试。

| 验证 | 结果及证据 | owner | 结论边界 / conclusion_if_missing |
|---|---|---|---|
| `node tests/verify_execution.cjs --fixture` 第二轮 | **76 项，0 失败，退出 0**；`work/agent-execution-20261013/ui-execution-r2.log`、`ui-execution-r2.json`、`ui-execution-fixture-2026-10-13T14-07-07-960Z.json` | root/coordinator 实际执行；S3 作者读回 | 证明该版本全拦截浏览器 fixture 的检查成立，不证明真实 Agent 或实际后端已接通；缺这些证据不能签 fixture 通过 |
| `node tests/verify_workspace.cjs --fixture` 第一轮 | **101 项，0 失败，退出 0**；`work/agent-execution-20261013/ui-workspace-regression-r1.log`、`ui-fixture-2026-10-13T13-58-21-056Z.json` | root/coordinator 实际执行；S3 作者读回 | 这是第一轮共享资源快照的旧页面回归；最终共享资源再次回归仍由 root 承接，不能以旧结果替代 |
| fixture 截图人工查看 | root 已查看 1440/360 审批全页截图，回传文本、长路径和动作按钮布局可读；截图名保留 `fixture` 来源标记。JSON 另记录 390 截图，作者只核对文件存在 | root 人工查看；S3 作者记录归属 | 人工查看结论限 root 已查看的截图；390 不冒称已人工查看。截图均为 fixture，不是实机后端页面 |

第二轮 JSON 记录 1440、390、360 三个尺寸，`fixture_only=true`、`real_api_used=false`、`blocked=[]`。76 项中包括提交前锁定、原回执恢复、确定拒绝、上下文刷新失败/成功、重载只查、两条活动运行、完整/缺失审批、拒绝、取消竞争、unknown、cleanup 未确认、纯文本安全、中文标签、稳定审批焦点、另一审批变化不夺焦、局部 diff 滚动、只读 owner、来源失败和切离运行页停止轮询。

本轮运行生成 `ui-execution-fixture-admitted-1440-2026-10-13T14-07-07-960Z.png`，以及同时间戳 `ui-execution-fixture-approvals-{1440,390,360}-*.png`、`ui-execution-fixture-unknown-{1440,390,360}-*.png`。这些实际文件均位于 `work/agent-execution-20261013/`，来源仍为合成 fixture。

历史失败结论不变：新执行 fixture 第一轮退出 1；UUID 失败源于 fixture 非安全来源与产品 loopback 不一致，焦点断言失败源于测试 helper 主动点击刷新按钮。第二轮改为全拦截 loopback 与不点击其他控件的轮询检查；同时实施逐卡 DOM 更新及中文纯文本展示。不能删除首轮日志或改写为首轮通过。

仍待 coordinator 的验证：最终共享资源旧回归、正式页面 Cua 实机操作、新隔离服务/真实后端截图与接口联调、原生配置/推理/审批/取消及清理证据。当前报告不把上述待验证项与 fixture 通过合并。
