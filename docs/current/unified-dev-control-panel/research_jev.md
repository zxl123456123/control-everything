# Jev 决策模型专项调研

调研日期：2026-10-03。范围：公开一手资料与公开代码，只读；未安装依赖、登录账户、调用付费 API、下载权重或执行模型。本文件提供事实与待验证应用假设，不进行正式选型或架构设计。

## A. 身份、系统边界与现有能力

用户补充：`jev就是github上目前比较火的，决策模型，你可以去搜索看看`。与描述最匹配的是 **TypeSafe AI 的 Jev / System One**；确切指向仍需用户认可，不能由名称相似直接等同。（推断）

- 官方文档把 Jev 称为 TypeSafe 的旗舰 System One 模型；文档页尾指向 GitHub `typesafe-ai`，该组织反向链接 `typesafe.ai`，官方归属可交叉核验。[Introduction](https://docs.typesafe.ai/introduction)、[TypeSafe GitHub](https://github.com/typesafe-ai)
- 官方公开 GitHub 主要提供 SDK、技能、LLM adapter、评估流程。`typesafe-ai/skills` 是帮助 agent 写 TypeSafe 集成的技能，并不包含 Jev 模型权重。[官方 skills](https://github.com/typesafe-ai/skills)
- 搜索得到的 `jev-ai/jev-api` README 明确声明自己是独立应用、并非底层 Jev 官方产品网站；目录是导出的 Next 静态页面。不能根据仓库名称或它自己的“Official Website”标签认定为模型官方。[独立应用 README](https://github.com/jev-ai/jev-api#english)
- Jev 接受 state 与预定义问题，返回结构化判断；**不写代码、不生成解释或聊天文本、不自行执行工具，也不能替换 Codex 的聊天/编程模型**。[Jev with coding agents](https://docs.typesafe.ai/introduction/coding-agents)
- 当前输入限于文本及 JSON 表达的数据；图像、音频、视频不直接支持。英文为主训练语言，中文等 CJK 文本需单独测量精度。[State](https://docs.typesafe.ai/concepts/state)

**开源边界：**本次核查的官方组织、SDK、技能和 Models 页面中没有发现可下载的 Jev 权重或本地推理服务。公开 SDK 不代表模型开源；当前可核实的使用入口是托管 API。此处是“所查来源未发现”，不是对所有渠道的绝对断言。[官方 SDK](https://github.com/typesafe-ai/typesafe-sdk-js)、[Models](https://docs.typesafe.ai/models)

## B. 入口、返回语义与执行边界

官方入口：`POST https://api.typesafe.ai/v1/systemone`；请求顶层为 `state`、`model`、`questions`，鉴权为 `Authorization: Bearer <API_KEY>`。问题 ID 是用于对齐返回结果的应用键，不进入模型推理；选项名与描述会进入模型。返回含 `model`、`answers`、`usage`。[API reference](https://docs.typesafe.ai/api)

| 原语 | 请求中的候选/标准 | 返回字段 | 应正确理解为 |
|---|---|---|---|
| Choice | `criteria`：选项名到描述的映射，最多 255 个选项 | `choice`、完整 `probabilities`、`confidence` | 在给定候选集合中选择最高概率选项；分布之和为 1 |
| Score | `criteria`：从低到高的描述数组，2–10 级 | `score`、各等级 `probabilities`、`legend`、`confidence` | `score` 是等级索引的概率加权平均，可以非整数；并非物理量或精确数值 |
| Noul | 是/否命题，可附 `true`/`false` 标准 | `noul`，0–1；没有独立 `confidence` | 模型给“是”的概率；不表示问题所述事物的强度 |

原语语义分别见 [Choice](https://docs.typesafe.ai/primitives/choice)、[Score](https://docs.typesafe.ai/primitives/score)、[Noul](https://docs.typesafe.ai/primitives/noul)。同一调用可混用三类问题，各自针对相同 state 独立判断；后续组合、路由与执行归应用代码负责。[Introduction](https://docs.typesafe.ai/introduction)

**`options` / `p` 的名称核对：**当前官方 HTTP 请求使用 `criteria`，返回使用 `probabilities` 和 `noul`；`options`、`p` 可以是 UI/示例中的便捷命名，不能凭此拼 HTTP 字段。Function Calling cookbook 的本地 spec 使用 `options`，由 Dispatcher 转成标准问题；它打印的 `p` 是读回的概率，仍不是自动执行授权。[Function calling](https://docs.typesafe.ai/cookbooks/function_calling)

**概率、confidence、成功率是三个概念：**Choice 的 `confidence = (p_max − 1/n) / (1 − 1/n)`，即最高概率相对均分的偏离；Noul 没有额外 confidence。这是模型分布的统计摘要，并非模型读取真实世界验证后的正确率，更不是命令或渲染的执行成功率。Score 官方示例也明确：confidence 为 1 仍不保证答案正确。[Confidence](https://docs.typesafe.ai/confidence)、[Score](https://docs.typesafe.ai/primitives/score)

因此 Choice 返回 `retry_render` 只能表示模型在候选中推荐了它；是否重试、何时重试、参数是否合法、权限是否允许、执行是否产生目标文件，全都需要外部证据。API 不返回自然语言推理链；面板不能把后来生成的解释冒充 Jev 自己提供的 reasoning。

## C. 已读公开代码与关键模块

实际打开官方 TypeScript SDK `v0.6.0` 源文件：

| 证据锚点 | 观察到的事实 |
|---|---|
| [src/client.ts](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/client.ts) `DEFAULT_BASE_URL`、`systemOne`、`fetchWithRetries` | 默认访问 TypeSafe 托管 API；`systemOne` 验证 questions 后 POST；transport 将 body JSON 序列化并发送 Bearer key |
| 同文件 `refuseBrowser` / constructor | 默认拒绝浏览器运行，以免向页面使用者暴露 API key；存在显式危险覆盖项 |
| 同文件 request / fetchWithRetries | debug 会打印请求与响应 body；鉴权头会脱敏，正文不会由这段代码脱敏 |
| [src/types.ts](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/types.ts) `ChoiceResponse` / `ScoreResponse` / `NoulResponse` / `SystemOneResult` | 类型与官方 HTTP 文档一致；提供 model 与 token usage；未包含真实动作执行结果或事实证明 |
| [LICENSE](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/LICENSE) | SDK 为 MIT；该许可覆盖客户端代码，不能据此推断托管服务/模型权重许可 |

这只是公开客户端核验，未接触闭源服务的采样实现、训练实现或模型权重。

## D. 当前模型限制、成本和性能证据

官方 Models 页当前列出 `jev-1.13.0`，`jev-latest` 与 `jev-preview` 均指向它。输入价格 **$0.042 / 百万 token**，输出免费；限流页列出 100K token/s、80 requests/s，并说明会动态调整。上下文为总请求 64k token，state 加最长问题 32k；alias 会变化，响应 model 字段可识别实际版本。[Models](https://docs.typesafe.ai/models)

（按公布输入单价的算术估算）每次总计 1,000 个输入 token，单次约 $0.000042；10 万次约 $4.20。**不是账户报价或实测账单**；问题/criteria 自身也消耗输入，重试、长日志和高频动画触发调用会增加调用量。实际用量应读 API usage / 账户账单，不能把视觉帧数当推理频率。

发布博客自报 70–500 ms 端到端、首页 193.6 倍更快/444.6 倍更便宜；原文说明评估多从美国西海岸笔记本访问、西海岸服务，比较是特定 System One 工作流、以其他模型平均输出作参照，workflow 作者属自家团队且可能有偏差，演示短 state 有利于 Jev。**这些不是中国网络、用户机器、本项目任务或 SLA 的性能保证。**[发布博客](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

该博客的“零幻觉”主要指预定义 schema/答案集合符合类型，不能解释为语义判断永不出错。[发布博客](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

官方 1.13 jaggedness 页面最后复核日期为 2026-10-02，主动承认以下边界：精确数学与计数、日期比较、多层间接推理较弱；大量无关 state 会降低准确度；对抗性 state 可影响结果；Choice 选项顺序可能让答案偏向靠前选项。因此不能让 Jev 判断 GPU 温度是否越界、计算费用、或替代精确权限与安全规则。[已知不足](https://docs.typesafe.ai/model-jaggedness/jev-1.13)

## E. 鉴权、数据出站和隐私边界

- API key 来自服务端配置或环境，官方 JS SDK 文档用 `TYPESAFE_API_KEY`；本次没有检查用户是否已持有 key 或 early-access 权限。[JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)
- 官方 privacy 声明会收集 prompts/data/instructions 等 Input，不用 Input 训练或微调模型；可交服务提供商处理，服务托管于美国。留存原则是为提供服务及业务用途合理需要的期限，**没有在所读政策中找到适用于所有账户的固定删除天数**。[Privacy policy](https://typesafe.ai/legal/privacy-policy)
- 官方 Legal 页称企业客户可联系获取零数据留存 ZDR；所以“不训练”和“默认零留存”不能等同。[Legal](https://docs.typesafe.ai/legal)
- DPA 涉及按约定指令处理、分包处理商及国际传输，并非 API 天然不出站的证明。[Data processing addendum](https://typesafe.ai/legal/data-processing)

（推断）若接入本机控制面板，发送的日志/对话片段/项目状态会出本机。即便 key 保留服务端，state 出站事实仍存在；默认不应把密钥、整个 Codex 历史或终端原始输出当成演示素材。具体可发送字段须根据用户项目内容与账户约定确定，不能在调研阶段替用户认定已许可所有数据。

## F. 相邻开源实现对照：不等同于 Jev

| 项目 | 公开可核实的能力 | 与本任务有关的边界 |
|---|---|---|
| [jaredpalmer/kev](https://github.com/jaredpalmer/kev) | 作者发布基于 Qwen 的 Jev-like 决策模型，提供权重/adapter、训练代码、本地 serving；代码 Apache-2.0。README 描述 TypeSafe 兼容接口和选择分布 | 是独立模型，不能把它的本地运行结果标为 Jev；硬件/上下文/精度与官方 Jev 分别测量，Windows 本机部署尚未验证 |
| [nokia-applied-research/AnyJev](https://github.com/nokia-applied-research/AnyJev) | 作者团队提供现有开放 LLM 的决策 readout；Apache-2.0。L0 平均选项位置偏差，L1 加标签拟合温度，L2 为每问题/模型拟合 closed-form head | README 明说不隶属 TypeSafe/JeV；raw/L0 不等于已校准，L2 需本任务标签；字母 readout 最多 26 选项；研究准确率有 teacher agreement 限制 |

实际打开 [Kev serve.py](https://github.com/jaredpalmer/kev/blob/main/kev/serve.py)，观察到 `/v1/systemone`、`/permute`、`/separate` 接口：可分别返回分布、测选项重排一致性、比打包与逐题延迟。默认 host 为 127.0.0.1，`KEV_API_KEY` 未设置时无鉴权。这些可作为能力演示的已有参考，不能未经部署验证直接接到公网，也不能照搬其时间数字。本次没有下载或运行 Kev/AnyJev。

## 可供后续讨论的应用假设：把展示关联到项目收益

以下均为**（假设）**，只是供需求对齐的候选实验，不构成正式架构、优先级或自动执行授权：

| 候选场景 | 可展示的模型判断 | 应展示的实际证据与收益衡量 |
|---|---|---|
| 项目告警分诊 | Choice：构建/依赖/资源/业务失败/信息不足；Noul：是否需要人工 | 人工分类标签、错分率、发现到定位耗时、漏告警与无效打扰；CPU/GPU 阈值本身由精确规则计算 |
| 对话关联脑图 | Choice：对话属于哪个现有任务/目标/决策；Score：关联程度 | 用户确认或纠正的关联、误连比例、找到相关上下文的耗时；新增节点文字由真实来源或生成模型提供，Jev 负责已有候选判断 |
| 渲染任务分诊 | Choice：继续/降预览质量/排队/检查失败原因/人工；Score：日志中的阻塞严重度 | 实际排队/完成时间、退出码、渲染输出路径、GPU占用、无效重试次数；不能由 Jev 的 text-only 输入声称它评价了渲染画面 |
| 能力选择提示 | 从既有工具/技能候选里推荐下一入口，同时允许“无匹配” | 推荐被采纳比例、人工改选比例、是否缩短完成任务耗时；技能执行权限仍遵循原有规则 |

官方已有 [intent routing](https://docs.typesafe.ai/patterns/intent-routing)、[Function Calling](https://docs.typesafe.ai/cookbooks/function_calling) 与 [skill suggestion](https://docs.typesafe.ai/cookbooks/skill_suggestion) 示例支持这类有限候选判断，不需另造自由文本规划模型。但这些示例的结果不能作为本项目收益证明。

**动态页面可展示的最小证据链（假设）：**输入 state 快照与时间 → 候选动作/标准 → 各候选概率柱 → 被选项与 confidence → 程序规则/人工最后决定 → 是否实际调用工具 → 退出码/输出文件/测量结果 → 用户纠正。动画沿真实事件推进；模拟、历史重放、实时调用应显式标识。这样可以观察“模型建议了什么”和“事情最后是否办成”，不会让光效替代结果。

**能力实验与指标（假设）：**用同一批有人工标签的历史案例比较现有规则、Jev、必要时已有 LLM，保留失败样本；统计错分率、人工处理比例、固定错误预算下覆盖率、每成功任务成本、p50/p95 延迟与完整任务完成时间。概率校准必须用事后标签验证；并列展示模型概率与实测命中率，不能把一个案例的 `p=0.9` 标注为“90% 执行成功率”。可单独重排 Choice 候选以测答案稳定性。未调用 API，所以本轮没有本项目准确率、延迟或效率增益数据。

## G. 不确定点清单

- U1：用户指的确切仓库是否为 TypeSafe Jev、Kev 或 AnyJev？向用户展示官方候选链接后确认；目前 TypeSafe Jev 仅是最匹配解释。
- U2：是否具备 TypeSafe 账户/权限、实时 API 可用性及当前账户限流？后续经用户授权核验账户；不通过试填 key 或第三方站点确认。
- U3：有哪些日志/对话/项目字段可以出站，是否需要零留存或本地模型？需依据具体项目数据与账户约定确认。
- U4：中文内容、现有失败案例、真实候选动作上的准确率/校准/延迟？需要标注样本及基线实验，不能从官网数字推导。
- U5：用户机器是否能独立运行 Kev/AnyJev、运行成本与 Windows 兼容性？依赖 GPU/VRAM/部署栈，当前未安装验证。
- U6：哪些任务真需要模糊语义判断？必须结合实际工作频率与痛点；若精确规则或搜索已足够，模型未必产生价值。

## H. 给 readiness reviewer 的最小可核查证据

| 结论 | 最小可核查位置 | 证据等级 |
|---|---|---|
| 官方身份 | docs Introduction 页尾 GitHub → typesafe-ai → typesafe.ai | 已观察事实 |
| jev-ai/jev-api 非官方 | 该仓库 README `independent app` / `not the official product site` | 已观察事实 |
| 字段与网络/鉴权 | SDK v0.6.0 client.ts `systemOne` / `fetchWithRetries`；types.ts responses | 已观察公开代码，未验证服务内部 |
| confidence 非正确率 | Confidence 公式；Score reading 对 confidence=1 的限制 | 已观察官方解释 |
| 不直接操作 Codex/C4D/3D | coding-agents 页；State text-only 边界 | 已观察官方解释 |
| 隐私与零留存 | Privacy Input/Retention/International Visitors；Legal ZDR | 已观察政策，非项目合同确认 |
| 本项目开发收益 | 上述候选实验 | 假设；U4/U6 未关闭 |

本调研足以纠正身份和能力误解，但 U1–U6 仍未关闭，不应视作正式集成 readiness PASS。需用户拍板的 U1/U3 应由 coordinator 汇入统一 clarifications 文档。

## 资料访问失败与核验边界

本轮 web 打开官方文档的 `.md` 版本失败，随后读取了相应无 `.md` 的官方页面；Redoc 页面需 JavaScript，改用官方 API reference。部分 GitHub tree 页面及尝试的 AnyJev `types.py` 路径无法访问；对 AnyJev 仅依据作者 README，不声称读过其不存在/未打开的类型代码。已成功读取 TypeSafe SDK client/types/license、Kev serve.py 与所列官方文档；无 API 实测、无账户或模型权重核验。

## 跨功能事实（待确认）

- [2026-10-03] 开源客户端/技能、开源相似模型、托管底层模型须分别核查；名称相似或仓库自己的官方标签不足以认定提供方身份。
- [2026-10-03] 类型符合与高置信分布不构成任务执行成功证据；控制面板须依托外部工具结果和实际测量确认收益。
