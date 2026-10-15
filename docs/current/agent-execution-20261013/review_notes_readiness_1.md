# Readiness 检查记录（第 1 轮）

**评审对象**：M3 `research.md` + `clarifications.md`，结合既有高层方案第 8/9 节。  
**评审时间**：2026-10-13（Asia/Shanghai）  
**受众**：共享  
**review_target**：`readiness`  
**评审结论**：**PASS**

仅判断输入是否足以进入唯一 LW Plan；不评价 M3 已实现或真实执行已验收。M0–M2 的通过结论没有被扩展到派发、审批、取消或后续多 Provider 能力。

## 输入文件

- 本 feature：`README.md`、完整 `clarifications.md`、完整 `research.md`。
- 既有 `docs/current/agent-workbench-20261013/hlplan.md` 第 8/9 节：一个 Provider 最小闭环、运行与人工任务状态分离，以及后续里程碑边界。
- 实际源码：`session_panel/workspace.py`、`workspace_store.py`、`workspace_sources.py` 的任务、存储、可执行文件定位及额度子进程相关实现。
- 实际 schema：`work/agent-execution-20261013/research-schema/`；只读补证 `probe-models.py`、`native-model-probe.log`、`model-probe.json`。
- 快照与差异：同一 work 目录的 `before-manifest.json`、`changes.json`、`final.diff`。
- 评审规范：完整读取 `plan-review/SKILL.md`、`coordinator/references/clear-expression.md`，下结论前读取 `verification-before-completion/SKILL.md`。

## 澄清与基线核验

### A. 澄清问题完整性

- ① 未回答 Q&A 是否为空：**是**。DSH 被明确排除本轮执行；U1–U6 是技术补证或实现设计事项，不是悬置的用户选择。
- ② coordinator 是否漏记澄清问题：**未发现**。评审中要求明确 U4 的既有授权解释；最终基线已记录固定 smoke、隔离目录、禁止意外工具网络/全局权限/用户项目操作，以及需新登录、购买、安装或提权时保留缺口。该段明确不是新增用户原话。
- ③ 头脑风暴决策是否完整落盘：**PASS**。六项决策覆盖一个 Provider、复用现有架构、owned run、具体单次审批、最小持久状态、运行用量覆盖范围。

### B. 基线内部质量

- ④ 必填章节 1–10：**PASS**。独立命令核验编号完整；逐节内容非空且可供下游消费。
- ⑤ 目标锁是否具体可验证：**PASS**。G1 要求实际 thread/turn 与事件结果；G2 要求运行和原生请求绑定、重复/过期/重启语义及所属进程树回收；G3 要求桌面及 360/390px 实际操作和原有功能兼容。
- ⑥ 反目标是否具体：**PASS**。以下是输入契约审查，不是对尚未实现的产品作行为保证。

| 禁止内容 | 可核查证据 | 结论（确认不存在） |
|---|---|---|
| 模拟回执、进程存活或 turn 结束冒充项目完成 | 基线第 1/2 节及决策 3；research F/H 分别区分人工状态、事件、真实 smoke | 输入中不存在这种验收捷径 |
| 任意 RPC/命令/程序路径、绕过沙箱、批量自动审批 | 决策 4；基线第 2/3 节规定登记目录、约束模式与具体请求 | 不存在授权这些能力的相反条款 |
| 外部会话接管、用户真实项目验收、公网监听 | 决策 3；基线第 2/3 节及 U4 限制 | 本轮授权只覆盖 owned run 和隔离验收 |
| 读凭证、改全局配置、迁移旧 JSON、重启旧 8766、初始化 Git | README 当前边界；基线第 2/7 节；56 文件快照一致且实现 diff 为空 | 未发现允许或已经实施上述动作的证据 |
| 通用 Provider 框架、全栈重写、冒称完整账号账单及全部后续交付 | 决策 2/6；基线第 2/6/9 节 | 单 Provider 增量范围一致，无未来能力完成声明 |

- ⑦ 风险边界与责任归属：**PASS**。可信项目根、受约束运行失败关闭、同根并发写、跨实例归属、重启未知均已进入基线；具体机制交 LW 决定。
- ⑧ 验证责任、产物和顺序：**PASS**。impl 先做静态、隔离 SQLite、mock 与纯本地验证；coordinator 承接真实假服务器子进程、Windows 子孙进程、浏览器及受控真实集成；reviewer 独立读 diff/完整证据。research H 明确先证明无模型进程行为，再执行固定真实 smoke；日志、退出码、失败、事件标识和实际产物存入本轮 work 目录。未发生的步骤不能以 fixture 替代。

### C. 基线与澄清一致性

- ⑨ 基线与已回答 Q&A/决策无矛盾：**PASS**。

