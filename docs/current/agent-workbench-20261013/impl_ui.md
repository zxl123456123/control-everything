# 工作台 UI 实施支撑记录

本组已按 S4–S5 落盘界面、交互、浏览器 fixture 与桌面入口。当前本组证据仅支持静态结构、JavaScript 语法与 PowerShell AST；浏览器交互、真实来源和真实应用窗口由 coordinator 承接，本文不将这些项目写为 UI 自证通过。

## 基本信息

- `feature_name`: agent-workbench-20261013
- `impl_round`: r1 / UI
- `date`: 2026-10-13（Asia/Shanghai）
- `lwplan_version`: Gate-2 PASS 版本，SHA256 `1bf61859f912954a72994727e3ff8ba6919353ee00de28f749b00172074e599b`
- `owner`: workspace_ui（Impl S4–S5）
- `formal_report_owner`: coordinator 将本记录汇总到 `impl_report_r1.md`，后续正式轮次保留历史。

开始前读取了 safe-code-changes、verification-before-completion、clear-expression 原文；消费 README 原始需求、完整 clarifications、hlplan、lwplan 与 `review_notes_lwplan_2.md`。在 root 明确 Gate-2 放行前仅阅读，没有编辑代码。

## 变更事实

| path | change_type | change_purpose | key_changes | related_tasks |
|---|---|---|---|---|
| `web/workspace.html` | 新增 | 同源中文工作台与可访问表单 | 桌面侧导航、总览、项目任务、Agents、用量、资讯；表单 label/fieldset/状态提示；旧入口直达 | S4 |
| `web/workspace.css` | 新增 | 桌面与手机尺寸布局 | 深蓝灰背景、青蓝强调、紧凑列表、清晰空状态；700px 下单列和紧凑导航；表单与长文本约束 | S4 |
| `web/workspace.js` | 新增 | 消费冻结接口与处理保存回执 | bootstrap + client/CSRF；独立本地/用量/资讯加载；项目过滤；任务创建/编辑/状态/Provider/关联；人工记录；官方额度显式刷新；安全文本与 HTTPS 链接 | S4 |
| `web/index.html` | 修改 | 旧会话入口通往新工作台 | 仅追加 `/workspace` 入口链接 | S4 |
| `web/progress.html` | 修改 | 旧进度入口通往新工作台 | 仅将原回链放入 nav 并追加 `/workspace` 入口 | S4 |
| `scripts/open-workspace.ps1` | 新增 | 用户使用的 Edge 应用窗口入口 | ValidateRange Port；固定 127.0.0.1 URL；可达性检查；标准安装路径发现 Edge；可见 app 窗口 | S5 |
| `tests/verify_workspace.cjs` | 新增 | coordinator 可执行的浏览器交互证据 | 明确仅允许 `--fixture`；拦截所有资源与 API；合成数据、异常、关联、人工记录、360/390/1440px、截图与控制台记录 | S4–S5 的 UI 支撑；不自行验证真实窗口 |

未编辑 backend 独占文件、旧 JS/CSS、旧测试、用户数据、全局设置或任何凭证。未初始化 Git，未启动服务、浏览器或 Agent。

## 目标对齐

`goal_lock_check`：

- G2：读取真实项目/待办接口；手工进度缺失不画 0% 条；任务/用量保存只有收到 `status: ok` 和服务器对象后才清空表单。任务负责人明确“不发送任务”，保留过期会话键以允许只改手工状态。
- G2：额度 GET 只读缓存；只有用户点击才 POST refresh。not_checked、unavailable、stale、缺少百分比均显式展示；有效首窗口在总览显示剩余比例、窗口、额度池和已用比例。产品/Token/币种不加总。
- G2：资讯保留来源、发布/抓取时间和部分失败。外部文本使用 textContent；外链仅 HTTPS，`noopener noreferrer`。
- G3：CSS 和 fixture 包含桌面与 360/390px 路径；实际效果必须由 coordinator 浏览器证据确认。桌面脚本写明 Edge 应用窗口，未声称原生安装或手机联网。

