# 决策与完整实现基线

2026-10-04。原始授权：“自动实施代码即可现在”；本轮：“codex的对话，wezterm里面的对话，都能监测到小机器人，给他们一个空间让他们自由活动，安排位置”。用户选择日常开发效率优先、3D 主视图及像素/文字回退。

## 头脑风暴决策

1. 官方 app-server 实时连接当前不可用，先实现本机固定数据库只读身份索引；明确局限，不能声称已监测对话正文或实时运行。
2. Codex 与原远端 Claude 独立分派，保留原消息分页、UUID、focus 和资格逻辑。
3. 数据库未归档的交互来源 cli/exec/vscode 分页展示；排除 subagent 避免把内部代理当用户当前项目，说明排除数量。每页最多 12，完整索引可翻页。归档记录不在本轮默认视图。
4. 角色 key 为 codex:<真实 UUID>，点选展示允许元数据，不向 Claude messages/focus 路由请求。未知 activity 只显示未知；行走/粒子只是装饰。

用户确认：持续自动实施授权覆盖本次明确要求的只读身份展示；未授权退出工作台复活、消息发送、DB 修改或新 app-server。

## 完整实现基线

### 目标锁

- G1：使用 URI mode=ro 和 query_only，只取固定本机数据库的 id/cwd/created_at/updated_at/archived/source，真实 UUID 与可核对的采样时间；数据库失败明确 unavailable，不保留为当前证据。
- G2：在列表和机器人空间分页展示真实交互 Codex ID，选中显示来源/项目/时间/活动未知；命名空间与原 Claude 严格隔离，无隐式正文读取或终端动作。
- G3：未归档交互来源的全部索引可分页查看，明确筛选/数量/版本相关局限；本轮当前页最多 12 个 Codex 角色，保证不会一次绘制数百历史模型。

### 反目标

- N1：禁止从更新时间、未归档、历史 inProgress 或装饰动画推断实时任务状态、项目完成。
- N2：禁止修改 DB、扫描 rollout 正文/标题/preview/auth、启动第二 app-server、resume/发送消息、恢复退出 WezTerm 或新增 SSH 命令。
- N3：禁止重写既有 SOURCE/MCP/Claude 消息/focus 权限合同，禁止假记录填充生产房间或静默隐藏覆盖范围。

### 风险边界

- SQLite 是内部实现且版本相关：固定当前 state_5.sqlite，schema 不满足则失败；不遍历探测/迁移/补建数据库。未来实时监控需连接桌面同一官方 app-server，当前不声称支持。
- 项目路径是私有元数据，仅原有 loopback/Host/Origin/client 检查合格的只读 GET 返回；不输出标题或正文。不接受客户端提供数据库路径、SQL 或来源字符串。
- 旧 WezTerm 实机 Review(Impl) BLOCKED 保持，当前角色动画与 Codex 元数据不能补足那个缺口。

### 验证责任

- planner 读取实际 gateway/app/tests 与研究，产出 Required Set 与可执行锚点；fresh reviewer 执行 readiness 和 Review(LW)。root 独立复核 Gate-2。
- 实施 agent 按允许文件改代码，提供 before/patch/hash、真实验证命令完整输出与 impl_report_r1.md。
- root 本轮独立跑全 Python 与真实 Edge fixture，实际 loopback GET 对照数据库允许计数和当前线程 ID；点 Codex 卡片不能有 Claude 消息/POST。当前 IAB 画面与帧率另测，不用 screenshot 证明 FPS。
- fresh Review(Impl) 审最终差异和失败记录；只读索引验收与实时状态/真实远端验证分开，缺证只写未验证。

### 文档职责与范围

README 为需求入口状态；本文件为唯一基线；research.md 链接已落盘事实；lwplan.md 为唯一实施计划。新增 session_panel/codex_index.py、必要 gateway GET 集成、web/app.js/index.html/style.css 元数据入口及测试；renderer/cockpit 的游戏展示由独立有界任务负责，双方不得重叠写入。

### 6. 基线生成规则

由 README 原始请求结合本轮已确认的自动实施与只读范围生成；不得以技术决策替换用户目标。

### 7. 基线内容边界

本轮权威内容为 G1–G3、N1–N3、风险与验证责任；“全索引”仅指未归档交互来源，subagent/归档数量需说明，不冒充所有活动会话。

### 8. 下游消费规则

LW、Review、Impl 必须完整读取本基线；每个工作包映射目标/反目标，不自行改写风险或验证责任。

### 9. 状态与兼容性规则

这是新 feature，基线和正式 Gates 齐备后才实施；旧 WezTerm BLOCKED 独立保留，不迁移或覆盖旧冻结材料。

### 10. 补充需求处理

补充需求先记录本文件并重算基线；超出只读元数据/展示的范围回退规划评审，不由实施 agent 擅自扩大。
