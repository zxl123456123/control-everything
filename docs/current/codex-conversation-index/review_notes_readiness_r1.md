# Readiness 检查记录（第 1 轮）

评审对象：本 feature 的 README、research、clarifications，以及本机来源调研与只读证据。  
评审时间：2026-10-04。reviewer：codex_index_readiness_review。  
评审结论／协议结论：PASS。  
业务结论：PASS，仅指只读身份索引的规划准备；不代表实现已通过，也不代表 Codex 实时活动或旧 WezTerm 实机验收。

## 输入与独立实证

已读实际 `session_panel/gateway.py` 全文、`web/app.js` 的来源／选择／消息／focus 主链、`tests/test_gateway.py` 对应权限与隔离测试。产品仍只有固定远端会话服务；新增本机索引有独立 GET 插入位置，不需要改变原 SOURCE、MCP、消息或动作合同。

| 权威输入 | 本轮核验 SHA-256 |
| --- | --- |
| README.md | 0994F3231B19E6FBBC995EB7CE9C788EA559B63A10C429C236FF709767CAC026 |
| clarifications.md（含补齐后的 6–10 项） | EB967E4E8CC8374452501C9B5648634DA7D5DDB02D262E697C637206335276BF |
| research.md | FA68B3910C3C7F525288F481178A06330DB9BE63E9F6540827B1F02162222A82 |
| ../codex-conversation-source-research.md | 53E5960F106D758C0AF92708DC10126E73FB764B106F2C26AA869DE895188230 |

本 reviewer 在本轮运行 `.venv/Scripts/python.exe -B work/codex-index-readiness-review-r1.py`，exit 0，完整输出已读，4 项检查／0 失败。证据为 `work/codex-index-readiness-review-r1.json`；读取 URI `mode=ro` 并验证 `query_only=1`，仅查询六个允许列。14:47:46 UTC 实测总数 372；cli 19、exec 3、vscode 94、subagent 256；未归档交互来源为 112。当前根线程 `01a10013-6a9b-71f0-9878-89ce70e5a495` 确在筛选集合中。计数会随新会话变化，不把前一采样 369 当常量。

metadata、projection、control-probe 三份原证据完整读过并核验哈希。控制探测 exit 1／os error 10050，以及当前根线程的旧 interrupted 投影与最新 state 更新时间不一致，均保留。它们是本轮明确不承诺实时状态的依据，不是只读身份索引的阻断项。未启动 app-server、SSH、GUI、消息读取或任何终端动作。

## 澄清与基线核验

### A. 澄清问题完整性

- ① 未回答 Q&A：在本 feature 指定权威输入中为空。旧工作台退出后恢复权限不属于本 scope，未被推定同意。
- ② 未发现本 scope 漏记必须由用户决定的事项：原始要求、持续自动实施授权、只读范围、3D／回退选择均已记录。SQLite reader 的分页与字段选择属于实现决策。
- ③ 头脑风暴决策完整落盘：固定数据库、独立来源、交互／归档筛选、12 条页界、命名空间与未知活动均有条目。

### B. 基线内部质量

- ④ PASS：1–5 的目标锁、反目标、风险、验证责任、文档职责非空；6–10 已补齐生成、内容边界、下游消费、状态兼容和补充需求规则。首次阅读发现 6–10 缺失，已向 root 报告；补齐后全文重读，旧缺口未被掩盖。
- ⑤ PASS：G1 只读允许列／失败 unavailable，G2 真实身份与来源隔离，G3 未归档交互集合完整分页且最多 12 个 Codex 角色，均可通过数据库与路由／浏览器行为核对。
- ⑥ PASS：禁止项具体，当前基线未把禁止功能列为工作包。此处仅检查规划输入，不对未来实现提前宣称不存在。

| 禁止内容 | 可核查基线依据 | 结论 |
| --- | --- | --- |
| 更新时间／归档／历史状态／动画冒充正在工作或完成 | N1，决策 1、4，风险边界第一条 | 规划目标没有实时推断 |
| 写 DB、正文／标题／preview／auth 扫描、第二 server、resume／发送、新 SSH、退出工作台恢复 | N2，G1 六列清单，风险边界固定版本 | 没有这些授权或工作包 |
| 改原 SOURCE／MCP／消息／focus 权限，假生产记录，隐瞒筛选 | N3，决策 2、3，G2、G3，第 7／9 项 | 分派与覆盖范围明示 |

