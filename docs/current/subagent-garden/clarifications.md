# 子agent协作小院：澄清与完整实现基线

## 未回答

无用户范围问题待回答。技术方案与Gate负责收敛实现和证据，不能以缺源伪造完成事件。

## 已回答

- 用户要求温暖、舒适、生动的星露谷感觉；保留可识别的机器人与工位，功能真实注册。
- 消息云朵选择“完成摘要”，详细记录点开看。
- 第一条协作选择“产物交接与复核”：交付产物→请求复核→收到结果。
- 用户限定主体为子agent；主session之间默认隔离。coordinator按主聊天Thread UUID分域，不用同cwd、runtime sessionId或fork共享runtime根进行合并。
- 当前聊天已实际移入Codex / Claude 工具与工作流分组；不操作其它用户聊天。

原文：docs/current/subagent-garden/source_materials/feedback_r12_cozy_subagents.md。

## 头脑风暴决策

1. 视觉方向为温暖的小院/工作坊、柔和草木与木色、清楚可读的正常中文字体；角色和少量动作增强空间感，关键信息保持平静。设计保留现有机器人几何、步态、拾取与回退，首次不建立农场经济、经验等级或虚构工作进度。
2. 主聊天各有独立协作域，主体使用原生完整child Thread UUID与明确parent_thread_id链；native agent_path/昵称只作描述，不能作为全局身份。当前只接本机Codex子agent，远端Claude的正文/身份/定位原能力保持；其团队关系未验证时明确未接入。
3. 完成、交接与复核由真实注册操作和明确产物/结果记录触发。Stop/notify/SubagentStop、工具exit0、时间、目录、动画或native completed仅表示各自事件，不自动生成任务成功。
4. 首条功能是同域产物提交、请求复核、接收复核、结果记录与coordinator验收；复核者与提交者必须不同。气泡区分“产物已交付，待复核”“复核中”“需要修改”“复核通过，完成交付”，全文和收据可展开。
5. 使用项目内真实MCP工具与本地调用入口。明确区分工具已注册、stdio实际调用与当前桌面自动发现；不能把模板/配置保存当客户端已经加载。调用上下文绑定真实caller Thread UUID与原生parent链；写入参数不能自称另一个actor或跨root。
6. 原生子agent派发/续传继续用当前受支持collaboration工具，由同session coordinator按有效收据承接；新能力不构建任意命令执行器，不向其它主聊天发送请求。请求收据、实际派发、接收、复核完成分开记，不能把入队当接收或完成。
7. 真实身份、任务、产物、复核和事件单独存储；不改原Codex identity API的unknown语义，不从实时协作记录反推终端可定位。产物路径与摘要限定当前任务及所属workspace，展示以纯文本和现有受守卫动作入口为主。

**用户确认**：✅ 来自上述原话与两次明确选择；session隔离澄清覆盖早先“机器人之间”的宽描述。实现方式由agent负责，不新增跨session/新终端命令权限。

## 完整实现基线

### 1. 目标锁

- G12.1：页面有温暖小院感觉，同时比现有五屏纵向阅读更清楚；选中角色可看到所属主session、角色能力、产物与复核状态。长中文与完整身份键不截断；窄屏/键盘可用，原3D/像素/文字回退与原质量不下降。
- G12.2：子agent可以实际调用已注册的同域产物/复核操作，产生带ID、主体、来源、时间、产物版本和结果的收据；完成摘要云朵只由明确的任务结果记录触发，不靠展示动画或回合结束猜测成功。
- G12.3：各主聊天Thread UUID分域；同root子agent通过显式parent链绑定，所有读写/交接/复核/气泡/迟到响应和任务选择均保持该域。相同目录、相同agent_path或fork共享runtime sessionId不能串域。

### 2. 反目标

- N12.1：不将metadata/Stop/消息送达/队列创建/动画当完成；没有证据的能力不可展示为已接入或已成功。无真实事件时保持unknown/未注册/待接收。
- N12.2：不跨主session派工、互发消息、共享状态或接受其它session产物；不新增任意命令执行、输入终端、resume/kill、审批绕过或全局hook/客户端配置改写。注册/工具注解不能替代调用上下文与服务端检查。
- N12.3：不关闭旧235ms/工作台持续关联/owned回收/Q6/远端团队/Codex正文缺证；不改原终端/CSP/CSRF/Host/Origin/缓存/身份守卫以求新能力绿，不丢弃其他工作或初始化Git，不降低人口/原几何/AA/DPR/粒子/速度伪造性能。

### 3. 风险边界与已观察事实

