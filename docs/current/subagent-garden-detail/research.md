# R13 代码库与公开发言来源调研

日期：2026-10-06。范围：只读核查现有实现、原生索引及一份已登记子agent的 JSONL **字段形状**；未摘录任何 user、developer、tool、reasoning 或对话正文。需求原文见 `source_materials/feedback_r13.md`。

## A. 系统边界与现有能力

- `session_panel/garden_native.py:31-68` 从 `CODEX_THREAD_ID` 和只读 `state_5.sqlite` 的 `threads.source` 解析父链；最多 16 层，根类型为 `cli/exec/vscode`，子项使用 `subagent.thread_spawn.parent_thread_id/depth/agent_path/agent_nickname`。失败即 `GardenError`。`GardenService` 在 `session_panel/garden.py:54-123` 以根 UUID 命名独立 SQLite，快照逐个复核已登记 actor 的原生根归属。
- `session_panel/garden.py:157-287` 是业务状态和收据来源：`assigned → delivered → review_pending → reviewing → reviewed_pass/changes_requested → accepted`；当前产物或复核证据哈希失效时，快照改为 `artifact_changed`。每次真实操作才追加包含 actor、task、version、operation、时间的收据。此状态**不能等同 agent 当前正在运行**。`session_panel/garden_mcp.py:24-89` 注册 8 个工具，角色能力固定；请求复核只产生 pending 收据，不会派发子agent。
- `session_panel/gateway.py:143-181,272-289` 当前 `/api/garden` 仅返回完整账本快照；无按子agent读原生公开发言的路由。`allowed()` 在 `:121-140` 检查 Host、Origin、`X-Session-Client`，写请求还验 CSRF。既有 `/api/sessions/<id>/messages` 走另一套远端会话源，不能直接用来代表本机 Codex 子agent。
- `web/garden.js:1-44,84-205` 小院已有卡片、职责能力、阶段文案、摘要云朵、选中详情及完整收据，默认仅展示每个 actor 的最后一个关联任务。角色标签在卡片文字里；`getView()` 在 `:53-58` 给 3D 的所有角色 `category:'unknown'`，实际场景没有 worker/reviewer 的独立标识。详情目前不展示公开对话或任务阶段时间线。

## B. 入口与主流程

`session_panel/gateway.py:315-328` 启动时仅在当前进程是主会话根时绑定 GardenService。页面 `web/app.js:469-475` 由 `/api/bootstrap.garden_root` 动态挂载小院。`web/garden.js:208-225` 在当前域、前台条件下读取，每 10 秒入口见 `web/app.js:466-467`；切域时 `garden.js:68-82` 清空快照并递增 generation，晚到的请求不能重填异域页面。点选卡片或 3D 机器人共用 `selectActor`，只切显示选中对象。

## C. 关键模块与事实锚点

| 模块 | 可核查事实 |
| --- | --- |
| `garden_native.py:31-68` | 原生父子链；当前查询仅 `id,source`，没有 `rollout_path`。 |
| `garden.py:54-123,157-287` | 同根账本、任务阶段、哈希有效性、真实收据；不提供会话正文或实时状态。 |
| `gateway.py:121-181,272-289` | 本地 HTTP 边界、固定路由与响应；新增展示读取应沿用根绑定与客户端检查。 |
| `garden.js:9-29,53-82,110-205` | 前端核验根和收据、切域清空、卡片/详情；无对话读取。 |
| `cockpit.js:17-36,206-254` | 默认自由巡游；同时显露“自由巡游／回到工位”、动画暂停、旋转与模式按钮，均为视图控制。 |
| `robot3d.js:64-110,358-506` | 每个工位内的自动曲线巡游、点选命中、相机手势；选中机器人会停驻。动画与工作证据明确独立。 |
| `index.html:26-35,60-65` / `style.css:1-80` | 3D 首屏与下方双栏工位/详情；小屏卡片单列。 |

## D1. 原生公开发言字段与边界

本机 `state_5.sqlite` 的 `threads` 表有 `id, rollout_path, source` 列；以 3 个已知同根 ID 查询时，各有 `.jsonl` 路径。**这只是本机版本观察，不是公开承诺的稳定格式**。对其中一份已登记子agent JSONL（约 1.77 MB）只统计类型和键名：