| Q&A / 决策条目 | 对应基线字段及实际内容 | 一致性 |
|---|---|---|
| 用户“负责架构的选定和开发”“自动化做即可” | 第 3/4/10 节：普通技术推进与隔离验收由 coordinator 承接，新增账号/全局权限/业务副作用另处理 | 一致；U4 是 coordinator 对原授权的明确解释 |
| “就是 stablyai/orca，按它推进” | 决策 2 与第 6 节：采用专用适配器/能力区分，当前先打通 Codex | 一致；未推导整套框架迁移 |
| “已看到，独立窗口正常显示” | README 只关闭 M0–M2 目检；第 6/9 节保持 M3 独立增量 | 一致；未冒称 M3 原生执行通过 |
| 决策 3/4/5：owned run、单次审批、重启不重发 | G1/G2 与第 3/7 节：真实标识、原生请求绑定、归属及人工状态分离 | 一致 |
| 决策 6：本次运行 token 不等于账号费用 | 第 6/8 节及 research F：保留范围标注并按实际字段设计 | 一致 |

- ⑩ README → 决策 → 基线溯源：**PASS**。
  - “统一管理我现在的开发进度” → 决策 1/3 区分负责人记录与真实运行 → G1 展示真实运行，人工任务状态独立。
  - “接入现在多种的 coding agent”及既有高层 M3 的最小闭环路线 → 决策 2 先采用 Codex 官方 app-server → 第 6/9 节只交付一个 Provider 的独立增量。
  - “负责架构的选定和开发……自动化做即可” → 决策 4/5 和 coordinator 的 U4 解释 → 第 3/4/10 节给出具体风险、验证责任及例外边界。
  - README 保留既有服务、不改全局配置 → 决策 3/4 的 owned 范围 → 第 2/7 节禁止接管旧会话、保留旧入口与同源校验。

### D. 基线内部一致性

- ⑪ 目标锁与反目标不互斥：**PASS**。显式新建运行及具体审批可以在 owned 边界内完成；禁止全局权限或外部会话操作不妨碍本轮目标。
- ⑫ 风险边界与验证责任不矛盾：**PASS**。impl 不启动真实 Agent；coordinator 的固定隔离集成测试是被明确区分的承接步骤，正常模型服务连接与意外工具网络也已分清。

### E. 与 research 对齐

- ⑬ 关键约束进入基线：**PASS**。实际原生 0.162 schema、有效权限核对、Windows owned 树、运行与任务分离、重启不重发、目录真实归属及 token 覆盖都已由第 3/4/7/8 节承接。基线无需在 readiness 阶段提前给出实现代码。
- U1 的只读握手/模型列表部分已补证：实际 resolver 对应 exe 返回 7 个模型，自有 process 与 reader 退出；未创建 thread/turn，不能据此断言账号可推理或沙箱可用。
- U2/U3 的真实 Windows 回收和审批出现、U5 的持久状态设计必须写入 LW；U6 的未知去重语义已有“不依赖它作自动重试保证”的保守范围。U4 已由明确的 coordinator 判定关闭。

### 澄清与基线核验结论

**PASS**。没有需要新增用户决策或恢复上游基线的阻断项。

## 缺失证据

无阻断进入 LW 的证据缺口。尚未执行真实 turn、实际审批及 Windows owned 树集成；这些是后续实施验收证据，不能预先判绿。LW 必须写清运行配置/继承副作用的控制、真实目录边界、进程树所有权、状态和审批竞争、幂等/重启以及失败关闭行为，并给相应证据入口。

本轮独立静态核验命令 `python -X utf8 -c $reviewScript` 最终退出 **0**，完整输出见 `work/agent-execution-20261013/review-readiness-check-final.log`：317 个 schema JSON、4 个研究 SHA-256 匹配、56 个快照文件未变、空实现 diff、基线 1–10 完整、只读握手 exe 与当前 resolver 相同。独立读取了 probe 源码和完整日志，未重复启动 app-server。

保留失败：reviewer 首次把审批 response/params 误定位于 `research-schema/v2/`；前者 `Get-Content` 报路径不存在，后者独立核验退出 **1**（`FileNotFoundError`，初次输出留在 `review-readiness-check.log`）。经 `rg --files` 确认两者实际位于 schema 根目录后重跑为 0。一次大 schema 输出被截断，已改为定向解析 required/properties 补读。这些是评审工具使用失败，不是产品执行失败；research 与基线记录的其他调研失败仍保留。

## contract drift / stale / mirror mismatch

未发现阻断性漂移。research U1/U4 保留调研发生时的“未执行/待 root 判断”，最终基线的 U4 判定和“当轮补证”提供有来源的后续状态；这不是以旧研究抹去新证据。README 的 Research 阶段及未勾选进度是当前阶段记录，不代表未来验收已通过。

## 建议恢复动作

- A. 证据补强：无需 readiness 恢复；把上列尚未执行的验证及责任写入唯一 LW Plan。
- B. 契约纠偏：无。不得通过修改已接受的 M0–M2 结论来代替本轮后续验收。

## 放行判断

- `allow_enter_lwplan: yes`
- 无新增跨功能事实候选；本轮核验没有超出 research 已列事实。