`anti_goal_touch_check`：N1–N4 未引入禁用能力。产品无合成任务/额度，演示仅在明确隔离的 fixture；没有 dispatch/cancel/approve 控件、任意命令输入、凭证读取、公网监听、服务自动启动或旧数据迁移。

`authoring_ergonomics_notes`：HTML 保存语义结构与所有表单，JS 按 API/分区渲染/任务/用量/资讯组织，CSS 沿布局与对应组件组织。没有新依赖、框架、插件抽象、CDN、内联事件或 innerHTML。桌面脚本为单一固定入口，不含后台守护。旧 HTML 修改经快照精确字符串对照限定为入口。

## impl-safe 执行记录

`evidence`: `work/agent-workbench-20261013/ui-static-r1.log`。`owner`: workspace_ui。

| 命令或校验 | 实际结果 | conclusion_if_missing |
|---|---|---|
| `C:/nvm4w/nodejs/node.exe --check web/workspace.js` | 退出 0，无错误输出 | 不得声称脚本语法正确 |
| `C:/nvm4w/nodejs/node.exe --check tests/verify_workspace.cjs` | 退出 0，无错误输出 | 不得声称 harness 可解析 |
| PowerShell `Parser.ParseFile` 读取 `scripts/open-workspace.ps1` AST/token/errors | parse_errors=0，包装命令退出 0 | 不得声称脚本可解析；无论如何不能替代实际窗口验证 |
| Python HTMLParser + JS 静态 ID、label 与快照检查 | 退出 0；69 个唯一 ID、15 个 labelled field、55 个静态 JS ID 引用全部命中；无内联事件/style/innerHTML；旧 JS/CSS 字节相同；两份旧 HTML 精确入口差异 | 不得声称结构引用和既有文件边界已核验；此检查不证明渲染和交互 |

以上当轮命令完整输出和退出码均已读取。初次 workspace.js 语法检查同样退出 0；汇总日志内为最终源码的重新检查。未运行浏览器 harness，因此不把编写用例写成通过用例。

## coordinator_handoff_verifications

| 项目 | 移交原因与建议方式 | evidence_expected | owner | conclusion_if_missing |
|---|---|---|---|---|
| 新浏览器 fixture | 浏览器测试不属于 impl-safe；执行 `node tests/verify_workspace.cjs --fixture` | `ui-fixture-rN.log`，时间戳 JSON，fixture PNG；所有失败保留 | coordinator | 不得宣称任务/用量/窄屏交互通过 |
| 旧页面 fixture 回归 | 依赖浏览器且由 root 合并后执行 | 旧 robot/garden harness 完整输出与退出码 | coordinator | 只能确认旧源码边界，不能确认旧浏览器回归 |
| 真实项目、会话、额度和 RSS | 依赖真实本地/外部状态；不由 impl 启动服务或外部源 | `real-workspace-check.md`、真实 quota/news、旧数据哈希 | coordinator | 不得由合成响应声称实际账号/来源可用 |
| 真实新增/状态/关联/用量编辑和失败保留草稿 | 使用隔离新库与真实项目读取；不得写生产演示记录 | 独立 loopback 服务交互记录、隔离库重读 | coordinator | 不得声称持久化端到端验收 |
| 1440×1000、390×844、360×800 实际布局 | 需要浏览器与视觉核查；含 Agents 或用量视图 | `workspace-desktop.jpg`、`workspace-mobile-390.jpg`、`workspace-mobile-360.jpg`、`workspace-agents-or-usage.jpg`，内容/扩展名核验 | coordinator | 不得声称视觉验收；窄屏也不证明手机联网 |
| Edge 应用窗口 | 真正打开可见 UI，不属于 AST 自证 | root 独立端口运行脚本、应用窗口证据、仅清理己方窗口 | coordinator | 不得称桌面窗口已验收 |