- ⑦ PASS：内部格式失效需失败；真实活动通道不能由另起服务器替代；旧 WezTerm BLOCKED 独立；客户端不提供数据库路径／SQL／来源参数。
- ⑧ PASS：impl 的 before／patch／hash／完整命令与报告 → root 的全 Python、Edge fixture、实际 GET 与元数据 ID 对照、IAB 采样 → fresh Review(Impl)，责任和顺序明示；缺证保持未验证。

### C. 基线与澄清一致性

⑨ PASS，显式映射如下。

| 已记录决策／授权 | 基线字段 | 一致性 |
| --- | --- | --- |
| 日常开发效率与真实会话角色 | G1、G2 | 以真实 UUID／项目身份定位，未造当前活动 |
| 自动实施代码即可现在 | README 授权范围、状态兼容规则 | 在已要求的只读身份范围内推进；保留正式 Gates |
| 3D 主视图＋像素／文字回退 | 文档职责与范围、G2 | 本来源 feature 为现有展示供身份；游戏 renderer 由独立有界任务负责 |
| 无既有实时 RPC，先只读 metadata | G1、N1、风险边界 | 失败明示、activity unknown，不承诺实时状态 |
| cli／exec／vscode、排除 subagent／归档、页界 12 | G3、第 7 项 | “全部索引”已限定为筛选集合，与排除规则一致 |
| 独立来源与 codex:<真实 UUID> | G2、N3 | Codex 选择不调用 Claude 消息／focus |

⑩ PASS，需求溯源链：

- README“Codex 对话、WezTerm 对话对应真实小机器人” → 决策 1 采用本机可证实的索引身份，决策 2 独立分派 → G1 真实允许元数据、G2 来源隔离；实时活动与远端实机缺口继续明示。
- README“活动空间、工位和动态关系” → 决策 4 装饰移动不冒充活动，决策 3 有界显示 → G3 页界 12、N1 不从动画推断工作；renderer 与来源实施明确分工。
- README“自动实施代码即可现在” → 已记录只读展示授权，排除复活／发送／DB 修改 → N2 与风险／验证责任，不扩展动作范围。

### D. 基线内部一致性

- ⑪ PASS：G1–G3 的身份索引与 N1 的活动未知相容；“对话正文”和“运行监控”没有被偷换为已实现的验收。
- ⑫ PASS：真实环境核对由 root 承接，impl 只自证允许文件；旧 WezTerm 正例缺口不会被新 fixture 抵消。

### E. 与 research 对齐

⑬ PASS：固定内部 schema、只读 URI、隐私字段禁读、source 分类、历史投影不可靠、控制 socket 失败、来源分派、保留旧验证缺口均进入基线。

## 缺失证据与 LW 必须细化的落点

readiness 无剩余阻断证据缺口；实现尚未发生，不给代码／浏览器通过结论。LW 需明确只读连接的短超时与单次一致采样、UUID／允许值校验、固定来源白名单、顺序稳定的有界分页及失败清空当前证据。不得用标题或 cwd 模糊合并身份。

新 GET 应位于现有 `allowed(api=True)` 之后；维持固定 loopback、精确 Host、已有 Origin／client 检查、no-store 和无 CORS。原合同允许没有 Origin 的本机客户端，GET 没有 POST 的 CSRF 要求；不得宣称这些头是账户鉴权。客户端只有分页参数，不能驱动路径、SQL 或来源。

前端须将 Codex 选中元数据与远端选中 UUID 分开；明确取消／忽略远端旧异步读取，不能把 `codex:` key 拼入原 `/api/sessions/{UUID}/messages` 或 focus 路由。分页须说明全部筛选计数和排除数量；schema／缺库／锁超时等失败须可验证。

## contract drift / stale / mirror mismatch

未发现阻断性漂移。曾发现的基线 6–10 缺项与“全索引”含义歧义均由 root 在本轮修订，已新读并核验哈希；不改变 shared skills。旧 WezTerm `review_notes_impl_r4_1.md` 为 BLOCKED／业务空白，仍有效于旧批次且没有被本结论覆盖。

读取方法的失败也保留：首个聚合 skill／文件输出截断，随后分别补读；探查两个不存在的研究 `.py` 文件得到系统找不到文件，之后不依赖它们，使用本 reviewer 独立脚本取证。上述不是产品测试结果。

## 易维护判断与放行

只需一个固定 metadata reader、一个只读 GET 和独立来源展示分派；沿用现有安全与渲染接口，无需 adapter 框架、新依赖、后台 agent 或第二 app-server。内部 SQLite 版本失效时明示 unavailable，比扫正文／推断状态更容易维护。

allow_enter_lwplan: yes。可进入限定只读身份索引的 LW；实时活动与旧 WezTerm 实机验证独立保留。无跨功能事实。