- `response_item` / `payload.type='message'` 有 `payload.role='assistant'`、`payload.phase='commentary'` 或 `'final_answer'`；其 `content` 数组项观察为 `{type:'output_text',text:...}`。同文件的 `message` 还含 `developer` 和 `user` role，且存在 `response_item.reasoning`、`custom_tool_call`、`custom_tool_call_output`，因此**不可泛读 message/content 或转发原始行**。
- `event_msg` / `payload.type='item_completed'` 的 `item.type='AgentMessage'` 也带 `phase/content`，看起来与上述公开发言镜像；同一流还含 `CommandExecution`、`Reasoning`、`FileChange` 等类型。（推断）若两类均采集会重复；可靠的最小筛选范围是单一 `response_item.message` 且严格 `role=assistant`、`phase∈{commentary,final_answer}`、内容项 `type=output_text`，其他全部跳过。
- `threads.rollout_path` 对主会话可带 Windows `\\?\` 前缀，而样本子agent是普通 `C:\` 路径。直接把前者 `Path.resolve()` 与普通 `.codex/sessions` 路径做 `is_relative_to`，本机主会话返回 false。安全路径核验需先处理 Windows 扩展路径形式，然后在同一规范形式中核验受信 Codex sessions 根、文件名尾部 `<thread UUID>.jsonl`、普通文件、精确数据库行；遇到解析异常应拒绝，不应回退全盘 `rglob` 或让 URL 参数指定任意路径。这个观察不表示所有 rollout 都位于同一物理目录，需有负例验证。
- 服务端在查询所请求 actor 前，应先以 `GardenService.snapshot()` 里的注册成员和 `resolve_actor()` 当前根绑定为准；仅向本主会话页面读取该 actor 的公开 assistant 发言。现有 `codex_index.py:27-75` 明确只读身份元数据、排除子agent索引，也不含正文。这是设计边界结论，尚未实现。

## D2. 进度与场景

业务进度可从账本状态和按 `task_id/version` 的真实收据顺序导出，展示“已分配、已交付、复核请求、已接收、复核结论、验收”等已发生事件；`created_at` 是收据时间。`taskFor()` 当前只选最后一个任务，若要展示历史需明确区分当前任务和过往记录。无法从巡游、轮询到的新发言、`updated_at` 单独推断“正在执行”“百分比”或“完成”。

`cockpit.js` 的 roaming 默认 `true`；点击“回到工位”才停止，`robot3d.js` 的每个角色运动仍在自身工位走廊内；动画暂停/页面隐藏时冻结。因而用户要求“让它自由去操作、控制由系统预定义”与底层默认行为相容，但当前显露的手动巡游开关与该体验不一致。此处是现状评价，非实施方案。

## E. 官方资料：采用与不采用

- [OpenAI Multi-agent 文档](https://developers.openai.com/api/docs/guides/responses-multi-agent)说明 `spawn_agent` 的子agent任务与回复可回到父agent；支持把协作链定义为真实工作事件。它**没有**把本机 `state_5.sqlite`/rollout JSONL 内部格式承诺为公开 API，故不采用它来证明本地字段稳定或推导实时进度。
- [W3C APG Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)和[Disclosure Card 示例](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-card/)支持清晰摘要卡片展开详情、按钮 `aria-expanded` 与 Enter/Space 键盘操作；与现有卡片/云朵及 `details` 结构相容。未采用复杂 [listbox](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/) 作为角色卡片：其 option 内交互内容语义受限，而详情需容纳可操作控件与多个语义块。

## F. 已读资料

`source_materials/feedback_r13.md`；R13 `README.md`；R12 `README.md`；上述 Python/JS/HTML/CSS；`tests/test_garden.py`、`tests/verify_garden.cjs`、`tests/verify_robot_cockpit.cjs`；本机原生索引表结构与一份 JSONL 的字段类型统计；上述 OpenAI/W3C 官方文档。

## G. 不确定点清单

- U1：各 Codex 版本/平台 JSONL 是否始终保留 `response_item.message.phase`，以及截断/轮转/并发写入语义；应以本机样本扩充和失败负例验证，缺失时显示“发言不可用”，不回退私有字段。
- U2：所有已登记子agent的 rollout_path 的扩展前缀、路径根与文件名约定是否一致；需逐个仅核验元数据和安全路径，不读正文。
- U3：用户期望显示多少条公开发言及是否需要分页；当前原话只要求“对话信息之类的”。可先做有界按需摘要/最近公开发言（推断），不把它称为完整聊天记录。
- U4：无法由本地日志证明 agent 正在执行或可靠百分比；如需实时状态，需要另一个明确可信的活动源。
- U5：字段筛选只能排除原始私有事件，无法保证 assistant 自身公开发言没有复述敏感内容；展示仍须按用户要求限定可读范围、长度，并作纯文本渲染。

## H. Readiness 最小核查证据

已观察事实锚点：`garden_native.py:31-68`、`garden.py:54-123,157-287`、`gateway.py:121-181`、`garden.js:9-29,53-82,110-225`、`cockpit.js:17-36,206-254`、`robot3d.js:64-110,358-506`、`tests/verify_garden.cjs:1-175`、`tests/verify_robot_cockpit.cjs:990-1025,1060-1092`。JSONL 形状是对已登记同根子agent的一份本机样本的**结构观察**；U1–U5 保留，不能写成已验证的公共契约。旧测试可用：`tests/verify_garden.cjs` 有 12 项受控小院 UI 用例；`tests/verify_robot_cockpit.cjs` 涵盖真实 Three.js 场景、巡游、长时帧采样；Python `tests/test_garden.py`、`tests/test_garden_gateway.py` 可验证根域与路由边界。

---

## 跨功能事实（待确认）

### 架构与约束

- [2026-10-06] Windows Codex `threads.rollout_path` 在同一索引中可混用普通盘符路径与 `\\?\` 扩展路径；任何复用此字段的路径归属核验都要先做同一规范形式的比较。