Harness 在所有页面资源前注册 `context.route('**/*')`，仅允许 `http://workspace.fixture` 并以本地文件/API fixture fulfill；不使用 route.continue，不连接真实服务。支持新增/编辑、Provider 变更自动清空不合法关联、关联不在当前样本仍改状态、409 不匹配、503 草稿保留、重复操作锁、人工费用/币种/产品编辑、-32603、有效/缺值窗口、partial RSS、无真实 HTML 执行、空数据/源故障、三尺寸各视图与表单无 body 横向溢出。HTTP 预期失败与真实 console 异常分开记录。

## contract_drift_reports

- 初版 LW 曾把浏览器 fixture 标为 impl-safe；本组等待 root 修订并确认第二轮 PASS 后实施。修订后的责任已采用，没有私自运行浏览器。
- root 真实视觉反馈提出总览应直接展示首个有效额度窗口，且用量详情避免自指说明；已在现有 S4“额度摘要”范围内调整，无接口或新能力变化。
- root 发现真实 Codex cwd 存在 Windows extended-length 前缀并交 backend 处理；UI 不用 cwd 推测归属、不筛掉该路径，会话选项直接使用原 key/cwd。关联归属由既有 backend 冻结合同核验。
- 未发现本组需要改变冻结 HTTP 字段的漂移。
- root 明确 SQLite `daily_tokens` 维持有符号 64 位上限；为避免浏览器 Number 静默舍入，UI 在发送 Token 前使用 `Number.isSafeInteger` 拒绝超过 9,007,199,254,740,991 的整数并保留原输入。fixture 增加 9,007,199,254,740,993 未发请求/原文本保留及 123456 精确提交用例，交 root 执行。

## 未完成与风险

- 本组实现与静态检查已提供；浏览器/真实窗口的最终结论待 coordinator 补充当轮证据。root 已反馈实际页面可交互和当前额度读取结果，但本文不将其他执行主体口头反馈改写为本组独立证据。
- 当前只保留最新 500 条任务与 100 条人工记录并明确显示覆盖；全量更新仍为最后成功提交生效，未新增多人冲突合并。
- 无 Git 仓库，未提交/推送。英文建议提交消息：`feat(workspace): add responsive agent workbench and desktop entry`。
- 本组准备期 `rg --files -g AGENTS.md -g CLAUDE.md` 退出 1，原因是当前项目未找到匹配文件；不是代码验证失败。读取大文档时出现工具输出截断，随后分段重读缺失内容。静态验证记录未出现失败；浏览器失败需由执行者保留在独立证据中。

## 回滚信息

`rollback`: 可直接回滚。停止新入口使用，移除本轮新增静态文件/脚本/测试，旧 HTML 只撤销明确新增的工作台链接；不得整文件覆盖其他工作或删除新 SQLite 用户记录。无需修改任何旧数据或全局设置。

无新增跨功能事实。

## r1 实机反馈补修：手机任务入口顺序

root 在实际 390px 项目任务页发现：六个完整项目行位于任务区之前，导致主要任务入口必须经过项目列表才能到达。此前 root 执行的 68 项 fixture 通过，但未覆盖此操作顺序，不能用既有通过记录否定实机发现。

- `related_tasks`: S4 / G3。
- `change`: `showView` 使用 `insertBefore` 移动现有两个 section：tasks 视图先任务、后项目；overview 仍先项目摘要。移动现有节点，不重建表单，视觉顺序与 DOM/键盘顺序一致。
- `fixture_added`: 三个尺寸分别断言 overview 项目摘要在前、tasks 任务区在 DOM 首位、新建按钮处于首屏、切换 overview/tasks 后保留任务草稿。
- `evidence`: 追加 `ui-static-r1.log` 的本次 JS/harness 语法检查。`owner`: workspace_ui。`conclusion_if_missing`: 不得称修改后脚本可解析；无浏览器证据仍不得称手机交互验收通过。
- `coordinator_handoff_verifications`: root 重跑完整新浏览器 fixture，并复核实际 390px 页面；本组未运行浏览器。
- `contract_drift_reports`: 无 HTTP 或范围变化，修正既有 S4 手机主要操作容易到达要求。
- `rollback`: 可直接回滚本次两节点排序与相应用例，不影响数据或表单字段。