- 当前主聊天为01a109a3-2890-7531-805b-6ed67edb5d5d。原生read_thread的当前subAgentActivity确认三个调研child UUID/path；只是native生命周期，不是业务验收。
- Root CODEX_THREAD_ID与当前主聊天UUID相同；一个child环境值为01a10a43-ada1-76f0-b278-1a9e3f7c7c85，与其原生child UUID一致。是单样本身份事实，不等于认证完成。
- 对上述四个精确UUID只读SELECT id,source：主聊天source=vscode；child source为subagent.thread_spawn，含parent_thread_id/depth/agent_path/agent_nickname。需按本机真实schema验证并保守失败，不能将内部格式当永久官方API。
- 现有codex_index只读六字段、过滤child，activity/completion硬置unknown；原MCP只有三只读工具。新功能需要独立入口，不改旧语义。
- Codex/Claude Stop是回合边界；Codex app-server动态工具与MCP Events存在版本/宿主限制。首批不依赖未经本机验证的hot-load、cloud events或实验接口。
- 服务ack含义须明确：成功收据对应已记录的该操作；入队、派发、接收、复核和最终验收分别判定，失败不产生后续成功状态。任务/产物版本变化使旧复核不能冒充当前结果。
- 原node服务器/terminal用户进程不由作者操作；实机root承接只使用明确自有样本与可追溯owned服务。若部署需要但归属无法核验，保留当前服务，不拿临时服务代用户8766真实接通。

### 4. 验证责任

- impl-safe：语法、真实module/handler/MCP定义、当前patch/manifest、纯本地行为/隔离/版本/失败负例；owner唯一root作者，产物impl_report与本地完整stdout/stderr/exit。缺则本地未验。
- coordinator：当前全回归、隔离fixture、MCP stdio实际tools/list+tools/call、原生同root子agent的真实产物→复核→收据→气泡、第二root拒绝/读写隔离/迟到响应清除、实际服务资源与DOM/WebGL/screenshot、原48同质量性能。owner root承接，缺则对应实机/客户端/视觉未验。
- fresh reviewer：未参与计划或实现，读当前源码/diff/所有输出与旧失败，独立复算并审角色/责任/域/生命周期/实际能力/体验。缺则不放行本轮交付。
- 不能只在前端模拟气泡或按脚本写几条fake JSON便宣称真实子agent能力；合成演示必须显式标记，真实验收要有当次caller/parent、真实产物hash、独立reviewer与真实注册操作收据。

### 5. 文档职责与实现纪律

- 本README为当前状态；本基线为本feature唯一范围输入；唯一lwplan必须消费G12/N12和上述事实，Gate1/fresh ReviewLW/root Gate2后方可改产品。
- R11所有旧文档/证据冻结为历史；本次先保全当前before。产品功能与视觉依风险分步，有真实闭环再交付，不创建第二套身份或伪造旧工具支持写入。
- 使用现有类型/函数/工具成熟机制，局部代码优先；不引入通用agent执行平台、任意消息路由、全局pool/调度器或为未知未来设计配置。
- root按已有明确唯一实施/自动偏好工作，不逐次重复权限问题；需要新的范围或实际不支持的能力时先给可审查证据再收敛。
- 提交建议：功能`feat(garden): register scoped artifact handoff and review tools`；界面`feat(garden): add cozy subagent spaces and verified result bubbles`。当前无Git，仅建议，不执行commit/push。

### 6. 基线生成规则

以本feature README原始需求和source_materials的完整用户输入为底稿，应用两次明确选择与最新session隔离限定；这份基线是当前唯一范围输入。实现how由规划收敛，不重新索取已授权范围。

### 7. 基线内容边界

只覆盖G12.1–G12.3、N12.1–N12.3及第3、4节风险和验证责任；不建立全局agent调度、跨主聊天通信或可信本机OS权限隔离。CODEX_THREAD_ID是受信本地调用进程的身份上下文，需核查原生父子记录；不能宣称抵御同OS用户恶意改环境或直接改数据库。

### 8. 下游消费规则

Readiness、唯一lwplan、fresh ReviewLW、root Gate2、实施和fresh ReviewImpl均须读本基线并逐项绑定目标/反目标及证据责任；方案和实现不得自行扩大范围或将pending receipt判为完成。

### 9. 状态与兼容性规则

本feature缺少完整基线或技术Gate时禁止进入产品实施。旧R11结论与证据保留原状态；新协作入口单独声明版本、当前source adapter限制和可信本地进程边界，不把旧unknown改成业务成功。

### 10. 任意阶段补充需求处理

新用户约束先写本文件及必要source_materials，重算完整基线后判断是否回到Readiness/LW；当前review若依赖旧版必须续传最新原文与差异。实现后任何产品修改使旧ReviewImpl失效，须重验并由fresh reviewer审最终版本。
